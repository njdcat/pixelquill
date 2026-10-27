import { MAX_SPRITE_SIZE } from "../contracts";
import type { Rect } from "../contracts";

export function integer(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in ${min}..${max}`);
  }
}
export function dimensions(width: number, height: number): void {
  integer(width, 1, MAX_SPRITE_SIZE, "width");
  integer(height, 1, MAX_SPRITE_SIZE, "height");
}
export function rectangle(rect: Rect): void {
  for (const value of [rect.x, rect.y, rect.w, rect.h]) {
    if (!Number.isSafeInteger(value)) throw new RangeError("Rectangle must have integer coordinates");
  }
  if (rect.w < 0 || rect.h < 0) throw new RangeError("Rectangle size must be nonnegative");
}
export function inside(x: number, y: number, width: number, height: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}
