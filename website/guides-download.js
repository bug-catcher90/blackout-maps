(function () {
  var status = document.querySelector("[data-download]")
  if (!status) return
  var sessionId = new URLSearchParams(location.search).get("session_id") || ""
  if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) {
    status.textContent = "This page needs a paid checkout."
    return
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob)
    var link = document.createElement("a")
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
  }

  fetch("/api/guide-download?session_id=" + encodeURIComponent(sessionId))
    .then(function (res) {
      var type = res.headers.get("content-type") || ""
      if (!res.ok || type.indexOf("application/json") !== 0) throw new Error("nofile")
      return res.json()
    })
    .then(function (body) {
      var books = body && body.books
      if (!Array.isArray(books) || !books.length) throw new Error("nofile")
      status.textContent = books.length === 1 ? "Your guide is ready." : "Your guides are ready."
      var list = document.createElement("div")
      list.className = "download-list"
      books.forEach(function (book) {
        if (!book || typeof book.slug !== "string" || typeof book.title !== "string") return
        var link = document.createElement("a")
        link.className = "guide-buy"
        link.href = "/api/guide-download?session_id=" + encodeURIComponent(sessionId) + "&slug=" + encodeURIComponent(book.slug)
        link.textContent = "Download " + book.title
        list.append(link)
      })
      status.after(list)
      if (books.length === 1) {
        return fetch(list.querySelector("a").href).then(function (res) {
          var type = res.headers.get("content-type") || ""
          if (!res.ok || type.indexOf("application/pdf") !== 0) throw new Error("nofile")
          var match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")
          return res.blob().then(function (blob) { save(blob, match ? match[1] : "guide.pdf") })
        })
      }
    })
    .catch(function () {
      status.textContent = "This checkout did not include a paid guide."
    })
})()
