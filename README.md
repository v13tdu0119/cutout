# Cutout

Browser tool that removes a photo background with a **U-Net**. Drop a portrait, inspect the probability map, threshold it, download a PNG. Pixels stay on your machine.

Live site: [https://v13tdu0119.github.io/cutout/](https://v13tdu0119.github.io/cutout/)

It follows the pipeline in Ahmed & Singh, *Study on Image Background Removal using Deep Learning* (Journal of Data Science, 2024:06, CC BY 4.0): encoder–decoder segmentation, a binary (or soft) mask, optional morphological cleanup, then cutout. The network in the app is **U²-Net-P** (Qin et al., 2020) — a nested U-Net small enough to run in WebAssembly.

The paper focused on selfies and human portraits. That is still the sweet spot. Salient objects often work; busy scenes with many subjects will be messier.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). First load uses the local 4.4 MB ONNX weights in `/models/u2netp.onnx`.

## Windows desktop (D:\The Product\my tool)

This environment cannot write to your `D:` drive. On **your Windows PC**, from the Cutout project folder:

```powershell
powershell -ExecutionPolicy Bypass -File windows\Install-Cutout.ps1
```

That copies the app to `D:\The Product\my tool` and puts a **Cutout** icon in `Desktop\my tool`. Double-click the icon. First launch needs Node.js and the internet once (`npm install` + build). After that you can run it offline.

Install [Node.js](https://nodejs.org) first if you do not have it.

## What the studio shows

| Stage | Meaning |
| --- | --- |
| Original | The photo, scaled so the long edge is at most 1600 px |
| Probability | U-Net saliency after min–max normalization |
| Mask | Threshold ± grow/shrink |
| Cutout | Alpha applied, optional studio backdrop |

## Tests

```bash
npm test
```

## Credits

- Ahmed, F. A., & Singh, H. K. R. (2024). Study on Image Background Removal using Deep Learning. *Journal of Data Science*, 2024:06. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Qin, X., et al. (2020). U2-Net: Going Deeper with Nested U-Structure for Salient Object Detection. Weights via [rembg](https://github.com/danielgatis/rembg) (`u2netp.onnx`).
- Sample portrait: Vermeer’s *Girl with a Pearl Earring* (public domain), Wikimedia Commons.
