#!/usr/bin/env node
// Prints related subreddits from an output dir, with scores if available.
//   node query.js [--out DIR] linux AsahiLinux
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string', default: 'out' } },
  allowPositionals: true,
});

function load(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

for (const arg of positionals) {
  const name = arg.replace(/^\/?r\//, '').toLowerCase();
  const k = /[a-z0-9]/.test(name[0]) ? name[0] : '_';
  const scores = load(path.join(opts.out, 'scores', `${k}.json`))[name];
  const related = load(path.join(opts.out, `${k}.json`))[name];
  console.log(`r/${arg}`);
  if (scores) {
    for (const [sub, score, overlap] of scores) {
      console.log(`  ${score.toFixed(4)}  ${String(overlap).padStart(6)}  r/${sub}`);
    }
  } else if (related) {
    for (const sub of related) console.log(`  r/${sub}`);
  } else {
    console.log('  (not found)');
  }
}
