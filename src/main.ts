import { createSprite, EditorDocument, imageLayers } from "./doc/index";
import { bindPointer } from "./input/pointer";
import { AutosaveStore } from "./io/storage";
import { CanvasView } from "./render/view";
import { App } from "./ui/app";

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function saveError(error: unknown): string {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? "Autosave failed: storage full. Keep this page open and free device storage."
    : `Autosave failed: ${message(error)}. Keep this page open and retry after checking device storage.`;
}
async function start(root: HTMLElement): Promise<void> {
  const store = new AutosaveStore();
  let sprite = createSprite(64, 64), initialStatus = "Saved";
  try { sprite = await store.load() ?? sprite; }
  catch (error) { initialStatus = `Autosave could not be restored: ${message(error)} Started a fresh 64 × 64 sprite.`; }
  const doc = new EditorDocument(sprite), app = new App(root, doc), view = new CanvasView(app.viewport, doc);
  const input = bindPointer(app.editor, view, doc, () => app.tool, () => ({
    doc, layerId: imageLayers(doc.sprite)[0]?.id ?? -1, frame: 0, fg: app.fg, bg: 0,
    brush: { shape: "square", size: 1 }, pixelPerfect: false, pressureSize: app.pressureSize,
    selection: null, setPreview: preview => { view.setPreview(preview); },
  }));
  app.beforeAction = () => { input.finish(); }; app.onFit = () => { view.fitToScreen(); };
  view.onViewChange = () => { app.setZoom(view.zoom); };
  app.setZoom(view.zoom); app.setStatus(initialStatus);
  let revision = 0, savedRevision = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;
  async function save(): Promise<void> {
    clearTimeout(timer);
    if (saving) { await saving; if (savedRevision !== revision) await save(); return; }
    if (revision === savedRevision) return;
    const version = revision;
    app.setStatus("Saving");
    const operation = store.save(doc.sprite).then(() => {
      savedRevision = version;
      if (revision === version) { doc.markSaved(); app.setStatus("Saved"); }
    }).catch((error: unknown) => { app.setStatus(saveError(error)); });
    saving = operation;
    await operation; saving = null;
  }
  doc.subscribe(() => {
    revision++; app.setStatus("Saving"); clearTimeout(timer);
    timer = setTimeout(() => { void save(); }, 1000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { input.finish(); void save(); }
  });
  window.addEventListener("pagehide", () => { input.finish(); void save(); });
  void store.requestPersist().catch((error: unknown) => {
    app.setStatus(`Storage persistence unavailable: ${message(error)}. Keep this app installed and device storage available.`);
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    let controlled = navigator.serviceWorker.controller !== null;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled) app.showUpdate();
      controlled = true;
    });
    try { await navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: "./" }); }
    catch (error) { app.setStatus(`Offline setup failed: ${message(error)}. Reopen the app while connected.`); }
  }
}
const root = document.getElementById("app");
if (root) {
  void start(root).catch((error: unknown) => { root.textContent = `Pixelquill could not start: ${message(error)}. Reload to try again.`; });
}
