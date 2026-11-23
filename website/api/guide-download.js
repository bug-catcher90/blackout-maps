const { liveStripe, paidBooks, readGuide } = require("./_lib/books")

function noFile(res) {
  res.status(404).json({ error: "No file." })
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    res.status(405).json({ error: "No file." })
    return
  }
  const sessionId = String((req.query && req.query.session_id) || "")
  if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) {
    noFile(res)
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
    noFile(res)
    return
  }
  const books = paidBooks(session)
  if (!books) {
    noFile(res)
    return
  }
  const slugRaw = req.query && req.query.slug
  const slug = Array.isArray(slugRaw) ? String(slugRaw[0] || "") : String(slugRaw || "")
  if (!slug) {
    res.setHeader("Cache-Control", "private, no-store")
    res.status(200).json({
      books: books.map(function (book) {
        return { slug: book.slug, title: book.title }
      }),
    })
    return
  }
  const book = books.find(function (entry) { return entry.slug === slug })
  const bytes = book && readGuide(book)
  if (!book || !bytes) {
    noFile(res)
    return
  }
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", 'attachment; filename="' + book.downloadName + '"')
  res.setHeader("Content-Length", String(bytes.length))
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.status(200).end(bytes)
}
