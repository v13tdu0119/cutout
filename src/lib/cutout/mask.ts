export const MODEL_SIZE = 320;
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export type MatteMode = "soft" | "hard";
export type MorphMode = "dilate" | "erode";

export function minMaxNormalize(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const out = new Float32Array(values.length);
  const range = max - min;
  if (range < 1e-6) return out;
  for (let i = 0; i < values.length; i++) {
    out[i] = (values[i] - min) / range;
  }
  return out;
}

export function applyThreshold(
  probabilities: Float32Array,
  threshold: number,
  mode: MatteMode,
): Float32Array {
  const out = new Float32Array(probabilities.length);
  for (let i = 0; i < probabilities.length; i++) {
    const p = probabilities[i];
    if (mode === "hard") {
      out[i] = p >= threshold ? 1 : 0;
    } else {
      out[i] = p < threshold ? 0 : p;
    }
  }
  return out;
}

export function resizeMaskBilinear(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  if (dstW === 1 && dstH === 1) {
    dst[0] = src[0] ?? 0;
    return dst;
  }
  const xRatio = srcW === 1 ? 0 : (srcW - 1) / Math.max(dstW - 1, 1);
  const yRatio = srcH === 1 ? 0 : (srcH - 1) / Math.max(dstH - 1, 1);
  for (let y = 0; y < dstH; y++) {
    const fy = y * yRatio;
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const ly = fy - y0;
    for (let x = 0; x < dstW; x++) {
      const fx = x * xRatio;
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const lx = fx - x0;
      const v00 = src[y0 * srcW + x0];
      const v10 = src[y0 * srcW + x1];
      const v01 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];
      dst[y * dstW + x] =
        v00 * (1 - lx) * (1 - ly) +
        v10 * lx * (1 - ly) +
        v01 * (1 - lx) * ly +
        v11 * lx * ly;
    }
  }
  return dst;
}

export function morph(
  mask: Float32Array,
  width: number,
  height: number,
  radius: number,
  mode: MorphMode,
): Float32Array {
  const out = new Float32Array(mask.length);
  if (radius <= 0) {
    out.set(mask);
    return out;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = mode === "dilate" ? 0 : 1;
      for (let ky = y - radius; ky <= y + radius; ky++) {
        if (ky < 0 || ky >= height) continue;
        for (let kx = x - radius; kx <= x + radius; kx++) {
          if (kx < 0 || kx >= width) continue;
          const value = mask[ky * width + kx];
          if (mode === "dilate") best = Math.max(best, value);
          else best = Math.min(best, value);
        }
      }
      out[y * width + x] = best;
    }
  }
  return out;
}

export function rgbToNchwTensor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mean: readonly number[],
  std: readonly number[],
): Float32Array {
  const plane = width * height;
  const tensor = new Float32Array(3 * plane);
  let maxValue = 1e-6;
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    maxValue = Math.max(maxValue, rgba[o], rgba[o + 1], rgba[o + 2]);
  }
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    tensor[i] = (rgba[o] / maxValue - mean[0]) / std[0];
    tensor[i + plane] = (rgba[o + 1] / maxValue - mean[1]) / std[1];
    tensor[i + 2 * plane] = (rgba[o + 2] / maxValue - mean[2]) / std[2];
  }
  return tensor;
}

export function applyAlpha(rgba: Uint8ClampedArray, alpha: Float32Array): void {
  for (let i = 0; i < alpha.length; i++) {
    rgba[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
  }
}

export function compositeOnBackground(
  rgba: Uint8ClampedArray,
  background: readonly [number, number, number] | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  if (!background) return out;
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    out[i] = Math.round(out[i] * a + background[0] * (1 - a));
    out[i + 1] = Math.round(out[i + 1] * a + background[1] * (1 - a));
    out[i + 2] = Math.round(out[i + 2] * a + background[2] * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

export function finishMatte(
  probability: Float32Array,
  width: number,
  height: number,
  options: {
    threshold: number;
    mode: MatteMode;
    edge: number;
  },
): Float32Array {
  let mask = applyThreshold(probability, options.threshold, options.mode);
  if (options.edge > 0) mask = morph(mask, width, height, options.edge, "dilate");
  if (options.edge < 0) mask = morph(mask, width, height, -options.edge, "erode");
  return mask;
}

export function probabilityToHeatmap(alpha: Float32Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    const t = Math.min(1, Math.max(0, alpha[i]));
    const o = i * 4;
    rgba[o] = Math.round(20 + 220 * t);
    rgba[o + 1] = Math.round(40 + 80 * (1 - t));
    rgba[o + 2] = Math.round(160 * (1 - t));
    rgba[o + 3] = 255;
  }
  return rgba;
}

export function maskToGrayscale(alpha: Float32Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
    const o = i * 4;
    rgba[o] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return rgba;
}
