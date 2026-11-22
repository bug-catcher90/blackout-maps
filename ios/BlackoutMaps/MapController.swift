import MapLibre
import Network
import UIKit

final class GlyphServer {
    private var listener: NWListener?
    private(set) var port: UInt16 = 0

    func start() {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            listener.newConnectionHandler = { connection in self.serve(connection) }
            listener.stateUpdateHandler = { [weak self] state in
                if case let .ready = state, let port = listener.port?.rawValue { self?.port = port }
            }
            listener.start(queue: .global(qos: .userInitiated))
            self.listener = listener
        } catch {
            NSLog("glyphs %@", error.localizedDescription)
        }
    }

    var base: String { "http://127.0.0.1:\(port)/glyphs/{fontstack}/{range}.pbf" }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .userInitiated))
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, _ in
            guard let data, let text = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            let line = text.split(separator: "\r\n", maxSplits: 1).first ?? ""
            let parts = line.split(separator: " ")
            let path = parts.count > 1 ? String(parts[1]) : "/"
            let decoded = path.removingPercentEncoding ?? path
            let name = (decoded as NSString).lastPathComponent
            let file = Bundle.main.resourceURL.flatMap { Engine.find(name, under: $0) }
            let body = file.flatMap { try? Data(contentsOf: $0) } ?? Data()
            let status = body.isEmpty ? "404 Not Found" : "200 OK"
            let header = "HTTP/1.1 \(status)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
            var payload = Data(header.utf8)
            payload.append(body)
            connection.send(content: payload, completion: .contentProcessed { _ in connection.cancel() })
        }
    }
}

final class OpeningMapView: MLNMapView {
    var onLayout: (() -> Void)?
    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

final class MapController: NSObject, MLNMapViewDelegate {
    var onGesture: (() -> Void)?
    var onMove: (() -> Void)?
    var onTapPlace: ((String, Double, Double) -> Void)?
    var onTapRoute: ((String) -> Void)?
    var onDrop: ((Double, Double) -> Void)?

    private var mapView: MLNMapView?
    private var routeSource: MLNShapeSource?
    private var areaSource: MLNShapeSource?
    private var buildingSource: MLNShapeSource?
    private var poiSource: MLNShapeSource?
    private var waterSource: MLNShapeSource?
    private let userPin = KindPin()
    private let destPin = KindPin()
    private var userOn = false
    private var destOn = false
    private var styleReady = false
    private var pendingStyle: URL?
    private(set) var zoom: Double = 6.2
    private var framed = false
    private var userMoved = false
    var dragEnabled = true
    private let portugal = CLLocationCoordinate2D(latitude: 39.6, longitude: -8)

    func makeView(opening _: Coord?) -> MLNMapView {
        if let mapView { return mapView }
        let blank = FileManager.default.temporaryDirectory.appendingPathComponent("mapa-blank.json")
        try? MapStyle.blank.write(to: blank, atomically: true, encoding: .utf8)
        let map = OpeningMapView(frame: .zero, styleURL: blank)
        map.onLayout = { [weak self] in self?.applyOpening() }
        map.delegate = self
        map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        map.compassView.isHidden = true
        map.allowsTilting = false
        map.allowsRotating = false
        map.minimumZoomLevel = -2
        map.maximumZoomLevel = 18
        map.setCenter(portugal, zoomLevel: 6.2, animated: false)
        zoom = 6.2
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.cancelsTouchesInView = false
        map.addGestureRecognizer(tap)
        mapView = map
        userPin.kind = "user"
        destPin.kind = "dest"
        return map
    }

    func load(archive: URL, glyphs: String) {
        let world = Bundle.main.url(forResource: "world", withExtension: "geojson")?.absoluteString ?? ""
        let json = MapStyle.json(archive: "pmtiles://\(archive.absoluteString)", glyphs: glyphs, world: world)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("mapa-style.json")
        try? json.write(to: url, atomically: true, encoding: .utf8)
        pendingStyle = url
        mapView?.styleURL = url
    }

    func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
        install(style)
        styleReady = true
        if !userMoved { framed = false }
        applyOpening()
    }

    func applyOpening() {
        guard !userMoved, !framed, let mapView else { return }
        framed = true
        mapView.setCenter(portugal, zoomLevel: 6.2, direction: 0, animated: false, completionHandler: nil)
        zoom = 6.2
    }

    func mapView(_ mapView: MLNMapView, regionWillChangeWith reason: MLNCameraChangeReason, animated: Bool) {
        let gestures: MLNCameraChangeReason = [.gesturePan, .gesturePinch, .gestureRotate, .gestureZoomIn, .gestureZoomOut, .gestureOneFingerZoom, .gestureTilt]
        if !reason.intersection(gestures).isEmpty {
            userMoved = true
            onGesture?()
        }
    }

    func mapView(_ mapView: MLNMapView, regionIsChangingWith reason: MLNCameraChangeReason) {
        zoom = mapView.zoomLevel
        onMove?()
    }

    func mapView(_ mapView: MLNMapView, regionDidChangeWith reason: MLNCameraChangeReason, animated: Bool) {
        zoom = mapView.zoomLevel
        onMove?()
    }

    func centerCoordinate() -> Coord {
        guard let mapView else { return Coord(lat: 39.6, lon: -8) }
        let point = CGPoint(x: mapView.bounds.midX, y: mapView.bounds.midY)
        let coord = mapView.convert(point, toCoordinateFrom: mapView)
        return Coord(lat: coord.latitude, lon: coord.longitude)
    }

    func jump(to coord: Coord, zoom: Double, bearing: Double) {
        mapView?.setCenter(
            CLLocationCoordinate2D(latitude: coord.lat, longitude: coord.lon),
            zoomLevel: zoom,
            direction: bearing,
            animated: false,
            completionHandler: nil
        )
    }

    func fit(_ coordinates: [[Double]], insets: UIEdgeInsets) {
        guard coordinates.count > 1, let mapView else { return }
        var west = Double.infinity, south = Double.infinity, east = -Double.infinity, north = -Double.infinity
        for pair in coordinates {
            guard pair.count > 1 else { continue }
            west = min(west, pair[0])
            east = max(east, pair[0])
            south = min(south, pair[1])
            north = max(north, pair[1])
        }
        let bounds = MLNCoordinateBounds(
            sw: CLLocationCoordinate2D(latitude: south, longitude: west),
            ne: CLLocationCoordinate2D(latitude: north, longitude: east)
        )
        mapView.setVisibleCoordinateBounds(bounds, edgePadding: insets, animated: false, completionHandler: nil)
        mapView.direction = 0
    }

    func show(routes: [RouteChoice]) {
        let features = routes.filter { $0.coordinates.count > 1 }.map { route -> [String: Any] in
            ["type": "Feature", "properties": ["style": route.style], "geometry": ["type": "LineString", "coordinates": route.coordinates]]
        }
        set(collection(features), on: routeSource)
    }

    func showPose(_ pose: Pose?) {
        guard let pose else {
            set(collection([]), on: areaSource)
            if userOn { mapView?.removeAnnotation(userPin); userOn = false }
            return
        }
        let radius = max(pose.uncertainty, 4)
        var features: [[String: Any]] = [[
            "type": "Feature",
            "properties": ["kind": "ring"],
            "geometry": ["type": "Polygon", "coordinates": [Geo.circle(lat: pose.lat, lon: pose.lon, radius: radius)]],
        ]]
        if let heading = pose.heading {
            let length = max(16, min(36, pose.uncertainty))
            features.append([
                "type": "Feature",
                "properties": ["kind": "wedge"],
                "geometry": ["type": "Polygon", "coordinates": [Geo.wedge(lat: pose.lat, lon: pose.lon, heading: heading, length: length)]],
            ])
        }
        set(collection(features), on: areaSource)
        userPin.coordinate = CLLocationCoordinate2D(latitude: pose.lat, longitude: pose.lon)
        if !userOn, let mapView {
            mapView.addAnnotation(userPin)
            userOn = true
        }
    }

    func showDestination(_ coord: Coord?) {
        guard let coord else {
            if destOn { mapView?.removeAnnotation(destPin); destOn = false }
            return
        }
        destPin.coordinate = CLLocationCoordinate2D(latitude: coord.lat, longitude: coord.lon)
        if !destOn, let mapView {
            mapView.addAnnotation(destPin)
            destOn = true
        }
    }

    func showDots(_ name: String, rows: [[String: Any]], source: MLNShapeSource?) {
        let features = rows.compactMap { row -> [String: Any]? in
            guard let lat = (row["lat"] as? NSNumber)?.doubleValue ?? row["lat"] as? Double,
                  let lon = (row["lon"] as? NSNumber)?.doubleValue ?? row["lon"] as? Double else { return nil }
            let category = (row["category"] as? NSNumber)?.intValue ?? row["category"] as? Int ?? -1
            return [
                "type": "Feature",
                "properties": [
                    "name": row["name"] as? String ?? "",
                    "address": row["address"] as? String ?? "",
                    "category": category,
                    "icon": name == "water" ? "water-drop" : "poi-\(category)",
                    "kind": name,
                    "lat": lat,
                    "lon": lon,
                ],
                "geometry": ["type": "Point", "coordinates": [lon, lat]],
            ]
        }
        set(collection(features), on: source)
    }

    func showPois(_ rows: [[String: Any]]) { showDots("poi", rows: rows, source: poiSource) }
    func showWater(_ rows: [[String: Any]]) { showDots("water", rows: rows, source: waterSource) }

    func showBuildings(_ features: [Any]) {
        set(["type": "FeatureCollection", "features": features], on: buildingSource)
    }

    func mapView(_ mapView: MLNMapView, viewFor annotation: MLNAnnotation) -> MLNAnnotationView? {
        guard let pin = annotation as? KindPin else { return nil }
        let reuse = pin.kind
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: reuse) ?? MLNAnnotationView(reuseIdentifier: reuse)
        view.subviews.forEach { $0.removeFromSuperview() }
        view.layer.shadowOpacity = 0
        if pin.kind == "user" {
            view.bounds = CGRect(x: 0, y: 0, width: 28, height: 28)
            view.layer.cornerRadius = 14
            view.backgroundColor = UIColor(red: 0.06, green: 0.42, blue: 0.30, alpha: 1)
            view.layer.borderWidth = 3
            view.layer.borderColor = UIColor.white.cgColor
            view.layer.shadowColor = UIColor.black.cgColor
            view.layer.shadowOpacity = 0.35
            view.layer.shadowRadius = 2
            view.layer.shadowOffset = CGSize(width: 0, height: 1)
            view.centerOffset = .zero
        } else {
            view.bounds = CGRect(x: 0, y: 0, width: 28, height: 42)
            view.layer.cornerRadius = 0
            view.backgroundColor = .clear
            view.layer.borderWidth = 0
            let image = UIImageView(image: Self.destinationPin)
            image.frame = view.bounds
            view.addSubview(image)
            view.centerOffset = CGVector(dx: 0, dy: -21)
        }
        view.isDraggable = pin.kind == "user" && dragEnabled
        return view
    }

    func mapView(_ mapView: MLNMapView, annotationView view: MLNAnnotationView, didChangeDragState newState: MLNAnnotationViewDragState, fromOldState oldState: MLNAnnotationViewDragState) {
        guard newState == .ending, let pin = view.annotation as? KindPin, pin.kind == "user" else { return }
        onDrop?(pin.coordinate.latitude, pin.coordinate.longitude)
    }

    @objc private func tapped(_ gesture: UITapGestureRecognizer) {
        guard let mapView else { return }
        let point = gesture.location(in: mapView)
        let routes = mapView.visibleFeatures(at: point, styleLayerIdentifiers: ["route-car", "route-toll", "route-local", "route-walk", "route-bicycle"])
        if let style = routes.first?.attributes["style"] as? String {
            onTapRoute?(style)
            return
        }
        let places = mapView.visibleFeatures(
            at: point,
            styleLayerIdentifiers: ["poi-symbols", "water-symbols"]
        )
        if let feature = places.first {
            let name = feature.attributes["name"] as? String ?? ""
            let lat = (feature.attributes["lat"] as? NSNumber)?.doubleValue
            let lon = (feature.attributes["lon"] as? NSNumber)?.doubleValue
            if let lat, let lon { onTapPlace?(name, lat, lon) }
        }
    }

    func bounds() -> (west: Double, south: Double, east: Double, north: Double) {
        guard let mapView else { return (-10.5, 35.5, 32.5, 70.5) }
        let box = mapView.visibleCoordinateBounds
        return (box.sw.longitude, box.sw.latitude, box.ne.longitude, box.ne.latitude)
    }

    func setInset(_ inset: UIEdgeInsets) {
        mapView?.contentInset = inset
    }

    func setBearing(_ bearing: Double) {
        mapView?.direction = bearing
    }

    func setDrag(_ enabled: Bool) {
        dragEnabled = enabled
        mapView?.view(for: userPin)?.isDraggable = enabled
    }

    private func install(_ style: MLNStyle) {
        let route = MLNShapeSource(identifier: "route", shape: nil, options: nil)
        let area = MLNShapeSource(identifier: "area", shape: nil, options: nil)
        let buildings = MLNShapeSource(identifier: "buildings", shape: nil, options: nil)
        let pois = MLNShapeSource(identifier: "pois", shape: nil, options: nil)
        let water = MLNShapeSource(identifier: "water-points", shape: nil, options: nil)
        style.addSource(route)
        style.addSource(area)
        style.addSource(buildings)
        style.addSource(pois)
        style.addSource(water)
        routeSource = route
        areaSource = area
        buildingSource = buildings
        poiSource = pois
        waterSource = water

        let lines: [(String, [String], UIColor)] = [
            ("route-walk", ["walk", "walk-alt"], UIColor(white: 0.29, alpha: 1)),
            ("route-bicycle", ["bicycle", "bicycle-alt"], UIColor(red: 0.91, green: 0.26, blue: 0.58, alpha: 1)),
            ("route-toll", ["toll"], UIColor(red: 0.92, green: 0.70, blue: 0.03, alpha: 1)),
            ("route-local", ["local"], UIColor(red: 0.86, green: 0.15, blue: 0.15, alpha: 1)),
            ("route-car", ["car"], UIColor(red: 0.10, green: 0.45, blue: 0.91, alpha: 1)),
        ]
        for spec in lines {
            let layer = MLNLineStyleLayer(identifier: spec.0, source: route)
            layer.lineColor = NSExpression(forConstantValue: spec.2)
            layer.lineWidth = NSExpression(forConstantValue: 5)
            layer.lineOpacity = NSExpression(forConstantValue: 0.92)
            layer.lineCap = NSExpression(forConstantValue: "round")
            layer.lineJoin = NSExpression(forConstantValue: "round")
            layer.predicate = NSPredicate(format: "style IN %@", spec.1)
            style.addLayer(layer)
        }
        let ring = MLNFillStyleLayer(identifier: "uncertainty-fill", source: area)
        ring.fillColor = NSExpression(forConstantValue: UIColor(red: 0.06, green: 0.42, blue: 0.30, alpha: 1))
        ring.fillOpacity = NSExpression(forConstantValue: 0.16)
        ring.predicate = NSPredicate(format: "kind == 'ring'")
        style.addLayer(ring)
        let wedge = MLNFillStyleLayer(identifier: "heading-fill", source: area)
        wedge.fillColor = NSExpression(forConstantValue: UIColor(red: 0.06, green: 0.42, blue: 0.30, alpha: 1))
        wedge.fillOpacity = NSExpression(forConstantValue: 0.55)
        wedge.predicate = NSPredicate(format: "kind == 'wedge'")
        style.addLayer(wedge)
        let outline = MLNLineStyleLayer(identifier: "building-outline", source: buildings)
        outline.lineColor = NSExpression(forConstantValue: UIColor(red: 0.55, green: 0.52, blue: 0.47, alpha: 1))
        outline.lineWidth = NSExpression(forConstantValue: 1.25)
        outline.minimumZoomLevel = 15
        style.addLayer(outline)
        for index in 0..<6 {
            style.setImage(CategoryArt.image(index), forName: "poi-\(index)")
        }
        style.setImage(CategoryArt.water(), forName: "water-drop")
        style.addLayer(symbolLayer("poi-symbols", source: pois, icon: NSExpression(forKeyPath: "icon")))
        style.addLayer(symbolLayer("water-symbols", source: water, icon: NSExpression(forConstantValue: "water-drop")))
    }

    private func symbolLayer(_ identifier: String, source: MLNShapeSource, icon: NSExpression) -> MLNSymbolStyleLayer {
        let layer = MLNSymbolStyleLayer(identifier: identifier, source: source)
        layer.iconImageName = icon
        layer.iconScale = NSExpression(forConstantValue: 0.85)
        layer.iconAllowsOverlap = NSExpression(forConstantValue: true)
        layer.iconAnchor = NSExpression(forConstantValue: "center")
        layer.text = NSExpression(forKeyPath: "name")
        layer.textFontNames = NSExpression(forConstantValue: ["Noto Sans Regular"])
        layer.textFontSize = NSExpression(forConstantValue: 12)
        layer.textOffset = NSExpression(forConstantValue: NSValue(cgVector: CGVector(dx: 0, dy: 1.15)))
        layer.textAnchor = NSExpression(forConstantValue: "top")
        layer.textOptional = NSExpression(forConstantValue: true)
        layer.textColor = NSExpression(forConstantValue: UIColor(red: 28 / 255, green: 25 / 255, blue: 22 / 255, alpha: 1))
        layer.textHaloColor = NSExpression(forConstantValue: UIColor(red: 1, green: 252 / 255, blue: 248 / 255, alpha: 1))
        layer.textHaloWidth = NSExpression(forConstantValue: 1.2)
        return layer
    }

    private func collection(_ features: [Any]) -> [String: Any] {
        ["type": "FeatureCollection", "features": features]
    }

    private func set(_ object: [String: Any], on source: MLNShapeSource?) {
        guard let source, let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        source.shape = try? MLNShape(data: data, encoding: String.Encoding.utf8.rawValue)
    }

    private static let destinationPin: UIImage = {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 28, height: 42))
        return renderer.image { _ in
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 14, y: 2))
            path.addCurve(to: CGPoint(x: 4, y: 14), controlPoint1: CGPoint(x: 8.2, y: 2), controlPoint2: CGPoint(x: 4, y: 7))
            path.addCurve(to: CGPoint(x: 14, y: 40), controlPoint1: CGPoint(x: 4, y: 22), controlPoint2: CGPoint(x: 14, y: 40))
            path.addCurve(to: CGPoint(x: 24, y: 14), controlPoint1: CGPoint(x: 14, y: 40), controlPoint2: CGPoint(x: 24, y: 22))
            path.addCurve(to: CGPoint(x: 14, y: 2), controlPoint1: CGPoint(x: 24, y: 7), controlPoint2: CGPoint(x: 19.8, y: 2))
            path.close()
            UIColor(red: 0.76, green: 0.25, blue: 0.05, alpha: 1).setFill()
            path.fill()
            UIColor.white.setStroke()
            path.lineWidth = 1.5
            path.stroke()
            let hole = UIBezierPath(ovalIn: CGRect(x: 10.2, y: 10.2, width: 7.6, height: 7.6))
            UIColor.white.setFill()
            hole.fill()
        }
    }()
}

final class KindPin: MLNPointAnnotation {
    var kind = ""
}
