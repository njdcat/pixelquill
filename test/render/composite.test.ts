import { expect, test } from "vitest";
import { addLayer, createSprite, EditorDocument, findLayer, imageLayers, PixelImage, rgba, setCel, setLayerProps } from "../../src/doc/index";
import { compositeFrame } from "../../src/render/composite";

function fixture() {
  const doc = new EditorDocument(createSprite(2, 2));
  const image = new PixelImage(2, 2); image.fill(rgba(255, 0, 0));
  doc.execute(setCel(1, 0, { image, x: 0, y: 0 }));
  const out = new Uint32Array(4);
  return { doc, image, out, render: () => { compositeFrame(doc.sprite, 0, null, out); return [...out]; } };
}
test("composites bottom to top with source-over straight RGBA", () => {
  const { doc, out, render } = fixture();
  doc.execute(addLayer(0, 1));
  const image = new PixelImage(1, 1); image.fill(rgba(0, 0, 255, 128));
  doc.execute(setCel(2, 0, { image, x: 1, y: 0 }));
  render(); expect(out[0]).toBe(rgba(255, 0, 0)); expect(out[1]).toBe(rgba(127, 0, 128));
});
test("multiplies nested group, layer, cel, and pixel opacities", () => {
  const { doc, image, out } = fixture();
  doc.execute(addLayer(0, 1, { kind: "group", opacity: 128 }));
  doc.execute(addLayer(2, 0, { kind: "group", opacity: 128 }));
  doc.execute(addLayer(3, 0, { opacity: 128 }));
  doc.execute(setLayerProps(1, { visible: false }));
  image.fill(rgba(10, 20, 30, 128));
  doc.execute(setCel(4, 0, { image, x: 0, y: 0 }));
  const cel = imageLayers(doc.sprite).find(l => l.id === 4)?.cels.get(0);
  if (!cel) throw new Error("Missing test cel");
  cel.data.opacity = 128;
  compositeFrame(doc.sprite, 0, null, out);
  expect(out[0]).toBe(rgba(10, 20, 30, 8));
});
test("hidden groups and layers are skipped and every render clears the buffer", () => {
  const { doc, out, render } = fixture();
  doc.execute(addLayer(0, 1, { kind: "group", visible: false }));
  doc.execute(addLayer(2, 0));
  const image = new PixelImage(1, 1); image.fill(rgba(0, 0, 255));
  doc.execute(setCel(3, 0, { image, x: 0, y: 0 }));
  expect(render()[0]).toBe(rgba(255, 0, 0));
  doc.execute(setLayerProps(1, { visible: false }));
  expect(render()).toEqual([0, 0, 0, 0]);
  out.fill(0xffffffff); compositeFrame(doc.sprite, 1, null, out); expect([...out]).toEqual([0, 0, 0, 0]);
});
test("preview replaces the entire cel, including transparent pixels and position", () => {
  const { doc, out } = fixture();
  const image = new PixelImage(1, 1);
  compositeFrame(doc.sprite, 0, { layerId: 1, frame: 0, x: 1, y: 1, image }, out);
  expect([...out]).toEqual([0, 0, 0, 0]);
  image.fill(rgba(0, 255, 0));
  compositeFrame(doc.sprite, 0, { layerId: 1, frame: 0, x: 1, y: 1, image }, out);
  expect([...out]).toEqual([0, 0, 0, rgba(0, 255, 0)]);
  compositeFrame(doc.sprite, 0, { layerId: 1, frame: 1, x: 0, y: 0, image }, out);
  expect(out[0]).toBe(rgba(255, 0, 0));
});
test("preview also draws on a missing cel, clips edges, and honors layer visibility", () => {
  const doc = new EditorDocument(createSprite(2, 2)), image = new PixelImage(2, 2), out = new Uint32Array(4);
  image.fill(rgba(0, 255, 0));
  const preview = { layerId: 1, frame: 0, x: -1, y: -1, image };
  compositeFrame(doc.sprite, 0, preview, out); expect([...out]).toEqual([rgba(0, 255, 0), 0, 0, 0]);
  doc.execute(setLayerProps(1, { visible: false }));
  compositeFrame(doc.sprite, 0, preview, out); expect([...out]).toEqual([0, 0, 0, 0]);
});
test("unimplemented blend modes behave as normal and root visibility is honored", () => {
  const { doc, render } = fixture();
  doc.execute(setLayerProps(1, { blendMode: "multiply" }));
  expect(render()[0]).toBe(rgba(255, 0, 0));
  const root = findLayer(doc.sprite, 0);
  if (!root) throw new Error("Missing root");
  root.visible = false; expect(render()).toEqual([0, 0, 0, 0]);
});
test("rejects a buffer with the wrong dimensions", () => {
  expect(() => compositeFrame(createSprite(2, 2), 0, null, new Uint32Array(1))).toThrow(/buffer/);
});
