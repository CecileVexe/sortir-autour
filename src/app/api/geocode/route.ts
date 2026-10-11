import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, errorResponse, readJsonBody } from "@/lib/api";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { reverseGeocode, searchPlaces } from "@/lib/geocoding/geoplateforme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({ q: z.string().trim().min(3).max(120) });
const reverseSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

/** Autocomplete: GET /api/geocode?q=lyon */
export async function GET(req: Request) {
  try {
    await enforceRateLimit(req, "geocode", env().GEOCODE_RATE_LIMIT_PER_MIN);
    const p = searchSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!p.success) return NextResponse.json({ results: [] });
    const results = await searchPlaces(p.data.q);
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Reverse geocoding of the browser position: POST so precise coordinates never appear in URLs / access logs.
 */
export async function POST(req: Request) {
  try {
    await enforceRateLimit(req, "geocode", env().GEOCODE_RATE_LIMIT_PER_MIN);
    const p = reverseSchema.safeParse(await readJsonBody(req, 512));
    if (!p.success) throw new AppError("invalid_input", "Position invalide.");
    const place = await reverseGeocode(p.data.lat, p.data.lon);
    if (!place) throw new AppError("invalid_input", "Impossible de situer cette position en France. Saisis ta ville.", { status: 404 });
    return NextResponse.json({ results: [place] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
