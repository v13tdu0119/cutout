import { CHECK_CATALOG, DEFAULT_CHECKS } from "@/lib/smoke/catalog";
import { runSmokeSuite, summarize } from "@/lib/smoke/runner";
import { normalizeTargetUrl } from "@/lib/smoke/target-url";
import type { CheckId, CheckResult, SmokeEvent } from "@/lib/smoke/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

let busy = false;

function isCheckId(value: unknown): value is CheckId {
  return typeof value === "string" && CHECK_CATALOG.some((item) => item.id === value);
}

export async function POST(request: Request) {
  if (busy) {
    return Response.json(
      { message: "Đang có một lần chạy khác. Đợi xong rồi thử lại." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: "Body JSON không hợp lệ." }, { status: 400 });
  }

  const url = typeof payload === "object" && payload && "url" in payload ? String(payload.url) : "";
  const rawChecks =
    typeof payload === "object" && payload && "checks" in payload ? payload.checks : undefined;

  try {
    normalizeTargetUrl(url);
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "URL không hợp lệ." },
      { status: 400 },
    );
  }

  const checks = Array.isArray(rawChecks) ? rawChecks.filter(isCheckId) : DEFAULT_CHECKS;
  const events: SmokeEvent[] = [];
  const collected: CheckResult[] = [];

  busy = true;
  try {
    for await (const event of runSmokeSuite(url, checks)) {
      if (event.type === "check") {
        collected.push(event.check);
        events.push(event);
        continue;
      }
      if (event.type === "done") {
        events.push({ type: "done", ...summarize(collected), durationMs: event.durationMs });
        continue;
      }
      events.push(event);
    }
  } catch (error) {
    events.push({
      type: "error",
      message: error instanceof Error ? error.message : "Runner gặp lỗi không xác định.",
    });
  } finally {
    busy = false;
  }

  return Response.json({ events });
}
