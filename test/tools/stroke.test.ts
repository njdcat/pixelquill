import { expect, test } from "vitest";
import type { ToolContext, ToolPoint, ToolPreview } from "../../src/contracts";
import { addLayer, createSprite, EditorDocument, imageLayers, PixelImage, rgba, SelectionMask, setCel, setLayerProps } from "../../src/doc/index";
import { pencilTool } from "../../src/tools/pencil";
import { eraserTool } from "../../src/tools/eraser";

const point = (x: number, y: number, pressure = 0.5): ToolPoint => ({ x, y, pressure, time: 0 });
function setup(size = 16) {
  const doc = new EditorDocument(createSprite(size, size));
  let preview: ToolPreview | null = null;
  const ctx: ToolContext = { doc, layerId: 1, frame: 0, fg: rgba(12, 34, 56), bg: 0,
    brush: { size: 1, shape: "square" }, pressureSize: false, pixelPerfect: false, selection: null,
    setPreview(value) { preview = value; } };
  const image = (): PixelImage => { if (!preview) throw new Error("Missing preview"); return preview.image; };
  const cel = () => imageLayers(doc.sprite)[0]?.cels.get(0)?.data;
  return { doc, ctx, image, cel, preview: () => preview };
}
test("connects distant points without gaps, keeps document unchanged until end, and crops commit", () => {
  const { doc, ctx, image, cel, preview } = setup();
  pencilTool.begin(ctx, point(2.9, 3.1)); pencilTool.move(ctx, [point(12.1, 3.8)]);
  for (let x = 2; x <= 12; x++) expect(image().get(x, 3)).toBe(ctx.fg);
  expect(cel()).toBeUndefined(); expect(doc.history.canUndo).toBe(false);
  pencilTool.end(ctx);
  expect(cel()).toMatchObject({ x: 2, y: 3, image: { width: 11, height: 1 } });
  expect(preview()).toBeNull(); doc.undo(); expect(cel()).toBeUndefined();
  expect(doc.history.canUndo).toBe(false); doc.redo(); expect(cel()?.image.get(5, 0)).toBe(ctx.fg);
});
test("diagonal and reverse Bresenham segments stay continuous", () => {
  const { ctx, image } = setup(); pencilTool.begin(ctx, point(14, 14));
  pencilTool.move(ctx, [point(1, 1), point(1, 12)]);
  for (let i = 1; i <= 14; i++) expect(image().get(i, i)).toBe(ctx.fg);
  for (let i = 1; i <= 12; i++) expect(image().get(1, i)).toBe(ctx.fg);
  pencilTool.cancel(ctx);
});
test("circle excludes square corners and even brush sizes stay within their bounds", () => {
  const { ctx, image } = setup(); ctx.brush = { size: 5, shape: "square" };
  pencilTool.begin(ctx, point(8, 8)); expect(image().get(6, 6)).toBe(ctx.fg); pencilTool.cancel(ctx);
  ctx.brush.shape = "circle"; pencilTool.begin(ctx, point(8, 8));
  expect(image().get(6, 6)).toBe(0); expect(image().get(8, 6)).toBe(ctx.fg); pencilTool.cancel(ctx);
  ctx.brush = { size: 2, shape: "square" }; pencilTool.begin(ctx, point(8, 8));
  expect(image().contentBounds()).toEqual({ x: 7, y: 7, w: 2, h: 2 }); pencilTool.cancel(ctx);
});
test("eraser removes pixels in the preview, deletes empty cels, and undo restores", () => {
  const { ctx, image, cel, doc } = setup();
  pencilTool.begin(ctx, point(4, 5)); pencilTool.end(ctx);
  eraserTool.begin(ctx, point(4, 5)); expect(image().get(4, 5)).toBe(0);
  expect(cel()?.image.get(0, 0)).toBe(ctx.fg); eraserTool.end(ctx); expect(cel()).toBeUndefined();
  doc.undo(); expect(cel()).toMatchObject({ x: 4, y: 5 }); expect(cel()?.image.get(0, 0)).toBe(ctx.fg);
});
test("selection masks painting and erasing", () => {
  const { ctx, image, cel } = setup(); ctx.brush.size = 5;
  ctx.selection = SelectionMask.rect(16, 16, { x: 8, y: 8, w: 1, h: 1 });
  pencilTool.begin(ctx, point(8, 8)); expect(image().contentBounds()).toEqual({ x: 8, y: 8, w: 1, h: 1 });
  pencilTool.end(ctx); ctx.selection = new SelectionMask(16, 16);
  eraserTool.begin(ctx, point(8, 8)); eraserTool.end(ctx); expect(cel()?.image.get(0, 0)).toBe(ctx.fg);
});
test.each([{ locked: true }, { visible: false }])("refuses layer %j", props => {
  const { ctx, doc, preview } = setup(); doc.execute(setLayerProps(1, props));
  pencilTool.begin(ctx, point(1, 1)); pencilTool.move(ctx, [point(3, 3)]); pencilTool.end(ctx);
  expect(preview()).toBeNull(); expect(imageLayers(doc.sprite)[0]?.cels.size).toBe(0);
});
test("refuses hidden or locked ancestors", () => {
  const { ctx, doc, preview } = setup();
  doc.execute(addLayer(0, 1, { kind: "group", locked: true })); doc.execute(addLayer(2, 0)); ctx.layerId = 3;
  pencilTool.begin(ctx, point(1, 1)); expect(preview()).toBeNull();
});
test("cancel clears preview without commands and existing offset cels are copied", () => {
  const { ctx, doc, image, cel, preview } = setup();
  const original = new PixelImage(2, 1); original.fill(ctx.fg); doc.execute(setCel(1, 0, { image: original, x: 4, y: 5 }));
  pencilTool.begin(ctx, point(8, 8)); expect(image().get(4, 5)).toBe(ctx.fg);
  pencilTool.cancel(ctx); expect(preview()).toBeNull(); expect(cel()?.image).toBe(original);
  doc.undo(); expect(cel()).toBeUndefined();
});
test("pressure size doubles at full pressure, stays at least one, and caps at 64", () => {
  const { ctx, image } = setup(128); ctx.pressureSize = true; ctx.brush.size = 4;
  pencilTool.begin(ctx, point(64, 64, 1)); expect(image().contentBounds()?.w).toBe(8); pencilTool.cancel(ctx);
  pencilTool.begin(ctx, point(64, 64, 0)); expect(image().contentBounds()?.w).toBe(1); pencilTool.cancel(ctx);
  ctx.brush.size = 64; pencilTool.begin(ctx, point(64, 64, 1)); expect(image().contentBounds()?.w).toBe(64); pencilTool.cancel(ctx);
});
test("short subpixel stroke begins with a dot", () => {
  const { ctx, cel } = setup(); pencilTool.begin(ctx, point(4.2, 5.2)); pencilTool.move(ctx, [point(4.3, 5.3)]); pencilTool.end(ctx);
  expect(cel()).toMatchObject({ x: 4, y: 5, image: { width: 1, height: 1 } });
});
