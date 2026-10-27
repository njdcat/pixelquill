import { describe, expect, test } from "vitest";
import {
  addFrame, addLayer, addTag, allLayers, celCountForData, createSprite, findLayer, getCel,
  History, imageLayers, linkCels, moveFrame, moveLayer, PixelImage, removeFrame, removeLayer,
  removeTag, rgba, setCel, setFrameDuration, setLayerProps, setPalette, setTag, unlinkCel,
} from "../../src/doc/index";
import type { Command, ImageLayer, Sprite, Tag } from "../../src/doc/index";
import { snapshot } from "./helpers";

function image(c = rgba(10, 20, 30), w = 2, h = 2): PixelImage {
  const result = new PixelImage(w, h); result.fill(c); return result;
}
function first(sprite: Sprite): ImageLayer {
  const layer = imageLayers(sprite)[0];
  if (!layer) throw new Error("Fixture needs an image layer");
  return layer;
}
function fixture(): Sprite {
  const sprite = createSprite(8, 8);
  setCel(1, 0, { image: image(), x: -1, y: 2 }).do(sprite);
  addFrame(1, 0, true).do(sprite); addFrame(2, 0).do(sprite);
  addTag({ name: "Walk", from: 0, to: 1, direction: "forward", repeat: 0, color: rgba(4, 5, 6) }).do(sprite);
  addLayer(0, 1, { kind: "group", name: "Group" }).do(sprite);
  addLayer(2, 0, { name: "Top" }).do(sprite);
  sprite.preserved.push({ frame: 1, type: 0x9001, bytes: new Uint8Array([8, 9, 10]) });
  return sprite;
}
const tag: Tag = { name: "Jump", from: 1, to: 2, direction: "pingpong", repeat: 2, color: rgba(1, 2, 3) };
const cases: [string, () => Command][] = [
  ["add image layer", () => addLayer(2, 1, { name: "New", isBackground: true, opacity: 90 })],
  ["add group layer", () => addLayer(0, 0, { kind: "group", expanded: false })],
  ["remove image layer", () => removeLayer(1)],
  ["remove subtree", () => removeLayer(2)],
  ["move between parents", () => moveLayer(1, 2, 0)],
  ["move within parent", () => moveLayer(2, 0, 0)],
  ["set layer properties", () => setLayerProps(1, { name: "Changed", visible: false, locked: true, opacity: 55, blendMode: "multiply" })],
  ["add blank frame", () => addFrame(1)],
  ["add copied frame", () => addFrame(0, 1)],
  ["add linked frame", () => addFrame(2, 0, true)],
  ["remove frame", () => removeFrame(1)],
  ["move frame forwards", () => moveFrame(0, 2)],
  ["move frame backwards", () => moveFrame(2, 0)],
  ["set frame duration", () => setFrameDuration([0, 2, 0], 250)],
  ["link cels", () => linkCels(1, [2, 0, 1])],
  ["unlink cel", () => unlinkCel(1, 1)],
  ["set linked cel", () => setCel(1, 1, { image: image(rgba(200, 20, 50), 3, 1), x: 4, y: -2 })],
  ["create cel", () => setCel(3, 2, { image: image(), x: 0, y: 0 })],
  ["delete linked cel", () => setCel(1, 0, null)],
  ["delete absent cel", () => setCel(3, 1, null)],
  ["add tag", () => addTag(tag)],
  ["remove tag", () => removeTag(0)],
  ["set tag", () => setTag(0, { name: "Idle", from: 1, to: 2, direction: "reverse", repeat: 4, color: 0 })],
  ["set palette", () => setPalette([rgba(0, 0, 0), rgba(255, 255, 255)])],
];

describe("command reversibility", () => {
  test.each(cases)("%s does, undoes, and redoes to equal structural states", (_name, make) => {
    const sprite = fixture(), history = new History(), before = snapshot(sprite), command = make();
    const events = history.execute(sprite, command), after = snapshot(sprite);
    expect(events.length).toBeGreaterThan(0);
    expect(command.byteSize()).toBeGreaterThanOrEqual(0);
    expect(history.undo(sprite)).toEqual(events);
    expect(snapshot(sprite)).toEqual(before);
    expect(history.redo(sprite)).toEqual(events);
    expect(snapshot(sprite)).toEqual(after);
    history.undo(sprite); expect(snapshot(sprite)).toEqual(before);
  });
  test("a mixed sequence undoes and redoes without losing links or frames", () => {
    const sprite = fixture(), before = snapshot(sprite), history = new History();
    for (const cmd of [
      setCel(1, 1, { image: image(), x: 3, y: 4 }), unlinkCel(1, 0),
      addFrame(1, 2, true), setFrameDuration([1], 300), moveFrame(0, 3), removeFrame(2),
      removeLayer(2), setPalette([1, 2]),
    ]) history.execute(sprite, cmd);
    const after = snapshot(sprite);
    while (history.canUndo) history.undo(sprite);
    expect(snapshot(sprite)).toEqual(before);
    while (history.canRedo) history.redo(sprite);
    expect(snapshot(sprite)).toEqual(after);
  });
});

test("helpers traverse bottom to top, include groups, and exclude the synthetic root", () => {
  const sprite = fixture();
  expect(allLayers(sprite).map(l => l.id)).toEqual([1, 2, 3]);
  expect(imageLayers(sprite).map(l => l.id)).toEqual([1, 3]);
  expect(findLayer(sprite, 0)).toBe(sprite.root); expect(findLayer(sprite, 999)).toBeUndefined();
  expect(getCel(first(sprite), 0)).toBe(first(sprite).cels.get(0));
  expect(getCel(first(sprite), 8)).toBeUndefined();
});

test("addFrame shifts cels, extends or shifts tags, and remaps opaque chunks", () => {
  const sprite = fixture(), layer = first(sprite), source = layer.cels.get(1);
  addTag({ ...tag, from: 1, to: 2 }).do(sprite);
  addFrame(1, 0, true).do(sprite);
  expect(layer.cels.get(2)).toBe(source);
  expect(layer.cels.get(1)?.data).toBe(layer.cels.get(0)?.data);
  expect(sprite.tags.map(t => [t.from, t.to])).toEqual([[0, 2], [2, 3]]);
  expect(sprite.preserved[0]?.frame).toBe(2);
  expect(sprite.frames.map(f => f.duration)).toEqual([100, 100, 100, 100]);
});

test("copied frames own their image while linked frames share the entire CelData", () => {
  const sprite = fixture(), layer = first(sprite), original = layer.cels.get(0)?.data;
  expect(original).toBeDefined(); expect(layer.cels.get(1)?.data).toBe(original);
  expect(layer.cels.get(2)?.data).not.toBe(original);
  expect(layer.cels.get(2)?.data.image).not.toBe(original?.image);
  expect(layer.cels.get(2)?.data.image.equals(original?.image ?? image())).toBe(true);
  if (!original) throw new Error("Missing fixture data");
  expect(celCountForData(sprite, original)).toBe(2);
  const unlink = unlinkCel(1, 1); unlink.do(sprite);
  expect(layer.cels.get(1)?.data).not.toBe(original);
  expect(layer.cels.get(1)?.data.image).not.toBe(original.image);
  expect(celCountForData(sprite, original)).toBe(1);
  unlink.undo(sprite); expect(layer.cels.get(1)?.data).toBe(original);
});

test("linkCels uses the first supplied source and restores previous link topology", () => {
  const sprite = fixture(), layer = first(sprite), source = layer.cels.get(2)?.data;
  const command = linkCels(1, [2, 1, 0]); command.do(sprite);
  expect([...layer.cels.values()].every(c => c.data === source)).toBe(true);
  command.undo(sprite);
  expect(layer.cels.get(0)?.data).toBe(layer.cels.get(1)?.data);
  expect(layer.cels.get(2)?.data).not.toBe(layer.cels.get(1)?.data);
});

test("setCel edits shared data, preserves cel metadata, reports every linked dirty rectangle and image bytes", () => {
  const sprite = fixture(), layer = first(sprite), original = layer.cels.get(0)?.data;
  if (!original) throw new Error("Missing fixture data");
  original.opacity = 123; original.zIndex = -2;
  const replacement = image(rgba(0, 255, 0), 3, 1);
  const command = setCel(1, 1, { image: replacement, x: 4, y: -1 });
  const events = command.do(sprite);
  expect(layer.cels.get(0)?.data).toBe(original); expect(layer.cels.get(1)?.data).toBe(original);
  expect(original).toMatchObject({ image: replacement, x: 4, y: -1, opacity: 123, zIndex: -2 });
  expect(events).toEqual([
    { type: "pixels", layerId: 1, frame: 0, rect: { x: -1, y: -1, w: 8, h: 5 } },
    { type: "pixels", layerId: 1, frame: 1, rect: { x: -1, y: -1, w: 8, h: 5 } },
    { type: "frames" },
  ]);
  expect(command.byteSize()).toBe(16 + 12);
  command.undo(sprite);
  expect(original).toMatchObject({ x: -1, y: 2, opacity: 123, zIndex: -2 });
});

test("deleting a linked cel removes only that frame", () => {
  const sprite = fixture(), layer = first(sprite), data = layer.cels.get(0)?.data;
  const command = setCel(1, 0, null);
  expect(command.do(sprite)).toEqual([
    { type: "pixels", layerId: 1, frame: 0, rect: { x: -1, y: 2, w: 2, h: 2 } }, { type: "frames" },
  ]);
  expect(layer.cels.has(0)).toBe(false); expect(layer.cels.get(1)?.data).toBe(data);
  command.undo(sprite); expect(layer.cels.get(0)?.data).toBe(data);
});

test("removing a frame drops single-frame tags and preserves bytes on undo", () => {
  const sprite = fixture(), before = snapshot(sprite);
  addTag({ ...tag, from: 1, to: 1 }).do(sprite);
  const withTag = snapshot(sprite), command = removeFrame(1);
  command.do(sprite);
  expect(sprite.tags.map(t => [t.from, t.to])).toEqual([[0, 0]]);
  expect(sprite.preserved).toEqual([]);
  command.undo(sprite); expect(snapshot(sprite)).toEqual(withTag);
  removeTag(1).do(sprite); expect(snapshot(sprite)).toEqual(before);
});

test("moving frames remaps cel keys and encloses tag members", () => {
  const sprite = fixture(), layer = first(sprite), data = layer.cels.get(0);
  moveFrame(0, 2).do(sprite);
  expect(layer.cels.get(2)).toBe(data); expect(sprite.tags[0]).toMatchObject({ from: 0, to: 2 });
  expect(sprite.preserved[0]?.frame).toBe(0);
});

describe("command validation is atomic", () => {
  test.each([
    () => removeFrame(5), () => addFrame(-1), () => addFrame(1, 4), () => moveFrame(0, 4),
    () => setFrameDuration([0, 99], 200), () => setFrameDuration([0], 0),
    () => setLayerProps(1, { opacity: 256 }), () => removeLayer(0), () => moveLayer(0, 2, 0),
    () => moveLayer(2, 2, 0), () => moveLayer(2, 3, 0), () => addLayer(1, 0),
    () => addLayer(0, 5), () => setCel(2, 0, null), () => setCel(1, 3, null),
    () => setCel(1, 0, { image: image(), x: 0.5, y: 0 }),
    () => linkCels(1, [0]), () => linkCels(3, [0, 1]), () => unlinkCel(3, 1),
    () => setTag(0, { from: 2, to: 0 }), () => addTag({ ...tag, repeat: -1 }),
    () => removeTag(1), () => setPalette(Array<number>(257).fill(0)),
  ])("rejects invalid command without a partial mutation (%#)", make => {
    const sprite = fixture(), before = snapshot(sprite), history = new History();
    expect(() => history.execute(sprite, make())).toThrow(RangeError);
    expect(snapshot(sprite)).toEqual(before); expect(history.canUndo).toBe(false);
  });
  test("refuses to remove the last frame", () => {
    const sprite = createSprite(1, 1);
    expect(() => removeFrame(0).do(sprite)).toThrow(RangeError);
    expect(sprite.frames).toEqual([{ duration: 100 }]);
  });
  test("enforces 1000 frames and 256 actual layers (synthetic root excluded)", () => {
    const sprite = createSprite(1, 1);
    sprite.frames = Array.from({ length: 1000 }, () => ({ duration: 100 }));
    expect(() => addFrame(1000).do(sprite)).toThrow(RangeError);
    sprite.frames.pop(); addFrame(999).do(sprite); expect(sprite.frames).toHaveLength(1000);
    for (let i = 1; i < 256; i++) addLayer(0, i).do(sprite);
    expect(allLayers(sprite)).toHaveLength(256);
    expect(() => addLayer(0, 256).do(sprite)).toThrow(RangeError);
  });
  test("rejects group cycles through descendants", () => {
    const sprite = fixture(); addLayer(2, 1, { kind: "group" }).do(sprite);
    const before = snapshot(sprite);
    expect(() => moveLayer(2, 4, 0).do(sprite)).toThrow(RangeError);
    expect(snapshot(sprite)).toEqual(before);
  });
});
