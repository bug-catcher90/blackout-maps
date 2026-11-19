package app.blackoutmaps

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TravelExplore
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun BlackoutScreen(model: AppModel = viewModel()) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) {
        darkColorScheme(
            background = Color(0xFF1C1916),
            surface = Color(0xFF2A241E),
            onBackground = Color(0xFFF4F0E6),
            onSurface = Color(0xFFF4F0E6),
            primary = Color(0xFFC4552A),
            onPrimary = Color(0xFFF4F0E6)
        )
    } else {
        lightColorScheme(
            background = Color(0xFFF4F0E6),
            surface = Color(0xFFF7F3EA),
            onBackground = Color(0xFF1C1916),
            onSurface = Color(0xFF1C1916),
            primary = Color(0xFFC4552A),
            onPrimary = Color(0xFFF6F3EC)
        )
    }
    val direction = if (Text.directionRtl(model.language)) LayoutDirection.Rtl else LayoutDirection.Ltr
    CompositionLocalProvider(LocalLayoutDirection provides direction) {
        MaterialTheme(colorScheme = scheme) {
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
            BackHandler(model.sheet != null || model.showResults || model.fixing || model.adding || model.correcting || model.navigating) {
                when {
                    model.sheet != null -> model.closeSheet()
                    model.showResults -> model.clearQuery()
                    model.correcting -> model.finishCorrect(false)
                    model.fixing -> model.cancelFix()
                    model.adding -> model.stopAdd()
                    model.navigating -> model.leaveNav()
                }
            }
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                bottomBar = {
                    NavigationBar {
                        NavigationBarItem(
                            selected = model.tab == Tab.Explore,
                            onClick = { model.showTab(Tab.Explore) },
                            icon = { androidx.compose.material3.Icon(Icons.Outlined.TravelExplore, contentDescription = model.t("explore")) },
                            label = { Text(model.t("explore")) }
                        )
                        NavigationBarItem(
                            selected = model.tab == Tab.Pins,
                            onClick = { model.showTab(Tab.Pins) },
                            icon = { androidx.compose.material3.Icon(Icons.Outlined.Place, contentDescription = model.t("pins")) },
                            label = { Text(model.t("pins")) }
                        )
                        NavigationBarItem(
                            selected = model.tab == Tab.Settings,
                            onClick = { model.showTab(Tab.Settings) },
                            icon = { androidx.compose.material3.Icon(Icons.Outlined.Settings, contentDescription = model.t("settings")) },
                            label = { Text(model.t("settings")) }
                        )
                    }
                }
            ) { padding ->
                Box(Modifier.fillMaxSize().padding(padding)) {
                    when (model.tab) {
                        Tab.Explore -> Explore(model, Modifier.fillMaxSize())
                        Tab.Pins -> Pins(model, Modifier.fillMaxSize())
                        Tab.Settings -> Settings(model, Modifier.fillMaxSize())
                    }
                }
            }
            Sheets(model)
        }
    }
}

@Composable
private fun Explore(model: AppModel, modifier: Modifier) {
    val focus = LocalFocusManager.current
    Box(modifier) {
        MapPane(model, Modifier.fillMaxSize())
        if (model.fixing || model.adding || model.correcting) {
            Canvas(Modifier.align(Alignment.Center).size(28.dp)) {
                drawLine(Color(0xFF1C1916), Offset(size.width / 2, 2f), Offset(size.width / 2, size.height - 2f), 2f)
                drawLine(Color(0xFF1C1916), Offset(2f, size.height / 2), Offset(size.width - 2f, size.height / 2), 2f)
            }
        }
        Column(Modifier.fillMaxWidth().statusBarsPadding()) {
            if (!model.navigating) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextField(
                        value = model.query,
                        onValueChange = { model.queryChanged(it) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text(model.t("search")) },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }),
                        colors = TextFieldDefaults.colors(
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        )
                    )
                    if (model.query.isNotEmpty()) {
                        TextButton(onClick = {
                            model.clearQuery()
                            focus.clearFocus()
                        }) { Text(model.t("clear")) }
                    }
                }
                if (model.showResults && model.results.isNotEmpty()) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(max = 280.dp)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 12.dp)
                    ) {
                        Surface(color = MaterialTheme.colorScheme.surface) {
                            Column {
                                model.results.forEach { place ->
                                    Column(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                focus.clearFocus()
                                                model.choose(place)
                                            }
                                            .padding(horizontal = 16.dp, vertical = 12.dp)
                                    ) {
                                        Text(place.name)
                                        if (place.detail.isNotEmpty()) {
                                            Text(place.detail, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                                        }
                                    }
                                    HorizontalDivider()
                                }
                            }
                        }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    model.categoryIds.forEachIndexed { index, id ->
                        val count = model.counts.getOrElse(index) { 0 }
                        val label = model.t(model.categoryKey(index)) + if (count > 0) " $count" else ""
                        FilterChip(selected = model.categoryId == id, onClick = { model.openCategory(id) }, label = { Text(label) })
                    }
                }
            }
            if (model.showStatus && model.status.isNotEmpty()) {
                Text(model.status, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!model.navigating && !model.fixing && !model.adding) {
                TextButton(onClick = { model.startFix() }) { Text(model.t("position")) }
            }
            if (model.showRecenter) {
                TextButton(onClick = { model.recenter() }) { Text(model.t("recenter")) }
            }
            when {
                model.correcting -> CorrectCard(model)
                model.fixing -> FixCard(model)
                model.adding -> AddCard(model)
                model.navigating -> NavCard(model)
                model.showTrip -> TripCard(model)
            }
        }
    }
}

private fun AppModel.categoryKey(index: Int) = listOf("health", "police", "fire", "fuel", "supermarkets", "restaurants", "water").getOrElse(index) { "" }

@Composable
private fun TripCard(model: AppModel) {
    Card {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ModeChip(model, "walk", "on-foot")
            ModeChip(model, "bicycle", "by-bicycle")
            ModeChip(model, "car", "by-car")
        }
        if (model.tripDuration.isNotEmpty()) Text(model.tripDuration, style = MaterialTheme.typography.titleMedium)
        if (model.tripMeta.isNotEmpty()) Text(model.tripMeta, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Row {
            Button(onClick = { model.startNav() }, enabled = model.startEnabled) { Text(model.t("start")) }
            Spacer(Modifier.width(8.dp))
            TextButton(onClick = { model.directions() }) { Text(model.t("directions")) }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { model.closeTrip() }) { Text(model.t("close")) }
        }
    }
}

@Composable
private fun ModeChip(model: AppModel, id: String, key: String) {
    val time = model.modeTimes[id].orEmpty()
    FilterChip(
        selected = model.mode == id,
        onClick = { model.chooseMode(id) },
        label = { Text(if (time.isEmpty()) model.t(key) else "${model.t(key)}  $time") }
    )
}

@Composable
private fun NavCard(model: AppModel) {
    Card {
        Text(model.navSentence, style = MaterialTheme.typography.titleMedium)
        if (model.navTime.isNotEmpty() || model.navMeta.isNotEmpty()) {
            Text("${model.navTime}  ${model.navMeta}".trim(), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        }
        Row(Modifier.horizontalScroll(rememberScrollState())) {
            TextButton(onClick = { model.overview() }) { Text(model.t("see-route")) }
            TextButton(onClick = { model.openSteps() }) { Text(model.t("steps")) }
            TextButton(onClick = { model.leaveNav() }) { Text(model.t("exit")) }
        }
        TextButton(onClick = { model.startCorrect() }) { Text(model.t("correct")) }
    }
}

@Composable
private fun FixCard(model: AppModel) {
    Card {
        if (model.fixName.isNotEmpty()) Text(model.fixName, style = MaterialTheme.typography.titleMedium)
        if (model.fixAddress.isNotEmpty()) Text(model.fixAddress)
        if (model.fixCoords.isNotEmpty()) Text(model.fixCoords, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Row {
            Button(onClick = { model.confirmFix() }) { Text(model.t("confirm")) }
            TextButton(onClick = { model.cancelFix() }) { Text(model.t("cancel")) }
        }
    }
}

@Composable
private fun CorrectCard(model: AppModel) {
    Card {
        Text(model.t("correct"), style = MaterialTheme.typography.titleMedium)
        if (model.fixCoords.isNotEmpty()) Text(model.fixCoords)
        Row {
            Button(onClick = { model.finishCorrect(true) }) { Text(model.t("confirm")) }
            TextButton(onClick = { model.finishCorrect(false) }) { Text(model.t("cancel")) }
        }
    }
}

@Composable
private fun AddCard(model: AppModel) {
    Card {
        if (model.saveService) {
            Text(model.saveName, style = MaterialTheme.typography.titleMedium)
        } else {
            TextField(
                value = model.pinName,
                onValueChange = { model.pinNameChanged(it) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(model.t("name")) },
                colors = TextFieldDefaults.colors(
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent
                )
            )
        }
        if (model.saveAddress.isNotEmpty()) Text(model.saveAddress)
        if (model.saveCoords.isNotEmpty()) Text(model.saveCoords, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        Row {
            Button(onClick = { model.savePin() }, enabled = model.saveEnabled) { Text(model.t("save")) }
            TextButton(onClick = { model.stopAdd() }) { Text(model.t("cancel")) }
        }
    }
}

@Composable
private fun Pins(model: AppModel, modifier: Modifier) {
    Column(modifier.statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(model.t("pins"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = { model.startAdd() }) { Text(model.t("add")) }
        }
        if (model.pins.isEmpty()) {
            Text(model.t("no-pins"), Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        }
        Column(Modifier.verticalScroll(rememberScrollState())) {
            model.pins.forEach { place ->
                Row(
                    Modifier.fillMaxWidth().clickable { model.openPin(place) }.padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(place.name)
                        if (place.detail.isNotEmpty()) Text(place.detail, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                    }
                    TextButton(onClick = { model.removePin(place) }) { Text(model.t("remove")) }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun Settings(model: AppModel, modifier: Modifier) {
    Column(modifier.statusBarsPadding().verticalScroll(rememberScrollState())) {
        Text(model.t("settings"), Modifier.padding(horizontal = 20.dp, vertical = 16.dp), style = MaterialTheme.typography.titleLarge)
        SettingRow(model.t("maps"), model.packages.firstOrNull { it.id == model.activePackageId }?.name ?: "") { model.sheet = Sheet.Maps }
        SettingRow(model.t("import-maps"), "") { model.sheet = Sheet.Import }
        SettingRow(model.t("language"), model.nativeName(model.language)) { model.sheet = Sheet.Languages }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text(model.t("base-step"))
            Text(model.stepText(), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
            Slider(value = model.step.toFloat(), onValueChange = { model.chooseStep(it.toDouble()) }, valueRange = 0.3f..1.5f)
        }
        HorizontalDivider()
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(model.t("sensors"), Modifier.weight(1f))
            Switch(checked = model.sensorsOn, onCheckedChange = { model.setSensors(it) })
        }
        HorizontalDivider()
        SettingRow(model.t("privacy"), "") { model.sheet = Sheet.Privacy }
        SettingRow(model.t("terms"), "") { model.sheet = Sheet.Terms }
    }
}

@Composable
private fun SettingRow(title: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 52.dp).padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, Modifier.weight(1f))
        if (value.isNotEmpty()) Text(value, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
        Text("  ›", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
    }
    HorizontalDivider()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheets(model: AppModel) {
    val sheet = model.sheet ?: return
    LaunchedEffect(sheet) {
        if (sheet == Sheet.Import) model.refreshCatalog()
    }
    ModalBottomSheet(onDismissRequest = { model.closeSheet() }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            when (sheet) {
                Sheet.Routes -> {
                    Text(model.t("directions"), Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
                    if (model.routes.isEmpty()) Text(model.t("no-maps"), Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                    model.routes.forEach { route ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                                Text(model.routeLabel(route))
                                Text(model.routeMeta(route), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                            }
                            Button(onClick = { model.startNav(route) }) { Text(model.t("start")) }
                        }
                    }
                }
                Sheet.Steps -> {
                    Text(model.t("steps"), Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
                    model.steps.forEach { step ->
                        Text(model.stepSentence(step), Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp))
                        HorizontalDivider()
                    }
                }
                Sheet.Category -> {
                    Text(model.categoryTitle, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
                    model.categoryPlaces.forEach { place ->
                        Column(Modifier.fillMaxWidth().clickable { model.choose(place) }.padding(horizontal = 20.dp, vertical = 12.dp)) {
                            Text(place.name)
                            if (place.detail.isNotEmpty()) Text(place.detail, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                        }
                        HorizontalDivider()
                    }
                }
                Sheet.Maps -> PackageList(model, model.packages, model.t("maps"), model.t("no-maps"))
                Sheet.Import -> {
                    if (model.catalogNote.isNotEmpty()) Text(model.catalogNote, Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                    PackageList(model, model.catalog, model.t("import-maps"), if (model.catalogLoading) model.t("saving-now") else model.t("no-maps"))
                }
                Sheet.Languages -> {
                    Text(model.t("language"), Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
                    Text.order.forEach { code ->
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                model.chooseLanguage(code)
                                model.closeSheet()
                            }.padding(horizontal = 20.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(model.nativeName(code), Modifier.weight(1f))
                            if (model.language == code) Text("✓")
                        }
                        HorizontalDivider()
                    }
                }
                Sheet.Privacy -> Legal(model.t("privacy"), model.t("privacy-body"))
                Sheet.Terms -> Legal(model.t("terms"), model.t("terms-body"))
            }
        }
    }
}

@Composable
private fun PackageList(model: AppModel, packages: List<MapPackage>, title: String, empty: String) {
    Text(title, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
    if (packages.isEmpty()) Text(empty, Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
    packages.forEach { pkg ->
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(pkg.flag)
            Spacer(Modifier.width(12.dp))
            Text(pkg.name, Modifier.weight(1f))
            when {
                model.downloadingId == pkg.id -> Text(model.t("saving-now"), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                model.activePackageId == pkg.id -> Text(model.t("in-use"), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.62f))
                else -> TextButton(onClick = { model.usePackage(pkg) }, enabled = !model.downloading) { Text(model.t("download")) }
            }
        }
        HorizontalDivider()
    }
}

@Composable
private fun Legal(title: String, body: String) {
    Text(title, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
    Text(body, Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
    }
}
