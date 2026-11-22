(function () {
  var status = document.querySelector("[data-download]")
  if (!status) return
  var sessionId = new URLSearchParams(location.search).get("session_id") || ""
  if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) {
    status.textContent = "This page needs a paid checkout."
    return
  }
  fetch("/api/guide-download?session_id=" + encodeURIComponent(sessionId))
    .then(function (res) {
      var type = res.headers.get("content-type") || ""
      if (!res.ok || type.indexOf("application/pdf") !== 0) throw new Error("nofile")
      var match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")
      var name = match ? match[1] : "field-guide.pdf"
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob)
        var link = document.createElement("a")
        link.href = url
        link.download = name
        document.body.append(link)
        link.click()
        link.remove()
        status.textContent = "Your guide is downloading."
      })
    })
    .catch(function () {
      status.textContent = "This checkout did not include a paid guide."
    })
})()
