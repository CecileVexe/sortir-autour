/**
 * DATAtourisme national API (offices de tourisme). Free key, 1 000 req/h, ~10 req/s, 100 items/page.
 * Licence Ouverte 2.0: credit the producer (`hasBeenCreatedBy`) and the update date.
 * Docs: https://api.datatourisme.fr/v1/docs
 */
import { z } from "zod";
import type { CategoryId } from "@/config/categories";
import { cacheKey, cached, TTL } from "@/lib/cache";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { gridKey } from "@/lib/geo/distance";
import type { Activity } from "@/lib/activity/types";
import type { ActivityProvider, ProviderContext } from "@/lib/providers/types";
import { DT_LABEL, normalizeDtPoi } from "@/lib/providers/datatourisme/normalize";

const BASE = "https://api.datatourisme.fr/v1";
const MAX_RADIUS_KM = 100;
const FIELDS = [
  "uuid", "uri", "label", "type", "lastUpdate", "hasBeenCreatedBy", "hasDescription", "isLocatedAt.geo", "isLocatedAt.address",
  "hasContact.homepage", "offers", "takesPlaceAt", "reducedMobilityAccess",
].join(",");

/**
 * Broad DATAtourisme classes to query per category (the API filters on sub-classes too).
 * `null` = no good broad class: covered by the generic query.
 */
const QUERY_TYPE: Record<CategoryId, string | null> = {
  nature: "NaturalHeritage",
  parks: "ParkAndGarden",
  culture: "CulturalSite",
  heritage: "CulturalSite",
  leisure: "SportsAndLeisurePlace",
  sport: "SportsAndLeisurePlace",
  nautical: "SportsAndLeisurePlace",
  food: null,
  markets: null,
  workshops: null,
  animals: null,
  themeparks: "SportsAndLeisurePlace",
  unusual: "NaturalHeritage",
  nightlife: null,
  events: null,
  family: "SportsAndLeisurePlace",
  wellness: null,
};

const listSchema = z.object({ objects: z.array(z.unknown()).default([]) });

async function list(endpoint: string, params: Record<string, string>, apiKey: string): Promise<unknown[]> {
  const qs = new URLSearchParams({ page_size: "100", fields: FIELDS, lang: "fr", ...params });
  const json = await fetchJson(`${BASE}/${endpoint}?${qs}`, {
    label: DT_LABEL,
    timeoutMs: 8000,
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  const parsed = listSchema.safeParse(json);
  return parsed.success ? parsed.data.objects : [];
}

/** Which place queries to run (max 3 + optional tours). Exported for tests. */
export function planPlaceQueries(categories: readonly CategoryId[]): { types: (string | null)[]; tours: boolean } {
  const cats = categories.filter((c) => c !== "events");
  if (cats.length === 0) return { types: ["CulturalSite", "NaturalHeritage", "SportsAndLeisurePlace"], tours: true };
  const types: (string | null)[] = [];
  for (const c of cats) {
    const t = QUERY_TYPE[c];
    if (!types.includes(t)) types.push(t);
  }
  // Generic query (null) last; cap at 3 calls.
  const sorted = [...types.filter((t) => t !== null), ...types.filter((t) => t === null)].slice(0, 3);
  return { types: sorted, tours: cats.includes("nature") };
}

export const datatourismeProvider: ActivityProvider = {
  id: "datatourisme",
  label: DT_LABEL,
  attribution: "DATAtourisme — données des offices de tourisme (Licence Ouverte 2.0)",
  isConfigured: () => !!env().DATATOURISME_API_KEY,
  isEnabled: () => env().PROVIDER_DATATOURISME_ENABLED,
  appliesTo: (ctx) => ctx.wantPlaces || ctx.wantEvents,
  async search(ctx: ProviderContext) {
    const apiKey = env().DATATOURISME_API_KEY!;
    const { origin, radiusKm, categories } = ctx.criteria;
    const r = Math.min(radiusKm, MAX_RADIUS_KM);
    const geo = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)},${r}km`;
    const cats = [...categories].sort();
    const grid = gridKey(origin);
    let anyHit = false;

    const jobs: Promise<Activity[]>[] = [];

    if (ctx.wantPlaces) {
      const plan = planPlaceQueries(cats);
      const key = cacheKey("dt", "places", grid, r, plan.types.map((t) => t ?? "*").join("+"), plan.tours ? "t" : "");
      jobs.push(
        cached<Activity[]>(key, TTL.places, async () => {
          const fetchedAt = new Date().toISOString();
          const calls = plan.types.map((t) => list("placeOfInterest", t ? { geo_distance: geo, type: t } : { geo_distance: geo }, apiKey));
          if (plan.tours) calls.push(list("tour", { geo_distance: geo, page_size: "50" }, apiKey));
          const results = await Promise.allSettled(calls);
          const ok = results.filter((x): x is PromiseFulfilledResult<unknown[]> => x.status === "fulfilled");
          if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason;
          return ok.flatMap((x) => x.value).map((o) => normalizeDtPoi(o, fetchedAt, "place")).filter((a): a is Activity => a !== null);
        }).then(({ value, hit }) => {
          anyHit ||= hit;
          return value;
        }),
      );
    }

    if (ctx.wantEvents) {
      const { from, to } = ctx.window;
      const key = cacheKey("dt", "events", grid, r, from, to);
      jobs.push(
        cached<Activity[]>(key, TTL.events, async () => {
          const fetchedAt = new Date().toISOString();
          const objs = await list("entertainmentAndEvent", { geo_distance: geo, start: from, end: to }, apiKey);
          return objs.map((o) => normalizeDtPoi(o, fetchedAt, "event")).filter((a): a is Activity => a !== null);
        }).then(({ value, hit }) => {
          anyHit ||= hit;
          return value;
        }),
      );
    }

    const settled = await Promise.allSettled(jobs);
    const ok = settled.filter((x): x is PromiseFulfilledResult<Activity[]> => x.status === "fulfilled");
    if (ok.length === 0 && settled.length > 0) throw (settled[0] as PromiseRejectedResult).reason;
    return {
      activities: ok.flatMap((x) => x.value),
      cacheHit: anyHit,
      note: radiusKm > MAX_RADIUS_KM ? `DATAtourisme : recherche limitée à ${MAX_RADIUS_KM} km.` : undefined,
    };
  },
};
