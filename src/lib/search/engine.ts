/**
 * The single search engine used by both the questionnaire and the quick search.
 * Steps: providers (parallel, isolated failures) → radius filter → de-duplication → filters + ranking → page.
 */
import type { Activity, RankedActivity } from "@/lib/activity/types";
import { AppError } from "@/lib/errors";
import { filterByRadius } from "@/lib/geo/distance";
import { errorSummary, log } from "@/lib/log";
import { ALL_PROVIDERS } from "@/lib/providers/registry";
import type { ActivityProvider, ProviderContext, ProviderReport } from "@/lib/providers/types";
import type { SearchCriteria } from "@/lib/search/criteria";
import { dateWindow, type DateWindow } from "@/lib/search/dates";
import { dedupe } from "@/lib/search/dedupe";
import { rankActivities, type FilterStats } from "@/lib/search/ranking";

export const PAGE_SIZE = 18;
const PROVIDER_DEADLINE_MS = 9500;

export interface SearchResponse {
  items: RankedActivity[];
  /** Number of activities matching the criteria among those retrieved (NOT all activities that exist). */
  matched: number;
  /** Number of distinct activities retrieved from the sources within the radius, before filters. */
  retrieved: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  window: DateWindow;
  providers: ProviderReport[];
  stats: FilterStats;
  notes: string[];
  containsDemo: boolean;
  phase: "fast" | "full";
  /** True when some slow provider has not been queried yet (run the "full" phase). */
  pending: boolean;
  generatedAt: string;
}

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new AppError("provider_timeout", `${label} met trop de temps à répondre.`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface EngineOptions {
  providers?: readonly ActivityProvider[];
  now?: Date;
  page?: number;
  pageSize?: number;
  /**
   * "fast": slow providers only contribute cached results (status "pending" otherwise);
   * "full": every provider runs live. The UI runs "fast" first, then "full" if something is pending.
   */
  phase?: "fast" | "full";
}

const NOT_CACHED = Symbol("not-cached");

export async function runSearch(criteria: SearchCriteria, opts: EngineOptions = {}): Promise<SearchResponse> {
  const now = opts.now ?? new Date();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const providers = opts.providers ?? ALL_PROVIDERS;
  const window = dateWindow(criteria, now);
  const ctx: ProviderContext = {
    criteria,
    window,
    now,
    wantPlaces: criteria.eventType !== "events",
    wantEvents: criteria.eventType !== "permanent",
  };

  const reports: ProviderReport[] = [];
  const notes: string[] = [];
  const active: ActivityProvider[] = [];
  for (const p of providers) {
    const base = { id: p.id, label: p.label, count: 0, attribution: p.attribution };
    if (!p.isEnabled()) {
      if (p.id !== "demo") reports.push({ ...base, status: "disabled" });
      continue;
    }
    if (!p.isConfigured()) reports.push({ ...base, status: "not_configured", message: `${p.label} n'est pas configuré (clé API manquante).` });
    else if (!p.appliesTo(ctx)) reports.push({ ...base, status: "skipped" });
    else active.push(p);
  }

  const phase = opts.phase ?? "full";
  const settled = await Promise.allSettled(
    active.map((p) => {
      if (phase === "fast" && p.slow) {
        return (p.peek ? p.peek(ctx) : Promise.resolve(null)).then((r) => r ?? Promise.reject(NOT_CACHED));
      }
      return withDeadline(p.search(ctx), p.timeoutMs ?? PROVIDER_DEADLINE_MS, p.label);
    }),
  );
  const all: Activity[] = [];
  settled.forEach((r, i) => {
    const p = active[i]!;
    const base = { id: p.id, label: p.label, attribution: p.attribution };
    if (r.status === "rejected" && r.reason === NOT_CACHED) {
      reports.push({ ...base, status: "pending", count: 0, message: `Recherche ${p.label} en cours…` });
    } else if (r.status === "fulfilled") {
      all.push(...r.value.activities);
      reports.push({ ...base, status: "ok", count: r.value.activities.length, cacheHit: r.value.cacheHit });
      if (r.value.note) notes.push(r.value.note);
    } else {
      const msg = r.reason instanceof AppError ? r.reason.userMessage : `${p.label} est indisponible pour le moment.`;
      log.warn("provider failed", { provider: p.id, err: errorSummary(r.reason) });
      reports.push({ ...base, status: "error", count: 0, message: msg });
    }
  });

  const okCount = reports.filter((r) => r.status === "ok" || r.status === "pending").length;
  if (active.length > 0 && okCount === 0) {
    throw new AppError("provider_unavailable", "Aucune source de données n'a répondu. Réessaie dans quelques instants.", { status: 503 });
  }
  if (active.length === 0) {
    throw new AppError("provider_unavailable", "Aucune source de données n'est active pour cette recherche.", { status: 503 });
  }

  const inRadius = filterByRadius(all, criteria.origin, criteria.radiusKm);
  const unique = dedupe(inRadius);
  const { ranked, stats } = rankActivities(unique, criteria, window);

  const start = (page - 1) * pageSize;
  const items = ranked.slice(start, start + pageSize);

  log.info("search", {
    radius: criteria.radiusKm,
    cats: criteria.categories.length,
    retrieved: all.length,
    unique: unique.length,
    matched: ranked.length,
    providers: reports.map((r) => `${r.id}:${r.status}:${r.count}${r.cacheHit ? "(cache)" : ""}`).join(","),
  });

  return {
    items,
    matched: ranked.length,
    retrieved: unique.length,
    page,
    pageSize,
    hasMore: start + pageSize < ranked.length,
    window,
    providers: reports,
    stats,
    notes,
    containsDemo: items.some((i) => i.isDemo),
    phase,
    pending: reports.some((r) => r.status === "pending"),
    generatedAt: now.toISOString(),
  };
}
