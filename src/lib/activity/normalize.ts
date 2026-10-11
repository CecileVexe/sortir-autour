import { getCategory, type CategoryId, type Environment } from "@/config/categories";
import type { Activity, InfoStatus } from "@/lib/activity/types";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'", rsquo: "’", laquo: "«", raquo: "»" };

/** Plain text from possibly-HTML source text, whitespace collapsed. */
export function plainText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z]+|#0?39);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
}

/**
 * Short description, cut on a word boundary. We only keep a short excerpt:
 * the full text stays on the source site (copyright / terms of use).
 */
export function shortDescription(s: string | null | undefined, max = 320): string | null {
  const t = plainText(s);
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,;:.\s]+$/, "")}…`;
}

/** Environment inferred from categories (never "verified"). */
export function inferEnvironment(categories: readonly CategoryId[]): Activity["environment"] {
  const envs = new Set<Environment>();
  for (const id of categories) {
    const e = getCategory(id)?.environment;
    if (e && e !== "unknown") envs.add(e);
  }
  if (envs.size === 0) return { value: "unknown", inferred: false };
  if (envs.size === 1) return { value: [...envs][0]!, inferred: true };
  if (envs.has("indoor") && envs.has("outdoor")) return { value: "mixed", inferred: true };
  return { value: envs.has("mixed") ? "mixed" : [...envs][0]!, inferred: true };
}

/** Overall information status: verified if the essentials come from a structured source. */
export function overallStatus(parts: InfoStatus[]): InfoStatus {
  if (parts.length === 0 || parts.every((p) => p === "unknown")) return "unknown";
  return parts.includes("verified") ? "verified" : "indicative";
}

export function joinAddress(...parts: (string | null | undefined)[]): string | null {
  const s = parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  return s || null;
}

/** Parses "12", "12,50", "12.5 €", "5 EUR" → 12.5. Returns null if no amount. */
export function parseEuroAmount(s: string | number | null | undefined): number | null {
  if (typeof s === "number") return Number.isFinite(s) && s >= 0 && s < 100000 ? s : null;
  if (!s) return null;
  const m = /(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?)?/i.exec(s);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n < 100000 ? n : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}
