// Looks up related subreddits in the bundled data. Data is split into 256
// shards (data/00.txt .. data/ff.txt) by a hash of the lowercase name; each
// line is "name<TAB>Related1 Related2 ...". A lookup loads one ~100 KB shard
// and finds the line with a string search, without parsing the whole file.

const CACHE_SIZE = 8;
const cache = new Map(); // shard -> Promise<string>, oldest first

// FNV-1a, must match shardOf() in scripts/import-data.js.
function shardOf(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return (h >>> 0) & 255;
}

function load(shard) {
  let text = cache.get(shard);
  if (text) {
    cache.delete(shard);
  } else {
    const file = `data/${shard.toString(16).padStart(2, '0')}.txt`;
    text = fetch(chrome.runtime.getURL(file))
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => '\n' + t) // so every line, including the first, starts with \n
      .catch(() => '');
  }
  cache.set(shard, text);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return text;
}

async function related(name) {
  const text = await load(shardOf(name));
  const start = text.indexOf(`\n${name}\t`);
  if (start === -1) return [];
  const from = start + name.length + 2;
  const end = text.indexOf('\n', from);
  return text.slice(from, end === -1 ? undefined : end).split(' ');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'related' || typeof msg.sub !== 'string' || !msg.sub) return;
  related(msg.sub.toLowerCase()).then(sendResponse);
  return true; // keep the channel open for the async response
});
