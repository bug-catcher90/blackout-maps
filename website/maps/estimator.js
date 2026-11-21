/**
 * Pose source used by the map.
 *
 * Walking counts steps and moves in open space. The stride is the
 * settings bias scaled by cadence. Direction is the absolute compass.
 * The gyroscope only bridges the gap until the next compass reading,
 * and never for long on its own. Without a step the circle stays put.
 * Acceleration is not double-integrated.
 *
 * A bicycle or a car ignores steps. Speed is the strength of the
 * motion, and the circle stays on the active route or the nearest road.
 */

const EARTH_RADIUS_M = 6378137
export const ANCHOR_UNCERTAINTY_M = 8
export const DEFAULT_STEP_LENGTH_M = 0.7
export const STEP_THRESHOLD_MPS2 = 1.15
export const STEP_REARM_MPS2 = 0.45
export const STEP_MIN_INTERVAL_MS = 320
export const REF_CADENCE_SPM = 110
export const STRIDE_MIN_M = 0.4
export const STRIDE_MAX_M = 1.15
export const MOTION_WINDOW_MS = 800
export const MOTION_FLOOR_MPS2 = 0.35
export const BIKE_KMH_PER_MPS2 = 18
export const CAR_KMH_PER_MPS2 = 45
export const BIKE_MAX_KMH = 35
export const CAR_MAX_KMH = 130
export const GYRO_BRIDGE_MS = 1200
const STEP_WARMUP = 15
const CADENCE_GAP_MS = 1600
// Along-track fraction plus a heading bias that does not cancel.
const STEP_ERROR_FRACTION = Math.hypot(0.12, (10 * Math.PI) / 180)

export function strideMeters(cadenceSpm, biasM) {
  const bias = Math.max(0.3, Math.min(1.5, biasM))
  const cadence = Math.max(60, Math.min(190, cadenceSpm))
  const stride = bias * (cadence / REF_CADENCE_SPM)
  return Math.max(STRIDE_MIN_M, Math.min(STRIDE_MAX_M, stride))
}

export function speedMps(rms, mode) {
  if (!(rms > MOTION_FLOOR_MPS2)) return 0
  const extra = rms - MOTION_FLOOR_MPS2
  if (mode === "car") return Math.min(CAR_MAX_KMH, extra * CAR_KMH_PER_MPS2) / 3.6
  if (mode === "bicycle") return Math.min(BIKE_MAX_KMH, extra * BIKE_KMH_PER_MPS2) / 3.6
  return 0
}

function wrap360(degrees) {
  return ((degrees % 360) + 360) % 360
}

// Clockwise heading change, degrees per second. Flat on its back, a
// negative alpha rate is a right turn. Held upright, a negative gamma
// rate is a right turn. Beta and gamma are the phone's tilt in degrees.
export function headingRateDeg(rate, betaDeg, gammaDeg) {
  if (!rate) return 0
  const beta = ((Number(betaDeg) || 0) * Math.PI) / 180
  const gamma = ((Number(gammaDeg) || 0) * Math.PI) / 180
  const alphaRate = Number(rate.alpha) || 0
  const betaRate = Number(rate.beta) || 0
  const gammaRate = Number(rate.gamma) || 0
  const ccw = alphaRate * Math.cos(beta) * Math.cos(gamma) + betaRate * Math.sin(gamma) + gammaRate * Math.sin(beta) * Math.cos(gamma)
  return -ccw
}

export function createStepDetector() {
  let low = null
  let prev = 0
  let armed = true
  let lastAt = -1e15
  let seen = 0

  return {
    push(magnitude, timeMs) {
      if (!Number.isFinite(magnitude) || !Number.isFinite(timeMs)) {
        return { step: false, dev: 0 }
      }
      low = low == null ? magnitude : low * 0.95 + magnitude * 0.05
      const scale = low > 4 ? 1 : 9.80665
      const dev = (magnitude - low) * scale
      seen += 1
      let step = false
      if (
        seen > STEP_WARMUP &&
        armed &&
        dev < prev &&
        prev >= STEP_THRESHOLD_MPS2 &&
        timeMs - lastAt >= STEP_MIN_INTERVAL_MS
      ) {
        step = true
        armed = false
        lastAt = timeMs
      }
      if (dev < STEP_REARM_MPS2) armed = true
      prev = dev
      return { step, dev }
    },
  }
}

export function destination(lat, lon, headingDeg, distanceM) {
  const angular = distanceM / EARTH_RADIUS_M
  const heading = (headingDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const sinAngular = Math.sin(angular)
  const cosAngular = Math.cos(angular)
  const lat2 = Math.asin(sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(heading))
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(heading) * sinAngular * cosLat1,
      cosAngular - sinLat1 * Math.sin(lat2),
    )
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: ((((lon2 * 180) / Math.PI + 540) % 360) - 180),
  }
}

export function circlePolygon(lat, lon, radiusM, steps = 64) {
  const ring = []
  for (let i = 0; i <= steps; i += 1) {
    const point = destination(lat, lon, (i / steps) * 360, radiusM)
    ring.push([point.lon, point.lat])
  }
  return { type: "Polygon", coordinates: [ring] }
}

export function wedgePolygon(lat, lon, headingDeg, lengthM) {
  const tip = destination(lat, lon, headingDeg, lengthM)
  const left = destination(lat, lon, headingDeg - 22, lengthM * 0.42)
  const right = destination(lat, lon, headingDeg + 22, lengthM * 0.42)
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [left.lon, left.lat], [tip.lon, tip.lat], [right.lon, right.lat], [lon, lat]]],
  }
}

function smoothHeading(previous, next) {
  if (previous == null || !Number.isFinite(previous)) return next
  const delta = ((next - previous + 540) % 360) - 180
  return (previous + 0.35 * delta + 360) % 360
}

function blankPose(lat, lon, headingDeg) {
  return {
    lat,
    lon,
    headingDeg: headingDeg ?? null,
    uncertaintyM: ANCHOR_UNCERTAINTY_M,
    steps: 0,
    distanceM: 0,
    updatedAt: Date.now(),
  }
}

function finiteCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

export function createPedestrianDeadReckoning(sensors) {
  let stepLength = DEFAULT_STEP_LENGTH_M
  let mode = "walk"
  let pose = null
  let heading = null
  let started = false
  let detector = createStepDetector()
  let unsubs = []
  let constraint = null
  let lastStepAt = null
  const intervals = []
  const motion = []
  let lastMotionAt = null
  let compassAt = -1e15
  let lastGyroAt = null
  let tiltBeta = 0
  let tiltGamma = 0
  let paused = false
  const listeners = new Set()

  function emit(reason) {
    if (!pose) return
    const snapshot = { ...pose, reason }
    for (const listener of listeners) listener(snapshot)
  }

  function clearGait() {
    detector = createStepDetector()
    lastStepAt = null
    intervals.length = 0
    motion.length = 0
    lastMotionAt = null
    lastGyroAt = null
  }

  function applyConstraint(distanceM) {
    if (mode === "walk" || !pose || !constraint) return false
    const next = constraint(pose.lat, pose.lon, distanceM, heading)
    if (!next || !finiteCoord(next.lat, next.lon)) return false
    const moved = Math.abs(next.lat - pose.lat) > 1e-9 || Math.abs(next.lon - pose.lon) > 1e-9
    pose.lat = next.lat
    pose.lon = next.lon
    return moved
  }

  function resetTo(lat, lon, options = {}) {
    if (!finiteCoord(lat, lon)) throw new Error("coords")
    clearGait()
    pose = blankPose(lat, lon, heading)
    if (options.snap !== false) applyConstraint(0)
    emit("reset")
  }

  function cadenceNow(timeMs) {
    if (lastStepAt == null) return REF_CADENCE_SPM
    const gap = timeMs - lastStepAt
    if (gap > CADENCE_GAP_MS) {
      intervals.length = 0
      return REF_CADENCE_SPM
    }
    if (gap >= STEP_MIN_INTERVAL_MS) {
      intervals.push(gap)
      if (intervals.length > 4) intervals.shift()
    }
    if (!intervals.length) return REF_CADENCE_SPM
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    return 60000 / mean
  }

  function advance(distanceM, reason) {
    if (!(distanceM > 0) || !pose) return
    pose.distanceM += distanceM
    pose.updatedAt = Date.now()
    if (mode === "walk") {
      if (heading == null) {
        pose.uncertaintyM += distanceM
      } else {
        const next = destination(pose.lat, pose.lon, heading, distanceM)
        pose.lat = next.lat
        pose.lon = next.lon
        pose.headingDeg = heading
        pose.uncertaintyM += distanceM * STEP_ERROR_FRACTION
      }
      emit(reason)
      return
    }
    const moved = applyConstraint(distanceM)
    if (heading != null) pose.headingDeg = heading
    pose.uncertaintyM += moved || heading != null ? distanceM * STEP_ERROR_FRACTION : distanceM
    emit(reason)
  }

  function onSample(magnitude, timeMs) {
    if (paused || !started || !pose) return
    const { step, dev } = detector.push(magnitude, timeMs)
    if (mode !== "walk") {
      motion.push({ dev, timeMs })
      const cutoff = timeMs - MOTION_WINDOW_MS
      while (motion.length && motion[0].timeMs < cutoff) motion.shift()
      let energy = 0
      for (const sample of motion) energy += sample.dev * sample.dev
      const rms = motion.length ? Math.sqrt(energy / motion.length) : 0
      const speed = speedMps(rms, mode)
      const dt = lastMotionAt == null ? 0 : (timeMs - lastMotionAt) / 1000
      lastMotionAt = timeMs
      if (dt > 1.2) {
        motion.length = 0
        return
      }
      if (!(dt > 0) || speed === 0) return
      advance(speed * Math.min(dt, 0.25), "move")
      return
    }
    if (!step) return
    const stride = strideMeters(cadenceNow(timeMs), stepLength)
    lastStepAt = timeMs
    pose.steps += 1
    advance(stride, "step")
  }

  function onHeading(degrees, timeMs, tilt) {
    if (paused || !Number.isFinite(degrees)) return
    if (tilt) {
      tiltBeta = Number(tilt.beta) || 0
      tiltGamma = Number(tilt.gamma) || 0
    }
    compassAt = Number.isFinite(timeMs) ? timeMs : performance.now()
    lastGyroAt = compassAt
    heading = smoothHeading(heading, wrap360(degrees))
    if (!pose) return
    pose.headingDeg = heading
    pose.updatedAt = Date.now()
    emit("heading")
  }

  function onTurn(rate, timeMs, tilt) {
    if (paused || !Number.isFinite(timeMs) || heading == null || compassAt < 0) return
    if (tilt) {
      tiltBeta = Number(tilt.beta) || 0
      tiltGamma = Number(tilt.gamma) || 0
    }
    if (timeMs - compassAt > GYRO_BRIDGE_MS) {
      lastGyroAt = timeMs
      return
    }
    const dt = lastGyroAt == null ? 0 : (timeMs - lastGyroAt) / 1000
    lastGyroAt = timeMs
    if (!(dt > 0) || dt > 0.25) return
    const next = wrap360(heading + headingRateDeg(rate, tiltBeta, tiltGamma) * dt)
    const turned = Math.abs(((next - heading + 540) % 360) - 180) > 0.3
    heading = next
    if (!pose) return
    pose.headingDeg = heading
    if (!turned) return
    pose.updatedAt = Date.now()
    emit("heading")
  }

  return {
    setAnchor: resetTo,
    resetTo,
    setStepLength(meters) {
      if (!(meters >= 0.3 && meters <= 1.5)) return
      stepLength = meters
    },
    getStepLength() {
      return stepLength
    },
    setMode(next) {
      if (next !== "walk" && next !== "bicycle" && next !== "car") return
      if (next === mode) return
      mode = next
      clearGait()
    },
    getMode() {
      return mode
    },
    setConstraint(next) {
      constraint = typeof next === "function" ? next : null
    },
    setPaused(next) {
      paused = Boolean(next)
    },
    snap() {
      if (!pose) return
      if (applyConstraint(0)) emit("move")
    },
    hydrate(snapshot) {
      if (!snapshot || !finiteCoord(snapshot.lat, snapshot.lon)) return false
      const steps = Number(snapshot.steps)
      const distanceM = Number(snapshot.distanceM)
      const uncertaintyM = Number(snapshot.uncertaintyM)
      pose = {
        lat: snapshot.lat,
        lon: snapshot.lon,
        headingDeg: null,
        uncertaintyM: Number.isFinite(uncertaintyM) ? Math.max(ANCHOR_UNCERTAINTY_M, uncertaintyM) : ANCHOR_UNCERTAINTY_M,
        steps: Number.isFinite(steps) && steps >= 0 ? steps : 0,
        distanceM: Number.isFinite(distanceM) && distanceM >= 0 ? distanceM : 0,
        updatedAt: Date.now(),
      }
      applyConstraint(0)
      emit("hydrate")
      return true
    },
    async start() {
      await sensors.start()
      if (started) return
      started = true
      unsubs = [sensors.onSample(onSample), sensors.onHeading(onHeading)]
      if (typeof sensors.onTurn === "function") unsubs.push(sensors.onTurn(onTurn))
    },
    stop() {
      started = false
      for (const unsubscribe of unsubs) unsubscribe()
      unsubs = []
      sensors.stop()
    },
    getPose() {
      return pose ? { ...pose } : null
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
