import type { ToolPreview } from "../contracts";
import { alpha, blue, green, red, rgba } from "../doc/index";
import type { Layer, Sprite } from "../doc/index";

/** Straight RGBA source-over; layer arrays are stored bottom to top. */
export function compositeFrame(sprite: Sprite, frame: number, preview: ToolPreview | null, out: Uint32Array): void {
  if (out.length !== sprite.width * sprite.height) throw new RangeError("Composite buffer must match sprite size");
  out.fill(0);
  function draw(layer: Layer, inherited: number): void {
    if (!layer.visible) return;
    const opacity = inherited * layer.opacity / 255;
    if (layer.kind === "group") {
      for (const child of layer.children) draw(child, opacity);
      return;
    }
    const cel = layer.cels.get(frame)?.data;
    const replacement = preview?.layerId === layer.id && preview.frame === frame ? preview : null;
    const source = replacement ?? cel;
    if (!source) return;
    const effective = opacity * (cel?.opacity ?? 255) / 255;
    const { image, x: dx, y: dy } = source;
    for (let y = Math.max(0, dy); y < Math.min(sprite.height, dy + image.height); y++) {
      for (let x = Math.max(0, dx); x < Math.min(sprite.width, dx + image.width); x++) {
        const s = image.get(x - dx, y - dy), sa = alpha(s) / 255 * effective;
        if (sa === 0) continue;
        const i = y * sprite.width + x, d = out[i] ?? 0;
        const da = alpha(d) / 255, a = sa + da * (1 - sa);
        const channel = (s: number, d: number): number => Math.round((s * sa + d * da * (1 - sa)) / a);
        out[i] = rgba(channel(red(s), red(d)), channel(green(s), green(d)),
          channel(blue(s), blue(d)), Math.round(a * 255));
      }
    }
  }
  draw(sprite.root, 1);
}
