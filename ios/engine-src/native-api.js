import { nearestDoor, openAddressBook, parseDoorQuery, suggestAddresses } from "../../website/maps/addresses.js"
import { buildingsInView, openBuildingBook } from "../../website/maps/buildings.js"
import { placesInView, openPlaceBook, searchServices } from "../../website/maps/places.js"
import {
  advanceOnLine,
  findRoute,
  findRoutes,
  isMotorwayEdge,
  isTollEdge,
  maneuver,
  metersBetween,
  moveAlongRoad,
  openRoadGraph,
  sliceRoute,
} from "../../website/maps/route.js"
import { fold, preparePlaces, prepareStreets, rankResults, searchNames } from "../../website/maps/search.js"
import { openWaterBook, waterInView } from "../../website/maps/water.js"

globalThis.setTimeout = (fn) => {
  fn()
  return 0
}
globalThis.clearTimeout = () => {}
globalThis.console = globalThis.console || { log() {}, error() {}, warn() {}, info() {} }

const state = {
  graph: null,
  addresses: null,
  places: null,
  water: null,
  buildings: null,
  geoPlaces: [],
  geoStreets: [],
  streetCells: null,
  navigating: false,
  route: null,
}

function memoryFile(buffer) {
  const bytes = new Uint8Array(buffer)
  return {
    size: bytes.byteLength,
    slice(start, end) {
      const copy = bytes.slice(start || 0, end == null ? bytes.byteLength : end)
      return { arrayBuffer: () => Promise.resolve(copy.buffer) }
    },
  }
}

function attachBuildings() {
  if (!(state.graph && state.buildings)) return
  state.graph.buildings = state.buildings
  state.graph.walkOpen = null
}

function indexStreets() {
  const cells = new Map()
  for (const street of state.geoStreets) {
    const key = `${Math.round(street.lat / 0.008)}:${Math.round(street.lon / 0.008)}`
    const list = cells.get(key)
    if (list) list.push(street)
    else cells.set(key, [street])
  }
  state.streetCells = cells
}

function streetAt(lat, lon) {
  const cells = state.streetCells
  if (!cells || !Number.isFinite(lat) || !Number.isFinite(lon)) return ""
  let best = ""
  let bestD = 180
  const gy = Math.round(lat / 0.008)
  const gx = Math.round(lon / 0.008)
  for (let y = gy - 2; y <= gy + 2; y += 1) {
    for (let x = gx - 2; x <= gx + 2; x += 1) {
      const list = cells.get(`${y}:${x}`)
      if (!list) continue
      for (const street of list) {
        const distance = metersBetween(lat, lon, street.lat, street.lon)
        if (distance < bestD) {
          bestD = distance
          best = street.name
        }
      }
    }
  }
  return best
}

function nearbyName(lat, lon, zoom) {
  const found = []
  if (state.places) {
    const view = placesInView(state.places, lon - 0.0004, lat - 0.0004, lon + 0.0004, lat + 0.0004, -1, 20)
    for (const place of view.items) {
      const meters = metersBetween(lat, lon, place.lat, place.lon)
      if (meters <= 20) {
        found.push({
          name: place.name,
          category: place.category,
          meters,
          address: place.address || "",
          lat: place.lat,
          lon: place.lon,
        })
      }
    }
  }
  if (state.water) {
    const view = waterInView(state.water, lon - 0.0004, lat - 0.0004, lon + 0.0004, lat + 0.0004, zoom || 16)
    for (const place of view.list) {
      const meters = metersBetween(lat, lon, place.lat, place.lon)
      if (meters <= 20) {
        found.push({
          name: place.name,
          typeLabel: place.typeLabel || "",
          meters,
          address: place.typeLabel || "",
          lat: place.lat,
          lon: place.lon,
        })
      }
    }
  }
  found.sort((a, b) => a.meters - b.meters)
  return found[0] || null
}

function slim(route, style, label) {
  if (!route) return null
  return {
    style,
    label,
    meters: route.meters,
    seconds: Number.isFinite(route.seconds) ? route.seconds : null,
    coordinates: route.coordinates,
  }
}

function sameRoute(a, b) {
  if (!a || !b) return false
  if (a.edges && b.edges && a.edges.length && a.edges.length === b.edges.length && a.edges.every((edge, index) => edge === b.edges[index])) {
    return true
  }
  const seconds = Math.abs((a.seconds || 0) - (b.seconds || 0))
  return seconds < 45 && Math.abs(a.meters - b.meters) < 400
}

function point(lat, lon) {
  return { lat, lon }
}

const api = {
  openRoads(buffer) {
    state.graph = openRoadGraph(buffer)
    attachBuildings()
    return state.graph.nodeCount
  },
  openAddresses(buffer) {
    return openAddressBook(memoryFile(buffer)).then((book) => {
      state.addresses = book
      return book.streets.length
    })
  },
  openPlaces(buffer) {
    state.places = openPlaceBook(buffer)
    return state.places.count
  },
  openWater(buffer) {
    state.water = openWaterBook(buffer)
    return state.water.count
  },
  openBuildings(buffer) {
    state.buildings = openBuildingBook(buffer)
    attachBuildings()
    return state.buildings.count
  },
  openGeo(text) {
    const data = JSON.parse(text)
    state.geoPlaces = preparePlaces(data.p || [])
    state.geoStreets = prepareStreets(data.s || [])
    indexStreets()
    return state.geoStreets.length
  },
  async search(query, lat, lon) {
    const anchor = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
    const door = parseDoorQuery(query, state.addresses ? state.addresses.cityKeys : new Set())
    const addresses = state.addresses ? await suggestAddresses(state.addresses, query, 8, anchor) : []
    const services = state.places ? searchServices(state.places, query, 8, anchor) : []
    const places = state.geoPlaces.length ? searchNames(state.geoPlaces, query, 6) : []
    const streets = !addresses.length && state.geoStreets.length ? searchNames(state.geoStreets, query, 6) : []
    return JSON.stringify({
      waiting: !state.addresses && (door.number || fold(query).length >= 2),
      items: rankResults([...services, ...addresses, ...places, ...streets], query, anchor),
    })
  },
  async inspect(lat, lon, zoom) {
    let door = null
    if (state.addresses) {
      try {
        door = await nearestDoor(state.addresses, lat, lon)
      } catch {
        door = null
      }
    }
    return JSON.stringify({ door, named: nearbyName(lat, lon, zoom) })
  },
  route(fromLat, fromLon, toLat, toLon, mode) {
    const route = findRoute(state.graph, point(fromLat, fromLon), point(toLat, toLon), null, mode)
    return JSON.stringify(slim(route, mode, ""))
  },
  choices(fromLat, fromLon, toLat, toLon, mode) {
    const from = point(fromLat, fromLon)
    const to = point(toLat, toLon)
    if (mode === "car") {
      const fastest = findRoute(state.graph, from, to, null, "car")
      const noToll = state.graph
        ? findRoute(state.graph, from, to, null, "car", Infinity, (edge) => !isTollEdge(state.graph, edge))
        : null
      const noMotorway = state.graph
        ? findRoute(state.graph, from, to, null, "car", Infinity, (edge) => !isMotorwayEdge(state.graph, edge))
        : null
      const routes = []
      if (fastest) routes.push(slim(fastest, "car", "fastest"))
      if (noToll && !sameRoute(fastest, noToll)) routes.push(slim(noToll, "toll", "no-tolls"))
      if (noMotorway && !sameRoute(fastest, noMotorway) && !sameRoute(noToll, noMotorway)) {
        routes.push(slim(noMotorway, "local", "no-motorways"))
      }
      return JSON.stringify(routes)
    }
    const style = mode === "walk" ? "walk" : "bicycle"
    const routes = findRoutes(state.graph, from, to, mode)
      .slice(0, 2)
      .map((route, index) => slim(route, index === 0 ? style : `${style}-alt`, index === 0 ? "shortest" : "alternative"))
    return JSON.stringify(routes)
  },
  setNavigation(active, routeJSON) {
    state.navigating = Boolean(active)
    state.route = routeJSON ? JSON.parse(routeJSON) : null
    return "ok"
  },
  constrain(lat, lon, distance, heading, mode) {
    if (mode === "walk") return "null"
    if (state.navigating && state.route && state.route.coordinates && state.route.coordinates.length > 1) {
      const next = advanceOnLine(state.route.coordinates, lat, lon, distance)
      return JSON.stringify(next)
    }
    if (!state.graph) return "null"
    const next = moveAlongRoad(state.graph, lat, lon, distance, heading, mode)
    return JSON.stringify(next)
  },
  navigation(lat, lon) {
    if (!state.route || !state.route.coordinates) return "null"
    const rest = sliceRoute(state.route.coordinates, lat, lon)
    const step = maneuver(rest.coordinates)
    const ratio = state.route.meters > 0 ? rest.meters / state.route.meters : 0
    const seconds = Number.isFinite(state.route.seconds) ? state.route.seconds * ratio : null
    return JSON.stringify({
      turn: step.turn,
      meters: step.meters,
      street: streetAt(step.lat, step.lon),
      remaining: rest.meters,
      seconds,
    })
  },
  viewport(west, south, east, north, zoom) {
    const pois = state.places ? placesInView(state.places, west, south, east, north, -1, zoom >= 13 ? 40 : 0) : { counts: [0, 0, 0, 0, 0, 0], items: [] }
    const water = state.water ? waterInView(state.water, west, south, east, north, zoom) : { total: 0, list: [], collection: { features: [] } }
    const buildings = state.buildings && zoom >= 15 ? buildingsInView(state.buildings, west, south, east, north) : { features: [] }
    return JSON.stringify({
      counts: pois.counts,
      waterTotal: water.total || 0,
      pois: pois.items.map((place) => ({
        name: place.name,
        address: place.address || "",
        category: place.category,
        lat: place.lat,
        lon: place.lon,
      })),
      water: (water.collection.features || [])
        .filter((feature) => feature.geometry && feature.geometry.type === "Point")
        .map((feature) => ({
          name: feature.properties.name,
          address: feature.properties.typeLabel || "",
          lat: feature.properties.lat,
          lon: feature.properties.lon,
        })),
      buildings: buildings.features || [],
    })
  },
  category(west, south, east, north, zoom, id) {
    if (id === "water") {
      if (!state.water) return "[]"
      return JSON.stringify(waterInView(state.water, west, south, east, north, zoom).list)
    }
    if (!state.places) return "[]"
    const view = placesInView(state.places, west, south, east, north, Number(id), 160)
    return JSON.stringify(view.items)
  },
}

globalThis.Posicao = api
