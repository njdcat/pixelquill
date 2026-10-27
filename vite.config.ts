import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    target: "safari16",
    outDir: "dist",
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
