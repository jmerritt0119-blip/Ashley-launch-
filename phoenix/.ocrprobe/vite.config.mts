import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "tesseract.js": resolve(__dirname, "stub.ts") } },
  build: {
    outDir: resolve(__dirname, "out"), emptyOutDir: true,
    lib: { entry: resolve(__dirname, "../src/ocr.ts"), formats: ["es"], fileName: "ocr" },
  },
});
