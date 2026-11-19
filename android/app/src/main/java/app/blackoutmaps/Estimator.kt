package app.blackoutmaps

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import java.util.ArrayDeque
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

class Estimator(
    context: Context,
    private val onPose: (Pose) -> Unit,
    private val constraint: (lat: Double, lon: Double, distance: Double, heading: Double?, mode: String) -> Coord?
) : SensorEventListener {
    private val sensors = context.getSystemService(SensorManager::class.java)
    private val accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val rotation = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val executor = Executors.newSingleThreadExecutor()
    val available = accel != null

    private var mode = "walk"
    private var stepLength = 0.7
    private var paused = false
    @Volatile private var started = false
    private var pose: Pose? = null
    private var heading: Double? = null
    private var detector = StepDetector()
    private var lastStepAt: Double? = null
    private val intervals = ArrayDeque<Double>()
    private val samples = ArrayDeque<Pair<Double, Double>>()
    private var lastMotionAt: Double? = null
    private var lastEmit = 0.0

    fun setStep(meters: Double) = executor.execute {
        if (meters in 0.3..1.5) stepLength = meters
    }

    fun setMode(next: String) = executor.execute {
        if ((next == "walk" || next == "bicycle" || next == "car") && next != mode) {
            mode = next
            clearGait()
        }
    }

    fun setPaused(value: Boolean) = executor.execute { paused = value }

    fun reset(lat: Double, lon: Double, snap: Boolean) = executor.execute {
        clearGait()
        pose = Pose(lat, lon, heading, 8.0, 0, 0.0, "reset")
        if (snap) applyConstraint(0.0)
        emit("reset")
    }

    fun hydrate(lat: Double, lon: Double, uncertainty: Double, steps: Int, distance: Double) = executor.execute {
        pose = Pose(lat, lon, null, maxOf(8.0, uncertainty), maxOf(0, steps), maxOf(0.0, distance), "hydrate")
        applyConstraint(0.0)
        emit("hydrate")
    }

    fun snap() = executor.execute {
        if (applyConstraint(0.0)) emit("move")
    }

    fun start() {
        if (!available || started) return
        started = true
        accel?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        rotation?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun stop() {
        started = false
        sensors.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val values = event.values.clone()
        val type = event.sensor.type
        val time = event.timestamp / 1_000_000.0
        executor.execute {
            if (type == Sensor.TYPE_ROTATION_VECTOR) onHeading(headingOf(values), time)
            if (type == Sensor.TYPE_ACCELEROMETER) {
                val magnitude = sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2]).toDouble()
                onSample(magnitude, time)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    fun shutdown() {
        stop()
        executor.shutdownNow()
    }

    private fun onHeading(degrees: Double, time: Double) {
        if (paused || !degrees.isFinite()) return
        heading = smooth(heading, degrees)
        val current = pose ?: return
        pose = current.copy(heading = heading, reason = "heading")
        emit("heading")
        Unit.let { time }
    }

    private fun onSample(magnitude: Double, time: Double) {
        val current = pose ?: return
        if (paused) return
        val sample = detector.push(magnitude, time)
        if (mode != "walk") {
            samples.add(sample.second to time)
            val cutoff = time - 800
            while (samples.isNotEmpty() && samples.first().second < cutoff) samples.removeFirst()
            val energy = samples.sumOf { it.first * it.first }
            val rms = if (samples.isEmpty()) 0.0 else sqrt(energy / samples.size)
            val speed = speedMps(rms, mode)
            val dt = if (lastMotionAt == null) 0.0 else (time - (lastMotionAt ?: time)) / 1000
            lastMotionAt = time
            if (dt > 1.2) {
                samples.clear()
                return
            }
            if (dt <= 0 || speed == 0.0) return
            advance(speed * minOf(dt, 0.25), "move", current)
            return
        }
        if (!sample.first) return
        val stride = strideMeters(cadence(time), stepLength)
        lastStepAt = time
        advance(stride, "step", current.copy(steps = current.steps + 1))
    }

    private fun advance(distance: Double, reason: String, start: Pose) {
        if (distance <= 0) return
        var next = start.copy(distance = start.distance + distance)
        if (mode == "walk") {
            val face = heading
            if (face != null) {
                val moved = Geo.destination(next.lat, next.lon, face, distance)
                next = next.copy(lat = moved.lat, lon = moved.lon, heading = face, uncertainty = next.uncertainty + distance * stepError)
            } else {
                next = next.copy(uncertainty = next.uncertainty + distance)
            }
            pose = next.copy(reason = reason)
            emit(reason)
            return
        }
        pose = next
        val moved = applyConstraint(distance)
        pose?.let { next = it }
        if (heading != null) next = next.copy(heading = heading)
        val growth = if (moved || heading != null) distance * stepError else distance
        pose = next.copy(uncertainty = next.uncertainty + growth, reason = reason)
        emit(reason)
    }

    private fun applyConstraint(distance: Double): Boolean {
        if (mode == "walk") return false
        val current = pose ?: return false
        val next = constraint(current.lat, current.lon, distance, heading, mode) ?: return false
        val moved = kotlin.math.abs(next.lat - current.lat) > 1e-9 || kotlin.math.abs(next.lon - current.lon) > 1e-9
        pose = current.copy(lat = next.lat, lon = next.lon)
        return moved
    }

    private fun cadence(time: Double): Double {
        val previous = lastStepAt ?: return 110.0
        val gap = time - previous
        if (gap > 1600) {
            intervals.clear()
            return 110.0
        }
        if (gap >= 320) {
            intervals.add(gap)
            if (intervals.size > 4) intervals.removeFirst()
        }
        if (intervals.isEmpty()) return 110.0
        return 60_000 / (intervals.sum() / intervals.size)
    }

    private fun emit(reason: String) {
        val now = System.nanoTime() / 1_000_000.0
        if (reason == "heading" && now - lastEmit < 100) return
        lastEmit = now
        val snapshot = pose?.copy(reason = reason) ?: return
        pose = snapshot
        onPose(snapshot)
    }

    private fun clearGait() {
        detector = StepDetector()
        lastStepAt = null
        intervals.clear()
        samples.clear()
        lastMotionAt = null
    }

    private fun smooth(previous: Double?, next: Double): Double {
        if (previous == null || !previous.isFinite()) return wrap(next)
        val delta = ((next - previous + 540) % 360) - 180
        return wrap(previous + 0.35 * delta)
    }

    private fun wrap(degrees: Double): Double {
        val value = degrees % 360
        return if (value < 0) value + 360 else value
    }

    private val stepError = hypot(0.12, (10 * PI) / 180)

    private fun strideMeters(cadence: Double, biasM: Double): Double {
        val bias = minOf(1.5, maxOf(0.3, biasM))
        val pace = minOf(190.0, maxOf(60.0, cadence))
        return minOf(1.15, maxOf(0.4, bias * (pace / 110)))
    }

    private fun speedMps(rms: Double, mode: String): Double {
        if (rms <= 0.35) return 0.0
        val extra = rms - 0.35
        if (mode == "car") return minOf(130.0, extra * 45) / 3.6
        if (mode == "bicycle") return minOf(35.0, extra * 18) / 3.6
        return 0.0
    }

    private fun headingOf(values: FloatArray): Double {
        val matrix = FloatArray(9)
        val orientation = FloatArray(3)
        SensorManager.getRotationMatrixFromVector(matrix, values)
        SensorManager.getOrientation(matrix, orientation)
        var degrees = Math.toDegrees(orientation[0].toDouble())
        if (degrees < 0) degrees += 360
        return degrees
    }
}

private class StepDetector {
    private var low: Double? = null
    private var previous = 0.0
    private var armed = true
    private var lastAt = -1e15
    private var seen = 0

    fun push(magnitude: Double, time: Double): Pair<Boolean, Double> {
        if (!magnitude.isFinite() || !time.isFinite()) return false to 0.0
        low = if (low == null) magnitude else low!! * 0.95 + magnitude * 0.05
        val scale = if ((low ?: 0.0) > 4) 1.0 else 9.80665
        val dev = (magnitude - (low ?: magnitude)) * scale
        seen += 1
        var step = false
        if (seen > 15 && armed && dev < previous && previous >= 1.15 && time - lastAt >= 320) {
            step = true
            armed = false
            lastAt = time
        }
        if (dev < 0.45) armed = true
        previous = dev
        return step to dev
    }
}
