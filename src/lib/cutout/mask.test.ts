import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMAGENET_MEAN,
  IMAGENET_STD,
  applyAlpha,
  applyThreshold,
  compositeOnBackground,
  minMaxNormalize,
  morph,
  resizeMaskBilinear,
  rgbToNchwTensor,
} from "./mask.ts";

describe("minMaxNormalize", () => {
  it("scales values to 0–1", () => {
    const out = minMaxNormalize(new Float32Array([2, 4, 6]));
    assert.deepEqual([...out], [0, 0.5, 1]);
  });

  it("returns zeros when the range is degenerate", () => {
    const out = minMaxNormalize(new Float32Array([3, 3, 3]));
    assert.deepEqual([...out], [0, 0, 0]);
  });
});

describe("applyThreshold", () => {
  it("hard mode emits a binary mask", () => {
    const out = applyThreshold(new Float32Array([0.1, 0.5, 0.9]), 0.5, "hard");
    assert.deepEqual([...out], [0, 1, 1]);
  });

  it("soft mode zeros below the threshold and keeps the rest", () => {
    const out = applyThreshold(new Float32Array([0.1, 0.5, 0.9]), 0.5, "soft");
    assert.equal(out[0], 0);
    assert.equal(out[1], 0.5);
    assert.ok(Math.abs(out[2] - 0.9) < 1e-6);
  });
});

describe("resizeMaskBilinear", () => {
  it("upsamples a 1×2 ramp without inventing values outside it", () => {
    const src = new Float32Array([0, 1]);
    const out = resizeMaskBilinear(src, 2, 1, 3, 1);
    assert.equal(out[0], 0);
    assert.ok(Math.abs(out[1] - 0.5) < 1e-5);
    assert.equal(out[2], 1);
  });
});

describe("morph", () => {
  it("dilate grows a center pixel into its neighbors", () => {
    const src = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const out = morph(src, 3, 3, 1, "dilate");
    assert.equal(out[0], 1);
    assert.equal(out[4], 1);
    assert.equal(out[8], 1);
  });

  it("erode shrinks an isolated pixel to zero", () => {
    const src = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const out = morph(src, 3, 3, 1, "erode");
    assert.deepEqual([...out], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("radius 0 returns a copy", () => {
    const src = new Float32Array([0.2, 0.8]);
    const out = morph(src, 2, 1, 0, "dilate");
    assert.ok(Math.abs(out[0] - 0.2) < 1e-6);
    assert.ok(Math.abs(out[1] - 0.8) < 1e-6);
    assert.notEqual(out, src);
  });
});

describe("rgbToNchwTensor", () => {
  it("writes ImageNet-normalized NCHW for a white pixel", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255]);
    const tensor = rgbToNchwTensor(rgba, 1, 1, IMAGENET_MEAN, IMAGENET_STD);
    const expectedR = (1 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const expectedG = (1 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    const expectedB = (1 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    assert.equal(tensor.length, 3);
    assert.ok(Math.abs(tensor[0] - expectedR) < 1e-5);
    assert.ok(Math.abs(tensor[1] - expectedG) < 1e-5);
    assert.ok(Math.abs(tensor[2] - expectedB) < 1e-5);
  });
});

describe("applyAlpha", () => {
  it("writes the mask into the alpha channel and leaves RGB", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    applyAlpha(rgba, new Float32Array([0, 1]));
    assert.deepEqual([...rgba], [10, 20, 30, 0, 40, 50, 60, 255]);
  });
});

describe("compositeOnBackground", () => {
  it("premultiplies onto a solid color and sets alpha to 255", () => {
    const rgba = new Uint8ClampedArray([100, 0, 0, 128]);
    const out = compositeOnBackground(rgba, [0, 200, 0]);
    assert.equal(out[3], 255);
    assert.equal(out[0], 50);
    assert.equal(out[1], 100);
    assert.equal(out[2], 0);
  });

  it("leaves pixels unchanged when no background is set", () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 4]);
    const out = compositeOnBackground(rgba, null);
    assert.deepEqual([...out], [1, 2, 3, 4]);
    assert.notEqual(out, rgba);
  });
});
