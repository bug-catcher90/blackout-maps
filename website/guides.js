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

  function moreTitles(count) {
    return count + " more " + (count === 1 ? "title" : "titles")
  }

  function dealModel(count) {
    var goal = BOOKS.length
    var countLine = count + (count === 1 ? " title" : " titles") + " in the cart"
    var fifteenFill = Math.round(Math.min(count, 3) / 3 * 100)
    var fiftyFill = Math.round(count / goal * 100)
    if (count >= goal) {
      return {
        countLine: countLine,
        note: "50% off reached",
        extra: "This replaces the 15% discount.",
        fifteen: "Reached",
        fifty: "Reached",
        fifteenState: "reached",
        fiftyState: "reached",
        fifteenFill: 100,
        fiftyFill: 100
      }
    }
    if (count >= 3) {
      var left = goal - count
      return {
        countLine: countLine,
        note: "15% off reached. " + moreTitles(left) + " for 50% off.",
        extra: "",
        fifteen: "Reached",
        fifty: moreTitles(left),
        fifteenState: "reached",
        fiftyState: "next",
        fifteenFill: 100,
        fiftyFill: fiftyFill
      }
    }
    var need = 3 - count
    return {
      countLine: countLine,
      note: moreTitles(need) + " for 15% off.",
      extra: "",
      fifteen: moreTitles(need),
      fifty: moreTitles(goal - count),
      fifteenState: "next",
      fiftyState: "later",
      fifteenFill: fifteenFill,
      fiftyFill: fiftyFill
    }
  }

  function dealStage(name, detail, state, fill) {
    var block = document.createElement("div")
    block.className = "deal-stage"
    block.setAttribute("data-state", state)
    var top = document.createElement("div")
    top.className = "deal-stage-top"
    var label = document.createElement("span")
    label.textContent = name
    var aside = document.createElement("span")
    aside.textContent = detail
    top.append(label, aside)
    var track = document.createElement("div")
    track.className = "deal-track"
    track.setAttribute("aria-hidden", "true")
    var bar = document.createElement("span")
    bar.style.width = fill + "%"
    track.append(bar)
    block.append(top, track)
    return block
  }

  function renderDeal(count) {
    var model = dealModel(count)
    var deal = document.createElement("div")
    deal.className = "deal"
    deal.setAttribute("role", "status")
    var kicker = document.createElement("p")
    kicker.className = "deal-kicker"
    kicker.textContent = "Volume discount"
    var countEl = document.createElement("p")
    countEl.className = "deal-count"
    countEl.textContent = model.countLine
    var note = document.createElement("p")
    note.className = "deal-note"
    note.textContent = model.note
    deal.append(kicker, countEl, note)
    if (model.extra) {
      var extra = document.createElement("p")
      extra.className = "deal-extra"
      extra.textContent = model.extra
      deal.append(extra)
    }
    deal.append(
      dealStage("15% off", model.fifteen, model.fifteenState, model.fifteenFill),
      dealStage("50% off", model.fifty, model.fiftyState, model.fiftyFill)
    )
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
      row.append(title, price, remove)
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
