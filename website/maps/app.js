import { AttributionControl, Map, Marker, addProtocol } from "/maps/vendor/maplibre-gl.mjs"
import { circlePolygon, createPedestrianDeadReckoning, wedgePolygon } from "./estimator.js"
import { advanceOnLine, findRoute, findRoutes, isMotorwayEdge, isTollEdge, maneuver, metersBetween, moveAlongRoad, openRoadGraph, sliceRoute, TRAVEL_KMH, tripMinutes } from "./route.js"
import { nearestDoor, openAddressBook, parseDoorQuery, suggestAddresses } from "./addresses.js"
import { CATEGORIES, categoryIcon, openPlaceBook, placesInView, searchServices, serviceIcons } from "./places.js"
import { openWaterBook, waterIcon, waterInView } from "./water.js"
import { buildingsInView, openBuildingBook } from "./buildings.js"
import { fold, preparePlaces, prepareStreets, searchNames } from "./search.js"
import { mapStyle } from "./style.js"
import { createBrowserSensors } from "./sensors.js"
import { loadAddressFile, loadBuildingFile, loadCatalog, loadMapFile, loadPackFile, loadPlaceFile, loadRoadFile, loadWaterFile } from "./storage.js"
import { t } from "./i18n.js"

const STATE_KEY = "posicao-v1"
const PINS_KEY = "posicao-pins-v1"
const HERE = "A sua posição"
const DOOR_NEAR_M = 40
const EUROPE_BOX = [[-12, 36], [32, 58]]
const VIEW = { center: [10, 48], zoom: 3.8 }
const PACKAGE_KEY = "blackout-package"
const PACKAGES_KEY = "blackout-packages"
const PORTUGAL = { id: "portugal", name: "Portugal", flag: "🇵🇹", files: [] }

const statusEl = document.querySelector("#status")
const anchorBtn = document.querySelector("#anchor")
const stepInput = document.querySelector("#step")
const stepValue = document.querySelector("#step-value")
const queryInput = document.querySelector("#query")
const clearBtn = document.querySelector("#clear")
const searchForm = document.querySelector("#search")
const resultsEl = document.querySelector("#results")
const originInput = { value: "" }
const destInput = { value: "" }
const startBtn = document.querySelector("#start")
const tripEl = document.querySelector("#trip")
const tripClose = document.querySelector("#trip-close")
const categoryBar = document.querySelector("#categories")
const placesSheet = document.querySelector("#sheet-places")
const placesTitle = document.querySelector("#places-title")
const placesList = document.querySelector("#places-list")
const placesClose = document.querySelector("#places-close")
const tripTitle = document.querySelector("#trip-title")
const tripName = document.querySelector("#trip-name")
const tripDuration = document.querySelector("#trip-duration")
const tripMeta = document.querySelector("#trip-meta")
const tripCoords = document.querySelector("#trip-coords")
const routeCards = document.querySelector("#route-cards")
const routeList = document.querySelector("#route-list")
const routesBtn = document.querySelector("#routes-btn")
const navBanner = document.querySelector("#nav-banner")
const navArrow = document.querySelector("#nav-arrow")
const navDistance = document.querySelector("#nav-distance")
const navStep = document.querySelector("#nav-step")
const navCard = document.querySelector("#nav-card")
const navTime = document.querySelector("#nav-time")
const navMeta = document.querySelector("#nav-meta")
const recenterBtn = document.querySelector("#recenter")
const navCorrectBtn = document.querySelector("#nav-correct")
const correctBar = document.querySelector("#correct-bar")
const correctCancelBtn = document.querySelector("#correct-cancel")
const correctOkBtn = document.querySelector("#correct-ok")
const centerDot = document.querySelector("#center-dot")
const placeCard = document.querySelector("#place-card")
const placeName = document.querySelector("#place-name")
const savePinBtn = document.querySelector("#save-pin")
const goDirBtn = document.querySelector("#go-dir")
const saveCard = document.querySelector("#save-card")
const saveName = document.querySelector("#save-name")
const saveAddress = document.querySelector("#save-address")
const saveCoords = document.querySelector("#save-coords")
const saveButton = document.querySelector("#save-place")
const addPinBtn = document.querySelector("#add-pin")
const centerPin = document.querySelector("#center-pin")
const saveLabel = document.createElement("input")
saveLabel.id = "save-label"
saveLabel.type = "text"
saveLabel.placeholder = "Nome"
saveLabel.setAttribute("aria-label", "Nome")
saveLabel.autocomplete = "off"
saveLabel.autocorrect = "off"
saveLabel.autocapitalize = "off"
saveLabel.spellcheck = false
const fixBtn = document.querySelector("#fix-btn")
const fixBar = document.querySelector("#fix-bar")
const fixName = document.querySelector("#fix-name")
const fixAddress = document.querySelector("#fix-address")
const fixCoords = document.querySelector("#fix-coords")
const fixCancelBtn = document.querySelector("#fix-cancel")
const fixOkBtn = document.querySelector("#fix-ok")
const pinSheet = document.querySelector("#sheet-pin")
const addressInput = document.createElement("input")
addressInput.id = "pin-address"
addressInput.className = "address"
addressInput.type = "text"
addressInput.placeholder = "Morada"
addressInput.setAttribute("aria-label", "Morada")
addressInput.autocomplete = "off"
addressInput.autocorrect = "off"
addressInput.autocapitalize = "off"
addressInput.spellcheck = false
const pinResults = document.querySelector("#pin-results")
const sensorToggle = document.querySelector("#sensors")
const pinsPanel = document.querySelector("#panel-pins")
const settingsPanel = document.querySelector("#panel-settings")
const mapsLabel = document.querySelector("#maps-label")
const installedMaps = document.querySelector("#installed-maps")
const importBtn = document.querySelector("#import-maps")
const importLabel = document.querySelector("#import-maps-label")
const sensorsHeading = document.querySelector("#sensors-heading")
const sensorsLabel = document.querySelector("#sensors-label")
const stepLabel = document.querySelector("#step-label")
const legalLabel = document.querySelector("#legal-label")
const privacyLink = document.querySelector("#privacy-link")
const termsLink = document.querySelector("#terms-link")
const importSheet = document.querySelector("#sheet-import")
const importTitle = document.querySelector("#import-title")
const importClose = document.querySelector("#import-close")
const importNote = document.querySelector("#import-note")
const catalogList = document.querySelector("#catalog-list")
const pinList = document.querySelector("#pin-list")
const tools = document.querySelector("#tools")
const positionPrompt = document.querySelector("#position-prompt")
const topEl = document.querySelector("#top")

const metersFormat = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholeFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 })
const kmFormat = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const clockFormat = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" })
const MODE_TITLE = { walk: "A pé", car: "De carro", bicycle: "De bicicleta" }
const NAV_ZOOM = 17
let countryToken = 0
let activePackageId = "portugal"
let downloadingId = ""
let catalog = []
let catalogNote = ""
let catalogLoading = false

const sensors = createBrowserSensors()
const estimator = createPedestrianDeadReckoning(sensors)
estimator.setConstraint((lat, lon, distanceM, headingDeg) => {
  if (navigating && currentRoute?.coordinates?.length > 1) {
    return advanceOnLine(currentRoute.coordinates, lat, lon, distanceM)
  }
  if (!graph) return null
  return moveAlongRoad(graph, lat, lon, distanceM, headingDeg, travelMode)
})
let sawMotion = false
sensors.onSample(() => {
  sawMotion = true
})

let map = null
let mapReady = false
let pin = null
let marker = null
let sensorsOn = false
let pointSource = null
let ringSource = null
let wedgeSource = null
let routeSource = null
let motionTimer = 0
let lastHeadingDraw = 0
let lastMoveDraw = 0
let sheet = null
let tab = "explorar"
let addingPin = false
let dropTarget = null
let userMapGesture = false
let pinMoveFrame = 0
let doorToken = 0
let doorBusy = false
let doorJob = null
let selected = null
let places = []
let streets = []
let graph = null
let geoReady = false
let addressBook = null
let mapStatus = ""
let addressStatus = ""
let roadStatus = ""
let placeStatus = ""
let waterStatus = ""
let buildingStatus = ""
let placeBook = null
let waterBook = null
let buildingBook = null
let buildingSource = null
let placeCategory = null
let poiSource = null
let waterSource = null
let searchToken = 0
let originPlace = null
let destPlace = null
let addressDirty = false
let labelToken = 0
let pinSearchToken = 0
let pinGeneration = 0
let chosenDoor = null
let dragging = false
let travelMode = "walk"
let navigating = false
let correcting = false
let fixing = false
let positionFixed = false
let fixHeld = null
let fixMoveFrame = 0
let fixDoorToken = 0
let fixDoorBusy = false
let fixDoorJob = null
let fixDoorShown = null
let followUser = false
let currentRoute = null
let routeOptions = []
let routesByMode = null
let showingDirections = false
let directionRoutes = []
let destMarker = null
let streetCells = null

function setStatus(text) {
  if (!text) {
    statusEl.hidden = true
    statusEl.textContent = ""
    return
  }
  statusEl.hidden = false
  statusEl.textContent = text
}

function showStatus() {
  setStatus(mapStatus || roadStatus || addressStatus || placeStatus || waterStatus || buildingStatus)
}

function formatStep(meters) {
  stepValue.textContent = `${metersFormat.format(meters)} m`
}

function formatKm(meters) {
  if (meters >= 1000) return `${wholeFormat.format(meters / 1000)} km`
  return `${wholeFormat.format(meters)} m`
}

function formatManeuverDistance(meters) {
  const value = Math.max(0, Number(meters) || 0)
  if (value < 25) return t("Agora")
  if (value < 1000) {
    const step = value < 200 ? 10 : 50
    return `${wholeFormat.format(Math.round(value / step) * step)} m`
  }
  if (value < 10000) return `${kmFormat.format(value / 1000)} km`
  return `${wholeFormat.format(value / 1000)} km`
}

function formatDistanceKm(meters) {
  const km = meters > 0 ? Math.max(meters / 1000, 0.1) : 0
  if (km < 10) return `${kmFormat.format(km)} km`
  return `${wholeFormat.format(km)} km`
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${wholeFormat.format(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${wholeFormat.format(hours)} h ${wholeFormat.format(rest)} min` : `${wholeFormat.format(hours)} h`
}

function formatDuration(meters, mode = travelMode, seconds) {
  const minutes = Number.isFinite(seconds) ? seconds / 60 : tripMinutes(meters, mode)
  return formatMinutes(minutes)
}

function formatArrival(meters, mode = travelMode, seconds) {
  const minutes = Number.isFinite(seconds) ? seconds / 60 : tripMinutes(meters, mode)
  return clockFormat.format(new Date(Date.now() + minutes * 60000))
}

function suggestionOrigin() {
  if (!tripEl.hidden || navigating) {
    const from = pointFrom(originInput.value, originPlace)
    if (from) return from
  }
  const pose = estimator.getPose()
  return pose ? { lat: pose.lat, lon: pose.lon } : null
}

function persist() {
  const pose = estimator.getPose()
  const data = {
    stepLength: estimator.getStepLength(),
    pin,
    pose: pose && {
      lat: pose.lat,
      lon: pose.lon,
      uncertaintyM: pose.uncertaintyM,
      steps: pose.steps,
      distanceM: pose.distanceM,
    },
    fixed: positionFixed,
  }
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(data))
  } catch {
    /* storage full or blocked */
  }
}

function readPins() {
  try {
    const pins = JSON.parse(localStorage.getItem(PINS_KEY) || "[]")
    return Array.isArray(pins) ? pins : []
  } catch {
    return []
  }
}

function writePins(pins) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins))
}

function updateButtons() {
  anchorBtn.disabled = !(mapReady && (chosenDoor || fold(addressInput.value).length >= 2))
}

function emptyCollection() {
  return { type: "FeatureCollection", features: [] }
}

function drawPose(pose) {
  if (!pointSource) return
  if (!pose) {
    pointSource.setData(emptyCollection())
    ringSource.setData(emptyCollection())
    wedgeSource.setData(emptyCollection())
    return
  }
  pointSource.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [pose.lon, pose.lat] },
  })
  ringSource.setData({
    type: "Feature",
    properties: {},
    geometry: circlePolygon(pose.lat, pose.lon, Math.max(pose.uncertaintyM, 4)),
  })
  if (pose.headingDeg == null) {
    wedgeSource.setData(emptyCollection())
  } else {
    const length = Math.max(16, Math.min(36, pose.uncertaintyM))
    wedgeSource.setData({
      type: "Feature",
      properties: {},
      geometry: wedgePolygon(pose.lat, pose.lon, pose.headingDeg, length),
    })
  }
}

const ROUTE_PAINT = [
  { id: "route-walk", styles: ["walk", "walk-alt"], color: "#4b5563", dash: null },
  { id: "route-bicycle", styles: ["bicycle", "bicycle-alt"], color: "#e84393", dash: null },
  { id: "route-toll", styles: ["toll"], color: "#eab308", dash: null },
  { id: "route-local", styles: ["local"], color: "#dc2626", dash: null },
  { id: "route-car", styles: ["car"], color: "#1a73e8", dash: null },
]

function sameCoord(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
}

function walkChordAllowed(lat, lon, point) {
  if (travelMode !== "walk" || !graph?.buildings?.links || !point) return true
  return graph.buildings.links(lat, lon, point[1], point[0])
}

function overviewLine(coordinates, from, to) {
  const line = coordinates.slice()
  if (from) {
    const start = [from.lon, from.lat]
    if (line.length && !sameCoord(line[0], start) && walkChordAllowed(from.lat, from.lon, line[0])) line.unshift(start)
    else if (!line.length) line.unshift(start)
  }
  if (to) {
    const end = [to.lon, to.lat]
    const last = line[line.length - 1]
    if (last && !sameCoord(last, end) && walkChordAllowed(to.lat, to.lon, last)) line.push(end)
    else if (!last) line.push(end)
  }
  return line
}

function drawRoute(coordinates, style = "car") {
  if (!routeSource) return
  if (!coordinates) {
    routeSource.setData(emptyCollection())
    return
  }
  drawRoutes([{ coordinates, style }])
}

function drawRoutes(routes) {
  if (!routeSource) return
  routeSource.setData({
    type: "FeatureCollection",
    features: routes
      .filter((route) => route?.coordinates?.length > 1)
      .map((route) => ({
        type: "Feature",
        properties: { style: route.style || "car" },
        geometry: { type: "LineString", coordinates: route.drawn || route.coordinates },
      })),
  })
}

function stampPin(lat, lon) {
  if (!marker) return
  const element = marker.getElement()
  element.dataset.lat = String(lat)
  element.dataset.lon = String(lon)
}

function ensureUserMarker(lat, lon, { force = false } = {}) {
  if (!mapReady) return
  if (!marker) {
    const element = document.createElement("div")
    element.className = "user-dot"
    marker = new Marker({ element, anchor: "center", draggable: !addingPin }).setLngLat([lon, lat]).addTo(map)
    marker.on("dragstart", () => {
      dragging = true
      labelToken += 1
      pinGeneration += 1
    })
    marker.on("dragend", () => {
      const lngLat = marker.getLngLat()
      if (addingPin) {
        dragging = false
        return
      }
      dropUser(lngLat.lat, lngLat.lng).finally(() => {
        dragging = false
      })
    })
  } else if (force || !dragging) {
    marker.setLngLat([lon, lat])
  }
  stampPin(lat, lon)
}

function setPin(lat, lon, { moveMap = false } = {}) {
  pin = { lat, lon }
  ensureUserMarker(lat, lon, { force: true })
  if (moveMap && mapReady) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 16), duration: 0 })
  updateButtons()
  persist()
}

function anchorAt(lat, lon) {
  setPin(lat, lon, { moveMap: true })
  estimator.resetTo(lat, lon)
  persist()
}

async function dropUser(lat, lon) {
  const token = ++labelToken
  const hit = addressBook ? await nearestDoor(addressBook, lat, lon) : null
  if (token !== labelToken) return
  const at = hit ? { lat: hit.lat, lon: hit.lon } : { lat, lon }
  chosenDoor = hit ? { name: hit.name, lat: hit.lat, lon: hit.lon } : null
  addressDirty = Boolean(hit)
  if (hit) {
    addressInput.value = hit.name
    originPlace = { name: hit.name, lat: at.lat, lon: at.lon }
    originInput.value = hit.name
  }
  pinResults.hidden = true
  setPin(at.lat, at.lon)
  estimator.resetTo(at.lat, at.lon)
  if (sheet !== "pin") openSheet()
  refreshStart()
  if (destPlace && !navigating) showTrip()
  persist()
}

async function labelPin() {
  const token = ++labelToken
  const here = pin
  if (!here || !addressBook || addressDirty) return
  const hit = await nearestDoor(addressBook, here.lat, here.lon)
  if (token !== labelToken || addressDirty || !hit) return
  if (!pin || pin.lat !== here.lat || pin.lon !== here.lon) return
  addressInput.value = hit.name
  updateButtons()
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null")
  } catch {
    return null
  }
}

function syncPositionPrompt() {
  const show = !positionFixed && tab === "explorar" && !navigating && !fixing && !addingPin
  positionPrompt.hidden = !show
  fixBtn.classList.toggle("needs-fix", show)
}

function restore() {
  const data = readStored()
  if (!data) return
  positionFixed = Boolean(data.fixed)
  if (Number.isFinite(data.stepLength)) {
    estimator.setStepLength(data.stepLength)
    stepInput.value = String(data.stepLength)
    formatStep(data.stepLength)
  }
  if (data.pose) estimator.hydrate(data.pose)
  if (data.pin && Number.isFinite(data.pin.lat) && Number.isFinite(data.pin.lon)) setPin(data.pin.lat, data.pin.lon)
  updateButtons()
  syncPositionPrompt()
}

function addOverlay() {
  map.addSource("route", { type: "geojson", data: emptyCollection() })
  map.addSource("uncertainty", { type: "geojson", data: emptyCollection() })
  map.addSource("heading", { type: "geojson", data: emptyCollection() })
  map.addSource("position", { type: "geojson", data: emptyCollection() })
  routeSource = map.getSource("route")
  ringSource = map.getSource("uncertainty")
  wedgeSource = map.getSource("heading")
  pointSource = map.getSource("position")
  for (const spec of ROUTE_PAINT) {
    map.addLayer({
      id: spec.id,
      type: "line",
      source: "route",
      filter: ["in", ["get", "style"], ["literal", spec.styles]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": spec.color,
        "line-width": 5,
        "line-opacity": 0.92,
        ...(spec.dash ? { "line-dasharray": spec.dash } : {}),
      },
    })
    map.addLayer({
      id: `${spec.id}-hit`,
      type: "line",
      source: "route",
      filter: ["in", ["get", "style"], ["literal", spec.styles]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": spec.color, "line-width": 14, "line-opacity": 0.01 },
    })
  }
  map.on("click", (event) => {
    if (!showingDirections) return
    const features = map.queryRenderedFeatures(event.point, {
      layers: ["route-car-hit", "route-toll-hit", "route-local-hit", "route-bicycle-hit", "route-walk-hit"],
    })
    const style = features[0]?.properties?.style
    const route = directionRoutes.find((item) => item.style === style)
    if (route) beginNavigation(route)
  })
  map.addLayer({
    id: "uncertainty-fill",
    type: "fill",
    source: "uncertainty",
    paint: { "fill-color": "#0f6b4c", "fill-opacity": 0.16 },
  })
  map.addLayer({
    id: "uncertainty-line",
    type: "line",
    source: "uncertainty",
    paint: { "line-color": "#0f6b4c", "line-width": 2, "line-opacity": 0.85 },
  })
  map.addLayer({
    id: "heading-fill",
    type: "fill",
    source: "heading",
    paint: { "fill-color": "#0f6b4c", "fill-opacity": 0.55 },
  })
  for (const spec of CATEGORIES) {
    const canvas = categoryIcon(spec.id)
    const image = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    map.addImage(`poi-${spec.id}`, { width: image.width, height: image.height, data: new Uint8Array(image.data) }, { pixelRatio: 2 })
  }
  map.addSource("buildings", { type: "geojson", data: emptyCollection() })
  buildingSource = map.getSource("buildings")
  map.addLayer({
    id: "building-outline",
    type: "line",
    source: "buildings",
    minzoom: 15,
    paint: { "line-color": "#8d8478", "line-width": 1.25 },
  })
  map.addSource("pois", { type: "geojson", data: emptyCollection() })
  poiSource = map.getSource("pois")
  map.addLayer({
    id: "poi-symbols",
    type: "symbol",
    source: "pois",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": 0.85,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-optional": true,
      "text-max-width": 10,
      "text-padding": 2,
      "symbol-sort-key": ["-", 10, ["get", "category"]],
    },
    paint: {
      "text-color": "#1c1916",
      "text-halo-color": "#fffcf8",
      "text-halo-width": 1.2,
    },
  })
  map.on("click", "poi-symbols", (event) => {
    if (navigating || correcting || fixing) return
    const feature = event.features?.[0]
    if (!feature) return
    const [lon, lat] = feature.geometry.coordinates
    const place = {
      name: feature.properties.name,
      address: feature.properties.address || "",
      lat,
      lon,
      service: true,
    }
    if (addingPin) {
      placeDroppedPin(lat, lon, place)
      return
    }
    chooseDestination(place)
  })
  const drop = waterIcon()
  const dropImage = drop.getContext("2d").getImageData(0, 0, drop.width, drop.height)
  map.addImage("water-drop", { width: dropImage.width, height: dropImage.height, data: new Uint8Array(dropImage.data) }, { pixelRatio: 2 })
  map.addSource("water", { type: "geojson", data: emptyCollection() })
  waterSource = map.getSource("water")
  map.addLayer({
    id: "water-symbols",
    type: "symbol",
    source: "water",
    filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "icon-image": "water-drop",
      "icon-size": 0.85,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-optional": true,
      "text-max-width": 10,
      "text-padding": 2,
    },
    paint: {
      "text-color": "#1c1916",
      "text-halo-color": "#fffcf8",
      "text-halo-width": 1.2,
    },
  })
  map.on("click", "water-symbols", (event) => {
    if (navigating || correcting || fixing) return
    const feature = event.features?.[0]
    if (!feature) return
    const place = {
      name: feature.properties.name,
      address: feature.properties.typeLabel || "",
      lat: Number(feature.properties.lat),
      lon: Number(feature.properties.lon),
      service: true,
    }
    if (addingPin) {
      placeDroppedPin(place.lat, place.lon, place)
      return
    }
    chooseDestination(place)
  })
}

function layoutMap() {
  if (!map) return
  const sheetEl = !pinSheet.hidden ? pinSheet : !placesSheet.hidden ? placesSheet : null
  const sheetH = sheetEl ? sheetEl.getBoundingClientRect().height : 0
  const cardEl = !navCard.hidden ? navCard : !tripEl.hidden ? tripEl : !saveCard.hidden ? saveCard : !placeCard.hidden ? placeCard : null
  const cardH = cardEl ? cardEl.getBoundingClientRect().height : 0
  const lift = Math.max(sheetH, cardH)
  document.documentElement.style.setProperty("--lift", `${lift}px`)
  if (addingPin || correcting || fixing) {
    const padding = map.getPadding()
    if (!userMapGesture && (padding.top || padding.right || padding.bottom || padding.left)) {
      map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })
    }
    return
  }
  const browsing = tab === "explorar" && !navigating
  const top = navigating ? 96 : browsing ? Math.min(topEl.getBoundingClientRect().height, 160) + 16 : 12
  const bottom = navigating ? cardH + 16 : lift + 64
  map.setPadding({ top, right: 8, bottom, left: 8 })
}

function openSheet() {
  sheet = sheet === "pin" ? null : "pin"
  pinSheet.hidden = sheet !== "pin"
  fixBtn.setAttribute("aria-pressed", sheet === "pin" ? "true" : "false")
  if (sheet !== "pin") pinResults.hidden = true
  placeCard.hidden = true
  syncTypingFields()
  layoutMap()
}

function closeTrip() {
  destPlace = null
  destInput.value = ""
  currentRoute = null
  routeOptions = []
  routesByMode = null
  showingDirections = false
  directionRoutes = []
  routeList.hidden = true
  tripName.hidden = true
  routeCards.hidden = true
  routeCards.replaceChildren()
  tripCoords.textContent = ""
  drawRoute(null)
  if (destMarker) destMarker.remove()
  tripEl.hidden = true
  refreshStart()
  layoutMap()
}

function formatCoord(lat, lon) {
  const text = (value) => value.toFixed(5).replace(".", ",")
  return `${text(lat)}, ${text(lon)}`
}

function renderCategories() {
  categoryBar.replaceChildren()
  for (const spec of CATEGORIES) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.cat = String(spec.id)
    button.setAttribute("aria-label", spec.label)
    button.setAttribute("aria-pressed", "false")
    const img = document.createElement("img")
    img.alt = ""
    img.width = 22
    img.height = 22
    img.src = categoryIcon(spec.id).toDataURL()
    const count = document.createElement("span")
    count.className = "cat-count"
    count.textContent = "0"
    button.append(img, count)
    button.addEventListener("click", () => toggleCategory(spec.id))
    categoryBar.append(button)
  }
  const water = document.createElement("button")
  water.type = "button"
  water.dataset.cat = "water"
  water.setAttribute("aria-label", "Água")
  water.setAttribute("aria-pressed", "false")
  const waterImg = document.createElement("img")
  waterImg.alt = ""
  waterImg.width = 22
  waterImg.height = 22
  waterImg.src = waterIcon().toDataURL()
  const waterCount = document.createElement("span")
  waterCount.className = "cat-count"
  waterCount.textContent = "…"
  water.append(waterImg, waterCount)
  water.addEventListener("click", () => toggleCategory("water"))
  categoryBar.append(water)
}

function renderPlaceList(kind, items) {
  placesTitle.textContent = CATEGORIES[kind].label
  placesList.replaceChildren()
  if (!items.length) {
    const li = document.createElement("li")
    li.className = "muted"
    li.textContent = "Sem lugares"
    placesList.append(li)
    return
  }
  for (const place of items) {
    const li = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    const title = document.createElement("span")
    title.textContent = place.name
    const detail = document.createElement("span")
    detail.className = "result-detail"
    detail.textContent = place.address
    const coords = document.createElement("span")
    coords.className = "result-detail"
    coords.textContent = formatCoord(place.lat, place.lon)
    button.append(title, detail, coords)
    button.addEventListener("click", () => {
      placesSheet.hidden = true
      const picked = { name: place.name, address: place.address, lat: place.lat, lon: place.lon, service: true }
      if (addingPin) placeDroppedPin(place.lat, place.lon, picked)
      else chooseDestination(picked)
    })
    li.append(button)
    placesList.append(li)
  }
}

function renderWaterList(items) {
  placesTitle.textContent = "Água"
  placesList.replaceChildren()
  if (!waterBook) {
    const li = document.createElement("li")
    li.className = "muted"
    li.textContent = "A guardar água"
    placesList.append(li)
    return
  }
  if (!items.length) {
    const li = document.createElement("li")
    li.className = "muted"
    li.textContent = "Sem água"
    placesList.append(li)
    return
  }
  for (const place of items) {
    const li = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    const title = document.createElement("span")
    title.textContent = place.name
    const detail = document.createElement("span")
    detail.className = "result-detail"
    detail.textContent = place.typeLabel
    const coords = document.createElement("span")
    coords.className = "result-detail"
    coords.textContent = formatCoord(place.lat, place.lon)
    button.append(title, detail, coords)
    button.addEventListener("click", () => {
      placesSheet.hidden = true
      const picked = { name: place.name, address: place.typeLabel, lat: place.lat, lon: place.lon, service: true }
      if (addingPin) placeDroppedPin(place.lat, place.lon, picked)
      else chooseDestination(picked)
    })
    li.append(button)
    placesList.append(li)
  }
}

function attachBuildings() {
  if (!(graph && buildingBook)) return
  graph.buildings = buildingBook
  graph.walkOpen = null
  routesByMode = null
}

function refreshBuildings() {
  if (!mapReady || !buildingSource) return
  if (!buildingBook || map.getZoom() < 15) {
    buildingSource.setData(emptyCollection())
    return
  }
  const bounds = map.getBounds()
  buildingSource.setData(buildingsInView(buildingBook, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()))
}

function refreshWater() {
  const count = categoryBar.querySelector('[data-cat="water"] .cat-count')
  if (!mapReady) return
  if (!waterBook) {
    if (count) count.textContent = "…"
    if (placeCategory === "water" && !placesSheet.hidden) renderWaterList([])
    return
  }
  const bounds = map.getBounds()
  const view = waterInView(waterBook, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(), map.getZoom())
  if (count) count.textContent = String(view.total)
  if (waterSource) waterSource.setData(view.collection)
  if (placeCategory === "water" && !placesSheet.hidden) renderWaterList(view.list)
}

function refreshPois() {
  if (!mapReady) return
  refreshWater()
  refreshBuildings()
  if (!placeBook) return
  const bounds = map.getBounds()
  const west = bounds.getWest()
  const south = bounds.getSouth()
  const east = bounds.getEast()
  const north = bounds.getNorth()
  const zoom = map.getZoom()
  const view = placesInView(placeBook, west, south, east, north, -1, 1e9)
  const icons = serviceIcons(view.items, zoom)
  for (const button of categoryBar.querySelectorAll("[data-cat]")) {
    if (button.dataset.cat === "water") continue
    const count = button.querySelector(".cat-count")
    if (count) count.textContent = String(view.counts[Number(button.dataset.cat)])
  }
  if (poiSource) {
    poiSource.setData({
      type: "FeatureCollection",
      features: icons.map((place) => ({
        type: "Feature",
        properties: { name: place.name, address: place.address || "", icon: `poi-${place.category}`, category: place.category },
        geometry: { type: "Point", coordinates: [place.lon, place.lat] },
      })),
    })
  }
  if (typeof placeCategory === "number" && !placesSheet.hidden && placeBook) {
    const listed = placesInView(placeBook, west, south, east, north, placeCategory, 160)
    renderPlaceList(placeCategory, listed.items)
  }
}

function toggleCategory(id) {
  placeCategory = placeCategory === id ? null : id
  for (const button of categoryBar.querySelectorAll("[data-cat]")) {
    button.setAttribute("aria-pressed", button.dataset.cat === String(placeCategory) ? "true" : "false")
  }
  placesSheet.hidden = placeCategory == null || tab !== "explorar" || navigating
  if (!placesSheet.hidden) {
    pinSheet.hidden = true
    sheet = null
    fixBtn.setAttribute("aria-pressed", "false")
    syncTypingFields()
  }
  refreshPois()
  layoutMap()
}

function closePlaces() {
  placeCategory = null
  placesSheet.hidden = true
  for (const button of categoryBar.querySelectorAll("[data-cat]")) {
    button.setAttribute("aria-pressed", "false")
  }
  layoutMap()
}

function closePinSheet() {
  if (sheet !== "pin") return
  sheet = null
  pinSheet.hidden = true
  if (!fixing) fixBtn.setAttribute("aria-pressed", "false")
  pinResults.hidden = true
  placeCard.hidden = true
  syncTypingFields()
  layoutMap()
}

function renderedName(layer, lat, lon) {
  if (!map?.getLayer(layer)) return null
  const pixel = map.project([lon, lat])
  const pad = 22
  const hits = map.queryRenderedFeatures(
    [
      [pixel.x - pad, pixel.y - pad],
      [pixel.x + pad, pixel.y + pad],
    ],
    { layers: [layer] },
  )
  let best = null
  let bestPx = pad
  for (const item of hits || []) {
    if (item.geometry?.type !== "Point") continue
    const [flon, flat] = item.geometry.coordinates
    const point = map.project([flon, flat])
    const distance = Math.hypot(point.x - pixel.x, point.y - pixel.y)
    if (distance < bestPx) {
      best = item
      bestPx = distance
    }
  }
  if (!best) return null
  const propLat = Number(best.properties.lat)
  const propLon = Number(best.properties.lon)
  const flat = Number.isFinite(propLat) ? propLat : best.geometry.coordinates[1]
  const flon = Number.isFinite(propLon) ? propLon : best.geometry.coordinates[0]
  const name = best.properties.name || ""
  if (!name) return null
  return { name, meters: metersBetween(lat, lon, flat, flon) }
}

function namedUnderPin(lat, lon) {
  const found = []
  const poi = renderedName("poi-symbols", lat, lon)
  const water = renderedName("water-symbols", lat, lon)
  if (poi) found.push(poi)
  if (water) found.push(water)
  if (placeBook) {
    const view = placesInView(placeBook, lon - 0.0004, lat - 0.0004, lon + 0.0004, lat + 0.0004, -1, 20)
    for (const place of view.items) {
      const meters = metersBetween(lat, lon, place.lat, place.lon)
      if (meters <= 20 && place.name) found.push({ name: place.name, meters })
    }
  }
  if (waterBook) {
    const view = waterInView(waterBook, lon - 0.0004, lat - 0.0004, lon + 0.0004, lat + 0.0004, map.getZoom())
    for (const place of view.list) {
      const meters = metersBetween(lat, lon, place.lat, place.lon)
      if (meters <= 20 && place.name) found.push({ name: place.name, meters })
    }
  }
  for (const saved of readPins()) {
    if (!Number.isFinite(saved.lat) || !Number.isFinite(saved.lon) || !saved.name) continue
    const meters = metersBetween(lat, lon, saved.lat, saved.lon)
    if (meters <= 20) found.push({ name: saved.name, meters })
  }
  found.sort((a, b) => a.meters - b.meters)
  return found[0] || null
}

function showFixDoor(lat, lon, hit) {
  const distance = hit ? metersBetween(lat, lon, hit.lat, hit.lon) : Infinity
  if (hit && distance <= DOOR_NEAR_M) {
    fixAddress.hidden = false
    fixAddress.textContent = hit.name
    fixDoorShown = { lat, lon }
    return
  }
  fixAddress.hidden = true
  fixAddress.textContent = ""
  fixDoorShown = null
}

function queueFixDoor(lat, lon) {
  fixDoorJob = { lat, lon, token: ++fixDoorToken }
  if (!fixDoorBusy) runFixDoor()
}

async function runFixDoor() {
  if (fixDoorBusy) return
  fixDoorBusy = true
  while (fixDoorJob && fixing) {
    const job = fixDoorJob
    fixDoorJob = null
    let hit = null
    if (addressBook) {
      try {
        hit = await nearestDoor(addressBook, job.lat, job.lon)
      } catch (error) {
        console.error(error)
      }
    }
    if (job.token !== fixDoorToken || !fixing) continue
    const here = pointUnderPin()
    if (metersBetween(here.lat, here.lon, job.lat, job.lon) > 8) continue
    showFixDoor(job.lat, job.lon, hit)
  }
  fixDoorBusy = false
  if (fixDoorJob && fixing) runFixDoor()
}

function refreshFixCard() {
  if (!fixing || !mapReady) return
  const here = pointUnderPin()
  fixCoords.textContent = formatCoord(here.lat, here.lon)
  const named = namedUnderPin(here.lat, here.lon)
  if (named?.name) {
    fixName.hidden = false
    fixName.textContent = named.name
  } else {
    fixName.hidden = true
    fixName.textContent = ""
  }
  if (fixDoorShown && metersBetween(here.lat, here.lon, fixDoorShown.lat, fixDoorShown.lon) > 8) {
    fixAddress.hidden = true
    fixAddress.textContent = ""
    fixDoorShown = null
  }
  queueFixDoor(here.lat, here.lon)
}

function startFix() {
  if (!mapReady || navigating || correcting || addingPin || fixing) return
  fixHeld = { trip: !tripEl.hidden, places: !placesSheet.hidden }
  fixing = true
  sheet = null
  pinSheet.hidden = true
  pinResults.hidden = true
  resultsEl.hidden = true
  placeCard.hidden = true
  saveCard.hidden = true
  placesSheet.hidden = true
  tripEl.hidden = true
  fixBar.hidden = false
  centerPin.hidden = false
  topEl.hidden = false
  tools.hidden = true
  fixBtn.setAttribute("aria-pressed", "true")
  syncPositionPrompt()
  if (marker) marker.setDraggable(false)
  userMapGesture = false
  syncTypingFields()
  layoutMap()
  const here = pin || { lat: map.getCenter().lat, lon: map.getCenter().lng }
  map.jumpTo({ center: [here.lon, here.lat], zoom: Math.max(map.getZoom(), 16), bearing: 0 })
  refreshFixCard()
}

function stopFix() {
  if (!fixing) return
  fixing = false
  fixDoorToken += 1
  fixDoorJob = null
  fixDoorShown = null
  if (fixMoveFrame) cancelAnimationFrame(fixMoveFrame)
  fixMoveFrame = 0
  fixName.hidden = true
  fixName.textContent = ""
  fixAddress.hidden = true
  fixAddress.textContent = ""
  fixCoords.textContent = ""
  centerPin.hidden = true
  fixBar.hidden = true
  fixBtn.setAttribute("aria-pressed", "false")
  if (marker && !addingPin) marker.setDraggable(true)
  tools.hidden = tab !== "explorar" || navigating
  const held = fixHeld
  fixHeld = null
  if (held?.places && placeCategory != null && tab === "explorar" && !navigating) placesSheet.hidden = false
  if (held?.trip && tab === "explorar" && !navigating && destPlace) tripEl.hidden = false
  syncTypingFields()
  layoutMap()
  syncPositionPrompt()
}

function confirmFix() {
  if (!fixing || !mapReady) return
  const here = pointUnderPin()
  positionFixed = true
  stopFix()
  anchorAt(here.lat, here.lon)
}

const fieldSlot = {
  query: { parent: searchForm, before: clearBtn },
  address: { parent: pinSheet, before: document.querySelector("#pin-results") },
  sensor: { parent: sensorToggle.parentElement, before: sensorToggle.nextSibling },
  step: { parent: stepInput.parentElement, before: stepInput.nextSibling },
}

function mountField(input, slot, on) {
  if (on) {
    if (!input.isConnected) slot.parent.insertBefore(input, slot.before)
    input.disabled = false
    return
  }
  input.disabled = true
  if (input.isConnected) input.remove()
}

function isolateSearchField() {
  if (sheet === "pin") return
  for (const extra of document.querySelectorAll("input, textarea, select, [contenteditable]")) {
    if (extra !== queryInput) extra.remove()
  }
}

function releaseSearchSpace() {
  if (fixing) return
  if (tripEl.hidden && !showingDirections) return
  closeTrip()
}

function syncTypingFields() {
  const exploring = (tab === "explorar" || addingPin) && !navigating
  const pinning = exploring && sheet === "pin"
  mountField(queryInput, fieldSlot.query, exploring)
  mountField(addressInput, fieldSlot.address, pinning)
  const settings = tab === "definicoes"
  mountField(sensorToggle, fieldSlot.sensor, settings)
  mountField(stepInput, fieldSlot.step, settings)
  if (document.activeElement === queryInput) isolateSearchField()
}

function openPinSheet() {
  const willOpen = sheet !== "pin"
  openSheet()
  if (!willOpen) return
  if (!pin && mapReady) {
    const center = map.getCenter()
    setPin(center.lat, center.lng)
  }
  addressDirty = false
  if (pin) labelPin()
}

function showCard(place) {
  selected = place
  placeName.textContent = place.name
  placeCard.hidden = true
  layoutMap()
}

function serviceUnderPin(lat, lon) {
  if (!map || !placeBook) return null
  if (map.getLayer("poi-symbols")) {
    const pixel = map.project([lon, lat])
    const pad = 22
    const hits = map.queryRenderedFeatures(
      [
        [pixel.x - pad, pixel.y - pad],
        [pixel.x + pad, pixel.y + pad],
      ],
      { layers: ["poi-symbols"] },
    )
    let feature = null
    let nearest = pad
    for (const item of hits || []) {
      if (item.geometry?.type !== "Point") continue
      const [flon, flat] = item.geometry.coordinates
      const point = map.project([flon, flat])
      const distance = Math.hypot(point.x - pixel.x, point.y - pixel.y)
      if (distance < nearest) {
        feature = item
        nearest = distance
      }
    }
    if (feature) {
      const [flon, flat] = feature.geometry.coordinates
      return {
        service: true,
        name: feature.properties.name,
        address: feature.properties.address || "",
        lat: flat,
        lon: flon,
      }
    }
  }
  const view = placesInView(placeBook, lon - 0.00028, lat - 0.00028, lon + 0.00028, lat + 0.00028, -1, 20)
  let best = null
  let bestD = 20
  for (const place of view.items) {
    const distance = metersBetween(lat, lon, place.lat, place.lon)
    if (distance < bestD) {
      best = place
      bestD = distance
    }
  }
  return best ? { service: true, name: best.name, address: best.address || "", lat: best.lat, lon: best.lon } : null
}

function pointUnder(element, tip) {
  const box = element.getBoundingClientRect()
  const canvas = map.getCanvas().getBoundingClientRect()
  const lngLat = map.unproject([
    box.left + box.width / 2 - canvas.left,
    (tip ? box.bottom : box.top + box.height / 2) - canvas.top,
  ])
  return { lat: lngLat.lat, lon: lngLat.lng }
}

function pointUnderPin() {
  return pointUnder(centerPin, true)
}

function applyDoor(lat, lon, hit) {
  if (!addingPin || !dropTarget || dropTarget.service) return
  if (metersBetween(dropTarget.lat, dropTarget.lon, lat, lon) > 8) return
  const distance = hit ? metersBetween(lat, lon, hit.lat, hit.lon) : Infinity
  const near = Boolean(hit) && distance <= DOOR_NEAR_M
  if (near) {
    dropTarget.address = hit.name
    saveAddress.hidden = false
    saveAddress.textContent = hit.name
    saveCoords.hidden = true
  } else {
    delete dropTarget.address
    saveAddress.hidden = true
    saveAddress.textContent = ""
    saveCoords.hidden = false
    saveCoords.textContent = formatCoord(lat, lon)
  }
  layoutMap()
}

function queueDoor(lat, lon) {
  doorJob = { lat, lon, token: ++doorToken }
  if (!doorBusy) runDoor()
}

async function runDoor() {
  if (doorBusy) return
  doorBusy = true
  while (doorJob && addingPin) {
    const job = doorJob
    doorJob = null
    let hit = null
    if (addressBook) {
      try {
        hit = await nearestDoor(addressBook, job.lat, job.lon)
      } catch (error) {
        console.error(error)
      }
    }
    if (job.token !== doorToken || !addingPin) continue
    applyDoor(job.lat, job.lon, hit)
  }
  doorBusy = false
  if (doorJob && addingPin) runDoor()
}

function placeDroppedPin(lat, lon, known) {
  const service = known?.service ? known : serviceUnderPin(lat, lon)
  const wasHidden = saveCard.hidden
  if (service) {
    doorToken += 1
    doorJob = null
    dropTarget = { service: true, name: service.name, address: service.address || "", lat: service.lat, lon: service.lon }
    saveName.textContent = dropTarget.name
    saveName.hidden = false
    saveLabel.remove()
    saveAddress.hidden = !dropTarget.address
    saveAddress.textContent = dropTarget.address
    saveCoords.hidden = false
    saveCoords.textContent = formatCoord(dropTarget.lat, dropTarget.lon)
    saveButton.disabled = false
  } else {
    const typed = saveLabel.value
    const leavingService = Boolean(dropTarget?.service)
    dropTarget = { service: false, lat, lon }
    saveName.hidden = true
    if (!saveLabel.isConnected) saveCard.insertBefore(saveLabel, saveAddress)
    saveLabel.value = typed
    saveButton.disabled = typed.trim().length === 0
    if (leavingService || saveAddress.hidden) {
      saveAddress.hidden = true
      saveAddress.textContent = ""
      saveCoords.hidden = false
      saveCoords.textContent = formatCoord(lat, lon)
    }
    queueDoor(lat, lon)
  }
  saveCard.hidden = false
  if (known && mapReady) map.jumpTo({ center: [dropTarget.lon, dropTarget.lat], zoom: Math.max(map.getZoom(), 16) })
  if (wasHidden || known) layoutMap()
}

function stopAddPin() {
  addingPin = false
  userMapGesture = false
  if (pinMoveFrame) cancelAnimationFrame(pinMoveFrame)
  pinMoveFrame = 0
  doorToken += 1
  doorJob = null
  saveCard.hidden = true
  dropTarget = null
  saveLabel.value = ""
  saveAddress.hidden = true
  saveAddress.textContent = ""
  saveCoords.hidden = false
  saveCoords.textContent = ""
  saveLabel.remove()
  centerPin.hidden = true
  if (marker) marker.setDraggable(true)
}

function startAddPin() {
  addingPin = true
  tripEl.hidden = true
  placesSheet.hidden = true
  resultsEl.hidden = true
  sheet = null
  pinSheet.hidden = true
  fixBtn.setAttribute("aria-pressed", "false")
  placeCard.hidden = true
  saveCard.hidden = true
  pinsPanel.hidden = true
  settingsPanel.hidden = true
  topEl.hidden = false
  tools.hidden = true
  syncPositionPrompt()
  categoryBar.hidden = false
  if (marker) marker.setDraggable(false)
  centerPin.hidden = false
  userMapGesture = false
  syncTypingFields()
  layoutMap()
  const here = pin || (mapReady ? pointUnderPin() : { lat: VIEW.center[1], lon: VIEW.center[0] })
  if (mapReady) map.jumpTo({ center: [here.lon, here.lat], zoom: Math.max(map.getZoom(), 16), bearing: 0 })
  refreshPois()
}

function saveAddedPin() {
  if (!dropTarget) return
  const name = dropTarget.service ? dropTarget.name : saveLabel.value.trim()
  if (!name) return
  const entry = { name, lat: dropTarget.lat, lon: dropTarget.lon }
  if (dropTarget.address) entry.address = dropTarget.address
  const pins = readPins()
  const exists = pins.some(
    (item) => item.name === entry.name && Math.abs(item.lat - entry.lat) < 1e-4 && Math.abs(item.lon - entry.lon) < 1e-4,
  )
  if (!exists) writePins([entry, ...pins])
  stopAddPin()
  showTab("pins")
}

function renderPins() {
  const pins = readPins()
  pinList.replaceChildren()
  if (!pins.length) {
    const li = document.createElement("li")
    li.className = "empty"
    li.textContent = "Sem pins"
    pinList.append(li)
    return
  }
  for (const place of pins) {
    const li = document.createElement("li")
    li.className = "pin-row"
    const open = document.createElement("button")
    open.type = "button"
    open.className = "pin-main"
    const name = document.createElement("span")
    name.textContent = place.name
    const detail = document.createElement("span")
    detail.className = "result-detail"
    detail.textContent = formatCoord(place.lat, place.lon)
    open.append(name)
    if (place.address) {
      const address = document.createElement("span")
      address.className = "result-detail"
      address.textContent = place.address
      open.append(address)
    }
    open.append(detail)
    open.addEventListener("click", () => {
      showTab("explorar")
      chooseDestination(place)
    })
    const remove = document.createElement("button")
    remove.type = "button"
    remove.className = "remove"
    remove.textContent = "Remover"
    remove.addEventListener("click", () => {
      writePins(readPins().filter((item) => item !== place && !(item.name === place.name && item.lat === place.lat && item.lon === place.lon)))
      renderPins()
    })
    li.append(open, remove)
    pinList.append(li)
  }
}

function showTab(name) {
  if (addingPin) stopAddPin()
  if (fixing) stopFix()
  importSheet.hidden = true
  tab = name
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.setAttribute("aria-current", button.dataset.tab === name ? "page" : "false")
  }
  const explore = name === "explorar"
  pinsPanel.hidden = name !== "pins"
  settingsPanel.hidden = name !== "definicoes"
  topEl.hidden = !explore
  tools.hidden = !explore
  categoryBar.hidden = !explore
  if (!explore) placesSheet.hidden = true
  if (!explore) {
    sheet = null
    pinSheet.hidden = true
    fixBtn.setAttribute("aria-pressed", "false")
    pinResults.hidden = true
    placeCard.hidden = true
    tripEl.hidden = true
    resultsEl.hidden = true
  } else if (!navigating && destPlace) {
    tripEl.hidden = false
  }
  placeCard.hidden = true
  if (name === "pins") renderPins()
  syncTypingFields()
  syncPositionPrompt()
  layoutMap()
}

function nearestPlaceName(lat, lon) {
  let best = ""
  let bestD = Infinity
  const scale = Math.cos((lat * Math.PI) / 180)
  for (const place of places) {
    const dLat = place.lat - lat
    const dLon = (place.lon - lon) * scale
    const d = dLat * dLat + dLon * dLon
    if (d < bestD) {
      bestD = d
      best = place.name
    }
  }
  return best
}

function resultLines(item) {
  if (item.service) {
    const city = item.address || (Number.isFinite(item.lat) ? nearestPlaceName(item.lat, item.lon) : "")
    return { title: item.name, detail: city && city !== item.name ? city : "" }
  }
  const comma = item.name.indexOf(", ")
  if (comma > 0) return { title: item.name.slice(0, comma), detail: item.name.slice(comma + 2) }
  const city = item.city || (Number.isFinite(item.lat) ? nearestPlaceName(item.lat, item.lon) : "")
  return { title: item.name, detail: city && city !== item.name ? city : "" }
}

function fillResultButton(button, item, origin) {
  const lines = resultLines(item)
  if (origin && Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    const distance = document.createElement("span")
    distance.className = "result-km"
    distance.textContent = formatDistanceKm(metersBetween(origin.lat, origin.lon, item.lat, item.lon))
    button.append(distance)
  }
  const title = document.createElement("span")
  title.textContent = lines.title
  button.append(title)
  if (lines.detail) {
    const detail = document.createElement("span")
    detail.className = "result-detail"
    detail.textContent = lines.detail
    button.append(detail)
  }
}

async function renderResultList(list, query, token, onChoose) {
  list.replaceChildren()
  if (fold(query).length < 2 || (!geoReady && !addressBook && !placeBook)) {
    list.hidden = true
    return
  }
  const door = parseDoorQuery(query, addressBook ? addressBook.cityKeys : new Set())
  const origin = suggestionOrigin()
  const anchor = origin || (pin ? { lat: pin.lat, lon: pin.lon } : null)
  const addresses = addressBook ? await suggestAddresses(addressBook, query, 8, anchor) : []
  if (token !== (list === pinResults ? pinSearchToken : searchToken)) return
  const generic = new Set(["rua", "avenida", "travessa", "largo", "praca", "estrada", "caminho", "alameda", "beco"])
  const services = list === resultsEl && placeBook ? searchServices(placeBook, query, 6) : []
  if (origin) {
    services.sort((a, b) => metersBetween(origin.lat, origin.lon, a.lat, a.lon) - metersBetween(origin.lat, origin.lon, b.lat, b.lon) || a.rank - b.rank)
  }
  const found = [
    ...services,
    ...addresses,
    ...(list === resultsEl && geoReady ? searchNames(places, query, 4).filter((place) => !generic.has(fold(place.name))) : []),
    ...(list === resultsEl && geoReady && !addresses.length ? searchNames(streets, query, 4) : []),
  ]
  if (!found.length) {
    const li = document.createElement("li")
    li.className = "muted"
    li.textContent = !addressBook && (door.number || fold(query).length >= 2) ? "A guardar moradas" : "Sem resultados"
    list.append(li)
    list.hidden = false
    return
  }
  for (const item of found) {
    const li = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    fillResultButton(button, item, origin)
    button.addEventListener("click", () => onChoose(item))
    li.append(button)
    list.append(li)
  }
  list.hidden = false
  if (list === pinResults) layoutMap()
}

function renderResults(query) {
  return renderResultList(resultsEl, query, ++searchToken, choose)
}

function renderAddressSuggestions(query) {
  return renderResultList(pinResults, query, ++pinSearchToken, pickDoor)
}

function pickDoor(item) {
  chosenDoor = item
  addressDirty = true
  labelToken += 1
  addressInput.value = item.name
  pinResults.hidden = true
  setPin(item.lat, item.lon, { moveMap: true })
  layoutMap()
}

async function fixPosition() {
  let door = chosenDoor
  const typed = addressInput.value.trim()
  if (!door || fold(door.name) !== fold(typed)) {
    const hits = addressBook ? await suggestAddresses(addressBook, typed, 1) : []
    door = hits[0] || null
  }
  if (!door || !mapReady) {
    if (!addressBook) setStatus("A guardar moradas")
    return
  }
  chosenDoor = door
  addressDirty = true
  addressInput.value = door.name
  pinResults.hidden = true
  anchorAt(door.lat, door.lon)
  originPlace = { name: door.name, lat: door.lat, lon: door.lon }
  originInput.value = door.name
  refreshStart()
  closePinSheet()
  if (destPlace) showTrip()
}

async function setSensors(on, { quiet = false } = {}) {
  if (on === sensorsOn) {
    sensorToggle.checked = sensorsOn
    return
  }
  if (!on) {
    estimator.stop()
    sensorsOn = false
    window.clearTimeout(motionTimer)
    sensorToggle.checked = false
    return
  }
  try {
    sawMotion = false
    await estimator.start()
    sensorsOn = true
    sensorToggle.checked = true
  } catch (error) {
    sensorsOn = false
    sensorToggle.checked = false
    if (!quiet) setStatus(error.code === "denied" ? "Permissão recusada" : "Sensores indisponíveis")
  }
}

function showDestPin(place) {
  if (!mapReady || !place || !Number.isFinite(place.lat)) return
  if (!destMarker) {
    const element = document.createElement("div")
    element.className = "map-pin"
    element.innerHTML =
      '<svg viewBox="0 0 24 36" aria-hidden="true"><path d="M12 1C6 1 1.2 5.8 1.2 11.8 1.2 20.2 12 35 12 35s10.8-14.8 10.8-23.2C22.8 5.8 18 1 12 1z" fill="#e11d2e"/><circle cx="12" cy="12" r="4" fill="#fff"/></svg>'
    destMarker = new Marker({ element, anchor: "bottom" }).setLngLat([place.lon, place.lat]).addTo(map)
  } else {
    destMarker.setLngLat([place.lon, place.lat])
    destMarker.addTo(map)
  }
}

function indexStreets() {
  const cells = new globalThis.Map()
  for (const street of streets) {
    const key = `${Math.round(street.lat / 0.008)}:${Math.round(street.lon / 0.008)}`
    const list = cells.get(key)
    if (list) list.push(street)
    else cells.set(key, [street])
  }
  streetCells = cells
}

function streetAt(lat, lon) {
  const cells = streetCells
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

function spokenDistance(meters) {
  const value = Math.max(0, Number(meters) || 0)
  if (value < 25) return { now: true, text: t("Agora") }
  if (value < 1000) {
    const step = value < 200 ? 10 : 50
    return { now: false, text: t("{n} metros", { n: wholeFormat.format(Math.round(value / step) * step) }) }
  }
  return { now: false, text: formatManeuverDistance(value) }
}

function maneuverSentence(step, street) {
  const distance = spokenDistance(step.meters)
  if (street && step.turn !== "straight") {
    const key = distance.now ? "Agora, virar para a {street}" : "A {distance}, virar para a {street}"
    return t(key, { distance: distance.text, street })
  }
  if (street) {
    const key = distance.now ? "Agora, siga em frente pela {street}" : "A {distance}, siga em frente pela {street}"
    return t(key, { distance: distance.text, street })
  }
  if (distance.now) return t(step.text)
  return t("A {distance}, {turn}", { distance: distance.text, turn: t(step.text) })
}

function routeKey(from, to) {
  return `${from.lat.toFixed(5)}:${from.lon.toFixed(5)}:${to.lat.toFixed(5)}:${to.lon.toFixed(5)}`
}

function fillTrip() {
  tripTitle.textContent = MODE_TITLE[travelMode] || MODE_TITLE.walk
  const from = pointFrom(originInput.value, originPlace)
  const to = pointFrom(destInput.value, destPlace)
  const named = Boolean(destPlace?.service && destPlace.name)
  tripName.hidden = !named
  tripName.textContent = named ? destPlace.name : ""
  tripCoords.textContent = to ? formatCoord(to.lat, to.lon) : ""
  if (!showingDirections) {
    routeCards.hidden = true
    routeCards.replaceChildren()
  }
  const pack = from && to && routesByMode && routesByMode.key === routeKey(from, to) ? routesByMode : null
  for (const button of document.querySelectorAll("[data-mode]")) {
    const time = button.querySelector(".mode-time")
    const route = pack?.modes?.[button.dataset.mode]
    if (time) time.textContent = route ? formatDuration(route.meters, button.dataset.mode, route.seconds) : ""
  }
  const meters = currentRoute ? currentRoute.meters : 0
  tripDuration.textContent = meters ? formatDuration(meters, travelMode, currentRoute.seconds) : ""
  tripMeta.textContent = meters ? `${formatArrival(meters, travelMode, currentRoute.seconds)} · ${formatKm(meters)}` : ""
}

function renderRouteList() {
  routeList.replaceChildren()
  if (!routeOptions.length) {
    const li = document.createElement("li")
    li.className = "muted"
    li.textContent = "Sem percurso"
    routeList.append(li)
    return
  }
  routeOptions.forEach((route, index) => {
    const li = document.createElement("li")
    const button = document.createElement("button")
    button.type = "button"
    const time = document.createElement("span")
    time.className = "result-km"
    time.textContent = formatDuration(route.meters)
    const label = document.createElement("span")
    label.textContent = index === 0 ? "Mais curta" : "Alternativa"
    const detail = document.createElement("span")
    detail.className = "result-detail"
    detail.textContent = formatKm(route.meters)
    button.append(time, label, detail)
    button.addEventListener("click", () => beginNavigation(route))
    li.append(button)
    routeList.append(li)
  })
}

function showTrip() {
  const from = pointFrom(originInput.value, originPlace)
  const to = pointFrom(destInput.value, destPlace)
  if (to) showDestPin(to)
  if (!from || !to || !mapReady || !graph) {
    currentRoute = null
    routeOptions = []
    drawRoute(null)
    fillTrip()
    refreshStart()
    return
  }
  const key = routeKey(from, to)
  if (!routesByMode || routesByMode.key !== key) {
    routesByMode = {
      key,
      modes: {
        walk: findRoute(graph, from, to, null, "walk"),
        car: findRoute(graph, from, to, null, "car"),
        bicycle: findRoute(graph, from, to, null, "bicycle"),
      },
      alts: null,
      altMode: "",
    }
  }
  currentRoute = routesByMode.modes[travelMode] || null
  routeOptions = []
  routeList.hidden = true
  if (showingDirections) drawDirectionOverlay(from, to)
  else drawRoute(currentRoute ? currentRoute.coordinates : null, travelMode === "walk" ? "walk" : travelMode === "bicycle" ? "bicycle" : "car")
  fillTrip()
  if (navigating) updateNav()
  refreshStart()
}

function sameRoute(a, b) {
  if (!a || !b) return false
  if (a.edges?.length && a.edges.length === b.edges?.length && a.edges.every((edge, index) => edge === b.edges[index])) return true
  const seconds = Math.abs((a.seconds || 0) - (b.seconds || 0))
  return seconds < 45 && Math.abs(a.meters - b.meters) < 400
}

function choicesFor(from, to) {
  if (!routesByMode || routesByMode.key !== routeKey(from, to)) return []
  if (!routesByMode.choices) routesByMode.choices = {}
  if (routesByMode.choices[travelMode]) return routesByMode.choices[travelMode]
  let routes = []
  if (travelMode === "car") {
    const fastest = routesByMode.modes.car
    const noToll = graph ? findRoute(graph, from, to, null, "car", Infinity, (edge) => !isTollEdge(graph, edge)) : null
    const noMotorway = graph ? findRoute(graph, from, to, null, "car", Infinity, (edge) => !isMotorwayEdge(graph, edge)) : null
    if (fastest) routes.push({ ...fastest, style: "car", label: "Mais rápido" })
    if (noToll && !sameRoute(fastest, noToll)) routes.push({ ...noToll, style: "toll", label: "Sem portagens" })
    if (noMotorway && !sameRoute(fastest, noMotorway) && !sameRoute(noToll, noMotorway)) {
      routes.push({ ...noMotorway, style: "local", label: "Sem autoestradas" })
    }
  } else if (graph) {
    const style = travelMode === "walk" ? "walk" : "bicycle"
    routes = findRoutes(graph, from, to, travelMode).slice(0, 2).map((route, index) => ({
      ...route,
      style: index === 0 ? style : `${style}-alt`,
      label: index === 0 ? "Mais curto" : "Alternativa",
    }))
  }
  routesByMode.choices[travelMode] = routes
  return routes
}

function renderRouteCards(routes) {
  routeCards.replaceChildren()
  if (!showingDirections || !routes.length) {
    routeCards.hidden = true
    return
  }
  for (const route of routes) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "route-card"
    const swatch = document.createElement("i")
    swatch.className = `swatch swatch-${route.style}`
    const title = document.createElement("span")
    title.className = "route-card-title"
    title.textContent = route.label
    const meta = document.createElement("span")
    meta.className = "route-card-meta"
    meta.textContent = `${formatDuration(route.meters, travelMode, route.seconds)} · ${formatKm(route.meters)}`
    button.append(swatch, title, meta)
    button.addEventListener("click", () => beginNavigation(route))
    routeCards.append(button)
  }
  routeCards.hidden = false
}

function drawDirectionOverlay(from, to) {
  directionRoutes = choicesFor(from, to).map((route) => ({
    ...route,
    drawn: overviewLine(route.coordinates, from, to),
  }))
  drawRoutes(directionRoutes)
  renderRouteCards(directionRoutes)
}

function fitDirections(from, to) {
  if (from && to) drawDirectionOverlay(from, to)
  const coordinates = directionRoutes.flatMap((route) => route.drawn || route.coordinates)
  if (coordinates.length > 1) fitLine(coordinates)
}

function updateNav() {
  if (!navigating || !currentRoute) return
  const from = pointFrom(originInput.value, originPlace)
  const pose = estimator.getPose()
  const here = pose || from
  if (!here) return
  const rest = sliceRoute(currentRoute.coordinates, here.lat, here.lon)
  const step = maneuver(rest.coordinates)
  const ratio = currentRoute.meters > 0 ? rest.meters / currentRoute.meters : 0
  const seconds = Number.isFinite(currentRoute.seconds) ? currentRoute.seconds * ratio : undefined
  navArrow.dataset.turn = step.turn
  navDistance.textContent = formatManeuverDistance(step.meters)
  navStep.textContent = maneuverSentence(step, streetAt(step.lat, step.lon))
  navTime.textContent = formatDuration(rest.meters, travelMode, seconds)
  navMeta.textContent = `${formatDistanceKm(rest.meters)} · ${formatArrival(rest.meters, travelMode, seconds)}`
}

function markUncentered() {
  if (!navigating || correcting) return
  followUser = false
  recenterBtn.hidden = false
}

function hidePoseGraphics() {
  if (marker) {
    marker.getElement().hidden = true
    marker.setDraggable(false)
  }
  if (!ringSource) return
  pointSource.setData(emptyCollection())
  ringSource.setData(emptyCollection())
  wedgeSource.setData(emptyCollection())
}

function showPoseGraphics() {
  if (marker) {
    marker.getElement().hidden = false
    marker.setDraggable(!addingPin)
  }
  const pose = estimator.getPose()
  if (!pose) return
  drawPose(pose)
  ensureUserMarker(pose.lat, pose.lon, { force: true })
}

function startCorrect() {
  if (!navigating || correcting || !mapReady) return
  const pose = estimator.getPose()
  if (!pose) return
  correcting = true
  followUser = false
  recenterBtn.hidden = true
  estimator.setPaused(true)
  navBanner.hidden = true
  navCard.hidden = true
  correctBar.hidden = false
  centerDot.hidden = false
  hidePoseGraphics()
  userMapGesture = false
  layoutMap()
  map.jumpTo({
    center: [pose.lon, pose.lat],
    zoom: Math.max(map.getZoom(), 16),
    bearing: 0,
  })
}

function finishCorrect(save, { resume = true } = {}) {
  if (!correcting) return
  const here = save && mapReady ? pointUnder(centerDot, false) : null
  correcting = false
  centerDot.hidden = true
  correctBar.hidden = true
  if (marker) {
    marker.getElement().hidden = false
    marker.setDraggable(!addingPin)
  }
  if (save && here) {
    pin = { lat: here.lat, lon: here.lon }
    estimator.resetTo(here.lat, here.lon, { snap: false })
  } else {
    showPoseGraphics()
  }
  estimator.setPaused(false)
  if (!resume || !navigating) return
  navBanner.hidden = false
  navCard.hidden = false
  updateNav()
  lockNavView()
  layoutMap()
}

function lockNavView() {
  const pose = estimator.getPose()
  const from = pointFrom(originInput.value, originPlace)
  const here = pose || from
  if (!here || !mapReady) return
  followUser = true
  recenterBtn.hidden = true
  map.jumpTo({
    center: [here.lon, here.lat],
    zoom: NAV_ZOOM,
    bearing: pose && Number.isFinite(pose.headingDeg) ? pose.headingDeg : 0,
  })
}

function showWholeRoute() {
  if (!currentRoute || !mapReady) return
  followUser = false
  recenterBtn.hidden = false
  map.stop()
  fitLine(currentRoute.coordinates)
}

function beginNavigation(route) {
  if (fixing) stopFix()
  const from = pointFrom(originInput.value, originPlace)
  const to = pointFrom(destInput.value, destPlace)
  if (!from || !to || !mapReady) return
  if (!route) {
    showTrip()
    route = currentRoute
  }
  if (!route) return
  const styleMode = { walk: "walk", "walk-alt": "walk", bicycle: "bicycle", "bicycle-alt": "bicycle", car: "car", toll: "car", local: "car" }
  if (route.style && styleMode[route.style]) {
    travelMode = styleMode[route.style]
    for (const button of document.querySelectorAll("[data-mode]")) {
      button.setAttribute("aria-pressed", button.dataset.mode === travelMode ? "true" : "false")
    }
  }
  currentRoute = route
  estimator.setMode(travelMode)
  estimator.snap()
  showingDirections = false
  routeCards.hidden = true
  routeCards.replaceChildren()
  const paintStyle = route.style || (travelMode === "walk" ? "walk" : travelMode === "bicycle" ? "bicycle" : "car")
  drawRoute(route.coordinates, paintStyle)
  resultsEl.hidden = true
  routeList.hidden = true
  tripEl.hidden = true
  placeCard.hidden = true
  searchForm.hidden = true
  topEl.hidden = true
  tools.hidden = true
  syncPositionPrompt()
  sheet = null
  pinSheet.hidden = true
  placesSheet.hidden = true
  fixBtn.setAttribute("aria-pressed", "false")
  navigating = true
  document.body.classList.add("navigating")
  syncTypingFields()
  navBanner.hidden = false
  navCard.hidden = false
  updateNav()
  lockNavView()
  layoutMap()
  map.once("idle", () => {
    if (navigating && currentRoute) drawRoute(currentRoute.coordinates, currentRoute.style || paintStyle)
  })
}

function leaveNavigation() {
  if (correcting) finishCorrect(false, { resume: false })
  navigating = false
  followUser = false
  document.body.classList.remove("navigating")
  navBanner.hidden = true
  navCard.hidden = true
  recenterBtn.hidden = true
  searchForm.hidden = false
  syncTypingFields()
  topEl.hidden = tab !== "explorar"
  tools.hidden = tab !== "explorar"
  syncPositionPrompt()
  if (mapReady) map.easeTo({ bearing: 0, duration: 0 })
  if (destPlace && tab === "explorar") {
    tripEl.hidden = false
    map.flyTo({ center: [destPlace.lon, destPlace.lat], zoom: Math.max(map.getZoom(), 16), bearing: 0, duration: 0 })
  }
  layoutMap()
}

function setTravelMode(mode) {
  if (!TRAVEL_KMH[mode]) return
  travelMode = mode
  estimator.setMode(mode)
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", button.dataset.mode === mode ? "true" : "false")
  }
  routeList.hidden = true
  if (navigating) updateNav()
  else {
    showTrip()
    if (showingDirections) {
      const from = pointFrom(originInput.value, originPlace)
      const to = pointFrom(destInput.value, destPlace)
      layoutMap()
      fitDirections(from, to)
    }
  }
}

function chooseDestination(item) {
  if (navigating || correcting) return
  if (!item || !Number.isFinite(item.lat)) return
  destPlace = item
  destInput.value = item.name
  const pose = estimator.getPose()
  if (pose) {
    originInput.value = HERE
    originPlace = null
  }
  selected = item
  placeCard.hidden = true
  resultsEl.hidden = true
  routeList.hidden = true
  sheet = null
  pinSheet.hidden = true
  fixBtn.setAttribute("aria-pressed", "false")
  syncTypingFields()
  showDestPin(item)
  if (mapReady) map.flyTo({ center: [item.lon, item.lat], zoom: Math.max(map.getZoom(), 16), duration: 0 })
  tripEl.hidden = tab !== "explorar" || navigating
  showTrip()
  layoutMap()
}

function choose(item) {
  resultsEl.hidden = true
  queryInput.value = item.name
  clearBtn.hidden = false
  if (document.activeElement === queryInput) queryInput.blur()
  if (fixing) {
    if (mapReady && Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
      map.jumpTo({ center: [item.lon, item.lat], zoom: Math.max(map.getZoom(), 17) })
    }
    return
  }
  if (addingPin) {
    if (Number.isFinite(item.lat)) placeDroppedPin(item.lat, item.lon, item.service ? item : { lat: item.lat, lon: item.lon })
    return
  }
  chooseDestination(item)
}

function pointFrom(text, place) {
  if (fold(text) === fold(HERE)) {
    const pose = estimator.getPose()
    return pose ? { lat: pose.lat, lon: pose.lon, name: HERE } : null
  }
  if (place && fold(place.name) === fold(text)) return place
  return null
}

function refreshStart() {
  startBtn.disabled = !pointFrom(originInput.value, originPlace) || !pointFrom(destInput.value, destPlace)
}

function openDirections(destination) {
  if (destination) chooseDestination(destination)
}

function fitLine(coordinates) {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of coordinates) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  const card = navigating ? navCard : tripEl
  const bounds = [
    [west, south],
    [east, north],
  ]
  let top = navigating ? 96 : Math.round(topEl.getBoundingClientRect().bottom) + 12
  let bottom = 24
  const mapRect = map.getContainer().getBoundingClientRect()
  if (card && !card.hidden) bottom = Math.max(24, Math.round(mapRect.bottom - card.getBoundingClientRect().top) + 12)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    map.fitBounds(bounds, {
      padding: { top, bottom, left: 28, right: 28 },
      absolutePadding: true,
      duration: 0,
      bearing: 0,
    })
    const limitTop = navigating ? 96 : topEl.getBoundingClientRect().bottom + 20
    const limitBottom = card && !card.hidden ? card.getBoundingClientRect().top - 20 : mapRect.bottom - 20
    let northPx = Infinity
    let southPx = -Infinity
    for (const [lon, lat] of coordinates) {
      const y = map.project([lon, lat]).y
      northPx = Math.min(northPx, y)
      southPx = Math.max(southPx, y)
    }
    const growTop = northPx < limitTop ? Math.ceil(limitTop - northPx) + 6 : 0
    const growBottom = southPx > limitBottom ? Math.ceil(southPx - limitBottom) + 6 : 0
    if (!growTop && !growBottom) break
    top += growTop
    bottom += growBottom
  }
}

function bindUi() {
  formatStep(estimator.getStepLength())
  stepInput.addEventListener("input", () => {
    const meters = Number(stepInput.value)
    estimator.setStepLength(meters)
    formatStep(meters)
    persist()
  })

  anchorBtn.addEventListener("click", () => {
    fixPosition()
  })
  tripClose.addEventListener("click", closeTrip)
  placesClose.addEventListener("click", closePlaces)
  renderCategories()

  sensorToggle.addEventListener("change", () => {
    setSensors(sensorToggle.checked)
  })

  queryInput.addEventListener("blur", () => {
    if (!addingPin || !dropTarget || dropTarget.service || saveCard.hidden) return
    if (!saveLabel.isConnected) saveCard.insertBefore(saveLabel, saveCoords)
  })
  saveLabel.addEventListener("input", () => {
    saveButton.disabled = saveLabel.value.trim().length === 0
  })
  saveLabel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    saveAddedPin()
  })
  saveButton.addEventListener("click", saveAddedPin)
  addPinBtn.addEventListener("click", startAddPin)
  queryInput.addEventListener("pointerdown", () => {
    isolateSearchField()
    releaseSearchSpace()
  }, true)
  queryInput.addEventListener("focus", () => {
    isolateSearchField()
    releaseSearchSpace()
  })
  queryInput.addEventListener("input", () => {
    isolateSearchField()
    releaseSearchSpace()
    clearBtn.hidden = queryInput.value.length === 0
    renderResults(queryInput.value)
  })
  clearBtn.addEventListener("click", () => {
    queryInput.value = ""
    clearBtn.hidden = true
    resultsEl.hidden = true
    queryInput.focus()
  })
  queryInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const button = resultsEl.querySelector("button")
    if (button) button.click()
  })
  syncTypingFields()

  navCorrectBtn.textContent = t("Corrigir posição")
  correctCancelBtn.textContent = t("Cancelar")
  correctOkBtn.textContent = t("Confirmar")
  fixCancelBtn.textContent = t("Cancelar")
  fixOkBtn.textContent = t("Confirmar")
  positionPrompt.textContent = t("Defina a sua posição aqui para começar")
  syncPositionPrompt()
  navCorrectBtn.addEventListener("click", startCorrect)
  correctCancelBtn.addEventListener("click", () => finishCorrect(false))
  correctOkBtn.addEventListener("click", () => finishCorrect(true))
  document.querySelector("#nav-exit").addEventListener("click", leaveNavigation)
  document.querySelector("#nav-overview").addEventListener("click", showWholeRoute)
  recenterBtn.addEventListener("click", lockNavView)
  routesBtn.addEventListener("click", () => {
    showingDirections = true
    routeList.hidden = true
    showTrip()
    layoutMap()
    fitDirections(pointFrom(originInput.value, originPlace), pointFrom(destInput.value, destPlace))
  })
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => setTravelMode(button.dataset.mode))
  }
  goDirBtn.addEventListener("click", () => {
    if (selected) openDirections(selected)
  })
  startBtn.addEventListener("click", () => beginNavigation(null))

  savePinBtn.addEventListener("click", () => {
    if (!selected) return
    const pins = readPins()
    const exists = pins.some(
      (item) => item.name === selected.name && Math.abs(item.lat - selected.lat) < 1e-4 && Math.abs(item.lon - selected.lon) < 1e-4,
    )
    if (!exists) writePins([{ name: selected.name, lat: selected.lat, lon: selected.lon }, ...pins])
  })

  addressInput.addEventListener("input", () => {
    chosenDoor = null
    addressDirty = true
    labelToken += 1
    renderAddressSuggestions(addressInput.value)
    updateButtons()
  })
  fixBtn.addEventListener("click", () => {
    if (fixing) stopFix()
    else startFix()
  })
  fixCancelBtn.addEventListener("click", stopFix)
  fixOkBtn.addEventListener("click", confirmFix)
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => showTab(button.dataset.tab))
  }
  importBtn.addEventListener("click", () => {
    openImport().catch((error) => console.error(error))
  })
  importClose.addEventListener("click", () => {
    importSheet.hidden = true
  })
}

estimator.subscribe((pose) => {
  if (correcting) return
  const now = performance.now()
  if (pose.reason === "heading" && now - lastHeadingDraw < 100) return
  if (pose.reason === "heading") lastHeadingDraw = now
  const drawMove = pose.reason !== "move" || now - lastMoveDraw >= 80
  if (pose.reason === "move" && drawMove) lastMoveDraw = now
  if (drawMove) drawPose(pose)
  if (drawMove && !dragging && pose && (pose.reason === "step" || pose.reason === "move" || pose.reason === "reset" || pose.reason === "hydrate")) {
    ensureUserMarker(pose.lat, pose.lon)
  }
  if (navigating && followUser && pose && mapReady && pose.reason !== "hydrate" && drawMove) {
    map.jumpTo({
      center: [pose.lon, pose.lat],
      zoom: NAV_ZOOM,
      bearing: Number.isFinite(pose.headingDeg) ? pose.headingDeg : map.getBearing(),
    })
  }
  if (navigating && pose && pose.reason !== "heading") updateNav()
  updateButtons()
  if (pose.reason === "step" || pose.reason === "reset" || (pose.reason === "move" && drawMove)) persist()
  if (!tripEl.hidden) refreshStart()
})

function readPackages() {
  try {
    const list = JSON.parse(localStorage.getItem(PACKAGES_KEY) || "[]")
    return Array.isArray(list) ? list.filter((item) => item && typeof item.id === "string") : []
  } catch {
    return []
  }
}

function rememberPackage(pack) {
  const list = readPackages().filter((item) => item.id !== pack.id)
  const stored = { id: pack.id, name: pack.name, flag: pack.flag, files: pack.files || [] }
  if (pack.id === "portugal") list.unshift(stored)
  else list.push(stored)
  localStorage.setItem(PACKAGES_KEY, JSON.stringify(list))
}

function ensurePortugal() {
  if (!readPackages().some((item) => item.id === "portugal")) rememberPackage(PORTUGAL)
  if (!localStorage.getItem(PACKAGE_KEY)) localStorage.setItem(PACKAGE_KEY, "portugal")
  activePackageId = localStorage.getItem(PACKAGE_KEY) || "portugal"
}

function startPortugal() {
  loadGeo().catch((error) => console.error(error))
  loadPlaces().catch((error) => console.error(error))
  loadWater().catch((error) => console.error(error))
  loadAddresses().catch(() => {})
}

function packState(pack) {
  const state = document.createElement("span")
  const busy = downloadingId === pack.id
  state.className = busy ? "pack-state muted" : "pack-state"
  state.textContent = busy ? t("A guardar") : t("A usar")
  return state
}

function installedRow(pack) {
  const row = document.createElement("div")
  row.className = "pack-row"
  const flag = document.createElement("span")
  flag.className = "pack-flag"
  flag.textContent = pack.flag || ""
  const name = document.createElement("span")
  name.className = "pack-name"
  name.textContent = pack.name || pack.id
  row.append(flag, name)
  if (downloadingId === pack.id || activePackageId === pack.id) row.append(packState(pack))
  return row
}

function catalogRow(pack) {
  const row = document.createElement("div")
  row.className = "pack-row"
  const flag = document.createElement("span")
  flag.className = "pack-flag"
  flag.textContent = pack.flag || ""
  const name = document.createElement("span")
  name.className = "pack-name"
  name.textContent = pack.name || pack.id
  row.append(flag, name)
  if (activePackageId === pack.id && downloadingId !== pack.id) {
    row.append(packState(pack))
    return row
  }
  const button = document.createElement("button")
  button.type = "button"
  button.className = "pack-download"
  button.textContent = downloadingId === pack.id ? t("A guardar") : t("Descarregar")
  button.disabled = Boolean(downloadingId)
  button.addEventListener("click", () => {
    usePackage(pack).catch((error) => console.error(error))
  })
  row.append(button)
  return row
}

function renderMaps() {
  mapsLabel.textContent = t("Mapas")
  importLabel.textContent = t("Importar mapas")
  importTitle.textContent = t("Importar mapas")
  sensorsHeading.textContent = t("Sensores")
  stepLabel.textContent = t("Passo base")
  sensorsLabel.textContent = t("Sensores")
  legalLabel.textContent = t("Legal")
  privacyLink.querySelector("span").textContent = t("Política de privacidade")
  termsLink.querySelector("span").textContent = t("Termos de utilização")
  importClose.setAttribute("aria-label", t("Fechar"))
  importSheet.setAttribute("aria-label", t("Importar mapas"))

  installedMaps.replaceChildren()
  const packs = readPackages()
  if (!packs.length) {
    const empty = document.createElement("p")
    empty.className = "pack-empty"
    empty.textContent = t("Sem mapas")
    installedMaps.append(empty)
  }
  for (const pack of packs) installedMaps.append(installedRow(pack))

  catalogList.replaceChildren()
  importNote.hidden = !catalogNote
  importNote.textContent = catalogNote || ""
  if (!catalogNote && !catalog.length && !catalogLoading) {
    const empty = document.createElement("p")
    empty.className = "pack-empty"
    empty.textContent = t("Sem mapas")
    catalogList.append(empty)
  }
  for (const pack of catalog) catalogList.append(catalogRow(pack))
}

async function openImport() {
  importSheet.hidden = false
  catalogNote = ""
  catalogLoading = true
  renderMaps()
  try {
    const packs = await loadCatalog()
    catalog = packs
    catalogNote = ""
    for (const pack of packs) {
      if (pack.id === "portugal" || readPackages().some((item) => item.id === pack.id)) rememberPackage(pack)
    }
  } catch (error) {
    console.error(error)
    if (!catalog.length) catalogNote = t("Não foi possível carregar os mapas")
  } finally {
    catalogLoading = false
    renderMaps()
  }
}

async function applyCountry(files, token) {
  const placesBuffer = files.places ? await files.places.arrayBuffer() : null
  const waterBuffer = files.water ? await files.water.arrayBuffer() : null
  const addressBookNext = files.addresses ? await openAddressBook(files.addresses) : null
  const geo = files.geo ? JSON.parse(await files.geo.text()) : null
  if (token !== countryToken) return
  if (placesBuffer) placeBook = openPlaceBook(placesBuffer)
  if (waterBuffer) waterBook = openWaterBook(waterBuffer)
  if (addressBookNext) addressBook = addressBookNext
  if (geo) {
    places = preparePlaces(geo.p)
    streets = prepareStreets(geo.s)
    geoReady = true
    indexStreets()
    if (queryInput.value) renderResults(queryInput.value)
  }
  categoryBar.hidden = tab !== "explorar" && !addingPin
  refreshPois()
  if (addressInput.value) renderAddressSuggestions(addressInput.value)
  else if (sheet === "pin" && pin && !addressDirty) labelPin()
  if (addingPin && dropTarget && !dropTarget.service) queueDoor(dropTarget.lat, dropTarget.lon)
  if (fixing) refreshFixCard()
}

async function usePackage(pack) {
  if (!pack || downloadingId) return
  const token = ++countryToken
  downloadingId = pack.id
  catalogNote = ""
  renderMaps()
  try {
    if (pack.id === "portugal") await Promise.all([loadPlaces(), loadWater(), loadAddresses(), loadGeo()])
    else {
      const files = {}
      for (const file of pack.files || []) {
        if (token !== countryToken) return
        files[file.key] = await loadPackFile(pack.id, file)
      }
      if (token !== countryToken) return
      await applyCountry(files, token)
    }
    if (token !== countryToken) return
    activePackageId = pack.id
    localStorage.setItem(PACKAGE_KEY, pack.id)
    rememberPackage(pack)
  } catch (error) {
    console.error(error)
    if (token !== countryToken) return
    catalogNote = t("Não foi possível carregar os mapas")
    if (pack.id !== "portugal") {
      downloadingId = ""
      renderMaps()
      await usePackage(readPackages().find((item) => item.id === "portugal") || PORTUGAL)
      return
    }
  } finally {
    if (downloadingId === pack.id) downloadingId = ""
    renderMaps()
  }
}

function applyEurope() {
  map.setMinZoom(0)
  map.setMaxBounds(null)
  map.fitBounds(EUROPE_BOX, { duration: 0 })
  let zoom = map.getZoom()
  const lon = (EUROPE_BOX[0][0] + EUROPE_BOX[1][0]) / 2
  while (map.getBounds().getWest() < -34 && zoom < 6) {
    zoom = Math.round((zoom + 0.1) * 10) / 10
    map.jumpTo({ center: [lon, map.getCenter().lat], zoom, bearing: 0, pitch: 0 })
  }
  zoom = map.getZoom()
  const wide = map.getBounds()
  if (wide.getSouth() < 28 && wide.getNorth() > 60) {
    map.jumpTo({ center: [lon, 54], zoom, bearing: 0, pitch: 0 })
  }
  const fitted = map.getZoom()
  const center = map.getCenter()
  map.setMinZoom(Math.round(fitted * 10) / 10)
  map.setMaxBounds([[-42, 8], [55, 75]])
  if (map.getZoom() > fitted + 0.2) {
    map.setMaxBounds(null)
    map.jumpTo({ center: [center.lng, center.lat], zoom: fitted, bearing: 0, pitch: 0 })
    map.setMinZoom(Math.round(fitted * 10) / 10)
  }
}

async function bootMap(file) {
  const { Protocol, PMTiles, FileSource } = globalThis.pmtiles
  const source = new FileSource(file)
  source.getKey = () => "portugal.pmtiles"
  const protocol = new Protocol()
  const archive = new PMTiles(source)
  protocol.add(archive)
  addProtocol("pmtiles", protocol.tile)

  map = new Map({
    container: "map",
    style: mapStyle("pmtiles://portugal.pmtiles"),
    center: VIEW.center,
    zoom: VIEW.zoom,
    maxZoom: 18,
    renderWorldCopies: false,
    padding: { top: 72, right: 8, bottom: 72, left: 8 },
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  })
  map.touchZoomRotate.disableRotation()
  map.addControl(new AttributionControl({ compact: true }), "bottom-right")
  map.on("load", () => {
    addOverlay()
    mapReady = true
    restore()
    if (!marker) {
      const pose = estimator.getPose()
      if (pose) setPin(pose.lat, pose.lon)
    }
    if (sheet === "pin" && pin && !addressDirty) labelPin()
    updateButtons()
    mapStatus = ""
    showStatus()
    layoutMap()
    applyEurope()
    refreshPois()
  })
  map.on("dragstart", (event) => {
    if (!event.originalEvent) return
    markUncentered()
    if (addingPin) userMapGesture = true
  })
  map.on("zoomstart", (event) => {
    if (!event.originalEvent) return
    markUncentered()
    if (addingPin) userMapGesture = true
  })
  map.on("move", () => {
    if (fixing && !fixMoveFrame) {
      fixMoveFrame = requestAnimationFrame(() => {
        fixMoveFrame = 0
        if (fixing) refreshFixCard()
      })
    }
    if (!addingPin || !userMapGesture || pinMoveFrame) return
    pinMoveFrame = requestAnimationFrame(() => {
      pinMoveFrame = 0
      if (!addingPin || !userMapGesture) return
      const here = pointUnderPin()
      placeDroppedPin(here.lat, here.lon)
    })
  })
  map.on("moveend", () => {
    refreshPois()
    if (fixing) refreshFixCard()
    if (!addingPin || !userMapGesture) return
    userMapGesture = false
    const here = pointUnderPin()
    placeDroppedPin(here.lat, here.lon)
  })
  map.on("error", (event) => {
    console.error(event.error || event)
  })
}

async function loadGeo() {
  const token = countryToken
  const response = await fetch("/maps/geo.json.gz")
  if (!response.ok || !response.body) return
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"))
  const data = await new Response(stream).json()
  if (token !== countryToken) return
  places = preparePlaces(data.p)
  streets = prepareStreets(data.s)
  geoReady = true
  if (queryInput.value) renderResults(queryInput.value)
  if (!tripEl.hidden || navigating) showTrip()
  indexStreets()
}

async function loadAddresses() {
  const token = countryToken
  addressStatus = "A guardar moradas"
  showStatus()
  try {
    const file = await loadAddressFile((got) => {
      addressStatus = `A guardar moradas ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    const book = await openAddressBook(file)
    if (token !== countryToken) return
    addressBook = book
    addressStatus = ""
    showStatus()
    if (queryInput.value) renderResults(queryInput.value)
    if (addressInput.value) renderAddressSuggestions(addressInput.value)
    else if (sheet === "pin" && pin && !addressDirty) labelPin()
    if (addingPin && dropTarget && !dropTarget.service) queueDoor(dropTarget.lat, dropTarget.lon)
    if (fixing) refreshFixCard()
  } catch (error) {
    console.error(error)
    addressStatus = ""
    showStatus()
  }
}

async function loadBuildings() {
  buildingStatus = "A guardar edifícios"
  showStatus()
  try {
    const file = await loadBuildingFile((got) => {
      buildingStatus = `A guardar edifícios ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    buildingBook = openBuildingBook(await file.arrayBuffer())
    attachBuildings()
    buildingStatus = ""
    showStatus()
    refreshPois()
    if (!tripEl.hidden || navigating || showingDirections) showTrip()
  } catch (error) {
    console.error(error)
    buildingStatus = ""
    showStatus()
  }
}

async function loadWater() {
  const token = countryToken
  waterStatus = "A guardar água"
  showStatus()
  try {
    const file = await loadWaterFile((got) => {
      waterStatus = `A guardar água ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    const buffer = await file.arrayBuffer()
    if (token !== countryToken) return
    waterBook = openWaterBook(buffer)
    waterStatus = ""
    showStatus()
    refreshPois()
    if (fixing) refreshFixCard()
  } catch (error) {
    console.error(error)
    waterStatus = ""
    showStatus()
  }
}

async function loadPlaces() {
  const token = countryToken
  placeStatus = "A guardar lugares"
  showStatus()
  try {
    const file = await loadPlaceFile((got) => {
      placeStatus = `A guardar lugares ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    const buffer = await file.arrayBuffer()
    if (token !== countryToken) return
    placeBook = openPlaceBook(buffer)
    placeStatus = ""
    showStatus()
    categoryBar.hidden = tab !== "explorar" && !addingPin
    refreshPois()
    if (fixing) refreshFixCard()
  } catch (error) {
    console.error(error)
    placeStatus = ""
    showStatus()
  }
}

async function loadRoads() {
  roadStatus = "A guardar estradas"
  showStatus()
  try {
    const file = await loadRoadFile((got) => {
      roadStatus = `A guardar estradas ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    const buffer = await file.arrayBuffer()
    graph = openRoadGraph(buffer)
    attachBuildings()
    estimator.snap()
    roadStatus = ""
    showStatus()
    if (!tripEl.hidden || navigating) showTrip()
  } catch (error) {
    console.error(error)
    roadStatus = ""
    showStatus()
  }
}

async function main() {
  bindUi()
  renderPins()
  ensurePortugal()
  renderMaps()
  setSensors(true, { quiet: true }).catch(() => {})
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/maps/sw.js").catch(() => {})
  mapStatus = "A guardar mapa"
  showStatus()
  const saved = readPackages().find((item) => item.id === activePackageId)
  if (saved && saved.id !== "portugal" && (saved.files || []).some((file) => file.key === "places")) {
    usePackage(saved).catch((error) => console.error(error))
  } else {
    activePackageId = "portugal"
    localStorage.setItem(PACKAGE_KEY, "portugal")
    startPortugal()
  }
  loadRoads().catch((error) => console.error(error))
  loadBuildings().catch((error) => console.error(error))
  try {
    const file = await loadMapFile((got, length) => {
      if (length) mapStatus = `A guardar mapa ${Math.min(100, Math.round((got / length) * 100))}%`
      else mapStatus = `A guardar mapa ${Math.round(got / 1e6)} MB`
      showStatus()
    })
    await bootMap(file)
  } catch (error) {
    console.error(error)
    if (error.code === "opfs") mapStatus = "Este browser não guarda o mapa"
    else if (error.code === "offline" || error.name === "TypeError") mapStatus = "Mapa em falta"
    else mapStatus = "Não foi possível guardar o mapa"
    showStatus()
  }
}

main()
