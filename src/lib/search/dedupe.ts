/**
 * Cross-source de-duplication.
 * Two activities are considered the same when they are of the same kind and:
 *  - share a Wikidata id, or
 *  - share the same website (host + path) and are within 300 m, or
 *  - have the same normalised name within 200 m (events: and share a day), or
 *  - one normalised name contains the other (≥ 8 chars) within 80 m.
 * Merging keeps the richest value for each field and the list of all sources.
 */
import { foldText } from "@/config/categories";
import type { Activity, InfoStatus } from "@/lib/activity/types";
import { haversineKm } from "@/lib/geo/distance";

const STOP = /\b(le|la|les|l|de|du|des|d|et|a|au|aux|en|the)\b/g;

export function normalizeName(name: string): string {
  return foldText(name)
    .replace(/\[demo\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(STOP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function siteKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function firstDay(a: Activity): string | null {
  return a.dates?.[0]?.start.slice(0, 10) ?? null;
}

export function isSameActivity(a: Activity, b: Activity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.wikidataId && a.wikidataId === b.wikidataId) return true;
  const d = haversineKm(a.location, b.location);
  if (d > 0.3) return false;
  const sa = siteKey(a.website);
  if (sa && sa === siteKey(b.website) && sa.includes("/")) return true; // a bare domain is too weak (chains)
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  if (!na || !nb) return false;
  const sameDay = a.kind === "place" || firstDay(a) === firstDay(b);
  if (na === nb && d <= 0.2 && sameDay) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 8 && long.includes(short) && d <= 0.08 && sameDay;
}

const statusRank: Record<InfoStatus, number> = { verified: 2, indicative: 1, unknown: 0 };

function richness(a: Activity): number {
  return (
    (a.image ? 3 : 0) +
    (a.description ? 2 : 0) +
    statusRank[a.price.status] +
    (a.website ? 1 : 0) +
    (a.address ? 1 : 0) +
    (a.provider === "demo" ? -10 : 0)
  );
}

export function mergeActivities(a: Activity, b: Activity): Activity {
  const [base, other] = richness(a) >= richness(b) ? [a, b] : [b, a];
  const sources = [...base.sources];
  for (const s of other.sources) if (!sources.some((x) => x.provider === s.provider && x.url === s.url)) sources.push(s);
  return {
    ...base,
    description: base.description ?? other.description,
    image: base.image ?? other.image,
    website: base.website ?? other.website,
    wikipediaUrl: base.wikipediaUrl ?? other.wikipediaUrl,
    wikidataId: base.wikidataId ?? other.wikidataId,
    address: base.address ?? other.address,
    city: base.city ?? other.city,
    categories: [...new Set([...base.categories, ...other.categories])],
    price: statusRank[other.price.status] > statusRank[base.price.status] ? other.price : base.price,
    accessibility: statusRank[other.accessibility.status] > statusRank[base.accessibility.status] ? other.accessibility : base.accessibility,
    audience: statusRank[other.audience.status] > statusRank[base.audience.status] ? other.audience : base.audience,
    environment: base.environment.value === "unknown" ? other.environment : base.environment,
    openingHours: base.openingHours ?? other.openingHours,
    dates: base.dates ?? other.dates,
    notability: Math.max(base.notability, other.notability),
    sources,
  };
}

export function dedupe(items: readonly Activity[]): Activity[] {
  const out: Activity[] = [];
  const byId = new Map<string, number>();
  for (const it of items) {
    if (byId.has(it.id)) {
      const idx = byId.get(it.id)!;
      out[idx] = mergeActivities(out[idx]!, it);
      continue;
    }
    const idx = out.findIndex((o) => isSameActivity(o, it));
    if (idx >= 0) {
      out[idx] = mergeActivities(out[idx]!, it);
      byId.set(it.id, idx);
    } else {
      byId.set(it.id, out.length);
      out.push(it);
    }
  }
  return out;
}
