import { inflateSync } from "node:zlib";

// Bound decoded PNG memory independently of the existing 10 MiB upload limit.
const MAX_PNG_RASTER_BYTES = 32 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc(bytes) {
  let value = 0xffffffff;
  for (const b of bytes) value = crcTable[(value ^ b) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
const ascii = (b, at, text) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

export function isTherapistPhotoContent(bytes, contentType) {
  try {
    if (contentType === "image/png") return validPng(bytes);
    if (contentType === "image/jpeg") return validJpeg(bytes);
    if (contentType === "image/webp") return validWebp(bytes);
    return false;
  } catch { return false; }
}

function validPng(b) {
  if (![137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8, header, palette = false, ended = false, dataEnded = false, hasData = false;
  const compressed = new Uint8Array(b.length);
  let compressedLength = 0;
  while (at + 12 <= b.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > b.length || crc(b.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) return false;
    const type = String.fromCharCode(...b.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (!header && type !== "IHDR")) return false;
    if (type === "IHDR") {
      if (header || length !== 13) return false;
      header = b.subarray(at + 8, end - 4);
    } else if (type === "PLTE") {
      if (palette || hasData || length === 0 || length > 768 || length % 3) return false;
      palette = true;
    } else if (type === "IDAT") {
      if (dataEnded) return false;
      hasData = true;
      compressed.set(b.subarray(at + 8, end - 4), compressedLength);
      compressedLength += length;
    } else if (type === "IEND") {
      if (length !== 0 || end !== b.length || !compressedLength) return false;
      ended = true;
      break;
    } else {
      // Unknown critical chunks cannot be decoded safely.
      if (type[0] === type[0].toUpperCase()) return false;
      if (hasData) dataEnded = true;
    }
    at = end;
  }
  if (!ended || !header) return false;
  const h = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = h.getUint32(0), height = h.getUint32(4), depth = header[8], color = header[9];
  const depths = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
  if (!width || !height || !depths[color]?.includes(depth) || header[10] || header[11] || header[12] > 1 || (color === 3 && !palette)) return false;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const passes = header[12] ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows = passes.map(([x,y,dx,dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx));
    const count = w ? Math.max(0, Math.ceil((height - y) / dy)) : 0;
    return { count, size: 1 + Math.ceil(w * channels * depth / 8) };
  });
  const expected = rows.reduce((sum, r) => sum + r.count * r.size, 0);
  if (expected > MAX_PNG_RASTER_BYTES) return false;
  const result = inflateSync(compressed.subarray(0, compressedLength), { maxOutputLength: expected + 1, info: true });
  const raster = result.buffer;
  if (raster.length !== expected || result.engine.bytesWritten !== compressedLength) return false;
  let offset = 0;
  for (const { count, size } of rows) {
    for (let row = 0; row < count; row++, offset += size) if (raster[offset] > 4) return false;
  }
  return true;
}

// JPEG/WebP checks identify their container and required image frame. They do
// not replace a full pixel decoder, virus scanner, or image re-encoder.
function validJpeg(b) {
  if (b[0] !== 255 || b[1] !== 216 || b[b.length - 2] !== 255 || b[b.length - 1] !== 217) return false;
  let at = 2, frame = false;
  while (at + 4 <= b.length) {
    if (b[at++] !== 255) return false;
    while (b[at] === 255) at++;
    const marker = b[at++];
    const length = (b[at] << 8) | b[at + 1];
    if (length < 2 || at + length > b.length) return false;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (length < 11 || !(b[at + 3] || b[at + 4]) || !(b[at + 5] || b[at + 6])) return false;
      frame = true;
    }
    if (marker === 0xda) return frame && at + length < b.length - 2;
    at += length;
  }
  return false;
}

function validWebp(b) {
  if (!ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP") || b.length < 20) return false;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (view.getUint32(4, true) + 8 !== b.length) return false;
  return validWebpChunks(b, 12, b.length, true);
}

function validWebpChunks(b, at, limit, allowAnimation) {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let frame = false;
  while (at + 8 <= limit) {
    const size = view.getUint32(at + 4, true), end = at + 8 + size;
    if (end > limit) return false;
    if (ascii(b, at, "VP8 ")) frame ||= size >= 10 && ascii(b, at + 11, "\x9d\x01\x2a");
    if (ascii(b, at, "VP8L")) frame ||= size >= 5 && b[at + 8] === 0x2f;
    if (ascii(b, at, "ANMF")) {
      if (!allowAnimation || size < 16 || !validWebpChunks(b, at + 24, end, false)) return false;
      frame = true;
    }
    at = end + (size & 1);
  }
  return at === limit && frame;
}
