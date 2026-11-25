package app.blackoutmaps

import org.json.JSONArray
import org.json.JSONObject

object MapJson {
    const val EMPTY = """{"type":"FeatureCollection","features":[]}"""

    data class View(val counts: List<Int>, val places: List<Place>, val markers: String, val buildings: String)

    fun viewport(raw: String, category: String?, listed: List<Place>, text: Text, code: String): View {
        val objectJson = JSONObject(if (raw.isBlank()) "{}" else raw)
        val counts = MutableList(7) { 0 }
        val countArray = objectJson.optJSONArray("counts")
        if (countArray != null) {
            for (index in 0 until minOf(6, countArray.length())) counts[index] = countArray.optInt(index)
        }
        counts[6] = objectJson.optInt("waterTotal")
        val features = JSONArray()
        val places = if (category == null) {
            val pois = points(objectJson.optJSONArray("pois"), null, text, code, features)
            val water = points(objectJson.optJSONArray("water"), "water", text, code, features)
            pois + water
        } else {
            listed.map { place ->
                val shown = place.copy(name = text.known(code, place.name), address = text.known(code, place.address))
                features.put(point(shown.lon, shown.lat, shown.name, category, shown.address))
                shown
            }
        }
        val buildings = objectJson.optJSONArray("buildings") ?: JSONArray()
        return View(counts, places, collection(features), collection(buildings))
    }

    fun routes(lines: List<RouteChoice>, primary: String?): String {
        val features = JSONArray()
        lines.sortedBy { routeRank(it.style) + if (primary != null && it.style == primary) 10 else 0 }.forEach { route ->
            features.put(line(route.coordinates, routeColor(route.style), 5.0))
        }
        return collection(features)
    }

    fun user(pose: Pose): String {
        val features = JSONArray()
        features.put(point(pose.lon, pose.lat, "", "user", "").put("properties", JSONObject()
            .put("role", "user")
            .put("name", "")))
        val heading = pose.heading
        if (heading != null) {
            features.put(polygon(Geo.wedge(pose.lat, pose.lon, heading, 28.0), "wedge"))
        }
        val radius = pose.uncertainty.coerceIn(8.0, 80.0)
        features.put(line(Geo.circle(pose.lat, pose.lon, radius), "#1c1916", 1.5, "ring"))
        return collection(features)
    }

    fun destination(place: Place?): String {
        if (place == null) return EMPTY
        return collection(JSONArray().put(point(place.lon, place.lat, place.name, "dest", place.address)))
    }

    private fun points(array: JSONArray?, forcedKind: String?, text: Text, code: String, features: JSONArray): List<Place> {
        if (array == null) return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val row = array.optJSONObject(index) ?: continue
                val name = row.optString("name").ifEmpty { text.unnamed(code, row) }
                if (name.isEmpty() || !row.has("lat") || !row.has("lon")) continue
                val lat = row.optDouble("lat")
                val lon = row.optDouble("lon")
                val kind = forcedKind ?: row.optInt("category").toString()
                val address = text.known(code, row.optString("address").ifEmpty { row.optString("typeLabel") })
                val shown = text.known(code, name)
                val place = Place("$shown|$lat|$lon", shown, lat, lon, address, address, true)
                features.put(point(lon, lat, shown, kind, address))
                add(place)
            }
        }
    }

    private fun point(lon: Double, lat: Double, name: String, kind: String, address: String): JSONObject {
        return JSONObject()
            .put("type", "Feature")
            .put("geometry", JSONObject().put("type", "Point").put("coordinates", JSONArray().put(lon).put(lat)))
            .put("properties", JSONObject()
                .put("name", name)
                .put("address", address)
                .put("kind", kind)
                .put("icon", if (kind == "water") "water-drop" else "poi-$kind")
                .put("color", color(kind))
                .put("role", "point"))
    }

    private fun line(coordinates: List<List<Double>>, color: String, width: Double, role: String = "route"): JSONObject {
        val line = JSONArray()
        coordinates.forEach { pair -> if (pair.size >= 2) line.put(JSONArray().put(pair[0]).put(pair[1])) }
        return JSONObject()
            .put("type", "Feature")
            .put("geometry", JSONObject().put("type", "LineString").put("coordinates", line))
            .put("properties", JSONObject().put("color", color).put("width", width).put("role", role))
    }

    private fun polygon(ring: List<List<Double>>, role: String): JSONObject {
        val coordinates = JSONArray()
        ring.forEach { pair -> coordinates.put(JSONArray().put(pair[0]).put(pair[1])) }
        return JSONObject()
            .put("type", "Feature")
            .put("geometry", JSONObject().put("type", "Polygon").put("coordinates", JSONArray().put(coordinates)))
            .put("properties", JSONObject().put("role", role).put("color", "#1c1916"))
    }

    private fun collection(features: JSONArray) = JSONObject().put("type", "FeatureCollection").put("features", features).toString()

    private fun routeRank(style: String) = when (style) {
        "walk" -> 0
        "walk-alt" -> 1
        "bicycle" -> 2
        "bicycle-alt" -> 3
        "toll" -> 4
        "local" -> 5
        else -> 6
    }

    private fun routeColor(style: String) = when (style) {
        "walk", "walk-alt" -> "#4A4A4A"
        "bicycle", "bicycle-alt" -> "#E84294"
        "toll" -> "#EBB308"
        "local" -> "#DB2626"
        else -> "#1A73E8"
    }

    private fun color(kind: String) = when (kind) {
        "0" -> "#2f6f6a"
        "1" -> "#1d4e89"
        "2" -> "#b23a2f"
        "3" -> "#c4882b"
        "4" -> "#5c4d7a"
        "5" -> "#c4552a"
        "water" -> "#2f6f8f"
        "dest" -> "#c4552a"
        else -> "#1c1916"
    }
}
