import type { ToolPreview } from "../contracts";
import type { EditorDocument } from "../doc/index";
import { compositeFrame } from "./composite";
import { clientToSprite, fitTransform, zoomAt } from "./transform";
import type { ViewTransform } from "./transform";

export class CanvasView {
  readonly canvas = document.createElement("canvas");
  transform: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
  frame = 0;
  onViewChange: (() => void) | null = null;
  private readonly context: CanvasRenderingContext2D;
  private readonly buffer = document.createElement("canvas");
  private readonly bufferContext: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels: Uint32Array;
  private preview: ToolPreview | null = null;
  private pending = 0;
  private compositeDirty = true;
  private readonly observer: ResizeObserver;
  private readonly unsubscribe: () => void;
  private readonly theme = matchMedia("(prefers-color-scheme: dark)");
  private readonly themeChanged = (): void => { this.invalidate(); };
  private readonly resized = (): void => { this.invalidate(); };

  constructor(private readonly container: HTMLElement, private readonly doc: EditorDocument) {
    this.canvas.setAttribute("aria-label", "Sprite canvas. Draw with a pen or mouse; use fingers to pan and zoom.");
    this.canvas.tabIndex = 0;
    const context = this.canvas.getContext("2d"), bufferContext = this.buffer.getContext("2d");
    if (!context || !bufferContext) throw new Error("Canvas 2D is unavailable");
    this.context = context; this.bufferContext = bufferContext;
    this.imageData = new ImageData(doc.sprite.width, doc.sprite.height);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    container.append(this.canvas);
    this.observer = new ResizeObserver(this.resized); this.observer.observe(container);
    window.addEventListener("resize", this.resized);
    this.theme.addEventListener("change", this.themeChanged);
    this.unsubscribe = doc.subscribe(() => { this.invalidate(true); });
    this.fitToScreen();
  }
  get zoom(): number { return this.transform.zoom; }
  setPreview(preview: ToolPreview | null): void { this.preview = preview; this.invalidate(true); }
  fitToScreen(): void {
    this.transform = fitTransform(this.container.clientWidth, this.container.clientHeight, this.doc.sprite.width, this.doc.sprite.height);
    this.invalidate(); this.onViewChange?.();
  }
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.transform = zoomAt(this.transform, factor, clientX - rect.left, clientY - rect.top);
    this.invalidate(); this.onViewChange?.();
  }
  panBy(dx: number, dy: number): void {
    this.transform = { ...this.transform, panX: this.transform.panX + dx, panY: this.transform.panY + dy };
    this.invalidate(); this.onViewChange?.();
  }
  clientToSprite(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return clientToSprite(this.transform, clientX, clientY, rect.left, rect.top);
  }
  invalidate(composite = false): void {
    this.compositeDirty ||= composite;
    if (!this.pending) this.pending = requestAnimationFrame(() => { this.pending = 0; this.draw(); });
  }
  dispose(): void {
    this.observer.disconnect(); this.unsubscribe(); cancelAnimationFrame(this.pending);
    window.removeEventListener("resize", this.resized); this.theme.removeEventListener("change", this.themeChanged);
    this.canvas.remove();
  }
  private draw(): void {
    const { width, height } = this.doc.sprite;
    if (this.buffer.width !== width || this.buffer.height !== height) {
      this.buffer.width = width; this.buffer.height = height;
      this.imageData = new ImageData(width, height); this.pixels = new Uint32Array(this.imageData.data.buffer);
      this.compositeDirty = true;
    }
    if (this.compositeDirty) {
      compositeFrame(this.doc.sprite, this.frame, this.preview, this.pixels);
      this.bufferContext.putImageData(this.imageData, 0, 0); this.compositeDirty = false;
    }
    const w = this.container.clientWidth, h = this.container.clientHeight, dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(w * dpr)), pixelHeight = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    const ctx = this.context, { zoom, panX, panY } = this.transform;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const style = getComputedStyle(this.canvas), a = style.getPropertyValue("--checker-light").trim(), b = style.getPropertyValue("--checker-dark").trim();
    const square = zoom >= 8 ? 8 * zoom : 8;
    ctx.save(); ctx.beginPath(); ctx.rect(panX, panY, width * zoom, height * zoom); ctx.clip();
    const startX = Math.max(0, Math.floor(-panX / square)), startY = Math.max(0, Math.floor(-panY / square));
    const endX = Math.min(Math.ceil(width * zoom / square), Math.ceil((w - panX) / square));
    const endY = Math.min(Math.ceil(height * zoom / square), Math.ceil((h - panY) / square));
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        ctx.fillStyle = (x + y) % 2 ? b : a;
        ctx.fillRect(panX + x * square, panY + y * square, square, square);
      }
    }
    ctx.drawImage(this.buffer, panX, panY, width * zoom, height * zoom); ctx.restore();
  }
}
