// Generates app icons without native deps (pure Node): assets/icon.png
// (512x512) + assets/icon.ico (256 PNG-in-ICO for Windows). macOS .icns
// still needs iconutil on a Mac during signed builds (see electron-builder.yml).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(dir, { recursive: true });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Slack-aubergine tile with a white "T" speech mark.
function draw(size) {
  const rgb = Buffer.alloc(size * size * 3);
  const px = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 3;
    rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px(x, y, 0x4a, 0x15, 0x4b);
  // Rounded corners (transparent-ish: paint dark backing is fine for ICO/PNG use).
  const t0 = Math.floor(size * 0.28), t1 = Math.floor(size * 0.72);
  const barH = Math.floor(size * 0.16), stemW = Math.floor(size * 0.16);
  const cy = Math.floor(size * 0.32);
  for (let y = cy; y < cy + barH; y++) for (let x = t0; x < t1; x++) px(x, y, 255, 255, 255);
  const sx = Math.floor((size - stemW) / 2);
  for (let y = cy; y < Math.floor(size * 0.74); y++) for (let x = sx; x < sx + stemW; x++) px(x, y, 255, 255, 255);
  // Speech tail.
  for (let i = 0; i < Math.floor(size * 0.12); i++) {
    for (let x = sx; x < sx + stemW - Math.floor(i * 0.7); x++) px(x, Math.floor(size * 0.74) + i, 255, 255, 255);
  }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png512 = draw(512);
writeFileSync(join(dir, 'icon.png'), png512);

// ICO: single 256x256 PNG-compressed entry (Vista+).
const png256 = draw(256);
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // 0 means 256
entry[1] = 0;
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png256.length, 8);
entry.writeUInt32LE(6 + 16, 12);
writeFileSync(join(dir, 'icon.ico'), Buffer.concat([head, entry, png256]));
console.log('icons written:', join(dir, 'icon.png'), join(dir, 'icon.ico'));
