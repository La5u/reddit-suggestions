#!/usr/bin/env node
// Computes related subreddits from sorted, unique "author<TAB>subreddit"
// lines on stdin (the output of extract.js | LC_ALL=C sort -u).
//
// For a user who commented in n subreddits, w = 1 / log2(n + 1), so one
// person active everywhere counts less than one person active in a few places.
//   C[a][b] = sum of w over users in both a and b
//   D[a]    = sum of w over users in a
//   sim     = C[a][b] / sqrt(D[a] * D[b])   (weighted cosine)
//
// To bound memory, pair counts are built in shards: pass k only keeps rows
// for subreddits with id % shards == k, re-reading a compact binary copy of
// the user baskets each time.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { forEachLine, stdinStream, U32Writer, forEachBasket } = require('./lib/io');
const { PairTable } = require('./lib/pair-table');

const { values: opts } = parseArgs({
  options: {
    out: { type: 'string', default: 'out' },
    tmp: { type: 'string', default: 'work' },
    shards: { type: 'string', default: '32' },
    top: { type: 'string', default: '20' },
    'min-commenters': { type: 'string', default: '10' },
    'min-overlap': { type: 'string', default: '2' },
    'max-subs': { type: 'string', default: '1000' },
    'max-gb': { type: 'string', default: '4' },
    'keep-profiles': { type: 'boolean', default: false },
    scores: { type: 'boolean', default: false },
  },
});
const SHARDS = Number(opts.shards);
const TOP = Number(opts.top);
const MIN_COMMENTERS = Number(opts['min-commenters']);
const MIN_OVERLAP = Number(opts['min-overlap']);
const MAX_SUBS = Number(opts['max-subs']);
const MAX_BYTES = Number(opts['max-gb']) * 2 ** 30;

const log = (msg) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
const userWeight = (n) => 1 / Math.log2(n + 1);

// Pass 1: assign subreddit ids, count commenters, write raw baskets.
async function readPairs(rawFile) {
  const ids = new Map();
  const names = [];
  const commenters = [];
  const writer = new U32Writer(rawFile);
  let users = 0;
  let author = null;
  let basket = [];

  const endUser = () => {
    if (!basket.length) return;
    writer.push(basket.length);
    for (const id of basket) {
      writer.push(id);
      commenters[id]++;
    }
    users++;
    basket = [];
  };

  await forEachLine(stdinStream(), (buf, start, end) => {
    const tab = buf.indexOf(9, start);
    if (tab === -1 || tab >= end) return;
    const user = buf.toString('latin1', start, tab);
    const sub = buf.toString('latin1', tab + 1, end);
    if (user !== author) {
      endUser();
      author = user;
    }
    if (!opts['keep-profiles'] && sub.startsWith('u_')) return;
    let id = ids.get(sub);
    if (id === undefined) {
      id = names.length;
      ids.set(sub, id);
      names.push(sub);
      commenters.push(0);
    }
    basket.push(id);
  });
  endUser();
  writer.close();
  return { names, commenters, users };
}

// Pass 2: drop small subreddits and extreme users, compute D, write the
// baskets used for pair counting (renumbered to kept subreddits only).
function filterBaskets(rawFile, basketFile, commenters) {
  const remap = new Int32Array(commenters.length).fill(-1);
  const kept = [];
  commenters.forEach((c, id) => {
    if (c >= MIN_COMMENTERS) {
      remap[id] = kept.length;
      kept.push(id);
    }
  });

  const D = new Float64Array(kept.length);
  const writer = new U32Writer(basketFile);
  const scratch = new Uint32Array(1 << 20);
  let skippedUsers = 0;
  let pairBound = 0;

  forEachBasket(rawFile, (buf, off, n) => {
    let m = 0;
    for (let i = off; i < off + n; i++) {
      const id = remap[buf[i]];
      if (id !== -1) scratch[m++] = id;
    }
    if (m === 0) return;
    if (m > MAX_SUBS) {
      skippedUsers++;
      return;
    }
    const w = userWeight(m);
    for (let i = 0; i < m; i++) D[scratch[i]] += w;
    if (m < 2) return;
    writer.push(m);
    for (let i = 0; i < m; i++) writer.push(scratch[i]);
    pairBound += m * (m - 1);
  });
  writer.close();
  return { kept, D, skippedUsers, pairBound };
}

// Keeps the TOP highest-scoring neighbours per row.
class TopList {
  constructor() {
    this.ids = [];
    this.scores = [];
    this.overlaps = [];
    this.min = 0; // index of the lowest score once full
  }

  offer(id, score, overlap) {
    if (this.ids.length < TOP) {
      this.ids.push(id);
      this.scores.push(score);
      this.overlaps.push(overlap);
      if (this.ids.length === TOP) this.findMin();
      return;
    }
    if (score <= this.scores[this.min]) return;
    this.ids[this.min] = id;
    this.scores[this.min] = score;
    this.overlaps[this.min] = overlap;
    this.findMin();
  }

  findMin() {
    let m = 0;
    for (let i = 1; i < this.scores.length; i++) if (this.scores[i] < this.scores[m]) m = i;
    this.min = m;
  }

  sorted() {
    return this.ids
      .map((id, i) => ({ id, score: this.scores[i], overlap: this.overlaps[i] }))
      .sort((x, y) => y.score - x.score);
  }
}

// Pass 3: count weighted co-occurrence one shard at a time.
function computeShard(basketFile, shard, D, results) {
  const table = new PairTable(MAX_BYTES);
  const mine = new Uint32Array(MAX_SUBS);
  forEachBasket(basketFile, (buf, off, n) => {
    let m = 0;
    for (let i = off; i < off + n; i++) if (buf[i] % SHARDS === shard) mine[m++] = buf[i];
    if (m === 0) return;
    const w = userWeight(n);
    for (let i = 0; i < m; i++) {
      const a = mine[i];
      for (let j = off; j < off + n; j++) if (buf[j] !== a) table.add(a, buf[j], w);
    }
  });

  table.forEach((a, b, c, count) => {
    if (count < MIN_OVERLAP) return;
    let list = results[a];
    if (!list) list = results[a] = new TopList();
    list.offer(b, c / Math.sqrt(D[a] * D[b]), count);
  });
  return table.size;
}

function fileKey(name) {
  const c = name[0];
  return /[a-z0-9]/.test(c) ? c : '_';
}

function writeOutput(names, kept, results) {
  fs.rmSync(opts.out, { recursive: true, force: true });
  fs.mkdirSync(opts.out, { recursive: true });
  if (opts.scores) fs.mkdirSync(path.join(opts.out, 'scores'));
  const files = {};
  const scoreFiles = {};
  let subs = 0;
  results.forEach((list, a) => {
    if (!list) return;
    const key = names[kept[a]].toLowerCase();
    const k = fileKey(key);
    const top = list.sorted();
    (files[k] ||= {})[key] = top.map((r) => names[kept[r.id]]);
    if (opts.scores) {
      (scoreFiles[k] ||= {})[key] = top.map((r) => [
        names[kept[r.id]],
        Number(r.score.toFixed(5)),
        r.overlap,
      ]);
    }
    subs++;
  });
  for (const [k, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(opts.out, `${k}.json`), JSON.stringify(data));
  }
  for (const [k, data] of Object.entries(scoreFiles)) {
    fs.writeFileSync(path.join(opts.out, 'scores', `${k}.json`), JSON.stringify(data));
  }
  return subs;
}

async function main() {
  fs.mkdirSync(opts.tmp, { recursive: true });
  const rawFile = path.join(opts.tmp, 'baskets-raw.u32');
  const basketFile = path.join(opts.tmp, 'baskets.u32');

  log('pass 1: reading pairs');
  const { names, commenters, users } = await readPairs(rawFile);
  log(`  ${users} users, ${names.length} subreddits`);

  log(`pass 2: keeping subreddits with >= ${MIN_COMMENTERS} commenters`);
  const { kept, D, skippedUsers, pairBound } = filterBaskets(rawFile, basketFile, commenters);
  fs.rmSync(rawFile);
  log(`  ${kept.length} subreddits kept, ${skippedUsers} users above --max-subs skipped`);
  log(`  at most ${(pairBound / 1e6).toFixed(1)}M pair updates`);

  const results = new Array(kept.length);
  for (let s = 0; s < SHARDS; s++) {
    const entries = computeShard(basketFile, s, D, results);
    log(`pass 3: shard ${s + 1}/${SHARDS}, ${(entries / 1e6).toFixed(1)}M distinct pairs`);
  }
  fs.rmSync(basketFile);

  const subs = writeOutput(names, kept, results);
  fs.writeFileSync(
    path.join(opts.out, 'meta.json'),
    JSON.stringify(
      {
        created: new Date().toISOString(),
        users,
        subreddits: subs,
        params: { top: TOP, minCommenters: MIN_COMMENTERS, minOverlap: MIN_OVERLAP, maxSubs: MAX_SUBS },
      },
      null,
      2
    )
  );
  log(`done: related lists for ${subs} subreddits in ${opts.out}/`);
}

main().catch((err) => {
  log(`error: ${err.message}`);
  process.exit(1);
});
