import type { Tool, ToolContext, ToolPoint } from "../contracts";
import type { EditorDocument } from "../doc/index";
import type { CanvasView } from "../render/view";
import { GestureMachine } from "./gestures";
import type { GesturePoint, Intent } from "./gestures";

export interface PointerBinding { finish(): void; dispose(): void }
export function bindPointer(editor: HTMLElement, view: CanvasView, doc: EditorDocument,
  getTool: () => Tool, getContext: () => ToolContext): PointerBinding {
  let machine = new GestureMachine();
  let active: { tool: Tool; ctx: ToolContext } | null = null;
  const canvas = view.canvas, controller = new AbortController(), signal = controller.signal;
  const convert = (points: readonly GesturePoint[]): ToolPoint[] => points.map(p => ({ ...p, ...view.clientToSprite(p.x, p.y) }));
  function dispatch(intents: readonly Intent[]): void {
    for (const intent of intents) {
      switch (intent.type) {
        case "stroke-begin": {
          const p = convert(intent.points)[0];
          if (p) { active = { tool: getTool(), ctx: getContext() }; active.tool.begin(active.ctx, p); }
          break;
        }
        case "stroke-move": if (active) active.tool.move(active.ctx, convert(intent.points)); break;
        case "stroke-end":
          if (active) { active.tool.move(active.ctx, convert(intent.points)); active.tool.end(active.ctx); active = null; }
          break;
        case "stroke-cancel": if (active) { active.tool.cancel(active.ctx); active = null; } break;
        case "pan": view.panBy(intent.dx, intent.dy); break;
        case "zoom": view.zoomAt(intent.factor, intent.cx, intent.cy); break;
        case "undo": if (!active) doc.undo(); break;
        case "redo": if (!active) doc.redo(); break;
      }
    }
  }
  function pointer(e: PointerEvent): void {
    if (e.pointerType !== "pen" && e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    if (e.type === "pointerdown" && e.pointerType !== "touch" && e.button !== 0) return;
    e.preventDefault();
    const kind = e.type === "pointerdown" ? "down" : e.type === "pointerup" ? "up" : e.type === "pointermove" ? "move" : "cancel";
    if (kind === "down" && e.pointerType !== "touch") canvas.setPointerCapture(e.pointerId);
    const coalesced = kind === "move" && typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const point of coalesced.length ? coalesced : [e]) {
      dispatch(machine.feed({ kind, pointerId: e.pointerId, pointerType: e.pointerType,
        x: point.clientX, y: point.clientY, pressure: e.pointerType === "pen" ? point.pressure : 0.5, time: point.timeStamp }));
    }
  }
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, pointer as EventListener, { signal });
  }
  const prevent = (e: Event): void => { e.preventDefault(); };
  for (const type of ["gesturestart", "gesturechange", "dblclick", "contextmenu", "touchmove"]) {
    editor.addEventListener(type, prevent, { passive: false, signal });
  }
  const finish = (): void => {
    if (active) { active.tool.end(active.ctx); active = null; }
    machine = new GestureMachine();
  };
  return { finish, dispose() {
    if (active) active.tool.cancel(active.ctx);
    active = null; controller.abort();
  } };
}
