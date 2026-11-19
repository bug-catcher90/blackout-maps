import CoreMotion
import Foundation
import UIKit

@MainActor
@Observable
final class AppModel {
    var tab = "explorar"
    var query = ""
    var status = ""
    var showStatus = false
    var results: [Place] = []
    var showResults = false

    var counts = Array(repeating: 0, count: 7)
    var categoryId: String?
    var categoryTitle = ""
    var categoryPlaces: [Place] = []

    var mode = "walk"
    var modeTimes: [String: String] = [:]
    var destination: Place?
    var showTrip = false
    var tripDuration = ""
    var tripMeta = ""
    var cards: [RouteChoice] = []
    var showCards = false
    var startEnabled = false

    var navigating = false
    var navDistance = ""
    var navSentence = "Siga em frente"
    var navTurn = "straight"
    var navTime = ""
    var navMeta = ""
    var showRecenter = false
    var correcting = false

    var fixing = false
    var fixName = ""
    var fixAddress = ""
    var fixCoords = ""

    var adding = false
    var saveName = ""
    var saveAddress = ""
    var saveCoords = ""
    var saveService = false
    var pinName = ""
    var saveEnabled = false

    var pins: [Place] = []
    var packages: [MapPackage] = []
    var activePackageId: String?
    var packageNote = ""
    var downloading = false
    var sensorsOn = true
    var step = 0.7

    let map = MapController()
    private let engine = Engine()
    private let estimator = PedestrianEstimator()
    private let downloads = Downloader()
    private let glyphs = GlyphServer()
    private var pose: Pose?
    private var current: RouteChoice?
    private var follow = false
    private var heldTrip = false
    private var roadsReady = false
    private var lines: [String: String] = [:]
    private var searchTask: Task<Void, Never>?
    private var applyingChoice = false
    private var looking = false
    private var lookQueued = false
    private var labeledAt: Coord?
    private var routeTask: Task<Void, Never>?
    private var lastCamera = 0.0
    private var lastNav = 0.0
    private var attached = false
    private let order = ["map", "roads", "addresses", "places", "water", "buildings"]
    let categories: [(id: String, label: String)] = [
        ("0", "Saúde"),
        ("1", "Polícia"),
        ("2", "Bombeiros"),
        ("3", "Gasolina"),
        ("4", "Supermercados"),
        ("5", "Restaurantes"),
        ("water", "Água"),
    ]

    func launch() {
        guard !attached else { return }
        attached = true
        loadSaved()
        packages = Catalog.load()
        activePackageId = UserDefaults.standard.string(forKey: "blackout-package")
        wireMap()
        let engine = engine
        estimator.constraint = { lat, lon, distance, heading, mode in
            engine.constrain(lat: lat, lon: lon, distance: distance, heading: heading, mode: mode)
        }
        estimator.onPose = { [weak self] pose in self?.poseMoved(pose) }
        estimator.setStep(step)
        if sensorsOn { estimator.start() }
        glyphs.start()
        downloads.start { [weak self] key, text in
            Task { @MainActor in
                self?.note(key, text)
                if self?.downloading == true, !text.isEmpty { self?.packageNote = text }
            }
        }
        Task { await boot() }
    }

    var searchOrigin: Coord? {
        guard let pose else { return nil }
        return Coord(lat: pose.lat, lon: pose.lon)
    }

    func queryChanged() {
        if applyingChoice {
            applyingChoice = false
            return
        }
        searchTask?.cancel()
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        showResults = !text.isEmpty
        if text.isEmpty {
            results = []
            return
        }
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 180_000_000)
            if Task.isCancelled { return }
            await self?.runSearch(text)
        }
    }

    func choose(_ place: Place) {
        searchTask?.cancel()
        showResults = false
        if query != place.name {
            applyingChoice = true
            query = place.name
        }
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        if fixing {
            map.jump(to: place.coord, zoom: max(map.zoom, 17), bearing: 0)
            refreshLook()
            return
        }
        if adding {
            map.jump(to: place.coord, zoom: max(map.zoom, 16), bearing: 0)
            applyDrop(place.coord, named: place.service ? place : nil)
            return
        }
        chooseDestination(place)
    }

    func setMode(_ next: String) {
        guard next != mode else { return }
        mode = next
        estimator.setMode(next)
        showCards = false
        cards = []
        if navigating {
            refreshNav()
        } else if destination != nil {
            recompute(fit: showCards)
        }
    }

    func directions() {
        guard let from = originCoord(), let to = destination?.coord else { return }
        showCards = true
        routeTask?.cancel()
        routeTask = Task { [weak self] in
            guard let self else { return }
            let routes = await engine.choices(from: from, to: to, mode: mode)
            if Task.isCancelled { return }
            cards = routes
            showCards = !routes.isEmpty
            map.show(routes: routes)
            let line = routes.flatMap(\.coordinates)
            map.fit(line, insets: UIEdgeInsets(top: 120, left: 32, bottom: 280, right: 32))
        }
    }

    func startNav(_ route: RouteChoice? = nil) {
        guard let route = route ?? current, originCoord() != nil, destination != nil else { return }
        let styleMode = ["walk": "walk", "walk-alt": "walk", "bicycle": "bicycle", "bicycle-alt": "bicycle", "car": "car", "toll": "car", "local": "car"]
        if let mapped = styleMode[route.style] {
            mode = mapped
            estimator.setMode(mapped)
        }
        current = route
        estimator.snap()
        showCards = false
        cards = []
        showTrip = false
        showResults = false
        categoryId = nil
        if fixing { cancelFix() }
        navigating = true
        correcting = false
        follow = true
        showRecenter = false
        map.setDrag(true)
        map.show(routes: [route])
        map.showDestination(destination?.coord)
        engine.setNavigation(active: true, route: route)
        map.setInset(UIEdgeInsets(top: 120, left: 0, bottom: 150, right: 0))
        refreshNav()
        lockNav()
    }

    func leaveNav() {
        if correcting { finishCorrect(save: false) }
        navigating = false
        follow = false
        showRecenter = false
        engine.setNavigation(active: false, route: nil)
        map.setBearing(0)
        map.setInset(.zero)
        if let destination, tab == "explorar" {
            showTrip = true
            map.jump(to: destination.coord, zoom: max(map.zoom, 16), bearing: 0)
            paintCurrent()
        }
    }

    func recenter() {
        follow = true
        showRecenter = false
        lockNav()
    }

    func overview() {
        guard let current else { return }
        follow = false
        showRecenter = true
        map.fit(current.coordinates, insets: UIEdgeInsets(top: 140, left: 28, bottom: 180, right: 28))
    }

    func startCorrect() {
        guard navigating, pose != nil else { return }
        correcting = true
        follow = false
        showRecenter = false
        estimator.setPaused(true)
        map.setDrag(false)
        map.showPose(nil)
        map.setInset(.zero)
        if let pose {
            map.jump(to: Coord(lat: pose.lat, lon: pose.lon), zoom: max(map.zoom, 16), bearing: 0)
        }
    }

    func finishCorrect(save: Bool) {
        guard correcting else { return }
        let here = map.centerCoordinate()
        correcting = false
        estimator.setPaused(false)
        map.setDrag(!adding && !fixing)
        if save {
            estimator.reset(lat: here.lat, lon: here.lon, snap: false)
        } else if let pose {
            map.showPose(pose)
        }
        if navigating {
            map.setInset(UIEdgeInsets(top: 120, left: 0, bottom: 150, right: 0))
            refreshNav()
            lockNav()
        }
    }

    func startFix() {
        guard !navigating, !correcting, !adding, !fixing else { return }
        heldTrip = showTrip
        fixing = true
        showTrip = false
        showResults = false
        showCards = false
        categoryId = nil
        map.setDrag(false)
        map.setInset(.zero)
        let here = pose.map { Coord(lat: $0.lat, lon: $0.lon) } ?? map.centerCoordinate()
        map.jump(to: here, zoom: max(map.zoom, 16), bearing: 0)
        refreshLook()
    }

    func cancelFix() {
        guard fixing else { return }
        fixing = false
        fixName = ""
        fixAddress = ""
        fixCoords = ""
        map.setDrag(true)
        if heldTrip, let destination, tab == "explorar", !navigating {
            showTrip = true
            map.showDestination(destination.coord)
        }
        heldTrip = false
    }

    func confirmFix() {
        guard fixing else { return }
        let here = map.centerCoordinate()
        cancelFix()
        estimator.reset(lat: here.lat, lon: here.lon, snap: true)
        map.jump(to: here, zoom: max(map.zoom, 16), bearing: 0)
        persistPose(Pose(lat: here.lat, lon: here.lon, heading: pose?.heading, uncertainty: 8, steps: 0, distance: 0, reason: "reset"))
    }

    func closeTrip() {
        destination = nil
        showTrip = false
        showCards = false
        cards = []
        current = nil
        startEnabled = false
        tripDuration = ""
        tripMeta = ""
        map.showDestination(nil)
        map.show(routes: [])
    }

    func showTab(_ name: String) {
        if adding { stopAdd() }
        if fixing { cancelFix() }
        tab = name
        if name != "explorar" {
            showTrip = false
            showResults = false
            categoryId = nil
        } else if destination != nil, !navigating {
            showTrip = true
        }
    }

    func startAdd() {
        adding = true
        tab = "explorar"
        showTrip = false
        categoryId = nil
        showResults = false
        saveService = false
        pinName = ""
        saveEnabled = false
        saveName = ""
        saveAddress = ""
        saveCoords = ""
        map.setDrag(false)
        map.setInset(.zero)
        let here = pose.map { Coord(lat: $0.lat, lon: $0.lon) } ?? map.centerCoordinate()
        map.jump(to: here, zoom: max(map.zoom, 16), bearing: 0)
        applyDrop(here, named: nil)
    }

    func stopAdd() {
        adding = false
        pinName = ""
        saveEnabled = false
        map.setDrag(!fixing && !correcting)
    }

    func pinNameChanged() {
        saveEnabled = !saveService && !pinName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func savePin() {
        let name = saveService ? saveName : pinName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let here = map.centerCoordinate()
        let entry = Place(id: "\(name)|\(here.lat)|\(here.lon)", name: name, lat: here.lat, lon: here.lon, address: saveAddress, detail: saveAddress, service: saveService)
        if !pins.contains(where: { $0.name == entry.name && abs($0.lat - entry.lat) < 1e-4 && abs($0.lon - entry.lon) < 1e-4 }) {
            pins.insert(entry, at: 0)
            writePins()
        }
        stopAdd()
        tab = "pins"
    }

    func removePin(_ place: Place) {
        pins.removeAll { $0.id == place.id }
        writePins()
    }

    func openPin(_ place: Place) {
        tab = "explorar"
        chooseDestination(place)
    }

    func openCategory(_ id: String) {
        categoryId = id
        categoryTitle = categories.first { $0.id == id }?.label ?? ""
        categoryPlaces = []
        let box = map.bounds()
        Task { [weak self] in
            guard let self else { return }
            let rows = await engine.category(west: box.west, south: box.south, east: box.east, north: box.north, zoom: map.zoom, id: id)
            if categoryId == id { categoryPlaces = rows }
        }
    }

    func setSensors(_ on: Bool) {
        sensorsOn = on
        UserDefaults.standard.set(on, forKey: "mapa-sensors")
        if on {
            if !CMMotionManager().isDeviceMotionAvailable {
                note("sensors", "Sensores indisponíveis")
                return
            }
            estimator.start()
            lines["sensors"] = nil
            publishStatus()
        } else {
            estimator.stop()
        }
    }

    func setStep(_ value: Double) {
        step = value
        estimator.setStep(value)
        UserDefaults.standard.set(value, forKey: "mapa-step")
    }

    func usePackage(_ package: MapPackage) {
        guard !downloading else { return }
        downloading = true
        packageNote = ""
        Task {
            await activate(package, download: true)
            downloading = false
        }
    }

    private func boot() async {
        do { try engine.start() } catch {
            note("map", "Não foi possível guardar o mapa")
            return
        }
        do {
            let base = try BaseFiles.prepare()
            await waitGlyphs()
            map.load(archive: base.map, glyphs: glyphs.base)
            try await openPack(RemotePack(key: "roads", url: base.roads, file: "roads.bin", gzip: false, bytes: nil, label: "estradas"), base.roads)
            try await openPack(RemotePack(key: "buildings", url: base.buildings, file: "buildings.bin", gzip: false, bytes: nil, label: "edifícios"), base.buildings)
        } catch {
            note("map", "Não foi possível guardar o mapa")
            return
        }
        let saved = activePackageId.flatMap { id in packages.first { $0.id == id } }
        let package = saved ?? packages.first { $0.autoload == true }
        guard let package else { return }
        let ready = package.files.allSatisfy { FileManager.default.fileExists(atPath: Store.file(package.id, $0.file).path) }
        downloading = !ready
        await activate(package, download: !ready)
        downloading = false
    }

    private func activate(_ package: MapPackage, download: Bool) async {
        var failed = false
        for file in package.files {
            let local = Store.file(package.id, file.file)
            if !download {
                guard FileManager.default.fileExists(atPath: local.path) else { failed = true; continue }
                do { try await openPack(file, local) } catch { failed = true }
                continue
            }
            await fetch(file, package: package.id, then: nil)
            if !FileManager.default.fileExists(atPath: local.path) { failed = true }
        }
        if !failed {
            activePackageId = package.id
            UserDefaults.standard.set(package.id, forKey: "blackout-package")
            packageNote = ""
        }
    }

    private func waitGlyphs() async {
        for _ in 0..<50 {
            if glyphs.port != 0 { return }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func fetch(_ pack: RemotePack, package: String, then open: ((URL) async -> Void)?) async {
        do {
            let url = try await downloads.prepare(pack, package: package)
            note(pack.key, "")
            if let open { await open(url) }
            try await openPack(pack, url)
        } catch {
            let text = "Não foi possível guardar \(pack.label)"
            note(pack.key, text)
            packageNote = text
        }
    }

    private func openPack(_ pack: RemotePack, _ url: URL) async throws {
        let engine = engine
        switch pack.key {
        case "roads":
            try await Task.detached { try engine.openBuffer(name: "roads", url: url, call: "openRoads") }.value
            roadsReady = true
            if showTrip || navigating { recompute(fit: showCards) }
        case "addresses":
            try await Task.detached { try engine.openBuffer(name: "addresses", url: url, call: "openAddresses") }.value
            if !query.isEmpty { queryChanged() }
        case "places":
            try await Task.detached { try engine.openBuffer(name: "places", url: url, call: "openPlaces") }.value
            refreshViewport()
        case "water":
            try await Task.detached { try engine.openBuffer(name: "water", url: url, call: "openWater") }.value
            refreshViewport()
        case "buildings":
            try await Task.detached { try engine.openBuffer(name: "buildings", url: url, call: "openBuildings") }.value
            refreshViewport()
        case "geo":
            try await Task.detached { try engine.openText(name: "geo", url: url, call: "openGeo") }.value
            if !query.isEmpty { queryChanged() }
        default:
            break
        }
    }

    private func runSearch(_ text: String) async {
        let anchor = pose
        let found = await engine.search(query: text, lat: anchor?.lat, lon: anchor?.lon)
        if query.trimmingCharacters(in: .whitespacesAndNewlines) == text {
            results = found.items
            showResults = !text.isEmpty
            if found.waiting, found.items.isEmpty { note("addresses", "A guardar moradas") }
        }
    }

    private func chooseDestination(_ place: Place) {
        guard !navigating, !correcting else { return }
        destination = place
        showResults = false
        categoryId = nil
        showTrip = tab == "explorar"
        showCards = false
        cards = []
        map.showDestination(place.coord)
        map.jump(to: place.coord, zoom: max(map.zoom, 16), bearing: 0)
        recompute(fit: false)
    }

    private func recompute(fit: Bool) {
        guard let from = originCoord(), let to = destination?.coord else {
            current = nil
            startEnabled = false
            tripDuration = ""
            tripMeta = ""
            map.show(routes: [])
            return
        }
        routeTask?.cancel()
        let mode = mode
        routeTask = Task { [weak self] in
            guard let self else { return }
            async let walk = engine.primary(from: from, to: to, mode: "walk")
            async let car = engine.primary(from: from, to: to, mode: "car")
            async let bicycle = engine.primary(from: from, to: to, mode: "bicycle")
            let primaries = await [walk, car, bicycle]
            if Task.isCancelled { return }
            var times: [String: String] = [:]
            for (index, key) in ["walk", "car", "bicycle"].enumerated() {
                if let route = primaries[index] {
                    times[key] = Format.duration(meters: route.meters, mode: key, seconds: route.seconds)
                }
            }
            modeTimes = times
            let picked = primaries[["walk", "car", "bicycle"].firstIndex(of: mode) ?? 0]
            current = picked
            fillTrip(picked)
            if navigating {
                if let picked { engine.setNavigation(active: true, route: picked) }
                refreshNav()
            } else if showCards {
                let routes = await engine.choices(from: from, to: to, mode: mode)
                if Task.isCancelled { return }
                cards = routes
                map.show(routes: routes)
                map.fit(routes.flatMap(\.coordinates), insets: UIEdgeInsets(top: 120, left: 32, bottom: 280, right: 32))
            } else if let picked {
                map.show(routes: [RouteChoice(style: mode == "walk" ? "walk" : mode == "bicycle" ? "bicycle" : "car", label: picked.label, meters: picked.meters, seconds: picked.seconds, coordinates: picked.coordinates)])
            } else {
                map.show(routes: [])
            }
            if fit, let picked { map.fit(picked.coordinates, insets: UIEdgeInsets(top: 120, left: 32, bottom: 280, right: 32)) }
            _ = roadsReady
        }
    }

    private func fillTrip(_ route: RouteChoice?) {
        startEnabled = originCoord() != nil && destination != nil && route != nil
        guard let route else {
            tripDuration = ""
            tripMeta = ""
            return
        }
        tripDuration = Format.duration(meters: route.meters, mode: mode, seconds: route.seconds)
        tripMeta = "\(Format.arrival(meters: route.meters, mode: mode, seconds: route.seconds)) · \(Format.kmOrM(route.meters))"
    }

    private func paintCurrent() {
        guard let current else {
            map.show(routes: [])
            return
        }
        let style = mode == "walk" ? "walk" : mode == "bicycle" ? "bicycle" : "car"
        map.show(routes: [RouteChoice(style: style, label: current.label, meters: current.meters, seconds: current.seconds, coordinates: current.coordinates)])
    }

    private func originCoord() -> Coord? {
        guard let pose else { return nil }
        return Coord(lat: pose.lat, lon: pose.lon)
    }

    private func poseMoved(_ next: Pose) {
        pose = next
        if !correcting { map.showPose(next) }
        let now = CACurrentMediaTime()
        if navigating, follow, !correcting, now - lastCamera > 0.1 {
            lastCamera = now
            map.jump(to: Coord(lat: next.lat, lon: next.lon), zoom: 17, bearing: next.heading ?? 0)
        }
        if navigating, !correcting, now - lastNav > 0.2 {
            lastNav = now
            refreshNav()
        }
        if now - lastCamera > 2 { persistPose(next) }
        startEnabled = originCoord() != nil && destination != nil && current != nil
    }

    private func refreshNav() {
        guard navigating, let pose else { return }
        guard let info = engine.navigation(lat: pose.lat, lon: pose.lon) else { return }
        let meters = (info["meters"] as? NSNumber)?.doubleValue ?? 0
        let remaining = (info["remaining"] as? NSNumber)?.doubleValue ?? 0
        let seconds = (info["seconds"] as? NSNumber)?.doubleValue
        let turn = info["turn"] as? String ?? "straight"
        let text = info["text"] as? String ?? "Siga em frente"
        let street = info["street"] as? String ?? ""
        navTurn = turn
        navDistance = Format.maneuverDistance(meters)
        navSentence = Format.sentence(turn: turn, text: text, meters: meters, street: street)
        navTime = Format.duration(meters: remaining, mode: mode, seconds: seconds)
        navMeta = "\(Format.distanceKm(remaining)) · \(Format.arrival(meters: remaining, mode: mode, seconds: seconds))"
    }

    private func lockNav() {
        guard let pose else { return }
        follow = true
        showRecenter = false
        map.jump(to: Coord(lat: pose.lat, lon: pose.lon), zoom: 17, bearing: pose.heading ?? 0)
    }

    private func wireMap() {
        map.onGesture = { [weak self] in
            guard let self, self.navigating, !self.correcting else { return }
            self.follow = false
            self.showRecenter = true
        }
        map.onMove = { [weak self] in
            guard let self else { return }
            if self.fixing || self.adding { self.refreshLook() }
            if !self.navigating { self.refreshViewport() }
        }
        map.onTapPlace = { [weak self] name, lat, lon in
            guard let self, !self.navigating else { return }
            let place = Place(id: "\(name)|\(lat)|\(lon)", name: name, lat: lat, lon: lon, address: "", detail: "", service: true)
            self.chooseDestination(place)
        }
        map.onTapRoute = { [weak self] style in
            guard let self else { return }
            if let route = self.cards.first(where: { $0.style == style }) ?? self.current {
                self.startNav(route)
            }
        }
        map.onDrop = { [weak self] lat, lon in self?.dropped(lat, lon) }
    }

    private func dropped(_ lat: Double, _ lon: Double) {
        Task { [weak self] in
            guard let self else { return }
            let door = await engine.inspect(lat: lat, lon: lon, zoom: map.zoom).door
            let at = door.map { Coord(lat: $0.lat, lon: $0.lon) } ?? Coord(lat: lat, lon: lon)
            estimator.reset(lat: at.lat, lon: at.lon, snap: true)
            if let door { query = door.name }
            if destination != nil, !navigating { recompute(fit: false) }
        }
    }

    private func refreshLook() {
        let here = map.centerCoordinate()
        let text = Format.coord(here.lat, here.lon)
        if fixing { fixCoords = text }
        if adding { saveCoords = text }
        if let labeledAt, Geo.meters(labeledAt.lat, labeledAt.lon, here.lat, here.lon) > 8 {
            if fixing { fixAddress = "" }
            if adding, !saveService {
                saveAddress = ""
                saveCoords = text
            }
            self.labeledAt = nil
        }
        guard fixing || adding else { return }
        if looking {
            lookQueued = true
            return
        }
        looking = true
        Task { await drainLook() }
    }

    private func drainLook() async {
        repeat {
            lookQueued = false
            await applyLook(map.centerCoordinate())
        } while lookQueued && (fixing || adding)
        looking = false
    }

    private func applyLook(_ here: Coord) async {
        let found = await engine.inspect(lat: here.lat, lon: here.lon, zoom: map.zoom)
        let still = map.centerCoordinate()
        guard Geo.meters(still.lat, still.lon, here.lat, here.lon) < 8 else { return }
        if fixing {
            fixName = found.named?.name ?? ""
            if let door = found.door, Geo.meters(here.lat, here.lon, door.lat, door.lon) <= 40 {
                fixAddress = door.name
                labeledAt = here
            } else {
                fixAddress = ""
                labeledAt = here
            }
            fixCoords = Format.coord(still.lat, still.lon)
        }
        if adding {
            applyDrop(still, named: found.named)
            if !saveService, let door = found.door, Geo.meters(still.lat, still.lon, door.lat, door.lon) <= 40 {
                saveAddress = door.name
                labeledAt = here
            } else if !saveService {
                saveAddress = ""
                labeledAt = here
            }
            saveCoords = Format.coord(still.lat, still.lon)
        }
    }

    private func applyDrop(_ here: Coord, named: Place?) {
        saveCoords = Format.coord(here.lat, here.lon)
        if let named, !named.name.isEmpty {
            saveService = true
            saveName = named.name
            saveAddress = named.address
            saveEnabled = true
        } else if saveService || saveName.isEmpty {
            saveService = false
            saveName = ""
            saveAddress = ""
            saveEnabled = !pinName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private var viewTask: Task<Void, Never>?
    private func refreshViewport() {
        viewTask?.cancel()
        viewTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 220_000_000)
            guard let self, !Task.isCancelled else { return }
            let box = map.bounds()
            let data = await engine.viewport(west: box.west, south: box.south, east: box.east, north: box.north, zoom: map.zoom)
            var next = Array(repeating: 0, count: 7)
            let raw = data["counts"] as? [Any] ?? []
            for (index, value) in raw.enumerated() where index < 6 {
                next[index] = (value as? NSNumber)?.intValue ?? 0
            }
            next[6] = (data["waterTotal"] as? NSNumber)?.intValue ?? 0
            counts = next
            map.showPois(data["pois"] as? [[String: Any]] ?? [])
            map.showWater(data["water"] as? [[String: Any]] ?? [])
            map.showBuildings(data["buildings"] as? [Any] ?? [])
        }
    }

    private func note(_ key: String, _ text: String) {
        if text.isEmpty { lines[key] = nil } else { lines[key] = text }
        publishStatus()
    }

    private func publishStatus() {
        if let key = order.first(where: { lines[$0] != nil }), let text = lines[key], !text.isEmpty {
            status = text
            showStatus = true
        } else if let sensors = lines["sensors"] {
            status = sensors
            showStatus = true
        } else {
            showStatus = false
        }
    }

    private func loadSaved() {
        if let value = UserDefaults.standard.object(forKey: "mapa-step") as? Double { step = value }
        if UserDefaults.standard.object(forKey: "mapa-sensors") != nil {
            sensorsOn = UserDefaults.standard.bool(forKey: "mapa-sensors")
        }
        if let data = UserDefaults.standard.data(forKey: "mapa-pins"),
           let saved = try? JSONDecoder().decode([Place].self, from: data) {
            pins = saved
        }
        if let saved = UserDefaults.standard.dictionary(forKey: "mapa-pose"),
           let lat = saved["lat"] as? Double, let lon = saved["lon"] as? Double {
            estimator.hydrate(
                lat: lat,
                lon: lon,
                uncertainty: saved["uncertainty"] as? Double ?? 12,
                steps: saved["steps"] as? Int ?? 0,
                distance: saved["distance"] as? Double ?? 0
            )
        }
    }

    private func persistPose(_ pose: Pose) {
        UserDefaults.standard.set(
            ["lat": pose.lat, "lon": pose.lon, "uncertainty": pose.uncertainty, "steps": pose.steps, "distance": pose.distance],
            forKey: "mapa-pose"
        )
    }

    private func writePins() {
        if let data = try? JSONEncoder().encode(pins) {
            UserDefaults.standard.set(data, forKey: "mapa-pins")
        }
    }
}
