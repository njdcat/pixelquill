import type { Rect } from "../contracts";
import { dimensions, inside, rectangle } from "./validation";

/** Set operations mutate this mask and return it for chaining. */
export class SelectionMask {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
  constructor(width: number, height: number) {
    dimensions(width, height);
    this.width = width; this.height = height;
    this.bits = new Uint8Array(width * height);
  }
  static rect(w: number, h: number, r: Rect): SelectionMask {
    rectangle(r);
    const mask = new SelectionMask(w, h);
    for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) {
      mask.bits.fill(1, y * w + Math.min(w, Math.max(0, r.x)),
        y * w + Math.min(w, Math.max(0, r.x + r.w)));
    }
    return mask;
  }
  contains(x: number, y: number): boolean {
    return inside(x, y, this.width, this.height) && this.bits[y * this.width + x] === 1;
  }
  bounds(): Rect | null {
    let left = this.width, top = this.height, right = -1, bottom = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.contains(x, y)) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }
  clone(): SelectionMask {
    const copy = new SelectionMask(this.width, this.height);
    copy.bits.set(this.bits);
    return copy;
  }
  private combine(other: SelectionMask, op: (a: boolean, b: boolean) => boolean): this {
    if (this.width !== other.width || this.height !== other.height) {
      throw new RangeError("Selection dimensions must match");
    }
    for (let i = 0; i < this.bits.length; i++) this.bits[i] = Number(op(this.bits[i] === 1, other.bits[i] === 1));
    return this;
  }
  union(other: SelectionMask): this { return this.combine(other, (a, b) => a || b); }
  subtract(other: SelectionMask): this { return this.combine(other, (a, b) => a && !b); }
  intersect(other: SelectionMask): this { return this.combine(other, (a, b) => a && b); }
  invert(): this {
    for (let i = 0; i < this.bits.length; i++) this.bits[i] = Number(this.bits[i] !== 1);
    return this;
  }
  isEmpty(): boolean { return !this.bits.some(b => b === 1); }
}
