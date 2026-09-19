import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_BYTES, publicAsset, validateImageFile } from "./file.ts";

describe("publicAsset", () => {
  it("prefixes the configured GitHub Pages base path", () => {
    const previous = process.env.NEXT_PUBLIC_BASE_PATH;
    process.env.NEXT_PUBLIC_BASE_PATH = "/cutout";
    try {
      assert.equal(publicAsset("/models/u2netp.onnx"), "/cutout/models/u2netp.onnx");
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_BASE_PATH;
      } else {
        process.env.NEXT_PUBLIC_BASE_PATH = previous;
      }
    }
  });
});

describe("validateImageFile", () => {
  it("accepts jpeg, png, and webp under the size cap", () => {
    assert.equal(
      validateImageFile({ type: "image/jpeg", size: 1200, name: "a.jpg" }),
      undefined,
    );
    assert.equal(
      validateImageFile({ type: "image/png", size: 2048, name: "a.png" }),
      undefined,
    );
    assert.equal(
      validateImageFile({ type: "image/webp", size: 4096, name: "a.webp" }),
      undefined,
    );
  });

  it("accepts image/jpg and an empty MIME when the name is a photo", () => {
    assert.equal(
      validateImageFile({ type: "image/jpg", size: 800, name: "IMG_0098.JPG" }),
      undefined,
    );
    assert.equal(
      validateImageFile({ type: "", size: 800, name: "holiday.jpeg" }),
      undefined,
    );
  });

  it("rejects empty files", () => {
    assert.throws(
      () => validateImageFile({ type: "image/png", size: 0, name: "a.png" }),
      /empty/i,
    );
  });

  it("rejects files over the size cap", () => {
    assert.throws(
      () => validateImageFile({ type: "image/png", size: MAX_BYTES + 1, name: "a.png" }),
      /40 MB/i,
    );
  });

  it("rejects non-image types", () => {
    assert.throws(
      () => validateImageFile({ type: "application/pdf", size: 100, name: "a.pdf" }),
      /JPEG, PNG, or WebP/,
    );
  });

  it("rejects HEIC with a conversion hint", () => {
    assert.throws(
      () =>
        validateImageFile({
          type: "image/heic",
          size: 2_000_000,
          name: "IMG_1234.HEIC",
        }),
      /HEIC/,
    );
  });
});
