const crypto = require("crypto")
const { get, head, put } = require("@vercel/blob")
const { PLAY_OPT_IN, normalizeEmail, emailPath } = require("./_lib/beta")

const LIMIT_PER_HOUR = 5
const MAX_BODY = 2048

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()
  return forwarded || String(req.headers["x-real-ip"] || "") || "unknown"
}

async function readCount(pathname) {
  try {
    const result = await get(pathname, { access: "private", useCache: false })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const text = await new Response(result.stream).text()
    const count = Number.parseInt(text, 10)
    return { count: Number.isFinite(count) ? count : 0, etag: result.blob.etag }
  } catch (error) {
    if (error && error.name === "BlobNotFoundError") return null
    throw error
  }
}

// Per-IP hourly counter in Blob, written with ETag checks so parallel requests can't skip it.
async function allowRequest(ip) {
  const hour = Math.floor(Date.now() / 3600000)
  const key = crypto.createHash("sha256").update("beta-rl:" + ip).digest("hex").slice(0, 32)
  const pathname = "beta-ratelimit/" + hour + "/" + key + ".txt"
  const options = { access: "private", contentType: "text/plain", ttlDays: 1, addRandomSuffix: false }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readCount(pathname)
    try {
      if (!current) {
        await put(pathname, "1", Object.assign({ allowOverwrite: false }, options))
        return true
      }
      if (current.count >= LIMIT_PER_HOUR) return false
      await put(pathname, String(current.count + 1), Object.assign({ ifMatch: current.etag }, options))
      return true
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
  return false
}

async function storeEmail(email) {
  const pathname = emailPath(email)
  const body = JSON.stringify({ email, signedUpAt: new Date().toISOString() })
  try {
    await put(pathname, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    })
  } catch (error) {
    const existing = await head(pathname).catch(function () { return null })
    if (!existing) throw error
  }
}

function readBody(req) {
  let body = req.body
  if (typeof body === "string") {
    if (body.length > MAX_BODY) return null
    try { body = JSON.parse(body) } catch (error) { return null }
  }
  return body && typeof body === "object" ? body : null
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store")
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "method_not_allowed" })
    return
  }
  const contentLength = Number(req.headers["content-length"] || 0)
  if (contentLength > MAX_BODY) {
    res.status(413).json({ error: "too_large" })
    return
  }
  const body = readBody(req)
  if (!body) {
    res.status(400).json({ error: "invalid_email" })
    return
  }

  // Honeypot: people never see this field, bots fill it. Look successful, store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    res.status(200).json({ ok: true, optInUrl: PLAY_OPT_IN })
    return
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    res.status(400).json({ error: "invalid_email" })
    return
  }

  try {
    if (!(await allowRequest(clientIp(req)))) {
      res.setHeader("Retry-After", "3600")
      res.status(429).json({ error: "rate_limited" })
      return
    }
    await storeEmail(email)
  } catch (error) {
    console.error("beta-signup failed", error && error.name)
    res.status(503).json({ error: "unavailable" })
    return
  }

  res.status(200).json({ ok: true, optInUrl: PLAY_OPT_IN })
}
