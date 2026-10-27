import type { Rect } from "../contracts";
import { alpha } from "./color";
import { dimensions, inside, rectangle } from "./validation";

export class PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint32Array;

  constructor(width: number, height: number) {
    dimensions(width, height);
    this.width = width;
    this.height = height;
    this.data = new Uint32Array(width * height);
  }
  get(x: number, y: number): number {
    return inside(x, y, this.width, this.height) ? (this.data[y * this.width + x] ?? 0) : 0;
  }
  set(x: number, y: number, c: number): void {
    if (inside(x, y, this.width, this.height)) this.data[y * this.width + x] = c;
  }
  fill(c: number): void { this.data.fill(c); }
  clone(): PixelImage {
    const copy = new PixelImage(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }
  /** Returns the intersection; an empty intersection cannot form a valid image. */
  copy(rect: Rect): PixelImage {
    rectangle(rect);
    const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
    const w = Math.min(this.width, rect.x + rect.w) - x;
    const h = Math.min(this.height, rect.y + rect.h) - y;
    const copy = new PixelImage(w, h);
    copy.blit(this, -x, -y);
    return copy;
  }
  blit(src: PixelImage, dx: number, dy: number): void {
    if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) {
      throw new RangeError("Blit coordinates must be integers");
    }
    const x = Math.max(0, dx), y = Math.max(0, dy);
    const right = Math.min(this.width, dx + src.width);
    const bottom = Math.min(this.height, dy + src.height);
    // Snapshot self-blits so overlapping rows behave like a raw copy.
    const source = src === this ? src.data.slice() : src.data;
    for (let row = y; row < bottom && x < right; row++) {
      const start = (row - dy) * src.width + x - dx;
      this.data.set(source.subarray(start, start + right - x), row * this.width + x);
    }
  }
  contentBounds(): Rect | null {
    let left = this.width, top = this.height, right = -1, bottom = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (alpha(this.get(x, y)) === 0) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }
  isEmpty(): boolean { return !this.data.some(c => alpha(c) > 0); }
  byteSize(): number { return this.data.byteLength; }
  equals(other: PixelImage): boolean {
    return this.width === other.width && this.height === other.height &&
      this.data.every((c, i) => c === other.data[i]);
  }
}
