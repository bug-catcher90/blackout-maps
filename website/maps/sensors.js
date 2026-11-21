function normalize(degrees) {
  return ((degrees % 360) + 360) % 360
}

export async function requestSensorPermission() {
  const pending = []
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    pending.push(DeviceMotionEvent.requestPermission())
  }
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    pending.push(DeviceOrientationEvent.requestPermission())
  }
  if (pending.length === 0) return
  const results = await Promise.all(pending)
  if (results.some((result) => result !== "granted")) {
    const error = new Error("denied")
    error.code = "denied"
    throw error
  }
}

function headingFrom(event) {
  if (typeof event.webkitCompassHeading === "number" && Number.isFinite(event.webkitCompassHeading)) {
    return normalize(event.webkitCompassHeading)
  }
  if (event.absolute === true && typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return normalize(360 - event.alpha)
  }
  return null
}

function tiltFrom(event) {
  return {
    beta: Number.isFinite(event?.beta) ? event.beta : 0,
    gamma: Number.isFinite(event?.gamma) ? event.gamma : 0,
  }
}

export function createBrowserSensors() {
  const sampleListeners = new Set()
  const headingListeners = new Set()
  const turnListeners = new Set()
  let tilt = { beta: 0, gamma: 0 }
  let listening = false

  function onMotion(event) {
    const timeMs = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()
    const acceleration = event.accelerationIncludingGravity
    if (acceleration && acceleration.x != null && acceleration.y != null && acceleration.z != null) {
      const magnitude = Math.hypot(acceleration.x, acceleration.y, acceleration.z)
      if (Number.isFinite(magnitude)) {
        for (const listener of sampleListeners) listener(magnitude, timeMs)
      }
    }
    const rate = event.rotationRate
    if (!rate || (rate.alpha == null && rate.beta == null && rate.gamma == null)) return
    for (const listener of turnListeners) listener(rate, timeMs, tilt)
  }

  function onOrientation(event) {
    tilt = tiltFrom(event)
    const heading = headingFrom(event)
    if (heading == null) return
    const timeMs = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()
    for (const listener of headingListeners) listener(heading, timeMs, tilt)
  }

  return {
    async start() {
      await requestSensorPermission()
      if (listening) return
      window.addEventListener("devicemotion", onMotion)
      window.addEventListener("deviceorientationabsolute", onOrientation)
      window.addEventListener("deviceorientation", onOrientation)
      listening = true
    },
    stop() {
      if (!listening) return
      window.removeEventListener("devicemotion", onMotion)
      window.removeEventListener("deviceorientationabsolute", onOrientation)
      window.removeEventListener("deviceorientation", onOrientation)
      listening = false
    },
    onSample(listener) {
      sampleListeners.add(listener)
      return () => sampleListeners.delete(listener)
    },
    onHeading(listener) {
      headingListeners.add(listener)
      return () => headingListeners.delete(listener)
    },
    onTurn(listener) {
      turnListeners.add(listener)
      return () => turnListeners.delete(listener)
    },
  }
}
