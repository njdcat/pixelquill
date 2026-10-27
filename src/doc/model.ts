import { MAX_FRAMES, MAX_LAYERS } from "../contracts";
import type { BlendMode, TagDirection } from "../contracts";
import { fromHex } from "./color";
import type { PixelImage } from "./image";
import { dimensions, integer } from "./validation";

export interface CelData {
  image: PixelImage; x: number; y: number; opacity: number; zIndex: number;
}
export interface Cel { data: CelData }
export interface LayerBase {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  parent: GroupLayer | null;
}
export interface ImageLayer extends LayerBase {
  kind: "image"; isBackground: boolean; cels: Map<number, Cel>;
}
export interface GroupLayer extends LayerBase {
  kind: "group"; expanded: boolean; children: Layer[];
}
export type Layer = ImageLayer | GroupLayer;
export interface Frame { duration: number }
export interface Tag {
  name: string; from: number; to: number; direction: TagDirection; repeat: number; color: number;
}
export interface Palette { colors: number[] }
export interface PreservedChunk { frame: number; type: number; bytes: Uint8Array }
export interface Sprite {
  width: number;
  height: number;
  colorMode: "rgba";
  root: GroupLayer;
  frames: Frame[];
  tags: Tag[];
  palette: Palette;
  preserved: PreservedChunk[];
  nextLayerId: number;
}
/** Original palette: four neutral, then seven four-step hue ramps. */
export const DEFAULT_PALETTE: readonly number[] = [
  "#101522", "#4a5267", "#a6b2c7", "#f5f7ee",
  "#451c32", "#8e304b", "#d95868", "#ffaca0",
  "#492b1d", "#985029", "#df873c", "#ffd49b",
  "#403c1a", "#8a7e2d", "#c8bb4b", "#f8ed9c",
  "#193b32", "#297657", "#57b877", "#bbebad",
  "#153943", "#226e88", "#49afc4", "#aaedf0",
  "#242a52", "#42529c", "#7389de", "#c8d6ff",
  "#3b234d", "#78438d", "#b279c2", "#edbcf1",
].map(fromHex);

export interface CreateSpriteOptions {
  layerName?: string;
  frameDuration?: number;
  palette?: readonly number[];
}
export function validatePalette(colors: readonly number[]): void {
  integer(colors.length, 0, 256, "palette size");
  for (const c of colors) integer(c, 0, 0xffffffff, "packed color");
}
export function validateDuration(duration: number): void { integer(duration, 1, 65535, "duration"); }
export function createSprite(width: number, height: number, opts: CreateSpriteOptions = {}): Sprite {
  dimensions(width, height);
  const duration = opts.frameDuration ?? 100;
  validateDuration(duration);
  const colors = [...(opts.palette ?? DEFAULT_PALETTE)];
  validatePalette(colors);
  const root: GroupLayer = {
    id: 0, kind: "group", name: "Root", visible: true, locked: false, opacity: 255,
    blendMode: "normal", parent: null, expanded: true, children: [],
  };
  root.children.push({
    id: 1, kind: "image", name: opts.layerName ?? "Layer 1", visible: true,
    locked: false, opacity: 255, blendMode: "normal", parent: root,
    isBackground: false, cels: new Map(),
  });
  const sprite: Sprite = {
    width, height, colorMode: "rgba", root, frames: [{ duration }], tags: [],
    palette: { colors }, preserved: [], nextLayerId: 2,
  };
  validateSpriteCounts(sprite);
  return sprite;
}
/** Preorder, bottom to top at every level; excludes the synthetic root (ID 0). */
export function allLayers(sprite: Sprite): Layer[] {
  const result: Layer[] = [];
  function visit(group: GroupLayer): void {
    for (const layer of group.children) {
      result.push(layer);
      if (layer.kind === "group") visit(layer);
    }
  }
  visit(sprite.root);
  return result;
}
/** Includes the synthetic root so it can serve as a command's parent ID. */
export function findLayer(sprite: Sprite, id: number): Layer | undefined {
  return id === sprite.root.id ? sprite.root : allLayers(sprite).find(layer => layer.id === id);
}
export function imageLayers(sprite: Sprite): ImageLayer[] {
  return allLayers(sprite).filter((layer): layer is ImageLayer => layer.kind === "image");
}
export function getCel(layer: ImageLayer, frame: number): Cel | undefined { return layer.cels.get(frame); }
export function celCountForData(sprite: Sprite, data: CelData): number {
  let count = 0;
  for (const layer of imageLayers(sprite)) {
    for (const cel of layer.cels.values()) if (cel.data === data) count++;
  }
  return count;
}
export function validateSpriteCounts(sprite: Sprite): void {
  integer(sprite.frames.length, 1, MAX_FRAMES, "frame count");
  integer(allLayers(sprite).length, 0, MAX_LAYERS, "layer count");
}
