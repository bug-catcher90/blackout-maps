package app.blackoutmaps

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel

private class Ink(
    val bg: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val fill: Color,
    val accent: Color
)

private val LocalInk = staticCompositionLocalOf {
    Ink(Color(0xFFFFFCF8), Color(0xFF1C1916), Color(0xFF6D675E), Color(0xFFE4DED4), Color(0xFFF3EFE8), Color(0xFF0F6B4C))
}

private val lightInk = Ink(Color(0xFFFFFCF8), Color(0xFF1C1916), Color(0xFF6D675E), Color(0xFFE4DED4), Color(0xFFF3EFE8), Color(0xFF0F6B4C))
private val darkInk = Ink(Color(0xFF161412), Color(0xFFF6F3EC), Color(0xFFB7B0A4), Color(0xFF2E2B26), Color(0xFF241F1B), Color(0xFF1F8A64))
private val pinColor = Color(0xFFC2400D)
private val navGreen = Color(0xFF0F6B4D)
private val linkBlue = Color(0xFF1A57C4)
private val linkWash = Color(0xFFE8F0FF)
private val exitRed = Color(0xFFD93026)
private val sheetTop = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
private val pill = RoundedCornerShape(50)

@Composable
fun BlackoutScreen(model: AppModel = viewModel()) {
    val ink = if (isSystemInDarkTheme()) darkInk else lightInk
    val direction = if (Text.directionRtl(model.language)) LayoutDirection.Rtl else LayoutDirection.Ltr
    CompositionLocalProvider(LocalLayoutDirection provides direction, LocalInk provides ink) {
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        DisposableEffect(lifecycle) {
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> model.foreground(true)
                    Lifecycle.Event.ON_STOP -> model.foreground(false)
                    else -> Unit
                }
            }
            lifecycle.addObserver(observer)
            model.launch()
            model.foreground(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
            onDispose {
                model.foreground(false)
                lifecycle.removeObserver(observer)
            }
        }
        val modal = model.sheet == Sheet.Steps || model.sheet == Sheet.Import || model.sheet == Sheet.Languages || model.sheet == Sheet.Privacy || model.sheet == Sheet.Terms
        BackHandler(modal || model.sheet == Sheet.Routes || model.categoryId != null || model.showResults || model.fixing || model.adding || model.correcting || model.navigating) {
            when {
                modal -> model.closeSheet()
                model.categoryId != null -> model.openCategory(model.categoryId!!)
                model.sheet == Sheet.Routes -> model.closeSheet()
                model.showResults -> model.clearQuery()
                model.correcting -> model.finishCorrect(false)
                model.fixing -> model.cancelFix()
                model.adding -> model.stopAdd()
                model.navigating -> model.leaveNav()
            }
        }
        Box(Modifier.fillMaxSize().background(ink.bg)) {
            MapPane(model, Modifier.fillMaxSize())
            if (model.fixing || model.adding) CenterPin()
            if (model.correcting) CenterDot()
            if ((model.tab == Tab.Explore || model.adding) && !model.navigating) {
                TopChrome(model, Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 8.dp, start = 12.dp, end = 12.dp))
            }
            if (model.navigating && !model.correcting) {
                NavBanner(model, Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 8.dp, start = 12.dp, end = 12.dp))
            }
            if (model.tab == Tab.Pins && !model.adding && !model.navigating) PinsPanel(model)
            if (model.tab == Tab.Settings && !model.navigating) SettingsPanel(model)
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
                val compass = model.tab == Tab.Explore && !model.navigating && !model.fixing && !model.adding
                if (compass) {
                    Row(Modifier.fillMaxWidth().padding(end = 12.dp, bottom = 12.dp), horizontalArrangement = Arrangement.End) {
                        CompassButton(model.t("position")) { model.startFix() }
                    }
                }
                if (model.showRecenter) {
                    Box(Modifier.fillMaxWidth().padding(bottom = 12.dp), contentAlignment = Alignment.Center) {
                        RecenterButton(model)
                    }
                }
                BottomStack(model)
            }
        }
        if (modal) Sheets(model)
    }
}

@Composable
private fun TopChrome(model: AppModel, modifier: Modifier) {
    val ink = LocalInk.current
    val focus = LocalFocusManager.current
    val maxResults = LocalConfiguration.current.screenHeightDp.dp * 0.42f
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SearchField(model, onSearch = { focus.clearFocus() })
        if (!model.navigating) CategoryBar(model)
        if (model.showStatus && model.status.isNotEmpty()) {
            Text(model.status, color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default, modifier = Modifier.padding(horizontal = 8.dp))
        }
        if (model.showResults && model.results.isNotEmpty()) {
            ResultList(
                model,
                model.results,
                model.pose,
                Modifier.heightIn(max = maxResults),
                onChoose = {
                    focus.clearFocus()
                    model.choose(it)
                }
            )
        }
    }
}

@Composable
private fun SearchField(model: AppModel, onSearch: () -> Unit) {
    val ink = LocalInk.current
    val shape = RoundedCornerShape(24.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .shadow(1.dp, shape, clip = false)
            .background(ink.bg, shape)
            .border(1.dp, ink.line, shape)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Magnifier(ink.ink)
        Spacer(Modifier.width(8.dp))
        BasicTextField(
            value = model.query,
            onValueChange = { model.queryChanged(it) },
            modifier = Modifier.weight(1f),
            textStyle = TextStyle(color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default),
            singleLine = true,
            cursorBrush = SolidColor(ink.ink),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrect = false),
            keyboardActions = KeyboardActions(onSearch = { onSearch() }),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (model.query.isEmpty()) {
                        Text(model.t("search"), color = ink.muted, fontSize = 16.sp, fontFamily = FontFamily.Default)
                    }
                    inner()
                }
            }
        )
        if (model.query.isNotEmpty()) {
            Box(
                Modifier
                    .size(48.dp)
                    .clickable {
                        model.clearQuery()
                        onSearch()
                    }
                    .semantics { contentDescription = model.t("clear") },
                contentAlignment = Alignment.Center
            ) {
                Text("×", color = ink.muted, fontSize = 22.sp, fontFamily = FontFamily.Default)
            }
        }
    }
}

@Composable
private fun CategoryBar(model: AppModel) {
    val ink = LocalInk.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        model.categoryIds.forEachIndexed { index, id ->
            val selected = model.categoryId == id
            val count = model.counts.getOrElse(index) { 0 }
            val label = model.t(listOf("health", "police", "fire", "fuel", "supermarkets", "restaurants", "water").getOrElse(index) { "" })
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .shadow(1.dp, RoundedCornerShape(14.dp), clip = false)
                    .background(ink.bg, RoundedCornerShape(14.dp))
                    .border(if (selected) 2.dp else 1.dp, if (selected) ink.accent else ink.line, RoundedCornerShape(14.dp))
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { model.openCategory(id) }
                    .semantics { contentDescription = label }
                    .padding(vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                CategoryMark(id)
                Text("$count", color = ink.ink, fontSize = 11.sp, fontFamily = FontFamily.Default, maxLines = 1)
            }
        }
    }
}

@Composable
private fun ResultList(model: AppModel, places: List<Place>, origin: Pose?, modifier: Modifier, onChoose: (Place) -> Unit) {
    val ink = LocalInk.current
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier
            .fillMaxWidth()
            .shadow(1.dp, shape, clip = false)
            .background(ink.bg, shape)
            .border(1.dp, ink.line, shape)
            .clip(shape)
            .verticalScroll(rememberScrollState())
    ) {
        places.forEachIndexed { index, place ->
            val lines = resultLines(place)
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { onChoose(place) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (origin != null) {
                        val meters = Geo.meters(origin.lat, origin.lon, place.lat, place.lon)
                        Text(model.distanceText(meters), color = ink.muted, fontSize = 15.sp, fontFamily = FontFamily.Default)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(model.known(lines.first), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                }
                if (lines.second.isNotEmpty()) {
                    Text(model.known(lines.second), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
                }
            }
            if (index < places.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(ink.line))
        }
    }
}

private fun resultLines(place: Place): Pair<String, String> {
    if (place.service) return place.name to if (place.detail == place.name) "" else place.detail
    val comma = place.name.indexOf(", ")
    if (comma >= 0) return place.name.substring(0, comma) to place.name.substring(comma + 2)
    return place.name to if (place.detail == place.name) "" else place.detail
}

@Composable
private fun BottomStack(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().background(ink.bg).navigationBarsPadding()) {
        if (model.categoryId != null) CategorySheet(model)
        if (model.showTrip && !model.navigating) TripSheet(model)
        when {
            model.navigating && model.correcting -> CorrectBar(model)
            model.navigating -> NavCard(model)
        }
        if (model.fixing) FixBar(model)
        if (model.adding) SaveCard(model)
        if (!model.navigating) TabBar(model)
    }
}

@Composable
private fun TripSheet(model: AppModel) {
    val ink = LocalInk.current
    Column(
        Modifier
            .fillMaxWidth()
            .background(ink.bg, sheetTop)
            .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(modeTitle(model), color = ink.ink, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
            CloseMark(model.t("close")) { model.closeTrip() }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ModeButton(model, "walk", "on-foot", Modifier.weight(1f))
            ModeButton(model, "car", "by-car", Modifier.weight(1f))
            ModeButton(model, "bicycle", "by-bicycle", Modifier.weight(1f))
        }
        val destination = model.destination
        if (destination != null && destination.service) {
            Text(destination.name, color = ink.ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
        }
        if (model.tripDuration.isNotEmpty()) {
            Text(model.tripDuration, color = ink.ink, fontSize = 28.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
            if (model.tripMeta.isNotEmpty()) Text(model.tripMeta, color = ink.muted, fontSize = 14.sp, fontFamily = FontFamily.Default)
        }
        if (destination != null) {
            Text(model.coordText(destination.lat, destination.lon), color = ink.muted, fontSize = 14.sp, fontFamily = FontFamily.Default)
        }
        if (model.sheet == Sheet.Routes) {
            model.routes.forEach { route ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .background(ink.fill, RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { model.startNav(route) }
                        .padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(14.dp).background(swatch(route.style), RoundedCornerShape(4.dp)))
                    Spacer(Modifier.width(8.dp))
                    Text(model.routeLabel(route), color = ink.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                    Text(model.routeMeta(route), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
                }
            }
        }
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CapsuleButton(model.t("start"), Color.White, ink.accent, Modifier.weight(1f), model.startEnabled) { model.startNav() }
            CapsuleButton(model.t("directions"), linkBlue, linkWash, Modifier.weight(1f), true) { model.directions() }
        }
    }
}

@Composable
private fun ModeButton(model: AppModel, id: String, key: String, modifier: Modifier) {
    val ink = LocalInk.current
    val selected = model.mode == id
    val time = model.modeTimes[id].orEmpty()
    Row(
        modifier
            .heightIn(min = 48.dp)
            .background(if (selected) ink.fill else Color.Transparent, pill)
            .clip(pill)
            .clickable { model.chooseMode(id) }
            .semantics { contentDescription = model.t(key) }
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        ModeGlyph(id, if (selected) ink.accent else ink.muted)
        Spacer(Modifier.width(4.dp))
        Column(horizontalAlignment = Alignment.Start) {
            if (time.isNotEmpty()) {
                Text(time, color = if (selected) ink.accent else ink.muted, fontSize = 12.sp, fontFamily = FontFamily.Default, maxLines = 1)
            }
            Text(model.t(key), color = if (selected) ink.accent else ink.muted, fontSize = 12.sp, fontFamily = FontFamily.Default, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ModeGlyph(id: String, color: Color) {
    Canvas(Modifier.size(18.dp)) {
        val stroke = Stroke(1.7.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (id) {
            "car" -> {
                val body = Path().apply {
                    moveTo(size.width * 0.08f, size.height * 0.62f)
                    lineTo(size.width * 0.22f, size.height * 0.62f)
                    lineTo(size.width * 0.34f, size.height * 0.38f)
                    lineTo(size.width * 0.62f, size.height * 0.38f)
                    lineTo(size.width * 0.74f, size.height * 0.62f)
                    lineTo(size.width * 0.92f, size.height * 0.62f)
                }
                drawPath(body, color, style = stroke)
                drawLine(color, Offset(size.width * 0.08f, size.height * 0.62f), Offset(size.width * 0.08f, size.height * 0.74f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.92f, size.height * 0.62f), Offset(size.width * 0.92f, size.height * 0.74f), stroke.width, StrokeCap.Round)
                drawCircle(color, radius = size.minDimension * 0.09f, center = Offset(size.width * 0.32f, size.height * 0.74f))
                drawCircle(color, radius = size.minDimension * 0.09f, center = Offset(size.width * 0.70f, size.height * 0.74f))
            }
            "bicycle" -> {
                val left = Offset(size.width * 0.28f, size.height * 0.70f)
                val right = Offset(size.width * 0.74f, size.height * 0.70f)
                val radius = size.minDimension * 0.18f
                drawCircle(color, radius = radius, center = left, style = stroke)
                drawCircle(color, radius = radius, center = right, style = stroke)
                drawLine(color, Offset(size.width * 0.28f, size.height * 0.70f), Offset(size.width * 0.48f, size.height * 0.34f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.48f, size.height * 0.34f), Offset(size.width * 0.68f, size.height * 0.70f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.68f, size.height * 0.70f), Offset(size.width * 0.28f, size.height * 0.70f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.48f, size.height * 0.34f), Offset(size.width * 0.78f, size.height * 0.28f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.70f, size.height * 0.22f), Offset(size.width * 0.86f, size.height * 0.34f), stroke.width, StrokeCap.Round)
            }
            else -> {
                drawCircle(color, radius = size.minDimension * 0.11f, center = Offset(size.width * 0.58f, size.height * 0.16f))
                drawLine(color, Offset(size.width * 0.58f, size.height * 0.28f), Offset(size.width * 0.42f, size.height * 0.58f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.46f, size.height * 0.40f), Offset(size.width * 0.78f, size.height * 0.32f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.50f, size.height * 0.46f), Offset(size.width * 0.22f, size.height * 0.58f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.42f, size.height * 0.58f), Offset(size.width * 0.28f, size.height * 0.88f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(size.width * 0.42f, size.height * 0.58f), Offset(size.width * 0.70f, size.height * 0.86f), stroke.width, StrokeCap.Round)
            }
        }
    }
}

private fun modeTitle(model: AppModel) = when (model.mode) {
    "car" -> model.t("by-car")
    "bicycle" -> model.t("by-bicycle")
    else -> model.t("on-foot")
}

private fun swatch(style: String) = when (style) {
    "walk", "walk-alt" -> Color(0xFF4A4A4A)
    "bicycle", "bicycle-alt" -> Color(0xFFE84294)
    "toll" -> Color(0xFFEBB308)
    "local" -> Color(0xFFDB2626)
    else -> Color(0xFF1A73E8)
}

@Composable
private fun NavBanner(model: AppModel, modifier: Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .background(navGreen, RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(turnArrow(model.navTurn), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Default, textAlign = TextAlign.Center, modifier = Modifier.width(42.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(model.navDistance, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Default)
            Text(model.navSentence, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Default, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun NavCard(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().background(ink.bg, sheetTop).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp).clickable { model.overview() }.semantics { contentDescription = model.t("see-route") }, contentAlignment = Alignment.Center) {
                OverviewGlyph(ink.ink)
            }
            Box(Modifier.size(48.dp).clickable { model.openSteps() }.semantics { contentDescription = model.t("steps") }, contentAlignment = Alignment.Center) {
                MapGlyph(ink.ink)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(model.navTime, color = ink.ink, fontSize = 28.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
                Text(model.navMeta, color = ink.muted, fontSize = 14.sp, fontFamily = FontFamily.Default)
            }
            Box(
                Modifier
                    .height(48.dp)
                    .background(exitRed, pill)
                    .clip(pill)
                    .clickable { model.leaveNav() }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(model.t("exit"), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
            }
        }
        CapsuleButton(model.t("correct"), ink.ink, ink.fill, Modifier.fillMaxWidth(), true) { model.startCorrect() }
    }
}

@Composable
private fun CorrectBar(model: AppModel) {
    val ink = LocalInk.current
    Row(Modifier.fillMaxWidth().background(ink.bg, sheetTop).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CapsuleButton(model.t("cancel"), ink.ink, ink.fill, Modifier.weight(1f), true) { model.finishCorrect(false) }
        CapsuleButton(model.t("confirm"), Color.White, ink.accent, Modifier.weight(1f), true) { model.finishCorrect(true) }
    }
}

@Composable
private fun FixBar(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().background(ink.bg, sheetTop).padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (model.fixName.isNotEmpty()) Text(model.fixName, color = ink.ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
        if (model.fixAddress.isNotEmpty()) Text(model.known(model.fixAddress), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
        if (model.fixCoords.isNotEmpty()) Text(model.fixCoords, color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CapsuleButton(model.t("cancel"), ink.ink, ink.fill, Modifier.weight(1f), true) { model.cancelFix() }
            CapsuleButton(model.t("confirm"), Color.White, ink.accent, Modifier.weight(1f), true) { model.confirmFix() }
        }
    }
}

@Composable
private fun SaveCard(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().background(ink.bg, sheetTop).padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (model.saveService && model.saveName.isNotEmpty()) {
            Text(model.saveName, color = ink.ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
        }
        if (!model.saveService) {
            BasicTextField(
                value = model.pinName,
                onValueChange = { model.pinNameChanged(it) },
                modifier = Modifier.fillMaxWidth().height(48.dp).background(ink.fill, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp),
                textStyle = TextStyle(color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default),
                singleLine = true,
                cursorBrush = SolidColor(ink.ink),
                keyboardOptions = KeyboardOptions(autoCorrect = false),
                decorationBox = { inner ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                        if (model.pinName.isEmpty()) Text(model.t("name"), color = ink.muted, fontSize = 16.sp, fontFamily = FontFamily.Default)
                        inner()
                    }
                }
            )
        }
        if (model.saveAddress.isNotEmpty()) Text(model.known(model.saveAddress), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
        if (model.saveCoords.isNotEmpty()) Text(model.saveCoords, color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
        Box(
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(ink.accent.copy(alpha = if (model.saveEnabled) 1f else 0.38f), RoundedCornerShape(8.dp))
                .clip(RoundedCornerShape(8.dp))
                .clickable(enabled = model.saveEnabled) { model.savePin() },
            contentAlignment = Alignment.Center
        ) {
            Text(model.t("save"), color = Color.White, fontSize = 15.sp, fontFamily = FontFamily.Default)
        }
    }
}

@Composable
private fun CategorySheet(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().background(ink.bg, sheetTop).padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(model.categoryTitle, color = ink.ink, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
            CloseMark(model.t("close")) { model.categoryId?.let { model.openCategory(it) } }
        }
        Spacer(Modifier.height(10.dp))
        ResultList(model, model.categoryPlaces, null, Modifier.heightIn(max = 240.dp)) {
            model.categoryId?.let { model.openCategory(it) }
            model.choose(it)
        }
    }
}

@Composable
private fun PinsPanel(model: AppModel) {
    val ink = LocalInk.current
    Column(
        Modifier
            .fillMaxSize()
            .background(ink.bg)
            .statusBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 16.dp)
            .navigationBarsPadding()
            .padding(bottom = 56.dp)
    ) {
        if (model.pins.isEmpty()) {
            Text(model.t("no-pins"), color = ink.muted, fontSize = 14.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
        } else {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                model.pins.forEach { place ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).clickable { model.openPin(place) }) {
                            Text(model.known(place.name), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default)
                            if (place.address.isNotEmpty()) Text(model.known(place.address), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
                            Text(model.coordText(place.lat, place.lon), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
                        }
                        Box(
                            Modifier
                                .height(48.dp)
                                .background(ink.fill, RoundedCornerShape(8.dp))
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { model.removePin(place) }
                                .padding(horizontal = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(model.t("remove"), color = ink.muted, fontSize = 13.sp, fontFamily = FontFamily.Default)
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(ink.line))
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(ink.accent, RoundedCornerShape(8.dp))
                .clip(RoundedCornerShape(8.dp))
                .clickable { model.startAdd() },
            contentAlignment = Alignment.Center
        ) {
            Text(model.t("add"), color = Color.White, fontSize = 15.sp, fontFamily = FontFamily.Default)
        }
    }
}

@Composable
private fun SettingsPanel(model: AppModel) {
    val ink = LocalInk.current
    Column(
        Modifier
            .fillMaxSize()
            .background(ink.bg)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .navigationBarsPadding()
            .padding(bottom = 72.dp)
    ) {
        Section(model.t("maps")) {
            if (model.packages.isEmpty()) {
                Text(model.t("no-maps"), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.heightIn(min = 48.dp).padding(vertical = 12.dp))
            }
            model.packages.forEach { pkg ->
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(pkg.flag, fontSize = 22.sp)
                    Spacer(Modifier.width(12.dp))
                    Text(pkg.name, color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                    when {
                        model.downloadingId == pkg.id -> Text(model.t("saving-now"), color = ink.muted, fontSize = 15.sp, fontFamily = FontFamily.Default)
                        model.activePackageId == pkg.id -> Text(model.t("in-use"), color = ink.accent, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
                    }
                }
            }
            ChevronRow(model.t("import-maps")) { model.sheet = Sheet.Import }
        }
        Section(model.t("language")) {
            Row(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { model.sheet = Sheet.Languages },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(model.t("language"), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                Text(model.nativeName(model.language), color = ink.muted, fontSize = 15.sp, fontFamily = FontFamily.Default)
                Spacer(Modifier.width(12.dp))
                Text("›", color = ink.muted, fontSize = 22.sp, fontFamily = FontFamily.Default)
            }
        }
        Section(model.t("sensors")) {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(model.t("sensors"), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                Switch(
                    checked = model.sensorsOn,
                    onCheckedChange = { model.setSensors(it) },
                    colors = SwitchDefaults.colors(checkedTrackColor = ink.accent, checkedThumbColor = Color.White)
                )
            }
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(model.t("base-step"), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default)
                Slider(
                    value = model.step.toFloat().coerceIn(0.4f, 1.2f),
                    onValueChange = { model.chooseStep((kotlin.math.round(it / 0.05f) * 0.05f).toDouble()) },
                    valueRange = 0.4f..1.2f,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                    colors = SliderDefaults.colors(thumbColor = ink.accent, activeTrackColor = ink.accent, inactiveTrackColor = ink.line)
                )
                Text(model.stepText(), color = ink.ink, fontSize = 14.sp, fontFamily = FontFamily.Default)
            }
        }
        Section(model.t("legal")) {
            ChevronRow(model.t("privacy")) { model.sheet = Sheet.Privacy }
            ChevronRow(model.t("terms")) { model.sheet = Sheet.Terms }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(title, color = ink.muted, fontSize = 12.sp, fontFamily = FontFamily.Default, modifier = Modifier.padding(top = 18.dp, bottom = 4.dp))
        content()
        Box(Modifier.fillMaxWidth().padding(top = 8.dp).height(1.dp).background(ink.line))
    }
}

@Composable
private fun ChevronRow(title: String, onClick: () -> Unit) {
    val ink = LocalInk.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
        Text("›", color = ink.muted, fontSize = 22.sp, fontFamily = FontFamily.Default)
    }
}

@Composable
private fun TabBar(model: AppModel) {
    val ink = LocalInk.current
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(ink.line))
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(top = 6.dp, bottom = 8.dp)) {
            TabButton(model.t("explore"), model.tab == Tab.Explore, "map") { model.showTab(Tab.Explore) }
            TabButton(model.t("pins"), model.tab == Tab.Pins, "pin") { model.showTab(Tab.Pins) }
            TabButton(model.t("settings"), model.tab == Tab.Settings, "gear") { model.showTab(Tab.Settings) }
        }
    }
}

@Composable
private fun RowScope.TabButton(title: String, selected: Boolean, icon: String, onClick: () -> Unit) {
    val ink = LocalInk.current
    val color = if (selected) ink.accent else ink.muted
    Column(
        Modifier
            .weight(1f)
            .heightIn(min = 48.dp)
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        when (icon) {
            "map" -> MapGlyph(color)
            "pin" -> PinGlyph(color, Modifier.size(20.dp))
            else -> GearGlyph(color)
        }
        Text(title, color = color, fontSize = 11.sp, fontFamily = FontFamily.Default)
    }
}

@Composable
private fun CompassButton(label: String, onClick: () -> Unit) {
    val ink = LocalInk.current
    Box(
        Modifier
            .size(48.dp)
            .shadow(1.dp, CircleShape, clip = false)
            .background(ink.bg, CircleShape)
            .border(1.dp, ink.line, CircleShape)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        Canvas(Modifier.size(22.dp)) {
            drawCircle(color = ink.ink, style = Stroke(width = 1.6.dp.toPx()))
            val needle = Path().apply {
                moveTo(size.width / 2f, 0f)
                lineTo(size.width, size.height)
                lineTo(size.width / 2f, size.height * 0.72f)
                lineTo(0f, size.height)
                close()
            }
            val north = Path().apply {
                addPath(needle)
            }
            drawPath(north, pinColor)
        }
    }
}

@Composable
private fun RecenterButton(model: AppModel) {
    val ink = LocalInk.current
    Box(
        Modifier
            .height(48.dp)
            .shadow(1.dp, pill, clip = false)
            .background(ink.bg, pill)
            .border(1.dp, ink.line, pill)
            .clip(pill)
            .clickable { model.recenter() }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(model.t("recenter"), color = ink.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
    }
}

@Composable
private fun CapsuleButton(title: String, text: Color, fill: Color, modifier: Modifier, enabled: Boolean, onClick: () -> Unit) {
    Box(
        modifier
            .height(48.dp)
            .background(fill.copy(alpha = if (enabled) 1f else 0.38f), pill)
            .clip(pill)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(title, color = text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
    }
}

@Composable
private fun CloseMark(label: String, onClick: () -> Unit) {
    val ink = LocalInk.current
    Box(
        Modifier.size(48.dp).clickable(onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center
    ) {
        Text("×", color = ink.muted, fontSize = 22.sp, fontFamily = FontFamily.Default)
    }
}

@Composable
private fun OverviewGlyph(color: Color) {
    Canvas(Modifier.size(22.dp)) {
        val stroke = Stroke(1.8.dp.toPx(), cap = StrokeCap.Round)
        drawCircle(color, radius = size.minDimension * 0.08f, center = Offset(size.width * 0.22f, size.height * 0.28f), style = stroke)
        drawCircle(color, radius = size.minDimension * 0.08f, center = Offset(size.width * 0.78f, size.height * 0.74f), style = stroke)
        val path = Path().apply {
            moveTo(size.width * 0.3f, size.height * 0.34f)
            quadraticBezierTo(size.width * 0.78f, size.height * 0.18f, size.width * 0.7f, size.height * 0.66f)
        }
        drawPath(path, color, style = stroke)
    }
}

@Composable
private fun CenterPin() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        PinGlyph(pinColor, Modifier.size(28.dp, 42.dp).offset(y = (-21).dp))
    }
}

@Composable
private fun CenterDot() {
    val ink = LocalInk.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(28.dp)
                .shadow(2.dp, CircleShape)
                .background(ink.accent, CircleShape)
                .border(3.dp, Color.White, CircleShape)
        )
    }
}

@Composable
private fun Magnifier(color: Color) {
    Canvas(Modifier.size(18.dp)) {
        val r = size.minDimension * 0.32f
        drawCircle(color, radius = r, center = Offset(size.width * 0.4f, size.height * 0.4f), style = Stroke(1.6.dp.toPx()))
        drawLine(color, Offset(size.width * 0.62f, size.height * 0.62f), Offset(size.width * 0.9f, size.height * 0.9f), strokeWidth = 1.6.dp.toPx(), cap = StrokeCap.Round)
    }
}

@Composable
private fun MapGlyph(color: Color) {
    Canvas(Modifier.size(20.dp)) {
        val stroke = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val path = Path().apply {
            moveTo(size.width * 0.08f, size.height * 0.28f)
            lineTo(size.width * 0.34f, size.height * 0.16f)
            lineTo(size.width * 0.66f, size.height * 0.34f)
            lineTo(size.width * 0.92f, size.height * 0.2f)
            lineTo(size.width * 0.92f, size.height * 0.78f)
            lineTo(size.width * 0.66f, size.height * 0.9f)
            lineTo(size.width * 0.34f, size.height * 0.72f)
            lineTo(size.width * 0.08f, size.height * 0.84f)
            close()
        }
        drawPath(path, color, style = stroke)
        drawLine(color, Offset(size.width * 0.34f, size.height * 0.16f), Offset(size.width * 0.34f, size.height * 0.72f), 1.4.dp.toPx())
        drawLine(color, Offset(size.width * 0.66f, size.height * 0.34f), Offset(size.width * 0.66f, size.height * 0.9f), 1.4.dp.toPx())
    }
}

@Composable
private fun GearGlyph(color: Color) {
    Canvas(Modifier.size(20.dp)) {
        drawCircle(color, radius = size.minDimension * 0.22f, style = Stroke(1.6.dp.toPx()))
        drawCircle(color, radius = size.minDimension * 0.38f, style = Stroke(1.6.dp.toPx()))
    }
}

@Composable
private fun PinGlyph(color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val path = Path().apply {
            moveTo(size.width * 0.5f, size.height * 0.04f)
            cubicTo(size.width * 0.28f, size.height * 0.04f, size.width * 0.14f, size.height * 0.16f, size.width * 0.14f, size.height * 0.32f)
            cubicTo(size.width * 0.14f, size.height * 0.52f, size.width * 0.5f, size.height * 0.96f, size.width * 0.5f, size.height * 0.96f)
            cubicTo(size.width * 0.5f, size.height * 0.96f, size.width * 0.86f, size.height * 0.52f, size.width * 0.86f, size.height * 0.32f)
            cubicTo(size.width * 0.86f, size.height * 0.16f, size.width * 0.72f, size.height * 0.04f, size.width * 0.5f, size.height * 0.04f)
            close()
        }
        drawPath(path, color)
        drawPath(path, Color.White, style = Stroke(1.5.dp.toPx()))
        drawCircle(Color.White, radius = size.width * 0.14f, center = Offset(size.width * 0.5f, size.height * 0.30f))
    }
}

@Composable
private fun CategoryMark(id: String) {
    Canvas(Modifier.size(22.dp)) {
        val s = size.width / 64f
        val disk = if (id == "water") Color(0xFF0E7490) else categoryColor(id)
        drawCircle(disk, radius = 26f * s, center = Offset(32f * s, 32f * s))
        drawCircle(Color.White, radius = 26f * s, center = Offset(32f * s, 32f * s), style = Stroke(6f * s))
        val stroke = Stroke(4f * s, cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (id) {
            "0" -> {
                drawRect(Color.White, Offset(28f * s, 16f * s), Size(8f * s, 32f * s))
                drawRect(Color.White, Offset(16f * s, 28f * s), Size(32f * s, 8f * s))
            }
            "1" -> drawPath(shield(s), Color.White, style = stroke)
            "2" -> drawPath(flame(s), Color.White)
            "3" -> {
                drawPath(rectPath(26f, 16f, 12f, 28f, s), Color.White, style = stroke)
                drawPath(hose(s), Color.White, style = stroke)
            }
            "4" -> {
                drawPath(rectPath(18f, 26f, 28f, 18f, s), Color.White, style = stroke)
                drawPath(handle(s), Color.White, style = stroke)
            }
            "water" -> drawPath(drop(s), Color.White)
            else -> drawPath(fork(s), Color.White, style = stroke)
        }
    }
}

private fun categoryColor(id: String) = when (id) {
    "0" -> Color(0xFF0F6B4C)
    "1" -> Color(0xFF1D4ED8)
    "2" -> Color(0xFFDC2626)
    "3" -> Color(0xFF7C3AED)
    "4" -> Color(0xFFB45309)
    else -> Color(0xFFBE185D)
}

private fun shield(s: Float) = Path().apply {
    moveTo(32f * s, 14f * s)
    lineTo(48f * s, 20f * s)
    lineTo(44f * s, 38f * s)
    quadraticBezierTo(32f * s, 50f * s, 20f * s, 38f * s)
    lineTo(16f * s, 20f * s)
    close()
}

private fun flame(s: Float) = Path().apply {
    moveTo(32f * s, 14f * s)
    quadraticBezierTo(46f * s, 28f * s, 40f * s, 42f * s)
    quadraticBezierTo(32f * s, 50f * s, 24f * s, 42f * s)
    quadraticBezierTo(18f * s, 28f * s, 32f * s, 14f * s)
    close()
}

private fun hose(s: Float) = Path().apply {
    moveTo(38f * s, 20f * s)
    lineTo(46f * s, 20f * s)
    lineTo(46f * s, 30f * s)
    lineTo(38f * s, 30f * s)
}

private fun handle(s: Float) = Path().apply {
    moveTo(22f * s, 26f * s)
    lineTo(26f * s, 16f * s)
    lineTo(40f * s, 16f * s)
    lineTo(44f * s, 26f * s)
}

private fun drop(s: Float) = Path().apply {
    moveTo(32f * s, 14f * s)
    cubicTo(46f * s, 30f * s, 44f * s, 40f * s, 32f * s, 48f * s)
    cubicTo(20f * s, 40f * s, 18f * s, 30f * s, 32f * s, 14f * s)
    close()
}

private fun fork(s: Float) = Path().apply {
    moveTo(24f * s, 14f * s)
    lineTo(24f * s, 36f * s)
    moveTo(30f * s, 14f * s)
    lineTo(30f * s, 36f * s)
    moveTo(40f * s, 14f * s)
    lineTo(40f * s, 28f * s)
    quadraticBezierTo(40f * s, 36f * s, 32f * s, 36f * s)
}

private fun rectPath(x: Float, y: Float, w: Float, h: Float, s: Float) = Path().apply {
    addRect(androidx.compose.ui.geometry.Rect(x * s, y * s, (x + w) * s, (y + h) * s))
}

private fun turnArrow(turn: String) = when (turn) {
    "slight-left" -> "↖"
    "left" -> "←"
    "sharp-left" -> "↙"
    "slight-right" -> "↗"
    "right" -> "→"
    "sharp-right" -> "↘"
    "uturn" -> "↩"
    "roundabout" -> "↻"
    "arrive" -> "●"
    else -> "↑"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheets(model: AppModel) {
    val ink = LocalInk.current
    val sheet = model.sheet ?: return
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    LaunchedEffect(sheet) {
        if (sheet == Sheet.Import) model.refreshCatalog()
    }
    ModalBottomSheet(
        onDismissRequest = { model.closeSheet() },
        sheetState = state,
        containerColor = ink.bg,
        dragHandle = null
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            when (sheet) {
                Sheet.Steps -> {
                    SheetTitle(model.t("steps"), model.t("close")) { model.closeSheet() }
                    model.steps.forEach { step ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 20.dp, vertical = 10.dp)) {
                            Text(turnArrow(step.turn), color = ink.ink, fontSize = 22.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Default, modifier = Modifier.width(32.dp))
                            Column(Modifier.weight(1f)) {
                                Text(model.t(if (step.turn in TURNS) step.turn else "straight"), color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default)
                                if (step.street.isNotEmpty()) Text(step.street, color = ink.muted, fontSize = 14.sp, fontFamily = FontFamily.Default)
                            }
                            if (step.turn != "arrive") Text(model.lengthText(step.meters), color = ink.muted, fontSize = 15.sp, fontFamily = FontFamily.Default)
                        }
                        Box(Modifier.fillMaxWidth().padding(start = 20.dp).height(1.dp).background(ink.line))
                    }
                }
                Sheet.Import -> {
                    SheetTitle(model.t("import-maps"), model.t("close")) { model.closeSheet() }
                    if (model.catalogNote.isNotEmpty()) {
                        Text(model.catalogNote, color = ink.muted, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                    } else if (model.catalog.isEmpty() && !model.catalogLoading) {
                        Text(model.t("no-maps"), color = ink.ink, fontSize = 15.sp, fontFamily = FontFamily.Default, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                    }
                    model.catalog.forEach { pkg ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(pkg.flag, fontSize = 22.sp)
                            Spacer(Modifier.width(12.dp))
                            Text(pkg.name, color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                            if (model.activePackageId == pkg.id && model.downloadingId != pkg.id) {
                                Text(model.t("in-use"), color = ink.accent, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
                            } else {
                                val busy = model.downloadingId == pkg.id
                                Box(
                                    Modifier
                                        .height(36.dp)
                                        .background(ink.accent, pill)
                                        .clip(pill)
                                        .clickable(enabled = !model.downloading) { model.usePackage(pkg) }
                                        .padding(horizontal = 14.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(if (busy) model.t("saving-now") else model.t("download"), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
                                }
                            }
                        }
                        Box(Modifier.fillMaxWidth().padding(start = 20.dp).height(1.dp).background(ink.line))
                    }
                }
                Sheet.Languages -> {
                    SheetTitle(model.t("language"), model.t("close")) { model.closeSheet() }
                    Text.order.forEach { code ->
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable {
                                model.chooseLanguage(code)
                                model.closeSheet()
                            }.padding(horizontal = 20.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(model.nativeName(code), color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
                            if (model.language == code) Text("✓", color = ink.accent, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default)
                        }
                        Box(Modifier.fillMaxWidth().padding(start = 20.dp).height(1.dp).background(ink.line))
                    }
                }
                Sheet.Privacy -> LegalPage(model.t("privacy"), model.t("privacy-body"), model.t("close")) { model.closeSheet() }
                Sheet.Terms -> LegalPage(model.t("terms"), model.t("terms-body"), model.t("close")) { model.closeSheet() }
                else -> Unit
            }
        }
    }
}

private val TURNS = setOf("slight-left", "left", "sharp-left", "slight-right", "right", "sharp-right", "uturn", "roundabout", "arrive", "straight")

@Composable
private fun SheetTitle(title: String, close: String, onClose: () -> Unit) {
    val ink = LocalInk.current
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = ink.ink, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Default, modifier = Modifier.weight(1f))
        CloseMark(close, onClose)
    }
}

@Composable
private fun LegalPage(title: String, body: String, close: String, onClose: () -> Unit) {
    val ink = LocalInk.current
    SheetTitle(title, close, onClose)
    Text(body, color = ink.ink, fontSize = 16.sp, fontFamily = FontFamily.Default, modifier = Modifier.padding(horizontal = 20.dp))
}

