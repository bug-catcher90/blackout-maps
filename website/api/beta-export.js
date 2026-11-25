const { del, head, list } = require("@vercel/blob")
const { PREFIX, emailFromPath, emailPath, normalizeEmail, sameSecret } = require("./_lib/beta")

function param(req, name) {
  const raw = req.query && req.query[name]
  return Array.isArray(raw) ? String(raw[0] || "") : String(raw || "")
}

function tokenFrom(req) {
  const auth = String(req.headers.authorization || "")
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim()
  return param(req, "token")
}

async function removeEmail(req, res) {
  const email = normalizeEmail(param(req, "email"))
  if (!email) {
    res.status(400).json({ error: "invalid_email" })
    return
  }
  const pathname = emailPath(email)
  const existing = await head(pathname).catch(function () { return null })
  if (!existing) {
    res.status(404).json({ error: "not_found" })
    return
  }
  await del(existing.url)
  res.status(200).json({ ok: true, removed: email })
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Robots-Tag", "noindex")
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, DELETE")
    res.status(405).json({ error: "method_not_allowed" })
    return
  }
  if (!sameSecret(tokenFrom(req), process.env.BETA_EXPORT_TOKEN)) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  if (req.method === "DELETE") {
    try {
      await removeEmail(req, res)
    } catch (error) {
      res.status(503).json({ error: "unavailable" })
    }
    return
  }

  const rows = []
  try {
    let cursor
    do {
      const page = await list({ prefix: PREFIX, limit: 1000, cursor })
      for (const blob of page.blobs) {
        const email = emailFromPath(blob.pathname)
        if (email) rows.push({ email, signedUpAt: new Date(blob.uploadedAt).toISOString() })
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  } catch (error) {
    res.status(503).json({ error: "unavailable" })
    return
  }
  rows.sort(function (a, b) { return a.signedUpAt < b.signedUpAt ? -1 : 1 })

  const lines = param(req, "only") === "emails"
    ? rows.map(function (row) { return row.email })
    : ["email,signed_up_at"].concat(rows.map(function (row) { return row.email + "," + row.signedUpAt }))
  const date = new Date().toISOString().slice(0, 10)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", 'attachment; filename="android-beta-' + date + '.csv"')
  res.status(200).send(lines.join("\n") + "\n")
}
