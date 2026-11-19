import Foundation

enum MapStyle {
    static func json(archive: String, glyphs: String) -> String {
        """
        {
          "version": 8,
          "name": "Portugal",
          "glyphs": "\(glyphs)",
          "sources": {
            "protomaps": {
              "type": "vector",
              "url": "\(archive)",
              "attribution": "© OpenStreetMap © Protomaps"
            }
          },
          "layers": [
            {"id": "background", "type": "background", "paint": {"background-color": "#c5d5e0"}},
            {"id": "earth", "type": "fill", "source": "protomaps", "source-layer": "earth", "paint": {"fill-color": "#f4f0e6"}},
            {"id": "water", "type": "fill", "source": "protomaps", "source-layer": "water", "filter": ["==", "$type", "Polygon"], "paint": {"fill-color": "#c5d5e0"}},
            {"id": "boundary", "type": "line", "source": "protomaps", "source-layer": "boundaries", "filter": ["==", "kind", "country"], "paint": {"line-color": "#c4b8a4", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4], "line-dasharray": [2, 1.2]}},
            {"id": "minor-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 12, "filter": ["==", "kind", "minor_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 14, 3.2, 17, 14]}},
            {"id": "minor", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 12, "filter": ["==", "kind", "minor_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 14, 1.8, 17, 10]}},
            {"id": "major-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 7, "filter": ["==", "kind", "major_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 12, 3, 17, 16]}},
            {"id": "major", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 7, "filter": ["==", "kind", "major_road"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#f7f3ea", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.3, 12, 1.6, 17, 11]}},
            {"id": "highway-casing", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 5, "filter": ["==", "kind", "highway"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#d5cec2", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 4, 17, 18]}},
            {"id": "highway", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 5, "filter": ["==", "kind", "highway"], "layout": {"line-cap": "round", "line-join": "round"}, "paint": {"line-color": "#e7a04a", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 12, 2.2, 17, 12]}},
            {"id": "rail", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 8, "filter": ["==", "kind", "rail"], "paint": {"line-color": "#b7aa9c", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 15, 1.4], "line-dasharray": [2, 2]}},
            {"id": "path", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 14, "filter": ["==", "kind", "path"], "paint": {"line-color": "#b7a48a", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 17, 2.4], "line-dasharray": [1.4, 1.2]}},
            {"id": "ferry", "type": "line", "source": "protomaps", "source-layer": "roads", "minzoom": 5, "filter": ["==", "kind", "ferry"], "paint": {"line-color": "#6f97ad", "line-width": 1.2, "line-dasharray": [2, 2]}},
            {"id": "road-label", "type": "symbol", "source": "protomaps", "source-layer": "roads", "minzoom": 13, "filter": ["in", "kind", "highway", "major_road", "minor_road"], "layout": {"symbol-placement": "line", "text-font": ["Noto Sans Regular"], "text-size": 11, "text-max-angle": 28, "text-field": ["case", ["all", ["has", "ref"], ["has", "name"]], ["concat", ["get", "ref"], "  ", ["coalesce", ["get", "name:pt"], ["get", "name"]]], ["coalesce", ["get", "name:pt"], ["get", "name"], ["get", "ref"], ""]]}, "paint": {"text-color": "#4e483f", "text-halo-color": "#f6f3ec", "text-halo-width": 1.3}},
            {"id": "place-hamlet", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 12, "filter": ["in", "kind_detail", "hamlet", "locality", "farm", "isolated_dwelling"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 11, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#5c564c", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-village", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 10, "filter": ["==", "kind_detail", "village"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 12, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#3d3832", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-neighbourhood", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 13, "filter": ["==", "kind", "neighbourhood"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 11, "text-anchor": "center", "text-max-width": 8}, "paint": {"text-color": "#6a645b", "text-halo-color": "#f6f3ec", "text-halo-width": 1.2}},
            {"id": "place-town", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 7, "filter": ["==", "kind_detail", "town"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": 14}, "paint": {"text-color": "#241f1a", "text-halo-color": "#f6f3ec", "text-halo-width": 1.4}},
            {"id": "place-city", "type": "symbol", "source": "protomaps", "source-layer": "places", "minzoom": 4, "filter": ["==", "kind_detail", "city"], "layout": {"text-font": ["Noto Sans Regular"], "text-field": ["coalesce", ["get", "name:pt"], ["get", "name"]], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 18]}, "paint": {"text-color": "#1c1916", "text-halo-color": "#f6f3ec", "text-halo-width": 1.6}}
          ]
        }
        """
    }

    static let blank = """
    {"version":8,"sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"#c5d5e0"}}]}
    """
}
