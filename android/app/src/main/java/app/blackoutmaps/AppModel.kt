package app.blackoutmaps

import android.app.Application
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class AppModel(application: Application) : AndroidViewModel(application) {
    private val app = application
    private val prefs = app.getSharedPreferences("blackout-maps", Context.MODE_PRIVATE)
    private val strings = Text(app.assets)
    private val engine = Engine(app.assets)
    private val estimator = Estimator(
        app,
        onPose = { next -> onMain { poseMoved(next) } },
        constraint = { lat, lon, distance, heading, mode -> engine.constrain(lat, lon, distance, heading, mode) }
    )
    private val main = Handler(Looper.getMainLooper())
    private var launched = false
    private var engineReady = false
    private var roadsReady = false
    private var inForeground = false
    private var heldTrip = false
    private var serial = 0L
    private var lastPersist = 0L
    private var lastNav = 0L
    private var lastFollow = 0L
    private var searchJob: Job? = null
    private var routeJob: Job? = null
    private var viewJob: Job? = null
    private var lookJob: Job? = null
    private var navJob: Job? = null
    @Volatile private var tileServer: TileServer? = null

    var tab by mutableStateOf(Tab.Explore)
    var language by mutableStateOf("en")
    var query by mutableStateOf("")
    var results by mutableStateOf(emptyList<Place>())
    var showResults by mutableStateOf(false)
    var mode by mutableStateOf("walk")
    var modeTimes by mutableStateOf(mapOf<String, String>())
    var destination by mutableStateOf<Place?>(null)
    var showTrip by mutableStateOf(false)
    var tripDuration by mutableStateOf("")
    var tripMeta by mutableStateOf("")
    var startEnabled by mutableStateOf(false)
    var current by mutableStateOf<RouteChoice?>(null)
    var routes by mutableStateOf(emptyList<RouteChoice>())
    var navigating by mutableStateOf(false)
    var follow by mutableStateOf(false)
    var showRecenter by mutableStateOf(false)
    var navTurn by mutableStateOf("straight")
    var navDistance by mutableStateOf("")
    var navSentence by mutableStateOf("")
    var navTime by mutableStateOf("")
    var navMeta by mutableStateOf("")
    var steps by mutableStateOf(emptyList<NavStep>())
    var fixing by mutableStateOf(false)
    var fixName by mutableStateOf("")
    var fixAddress by mutableStateOf("")
    var fixCoords by mutableStateOf("")
    var adding by mutableStateOf(false)
    var saveService by mutableStateOf(false)
    var saveName by mutableStateOf("")
    var saveAddress by mutableStateOf("")
    var saveCoords by mutableStateOf("")
    var pinName by mutableStateOf("")
    var saveEnabled by mutableStateOf(false)
    var correcting by mutableStateOf(false)
    var pins by mutableStateOf(emptyList<Place>())
    var packages by mutableStateOf(emptyList<MapPackage>())
    var catalog by mutableStateOf(emptyList<MapPackage>())
    var catalogLoading by mutableStateOf(false)
    var catalogNote by mutableStateOf("")
    var activePackageId by mutableStateOf<String?>(null)
    var downloading by mutableStateOf(false)
    var downloadingId by mutableStateOf<String?>(null)
    var sensorsOn by mutableStateOf(true)
    var step by mutableStateOf(0.7)
    var status by mutableStateOf("")
    var showStatus by mutableStateOf(false)
    var categoryId by mutableStateOf<String?>(null)
    var categoryTitle by mutableStateOf("")
    var categoryPlaces by mutableStateOf(emptyList<Place>())
    var counts by mutableStateOf(List(7) { 0 })
    var sheet by mutableStateOf<Sheet?>(null)
    var serverPort by mutableIntStateOf(0)
    var maxZoom by mutableIntStateOf(14)
    var styleStamp by mutableIntStateOf(0)
    var overlay by mutableIntStateOf(0)
    var markersJson by mutableStateOf(MapJson.EMPTY)
    var buildingsJson by mutableStateOf(MapJson.EMPTY)
    var routesJson by mutableStateOf(MapJson.EMPTY)
    var userJson by mutableStateOf(MapJson.EMPTY)
    var destJson by mutableStateOf(MapJson.EMPTY)
    var jump by mutableStateOf<CameraJump?>(null)
    var fit by mutableStateOf<CameraFit?>(null)
    var pose by mutableStateOf<Pose?>(null)
    var openingLat = 39.6
    var openingLon = -8.05
    var openingZoom = 6.2
    var centerLat = 39.6
    var centerLon = -8.05
    var zoom = 6.2
    private var west = -12.0
    private var south = 36.5
    private var east = -4.0
    private var north = 42.5

    val categoryIds = listOf("0", "1", "2", "3", "4", "5", "water")
    private val categoryKeys = listOf("health", "police", "fire", "fuel", "supermarkets", "restaurants", "water")

    fun t(key: String, vararg args: String) = strings.t(language, key, *args)

    fun nativeName(code: String) = strings.nativeName(code)

    fun stepText() = strings.step(language, step)

    fun known(value: String) = strings.known(language, value)

    fun distanceText(meters: Double) = strings.distanceKm(language, meters)

    fun lengthText(meters: Double) = strings.kmOrM(language, meters)

    fun coordText(lat: Double, lon: Double) = strings.coord(language, lat, lon)

    fun routeLabel(route: RouteChoice) = strings.known(language, route.label)

    fun routeMeta(route: RouteChoice): String {
        val duration = strings.duration(language, route.meters, modeFor(route.style), route.seconds)
        return "$duration · ${strings.kmOrM(language, route.meters)}"
    }

    fun stepSentence(row: NavStep): String {
        if (row.turn == "arrive") return "${t("arrive")} ${row.street}".trim()
        return strings.sentence(language, row.turn, row.meters, row.street)
    }

    fun launch() {
        if (launched) return
        launched = true
        load()
        syncSensors()
        viewModelScope.launch(Dispatchers.IO) { boot() }
    }

    fun foreground(on: Boolean) {
        inForeground = on
        syncSensors()
    }

    fun queryChanged(value: String) {
        query = value
        searchJob?.cancel()
        val text = value.trim()
        if (text.isEmpty()) {
            results = emptyList()
            showResults = false
            return
        }
        showResults = true
        val anchor = pose
        searchJob = viewModelScope.launch(Dispatchers.IO) {
            delay(180)
            if (!isActive) return@launch
            val found = try {
                engine.search(text, anchor?.lat, anchor?.lon)
            } catch (error: Exception) {
                Log.w(TAG, "search", error)
                false to emptyList()
            }
            if (!isActive) return@launch
            onMain {
                if (query.trim() != text) return@onMain
                results = found.second
                showResults = true
                if (found.first && found.second.isEmpty()) {
                    status = t("saving-addresses")
                    showStatus = true
                }
            }
        }
    }

    fun clearQuery() {
        searchJob?.cancel()
        query = ""
        results = emptyList()
        showResults = false
    }

    fun choose(place: Place) {
        showResults = false
        query = place.name
        if (fixing) {
            jumpTo(place.lat, place.lon, maxOf(zoom, 17.0))
            scheduleLook()
            return
        }
        if (adding) {
            jumpTo(place.lat, place.lon, maxOf(zoom, 16.0))
            if (place.service) {
                saveService = true
                saveName = strings.known(language, place.name)
                saveAddress = strings.known(language, place.address)
                saveEnabled = true
            }
            scheduleLook()
            return
        }
        chooseDestination(place)
    }

    fun chooseMode(next: String) {
        if (next == mode) return
        mode = next
        estimator.setMode(next)
        routes = emptyList()
        if (sheet == Sheet.Routes) sheet = null
        if (navigating) refreshNav() else if (destination != null) recompute(false)
    }

    fun directions() {
        val from = pose ?: return
        val to = destination ?: return
        sheet = Sheet.Routes
        val selected = mode
        viewModelScope.launch(Dispatchers.IO) {
            val found = try {
                engine.choices(from.lat, from.lon, to.lat, to.lon, selected)
            } catch (error: Exception) {
                Log.w(TAG, "choices", error)
                emptyList()
            }
            onMain {
                routes = found
                routesJson = MapJson.routes(found, null)
                bump()
                val points = found.flatMap { it.coordinates }
                if (points.size > 1) fitTo(points)
            }
        }
    }

    fun startNav(route: RouteChoice? = null) {
        val picked = route ?: current ?: return
        if (pose == null || destination == null) return
        val mapped = modeFor(picked.style)
        mode = mapped
        estimator.setMode(mapped)
        current = picked
        estimator.snap()
        sheet = null
        routes = emptyList()
        showTrip = false
        showResults = false
        categoryId = null
        if (fixing) cancelFix()
        navigating = true
        correcting = false
        follow = true
        showRecenter = false
        routesJson = MapJson.routes(listOf(picked), picked.style)
        bump()
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { engine.setNavigation(true, picked) }
            onMain {
                refreshNav()
                lockNav()
            }
        }
    }

    fun leaveNav() {
        if (correcting) finishCorrect(false)
        navigating = false
        sheet = null
        follow = false
        showRecenter = false
        viewModelScope.launch(Dispatchers.IO) { runCatching { engine.setNavigation(false, null) } }
        val target = destination
        if (target != null && tab == Tab.Explore) {
            showTrip = true
            jumpTo(target.lat, target.lon, maxOf(zoom, 16.0))
            current?.let {
                routesJson = MapJson.routes(listOf(it), it.style)
                bump()
            }
        }
    }

    fun recenter() {
        follow = true
        showRecenter = false
        lockNav()
    }

    fun overview() {
        val line = current ?: return
        follow = false
        showRecenter = true
        fitTo(line.coordinates)
    }

    fun openSteps() {
        val name = destination?.name ?: ""
        viewModelScope.launch(Dispatchers.IO) {
            val rows = try {
                engine.itinerary()
            } catch (error: Exception) {
                Log.w(TAG, "steps", error)
                emptyList()
            }
            onMain {
                steps = rows + NavStep(rows.size, "arrive", 0.0, name)
                sheet = Sheet.Steps
            }
        }
    }

    fun startCorrect() {
        val here = pose ?: return
        if (!navigating) return
        correcting = true
        follow = false
        showRecenter = false
        estimator.setPaused(true)
        userJson = MapJson.EMPTY
        bump()
        jumpTo(here.lat, here.lon, maxOf(zoom, 16.0))
    }

    fun finishCorrect(save: Boolean) {
        if (!correcting) return
        val lat = centerLat
        val lon = centerLon
        correcting = false
        estimator.setPaused(false)
        if (save) estimator.reset(lat, lon, snap = false)
        else pose?.let { publishUser(it) }
        if (navigating) {
            refreshNav()
            lockNav()
        }
    }

    fun startFix() {
        if (navigating || correcting || adding || fixing) return
        heldTrip = showTrip
        fixing = true
        showTrip = false
        showResults = false
        categoryId = null
        sheet = null
        val here = pose
        val lat = here?.lat ?: centerLat
        val lon = here?.lon ?: centerLon
        jumpTo(lat, lon, maxOf(zoom, 16.0))
        scheduleLook()
    }

    fun cancelFix() {
        if (!fixing) return
        fixing = false
        fixName = ""
        fixAddress = ""
        fixCoords = ""
        if (heldTrip && destination != null && tab == Tab.Explore && !navigating) showTrip = true
        heldTrip = false
    }

    fun confirmFix() {
        if (!fixing) return
        val lat = centerLat
        val lon = centerLon
        cancelFix()
        estimator.reset(lat, lon, snap = true)
        jumpTo(lat, lon, maxOf(zoom, 16.0))
        persist(Pose(lat, lon, pose?.heading, 8.0, 0, 0.0, "reset"))
    }

    fun closeTrip() {
        destination = null
        showTrip = false
        if (sheet == Sheet.Routes) sheet = null
        routes = emptyList()
        current = null
        startEnabled = false
        tripDuration = ""
        tripMeta = ""
        destJson = MapJson.EMPTY
        routesJson = MapJson.EMPTY
        bump()
    }

    fun showTab(next: Tab) {
        if (adding) stopAdd()
        if (fixing) cancelFix()
        tab = next
        if (next != Tab.Explore) {
            showTrip = false
            showResults = false
            categoryId = null
            sheet = null
        } else if (destination != null && !navigating) {
            showTrip = true
        }
    }

    fun startAdd() {
        adding = true
        tab = Tab.Explore
        showTrip = false
        categoryId = null
        showResults = false
        sheet = null
        saveService = false
        pinName = ""
        saveEnabled = false
        saveName = ""
        saveAddress = ""
        val lat = pose?.lat ?: centerLat
        val lon = pose?.lon ?: centerLon
        jumpTo(lat, lon, maxOf(zoom, 16.0))
        scheduleLook()
    }

    fun stopAdd() {
        adding = false
        pinName = ""
        saveEnabled = false
        saveService = false
    }

    fun pinNameChanged(value: String) {
        pinName = value
        saveEnabled = !saveService && value.trim().isNotEmpty()
    }

    fun savePin() {
        val name = if (saveService) saveName else pinName.trim()
        if (name.isEmpty()) return
        val entry = Place("$name|$centerLat|$centerLon", name, centerLat, centerLon, saveAddress, saveAddress, saveService)
        if (pins.none { it.name == entry.name && kotlin.math.abs(it.lat - entry.lat) < 1e-4 && kotlin.math.abs(it.lon - entry.lon) < 1e-4 }) {
            pins = listOf(entry) + pins
            writePins()
        }
        stopAdd()
        tab = Tab.Pins
    }

    fun removePin(place: Place) {
        pins = pins.filterNot { it.id == place.id }
        writePins()
    }

    fun openPin(place: Place) {
        tab = Tab.Explore
        chooseDestination(place)
    }

    fun openCategory(id: String) {
        if (categoryId == id) {
            categoryId = null
            sheet = null
            refreshViewport()
            return
        }
        categoryId = id
        categoryTitle = t(categoryKeys.getOrElse(categoryIds.indexOf(id)) { id })
        categoryPlaces = emptyList()
        sheet = Sheet.Category
        refreshViewport()
    }

    fun chooseLanguage(code: String) {
        if (code !in Text.order) return
        language = code
        prefs.edit().putString("blackout-language", code).apply()
        if (categoryId != null) categoryTitle = t(categoryKeys.getOrElse(categoryIds.indexOf(categoryId)) { categoryId ?: "" })
        fillTrip(current)
        if (navigating) refreshNav()
        if (destination != null && !navigating) recompute(false)
        refreshViewport()
    }

    fun setSensors(on: Boolean) {
        sensorsOn = on
        prefs.edit().putBoolean("mapa-sensors", on).apply()
        if (!on) {
            estimator.stop()
            if (status == t("sensors-unavailable")) showStatus = false
            return
        }
        syncSensors()
    }

    fun chooseStep(value: Double) {
        val clamped = value.coerceIn(0.3, 1.5)
        step = clamped
        estimator.setStep(clamped)
        prefs.edit().putFloat("mapa-step", clamped.toFloat()).apply()
    }

    fun usePackage(pkg: MapPackage) {
        if (downloading) return
        Catalog.remember(app, pkg)
        if (packages.none { it.id == pkg.id }) packages = (packages + pkg).sortedBy { it.name }
        downloading = true
        downloadingId = pkg.id
        viewModelScope.launch(Dispatchers.IO) {
            activate(pkg, download = true)
            onMain {
                downloading = false
                downloadingId = null
            }
        }
    }

    fun refreshCatalog() {
        viewModelScope.launch(Dispatchers.IO) {
            onMain {
                catalogLoading = true
                catalogNote = ""
            }
            val found = try {
                Catalog.remote()
            } catch (error: Exception) {
                Log.w(TAG, "catalog", error)
                null
            }
            onMain {
                catalogLoading = false
                if (found == null) {
                    catalog = emptyList()
                    catalogNote = t("catalog-failed")
                } else {
                    catalog = found
                }
            }
        }
    }

    fun closeSheet() {
        sheet = null
    }

    fun noteStyle() {
        styleStamp += 1
    }

    fun track(lat: Double, lon: Double, zoom: Double) {
        centerLat = lat
        centerLon = lon
        this.zoom = zoom
    }

    fun settled(lat: Double, lon: Double, zoom: Double, west: Double, south: Double, east: Double, north: Double, gesture: Boolean) {
        track(lat, lon, zoom)
        this.west = west
        this.south = south
        this.east = east
        this.north = north
        if (gesture && navigating && !correcting) {
            follow = false
            showRecenter = true
        }
        if (fixing || adding || correcting) scheduleLook()
        if (!navigating) refreshViewport()
    }

    override fun onCleared() {
        estimator.shutdown()
        tileServer?.close()
        engine.close()
        super.onCleared()
    }

    private fun boot() {
        try {
            onMain { saving("mapa") }
            val base = Store.prepare(app, app.assets)
            val archive = Pmtiles(File(base, "portugal.pmtiles"))
            val server = TileServer(archive, app.assets)
            tileServer = server
            onMain {
                maxZoom = archive.maxZoom
                serverPort = server.port
                showStatus = false
            }
            engine.start()
            onMain { engineReady = true }
            engine.openBuffer(File(base, "roads.bin"), "openRoads")
            onMain {
                roadsReady = true
                if (showTrip || navigating) recompute(false)
            }
            engine.openBuffer(File(base, "buildings.bin"), "openBuildings")
            onMain { refreshViewport() }
        } catch (error: Exception) {
            Log.e(TAG, "boot", error)
            onMain { fail("mapa") }
            return
        }
        val pkg = packages.firstOrNull { it.id == activePackageId } ?: packages.firstOrNull { it.autoload } ?: return
        val ready = pkg.files.all { present(pkg, it) }
        onMain {
            downloading = !ready
            downloadingId = if (ready) null else pkg.id
        }
        activate(pkg, download = !ready)
        onMain {
            downloading = false
            downloadingId = null
        }
    }

    private fun activate(pkg: MapPackage, download: Boolean) {
        var failed = false
        for (pack in pkg.files) {
            val dest = Store.file(app, pkg.id, pack.file)
            try {
                if (download && !present(pkg, pack)) {
                    onMain { saving(pack.label) }
                    Store.fetch(pack, dest)
                }
                if (!dest.exists()) {
                    failed = true
                    continue
                }
                openPack(pack, dest)
                onMain { if (showStatus) showStatus = false }
            } catch (error: Exception) {
                Log.e(TAG, pack.key, error)
                failed = true
                onMain { fail(pack.label) }
            }
        }
        if (!failed) {
            onMain {
                activePackageId = pkg.id
                prefs.edit().putString("blackout-package", pkg.id).apply()
                showStatus = false
            }
        }
    }

    private fun openPack(pack: RemotePack, file: File) {
        when (pack.key) {
            "roads" -> {
                engine.openBuffer(file, "openRoads")
                onMain {
                    roadsReady = true
                    if (showTrip || navigating) recompute(false)
                    refreshViewport()
                }
            }
            "buildings" -> {
                engine.openBuffer(file, "openBuildings")
                onMain { refreshViewport() }
            }
            "places" -> {
                engine.openBuffer(file, "openPlaces")
                onMain { refreshViewport() }
            }
            "water" -> {
                engine.openBuffer(file, "openWater")
                onMain { refreshViewport() }
            }
            "addresses" -> engine.openBuffer(file, "openAddresses")
            "geo" -> engine.openText(file, "openGeo")
            else -> Unit
        }
    }

    private fun present(pkg: MapPackage, pack: RemotePack): Boolean {
        val file = Store.file(app, pkg.id, pack.file)
        return if (pack.bytes != null) file.length() == pack.bytes else file.length() > 0
    }

    private fun chooseDestination(place: Place) {
        if (navigating || correcting) return
        destination = place
        categoryId = null
        sheet = null
        showTrip = tab == Tab.Explore
        routes = emptyList()
        destJson = MapJson.destination(place)
        bump()
        jumpTo(place.lat, place.lon, maxOf(zoom, 16.0))
        recompute(false)
    }

    private fun recompute(fit: Boolean) {
        val from = pose
        val to = destination
        if (from == null || to == null || !roadsReady) {
            if (from == null || to == null) {
                current = null
                startEnabled = false
                tripDuration = ""
                tripMeta = ""
                routesJson = MapJson.EMPTY
                bump()
            }
            return
        }
        routeJob?.cancel()
        val selected = mode
        routeJob = viewModelScope.launch(Dispatchers.IO) {
            val order = listOf("walk", "car", "bicycle")
            val primaries = order.map { kind ->
                try {
                    engine.route(from.lat, from.lon, to.lat, to.lon, kind)
                } catch (error: Exception) {
                    Log.w(TAG, kind, error)
                    null
                }
            }
            if (!isActive) return@launch
            onMain {
                val times = mutableMapOf<String, String>()
                primaries.forEachIndexed { index, route ->
                    if (route != null) times[order[index]] = strings.duration(language, route.meters, order[index], route.seconds)
                }
                modeTimes = times
                val picked = primaries.getOrNull(order.indexOf(selected))
                current = picked
                fillTrip(picked)
                if (navigating) {
                    if (picked != null) {
                        viewModelScope.launch(Dispatchers.IO) { runCatching { engine.setNavigation(true, picked) } }
                        routesJson = MapJson.routes(listOf(picked), picked.style)
                        bump()
                        refreshNav()
                    }
                } else if (picked != null) {
                    routesJson = MapJson.routes(listOf(picked), picked.style)
                    bump()
                    if (fit) fitTo(picked.coordinates)
                } else {
                    routesJson = MapJson.EMPTY
                    bump()
                }
            }
        }
    }

    private fun fillTrip(route: RouteChoice?) {
        startEnabled = pose != null && destination != null && route != null
        if (route == null) {
            tripDuration = ""
            tripMeta = ""
            return
        }
        val style = modeFor(route.style)
        tripDuration = strings.duration(language, route.meters, style, route.seconds)
        tripMeta = "${strings.arrival(language, route.meters, style, route.seconds)} · ${strings.kmOrM(language, route.meters)}"
    }

    private fun poseMoved(next: Pose) {
        pose = next
        if (!correcting) publishUser(next)
        val now = SystemClock.elapsedRealtime()
        if (navigating && follow && !correcting && now - lastFollow > 100) {
            lastFollow = now
            jumpTo(next.lat, next.lon, 17.0, next.heading ?: 0.0)
        }
        if (navigating && !correcting && now - lastNav > 200) {
            lastNav = now
            refreshNav()
        }
        if (now - lastPersist > 2000) {
            lastPersist = now
            persist(next)
        }
        startEnabled = destination != null && current != null
    }

    private fun refreshNav() {
        val here = pose ?: return
        if (!navigating) return
        navJob?.cancel()
        navJob = viewModelScope.launch(Dispatchers.IO) {
            val info = try {
                engine.navigation(here.lat, here.lon)
            } catch (error: Exception) {
                Log.w(TAG, "nav", error)
                null
            } ?: return@launch
            if (!isActive) return@launch
            onMain {
                if (!navigating) return@onMain
                navTurn = info.turn.ifEmpty { "straight" }
                navDistance = strings.maneuverDistance(language, info.meters)
                navSentence = strings.sentence(language, info.turn, info.meters, info.street)
                navTime = strings.duration(language, info.remaining, mode, info.seconds)
                navMeta = "${strings.distanceKm(language, info.remaining)} · ${strings.arrival(language, info.remaining, mode, info.seconds)}"
            }
        }
    }

    private fun lockNav() {
        val here = pose ?: return
        follow = true
        showRecenter = false
        jumpTo(here.lat, here.lon, 17.0, here.heading ?: 0.0)
    }

    private fun refreshViewport() {
        if (!engineReady || navigating) return
        viewJob?.cancel()
        val box = listOf(west, south, east, north, zoom)
        val selected = categoryId
        val code = language
        viewJob = viewModelScope.launch(Dispatchers.IO) {
            delay(250)
            if (!isActive) return@launch
            val raw = try {
                engine.viewport(box[0], box[1], box[2], box[3], box[4])
            } catch (error: Exception) {
                Log.w(TAG, "viewport", error)
                return@launch
            }
            val listed = if (selected == null) emptyList() else try {
                engine.category(box[0], box[1], box[2], box[3], box[4], selected)
            } catch (error: Exception) {
                Log.w(TAG, "category", error)
                emptyList()
            }
            if (!isActive) return@launch
            val view = MapJson.viewport(raw, selected, listed, strings, code)
            onMain {
                counts = view.counts
                if (selected != null && categoryId == selected) categoryPlaces = view.places
                markersJson = view.markers
                buildingsJson = view.buildings
                bump()
            }
        }
    }

    private fun scheduleLook() {
        lookJob?.cancel()
        val lat = centerLat
        val lon = centerLon
        val level = zoom
        val code = language
        lookJob = viewModelScope.launch(Dispatchers.IO) {
            delay(200)
            if (!isActive) return@launch
            val look = try {
                engine.inspect(lat, lon, level)
            } catch (error: Exception) {
                Log.w(TAG, "inspect", error)
                return@launch
            }
            onMain {
                val coords = strings.coord(code, lat, lon)
                if (adding) {
                    if (look.service && look.name.isNotEmpty()) {
                        saveService = true
                        saveName = strings.known(code, look.name)
                        saveAddress = strings.known(code, look.address)
                        saveEnabled = true
                    } else {
                        saveService = false
                        saveName = ""
                        saveAddress = look.name
                        saveEnabled = pinName.trim().isNotEmpty()
                    }
                    saveCoords = coords
                }
                if (fixing || correcting) {
                    fixName = strings.known(code, look.name)
                    fixAddress = strings.known(code, look.address)
                    fixCoords = coords
                }
            }
        }
    }

    private fun publishUser(next: Pose) {
        userJson = MapJson.user(next)
        bump()
    }

    private fun jumpTo(lat: Double, lon: Double, zoom: Double, bearing: Double = 0.0) {
        serial += 1
        jump = CameraJump(serial, lat, lon, zoom, bearing)
    }

    private fun fitTo(points: List<List<Double>>) {
        if (points.size < 2) return
        serial += 1
        fit = CameraFit(serial, points)
    }

    private fun bump() {
        overlay += 1
    }

    private fun saving(label: String) {
        status = t("saving", strings.label(language, label))
        showStatus = true
    }

    private fun fail(label: String) {
        status = t("save-failed", strings.label(language, label))
        showStatus = true
    }

    private fun syncSensors() {
        if (inForeground && sensorsOn && estimator.available) {
            estimator.start()
            if (status == t("sensors-unavailable")) showStatus = false
        } else {
            estimator.stop()
            if (sensorsOn && !estimator.available) {
                status = t("sensors-unavailable")
                showStatus = true
            }
        }
    }

    private fun load() {
        val savedCode = prefs.getString("blackout-language", "en") ?: "en"
        language = if (savedCode in Text.order) savedCode else "en"
        if (prefs.contains("mapa-step")) step = prefs.getFloat("mapa-step", 0.7f).toDouble().coerceIn(0.3, 1.5)
        estimator.setStep(step)
        if (prefs.contains("mapa-sensors")) sensorsOn = prefs.getBoolean("mapa-sensors", true)
        pins = readPins()
        prefs.getString("mapa-pose", null)?.let { saved ->
            val objectJson = runCatching { JSONObject(saved) }.getOrNull()
            val lat = objectJson?.optDouble("lat") ?: Double.NaN
            val lon = objectJson?.optDouble("lon") ?: Double.NaN
            if (lat.isFinite() && lon.isFinite()) {
                openingLat = lat
                openingLon = lon
                openingZoom = 16.0
                centerLat = lat
                centerLon = lon
                zoom = 16.0
                west = lon - 0.02
                south = lat - 0.02
                east = lon + 0.02
                north = lat + 0.02
                estimator.hydrate(lat, lon, objectJson?.optDouble("uncertainty", 12.0) ?: 12.0, objectJson?.optInt("steps") ?: 0, objectJson?.optDouble("distance") ?: 0.0)
            }
        }
        packages = Catalog.load(app, app.assets)
        activePackageId = prefs.getString("blackout-package", null)
    }

    private fun persist(next: Pose) {
        prefs.edit().putString(
            "mapa-pose",
            JSONObject()
                .put("lat", next.lat)
                .put("lon", next.lon)
                .put("uncertainty", next.uncertainty)
                .put("steps", next.steps)
                .put("distance", next.distance)
                .toString()
        ).apply()
    }

    private fun readPins(): List<Place> {
        val raw = prefs.getString("mapa-pins", null) ?: return emptyList()
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val row = array.optJSONObject(index) ?: continue
                val name = row.optString("name")
                if (name.isEmpty()) continue
                add(Place(row.optString("id", name), name, row.optDouble("lat"), row.optDouble("lon"), row.optString("address"), row.optString("detail"), row.optBoolean("service")))
            }
        }
    }

    private fun writePins() {
        val array = JSONArray()
        pins.forEach { place ->
            array.put(
                JSONObject()
                    .put("id", place.id)
                    .put("name", place.name)
                    .put("lat", place.lat)
                    .put("lon", place.lon)
                    .put("address", place.address)
                    .put("detail", place.detail)
                    .put("service", place.service)
            )
        }
        prefs.edit().putString("mapa-pins", array.toString()).apply()
    }

    private fun modeFor(style: String) = when (style) {
        "walk", "walk-alt" -> "walk"
        "bicycle", "bicycle-alt" -> "bicycle"
        else -> "car"
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    companion object {
        private const val TAG = "BlackoutMaps"
    }
}
