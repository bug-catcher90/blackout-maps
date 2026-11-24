package app.blackoutmaps

import android.graphics.Color
import android.view.Gravity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Point

@Composable
fun MapPane(model: AppModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapView = remember {
        MapView(context)
    }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var style by remember { mutableStateOf<Style?>(null) }

    DisposableEffect(mapView, lifecycle) {
        mapView.onCreate(null)
        mapView.onStart()
        mapView.onResume()
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    AndroidView(factory = { mapView }, modifier = modifier)

    LaunchedEffect(mapView) {
        mapView.getMapAsync { ready ->
            ready.uiSettings.isRotateGesturesEnabled = false
            ready.uiSettings.isTiltGesturesEnabled = false
            ready.uiSettings.isCompassEnabled = false
            ready.uiSettings.isAttributionEnabled = false
            val density = context.resources.displayMetrics.density
            val edge = (8 * density).toInt()
            val aboveBar = (140 * density).toInt()
            ready.uiSettings.logoGravity = Gravity.BOTTOM or Gravity.START
            ready.uiSettings.setLogoMargins(edge, edge, edge, aboveBar)
            ready.setMinZoomPreference(0.0)
            ready.setMaxZoomPreference(18.0)
            var gesture = false
            ready.addOnCameraMoveStartedListener { reason ->
                gesture = reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE
            }
            ready.addOnCameraMoveListener {
                val target = ready.cameraPosition.target ?: return@addOnCameraMoveListener
                model.track(target.latitude, target.longitude, ready.cameraPosition.zoom)
            }
            ready.addOnCameraIdleListener {
                val target = ready.cameraPosition.target ?: return@addOnCameraIdleListener
                val bounds = ready.projection.visibleRegion.latLngBounds
                val moved = gesture
                gesture = false
                model.settled(
                    target.latitude,
                    target.longitude,
                    ready.cameraPosition.zoom,
                    bounds.longitudeWest,
                    bounds.latitudeSouth,
                    bounds.longitudeEast,
                    bounds.latitudeNorth,
                    moved
                )
            }
            ready.addOnMapClickListener { latLng ->
                if (model.navigating || model.fixing || model.adding || model.correcting) return@addOnMapClickListener false
                val point = ready.projection.toScreenLocation(latLng)
                val hits = ready.queryRenderedFeatures(point, "marker-symbols")
                val feature = hits.firstOrNull() ?: return@addOnMapClickListener false
                val name = feature.getStringProperty("name") ?: return@addOnMapClickListener false
                val geometry = feature.geometry() as? Point ?: return@addOnMapClickListener false
                val address = feature.getStringProperty("address") ?: ""
                model.choose(Place("${name}|${geometry.latitude()}|${geometry.longitude()}", name, geometry.latitude(), geometry.longitude(), address, address, true))
                true
            }
            map = ready
        }
    }

    LaunchedEffect(map, model.serverPort, model.maxZoom) {
        val ready = map ?: return@LaunchedEffect
        val port = model.serverPort
        if (port == 0) return@LaunchedEffect
        ready.setStyle(Style.Builder().fromJson(MapStyle.json(port, model.maxZoom))) { loaded ->
            addOverlays(loaded, context.resources.displayMetrics.density)
            val europe = LatLngBounds.Builder()
                .include(LatLng(34.0, -25.0))
                .include(LatLng(71.0, 40.0))
                .build()
            val framed = runCatching { ready.moveCamera(CameraUpdateFactory.newLatLngBounds(europe, 72)) }.isSuccess
            if (!framed) {
                ready.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(model.openingLat, model.openingLon))
                    .zoom(model.openingZoom)
                    .bearing(0.0)
                    .build()
            }
            style = loaded
            model.noteStyle()
        }
    }

    LaunchedEffect(model.jump?.serial, map) {
        val ready = map ?: return@LaunchedEffect
        val jump = model.jump ?: return@LaunchedEffect
        ready.easeCamera(
            CameraUpdateFactory.newCameraPosition(
                CameraPosition.Builder()
                    .target(LatLng(jump.lat, jump.lon))
                    .zoom(jump.zoom)
                    .bearing(jump.bearing)
                    .build()
            ),
            250
        )
    }

    LaunchedEffect(model.fit?.serial, map) {
        val ready = map ?: return@LaunchedEffect
        val fit = model.fit ?: return@LaunchedEffect
        val builder = LatLngBounds.Builder()
        fit.points.forEach { pair ->
            if (pair.size >= 2) builder.include(LatLng(pair[1], pair[0]))
        }
        runCatching {
            ready.easeCamera(CameraUpdateFactory.newLatLngBounds(builder.build(), 140), 400)
        }
    }

    LaunchedEffect(style, model.showCountryColors) {
        val loaded = style ?: return@LaunchedEffect
        loaded.getLayer("country-fill")?.setProperties(
            PropertyFactory.visibility(if (model.showCountryColors) Property.VISIBLE else Property.NONE)
        )
    }

    LaunchedEffect(style, model.overlay, model.styleStamp, model.countriesJson) {
        val loaded = style ?: return@LaunchedEffect
        if (model.countriesJson.isNotEmpty()) {
            runCatching { loaded.getSourceAs<GeoJsonSource>("countries")?.setGeoJson(model.countriesJson) }
        }
        runCatching { loaded.getSourceAs<GeoJsonSource>("markers")?.setGeoJson(model.markersJson) }
        runCatching { loaded.getSourceAs<GeoJsonSource>("buildings")?.setGeoJson(model.buildingsJson) }
        runCatching { loaded.getSourceAs<GeoJsonSource>("routes")?.setGeoJson(model.routesJson) }
        runCatching { loaded.getSourceAs<GeoJsonSource>("user")?.setGeoJson(model.userJson) }
        runCatching { loaded.getSourceAs<GeoJsonSource>("dest")?.setGeoJson(model.destJson) }
    }
}

private fun addOverlays(style: Style, density: Float) {
    listOf("buildings", "routes", "user", "markers", "dest").forEach { id ->
        style.addSource(GeoJsonSource(id, MapJson.EMPTY))
    }
    for (index in 0..5) style.addImage("poi-$index", CategoryBitmaps.poi(density, index))
    style.addImage("water-drop", CategoryBitmaps.water(density))
    val buildings = LineLayer("building-outline", "buildings").withProperties(
        PropertyFactory.lineColor(Color.parseColor("#8C8578")),
        PropertyFactory.lineWidth(1.25f),
        PropertyFactory.lineCap("round"),
        PropertyFactory.lineJoin("round")
    )
    buildings.minZoom = 15f
    style.addLayer(buildings)
    style.addLayer(
        LineLayer("route-casing", "routes").withProperties(
            PropertyFactory.lineColor(Color.parseColor("#f6f3ec")),
            PropertyFactory.lineWidth(8f),
            PropertyFactory.lineCap("round"),
            PropertyFactory.lineJoin("round")
        )
    )
    style.addLayer(
        LineLayer("route-line", "routes").withProperties(
            PropertyFactory.lineColor(Expression.toColor(Expression.get("color"))),
            PropertyFactory.lineWidth(5f),
            PropertyFactory.lineOpacity(0.92f),
            PropertyFactory.lineCap("round"),
            PropertyFactory.lineJoin("round")
        )
    )
    val wedge = FillLayer("user-wedge", "user").withProperties(
        PropertyFactory.fillColor(Color.parseColor("#1c1916")),
        PropertyFactory.fillOpacity(0.28f)
    )
    wedge.setFilter(Expression.eq(Expression.get("role"), Expression.literal("wedge")))
    style.addLayer(wedge)
    val ring = LineLayer("user-ring", "user").withProperties(
        PropertyFactory.lineColor(Color.parseColor("#1c1916")),
        PropertyFactory.lineWidth(1.4f)
    )
    ring.setFilter(Expression.eq(Expression.get("role"), Expression.literal("ring")))
    style.addLayer(ring)
    style.addLayer(
        SymbolLayer("marker-symbols", "markers").withProperties(
            PropertyFactory.iconImage(Expression.get("icon")),
            PropertyFactory.iconSize(0.85f),
            PropertyFactory.iconAllowOverlap(true),
            PropertyFactory.iconIgnorePlacement(true),
            PropertyFactory.iconAnchor("center"),
            PropertyFactory.textField(Expression.get("name")),
            PropertyFactory.textSize(12f),
            PropertyFactory.textFont(arrayOf("Noto Sans Regular")),
            PropertyFactory.textOffset(arrayOf(0f, 1.15f)),
            PropertyFactory.textAnchor("top"),
            PropertyFactory.textOptional(true),
            PropertyFactory.textColor(Color.parseColor("#1C1916")),
            PropertyFactory.textHaloColor(Color.parseColor("#FFFCF8")),
            PropertyFactory.textHaloWidth(1.2f)
        )
    )
    style.addLayer(
        CircleLayer("dest-dot", "dest").withProperties(
            PropertyFactory.circleRadius(7f),
            PropertyFactory.circleColor(Color.parseColor("#c4552a")),
            PropertyFactory.circleStrokeWidth(2f),
            PropertyFactory.circleStrokeColor(Color.WHITE)
        )
    )
    val user = CircleLayer("user-dot", "user").withProperties(
        PropertyFactory.circleRadius(7f),
        PropertyFactory.circleColor(Color.parseColor("#1c1916")),
        PropertyFactory.circleStrokeWidth(2f),
        PropertyFactory.circleStrokeColor(Color.WHITE)
    )
    user.setFilter(Expression.eq(Expression.get("role"), Expression.literal("user")))
    style.addLayer(user)
}
