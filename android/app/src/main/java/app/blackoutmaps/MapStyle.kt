package app.blackoutmaps

object MapStyle {
    fun json(port: Int, maxZoom: Int): String {
        val glyphs = "http://127.0.0.1:$port/glyphs/{fontstack}/{range}.pbf"
        val tiles = "http://127.0.0.1:$port/tiles/{z}/{x}/{y}.mvt"
        val countries = "http://127.0.0.1:$port/countries.geojson"
        return """
        {
          "version": 8,
          "name": "Portugal",
          "glyphs": "$glyphs",
          "sources": {
            "world": {
              "type": "vector",
              "tiles": ["http://127.0.0.1:$port/world/{z}/{x}/{y}.mvt"],
              "minzoom": 0,
              "maxzoom": 7,
              "attribution": "Natural Earth"
            },
            "countries": {
              "type": "geojson",
              "data": "$countries"
            },
            "protomaps": {
              "type": "vector",
              "tiles": ["$tiles"],
              "minzoom": 0,
              "maxzoom": $maxZoom,
              "attribution": "© OpenStreetMap © Protomaps"
            }
          },
          "layers": [
            {"id": "background", "type": "background", "paint": {"background-color": "#c5d5e0"}},
            {"id": "world-land", "type": "fill", "source": "world", "source-layer": "land", "paint": {"fill-color": "#f4f0e6"}},
            {"id": "country-fill", "type": "fill", "source": "countries", "paint": {"fill-color": ["case", ["==", ["get", "on"], 1], ["interpolate", ["linear"], ["get", "lat"], 34, "#b6f7d4", 46, "#3dce7a", 58, "#14955a", 70, "#0b6b40"], "#e23d3d"], "fill-opacity": 0.92}},
            {"id": "world-lakes", "type": "fill", "source": "world", "source-layer": "lakes", "paint": {"fill-color": "#c5d5e0"}},
            {"id": "world-rivers", "type": "line", "source": "world", "source-layer": "rivers", "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#1f6484", "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 3, 1.1, 6, 1.8, 10, 2.8]}},
            {"id": "world-road-case", "type": "line", "source": "world", "source-layer": "roads", "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#5c5348", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.2, 6, 2.2, 10, 3.6]}},
            {"id": "world-road", "type": "line", "source": "world", "source-layer": "roads", "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": ["match", ["get", "kind"], "major", "#f0b45a", "#fffaf3"], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 6, 1.3, 10, 2.4]}},
            {"id": "world-border", "type": "line", "source": "world", "source-layer": "countries", "filter": ["==", "kind", "country"], "paint": {"line-color": "#6d6458", "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 4, 1.1, 8, 1.8]}},
            {"id": "world-disputed", "type": "line", "source": "world", "source-layer": "countries", "filter": ["!=", "kind", "country"], "paint": {"line-color": "#b3a898", "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 4, 1, 7, 1.4], "line-dasharray": [2, 1.4]}},
            {"id": "world-places", "type": "symbol", "source": "world", "source-layer": "places", "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["get", "name"], "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 5, 13, 8, 16], "text-max-width": 8}, "paint": {"text-color": "#1c1916", "text-halo-color": "#ffffff", "text-halo-width": 1.5}},
            {"id": "world-country", "type": "symbol", "source": "world", "source-layer": "country_labels", "maxzoom": 6, "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["get", "name"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 11, 4, 15], "text-max-width": 8}, "paint": {"text-color": "#6a645b", "text-halo-color": "#f4f0e6", "text-halo-width": 1.2}},
            {"id": "earth", "type": "fill", "source": "protomaps", "source-layer": "earth", "minzoom": 6, "paint": {"fill-color": "#f4f0e6"}},
            {"id": "water", "type": "fill", "source": "protomaps", "source-layer": "water", "minzoom": 6, "filter": ["==", "${'$'}type", "Polygon"], "paint": {"fill-color": "#c5d5e0"}},
            {"id": "boundary", "type": "line", "source": "protomaps", "source-layer": "boundaries", "minzoom": 6, "filter": ["==", "kind", "country"], "paint": {"line-color": "#c4b8a4", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4], "line-dasharray": [2, 1.2]}},
            {"id": "minor-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 12, "filter": ["==", "kind", "minor_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 14, 3.2, 17, 14]}},
            {"id": "minor", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 12, "filter": ["==", "kind", "minor_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 14, 1.8, 17, 10]}},
            {"id": "major-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 7, "filter": ["==", "kind", "major_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 12, 3, 17, 16]}},
            {"id": "major", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 7, "filter": ["==", "kind", "major_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#f7f3ea", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.3, 12, 1.6, 17, 11]}},
            {"id": "highway-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 6, "filter": ["==", "kind", "highway"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 4, 17, 18]}},
            {"id": "highway", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 6, "filter": ["==", "kind", "highway"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#e7a04a", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 12, 2.2, 17, 12]}},
            {"id": "rail", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 8, "filter": ["==", "kind", "rail"], "paint": {"line-color": "#b7aa9c", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 15, 1.4], "line-dasharray": [2, 2]}},
            {"id": "path", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 14, "filter": ["==", "kind", "path"], "paint": {"line-color": "#b7a48a", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 17, 2.4], "line-dasharray": [1.4, 1.2]}},
            {"id": "ferry", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 6, "filter": ["==", "kind", "ferry"], "paint": {"line-color": "#6f97ad", "line-width": 1.2, "line-dasharray": [2, 2]}},
            {"id": "road-label", "type": "symbol", "source": "protomaps", "source-layer": "roads", "minzoom": 13, "filter": ["in", "kind", "highway", "major_road", "minor_road"], "layout": {"symbol-placement": "line", "text-font": ["Noto Sans Regular"], "text-size": 11, "text-max-angle": 28, "text-field": ["case", ["all", ["has", "ref"], ["has", "name"]], ["concat", ["get", "ref"], "  ", ["coalesce", ["get", "name:pt"], ["get", "name"]]], ["coalesce", ["get", "name:pt"], ["get", "name"], ["get", "ref"], ""]]}, "paint": {"text-color": "#4e483f", "text-halo-color": "#f6f3ec", "text-halo-width": 1.3}},
            {"id": "place-hamlet", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 12, "filter": ["in", "kind_detail", "hamlet", "locality", "farm", "isolated_dwelling"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 11, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#5c564c", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-village", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 10, "filter": ["==", "kind_detail", "village"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 12, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#3d3832", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-neighbourhood", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 13, "filter": ["==", "kind", "neighbourhood"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 11, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#6a645b", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-town", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 7, "filter": ["==", "kind_detail", "town"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 14}, "paint": {"text-color": "#241f1a", "text-halo-color": "#f6f3ec", "text-halo-width": 1.4}},
            {"id": "place-city", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 6, "filter": ["==", "kind_detail", "city"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 18]}, "paint": {"text-color": "#1c1916", "text-halo-color": "#f6f3ec", "text-halo-width": 1.6}}
          ]
        }
        """.trimIndent()
    }
}
