import Foundation
import CoreLocation

struct Coord: Hashable, Codable {
    var lat: Double
    var lon: Double
}

struct Place: Identifiable, Hashable, Codable {
    var id: String
    var name: String
    var lat: Double
    var lon: Double
    var address: String
    var detail: String
    var service: Bool

    var coord: Coord { Coord(lat: lat, lon: lon) }
}

struct NavStep: Identifiable, Hashable {
    var id: Int
    var turn: String
    var meters: Double
    var street: String
}

struct RouteChoice: Identifiable, Hashable {
    var id: String { style }
    var style: String
    var label: String
    var meters: Double
    var seconds: Double?
    var coordinates: [[Double]]
}

enum Geo {
    static func meters(_ aLat: Double, _ aLon: Double, _ bLat: Double, _ bLon: Double) -> Double {
        let p1 = aLat * .pi / 180
        let p2 = bLat * .pi / 180
        let dp = p2 - p1
        let dl = (bLon - aLon) * .pi / 180
        let h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * 6_371_000 * asin(min(1, sqrt(h)))
    }

    static func destination(lat: Double, lon: Double, headingDeg: Double, distanceM: Double) -> Coord {
        let angular = distanceM / 6_378_137
        let heading = headingDeg * .pi / 180
        let lat1 = lat * .pi / 180
        let lon1 = lon * .pi / 180
        let lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(heading))
        let lon2 = lon1 + atan2(sin(heading) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
        var deg = lon2 * 180 / .pi
        deg = ((deg + 540).truncatingRemainder(dividingBy: 360)) - 180
        return Coord(lat: lat2 * 180 / .pi, lon: deg)
    }

    static func circle(lat: Double, lon: Double, radius: Double, steps: Int = 64) -> [[Double]] {
        var ring: [[Double]] = []
        for i in 0...steps {
            let point = destination(lat: lat, lon: lon, headingDeg: Double(i) / Double(steps) * 360, distanceM: radius)
            ring.append([point.lon, point.lat])
        }
        return ring
    }

    static func wedge(lat: Double, lon: Double, heading: Double, length: Double) -> [[Double]] {
        let tip = destination(lat: lat, lon: lon, headingDeg: heading, distanceM: length)
        let left = destination(lat: lat, lon: lon, headingDeg: heading - 22, distanceM: length * 0.42)
        let right = destination(lat: lat, lon: lon, headingDeg: heading + 22, distanceM: length * 0.42)
        return [[lon, lat], [left.lon, left.lat], [tip.lon, tip.lat], [right.lon, right.lat], [lon, lat]]
    }
}

enum Format {
    private static func number(_ digits: Int) -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = L10n.locale()
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter
    }
    static var meters: NumberFormatter { number(2) }
    static var whole: NumberFormatter { number(0) }
    static var km: NumberFormatter { number(1) }

    static func step(_ value: Double) -> String {
        "\(meters.string(from: NSNumber(value: value)) ?? "0,70") m"
    }

    static func kmOrM(_ value: Double) -> String {
        if value >= 1000 { return "\(whole.string(from: NSNumber(value: value / 1000)) ?? "0") km" }
        return "\(whole.string(from: NSNumber(value: value)) ?? "0") m"
    }

    static func distanceKm(_ value: Double) -> String {
        let km = value > 0 ? max(value / 1000, 0.1) : 0
        if km < 10 { return "\(self.km.string(from: NSNumber(value: km)) ?? "0,1") km" }
        return "\(whole.string(from: NSNumber(value: km)) ?? "0") km"
    }

    static func minutes(_ minutes: Double) -> String {
        let value = max(0, minutes)
        if value < 60 { return "\(whole.string(from: NSNumber(value: value)) ?? "0") min" }
        let hours = Int(value / 60)
        let rest = Int(value) % 60
        if rest == 0 { return "\(hours) h" }
        return "\(hours) h \(rest) min"
    }

    static func duration(meters: Double, mode: String, seconds: Double?) -> String {
        let minutes = seconds.map { $0 / 60 } ?? tripMinutes(meters: meters, mode: mode)
        return self.minutes(minutes)
    }

    static func arrival(meters: Double, mode: String, seconds: Double?) -> String {
        let minutes = seconds.map { $0 / 60 } ?? tripMinutes(meters: meters, mode: mode)
        let date = Date().addingTimeInterval(minutes * 60)
        let formatter = DateFormatter()
        formatter.locale = L10n.locale()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    static func tripMinutes(meters: Double, mode: String) -> Double {
        let kmh = mode == "walk" ? 5.0 : mode == "bicycle" ? 15.0 : 60.0
        if meters <= 0 { return 0 }
        return Double(max(1, Int((meters / 1000 / kmh * 60).rounded())))
    }

    static func maneuverDistance(_ meters: Double) -> String {
        let value = max(0, meters)
        if value < 25 { return L10n.text(L10n.code(), "now") }
        if value < 1000 {
            let step = value < 200 ? 10.0 : 50.0
            let rounded = (value / step).rounded() * step
            return "\(whole.string(from: NSNumber(value: rounded)) ?? "0") m"
        }
        if value < 10_000 { return "\(km.string(from: NSNumber(value: value / 1000)) ?? "0") km" }
        return "\(whole.string(from: NSNumber(value: value / 1000)) ?? "0") km"
    }

    static func spoken(_ meters: Double) -> (now: Bool, text: String) {
        let value = max(0, meters)
        if value < 25 { return (true, L10n.text(L10n.code(), "now")) }
        if value < 1000 {
            let step = value < 200 ? 10.0 : 50.0
            let rounded = (value / step).rounded() * step
            return (false, "\(whole.string(from: NSNumber(value: rounded)) ?? "0") \(L10n.text(L10n.code(), "meters-word"))")
        }
        return (false, maneuverDistance(value))
    }

    static func sentence(turn: String, meters: Double, street: String) -> String {
        let code = L10n.code()
        let distance = spoken(meters)
        let maneuver = L10n.text(code, ["slight-left", "left", "sharp-left", "slight-right", "right", "sharp-right", "uturn"].contains(turn) ? turn : "straight")
        if !street.isEmpty && turn != "straight" {
            return distance.now ? L10n.text(code, "now-turn", [street]) : L10n.text(code, "in-turn", [distance.text, street])
        }
        if !street.isEmpty {
            return distance.now ? L10n.text(code, "now-straight-street", [street]) : L10n.text(code, "in-straight-street", [distance.text, street])
        }
        if distance.now { return maneuver }
        return L10n.text(code, "in-maneuver", [distance.text, maneuver])
    }

    static func coord(_ lat: Double, _ lon: Double) -> String {
        let separator = L10n.locale().decimalSeparator ?? "."
        let text = { (value: Double) in String(format: "%.5f", locale: L10n.locale(), value).replacingOccurrences(of: ".", with: separator) }
        return "\(text(lat)), \(text(lon))"
    }
}
