/**
 * Deterministic filtering + scoring (no AI). Hard filters remove activities that contradict a
 * criterion *according to the source*; unknown information never excludes, it lowers the score and is
 * reported as "not verified" — except for the "free" budget, where an unknown price is not free.
 */
import { foldText, getCategory, type CategoryId } from "@/config/categories";
import type { Activity, RankedActivity } from "@/lib/activity/types";
import { budgetCeilingPerPerson, budgetFloorPerPerson, type SearchCriteria } from "@/lib/search/criteria";
import { occurrencesInWindow, type DateWindow } from "@/lib/search/dates";
import { formatDistance } from "@/lib/geo/distance";

export interface FilterStats {
  /** Hidden because the price is unknown while "Gratuit" was requested. */
  unknownPriceHidden: number;
  /** Kept although the environment (indoor/outdoor) is unknown. */
  environmentUnknown: number;
  /** Kept although accessibility is unknown (PMR requested). */
  accessibilityUnknown: number;
  /** Places kept for a dated search without verified opening days. */
  placesWithoutDates: number;
  /** Free-text query matched nothing → ignored. */
  queryIgnored: boolean;
}

const CALM: CategoryId[] = ["parks", "culture", "wellness", "nature", "heritage", "workshops"];
const DYNAMIC: CategoryId[] = ["sport", "nautical", "leisure", "themeparks", "nightlife", "events"];
const FULL_DAY: CategoryId[] = ["themeparks", "nature", "heritage", "nautical", "animals"];
const SHORT: CategoryId[] = ["culture", "leisure", "markets", "parks", "food"];

const hasAny = (a: readonly CategoryId[], b: readonly CategoryId[]) => a.some((x) => b.includes(x));

function withChildren(c: SearchCriteria): boolean {
  return c.companions.some((x) => x === "family" || x === "toddlers") || c.ageGroups.includes("u12");
}
function withTeens(c: SearchCriteria): boolean {
  return c.companions.includes("teens") || c.ageGroups.includes("12-17");
}

/** Does the activity match the selected categories? ("family" also matches family-oriented categories.) */
export function matchesCategories(a: Activity, selected: readonly CategoryId[]): boolean {
  if (selected.length === 0) return true;
  if (selected.includes("events") && a.kind === "event") return true;
  if (selected.includes("family") && a.categories.some((id) => getCategory(id)?.familyOriented)) return true;
  return hasAny(a.categories, selected);
}

function textTokens(q: string): string[] {
  return foldText(q)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

export function textMatchScore(a: Activity, q: string): number {
  const tokens = textTokens(q);
  if (tokens.length === 0) return 0;
  const hay = foldText(
    [a.name, a.description ?? "", a.city ?? "", ...a.categories.map((c) => getCategory(c)?.label ?? "")].join(" "),
  );
  const name = foldText(a.name);
  let s = 0;
  for (const t of tokens) {
    if (name.includes(t)) s += 2;
    else if (hay.includes(t)) s += 1;
  }
  return s / (tokens.length * 2);
}

export function rankActivities(
  items: readonly Activity[],
  c: SearchCriteria,
  window: DateWindow,
): { ranked: RankedActivity[]; stats: FilterStats } {
  const stats: FilterStats = { unknownPriceHidden: 0, environmentUnknown: 0, accessibilityUnknown: 0, placesWithoutDates: 0, queryIgnored: false };
  const ceiling = budgetCeilingPerPerson(c);
  const floor = budgetFloorPerPerson(c);
  const kids = withChildren(c);
  const teens = withTeens(c);
  const query = c.query.trim();

  const candidates: RankedActivity[] = [];
  for (const a of items) {
    // ---- hard filters ----
    if (c.eventType === "permanent" && a.kind === "event") continue;
    if (c.eventType === "events" && a.kind === "place") continue;

    let nextDate = null;
    if (a.kind === "event") {
      const occ = occurrencesInWindow(a.dates ?? [], window);
      if (occ.length === 0) continue;
      nextDate = occ[0]!;
    }
    if (!matchesCategories(a, c.categories)) continue;

    const env = a.environment.value;
    if (c.environment === "indoor" && env === "outdoor") continue;
    if (c.environment === "outdoor" && env === "indoor") continue;

    if (c.budget.preset === "free") {
      if (a.price.kind === "unknown") {
        stats.unknownPriceHidden++;
        continue;
      }
      if (a.price.kind !== "free" && (a.price.min ?? 1) > 0) continue;
    } else if (ceiling !== null && a.price.min !== null && a.price.min > ceiling) {
      continue;
    }

    if (c.accessibleOnly && a.accessibility.wheelchair === false) continue;

    const onlyAdult = a.categories.length > 0 && a.categories.every((id) => getCategory(id)?.adultsOnly);
    if (kids && (onlyAdult || (a.audience.ageMin !== null && a.audience.ageMin >= 12))) continue;
    if (teens && (a.audience.ageMin !== null && a.audience.ageMin >= 18)) continue;

    // ---- scoring ----
    const reasons: string[] = [];
    const unverified: string[] = [];
    let score = 0;

    const d = a.distanceKm ?? c.radiusKm;
    score += 30 * Math.pow(Math.max(0, 1 - d / Math.max(1, c.radiusKm)), 0.7);
    reasons.push(`À ${formatDistance(d)} à vol d'oiseau`);

    if (c.categories.length > 0) {
      score += 18;
      const hit = a.categories.find((x) => c.categories.includes(x));
      const label = hit ? getCategory(hit)?.shortLabel : null;
      if (label) reasons.push(`Catégorie « ${label} »`);
    } else {
      score += 8;
    }

    const tm = query ? textMatchScore(a, query) : 0;
    score += 25 * tm;
    if (tm >= 0.5) reasons.push(`Correspond à « ${query.slice(0, 40)} »`);
    // "Décris la sortie idéale": soft keyword boost only (never a filter), works without AI.
    if (c.ideal) score += 8 * textMatchScore(a, c.ideal);

    // Budget
    if (a.price.kind === "free") {
      score += c.budget.preset === "free" ? 10 : 5;
      reasons.push(a.price.status === "verified" ? "Gratuit" : "Gratuit (selon la source)");
    } else if (a.price.min !== null) {
      if (ceiling !== null || floor !== null) score += 8;
      if (floor !== null && (a.price.max ?? a.price.min) >= floor) score += 4;
    } else {
      if (c.budget.preset !== "any") score -= 4;
      unverified.push("Prix non renseigné");
    }

    // Environment
    if (c.environment !== "any") {
      if (env === c.environment) {
        score += a.environment.inferred ? 5 : 8;
        if (a.environment.inferred) unverified.push(c.environment === "indoor" ? "En intérieur : déduit du type de lieu" : "En extérieur : déduit du type de lieu");
      } else if (env === "mixed") {
        score += 2;
      } else if (env === "unknown") {
        stats.environmentUnknown++;
        unverified.push("Intérieur ou extérieur : non renseigné");
      }
    }

    // Audience
    if (kids) {
      if (a.audience.childrenWelcome === true) {
        score += 8;
        reasons.push("Ouvert aux enfants (selon la source)");
      } else if (a.categories.some((id) => getCategory(id)?.familyOriented)) {
        score += 5;
      }
    }
    if (c.companions.includes("couple") && hasAny(a.categories, ["culture", "wellness", "food", "heritage"])) score += 3;
    if ((c.companions.includes("friends") || c.companions.includes("group")) && hasAny(a.categories, ["leisure", "sport", "nightlife", "nautical"])) score += 3;
    if (c.ageGroups.includes("60+") && hasAny(a.categories, ["heritage", "culture", "parks"])) score += 2;

    // Accessibility
    if (c.accessibleOnly) {
      if (a.accessibility.wheelchair === true) {
        score += 10;
        reasons.push("Accessible en fauteuil (selon la source)");
      } else {
        stats.accessibilityUnknown++;
        unverified.push("Accessibilité non renseignée");
      }
    }

    // Dates
    if (a.kind === "event" && nextDate) {
      score += window.explicit ? 10 : 0;
    } else if (window.explicit) {
      stats.placesWithoutDates++;
      unverified.push("Ouverture à la date choisie non vérifiée");
    }

    // Preferences
    if (c.mood === "calm" && hasAny(a.categories, CALM)) score += 6;
    if (c.mood === "dynamic" && hasAny(a.categories, DYNAMIC)) score += 6;
    if (c.duration === "day" && hasAny(a.categories, FULL_DAY)) score += 4;
    if (c.duration === "short" && hasAny(a.categories, SHORT)) score += 4;
    if (c.booking === "spontaneous" && a.kind === "place") score += 2;
    if (c.fame === "famous") score += 12 * a.notability;
    else if (c.fame === "hidden") score += 8 * (1 - a.notability);
    else score += 5 * a.notability;

    // Completeness (better cards first at equal relevance)
    if (a.image) score += 4;
    if (a.description) score += 3;
    if (a.wikipediaUrl) reasons.push("Article Wikipédia disponible");

    if (a.isDemo) score -= 50;

    candidates.push({ ...a, score: Math.round(score * 10) / 10, reasons: reasons.slice(0, 4), unverified, nextDate });
  }

  // Free-text query: keep matching activities when there are any.
  let ranked = candidates;
  if (query) {
    const matching = candidates.filter((a) => textMatchScore(a, query) > 0);
    if (matching.length > 0) ranked = matching;
    else stats.queryIgnored = true;
  }

  return { ranked: sortRanked(ranked, c.sort), stats };
}

export function sortRanked(items: RankedActivity[], sort: SearchCriteria["sort"]): RankedActivity[] {
  const arr = [...items];
  if (sort === "distance") {
    arr.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || b.score - a.score);
  } else if (sort === "price") {
    // Known prices first (ascending); unknown prices last, by relevance.
    arr.sort((a, b) => {
      const pa = a.price.kind === "free" ? 0 : a.price.min;
      const pb = b.price.kind === "free" ? 0 : b.price.min;
      if (pa === null && pb === null) return b.score - a.score;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb || b.score - a.score;
    });
  } else {
    arr.sort((a, b) => b.score - a.score || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return diversify(arr);
  }
  return arr;
}

/**
 * Greedy re-ranking for variety: an item loses a few points for each of the last 3 picks that share
 * its kind (place/event), main category or source. Only reorders among the next 12 candidates.
 */
export function diversify(sorted: RankedActivity[]): RankedActivity[] {
  const pool = [...sorted];
  const out: RankedActivity[] = [];
  while (pool.length > 0) {
    const last = out.slice(-3);
    let bestI = 0;
    let best = -Infinity;
    for (let i = 0; i < Math.min(12, pool.length); i++) {
      const a = pool[i]!;
      const penalty =
        2 * last.filter((x) => x.kind === a.kind).length +
        3 * last.filter((x) => x.categories[0] === a.categories[0]).length +
        2 * last.filter((x) => x.provider === a.provider).length;
      const v = a.score - penalty;
      if (v > best) {
        best = v;
        bestI = i;
      }
    }
    out.push(pool.splice(bestI, 1)[0]!);
  }
  return out;
}
