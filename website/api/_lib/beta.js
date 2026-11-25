const crypto = require("crypto")

// Each signup is its own private blob, so a second put of the same address is the dedupe.
const PREFIX = "beta/"
const PLAY_OPT_IN = "https://play.google.com/apps/testing/app.blackoutmaps"

function normalizeEmail(value) {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length < 6 || email.length > 254) return null
  // A leading = + or - would run as a formula when the CSV is opened in a spreadsheet.
  if (/^[=+-]/.test(email)) return null
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null
  if (email.split("@")[0].length > 64) return null
  return email
}

function emailPath(email) {
  return PREFIX + Buffer.from(email, "utf8").toString("base64url") + ".json"
}

function emailFromPath(pathname) {
  const match = /^beta\/([A-Za-z0-9_-]+)\.json$/.exec(pathname)
  if (!match) return null
  return normalizeEmail(Buffer.from(match[1], "base64url").toString("utf8"))
}

function sameSecret(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || !expected) return false
  const a = crypto.createHash("sha256").update(given).digest()
  const b = crypto.createHash("sha256").update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

module.exports = { PREFIX, PLAY_OPT_IN, normalizeEmail, emailPath, emailFromPath, sameSecret }
