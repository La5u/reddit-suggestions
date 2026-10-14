#!/usr/bin/env bash
# Builds the store zips into dist/. manifest.json works in both browsers for
# development; each zip drops the keys the other browser's store warns about:
#   firefox.zip  without background.service_worker
#   chrome.zip   without background.scripts and browser_specific_settings
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p 'require("./manifest.json").version')
files=(manifest.json background.js content.js popup.html popup.js icons data)

# build <browser> <manifest keys to delete...>
build() {
  local dir="dist/$1"
  mkdir -p "$dir" && cp -r "${files[@]}" "$dir/"
  node -e '
    const fs = require("fs"), [f, ...keys] = process.argv.slice(1), m = JSON.parse(fs.readFileSync(f));
    for (const k of keys) { const [a, b] = k.split("."); b ? delete m[a][b] : delete m[a]; }
    fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
  ' "$dir/manifest.json" "${@:2}"
  (cd "$dir" && zip -qr -X "../related-communities-$version-$1.zip" .)
  rm -rf "$dir"
}

rm -rf dist
build firefox background.service_worker
build chrome background.scripts browser_specific_settings
ls -l dist
