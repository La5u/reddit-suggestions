#!/usr/bin/env node
// Converts subreddit-related output into the extension's data files.
//   node scripts/import-data.js ../subreddit-related/out
//
// Writes data/00.txt .. data/ff.txt: 256 shards picked by a hash of the
// lowercase subreddit name, so each lookup loads one ~100 KB file. Each line
// is "name<TAB>Related1 Related2 ...", searched as text instead of parsed.
'use strict';
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'meta.json'))) {
  console.error('usage: import-data.js SUBREDDIT_RELATED_OUT_DIR');
  process.exit(1);
}
const dest = path.join(__dirname, '..', 'data');

// FNV-1a, must match shardOf() in background.js.
function shardOf(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return (h >>> 0) & 255;
}

const shards = Array.from({ length: 256 }, () => []);
let subs = 0;
for (const f of fs.readdirSync(src)) {
  if (!/^[a-z0-9_]\.json$/.test(f)) continue;
  const data = JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
  for (const [name, related] of Object.entries(data)) {
    shards[shardOf(name)].push(`${name}\t${related.join(' ')}`);
    subs++;
  }
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest);
shards.forEach((lines, i) => {
  fs.writeFileSync(path.join(dest, `${i.toString(16).padStart(2, '0')}.txt`), lines.join('\n') + '\n');
});
const meta = JSON.parse(fs.readFileSync(path.join(src, 'meta.json'), 'utf8'));
fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify({ created: meta.created, subreddits: subs }));

const bytes = fs.readdirSync(dest).reduce((n, f) => n + fs.statSync(path.join(dest, f)).size, 0);
console.log(`imported ${subs} subreddits into 256 shards, ${(bytes / 1e6).toFixed(1)} MB`);
