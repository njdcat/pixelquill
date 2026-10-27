import type { Tool, ToolContext, ToolPoint } from "../contracts";
import { findLayer, PixelImage, setCel } from "../doc/index";
import type { Layer } from "../doc/index";

function editable(ctx: ToolContext): boolean {
  let layer: Layer | null | undefined = findLayer(ctx.doc.sprite, ctx.layerId);
  if (layer?.kind !== "image") return false;
  while (layer) {
    if (layer.locked || !layer.visible) return false;
    layer = layer.parent;
  }
  return true;
}
interface Stroke { image: PixelImage; last: ToolPoint }
export function createStrokeTool(id: string, label: string, color: (ctx: ToolContext) => number): Tool {
  const strokes = new WeakMap<ToolContext, Stroke>();
  function stamp(ctx: ToolContext, image: PixelImage, x: number, y: number, pressure: number): void {
    const size = Math.min(64, Math.max(1, Math.round(ctx.brush.size * (ctx.pressureSize ? pressure * 2 : 1))));
    const offset = Math.floor(size / 2), center = (size - 1) / 2;
    const left = x - offset, top = y - offset;
    for (let by = Math.max(0, -top); by < Math.min(size, image.height - top); by++) {
      for (let bx = Math.max(0, -left); bx < Math.min(size, image.width - left); bx++) {
        if (ctx.brush.shape === "circle" && (bx - center) ** 2 + (by - center) ** 2 > (size / 2) ** 2) continue;
        if (!ctx.selection || ctx.selection.contains(left + bx, top + by)) image.set(left + bx, top + by, color(ctx));
      }
    }
  }
  function publish(ctx: ToolContext, image: PixelImage): void {
    ctx.setPreview({ layerId: ctx.layerId, frame: ctx.frame, x: 0, y: 0, image });
  }
  return {
    id, label,
    begin(ctx, p) {
      strokes.delete(ctx);
      if (!editable(ctx)) return;
      const { width, height } = ctx.doc.sprite, image = new PixelImage(width, height);
      const layer = findLayer(ctx.doc.sprite, ctx.layerId);
      const cel = layer?.kind === "image" ? layer.cels.get(ctx.frame)?.data : undefined;
      if (cel) image.blit(cel.image, cel.x, cel.y);
      strokes.set(ctx, { image, last: p });
      stamp(ctx, image, Math.floor(p.x), Math.floor(p.y), p.pressure);
      publish(ctx, image);
    },
    move(ctx, points) {
      const stroke = strokes.get(ctx);
      if (!stroke) return;
      if (!editable(ctx)) { strokes.delete(ctx); ctx.setPreview(null); return; }
      for (const p of points) {
        let x = Math.floor(stroke.last.x), y = Math.floor(stroke.last.y);
        const endX = Math.floor(p.x), endY = Math.floor(p.y);
        const dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
        const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
        let error = dx + dy, step = 0;
        const steps = Math.max(dx, -dy);
        for (;;) {
          const pressure = steps ? stroke.last.pressure + (p.pressure - stroke.last.pressure) * step / steps : p.pressure;
          stamp(ctx, stroke.image, x, y, pressure);
          if (x === endX && y === endY) break;
          const twice = 2 * error;
          if (twice >= dy) { error += dy; x += sx; }
          if (twice <= dx) { error += dx; y += sy; }
          step++;
        }
        stroke.last = p;
      }
      publish(ctx, stroke.image);
    },
    end(ctx) {
      const stroke = strokes.get(ctx);
      strokes.delete(ctx);
      try {
        if (stroke && editable(ctx)) {
          const bounds = stroke.image.contentBounds();
          ctx.doc.execute(setCel(ctx.layerId, ctx.frame, bounds
            ? { image: stroke.image.copy(bounds), x: bounds.x, y: bounds.y } : null));
        }
      } finally { ctx.setPreview(null); }
    },
    cancel(ctx) { strokes.delete(ctx); ctx.setPreview(null); },
  };
}
