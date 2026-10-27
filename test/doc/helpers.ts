import { allLayers, imageLayers } from "../../src/doc/index";
import type { CelData, Layer, Sprite } from "../../src/doc/index";

/** Canonical snapshot records parents, layer order, pixels, and link topology. */
export function snapshot(sprite: Sprite): unknown {
  const dataIds = new Map<CelData, number>();
  for (const layer of imageLayers(sprite)) {
    for (const [, cel] of [...layer.cels].sort(([a], [b]) => a - b)) {
      if (!dataIds.has(cel.data)) dataIds.set(cel.data, dataIds.size);
    }
  }
  const props = (layer: Layer) => ({
    id: layer.id, name: layer.name, visible: layer.visible, locked: layer.locked,
    opacity: layer.opacity, blendMode: layer.blendMode, parent: layer.parent?.id ?? null,
  });
  return {
    width: sprite.width, height: sprite.height, colorMode: sprite.colorMode, nextLayerId: sprite.nextLayerId,
    root: { ...props(sprite.root), expanded: sprite.root.expanded, children: sprite.root.children.map(l => l.id) },
    layers: allLayers(sprite).map(layer => layer.kind === "group"
      ? { ...props(layer), kind: layer.kind, expanded: layer.expanded, children: layer.children.map(l => l.id) }
      : { ...props(layer), kind: layer.kind, isBackground: layer.isBackground,
        cels: [...layer.cels].sort(([a], [b]) => a - b).map(([frame, cel]) => ({ frame, data: dataIds.get(cel.data) })) }),
    data: [...dataIds].map(([data, id]) => ({ id, x: data.x, y: data.y, opacity: data.opacity,
      zIndex: data.zIndex, width: data.image.width, height: data.image.height, pixels: [...data.image.data] })),
    frames: sprite.frames.map(f => ({ ...f })), tags: sprite.tags.map(t => ({ ...t })),
    palette: [...sprite.palette.colors],
    preserved: sprite.preserved.map(c => ({ frame: c.frame, type: c.type, bytes: [...c.bytes] })),
  };
}
