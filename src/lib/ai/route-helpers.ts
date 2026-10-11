import { NextResponse } from "next/server";
import { AiError } from "@/lib/ai/types";
import { errorResponse } from "@/lib/api";
import { errorSummary, log } from "@/lib/log";

export interface AiErrorBody {
  aiError: { code: AiError["code"]; message: string; retryAfterSec?: number };
}

/** AI failures are returned as 200-level "soft" errors with a code, so the UI can fall back gracefully. */
export function aiErrorResponse(err: unknown): NextResponse {
  if (err instanceof AiError) {
    log.warn("ai error", { code: err.code, detail: err.message });
    const status = err.code === "quota_exceeded" || err.code === "daily_limit" || err.code === "user_limit" ? 429 : err.code === "not_configured" ? 501 : 502;
    const body: AiErrorBody = {
      aiError: { code: err.code, message: err.userMessage, ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) },
    };
    return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...(err.retryAfterSec ? { "Retry-After": String(err.retryAfterSec) } : {}) } });
  }
  log.error("ai unexpected error", { err: errorSummary(err) });
  return errorResponse(err);
}
