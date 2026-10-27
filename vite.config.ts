import { defineConfig } from "vitest/config";
import { transformWithOxc } from "vite";
import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function offline(): Plugin {
  return {
    name: "pixelquill-offline", apply: "build", enforce: "post",
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));
        const publicFiles = await readdir(publicRoot, { recursive: true, withFileTypes: true });
        const assets = new Map<string, string | Uint8Array>();
        for (const entry of Object.values(bundle)) {
          assets.set(entry.fileName, entry.type === "chunk" ? entry.code : entry.source);
        }
        for (const entry of publicFiles) {
          if (!entry.isFile()) continue;
          const fullPath = `${entry.parentPath}/${entry.name}`;
          const path = fullPath.slice(publicRoot.length).replaceAll("\\", "/").replace(/^\//, "");
          assets.set(path, await readFile(fullPath));
        }
        const paths = [...assets.keys()].sort(), hash = createHash("sha256");
        for (const path of paths) { hash.update(path); hash.update(assets.get(path) ?? ""); }
        const cacheName = `pixelquill-${hash.digest("hex").slice(0, 16)}`;
        const source = await readFile(new URL("./src/sw.ts", import.meta.url), "utf8");
        const compiled = await transformWithOxc(source, "sw.ts", { target: "safari16" });
        this.emitFile({ type: "asset", fileName: "sw.js", source:
          `const __CACHE_NAME__=${JSON.stringify(cacheName)},__PRECACHE__=${JSON.stringify(paths)};\n${compiled.code}` });
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [offline()],
  build: {
    target: "safari16",
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
