import { describe, expect, test } from "vitest";
import { BLEND_MODES, MAX_SPRITE_SIZE } from "../../src/contracts";
import {
  alpha, blue, createSprite, DEFAULT_PALETTE, fromHex, green, PixelImage,
  red, rgba, SelectionMask, toHex, TRANSPARENT,
} from "../../src/doc/index";

describe("color", () => {
  test("packs RGBA into little-endian ImageData order", () => {
    const c = rgba(0x12, 0x34, 0x56, 0x78);
    expect(c).toBe(0x78563412);
    expect([red(c), green(c), blue(c), alpha(c)]).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(rgba(255, 255, 255)).toBe(0xffffffff);
    expect(TRANSPARENT).toBe(0);
  });
  test.each([
    ["#abc", "#aabbccff"], ["#A1B2C3", "#a1b2c3ff"], ["#01020304", "#01020304"],
  ])("parses %s", (input, output) => { expect(toHex(fromHex(input))).toBe(output); });
  test.each(["abc", "#ab", "#abcd", "#1234567", "#ggg", "#123456789", " #abc", "#abc\n"])(
    "rejects %j", input => { expect(() => fromHex(input)).toThrow(RangeError); },
  );
  test("exports all file IDs in order", () => {
    expect(BLEND_MODES).toEqual([
      "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
      "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue",
      "saturation", "color", "luminosity", "addition", "subtract", "divide",
    ]);
  });
});

describe("PixelImage", () => {
  test.each([0, -1, 1.5, NaN, Infinity, MAX_SPRITE_SIZE + 1])("rejects dimension %s", size => {
    expect(() => new PixelImage(size, 1)).toThrow(RangeError);
    expect(() => new PixelImage(1, size)).toThrow(RangeError);
  });
  test("validates maximum dimensions without exceeding the limit", () => {
    expect(new PixelImage(MAX_SPRITE_SIZE, 1).width).toBe(MAX_SPRITE_SIZE);
  });
  test("clips coordinate access, fills, clones, compares, and counts bytes", () => {
    const image = new PixelImage(2, 3);
    for (const [x, y] of [[-1, 0], [2, 0], [0, 3], [0.5, 1], [NaN, 0]] as const) {
      image.set(x, y, 1); expect(image.get(x, y)).toBe(0);
    }
    expect(image.isEmpty()).toBe(true);
    image.fill(rgba(2, 3, 4));
    const copy = image.clone();
    expect(copy.equals(image)).toBe(true);
    expect(copy.data).not.toBe(image.data);
    expect(image.byteSize()).toBe(24);
    copy.set(1, 2, 0);
    expect(copy.equals(image)).toBe(false);
    expect(image.equals(new PixelImage(3, 2))).toBe(false);
  });
  test("blits clip both source and destination edges and copy transparent pixels", () => {
    const source = new PixelImage(3, 2); source.data.set([1, 2, 3, 4, 0, 6]);
    const target = new PixelImage(3, 3); target.fill(99);
    target.blit(source, -1, 1);
    expect([...target.data]).toEqual([99, 99, 99, 2, 3, 99, 0, 6, 99]);
    target.blit(source, 2, -1);
    expect(target.get(2, 0)).toBe(4);
    const before = target.clone();
    target.blit(source, 10, 10); expect(target.equals(before)).toBe(true);
    expect(() => target.blit(source, 0.5, 0)).toThrow(RangeError);
  });
  test("self-blits snapshot overlapping rows", () => {
    const image = new PixelImage(2, 3); image.data.set([1, 2, 3, 4, 5, 6]);
    image.blit(image, 0, 1); expect([...image.data]).toEqual([1, 2, 1, 2, 3, 4]);
    image.blit(image, 1, 0); expect([...image.data]).toEqual([1, 1, 1, 1, 3, 3]);
  });
  test("copies clipped rectangles and rejects empty intersections", () => {
    const image = new PixelImage(3, 2); image.data.set([1, 2, 3, 4, 5, 6]);
    const copy = image.copy({ x: -1, y: 1, w: 3, h: 5 });
    expect([copy.width, copy.height, ...copy.data]).toEqual([2, 1, 4, 5]);
    expect(() => image.copy({ x: 3, y: 0, w: 1, h: 1 })).toThrow(RangeError);
    expect(() => image.copy({ x: 0, y: 0, w: 0, h: 1 })).toThrow(RangeError);
    expect(() => image.copy({ x: 0.5, y: 0, w: 1, h: 1 })).toThrow(RangeError);
  });
  test("bounds use alpha, including partially transparent pixels", () => {
    const image = new PixelImage(5, 4); image.set(0, 0, rgba(255, 0, 0, 0));
    expect(image.contentBounds()).toBeNull(); expect(image.isEmpty()).toBe(true);
    image.set(2, 1, rgba(0, 0, 0, 1)); image.set(4, 2, rgba(10, 20, 30));
    expect(image.contentBounds()).toEqual({ x: 2, y: 1, w: 3, h: 2 });
    expect(image.isEmpty()).toBe(false);
  });
});

describe("SelectionMask", () => {
  test("rectangles clip and coordinate access is bounded", () => {
    const mask = SelectionMask.rect(3, 3, { x: -1, y: 1, w: 3, h: 5 });
    expect(mask.bounds()).toEqual({ x: 0, y: 1, w: 2, h: 2 });
    expect(mask.contains(0, 1)).toBe(true);
    expect(mask.contains(-1, 1)).toBe(false); expect(mask.contains(0.5, 1)).toBe(false);
    expect(mask.clone().bits).toEqual(mask.bits); expect(mask.clone().bits).not.toBe(mask.bits);
    expect(SelectionMask.rect(3, 3, { x: -5, y: 0, w: 2, h: 3 }).isEmpty()).toBe(true);
    expect(SelectionMask.rect(3, 3, { x: 5, y: 0, w: 2, h: 3 }).isEmpty()).toBe(true);
  });
  test("union, subtraction, intersection, and inversion mutate only the target", () => {
    const a = SelectionMask.rect(3, 1, { x: 0, y: 0, w: 2, h: 1 });
    const b = SelectionMask.rect(3, 1, { x: 1, y: 0, w: 2, h: 1 });
    expect([...a.clone().union(b).bits]).toEqual([1, 1, 1]);
    expect([...a.clone().subtract(b).bits]).toEqual([1, 0, 0]);
    expect([...a.clone().intersect(b).bits]).toEqual([0, 1, 0]);
    expect([...a.clone().invert().bits]).toEqual([0, 0, 1]);
    expect([...b.bits]).toEqual([0, 1, 1]);
    const empty = new SelectionMask(2, 2);
    expect(empty.isEmpty()).toBe(true); expect(empty.bounds()).toBeNull();
    expect(empty.invert().bounds()).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });
  test("rejects invalid sizes and mismatched set operations", () => {
    expect(() => new SelectionMask(0, 1)).toThrow(RangeError);
    const a = new SelectionMask(2, 3), b = new SelectionMask(3, 2);
    expect(() => a.union(b)).toThrow(RangeError);
    expect(() => a.subtract(b)).toThrow(RangeError);
    expect(() => a.intersect(b)).toThrow(RangeError);
  });
});

describe("createSprite", () => {
  test("creates independent defaults, one frame and one image layer", () => {
    const a = createSprite(16, 24), b = createSprite(16, 24);
    expect(a.frames).toEqual([{ duration: 100 }]); expect(a.colorMode).toBe("rgba");
    expect(a.root.children).toHaveLength(1);
    expect(a.root.children[0]).toMatchObject({ kind: "image", name: "Layer 1", parent: a.root });
    expect(a.palette.colors).toHaveLength(32); expect(a.palette.colors).toEqual(DEFAULT_PALETTE);
    a.palette.colors[0] = 1; expect(a.palette.colors).not.toEqual(b.palette.colors);
    expect(a.preserved).toEqual([]); expect(a.nextLayerId).toBe(2);
  });
  test("accepts options and rejects dimensions, durations and oversized palettes", () => {
    expect(createSprite(1, 2048, { layerName: "Ink", frameDuration: 65535, palette: [1] }))
      .toMatchObject({ height: 2048, frames: [{ duration: 65535 }], palette: { colors: [1] } });
    for (const size of [0, 2049, 1.5, NaN]) expect(() => createSprite(size, 1)).toThrow(RangeError);
    for (const duration of [0, 65536, 1.5]) {
      expect(() => createSprite(1, 1, { frameDuration: duration })).toThrow(RangeError);
    }
    expect(() => createSprite(1, 1, { palette: Array<number>(257).fill(0) })).toThrow(RangeError);
  });
});
