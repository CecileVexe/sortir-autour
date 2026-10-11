import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI whether AI features are available. Never exposes keys or quotas. */
export async function GET() {
  const p = getAiProvider();
  return NextResponse.json(
    { enabled: !!p, provider: p?.label ?? null, maxInputChars: env().AI_MAX_INPUT_CHARS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
