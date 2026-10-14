'use strict';
const fs = require('fs');

// Calls onLine(buf, start, end) for every line of a byte stream, without
// decoding whole lines to strings. Awaits `afterChunk` between chunks so the
// caller can flush output with backpressure. onLine may return false to stop.
async function forEachLine(stream, onLine, afterChunk) {
  let carry = null;
  for await (let chunk of stream) {
    if (carry) {
      chunk = Buffer.concat([carry, chunk]);
      carry = null;
    }
    let start = 0;
    let nl;
    while ((nl = chunk.indexOf(10, start)) !== -1) {
      if (onLine(chunk, start, nl) === false) {
        if (afterChunk) await afterChunk();
        return;
      }
      start = nl + 1;
    }
    if (start < chunk.length) carry = chunk.subarray(start);
    if (afterChunk) await afterChunk();
  }
  if (carry && carry.length) onLine(carry, 0, carry.length);
  if (afterChunk) await afterChunk();
}

function stdinStream() {
  return fs.createReadStream(null, { fd: 0, highWaterMark: 1 << 20 });
}

// Buffered writer for a file of uint32 records ("baskets": [n, id1..idn]).
class U32Writer {
  constructor(file) {
    this.fd = fs.openSync(file, 'w');
    this.buf = new Uint32Array(1 << 20);
    this.len = 0;
  }

  push(v) {
    if (this.len === this.buf.length) this.flush();
    this.buf[this.len++] = v;
  }

  flush() {
    const bytes = new Uint8Array(this.buf.buffer, 0, this.len * 4);
    for (let off = 0; off < bytes.length; ) off += fs.writeSync(this.fd, bytes, off);
    this.len = 0;
  }

  close() {
    this.flush();
    fs.closeSync(this.fd);
  }
}

// Calls cb(buf, offset, n) for every basket in a file written by U32Writer.
// The ids are buf[offset .. offset + n); buf is reused between calls.
function forEachBasket(file, cb) {
  const fd = fs.openSync(file, 'r');
  const buf = new Uint32Array(1 << 22);
  const bytes = new Uint8Array(buf.buffer);
  let filled = 0;
  let pos = 0;
  for (;;) {
    // Read until the buffer is full or EOF, so `filled` stays whole uint32s.
    let read = 0;
    const want = (buf.length - filled) * 4;
    for (let r; read < want && (r = fs.readSync(fd, bytes, filled * 4 + read, want - read, pos)) > 0; ) {
      read += r;
      pos += r;
    }
    if (read % 4) throw new Error(`${file}: size is not a multiple of 4`);
    filled += read / 4;
    let i = 0;
    while (i < filled) {
      const n = buf[i];
      if (i + 1 + n > filled) break;
      cb(buf, i + 1, n);
      i += 1 + n;
    }
    if (read === 0) {
      if (i !== filled) throw new Error(`${file}: truncated basket file`);
      break;
    }
    buf.copyWithin(0, i, filled);
    filled -= i;
  }
  fs.closeSync(fd);
}

module.exports = { forEachLine, stdinStream, U32Writer, forEachBasket };
