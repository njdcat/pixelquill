export const TRANSPARENT = 0;

/** Packed RGBA, matching ImageData bytes on little-endian hosts. */
export function rgba(r: number, g: number, b: number, a = 255): number {
  return ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
}
export function red(c: number): number { return c & 255; }
export function green(c: number): number { return c >>> 8 & 255; }
export function blue(c: number): number { return c >>> 16 & 255; }
export function alpha(c: number): number { return c >>> 24; }
export function toHex(c: number): string {
  return "#" + [red(c), green(c), blue(c), alpha(c)]
    .map(v => v.toString(16).padStart(2, "0")).join("");
}
export function fromHex(s: string): number {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$(?![\s\S])/i.test(s)) {
    throw new RangeError("Expected #rgb, #rrggbb, or #rrggbbaa");
  }
  let hex = s.slice(1);
  if (hex.length === 3) hex = [...hex].map(c => c + c).join("");
  if (hex.length === 6) hex += "ff";
  return rgba(...([0, 2, 4, 6].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as
    [number, number, number, number]));
}
