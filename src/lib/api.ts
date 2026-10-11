import { NextResponse } from "next/server";
import { AppError, toApiError } from "@/lib/errors";
import { errorSummary, log } from "@/lib/log";
import { clientId, rateLimit } from "@/lib/ratelimit";

export const MAX_BODY_BYTES = 8 * 1024;

export function errorResponse(err: unknown): NextResponse {
  const { status, body } = toApiError(err);
  if (status >= 500) log.error("api error", { code: body.error.code, err: errorSummary(err) });
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (body.error.retryAfterSec) headers["Retry-After"] = String(body.error.retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

export async function enforceRateLimit(req: Request, bucket: string, limit: number, windowSec = 60): Promise<void> {
  const r = await rateLimit(bucket, clientId(req.headers), limit, windowSec);
  if (!r.ok) {
    throw new AppError("rate_limited", "Trop de recherches en peu de temps. Patiente quelques secondes avant de réessayer.", {
      retryAfterSec: r.retryAfterSec,
    });
  }
}

/** Reads a JSON body with a hard size cap. */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new AppError("payload_too_large", "La requête est trop volumineuse.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new AppError("payload_too_large", "La requête est trop volumineuse.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("invalid_input", "La requête est mal formée.");
  }
}
