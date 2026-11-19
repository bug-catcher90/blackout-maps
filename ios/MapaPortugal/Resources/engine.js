(() => {
  // offline-gps/public/search.js
  var SMALL = /* @__PURE__ */ new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);
  function fold(value) {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  }
  function streetKey(value) {
    return fold(value).replace(/-/g, " ").split(/\s+/).map((part) => part.replace(/[^a-z0-9]/g, "")).filter((part) => part && !SMALL.has(part)).join(" ");
  }
  function byKey(a, b) {
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return (a.rank ?? 9) - (b.rank ?? 9);
  }
  function preparePlaces(rows) {
    return rows.map((row) => ({ name: row[0], lat: row[1], lon: row[2], rank: row[3] ?? 4, key: fold(row[0]) })).sort(byKey);
  }
  function prepareStreets(rows) {
    return rows.map((row) => ({ name: row[0], lat: row[1], lon: row[2], rank: 5, key: fold(row[0]) })).sort(byKey);
  }
  function lowerBound(items, query) {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (items[mid].key < query) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function searchNames(items, query, limit) {
    const q = fold(query);
    if (q.length < 2) return [];
    const start = lowerBound(items, q);
    const pool = [];
    for (let i = start; i < items.length && pool.length < 40; i += 1) {
      if (!items[i].key.startsWith(q)) break;
      pool.push(items[i]);
    }
    pool.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "pt"));
    return pool.slice(0, limit);
  }

  // offline-gps/public/addresses.js
  var TYPES = /* @__PURE__ */ new Set([
    "rua",
    "avenida",
    "travessa",
    "largo",
    "praca",
    "calcada",
    "estrada",
    "urbanizacao",
    "quinta",
    "caminho",
    "alameda",
    "beco",
    "rotunda",
    "praceta",
    "vila",
    "bairro",
    "calcadinha",
    "ponte",
    "parque",
    "patio",
    "ruela",
    "sitio",
    "azinhaga",
    "viela",
    "campo",
    "casal",
    "canada",
    "escadas",
    "ladeira",
    "monte",
    "jardim",
    "impasse",
    "acesso",
    "adro",
    "autoestrada",
    "transversal",
    "vereda",
    "via"
  ]);
  function readString(view, bytes, offset) {
    const length = view.getUint16(offset, true);
    const start = offset + 2;
    const text = new TextDecoder().decode(bytes.subarray(start, start + length));
    return [text, start + length];
  }
  async function openAddressBook(file) {
    const headBytes = new Uint8Array(await file.slice(0, 28).arrayBuffer());
    const head = new DataView(headBytes.buffer);
    const magic = String.fromCharCode(...headBytes.subarray(0, 4));
    if (magic !== "ADR1" || head.getUint32(24, true) !== 18) {
      throw new Error("addresses");
    }
    const streetCount = head.getUint32(4, true);
    const cityCount = head.getUint32(8, true);
    const numberCount = head.getUint32(12, true);
    const recordOffset = head.getUint32(20, true);
    const indexBytes = new Uint8Array(await file.slice(0, recordOffset).arrayBuffer());
    const view = new DataView(indexBytes.buffer);
    let offset = 28;
    const cities = [];
    const cityKeys = /* @__PURE__ */ new Set();
    for (let i = 0; i < cityCount; i += 1) {
      const [text, next] = readString(view, indexBytes, offset);
      cities.push(text);
      cityKeys.add(streetKey(text));
      offset = next;
    }
    const numbers = [];
    for (let i = 0; i < numberCount; i += 1) {
      const [text, next] = readString(view, indexBytes, offset);
      numbers.push(text);
      offset = next;
    }
    const streets = [];
    for (let i = 0; i < streetCount; i += 1) {
      const [name, next] = readString(view, indexBytes, offset);
      const first = view.getUint32(next, true);
      const count = view.getUint32(next + 4, true);
      streets.push({ name, key: streetKey(name), first, count });
      offset = next + 8;
    }
    return { file, recordOffset, cities, numbers, streets, cityKeys };
  }
  function lowerBound2(streets, query) {
    let lo = 0;
    let hi = streets.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (streets[mid].key < query) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function formatPostcode(value) {
    if (!value) return "";
    const head = String(Math.floor(value / 1e3)).padStart(4, "0");
    const tail = String(value % 1e3).padStart(3, "0");
    return `${head}-${tail}`;
  }
  function formatAddress(street, number, postcode, city) {
    const code = formatPostcode(postcode);
    return code ? `${street} ${number}, ${code} ${city}` : `${street} ${number}, ${city}`;
  }
  function doorScore(house, query) {
    const left = fold(house).replace(/[^a-z0-9]/g, "");
    const right = fold(query).replace(/[^a-z0-9]/g, "");
    if (!right) return 0;
    if (left === right) return 0;
    if (left.startsWith(right) && !/\d/.test(left.slice(right.length))) return 1;
    return -1;
  }
  function tokensOf(query) {
    const post = fold(query).match(/\b(\d{4})-?(\d{3})\b/);
    const without = fold(query).replace(/\b(\d{4})-?(\d{3})\b/g, " ").replace(/\b(nº|n°|nr|num|numero)\b/g, " ");
    const tokens = without.split(/[^a-z0-9]+/).filter(Boolean);
    return { tokens, postcode: post ? `${post[1]}-${post[2]}` : "" };
  }
  function isStreet(tokens) {
    const key = streetKey(tokens.join(" "));
    const words = key.split(" ").filter(Boolean);
    return words.length >= 2 && words.some((word) => TYPES.has(word)) && words.some((word) => !TYPES.has(word));
  }
  function parseDoorQuery(query, cityKeys) {
    const parsed = tokensOf(query);
    let { tokens } = parsed;
    let number = "";
    let city = "";
    const peel = () => {
      if (!tokens.length) return false;
      if (!number && tokens.length > 1 && /^\d+[a-z]?$/.test(tokens[tokens.length - 1])) {
        number = tokens.pop();
        return true;
      }
      if (!city && cityKeys && tokens.length > 1) {
        const max = Math.min(4, tokens.length - 1);
        for (let size = max; size >= 1; size -= 1) {
          const suffix = streetKey(tokens.slice(-size).join(" "));
          const rest = tokens.slice(0, -size);
          if (suffix && cityKeys.has(suffix) && isStreet(rest)) {
            city = suffix;
            tokens = rest;
            return true;
          }
        }
      }
      return false;
    };
    while (peel()) {
    }
    return { street: streetKey(tokens.join(" ")), number, city, postcode: parsed.postcode };
  }
  function matchingStreets(book, query, cap = 20) {
    const hits = [];
    const start = lowerBound2(book.streets, query);
    for (let i = start; i < book.streets.length && hits.length < cap; i += 1) {
      const key = book.streets[i].key;
      if (!key.startsWith(query)) break;
      if (key === query || key.startsWith(`${query} `)) hits.push(book.streets[i]);
    }
    if (hits.length) return hits;
    const needle = ` ${query}`;
    for (const street of book.streets) {
      if (street.key.endsWith(needle) || street.key.includes(`${needle} `)) hits.push(street);
      if (hits.length >= Math.min(cap, 12)) break;
    }
    return hits;
  }
  function publicHit(hit) {
    return { name: hit.name, city: hit.city, lat: hit.lat, lon: hit.lon };
  }
  async function streetView(book, street) {
    const start = book.recordOffset + street.first * 18;
    const bytes = new Uint8Array(await book.file.slice(start, start + street.count * 18).arrayBuffer());
    return new DataView(bytes.buffer);
  }
  function hitAt(book, street, view, index) {
    const base = index * 18;
    const number = book.numbers[view.getUint32(base, true)];
    const city = book.cities[view.getUint16(base + 4, true)];
    const postcode = view.getUint32(base + 6, true);
    return {
      name: formatAddress(street.name, number, postcode, city),
      city,
      lat: view.getInt32(base + 10, true) / 1e6,
      lon: view.getInt32(base + 14, true) / 1e6,
      number,
      postcode
    };
  }
  async function doorsMatching(book, street, parsed) {
    const view = await streetView(book, street);
    const hits = [];
    const perCity = /* @__PURE__ */ new Map();
    const broad = !parsed.city && !parsed.number && street.count > 500;
    for (let i = 0; i < street.count; i += 1) {
      const hit = hitAt(book, street, view, i);
      if (!hit.city) continue;
      if (parsed.city && streetKey(hit.city) !== parsed.city) continue;
      let score = 0;
      if (parsed.number) {
        score = doorScore(hit.number, parsed.number);
        if (score < 0) continue;
      }
      if (parsed.postcode && formatPostcode(hit.postcode) !== parsed.postcode) continue;
      if (broad) {
        const seen = perCity.get(hit.city) || 0;
        if (seen >= 30) continue;
        perCity.set(hit.city, seen + 1);
      }
      hits.push({ ...hit, score });
      if (hits.length >= 400) break;
    }
    return hits;
  }
  async function collectHits(book, query) {
    let parsed = parseDoorQuery(query, book.cityKeys);
    const street = parsed.street || streetKey(query);
    if (street.length < 3) return { parsed, hits: [] };
    const streets = matchingStreets(book, street).slice(0, 6);
    let hits = [];
    for (const row of streets) {
      hits.push(...await doorsMatching(book, row, parsed));
      if (hits.length >= 400) break;
    }
    if (!hits.length && parsed.number && (parsed.city || parsed.postcode)) {
      parsed = { ...parsed, city: "", postcode: "" };
      hits = [];
      for (const row of streets) {
        hits.push(...await doorsMatching(book, row, parsed));
        if (hits.length >= 400) break;
      }
    }
    if (parsed.number) hits.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "pt"));
    return { parsed, hits };
  }
  function byAnchor(hits, anchor) {
    return [...hits].sort((a, b) => {
      const distance = metersBetween(anchor.lat, anchor.lon, a.lat, a.lon) - metersBetween(anchor.lat, anchor.lon, b.lat, b.lon);
      return distance || a.name.localeCompare(b.name, "pt");
    });
  }
  async function streetPoint(book, street, parsed, anchor) {
    const view = await streetView(book, street);
    let best = null;
    let bestM = Infinity;
    for (let i = 0; i < street.count; i += 1) {
      const hit = hitAt(book, street, view, i);
      if (!hit.city) continue;
      if (parsed.city && streetKey(hit.city) !== parsed.city) continue;
      if (parsed.postcode && formatPostcode(hit.postcode) !== parsed.postcode) continue;
      if (!anchor) return hit;
      const distance = metersBetween(anchor.lat, anchor.lon, hit.lat, hit.lon);
      if (distance < bestM) {
        bestM = distance;
        best = hit;
      }
    }
    return best;
  }
  async function nearbyStreetHits(book, queryKey, parsed, anchor, limit) {
    await prepareNearest(book);
    const grid = book.grid;
    const cx = Math.floor((anchor.lon - LON0) / CELL);
    const cy = Math.floor((anchor.lat - LAT0) / CELL);
    const best = /* @__PURE__ */ new Map();
    for (let ring = 0; ring <= 5 && best.size < limit * 2; ring += 1) {
      for (let y = cy - ring; y <= cy + ring; y += 1) {
        for (let x = cx - ring; x <= cx + ring; x += 1) {
          if (ring && Math.abs(y - cy) !== ring && Math.abs(x - cx) !== ring) continue;
          if (y < 0 || x < 0 || y >= YN || x >= XN) continue;
          const cell = y * XN + x;
          const start = grid.starts[cell];
          const size = grid.counts[cell];
          for (let i = 0; i < size; i += 1) {
            const id = grid.ids[start + i];
            const street = streetAt(grid.spans, book.streets, id);
            if (!street) continue;
            const key = street.key;
            if (key !== queryKey && !key.startsWith(`${queryKey} `)) continue;
            const lat = grid.lats[id] / 1e6;
            const lon = grid.lons[id] / 1e6;
            const distance = metersBetween(anchor.lat, anchor.lon, lat, lon);
            const prev = best.get(street);
            if (prev && prev.distance <= distance) continue;
            best.set(street, { lat, lon, distance, index: id });
          }
        }
      }
    }
    const hits = [];
    for (const point2 of [...best.entries()].sort((a, b) => a[1].distance - b[1].distance).slice(0, limit)) {
      const [street, door] = point2;
      const bytes = new Uint8Array(await book.file.slice(book.recordOffset + door.index * 18, book.recordOffset + (door.index + 1) * 18).arrayBuffer());
      const view = new DataView(bytes.buffer);
      const city = book.cities[view.getUint16(4, true)];
      if (parsed.city && streetKey(city) !== parsed.city) continue;
      hits.push({
        name: `${street.name}, ${city}`,
        city,
        lat: door.lat,
        lon: door.lon,
        distance: door.distance
      });
    }
    return hits;
  }
  async function suggestStreets(book, query, limit, anchor) {
    const parsed = parseDoorQuery(query, book.cityKeys);
    const street = parsed.street || streetKey(query);
    if (street.length < 3 || parsed.number) return [];
    if (anchor && street.split(" ").length < 2) {
      const near = await nearbyStreetHits(book, street, parsed, anchor, limit);
      if (near.length) return near.map(publicHit);
    }
    const rows = matchingStreets(book, street, 40);
    const hits = [];
    for (const row of rows) {
      const door = await streetPoint(book, row, parsed, anchor);
      if (!door) continue;
      hits.push({
        name: `${row.name}, ${door.city}`,
        city: door.city,
        lat: door.lat,
        lon: door.lon,
        distance: anchor ? metersBetween(anchor.lat, anchor.lon, door.lat, door.lon) : 0
      });
    }
    if (anchor) hits.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "pt"));
    return hits.slice(0, limit).map(publicHit);
  }
  async function suggestAddresses(book, query, limit = 8, anchor = null) {
    if (!book) return [];
    const parsed = parseDoorQuery(query, book.cityKeys);
    if (!parsed.number) return suggestStreets(book, query, limit, anchor);
    const { hits } = await collectHits(book, query);
    const ordered = anchor && !parsed.city ? byAnchor(hits, anchor) : hits;
    return ordered.slice(0, 80).map(publicHit);
  }
  var CELL = 0.02;
  var LAT0 = 36.8;
  var LON0 = -9.8;
  var YN = 280;
  var XN = 190;
  function cellIndex(lat, lon) {
    const y = Math.floor((lat - LAT0) / CELL);
    const x = Math.floor((lon - LON0) / CELL);
    if (y < 0 || x < 0 || y >= YN || x >= XN) return -1;
    return y * XN + x;
  }
  function metersBetween(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371e3 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function streetAt(spans, streets, index) {
    let lo = 0;
    let hi = spans.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (spans[mid].first <= index) lo = mid + 1;
      else hi = mid;
    }
    const span = spans[lo - 1];
    if (!span || index < span.first || index >= span.first + span.count) return null;
    return streets[span.street];
  }
  function prepareNearest(book) {
    if (!book) return Promise.resolve();
    if (book.grid) return Promise.resolve();
    if (!book.nearestTask) book.nearestTask = buildNearest(book);
    return book.nearestTask;
  }
  async function buildNearest(book) {
    const count = Math.floor((book.file.size - book.recordOffset) / 18);
    const lats = new Int32Array(count);
    const lons = new Int32Array(count);
    const counts = new Uint32Array(YN * XN);
    const chunk = 12e4;
    for (let start = 0; start < count; start += chunk) {
      const size = Math.min(chunk, count - start);
      const bytes = new Uint8Array(
        await book.file.slice(book.recordOffset + start * 18, book.recordOffset + (start + size) * 18).arrayBuffer()
      );
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < size; i += 1) {
        const lat = view.getInt32(i * 18 + 10, true);
        const lon = view.getInt32(i * 18 + 14, true);
        lats[start + i] = lat;
        lons[start + i] = lon;
        const cell = cellIndex(lat / 1e6, lon / 1e6);
        if (cell >= 0) counts[cell] += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const starts = new Uint32Array(counts.length);
    let cursor = 0;
    for (let i = 0; i < counts.length; i += 1) {
      starts[i] = cursor;
      cursor += counts[i];
    }
    const ids = new Uint32Array(cursor);
    const fill = starts.slice();
    for (let i = 0; i < count; i += 1) {
      const cell = cellIndex(lats[i] / 1e6, lons[i] / 1e6);
      if (cell < 0) continue;
      ids[fill[cell]] = i;
      fill[cell] += 1;
    }
    const spans = book.streets.map((street, streetIndex) => ({ first: street.first, count: street.count, street: streetIndex })).sort((a, b) => a.first - b.first);
    book.grid = { lats, lons, counts, starts, ids, spans };
  }
  function nearestIndex(grid, lat, lon) {
    const cx = Math.floor((lon - LON0) / CELL);
    const cy = Math.floor((lat - LAT0) / CELL);
    let best = -1;
    let bestM = Infinity;
    for (let ring = 0; ring < 40; ring += 1) {
      for (let y = cy - ring; y <= cy + ring; y += 1) {
        for (let x = cx - ring; x <= cx + ring; x += 1) {
          if (ring && Math.abs(y - cy) !== ring && Math.abs(x - cx) !== ring) continue;
          if (y < 0 || x < 0 || y >= YN || x >= XN) continue;
          const cell = y * XN + x;
          const start = grid.starts[cell];
          const size = grid.counts[cell];
          for (let i = 0; i < size; i += 1) {
            const id = grid.ids[start + i];
            const d = metersBetween(lat, lon, grid.lats[id] / 1e6, grid.lons[id] / 1e6);
            if (d < bestM) {
              bestM = d;
              best = id;
            }
          }
        }
      }
      if (best < 0) continue;
      const south = LAT0 + (cy - ring) * CELL;
      const north = LAT0 + (cy + ring + 1) * CELL;
      const west = LON0 + (cx - ring) * CELL;
      const east = LON0 + (cx + ring + 1) * CELL;
      if (lat < south || lat > north || lon < west || lon > east) continue;
      const latM = Math.min(lat - south, north - lat) * 111320;
      const lonM = Math.min(lon - west, east - lon) * 111320 * Math.cos(lat * Math.PI / 180);
      if (bestM <= Math.min(latM, lonM)) break;
    }
    return best;
  }
  async function nearestDoor(book, lat, lon) {
    if (!book || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    await prepareNearest(book);
    const index = nearestIndex(book.grid, lat, lon);
    if (index < 0) return null;
    const street = streetAt(book.grid.spans, book.streets, index);
    if (!street) return null;
    const bytes = new Uint8Array(await book.file.slice(book.recordOffset + index * 18, book.recordOffset + (index + 1) * 18).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const number = book.numbers[view.getUint32(0, true)];
    const city = book.cities[view.getUint16(4, true)];
    const postcode = view.getUint32(6, true);
    return {
      name: formatAddress(street.name, number, postcode, city),
      lat: view.getInt32(10, true) / 1e6,
      lon: view.getInt32(14, true) / 1e6
    };
  }

  // offline-gps/public/buildings.js
  var LAT02 = 368e5;
  var LON02 = -98e5;
  var STEP = 5e3;
  var LAT_N = 1090;
  var LON_N = 750;
  var UNIT = 10;
  function align(offset) {
    return offset + 3 & ~3;
  }
  function openBuildingBook(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== "BLD1" || view.getUint32(4, true) !== 1 || view.getUint32(40, true) !== bytes.byteLength) {
      throw new Error("buildings");
    }
    const count = view.getUint32(8, true);
    const cellCount = view.getUint32(32, true);
    const geomBytes = view.getUint32(36, true);
    let offset = 64;
    const originLat = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const originLon = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const geomOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const geomLen = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset = align(offset + count * 2);
    const geom = bytes.subarray(offset, offset + geomBytes);
    offset = align(offset + geomBytes);
    const cellHead = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellCount + 1);
    offset += (cellCount + 1) * 4;
    const cellIds = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellHead[cellCount]);
    const book = {
      count,
      originLat,
      originLon,
      geomOff,
      geomLen,
      geom,
      geomView: new DataView(geom.buffer, geom.byteOffset, geom.byteLength),
      cellHead,
      cellIds,
      rings: new Array(count),
      stamp: new Uint32Array(count),
      token: 1
    };
    book.allows = (lat1, lon1, lat2, lon2) => allowsConnector(book, lat1, lon1, lat2, lon2);
    book.links = (lat1, lon1, lat2, lon2) => allowsLink(book, lat1, lon1, lat2, lon2);
    book.cuts = (lat1, lon1, lat2, lon2) => segmentCuts(book, lat1, lon1, lat2, lon2);
    return book;
  }
  function ringOf(book, id) {
    const cached = book.rings[id];
    if (cached) return cached;
    const view = book.geomView;
    let offset = book.geomOff[id];
    const n = view.getUint16(offset, true);
    offset += 2;
    const ring = new Float64Array(n * 2);
    const lat0 = book.originLat[id];
    const lon0 = book.originLon[id];
    ring[0] = lat0 / 1e6;
    ring[1] = lon0 / 1e6;
    for (let index = 1; index < n; index += 1) {
      ring[index * 2] = (lat0 + view.getInt16(offset, true) * UNIT) / 1e6;
      ring[index * 2 + 1] = (lon0 + view.getInt16(offset + 2, true) * UNIT) / 1e6;
      offset += 4;
    }
    book.rings[id] = ring;
    return ring;
  }
  function pointInside(ring, lat, lon) {
    let inside2 = false;
    const n = ring.length / 2;
    let prevLat = ring[(n - 1) * 2];
    let prevLon = ring[(n - 1) * 2 + 1];
    for (let index = 0; index < n; index += 1) {
      const nextLat = ring[index * 2];
      const nextLon = ring[index * 2 + 1];
      if (nextLat > lat !== prevLat > lat && lon < (prevLon - nextLon) * (lat - nextLat) / (prevLat - nextLat) + nextLon) {
        inside2 = !inside2;
      }
      prevLat = nextLat;
      prevLon = nextLon;
    }
    return inside2;
  }
  function orient(ax, ay, bx, by, cx, cy) {
    return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  }
  function segmentsCross(aLat, aLon, bLat, bLon, cLat, cLon, dLat, dLon) {
    const left = orient(aLon, aLat, bLon, bLat, cLon, cLat);
    const right = orient(aLon, aLat, bLon, bLat, dLon, dLat);
    const across = orient(cLon, cLat, dLon, dLat, aLon, aLat);
    const back = orient(cLon, cLat, dLon, dLat, bLon, bLat);
    return left * right < 0 && across * back < 0;
  }
  function ringHitsSegment(ring, lat1, lon1, lat2, lon2) {
    if (pointInside(ring, lat1, lon1) || pointInside(ring, lat2, lon2)) return true;
    const n = ring.length / 2;
    let prevLat = ring[(n - 1) * 2];
    let prevLon = ring[(n - 1) * 2 + 1];
    for (let index = 0; index < n; index += 1) {
      const nextLat = ring[index * 2];
      const nextLon = ring[index * 2 + 1];
      if (segmentsCross(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon)) return true;
      prevLat = nextLat;
      prevLon = nextLon;
    }
    return false;
  }
  function candidates(book, lat1, lon1, lat2, lon2) {
    const south = Math.min(lat1, lat2);
    const north = Math.max(lat1, lat2);
    const west = Math.min(lon1, lon2);
    const east = Math.max(lon1, lon2);
    const y0 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(south * 1e6) - LAT02) / STEP)));
    const y1 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(north * 1e6) - LAT02) / STEP)));
    const x0 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(west * 1e6) - LON02) / STEP)));
    const x1 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(east * 1e6) - LON02) / STEP)));
    const token = book.token + 1 >>> 0;
    book.token = token === 0 ? 1 : token;
    if (token === 0) book.stamp.fill(0);
    const ids = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = y * LON_N + x;
        for (let index = book.cellHead[cell]; index < book.cellHead[cell + 1]; index += 1) {
          const id = book.cellIds[index];
          if (book.stamp[id] === book.token) continue;
          book.stamp[id] = book.token;
          ids.push(id);
        }
      }
    }
    return ids;
  }
  function meters(lat1, lon1, lat2, lon2) {
    const scale = Math.cos((lat1 + lat2) / 2 * 0.017453292519943295);
    return Math.hypot((lat2 - lat1) * 110540, (lon2 - lon1) * scale * 111320);
  }
  function crossT(lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4) {
    const rx = lon2 - lon1;
    const ry = lat2 - lat1;
    const sx = lon4 - lon3;
    const sy = lat4 - lat3;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-15) return null;
    const qpx = lon3 - lon1;
    const qpy = lat3 - lat1;
    const t = (qpx * sy - qpy * sx) / den;
    const u = (qpx * ry - qpy * rx) / den;
    if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
  }
  function exitShare(ring, lat1, lon1, lat2, lon2) {
    const n = ring.length / 2;
    let exit = null;
    let prevLat = ring[(n - 1) * 2];
    let prevLon = ring[(n - 1) * 2 + 1];
    for (let index = 0; index < n; index += 1) {
      const nextLat = ring[index * 2];
      const nextLon = ring[index * 2 + 1];
      const share = crossT(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon);
      if (share != null) {
        const probe = Math.min(1, share + 1e-4);
        const lat = lat1 + (lat2 - lat1) * probe;
        const lon = lon1 + (lon2 - lon1) * probe;
        if (!pointInside(ring, lat, lon)) exit = exit == null ? share : Math.max(exit, share);
      }
      prevLat = nextLat;
      prevLon = nextLon;
    }
    return exit;
  }
  function cutsRing(ring, lat1, lon1, lat2, lon2) {
    const midLat = (lat1 + lat2) / 2;
    const midLon = (lon1 + lon2) / 2;
    if (pointInside(ring, midLat, midLon)) return true;
    const n = ring.length / 2;
    let prevLat = ring[(n - 1) * 2];
    let prevLon = ring[(n - 1) * 2 + 1];
    for (let index = 0; index < n; index += 1) {
      const nextLat = ring[index * 2];
      const nextLon = ring[index * 2 + 1];
      if (segmentsCross(lat1, lon1, lat2, lon2, prevLat, prevLon, nextLat, nextLon)) return true;
      prevLat = nextLat;
      prevLon = nextLon;
    }
    return false;
  }
  function segmentCuts(book, lat1, lon1, lat2, lon2) {
    if (meters(lat1, lon1, lat2, lon2) <= 1.5) return false;
    for (const id of candidates(book, lat1, lon1, lat2, lon2)) {
      if (cutsRing(ringOf(book, id), lat1, lon1, lat2, lon2)) return true;
    }
    return false;
  }
  function allowsLink(book, lat1, lon1, lat2, lon2) {
    const length = meters(lat1, lon1, lat2, lon2);
    if (length <= 1.5) return true;
    const ids = candidates(book, lat1, lon1, lat2, lon2);
    let origin = -1;
    for (const id of ids) {
      if (!pointInside(ringOf(book, id), lat1, lon1)) continue;
      origin = id;
      break;
    }
    if (origin >= 0) {
      const share = exitShare(ringOf(book, origin), lat1, lon1, lat2, lon2);
      if (share == null) return length <= 40;
      if (length * share > 40) return false;
      if (length * (1 - share) > 22) return false;
      const midLat = lat1 + (lat2 - lat1) * share;
      const midLon = lon1 + (lon2 - lon1) * share;
      for (const id of ids) {
        if (id === origin) continue;
        if (ringHitsSegment(ringOf(book, id), midLat, midLon, lat2, lon2)) return false;
      }
      return true;
    }
    for (const id of ids) {
      if (cutsRing(ringOf(book, id), lat1, lon1, lat2, lon2)) return false;
    }
    return true;
  }
  function allowsConnector(book, lat1, lon1, lat2, lon2) {
    const length = meters(lat1, lon1, lat2, lon2);
    if (length <= 1.5) return true;
    const ids = candidates(book, lat1, lon1, lat2, lon2);
    let origin = -1;
    for (const id of ids) {
      if (!pointInside(ringOf(book, id), lat1, lon1)) continue;
      origin = id;
      break;
    }
    if (origin >= 0) {
      const share = exitShare(ringOf(book, origin), lat1, lon1, lat2, lon2);
      if (share == null) return length <= 8;
      if (length * share > 15) return false;
      const midLat = lat1 + (lat2 - lat1) * share;
      const midLon = lon1 + (lon2 - lon1) * share;
      if (length * (1 - share) > 22) return false;
      for (const id of ids) {
        if (id === origin) continue;
        if (ringHitsSegment(ringOf(book, id), midLat, midLon, lat2, lon2)) return false;
      }
      return true;
    }
    if (length > 22) return false;
    for (const id of ids) {
      if (ringHitsSegment(ringOf(book, id), lat1, lon1, lat2, lon2)) return false;
    }
    return true;
  }
  function buildingsInView(book, west, south, east, north, limit = 2500) {
    const y0 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(south * 1e6) - LAT02) / STEP)));
    const y1 = Math.max(0, Math.min(LAT_N - 1, Math.floor((Math.round(north * 1e6) - LAT02) / STEP)));
    const x0 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(west * 1e6) - LON02) / STEP)));
    const x1 = Math.max(0, Math.min(LON_N - 1, Math.floor((Math.round(east * 1e6) - LON02) / STEP)));
    const token = book.token + 1 >>> 0;
    book.token = token === 0 ? 1 : token;
    if (token === 0) book.stamp.fill(0);
    const features = [];
    for (let y = y0; y <= y1 && features.length < limit; y += 1) {
      for (let x = x0; x <= x1 && features.length < limit; x += 1) {
        const cell = y * LON_N + x;
        for (let index = book.cellHead[cell]; index < book.cellHead[cell + 1] && features.length < limit; index += 1) {
          const id = book.cellIds[index];
          if (book.stamp[id] === book.token) continue;
          book.stamp[id] = book.token;
          const ring = ringOf(book, id);
          const n = ring.length / 2;
          let seen = false;
          const coordinates = new Array(n + 1);
          for (let point2 = 0; point2 < n; point2 += 1) {
            const lat = ring[point2 * 2];
            const lon = ring[point2 * 2 + 1];
            if (lat >= south && lat <= north && lon >= west && lon <= east) seen = true;
            coordinates[point2] = [lon, lat];
          }
          coordinates[n] = coordinates[0];
          if (!seen) continue;
          features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } });
        }
      }
    }
    return { type: "FeatureCollection", features };
  }

  // offline-gps/public/places.js
  var CATEGORIES = [
    { id: 0, label: "Sa\xFAde", mark: "Sa\xFAde", color: "#0f6b4c" },
    { id: 1, label: "Pol\xEDcia", mark: "Pol\xEDcia", color: "#1d4ed8" },
    { id: 2, label: "Bombeiros", mark: "Bombeiros", color: "#dc2626" },
    { id: 3, label: "Gasolina", mark: "Gasolina", color: "#7c3aed" },
    { id: 4, label: "Supermercados", mark: "Supermercado", color: "#b45309" },
    { id: 5, label: "Restaurantes", mark: "Restaurante", color: "#be185d" }
  ];
  function align2(offset) {
    return offset + 3 & ~3;
  }
  function openPlaceBook(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== "POI1" || view.getUint32(4, true) !== 1 || view.getUint32(44, true) !== bytes.byteLength) {
      throw new Error("places");
    }
    const count = view.getUint32(8, true);
    const nameBytes = view.getUint32(12, true);
    const addrBytes = view.getUint32(16, true);
    const lat0 = view.getInt32(20, true);
    const lon0 = view.getInt32(24, true);
    const latN = view.getUint32(28, true);
    const lonN = view.getUint32(32, true);
    const step = view.getUint32(36, true);
    const cellCount = view.getUint32(40, true);
    let offset = 64;
    const category = bytes.slice(offset, offset + count);
    offset = align2(offset + count);
    const lat = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const lon = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const nameOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const nameLen = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset = align2(offset + count * 2);
    const addrOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const addrLen = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset = align2(offset + count * 2);
    const nameBlob = bytes.subarray(offset, offset + nameBytes);
    offset = align2(offset + nameBytes);
    const addrBlob = bytes.subarray(offset, offset + addrBytes);
    offset = align2(offset + addrBytes);
    const cellHead = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellCount + 1);
    offset += (cellCount + 1) * 4;
    const cellIds = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    const decoder2 = new TextDecoder();
    const names = new Array(count);
    const addrs = new Array(count);
    for (let i = 0; i < count; i += 1) {
      names[i] = decoder2.decode(nameBlob.subarray(nameOff[i], nameOff[i] + nameLen[i]));
      addrs[i] = decoder2.decode(addrBlob.subarray(addrOff[i], addrOff[i] + addrLen[i]));
    }
    return { count, category, lat, lon, names, addrs, lat0, lon0, latN, lonN, step, cellHead, cellIds };
  }
  function placesInView(book, west, south, east, north, category = -1, limit = 80) {
    const counts = CATEGORIES.map(() => 0);
    const kept = CATEGORIES.map(() => 0);
    const items = [];
    if (!book || !(east > west) || !(north > south)) return { counts, items };
    const y0 = Math.max(0, Math.floor((south * 1e6 - book.lat0) / book.step));
    const y1 = Math.min(book.latN - 1, Math.floor((north * 1e6 - book.lat0) / book.step));
    const x0 = Math.max(0, Math.floor((west * 1e6 - book.lon0) / book.step));
    const x1 = Math.min(book.lonN - 1, Math.floor((east * 1e6 - book.lon0) / book.step));
    if (y1 < y0 || x1 < x0) return { counts, items };
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = y * book.lonN + x;
        const start = book.cellHead[cell];
        const end = book.cellHead[cell + 1];
        for (let k = start; k < end; k += 1) {
          const id = book.cellIds[k];
          const lat = book.lat[id] / 1e6;
          const lon = book.lon[id] / 1e6;
          if (lat < south || lat > north || lon < west || lon > east) continue;
          const kind = book.category[id];
          counts[kind] += 1;
          if (category >= 0 && kind !== category) continue;
          if (kept[kind] >= limit) continue;
          kept[kind] += 1;
          items.push({
            category: kind,
            name: book.names[id],
            address: book.addrs[id],
            lat,
            lon
          });
        }
      }
    }
    return { counts, items };
  }
  function searchServices(book, query, limit = 6) {
    const parts = fold(query).split(/\s+/).filter((part) => part.length > 1);
    if (!book || parts.length === 0) return [];
    if (!book.keys) {
      book.keys = [];
      for (let i = 0; i < book.count; i += 1) book.keys.push(fold(book.names[i]));
    }
    const hits = [];
    for (let i = 0; i < book.count; i += 1) {
      const key = book.keys[i];
      if (!parts.every((part) => key.includes(part))) continue;
      hits.push({
        service: true,
        category: book.category[i],
        name: book.names[i],
        address: book.addrs[i],
        lat: book.lat[i] / 1e6,
        lon: book.lon[i] / 1e6,
        rank: key.startsWith(parts[0]) ? 0 : 1
      });
    }
    hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name, "pt"));
    return hits.slice(0, limit);
  }

  // offline-gps/public/route.js
  function metersBetween2(lat1, lon1, lat2, lon2) {
    const radius = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = p2 - p1;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function push(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = i - 1 >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      const swap = heap[parent];
      heap[parent] = heap[i];
      heap[i] = swap;
      i = parent;
    }
  }
  function pop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length === 0 || !last) return top;
    heap[0] = last;
    let i = 0;
    for (; ; ) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
      if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
      if (smallest === i) break;
      const swap = heap[smallest];
      heap[smallest] = heap[i];
      heap[i] = swap;
      i = smallest;
    }
    return top;
  }
  function nearestNode(graph, lat, lon) {
    const { nodes, buckets, cell } = graph;
    const gy = Math.round(lat / cell);
    const gx = Math.round(lon / cell);
    let best = -1;
    let bestD = Infinity;
    for (let radius = 0; radius <= 12; radius += 1) {
      let hit = false;
      for (let y = gy - radius; y <= gy + radius; y += 1) {
        for (let x = gx - radius; x <= gx + radius; x += 1) {
          if (radius > 0 && Math.abs(y - gy) !== radius && Math.abs(x - gx) !== radius) continue;
          const list = buckets.get(`${y}:${x}`);
          if (!list) continue;
          hit = true;
          for (const id of list) {
            const d = (nodes[id][0] - lat) ** 2 + (nodes[id][1] - lon) ** 2;
            if (d < bestD) {
              bestD = d;
              best = id;
            }
          }
        }
      }
      if (hit && radius > 0) return best;
    }
    return best;
  }
  function direct(from, to) {
    return {
      coordinates: [
        [from.lon, from.lat],
        [to.lon, to.lat]
      ],
      meters: metersBetween2(from.lat, from.lon, to.lat, to.lon),
      direct: true,
      edges: []
    };
  }
  var TRAVEL_KMH = { walk: 5, bicycle: 15, car: 60 };
  var CLASS_KMH = [120, 100, 80, 70, 50, 40, 30, 20];
  var TOLL_BIT = 16;
  function isTollEdge(graph, edge) {
    return Boolean(graph?.klass) && (graph.klass[edge] & TOLL_BIT) !== 0;
  }
  function classKmh(graph, edge) {
    if (!graph?.klass) return TRAVEL_KMH.car;
    return CLASS_KMH[graph.klass[edge] & 7] || 40;
  }
  function secondsFor(meters2, kmh) {
    if (!Number.isFinite(meters2) || meters2 <= 0) return 0;
    return meters2 / 1e3 / kmh * 3600;
  }
  function timed(graph) {
    return graph?.costMode === "car" && Boolean(graph.klass);
  }
  function edgeCost(graph, edge, meters2) {
    if (!timed(graph)) return meters2;
    return secondsFor(meters2, classKmh(graph, edge));
  }
  function connectorCost(graph, meters2) {
    if (!timed(graph)) return meters2;
    return secondsFor(meters2, 20);
  }
  function heuristicCost(graph, meters2) {
    if (!timed(graph)) return meters2;
    return secondsFor(meters2, CLASS_KMH[0]);
  }
  function bearingDeg(lon1, lat1, lon2, lat2) {
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function turnDelta(from, to) {
    return (to - from + 540) % 360 - 180;
  }
  function segmentShare(lat, lon, lon1, lat1, lon2, lat2) {
    const scale = Math.cos((lat1 + lat2) * 0.5 * 0.017453292519943295);
    const dx = (lon2 - lon1) * scale;
    const dy = lat2 - lat1;
    const den = dx * dx + dy * dy;
    if (den <= 0) return 0;
    let share = ((lon - lon1) * scale * dx + (lat - lat1) * dy) / den;
    if (share < 0) share = 0;
    else if (share > 1) share = 1;
    return share;
  }
  function lineCursor(coordinates, lat, lon) {
    let total = 0;
    let best = Infinity;
    let along = 0;
    let qLat = coordinates[0][1];
    let qLon = coordinates[0][0];
    const spans = [0];
    for (let index = 1; index < coordinates.length; index += 1) {
      const from = coordinates[index - 1];
      const to = coordinates[index];
      const seg = metersBetween2(from[1], from[0], to[1], to[0]);
      const share = segmentShare(lat, lon, from[0], from[1], to[0], to[1]);
      const latQ = from[1] + (to[1] - from[1]) * share;
      const lonQ = from[0] + (to[0] - from[0]) * share;
      const dist = metersBetween2(lat, lon, latQ, lonQ);
      if (dist < best) {
        best = dist;
        along = total + seg * share;
        qLat = latQ;
        qLon = lonQ;
      }
      total += seg;
      spans.push(total);
    }
    return { along, total, lat: qLat, lon: qLon, spans };
  }
  function pointOnLine(coordinates, spans, at) {
    if (at <= 0) return { lat: coordinates[0][1], lon: coordinates[0][0], index: 1 };
    for (let index = 1; index < coordinates.length; index += 1) {
      if (spans[index] + 1e-6 < at) continue;
      const span = spans[index] - spans[index - 1];
      const share = span > 0 ? (at - spans[index - 1]) / span : 0;
      const from = coordinates[index - 1];
      const to = coordinates[index];
      return {
        lat: from[1] + (to[1] - from[1]) * share,
        lon: from[0] + (to[0] - from[0]) * share,
        index
      };
    }
    const last = coordinates[coordinates.length - 1];
    return { lat: last[1], lon: last[0], index: coordinates.length - 1 };
  }
  function advanceOnLine(coordinates, lat, lon, distanceM) {
    if (!coordinates || coordinates.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const here = lineCursor(coordinates, lat, lon);
    const at = Math.max(0, Math.min(here.total, here.along + Math.max(0, distanceM || 0)));
    const point2 = pointOnLine(coordinates, here.spans, at);
    return { lat: point2.lat, lon: point2.lon, along: at, remaining: Math.max(0, here.total - at) };
  }
  function sliceRoute(coordinates, lat, lon) {
    if (!coordinates || coordinates.length < 2 || !Number.isFinite(lat)) {
      return { coordinates: coordinates || [], meters: 0 };
    }
    const here = lineCursor(coordinates, lat, lon);
    const start = pointOnLine(coordinates, here.spans, here.along);
    const rest = [[start.lon, start.lat]];
    for (let index = start.index; index < coordinates.length; index += 1) {
      const point2 = coordinates[index];
      const last = rest[rest.length - 1];
      if (Math.abs(last[0] - point2[0]) < 1e-7 && Math.abs(last[1] - point2[1]) < 1e-7) continue;
      rest.push(point2);
    }
    if (rest.length === 1) rest.push(coordinates[coordinates.length - 1]);
    return { coordinates: rest, meters: Math.max(0, here.total - here.along) };
  }
  function classifyTurn(delta) {
    const abs = Math.abs(delta);
    const right = delta > 0;
    if (abs < 20) return null;
    if (abs >= 160) return { turn: "uturn", text: "Inverta a marcha" };
    if (abs >= 120) return right ? { turn: "sharp-right", text: "Vire acentuadamente \xE0 direita" } : { turn: "sharp-left", text: "Vire acentuadamente \xE0 esquerda" };
    if (abs >= 50) return right ? { turn: "right", text: "Vire \xE0 direita" } : { turn: "left", text: "Vire \xE0 esquerda" };
    return right ? { turn: "slight-right", text: "Vire ligeiramente \xE0 direita" } : { turn: "slight-left", text: "Vire ligeiramente \xE0 esquerda" };
  }
  function alongPoint(coordinates, meters2) {
    let walked = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      const from = coordinates[index - 1];
      const to = coordinates[index];
      const dist = metersBetween2(from[1], from[0], to[1], to[0]);
      if (walked + dist >= meters2 || index === coordinates.length - 1) {
        const share = dist > 0 ? Math.min(1, Math.max(0, (meters2 - walked) / dist)) : 0;
        return {
          lat: from[1] + (to[1] - from[1]) * share,
          lon: from[0] + (to[0] - from[0]) * share
        };
      }
      walked += dist;
    }
    const last = coordinates[coordinates.length - 1] || [0, 0];
    return { lat: last[1], lon: last[0] };
  }
  function routeSamples(coordinates) {
    const samples = [];
    let meters2 = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
      const from = coordinates[i - 1];
      const to = coordinates[i];
      const dist = metersBetween2(from[1], from[0], to[1], to[0]);
      if (dist < 8) {
        meters2 += dist;
        continue;
      }
      samples.push({ at: meters2, head: bearingDeg(from[0], from[1], to[0], to[1]) });
      meters2 += dist;
    }
    return { samples, meters: meters2 };
  }
  function roundaboutAt(samples, index, base) {
    const start = samples[index].at;
    let last = base;
    let cumulative = 0;
    let steps = 0;
    let sign = 0;
    for (let j = index; j < samples.length && samples[j].at - start <= 60; j += 1) {
      const step = turnDelta(last, samples[j].head);
      const abs = Math.abs(step);
      if (abs < 8) {
        last = samples[j].head;
        continue;
      }
      if (abs > 55) return false;
      const nextSign = step > 0 ? 1 : -1;
      if (sign && nextSign !== sign) return false;
      sign = nextSign;
      cumulative += step;
      steps += 1;
      last = samples[j].head;
    }
    return steps >= 3 && Math.abs(cumulative) >= 55 && Math.abs(cumulative) <= 300;
  }
  function maneuverAt(coordinates, meters2, turn, text) {
    const spot = alongPoint(coordinates, Math.min(routeSamples(coordinates).meters, meters2 + 15));
    return { turn, text, meters: meters2, lat: spot.lat, lon: spot.lon };
  }
  function maneuver(coordinates) {
    const { samples, meters: meters2 } = routeSamples(coordinates);
    if (!samples.length) return maneuverAt(coordinates, 0, "straight", "Siga em frente");
    if (samples.length === 1) return maneuverAt(coordinates, meters2, "straight", "Siga em frente");
    let base = samples[0].head;
    for (let i = 1; i < samples.length; i += 1) {
      const delta = turnDelta(base, samples[i].head);
      if (Math.abs(delta) < 20) {
        base = samples[i].head;
        continue;
      }
      if (roundaboutAt(samples, i, base)) return maneuverAt(coordinates, samples[i].at, "roundabout", "Entre na rotunda");
      const kind = classifyTurn(delta);
      if (kind) return maneuverAt(coordinates, samples[i].at, kind.turn, kind.text);
      base = samples[i].head;
    }
    return maneuverAt(coordinates, meters2, "straight", "Siga em frente");
  }
  function edgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }
  function sameEdges(a, b) {
    if (!a?.edges || !b?.edges || a.edges.length !== b.edges.length) return false;
    for (let i = 0; i < a.edges.length; i += 1) if (a.edges[i] !== b.edges[i]) return false;
    return true;
  }
  function routePrepared(graph, from, to, penalty) {
    if (!graph || !from || !to) return penalty ? null : direct(from, to);
    const start = nearestNode(graph, from.lat, from.lon);
    const goal = nearestNode(graph, to.lat, to.lon);
    if (start < 0 || goal < 0 || start === goal) return penalty ? null : direct(from, to);
    const { nodes, adj } = graph;
    const count = nodes.length;
    const gScore = new Float64Array(count);
    const trueScore = new Float64Array(count);
    gScore.fill(Infinity);
    trueScore.fill(Infinity);
    gScore[start] = 0;
    trueScore[start] = 0;
    const prev = new Int32Array(count);
    prev.fill(-1);
    const settled = new Uint8Array(count);
    const goalLat = nodes[goal][0];
    const goalLon = nodes[goal][1];
    const heap = [[metersBetween2(nodes[start][0], nodes[start][1], goalLat, goalLon), start]];
    let found = false;
    while (heap.length) {
      const item = pop(heap);
      const u = item[1];
      if (settled[u]) continue;
      settled[u] = 1;
      if (u === goal) {
        found = true;
        break;
      }
      for (const edge of adj[u]) {
        if (settled[edge.to]) continue;
        const factor = penalty && penalty.has(edgeKey(u, edge.to)) ? 6 : 1;
        const next = gScore[u] + edge.len * factor;
        if (next >= gScore[edge.to]) continue;
        gScore[edge.to] = next;
        trueScore[edge.to] = trueScore[u] + edge.len;
        prev[edge.to] = u;
        const h = metersBetween2(nodes[edge.to][0], nodes[edge.to][1], goalLat, goalLon);
        push(heap, [next + h, edge.to]);
      }
    }
    if (!found) return penalty ? null : direct(from, to);
    const ids = [];
    for (let node = goal; node >= 0; node = prev[node]) {
      ids.push(node);
      if (node === start) break;
    }
    ids.reverse();
    if (ids[0] !== start) return penalty ? null : direct(from, to);
    const edges = [];
    const coordinates = [[from.lon, from.lat], [nodes[start][1], nodes[start][0]]];
    for (let i = 1; i < ids.length; i += 1) {
      edges.push(edgeKey(ids[i - 1], ids[i]));
      const edge = adj[ids[i - 1]].find((item) => item.to === ids[i]);
      const mids = edge && edge.dir === 1 ? edge.mid : edge ? [...edge.mid].reverse() : [];
      for (const [lat, lon] of mids) coordinates.push([lon, lat]);
      coordinates.push([nodes[ids[i]][1], nodes[ids[i]][0]]);
    }
    coordinates.push([to.lon, to.lat]);
    const link = metersBetween2(from.lat, from.lon, nodes[start][0], nodes[start][1]) + metersBetween2(nodes[goal][0], nodes[goal][1], to.lat, to.lon);
    return { coordinates, meters: trueScore[goal] + link, direct: false, edges };
  }
  function isMotorwayEdge(graph, edge) {
    return Boolean(graph?.klass) && (graph.klass[edge] & 7) === 0;
  }
  function findRoute(graph, from, to, penalty, mode = "car", maxMeters = Infinity, allow = null) {
    if (graph?.kind === "road") return routeOnRoad(graph, from, to, penalty, mode, maxMeters, allow);
    return routePrepared(graph, from, to, penalty);
  }
  function findRoutes(graph, from, to, mode = "car") {
    if (graph?.kind === "road") return findRoadRoutes(graph, from, to, mode);
    const first = findRoute(graph, from, to);
    if (!first) return [];
    const routes = [first];
    if (first.direct || !first.edges?.length) return routes;
    const used = new Set(first.edges);
    const second = findRoute(graph, from, to, used);
    if (second && !sameEdges(first, second)) {
      routes.push(second);
      const usedMore = /* @__PURE__ */ new Set([...used, ...second.edges || []]);
      const third = findRoute(graph, from, to, usedMore);
      if (third && !routes.some((route) => sameEdges(route, third))) routes.push(third);
    }
    return routes;
  }
  var ROAD_NONE = 4294967295;
  var WALK_BIT = 1;
  var SNAP_M = { walk: 55, bicycle: 22, car: 22 };
  var APPROACH_M = 1500;
  var MODE_BIT = { walk: WALK_BIT, bicycle: 2, car: 4 };
  function align4(value) {
    return value + 3 & ~3;
  }
  function createHeap() {
    let keys = new Float64Array(1024);
    let vals = new Int32Array(1024);
    let size = 0;
    return {
      get size() {
        return size;
      },
      push(key, val) {
        if (size === keys.length) {
          const nextKeys = new Float64Array(size * 2);
          const nextVals = new Int32Array(size * 2);
          nextKeys.set(keys);
          nextVals.set(vals);
          keys = nextKeys;
          vals = nextVals;
        }
        keys[size] = key;
        vals[size] = val;
        let index = size;
        size += 1;
        while (index > 0) {
          const parent = index - 1 >> 1;
          if (keys[parent] <= keys[index]) break;
          const keySwap = keys[parent];
          keys[parent] = keys[index];
          keys[index] = keySwap;
          const valSwap = vals[parent];
          vals[parent] = vals[index];
          vals[index] = valSwap;
          index = parent;
        }
      },
      pop() {
        const key = keys[0];
        const val = vals[0];
        size -= 1;
        if (size > 0) {
          keys[0] = keys[size];
          vals[0] = vals[size];
          let index = 0;
          for (; ; ) {
            let smallest = index;
            const left = index * 2 + 1;
            const right = left + 1;
            if (left < size && keys[left] < keys[smallest]) smallest = left;
            if (right < size && keys[right] < keys[smallest]) smallest = right;
            if (smallest === index) break;
            const keySwap = keys[smallest];
            keys[smallest] = keys[index];
            keys[index] = keySwap;
            const valSwap = vals[smallest];
            vals[smallest] = vals[index];
            vals[index] = valSwap;
            index = smallest;
          }
        }
        return [key, val];
      }
    };
  }
  function openRoadGraph(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 64 || view.getUint8(0) !== 82 || view.getUint8(1) !== 68 || view.getUint8(2) !== 71 || view.getUint8(3) !== 49) {
      throw new Error("roads");
    }
    if (view.getUint32(4, true) !== 1) throw new Error("roads");
    const nodeCount = view.getUint32(8, true);
    const edgeCount = view.getUint32(12, true);
    const geomCount = view.getUint32(16, true);
    const cellCount = view.getUint32(20, true);
    const gridLat0 = view.getInt32(24, true);
    const gridLon0 = view.getInt32(28, true);
    const gridLatN = view.getUint32(32, true);
    const gridLonN = view.getUint32(36, true);
    const gridStep = view.getUint32(40, true);
    const bytes = view.getUint32(44, true);
    if (bytes && bytes !== buffer.byteLength) throw new Error("roads");
    let offset = 64;
    const lat = new Int32Array(buffer, offset, nodeCount);
    offset += nodeCount * 4;
    const lon = new Int32Array(buffer, offset, nodeCount);
    offset += nodeCount * 4;
    const head = new Uint32Array(buffer, offset, nodeCount + 1);
    offset += (nodeCount + 1) * 4;
    const from = new Uint32Array(buffer, offset, edgeCount);
    offset += edgeCount * 4;
    const to = new Uint32Array(buffer, offset, edgeCount);
    offset += edgeCount * 4;
    const len = new Uint32Array(buffer, offset, edgeCount);
    offset += edgeCount * 4;
    const rev = new Uint32Array(buffer, offset, edgeCount);
    offset += edgeCount * 4;
    const access = new Uint8Array(buffer, offset, edgeCount);
    offset = align4(offset + edgeCount);
    const klass = new Uint8Array(buffer, offset, edgeCount);
    offset = align4(offset + edgeCount);
    const geomOff = new Uint32Array(buffer, offset, edgeCount);
    offset += edgeCount * 4;
    const geomN = new Uint16Array(buffer, offset, edgeCount);
    offset = align4(offset + edgeCount * 2);
    const geomLat = new Int32Array(buffer, offset, geomCount);
    offset += geomCount * 4;
    const geomLon = new Int32Array(buffer, offset, geomCount);
    offset += geomCount * 4;
    const cellHead = new Uint32Array(buffer, offset, cellCount + 1);
    offset += (cellCount + 1) * 4;
    const cellEdgeCount = cellHead[cellCount];
    const cellEdges = new Uint32Array(buffer, offset, cellEdgeCount);
    offset += cellEdgeCount * 4;
    if (offset !== buffer.byteLength) throw new Error("roads");
    return {
      kind: "road",
      nodeCount,
      edgeCount,
      lat,
      lon,
      head,
      from,
      to,
      len,
      rev,
      access,
      klass,
      geomOff,
      geomN,
      geomLat,
      geomLon,
      cellHead,
      cellEdges,
      gridLat0,
      gridLon0,
      gridLatN,
      gridLonN,
      gridStep,
      bytes: buffer.byteLength
    };
  }
  function pushCoord(coordinates, lon, lat) {
    const last = coordinates[coordinates.length - 1];
    if (last && Math.abs(last[0] - lon) < 1e-6 && Math.abs(last[1] - lat) < 1e-6) return;
    coordinates.push([lon, lat]);
  }
  function nodeLat(graph, node) {
    return graph.lat[node] * 1e-7;
  }
  function nodeLon(graph, node) {
    return graph.lon[node] * 1e-7;
  }
  function edgeLine(graph, edge) {
    const from = graph.from[edge];
    const to = graph.to[edge];
    const count = graph.geomN[edge];
    const off = count ? graph.geomOff[edge] : 0;
    const total = count + 2;
    const lat = new Float64Array(total);
    const lon = new Float64Array(total);
    const at = new Float64Array(total);
    lat[0] = nodeLat(graph, from);
    lon[0] = nodeLon(graph, from);
    for (let i = 0; i < count; i += 1) {
      lat[i + 1] = graph.geomLat[off + i] * 1e-7;
      lon[i + 1] = graph.geomLon[off + i] * 1e-7;
    }
    lat[total - 1] = nodeLat(graph, to);
    lon[total - 1] = nodeLon(graph, to);
    for (let i = 1; i < total; i += 1) at[i] = at[i - 1] + metersBetween2(lat[i - 1], lon[i - 1], lat[i], lon[i]);
    return { lat, lon, at, total: at[total - 1] };
  }
  function pointAt(line, meters2) {
    if (meters2 <= 0) return [line.lon[0], line.lat[0]];
    if (meters2 >= line.total) return [line.lon[line.lon.length - 1], line.lat[line.lat.length - 1]];
    let index = 1;
    while (index < line.at.length - 1 && line.at[index] < meters2) index += 1;
    const span = line.at[index] - line.at[index - 1];
    const tee = span > 0 ? (meters2 - line.at[index - 1]) / span : 0;
    return [line.lon[index - 1] + (line.lon[index] - line.lon[index - 1]) * tee, line.lat[index - 1] + (line.lat[index] - line.lat[index - 1]) * tee];
  }
  function sliceLine(line, fromM, toM) {
    const start = Math.max(0, Math.min(fromM, line.total));
    const end = Math.max(start, Math.min(toM, line.total));
    const coordinates = [pointAt(line, start)];
    for (let index = 1; index < line.at.length - 1; index += 1) {
      if (line.at[index] <= start + 0.3) continue;
      if (line.at[index] >= end - 0.3) break;
      coordinates.push([line.lon[index], line.lat[index]]);
    }
    const last = pointAt(line, end);
    pushCoord(coordinates, last[0], last[1]);
    return coordinates;
  }
  function appendLine(coordinates, line, fromM, toM) {
    for (const [lon, lat] of sliceLine(line, fromM, toM)) pushCoord(coordinates, lon, lat);
  }
  function projectEdge(graph, edge, lat, lon) {
    const from = graph.from[edge];
    const to = graph.to[edge];
    const count = graph.geomN[edge];
    const off = count ? graph.geomOff[edge] : 0;
    const xScale = Math.cos(lat * 0.017453292519943295) * 111320;
    let prevLat = nodeLat(graph, from);
    let prevLon = nodeLon(graph, from);
    let best = Infinity;
    let bestLat = prevLat;
    let bestLon = prevLon;
    let bestAlong = 0;
    let walked = 0;
    const steps = count + 1;
    for (let index = 0; index < steps; index += 1) {
      const nextLat = index < count ? graph.geomLat[off + index] * 1e-7 : nodeLat(graph, to);
      const nextLon = index < count ? graph.geomLon[off + index] * 1e-7 : nodeLon(graph, to);
      const ax = prevLon * xScale;
      const bx = nextLon * xScale;
      const px = lon * xScale;
      const ay = prevLat * 110540;
      const by = nextLat * 110540;
      const py = lat * 110540;
      const dx = bx - ax;
      const dy = by - ay;
      const den = dx * dx + dy * dy;
      let tee = 0;
      if (den > 0) {
        tee = ((px - ax) * dx + (py - ay) * dy) / den;
        if (tee < 0) tee = 0;
        else if (tee > 1) tee = 1;
      }
      const qLat = (ay + dy * tee) / 110540;
      const qLon = (ax + dx * tee) / xScale;
      const dist = Math.hypot((qLat - lat) * 110540, (qLon - lon) * xScale);
      const seg = metersBetween2(prevLat, prevLon, nextLat, nextLon);
      if (dist < best) {
        best = dist;
        bestLat = qLat;
        bestLon = qLon;
        bestAlong = walked + tee * seg;
      }
      walked += seg;
      prevLat = nextLat;
      prevLon = nextLon;
    }
    return { edge, dist: best, lat: bestLat, lon: bestLon, along: bestAlong, total: walked };
  }
  function snapPoint(graph, lat, lon, bit, maxMeters, skip) {
    const gy = Math.floor((lat * 1e7 - graph.gridLat0) / graph.gridStep);
    const gx = Math.floor((lon * 1e7 - graph.gridLon0) / graph.gridStep);
    if (!graph.edgeSeen || graph.edgeSeen.length !== graph.edgeCount) {
      graph.edgeSeen = new Uint32Array(graph.edgeCount);
      graph.edgeTick = 1;
    }
    graph.edgeTick = graph.edgeTick + 1 >>> 0;
    if (graph.edgeTick === 0) {
      graph.edgeSeen.fill(0);
      graph.edgeTick = 1;
    }
    const tick = graph.edgeTick;
    let best = null;
    const visit = (y, x) => {
      if (y < 0 || x < 0 || y >= graph.gridLatN || x >= graph.gridLonN) return;
      const cell = y * graph.gridLonN + x;
      for (let index = graph.cellHead[cell]; index < graph.cellHead[cell + 1]; index += 1) {
        const edge = graph.cellEdges[index];
        if (graph.edgeSeen[edge] === tick) continue;
        graph.edgeSeen[edge] = tick;
        if (skip && skip.has(edge)) continue;
        if (!permitted(graph, edge, bit)) continue;
        const hit = projectEdge(graph, edge, lat, lon);
        if (!best || hit.dist < best.dist) best = hit;
      }
    };
    for (let y = gy - 1; y <= gy + 1; y += 1) {
      for (let x = gx - 1; x <= gx + 1; x += 1) visit(y, x);
    }
    if (!best || best.dist > maxMeters) {
      for (let y = gy - 2; y <= gy + 2; y += 1) {
        for (let x = gx - 2; x <= gx + 2; x += 1) {
          if (Math.abs(y - gy) <= 1 && Math.abs(x - gx) <= 1) continue;
          visit(y, x);
        }
      }
    }
    if (!best || best.dist > maxMeters) return null;
    return best;
  }
  function edgeCutsBuilding(graph, edge) {
    if (!graph.buildings?.cuts || graph.costMode !== "walk") return false;
    if (!graph.walkOpen || graph.walkOpen.length !== graph.edgeCount) graph.walkOpen = new Uint8Array(graph.edgeCount);
    const known = graph.walkOpen[edge];
    if (known) return known === 2;
    const line = edgeLine(graph, edge);
    let cuts = false;
    for (let index = 1; index < line.lat.length; index += 1) {
      if (graph.buildings.cuts(line.lat[index - 1], line.lon[index - 1], line.lat[index], line.lon[index])) {
        cuts = true;
        break;
      }
    }
    graph.walkOpen[edge] = cuts ? 2 : 1;
    return cuts;
  }
  function permitted(graph, edge, bit) {
    const access = graph.access[edge] || 0;
    let allowed = (access & bit) !== 0;
    if (!allowed && bit === WALK_BIT && graph.klass && graph.len[edge] <= 40 && (graph.klass[edge] & 7) >= 3 && (access & 6) !== 0) allowed = true;
    if (!allowed) return false;
    if (graph.allow && !graph.allow(edge)) return false;
    if (bit === WALK_BIT && edgeCutsBuilding(graph, edge)) return false;
    return true;
  }
  function bestRoadExit(graph, node, heading, bit, skipEdge) {
    let best = -1;
    let bestAbs = 181;
    const lat = nodeLat(graph, node);
    const lon = nodeLon(graph, node);
    for (let edge = graph.head[node]; edge < graph.head[node + 1]; edge += 1) {
      if (edge === skipEdge || !permitted(graph, edge, bit)) continue;
      const line = edgeLine(graph, edge);
      const aim = pointAt(line, Math.min(8, line.total));
      const bearing = bearingDeg(lon, lat, aim[0], aim[1]);
      const delta = Math.abs(turnDelta(heading, bearing));
      if (delta < bestAbs) {
        bestAbs = delta;
        best = edge;
      }
    }
    return best;
  }
  function moveAlongRoad(graph, lat, lon, distanceM, headingDeg, mode = "walk") {
    if (!graph || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const bit = MODE_BIT[mode] || MODE_BIT.walk;
    const snap = snapPoint(graph, lat, lon, bit, mode === "walk" ? 80 : 45, null);
    if (!snap) return null;
    if (!(distanceM > 0) || !Number.isFinite(headingDeg)) return { lat: snap.lat, lon: snap.lon };
    let edge = snap.edge;
    let line = edgeLine(graph, edge);
    let along = snap.along;
    let dir = 1;
    const aheadPoint = pointAt(line, Math.min(line.total, along + 6));
    const ahead = bearingDeg(snap.lon, snap.lat, aheadPoint[0], aheadPoint[1]);
    let preferBack = false;
    if (along > 4) {
      const backPoint = pointAt(line, Math.max(0, along - 6));
      const back = bearingDeg(snap.lon, snap.lat, backPoint[0], backPoint[1]);
      preferBack = Math.abs(turnDelta(headingDeg, back)) + 8 < Math.abs(turnDelta(headingDeg, ahead));
    }
    if (preferBack) {
      const rev = graph.rev[edge];
      if (rev !== ROAD_NONE && permitted(graph, rev, bit)) {
        edge = rev;
        line = edgeLine(graph, edge);
        along = Math.max(0, line.total - snap.along);
      } else {
        dir = -1;
      }
    }
    let remain = distanceM;
    for (let guard = 0; guard < 40 && remain > 0.2; guard += 1) {
      if (dir > 0) {
        const room = line.total - along;
        if (room >= remain) {
          const point3 = pointAt(line, along + remain);
          return { lat: point3[1], lon: point3[0] };
        }
        remain -= Math.max(0, room);
        const node2 = graph.to[edge];
        const skip = graph.rev[edge];
        const next2 = bestRoadExit(graph, node2, headingDeg, bit, skip === ROAD_NONE ? -1 : skip);
        if (next2 < 0) {
          const point3 = pointAt(line, line.total);
          return { lat: point3[1], lon: point3[0] };
        }
        edge = next2;
        line = edgeLine(graph, edge);
        along = 0;
        dir = 1;
        continue;
      }
      if (along >= remain) {
        const point3 = pointAt(line, along - remain);
        return { lat: point3[1], lon: point3[0] };
      }
      remain -= Math.max(0, along);
      const node = graph.from[edge];
      const next = bestRoadExit(graph, node, headingDeg, bit, edge);
      if (next < 0) {
        const point3 = pointAt(line, 0);
        return { lat: point3[1], lon: point3[0] };
      }
      edge = next;
      line = edgeLine(graph, edge);
      along = 0;
      dir = 1;
    }
    const point2 = pointAt(line, dir > 0 ? along : Math.max(0, along));
    return { lat: point2[1], lon: point2[0] };
  }
  function hasOutgoing(graph, node, bit) {
    for (let edge = graph.head[node]; edge < graph.head[node + 1]; edge += 1) {
      if (permitted(graph, edge, bit)) return true;
    }
    return false;
  }
  function appendEdge(graph, coordinates, edge) {
    const line = edgeLine(graph, edge);
    for (let index = 1; index < line.lat.length; index += 1) pushCoord(coordinates, line.lon[index], line.lat[index]);
  }
  function leaveSnap(graph, snap, point2, bit, penalty) {
    const results = [];
    const add = (edge) => {
      if (!permitted(graph, edge, bit)) return;
      const hit = edge === snap.edge ? snap : projectEdge(graph, edge, snap.lat, snap.lon);
      const line = edgeLine(graph, edge);
      if (!linkAllowed(graph, point2.lat, point2.lon, hit.lat, hit.lon)) return;
      const connector = connectorCost(graph, metersBetween2(point2.lat, point2.lon, hit.lat, hit.lon));
      const startLon = point2.lon;
      const startLat = point2.lat;
      if (hit.along <= 2) {
        const coordinates = [[startLon, startLat]];
        pushCoord(coordinates, nodeLon(graph, graph.from[edge]), nodeLat(graph, graph.from[edge]));
        results.push({ node: graph.from[edge], cost: connector, coordinates, edges: [] });
      }
      const remain = line.total - hit.along;
      if (remain <= 2) {
        const coordinates = [[startLon, startLat]];
        pushCoord(coordinates, nodeLon(graph, graph.to[edge]), nodeLat(graph, graph.to[edge]));
        results.push({ node: graph.to[edge], cost: connector, coordinates, edges: [] });
      } else {
        let weight = edgeCost(graph, edge, remain);
        if (penalty && penalty.has(edge)) weight *= 6;
        const coordinates = [[startLon, startLat]];
        appendLine(coordinates, line, hit.along, line.total);
        results.push({ node: graph.to[edge], cost: connector + weight, coordinates, edges: [edge] });
      }
    };
    add(snap.edge);
    const rev = graph.rev[snap.edge];
    if (rev !== ROAD_NONE) add(rev);
    return results;
  }
  function enterSnap(graph, snap, point2, bit, penalty) {
    const results = [];
    const add = (edge) => {
      if (!permitted(graph, edge, bit)) return;
      const hit = edge === snap.edge ? snap : projectEdge(graph, edge, point2.lat, point2.lon);
      const line = edgeLine(graph, edge);
      if (!linkAllowed(graph, point2.lat, point2.lon, hit.lat, hit.lon)) return;
      const connector = connectorCost(graph, metersBetween2(point2.lat, point2.lon, hit.lat, hit.lon));
      if (hit.along <= 2) {
        const coordinates = [[nodeLon(graph, graph.from[edge]), nodeLat(graph, graph.from[edge])]];
        pushCoord(coordinates, point2.lon, point2.lat);
        results.push({ node: graph.from[edge], cost: connector, coordinates, edges: [] });
      } else {
        let weight = edgeCost(graph, edge, hit.along);
        if (penalty && penalty.has(edge)) weight *= 6;
        const coordinates = [];
        appendLine(coordinates, line, 0, hit.along);
        pushCoord(coordinates, point2.lon, point2.lat);
        results.push({ node: graph.from[edge], cost: connector + weight, coordinates, edges: [edge] });
      }
      if (line.total - hit.along <= 2) {
        const coordinates = [[nodeLon(graph, graph.to[edge]), nodeLat(graph, graph.to[edge])]];
        pushCoord(coordinates, point2.lon, point2.lat);
        results.push({ node: graph.to[edge], cost: connector, coordinates, edges: [] });
      }
    };
    add(snap.edge);
    const rev = graph.rev[snap.edge];
    if (rev !== ROAD_NONE) add(rev);
    return results;
  }
  function approachFromWalk(graph, point2, bit, walk) {
    const saved = graph.costMode;
    graph.costMode = "walk";
    const starts = leaveSnap(graph, walk, point2, WALK_BIT, null);
    graph.costMode = saved;
    const best = /* @__PURE__ */ new Map();
    const heap = createHeap();
    const seen = [];
    for (const start of starts) {
      const known = best.get(start.node);
      if (known && known.cost <= start.cost) continue;
      best.set(start.node, { node: start.node, cost: start.cost, coordinates: start.coordinates, edges: [] });
      heap.push(start.cost, start.node);
    }
    const found = [];
    let pops = 0;
    while (heap.size && pops < 12e3) {
      const popped = heap.pop();
      const node = popped[1];
      const known = best.get(node);
      if (!known || popped[0] > known.cost + 0.2) continue;
      pops += 1;
      if (hasOutgoing(graph, node, bit)) found.push(known);
      if (known.cost > APPROACH_M) continue;
      for (let edge = graph.head[node]; edge < graph.head[node + 1]; edge += 1) {
        if ((graph.access[edge] & WALK_BIT) === 0) continue;
        seen.push(edge);
        const next = graph.to[edge];
        const cost = known.cost + graph.len[edge];
        if (cost > APPROACH_M) continue;
        const previous = best.get(next);
        if (previous && previous.cost <= cost) continue;
        const coordinates = known.coordinates.slice();
        appendEdge(graph, coordinates, edge);
        best.set(next, { node: next, cost, coordinates, edges: [] });
        heap.push(cost, next);
      }
    }
    found.sort((a, b) => a.cost - b.cost);
    return { found, seen };
  }
  function linkAllowed(graph, fromLat, fromLon, toLat, toLon) {
    if (!graph.buildings || graph.costMode !== "walk") return true;
    const check = graph.buildings.links || graph.buildings.allows;
    return check(fromLat, fromLon, toLat, toLon);
  }
  function snapOnNode(graph, edge, node, point2) {
    const lat = nodeLat(graph, node);
    const lon = nodeLon(graph, node);
    const line = edgeLine(graph, edge);
    const atEnd = node === graph.to[edge];
    return {
      edge,
      dist: metersBetween2(point2.lat, point2.lon, lat, lon),
      lat,
      lon,
      along: atEnd ? line.total : 0,
      total: line.total
    };
  }
  function walkSnap(graph, point2, skip) {
    const skipped = new Set(skip || []);
    for (const max of [55, 140, 280]) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const hit = snapPoint(graph, point2.lat, point2.lon, WALK_BIT, max, skipped);
        if (!hit) break;
        if (linkAllowed(graph, point2.lat, point2.lon, hit.lat, hit.lon)) return { kind: "edge", snap: hit };
        const ends = [graph.from[hit.edge], graph.to[hit.edge]];
        let best = null;
        for (const node of ends) {
          const lat = nodeLat(graph, node);
          const lon = nodeLon(graph, node);
          if (!linkAllowed(graph, point2.lat, point2.lon, lat, lon)) continue;
          const candidate = snapOnNode(graph, hit.edge, node, point2);
          if (!best || candidate.dist < best.dist) best = candidate;
        }
        if (best) return { kind: "edge", snap: best };
        skipped.add(hit.edge);
        const rev = graph.rev[hit.edge];
        if (rev !== ROAD_NONE) skipped.add(rev);
      }
    }
    return null;
  }
  function approachNodes(graph, point2, bit, skip) {
    const mode = bit === WALK_BIT ? "walk" : bit === 2 ? "bicycle" : "car";
    if (bit === WALK_BIT && graph.buildings) return walkSnap(graph, point2, skip);
    const direct2 = snapPoint(graph, point2.lat, point2.lon, bit, SNAP_M[mode], skip);
    if (direct2) return { kind: "edge", snap: direct2 };
    if (bit === WALK_BIT) {
      const farther2 = snapPoint(graph, point2.lat, point2.lon, bit, 140, skip);
      return farther2 ? { kind: "edge", snap: farther2 } : null;
    }
    const skipped = new Set(skip || []);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const walk = snapPoint(graph, point2.lat, point2.lon, WALK_BIT, 140, skipped);
      if (!walk) break;
      const { found, seen } = approachFromWalk(graph, point2, bit, walk);
      if (found.length) return { kind: "nodes", nodes: found.slice(0, 48) };
      skipped.add(walk.edge);
      const rev = graph.rev[walk.edge];
      if (rev !== ROAD_NONE) skipped.add(rev);
      for (const edge of seen) skipped.add(edge);
    }
    const farther = snapPoint(graph, point2.lat, point2.lon, bit, 450, skip);
    return farther ? { kind: "edge", snap: farther } : null;
  }
  function terminalsFor(graph, access, point2, bit, penalty, towardDoor) {
    if (!access) return [];
    if (access.kind === "nodes") {
      return access.nodes.map((node) => ({
        node: node.node,
        cost: timed(graph) ? secondsFor(node.cost, TRAVEL_KMH.walk) : node.cost,
        coordinates: towardDoor ? node.coordinates.slice().reverse() : node.coordinates,
        edges: []
      }));
    }
    return towardDoor ? enterSnap(graph, access.snap, point2, bit, penalty) : leaveSnap(graph, access.snap, point2, bit, penalty);
  }
  function sameEdgeRoute(graph, from, to, fromAccess, toAccess, bit, penalty) {
    if (!fromAccess || !toAccess || fromAccess.kind !== "edge" || toAccess.kind !== "edge") return null;
    const seen = /* @__PURE__ */ new Set([fromAccess.snap.edge, toAccess.snap.edge]);
    const revFrom = graph.rev[fromAccess.snap.edge];
    const revTo = graph.rev[toAccess.snap.edge];
    if (revFrom !== ROAD_NONE) seen.add(revFrom);
    if (revTo !== ROAD_NONE) seen.add(revTo);
    let best = null;
    for (const edge of seen) {
      if (!permitted(graph, edge, bit)) continue;
      const start = projectEdge(graph, edge, from.lat, from.lon);
      const end = projectEdge(graph, edge, to.lat, to.lon);
      if (end.along + 1 < start.along) continue;
      if (start.dist > 160 || end.dist > 160) continue;
      const line = edgeLine(graph, edge);
      if (!linkAllowed(graph, from.lat, from.lon, start.lat, start.lon)) continue;
      if (!linkAllowed(graph, end.lat, end.lon, to.lat, to.lon)) continue;
      const coordinates = [];
      pushCoord(coordinates, from.lon, from.lat);
      appendLine(coordinates, line, start.along, end.along);
      pushCoord(coordinates, to.lon, to.lat);
      const meters2 = pathMeters(coordinates);
      const along = Math.max(0, end.along - start.along);
      let cost = connectorCost(graph, metersBetween2(from.lat, from.lon, start.lat, start.lon)) + edgeCost(graph, edge, along) + connectorCost(graph, metersBetween2(end.lat, end.lon, to.lat, to.lon));
      if (penalty && penalty.has(edge)) cost += Math.max(0, end.along - start.along) * 5;
      if (!best || cost < best.cost) best = { cost, route: finishRoute(graph, { coordinates, meters: meters2, direct: false, edges: [edge] }, cost) };
    }
    return best;
  }
  function pathMeters(coordinates) {
    let meters2 = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      meters2 += metersBetween2(coordinates[index - 1][1], coordinates[index - 1][0], coordinates[index][1], coordinates[index][0]);
    }
    return meters2;
  }
  function ensureScratch(graph) {
    if (graph.gScore && graph.gScore.length === graph.nodeCount) return;
    graph.gScore = new Float64Array(graph.nodeCount);
    graph.prevN = new Int32Array(graph.nodeCount);
    graph.prevE = new Int32Array(graph.nodeCount);
    graph.settled = new Uint8Array(graph.nodeCount);
    graph.stamp = new Uint32Array(graph.nodeCount);
    graph.tick = 1;
  }
  function touchNode(graph, node) {
    if (graph.stamp[node] !== graph.tick) {
      graph.stamp[node] = graph.tick;
      graph.gScore[node] = Infinity;
      graph.settled[node] = 0;
    }
  }
  function searchRoads(graph, sources, goals, bit, penalty, target, limit, bestCost) {
    if (!sources.length || !goals.length) return null;
    ensureScratch(graph);
    graph.tick = graph.tick + 1 >>> 0;
    if (graph.tick === 0) {
      graph.stamp.fill(0);
      graph.tick = 1;
    }
    const prefix = /* @__PURE__ */ new Map();
    const goalAt = /* @__PURE__ */ new Map();
    const heap = createHeap();
    for (const source2 of sources) {
      touchNode(graph, source2.node);
      if (source2.cost >= graph.gScore[source2.node]) continue;
      graph.gScore[source2.node] = source2.cost;
      graph.prevN[source2.node] = -1;
      graph.prevE[source2.node] = -1;
      prefix.set(source2.node, source2);
      const estimate = heuristicCost(graph, metersBetween2(nodeLat(graph, source2.node), nodeLon(graph, source2.node), target.lat, target.lon));
      heap.push(source2.cost + estimate, source2.node);
    }
    for (const goal2 of goals) {
      const known = goalAt.get(goal2.node);
      if (!known || goal2.cost < known.cost) goalAt.set(goal2.node, goal2);
    }
    let best = bestCost;
    let bestNode = -1;
    for (const source2 of sources) {
      const goal2 = goalAt.get(source2.node);
      if (!goal2) continue;
      const cost = source2.cost + goal2.cost;
      if (cost < best) {
        best = cost;
        bestNode = source2.node;
      }
    }
    let pops = 0;
    while (heap.size) {
      const node = heap.pop()[1];
      touchNode(graph, node);
      if (graph.settled[node]) continue;
      graph.settled[node] = 1;
      pops += 1;
      const spent = graph.gScore[node];
      const goal2 = goalAt.get(node);
      if (goal2 && spent + goal2.cost < best) {
        best = spent + goal2.cost;
        bestNode = node;
      }
      const estimate = heuristicCost(graph, metersBetween2(nodeLat(graph, node), nodeLon(graph, node), target.lat, target.lon));
      if (spent + estimate >= best) break;
      if (limit && spent > limit) break;
      if (pops > 9e5) break;
      for (let edge = graph.head[node]; edge < graph.head[node + 1]; edge += 1) {
        if (!permitted(graph, edge, bit)) continue;
        let weight = edgeCost(graph, edge, graph.len[edge]);
        if (penalty && penalty.has(edge)) weight *= 6;
        const next = graph.to[edge];
        const nextCost = spent + weight;
        touchNode(graph, next);
        if (nextCost >= graph.gScore[next]) continue;
        graph.gScore[next] = nextCost;
        graph.prevN[next] = node;
        graph.prevE[next] = edge;
        const nextEstimate = heuristicCost(graph, metersBetween2(nodeLat(graph, next), nodeLon(graph, next), target.lat, target.lon));
        heap.push(nextCost + nextEstimate, next);
      }
    }
    if (bestNode < 0 || !prefix.has(startOf(graph, bestNode))) return { cost: Infinity, route: null, exhausted: pops < 800 };
    const nodes = [];
    let cursor = bestNode;
    while (cursor !== -1) {
      nodes.push(cursor);
      cursor = graph.prevN[cursor];
    }
    nodes.reverse();
    const source = prefix.get(nodes[0]);
    if (!source) return null;
    const coordinates = source.coordinates.slice();
    const edges = [...source.edges || []];
    for (let index = 1; index < nodes.length; index += 1) {
      const edge = graph.prevE[nodes[index]];
      edges.push(edge);
      appendEdge(graph, coordinates, edge);
    }
    const goal = goalAt.get(bestNode);
    if (goal) {
      for (let index = 1; index < goal.coordinates.length; index += 1) {
        pushCoord(coordinates, goal.coordinates[index][0], goal.coordinates[index][1]);
      }
      if (goal.edges) edges.push(...goal.edges);
    }
    return { cost: best, route: finishRoute(graph, { coordinates, meters: pathMeters(coordinates), direct: false, edges }, best) };
  }
  function startOf(graph, node) {
    let cursor = node;
    let guard = 0;
    while (graph.prevN[cursor] !== -1 && guard < graph.nodeCount) {
      cursor = graph.prevN[cursor];
      guard += 1;
    }
    return cursor;
  }
  function samePlace(point2, place) {
    return point2 && place && Math.abs(point2[0] - place.lon) < 1e-7 && Math.abs(point2[1] - place.lat) < 1e-7;
  }
  function sealWalkEnds(graph, route, from, to) {
    if (!route || graph.costMode !== "walk" || !from || !to) return route;
    const coordinates = route.coordinates.slice();
    if (!coordinates.length) return route;
    if (!samePlace(coordinates[0], from) && linkAllowed(graph, from.lat, from.lon, coordinates[0][1], coordinates[0][0])) {
      coordinates.unshift([from.lon, from.lat]);
    }
    const last = coordinates[coordinates.length - 1];
    if (!samePlace(last, to) && linkAllowed(graph, last[1], last[0], to.lat, to.lon)) coordinates.push([to.lon, to.lat]);
    route.coordinates = coordinates;
    route.meters = pathMeters(coordinates);
    return route;
  }
  function finishRoute(graph, route, cost) {
    if (!route) return route;
    if (timed(graph) && Number.isFinite(cost)) route.seconds = cost;
    else {
      const kmh = TRAVEL_KMH[graph?.costMode] || TRAVEL_KMH.walk;
      route.seconds = secondsFor(route.meters, kmh);
    }
    return route;
  }
  function walkGapRoute(graph, from, to) {
    const book = graph.buildings;
    if (!book?.cuts || !book.links || graph.costMode !== "walk") return null;
    const crow = metersBetween2(from.lat, from.lon, to.lat, to.lon);
    if (crow < 12 || crow > 850) return null;
    const cos = Math.cos((from.lat + to.lat) / 2 * 0.017453292519943295);
    const padLat = 80 / 111320;
    const padLon = 80 / (111320 * cos);
    const south = Math.min(from.lat, to.lat) - padLat;
    const north = Math.max(from.lat, to.lat) + padLat;
    const west = Math.min(from.lon, to.lon) - padLon;
    const east = Math.max(from.lon, to.lon) + padLon;
    const step = 4;
    const dlat = step / 111320;
    const dlon = step / (111320 * cos);
    const rows = Math.ceil((north - south) / dlat);
    const cols = Math.ceil((east - west) / dlon);
    if (rows < 2 || cols < 2 || rows * cols > 8e4) return null;
    const open = new Uint8Array(rows * cols);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const lat = south + (row + 0.5) * dlat;
        const lon = west + (col + 0.5) * dlon;
        open[row * cols + col] = book.cuts(lat, lon, lat + 2.2 / 111320, lon) ? 0 : 1;
      }
    }
    const cellAt = (lat, lon) => {
      const row = Math.max(0, Math.min(rows - 1, Math.floor((lat - south) / dlat)));
      const col = Math.max(0, Math.min(cols - 1, Math.floor((lon - west) / dlon)));
      return row * cols + col;
    };
    const center = (cell) => {
      const row = Math.floor(cell / cols);
      const col = cell % cols;
      return [west + (col + 0.5) * dlon, south + (row + 0.5) * dlat];
    };
    const nearest = (lat, lon) => {
      let best = -1;
      let bestD = 48;
      for (let cell = 0; cell < open.length; cell += 1) {
        if (!open[cell]) continue;
        const point2 = center(cell);
        const distance = metersBetween2(lat, lon, point2[1], point2[0]);
        if (distance < bestD) {
          bestD = distance;
          best = cell;
        }
      }
      return best;
    };
    const start = nearest(from.lat, from.lon);
    const goal = nearest(to.lat, to.lon);
    if (start < 0 || goal < 0) return null;
    const segmentOk = (lon1, lat1, lon2, lat2) => !book.cuts(lat1, lon1, lat2, lon2) || book.links(lat1, lon1, lat2, lon2) || book.links(lat2, lon2, lat1, lon1);
    if (!segmentOk(from.lon, from.lat, center(start)[0], center(start)[1])) return null;
    if (!segmentOk(center(goal)[0], center(goal)[1], to.lon, to.lat)) return null;
    const heap = createHeap();
    const cost = new Float64Array(open.length);
    const prev = new Int32Array(open.length);
    cost.fill(Infinity);
    prev.fill(-1);
    cost[start] = 0;
    const goalPoint = center(goal);
    heap.push(metersBetween2(center(start)[1], center(start)[0], goalPoint[1], goalPoint[0]), start);
    const steps = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ];
    let found = false;
    while (heap.size) {
      const cell = heap.pop()[1];
      if (cell === goal) {
        found = true;
        break;
      }
      const row = Math.floor(cell / cols);
      const col = cell % cols;
      const spent = cost[cell];
      for (const [dRow, dCol] of steps) {
        const nextRow = row + dRow;
        const nextCol = col + dCol;
        if (nextRow < 0 || nextCol < 0 || nextRow >= rows || nextCol >= cols) continue;
        const next = nextRow * cols + nextCol;
        if (!open[next]) continue;
        if (dRow && dCol && (!open[row * cols + nextCol] || !open[nextRow * cols + col])) continue;
        const nextCost = spent + Math.hypot(dRow * step, dCol * step);
        if (nextCost >= cost[next]) continue;
        cost[next] = nextCost;
        prev[next] = cell;
        const point2 = center(next);
        heap.push(nextCost + metersBetween2(point2[1], point2[0], goalPoint[1], goalPoint[0]), next);
      }
    }
    if (!found) return null;
    const points = [[to.lon, to.lat]];
    let cursor = goal;
    let guard = 0;
    while (cursor !== start && guard < open.length) {
      points.push(center(cursor));
      cursor = prev[cursor];
      guard += 1;
    }
    points.push(center(start));
    points.push([from.lon, from.lat]);
    points.reverse();
    const pulled = [points[0]];
    let index = 0;
    while (index < points.length - 1) {
      let next = index + 1;
      for (let candidate = points.length - 1; candidate > index + 1; candidate -= 1) {
        const fromPoint = points[index];
        const toPoint = points[candidate];
        if (segmentOk(fromPoint[0], fromPoint[1], toPoint[0], toPoint[1])) {
          next = candidate;
          break;
        }
      }
      pulled.push(points[next]);
      index = next;
    }
    for (let segment = 1; segment < pulled.length; segment += 1) {
      const fromPoint = pulled[segment - 1];
      const toPoint = pulled[segment];
      if (!segmentOk(fromPoint[0], fromPoint[1], toPoint[0], toPoint[1])) return null;
    }
    const meters2 = pathMeters(pulled);
    if (meters2 > crow * 2.4 + 40) return null;
    return finishRoute(graph, { coordinates: pulled, meters: meters2, direct: false, edges: [] }, meters2);
  }
  function routeOnRoad(graph, from, to, penalty, mode, maxMeters, allow) {
    if (!graph || !from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) return null;
    const previousAllow = graph.allow;
    const previousMode = graph.costMode;
    graph.allow = allow || null;
    graph.costMode = mode || "car";
    try {
      return routeOnRoadBody(graph, from, to, penalty, mode, maxMeters);
    } finally {
      graph.allow = previousAllow;
      graph.costMode = previousMode;
    }
  }
  function routeOnRoadBody(graph, from, to, penalty, mode, maxMeters) {
    if (!graph || !from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) return null;
    const bit = MODE_BIT[mode] || MODE_BIT.car;
    if (metersBetween2(from.lat, from.lon, to.lat, to.lon) < 8 && linkAllowed(graph, from.lat, from.lon, to.lat, to.lon)) {
      const meters2 = metersBetween2(from.lat, from.lon, to.lat, to.lon);
      return finishRoute(graph, { coordinates: [[from.lon, from.lat], [to.lon, to.lat]], meters: meters2, direct: false, edges: [] }, connectorCost(graph, meters2));
    }
    const blocked = /* @__PURE__ */ new Set();
    const crow = metersBetween2(from.lat, from.lon, to.lat, to.lon);
    const searchLimit = mode === "walk" ? Math.min(maxMeters, Math.max(crow * 8, crow + 1200)) : maxMeters;
    let road = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const fromAccess = approachNodes(graph, from, bit, blocked);
      const toAccess = approachNodes(graph, to, bit, blocked);
      if (!fromAccess || !toAccess) break;
      const same = sameEdgeRoute(graph, from, to, fromAccess, toAccess, bit, penalty);
      const sources = terminalsFor(graph, fromAccess, from, bit, penalty, false);
      const goals = terminalsFor(graph, toAccess, to, bit, penalty, true);
      const found = searchRoads(graph, sources, goals, bit, penalty, to, searchLimit, same ? same.cost : Infinity);
      if (same && (!found || same.cost <= found.cost)) {
        road = sealWalkEnds(graph, same.route, from, to);
        break;
      }
      if (found?.route) {
        road = sealWalkEnds(graph, found.route, from, to);
        break;
      }
      const blockedBefore = blocked.size;
      const reject = attempt < 5 ? [toAccess] : [toAccess, fromAccess];
      for (const access of reject) {
        if (access.kind !== "edge") continue;
        blocked.add(access.snap.edge);
        const rev = graph.rev[access.snap.edge];
        if (rev !== ROAD_NONE) blocked.add(rev);
      }
      if (blocked.size === blockedBefore) break;
    }
    if (mode !== "walk" || !graph.buildings?.cuts) return road;
    const gap = walkGapRoute(graph, from, to);
    if (gap && (!road || gap.meters + 8 < road.meters)) return gap;
    return road;
  }
  function findRoadRoutes(graph, from, to, mode) {
    const first = routeOnRoad(graph, from, to, null, mode, Infinity);
    if (!first) return [];
    const routes = [first];
    if (!first.edges.length) return routes;
    const used = new Set(first.edges);
    for (const edge of first.edges) {
      const rev = graph.rev[edge];
      if (rev !== ROAD_NONE) used.add(rev);
    }
    const limit = Math.max(first.meters * 1.75, first.meters + 600);
    const second = routeOnRoad(graph, from, to, used, mode, limit);
    if (second && !sameEdges(first, second) && second.meters < limit) {
      routes.push(second);
      const usedMore = /* @__PURE__ */ new Set([...used, ...second.edges]);
      for (const edge of second.edges) {
        const rev = graph.rev[edge];
        if (rev !== ROAD_NONE) usedMore.add(rev);
      }
      const third = routeOnRoad(graph, from, to, usedMore, mode, limit);
      if (third && third.meters < limit && !routes.some((route) => sameEdges(route, third))) routes.push(third);
    }
    return routes;
  }

  // offline-gps/public/water.js
  var WATER_TYPES = [
    { id: 0, label: "Bebedouro" },
    { id: 1, label: "Fonte" },
    { id: 2, label: "Vau" },
    { id: 3, label: "A\xE7ude" },
    { id: 4, label: "Acesso" }
  ];
  var LAT03 = 368e5;
  var LON03 = -97e5;
  var STEP2 = 2e4;
  var LAT_N2 = 275;
  var LON_N2 = 190;
  function align3(offset) {
    return offset + 3 & ~3;
  }
  function openWaterBook(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== "WTR1" || view.getUint32(4, true) !== 1 || view.getUint32(44, true) !== bytes.byteLength) {
      throw new Error("water");
    }
    const count = view.getUint32(8, true);
    const nameBytes = view.getUint32(12, true);
    const cellCount = view.getUint32(36, true);
    const geomBytes = view.getUint32(40, true);
    let offset = 64;
    const type = bytes.slice(offset, offset + count);
    offset = align3(offset + count);
    const kind = bytes.slice(offset, offset + count);
    offset = align3(offset + count);
    const span = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset = align3(offset + count * 2);
    const labelLat = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const labelLon = new Int32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const nameOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const nameLen = new Uint16Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset = align3(offset + count * 2);
    const geomOff = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const geomLen = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, count);
    offset += count * 4;
    const nameBlob = bytes.subarray(offset, offset + nameBytes);
    offset = align3(offset + nameBytes);
    const geom = bytes.subarray(offset, offset + geomBytes);
    offset = align3(offset + geomBytes);
    const cellHead = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, cellCount + 1);
    offset += (cellCount + 1) * 4;
    const idCount = cellHead[cellCount];
    const cellIds = new Uint32Array(bytes.buffer, bytes.byteOffset + offset, idCount);
    return {
      count,
      type,
      kind,
      span,
      labelLat,
      labelLon,
      nameOff,
      nameLen,
      nameBlob,
      geom,
      geomView: new DataView(geom.buffer, geom.byteOffset, geom.byteLength),
      geomOff,
      geomLen,
      cellHead,
      cellIds,
      decoded: new Array(count),
      names: new Array(count),
      stamp: new Uint32Array(count),
      token: 1
    };
  }
  var decoder = new TextDecoder();
  function featureName(book, id) {
    const cached = book.names[id];
    if (cached) return cached;
    const start = book.nameOff[id];
    const name = decoder.decode(book.nameBlob.subarray(start, start + book.nameLen[id]));
    book.names[id] = name;
    return name;
  }
  function featureParts(book, id) {
    if (book.decoded[id]) return book.decoded[id];
    if (book.kind[id] === 0 || book.geomLen[id] === 0) {
      book.decoded[id] = [];
      return [];
    }
    const view = book.geomView;
    let offset = book.geomOff[id];
    const partCount = view.getUint16(offset, true);
    offset += 2;
    const parts = [];
    for (let part = 0; part < partCount; part += 1) {
      const n = view.getUint16(offset, true);
      offset += 2;
      const coords = new Float64Array(n * 2);
      for (let index = 0; index < n; index += 1) {
        coords[index * 2] = view.getInt32(offset, true) / 1e6;
        coords[index * 2 + 1] = view.getInt32(offset + 4, true) / 1e6;
        offset += 8;
      }
      parts.push(coords);
    }
    book.decoded[id] = parts;
    return parts;
  }
  function inside(lat, lon, west, south, east, north) {
    return lat >= south && lat <= north && lon >= west && lon <= east;
  }
  function orient2(ax, ay, bx, by, cx, cy) {
    return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  }
  function segmentsCross2(aLat, aLon, bLat, bLon, cLat, cLon, dLat, dLon) {
    const left = orient2(aLon, aLat, bLon, bLat, cLon, cLat);
    const right = orient2(aLon, aLat, bLon, bLat, dLon, dLat);
    const across = orient2(cLon, cLat, dLon, dLat, aLon, aLat);
    const back = orient2(cLon, cLat, dLon, dLat, bLon, bLat);
    return left * right < 0 && across * back < 0;
  }
  function segmentHits(aLat, aLon, bLat, bLon, west, south, east, north) {
    if (inside(aLat, aLon, west, south, east, north) || inside(bLat, bLon, west, south, east, north)) return true;
    if (Math.max(aLat, bLat) < south || Math.min(aLat, bLat) > north) return false;
    if (Math.max(aLon, bLon) < west || Math.min(aLon, bLon) > east) return false;
    return segmentsCross2(aLat, aLon, bLat, bLon, south, west, south, east) || segmentsCross2(aLat, aLon, bLat, bLon, north, west, north, east) || segmentsCross2(aLat, aLon, bLat, bLon, south, west, north, west) || segmentsCross2(aLat, aLon, bLat, bLon, south, east, north, east);
  }
  function remember(best, lat, lon, cy, cx) {
    const dist = (lat - cy) * (lat - cy) + (lon - cx) * (lon - cx);
    if (!best || dist < best.dist) return { lat, lon, dist };
    return best;
  }
  function anchorFor(book, id, west, south, east, north, cy, cx) {
    if (book.kind[id] === 0) {
      const lat = book.labelLat[id] / 1e6;
      const lon = book.labelLon[id] / 1e6;
      if (!inside(lat, lon, west, south, east, north)) return null;
      return { lat, lon, dist: (lat - cy) * (lat - cy) + (lon - cx) * (lon - cx) };
    }
    const parts = featureParts(book, id);
    let best = null;
    let hit = false;
    for (const part of parts) {
      const n = part.length / 2;
      let prevLat = 0;
      let prevLon = 0;
      for (let index = 0; index < n; index += 1) {
        const lat = part[index * 2];
        const lon = part[index * 2 + 1];
        if (inside(lat, lon, west, south, east, north)) {
          hit = true;
          best = remember(best, lat, lon, cy, cx);
        }
        if (index) {
          if (segmentHits(prevLat, prevLon, lat, lon, west, south, east, north)) hit = true;
          const dlat = lat - prevLat;
          const dlon = lon - prevLon;
          const denom = dlat * dlat + dlon * dlon;
          let t = 0;
          if (denom > 0) t = ((cy - prevLat) * dlat + (cx - prevLon) * dlon) / denom;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const onLat = prevLat + dlat * t;
          const onLon = prevLon + dlon * t;
          if (inside(onLat, onLon, west, south, east, north)) {
            hit = true;
            best = remember(best, onLat, onLon, cy, cx);
          } else {
            for (let step = 1; step < 8; step += 1) {
              const share = step / 8;
              const midLat = prevLat + dlat * share;
              const midLon = prevLon + dlon * share;
              if (!inside(midLat, midLon, west, south, east, north)) continue;
              hit = true;
              best = remember(best, midLat, midLon, cy, cx);
              break;
            }
          }
        }
        prevLat = lat;
        prevLon = lon;
      }
    }
    if (!hit || !best) return null;
    return best;
  }
  function waterInView(book, west, south, east, north, zoom = 14) {
    const counts = [0, 0, 0, 0, 0];
    let token = book.token + 1 >>> 0;
    if (token === 0) {
      book.stamp.fill(0);
      token = 1;
    }
    book.token = token;
    const y0 = Math.max(0, Math.min(LAT_N2 - 1, Math.floor((Math.round(south * 1e6) - LAT03) / STEP2)));
    const y1 = Math.max(0, Math.min(LAT_N2 - 1, Math.floor((Math.round(north * 1e6) - LAT03) / STEP2)));
    const x0 = Math.max(0, Math.min(LON_N2 - 1, Math.floor((Math.round(west * 1e6) - LON03) / STEP2)));
    const x1 = Math.max(0, Math.min(LON_N2 - 1, Math.floor((Math.round(east * 1e6) - LON03) / STEP2)));
    const cy = (south + north) / 2;
    const cx = (west + east) / 2;
    const hits = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = y * LON_N2 + x;
        const start = book.cellHead[cell];
        const end = book.cellHead[cell + 1];
        for (let index = start; index < end; index += 1) {
          const id = book.cellIds[index];
          if (book.stamp[id] === book.token) continue;
          book.stamp[id] = book.token;
          const anchor = anchorFor(book, id, west, south, east, north, cy, cx);
          if (!anchor) continue;
          counts[book.type[id]] += 1;
          hits.push({ id, lat: anchor.lat, lon: anchor.lon, dist: anchor.dist });
        }
      }
    }
    const list = hits.slice().sort((a, b) => a.dist - b.dist).slice(0, 160).map((hit) => ({
      type: book.type[hit.id],
      typeLabel: WATER_TYPES[book.type[hit.id]].label,
      name: featureName(book, hit.id),
      lat: hit.lat,
      lon: hit.lon
    }));
    const points = [];
    for (const hit of hits) {
      if (book.kind[hit.id] !== 0) continue;
      points.push({ id: hit.id, lat: hit.lat, lon: hit.lon, dist: hit.dist });
    }
    const drawnPoints = zoom >= 13 ? points.slice().sort((a, b) => a.dist - b.dist).slice(0, 80) : [];
    const features = [];
    for (const row of drawnPoints) {
      const name = featureName(book, row.id);
      features.push({
        type: "Feature",
        properties: {
          name,
          typeLabel: WATER_TYPES[book.type[row.id]].label,
          lat: row.lat,
          lon: row.lon,
          role: "label"
        },
        geometry: { type: "Point", coordinates: [row.lon, row.lat] }
      });
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
      counts,
      total,
      list,
      collection: { type: "FeatureCollection", features }
    };
  }

  // ios/engine-src/native-api.js
  globalThis.setTimeout = (fn) => {
    fn();
    return 0;
  };
  globalThis.clearTimeout = () => {
  };
  globalThis.console = globalThis.console || { log() {
  }, error() {
  }, warn() {
  }, info() {
  } };
  var GENERIC = /* @__PURE__ */ new Set(["rua", "avenida", "travessa", "largo", "praca", "estrada", "caminho", "alameda", "beco"]);
  var state = {
    graph: null,
    addresses: null,
    places: null,
    water: null,
    buildings: null,
    geoPlaces: [],
    geoStreets: [],
    streetCells: null,
    navigating: false,
    route: null
  };
  function memoryFile(buffer) {
    const bytes = new Uint8Array(buffer);
    return {
      size: bytes.byteLength,
      slice(start, end) {
        const copy = bytes.slice(start || 0, end == null ? bytes.byteLength : end);
        return { arrayBuffer: () => Promise.resolve(copy.buffer) };
      }
    };
  }
  function attachBuildings() {
    if (!(state.graph && state.buildings)) return;
    state.graph.buildings = state.buildings;
    state.graph.walkOpen = null;
  }
  function indexStreets() {
    const cells = /* @__PURE__ */ new Map();
    for (const street of state.geoStreets) {
      const key = `${Math.round(street.lat / 8e-3)}:${Math.round(street.lon / 8e-3)}`;
      const list = cells.get(key);
      if (list) list.push(street);
      else cells.set(key, [street]);
    }
    state.streetCells = cells;
  }
  function streetAt2(lat, lon) {
    const cells = state.streetCells;
    if (!cells || !Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    let best = "";
    let bestD = 180;
    const gy = Math.round(lat / 8e-3);
    const gx = Math.round(lon / 8e-3);
    for (let y = gy - 2; y <= gy + 2; y += 1) {
      for (let x = gx - 2; x <= gx + 2; x += 1) {
        const list = cells.get(`${y}:${x}`);
        if (!list) continue;
        for (const street of list) {
          const distance = metersBetween2(lat, lon, street.lat, street.lon);
          if (distance < bestD) {
            bestD = distance;
            best = street.name;
          }
        }
      }
    }
    return best;
  }
  function nearbyName(lat, lon, zoom) {
    const found = [];
    if (state.places) {
      const view = placesInView(state.places, lon - 4e-4, lat - 4e-4, lon + 4e-4, lat + 4e-4, -1, 20);
      for (const place of view.items) {
        const meters2 = metersBetween2(lat, lon, place.lat, place.lon);
        if (meters2 <= 20 && place.name) {
          found.push({
            name: place.name,
            meters: meters2,
            address: place.address || "",
            lat: place.lat,
            lon: place.lon
          });
        }
      }
    }
    if (state.water) {
      const view = waterInView(state.water, lon - 4e-4, lat - 4e-4, lon + 4e-4, lat + 4e-4, zoom || 16);
      for (const place of view.list) {
        const meters2 = metersBetween2(lat, lon, place.lat, place.lon);
        if (meters2 <= 20 && place.name) {
          found.push({
            name: place.name,
            meters: meters2,
            address: place.typeLabel || "",
            lat: place.lat,
            lon: place.lon
          });
        }
      }
    }
    found.sort((a, b) => a.meters - b.meters);
    return found[0] || null;
  }
  function slim(route, style, label) {
    if (!route) return null;
    return {
      style,
      label,
      meters: route.meters,
      seconds: Number.isFinite(route.seconds) ? route.seconds : null,
      coordinates: route.coordinates
    };
  }
  function sameRoute(a, b) {
    if (!a || !b) return false;
    if (a.edges && b.edges && a.edges.length && a.edges.length === b.edges.length && a.edges.every((edge, index) => edge === b.edges[index])) {
      return true;
    }
    const seconds = Math.abs((a.seconds || 0) - (b.seconds || 0));
    return seconds < 45 && Math.abs(a.meters - b.meters) < 400;
  }
  function point(lat, lon) {
    return { lat, lon };
  }
  var api = {
    openRoads(buffer) {
      state.graph = openRoadGraph(buffer);
      attachBuildings();
      return state.graph.nodeCount;
    },
    openAddresses(buffer) {
      return openAddressBook(memoryFile(buffer)).then((book) => {
        state.addresses = book;
        return book.streets.length;
      });
    },
    openPlaces(buffer) {
      state.places = openPlaceBook(buffer);
      return state.places.count;
    },
    openWater(buffer) {
      state.water = openWaterBook(buffer);
      return state.water.count;
    },
    openBuildings(buffer) {
      state.buildings = openBuildingBook(buffer);
      attachBuildings();
      return state.buildings.count;
    },
    openGeo(text) {
      const data = JSON.parse(text);
      state.geoPlaces = preparePlaces(data.p || []);
      state.geoStreets = prepareStreets(data.s || []);
      indexStreets();
      return state.geoStreets.length;
    },
    async search(query, lat, lon) {
      const anchor = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
      const door = parseDoorQuery(query, state.addresses ? state.addresses.cityKeys : /* @__PURE__ */ new Set());
      const addresses = state.addresses ? await suggestAddresses(state.addresses, query, 8, anchor) : [];
      let services = state.places ? searchServices(state.places, query, 6) : [];
      if (anchor) {
        services.sort(
          (a, b) => metersBetween2(anchor.lat, anchor.lon, a.lat, a.lon) - metersBetween2(anchor.lat, anchor.lon, b.lat, b.lon) || a.rank - b.rank
        );
      }
      const places = state.geoPlaces.length ? searchNames(state.geoPlaces, query, 4).filter((place) => !GENERIC.has(fold(place.name))) : [];
      const streets = !addresses.length && state.geoStreets.length ? searchNames(state.geoStreets, query, 4) : [];
      return JSON.stringify({
        waiting: !state.addresses && (door.number || fold(query).length >= 2),
        items: [...services, ...addresses, ...places, ...streets]
      });
    },
    async inspect(lat, lon, zoom) {
      let door = null;
      if (state.addresses) {
        try {
          door = await nearestDoor(state.addresses, lat, lon);
        } catch {
          door = null;
        }
      }
      return JSON.stringify({ door, named: nearbyName(lat, lon, zoom) });
    },
    route(fromLat, fromLon, toLat, toLon, mode) {
      const route = findRoute(state.graph, point(fromLat, fromLon), point(toLat, toLon), null, mode);
      return JSON.stringify(slim(route, mode, ""));
    },
    choices(fromLat, fromLon, toLat, toLon, mode) {
      const from = point(fromLat, fromLon);
      const to = point(toLat, toLon);
      if (mode === "car") {
        const fastest = findRoute(state.graph, from, to, null, "car");
        const noToll = state.graph ? findRoute(state.graph, from, to, null, "car", Infinity, (edge) => !isTollEdge(state.graph, edge)) : null;
        const noMotorway = state.graph ? findRoute(state.graph, from, to, null, "car", Infinity, (edge) => !isMotorwayEdge(state.graph, edge)) : null;
        const routes2 = [];
        if (fastest) routes2.push(slim(fastest, "car", "Mais r\xE1pido"));
        if (noToll && !sameRoute(fastest, noToll)) routes2.push(slim(noToll, "toll", "Sem portagens"));
        if (noMotorway && !sameRoute(fastest, noMotorway) && !sameRoute(noToll, noMotorway)) {
          routes2.push(slim(noMotorway, "local", "Sem autoestradas"));
        }
        return JSON.stringify(routes2);
      }
      const style = mode === "walk" ? "walk" : "bicycle";
      const routes = findRoutes(state.graph, from, to, mode).slice(0, 2).map((route, index) => slim(route, index === 0 ? style : `${style}-alt`, index === 0 ? "Mais curto" : "Alternativa"));
      return JSON.stringify(routes);
    },
    setNavigation(active, routeJSON) {
      state.navigating = Boolean(active);
      state.route = routeJSON ? JSON.parse(routeJSON) : null;
      return "ok";
    },
    constrain(lat, lon, distance, heading, mode) {
      if (mode === "walk") return "null";
      if (state.navigating && state.route && state.route.coordinates && state.route.coordinates.length > 1) {
        const next2 = advanceOnLine(state.route.coordinates, lat, lon, distance);
        return JSON.stringify(next2);
      }
      if (!state.graph) return "null";
      const next = moveAlongRoad(state.graph, lat, lon, distance, heading, mode);
      return JSON.stringify(next);
    },
    navigation(lat, lon) {
      if (!state.route || !state.route.coordinates) return "null";
      const rest = sliceRoute(state.route.coordinates, lat, lon);
      const step = maneuver(rest.coordinates);
      const ratio = state.route.meters > 0 ? rest.meters / state.route.meters : 0;
      const seconds = Number.isFinite(state.route.seconds) ? state.route.seconds * ratio : null;
      return JSON.stringify({
        turn: step.turn,
        text: step.text,
        meters: step.meters,
        street: streetAt2(step.lat, step.lon),
        remaining: rest.meters,
        seconds
      });
    },
    viewport(west, south, east, north, zoom) {
      const pois = state.places ? placesInView(state.places, west, south, east, north, -1, zoom >= 13 ? 40 : 0) : { counts: [0, 0, 0, 0, 0, 0], items: [] };
      const water = state.water ? waterInView(state.water, west, south, east, north, zoom) : { total: 0, list: [], collection: { features: [] } };
      const buildings = state.buildings && zoom >= 15 ? buildingsInView(state.buildings, west, south, east, north) : { features: [] };
      return JSON.stringify({
        counts: pois.counts,
        waterTotal: water.total || 0,
        pois: pois.items.map((place) => ({
          name: place.name,
          address: place.address || "",
          category: place.category,
          lat: place.lat,
          lon: place.lon
        })),
        water: (water.collection.features || []).filter((feature) => feature.geometry && feature.geometry.type === "Point").map((feature) => ({
          name: feature.properties.name,
          address: feature.properties.typeLabel || "",
          lat: feature.properties.lat,
          lon: feature.properties.lon
        })),
        buildings: buildings.features || []
      });
    },
    category(west, south, east, north, zoom, id) {
      if (id === "water") {
        if (!state.water) return "[]";
        return JSON.stringify(waterInView(state.water, west, south, east, north, zoom).list);
      }
      if (!state.places) return "[]";
      const view = placesInView(state.places, west, south, east, north, Number(id), 160);
      return JSON.stringify(view.items);
    }
  };
  globalThis.Posicao = api;
})();
