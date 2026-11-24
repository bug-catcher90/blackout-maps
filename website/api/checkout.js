const { SITE, booksFromSlugs, quote, liveStripe } = require("./_lib/books")

function allowedHost(req) {
  const origin = req.headers.origin
  if (!origin) return false
  let host
  try {
    host = new URL(origin).host
  } catch (error) {
    return false
  }
  return host === "blackoutmaps.com" || host === req.headers.host
}

function readBody(req) {
  const body = req.body
  if (!body) return {}
  if (typeof body === "string") {
    try { return JSON.parse(body) } catch (error) { return {} }
  }
  if (Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString("utf8")) } catch (error) { return {} }
  }
  return body
}

function flowId() {
  const letters = "abcdefghijklmnopqrstuvwxyz"
  let suffix = ""
  for (let i = 0; i < 8; i += 1) suffix += letters[Math.floor(Math.random() * letters.length)]
  return "blackout-maps-guides-" + suffix
}

async function couponId(stripe, percent) {
  const id = percent === 50 ? "blackout-guides-50" : "blackout-guides-15"
  try {
    const existing = await stripe.coupons.retrieve(id)
    if (existing && existing.valid !== false && existing.percent_off === percent) return id
  } catch (error) {
    if (!error || error.code !== "resource_missing") throw error
  }
  try {
    await stripe.coupons.create({
      id: id,
      percent_off: percent,
      duration: "forever",
      name: percent === 50 ? "All ten guides" : "Three or more guides",
    })
  } catch (error) {
    if (!error || error.code !== "resource_already_exists") throw error
  }
  return id
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "Checkout is not available." })
    return
  }
  if (!allowedHost(req)) {
    res.status(403).json({ error: "Checkout is not available." })
    return
  }
  const books = booksFromSlugs(readBody(req).slugs)
  if (!books) {
    res.status(400).json({ error: "Checkout is not available." })
    return
  }
  const priced = quote(books)
  const stripe = liveStripe()
  if (!stripe) {
    res.status(503).json({ error: "Checkout is not available." })
    return
  }
  try {
    const params = {
      mode: "payment",
      line_items: books.map(function (book) { return { price: book.priceId, quantity: 1 } }),
      automatic_tax: { enabled: true },
      success_url: SITE + "/guides/download.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE + "/cart.html",
      client_reference_id: books.length === 1 ? books[0].slug : "cart",
      metadata: { guides: books.map(function (book) { return book.slug }).join(",") },
      integration_identifier: flowId(),
    }
    if (priced.percent) params.discounts = [{ coupon: await couponId(stripe, priced.percent) }]
    const session = await stripe.checkout.sessions.create(params)
    const checked = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price", "total_details.breakdown"],
    })
    const items = checked.line_items && checked.line_items.data
    const prices = (items || []).map(function (item) {
      return item.price && item.price.id
    })
    const expected = books.map(function (book) { return book.priceId })
    const samePrices = prices.length === expected.length && expected.every(function (id) { return prices.indexOf(id) !== -1 })
    const discount = checked.total_details && checked.total_details.amount_discount
    const taxOn = checked.automatic_tax && checked.automatic_tax.enabled === true
    if (!checked.url || checked.url.indexOf("https://checkout.stripe.com/") !== 0 || !samePrices || discount !== priced.discount || !taxOn || checked.amount_subtotal !== priced.subtotal) {
      await stripe.checkout.sessions.expire(checked.id).catch(function () {})
      res.status(502).json({ error: "Checkout is not available." })
      return
    }
    res.status(200).json({ url: checked.url })
  } catch (error) {
    res.status(502).json({ error: "Checkout is not available." })
  }
}
