# Contributing

Contributions are welcome, especially new countries and refreshed map data.

## Report a problem with the map data

Wrong or missing places almost always come from OpenStreetMap. Fix them at [openstreetmap.org](https://www.openstreetmap.org/fixthemap) so everyone benefits, then open an issue here asking for the package to be rebuilt.

## Add a country or a region

Every package has the same layers as the others: basemap with roads, buildings, landuse and labels; services; water; addresses; name search; and routing. [docs/country-maps.md](docs/country-maps.md) is the full specification.

You need `osmium-tool` 1.14 or newer, [`pmtiles`](https://github.com/protomaps/go-pmtiles/releases) 1.20 or newer, Node 20 or newer, `pigz`, `curl` and, for countries split into regions, Python 3 with `shapely`. A country of Portugal's size builds in about ten minutes and needs 10 GB of free disk and 8 GB of memory (swap works).

1. **Describe the package** in `scripts/maps/countries.json`:

   ```json
   { "id": "denmark", "name": "Denmark", "flag": "🇩🇰", "geofabrik": "europe/denmark" }
   ```

   `geofabrik` is the extract's path on [download.geofabrik.de](https://download.geofabrik.de/), without `-latest.osm.pbf`. For an area that is part of an extract, add `"region": "regions/<file>.geojson"` with its polygon, as Northern Ireland does. Add the country to `website/maps/countries.geojson` (property `pack`) and to `COUNTRY_VIEW` in `website/maps/app.js` and `countryFrame` in Android's `AppModel.kt`, so it can be picked on the map.

2. **Split it if it is large.** Both apps hold the road graph and buildings in memory, so a package's OpenStreetMap extract has to stay under about 420 MB. For a bigger country, add `"split": { "fromLevel": 4 }` to its entry and run:

   ```bash
   curl -L -o /tmp/denmark.osm.pbf https://download.geofabrik.de/europe/denmark-latest.osm.pbf
   python3 scripts/maps/make-regions.py denmark /tmp/denmark.osm.pbf
   ```

   This writes the region polygons to `scripts/maps/regions/denmark/` and one `countries.json` entry per region. Build the regions instead of the country.

3. **Build it.**

   ```bash
   scripts/maps/build-country.sh denmark /tmp/blackout-maps
   ```

   This downloads the extract and cuts the basemap from the newest Protomaps planet build. It builds the seven files, splits them into parts of 45 MB or less in `catalog/denmark/` (deleting what was there), writes `catalog/denmark.json` and runs the validator.

4. **Validate it.**

   ```bash
   node scripts/validate-catalog.mjs catalog/denmark.json
   ```

   It fails when services, water, addresses, search names, roads, buildings or basemap layers are missing, when a checksum or size is wrong, when a part is over 45 MB, or when roads plus buildings would not fit in a phone's memory.

5. **Try it.** Serve `website/` locally, open `/maps/`, import the package from Settings → Import maps, then check roads, buildings, services, search and a walking and a driving route on a phone-width window in light and dark mode.

6. **Open a pull request** with `scripts/maps/countries.json`, `catalog/<id>.json` and `catalog/<id>/`. Keep one package, or one country's regions, per pull request, so each push stays small. A rebuilt package replaces its parts in place; never keep old versions next to the new ones.

GitHub Actions runs the validator on every pull request that touches `catalog/`, the map scripts or the readers in `website/maps/`.

## Code changes

Open a pull request with a short description. For anything visible, include a screenshot of the web app and, where it applies, of Android or iOS, taken at phone width in light and dark mode.

Changes to the data formats or the readers in `website/maps/` must also go into `ios/BlackoutMaps/Resources/engine.js`, which Android and iOS run. Run `node scripts/validate-catalog.mjs` before pushing.

Never commit secrets, signing keys or the paid guide PDFs.
