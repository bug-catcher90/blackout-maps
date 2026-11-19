import MapLibre
import SwiftUI

struct RootView: View {
    @State private var model = AppModel()

    private var showCompass: Bool {
        model.tab == "explorar" && !model.navigating && !model.fixing && !model.adding
    }

    var body: some View {
        ZStack(alignment: .top) {
            MapCanvas(model: model)
                .ignoresSafeArea()
            if model.fixing || model.adding {
                CenterPin()
            }
            if model.correcting {
                CenterDot()
            }
            if model.tab == "explorar" || model.adding {
                TopChrome(model: model)
                    .padding(.top, 8)
                    .padding(.horizontal, 12)
                    .zIndex(2)
            }
            if model.navigating && !model.correcting {
                NavBanner(model: model)
                    .padding(.top, 8)
                    .padding(.horizontal, 12)
            }
            if model.tab == "pins" && !model.adding && !model.navigating {
                PinsPanel(model: model)
            }
            if model.tab == "definicoes" && !model.navigating {
                SettingsPanel(model: model)
            }
            VStack(spacing: 0) {
                Spacer(minLength: 0).allowsHitTesting(false)
                if showCompass {
                    HStack {
                        Spacer().allowsHitTesting(false)
                        CompassButton { model.startFix() }
                    }
                    .padding(.trailing, 12)
                    .padding(.bottom, 12)
                }
                if model.showRecenter {
                    RecenterButton(model: model)
                        .padding(.bottom, 12)
                }
                BottomStack(model: model)
            }
        }
        .background(Paper.bg)
        .onAppear { model.launch() }
    }
}

private struct MapCanvas: UIViewRepresentable {
    var model: AppModel

    func makeUIView(context: Context) -> MLNMapView {
        model.launch()
        return model.map.makeView()
    }

    func updateUIView(_ uiView: MLNMapView, context: Context) {}
}

private struct CenterPin: View {
    var body: some View {
        PinMark()
            .frame(width: 28, height: 42)
            .shadow(color: .black.opacity(0.35), radius: 1, y: 1)
            .offset(y: -21)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }
}

private struct PinMark: View {
    var body: some View {
        Canvas { context, size in
            var path = Path()
            path.move(to: CGPoint(x: size.width * 0.5, y: size.height * 0.04))
            path.addCurve(
                to: CGPoint(x: size.width * 0.14, y: size.height * 0.32),
                control1: CGPoint(x: size.width * 0.28, y: size.height * 0.04),
                control2: CGPoint(x: size.width * 0.14, y: size.height * 0.16)
            )
            path.addCurve(
                to: CGPoint(x: size.width * 0.5, y: size.height * 0.96),
                control1: CGPoint(x: size.width * 0.14, y: size.height * 0.52),
                control2: CGPoint(x: size.width * 0.5, y: size.height * 0.96)
            )
            path.addCurve(
                to: CGPoint(x: size.width * 0.86, y: size.height * 0.32),
                control1: CGPoint(x: size.width * 0.5, y: size.height * 0.96),
                control2: CGPoint(x: size.width * 0.86, y: size.height * 0.52)
            )
            path.addCurve(
                to: CGPoint(x: size.width * 0.5, y: size.height * 0.04),
                control1: CGPoint(x: size.width * 0.86, y: size.height * 0.16),
                control2: CGPoint(x: size.width * 0.72, y: size.height * 0.04)
            )
            context.fill(path, with: .color(Color(red: 0.76, green: 0.25, blue: 0.05)))
            context.stroke(path, with: .color(.white), lineWidth: 1.5)
            let hole = CGRect(x: size.width * 0.36, y: size.height * 0.22, width: size.width * 0.28, height: size.width * 0.28)
            context.fill(Path(ellipseIn: hole), with: .color(.white))
        }
    }
}

private struct CenterDot: View {
    var body: some View {
        Circle()
            .fill(Paper.accent)
            .overlay(Circle().stroke(Color.white, lineWidth: 3))
            .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
            .frame(width: 28, height: 28)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }
}

private struct TopChrome: View {
    var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(Paper.ink)
                TextField("Pesquisar", text: Bindable(model).query)
                    .font(Paper.font(16))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(Paper.ink)
                    .onChange(of: model.query) { _, _ in model.queryChanged() }
                if !model.query.isEmpty {
                    Button("×") {
                        model.query = ""
                        model.queryChanged()
                    }
                    .font(Paper.font(22))
                    .foregroundStyle(Paper.muted)
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Limpar")
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 48)
            .background(Paper.bg)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Paper.line))
            .shadow(color: .black.opacity(0.16), radius: 1, y: 1)
            if !model.navigating {
                CategoryBar(model: model)
            }
            if model.showStatus {
                Text(model.status)
                    .font(Paper.font(13))
                    .foregroundStyle(Paper.muted)
                    .padding(.horizontal, 8)
            }
            if model.showResults {
                BoundedScroll(maxHeight: UIScreen.main.bounds.height * 0.42) {
                    ResultList(places: model.results, origin: model.searchOrigin) { model.choose($0) }
                }
                .zIndex(2)
            }
        }
    }
}

private struct ResultList: View {
    var places: [Place]
    var origin: Coord?
    var choose: (Place) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(places.enumerated()), id: \.offset) { index, place in
                let lines = resultLines(place)
                Button {
                    choose(place)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            if let origin {
                                Text(Format.distanceKm(Geo.meters(origin.lat, origin.lon, place.lat, place.lon)))
                                    .font(Paper.font(15))
                                    .foregroundStyle(Paper.muted)
                                    .monospacedDigit()
                            }
                            Text(lines.title)
                                .font(Paper.font(15))
                                .foregroundStyle(Paper.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        if !lines.detail.isEmpty {
                            Text(lines.detail)
                                .font(Paper.font(13))
                                .foregroundStyle(Paper.muted)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if index < places.count - 1 {
                    Rectangle().fill(Paper.line).frame(height: 1)
                }
            }
        }
        .background(Paper.bg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Paper.line))
    }

    private func resultLines(_ place: Place) -> (title: String, detail: String) {
        if place.service {
            return (place.name, place.detail == place.name ? "" : place.detail)
        }
        if let comma = place.name.range(of: ", ") {
            return (String(place.name[..<comma.lowerBound]), String(place.name[comma.upperBound...]))
        }
        return (place.name, place.detail == place.name ? "" : place.detail)
    }
}

private struct BoundedScroll<Content: View>: View {
    var maxHeight: CGFloat
    @ViewBuilder var content: () -> Content
    @State private var contentHeight: CGFloat = 1

    var body: some View {
        ScrollView {
            content()
                .background {
                    GeometryReader { proxy in
                        Color.clear.preference(key: ScrollHeightKey.self, value: proxy.size.height)
                    }
                }
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.never)
        .frame(height: min(max(contentHeight, 1), maxHeight))
        .onPreferenceChange(ScrollHeightKey.self) { contentHeight = $0 }
    }
}

private struct ScrollHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct CategoryBar: View {
    var model: AppModel

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(model.categories.enumerated()), id: \.element.id) { index, item in
                let count = index < model.counts.count ? model.counts[index] : 0
                Button {
                    model.openCategory(item.id)
                } label: {
                    VStack(spacing: 1) {
                        CategoryMark(id: item.id)
                        Text("\(count)")
                            .font(Paper.font(11))
                            .foregroundStyle(Paper.ink)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .frame(minWidth: 0)
                    .background(Paper.bg)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(model.categoryId == item.id ? Paper.accent : Paper.line, lineWidth: model.categoryId == item.id ? 2 : 1)
                    )
                    .shadow(color: .black.opacity(0.16), radius: 1, y: 1)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.label)
            }
        }
    }
}

private struct CategoryMark: View {
    var id: String

    var body: some View {
        Image(uiImage: id == "water" ? CategoryArt.water() : CategoryArt.image(Int(id) ?? 0))
            .resizable()
            .interpolation(.high)
            .frame(width: 22, height: 22)
            .accessibilityHidden(true)
    }
}

private struct CompassButton: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().stroke(Paper.ink, lineWidth: 1.6).frame(width: 22, height: 22)
                CompassNeedle()
                    .fill(Color(red: 0.76, green: 0.25, blue: 0.05))
                    .frame(width: 8, height: 10)
                    .offset(y: -3)
                CompassNeedle()
                    .fill(Paper.ink)
                    .frame(width: 8, height: 10)
                    .rotationEffect(.degrees(180))
                    .offset(y: 3)
            }
            .frame(width: 44, height: 44)
            .background(Paper.bg)
            .clipShape(Circle())
            .overlay(Circle().stroke(Paper.line))
            .shadow(color: .black.opacity(0.16), radius: 1, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Posição")
    }
}

private struct CompassNeedle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY * 0.72))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

private struct NavBanner: View {
    var model: AppModel

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(arrow(model.navTurn))
                .font(Paper.font(28, .bold))
                .frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.navDistance)
                    .font(Paper.font(22, .bold))
                Text(model.navSentence)
                    .font(Paper.font(15, .medium))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 72)
        .background(Color(red: 0.06, green: 0.42, blue: 0.30))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func arrow(_ turn: String) -> String {
        switch turn {
        case "slight-left": "↖"
        case "left": "←"
        case "sharp-left": "↙"
        case "slight-right": "↗"
        case "right": "→"
        case "sharp-right": "↘"
        case "uturn": "↩"
        default: "↑"
        }
    }
}

private struct RecenterButton: View {
    var model: AppModel

    var body: some View {
        Button("Recentrar") { model.recenter() }
            .font(Paper.font(14, .semibold))
            .foregroundStyle(Paper.accent)
            .frame(height: 36)
            .padding(.horizontal, 14)
            .background(Paper.bg)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(Paper.line))
            .shadow(color: .black.opacity(0.16), radius: 1, y: 1)
    }
}

private struct BottomStack: View {
    var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            if let id = model.categoryId {
                CategorySheet(model: model, title: model.categoryTitle, id: id)
            }
            if model.showTrip && !model.navigating {
                TripSheet(model: model)
            }
            if model.navigating && model.correcting {
                CorrectBar(model: model)
            } else if model.navigating {
                NavCard(model: model)
            }
            if model.fixing {
                FixBar(model: model)
            }
            if model.adding {
                SaveCard(model: model)
            }
            if !model.navigating {
                TabBar(model: model)
            }
        }
        .background(Paper.bg.ignoresSafeArea(edges: .bottom))
    }
}

private struct TripSheet: View {
    var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(modeTitle(model.mode))
                    .font(Paper.font(20, .semibold))
                    .foregroundStyle(Paper.ink)
                Spacer()
                Button("×") { model.closeTrip() }
                    .font(Paper.font(22))
                    .foregroundStyle(Paper.muted)
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Fechar")
            }
            HStack(spacing: 6) {
                modeButton("walk", "A pé")
                modeButton("car", "De carro")
                modeButton("bicycle", "De bicicleta")
            }
            if let destination = model.destination, destination.service {
                Text(destination.name)
                    .font(Paper.font(16, .semibold))
                    .foregroundStyle(Paper.ink)
            }
            if !model.tripDuration.isEmpty {
                Text(model.tripDuration)
                    .font(Paper.font(28, .semibold))
                    .foregroundStyle(Paper.ink)
                Text(model.tripMeta)
                    .font(Paper.font(14))
                    .foregroundStyle(Paper.muted)
            }
            if let destination = model.destination {
                Text(Format.coord(destination.lat, destination.lon))
                    .font(Paper.font(14))
                    .foregroundStyle(Paper.muted)
            }
            if model.showCards {
                ForEach(model.cards) { route in
                    Button {
                        model.startNav(route)
                    } label: {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 4).fill(swatch(route.style)).frame(width: 14, height: 14)
                            Text(route.label)
                                .font(Paper.font(15, .semibold))
                                .foregroundStyle(Paper.ink)
                            Spacer()
                            Text("\(Format.duration(meters: route.meters, mode: model.mode, seconds: route.seconds)) · \(Format.kmOrM(route.meters))")
                                .font(Paper.font(13))
                                .foregroundStyle(Paper.muted)
                        }
                        .padding(.horizontal, 8)
                        .frame(minHeight: 44)
                        .background(Paper.fill)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 8) {
                Button("Iniciar") { model.startNav() }
                    .font(Paper.font(16, .semibold))
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Paper.accent)
                    .clipShape(Capsule())
                    .opacity(model.startEnabled ? 1 : 0.38)
                    .disabled(!model.startEnabled)
                Button("Direções") { model.directions() }
                    .font(Paper.font(16, .semibold))
                    .foregroundStyle(Color(red: 0.10, green: 0.34, blue: 0.77))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(red: 0.91, green: 0.94, blue: 1))
                    .clipShape(Capsule())
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
        .shadow(color: Paper.line, radius: 0, y: -1)
    }

    private func modeButton(_ id: String, _ title: String) -> some View {
        Button {
            model.setMode(id)
        } label: {
            HStack(spacing: 6) {
                Text(model.modeTimes[id] ?? "")
                    .font(Paper.font(13))
                    .monospacedDigit()
                Text(title)
                    .font(Paper.font(13))
            }
            .frame(maxWidth: .infinity, minHeight: 40)
            .foregroundStyle(model.mode == id ? Paper.accent : Paper.muted)
            .background(model.mode == id ? Paper.fill : Color.clear)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }

    private func modeTitle(_ mode: String) -> String {
        mode == "car" ? "De carro" : mode == "bicycle" ? "De bicicleta" : "A pé"
    }

    private func swatch(_ style: String) -> Color {
        switch style {
        case "walk", "walk-alt": Color(white: 0.29)
        case "bicycle", "bicycle-alt": Color(red: 0.91, green: 0.26, blue: 0.58)
        case "toll": Color(red: 0.92, green: 0.70, blue: 0.03)
        case "local": Color(red: 0.86, green: 0.15, blue: 0.15)
        default: Color(red: 0.10, green: 0.45, blue: 0.91)
        }
    }
}

private struct NavCard: View {
    var model: AppModel

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button {
                    model.overview()
                } label: {
                    Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                        .font(.system(size: 22))
                        .foregroundStyle(Paper.ink)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Ver percurso")
                VStack(spacing: 0) {
                    Text(model.navTime)
                        .font(Paper.font(28, .semibold))
                        .foregroundStyle(Paper.ink)
                    Text(model.navMeta)
                        .font(Paper.font(14))
                        .foregroundStyle(Paper.muted)
                }
                .frame(maxWidth: .infinity)
                Button("Sair") { model.leaveNav() }
                    .font(Paper.font(16, .semibold))
                    .foregroundStyle(Color.white)
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Color(red: 0.85, green: 0.19, blue: 0.15))
                    .clipShape(Capsule())
            }
            Button("Corrigir posição") { model.startCorrect() }
                .font(Paper.font(15, .semibold))
                .foregroundStyle(Paper.ink)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(Paper.fill)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
        .shadow(color: Paper.line, radius: 0, y: -1)
    }
}

private struct CorrectBar: View {
    var model: AppModel

    var body: some View {
        HStack(spacing: 8) {
            Button("Cancelar") { model.finishCorrect(save: false) }
                .foregroundStyle(Paper.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Paper.fill)
                .clipShape(Capsule())
            Button("Confirmar") { model.finishCorrect(save: true) }
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Paper.accent)
                .clipShape(Capsule())
        }
        .font(Paper.font(16, .semibold))
        .padding(12)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
    }
}

private struct FixBar: View {
    var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !model.fixName.isEmpty {
                Text(model.fixName)
                    .font(Paper.font(18, .semibold))
                    .foregroundStyle(Paper.ink)
            }
            if !model.fixAddress.isEmpty {
                Text(model.fixAddress)
                    .font(Paper.font(13))
                    .foregroundStyle(Paper.muted)
            }
            Text(model.fixCoords)
                .font(Paper.font(13))
                .foregroundStyle(Paper.muted)
            HStack(spacing: 8) {
                Button("Cancelar") { model.cancelFix() }
                    .foregroundStyle(Paper.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Paper.fill)
                    .clipShape(Capsule())
                Button("Confirmar") { model.confirmFix() }
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Paper.accent)
                    .clipShape(Capsule())
            }
            .font(Paper.font(16, .semibold))
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
        .shadow(color: Paper.line, radius: 0, y: -1)
    }
}

private struct SaveCard: View {
    var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.saveService, !model.saveName.isEmpty {
                Text(model.saveName)
                    .font(Paper.font(18, .semibold))
                    .foregroundStyle(Paper.ink)
            }
            if !model.saveService {
                TextField("Nome", text: Bindable(model).pinName)
                    .font(Paper.font(16))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(Paper.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 48)
                    .background(Paper.fill)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .onChange(of: model.pinName) { _, _ in model.pinNameChanged() }
            }
            if !model.saveAddress.isEmpty {
                Text(model.saveAddress)
                    .font(Paper.font(13))
                    .foregroundStyle(Paper.muted)
            }
            if !model.saveCoords.isEmpty {
                Text(model.saveCoords)
                    .font(Paper.font(13))
                    .foregroundStyle(Paper.muted)
            }
            Button("Guardar") { model.savePin() }
                .font(Paper.font(15))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Paper.accent)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .opacity(model.saveEnabled ? 1 : 0.38)
                .disabled(!model.saveEnabled)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
    }
}

private struct CategorySheet: View {
    var model: AppModel
    var title: String
    var id: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(Paper.font(20, .semibold)).foregroundStyle(Paper.ink)
                Spacer()
                Button("×") { model.categoryId = nil }
                    .font(Paper.font(22))
                    .foregroundStyle(Paper.muted)
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Fechar")
            }
            ScrollView {
                ResultList(places: model.categoryPlaces, origin: nil) {
                    model.categoryId = nil
                    model.choose($0)
                }
            }
            .frame(maxHeight: 240)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Paper.bg)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16))
        .id(id)
    }
}

private struct PinsPanel: View {
    var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            if model.pins.isEmpty {
                Text("Sem pins")
                    .font(Paper.font(14))
                    .foregroundStyle(Paper.muted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(16)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(model.pins) { place in
                            HStack {
                                Button {
                                    model.openPin(place)
                                } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(place.name).font(Paper.font(15)).foregroundStyle(Paper.ink)
                                        if !place.address.isEmpty {
                                            Text(place.address).font(Paper.font(13)).foregroundStyle(Paper.muted)
                                        }
                                        Text(Format.coord(place.lat, place.lon))
                                            .font(Paper.font(13))
                                            .foregroundStyle(Paper.muted)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                                Button("Remover") { model.removePin(place) }
                                    .font(Paper.font(13))
                                    .foregroundStyle(Paper.muted)
                                    .frame(height: 36)
                                    .padding(.horizontal, 10)
                                    .background(Paper.fill)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .padding(.vertical, 8)
                            Rectangle().fill(Paper.line).frame(height: 1)
                        }
                    }
                }
            }
            Button("Adicionar") { model.startAdd() }
                .font(Paper.font(15))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Paper.accent)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.top, 12)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 16 + 56)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Paper.bg)
    }
}

private struct SettingsPanel: View {
    var model: AppModel
    @State private var legal: LegalPage?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Mapas")
                    .font(Paper.font(12))
                    .foregroundStyle(Paper.muted)
                if model.packages.isEmpty {
                    Text("Sem mapas")
                        .font(Paper.font(15))
                        .foregroundStyle(Paper.ink)
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                }
                ForEach(model.packages) { package in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(package.name)
                                .font(Paper.font(15))
                                .foregroundStyle(Paper.ink)
                            if model.downloading, !model.packageNote.isEmpty {
                                Text(model.packageNote)
                                    .font(Paper.font(13))
                                    .foregroundStyle(Paper.muted)
                            } else if !model.downloading, model.activePackageId != package.id, !model.packageNote.isEmpty {
                                Text(model.packageNote)
                                    .font(Paper.font(13))
                                    .foregroundStyle(Paper.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        if model.activePackageId == package.id, !model.downloading {
                            Text("A usar")
                                .font(Paper.font(15, .semibold))
                                .foregroundStyle(Paper.accent)
                        } else {
                            Button(model.downloading ? "A guardar" : "Descarregar") {
                                model.usePackage(package)
                            }
                            .font(Paper.font(15, .semibold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 36)
                            .background(Paper.accent)
                            .clipShape(Capsule())
                            .disabled(model.downloading)
                        }
                    }
                    .frame(minHeight: 48)
                }
                legalRow("Política de privacidade", .privacy)
                legalRow("Termos de utilização", .terms)
                Toggle(isOn: Binding(get: { model.sensorsOn }, set: { model.setSensors($0) })) {
                    Text("Sensores").font(Paper.font(15)).foregroundStyle(Paper.ink)
                }
                .tint(Paper.accent)
                .frame(minHeight: 48)
                HStack {
                    Text("Passo base").font(Paper.font(12)).foregroundStyle(Paper.muted)
                    Slider(value: Binding(get: { model.step }, set: { model.setStep($0) }), in: 0.4...1.2, step: 0.05)
                        .tint(Paper.accent)
                    Text(Format.step(model.step)).font(Paper.font(14)).foregroundStyle(Paper.ink)
                }
                .frame(minHeight: 48)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 16 + 56)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Paper.bg)
        .sheet(item: $legal) { page in
            LegalSheet(page: page)
        }
    }

    private func legalRow(_ title: String, _ page: LegalPage) -> some View {
        Button {
            legal = page
        } label: {
            HStack {
                Text(title).font(Paper.font(15)).foregroundStyle(Paper.ink)
                Spacer()
                Text("›").font(Paper.font(22)).foregroundStyle(Paper.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.plain)
    }
}

private enum LegalPage: String, Identifiable {
    case privacy
    case terms
    var id: String { rawValue }
    var title: String {
        switch self {
        case .privacy: "Política de privacidade"
        case .terms: "Termos de utilização"
        }
    }
    var body: String {
        switch self {
        case .privacy:
            "O Blackout Maps não tem conta, não tem pagamento e não recolhe dados. Não usa GPS. Os sensores ficam no telemóvel."
        case .terms:
            "Usa o Blackout Maps sem conta e sem pagamento. Não recolhemos dados e não usamos GPS. Os sensores ficam no telemóvel."
        }
    }
}

private struct LegalSheet: View {
    var page: LegalPage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(page.title)
                    .font(Paper.font(20, .semibold))
                    .foregroundStyle(Paper.ink)
                Spacer()
                Button("×") { dismiss() }
                    .font(Paper.font(22))
                    .foregroundStyle(Paper.muted)
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Fechar")
            }
            Text(page.body)
                .font(Paper.font(16))
                .foregroundStyle(Paper.ink)
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Paper.bg)
    }
}

private struct TabBar: View {
    var model: AppModel

    var body: some View {
        HStack(spacing: 0) {
            tab("explorar", "Explorar", "map")
            tab("pins", "Pins", "mappin")
            tab("definicoes", "Definições", "gearshape")
        }
        .padding(.top, 6)
        .padding(.bottom, 8)
        .frame(minHeight: 56)
        .background(Paper.bg)
        .overlay(alignment: .top) { Rectangle().fill(Paper.line).frame(height: 1) }
    }

    private func tab(_ id: String, _ title: String, _ icon: String) -> some View {
        let selected = model.tab == id
        return Button {
            model.showTab(id)
        } label: {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(title).font(Paper.font(11))
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(selected ? Paper.accent : Paper.muted)
        }
        .buttonStyle(.plain)
    }
}

private enum Paper {
    static let bg = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.086, green: 0.078, blue: 0.071, alpha: 1)
            : UIColor(red: 1, green: 0.988, blue: 0.973, alpha: 1)
    })
    static let ink = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.965, green: 0.953, blue: 0.925, alpha: 1)
            : UIColor(red: 0.110, green: 0.098, blue: 0.086, alpha: 1)
    })
    static let muted = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.718, green: 0.690, blue: 0.643, alpha: 1)
            : UIColor(red: 0.427, green: 0.404, blue: 0.369, alpha: 1)
    })
    static let line = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.180, green: 0.169, blue: 0.149, alpha: 1)
            : UIColor(red: 0.894, green: 0.871, blue: 0.831, alpha: 1)
    })
    static let fill = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.141, green: 0.122, blue: 0.106, alpha: 1)
            : UIColor(red: 0.953, green: 0.937, blue: 0.910, alpha: 1)
    })
    static let accent = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.122, green: 0.541, blue: 0.392, alpha: 1)
            : UIColor(red: 0.059, green: 0.420, blue: 0.298, alpha: 1)
    })

    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        Font.custom("Helvetica Neue", size: size).weight(weight)
    }
}
