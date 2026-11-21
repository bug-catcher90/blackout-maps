const FILE_NAME = "portugal.pmtiles"
const MARK_KEY = "posicao-map"
const MAP_URL =
  "https://raw.githubusercontent.com/FCVeiga/tender-town/cbcfeeb/offline-gps/public/portugal.pmtiles"
const ADDRESS_FILE = "addresses.bin"
const ADDRESS_MARK = "posicao-addresses"
export const ADDRESS_URL =
  "https://raw.githubusercontent.com/FCVeiga/tender-town/dd724c5e006463f0319f7ec07eee82bf82ad2972/offline-gps/data/addresses.bin.gz"
export const ADDRESS_BYTES = 48597530
const ROAD_FILE = "roads.bin"
const ROAD_MARK = "posicao-roads"
export const ROAD_URL =
  "https://raw.githubusercontent.com/FCVeiga/tender-town/0e25860786b339919118a89695ba4cbb1b49bef7/offline-gps/data/roads.bin.gz"
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
  "https://raw.githubusercontent.com/FCVeiga/tender-town/5fbb0b5d98cbe0b4173bc3011bb0b052b8ce7703/offline-gps/data/buildings.bin.gz"
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
