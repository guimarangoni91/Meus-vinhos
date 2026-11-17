/**
 * Script de Geração de Ícones PWA (icon-192.png e icon-512.png)
 * Gera PNGs válidos usando apenas módulos nativos do Node.js (fs, zlib).
 *
 * Uso: node scripts/generate-icons.js (ou npm run build:icons)
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createWineIconPNG(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      const nx = x / size;
      const ny = y / size;

      // Fundo Burgundy (#6B1D2F)
      let r = 107, g = 29, b = 47, a = 255;

      // Moldura interna dourada
      const borderDist = Math.min(nx, 1 - nx, ny, 1 - ny);
      if (borderDist > 0.055 && borderDist < 0.072) {
        r = 197; g = 155; b = 72;
      }

      // Taça de vinho dourada (#F4D284)
      const dx = Math.abs(nx - 0.5);
      if (ny >= 0.20 && ny <= 0.56) {
        const t = (ny - 0.20) / 0.36;
        const halfWidth = 0.19 * Math.sin(t * Math.PI * 0.72 + 0.35);
        if (dx <= halfWidth) {
          if (Math.abs(dx - halfWidth) < 0.028 || ny < 0.228) {
            r = 244; g = 210; b = 132;
          } else if (ny > 0.35) {
            r = 158; g = 36; b = 64;
          }
        }
      }
      if (ny >= 0.55 && ny <= 0.78 && dx <= 0.022) {
        r = 244; g = 210; b = 132;
      }
      if (ny >= 0.76 && ny <= 0.80 && dx <= 0.14) {
        r = 244; g = 210; b = 132;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const rootDir = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(rootDir, 'icon-192.png'), createWineIconPNG(192));
fs.writeFileSync(path.join(rootDir, 'icon-512.png'), createWineIconPNG(512));
console.log('[build:icons] Ícones icon-192.png e icon-512.png gerados com sucesso.');
