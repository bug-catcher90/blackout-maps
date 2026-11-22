const { liveStripe, paidBook, readGuide } = require("./_lib/books")

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    res.status(405).json({ error: "No file." })
    return
  }
  const sessionId = String((req.query && req.query.session_id) || "")
  if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) {
    res.status(403).json({ error: "No file." })
    return
  }
  const stripe = liveStripe()
  if (!stripe) {
    res.status(503).json({ error: "No file." })
    return
  }
  let session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price"],
    })
  } catch (error) {
    res.status(403).json({ error: "No file." })
    return
  }
  const book = paidBook(session)
  const bytes = book && readGuide(book)
  if (!book || !bytes) {
    res.status(book ? 404 : 403).json({ error: "No file." })
    return
  }
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", 'attachment; filename="' + book.downloadName + '"')
  res.setHeader("Content-Length", String(bytes.length))
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.status(200).end(bytes)
}
