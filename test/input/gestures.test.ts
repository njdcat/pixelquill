import { expect, test } from "vitest";
import { GestureMachine } from "../../src/input/gestures";
import type { GestureEvent, Intent } from "../../src/input/gestures";

function event(kind: GestureEvent["kind"], pointerId: number, time: number, x = 0, y = 0,
  pointerType: GestureEvent["pointerType"] = "touch"): GestureEvent {
  return { kind, pointerId, time, x, y, pointerType, pressure: pointerType === "pen" ? 0.8 : 0.5 };
}
function run(events: GestureEvent[]): Intent[] {
  const machine = new GestureMachine(); return events.flatMap(e => machine.feed(e));
}
test.each(["pen", "mouse"] as const)("%s begins immediately, draws moves, and ends even a subpixel short dot", type => {
  const intents = run([event("down", 1, 0, 2, 3, type), event("move", 1, 40, 2.1, 3.1, type), event("up", 1, 80, 2.2, 3.2, type)]);
  expect(intents.map(i => i.type)).toEqual(["stroke-begin", "stroke-move", "stroke-end"]);
  expect(intents[0]).toMatchObject({ points: [{ x: 2, y: 3, pressure: type === "pen" ? 0.8 : 0.5 }] });
});
test("fingers never draw, buffer small drags, then flush the entire pan after threshold", () => {
  const m = new GestureMachine(); expect(m.feed(event("down", 1, 0))).toEqual([]);
  expect(m.feed(event("move", 1, 10, 6, 0))).toEqual([]);
  expect(m.feed(event("move", 1, 20, 15, 0))).toEqual([{ type: "pan", dx: 6, dy: 0 }, { type: "pan", dx: 9, dy: 0 }]);
  expect(m.feed(event("move", 1, 30, 17, 4))).toEqual([{ type: "pan", dx: 2, dy: 4 }]);
});
test("two fingers pan by midpoint and zoom by distance ratio about the new midpoint", () => {
  const out = run([event("down", 1, 0), event("down", 2, 10, 20), event("move", 2, 20, 40)]);
  expect(out).toEqual([{ type: "pan", dx: 10, dy: 0 }, { type: "zoom", factor: 2, cx: 20, cy: 0 }]);
});
test("pinch transitions back to one-finger pan without a jump", () => {
  const m = new GestureMachine(); m.feed(event("down", 1, 0)); m.feed(event("down", 2, 0, 20));
  m.feed(event("move", 2, 20, 40)); expect(m.feed(event("up", 2, 30, 40))).toEqual([]);
  expect(m.feed(event("move", 1, 40, 5, 3))).toEqual([{ type: "pan", dx: 5, dy: 3 }]);
});
test.each([2, 3])("%s-finger tap emits only undo/redo even with buffered movement", count => {
  const events: GestureEvent[] = [];
  for (let id = 1; id <= count; id++) events.push(event("down", id, id * 20, id * 30));
  for (let id = 1; id <= count; id++) events.push(event("move", id, 100, id * 30 + 5, 2));
  for (let id = 1; id <= count; id++) events.push(event("up", id, 150 + id * 20, id * 30 + 5, 2));
  expect(run(events)).toEqual([{ type: count === 2 ? "undo" : "redo" }]);
});
test("tap accepts exact time and movement boundaries", () => {
  expect(run([event("down", 1, 0), event("down", 2, 250, 20), event("move", 1, 280, 10),
    event("up", 1, 290, 10), event("up", 2, 300, 20)])).toEqual([{ type: "undo" }]);
});
test("late second finger rejects a tap", () => {
  const out = run([event("down", 1, 0), event("down", 2, 251, 20), event("up", 1, 270), event("up", 2, 280, 20)]);
  expect(out.some(i => i.type === "undo" || i.type === "redo")).toBe(false);
});
test("long tap releases buffered gesture when time passes 300ms", () => {
  const out = run([event("down", 1, 0), event("down", 2, 10, 20), event("move", 2, 100, 24), event("up", 2, 301, 24), event("up", 1, 310)]);
  expect(out).toEqual([{ type: "pan", dx: 2, dy: 0 }, { type: "zoom", factor: 1.2, cx: 12, cy: 0 }]);
});
test("a moved finger cannot qualify after returning to its starting point", () => {
  const out = run([event("down", 1, 0), event("down", 2, 10, 20), event("move", 1, 20, 11),
    event("move", 1, 30), event("up", 1, 50), event("up", 2, 60, 20)]);
  expect(out.some(i => i.type === "undo")).toBe(false); expect(out.some(i => i.type === "pan")).toBe(true);
});
test("four fingers and a replacement finger after lift cannot qualify as a tap", () => {
  const four = run([event("down", 1, 0), event("down", 2, 10), event("down", 3, 20), event("down", 4, 30),
    event("up", 1, 40), event("up", 2, 50), event("up", 3, 60), event("up", 4, 70)]);
  expect(four).toEqual([]);
  const replacement = run([event("down", 1, 0), event("down", 2, 10), event("up", 1, 20), event("down", 3, 30), event("up", 2, 40), event("up", 3, 50)]);
  expect(replacement).toEqual([]);
});
test("pen down discards a pending finger tap and its buffered pan", () => {
  const out = run([event("down", 1, 0), event("down", 2, 10, 20), event("move", 2, 20, 24),
    event("down", 3, 30, 4, 4, "pen"), event("up", 1, 40), event("up", 2, 50, 24), event("up", 3, 60, 4, 4, "pen")]);
  expect(out.map(i => i.type)).toEqual(["stroke-begin", "stroke-end"]);
});
test("palm rejection ignores touches while pen is down and for 300ms after lift", () => {
  const m = new GestureMachine(); m.feed(event("down", 1, 0, 0, 0, "pen"));
  expect(m.feed(event("down", 2, 20))).toEqual([]);
  expect(m.feed(event("move", 2, 40, 100))).toEqual([]);
  m.feed(event("up", 1, 100, 0, 0, "pen"));
  expect(m.feed(event("down", 3, 399))).toEqual([]);
  // Ignored palms remain ignored until lifted even after the cooldown expires.
  expect(m.feed(event("move", 2, 450, 200))).toEqual([]); expect(m.feed(event("up", 2, 460, 200))).toEqual([]);
  m.feed(event("down", 4, 500));
  expect(m.feed(event("move", 4, 510, 20))).toEqual([{ type: "pan", dx: 20, dy: 0 }]);
});
test("a new touch at exactly 300ms after pen lift is accepted", () => {
  const out = run([event("down", 1, 0, 0, 0, "pen"), event("up", 1, 10, 0, 0, "pen"), event("down", 2, 310), event("move", 2, 320, 20)]);
  expect(out.at(-1)).toEqual({ type: "pan", dx: 20, dy: 0 });
});
test("pointercancel cancels a stroke and never commits a tap", () => {
  expect(run([event("down", 1, 0, 0, 0, "pen"), event("cancel", 1, 20, 0, 0, "pen")]).map(i => i.type)).toEqual(["stroke-begin", "stroke-cancel"]);
  expect(run([event("down", 1, 0), event("down", 2, 10, 20), event("move", 2, 20, 24), event("cancel", 1, 30), event("up", 2, 40, 24)])).toEqual([]);
});
test("pen preempts a mouse stroke and secondary pointers cannot end the current stroke", () => {
  const out = run([event("down", 1, 0, 0, 0, "mouse"), event("down", 2, 10, 0, 0, "pen"),
    event("up", 1, 20, 0, 0, "mouse"), event("up", 2, 30, 0, 0, "pen")]);
  expect(out.map(i => i.type)).toEqual(["stroke-begin", "stroke-cancel", "stroke-begin", "stroke-end"]);
});
test("coincident pinch points do not produce infinite zoom factors", () => {
  const out = run([event("down", 1, 0), event("down", 2, 10), event("move", 2, 20, 30)]);
  expect(out).toEqual([{ type: "pan", dx: 15, dy: 0 }]);
});
