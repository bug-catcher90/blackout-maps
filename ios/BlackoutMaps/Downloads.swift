import Foundation

enum Store {
    static func directory(_ package: String) -> URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("blackout-maps", isDirectory: true)
            .appendingPathComponent(package, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func file(_ package: String, _ name: String) -> URL { directory(package).appendingPathComponent(name) }
}

struct RemotePack: Codable, Hashable {
    var key: String
    var url: URL
    var file: String
    var gzip: Bool
    var bytes: Int?
    var label: String
}

struct MapPackage: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var autoload: Bool?
    var files: [RemotePack]
}

enum BaseFiles {
    static func prepare() throws -> (map: URL, roads: URL, buildings: URL) {
        guard let map = Bundle.main.url(forResource: "portugal", withExtension: "pmtiles"),
              let roadsGz = Bundle.main.url(forResource: "roads.bin", withExtension: "gz"),
              let buildingsGz = Bundle.main.url(forResource: "buildings.bin", withExtension: "gz") else {
            throw EngineError("base")
        }
        let roads = Store.file("base", "roads.bin")
        let buildings = Store.file("base", "buildings.bin")
        try inflate(roadsGz, to: roads, bytes: 170_238_576)
        try inflate(buildingsGz, to: buildings, bytes: 79_915_812)
        return (map, roads, buildings)
    }

    private static func inflate(_ source: URL, to dest: URL, bytes: Int) throws {
        let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.intValue ?? 0
        if size == bytes { return }
        try? FileManager.default.removeItem(at: dest)
        if PTGunzip(source, dest) != 0 { throw EngineError("gzip") }
        let finalSize = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.intValue ?? 0
        if finalSize != bytes { throw EngineError("short") }
    }
}

enum Catalog {
    static func load() -> [MapPackage] {
        guard let root = Bundle.main.resourceURL,
              let found = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        let decoder = JSONDecoder()
        var packages: [MapPackage] = []
        for case let url as URL in found where url.pathExtension == "json" {
            guard let data = try? Data(contentsOf: url), let package = try? decoder.decode(MapPackage.self, from: data) else { continue }
            packages.append(package)
        }
        return packages.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }
}

final class Downloader: NSObject, URLSessionDownloadDelegate {
    private let lock = NSLock()
    private var onStatus: (String, String, String?) -> Void = { _, _, _ in }
    private var session: URLSession!
    private var waits: [Int: CheckedContinuation<URL, Error>] = [:]
    private var destinations: [Int: URL] = [:]

    func start(onStatus: @escaping (String, String, String?) -> Void) {
        self.onStatus = onStatus
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    func prepare(_ pack: RemotePack, package: String) async throws -> URL {
        let dest = Store.file(package, pack.file)
        let mark = UserDefaults.standard.dictionary(forKey: "blackout-\(package)-\(pack.key)")
        let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.intValue ?? 0
        let marked = mark?["size"] as? Int
        let complete = (mark?["complete"] as? Bool) == true && size > 0 && marked == size && (pack.bytes == nil || size == pack.bytes)
        if complete {
            let remote = (try? await head(pack.url)) ?? 0
            if remote == 0 || remote == mark?["gzipSize"] as? Int { return dest }
        }
        onStatus(pack.key, pack.label, nil)
        let partial = Store.file(package, pack.file + ".part")
        let downloaded = try await download(pack.url, to: partial) { [weak self] written, expected in
            let amount: String
            if pack.key == "map", expected > 0 {
                amount = "\(min(100, Int((Double(written) / Double(expected) * 100).rounded())))%"
            } else {
                amount = "\(written / 1_000_000) MB"
            }
            self?.onStatus(pack.key, pack.label, amount)
        }
        let gzipSize = (try? FileManager.default.attributesOfItem(atPath: downloaded.path)[.size] as? NSNumber)?.intValue ?? 0
        if pack.gzip {
            let code = PTGunzip(downloaded, dest)
            try? FileManager.default.removeItem(at: downloaded)
            if code != 0 { throw EngineError("gzip") }
        } else if downloaded != dest {
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: downloaded, to: dest)
        }
        let finalSize = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.intValue ?? 0
        if let bytes = pack.bytes, finalSize != bytes { throw EngineError("short") }
        if finalSize == 0 { throw EngineError("short") }
        UserDefaults.standard.set(["size": finalSize, "gzipSize": gzipSize, "complete": true], forKey: "blackout-\(package)-\(pack.key)")
        return dest
    }

    private func head(_ url: URL) async throws -> Int {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (_, response) = try await URLSession.shared.data(for: request)
        return Int((response as? HTTPURLResponse)?.expectedContentLength ?? 0)
    }

    private func download(_ url: URL, to dest: URL, progress: @escaping (Int64, Int64) -> Void) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let task = session.downloadTask(with: url)
            lock.lock()
            waits[task.taskIdentifier] = continuation
            destinations[task.taskIdentifier] = dest
            lock.unlock()
            objc_setAssociatedObject(task, &ProgressKey.token, ProgressBox(progress), .OBJC_ASSOCIATION_RETAIN)
            task.resume()
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        (objc_getAssociatedObject(downloadTask, &ProgressKey.token) as? ProgressBox)?.progress(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        lock.lock()
        let dest = destinations[downloadTask.taskIdentifier]
        lock.unlock()
        guard let dest else { return }
        try? FileManager.default.removeItem(at: dest)
        do {
            try FileManager.default.moveItem(at: location, to: dest)
            finish(downloadTask.taskIdentifier, result: .success(dest))
        } catch {
            finish(downloadTask.taskIdentifier, result: .failure(error))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        finish(task.taskIdentifier, result: .failure(error))
    }

    private func finish(_ id: Int, result: Result<URL, Error>) {
        lock.lock()
        destinations[id] = nil
        let continuation = waits.removeValue(forKey: id)
        lock.unlock()
        continuation?.resume(with: result)
    }
}

private func PTGunzip(_ source: URL, _ dest: URL) -> Int32 {
    source.withUnsafeFileSystemRepresentation { src in
        dest.withUnsafeFileSystemRepresentation { dst in
            guard let src, let dst else { return 1 }
            return PTGunzipFile(src, dst)
        }
    }
}

private enum ProgressKey { static var token = 0 }
private final class ProgressBox: NSObject {
    let progress: (Int64, Int64) -> Void
    init(_ progress: @escaping (Int64, Int64) -> Void) { self.progress = progress }
}
