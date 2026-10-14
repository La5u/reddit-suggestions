# Related Communities for Reddit

Browser extension that shows related communities on subreddit pages.
All the data ships with the extension, so it makes no network requests.

Related lists come from a separate script, subreddit-related, which
scores subreddits by their shared commenters in one month of Reddit comments.

## Install (development)

- **Firefox:** `about:debugging` → This Firefox → Load Temporary Add-on →
  pick `manifest.json`.
- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked →
  pick this directory.

Then open any subreddit, e.g. `reddit.com/r/linux`.

## How it works

- `content.js` reads the subreddit from the URL (polled every 500 ms, since
  Reddit is a single-page app; paused in background tabs) and shows a panel
  in the sidebar, or floating in the bottom-right if no sidebar is found.
- `background.js` finds the subreddit in one of 256 data shards
  (`data/00.txt` .. `data/ff.txt`, ~120 KB each, picked by a hash of the
  name). Lines are `name<TAB>Related1 Related2 ...` and are found by string
  search, so nothing is parsed. At most 8 shards (~1 MB) stay in memory.
- `popup.html` has an on/off switch and the panel position (top or bottom of
  the sidebar, or floating), stored in `chrome.storage.local`.

## Permissions

- `storage`: the on/off and position settings.
- Runs on `https://*.reddit.com/*` only. No other sites, no tabs or history
  access, and no network requests: all data ships with the extension.

## Icons

`scripts/make-icons.sh` renders `icons/` (needs ImageMagick).

## Release

`scripts/build.sh` writes `dist/related-communities-<version>-{firefox,chrome}.zip`.
`manifest.json` works in both browsers; each zip drops the background key
the other browser's store warns about. Store screenshots (1280×800) are in
`store/screenshots/`.

## Updating the data

```sh
cd ../subreddit-related && ./run.sh RC_YYYY-MM.zst
cd ../reddit-suggestions && node scripts/import-data.js ../subreddit-related/out
```
