import { describe, expect, test } from "vitest";
import { UNDO_MAX_BYTES } from "../../src/contracts";
import { createSprite, History, setLayerProps } from "../../src/doc/index";
import type { Command } from "../../src/doc/index";

/** Fixed-size command allows exact budget tests independent of object overhead. */
function widthCommand(label: string, value: number, bytes = 10): Command {
  let before = 0;
  return {
    label,
    do(sprite) { before = sprite.width; sprite.width = value; return [{ type: "sprite" }]; },
    undo(sprite) { sprite.width = before; return [{ type: "sprite" }]; },
    byteSize: () => bytes,
  };
}

describe("History", () => {
  test("empty history has no labels and undo/redo do nothing", () => {
    const sprite = createSprite(1, 1), history = new History();
    expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false);
    expect(history.undoLabel).toBeUndefined(); expect(history.redoLabel).toBeUndefined();
    expect(history.undo(sprite)).toEqual([]); expect(history.redo(sprite)).toEqual([]);
    expect(history.totalBytes).toBe(0);
  });
  test("execute, undo, redo track labels, events and both stacks' memory", () => {
    const sprite = createSprite(1, 1), history = new History();
    expect(history.execute(sprite, widthCommand("Two", 2))).toEqual([{ type: "sprite" }]);
    history.execute(sprite, widthCommand("Three", 3));
    expect(history.undoLabel).toBe("Three"); expect(history.totalBytes).toBe(20);
    expect(history.undo(sprite)).toEqual([{ type: "sprite" }]); expect(sprite.width).toBe(2);
    expect(history.undoLabel).toBe("Two"); expect(history.redoLabel).toBe("Three");
    expect(history.totalBytes).toBe(20);
    expect(history.redo(sprite)).toEqual([{ type: "sprite" }]); expect(sprite.width).toBe(3);
    history.clear(); expect(history.totalBytes).toBe(0); expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
  test("executing clears redo and releases its memory", () => {
    const sprite = createSprite(1, 1), history = new History();
    history.execute(sprite, widthCommand("Two", 2)); history.undo(sprite);
    history.execute(sprite, widthCommand("Four", 4, 7));
    expect(history.canRedo).toBe(false); expect(history.totalBytes).toBe(7);
    expect(sprite.width).toBe(4);
  });
  test("drops the oldest undo steps while preserving the newest", () => {
    const sprite = createSprite(1, 1), history = new History({ maxBytes: 20 });
    for (const value of [2, 3, 4]) history.execute(sprite, widthCommand(String(value), value));
    expect(history.totalBytes).toBe(20);
    history.undo(sprite); expect(sprite.width).toBe(3);
    history.undo(sprite); expect(sprite.width).toBe(2); expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    history.redo(sprite); history.redo(sprite); expect(sprite.width).toBe(4);
  });
  test.each([0, 2])("keeps the newest oversized command with budget %s", maxBytes => {
    const sprite = createSprite(1, 1), history = new History({ maxBytes });
    history.execute(sprite, widthCommand("Two", 2)); history.execute(sprite, widthCommand("Three", 3, 30));
    expect(history.totalBytes).toBe(30); expect(history.undoLabel).toBe("Three");
    history.undo(sprite); expect(sprite.width).toBe(2); expect(history.canUndo).toBe(false);
  });
  test("default budget is 256 MiB", () => {
    const sprite = createSprite(1, 1), history = new History();
    history.execute(sprite, widthCommand("One", 2, UNDO_MAX_BYTES));
    history.execute(sprite, widthCommand("Two", 3, 1));
    expect(history.totalBytes).toBe(1); history.undo(sprite); expect(history.canUndo).toBe(false);
  });
  test("groups undo in reverse order and redo as one named step", () => {
    const sprite = createSprite(1, 1), history = new History();
    history.beginGroup("Resize twice");
    history.execute(sprite, widthCommand("Two", 2)); history.execute(sprite, widthCommand("Three", 3));
    history.endGroup();
    expect(history.undoLabel).toBe("Resize twice"); expect(history.totalBytes).toBe(20);
    expect(history.undo(sprite)).toHaveLength(2); expect(sprite.width).toBe(1);
    expect(history.canUndo).toBe(false); expect(history.redoLabel).toBe("Resize twice");
    expect(history.redo(sprite)).toHaveLength(2); expect(sprite.width).toBe(3);
    history.undo(sprite); expect(sprite.width).toBe(1);
  });
  test("an oversized group remains intact and evicts older undo steps", () => {
    const sprite = createSprite(1, 1), history = new History({ maxBytes: 15 });
    history.execute(sprite, widthCommand("Two", 2)); history.beginGroup("Group");
    history.execute(sprite, widthCommand("Three", 3)); history.execute(sprite, widthCommand("Four", 4));
    expect(history.totalBytes).toBe(20); history.endGroup(); expect(history.totalBytes).toBe(20);
    history.undo(sprite); expect(sprite.width).toBe(2); expect(history.canUndo).toBe(false);
  });
  test("empty groups preserve redo and add no history", () => {
    const sprite = createSprite(1, 1), history = new History();
    history.execute(sprite, widthCommand("Two", 2)); history.undo(sprite);
    history.beginGroup("Empty"); history.endGroup();
    expect(history.canUndo).toBe(false); expect(history.redoLabel).toBe("Two");
  });
  test("guards group lifecycle and clear discards an open group", () => {
    const sprite = createSprite(1, 1), history = new History();
    expect(() => history.endGroup()).toThrow(); history.beginGroup("Group");
    expect(() => history.beginGroup("Nested")).toThrow();
    expect(() => history.undo(sprite)).toThrow(); expect(() => history.redo(sprite)).toThrow();
    history.execute(sprite, widthCommand("Two", 2)); history.clear();
    expect(history.totalBytes).toBe(0); expect(() => history.endGroup()).toThrow();
  });
  test.each([-1, 1.5, NaN, Infinity])("rejects invalid budget %s", maxBytes => {
    expect(() => new History({ maxBytes })).toThrow(RangeError);
  });
  test("failed execution preserves redo", () => {
    const sprite = createSprite(1, 1), history = new History();
    history.execute(sprite, widthCommand("Two", 2)); history.undo(sprite);
    expect(() => history.execute(sprite, setLayerProps(99, { name: "Bad" }))).toThrow(RangeError);
    expect(history.redoLabel).toBe("Two"); expect(history.totalBytes).toBe(10);
  });
  test("failed undo and redo retain their stack entries", () => {
    const sprite = createSprite(1, 1), history = new History();
    let failUndo = true, failDo = false;
    const command: Command = {
      label: "Fallible",
      do: () => { if (failDo) throw new Error("Do"); return []; },
      undo: () => { if (failUndo) throw new Error("Undo"); return []; },
      byteSize: () => 1,
    };
    history.execute(sprite, command);
    expect(() => history.undo(sprite)).toThrow("Undo"); expect(history.canUndo).toBe(true);
    failUndo = false; history.undo(sprite); failDo = true;
    expect(() => history.redo(sprite)).toThrow("Do"); expect(history.canRedo).toBe(true);
  });
});
