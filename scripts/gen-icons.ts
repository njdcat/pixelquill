import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name), output = new Uint8Array(data.length + 12);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length); output.set(type, 4); output.set(data, 8);
  view.setUint32(data.length + 8, crc32(output.subarray(4, data.length + 8)));
  return output;
}
// An original sixteen-pixel quill: a stepped feather, cut highlight, and ink nib.
const grid = [
  "................", "................", "..........fff...", ".........ffff...",
  "........fffhf...", ".......fffhf....", "......fffhf.....", ".....fffhf......",
  ".....ffhf.......", ".....fhf........", ".....nf.........", "....nn..........",
  "...nn...........", "...n............", "................", "................",
];
const colors: Record<string, readonly number[]> = {
  ".": [80, 117, 100, 255], f: [250, 252, 249, 255], h: [177, 202, 185, 255], n: [25, 59, 50, 255],
};
function png(size: number, maskable: boolean): Uint8Array {
  const bytes = new Uint8Array((size * 4 + 1) * size);
  const scale = maskable ? 0.75 : 1, margin = (1 - scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x / size - margin) / scale * 16), gy = Math.floor((y / size - margin) / scale * 16);
      const key = gx >= 0 && gx < 16 && gy >= 0 && gy < 16 ? grid[gy]?.[gx] ?? "." : ".";
      const color = colors[key] ?? [80, 117, 100, 255];
      bytes.set(color, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, size); view.setUint32(4, size);
  header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(bytes)), chunk("IEND", new Uint8Array())];
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
const target = new URL("../public/icons/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const [name, size, maskable] of [
  ["apple-touch-icon.png", 180, false], ["icon-192.png", 192, false],
  ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true],
] as const) writeFileSync(new URL(name, target), png(size, maskable));
