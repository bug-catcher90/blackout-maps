# Catalog

The app builds the import list from the JSON files in this folder on GitHub. It does not keep a separate list of countries. A file that follows this format is a country or a state, and it appears in Settings with its flag and name.

## One file per place

`catalog/<id>.json`

`<id>` is the country or state, in lowercase, with hyphens. Portugal is `portugal`. A state uses its own id, such as `us-california`.

```json
{
  "id": "portugal",
  "name": "Portugal",
  "flag": "🇵🇹",
  "autoload": false,
  "files": [
    {
      "key": "places",
      "url": "https://raw.githubusercontent.com/bug-catcher90/blackout-maps/main/catalog/portugal/places.bin.gz",
      "file": "places.bin",
      "gzip": true,
      "bytes": 2167140,
      "label": "places"
    }
  ]
}
```

`name` is the label in the list. `flag` is the emoji shown beside it. Both are required. Set `autoload` to `false`. Portugal is the one file that uses `true`, so it downloads on first launch. Every other place downloads only after the user chooses it.

The data files sit in `catalog/<id>/`. Each file stays under 100 MB. The keys the app opens are `places`, `water`, `addresses` and `geo`. `gzip` is `true` when the download is compressed and `file` is the name after unpacking. `bytes` is the unpacked size, or `null` when the size is not checked. `url` points at the raw file in this repository.

The app reads `https://api.github.com/repos/bug-catcher90/blackout-maps/contents/catalog`, keeps each `*.json` file that has an id, a name and a flag, and ignores this README.
