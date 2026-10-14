# Handoff

Notes for picking this project up again. Last updated 2026-10-14.

## Where things are

- Repo: https://github.com/La5u/reddit-suggestions (public, MIT).
- Version 0.1.0. `scripts/build.sh` builds `dist/*-firefox.zip` and
  `dist/*-chrome.zip` (14.9 MB each; most of it is `data/`).
- Store screenshots (1280×800): `store/screenshots/`. `2-linux.png` shows a
  Reddit ad, so leave it out if that matters.
- Data: one month of comments (September 2026), 115,146 subreddits with lists,
  20 related subreddits each (the panel shows 10, then 20 with "show more").

## Store status

- **Chrome Web Store:** uploaded. Category Social Networking, English.
  Permission justifications:
  - storage: saves on/off, collapsed and position settings.
  - host `https://*.reddit.com/*`: shows the list on Reddit pages; only reads
    the URL to know which subreddit is open.
  - No remote code, no data collected, no privacy policy needed.
- **Firefox Add-ons (AMO):** first upload failed with "réponse vide … état :
  503". That's a server error, not a validation error: the zip passes
  `addons-linter` locally with 0 errors and 0 warnings. Retry it. If it keeps
  failing, try `web-ext sign` (needs AMO API keys) or shrink the data (below).
  Category: Social et communication (optionally + Flux, nouvelles et blogs).
  License: MIT.

## Before the first Firefox release

- [ ] Gecko ID in `manifest.json` is `reddit-suggestions@lasu.dev`, a
      placeholder. It can't be changed after the first AMO upload; something
      like `reddit-suggestions@la5u.github.io` would match the GitHub account.
- [ ] Click the toolbar popup in Firefox by hand once (automation couldn't
      open it; settings were tested through storage instead).
- [ ] Check old Reddit (`old.reddit.com`). It redirects logged-out users to a
      login page, so it was never tested. The sidebar selector for it is `.side`.

## Store description (plain, no buzzwords)

Manifest/summary:

> Shows similar subreddits on every subreddit page, based on which communities share commenters.

Long description:

> Adds a list of related subreddits to the sidebar on subreddit pages. Useful for finding smaller communities on the same topic.
>
> Two subreddits count as related when a lot of the same people comment in both. The lists come from a month of public Reddit comments (September 2026) and cover about 115,000 subreddits.
>
> You can turn it off, or move the list to the bottom of the sidebar or a floating box, from the toolbar button.
>
> It doesn't use your Reddit account, and the lists are built into the extension, so it doesn't send anything anywhere.

## Ideas for later

Ordered roughly by value for effort. Anything that fetches from Reddit at
runtime breaks the "doesn't send anything anywhere" line in the description,
so prefer bundling.

1. **Similarity % next to each name.** `pipeline/run.sh … -- --scores` already
   writes scores and shared-commenter counts to `out/scores/`. Show it as
   e.g. "34% shared" (the cosine score, or overlap / commenters of the
   smaller sub). Adds roughly 2–3 MB to the data. `import-data.js` and the
   line format (`name<TAB>Rel1 Rel2 …`) would need a score per entry.
2. **Subscriber / commenter counts.** `similarity.js` already counts raw
   commenters per subreddit in pass 1 (`commenters[]`) but doesn't write them
   out; adding them to the output is a small change. Subscriber counts need
   metadata (see 4). Show as "12k commenters" in small text.
3. **Letter avatars.** A coloured circle with the first letter, colour from a
   hash of the name. No data cost, makes the list easier to scan.
4. **Real subreddit icons and descriptions.** Arctic Shift's
   `/api/subreddits/search` returns `community_icon`, `public_description`
   and `subscribers`. Fetch it once at build time for the top ~25k
   subreddits, download icons, shrink to 32×32 WebP and bundle them. Measure
   the size before committing to it; it could add tens of MB. Fetching icons
   live from Reddit instead is smaller but makes network requests.
5. **Hover card.** On hover, show description + subscribers + icon. Needs the
   metadata from 4 (bundled), or a live fetch of `/r/<name>/about.json`.
6. **Smaller package.** If size is a problem (e.g. AMO keeps failing):
   - `--min-commenters 25` to `50` roughly halves the data.
   - 15 related per subreddit instead of 20 is about 25% smaller.
   Both need a pipeline rerun (see below).
7. **Monthly refresh.** Rerun on a newer month and bump the version.

## Rebuilding the data

The dump and intermediate files were deleted to free 50 GB, so a rerun starts
from scratch:

1. Get `comments/RC_YYYY-MM.zst` from the Arctic Shift torrents
   (2026-09: https://academictorrents.com/details/98b6dbad155750c4d5f65d5923e0c2d11f46da85,
   48.4 GB, sha256 `34a7d96e…0b71`). aria2c took about 13 minutes.
   Only the comments file is needed.
2. `pipeline/run.sh RC_YYYY-MM.zst` (about 18 minutes on the M1 Pro, about
   1 GB RAM with `-- --shards 64 --max-gb 2`). It keeps
   `pipeline/work/pairs.tsv.zst` (~660 MB); keep that if you'll want to try
   different options, since reruns from it take minutes.
3. `node scripts/import-data.js pipeline/out`, then `scripts/build.sh`.

Note: the comment data comes from Arctic Shift and is Reddit's content; only
the derived lists (names of related subreddits) are shipped. Don't copy
`anvaka/sayit-data`; it has no license.

## Testing notes

- Use headless browsers only (no windows). Headless Chromium:
  `chromium-browser --headless=new --disable-features=DisableLoadExtensionCommandLineSwitch --load-extension=<dir> --remote-debugging-port=9333`
  then drive it over CDP. Headless Firefox: `--headless --remote-debugging-port 9334`
  and install the extension over WebDriver BiDi (`webExtension.install`).
- Reddit sometimes shows a "Prove your humanity" page; just retry.
- Firefox automation can't open the popup; for settings tests, append a
  test-only `postMessage` → `chrome.storage.local.set` hook to a throwaway
  copy of `content.js`. Never ship it.
