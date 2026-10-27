import { BLEND_MODES, MAX_FRAMES, MAX_LAYERS, MAX_SPRITE_SIZE } from "../contracts";
import { PixelImage } from "../doc/index";
import type { CelData, GroupLayer, Layer, Sprite, Tag } from "../doc/index";

export const AUTOSAVE_SCHEMA = 1;
interface SavedData { width: number; height: number; pixels: Uint32Array; x: number; y: number; opacity: number; zIndex: number }
interface SavedLayer {
  id: number; name: string; visible: boolean; locked: boolean; opacity: number; blendMode: string;
  kind: "group" | "image"; expanded?: boolean; children?: SavedLayer[];
  isBackground?: boolean; cels?: { frame: number; data: number }[];
}
export interface SpriteSnapshot {
  schema: 1; savedAt: number; width: number; height: number; colorMode: "rgba";
  root: SavedLayer & { celData: SavedData[] };
  frames: Sprite["frames"]; tags: Sprite["tags"]; palette: Sprite["palette"];
  preserved: Sprite["preserved"]; nextLayerId: number;
}
export function serializeSprite(sprite: Sprite): SpriteSnapshot {
  const indices = new Map<CelData, number>(), celData: SavedData[] = [];
  function layer(node: Layer): SavedLayer {
    const base = { id: node.id, name: node.name, visible: node.visible, locked: node.locked,
      opacity: node.opacity, blendMode: node.blendMode, kind: node.kind };
    if (node.kind === "group") return { ...base, expanded: node.expanded, children: node.children.map(layer) };
    return { ...base, isBackground: node.isBackground, cels: [...node.cels].map(([frame, { data }]) => {
      let index = indices.get(data);
      if (index === undefined) {
        index = celData.length; indices.set(data, index);
        celData.push({ width: data.image.width, height: data.image.height, pixels: data.image.data.slice(),
          x: data.x, y: data.y, opacity: data.opacity, zIndex: data.zIndex });
      }
      return { frame, data: index };
    }) };
  }
  return { schema: AUTOSAVE_SCHEMA, savedAt: Date.now(), width: sprite.width, height: sprite.height,
    colorMode: sprite.colorMode, root: { ...layer(sprite.root), celData },
    frames: sprite.frames.map(f => ({ ...f })), tags: sprite.tags.map(t => ({ ...t })),
    palette: { colors: [...sprite.palette.colors] },
    preserved: sprite.preserved.map(p => ({ ...p, bytes: p.bytes.slice() })), nextLayerId: sprite.nextLayerId };
}
function bad(field: string): never { throw new Error(`Invalid autosave: ${field}.`); }
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad(field);
  return value as Record<string, unknown>;
}
function list(value: unknown, field: string, max = 1_000_000): unknown[] {
  if (!Array.isArray(value) || value.length > max) return bad(field);
  return value as unknown[];
}
function int(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return bad(field);
  return value;
}
function text(value: unknown, field: string): string { return typeof value === "string" ? value : bad(field); }
function bool(value: unknown, field: string): boolean { return typeof value === "boolean" ? value : bad(field); }

export function deserializeSprite(obj: unknown): Sprite {
  const s = record(obj, "snapshot");
  if (typeof s.schema === "number" && s.schema > AUTOSAVE_SCHEMA) throw new Error("Autosave was created by a newer Pixelquill. Update the app to restore it.");
  if (s.schema !== AUTOSAVE_SCHEMA) return bad("schema");
  int(s.savedAt, 0, Number.MAX_SAFE_INTEGER, "savedAt");
  const width = int(s.width, 1, MAX_SPRITE_SIZE, "width"), height = int(s.height, 1, MAX_SPRITE_SIZE, "height");
  if (s.colorMode !== "rgba") return bad("color mode");
  const frames = list(s.frames, "frames", MAX_FRAMES).map(f => ({ duration: int(record(f, "frame").duration, 1, 65535, "duration") }));
  if (!frames.length) return bad("empty frames");
  const rootRecord = record(s.root, "root");
  let bytes = 0;
  const data = list(rootRecord.celData, "cel data").map(d => {
    const c = record(d, "cel data"), w = int(c.width, 1, MAX_SPRITE_SIZE, "cel width"), h = int(c.height, 1, MAX_SPRITE_SIZE, "cel height");
    if (!(c.pixels instanceof Uint32Array) || c.pixels.length !== w * h) return bad("cel pixels");
    bytes += c.pixels.byteLength;
    if (bytes > 256 * 1024 * 1024) return bad("snapshot exceeds memory limit");
    const image = new PixelImage(w, h); image.data.set(c.pixels);
    return { image, x: int(c.x, -2147483648, 2147483647, "cel x"), y: int(c.y, -2147483648, 2147483647, "cel y"),
      opacity: int(c.opacity, 0, 255, "cel opacity"), zIndex: int(c.zIndex, -32768, 32767, "cel z index") };
  });
  const ids = new Set<number>();
  function layer(value: unknown, parent: GroupLayer | null): Layer {
    if (ids.size > MAX_LAYERS) return bad("layer count");
    const l = record(value, "layer"), id = int(l.id, 0, Number.MAX_SAFE_INTEGER - 1, "layer id");
    if (ids.has(id) || (parent && id === 0)) return bad("duplicate layer id");
    ids.add(id);
    const blendMode = BLEND_MODES.find(mode => mode === l.blendMode);
    if (!blendMode) return bad("blend mode");
    const base = { id, name: text(l.name, "layer name"), visible: bool(l.visible, "visibility"),
      locked: bool(l.locked, "locked"), opacity: int(l.opacity, 0, 255, "layer opacity"), blendMode, parent };
    if (l.kind === "group") {
      const group: GroupLayer = { ...base, kind: "group", expanded: bool(l.expanded, "expanded"), children: [] };
      group.children = list(l.children, "children", MAX_LAYERS).map(child => layer(child, group));
      return group;
    }
    if (l.kind !== "image") return bad("layer kind");
    const cels = new Map<number, { data: CelData }>();
    for (const value of list(l.cels, "cels", MAX_FRAMES)) {
      const c = record(value, "cel"), frame = int(c.frame, 0, frames.length - 1, "cel frame");
      const shared = data[int(c.data, 0, data.length - 1, "cel data index")];
      if (!shared || cels.has(frame)) return bad("cel reference");
      cels.set(frame, { data: shared });
    }
    return { ...base, kind: "image", isBackground: bool(l.isBackground, "background"), cels };
  }
  const root = layer(rootRecord, null);
  if (root.kind !== "group" || root.id !== 0) return bad("root group");
  const tags: Tag[] = list(s.tags, "tags").map(value => {
    const t = record(value, "tag"), from = int(t.from, 0, frames.length - 1, "tag from"), to = int(t.to, from, frames.length - 1, "tag to");
    const direction = t.direction;
    if (direction !== "forward" && direction !== "reverse" && direction !== "pingpong" && direction !== "pingpong-reverse") return bad("tag direction");
    return { name: text(t.name, "tag name"), from, to, direction, repeat: int(t.repeat, 0, 65535, "tag repeat"), color: int(t.color, 0, 0xffffffff, "tag color") };
  });
  const palette = { colors: list(record(s.palette, "palette").colors, "palette colors", 256).map(c => int(c, 0, 0xffffffff, "color")) };
  const preserved = list(s.preserved, "preserved chunks").map(value => {
    const p = record(value, "chunk");
    if (!(p.bytes instanceof Uint8Array)) return bad("chunk bytes");
    bytes += p.bytes.byteLength;
    if (bytes > 256 * 1024 * 1024) return bad("snapshot exceeds memory limit");
    return { frame: int(p.frame, 0, frames.length - 1, "chunk frame"), type: int(p.type, 0, 65535, "chunk type"), bytes: p.bytes.slice() };
  });
  return { width, height, colorMode: "rgba", root, frames, tags, palette, preserved,
    nextLayerId: int(s.nextLayerId, Math.max(...ids) + 1, Number.MAX_SAFE_INTEGER, "next layer id") };
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error("Autosave request failed")); };
  });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { resolve(); };
    tx.onabort = tx.onerror = () => { reject(tx.error ?? new Error("Autosave transaction failed")); };
  });
}
export class AutosaveStore {
  private database: IDBDatabase | null = null;
  async open(): Promise<void> {
    if (this.database) return;
    const request = indexedDB.open("pixelquill", AUTOSAVE_SCHEMA);
    request.onupgradeneeded = () => { request.result.createObjectStore("autosave"); };
    this.database = await result(request);
    this.database.onversionchange = () => { this.database?.close(); this.database = null; };
  }
  async save(sprite: Sprite): Promise<void> {
    // Copy before awaiting, so later commands cannot mutate the pending generation.
    const snapshot = serializeSprite(sprite);
    await this.open();
    if (!this.database) throw new Error("Autosave database is closed");
    const tx = this.database.transaction("autosave", "readwrite"), done = complete(tx), store = tx.objectStore("autosave");
    const pointer = store.get("current") as IDBRequest<unknown>;
    pointer.onsuccess = () => {
      const slot = pointer.result === "gen-a" ? "gen-b" : "gen-a";
      store.put(snapshot, slot); store.put(slot, "current");
    };
    await done;
  }
  async load(): Promise<Sprite | null> {
    await this.open();
    if (!this.database) throw new Error("Autosave database is closed");
    const tx = this.database.transaction("autosave", "readonly"), done = complete(tx), store = tx.objectStore("autosave");
    const requests = ["current", "gen-a", "gen-b"].map(key => result(store.get(key) as IDBRequest<unknown>));
    const [pointer, a, b] = await Promise.all([...requests, done]);
    if (pointer === undefined && a === undefined && b === undefined) return null;
    const candidates = pointer === "gen-b" ? [b, a] : [a, b];
    let failure: unknown = new Error("Autosave generation is missing");
    for (const candidate of candidates) {
      if (candidate === undefined) continue;
      try { return deserializeSprite(candidate); } catch (error) { failure = error; }
    }
    throw failure;
  }
  async requestPersist(): Promise<boolean> {
    return typeof navigator.storage?.persist === "function" ? navigator.storage.persist() : false;
  }
}
