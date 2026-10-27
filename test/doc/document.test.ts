import { expect, test } from "vitest";
import { createSprite, EditorDocument, History, setLayerProps } from "../../src/doc/index";
import type { DocEvent } from "../../src/contracts";
import type { DocumentLike } from "../../src/doc/index";

test("EditorDocument emits changes, tracks dirty, saves, and unsubscribes", () => {
  const sprite = createSprite(8, 8), history = new History();
  const doc: DocumentLike = new EditorDocument(sprite, history);
  const received: (readonly DocEvent[])[] = [];
  const stop = doc.subscribe(events => { received.push(events); });
  expect(doc.sprite).toBe(sprite); expect(doc.history).toBe(history); expect(doc.dirty).toBe(false);
  doc.undo(); doc.redo(); expect(doc.dirty).toBe(false); expect(received).toEqual([]);
  doc.execute(setLayerProps(1, { name: "Ink" }));
  expect(doc.dirty).toBe(true); expect(received).toEqual([[{ type: "layers" }]]);
  doc.markSaved(); expect(doc.dirty).toBe(false);
  doc.undo(); expect(doc.dirty).toBe(true);
  doc.markSaved(); doc.redo(); expect(doc.dirty).toBe(true);
  expect(received).toHaveLength(3); stop();
  doc.execute(setLayerProps(1, { name: "Paint" })); expect(received).toHaveLength(3);
});

test("replaceSprite clears history and emits sprite", () => {
  const doc = new EditorDocument(createSprite(1, 1));
  doc.execute(setLayerProps(1, { name: "Ink" })); doc.undo();
  const received: (readonly DocEvent[])[] = [];
  doc.subscribe(events => { received.push(events); });
  const replacement = createSprite(3, 4); doc.markSaved(); doc.replaceSprite(replacement);
  expect(doc.sprite).toBe(replacement); expect(doc.dirty).toBe(true);
  expect(doc.history.canUndo).toBe(false); expect(doc.history.canRedo).toBe(false);
  expect(doc.history.totalBytes).toBe(0); expect(received).toEqual([[{ type: "sprite" }]]);
});

test("failed commands emit nothing and leave dirty unchanged", () => {
  const doc = new EditorDocument(createSprite(1, 1));
  const received: (readonly DocEvent[])[] = [];
  doc.subscribe(events => { received.push(events); });
  expect(() => doc.execute(setLayerProps(99, { name: "Bad" }))).toThrow(RangeError);
  expect(doc.dirty).toBe(false); expect(received).toEqual([]);
});
