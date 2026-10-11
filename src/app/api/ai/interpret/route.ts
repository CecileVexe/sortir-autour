import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, readJsonBody } from "@/lib/api";
import { requireAiProvider } from "@/lib/ai";
import { interpretIdeal } from "@/lib/ai/interpret";
import { consumeAiQuota } from "@/lib/ai/quota";
import { aiErrorResponse } from "@/lib/ai/route-helpers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { clientId } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "ai-burst", 10);
    const max = env().AI_MAX_INPUT_CHARS;
    const parsed = z
      .object({ text: z.string().trim().min(5).max(max) })
      .safeParse(await readJsonBody(req, 4096));
    if (!parsed.success) throw new AppError("invalid_input", `Décris ta sortie en 5 à ${max} caractères.`);
    requireAiProvider();
    await consumeAiQuota(clientId(req.headers));
    const interpretation = await interpretIdeal(parsed.data.text.replace(/[\u0000-\u001f\u007f]+/g, " "));
    return NextResponse.json({ interpretation }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
