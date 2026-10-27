import { BLEND_MODES, MAX_FRAMES, MAX_LAYERS } from "../contracts";
import type { DocEvent, Rect } from "../contracts";
import type { Command } from "./history";
import type { PixelImage } from "./image";
import {
  allLayers, findLayer, imageLayers, validateDuration, validatePalette,
} from "./model";
import type { Cel, CelData, Frame, GroupLayer, ImageLayer, Layer, Sprite, Tag } from "./model";
import { integer } from "./validation";

export type LayerProps = Pick<Layer, "name" | "visible" | "locked" | "opacity" | "blendMode">;
export type AddLayerOptions = Partial<LayerProps> & {
  kind?: "image" | "group"; isBackground?: boolean; expanded?: boolean;
};
export interface CelReplacement { image: PixelImage; x: number; y: number }

function layerAt(sprite: Sprite, id: number): Layer {
  const layer = findLayer(sprite, id);
  if (!layer) throw new RangeError(`Unknown layer ${id}`);
  return layer;
}
function groupAt(sprite: Sprite, id: number): GroupLayer {
  const layer = layerAt(sprite, id);
  if (layer.kind !== "group") throw new RangeError("Parent must be a group");
  return layer;
}
function imageAt(sprite: Sprite, id: number): ImageLayer {
  const layer = layerAt(sprite, id);
  if (layer.kind !== "image") throw new RangeError("Cel requires an image layer");
  return layer;
}
function frameIndex(sprite: Sprite, index: number): void {
  integer(index, 0, sprite.frames.length - 1, "frame index");
}
function propsValid(props: Partial<LayerProps>): void {
  if (props.opacity !== undefined) integer(props.opacity, 0, 255, "opacity");
  if (props.blendMode !== undefined && !BLEND_MODES.includes(props.blendMode)) {
    throw new RangeError("Invalid blend mode");
  }
}
function layerProps(layer: Layer): LayerProps {
  return { name: layer.name, visible: layer.visible, locked: layer.locked,
    opacity: layer.opacity, blendMode: layer.blendMode };
}
function imageBytes(images: Iterable<PixelImage>): number {
  return [...new Set(images)].reduce((sum, image) => sum + image.byteSize(), 0);
}
function layerBytes(layer: Layer): number {
  const images: PixelImage[] = [];
  let bytes = 0;
  function visit(node: Layer): void {
    bytes += 64 + node.name.length * 2;
    if (node.kind === "group") node.children.forEach(visit);
    else for (const cel of node.cels.values()) { images.push(cel.data.image); bytes += 32; }
  }
  visit(layer);
  return bytes + imageBytes(images);
}
const layersEvent = (): DocEvent[] => [{ type: "layers" }];
const framesEvent = (): DocEvent[] => [{ type: "frames" }, { type: "tags" }];
const tagsEvent = (): DocEvent[] => [{ type: "tags" }];

export function addLayer(parentId: number, index: number, opts: AddLayerOptions = {}): Command {
  const options = { ...opts };
  let added: Layer | undefined;
  let previousId = 0;
  return {
    label: "Add layer",
    do(sprite) {
      const parent = groupAt(sprite, parentId);
      integer(index, 0, parent.children.length, "layer index");
      integer(allLayers(sprite).length + 1, 1, MAX_LAYERS, "layer count");
      propsValid(options);
      previousId = sprite.nextLayerId;
      const base = { id: previousId, name: options.name ?? (options.kind === "group" ? "Group" : "Layer"),
        visible: options.visible ?? true, locked: options.locked ?? false,
        opacity: options.opacity ?? 255, blendMode: options.blendMode ?? "normal", parent };
      added ??= options.kind === "group"
        ? { ...base, kind: "group", expanded: options.expanded ?? true, children: [] }
        : { ...base, kind: "image", isBackground: options.isBackground ?? false, cels: new Map() };
      added.parent = parent;
      parent.children.splice(index, 0, added);
      sprite.nextLayerId = previousId + 1;
      return layersEvent();
    },
    undo(sprite) {
      const parent = groupAt(sprite, parentId);
      parent.children.splice(index, 1);
      if (added) added.parent = null;
      sprite.nextLayerId = previousId;
      return layersEvent();
    },
    byteSize: () => added ? layerBytes(added) : 0,
  };
}
export function removeLayer(id: number): Command {
  let removed: Layer | undefined;
  let parent: GroupLayer | null = null;
  let index = 0;
  return {
    label: "Remove layer",
    do(sprite) {
      removed = layerAt(sprite, id);
      parent = removed.parent;
      if (!parent) throw new RangeError("Cannot remove the root");
      index = parent.children.indexOf(removed);
      parent.children.splice(index, 1); removed.parent = null;
      return layersEvent();
    },
    undo() {
      if (parent && removed) { parent.children.splice(index, 0, removed); removed.parent = parent; }
      return layersEvent();
    },
    byteSize: () => removed ? layerBytes(removed) : 0,
  };
}
/** newIndex is the final index after removal from the old parent. */
export function moveLayer(id: number, newParentId: number, newIndex: number): Command {
  let previousParent: GroupLayer | null = null;
  let previousIndex = 0;
  return {
    label: "Move layer",
    do(sprite) {
      const layer = layerAt(sprite, id), parent = groupAt(sprite, newParentId);
      previousParent = layer.parent;
      if (!previousParent) throw new RangeError("Cannot move the root");
      for (let ancestor: GroupLayer | null = parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor === layer) throw new RangeError("Cannot move a group into its descendant");
      }
      integer(newIndex, 0, parent.children.length - Number(parent === previousParent), "layer index");
      previousIndex = previousParent.children.indexOf(layer);
      previousParent.children.splice(previousIndex, 1);
      parent.children.splice(newIndex, 0, layer); layer.parent = parent;
      return layersEvent();
    },
    undo(sprite) {
      const layer = layerAt(sprite, id);
      layer.parent?.children.splice(newIndex, 1);
      previousParent?.children.splice(previousIndex, 0, layer); layer.parent = previousParent;
      return layersEvent();
    },
    byteSize: () => 32,
  };
}
export function setLayerProps(id: number, partial: Partial<LayerProps>): Command {
  const after = { ...partial };
  let before: LayerProps | undefined;
  return {
    label: "Layer properties",
    do(sprite) {
      propsValid(after);
      const layer = layerAt(sprite, id);
      before = layerProps(layer); Object.assign(layer, after);
      return layersEvent();
    },
    undo(sprite) { Object.assign(layerAt(sprite, id), before); return layersEvent(); },
    byteSize: () => 64 + ((before?.name.length ?? 0) + (after.name?.length ?? 0)) * 2,
  };
}

interface TimelineState {
  frames: Frame[];
  cels: { layer: ImageLayer; entries: [number, Cel][] }[];
  tags: { tag: Tag; value: Tag }[];
  preserved: { chunk: Sprite["preserved"][number]; frame: number }[];
}
function captureTimeline(sprite: Sprite): TimelineState {
  return { frames: sprite.frames.slice(),
    cels: imageLayers(sprite).map(layer => ({ layer, entries: [...layer.cels] })),
    tags: sprite.tags.map(tag => ({ tag, value: { ...tag } })),
    preserved: sprite.preserved.map(chunk => ({ chunk, frame: chunk.frame })),
  };
}
function restoreTimeline(sprite: Sprite, state: TimelineState): void {
  sprite.frames = state.frames.slice();
  for (const { layer, entries } of state.cels) {
    layer.cels.clear();
    for (const [index, cel] of entries) layer.cels.set(index, cel);
  }
  sprite.tags = state.tags.map(({ tag, value }) => { Object.assign(tag, value); return tag; });
  sprite.preserved = state.preserved.map(({ chunk, frame }) => { chunk.frame = frame; return chunk; });
}
function timelineCommand(label: string, change: (sprite: Sprite) => void): Command {
  let before: TimelineState | undefined, after: TimelineState | undefined;
  return {
    label,
    do(sprite) {
      if (after) restoreTimeline(sprite, after);
      else {
        before = captureTimeline(sprite);
        try { change(sprite); after = captureTimeline(sprite); }
        catch (error) { restoreTimeline(sprite, before); throw error; }
      }
      return framesEvent();
    },
    undo(sprite) { if (before) restoreTimeline(sprite, before); return framesEvent(); },
    byteSize() {
      const images: PixelImage[] = [];
      let bytes = 0;
      for (const state of [before, after]) {
        if (!state) continue;
        bytes += state.frames.length * 8;
        for (const { entries } of state.cels) {
          bytes += entries.length * 40;
          for (const [, cel] of entries) images.push(cel.data.image);
        }
        bytes += state.tags.reduce((n, { value }) => n + 32 + value.name.length * 2, 0);
        bytes += state.preserved.reduce((n, { chunk }) => n + 16 + chunk.bytes.byteLength, 0);
      }
      return bytes + imageBytes(images);
    },
  };
}
function remapCels(sprite: Sprite, map: (frame: number) => number | null): void {
  for (const layer of imageLayers(sprite)) {
    const entries = [...layer.cels]; layer.cels.clear();
    for (const [frame, cel] of entries) {
      const index = map(frame);
      if (index !== null) layer.cels.set(index, cel);
    }
  }
  sprite.preserved = sprite.preserved.filter(chunk => {
    const frame = map(chunk.frame);
    if (frame === null) return false;
    chunk.frame = frame; return true;
  });
}
function copyData(data: CelData): CelData { return { ...data, image: data.image.clone() }; }

export function addFrame(index: number, copyFrom?: number, linked = false): Command {
  return timelineCommand("Add frame", sprite => {
    integer(sprite.frames.length + 1, 1, MAX_FRAMES, "frame count");
    integer(index, 0, sprite.frames.length, "frame index");
    if (copyFrom !== undefined) frameIndex(sprite, copyFrom);
    const source = copyFrom === undefined ? undefined : sprite.frames[copyFrom];
    const copies = imageLayers(sprite).map(layer => {
      const cel = copyFrom === undefined ? undefined : layer.cels.get(copyFrom);
      return { layer, cel: cel ? { data: linked ? cel.data : copyData(cel.data) } : undefined };
    });
    remapCels(sprite, f => f >= index ? f + 1 : f);
    sprite.frames.splice(index, 0, { duration: source?.duration ?? 100 });
    for (const { layer, cel } of copies) if (cel) layer.cels.set(index, cel);
    for (const tag of sprite.tags) {
      if (tag.from >= index) tag.from++;
      if (tag.to >= index) tag.to++;
    }
  });
}
/** A tag containing only the removed frame is removed with it. */
export function removeFrame(index: number): Command {
  return timelineCommand("Remove frame", sprite => {
    frameIndex(sprite, index);
    if (sprite.frames.length === 1) throw new RangeError("Cannot remove the last frame");
    sprite.frames.splice(index, 1);
    remapCels(sprite, f => f === index ? null : f > index ? f - 1 : f);
    sprite.tags = sprite.tags.filter(tag => tag.from !== index || tag.to !== index);
    for (const tag of sprite.tags) {
      if (tag.from > index) tag.from--;
      if (tag.to >= index) tag.to--;
    }
  });
}
/** Tags remain contiguous and enclose all their remapped member frames. */
export function moveFrame(from: number, to: number): Command {
  return timelineCommand("Move frame", sprite => {
    frameIndex(sprite, from); frameIndex(sprite, to);
    const frame = sprite.frames[from];
    if (!frame) throw new RangeError("Unknown frame");
    const map = (f: number): number => f === from ? to
      : from < to && f > from && f <= to ? f - 1
      : from > to && f >= to && f < from ? f + 1 : f;
    sprite.frames.splice(from, 1); sprite.frames.splice(to, 0, frame);
    remapCels(sprite, map);
    for (const tag of sprite.tags) {
      const members = Array.from({ length: tag.to - tag.from + 1 }, (_, i) => map(tag.from + i));
      tag.from = Math.min(...members); tag.to = Math.max(...members);
    }
  });
}
export function setFrameDuration(indexes: readonly number[], ms: number): Command {
  const indices = [...new Set(indexes)];
  let before: { frame: Frame; duration: number }[] = [];
  return {
    label: "Frame duration",
    do(sprite) {
      validateDuration(ms);
      indices.forEach(i => frameIndex(sprite, i));
      before = indices.map(i => {
        const frame = sprite.frames[i];
        if (!frame) throw new RangeError("Unknown frame");
        return { frame, duration: frame.duration };
      });
      before.forEach(({ frame }) => { frame.duration = ms; });
      return [{ type: "frames" }];
    },
    undo() { before.forEach(({ frame, duration }) => { frame.duration = duration; }); return [{ type: "frames" }]; },
    byteSize: () => before.length * 16,
  };
}

/** Links to the first supplied frame; all requested frames must have a cel. */
export function linkCels(layerId: number, frames: readonly number[]): Command {
  const indices = [...new Set(frames)];
  let before: { cel: Cel; data: CelData }[] = [];
  return {
    label: "Link cels",
    do(sprite) {
      const layer = imageAt(sprite, layerId);
      if (indices.length < 2) throw new RangeError("Linking needs at least two frames");
      before = indices.map(frame => {
        frameIndex(sprite, frame);
        const cel = layer.cels.get(frame);
        if (!cel) throw new RangeError("Cannot link a missing cel");
        return { cel, data: cel.data };
      });
      const first = before[0];
      if (!first) throw new RangeError("Missing source cel");
      before.forEach(({ cel }) => { cel.data = first.data; });
      return [{ type: "frames" }];
    },
    undo() { before.forEach(({ cel, data }) => { cel.data = data; }); return [{ type: "frames" }]; },
    byteSize: () => before.length * 32 + imageBytes(before.map(({ data }) => data.image)),
  };
}
export function unlinkCel(layerId: number, frame: number): Command {
  let cel: Cel | undefined, before: CelData | undefined, after: CelData | undefined;
  return {
    label: "Unlink cel",
    do(sprite) {
      frameIndex(sprite, frame);
      cel = imageAt(sprite, layerId).cels.get(frame);
      if (!cel) throw new RangeError("Cannot unlink a missing cel");
      before = cel.data; after ??= copyData(before); cel.data = after;
      return [{ type: "frames" }];
    },
    undo() { if (cel && before) cel.data = before; return [{ type: "frames" }]; },
    byteSize: () => 64 + imageBytes([before?.image, after?.image].filter((i): i is PixelImage => i !== undefined)),
  };
}
function celRect(data: CelReplacement): Rect {
  return { x: data.x, y: data.y, w: data.image.width, h: data.image.height };
}
function dirtyRect(before: CelReplacement | undefined, after: CelReplacement | null): Rect {
  if (!before) return after ? celRect(after) : { x: 0, y: 0, w: 0, h: 0 };
  if (!after) return celRect(before);
  const x = Math.min(before.x, after.x), y = Math.min(before.y, after.y);
  return { x, y, w: Math.max(before.x + before.image.width, after.x + after.image.width) - x,
    h: Math.max(before.y + before.image.height, after.y + after.image.height) - y };
}
/** Images passed to commands become document/history-owned; callers must not mutate them afterwards. */
export function setCel(layerId: number, frame: number, after: CelReplacement | null): Command {
  const replacement = after ? { ...after } : null;
  let before: CelData | undefined, cel: Cel | undefined;
  let affected: { layerId: number; frame: number }[] = [];
  let rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  const events = (): DocEvent[] => affected.map(target => ({ type: "pixels", ...target, rect: { ...rect } }));
  return {
    label: "Set cel",
    do(sprite) {
      frameIndex(sprite, frame);
      if (replacement && (!Number.isSafeInteger(replacement.x) || !Number.isSafeInteger(replacement.y))) {
        throw new RangeError("Cel position must be integer coordinates");
      }
      const layer = imageAt(sprite, layerId);
      cel = layer.cels.get(frame);
      before = cel ? { ...cel.data } : undefined;
      rect = dirtyRect(before, replacement);
      affected = [{ layerId, frame }];
      if (replacement && cel) {
        affected = [];
        for (const linkedLayer of imageLayers(sprite)) {
          for (const [linkedFrame, linked] of linkedLayer.cels) {
            if (linked.data === cel.data) affected.push({ layerId: linkedLayer.id, frame: linkedFrame });
          }
        }
        Object.assign(cel.data, replacement);
      } else if (replacement) {
        layer.cels.set(frame, { data: { ...replacement, opacity: 255, zIndex: 0 } });
      } else layer.cels.delete(frame);
      return [...events(), { type: "frames" }];
    },
    undo(sprite) {
      const layer = imageAt(sprite, layerId);
      if (cel && before) { Object.assign(cel.data, before); layer.cels.set(frame, cel); }
      else layer.cels.delete(frame);
      return [...events(), { type: "frames" }];
    },
    byteSize: () => (before?.image.byteSize() ?? 0) + (replacement?.image.byteSize() ?? 0),
  };
}

function tagValid(sprite: Sprite, tag: Tag): void {
  frameIndex(sprite, tag.from); frameIndex(sprite, tag.to);
  if (tag.from > tag.to) throw new RangeError("Tag range is reversed");
  integer(tag.repeat, 0, 65535, "tag repeat");
  integer(tag.color, 0, 0xffffffff, "tag color");
  if (!["forward", "reverse", "pingpong", "pingpong-reverse"].includes(tag.direction)) {
    throw new RangeError("Invalid tag direction");
  }
}
/** Tags are addressed by their index in sprite.tags. */
export function addTag(tag: Tag): Command {
  const added = { ...tag };
  let index = 0;
  return {
    label: "Add tag",
    do(sprite) { tagValid(sprite, added); index = sprite.tags.length; sprite.tags.push(added); return tagsEvent(); },
    undo(sprite) { sprite.tags.splice(index, 1); return tagsEvent(); },
    byteSize: () => 32 + added.name.length * 2,
  };
}
export function removeTag(index: number): Command {
  let removed: Tag | undefined;
  return {
    label: "Remove tag",
    do(sprite) {
      integer(index, 0, sprite.tags.length - 1, "tag index");
      [removed] = sprite.tags.splice(index, 1); return tagsEvent();
    },
    undo(sprite) { if (removed) sprite.tags.splice(index, 0, removed); return tagsEvent(); },
    byteSize: () => 32 + (removed?.name.length ?? 0) * 2,
  };
}
export function setTag(index: number, partial: Partial<Tag>): Command {
  const patch = { ...partial };
  let before: Tag | undefined;
  return {
    label: "Tag properties",
    do(sprite) {
      integer(index, 0, sprite.tags.length - 1, "tag index");
      const tag = sprite.tags[index];
      if (!tag) throw new RangeError("Unknown tag");
      const after = { ...tag, ...patch }; tagValid(sprite, after);
      before = { ...tag }; Object.assign(tag, after); return tagsEvent();
    },
    undo(sprite) { const tag = sprite.tags[index]; if (tag && before) Object.assign(tag, before); return tagsEvent(); },
    byteSize: () => 64 + ((before?.name.length ?? 0) + (patch.name?.length ?? 0)) * 2,
  };
}
export function setPalette(colors: readonly number[]): Command {
  const after = [...colors];
  let before: number[] = [];
  return {
    label: "Set palette",
    do(sprite) { validatePalette(after); before = sprite.palette.colors; sprite.palette.colors = after; return [{ type: "palette" }]; },
    undo(sprite) { sprite.palette.colors = before; return [{ type: "palette" }]; },
    byteSize: () => (before.length + after.length) * 4,
  };
}
