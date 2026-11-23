const fs = require("fs")
const path = require("path")

const SITE = "https://blackout-maps.vercel.app"

// Live Neonancestry prices. tax_behavior is inclusive. Amounts are euro cents.
// The water guide's Stripe product id stays when-the-tap-runs-dry.
const BOOKS = [
  {
    slug: "power-in-a-blackout",
    title: "Power in a Blackout",
    priceId: "price_1Uf0yVAONDEQ32BLwjElFnVL",
    unitAmount: 980,
    currency: "eur",
    downloadName: "Power-in-a-Blackout.pdf",
    file: "01-power-in-a-blackout.pdf",
  },
  {
    slug: "water-when-the-tap-stops",
    title: "Water When the Tap Stops",
    priceId: "price_1Uf0ypAONDEQ32BLGDfW6jkr",
    unitAmount: 780,
    currency: "eur",
    downloadName: "Water-When-the-Tap-Stops.pdf",
    file: "02-water-when-the-tap-stops.pdf",
  },
  {
    slug: "food-without-power",
    title: "Food Without Power",
    priceId: "price_1Uf0ypAONDEQ32BLyIFJXFJR",
    unitAmount: 740,
    currency: "eur",
    downloadName: "Food-Without-Power.pdf",
    file: "03-food-without-power.pdf",
  },
  {
    slug: "the-go-bag-and-leaving-home",
    title: "The Go-Bag and Leaving Home",
    priceId: "price_1Uf0yqAONDEQ32BLX6D7AOpZ",
    unitAmount: 780,
    currency: "eur",
    downloadName: "The-Go-Bag-and-Leaving-Home.pdf",
    file: "04-the-go-bag-and-leaving-home.pdf",
  },
  {
    slug: "first-aid-when-help-is-slow",
    title: "First Aid When Help Is Slow",
    priceId: "price_1Uf0yrAONDEQ32BL0Uh8r50a",
    unitAmount: 940,
    currency: "eur",
    downloadName: "First-Aid-When-Help-Is-Slow.pdf",
    file: "05-first-aid-when-help-is-slow.pdf",
  },
  {
    slug: "staying-informed-and-in-touch",
    title: "Staying Informed and in Touch",
    priceId: "price_1Uf0yrAONDEQ32BL6LuaQyPS",
    unitAmount: 820,
    currency: "eur",
    downloadName: "Staying-Informed-and-in-Touch.pdf",
    file: "06-staying-informed-and-in-touch.pdf",
  },
  {
    slug: "fire-gas-and-a-safe-home",
    title: "Fire, Gas and a Safe Home",
    priceId: "price_1Uf0ysAONDEQ32BLbdDpUL0w",
    unitAmount: 700,
    currency: "eur",
    downloadName: "Fire-Gas-and-a-Safe-Home.pdf",
    file: "07-fire-gas-and-a-safe-home.pdf",
  },
  {
    slug: "warm-cool-and-sheltered",
    title: "Warm, Cool and Sheltered",
    priceId: "price_1Uf0ysAONDEQ32BLAZzrwTBy",
    unitAmount: 740,
    currency: "eur",
    downloadName: "Warm-Cool-and-Sheltered.pdf",
    file: "08-warm-cool-and-sheltered.pdf",
  },
]

function bookBySlug(slug) {
  return BOOKS.find(function (book) { return book.slug === slug }) || null
}

function bookByPrice(priceId) {
  return BOOKS.find(function (book) { return book.priceId === priceId }) || null
}

function booksFromSlugs(slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > BOOKS.length) return null
  const seen = new Set()
  for (const slug of slugs) {
    if (typeof slug !== "string" || !bookBySlug(slug) || seen.has(slug)) return null
    seen.add(slug)
  }
  return BOOKS.filter(function (book) { return seen.has(book.slug) })
}

function discountPercent(count) {
  if (count === BOOKS.length) return 50
  if (count >= 3) return 15
  return 0
}

function quote(books) {
  const percent = discountPercent(books.length)
  const subtotal = books.reduce(function (sum, book) { return sum + book.unitAmount }, 0)
  const discount = books.reduce(function (sum, book) {
    return sum + Math.round(book.unitAmount * percent / 100)
  }, 0)
  return { percent: percent, subtotal: subtotal, discount: discount, total: subtotal - discount }
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

function paidBooks(session) {
  if (!session || session.status !== "complete" || session.payment_status !== "paid") return null
  const items = session.line_items && session.line_items.data
  if (!Array.isArray(items) || items.length === 0 || items.length > BOOKS.length) return null
  if (session.line_items.has_more) return null
  const books = []
  const seen = new Set()
  for (const item of items) {
    if (Number(item.quantity) !== 1) return null
    const book = bookByPrice(priceIdOf(item))
    if (!book || seen.has(book.slug)) return null
    const amount = unitAmountOf(item)
    if (amount != null && amount !== book.unitAmount) return null
    const currency = (item.price && item.price.currency) || item.currency
    if (currency && currency !== book.currency) return null
    seen.add(book.slug)
    books.push(book)
  }
  books.sort(function (a, b) {
    return BOOKS.findIndex(function (book) { return book.slug === a.slug }) - BOOKS.findIndex(function (book) { return book.slug === b.slug })
  })
  const priced = quote(books)
  const details = session.total_details || {}
  if (session.amount_subtotal !== priced.subtotal) return null
  if (details.amount_discount !== priced.discount) return null
  if ((details.amount_shipping || 0) !== 0) return null
  if (session.amount_total !== priced.total) return null
  const guides = session.metadata && session.metadata.guides
  if (!guides || guides !== books.map(function (book) { return book.slug }).join(",")) return null
  const ref = session.client_reference_id || ""
  if (books.length === 1) {
    if (ref && ref !== books[0].slug) return null
  } else if (ref !== "cart") {
    return null
  }
  return books
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

module.exports = {
  SITE,
  BOOKS,
  bookBySlug,
  booksFromSlugs,
  quote,
  liveStripe,
  paidBooks,
  readGuide,
}
