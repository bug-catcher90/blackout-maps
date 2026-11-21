const LAT0 = 36800000
const LON0 = -9800000
const STEP = 5000
const LAT_N = 1090
const LON_N = 750
const UNIT = 10

function pad(bytes) {
  const extra = (4 - (bytes.length % 4)) % 4
  if (!extra) return bytes
  const out = new Uint8Array(bytes.length + extra)
  out.set(bytes)
  return out
}

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function align(offset) {
  return (offset + 3) & ~3
}

function cellOf(lat, lon) {
  const y = Math.floor((lat - LAT0) / STEP)
  const x = Math.floor((lon - LON0) / STEP)
  if (y < 0 || x < 0 || y >= LAT_N || x >= LON_N) return -1
  return y * LON_N + x
}

export function buildBuildingBook(rows) {
  const kept = []
  for (const row of rows) {
    const ring = (row.ring || []).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    if (ring.length < 3) continue
    const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
    if (open.length < 3) continue
    const micro = open.map((point) => [Math.round(point[0] * 1e6), Math.round(point[1] * 1e6)])
    const originLat = micro[0][0]
    const originLon = micro[0][1]
    const deltas = []
    let fit = true
    for (let index = 1; index < micro.length; index += 1) {
      const dLat = Math.round((micro[index][0] - originLat) / UNIT)
      const dLon = Math.round((micro[index][1] - originLon) / UNIT)
      if (dLat < -32768 || dLat > 32767 || dLon < -32768 || dLon > 32767) fit = false
      deltas.push(dLat, dLon)
    }
    if (!fit) continue
    kept.push({ originLat, originLon, deltas, micro })
  }
  const buckets = Array.from({ length: LAT_N * LON_N }, () => [])
  const geomChunks = []
  const geomOff = []
  const geomLen = []
  let geomBytes = 0
  kept.forEach((row, index) => {
    const bytes = [row.deltas.length / 2 + 1, 0]
    for (const value of row.deltas) bytes.push(value & 255, (value >> 8) & 255)
    const chunk = Uint8Array.from(bytes)
    geomOff.push(geomBytes)
    geomLen.push(chunk.length)
    geomChunks.push(chunk)
    geomBytes += chunk.length
    const cells = new Set()
    let minLat = row.originLat
    let maxLat = row.originLat
    let minLon = row.originLon
    let maxLon = row.originLon
    for (const [lat, lon] of row.micro) {
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }
    const y0 = Math.max(0, Math.min(LAT_N - 1, Math.floor((minLat - LAT0) / STEP)))
    const y1 = Math.max(0, Math.min(LAT_N - 1, Math.floor((maxLat - LAT0) / STEP)))
    const x0 = Math.max(0, Math.min(LON_N - 1, Math.floor((minLon - LON0) / STEP)))
    const x1 = Math.max(0, Math.min(LON_N - 1, Math.floor((maxLon - LON0) / STEP)))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) cells.add(y * LON_N + x)
    }
    for (const cell of cells) buckets[cell].push(index)
  })
  const cellIds = []
  const cellHead = [0]
  for (const bucket of buckets) {
    cellIds.push(...bucket)
    cellHead.push(cellIds.length)
  }
  const count = kept.length
  const parts = [new Uint8Array(64)]
  parts.push(new Uint8Array(new Int32Array(kept.map((row) => row.originLat)).buffer))
  parts.push(new Uint8Array(new Int32Array(kept.map((row) => row.originLon)).buffer))
  parts.push(new Uint8Array(new Uint32Array(geomOff).buffer))
  parts.push(pad(new Uint8Array(new Uint16Array(geomLen).buffer)))
  parts.push(pad(concat(geomChunks)))
  parts.push(new Uint8Array(new Uint32Array(cellHead).buffer))
  parts.push(new Uint8Array(new Uint32Array(cellIds).buffer))
  const body = concat(parts)
  const view = new DataView(body.buffer)
  body.set(new TextEncoder().encode("BLD1"), 0)
  view.setUint32(4, 1, true)
  view.setUint32(8, count, true)
  view.setInt32(12, LAT0, true)
  view.setInt32(16, LON0, true)
  view.setUint32(20, LAT_N, true)
  view.setUint32(24, LON_N, true)
  view.setUint32(28, STEP, true)
  view.setUint32(32, LAT_N * LON_N, true)
  view.setUint32(36, geomBytes, true)
  view.setUint32(40, body.length, true)
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
}

export function openBuildingBook(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== "BLD1" || view.getUint32(4, true) !== 1 || view.getUint32(40, true) !== bytes.byteLength) {
    throw new Error("buildings")
  }
  const count = view.getUint32(8, true)
  const cellCount = view.getUint32(32, true)
  const geomBytes = view.getUint32(36, true)
  let offset = 64
  const originLat = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count)
  offset += count * 4
  const originLon = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count)
  offset += count * 4
  const geomOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count)
  offset += count * 4
  const geomLen = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count)
  offset = align(offset + count * 2)
  const geom = bytes.subarray(offset, offset + geomBytes)
  offset = align(offset + geomBytes)
  const cellHead = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellCount + 1)
  offset += (cellCount + 1) * 4
  const cellIds = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellHead[cellCount])
  const book = {
    count,
    originLat,
    originLon,
    geomOff,
    geomLen,
    geom,
    geomView: new DataView(geom.buffer, geom.byteOffset, geom.byteLength),
    cellHead,
    cellIds,
    rings: new Array(count),
    stamp: new Uint32Array(count),
    token: 1,
  }
  book.allows = (lat1, lon1, lat2, lon2) => allowsConnector(book, lat1, lon1, lat2, lon2)
  book.links = (lat1, lon1, lat2, lon2) => allowsLink(book, lat1, lon1, lat2, lon2)
  book.cuts = (lat1, lon1, lat2, lon2) => segmentCuts(book, lat1, lon1, lat2, lon2)
  return book
}

function ringOf(book, id) {
  const cached = book.rings[id]
  if (cached) return cached
  const view = book.geomView
  let offset = book.geomOff[id]
  const n = view.getUint16(offset, true)
  offset += 2
  const ring = new Float64Array(n * 2)
  const lat0 = book.originLat[id]
  const lon0 = book.originLon[id]
  ring[0] = lat0 / 1e6
  ring[1] = lon0 / 1e6
  for (let index = 1; index < n; index += 1) {
    ring[index * 2] = (lat0 + view.getInt16(offset, true) * UNIT) / 1e6
    ring[index * 2 + 1] = (lon0 + view.getInt16(offset + 2, true) * UNIT) / 1e6
    offset += 4
  }
  book.rings[id] = ring
  return ring
}

function pointInside(ring, lat, lon) {
  let inside = false
  const n = ring.length / 2
  let prevLat = ring[(n - 1) * 2]
  let prevLon = ring[(n - 1) * 2 + 1]
  for (let index = 0; index < n; index += 1) {
    const nextLat = ring[index * 2]
    const nextLon = ring[index * 2 + 1]
    if (nextLat > lat !== prevLat > lat && lon < ((prevLon - nextLon) * (lat - nextLat)) / (prevLat - nextLat) + nextLon) {
      inside = !inside
    }
    prevLat = nextLat
    prevLon = nextLon
  }
  return inside
}

function orient(ax, ay, bx, by, cx, cy) {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
}

function segmentsCross(aLat, aLon, bLat, bLon, cLat, cLon, dLat, dLon) {
  const left = orient(aLon, aLat, bLon, bLat, cLon, cLat)
  const right = orient(aLon, aLat, bLon, bLat, dLon, dLat)
  const across = orient(cLon, cLat, dLon, dLat, aLon, aLat)
  const back = orient(cLon, cLat, dLon, dLat, bLon, bLat)
  return left * right < 0 && across * back < 0
}

function ringHitsSegment(ring, lat1, lon1, lat2, lon2) {
  if (pointInside(ring, lat1, lon1) || pointInside(ring, lat2, lon2)) return true
  const n = ring.length / 2
  let prevLat = ring[(n - 1) * 2]
  let prevLon = ring[(n - 1) * 2 + 1]
  for (let index = 0; index < n; index += 1) {
    const nextLat = ring[index * 2]
    const nextLon = ring[index * 2 + 1]
    if (segmentsCross(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon)) return true
    prevLat = nextLat
    prevLon = nextLon
  }
  return false
}

function candidates(book, lat1, lon1, lat2, lon2) {
  const south = Math.min(lat1, lat2)
  const north = Math.max(lat1, lat2)
  const west = Math.min(lon1, lon2)
  const east = Math.max(lon1, lon2)
  const y0 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(south * 1e6) - LAT0) / STEP)))
  const y1 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(north * 1e6) - LAT0) / STEP)))
  const x0 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(west * 1e6) - LON0) / STEP)))
  const x1 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(east * 1e6) - LON0) / STEP)))
  const token = (book.token + 1) >>> 0
  book.token = token === 0 ? 1 : token
  if (token === 0) book.stamp.fill(0)
  const ids = []
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const cell = y * LON_N + x
      for (let index = book.cellHead[cell]; index < book.cellHead[cell + 1]; index += 1) {
        const id = book.cellIds[index]
        if (book.stamp[id] === book.token) continue
        book.stamp[id] = book.token
        ids.push(id)
      }
    }
  }
  return ids
}

function meters(lat1, lon1, lat2, lon2) {
  const scale = Math.cos(((lat1 + lat2) / 2) * 0.017453292519943295)
  return Math.hypot((lat2 - lat1) * 110540, (lon2 - lon1) * scale * 111320)
}

function crossT(lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4) {
  const rx = lon2 - lon1
  const ry = lat2 - lat1
  const sx = lon4 - lon3
  const sy = lat4 - lat3
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-15) return null
  const qpx = lon3 - lon1
  const qpy = lat3 - lat1
  const t = (qpx * sy - qpy * sx) / den
  const u = (qpx * ry - qpy * rx) / den
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null
  if (t < 0) return 0
  if (t > 1) return 1
  return t
}

function exitShare(ring, lat1, lon1, lat2, lon2) {
  const n = ring.length / 2
  let exit = null
  let prevLat = ring[(n - 1) * 2]
  let prevLon = ring[(n - 1) * 2 + 1]
  for (let index = 0; index < n; index += 1) {
    const nextLat = ring[index * 2]
    const nextLon = ring[index * 2 + 1]
    const share = crossT(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon)
    if (share != null) {
      const probe = Math.min(1, share + 1e-4)
      const lat = lat1 + (lat2 - lat1) * probe
      const lon = lon1 + (lon2 - lon1) * probe
      if (!pointInside(ring, lat, lon)) exit = exit == null ? share : Math.max(exit, share)
    }
    prevLat = nextLat
    prevLon = nextLon
  }
  return exit
}

function cutsRing(ring, lat1, lon1, lat2, lon2) {
  const midLat = (lat1 + lat2) / 2
  const midLon = (lon1 + lon2) / 2
  if (pointInside(ring, midLat, midLon)) return true
  const n = ring.length / 2
  let prevLat = ring[(n - 1) * 2]
  let prevLon = ring[(n - 1) * 2 + 1]
  for (let index = 0; index < n; index += 1) {
    const nextLat = ring[index * 2]
    const nextLon = ring[index * 2 + 1]
    if (segmentsCross(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon)) return true
    prevLat = nextLat
    prevLon = nextLon
  }
  return false
}

function segmentCuts(book, lat1, lon1, lat2, lon2) {
  if (meters(lat1, lon1, lat2, lon2) <= 1.5) return false
  for (const id of candidates(book, lat1, lon1, lat2, lon2)) {
    if (cutsRing(ringOf(book, id), lat1, lon1, lat2, lon2)) return true
  }
  return false
}

function allowsLink(book, lat1, lon1, lat2, lon2) {
  const length = meters(lat1, lon1, lat2, lon2)
  if (length <= 1.5) return true
  const ids = candidates(book, lat1, lon1, lat2, lon2)
  let origin = -1
  for (const id of ids) {
    if (!pointInside(ringOf(book, id), lat1, lon1)) continue
    origin = id
    break
  }
  if (origin >= 0) {
    const share = exitShare(ringOf(book, origin), lat1, lon1, lat2, lon2)
    if (share == null) return length <= 40
    if (length * share > 40) return false
    if (length * (1 - share) > 22) return false
    const midLat = lat1 + (lat2 - lat1) * share
    const midLon = lon1 + (lon2 - lon1) * share
    for (const id of ids) {
      if (id === origin) continue
      if (ringHitsSegment(ringOf(book, id), midLat, midLon, lat2, lon2)) return false
    }
    return true
  }
  for (const id of ids) {
    if (cutsRing(ringOf(book, id), lat1, lon1, lat2, lon2)) return false
  }
  return true
}

function allowsConnector(book, lat1, lon1, lat2, lon2) {
  const length = meters(lat1, lon1, lat2, lon2)
  if (length <= 1.5) return true
  const ids = candidates(book, lat1, lon1, lat2, lon2)
  let origin = -1
  for (const id of ids) {
    if (!pointInside(ringOf(book, id), lat1, lon1)) continue
    origin = id
    break
  }
  if (origin >= 0) {
    const share = exitShare(ringOf(book, origin), lat1, lon1, lat2, lon2)
    if (share == null) return length <= 8
    if (length * share > 15) return false
    const midLat = lat1 + (lat2 - lat1) * share
    const midLon = lon1 + (lon2 - lon1) * share
    if (length * (1 - share) > 22) return false
    for (const id of ids) {
      if (id === origin) continue
      if (ringHitsSegment(ringOf(book, id), midLat, midLon, lat2, lon2)) return false
    }
    return true
  }
  if (length > 22) return false
  for (const id of ids) {
    if (ringHitsSegment(ringOf(book, id), lat1, lon1, lat2, lon2)) return false
  }
  return true
}

export function buildingsInView(book, west, south, east, north, limit = 2500) {
  const y0 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(south * 1e6) - LAT0) / STEP)))
  const y1 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(north * 1e6) - LAT0) / STEP)))
  const x0 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(west * 1e6) - LON0) / STEP)))
  const x1 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(east * 1e6) - LON0) / STEP)))
  const token = (book.token + 1) >>> 0
  book.token = token === 0 ? 1 : token
  if (token === 0) book.stamp.fill(0)
  const features = []
  for (let y = y0; y <= y1 && features.length < limit; y += 1) {
    for (let x = x0; x <= x1 && features.length < limit; x += 1) {
      const cell = y * LON_N + x
      for (let index = book.cellHead[cell]; index < book.cellHead[cell + 1] && features.length < limit; index += 1) {
        const id = book.cellIds[index]
        if (book.stamp[id] === book.token) continue
        book.stamp[id] = book.token
        const ring = ringOf(book, id)
        const n = ring.length / 2
        let seen = false
        const coordinates = new Array(n + 1)
        for (let point = 0; point < n; point += 1) {
          const lat = ring[point * 2]
          const lon = ring[point * 2 + 1]
          if (lat >= south && lat <= north && lon >= west && lon <= east) seen = true
          coordinates[point] = [lon, lat]
        }
        coordinates[n] = coordinates[0]
        if (!seen) continue
        features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } })
      }
    }
  }
  return { type: "FeatureCollection", features }
}
