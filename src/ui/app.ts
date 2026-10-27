import type { Tool } from "../contracts";
import { fromHex, toHex } from "../doc/index";
import type { EditorDocument } from "../doc/index";
import { tools } from "../tools/index";

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button"; element.textContent = label; element.addEventListener("click", action);
  return element;
}
export class App {
  readonly viewport = document.createElement("div");
  readonly editor: HTMLElement;
  tool: Tool = tools.pencil;
  fg = fromHex("#193b32");
  pressureSize = false;
  onFit: () => void = () => {};
  beforeAction: () => void = () => {};
  private readonly status = document.createElement("span");
  private readonly zoom = document.createElement("span");
  private readonly update: HTMLButtonElement;
  constructor(root: HTMLElement, doc: EditorDocument) {
    root.className = "editor"; this.editor = root;
    const toolbar = document.createElement("div"); toolbar.className = "toolbar";
    toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Drawing tools");
    const brand = document.createElement("span"); brand.className = "brand"; brand.textContent = "Pixelquill";
    const group = document.createElement("div"); group.className = "tool-toggle";
    group.setAttribute("role", "group"); group.setAttribute("aria-label", "Tool");
    const toggles = Object.values(tools).map(tool => {
      const control = button(tool.label, () => {
        this.beforeAction(); this.tool = tool;
        for (const { control, tool: choice } of toggles) control.setAttribute("aria-pressed", String(choice === tool));
      });
      control.setAttribute("aria-pressed", String(tool === this.tool)); group.append(control);
      return { control, tool };
    });
    const colorLabel = document.createElement("label"); colorLabel.className = "color-well"; colorLabel.textContent = "Color";
    const color = document.createElement("input"); color.type = "color"; color.value = toHex(this.fg).slice(0, 7);
    color.addEventListener("input", () => { this.beforeAction(); this.fg = fromHex(color.value); }); colorLabel.append(color);
    const undo = button("Undo", () => { this.beforeAction(); doc.undo(); });
    const redo = button("Redo", () => { this.beforeAction(); doc.redo(); });
    const syncHistory = (): void => {
      undo.disabled = !doc.history.canUndo; redo.disabled = !doc.history.canRedo;
      undo.title = doc.history.canUndo ? "Undo last stroke" : "Nothing to undo yet";
      redo.title = doc.history.canRedo ? "Redo last undone stroke" : "Nothing to redo";
    };
    doc.subscribe(syncHistory); syncHistory();
    const fit = button("Fit", () => { this.beforeAction(); this.onFit(); });
    const pressure = button("Pressure size", () => {
      this.beforeAction(); this.pressureSize = !this.pressureSize;
      pressure.setAttribute("aria-pressed", String(this.pressureSize));
    });
    pressure.setAttribute("aria-pressed", "false"); pressure.title = "Use pen pressure to change brush size";
    toolbar.append(brand, group, colorLabel, undo, redo, fit, pressure);
    this.viewport.className = "viewport";
    const footer = document.createElement("div"); footer.className = "status-line";
    this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    this.update = button("Update ready", () => { window.location.reload(); }); this.update.hidden = true;
    footer.append(this.zoom, this.status, this.update);
    root.replaceChildren(toolbar, this.viewport, footer);
  }
  setStatus(value: string): void { this.status.textContent = value; }
  setZoom(value: number): void { this.zoom.textContent = `${Math.round(value * 100)}%`; }
  showUpdate(): void { this.update.hidden = false; }
}
