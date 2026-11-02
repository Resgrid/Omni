// PNG and ICO encoders for the brand asset generator. resvg renders RGBA; these write the exact channel layout each
// platform wants (opaque RGB for store icons, RGBA where transparency is part of the format).
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE = { 3: 2, 4: 6 }; // channels -> PNG colour type (2 = RGB, 6 = RGBA)

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Per-row adaptive filtering (minimum sum of absolute differences), as libpng's default heuristic.
function filterRows(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= channels ? row[i - channels] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= channels ? prev[i - channels] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const value = (row[i] - predictor) & 0xff;
        candidate[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        out[y * (stride + 1)] = filter;
        candidate.copy(out, y * (stride + 1) + 1);
      }
    }
  }
  return out;
}

/**
 * @param {{ width: number, height: number, rgba: Buffer, channels?: 3 | 4 }} image  rgba: straight (unpremultiplied) RGBA
 * @returns {Buffer}
 */
export function encodePng({ width, height, rgba, channels = 4 }) {
  let raw = rgba;
  if (channels === 3) {
    raw = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      raw[j] = rgba[i];
      raw[j + 1] = rgba[i + 1];
      raw[j + 2] = rgba[i + 2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = COLOR_TYPE[channels];
  const data = zlib.deflateSync(filterRows(raw, width, height, channels), { level: 9 });
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', data), chunk('IEND', Buffer.alloc(0))]);
}

// 32-bit BMP (DIB) entry: bottom-up BGRA plus the 1-bit AND mask. Used below 256 px, where some consumers (NSIS
// installer icons, older shell code) do not accept PNG-compressed entries.
function dibEntry({ width, height, rgba }) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8); // XOR + AND masks
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = ((height - 1 - y) * width + x) * 4;
      pixels[dst] = rgba[src + 2];
      pixels[dst + 1] = rgba[src + 1];
      pixels[dst + 2] = rgba[src];
      pixels[dst + 3] = rgba[src + 3];
    }
  }
  const maskStride = Math.ceil(width / 32) * 4;
  const mask = Buffer.alloc(maskStride * height); // all zero: the alpha channel decides
  header.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([header, pixels, mask]);
}

/**
 * Windows .ico with one entry per image: PNG-compressed at 256 px, 32-bit DIB below.
 * @param {{ width: number, height: number, rgba: Buffer }[]} images
 */
export function encodeIco(images) {
  const sorted = [...images].sort((a, b) => a.width - b.width);
  const payloads = sorted.map((image) => (image.width >= 256 ? encodePng({ ...image, channels: 4 }) : dibEntry(image)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(sorted.length, 4);
  const directory = Buffer.alloc(16 * sorted.length);
  let offset = 6 + directory.length;
  sorted.forEach((image, index) => {
    const entry = index * 16;
    directory[entry] = image.width >= 256 ? 0 : image.width;
    directory[entry + 1] = image.height >= 256 ? 0 : image.height;
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(payloads[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += payloads[index].length;
  });
  return Buffer.concat([header, directory, ...payloads]);
}
