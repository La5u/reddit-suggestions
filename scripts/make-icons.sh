#!/usr/bin/env bash
# Renders icons/icon-{16,32,48,128}.png: two overlapping circles (shared
# audience) with the overlap filled, on orange. Small sizes get thicker
# strokes so the shape survives downscaling.
set -euo pipefail
cd "$(dirname "$0")/.."

svg() { # $1 = ring width, $2 = ring radius, $3 = horizontal offset of each centre
  local l=$((64 - $3)) r=$((64 + $3))
  cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><clipPath id="left"><circle cx="$l" cy="64" r="$2"/></clipPath></defs>
  <rect width="128" height="128" rx="28" fill="#ff4500"/>
  <circle cx="$r" cy="64" r="$2" fill="#fff" clip-path="url(#left)"/>
  <g fill="none" stroke="#fff" stroke-width="$1">
    <circle cx="$l" cy="64" r="$2"/>
    <circle cx="$r" cy="64" r="$2"/>
  </g>
</svg>
SVG
}

for spec in "16 14 33 19" "32 11 32 18" "48 10 32 18" "128 9 32 18"; do
  read -r size width radius offset <<< "$spec"
  svg "$width" "$radius" "$offset" > /tmp/icon-$size.svg
  magick -background none -density 384 /tmp/icon-$size.svg -resize "${size}x${size}" -strip "icons/icon-$size.png"
  rm /tmp/icon-$size.svg
done
ls -l icons
