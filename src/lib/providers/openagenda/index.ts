/**
 * OpenAgenda events. Read key required (free account). Cross-agenda event search needs a special
 * scope ("events:transverse"), so we:
 *   1. find agendas related to the origin town (`/v2/agendas?search=<town>`), cached 24 h,
 *   2. read upcoming events of a few of them inside the search bounding box, cached 2 h.
 * Data licence: stated per event (`rights.license`), usually Licence Ouverte 2.0.
 */
import { z } from "zod";
import { cacheKey, cached, TTL } from "@/lib/cache";
import { env } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { boundingBox, gridKey } from "@/lib/geo/distance";
import type { Activity } from "@/lib/activity/types";
import type { ActivityProvider, ProviderContext } from "@/lib/providers/types";
import { normalizeOaEvent, OA_LABEL } from "@/lib/providers/openagenda/normalize";

const BASE = "https://api.openagenda.com/v2";
const MAX_AGENDAS = 6;
const MAX_RADIUS_KM = 50;

const agendasSchema = z.object({
  agendas: z.array(z.object({ uid: z.number(), title: z.string().optional(), official: z.boolean().optional() }).loose()).default([]),
});
const eventsSchema = z.object({ events: z.array(z.unknown()).default([]) });

/** "Lyon 2e Arrondissement" → "Lyon", "Paris 15e Arrondissement" → "Paris". */
export function townName(city: string | null, label: string): string {
  const base = (city ?? label.split(",")[0] ?? label).replace(/\s+\d+(er|e|ème)?\s+arrondissement$/i, "").replace(/\s*\(.*\)$/, "");
  return base.trim().slice(0, 60);
}

async function findAgendas(town: string, key: string): Promise<number[]> {
  const { value } = await cached<number[]>(cacheKey("oa", "agendas", town.toLowerCase()), TTL.agendas, async () => {
    // Most recently active agendas first: relevance alone surfaces many dormant agendas.
    const qs = new URLSearchParams({ search: town, size: "12", sort: "recentlyAddedEvents.desc" });
    const json = await fetchJson(`${BASE}/agendas?${qs}`, { label: OA_LABEL, timeoutMs: 5000, headers: { key } });
    const parsed = agendasSchema.safeParse(json);
    if (!parsed.success) return [];
    return parsed.data.agendas.slice(0, MAX_AGENDAS).map((a) => a.uid);
  });
  return value;
}

async function agendaEvents(uid: number, ctx: ProviderContext, key: string): Promise<unknown[]> {
  const { origin, radiusKm } = ctx.criteria;
  const bb = boundingBox(origin, Math.min(radiusKm, MAX_RADIUS_KM));
  const qs = new URLSearchParams({
    size: "40",
    monolingual: "fr",
    detailed: "1",
    "geo[northEast][lat]": bb.north.toFixed(4),
    "geo[northEast][lng]": bb.east.toFixed(4),
    "geo[southWest][lat]": bb.south.toFixed(4),
    "geo[southWest][lng]": bb.west.toFixed(4),
    // Slightly wider than the Paris-time window whatever the DST offset; the engine filters exactly.
    "timings[gte]": `${ctx.window.from}T00:00:00+02:00`,
    "timings[lte]": `${ctx.window.to}T23:59:59Z`,
  });
  for (const f of ["uid", "title", "description", "canonicalUrl", "image", "imageCredits", "conditions", "keywords", "age", "accessibility", "attendanceMode", "status", "updatedAt", "timings", "location", "rights"]) {
    qs.append("includeFields[]", f);
  }
  const json = await fetchJson(`${BASE}/agendas/${uid}/events?${qs}`, { label: OA_LABEL, timeoutMs: 7000, headers: { key } });
  const parsed = eventsSchema.safeParse(json);
  return parsed.success ? parsed.data.events : [];
}

export const openagendaProvider: ActivityProvider = {
  id: "openagenda",
  label: OA_LABEL,
  attribution: "OpenAgenda — agendas culturels publics (licence indiquée par chaque agenda)",
  isConfigured: () => !!env().OPENAGENDA_API_KEY,
  isEnabled: () => env().PROVIDER_OPENAGENDA_ENABLED,
  appliesTo: (ctx) => ctx.wantEvents,
  async search(ctx: ProviderContext) {
    const key = env().OPENAGENDA_API_KEY!;
    const { origin, radiusKm } = ctx.criteria;
    const town = townName(origin.city, origin.label);
    const r = Math.min(radiusKm, MAX_RADIUS_KM);
    const ck = cacheKey("oa", "events", gridKey(origin), r, ctx.window.from, ctx.window.to, town.toLowerCase());
    const { value, hit } = await cached<Activity[]>(ck, TTL.events, async () => {
      const agendas = await findAgendas(town, key);
      const results = await Promise.allSettled(agendas.map((uid) => agendaEvents(uid, ctx, key)));
      const ok = results.filter((x): x is PromiseFulfilledResult<unknown[]> => x.status === "fulfilled");
      if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
      const fetchedAt = new Date().toISOString();
      return ok.flatMap((x) => x.value).map((e) => normalizeOaEvent(e, fetchedAt)).filter((a): a is Activity => a !== null);
    });
    return {
      activities: value,
      cacheHit: hit,
      note: `OpenAgenda : événements des agendas liés à « ${town} » uniquement.`,
    };
  },
};
