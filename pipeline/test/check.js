#!/usr/bin/env node
// Checks output on the fake dump: related lists should stay inside the
// subreddit's own topic cluster and should not be dominated by defaults.
//   node test/check.js out
'use strict';
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'out';
const related = {};
for (const f of fs.readdirSync(out)) {
  if (f.endsWith('.json') && f !== 'meta.json') {
    Object.assign(related, JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')));
  }
}

const cluster = (name) => name.match(/^topic(\d+)_/i)?.[1];
let lists = 0;
let inCluster = 0;
let total = 0;
let defaults = 0;
for (const [sub, list] of Object.entries(related)) {
  const c = cluster(sub);
  if (c === undefined) continue;
  lists++;
  for (const r of list.slice(0, 10)) {
    total++;
    if (cluster(r) === c) inCluster++;
    else if (!/^topic/i.test(r)) defaults++;
  }
}

const pct = (x) => `${((100 * x) / total).toFixed(1)}%`;
console.log(`${lists} topic subreddits with lists`);
console.log(`top-10 in same cluster: ${pct(inCluster)}, defaults: ${pct(defaults)}`);
const profiles = Object.keys(related).filter((s) => s.startsWith('u_')).length;
const bots = Object.values(related).flat().filter((s) => s.startsWith('u_')).length;
if (lists < 400 || inCluster / total < 0.9 || profiles || bots) {
  console.log('FAIL');
  process.exit(1);
}
console.log('OK');
