package app.blackoutmaps

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

object Geo {
    fun destination(lat: Double, lon: Double, headingDeg: Double, distanceM: Double): Coord {
        val angular = distanceM / 6_378_137.0
        val heading = Math.toRadians(headingDeg)
        val lat1 = Math.toRadians(lat)
        val lon1 = Math.toRadians(lon)
        val lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(heading))
        val lon2 = lon1 + atan2(sin(heading) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
        var deg = Math.toDegrees(lon2)
        deg = ((deg + 540.0) % 360.0) - 180.0
        return Coord(Math.toDegrees(lat2), deg)
    }

    fun circle(lat: Double, lon: Double, radius: Double, steps: Int = 48): List<List<Double>> {
        val ring = ArrayList<List<Double>>(steps + 1)
        for (i in 0..steps) {
            val point = destination(lat, lon, i.toDouble() / steps * 360.0, radius)
            ring.add(listOf(point.lon, point.lat))
        }
        return ring
    }

    fun wedge(lat: Double, lon: Double, heading: Double, length: Double): List<List<Double>> {
        val tip = destination(lat, lon, heading, length)
        val left = destination(lat, lon, heading - 22.0, length * 0.42)
        val right = destination(lat, lon, heading + 22.0, length * 0.42)
        return listOf(
            listOf(lon, lat),
            listOf(left.lon, left.lat),
            listOf(tip.lon, tip.lat),
            listOf(right.lon, right.lat),
            listOf(lon, lat)
        )
    }
}
