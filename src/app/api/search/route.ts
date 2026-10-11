import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, errorResponse, readJsonBody } from "@/lib/api";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { criteriaSchema } from "@/lib/search/criteria";
import { runSearch } from "@/lib/search/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The "full" phase may wait up to ~28 s for the public Overpass API.
export const maxDuration = 40;

const bodySchema = z.object({
  criteria: criteriaSchema,
  page: z.number().int().min(1).max(20).default(1),
  phase: z.enum(["fast", "full"]).default("full"),
});

export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "search", env().SEARCH_RATE_LIMIT_PER_MIN);
    const parsed = bodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      throw new AppError("invalid_input", "Certains critères de recherche sont invalides. Vérifie le lieu de départ et les filtres.");
    }
    const result = await runSearch(parsed.data.criteria, { page: parsed.data.page, phase: parsed.data.phase });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
