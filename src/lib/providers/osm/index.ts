/**
 * OpenStreetMap places via the Overpass API.
 * Public instances are shared and often overloaded (504s): one compact bounding-box query per search,
 * sequential fallback between instances within a time budget, 24 h cache, and a 7-day stale copy served
 * when every instance fails. Attribution « © contributeurs OpenStreetMap » required (ODbL).
 */
import { z } from "zod";
import { CATEGORIES, type CategoryId, type OsmSelector } from "@/config/categories";
import { cacheKey, cachedWithStale, getCache, TTL } from "@/lib/cache";
import { env, userAgent } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fetchJson } from "@/lib/http";
import { boundingBox, gridKey } from "@/lib/geo/distance";
import { errorSummary, log } from "@/lib/log";
import type { Activity } from "@/lib/activity/types";
import type { ActivityProvider, ProviderContext } from "@/lib/providers/types";
import { normalizeOsmElement, OSM_ATTRIBUTION, OSM_LABEL } from "@/lib/providers/osm/normalize";
import { enrichWithWikidata } from "@/lib/providers/osm/wikidata";

export const OSM_MAX_RADIUS_KM = 50;
/** Beyond this radius only notable places (with a Wikidata/Wikipedia/website tag) are queried. */
const NOTABLE_ONLY_ABOVE_KM = 12;
const MAX_ELEMENTS = 400;
/** Total time budget for Overpass (all instances), then Wikidata enrichment. */
const OVERPASS_BUDGET_MS = 24000;
const STALE_SEC = 7 * 24 * 3600;

// The FOSSGIS load balancer first, then its two backends directly (they answer 504 fast when busy).
const DEFAULT_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

/**
 * Builds the Overpass QL query for the given categories (all categories when empty).
 * One exact `key=value` clause per value (uses Overpass' tag index), on a global bounding box
 * (cheaper than many `around` filters). The exact radius is applied afterwards by the engine.
 */
export function buildOverpassQuery(categories: readonly CategoryId[], lat: number, lon: number, radiusKm: number): string {
  const cats = categories.length ? CATEGORIES.filter((c) => categories.includes(c.id)) : CATEGORIES;
  const r = Math.min(radiusKm, OSM_MAX_RADIUS_KM);
  const wide = radiusKm > NOTABLE_ONLY_ABOVE_KM;
  const notableFilter = `[~"^(wikidata|wikipedia|website)$"~"."]`;
  const clauses = new Set<string>();
  for (const c of cats) {
    for (const s of c.osm as readonly OsmSelector[]) {
      const notable = wide || s.notableOnly ? notableFilter : "";
      const values = s.values?.length ? s.values : [null];
      for (const v of values) clauses.add(`  nwr["${s.key}"${v ? `="${v}"` : ""}]["name"]${notable};`);
    }
  }
  const bb = boundingBox({ lat, lon }, r);
  const bbox = [bb.south, bb.west, bb.north, bb.east].map((n) => n.toFixed(4)).join(",");
  return `[out:json][timeout:25][bbox:${bbox}];\n(\n${[...clauses].join("\n")}\n);\nout center tags qt ${MAX_ELEMENTS};`;
}

const overpassResponse = z.object({ elements: z.array(z.unknown()).default([]), remark: z.string().optional() });

async function runOverpass(query: string): Promise<unknown[]> {
  const urls = env().OVERPASS_URLS?.split(",").map((u) => u.trim()).filter(Boolean) ?? DEFAULT_URLS;
  const deadline = Date.now() + OVERPASS_BUDGET_MS;
  let lastErr: unknown = null;
  for (const base of urls) {
    const remaining = deadline - Date.now();
    if (remaining < 2500) break;
    try {
      const json = await fetchJson(base, {
        method: "POST",
        label: "OpenStreetMap (Overpass)",
        timeoutMs: remaining,
        headers: { "User-Agent": userAgent(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
      });
      const parsed = overpassResponse.safeParse(json);
      if (!parsed.success) throw new AppError("provider_bad_response", "OpenStreetMap a renvoyé une réponse inattendue.");
      if (parsed.data.remark && /timed out|out of memory/i.test(parsed.data.remark) && parsed.data.elements.length === 0) {
        throw new AppError("provider_timeout", "OpenStreetMap n'a pas pu traiter la recherche à temps.");
      }
      return parsed.data.elements;
    } catch (err) {
      lastErr = err;
      log.warn("overpass instance failed", { base, err: errorSummary(err) });
    }
  }
  throw lastErr instanceof AppError
    ? lastErr
    : new AppError("provider_unavailable", "OpenStreetMap est indisponible pour le moment.", { cause: lastErr });
}

export const osmProvider: ActivityProvider = {
  id: "osm",
  label: OSM_LABEL,
  attribution: `${OSM_ATTRIBUTION} · images et descriptions Wikidata / Wikimedia Commons`,
  timeoutMs: 28000,
  slow: true,
  isConfigured: () => true,
  isEnabled: () => env().PROVIDER_OSM_ENABLED,
  appliesTo: (ctx) => ctx.wantPlaces,
  async peek(ctx: ProviderContext) {
    const env = await getCache().get<{ v: Activity[] }>(osmCacheKey(ctx));
    return env ? { activities: env.v, cacheHit: true, note: osmNotes(ctx.criteria.radiusKm, false) } : null;
  },
  async search(ctx: ProviderContext) {
    const { origin, radiusKm, categories } = ctx.criteria;
    const cats = [...categories].sort();
    const r = Math.min(radiusKm, OSM_MAX_RADIUS_KM);
    const key = osmCacheKey(ctx);
    const { value, hit, stale } = await cachedWithStale<Activity[]>(key, TTL.places, STALE_SEC, async () => {
      const elements = await runOverpass(buildOverpassQuery(cats, origin.lat, origin.lon, r));
      const fetchedAt = new Date().toISOString();
      const activities = elements.map((e) => normalizeOsmElement(e, fetchedAt)).filter((a): a is Activity => a !== null);
      return enrichWithWikidata(activities);
    });
    return { activities: value, cacheHit: hit, note: osmNotes(radiusKm, stale) };
  },
};

function osmCacheKey(ctx: ProviderContext): string {
  const { origin, radiusKm, categories } = ctx.criteria;
  const cats = [...categories].sort();
  return cacheKey("osm", gridKey(origin), Math.min(radiusKm, OSM_MAX_RADIUS_KM), cats.join(",") || "all");
}

function osmNotes(radiusKm: number, stale: boolean): string | undefined {
  const notes: string[] = [];
  if (stale) notes.push("OpenStreetMap ne répond pas : les lieux affichés proviennent d'une recherche récente mise en cache.");
  if (radiusKm > OSM_MAX_RADIUS_KM) notes.push(`OpenStreetMap : recherche limitée à ${OSM_MAX_RADIUS_KM} km.`);
  else if (radiusKm > NOTABLE_ONLY_ABOVE_KM) notes.push(`OpenStreetMap : au-delà de ${NOTABLE_ONLY_ABOVE_KM} km, seuls les lieux les plus documentés sont inclus.`);
  return notes.join(" ") || undefined;
}
