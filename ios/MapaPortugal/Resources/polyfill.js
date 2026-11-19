(function () {
  function encode(text) {
    var s = String(text == null ? "" : text)
    var out = []
    for (var i = 0; i < s.length; i += 1) {
      var c = s.charCodeAt(i)
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var c2 = s.charCodeAt(i + 1)
        i += 1
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      }
      if (c < 128) out.push(c)
      else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63))
      else if (c < 65536) out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63))
      else out.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63))
    }
    return new Uint8Array(out)
  }
  function decode(input) {
    if (!input) return ""
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength || input.length || 0)
    var out = ""
    var i = 0
    while (i < bytes.length) {
      var c = bytes[i++]
      if (c < 128) out += String.fromCharCode(c)
      else if (c < 224) out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63))
      else if (c < 240) out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63))
      else {
        var u = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
        u -= 0x10000
        out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023))
      }
    }
    return out
  }
  if (typeof TextEncoder === "undefined") {
    globalThis.TextEncoder = function () {}
    globalThis.TextEncoder.prototype.encode = function (text) { return encode(text) }
  }
  if (typeof TextDecoder === "undefined") {
    globalThis.TextDecoder = function () {}
    globalThis.TextDecoder.prototype.decode = function (input) { return decode(input) }
  }
  if (typeof performance === "undefined") {
    globalThis.performance = { now: function () { return Date.now() } }
  }
})()
