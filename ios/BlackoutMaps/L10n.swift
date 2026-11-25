import SwiftUI

enum L10n {
    static let order = ["en", "pt", "fr", "es", "de", "ar", "ja", "zh", "ru"]

    static func code() -> String {
        if let saved = UserDefaults.standard.string(forKey: "blackout-language"), order.contains(saved) { return saved }
        let device = String((Locale.preferredLanguages.first ?? "en").prefix(2)).lowercased()
        return order.contains(device) ? device : "en"
    }

    static func locale(_ code: String = code()) -> Locale {
        switch code {
        case "pt": Locale(identifier: "pt_PT")
        case "fr": Locale(identifier: "fr_FR")
        case "es": Locale(identifier: "es_ES")
        case "de": Locale(identifier: "de_DE")
        case "ar": Locale(identifier: "ar")
        case "ja": Locale(identifier: "ja_JP")
        case "zh": Locale(identifier: "zh_Hans")
        case "ru": Locale(identifier: "ru_RU")
        default: Locale(identifier: "en")
        }
    }

    static func direction(_ code: String) -> LayoutDirection {
        code == "ar" ? .rightToLeft : .leftToRight
    }

    static func systemFont(_ code: String) -> Bool {
        code == "ar" || code == "ja" || code == "zh"
    }

    static func nativeName(_ code: String) -> String {
        switch code {
        case "pt": "Português"
        case "fr": "Français"
        case "es": "Español"
        case "de": "Deutsch"
        case "ar": "العربية"
        case "ja": "日本語"
        case "zh": "中文"
        case "ru": "Русский"
        default: "English"
        }
    }

    static func text(_ code: String, _ key: String, _ args: [String] = []) -> String {
        let template = table(code)[key] ?? table("en")[key] ?? key
        switch args.count {
        case 0: return template
        case 1: return String(format: template, locale: locale(code), args[0])
        default: return String(format: template, locale: locale(code), args[0], args[1])
        }
    }

    static func label(_ key: String, _ code: String) -> String {
        table(code)[key] != nil || table("en")[key] != nil ? text(code, key) : key
    }

    // Route labels and water types arrive from engine.js as these keys.
    private static let engineKeys: Set<String> = [
        "fastest", "no-tolls", "no-motorways", "shortest", "alternative",
        "drinking-water", "spring", "ford", "weir", "access",
    ]

    static func known(_ value: String, _ code: String) -> String {
        engineKeys.contains(value) ? text(code, value) : value
    }

    private static let unnamedKeys = [
        "health-unnamed", "police-unnamed", "fire-unnamed", "fuel-unnamed", "supermarket-unnamed", "restaurant-unnamed",
    ]

    static func placeName(_ row: [String: Any], _ code: String) -> String {
        if let name = row["name"] as? String, !name.isEmpty { return name }
        if let category = (row["category"] as? NSNumber)?.intValue {
            return unnamedKeys.indices.contains(category) ? text(code, unnamedKeys[category]) : ""
        }
        let type = (row["typeLabel"] as? String) ?? (row["address"] as? String) ?? ""
        return engineKeys.contains(type) ? text(code, type) : ""
    }

    private static func table(_ code: String) -> [String: String] {
        switch code {
        case "pt": pt
        case "fr": fr
        case "es": es
        case "de": de
        case "ar": ar
        case "ja": ja
        case "zh": zh
        case "ru": ru
        default: en
        }
    }

    private static let en: [String: String] = [
        "search": "Search", "clear": "Clear", "recenter": "Recenter", "close": "Close",
        "on-foot": "On foot", "by-car": "By car", "by-bicycle": "By bicycle",
        "start": "Start", "directions": "Directions", "steps": "Directions", "see-route": "See route", "exit": "Exit",
        "correct": "Correct position", "cancel": "Cancel", "confirm": "Confirm",
        "name": "Name", "save": "Save", "no-pins": "No pins", "remove": "Remove", "add": "Add",
        "maps": "Maps", "import-maps": "Import maps", "legal": "Legal", "catalog-failed": "Could not load maps",
        "no-maps": "No maps", "in-use": "In use", "download": "Download", "saving-now": "Saving",
        "privacy": "Privacy policy", "terms": "Terms of use", "sensors": "Sensors",
        "base-step": "Base step", "explore": "Explore", "pins": "Pins", "settings": "Settings",
        "language": "Language", "position": "Position",
        "set-position": "Set your position here to start",
        "select-map": "Select a map to import data",
        "health": "Health", "police": "Police", "fire": "Fire", "fuel": "Fuel",
        "supermarkets": "Supermarkets", "restaurants": "Restaurants", "water": "Water",
        "fastest": "Fastest", "no-tolls": "No tolls", "no-motorways": "No motorways",
        "shortest": "Shortest", "alternative": "Alternative",
        "straight": "Continue straight", "slight-left": "Turn slightly left", "left": "Turn left",
        "sharp-left": "Turn sharply left", "slight-right": "Turn slightly right", "right": "Turn right",
        "sharp-right": "Turn sharply right", "uturn": "Make a U-turn", "roundabout": "Enter the roundabout", "arrive": "Arrive",
        "now": "Now", "meters-word": "meters",
        "now-turn": "Now, turn onto %@", "in-turn": "In %@, turn onto %@",
        "now-straight-street": "Now, continue on %@", "in-straight-street": "In %@, continue on %@",
        "in-maneuver": "In %@, %@",
        "saving": "Saving %@", "save-failed": "Could not save %@",
        "sensors-unavailable": "Sensors unavailable", "saving-addresses": "Saving addresses",
        "places": "places", "addresses": "addresses", "geo": "geo", "roads": "roads",
        "buildings": "buildings", "map": "map",
        "drinking-water": "Drinking fountain", "spring": "Spring", "ford": "Ford", "weir": "Weir", "access": "Access",
        "health-unnamed": "Health facility", "police-unnamed": "Police station", "fire-unnamed": "Fire station", "fuel-unnamed": "Fuel station", "supermarket-unnamed": "Supermarket", "restaurant-unnamed": "Restaurant",
        "privacy-body": "Blackout Maps has no account, no payment and collects no data. It does not use GPS. Sensors stay on the phone.",
        "terms-body": "Use Blackout Maps with no account and no payment. We collect no data and do not use GPS. Sensors stay on the phone.",
    ]

    private static let pt: [String: String] = [
        "search": "Pesquisar", "clear": "Limpar", "recenter": "Recentrar", "close": "Fechar",
        "on-foot": "A pé", "by-car": "De carro", "by-bicycle": "De bicicleta",
        "start": "Iniciar", "directions": "Direções", "steps": "Direções", "see-route": "Ver percurso", "exit": "Sair",
        "correct": "Corrigir posição", "cancel": "Cancelar", "confirm": "Confirmar",
        "name": "Nome", "save": "Guardar", "no-pins": "Sem pins", "remove": "Remover", "add": "Adicionar",
        "maps": "Mapas", "import-maps": "Importar mapas", "legal": "Legal", "catalog-failed": "Não foi possível carregar os mapas",
        "no-maps": "Sem mapas", "in-use": "A usar", "download": "Descarregar", "saving-now": "A guardar",
        "privacy": "Política de privacidade", "terms": "Termos de utilização", "sensors": "Sensores",
        "base-step": "Passo base", "explore": "Explorar", "pins": "Pins", "settings": "Definições",
        "language": "Idioma", "position": "Posição",
        "set-position": "Defina a sua posição aqui para começar",
        "select-map": "Selecione um mapa para importar dados",
        "health": "Saúde", "police": "Polícia", "fire": "Bombeiros", "fuel": "Gasolina",
        "supermarkets": "Supermercados", "restaurants": "Restaurantes", "water": "Água",
        "fastest": "Mais rápido", "no-tolls": "Sem portagens", "no-motorways": "Sem autoestradas",
        "shortest": "Mais curto", "alternative": "Alternativa",
        "straight": "Siga em frente", "slight-left": "Vire ligeiramente à esquerda", "left": "Vire à esquerda",
        "sharp-left": "Vire acentuadamente à esquerda", "slight-right": "Vire ligeiramente à direita", "right": "Vire à direita",
        "sharp-right": "Vire acentuadamente à direita", "uturn": "Inverta a marcha", "roundabout": "Entre na rotunda", "arrive": "Chegou",
        "now": "Agora", "meters-word": "metros",
        "now-turn": "Agora, virar para a %@", "in-turn": "A %@, virar para a %@",
        "now-straight-street": "Agora, siga em frente pela %@", "in-straight-street": "A %@, siga em frente pela %@",
        "in-maneuver": "A %@, %@",
        "saving": "A guardar %@", "save-failed": "Não foi possível guardar %@",
        "sensors-unavailable": "Sensores indisponíveis", "saving-addresses": "A guardar moradas",
        "places": "lugares", "addresses": "moradas", "geo": "geo", "roads": "estradas",
        "buildings": "edifícios", "map": "mapa",
        "drinking-water": "Bebedouro", "spring": "Fonte", "ford": "Vau", "weir": "Açude", "access": "Acesso",
        "health-unnamed": "Unidade de saúde", "police-unnamed": "Esquadra de polícia", "fire-unnamed": "Quartel de bombeiros", "fuel-unnamed": "Posto de combustível", "supermarket-unnamed": "Supermercado", "restaurant-unnamed": "Restaurante",
        "privacy-body": "O Blackout Maps não tem conta, não tem pagamento e não recolhe dados. Não usa GPS. Os sensores ficam no telemóvel.",
        "terms-body": "Usa o Blackout Maps sem conta e sem pagamento. Não recolhemos dados e não usamos GPS. Os sensores ficam no telemóvel.",
    ]

    private static let fr: [String: String] = [
        "search": "Rechercher", "clear": "Effacer", "recenter": "Recentrer", "close": "Fermer",
        "on-foot": "À pied", "by-car": "En voiture", "by-bicycle": "À vélo",
        "start": "Démarrer", "directions": "Itinéraires", "steps": "Directions", "see-route": "Voir le trajet", "exit": "Quitter",
        "correct": "Corriger la position", "cancel": "Annuler", "confirm": "Confirmer",
        "name": "Nom", "save": "Enregistrer", "no-pins": "Aucune épingle", "remove": "Retirer", "add": "Ajouter",
        "maps": "Cartes", "import-maps": "Importer des cartes", "legal": "Mentions", "catalog-failed": "Impossible de charger les cartes",
        "no-maps": "Aucune carte", "in-use": "En cours", "download": "Télécharger", "saving-now": "Enregistrement",
        "privacy": "Politique de confidentialité", "terms": "Conditions d’utilisation", "sensors": "Capteurs",
        "base-step": "Pas de base", "explore": "Explorer", "pins": "Épingles", "settings": "Réglages",
        "language": "Langue", "position": "Position",
        "set-position": "Définissez votre position ici pour commencer",
        "select-map": "Sélectionnez une carte pour importer des données",
        "health": "Santé", "police": "Police", "fire": "Pompiers", "fuel": "Carburant",
        "supermarkets": "Supermarchés", "restaurants": "Restaurants", "water": "Eau",
        "fastest": "Le plus rapide", "no-tolls": "Sans péage", "no-motorways": "Sans autoroute",
        "shortest": "Le plus court", "alternative": "Autre trajet",
        "straight": "Continuez tout droit", "slight-left": "Tournez légèrement à gauche", "left": "Tournez à gauche",
        "sharp-left": "Tournez fortement à gauche", "slight-right": "Tournez légèrement à droite", "right": "Tournez à droite",
        "sharp-right": "Tournez fortement à droite", "uturn": "Faites demi-tour", "roundabout": "Prenez le rond-point", "arrive": "Arrivée",
        "now": "Maintenant", "meters-word": "mètres",
        "now-turn": "Maintenant, tournez vers %@", "in-turn": "Dans %@, tournez vers %@",
        "now-straight-street": "Maintenant, continuez sur %@", "in-straight-street": "Dans %@, continuez sur %@",
        "in-maneuver": "Dans %@, %@",
        "saving": "Enregistrement de %@", "save-failed": "Impossible d’enregistrer %@",
        "sensors-unavailable": "Capteurs indisponibles", "saving-addresses": "Enregistrement des adresses",
        "places": "lieux", "addresses": "adresses", "geo": "géo", "roads": "routes",
        "buildings": "bâtiments", "map": "carte",
        "drinking-water": "Fontaine", "spring": "Source", "ford": "Gué", "weir": "Seuil", "access": "Accès",
        "health-unnamed": "Établissement de santé", "police-unnamed": "Poste de police", "fire-unnamed": "Caserne de pompiers", "fuel-unnamed": "Station-service", "supermarket-unnamed": "Supermarché", "restaurant-unnamed": "Restaurant",
        "privacy-body": "Blackout Maps n’a pas de compte, pas de paiement et ne collecte pas de données. Il n’utilise pas le GPS. Les capteurs restent sur le téléphone.",
        "terms-body": "Utilisez Blackout Maps sans compte et sans paiement. Nous ne collectons pas de données et n’utilisons pas le GPS. Les capteurs restent sur le téléphone.",
    ]

    private static let es: [String: String] = [
        "search": "Buscar", "clear": "Borrar", "recenter": "Recentrar", "close": "Cerrar",
        "on-foot": "A pie", "by-car": "En coche", "by-bicycle": "En bicicleta",
        "start": "Iniciar", "directions": "Rutas", "steps": "Indicaciones", "see-route": "Ver el recorrido", "exit": "Salir",
        "correct": "Corregir la posición", "cancel": "Cancelar", "confirm": "Confirmar",
        "name": "Nombre", "save": "Guardar", "no-pins": "Sin pines", "remove": "Quitar", "add": "Añadir",
        "maps": "Mapas", "import-maps": "Importar mapas", "legal": "Legal", "catalog-failed": "No se pudieron cargar los mapas",
        "no-maps": "Sin mapas", "in-use": "En uso", "download": "Descargar", "saving-now": "Guardando",
        "privacy": "Política de privacidad", "terms": "Términos de uso", "sensors": "Sensores",
        "base-step": "Paso base", "explore": "Explorar", "pins": "Pines", "settings": "Ajustes",
        "language": "Idioma", "position": "Posición",
        "set-position": "Defina su posición aquí para empezar",
        "select-map": "Seleccione un mapa para importar datos",
        "health": "Salud", "police": "Policía", "fire": "Bomberos", "fuel": "Combustible",
        "supermarkets": "Supermercados", "restaurants": "Restaurantes", "water": "Agua",
        "fastest": "Más rápido", "no-tolls": "Sin peajes", "no-motorways": "Sin autopistas",
        "shortest": "Más corto", "alternative": "Alternativa",
        "straight": "Siga recto", "slight-left": "Gire levemente a la izquierda", "left": "Gire a la izquierda",
        "sharp-left": "Gire cerrado a la izquierda", "slight-right": "Gire levemente a la derecha", "right": "Gire a la derecha",
        "sharp-right": "Gire cerrado a la derecha", "uturn": "Dé la vuelta", "roundabout": "Entre en la rotonda", "arrive": "Llegada",
        "now": "Ahora", "meters-word": "metros",
        "now-turn": "Ahora, gire hacia %@", "in-turn": "En %@, gire hacia %@",
        "now-straight-street": "Ahora, siga por %@", "in-straight-street": "En %@, siga por %@",
        "in-maneuver": "En %@, %@",
        "saving": "Guardando %@", "save-failed": "No se pudo guardar %@",
        "sensors-unavailable": "Sensores no disponibles", "saving-addresses": "Guardando direcciones",
        "places": "lugares", "addresses": "direcciones", "geo": "geo", "roads": "carreteras",
        "buildings": "edificios", "map": "mapa",
        "drinking-water": "Fuente de agua", "spring": "Manantial", "ford": "Vado", "weir": "Azud", "access": "Acceso",
        "health-unnamed": "Centro de salud", "police-unnamed": "Comisaría", "fire-unnamed": "Parque de bomberos", "fuel-unnamed": "Gasolinera", "supermarket-unnamed": "Supermercado", "restaurant-unnamed": "Restaurante",
        "privacy-body": "Blackout Maps no tiene cuenta, no tiene pago y no recoge datos. No usa GPS. Los sensores se quedan en el teléfono.",
        "terms-body": "Usa Blackout Maps sin cuenta y sin pago. No recogemos datos y no usamos GPS. Los sensores se quedan en el teléfono.",
    ]

    private static let de: [String: String] = [
        "search": "Suchen", "clear": "Löschen", "recenter": "Zentrieren", "close": "Schließen",
        "on-foot": "Zu Fuß", "by-car": "Mit dem Auto", "by-bicycle": "Mit dem Fahrrad",
        "start": "Starten", "directions": "Routen", "steps": "Wegbeschreibung", "see-route": "Route anzeigen", "exit": "Beenden",
        "correct": "Position korrigieren", "cancel": "Abbrechen", "confirm": "Bestätigen",
        "name": "Name", "save": "Sichern", "no-pins": "Keine Pins", "remove": "Entfernen", "add": "Hinzufügen",
        "maps": "Karten", "import-maps": "Karten importieren", "legal": "Rechtliches", "catalog-failed": "Karten konnten nicht geladen werden",
        "no-maps": "Keine Karten", "in-use": "In Verwendung", "download": "Laden", "saving-now": "Sichern",
        "privacy": "Datenschutz", "terms": "Nutzungsbedingungen", "sensors": "Sensoren",
        "base-step": "Schrittlänge", "explore": "Erkunden", "pins": "Pins", "settings": "Einstellungen",
        "language": "Sprache", "position": "Position",
        "set-position": "Legen Sie hier Ihre Position fest, um zu beginnen",
        "select-map": "Wählen Sie eine Karte aus, um Daten zu importieren",
        "health": "Gesundheit", "police": "Polizei", "fire": "Feuerwehr", "fuel": "Tanken",
        "supermarkets": "Supermärkte", "restaurants": "Restaurants", "water": "Wasser",
        "fastest": "Am schnellsten", "no-tolls": "Ohne Maut", "no-motorways": "Ohne Autobahn",
        "shortest": "Am kürzesten", "alternative": "Alternative",
        "straight": "Geradeaus", "slight-left": "Leicht links", "left": "Links abbiegen",
        "sharp-left": "Scharf links", "slight-right": "Leicht rechts", "right": "Rechts abbiegen",
        "sharp-right": "Scharf rechts", "uturn": "Wenden", "roundabout": "In den Kreisverkehr", "arrive": "Ankunft",
        "now": "Jetzt", "meters-word": "Meter",
        "now-turn": "Jetzt auf %@ abbiegen", "in-turn": "In %@ auf %@ abbiegen",
        "now-straight-street": "Jetzt %@ weiter", "in-straight-street": "In %@ %@ weiter",
        "in-maneuver": "In %@, %@",
        "saving": "%@ wird gesichert", "save-failed": "%@ konnte nicht gesichert werden",
        "sensors-unavailable": "Sensoren nicht verfügbar", "saving-addresses": "Adressen werden gesichert",
        "places": "Orte", "addresses": "Adressen", "geo": "Geo", "roads": "Straßen",
        "buildings": "Gebäude", "map": "Karte",
        "drinking-water": "Trinkbrunnen", "spring": "Quelle", "ford": "Furt", "weir": "Wehr", "access": "Zugang",
        "health-unnamed": "Gesundheitseinrichtung", "police-unnamed": "Polizeiwache", "fire-unnamed": "Feuerwache", "fuel-unnamed": "Tankstelle", "supermarket-unnamed": "Supermarkt", "restaurant-unnamed": "Restaurant",
        "privacy-body": "Blackout Maps hat kein Konto, keine Zahlung und sammelt keine Daten. Es nutzt kein GPS. Die Sensoren bleiben auf dem Telefon.",
        "terms-body": "Nutzen Sie Blackout Maps ohne Konto und ohne Zahlung. Wir sammeln keine Daten und nutzen kein GPS. Die Sensoren bleiben auf dem Telefon.",
    ]

    private static let ar: [String: String] = [
        "search": "بحث", "clear": "مسح", "recenter": "إعادة التمركز", "close": "إغلاق",
        "on-foot": "مشيًا", "by-car": "بالسيارة", "by-bicycle": "بالدراجة",
        "start": "ابدأ", "directions": "الاتجاهات", "steps": "الاتجاهات", "see-route": "عرض المسار", "exit": "خروج",
        "correct": "تصحيح الموقع", "cancel": "إلغاء", "confirm": "تأكيد",
        "name": "الاسم", "save": "حفظ", "no-pins": "لا علامات", "remove": "إزالة", "add": "إضافة",
        "maps": "الخرائط", "import-maps": "استيراد الخرائط", "legal": "قانوني", "catalog-failed": "تعذر تحميل الخرائط",
        "no-maps": "لا خرائط", "in-use": "قيد الاستخدام", "download": "تنزيل", "saving-now": "حفظ",
        "privacy": "سياسة الخصوصية", "terms": "شروط الاستخدام", "sensors": "المستشعرات",
        "base-step": "طول الخطوة", "explore": "استكشاف", "pins": "العلامات", "settings": "الإعدادات",
        "language": "اللغة", "position": "الموقع",
        "set-position": "حدّد موقعك هنا للبدء",
        "select-map": "اختر خريطة لاستيراد البيانات",
        "health": "صحة", "police": "شرطة", "fire": "إطفاء", "fuel": "وقود",
        "supermarkets": "متاجر", "restaurants": "مطاعم", "water": "ماء",
        "fastest": "الأسرع", "no-tolls": "بدون رسوم", "no-motorways": "بدون طرق سريعة",
        "shortest": "الأقصر", "alternative": "بديل",
        "straight": "تابع مستقيمًا", "slight-left": "انعطف يسارًا قليلًا", "left": "انعطف يسارًا",
        "sharp-left": "انعطف يسارًا بشدة", "slight-right": "انعطف يمينًا قليلًا", "right": "انعطف يمينًا",
        "sharp-right": "انعطف يمينًا بشدة", "uturn": "استدر", "roundabout": "ادخل الدوار", "arrive": "الوصول",
        "now": "الآن", "meters-word": "أمتار",
        "now-turn": "الآن، انعطف إلى %@", "in-turn": "بعد %@، انعطف إلى %@",
        "now-straight-street": "الآن، تابع عبر %@", "in-straight-street": "بعد %@، تابع عبر %@",
        "in-maneuver": "بعد %@، %@",
        "saving": "حفظ %@", "save-failed": "تعذر حفظ %@",
        "sensors-unavailable": "المستشعرات غير متاحة", "saving-addresses": "حفظ العناوين",
        "places": "أماكن", "addresses": "عناوين", "geo": "جغرافيا", "roads": "طرق",
        "buildings": "مبانٍ", "map": "خريطة",
        "drinking-water": "سبيل ماء", "spring": "نبع", "ford": "مخاضة", "weir": "سد صغير", "access": "نقطة وصول",
        "health-unnamed": "منشأة صحية", "police-unnamed": "مركز شرطة", "fire-unnamed": "محطة إطفاء", "fuel-unnamed": "محطة وقود", "supermarket-unnamed": "سوبرماركت", "restaurant-unnamed": "مطعم",
        "privacy-body": "Blackout Maps بلا حساب وبلا دفع ولا يجمع بيانات. لا يستخدم GPS. تبقى المستشعرات على الهاتف.",
        "terms-body": "استخدم Blackout Maps بلا حساب وبلا دفع. لا نجمع بيانات ولا نستخدم GPS. تبقى المستشعرات على الهاتف.",
    ]

    private static let ja: [String: String] = [
        "search": "検索", "clear": "消去", "recenter": "中央に戻す", "close": "閉じる",
        "on-foot": "徒歩", "by-car": "車", "by-bicycle": "自転車",
        "start": "開始", "directions": "経路", "steps": "経路案内", "see-route": "経路を表示", "exit": "終了",
        "correct": "位置を修正", "cancel": "キャンセル", "confirm": "確定",
        "name": "名前", "save": "保存", "no-pins": "ピンがありません", "remove": "削除", "add": "追加",
        "maps": "地図", "import-maps": "地図を読み込む", "legal": "法務", "catalog-failed": "地図を読み込めませんでした",
        "no-maps": "地図がありません", "in-use": "使用中", "download": "ダウンロード", "saving-now": "保存中",
        "privacy": "プライバシーポリシー", "terms": "利用規約", "sensors": "センサー",
        "base-step": "歩幅", "explore": "探索", "pins": "ピン", "settings": "設定",
        "language": "言語", "position": "位置",
        "set-position": "始めるにはここで位置を決めてください",
        "select-map": "データを取り込む地図を選択",
        "health": "医療", "police": "警察", "fire": "消防", "fuel": "燃料",
        "supermarkets": "スーパー", "restaurants": "飲食", "water": "水",
        "fastest": "最速", "no-tolls": "有料道路なし", "no-motorways": "高速道路なし",
        "shortest": "最短", "alternative": "別ルート",
        "straight": "直進", "slight-left": "やや左へ", "left": "左折",
        "sharp-left": "大きく左折", "slight-right": "やや右へ", "right": "右折",
        "sharp-right": "大きく右折", "uturn": "転回", "roundabout": "環状交差点に入る", "arrive": "到着",
        "now": "今", "meters-word": "メートル",
        "now-turn": "今、%@へ曲がる", "in-turn": "%@先、%@へ曲がる",
        "now-straight-street": "今、%@を直進", "in-straight-street": "%@先、%@を直進",
        "in-maneuver": "%@先、%@",
        "saving": "%@を保存中", "save-failed": "%@を保存できませんでした",
        "sensors-unavailable": "センサーを利用できません", "saving-addresses": "住所を保存中",
        "places": "場所", "addresses": "住所", "geo": "地理", "roads": "道路",
        "buildings": "建物", "map": "地図",
        "drinking-water": "水飲み場", "spring": "泉", "ford": "浅瀬", "weir": "堰", "access": "取水口",
        "health-unnamed": "医療施設", "police-unnamed": "警察署", "fire-unnamed": "消防署", "fuel-unnamed": "ガソリンスタンド", "supermarket-unnamed": "スーパーマーケット", "restaurant-unnamed": "レストラン",
        "privacy-body": "Blackout Maps にはアカウントも支払いもなく、データも集めません。GPS は使いません。センサーは端末内に残ります。",
        "terms-body": "Blackout Maps はアカウントなし、支払いなしで使います。データは集めず、GPS は使いません。センサーは端末内に残ります。",
    ]

    private static let zh: [String: String] = [
        "search": "搜索", "clear": "清除", "recenter": "回到中心", "close": "关闭",
        "on-foot": "步行", "by-car": "驾车", "by-bicycle": "骑行",
        "start": "开始", "directions": "路线", "steps": "路线指引", "see-route": "查看路线", "exit": "退出",
        "correct": "校正位置", "cancel": "取消", "confirm": "确认",
        "name": "名称", "save": "保存", "no-pins": "没有标记", "remove": "删除", "add": "添加",
        "maps": "地图", "import-maps": "导入地图", "legal": "法律", "catalog-failed": "无法加载地图",
        "no-maps": "没有地图", "in-use": "使用中", "download": "下载", "saving-now": "保存中",
        "privacy": "隐私政策", "terms": "使用条款", "sensors": "传感器",
        "base-step": "步长", "explore": "探索", "pins": "标记", "settings": "设置",
        "language": "语言", "position": "位置",
        "set-position": "在这里设定位置以便开始",
        "select-map": "选择地图以导入数据",
        "health": "医疗", "police": "警察", "fire": "消防", "fuel": "燃油",
        "supermarkets": "超市", "restaurants": "餐饮", "water": "水",
        "fastest": "最快", "no-tolls": "无收费路", "no-motorways": "无高速",
        "shortest": "最短", "alternative": "备选",
        "straight": "直行", "slight-left": "稍向左转", "left": "左转",
        "sharp-left": "急左转", "slight-right": "稍向右转", "right": "右转",
        "sharp-right": "急右转", "uturn": "掉头", "roundabout": "进入环岛", "arrive": "到达",
        "now": "现在", "meters-word": "米",
        "now-turn": "现在转入%@", "in-turn": "%@后转入%@",
        "now-straight-street": "现在沿%@直行", "in-straight-street": "%@后沿%@直行",
        "in-maneuver": "%@后，%@",
        "saving": "正在保存%@", "save-failed": "无法保存%@",
        "sensors-unavailable": "传感器不可用", "saving-addresses": "正在保存地址",
        "places": "地点", "addresses": "地址", "geo": "地理", "roads": "道路",
        "buildings": "建筑", "map": "地图",
        "drinking-water": "饮水处", "spring": "泉", "ford": "涉水处", "weir": "堰", "access": "取水点",
        "health-unnamed": "医疗机构", "police-unnamed": "派出所", "fire-unnamed": "消防站", "fuel-unnamed": "加油站", "supermarket-unnamed": "超市", "restaurant-unnamed": "餐厅",
        "privacy-body": "Blackout Maps 没有账户，没有付款，也不收集数据。不使用 GPS。传感器留在手机上。",
        "terms-body": "使用 Blackout Maps 无需账户、无需付款。我们不收集数据，也不使用 GPS。传感器留在手机上。",
    ]

    private static let ru: [String: String] = [
        "search": "Поиск", "clear": "Очистить", "recenter": "К центру", "close": "Закрыть",
        "on-foot": "Пешком", "by-car": "На машине", "by-bicycle": "На велосипеде",
        "start": "Начать", "directions": "Маршруты", "steps": "Указания", "see-route": "Показать маршрут", "exit": "Выйти",
        "correct": "Исправить положение", "cancel": "Отмена", "confirm": "Подтвердить",
        "name": "Имя", "save": "Сохранить", "no-pins": "Нет меток", "remove": "Удалить", "add": "Добавить",
        "maps": "Карты", "import-maps": "Импорт карт", "legal": "Правовое", "catalog-failed": "Не удалось загрузить карты",
        "no-maps": "Нет карт", "in-use": "Используется", "download": "Скачать", "saving-now": "Сохранение",
        "privacy": "Политика конфиденциальности", "terms": "Условия использования", "sensors": "Датчики",
        "base-step": "Длина шага", "explore": "Обзор", "pins": "Метки", "settings": "Настройки",
        "language": "Язык", "position": "Положение",
        "set-position": "Задайте здесь своё положение, чтобы начать",
        "select-map": "Выберите карту, чтобы импортировать данные",
        "health": "Здоровье", "police": "Полиция", "fire": "Пожарные", "fuel": "Топливо",
        "supermarkets": "Магазины", "restaurants": "Рестораны", "water": "Вода",
        "fastest": "Быстрее", "no-tolls": "Без платных дорог", "no-motorways": "Без автомагистралей",
        "shortest": "Короче", "alternative": "Альтернатива",
        "straight": "Двигайтесь прямо", "slight-left": "Плавно налево", "left": "Налево",
        "sharp-left": "Круто налево", "slight-right": "Плавно направо", "right": "Направо",
        "sharp-right": "Круто направо", "uturn": "Разворот", "roundabout": "Въезжайте на кольцо", "arrive": "Прибытие",
        "now": "Сейчас", "meters-word": "метров",
        "now-turn": "Сейчас поверните на %@", "in-turn": "Через %@ поверните на %@",
        "now-straight-street": "Сейчас прямо по %@", "in-straight-street": "Через %@ прямо по %@",
        "in-maneuver": "Через %@, %@",
        "saving": "Сохранение %@", "save-failed": "Не удалось сохранить %@",
        "sensors-unavailable": "Датчики недоступны", "saving-addresses": "Сохранение адресов",
        "places": "места", "addresses": "адреса", "geo": "гео", "roads": "дороги",
        "buildings": "здания", "map": "карта",
        "drinking-water": "Питьевой фонтанчик", "spring": "Источник", "ford": "Брод", "weir": "Плотина", "access": "Доступ",
        "health-unnamed": "Медицинское учреждение", "police-unnamed": "Полицейский участок", "fire-unnamed": "Пожарная часть", "fuel-unnamed": "АЗС", "supermarket-unnamed": "Супермаркет", "restaurant-unnamed": "Ресторан",
        "privacy-body": "В Blackout Maps нет аккаунта, нет оплаты и нет сбора данных. GPS не используется. Датчики остаются на телефоне.",
        "terms-body": "Пользуйтесь Blackout Maps без аккаунта и без оплаты. Мы не собираем данные и не используем GPS. Датчики остаются на телефоне.",
    ]
}
