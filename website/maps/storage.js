const REPO_RAW = "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/"
const FILE_NAME = "portugal.pmtiles"
const MARK_KEY = "posicao-map"
const MAP_URL =
  `${REPO_RAW}ios/BlackoutMaps/Resources/base/portugal.pmtiles`
const ADDRESS_FILE = "addresses.bin"
const ADDRESS_MARK = "posicao-addresses"
export const ADDRESS_URL =
  `${REPO_RAW}catalog/portugal/addresses.bin.gz`
export const ADDRESS_BYTES = 48597530
const ROAD_FILE = "roads.bin"
const ROAD_MARK = "posicao-roads"
export const ROAD_URL =
  `${REPO_RAW}ios/BlackoutMaps/Resources/base/roads.bin.gz`
export const ROAD_BYTES = 170238576
const PLACE_FILE = "places.bin"
const PLACE_MARK = "posicao-places"
export const PLACE_URL = "/maps/places.bin.gz"
export const PLACE_BYTES = 2167140
const WATER_FILE = "water.bin"
const WATER_MARK = "posicao-water"
export const WATER_URL = "/maps/water.bin.gz"
export const WATER_BYTES = 909560
const BUILDING_FILE = "buildings.bin"
const BUILDING_MARK = "posicao-buildings"
export const BUILDING_URL =
  `${REPO_RAW}ios/BlackoutMaps/Resources/base/buildings.bin.gz`
export const BUILDING_BYTES = 79915812

function readMark() {
  try {
    return JSON.parse(localStorage.getItem(MARK_KEY) || "null")
  } catch {
    return null
  }
}

function writeMark(size) {
  localStorage.setItem(MARK_KEY, JSON.stringify({ size, complete: true }))
}

async function existingFile(root) {
  try {
    const handle = await root.getFileHandle(FILE_NAME)
    const file = await handle.getFile()
    return file
  } catch {
    return null
  }
}

async function serverSize() {
  const response = await fetch(MAP_URL, { method: "HEAD", cache: "no-store" })
  if (!response.ok) throw new Error("map")
  return Number(response.headers.get("content-length") || 0)
}

export async function loadMapFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await existingFile(root)
  const mark = readMark()
  if (saved && mark?.complete && mark.size === saved.size && saved.size > 0) {
    if (navigator.onLine === false) return saved
    try {
      const remote = await serverSize()
      if (!remote || remote === saved.size) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(MAP_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const length = Number(response.headers.get("content-length") || 0)
  const handle = await root.getFileHandle(FILE_NAME, { create: true })
  const writable = await handle.createWritable()
  const reader = response.body.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, length)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (length && file.size !== length) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  writeMark(file.size)
  if (navigator.storage?.persist) {
    try {
      await navigator.storage.persist()
    } catch {
      /* best effort */
    }
  }
  return file
}

function readAddressMark() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_MARK) || "null")
  } catch {
    return null
  }
}

async function addressFile(root) {
  try {
    const handle = await root.getFileHandle(ADDRESS_FILE)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function loadAddressFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await addressFile(root)
  const mark = readAddressMark()
  if (saved && mark?.complete && saved.size === ADDRESS_BYTES && mark.size === ADDRESS_BYTES) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(ADDRESS_URL, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(ADDRESS_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await root.getFileHandle(ADDRESS_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, ADDRESS_BYTES)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (file.size !== ADDRESS_BYTES) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(ADDRESS_MARK, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}

function readRoadMark() {
  try {
    return JSON.parse(localStorage.getItem(ROAD_MARK) || "null")
  } catch {
    return null
  }
}

async function roadFile(root) {
  try {
    const handle = await root.getFileHandle(ROAD_FILE)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function loadRoadFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await roadFile(root)
  const mark = readRoadMark()
  if (saved && mark?.complete && saved.size === ROAD_BYTES && mark.size === ROAD_BYTES && ROAD_BYTES > 0) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(ROAD_URL, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(ROAD_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await root.getFileHandle(ROAD_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, ROAD_BYTES)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (ROAD_BYTES && file.size !== ROAD_BYTES) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(ROAD_MARK, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}

function readPlaceMark() {
  try {
    return JSON.parse(localStorage.getItem(PLACE_MARK) || "null")
  } catch {
    return null
  }
}

async function placeFile(root) {
  try {
    const handle = await root.getFileHandle(PLACE_FILE)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function loadPlaceFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await placeFile(root)
  const mark = readPlaceMark()
  if (saved && mark?.complete && saved.size === PLACE_BYTES && mark.size === PLACE_BYTES && PLACE_BYTES > 0) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(PLACE_URL, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(PLACE_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await root.getFileHandle(PLACE_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, PLACE_BYTES)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (PLACE_BYTES && file.size !== PLACE_BYTES) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(PLACE_MARK, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}

function readWaterMark() {
  try {
    return JSON.parse(localStorage.getItem(WATER_MARK) || "null")
  } catch {
    return null
  }
}

async function waterFile(root) {
  try {
    const handle = await root.getFileHandle(WATER_FILE)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function loadWaterFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await waterFile(root)
  const mark = readWaterMark()
  if (saved && mark?.complete && saved.size === WATER_BYTES && mark.size === WATER_BYTES && WATER_BYTES > 0) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(WATER_URL, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(WATER_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await root.getFileHandle(WATER_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, WATER_BYTES)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (WATER_BYTES && file.size !== WATER_BYTES) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(WATER_MARK, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}

function readBuildingMark() {
  try {
    return JSON.parse(localStorage.getItem(BUILDING_MARK) || "null")
  } catch {
    return null
  }
}

async function buildingFile(root) {
  try {
    const handle = await root.getFileHandle(BUILDING_FILE)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function loadBuildingFile(onProgress) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const saved = await buildingFile(root)
  const mark = readBuildingMark()
  if (saved && mark?.complete && saved.size === BUILDING_BYTES && mark.size === BUILDING_BYTES && BUILDING_BYTES > 0) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(BUILDING_URL, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(BUILDING_URL, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await root.getFileHandle(BUILDING_FILE, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, BUILDING_BYTES)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (BUILDING_BYTES && file.size !== BUILDING_BYTES) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(BUILDING_MARK, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}

const CATALOG_URL = "https://api.github.com/repos/bug-catcher90/blackout-maps/contents/catalog"

export function packFiles(pack) {
  return Array.isArray(pack?.assets) ? pack.assets : pack?.files || []
}

function listedPackage(pack) {
  if (!pack || typeof pack.id !== "string" || !pack.name || !pack.flag) return false
  const keys = new Set(packFiles(pack).map((file) => file && file.key))
  return keys.has("water") && keys.has("addresses")
}

export async function loadCatalog() {
  const response = await fetch(CATALOG_URL, { headers: { Accept: "application/vnd.github+json" } })
  if (!response.ok) throw new Error("catalog")
  const entries = await response.json()
  if (!Array.isArray(entries)) throw new Error("catalog")
  const files = entries.filter((entry) => entry && entry.type === "file" && String(entry.name || "").endsWith(".json") && entry.download_url)
  const packs = await Promise.all(files.map(async (entry) => {
    try {
      const file = await fetch(entry.download_url)
      if (!file.ok) return null
      const pack = await file.json()
      return listedPackage(pack) ? pack : null
    } catch {
      return null
    }
  }))
  return packs.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

async function packageDir(id) {
  if (!navigator.storage?.getDirectory) {
    const error = new Error("opfs")
    error.code = "opfs"
    throw error
  }
  const root = await navigator.storage.getDirectory()
  const maps = await root.getDirectoryHandle("packages", { create: true })
  return maps.getDirectoryHandle(id, { create: true })
}

function readPackMark(id, key) {
  try {
    return JSON.parse(localStorage.getItem(`blackout-${id}-${key}`) || "null")
  } catch {
    return null
  }
}

function failure(code) {
  const error = new Error(code)
  error.code = code
  return error
}

async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function savedFile(dir, name) {
  try {
    return await (await dir.getFileHandle(name)).getFile()
  } catch {
    return null
  }
}

// Downloads one part into <file>.<NNN>.part, resuming a partial download with a
// Range request, and checks it against the part's SHA-256.
async function fetchPart(dir, name, part, onBytes) {
  const markKey = `blackout-part-${part.sha256}`
  let saved = await savedFile(dir, name)
  if (saved && saved.size === part.bytes && localStorage.getItem(markKey) === name) return saved
  if (saved && saved.size === part.bytes && (await sha256Hex(saved)) === part.sha256) {
    localStorage.setItem(markKey, name)
    return saved
  }
  const offset = saved && saved.size < part.bytes ? saved.size : 0
  let response
  try {
    response = await fetch(part.url, { cache: "no-store", headers: offset ? { Range: `bytes=${offset}-` } : {} })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) throw failure("download")
  const resumed = offset > 0 && response.status === 206
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable({ keepExistingData: resumed })
  if (resumed) await writable.seek(offset)
  else await writable.truncate(0)
  onBytes(resumed ? offset : 0)
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      onBytes(value.byteLength)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.close()
    } catch {
      /* keep what was written for the next attempt */
    }
    throw error
  }
  saved = await handle.getFile()
  if (saved.size !== part.bytes || (await sha256Hex(saved)) !== part.sha256) {
    await dir.removeEntry(name).catch(() => {})
    throw failure("checksum")
  }
  localStorage.setItem(markKey, name)
  return saved
}

function concatenated(files) {
  let index = 0
  let reader = null
  return new ReadableStream({
    async pull(controller) {
      while (index < files.length) {
        reader ||= files[index].stream().getReader()
        const { done, value } = await reader.read()
        if (!done) {
          controller.enqueue(value)
          return
        }
        reader = null
        index += 1
      }
      controller.close()
    },
  })
}

// A file split into parts (docs/country-maps.md): every part is checked
// against its SHA-256, then the parts are joined and unpacked into spec.file.
async function loadPartedFile(packageId, spec, onProgress) {
  const dir = await packageDir(packageId)
  const markKey = `blackout-${packageId}-${spec.key}`
  const saved = await savedFile(dir, spec.file)
  const mark = readPackMark(packageId, spec.key)
  if (saved && mark?.complete && mark.sha256 === spec.sha256 && saved.size === spec.bytes) return saved

  const total = spec.parts.reduce((sum, part) => sum + part.bytes, 0)
  const done = new Array(spec.parts.length).fill(0)
  const files = []
  for (let i = 0; i < spec.parts.length; i += 1) {
    const name = `${spec.file}.${String(i).padStart(3, "0")}.part`
    files.push(await fetchPart(dir, name, spec.parts[i], (bytes) => {
      done[i] = bytes === 0 ? 0 : done[i] + bytes
      onProgress?.(done.reduce((sum, value) => sum + value, 0), total)
    }))
    done[i] = spec.parts[i].bytes
  }

  localStorage.removeItem(markKey)
  const stream = spec.gzip === false ? concatenated(files) : concatenated(files).pipeThrough(new DecompressionStream("gzip"))
  const handle = await dir.getFileHandle(spec.file, { create: true })
  const writable = await handle.createWritable()
  try {
    await stream.pipeTo(writable)
  } catch (error) {
    throw failure(error?.code || "unpack")
  }
  const file = await handle.getFile()
  if (file.size !== spec.bytes) throw failure("short")
  localStorage.setItem(markKey, JSON.stringify({ size: file.size, sha256: spec.sha256, complete: true }))
  for (let i = 0; i < spec.parts.length; i += 1) {
    localStorage.removeItem(`blackout-part-${spec.parts[i].sha256}`)
    await dir.removeEntry(`${spec.file}.${String(i).padStart(3, "0")}.part`).catch(() => {})
  }
  return file
}

export async function loadPackFile(packageId, spec, onProgress) {
  if (Array.isArray(spec.parts) && spec.parts.length) return loadPartedFile(packageId, spec, onProgress)
  const bytes = Number(spec.bytes) || 0
  const dir = await packageDir(packageId)
  let saved = null
  try {
    saved = await (await dir.getFileHandle(spec.file)).getFile()
  } catch {
    saved = null
  }
  const mark = readPackMark(packageId, spec.key)
  const sized = !bytes || (saved && saved.size === bytes && mark?.size === bytes)
  if (saved && mark?.complete && sized) {
    if (navigator.onLine === false) return saved
    try {
      const head = await fetch(spec.url, { method: "HEAD", cache: "no-store" })
      const gzipSize = Number(head.headers.get("content-length") || 0)
      if (!head.ok || !gzipSize || gzipSize === mark.gzipSize) return saved
    } catch {
      return saved
    }
  }

  let response
  try {
    response = await fetch(spec.url, { cache: "no-store" })
  } catch (error) {
    error.code = "offline"
    throw error
  }
  if (!response.ok || !response.body) {
    const error = new Error("download")
    error.code = "download"
    throw error
  }
  const gzipSize = Number(response.headers.get("content-length") || 0)
  const stream = spec.gzip === false ? response.body : response.body.pipeThrough(new DecompressionStream("gzip"))
  const handle = await dir.getFileHandle(spec.file, { create: true })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let got = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      got += value.byteLength
      onProgress?.(got, bytes)
    }
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      /* already closed */
    }
    throw error
  }
  const file = await handle.getFile()
  if (bytes && file.size !== bytes) {
    const error = new Error("short")
    error.code = "short"
    throw error
  }
  localStorage.setItem(`blackout-${packageId}-${spec.key}`, JSON.stringify({ size: file.size, gzipSize, complete: true }))
  return file
}
