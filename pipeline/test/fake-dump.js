#!/usr/bin/env node
// Writes a synthetic comment dump (NDJSON) to stdout for testing the pipeline.
// 30 topic clusters of 15 subreddits each, a few huge "default" subreddits
// everyone visits, generalist users, bots and deleted accounts.
//   node test/fake-dump.js | zstd --long=31 -q -o test/fake.zst
'use strict';

const CLUSTERS = 30;
const PER_CLUSTER = 15;
const USERS = 40000;
const DEFAULTS = ['AskReddit', 'pics', 'funny', 'worldnews', 'memes'];

let seed = 42;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
// Zipf-ish: low indexes (big subreddits of the cluster) are picked more.
const zipf = (n) => Math.floor(n * rand() ** 2);

const clusters = [];
for (let c = 0; c < CLUSTERS; c++) {
  clusters.push(Array.from({ length: PER_CLUSTER }, (_, s) => `topic${c}_sub${s}`));
}
const all = clusters.flat();

const lines = [];
function comment(author, subreddit) {
  lines.push(
    JSON.stringify({
      author,
      author_flair_text: null,
      body: 'quoted "author":"someone" and "subreddit":"elsewhere" text',
      created_utc: 1756684800 + lines.length,
      id: lines.length.toString(36),
      score: 1,
      subreddit,
      subreddit_id: 't5_x',
    })
  );
}

for (let u = 0; u < USERS; u++) {
  const name = `user${u}`;
  if (rand() < 0.01) {
    // Generalist: comments all over the place.
    for (let i = 0; i < 300; i++) comment(name, pick(all));
    continue;
  }
  const home = clusters[Math.floor(rand() * CLUSTERS)];
  const n = 1 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) comment(name, home[zipf(PER_CLUSTER)]);
  if (rand() < 0.6) comment(name, pick(DEFAULTS));
  if (rand() < 0.1) comment(name, pick(all)); // stray interest
  if (rand() < 0.05) comment(name, `u_${name}`); // profile post
}
for (const sub of all) comment('AutoModerator', sub);
for (let i = 0; i < 2000; i++) comment('[deleted]', pick(all));

// Dumps are ordered by time, not by user.
for (let i = lines.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [lines[i], lines[j]] = [lines[j], lines[i]];
}
process.stdout.write(lines.join('\n') + '\n');
