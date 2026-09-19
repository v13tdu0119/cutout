export const MAX_EDGE = 1600;

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  try {
    return await decodeFromUrl(URL.createObjectURL(file), true);
  } catch {
    const dataUrl = await readAsDataUrl(file);
    return decodeFromUrl(dataUrl, false);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("That file could not be read as an image."));
    };
    reader.onerror = () => reject(new Error("That file could not be read as an image."));
    reader.readAsDataURL(file);
  });
}

function decodeFromUrl(url: string, revoke: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const fail = () => {
      if (revoke) URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image. Try a JPEG or PNG."));
    };
    image.onload = () => {
      const finish = () => {
        if (image.naturalWidth < 1 || image.naturalHeight < 1) {
          fail();
          return;
        }
        if (revoke) URL.revokeObjectURL(url);
        resolve(image);
      };
      if (typeof image.decode === "function") {
        image.decode().then(finish).catch(fail);
      } else {
        finish();
      }
    };
    image.onerror = fail;
    image.src = url;
  });
}

export function rasterizeImage(image: HTMLImageElement, maxEdge = MAX_EDGE): {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
} {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(image, 0, 0, width, height);
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

export function paintRgba(
  canvas: HTMLCanvasElement,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
}

export async function rgbaToPngBlob(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not encode a PNG.");
  return blob;
}
