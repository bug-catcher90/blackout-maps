# Contributing

Contributions are welcome, especially new countries and refreshed map data.

## Report a problem with the map data

Wrong or missing places almost always come from OpenStreetMap. Fix them at [openstreetmap.org](https://www.openstreetmap.org/fixthemap) so everyone benefits, then open an issue here asking for the package to be rebuilt.

## Add a country or a region

Map packages live in a separate repository, [bug-catcher90/blackout-maps-data](https://github.com/bug-catcher90/blackout-maps-data), so this one stays small to clone and deploy. Its [CONTRIBUTING.md](https://github.com/bug-catcher90/blackout-maps-data/blob/main/CONTRIBUTING.md) explains how to build a package, [SPEC.md](https://github.com/bug-catcher90/blackout-maps-data/blob/main/SPEC.md) is the specification and [AGENTS.md](https://github.com/bug-catcher90/blackout-maps-data/blob/main/AGENTS.md) has instructions for coding agents.

In short: every package has seven layers (basemap, roads, buildings, places/POIs, water, addresses and search), split into parts of 45 MB or less, with roads plus buildings under 450 MB so they fit in a phone's memory. GitHub Actions in the data repository rejects a package missing any layer. Once a package is merged there, the web app, Android and iOS list and download it from the data repository's `catalog/index.json`, with no change in this repository.

## Code changes

Open a pull request with a short description. For anything visible, include a screenshot of the web app and, where it applies, of Android or iOS, taken at phone width in light and dark mode.

Changes to the data formats or the readers in `website/maps/` (`places.js`, `water.js`, `addresses.js`, `route.js`, `buildings.js`, `search.js`) must also go into `ios/BlackoutMaps/Resources/engine.js`, which Android and iOS run. The "Check readers against the map packages" workflow opens a real package from the data repository with your readers. After a format change, run `scripts/sync-readers.sh` in [blackout-maps-data](https://github.com/bug-catcher90/blackout-maps-data) and rebuild the packages there.

Never commit secrets, signing keys or the paid guide PDFs.
