import Foundation
import JavaScriptCore

final class MappedBytes {
    let pointer: UnsafeMutableRawPointer
    let count: Int

    init(url: URL) throws {
        let fd = open(url.path, O_RDONLY)
        if fd < 0 { throw CocoaError(.fileReadNoPermission) }
        defer { close(fd) }
        let length = lseek(fd, 0, SEEK_END)
        if length <= 0 { throw CocoaError(.fileReadCorruptFile) }
        let raw = mmap(nil, Int(length), PROT_READ, MAP_PRIVATE, fd, 0)
        if raw == nil || raw == MAP_FAILED { throw CocoaError(.fileReadUnknown) }
        pointer = raw!
        count = Int(length)
    }
}

struct EngineError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

final class Engine: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.blackoutmaps.engine")
    private let flag = NSLock()
    private var jobs = 0
    private var context: JSContext?
    private var maps: [String: MappedBytes] = [:]
    private var started = false

    var isRouting: Bool {
        flag.lock()
        defer { flag.unlock() }
        return jobs > 0
    }

    func start() throws {
        try queue.sync {
            if started { return }
            guard let context = JSContext() else { throw EngineError("js") }
            context.exceptionHandler = { _, value in
                NSLog("Blackout Maps JS %@", value?.toString() ?? "")
            }
            guard let poly = source("polyfill"), let engine = source("engine") else { throw EngineError("motor") }
            context.evaluateScript(poly)
            context.evaluateScript(engine)
            if context.objectForKeyedSubscript("Posicao").isUndefined {
                throw EngineError("motor")
            }
            self.context = context
            started = true
        }
    }

    func openBuffer(name: String, url: URL, call: String) throws {
        try queue.sync {
            let mapped = try MappedBytes(url: url)
            maps[name] = mapped
            guard let context else { throw EngineError("motor") }
            guard let buffer = PTArrayBufferNoCopy(context, mapped.pointer, mapped.count) else { throw EngineError(name) }
            context.setObject(buffer, forKeyedSubscript: "__buf" as NSString)
            _ = try eval(context, "Posicao.\(call)(__buf)")
        }
    }

    func openText(name: String, url: URL, call: String) throws {
        let text = try String(contentsOf: url, encoding: .utf8)
        try queue.sync {
            guard let context else { throw EngineError("motor") }
            context.setObject(text, forKeyedSubscript: "__text" as NSString)
            _ = try eval(context, "Posicao.\(call)(__text)")
            _ = name
        }
    }

    func search(query: String, lat: Double?, lon: Double?) async -> (waiting: Bool, items: [Place]) {
        await asyncString { context in
            context.setObject(query, forKeyedSubscript: "__q" as NSString)
            let latText = lat.map { Self.num($0) } ?? "null"
            let lonText = lon.map { Self.num($0) } ?? "null"
            return try self.eval(context, "Posicao.search(__q, \(latText), \(lonText))").toString()
        }.map { text in
            let object = Self.object(text) ?? [:]
            let waiting = object["waiting"] as? Bool ?? false
            let rows = object["items"] as? [[String: Any]] ?? []
            return (waiting, rows.compactMap(Self.place))
        } ?? (false, [])
    }

    func inspect(lat: Double, lon: Double, zoom: Double) async -> (door: Place?, named: Place?) {
        let text = await asyncString { context in
            try self.eval(context, "Posicao.inspect(\(Self.num(lat)), \(Self.num(lon)), \(Self.num(zoom)))").toString()
        }
        let object = Self.object(text ?? "") ?? [:]
        return (Self.place(object["door"] as? [String: Any]), Self.place(object["named"] as? [String: Any]))
    }

    func primary(from: Coord, to: Coord, mode: String) async -> RouteChoice? {
        await routeJob { context in
            try self.eval(context, "Posicao.route(\(Self.num(from.lat)), \(Self.num(from.lon)), \(Self.num(to.lat)), \(Self.num(to.lon)), '\(mode)')").toString()
        }.flatMap { Self.route($0, fallbackStyle: mode) }
    }

    func choices(from: Coord, to: Coord, mode: String) async -> [RouteChoice] {
        let text = await routeJob { context in
            try self.eval(context, "Posicao.choices(\(Self.num(from.lat)), \(Self.num(from.lon)), \(Self.num(to.lat)), \(Self.num(to.lon)), '\(mode)')").toString()
        }
        let rows = (try? JSONSerialization.jsonObject(with: Data((text ?? "[]").utf8))) as? [[String: Any]] ?? []
        return rows.compactMap { Self.routeObject($0) }
    }

    func setNavigation(active: Bool, route: RouteChoice?) {
        queue.sync {
            guard let context else { return }
            if let route, let data = try? JSONSerialization.data(withJSONObject: [
                "meters": route.meters,
                "seconds": route.seconds as Any,
                "coordinates": route.coordinates,
            ]), let json = String(data: data, encoding: .utf8) {
                context.setObject(json, forKeyedSubscript: "__route" as NSString)
                _ = try? eval(context, "Posicao.setNavigation(\(active ? "true" : "false"), __route)")
            } else {
                _ = try? eval(context, "Posicao.setNavigation(false, null)")
            }
        }
    }

    func constrain(lat: Double, lon: Double, distance: Double, heading: Double?, mode: String) -> Coord? {
        if isRouting { return nil }
        return queue.sync {
            guard let context else { return nil }
            let head = heading.map { Self.num($0) } ?? "null"
            let text = (try? eval(context, "Posicao.constrain(\(Self.num(lat)), \(Self.num(lon)), \(Self.num(distance)), \(head), '\(mode)')"))?.toString() ?? "null"
            guard text != "null", let object = Self.object(text), let lat = Self.double(object["lat"]), let lon = Self.double(object["lon"]) else {
                return nil
            }
            return Coord(lat: lat, lon: lon)
        }
    }

    func itinerary() -> [[String: Any]] {
        queue.sync {
            guard let context else { return [] }
            let text = (try? eval(context, "Posicao.itinerary()"))?.toString() ?? "[]"
            return (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [[String: Any]] ?? []
        }
    }

    func navigation(lat: Double, lon: Double) -> [String: Any]? {
        queue.sync {
            guard let context else { return nil }
            let text = (try? eval(context, "Posicao.navigation(\(Self.num(lat)), \(Self.num(lon)))"))?.toString() ?? "null"
            return Self.object(text)
        }
    }

    func viewport(west: Double, south: Double, east: Double, north: Double, zoom: Double) async -> [String: Any] {
        let text = await asyncString { context in
            try self.eval(context, "Posicao.viewport(\(Self.num(west)), \(Self.num(south)), \(Self.num(east)), \(Self.num(north)), \(Self.num(zoom)))").toString()
        }
        return Self.object(text ?? "") ?? [:]
    }

    func category(west: Double, south: Double, east: Double, north: Double, zoom: Double, id: String) async -> [Place] {
        let text = await asyncString { context in
            context.setObject(id, forKeyedSubscript: "__cat" as NSString)
            return try self.eval(context, "Posicao.category(\(Self.num(west)), \(Self.num(south)), \(Self.num(east)), \(Self.num(north)), \(Self.num(zoom)), __cat)").toString()
        }
        let rows = (try? JSONSerialization.jsonObject(with: Data((text ?? "[]").utf8))) as? [[String: Any]] ?? []
        return rows.compactMap(Self.place)
    }

    private func routeJob(_ body: @escaping (JSContext) throws -> String?) async -> String? {
        changeJobs(1)
        let text = await asyncString(body)
        changeJobs(-1)
        return text
    }

    private func changeJobs(_ delta: Int) {
        flag.lock()
        jobs += delta
        flag.unlock()
    }

    private func asyncString(_ body: @escaping (JSContext) throws -> String?) async -> String? {
        await withCheckedContinuation { continuation in
            queue.async {
                guard let context = self.context else {
                    continuation.resume(returning: nil)
                    return
                }
                let text = try? body(context)
                continuation.resume(returning: text ?? nil)
            }
        }
    }

    private func eval(_ context: JSContext, _ script: String) throws -> JSValue {
        context.evaluateScript("""
        var __out = null;
        var __err = null;
        try {
          var __value = \(script);
          if (__value && typeof __value.then === "function") {
            __value.then(function(v){ __out = v === undefined ? null : v; }).catch(function(e){ __err = String(e && e.message || e); });
          } else {
            __out = __value === undefined ? null : __value;
          }
        } catch (e) {
          __err = String(e && e.message || e);
        }
        """)
        let err = context.objectForKeyedSubscript("__err")
        if let err, !err.isNull, !err.isUndefined {
            let text = err.toString() ?? "erro"
            if !text.isEmpty && text != "null" && text != "undefined" { throw EngineError(text) }
        }
        return context.objectForKeyedSubscript("__out")
    }

    private func source(_ name: String) -> String? {
        let candidates = [
            Bundle.main.url(forResource: name, withExtension: "js"),
            Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "Resources"),
        ]
        for url in candidates.compactMap({ $0 }) {
            if let text = try? String(contentsOf: url, encoding: .utf8) { return text }
        }
        if let root = Bundle.main.resourceURL {
            let found = Self.find(name + ".js", under: root)
            if let found, let text = try? String(contentsOf: found, encoding: .utf8) { return text }
        }
        return nil
    }

    static func find(_ name: String, under root: URL) -> URL? {
        let files = (try? FileManager.default.subpathsOfDirectory(atPath: root.path)) ?? []
        if let match = files.first(where: { ($0 as NSString).lastPathComponent == name }) {
            return root.appendingPathComponent(match)
        }
        return nil
    }

    private static func num(_ value: Double) -> String {
        if !value.isFinite { return "null" }
        return String(format: "%.8f", value)
    }

    private static func object(_ text: String) -> [String: Any]? {
        guard text != "null", let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return object
    }

    private static func double(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        return nil
    }

    private static func place(_ row: [String: Any]?) -> Place? {
        guard let row, let lat = double(row["lat"]), let lon = double(row["lon"]) else { return nil }
        let name = L10n.placeName(row, L10n.code())
        guard !name.isEmpty else { return nil }
        let address = (row["address"] as? String) ?? (row["typeLabel"] as? String) ?? ""
        let city = row["city"] as? String ?? ""
        let detail = !address.isEmpty ? address : city
        return Place(
            id: "\(name)|\(lat)|\(lon)",
            name: name,
            lat: lat,
            lon: lon,
            address: address,
            detail: detail,
            service: (row["service"] as? Bool) ?? (row["service"] as? NSNumber)?.boolValue ?? false
        )
    }

    private static func route(_ text: String?, fallbackStyle: String) -> RouteChoice? {
        guard let text, let object = object(text) else { return nil }
        return routeObject(object, fallbackStyle: fallbackStyle)
    }

    private static func coordinates(_ value: Any?) -> [[Double]] {
        guard let rows = value as? [Any] else { return [] }
        return rows.compactMap { row in
            guard let pair = row as? [Any], pair.count >= 2, let lon = double(pair[0]), let lat = double(pair[1]) else { return nil }
            return [lon, lat]
        }
    }

    private static func routeObject(_ object: [String: Any], fallbackStyle: String = "car") -> RouteChoice? {
        guard let meters = double(object["meters"]) else { return nil }
        let coordinates = coordinates(object["coordinates"])
        guard coordinates.count > 1 else { return nil }
        let style = object["style"] as? String ?? fallbackStyle
        return RouteChoice(
            style: style,
            label: object["label"] as? String ?? "",
            meters: meters,
            seconds: double(object["seconds"]),
            coordinates: coordinates
        )
    }
}
