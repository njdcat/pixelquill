import { expect, test } from "vitest";
import { clientToSprite, fitTransform, spriteToClient, zoomAt } from "../../src/render/transform";

test("clientToSprite inverts spriteToClient including canvas offset", () => {
  const transform = { zoom: 7.5, panX: -40, panY: 90 };
  const client = spriteToClient(transform, 12.25, -3.5, 23, 51);
  expect(clientToSprite(transform, client.x, client.y, 23, 51)).toEqual({ x: 12.25, y: -3.5 });
});
test.each([0.01, 0.5, 2, 200])("zoomAt preserves the anchor for factor %s including clamping", factor => {
  const t = { zoom: 4, panX: 50, panY: -20 }, anchor = { x: 140, y: 230 };
  const before = clientToSprite(t, anchor.x, anchor.y), after = zoomAt(t, factor, anchor.x, anchor.y);
  const mapped = clientToSprite(after, anchor.x, anchor.y);
  expect(mapped.x).toBeCloseTo(before.x); expect(mapped.y).toBeCloseTo(before.y);
  expect(after.zoom).toBeGreaterThanOrEqual(1); expect(after.zoom).toBeLessThanOrEqual(64);
});
test("fit centers the sprite and caps zoom", () => {
  expect(fitTransform(1000, 800, 10, 10)).toEqual({ zoom: 64, panX: 180, panY: 80 });
  expect(fitTransform(32, 32, 64, 64)).toEqual({ zoom: 1, panX: -16, panY: -16 });
});
test.each([0, -1, Infinity, NaN])("ignores invalid zoom factor %s", factor => {
  const t = { zoom: 4, panX: 0, panY: 0 };
  expect(zoomAt(t, factor, 4, 5)).toEqual(t);
});
