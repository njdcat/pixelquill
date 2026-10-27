export interface GestureEvent {
  kind: "down" | "move" | "up" | "cancel";
  pointerId: number; pointerType: "pen" | "touch" | "mouse";
  x: number; y: number; pressure: number; time: number;
}
export interface GesturePoint { x: number; y: number; pressure: number; time: number }
export type Intent =
  | { type: "stroke-begin" | "stroke-move" | "stroke-end" | "stroke-cancel"; points: GesturePoint[] }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number; cx: number; cy: number }
  | { type: "undo" | "redo" };
interface Finger { start: GestureEvent; current: GestureEvent }
interface Geometry { x: number; y: number; distance: number }

/** Coordinates and thresholds are CSS pixels; time is monotonic milliseconds. */
export class GestureMachine {
  private drawing: GestureEvent | null = null;
  private readonly pens = new Set<number>();
  private penLift = -Infinity;
  private readonly ignored = new Set<number>();
  private readonly fingers = new Map<number, Finger>();
  private firstTime = 0;
  private participants = 0;
  private tap = true;
  private lifted = false;
  private buffered: Intent[] = [];

  feed(e: GestureEvent): Intent[] {
    const out: Intent[] = [];
    if (e.pointerType !== "touch") {
      if (e.pointerType === "pen") {
        if (e.kind === "down") {
          this.pens.add(e.pointerId);
          this.abandonTouches();
        } else if (e.kind === "up" || e.kind === "cancel") {
          this.pens.delete(e.pointerId); this.penLift = e.time;
        }
      }
      if (e.kind === "down" && (!this.drawing || e.pointerType === "pen")) {
        if (this.drawing) out.push({ type: "stroke-cancel", points: [] });
        this.drawing = e;
        out.push({ type: "stroke-begin", points: [e] });
      } else if (this.drawing?.pointerId === e.pointerId && this.drawing.pointerType === e.pointerType) {
        if (e.kind === "move") out.push({ type: "stroke-move", points: [e] });
        else if (e.kind === "up" || e.kind === "cancel") {
          out.push({ type: e.kind === "up" ? "stroke-end" : "stroke-cancel", points: e.kind === "up" ? [e] : [] });
          this.drawing = null;
        }
      }
      return out;
    }
    if (this.pens.size || e.time - this.penLift < 300 || this.ignored.has(e.pointerId)) {
      if (e.kind === "down") this.ignored.add(e.pointerId);
      if (e.kind === "up" || e.kind === "cancel") this.ignored.delete(e.pointerId);
      return out;
    }
    if (e.kind === "down") {
      if (!this.fingers.size) {
        this.firstTime = e.time; this.participants = 0; this.tap = true; this.lifted = false; this.buffered = [];
      }
      this.participants++;
      this.fingers.set(e.pointerId, { start: e, current: e });
      if (e.time - this.firstTime > 250 || this.lifted || this.participants > 3) this.rejectTap(out);
    } else {
      const finger = this.fingers.get(e.pointerId);
      if (!finger) return out;
      if (e.kind === "cancel") { this.abandonTouches(); return out; }
      const before = this.geometry();
      finger.current = e;
      const after = this.geometry();
      if (before && after) {
        const movements: Intent[] = [];
        if (before.x !== after.x || before.y !== after.y) movements.push({ type: "pan", dx: after.x - before.x, dy: after.y - before.y });
        if (before.distance > 0 && after.distance > 0 && before.distance !== after.distance) {
          movements.push({ type: "zoom", factor: after.distance / before.distance, cx: after.x, cy: after.y });
        }
        if (this.tap) this.buffered.push(...movements);
        else out.push(...movements);
      }
      if (Math.hypot(e.x - finger.start.x, e.y - finger.start.y) > 10) this.rejectTap(out);
      if (e.kind === "up") {
        this.fingers.delete(e.pointerId); this.lifted = true;
      }
    }
    if (e.time - this.firstTime > 300) this.rejectTap(out);
    if (!this.fingers.size) {
      if (this.tap && this.participants === 2) out.push({ type: "undo" });
      if (this.tap && this.participants === 3) out.push({ type: "redo" });
      this.buffered = [];
    }
    return out;
  }
  private rejectTap(out: Intent[]): void {
    if (!this.tap) return;
    this.tap = false; out.push(...this.buffered); this.buffered = [];
  }
  private abandonTouches(): void {
    for (const id of this.fingers.keys()) this.ignored.add(id);
    this.fingers.clear(); this.buffered = []; this.tap = false;
  }
  private geometry(): Geometry | null {
    const [a, b] = [...this.fingers.values()].map(f => f.current);
    if (!a) return null;
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : { x: a.x, y: a.y, distance: 0 };
  }
}
