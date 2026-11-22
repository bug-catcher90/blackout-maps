# Catalog

Add a country or a state the same way Portugal is added. The app has no separate list. It reads the JSON files in this folder on GitHub, then downloads the data files those JSON files point at.

## Where to put it

`<id>` is the country or state, lowercase, with hyphens. Portugal is `portugal`. A state uses its own id, such as `us-california`.

- `catalog/<id>.json` sits in this folder, next to `portugal.json`. The app does not look inside subfolders for JSON.
- `catalog/<id>/` holds the data files. Portugal’s files are in `catalog/portugal/`.

Each file you commit stays under 100 MB. That is the gzip, not the unpacked size.

## The JSON

`catalog/portugal.json` is the reference. A new place uses the same fields. Set `autoload` to `false`. Only Portugal uses `true`, so only Portugal downloads on first launch. Every other place downloads after the user chooses it.

```json
{
  "id": "portugal",
  "name": "Portugal",
  "flag": "🇵🇹",
  "autoload": true,
  "files": [
    {
      "key": "places",
      "url": "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/portugal/places.bin.gz",
      "file": "places.bin",
      "gzip": true,
      "bytes": 2167140,
      "label": "lugares"
    },
    {
      "key": "water",
      "url": "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/portugal/water.bin.gz",
      "file": "water.bin",
      "gzip": true,
      "bytes": 909560,
      "label": "água"
    },
    {
      "key": "addresses",
      "url": "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/portugal/addresses.bin.gz",
      "file": "addresses.bin",
      "gzip": true,
      "bytes": 48597530,
      "label": "moradas"
    },
    {
      "key": "geo",
      "url": "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/portugal/geo.json.gz",
      "file": "geo.json",
      "gzip": true,
      "bytes": null,
      "label": "geo"
    }
  ]
}
```

`id` matches the folder name. `name` is the label in the list. `flag` is the emoji beside it. Both `name` and `flag` are required.

`files` has one entry per data file, in this order: `places`, `water`, `addresses`, `geo`.

- `key` is one of those four names. Those are the keys the app opens.
- `url` is the raw file on `main`: `https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/<id>/<gzip-name>`.
- `file` is the name after unpacking.
- `gzip` is `true`.
- `bytes` is the unpacked size. The download is rejected when it does not match. Use `null` only when the size is not checked. Portugal does that for `geo`.
- `label` is `lugares`, `água`, `moradas`, or `geo`, as in Portugal. The app translates those four words.

## The data files

Put these four gzip files in `catalog/<id>/`. Same names, same formats as `catalog/portugal/`.

`places.bin.gz` unpacks to `places.bin`. Format `POI1`, version 1, little-endian. One record per service: category, name, address, latitude, longitude. Categories are `0` health, `1` police, `2` fire, `3` fuel, `4` supermarkets, `5` restaurants. Portugal’s unpacked size is 2167140.

`water.bin.gz` unpacks to `water.bin`. Format `WTR1`, version 1, little-endian. Each record is a named point or line. Types are `0` drinking fountain, `1` spring, `2` ford, `3` weir, `4` access. Portugal’s unpacked size is 909560.

`addresses.bin.gz` unpacks to `addresses.bin`. Format `ADR1`, little-endian. Cities, street names, door numbers, postcodes, and a coordinate for each door. Portugal’s unpacked size is 48597530.

`geo.json.gz` unpacks to `geo.json`. One JSON object with two arrays. `p` is places, each `[name, latitude, longitude, rank]`. `s` is streets, each `[name, latitude, longitude]`. Latitude and longitude are decimal degrees. Portugal leaves `bytes` null.

## The grids

Two grids are required. A country missing either one is not ready, and the app does not list it.

The water grid is inside `water.bin.gz`. The header stores `lat0`, `lon0`, `latN`, `lonN` and `step`, and the cell index after the records must cover every water record in that country. Do not reuse Portugal’s box. Each record still carries its own latitude and longitude. If those coordinates are missing, there is no water grid.

The nearest-door grid comes from `addresses.bin.gz`. Every door record is 18 bytes and includes a latitude and a longitude. Those coordinates are the grid. A file with street names and no door coordinates is not ready. Name search still uses the street and city strings in the same file.

## On GitHub

Commit these files, and only these files, for a new place:

- `catalog/<id>.json`
- `catalog/<id>/places.bin.gz`
- `catalog/<id>/water.bin.gz`
- `catalog/<id>/addresses.bin.gz`
- `catalog/<id>/geo.json.gz`

`catalog/<id>.json` must list `water` and `addresses` in `files`, with the same fields as Portugal. Push the JSON and the folder to `main`. The app reads `https://api.github.com/repos/bug-catcher90/blackout-maps/contents/catalog`, keeps each `*.json` that has a name, a flag, a water file and an addresses file, and ignores this README and the data folders.

When that JSON and its files are on GitHub, Settings shows the flag and the name. The user downloads the place from that list. Portugal is already downloaded on first launch.
