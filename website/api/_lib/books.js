const fs = require("fs")
const path = require("path")

const SITE = "https://blackout-maps.vercel.app"

const BOOKS = {
  "power-in-a-blackout": {
    slug: "power-in-a-blackout",
    priceId: "price_1UeifnAONDEQ32BLCqLCpZID",
    unitAmount: 1986,
    currency: "eur",
    downloadName: "Power-in-a-Blackout.pdf",
    file: "power-in-a-blackout.pdf",
  },
  "when-the-tap-runs-dry": {
    slug: "when-the-tap-runs-dry",
    priceId: "price_1UeifoAONDEQ32BLElpaVKsc",
    unitAmount: 1432,
    currency: "eur",
    downloadName: "When-the-Tap-Runs-Dry.pdf",
    file: "when-the-tap-runs-dry.pdf",
  },
}

function bookBySlug(slug) {
  return Object.prototype.hasOwnProperty.call(BOOKS, slug) ? BOOKS[slug] : null
}

function liveStripe() {
  const key = process.env.STRIPE_SECRET_KEY || ""
  if (!/^(sk|rk)_live_/.test(key)) return null
  const Stripe = require("stripe")
  return new Stripe(key, { apiVersion: "2026-09-30.endive" })
}

function priceIdOf(item) {
  const price = item && item.price
  if (typeof price === "string") return price
  if (price && price.id) return price.id
  const details = item && item.pricing && item.pricing.price_details
  return details && details.price ? details.price : ""
}

function unitAmountOf(item) {
  const price = item && item.price
  if (price && typeof price === "object" && typeof price.unit_amount === "number") return price.unit_amount
  const decimal = item && item.pricing && item.pricing.unit_amount_decimal
  if (decimal == null || decimal === "") return null
  const amount = Number(decimal)
  return Number.isFinite(amount) ? amount : null
}

function paidBook(session) {
  if (!session || session.status !== "complete" || session.payment_status !== "paid") return null
  const items = session.line_items && session.line_items.data
  if (!Array.isArray(items) || items.length !== 1) return null
  const item = items[0]
  if (Number(item.quantity) !== 1) return null
  const book = Object.values(BOOKS).find(function (entry) { return entry.priceId === priceIdOf(item) })
  if (!book) return null
  const amount = unitAmountOf(item)
  if (amount != null && amount !== book.unitAmount) return null
  const currency = (item.price && item.price.currency) || item.currency
  if (currency && currency !== book.currency) return null
  const guide = session.metadata && session.metadata.guide
  if (guide && guide !== book.slug) return null
  if (session.client_reference_id && session.client_reference_id !== book.slug) return null
  return book
}

function guideFile(book) {
  const root = path.join(process.cwd(), "api", "_files")
  const file = path.join(root, book.file)
  if (path.dirname(file) !== root) return null
  return fs.existsSync(file) ? file : null
}

function readGuide(book) {
  const file = guideFile(book)
  if (!file) return null
  return fs.readFileSync(file)
}

module.exports = { SITE, BOOKS, bookBySlug, liveStripe, paidBook, readGuide }
