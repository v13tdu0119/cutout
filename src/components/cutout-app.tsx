"use client";

import { ModelSplash } from "@/components/model-splash";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadImageFromFile, paintRgba, rasterizeImage, rgbaToPngBlob } from "@/lib/cutout/canvas";
import { publicAsset, validateImageFile } from "@/lib/cutout/file";
import { getSession, inferProbabilityMask, onModelProgress } from "@/lib/cutout/inference";
import {
  applyAlpha,
  compositeOnBackground,
  finishMatte,
  maskToGrayscale,
  probabilityToHeatmap,
  type MatteMode,
} from "@/lib/cutout/mask";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Download,
  ImagePlus,
  LoaderCircle,
  ScanEye,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Stage = "original" | "probability" | "mask" | "cutout";
type Status = "idle" | "running" | "ready" | "error";

type Backdrop = {
  id: string;
  label: string;
  color: readonly [number, number, number] | null;
  swatch: string;
};

const BACKDROPS: Backdrop[] = [
  { id: "transparent", label: "Transparent", color: null, swatch: "checker" },
  { id: "white", label: "Paper", color: [248, 246, 241], swatch: "#f8f6f1" },
  { id: "black", label: "Ink", color: [18, 16, 14], swatch: "#12100e" },
  { id: "gray", label: "Studio", color: [214, 208, 198], swatch: "#d6d0c6" },
  { id: "green", label: "Key", color: [0, 176, 64], swatch: "#00b040" },
  { id: "amber", label: "Safelight", color: [92, 42, 12], swatch: "#5c2a0c" },
];

type Frame = {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  probability: Float32Array;
  elapsedMs: number;
};

function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function humanizeFailure(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/wasm|onnx|create session|no available backend|failed to fetch/i.test(message)) {
    return "The U-Net model could not run on this photo. Refresh and try a smaller JPEG or PNG.";
  }
  return message || "Background removal failed.";
}

export function CutoutApp() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState("Warming up U²-Net…");
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [modelPhase, setModelPhase] = useState("Starting ONNX Runtime…");
  const [modelPercent, setModelPercent] = useState(8);
  const [modelFailed, setModelFailed] = useState(false);
  const [modelEpoch, setModelEpoch] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [stage, setStage] = useState<Stage>("cutout");
  const [threshold, setThreshold] = useState(0.45);
  const [mode, setMode] = useState<MatteMode>("soft");
  const [edge, setEdge] = useState(0);
  const [backdropId, setBackdropId] = useState("transparent");

  const backdrop = BACKDROPS.find((item) => item.id === backdropId) ?? BACKDROPS[0];

  useEffect(() => {
    const stop = onModelProgress((progress) => {
      setModelPhase(progress.message);
      setModelPercent(progress.percent);
    });
    let ignore = false;
    getSession()
      .then(() => {
        if (ignore) return;
        setModelReady(true);
        setModelFailed(false);
        setModelPhase("Model ready");
        setModelPercent(100);
      })
      .catch((reason: unknown) => {
        if (ignore) return;
        setModelReady(false);
        setModelFailed(true);
        setModelPhase("Model failed");
        setError(reason instanceof Error ? reason.message : "Could not load the U-Net model.");
        setStatus("error");
      });
    return () => {
      ignore = true;
      stop();
    };
  }, [modelEpoch]);

  useEffect(() => {
    if (!modelReady) return;
    const timer = window.setTimeout(() => setShowSplash(false), 450);
    return () => window.clearTimeout(timer);
  }, [modelReady]);

  const matte = useMemo(() => {
    if (!frame) return null;
    return finishMatte(frame.probability, frame.width, frame.height, {
      threshold,
      mode,
      edge,
    });
  }, [edge, frame, mode, threshold]);

  const viewPixels = useMemo(() => {
    if (!frame || !matte) return null;
    if (stage === "original") return new Uint8ClampedArray(frame.rgba);
    if (stage === "probability") return probabilityToHeatmap(frame.probability);
    if (stage === "mask") return maskToGrayscale(matte);
    const cut = new Uint8ClampedArray(frame.rgba);
    applyAlpha(cut, matte);
    return compositeOnBackground(cut, backdrop.color);
  }, [backdrop.color, frame, matte, stage]);

  useEffect(() => {
    if (!viewPixels || !frame || !viewRef.current) return;
    paintRgba(viewRef.current, viewPixels, frame.width, frame.height);
  }, [frame, viewPixels]);

  const runFile = useCallback(async (file: File) => {
    try {
      validateImageFile(file);
      setError(null);
      setStatus("running");
      setPhase(modelReady ? "Predicting the foreground mask…" : "Loading U²-Net, then predicting the mask…");
      const image = await loadImageFromFile(file);
      const raster = rasterizeImage(image);
      const started = performance.now();
      const probability = await inferProbabilityMask(raster.rgba, raster.width, raster.height);
      setFrame({
        name: file.name || "photo",
        width: raster.width,
        height: raster.height,
        rgba: raster.rgba,
        probability,
        elapsedMs: performance.now() - started,
      });
      setStage("cutout");
      setStatus("ready");
      setModelReady(true);
    } catch (reason) {
      console.error("Cutout failed", reason);
      setStatus(frame ? "ready" : "idle");
      setError(humanizeFailure(reason));
    }
  }, [frame, modelReady]);

  async function onSample() {
    const response = await fetch(publicAsset("/samples/portrait.jpg"));
    if (!response.ok) {
      setError("The sample portrait could not be downloaded.");
      setStatus("error");
      return;
    }
    const blob = await response.blob();
    await runFile(new File([blob], "pearl-earring.jpg", { type: blob.type || "image/jpeg" }));
  }

  async function onDownload() {
    if (!frame || !matte) return;
    const cut = new Uint8ClampedArray(frame.rgba);
    applyAlpha(cut, matte);
    const composed = compositeOnBackground(cut, backdrop.color);
    const blob = await rgbaToPngBlob(composed, frame.width, frame.height);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${frame.name.replace(/\.[^.]+$/, "")}-cutout.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void runFile(file);
  }

  const busy = status === "running";

  if (showSplash) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <ModelSplash
          phase={modelPhase}
          percent={modelPercent}
          failed={modelFailed}
          error={error}
          onRetry={() => {
            setError(null);
            setStatus("idle");
            setModelFailed(false);
            setModelPhase("Starting ONNX Runtime…");
            setModelPercent(8);
            setModelEpoch((n) => n + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-white/8 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.28em] text-amber-200/80 uppercase">
              On-device U-Net
            </p>
            <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
              Cutout
            </h1>
          </div>
          <Badge
            variant={modelFailed ? "destructive" : "outline"}
            className="inline-flex max-w-[60%] gap-1.5"
          >
            {!modelReady && !modelFailed ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : null}
            {modelReady ? "Model ready" : modelFailed ? "Model failed" : modelPhase}
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Drop a portrait. A nested U-Net predicts a foreground mask, you threshold it,
          and the background falls away — the pipeline from Ahmed &amp; Singh (2024),
          running in this browser.
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not cut out that photo</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!frame ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "relative flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center transition-colors",
              dragging
                ? "border-amber-300 bg-amber-200/10"
                : "border-white/15 bg-card/40 hover:border-amber-200/50",
            )}
          >
            <label
              htmlFor="cutout-file"
              className={cn(
                "absolute inset-0 z-0 cursor-pointer rounded-2xl",
                busy && "pointer-events-none",
              )}
            >
              <span className="sr-only">Choose a photo</span>
            </label>
            <div className="pointer-events-none relative z-10 space-y-4">
              {busy ? (
                <LoaderCircle className="mx-auto size-8 animate-spin text-amber-200" />
              ) : (
                <ImagePlus className="mx-auto size-8 text-amber-200" />
              )}
              <div className="space-y-1">
                <p className="text-base font-medium">
                  {busy ? phase : "Drop a photo, or click to choose one"}
                </p>
                <p className="text-sm text-muted-foreground">
                  JPEG, PNG, or WebP · under 40 MB · iPhone HEIC needs a JPEG export
                </p>
              </div>
            </div>
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
              <label
                htmlFor="cutout-file"
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "cursor-pointer",
                  busy && "pointer-events-none opacity-50",
                )}
              >
                <ImagePlus />
                Choose a photo
              </label>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void onSample()}
              >
                <Sparkles />
                Try the sample portrait
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Studio</CardTitle>
                    <CardDescription>
                      {frame.name} · {frame.width}×{frame.height} · mask in{" "}
                      {formatMs(frame.elapsedMs)}
                    </CardDescription>
                  </div>
                  <Tabs value={stage} onValueChange={(value) => setStage(value as Stage)}>
                    <TabsList>
                      <TabsTrigger value="original">Original</TabsTrigger>
                      <TabsTrigger value="probability">Probability</TabsTrigger>
                      <TabsTrigger value="mask">Mask</TabsTrigger>
                      <TabsTrigger value="cutout">Cutout</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div
                  className={cn(
                    "relative flex min-h-[280px] items-center justify-center sm:min-h-[420px]",
                    stage === "cutout" && backdrop.id === "transparent"
                      ? "bg-checker"
                      : "bg-black/40",
                  )}
                >
                  {busy ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-sm">
                      <LoaderCircle className="size-7 animate-spin text-amber-200" />
                      <p className="text-sm">{phase}</p>
                    </div>
                  ) : null}
                  <canvas
                    ref={viewRef}
                    className="max-h-[70vh] max-w-full"
                    style={{ width: "auto", height: "auto" }}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ScanEye className="size-4" />
                    Matte
                  </CardTitle>
                  <CardDescription>
                    Threshold turns the probability map into a mask. Soft keeps hair;
                    hard is a clean stencil.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <label className="block space-y-2 text-sm">
                    <span className="flex items-center justify-between font-medium">
                      Threshold
                      <span className="font-mono text-muted-foreground">
                        {threshold.toFixed(2)}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={threshold}
                      onChange={(event) => setThreshold(Number(event.target.value))}
                      className="w-full accent-amber-300"
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    <span className="flex items-center justify-between font-medium">
                      Edge
                      <span className="font-mono text-muted-foreground">
                        {edge === 0 ? "none" : edge > 0 ? `grow ${edge}` : `shrink ${-edge}`}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={-2}
                      max={2}
                      step={1}
                      value={edge}
                      onChange={(event) => setEdge(Number(event.target.value))}
                      className="w-full accent-amber-300"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "soft" ? "default" : "outline"}
                      onClick={() => setMode("soft")}
                    >
                      Soft matte
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "hard" ? "default" : "outline"}
                      onClick={() => setMode("hard")}
                    >
                      Binary
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Backdrop</CardTitle>
                  <CardDescription>
                    Transparent PNG, or composite onto a studio color.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-2">
                  {BACKDROPS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setBackdropId(item.id);
                        setStage("cutout");
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px]",
                        backdropId === item.id
                          ? "border-amber-300 bg-amber-200/10"
                          : "border-white/10 hover:border-white/25",
                      )}
                    >
                      <span
                        className={cn(
                          "block size-8 rounded-md ring-1 ring-white/15",
                          item.swatch === "checker" && "bg-checker",
                        )}
                        style={
                          item.swatch === "checker"
                            ? undefined
                            : { background: item.swatch }
                        }
                      />
                      {item.label}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => void onDownload()} disabled={busy}>
                  <Download />
                  Download PNG
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    htmlFor="cutout-file"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "cursor-pointer",
                      busy && "pointer-events-none opacity-50",
                    )}
                  >
                    <ImagePlus />
                    Replace
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setFrame(null);
                      setStatus("idle");
                      setError(null);
                    }}
                  >
                    <Trash2 />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-4">
          {[
            ["1. Encode", "The contracting path stores context at several scales."],
            ["2. Decode", "Skip connections restore edges the encoder would lose."],
            ["3. Threshold", "Each pixel is foreground or background from a probability."],
            ["4. Cut out", "The mask becomes alpha. Optional morphology cleans the edge."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-white/8 bg-card/50 p-3">
              <p className="text-xs font-medium tracking-wide text-amber-200/90 uppercase">
                {title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mt-auto border-t border-white/8 px-4 py-4 text-xs text-muted-foreground sm:px-6">
        <div className="mx-auto max-w-6xl space-y-1">
          <p>
            Method: Fakruddin Ali Ahmed &amp; Harprith Kaur Rajinder Singh,{" "}
            <cite>Study on Image Background Removal using Deep Learning</cite>, Journal
            of Data Science 2024:06. CC BY 4.0.
          </p>
          <p>
            Weights: U²-Net-P (Qin et al., 2020), nested U-Net for saliency, via rembg.
            Inference stays in your browser.
          </p>
        </div>
      </footer>

      <input
        id="cutout-file"
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void runFile(file);
        }}
      />
    </div>
  );
}
