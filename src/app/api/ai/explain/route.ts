import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, readJsonBody } from "@/lib/api";
import { requireAiProvider } from "@/lib/ai";
import { explainResults, MAX_EXPLAIN_ITEMS } from "@/lib/ai/explain";
import { consumeAiQuota } from "@/lib/ai/quota";
import { aiErrorResponse } from "@/lib/ai/route-helpers";
import { AppError } from "@/lib/errors";
import { clientId } from "@/lib/ratelimit";
import { criteriaSchema } from "@/lib/search/criteria";
import { runSearch } from "@/lib/search/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  criteria: criteriaSchema,
  ids: z.array(z.string().max(120)).min(1).max(MAX_EXPLAIN_ITEMS),
});

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "ai-burst", 10);
    const parsed = bodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) throw new AppError("invalid_input", "Demande d'explication invalide.");
    requireAiProvider();
    await consumeAiQuota(clientId(req.headers));
    // Reload the activities server-side (served from cache): explanations rely only on retrieved data.
    const result = await runSearch(parsed.data.criteria, { phase: "fast", pageSize: 200 });
    const wanted = new Set(parsed.data.ids);
    const items = result.items.filter((a) => wanted.has(a.id)).slice(0, MAX_EXPLAIN_ITEMS);
    const explanation = await explainResults(parsed.data.criteria, items);
    return NextResponse.json({ explanation }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
