#!/usr/bin/env node
// Reads a Reddit comment dump (NDJSON) on stdin and writes one
// "author<TAB>subreddit" line per comment. Fields are located by byte search
// instead of JSON.parse, which is several times faster on large dumps.
//
//   zstd -dc --long=31 RC_2026-09.zst | node extract.js [--limit N]
'use strict';
const { parseArgs } = require('util');
const { forEachLine, stdinStream } = require('./lib/io');

const { values: opts } = parseArgs({
  options: { limit: { type: 'string' } },
});
const limit = opts.limit ? Number(opts.limit) : Infinity;

const SKIP_AUTHORS = new Set(['[deleted]', 'AutoModerator']);
const KEYS = {
  author: [Buffer.from('"author":"'), Buffer.from('"author": "')],
  subreddit: [Buffer.from('"subreddit":"'), Buffer.from('"subreddit": "')],
};

// Usernames and subreddit names are ASCII without quotes or escapes, so the
// value ends at the next '"'. Inside other string values (e.g. the comment
// body) quotes are escaped, so the key pattern cannot match there.
function field(line, keys) {
  for (const key of keys) {
    const i = line.indexOf(key);
    if (i === -1) continue;
    const s = i + key.length;
    const e = line.indexOf(34, s);
    return e === -1 ? null : line.toString('latin1', s, e);
  }
  return null;
}

let seen = 0;
let written = 0;
let out = [];

function onLine(buf, start, end) {
  if (seen++ >= limit) return false;
  const line = buf.subarray(start, end);
  const author = field(line, KEYS.author);
  const sub = field(line, KEYS.subreddit);
  if (!author || !sub || SKIP_AUTHORS.has(author)) return;
  out.push(author, '\t', sub, '\n');
  written++;
}

async function flush() {
  if (!out.length) return;
  const ok = process.stdout.write(out.join(''));
  out = [];
  if (!ok) await new Promise((r) => process.stdout.once('drain', r));
}

forEachLine(stdinStream(), onLine, flush).then(() => {
  const lines = Math.min(seen, limit);
  process.stderr.write(`extract: ${lines} comments read, ${written} pairs written\n`);
  if (lines > 0 && written === 0) {
    process.stderr.write('extract: no author/subreddit fields found, is this a comment dump?\n');
    process.exitCode = 1;
  }
  // With --limit we stop early; exit without waiting for upstream to finish.
  if (seen > limit) process.stdout.end(() => process.exit(process.exitCode || 0));
});
