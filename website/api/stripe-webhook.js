const { liveStripe, paidBook } = require("./_lib/books")

const FULFILL = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
])

function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body)
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body))
  return new Promise(function (resolve, reject) {
    const chunks = []
    req.on("data", function (chunk) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) })
    req.on("end", function () { resolve(Buffer.concat(chunks)) })
    req.on("error", reject)
  })
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).json({ error: "Not accepted." })
    return
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET || ""
  const stripe = liveStripe()
  if (!stripe || secret.indexOf("whsec_") !== 0) {
    res.status(503).json({ error: "Not accepted." })
    return
  }
  let event
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers["stripe-signature"], secret)
  } catch (error) {
    res.status(400).json({ error: "Not accepted." })
    return
  }
  if (event.type === "checkout.session.async_payment_failed") {
    res.status(200).json({ received: true })
    return
  }
  if (!FULFILL.has(event.type)) {
    res.status(200).json({ received: true })
    return
  }
  const sessionId = event.data && event.data.object && event.data.object.id
  if (!sessionId) {
    res.status(200).json({ received: true })
    return
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price"],
    })
    const book = paidBook(session)
    res.status(200).json({ received: true, fulfilled: Boolean(book) })
  } catch (error) {
    res.status(500).json({ error: "Not accepted." })
  }
}

module.exports.config = {
  api: { bodyParser: false },
}
