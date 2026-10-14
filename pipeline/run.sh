#!/usr/bin/env bash
# Full pipeline: comment dump -> sorted unique (author, subreddit) pairs ->
# related-subreddit JSON files.
#
#   ./run.sh RC_2026-09.zst                  # full month
#   ./run.sh --limit 20000000 RC_2026-09.zst # quick test on the first 20M comments
#   ./run.sh RC_2026-09.zst -- --shards 32   # extra args go to similarity.js
#
# The pairs file is kept in the work dir, so re-running with different
# similarity options skips the slow extraction. Delete it to re-extract.
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)"
limit=""
work="$dir/work"
out="$dir/out"
sort_mem="${SORT_MEM:-2G}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit) limit="$2"; shift 2 ;;
    --work) work="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --) shift; break ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) dump="$1"; shift ;;
  esac
done
[[ -n "${dump:-}" ]] || { echo "usage: $0 [--limit N] [--work DIR] [--out DIR] DUMP.zst [-- similarity args]" >&2; exit 2; }

mkdir -p "$work/sort-tmp"
pairs="$work/pairs${limit:+-$limit}.tsv.zst"

if [[ -f "$pairs" ]]; then
  echo "reusing $pairs"
else
  echo "extracting pairs from $dump"
  set +eo pipefail
  zstd -dcq --long=31 "$dump" \
    | node "$dir/extract.js" ${limit:+--limit "$limit"} \
    | LC_ALL=C sort -u -S "$sort_mem" -T "$work/sort-tmp" --parallel=4 --compress-program=zstd \
    | zstd -q -f -T0 -3 -o "$pairs.part"
  status=("${PIPESTATUS[@]}")
  set -eo pipefail
  # With --limit, zstd is killed by SIGPIPE (141) when extract stops early.
  unzip_ok=$([[ "${status[0]}" -eq 0 || (-n "$limit" && "${status[0]}" -eq 141) ]] && echo 1 || echo 0)
  if [[ "$unzip_ok" -ne 1 || "${status[1]}" -ne 0 || "${status[2]}" -ne 0 || "${status[3]}" -ne 0 ]]; then
    echo "extraction failed (exit codes: ${status[*]})" >&2
    rm -f "$pairs.part"
    exit 1
  fi
  mv "$pairs.part" "$pairs"
fi

zstd -dcq "$pairs" | node "$dir/similarity.js" --tmp "$work" --out "$out" "$@"
