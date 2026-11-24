# Credits and licences

Blackout Maps is built on open data and open-source software. This file lists every source the apps use and the licence it comes under. If you reuse the maps, keep the attribution shown on the map.

## Map data

### OpenStreetMap

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Almost everything on the map at street level comes from OpenStreetMap:

| Data | Files | Used for |
| --- | --- | --- |
| Basemap tiles (Protomaps extract of Portugal) | `ios/BlackoutMaps/Resources/base/portugal.pmtiles`, also downloaded by the web app | Land, water, roads, paths, rail, ferries, boundaries and place labels |
| Road graph | `ios/BlackoutMaps/Resources/base/roads.bin.gz`, also downloaded by the web app | Walking, cycling and driving routes |
| Building outlines | `ios/BlackoutMaps/Resources/base/buildings.bin.gz`, also downloaded by the web app | Buildings at close zoom |
| Services | `catalog/<id>/places.bin.gz`, `website/maps/places.bin.gz` | Health, police, fire, fuel, supermarkets and restaurants |
| Water | `catalog/<id>/water.bin.gz`, `website/maps/water.bin.gz` | Drinking fountains, springs, fords, weirs and water access |
| Addresses | `catalog/<id>/addresses.bin.gz` | Address search and the nearest door |
| Places and streets | `catalog/<id>/geo.json.gz`, `website/maps/geo.json.gz` | Name search |

These files are Derivative Databases or Produced Works of OpenStreetMap under the ODbL. The data files in this repository are made available under the ODbL 1.0, not under the MIT License. Anyone who redistributes them, or a map made from them, must credit "© OpenStreetMap contributors" and keep the ODbL terms for the data.

The web app and the Android app show "© OpenStreetMap contributors", linked to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright), on the map at all times, as the [OSMF Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) ask.

### Protomaps

The basemap tiles use the [Protomaps Basemap](https://docs.protomaps.com/basemaps/downloads) layer schema and were extracted with [PMTiles](https://github.com/protomaps/PMTiles). Protomaps distributes the basemap as an ODbL Produced Work of OpenStreetMap, with OpenStreetMap attribution required. The [basemap build](https://github.com/protomaps/basemaps) is BSD 3-Clause. The apps credit Protomaps next to OpenStreetMap.

### Natural Earth

The world overview map (`world.pmtiles` in `website/maps/`, `android/app/src/main/assets/base/` and `ios/BlackoutMaps/Resources/`) is made with [Natural Earth](https://www.naturalearthdata.com/) v5.1.2, which is in the public domain. Attribution is not required. The apps credit it anyway.

The country outlines in `countries.geojson`, used to choose a map package, are simplified country boundaries. Their source is not recorded in this repository.

## Fonts

| Font | Where | Licence |
| --- | --- | --- |
| [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) | Map labels (`glyphs/Noto Sans Regular/*.pbf`) in all three apps | [SIL Open Font License 1.1](https://openfontlicense.org/) |
| [IBM Plex Sans and IBM Plex Mono](https://www.ibm.com/plex/) | Website pages, loaded from Google Fonts | [SIL Open Font License 1.1](https://openfontlicense.org/) |

## Icons

The category icons (health, police, fire, fuel, supermarkets, restaurants, water) and the interface icons are drawn in this repository: inline SVG in the web app, `CategoryBitmaps.kt` on Android and `CategoryArt.swift` on iOS. They are covered by the MIT License.

## Software

### Web app (`website/maps/`)

| Library | Version | Licence |
| --- | --- | --- |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | 6.19.0 (vendored in `website/maps/vendor/`) | [BSD 3-Clause](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt) |
| [PMTiles JS](https://github.com/protomaps/PMTiles) | vendored in `website/maps/vendor/pmtiles.js` | [BSD 3-Clause](https://github.com/protomaps/PMTiles/blob/main/LICENSE) |

### Android app (`android/`)

| Library | Version | Licence |
| --- | --- | --- |
| [MapLibre Native for Android](https://github.com/maplibre/maplibre-native) | 11.11.0 | [BSD 2-Clause](https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md) |
| [Javet](https://github.com/caoccao/Javet) (bundles the V8 JavaScript engine) | 4.1.2 | [Apache 2.0](https://github.com/caoccao/Javet/blob/main/LICENSE); V8 is [BSD 3-Clause](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/LICENSE) |
| [Jetpack Compose](https://developer.android.com/jetpack/compose) (UI, Material 3, Material Icons Extended) | BOM 2024.10.01 | Apache 2.0 |
| AndroidX Activity Compose, Lifecycle, Core KTX | 1.9.3, 2.8.7, 1.15.0 | Apache 2.0 |
| [Kotlin](https://kotlinlang.org/) and [kotlinx.coroutines](https://github.com/Kotlin/kotlinx.coroutines) | 2.0.21, 1.9.0 | Apache 2.0 |

### iOS app (`ios/`)

| Library | Version | Licence |
| --- | --- | --- |
| [MapLibre Native for iOS](https://github.com/maplibre/maplibre-gl-native-distribution) | 6.31.0 | [BSD 2-Clause](https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md) |

### Website server (`website/api/`)

| Library | Version | Licence |
| --- | --- | --- |
| [stripe-node](https://github.com/stripe/stripe-node) | 23.0.0 | MIT |

The website is hosted on [Vercel](https://vercel.com). Map packages are downloaded from GitHub.

## Content that is not open

The MIT License covers the source code in this repository. It does not cover:

- **Guides.** The paid guide PDFs are not in this repository and must never be committed. The guide text and images (`website/guides/`, `website/images/covers/`, `website/images/previews/`, `website/images/cover-*.png`, `website/og/`) are © Blackout Maps, all rights reserved.
- **Product photos** (`website/images/guide-*.jpg`, `website/images/supplies/`). They belong to their manufacturers or sellers.
- **Videos.** The videos on the website are YouTube embeds owned by their creators.
- **Map data.** See [OpenStreetMap](#openstreetmap) above: the data is ODbL.
- **The Blackout Maps name and logo.**
