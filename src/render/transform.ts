export interface ViewTransform { zoom: number; panX: number; panY: number }
export interface Position { x: number; y: number }
export function clientToSprite(t: ViewTransform, x: number, y: number, left = 0, top = 0): Position {
  return { x: (x - left - t.panX) / t.zoom, y: (y - top - t.panY) / t.zoom };
}
export function spriteToClient(t: ViewTransform, x: number, y: number, left = 0, top = 0): Position {
  return { x: x * t.zoom + t.panX + left, y: y * t.zoom + t.panY + top };
}
export function zoomAt(t: ViewTransform, factor: number, x: number, y: number): ViewTransform {
  if (!Number.isFinite(factor) || factor <= 0) return t;
  const zoom = Math.min(64, Math.max(1, t.zoom * factor));
  const ratio = zoom / t.zoom;
  return { zoom, panX: x - (x - t.panX) * ratio, panY: y - (y - t.panY) * ratio };
}
export function fitTransform(width: number, height: number, spriteWidth: number, spriteHeight: number): ViewTransform {
  const zoom = Math.min(64, Math.max(1, Math.min(width / spriteWidth, height / spriteHeight) * 0.9));
  return { zoom, panX: (width - spriteWidth * zoom) / 2, panY: (height - spriteHeight * zoom) / 2 };
}
