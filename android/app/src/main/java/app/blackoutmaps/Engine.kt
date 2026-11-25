package app.blackoutmaps

import android.content.res.AssetManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import com.caoccao.javet.interop.V8Host
import com.caoccao.javet.interop.V8Runtime
import com.caoccao.javet.interop.options.V8RuntimeOptions
import com.caoccao.javet.values.reference.V8ValueArrayBuffer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.channels.FileChannel
import java.nio.file.StandardOpenOption
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicReference

class Engine(private val assets: AssetManager) {
    private val thread = HandlerThread("blackout-engine").also { it.start() }
    private val handler = Handler(thread.looper)
    private var runtime: V8Runtime? = null
    private val buffers = HashMap<String, V8ValueArrayBuffer>()
    @Volatile private var closed = false

    fun <T> onEngine(block: () -> T): T {
        if (closed) error("closed")
        if (Looper.myLooper() == thread.looper) return block()
        val latch = CountDownLatch(1)
        val value = AtomicReference<T>(null)
        val failure = AtomicReference<Throwable>(null)
        val posted = handler.post {
            try {
                if (closed) failure.set(IllegalStateException("closed"))
                else value.set(block())
            } catch (thrown: Throwable) {
                failure.set(thrown)
            }
            latch.countDown()
        }
        if (!posted) error("closed")
        latch.await()
        failure.get()?.let { throw it }
        @Suppress("UNCHECKED_CAST")
        return value.get() as T
    }

    fun start() = onEngine {
        if (runtime != null) return@onEngine
        V8RuntimeOptions.V8_FLAGS.setMaxOldSpaceSize(1536)
        val created = V8Host.getV8Instance().createV8Runtime<V8Runtime>()
        created.allowEval(true)
        created.getExecutor(read("polyfill.js")).executeVoid()
        created.getExecutor(engineSource(read("engine.js"))).executeVoid()
        runtime = created
        Log.i(TAG, "engine ready")
    }

    fun openBuffer(file: File, call: String) = onEngine {
        val rt = runtime ?: error("engine")
        FileChannel.open(file.toPath(), StandardOpenOption.READ).use { channel ->
            val size = channel.size()
            if (size <= 0L || size > Int.MAX_VALUE) error("buffer")
            val buffer = rt.createV8ValueArrayBuffer(size.toInt())
            val dest = buffer.byteBuffer
            dest.clear()
            while (dest.hasRemaining()) {
                if (channel.read(dest) < 0) break
            }
            rt.globalObject.set("__buf", buffer)
            eval(rt, "Posicao.$call(globalThis.__buf)")
            rt.globalObject.delete("__buf")
            buffers.put(call, buffer)?.let { runCatching { it.close() } }
            Log.i(TAG, "$call ${file.name}")
        }
    }

    fun openText(file: File, call: String) = onEngine {
        val rt = runtime ?: error("engine")
        rt.globalObject.set("__text", file.readText())
        eval(rt, "Posicao.$call(globalThis.__text)")
        Log.i(TAG, "$call ${file.name}")
    }

    fun search(query: String, lat: Double?, lon: Double?): Pair<Boolean, List<Place>> = onEngine {
        val rt = runtime ?: return@onEngine false to emptyList()
        rt.globalObject.set("__q", query)
        val text = eval(rt, "Posicao.search(globalThis.__q, ${num(lat)}, ${num(lon)})")
        val objectJson = JSONObject(text.ifBlank { "{}" })
        val waiting = objectJson.optBoolean("waiting")
        waiting to places(objectJson.optJSONArray("items"))
    }

    fun inspect(lat: Double, lon: Double, zoom: Double): Look = onEngine {
        val rt = runtime ?: return@onEngine Look("", "", false)
        val text = eval(rt, "Posicao.inspect(${num(lat)}, ${num(lon)}, ${num(zoom)})")
        val objectJson = JSONObject(text.ifBlank { "{}" })
        val named = objectJson.optJSONObject("named")
        val door = objectJson.optJSONObject("door")
        when {
            named != null && named.optString("name").isNotEmpty() -> Look(
                named.optString("name"),
                named.optString("address"),
                true
            )
            door != null -> Look(door.optString("name"), "", false)
            else -> Look("", "", false)
        }
    }

    fun route(fromLat: Double, fromLon: Double, toLat: Double, toLon: Double, mode: String): RouteChoice? = onEngine {
        val rt = runtime ?: return@onEngine null
        val text = eval(rt, "Posicao.route(${num(fromLat)}, ${num(fromLon)}, ${num(toLat)}, ${num(toLon)}, ${JSONObject.quote(mode)})")
        parseRoute(text, mode)
    }

    fun choices(fromLat: Double, fromLon: Double, toLat: Double, toLon: Double, mode: String): List<RouteChoice> = onEngine {
        val rt = runtime ?: return@onEngine emptyList()
        val text = eval(rt, "Posicao.choices(${num(fromLat)}, ${num(fromLon)}, ${num(toLat)}, ${num(toLon)}, ${JSONObject.quote(mode)})")
        val array = JSONArray(text.ifBlank { "[]" })
        buildList {
            for (index in 0 until array.length()) {
                parseRoute(array.optJSONObject(index)?.toString(), mode)?.let { add(it) }
            }
        }
    }

    fun setNavigation(active: Boolean, route: RouteChoice?) = onEngine {
        val rt = runtime ?: return@onEngine
        if (!active || route == null) {
            eval(rt, "Posicao.setNavigation(false, null)")
        } else {
            rt.globalObject.set("__route", routeJson(route))
            eval(rt, "Posicao.setNavigation(true, globalThis.__route)")
        }
    }

    fun constrain(lat: Double, lon: Double, distance: Double, heading: Double?, mode: String): Coord? = try {
        onEngine {
            val rt = runtime ?: return@onEngine null
            val text = eval(
                rt,
                "Posicao.constrain(${num(lat)}, ${num(lon)}, ${num(distance)}, ${num(heading)}, ${JSONObject.quote(mode)})"
            )
            val objectJson = if (text.isBlank() || text == "null") null else JSONObject(text)
            val nextLat = objectJson?.optDouble("lat") ?: Double.NaN
            val nextLon = objectJson?.optDouble("lon") ?: Double.NaN
            if (nextLat.isFinite() && nextLon.isFinite()) Coord(nextLat, nextLon) else null
        }
    } catch (error: Exception) {
        Log.w(TAG, "constrain", error)
        null
    }

    fun itinerary(): List<NavStep> = onEngine {
        val rt = runtime ?: return@onEngine emptyList()
        val text = eval(rt, "Posicao.itinerary()")
        val array = JSONArray(text.ifBlank { "[]" })
        buildList {
            for (index in 0 until array.length()) {
                val row = array.optJSONObject(index) ?: continue
                add(NavStep(index, row.optString("turn", "straight"), row.optDouble("meters", 0.0), row.optString("street")))
            }
        }
    }

    fun navigation(lat: Double, lon: Double): NavInfo? = onEngine {
        val rt = runtime ?: return@onEngine null
        val text = eval(rt, "Posicao.navigation(${num(lat)}, ${num(lon)})")
        if (text.isBlank() || text == "null") return@onEngine null
        val objectJson = JSONObject(text)
        val seconds = if (objectJson.isNull("seconds")) null else objectJson.optDouble("seconds").takeIf { it.isFinite() }
        NavInfo(
            objectJson.optString("turn", "straight"),
            objectJson.optDouble("meters", 0.0),
            objectJson.optString("street"),
            objectJson.optDouble("remaining", 0.0),
            seconds
        )
    }

    fun viewport(west: Double, south: Double, east: Double, north: Double, zoom: Double): String = onEngine {
        val rt = runtime ?: return@onEngine "{}"
        eval(rt, "Posicao.viewport(${num(west)}, ${num(south)}, ${num(east)}, ${num(north)}, ${num(zoom)})")
    }

    fun category(west: Double, south: Double, east: Double, north: Double, zoom: Double, id: String): List<Place> = onEngine {
        val rt = runtime ?: return@onEngine emptyList()
        val text = eval(
            rt,
            "Posicao.category(${num(west)}, ${num(south)}, ${num(east)}, ${num(north)}, ${num(zoom)}, ${JSONObject.quote(id)})"
        )
        places(JSONArray(text.ifBlank { "[]" }))
    }

    fun close() {
        closed = true
        handler.post {
            buffers.values.forEach { runCatching { it.close() } }
            buffers.clear()
            runCatching { runtime?.close() }
            runtime = null
        }
        thread.quitSafely()
    }

    private fun read(name: String) = assets.open(name).bufferedReader().use { it.readText() }

    // The shared engine.js keeps /\p{M}/gu for iOS. This Android V8 build has no Unicode property escapes.
    // Street search in that file returns one door, the nearest city. Android lists every city for the same name.
    private fun engineSource(source: String): String {
        val folded = source.replace("""/\p{M}/gu""", "/[" + "\\u0300" + "-" + "\\u036f" + "]/g")
        require(folded.contains(oneCitySearch)) { "street search" }
        val streets = folded.replace(oneCitySearch, everyCitySearch)
            .replace(
                "return hits.slice(0, limit).map(publicHit);",
                "return hits.slice(0, Math.max(limit, 40)).map(publicHit);"
            )
        return """
            if (typeof String.prototype.normalize !== "function") {
              String.prototype.normalize = function () { return String(this); };
            }
        """.trimIndent() + "\n" + streets
    }

    private fun eval(rt: V8Runtime, expression: String): String {
        val script = """
            globalThis.__settled = null;
            globalThis.__failed = null;
            try {
              Promise.resolve($expression).then(function(v) {
                globalThis.__settled = (typeof v === 'string') ? v : JSON.stringify(v === undefined ? null : v);
              }, function(e) {
                globalThis.__failed = String(e && (e.stack || e.message) || e);
              });
            } catch (e) {
              globalThis.__failed = String(e && (e.stack || e.message) || e);
            }
        """.trimIndent()
        rt.getExecutor(script).executeVoid()
        repeat(4) {
            val failed = rt.getExecutor("globalThis.__failed").executeString()
            if (!failed.isNullOrEmpty() && failed != "null") error(failed)
            val settled = rt.getExecutor("globalThis.__settled").executeString()
            if (settled != null) return settled
            rt.getExecutor("void 0").executeVoid()
        }
        error("engine")
    }

    private fun places(array: JSONArray?): List<Place> {
        if (array == null) return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                place(array.optJSONObject(index))?.let { add(it) }
            }
        }
    }

    private fun place(row: JSONObject?): Place? {
        if (row == null) return null
        val name = row.optString("name")
        if (name.isEmpty() || !row.has("lat") || !row.has("lon")) return null
        val lat = row.optDouble("lat")
        val lon = row.optDouble("lon")
        if (!lat.isFinite() || !lon.isFinite()) return null
        val address = row.optString("address").ifEmpty { row.optString("typeLabel") }
        val detail = address.ifEmpty { row.optString("city") }
        val service = row.optBoolean("service") || row.has("category") || row.has("typeLabel")
        return Place("$name|$lat|$lon", name, lat, lon, address, detail, service)
    }

    private fun parseRoute(text: String?, fallback: String): RouteChoice? {
        if (text.isNullOrBlank() || text == "null") return null
        val objectJson = JSONObject(text)
        if (!objectJson.has("meters")) return null
        val coordinates = objectJson.optJSONArray("coordinates") ?: return null
        val line = buildList {
            for (index in 0 until coordinates.length()) {
                val pair = coordinates.optJSONArray(index) ?: continue
                if (pair.length() < 2) continue
                add(listOf(pair.optDouble(0), pair.optDouble(1)))
            }
        }
        if (line.size < 2) return null
        val seconds = if (objectJson.isNull("seconds")) null else objectJson.optDouble("seconds").takeIf { it.isFinite() }
        return RouteChoice(
            objectJson.optString("style", fallback),
            objectJson.optString("label"),
            objectJson.optDouble("meters"),
            seconds,
            line
        )
    }

    private fun routeJson(route: RouteChoice): String {
        val coordinates = JSONArray()
        route.coordinates.forEach { pair ->
            coordinates.put(JSONArray().put(pair[0]).put(pair[1]))
        }
        return JSONObject()
            .put("style", route.style)
            .put("label", route.label)
            .put("meters", route.meters)
            .put("seconds", route.seconds ?: JSONObject.NULL)
            .put("coordinates", coordinates)
            .toString()
    }

    private fun num(value: Double?): String {
        if (value == null || !value.isFinite()) return "null"
        return String.format(Locale.US, "%.8f", value)
    }

    companion object {
        private const val TAG = "BlackoutMaps"
        private val oneCitySearch = """
            const rows = matchingStreets(book, street, 40);
            const hits = [];
            for (const row of rows) {
              const door = await streetPoint(book, row, parsed, anchor);
              if (!door) continue;
              hits.push({
                name: `${'$'}{row.name}, ${'$'}{door.city}`,
                city: door.city,
                lat: door.lat,
                lon: door.lon,
                distance: anchor ? metersBetween(anchor.lat, anchor.lon, door.lat, door.lon) : 0
              });
            }
        """.trimIndent().prependIndent("    ")
        private val everyCitySearch = """
            const rows = matchingStreets(book, street, 40);
            const hits = [];
            for (const row of rows) {
              const view = await streetView(book, row);
              const seen = new Map();
              for (let i = 0; i < row.count; i += 1) {
                const hit = hitAt(book, row, view, i);
                if (!hit.city || seen.has(hit.city)) continue;
                if (parsed.city && streetKey(hit.city) !== parsed.city) continue;
                if (parsed.postcode && formatPostcode(hit.postcode) !== parsed.postcode) continue;
                seen.set(hit.city, {
                  name: `${'$'}{row.name}, ${'$'}{hit.city}`,
                  city: hit.city,
                  lat: hit.lat,
                  lon: hit.lon,
                  distance: anchor ? metersBetween(anchor.lat, anchor.lon, hit.lat, hit.lon) : 0
                });
              }
              hits.push(...seen.values());
            }
        """.trimIndent().prependIndent("    ")
    }
}
