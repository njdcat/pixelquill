import type { DocumentLike, PixelImage, SelectionMask } from "./doc/index";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export const MAX_SPRITE_SIZE = 2048;
export const MAX_FRAMES = 1000;
export const MAX_LAYERS = 256;
export const UNDO_MAX_BYTES = 256 * 1024 * 1024;

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" |
  "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" |
  "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity" |
  "addition" | "subtract" | "divide";
/** Array index is the file-format blend-mode ID. */
export const BLEND_MODES: readonly BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue",
  "saturation", "color", "luminosity", "addition", "subtract", "divide",
];
export type TagDirection = "forward" | "reverse" | "pingpong" | "pingpong-reverse";
export type DocEvent =
  | { type: "pixels"; layerId: number; frame: number; rect: Rect }
  | { type: "layers" }
  | { type: "frames" }
  | { type: "tags" }
  | { type: "palette" }
  | { type: "sprite" };

/** Sprite pixel coordinates may be fractional; unknown pressure is 0.5. */
export interface ToolPoint { x: number; y: number; pressure: number; time: number }
export type BrushShape = "square" | "circle";
/** Size is an integer from 1 through 64. */
export interface Brush { shape: BrushShape; size: number }
/** Replaces this layer's cel for this frame with image at (x, y) during a stroke. */
export interface ToolPreview {
  layerId: number; frame: number; x: number; y: number; image: PixelImage;
}
export interface ToolContext {
  doc: DocumentLike;
  layerId: number;
  frame: number;
  fg: number;
  bg: number;
  brush: Brush;
  pixelPerfect: boolean;
  pressureSize: boolean;
  selection: SelectionMask | null;
  setPreview(preview: ToolPreview | null): void;
}
/** A tool commits one undoable command through ctx.doc.execute on end. */
export interface Tool {
  readonly id: string;
  readonly label: string;
  begin(ctx: ToolContext, p: ToolPoint): void;
  move(ctx: ToolContext, points: readonly ToolPoint[]): void;
  end(ctx: ToolContext): void;
  cancel(ctx: ToolContext): void;
}
