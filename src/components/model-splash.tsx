"use client";

import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { ScanEye } from "lucide-react";

type ModelSplashProps = {
  phase: string;
  percent: number;
  failed: boolean;
  error: string | null;
  onRetry: () => void;
};

export function ModelSplash({ phase, percent, failed, error, onRetry }: ModelSplashProps) {
  const value = failed ? percent : Math.min(100, Math.max(0, percent));

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-amber-200/15 blur-2xl" />
          <div className="relative flex size-20 items-center justify-center rounded-full border border-amber-200/25 bg-card/70">
            {!failed ? (
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-200/80" />
            ) : null}
            <ScanEye className="size-9 text-amber-200" />
          </div>
        </div>
        <p className="font-mono text-[11px] tracking-[0.28em] text-amber-200/80 uppercase">
          On-device U-Net
        </p>
        <h1 className="font-heading mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Cutout
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          Loading the nested U-Net so portraits can be cut out in this browser. About 4.4
          MB. Nothing is uploaded.
        </p>

        {failed ? (
          <div className="mt-8 w-full space-y-4">
            <p className="text-sm text-destructive" role="alert">
              {error ?? "The U-Net weights could not be downloaded."}
            </p>
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-8 w-full">
            <Progress value={value} className="w-full">
              <ProgressLabel className="text-left text-sm font-medium" aria-live="polite">
                {phase}
              </ProgressLabel>
              <ProgressValue className="font-mono text-amber-200/90" />
            </Progress>
          </div>
        )}
      </div>
    </div>
  );
}
