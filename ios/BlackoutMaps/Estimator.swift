import CoreMotion
import Foundation
import QuartzCore

struct Pose {
    var lat: Double
    var lon: Double
    var heading: Double?
    var uncertainty: Double
    var steps: Int
    var distance: Double
    var reason: String
}

final class PedestrianEstimator {
    private let motion = CMMotionManager()
    private let queue = OperationQueue()
    private var mode = "walk"
    private var stepLength = 0.7
    private var paused = false
    private var started = false
    private var pose: Pose?
    private var heading: Double?
    private var detector = StepDetector()
    private var lastStepAt: Double?
    private var intervals: [Double] = []
    private var samples: [(dev: Double, time: Double)] = []
    private var lastMotionAt: Double?
    private let lock = NSLock()

    var onPose: ((Pose) -> Void)?
    var constraint: ((Double, Double, Double, Double?, String) -> Coord?)?

    init() {
        queue.name = "pt.tendertown.mapa.motion"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInteractive
    }

    func setStep(_ meters: Double) {
        queue.addOperation { [weak self] in
            guard let self, meters >= 0.3, meters <= 1.5 else { return }
            self.stepLength = meters
        }
    }

    func setMode(_ mode: String) {
        queue.addOperation { [weak self] in
            guard let self, mode == "walk" || mode == "bicycle" || mode == "car", mode != self.mode else { return }
            self.mode = mode
            self.clearGait()
        }
    }

    func setPaused(_ paused: Bool) {
        queue.addOperation { [weak self] in self?.paused = paused }
    }

    func reset(lat: Double, lon: Double, snap: Bool = true) {
        queue.addOperation { [weak self] in
            guard let self else { return }
            self.clearGait()
            self.pose = Pose(lat: lat, lon: lon, heading: self.heading, uncertainty: 8, steps: 0, distance: 0, reason: "reset")
            if snap { _ = self.applyConstraint(0) }
            self.emit("reset")
        }
    }

    func hydrate(lat: Double, lon: Double, uncertainty: Double, steps: Int, distance: Double) {
        queue.addOperation { [weak self] in
            guard let self else { return }
            self.pose = Pose(
                lat: lat,
                lon: lon,
                heading: nil,
                uncertainty: max(8, uncertainty),
                steps: max(0, steps),
                distance: max(0, distance),
                reason: "hydrate"
            )
            _ = self.applyConstraint(0)
            self.emit("hydrate")
        }
    }

    func snap() {
        queue.addOperation { [weak self] in
            guard let self, self.applyConstraint(0) else { return }
            self.emit("move")
        }
    }

    func start() {
        lock.lock()
        let already = started
        started = true
        lock.unlock()
        guard !already, motion.isDeviceMotionAvailable else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: queue) { [weak self] data, _ in
            guard let self, let data else { return }
            self.push(data)
        }
    }

    func stop() {
        lock.lock()
        started = false
        lock.unlock()
        motion.stopDeviceMotionUpdates()
    }

    private func push(_ data: CMDeviceMotion) {
        if paused || pose == nil { return }
        let time = CACurrentMediaTime() * 1000
        let gravity = data.gravity
        let user = data.userAcceleration
        let ax = (gravity.x + user.x) * 9.80665
        let ay = (gravity.y + user.y) * 9.80665
        let az = (gravity.z + user.z) * 9.80665
        let magnitude = sqrt(ax * ax + ay * ay + az * az)
        if data.heading >= 0 {
            onHeading(data.heading, time: time)
        }
        onSample(magnitude, time: time)
    }

    private func onHeading(_ degrees: Double, time: Double) {
        if paused || !degrees.isFinite { return }
        heading = smooth(heading, degrees)
        guard var pose else { return }
        pose.heading = heading
        pose.reason = "heading"
        self.pose = pose
        emit("heading")
        _ = time
    }

    private func onSample(_ magnitude: Double, time: Double) {
        guard var pose, !paused else { return }
        let sample = detector.push(magnitude, time)
        if mode != "walk" {
            samples.append((sample.dev, time))
            let cutoff = time - 800
            while let first = samples.first, first.time < cutoff { samples.removeFirst() }
            let energy = samples.reduce(0) { $0 + $1.dev * $1.dev }
            let rms = samples.isEmpty ? 0 : sqrt(energy / Double(samples.count))
            let speed = speedMps(rms, mode)
            let dt = lastMotionAt == nil ? 0 : (time - (lastMotionAt ?? time)) / 1000
            lastMotionAt = time
            if dt > 1.2 {
                samples.removeAll()
                return
            }
            if dt <= 0 || speed == 0 { return }
            advance(speed * min(dt, 0.25), reason: "move", pose: &pose)
            return
        }
        if !sample.step { return }
        let stride = strideMeters(cadence(time), stepLength)
        lastStepAt = time
        pose.steps += 1
        advance(stride, reason: "step", pose: &pose)
    }

    private func advance(_ distance: Double, reason: String, pose: inout Pose) {
        guard distance > 0 else { return }
        pose.distance += distance
        if mode == "walk" {
            if let heading {
                let next = Geo.destination(lat: pose.lat, lon: pose.lon, headingDeg: heading, distanceM: distance)
                pose.lat = next.lat
                pose.lon = next.lon
                pose.heading = heading
                pose.uncertainty += distance * stepError
            } else {
                pose.uncertainty += distance
            }
            pose.reason = reason
            self.pose = pose
            emit(reason)
            return
        }
        self.pose = pose
        let moved = applyConstraint(distance)
        if let updated = self.pose { pose = updated }
        if let heading { pose.heading = heading }
        pose.uncertainty += moved || heading != nil ? distance * stepError : distance
        pose.reason = reason
        self.pose = pose
        emit(reason)
    }

    @discardableResult
    private func applyConstraint(_ distance: Double) -> Bool {
        guard mode != "walk", var pose, let constraint else { return false }
        guard let next = constraint(pose.lat, pose.lon, distance, heading, mode) else { return false }
        let moved = abs(next.lat - pose.lat) > 1e-9 || abs(next.lon - pose.lon) > 1e-9
        pose.lat = next.lat
        pose.lon = next.lon
        self.pose = pose
        return moved
    }

    private func cadence(_ time: Double) -> Double {
        guard let lastStepAt else { return 110 }
        let gap = time - lastStepAt
        if gap > 1600 {
            intervals.removeAll()
            return 110
        }
        if gap >= 320 {
            intervals.append(gap)
            if intervals.count > 4 { intervals.removeFirst() }
        }
        guard !intervals.isEmpty else { return 110 }
        return 60_000 / (intervals.reduce(0, +) / Double(intervals.count))
    }

    private func emit(_ reason: String) {
        guard var pose else { return }
        pose.reason = reason
        let snapshot = pose
        DispatchQueue.main.async { [weak self] in self?.onPose?(snapshot) }
    }

    private func clearGait() {
        detector = StepDetector()
        lastStepAt = nil
        intervals.removeAll()
        samples.removeAll()
        lastMotionAt = nil
    }

    private func smooth(_ previous: Double?, _ next: Double) -> Double {
        guard let previous, previous.isFinite else { return wrap(next) }
        let delta = ((next - previous + 540).truncatingRemainder(dividingBy: 360)) - 180
        return wrap(previous + 0.35 * delta)
    }

    private func wrap(_ degrees: Double) -> Double {
        let value = degrees.truncatingRemainder(dividingBy: 360)
        return value < 0 ? value + 360 : value
    }

    private var stepError: Double { hypot(0.12, (10 * .pi) / 180) }

    private func strideMeters(_ cadence: Double, _ biasM: Double) -> Double {
        let bias = min(1.5, max(0.3, biasM))
        let pace = min(190, max(60, cadence))
        return min(1.15, max(0.4, bias * (pace / 110)))
    }

    private func speedMps(_ rms: Double, _ mode: String) -> Double {
        guard rms > 0.35 else { return 0 }
        let extra = rms - 0.35
        if mode == "car" { return min(130, extra * 45) / 3.6 }
        if mode == "bicycle" { return min(35, extra * 18) / 3.6 }
        return 0
    }
}

private struct StepDetector {
    private var low: Double?
    private var previous = 0.0
    private var armed = true
    private var lastAt = -1e15
    private var seen = 0

    mutating func push(_ magnitude: Double, _ time: Double) -> (step: Bool, dev: Double) {
        guard magnitude.isFinite, time.isFinite else { return (false, 0) }
        low = low == nil ? magnitude : (low! * 0.95 + magnitude * 0.05)
        let scale = (low ?? 0) > 4 ? 1.0 : 9.80665
        let dev = (magnitude - (low ?? magnitude)) * scale
        seen += 1
        var step = false
        if seen > 15 && armed && dev < previous && previous >= 1.15 && time - lastAt >= 320 {
            step = true
            armed = false
            lastAt = time
        }
        if dev < 0.45 { armed = true }
        previous = dev
        return (step, dev)
    }
}
