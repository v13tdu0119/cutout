# Cutout — U-Net background removal

**Source:** Ahmed, F. A. & Singh, H. K. R. (2024). *Study on Image Background Removal using Deep Learning*. Journal of Data Science, Vol. 2024:06. CC BY 4.0.

## Product

A browser studio that isolates a subject from a photo using the paper’s semantic-segmentation pipeline. Images never leave the device.

The paper trained a U-Net on portraits (selfies / people) rather than “any object.” Cutout ships a pretrained **U²-Net-P** (nested U-Net, Qin et al., 2020) — the same encoder–decoder + skip-connection idea, small enough (4.4 MB) to run in WebAssembly.

## Pipeline (matches the paper)

1. **Input** — RGB photo, resized to 320×320 for the network (ImageNet mean/std, NCHW).
2. **U-Net inference** — per-pixel foreground probability.
3. **Min–max normalize** the saliency map to `[0, 1]`, bilinear-resize to the original frame.
4. **Threshold** — paper: binary mask. Cutout also offers a soft matte (keep probabilities above the threshold) for hair and edges.
5. **Post-process** — morphological grow/shrink (the paper’s “morphological operations”).
6. **Composite** — apply the mask as alpha; optional solid studio backdrop; download PNG.

## Out of scope

Training a new U-Net, Mask R-CNN, DeepLab, or sending pixels to a cloud API.

## UI

Empty dropzone, loading (model + inference), error (type/size/inference), and a result view with four stages: Original, Probability, Binary mask, Cutout. Threshold, matte mode, edge grow/shrink, and backdrop are local and instant after the first inference.
