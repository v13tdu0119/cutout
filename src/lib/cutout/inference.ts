import { MODEL_SIZE, minMaxNormalize, rgbToNchwTensor, resizeMaskBilinear } from "./mask";

export const MODEL_URL = "/models/u2netp.onnx";
export const WASM_MJS = "/ort/ort-wasm-simd-threaded.mjs";
export const WASM_BINARY = "/ort/ort-wasm-simd-threaded.wasm";

type OrtModule = typeof import("onnxruntime-web/wasm");
type InferenceSession = import("onnxruntime-web").InferenceSession;

let ortPromise: Promise<OrtModule> | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

const progressListeners = new Set<(message: string) => void>();

export function onModelProgress(listener: (message: string) => void): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitProgress(message: string): void {
  for (const listener of progressListeners) listener(message);
}

async function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    emitProgress("Starting ONNX Runtime…");
    ortPromise = import("onnxruntime-web/wasm").then((ort) => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = {
        mjs: WASM_MJS,
        wasm: WASM_BINARY,
      };
      return ort;
    });
  }
  return ortPromise;
}

async function downloadModel(): Promise<ArrayBuffer> {
  emitProgress("Downloading U²-Net…");
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error("Could not download the U-Net weights.");
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body || !total) {
    return response.arrayBuffer();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      emitProgress(`Downloading U²-Net ${Math.min(99, Math.round((received / total) * 100))}%`);
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function getSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt();
      const model = await downloadModel();
      emitProgress("Compiling U²-Net…");
      const session = await ort.InferenceSession.create(model, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      emitProgress("Model ready");
      return session;
    })().catch((reason: unknown) => {
      sessionPromise = null;
      ortPromise = null;
      throw reason;
    });
  }
  return sessionPromise;
}

export async function inferProbabilityMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Float32Array> {
  const ort = await loadOrt();
  const session = await getSession();
  const scaled = scaleRgba(rgba, width, height, MODEL_SIZE, MODEL_SIZE);
  const tensorData = rgbToNchwTensor(
    scaled,
    MODEL_SIZE,
    MODEL_SIZE,
    [0.485, 0.456, 0.406],
    [0.229, 0.224, 0.225],
  );
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const tensor = new ort.Tensor("float32", tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const result = await session.run({ [inputName]: tensor });
  const raw = result[outputName].data;
  const normalized = minMaxNormalize(
    raw instanceof Float32Array ? raw : Float32Array.from(raw as ArrayLike<number>),
  );
  return resizeMaskBilinear(normalized, MODEL_SIZE, MODEL_SIZE, width, height);
}

function scaleRgba(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const src = makeCanvas(srcW, srcH);
  const srcCtx = src.getContext("2d");
  if (!srcCtx) throw new Error("Could not create a canvas to prepare the photo.");
  srcCtx.putImageData(new ImageData(new Uint8ClampedArray(rgba), srcW, srcH), 0, 0);
  const dst = makeCanvas(dstW, dstH);
  const dstCtx = dst.getContext("2d");
  if (!dstCtx) throw new Error("Could not create a canvas to prepare the photo.");
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = "high";
  dstCtx.drawImage(src as CanvasImageSource, 0, 0, dstW, dstH);
  return dstCtx.getImageData(0, 0, dstW, dstH).data;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
