import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const from = dirname(require.resolve("onnxruntime-web"));
const to = join(process.cwd(), "public", "ort");

mkdirSync(to, { recursive: true });

for (const file of readdirSync(from)) {
  if (file.startsWith("ort-wasm") && (file.endsWith(".wasm") || file.endsWith(".mjs"))) {
    copyFileSync(join(from, file), join(to, file));
  }
}

console.log(`Copied ONNX Runtime Web WASM assets from ${from} to ${to}`);
