package app.blackoutmaps

import android.content.res.AssetManager
import org.json.JSONObject
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.hypot

class Text(assets: AssetManager) {
    private val tables = JSONObject(assets.open("l10n.json").bufferedReader().use { it.readText() })

    fun t(code: String, key: String, vararg args: String): String {
        val template = table(code).optString(key, "").ifEmpty { table("en").optString(key, key) }
        if (args.isEmpty()) return template
        val pattern = template.replace("%@", "%s")
        return try {
            String.format(locale(code), pattern, *args)
        } catch (_: Exception) {
            template
        }
    }

    fun known(code: String, value: String): String {
        val key = when (value) {
            "Mais rápido" -> "fastest"
            "Sem portagens" -> "no-tolls"
            "Sem autoestradas" -> "no-motorways"
            "Mais curto" -> "shortest"
            "Alternativa" -> "alternative"
            "Bebedouro" -> "drinking-water"
            "Fonte" -> "spring"
            "Vau" -> "ford"
            "Açude" -> "weir"
            "Acesso" -> "access"
            else -> return value
        }
        return t(code, key)
    }

    fun label(code: String, raw: String): String {
        val key = when (raw) {
            "lugares" -> "places"
            "água" -> "water"
            "moradas" -> "addresses"
            "estradas" -> "roads"
            "edifícios" -> "buildings"
            "mapa" -> "map"
            "geo" -> "geo"
            else -> raw
        }
        val translated = t(code, key)
        val known = table(code).has(key) || table("en").has(key)
        return if (!known && translated == key) raw else translated
    }

    fun nativeName(code: String): String = when (code) {
        "pt" -> "Português"
        "fr" -> "Français"
        "es" -> "Español"
        "de" -> "Deutsch"
        "ar" -> "العربية"
        "ja" -> "日本語"
        "zh" -> "中文"
        "ru" -> "Русский"
        else -> "English"
    }

    fun step(code: String, value: Double): String = "${meters(code).format(value)} m"

    fun kmOrM(code: String, value: Double): String {
        return if (value >= 1000) "${whole(code).format(value / 1000)} km" else "${whole(code).format(value)} m"
    }

    fun distanceKm(code: String, value: Double): String {
        val km = if (value > 0) maxOf(value / 1000, 0.1) else 0.0
        return if (km < 10) "${one(code).format(km)} km" else "${whole(code).format(km)} km"
    }

    fun minutes(code: String, minutes: Double): String {
        val value = maxOf(0.0, minutes)
        if (value < 60) return "${whole(code).format(value)} min"
        val hours = (value / 60).toInt()
        val rest = value.toInt() % 60
        if (rest == 0) return "$hours h"
        return "$hours h $rest min"
    }

    fun duration(code: String, meters: Double, mode: String, seconds: Double?): String {
        val minutes = seconds?.div(60.0) ?: tripMinutes(meters, mode)
        return minutes(code, minutes)
    }

    fun arrival(code: String, meters: Double, mode: String, seconds: Double?): String {
        val minutes = seconds?.div(60.0) ?: tripMinutes(meters, mode)
        val date = Date(System.currentTimeMillis() + (minutes * 60_000).toLong())
        return SimpleDateFormat("HH:mm", locale(code)).format(date)
    }

    fun maneuverDistance(code: String, meters: Double): String {
        val value = maxOf(0.0, meters)
        if (value < 25) return t(code, "now")
        if (value < 1000) return "${whole(code).format(rounded(value))} m"
        if (value < 10_000) return "${one(code).format(value / 1000)} km"
        return "${whole(code).format(value / 1000)} km"
    }

    fun sentence(code: String, turn: String, meters: Double, street: String): String {
        val spoken = spoken(code, meters)
        val maneuverKey = if (turn in TURNS) turn else "straight"
        val maneuver = t(code, maneuverKey)
        if (street.isNotEmpty() && turn != "straight") {
            return if (spoken.first) t(code, "now-turn", street) else t(code, "in-turn", spoken.second, street)
        }
        if (street.isNotEmpty()) {
            return if (spoken.first) t(code, "now-straight-street", street) else t(code, "in-straight-street", spoken.second, street)
        }
        if (spoken.first) return maneuver
        return t(code, "in-maneuver", spoken.second, maneuver)
    }

    fun coord(code: String, lat: Double, lon: Double): String {
        val symbols = DecimalFormatSymbols.getInstance(locale(code))
        val format = DecimalFormat("0.00000", symbols)
        return "${format.format(lat)}, ${format.format(lon)}"
    }

    private fun spoken(code: String, meters: Double): Pair<Boolean, String> {
        val value = maxOf(0.0, meters)
        if (value < 25) return true to t(code, "now")
        if (value < 1000) return false to "${whole(code).format(rounded(value))} ${t(code, "meters-word")}"
        return false to maneuverDistance(code, value)
    }

    private fun rounded(value: Double): Double {
        val step = if (value < 200) 10.0 else 50.0
        return kotlin.math.round(value / step) * step
    }

    private fun tripMinutes(meters: Double, mode: String): Double {
        val kmh = if (mode == "walk") 5.0 else if (mode == "bicycle") 15.0 else 60.0
        if (meters <= 0) return 0.0
        return maxOf(1, kotlin.math.round(meters / 1000 / kmh * 60).toInt()).toDouble()
    }

    private fun whole(code: String) = DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(locale(code)))
    private fun one(code: String) = DecimalFormat("#,##0.0", DecimalFormatSymbols.getInstance(locale(code)))
    private fun meters(code: String) = DecimalFormat("0.00", DecimalFormatSymbols.getInstance(locale(code)))

    private fun table(code: String): JSONObject = tables.optJSONObject(code) ?: tables.getJSONObject("en")

    companion object {
        val order = listOf("en", "pt", "fr", "es", "de", "ar", "ja", "zh", "ru")
        private val TURNS = setOf("slight-left", "left", "sharp-left", "slight-right", "right", "sharp-right", "uturn")

        fun locale(code: String): Locale = when (code) {
            "pt" -> Locale("pt", "PT")
            "fr" -> Locale.FRANCE
            "es" -> Locale("es", "ES")
            "de" -> Locale.GERMANY
            "ar" -> Locale("ar")
            "ja" -> Locale.JAPAN
            "zh" -> Locale.SIMPLIFIED_CHINESE
            "ru" -> Locale("ru", "RU")
            else -> Locale.US
        }

        fun directionRtl(code: String) = code == "ar"

        val stepError = hypot(0.12, (10 * Math.PI) / 180)
    }
}
