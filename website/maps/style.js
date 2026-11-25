const font = ["Noto Sans Regular"]

function lineWidth(stops) {
  return ["interpolate", ["linear"], ["zoom"], ...stops]
}

function roadLayer(id, filter, color, widthStops, minzoom) {
  return {
    id,
    type: "line",
    source: "protomaps",
    "source-layer": "roads",
    minzoom,
    filter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": lineWidth(widthStops),
    },
  }
}

function casing(id, filter, widthStops, minzoom) {
  return roadLayer(id, filter, "#d5cec2", widthStops, minzoom)
}

const LANDUSE = {
  park: "#d9e8c8",
  garden: "#d9e8c8",
  playground: "#d9e8c8",
  recreation_ground: "#d9e8c8",
  golf_course: "#d9e8c8",
  nature_reserve: "#dbe7cc",
  national_park: "#dbe7cc",
  cemetery: "#dce2d3",
  hospital: "#f1e0dc",
  school: "#efe7d6",
  university: "#efe7d6",
  college: "#efe7d6",
  industrial: "#e8e3db",
  railway: "#e8e3db",
  military: "#e8e3db",
  beach: "#f3ebd2",
  sand: "#f3ebd2",
}

const LANDCOVER = { forest: "#d6e4c6", grassland: "#e2ebd2", scrub: "#dde6cc", farmland: "#ecedd8" }

const LANDUSE_COLOR = ["match", ["get", "kind"], ...Object.entries(LANDUSE).flat(), "#e8e3db"]
const LANDCOVER_COLOR = ["match", ["get", "kind"], ...Object.entries(LANDCOVER).flat(), "#ecedd8"]

const placeLabel = {
  "text-font": font,
  "text-field": ["get", "name"],
  "text-anchor": "center",
  "text-max-width": 8,
}

export function mapStyle(archiveUrl) {
  return {
    version: 8,
    name: "Blackout Maps",
    glyphs: "/maps/glyphs/{fontstack}/{range}.pbf",
    sources: {
      world: {
        type: "vector",
        url: "pmtiles:///maps/world.pmtiles",
        maxzoom: 7,
        attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
      },
      countries: { type: "geojson", data: "/maps/countries.geojson" },
      protomaps: {
        type: "vector",
        url: archiveUrl,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#c5d5e0" } },
      {
        id: "world-land",
        type: "fill",
        source: "world",
        "source-layer": "land",
        paint: { "fill-color": "#f4f0e6" },
      },
      {
        id: "country-fill",
        type: "fill",
        source: "countries",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "on"], 1],
            ["interpolate", ["linear"], ["get", "lat"], 34, "#b6f7d4", 46, "#3dce7a", 58, "#14955a", 70, "#0b6b40"],
            "#e23d3d",
          ],
          "fill-opacity": 0.92,
        },
      },
      {
        id: "world-lakes",
        type: "fill",
        source: "world",
        "source-layer": "lakes",
        paint: { "fill-color": "#c5d5e0" },
      },
      {
        id: "world-rivers",
        type: "line",
        source: "world",
        "source-layer": "rivers",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1f6484", "line-width": lineWidth([0, 0.5, 3, 1.1, 6, 1.8, 10, 2.8]) },
      },
      {
        id: "world-road-case",
        type: "line",
        source: "world",
        "source-layer": "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#5c5348", "line-width": lineWidth([3, 1.2, 6, 2.2, 10, 3.6]) },
      },
      {
        id: "world-road",
        type: "line",
        source: "world",
        "source-layer": "roads",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "kind"], "major", "#f0b45a", "#fffaf3"],
          "line-width": lineWidth([3, 0.6, 6, 1.3, 10, 2.4]),
        },
      },
      {
        id: "world-places",
        type: "symbol",
        source: "world",
        "source-layer": "places",
        layout: {
          "text-font": font,
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 5, 13, 8, 16],
          "text-max-width": 8,
        },
        paint: { "text-color": "#1c1916", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      {
        id: "world-country",
        type: "symbol",
        source: "world",
        "source-layer": "country_labels",
        maxzoom: 6,
        layout: {
          "text-font": font,
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 11, 4, 15],
          "text-max-width": 8,
        },
        paint: { "text-color": "#6a645b", "text-halo-color": "#f4f0e6", "text-halo-width": 1.2 },
      },
      {
        id: "earth",
        type: "fill",
        source: "protomaps",
        "source-layer": "earth",
        minzoom: 6,
        paint: { "fill-color": "#f4f0e6" },
      },
      {
        id: "landcover",
        type: "fill",
        source: "protomaps",
        "source-layer": "landcover",
        minzoom: 6,
        maxzoom: 10,
        filter: ["in", "kind", ...Object.keys(LANDCOVER)],
        paint: { "fill-color": LANDCOVER_COLOR, "fill-opacity": 0.6 },
      },
      {
        id: "landuse",
        type: "fill",
        source: "protomaps",
        "source-layer": "landuse",
        minzoom: 10,
        filter: ["in", "kind", ...Object.keys(LANDUSE)],
        paint: { "fill-color": LANDUSE_COLOR, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 13, 0.85] },
      },
      {
        id: "water",
        type: "fill",
        source: "protomaps",
        "source-layer": "water",
        minzoom: 6,
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#c5d5e0" },
      },
      {
        id: "boundary",
        type: "line",
        source: "protomaps",
        "source-layer": "boundaries",
        minzoom: 6,
        filter: ["==", "kind", "country"],
        paint: { "line-color": "#c4b8a4", "line-width": lineWidth([3, 0.6, 8, 1.4]), "line-dasharray": [2, 1.2] },
      },
      {
        id: "buildings",
        type: "fill",
        source: "protomaps",
        "source-layer": "buildings",
        minzoom: 14,
        paint: { "fill-color": "#e4ddd0", "fill-outline-color": "#d3cabb" },
      },
      casing("minor-casing", ["==", "kind", "minor_road"], [12, 0.4, 14, 3.2, 17, 14], 12),
      roadLayer("minor", ["==", "kind", "minor_road"], "#ffffff", [12, 0.2, 14, 1.8, 17, 10], 12),
      casing("major-casing", ["==", "kind", "major_road"], [7, 0.5, 12, 3, 17, 16], 7),
      roadLayer("major", ["==", "kind", "major_road"], "#f7f3ea", [7, 0.3, 12, 1.6, 17, 11], 7),
      casing("highway-casing", ["==", "kind", "highway"], [6, 0.8, 12, 4, 17, 18], 6),
      roadLayer("highway", ["==", "kind", "highway"], "#e7a04a", [6, 0.4, 12, 2.2, 17, 12], 6),
      {
        id: "rail",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 8,
        filter: ["==", "kind", "rail"],
        paint: {
          "line-color": "#b7aa9c",
          "line-width": lineWidth([8, 0.4, 15, 1.4]),
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "path",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 14,
        filter: ["==", "kind", "path"],
        paint: {
          "line-color": "#b7a48a",
          "line-width": lineWidth([14, 0.6, 17, 2.4]),
          "line-dasharray": [1.4, 1.2],
        },
      },
      {
        id: "ferry",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 6,
        filter: ["==", "kind", "ferry"],
        paint: {
          "line-color": "#6f97ad",
          "line-width": 1.2,
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "world-border",
        type: "line",
        source: "world",
        "source-layer": "countries",
        filter: ["==", "kind", "country"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#6d6458", "line-width": lineWidth([0, 0.6, 4, 1.1, 8, 1.8, 12, 2.6, 16, 3.4]) },
      },
      {
        id: "world-disputed",
        type: "line",
        source: "world",
        "source-layer": "countries",
        filter: ["!=", "kind", "country"],
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": "#b3a898",
          "line-width": lineWidth([0, 0.5, 4, 1, 8, 1.6, 12, 2.2, 16, 2.8]),
          "line-dasharray": [2, 1.4],
        },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 13,
        filter: ["in", "kind", "highway", "major_road", "minor_road"],
        layout: {
          "symbol-placement": "line",
          "text-font": font,
          "text-size": 11,
          "text-max-angle": 28,
          "text-field": [
            "case",
            ["all", ["has", "ref"], ["has", "name"]],
            ["concat", ["get", "ref"], "  ", ["get", "name"]],
            ["coalesce", ["get", "name"], ["get", "ref"], ""],
          ],
        },
        paint: {
          "text-color": "#4e483f",
          "text-halo-color": "#f6f3ec",
          "text-halo-width": 1.3,
        },
      },
      {
        id: "place-hamlet",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 12,
        filter: ["in", "kind_detail", "hamlet", "locality", "farm", "isolated_dwelling"],
        layout: { ...placeLabel, "text-size": 11 },
        paint: { "text-color": "#5c564c", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2 },
      },
      {
        id: "place-village",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 10,
        filter: ["==", "kind_detail", "village"],
        layout: { ...placeLabel, "text-size": 12 },
        paint: { "text-color": "#3d3832", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2 },
      },
      {
        id: "place-neighbourhood",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 13,
        filter: ["==", "kind", "neighbourhood"],
        layout: { ...placeLabel, "text-size": 11 },
        paint: { "text-color": "#6a645b", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 7,
        filter: ["==", "kind_detail", "town"],
        layout: { ...placeLabel, "text-size": 14 },
        paint: { "text-color": "#241f1a", "text-halo-color": "#f6f3ec", "text-halo-width": 1.4 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        minzoom: 6,
        filter: ["==", "kind_detail", "city"],
        layout: { ...placeLabel, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 18] },
        paint: { "text-color": "#1c1916", "text-halo-color": "#f6f3ec", "text-halo-width": 1.6 },
      },
    ],
  }
}
