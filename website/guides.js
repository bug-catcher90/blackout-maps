// A new guide is one published object in /guides/catalog.json, plus its cover,
// free sheets and preview images. Featured titles appear on the homepage.
// Every published title appears here. Unpublished titles stay out of both.
(function () {
  var root = document.querySelector("[data-guides]")
  if (!root) return

  var dialog = null
  var dialogImage = null
  var dialogCaption = null
  var largerButton = null
  var opener = null

  fetch("/guides/catalog.json")
    .then(function (res) {
      if (!res.ok) throw new Error("catalog")
      return res.json()
    })
    .then(function (catalog) {
      var books = published(catalog)
      if (root.getAttribute("data-guides") === "featured") {
        books = books.filter(function (book) { return book.featured })
      }
      var mode = root.getAttribute("data-guides")
      root.replaceChildren.apply(root, books.map(function (book) {
        return mode === "featured" ? featured(book) : entry(book)
      }))
      var id = location.hash.slice(1)
      if (id) {
        var target = document.getElementById(decodeURIComponent(id))
        if (target) target.scrollIntoView()
      }
    })
    .catch(function () {
      var note = document.createElement("p")
      note.className = "lead"
      note.textContent = "The field guides could not be loaded."
      root.replaceChildren(note)
    })

  function published(catalog) {
    return (catalog.titles || [])
      .filter(function (book) { return book.published })
      .sort(function (a, b) { return a.position - b.position })
  }

  function hrefFor(book) {
    return "/guides.html#" + book.slug
  }

  function money(book) {
    return "€" + book.price.amount
  }

  function buyUrl(book) {
    var url = book.buy && book.buy.url
    return typeof url === "string" && /^https:\/\//.test(url) ? url : ""
  }

  function coverImage(book) {
    var img = document.createElement("img")
    img.src = book.cover
    img.width = book.coverWidth
    img.height = book.coverHeight
    img.alt = "Cover of " + book.title
    return img
  }

  function featured(book) {
    var article = document.createElement("article")
    article.className = "featured-title"
    var cover = document.createElement("a")
    cover.href = hrefFor(book)
    cover.append(coverImage(book))
    var copy = document.createElement("div")
    var heading = document.createElement("h3")
    var title = document.createElement("a")
    title.href = hrefFor(book)
    title.textContent = book.title
    heading.append(title)
    var question = document.createElement("p")
    question.textContent = book.homeQuestion
    var more = document.createElement("a")
    more.className = "featured-more"
    more.href = hrefFor(book)
    more.append(document.createTextNode(book.exploreLabel + " "))
    var arrow = document.createElement("span")
    arrow.setAttribute("aria-hidden", "true")
    arrow.textContent = "→"
    more.append(arrow)
    copy.append(heading, question, more)
    article.append(cover, copy)
    return article
  }

  function entry(book) {
    var article = document.createElement("article")
    article.className = "guide-book"
    article.id = book.slug
    var copy = document.createElement("div")
    var heading = document.createElement("h2")
    heading.textContent = book.title
    var question = document.createElement("h3")
    question.textContent = book.headline
    copy.append(heading, question)
    book.description.forEach(function (paragraph) {
      var p = document.createElement("p")
      p.className = "guide-desc"
      p.textContent = paragraph
      copy.append(p)
    })
    var meta = document.createElement("p")
    meta.className = "guide-meta"
    meta.textContent = book.pages + "-page illustrated PDF · Read offline · Worked example and printable worksheet"
    copy.append(meta, offer(book), example(book), previews(book), worksheet(book))
    article.append(coverImage(book), copy)
    return article
  }

  function offer(book) {
    var url = buyUrl(book)
    if (url) {
      var link = document.createElement("a")
      link.className = "guide-buy"
      link.href = url
      link.rel = "noopener"
      link.textContent = (book.buy && book.buy.label) || ("Buy the " + book.topic + " guide — " + money(book))
      return link
    }
    var block = document.createElement("div")
    block.className = "guide-offer"
    var price = document.createElement("p")
    price.className = "guide-price"
    price.textContent = money(book)
    var status = document.createElement("p")
    status.className = "guide-availability"
    status.textContent = book.availability || "Not for sale on this site yet."
    block.append(price, status)
    return block
  }

  function example(book) {
    var block = document.createElement("div")
    block.className = "guide-example"
    var link = document.createElement("a")
    link.href = book.example.href
    link.textContent = "Read the free example"
    var title = document.createElement("p")
    title.textContent = book.example.title
    block.append(link, title)
    return block
  }

  function worksheet(book) {
    var link = document.createElement("a")
    link.className = "guide-sheet"
    link.href = book.worksheet.href
    link.setAttribute("download", "")
    link.textContent = book.worksheet.label
    return link
  }

  function previews(book) {
    var list = document.createElement("div")
    list.className = "guide-previews"
    book.previews.forEach(function (preview, index) {
      var figure = document.createElement("figure")
      var button = document.createElement("button")
      button.type = "button"
      var captionId = book.slug + "-preview-" + index
      button.setAttribute("aria-describedby", captionId)
      var img = document.createElement("img")
      img.src = preview.src
      img.width = preview.width
      img.height = preview.height
      img.alt = ""
      var label = document.createElement("span")
      label.textContent = "Preview inside"
      button.append(img, label)
      button.addEventListener("click", function () { openPreview(button, preview) })
      var caption = document.createElement("figcaption")
      caption.id = captionId
      caption.textContent = preview.caption
      figure.append(button, caption)
      list.append(figure)
    })
    return list
  }

  function ensureDialog() {
    if (dialog) return
    dialog = document.createElement("dialog")
    dialog.className = "preview-dialog"
    var bar = document.createElement("div")
    bar.className = "preview-bar"
    var close = document.createElement("button")
    close.type = "button"
    close.textContent = "Close"
    close.addEventListener("click", function () { dialog.close() })
    largerButton = document.createElement("button")
    largerButton.type = "button"
    largerButton.textContent = "Larger"
    largerButton.addEventListener("click", toggleLarger)
    dialogCaption = document.createElement("figcaption")
    dialogCaption.id = "preview-caption"
    dialogImage = document.createElement("img")
    dialogImage.alt = ""
    var figure = document.createElement("figure")
    figure.append(dialogImage, dialogCaption)
    bar.append(close, largerButton)
    dialog.append(bar, figure)
    dialog.setAttribute("aria-labelledby", "preview-caption")
    dialog.addEventListener("close", function () {
      resetSize()
      if (opener) opener.focus()
    })
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close()
    })
    document.body.append(dialog)
  }

  function resetSize() {
    dialog.classList.remove("is-large")
    dialogImage.style.width = ""
    largerButton.textContent = "Larger"
  }

  function toggleLarger() {
    var large = dialog.classList.toggle("is-large")
    dialogImage.style.width = large ? (dialogImage.naturalWidth || 864) + "px" : ""
    largerButton.textContent = large ? "Fit the screen" : "Larger"
  }

  function openPreview(button, preview) {
    ensureDialog()
    opener = button
    resetSize()
    dialogImage.src = preview.src
    dialogImage.width = preview.width
    dialogImage.height = preview.height
    dialogCaption.textContent = preview.caption
    dialog.showModal()
    dialog.querySelector(".preview-bar button").focus()
  }
})()
