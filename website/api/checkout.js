const { SITE, bookBySlug, liveStripe } = require("./_lib/books")

function allowedHost(req) {
  const origin = req.headers.origin
  if (!origin) return false
  let host
  try {
    host = new URL(origin).host
  } catch (error) {
    return false
  }
  return host === "blackout-maps.vercel.app" || host === req.headers.host
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
  const book = bookBySlug(req.body && req.body.slug)
  if (!book) {
    res.status(400).json({ error: "Checkout is not available." })
    return
  }
  const stripe = liveStripe()
  if (!stripe) {
    res.status(503).json({ error: "Checkout is not available." })
    return
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: book.priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      success_url: SITE + "/guides/download.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: SITE + "/guides.html?book=" + book.slug,
      client_reference_id: book.slug,
      metadata: { guide: book.slug },
      integration_identifier: "blackout-maps-guides-kpmqwxza",
    })
    if (!session.url || session.url.indexOf("https://checkout.stripe.com/") !== 0) {
      res.status(502).json({ error: "Checkout is not available." })
      return
    }
    res.status(200).json({ url: session.url })
  } catch (error) {
    res.status(502).json({ error: "Checkout is not available." })
  }
}
