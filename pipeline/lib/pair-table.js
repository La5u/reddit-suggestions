'use strict';

// Open-addressing hash table from (a, b) uint32 pairs to a summed weight and
// a raw count. Uses typed arrays (20 bytes per slot) because V8 Maps cap out
// at ~16M entries and cost several times more memory per entry.
class PairTable {
  constructor(maxBytes, initialCapacity = 1 << 20) {
    this.maxBytes = maxBytes;
    this.alloc(initialCapacity);
  }

  alloc(capacity) {
    // While growing, the old table (half this size) is still alive.
    if (capacity * 1.5 * PairTable.BYTES_PER_SLOT > this.maxBytes) {
      throw new Error(
        `pair table needs more than ${(this.maxBytes / 2 ** 30).toFixed(1)} GB, ` +
          'raise --shards (or --max-gb)'
      );
    }
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.size = 0;
    this.keyA = new Uint32Array(capacity); // a + 1, 0 = empty slot
    this.keyB = new Uint32Array(capacity);
    this.weight = new Float64Array(capacity);
    this.count = new Uint32Array(capacity);
  }

  // Index of the slot holding (ka, b), or of the empty slot where it belongs.
  slot(ka, b) {
    let h = Math.imul(ka ^ Math.imul(b, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h = (h ^ (h >>> 16)) & this.mask;
    for (;;) {
      const cur = this.keyA[h];
      if (cur === 0 || (cur === ka && this.keyB[h] === b)) return h;
      h = (h + 1) & this.mask;
    }
  }

  add(a, b, w) {
    const ka = a + 1;
    const h = this.slot(ka, b);
    if (this.keyA[h] !== 0) {
      this.weight[h] += w;
      this.count[h]++;
      return;
    }
    this.keyA[h] = ka;
    this.keyB[h] = b;
    this.weight[h] = w;
    this.count[h] = 1;
    if (++this.size > this.capacity * 0.7) this.grow();
  }

  grow() {
    const { keyA, keyB, weight, count, capacity, size } = this;
    this.alloc(capacity * 2);
    for (let i = 0; i < capacity; i++) {
      if (keyA[i] === 0) continue;
      const h = this.slot(keyA[i], keyB[i]);
      this.keyA[h] = keyA[i];
      this.keyB[h] = keyB[i];
      this.weight[h] = weight[i];
      this.count[h] = count[i];
    }
    this.size = size;
  }

  // Calls cb(a, b, weight, count) for every stored pair.
  forEach(cb) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.keyA[i] !== 0) cb(this.keyA[i] - 1, this.keyB[i], this.weight[i], this.count[i]);
    }
  }
}

PairTable.BYTES_PER_SLOT = 20;

module.exports = { PairTable };
