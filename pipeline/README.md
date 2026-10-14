# pipeline

Builds "related subreddits" lists from one month of Reddit comments, small
enough to ship in (or serve to) a browser extension. Runs on a laptop.

Inspired by [anvaka/sayit](https://github.com/anvaka/sayit), which uses
shared commenters (Jaccard similarity). This uses a weighted cosine instead.

## How it works

Two subreddits are related if the same people comment in both.

- A user who commented in `n` subreddits gets weight `w = 1 / log2(n + 1)`,
  so someone active in 400 subreddits counts ~0.12 and someone active in one
  counts 1.0. Users above `--max-subs` (almost all bots) are skipped.
- `C[a][b]` = sum of `w` over users in both, `D[a]` = sum of `w` over users in `a`.
- `sim(a, b) = C[a][b] / sqrt(D[a] * D[b])`. The square root corrects for huge
  subreddits without favouring same-sized ones the way Jaccard does.
- Pairs with fewer than `--min-overlap` shared users are dropped as noise.

## Requirements

`node` (18+), `zstd`, GNU `sort`. No npm dependencies.

## Data

Monthly comment dumps (`RC_YYYY-MM.zst`) from
[Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift/releases).
Only the comments file is needed. It is streamed and never decompressed to
disk; after extraction it can be deleted.

## Usage

```sh
./run.sh --limit 20000000 RC_2026-09.zst   # quick test on the first 20M comments
./run.sh RC_2026-09.zst                    # full month
node query.js linux AsahiLinux             # inspect results
```

`run.sh` keeps the extracted pairs in `pipeline/work/pairs*.tsv.zst`, so re-running
with different options skips extraction:

```sh
./run.sh RC_2026-09.zst -- --min-overlap 3 --top 30 --scores
```

`similarity.js` options:

| option | default | |
|---|---|---|
| `--top` | 20 | related subreddits per subreddit |
| `--min-commenters` | 10 | subreddits with fewer commenters get no list |
| `--min-overlap` | 2 | minimum shared commenters for a pair |
| `--max-subs` | 1000 | skip users active in more subreddits than this |
| `--shards` | 32 | more shards = less RAM, more passes |
| `--max-gb` | 4 | RAM cap for the pair table per shard |
| `--keep-profiles` | off | keep `u_*` user profile subreddits |
| `--scores` | off | also write `out/scores/` with scores and overlaps |

If a shard exceeds `--max-gb` the run stops and asks for more shards.
`SORT_MEM` (default `2G`) sets the memory used by `sort`.

## Output

`out/<first char>.json` (a-z, 0-9, `_`), each an object from lowercase
subreddit name to related subreddits, best first:

```json
{ "linux": ["linuxquestions", "archlinux", "linux4noobs", "..."] }
```

`out/meta.json` records the parameters and counts.

## Resources

On an M1 Pro, synthetic tests ran at:

- extract: ~700k comments/s
- similarity: ~650M pair updates in 80 s, 1.1 GB RAM with 32 shards

Disk: the dump itself, plus a few GB for `sort` temp files and the pairs file.

## Tests

```sh
node test/fake-dump.js | zstd --long=31 -q -o test/fake.zst
./run.sh --work /tmp/w --out /tmp/o test/fake.zst -- --shards 4
node test/check.js /tmp/o
```
