const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"])

export function fold(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
}

export function streetKey(value) {
  return fold(value)
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter((part) => part && !SMALL.has(part))
    .join(" ")
}

function byKey(a, b) {
  if (a.key < b.key) return -1
  if (a.key > b.key) return 1
  return (a.rank ?? 9) - (b.rank ?? 9)
}

export function preparePlaces(rows) {
  return rows
    .map((row) => ({ name: row[0], lat: row[1], lon: row[2], rank: row[3] ?? 4, key: fold(row[0]) }))
    .sort(byKey)
}

export function prepareStreets(rows) {
  return rows
    .map((row) => ({ name: row[0], lat: row[1], lon: row[2], rank: 5, key: fold(row[0]) }))
    .sort(byKey)
}

function lowerBound(items, query) {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].key < query) lo = mid + 1
    else hi = mid
  }
  return lo
}

const WORD_BREAK = /[\s,.;:'’"()\/&+-]+/

function words(text) {
  return text.split(WORD_BREAK).filter(Boolean)
}

// Lower is better: the exact name, then names that start with the query or contain every query
// word whole, then names where every query word starts a word, then names that only contain the query words, then anything else
// (an address the address index matched on its own key).
const TIER = { exact: 0, prefix: 0.4, words: 1, inside: 1.6, other: 2 }

export function matchTier(name, query) {
  const nameWords = words(fold(name || ""))
  const queryWords = words(fold(query || ""))
  if (!nameWords.length || !queryWords.length) return TIER.other
  const n = nameWords.join(" ")
  const q = queryWords.join(" ")
  if (n === q) return TIER.exact
  if (n.startsWith(q) || queryWords.every((part) => nameWords.includes(part))) return TIER.prefix
  if (queryWords.every((part) => nameWords.some((word) => word.startsWith(part)))) return TIER.words
  if (queryWords.every((part) => n.includes(part))) return TIER.inside
  return TIER.other
}

function kmBetween(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = p2 - p1
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Distance adds log10(1 + km): an exact name 1 km away beats a name that merely starts with the
// query 300 m away, but "Tesco Express" 400 m away beats "Tesco" 3 km away.
export function resultScore(item, query, origin) {
  let tier = matchTier(item.name, query)
  const comma = item.name ? item.name.indexOf(", ") : -1
  if (comma > 0) tier = Math.min(tier, matchTier(item.name.slice(0, comma), query))
  if (typeof item.city === "string") tier = Math.min(tier, TIER.words)
  if (!origin || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return tier
  return tier + Math.log10(1 + kmBetween(origin.lat, origin.lon, item.lat, item.lon))
}

export function rankResults(items, query, origin, limit = 12) {
  const scored = items.map((item, index) => ({ item, index, score: resultScore(item, query, origin) }))
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.item.rank ?? 9) - (b.item.rank ?? 9) ||
      (a.item.name || "").length - (b.item.name || "").length ||
      a.index - b.index,
  )
  const kept = []
  for (const { item } of scored) {
    const key = fold(item.name || "")
    const twin = kept.some(
      (other) =>
        fold(other.name || "") === key &&
        Number.isFinite(item.lat) &&
        Number.isFinite(other.lat) &&
        kmBetween(item.lat, item.lon, other.lat, other.lon) < 0.3,
    )
    if (twin) continue
    kept.push(item)
    if (kept.length >= limit) break
  }
  return kept
}

export function searchNames(items, query, limit) {
  const q = fold(query)
  if (q.length < 2) return []
  const start = lowerBound(items, q)
  const pool = []
  for (let i = start; i < items.length && pool.length < 40; i += 1) {
    if (!items[i].key.startsWith(q)) break
    pool.push(items[i])
  }
  pool.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
  return pool.slice(0, limit)
}
