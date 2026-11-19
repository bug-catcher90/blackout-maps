package app.blackoutmaps

data class Coord(val lat: Double, val lon: Double)

data class Place(
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    val address: String,
    val detail: String,
    val service: Boolean
)

data class RouteChoice(
    val style: String,
    val label: String,
    val meters: Double,
    val seconds: Double?,
    val coordinates: List<List<Double>>
)

data class NavStep(
    val id: Int,
    val turn: String,
    val meters: Double,
    val street: String
)

data class NavInfo(
    val turn: String,
    val meters: Double,
    val street: String,
    val remaining: Double,
    val seconds: Double?
)

data class Look(
    val name: String,
    val address: String,
    val service: Boolean
)

data class Pose(
    val lat: Double,
    val lon: Double,
    val heading: Double?,
    val uncertainty: Double,
    val steps: Int,
    val distance: Double,
    val reason: String
)

data class RemotePack(
    val key: String,
    val url: String,
    val file: String,
    val gzip: Boolean,
    val bytes: Long?,
    val label: String
)

data class MapPackage(
    val id: String,
    val name: String,
    val flag: String,
    val autoload: Boolean,
    val files: List<RemotePack>
)

enum class Tab { Explore, Pins, Settings }

enum class Sheet { Routes, Steps, Category, Maps, Import, Languages, Privacy, Terms }

data class CameraJump(
    val serial: Long,
    val lat: Double,
    val lon: Double,
    val zoom: Double,
    val bearing: Double
)

data class CameraFit(
    val serial: Long,
    val points: List<List<Double>>
)
