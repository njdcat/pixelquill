import { expect, test } from "vitest";
import { addFrame, addLayer, createSprite, EditorDocument, imageLayers, linkCels, PixelImage, rgba, setCel } from "../../src/doc/index";
import { deserializeSprite, serializeSprite } from "../../src/io/storage";

function fixture() {
  const doc = new EditorDocument(createSprite(8, 12));
  const image = new PixelImage(2, 3); image.data.set([rgba(1, 2, 3), 0, rgba(4, 5, 6, 128), 0, 0, rgba(7, 8, 9)]);
  doc.execute(setCel(1, 0, { image, x: -1, y: 4 }));
  doc.execute(addFrame(1, 0)); doc.execute(linkCels(1, [0, 1]));
  doc.execute(addLayer(0, 1, { kind: "group", name: "Ink", opacity: 127, locked: true, expanded: false }));
  doc.execute(addLayer(2, 0, { name: "Highlights", visible: false, blendMode: "screen", isBackground: true }));
  doc.execute(setCel(3, 1, { image: image.clone(), x: 2, y: 1 }));
  doc.sprite.tags.push({ name: "Idle", from: 0, to: 1, direction: "pingpong", repeat: 2, color: rgba(10, 20, 30) });
  doc.sprite.preserved.push({ frame: 1, type: 0xabcd, bytes: new Uint8Array([0, 9, 255]) });
  const cel = imageLayers(doc.sprite)[0]?.cels.get(0);
  if (!cel) throw new Error("Missing fixture cel");
  cel.data.opacity = 128; cel.data.zIndex = -2;
  return doc.sprite;
}
test("structured-clone round trip preserves all model fields and parent pointers", () => {
  const sprite = fixture(), snapshot = serializeSprite(sprite), restored = deserializeSprite(structuredClone(snapshot));
  expect({ ...serializeSprite(restored), savedAt: 0 }).toEqual({ ...snapshot, savedAt: 0 });
  const group = restored.root.children[1];
  expect(group?.parent).toBe(restored.root);
  if (group?.kind !== "group") throw new Error("Missing restored group");
  expect(group.children[0]?.parent).toBe(group); expect(restored.root.parent).toBeNull();
});
test("linked cels retain shared identity; independent equal images remain independent", () => {
  const restored = deserializeSprite(serializeSprite(fixture())), [first, second] = imageLayers(restored);
  expect(first?.cels.get(0)?.data).toBe(first?.cels.get(1)?.data);
  expect(first?.cels.get(0)?.data).not.toBe(second?.cels.get(1)?.data);
});
test("serialization and deserialization own their pixel and preserved buffers", () => {
  const sprite = fixture(), snapshot = serializeSprite(sprite), restored = deserializeSprite(snapshot);
  const first = imageLayers(sprite)[0]?.cels.get(0)?.data.image;
  if (!first) throw new Error("Missing image");
  first.fill(0); expect(snapshot.root.celData[0]?.pixels[0]).toBe(rgba(1, 2, 3));
  snapshot.root.celData[0]?.pixels.fill(0);
  expect(imageLayers(restored)[0]?.cels.get(0)?.data.image.get(0, 0)).toBe(rgba(1, 2, 3));
  snapshot.preserved[0]?.bytes.fill(0); expect(restored.preserved[0]?.bytes).toEqual(new Uint8Array([0, 9, 255]));
});
test("round trips an empty sprite", () => {
  const sprite = deserializeSprite(serializeSprite(createSprite(64, 64)));
  expect(sprite.width).toBe(64); expect(imageLayers(sprite)[0]?.cels.size).toBe(0);
});
test.each([null, undefined, [], 0, "sprite", {}, { schema: 0 }, { schema: "1" }])("rejects bad input %j", value => {
  expect(() => deserializeSprite(value)).toThrow(/autosave/i);
});
test("rejects newer schema with an actionable message", () => {
  expect(() => deserializeSprite({ schema: 2 })).toThrow(/newer Pixelquill.*Update/);
});
test.each([
  ["width", 0], ["height", 2049], ["colorMode", "indexed"], ["frames", []], ["frames", [{ duration: 0 }]],
  ["nextLayerId", 1], ["palette", { colors: [-1] }], ["tags", [{ name: "bad", from: 0, to: 99 }]],
  ["preserved", [{ frame: 0, type: 1, bytes: [1, 2] }]], ["savedAt", NaN],
])("rejects invalid %s", (key, value) => {
  expect(() => deserializeSprite({ ...serializeSprite(fixture()), [key]: value })).toThrow(/Invalid autosave/);
});
test("rejects duplicate layer ids, invalid cel indices, and malformed pixel buffers", () => {
  const a = serializeSprite(fixture());
  if (a.root.children?.[0]) a.root.children[0].id = 0;
  expect(() => deserializeSprite(a)).toThrow(/layer id/);
  const b = serializeSprite(fixture());
  const cel = b.root.children?.[0]?.cels?.[0]; if (cel) cel.data = 99;
  expect(() => deserializeSprite(b)).toThrow(/cel data index/);
  const c = serializeSprite(fixture()); if (c.root.celData[0]) c.root.celData[0].pixels = new Uint32Array(1);
  expect(() => deserializeSprite(c)).toThrow(/cel pixels/);
});
test("rejects cyclic layer trees before recursion exhausts the stack", () => {
  const snapshot = serializeSprite(fixture()); snapshot.root.children?.push(snapshot.root);
  expect(() => deserializeSprite(snapshot)).toThrow(/layer id/);
});
