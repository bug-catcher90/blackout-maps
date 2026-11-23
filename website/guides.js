(function () {
  var KEY = "blackout-guides-cart"
  var BOOKS = [
    { slug: "power-in-a-blackout", title: "Power in a Blackout", cents: 980 },
    { slug: "water-when-the-tap-stops", title: "Water When the Tap Stops", cents: 780 },
    { slug: "food-without-power", title: "Food Without Power", cents: 740 },
    { slug: "the-go-bag-and-leaving-home", title: "The Go-Bag and Leaving Home", cents: 780 },
    { slug: "first-aid-when-help-is-slow", title: "First Aid When Help Is Slow", cents: 940 },
    { slug: "staying-informed-and-in-touch", title: "Staying Informed and in Touch", cents: 820 },
    { slug: "fire-gas-and-a-safe-home", title: "Fire, Gas and a Safe Home", cents: 700 },
    { slug: "warm-cool-and-sheltered", title: "Warm, Cool and Sheltered", cents: 740 }
  ]

  function lookup(slug) {
    for (var i = 0; i < BOOKS.length; i += 1) {
      if (BOOKS[i].slug === slug) return BOOKS[i]
    }
    return null
  }

  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || "[]")
      if (!Array.isArray(parsed)) return []
      var seen = {}
      return parsed.filter(function (slug) {
        if (typeof slug !== "string" || !lookup(slug) || seen[slug]) return false
        seen[slug] = true
        return true
      })
    } catch (error) {
      return []
    }
  }

  function ordered(slugs) {
    return BOOKS.map(function (book) { return book.slug }).filter(function (slug) {
      return slugs.indexOf(slug) !== -1
    })
  }

  function write(slugs) {
    localStorage.setItem(KEY, JSON.stringify(ordered(slugs)))
    paint()
  }

  function money(cents) {
    return "€" + (cents / 100).toFixed(2)
  }

  function percentFor(count) {
    if (count === BOOKS.length) return 50
    if (count >= 3) return 15
    return 0
  }

  function discountCents(slugs) {
    var percent = percentFor(slugs.length)
    return slugs.reduce(function (sum, slug) {
      return sum + Math.round(lookup(slug).cents * percent / 100)
    }, 0)
  }

  function subtotalCents(slugs) {
    return slugs.reduce(function (sum, slug) { return sum + lookup(slug).cents }, 0)
  }

  function paintCounts(slugs) {
    var total = slugs.length ? subtotalCents(slugs) - discountCents(slugs) : 0
    var items = slugs.length === 1 ? "item" : "items"
    var label = "Cart, " + slugs.length + " " + items + ", " + money(total)
    document.querySelectorAll(".nav-cart").forEach(function (el) {
      el.setAttribute("aria-label", label)
    })
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(slugs.length)
    })
    document.querySelectorAll("[data-cart-sum]").forEach(function (el) {
      el.textContent = money(total)
    })
  }

  function moreBooks(count) {
    return count + " more " + (count === 1 ? "book" : "books")
  }

  function offerStatus(count) {
    var goal = BOOKS.length
    if (count >= goal) return "50% off all of them, reached."
    if (count >= 3) return "15% off reached. " + moreBooks(goal - count) + " for 50% off all of them."
    if (count > 0) return count + " of 3 books toward 15% off. 50% off all of them."
    return "15% off 3 books, 50% off all of them."
  }

  function paintShopDeal(count) {
    var el = document.querySelector("[data-shop-deal]")
    if (!el) return
    var goal = BOOKS.length
    var fifteen = el.querySelector("[data-offer='15']")
    var fifty = el.querySelector("[data-offer='50']")
    var fifteenState = count >= 3 ? "reached" : (count > 0 ? "next" : "idle")
    var fiftyState = count >= goal ? "reached" : (count >= 3 ? "next" : "idle")
    fifteen.setAttribute("data-state", fifteenState)
    fifty.setAttribute("data-state", fiftyState)
    fifteen.textContent = count > 0 && count < 3 ? "15% off 3 books (" + count + " of 3)" : "15% off 3 books"
    fifty.textContent = count >= 3 && count < goal
      ? "50% off all of them (" + count + " of " + goal + ")."
      : "50% off all of them."
    el.style.setProperty("--fill", Math.round(count / goal * 100) + "%")
    el.setAttribute("aria-label", offerStatus(count))
  }

  function meterLabel(text, state) {
    var label = document.createElement("span")
    label.textContent = text
    label.setAttribute("data-state", state)
    return label
  }

  function renderDeal(count) {
    var goal = BOOKS.length
    var deal = document.createElement("div")
    deal.className = "deal"
    deal.setAttribute("role", "status")
    deal.setAttribute("aria-label", count + (count === 1 ? " title" : " titles") + " in the cart. " + offerStatus(count))
    var countEl = document.createElement("p")
    countEl.className = "deal-count"
    countEl.textContent = count + (count === 1 ? " title" : " titles") + " in the cart"
    var meter = document.createElement("div")
    meter.className = "deal-meter"
    meter.setAttribute("aria-hidden", "true")
    var wrap = document.createElement("div")
    wrap.className = "deal-track-wrap"
    var track = document.createElement("div")
    track.className = "deal-track"
    var bar = document.createElement("span")
    bar.className = "deal-fill"
    bar.style.width = Math.round(count / goal * 100) + "%"
    track.append(bar)
    var gate = document.createElement("i")
    gate.className = count >= 3 ? "deal-gate is-reached" : "deal-gate"
    wrap.append(track, gate)
    var labels = document.createElement("div")
    labels.className = "deal-scale"
    var fifteen = meterLabel("15%", count >= 3 ? "reached" : (count > 0 ? "next" : "later"))
    fifteen.className = "at-fifteen"
    var fifty = meterLabel("50%", count >= goal ? "reached" : (count >= 3 ? "next" : "later"))
    fifty.className = "at-fifty"
    labels.append(fifteen, fifty)
    meter.append(wrap, labels)
    deal.append(countEl, meter)
    return deal
  }

  function paintButtons(slugs) {
    document.querySelectorAll("[data-add]").forEach(function (button) {
      var slug = button.getAttribute("data-add")
      var inCart = slugs.indexOf(slug) !== -1
      button.textContent = inCart ? "In the cart" : "Add to cart"
      button.setAttribute("aria-pressed", inCart ? "true" : "false")
    })
  }

  function line(title, amount, extra) {
    var row = document.createElement("p")
    row.className = extra || "cart-sub"
    var name = document.createElement("span")
    name.textContent = title
    var value = document.createElement("span")
    value.textContent = amount
    row.append(name, value)
    return row
  }

  function renderCart(root, slugs) {
    root.replaceChildren()
    root.append(renderDeal(slugs.length))
    if (!slugs.length) {
      var empty = document.createElement("p")
      empty.className = "lead"
      empty.textContent = "Your cart is empty."
      var back = document.createElement("p")
      back.className = "section-more"
      var link = document.createElement("a")
      link.href = "/guides.html"
      link.textContent = "See the guides"
      back.append(link)
      root.append(empty, back)
      return
    }
    var list = document.createElement("div")
    list.className = "cart-lines"
    slugs.forEach(function (slug) {
      var book = lookup(slug)
      var row = document.createElement("div")
      row.className = "cart-line"
      var cover = document.createElement("img")
      cover.src = "/images/covers/" + book.slug + ".png"
      cover.alt = ""
      cover.width = 700
      cover.height = 993
      var title = document.createElement("a")
      title.href = "/guides/" + book.slug + ".html"
      title.textContent = book.title
      var price = document.createElement("span")
      price.textContent = money(book.cents)
      var remove = document.createElement("button")
      remove.type = "button"
      remove.className = "cart-remove"
      remove.textContent = "Remove"
      remove.addEventListener("click", function () {
        write(read().filter(function (item) { return item !== slug }))
      })
      row.append(cover, title, price, remove)
      list.append(row)
    })
    var totals = document.createElement("div")
    totals.className = "cart-totals"
    var subtotal = subtotalCents(slugs)
    var percent = percentFor(slugs.length)
    var discount = discountCents(slugs)
    var total = subtotal - discount
    if (percent) {
      totals.append(line("Subtotal", money(subtotal)))
      var label = percent === 50 ? "50% off for every guide" : "15% off for 3 or more guides"
      totals.append(line(label, "-" + money(discount), "cart-discount"))
    }
    var totalRow = line("Total", money(total), "cart-total")
    totalRow.setAttribute("data-cart-total", String(total))
    totals.append(totalRow)
    var note = document.createElement("p")
    note.className = "cart-note"
    note.textContent = "Prices include tax."
    var checkout = document.createElement("button")
    checkout.type = "button"
    checkout.className = "guide-buy"
    checkout.textContent = "Checkout"
    checkout.addEventListener("click", function () { startCheckout(checkout, ordered(read())) })
    root.append(list, totals, note, checkout)
  }

  function startCheckout(button, slugs) {
    if (button.disabled || !slugs.length) return
    button.disabled = true
    button.textContent = "Opening checkout"
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: slugs })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          var next = body && body.url
          if (!res.ok || typeof next !== "string" || next.indexOf("https://checkout.stripe.com/") !== 0) {
            throw new Error("checkout")
          }
          window.location.assign(next)
        })
      })
      .catch(function () {
        button.disabled = false
        button.textContent = "Checkout"
        var note = button.previousElementSibling
        var error = document.createElement("p")
        error.className = "guide-availability"
        error.textContent = "Checkout could not be opened."
        if (note && note.classList.contains("guide-availability")) note.replaceWith(error)
        else button.before(error)
      })
  }

  function paint() {
    var slugs = ordered(read())
    paintCounts(slugs)
    paintButtons(slugs)
    paintShopDeal(slugs.length)
    var cart = document.querySelector("[data-cart]")
    if (cart) renderCart(cart, slugs)
  }

  document.querySelectorAll("[data-add]").forEach(function (button) {
    button.addEventListener("click", function () {
      var slug = button.getAttribute("data-add")
      if (!lookup(slug)) return
      var slugs = read()
      if (slugs.indexOf(slug) !== -1) {
        window.location.assign("/cart.html")
        return
      }
      slugs.push(slug)
      write(slugs)
    })
  })

  var params = new URLSearchParams(location.search)
  var jump = params.get("book") || (location.hash ? decodeURIComponent(location.hash.slice(1)) : "")
  if (jump === "when-the-tap-runs-dry") jump = "water-when-the-tap-stops"
  if (lookup(jump) && document.querySelector("[data-shop]")) {
    window.location.replace("/guides/" + jump + ".html")
    return
  }

  paint()
})()
