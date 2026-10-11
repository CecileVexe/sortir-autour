import { getCategory } from "@/config/categories";
import { BUDGET_PRESETS } from "@/config/options";
import type { Activity, ActivityPrice } from "@/lib/activity/types";
import type { SearchCriteria } from "@/lib/search/criteria";

const eur = (n: number) => (Number.isInteger(n) ? `${n} €` : `${n.toFixed(2).replace(".", ",")} €`);

export function formatPrice(p: ActivityPrice): string {
  if (p.kind === "free") return p.status === "verified" ? "Gratuit" : "Gratuit (indicatif)";
  if (p.kind === "paid") {
    const suffix = p.status === "verified" ? "" : " (indicatif)";
    if (p.min === null) return "Payant, tarif non précisé";
    if (p.max !== null && p.max !== p.min) return `${p.min === 0 ? "Gratuit" : eur(p.min)} à ${eur(p.max)}${suffix}`;
    return `${eur(p.min)}${suffix}`;
  }
  return "Prix non renseigné";
}

/** Best link to open for "Voir l'activité": events → their page; places → official site, then Wikipedia, then source record. */
export function primaryLink(a: Activity): string | null {
  if (a.kind === "event") return a.sourceUrl ?? a.website;
  return a.website ?? a.wikipediaUrl ?? a.sourceUrl;
}

export function primaryLinkLabel(a: Activity): string {
  const url = primaryLink(a);
  if (!url) return "Pas de lien disponible";
  if (url === a.website) return a.kind === "event" ? "Voir l'événement" : "Site officiel";
  if (url === a.wikipediaUrl) return "Lire sur Wikipédia";
  return a.kind === "event" ? "Voir l'événement" : "Voir la fiche";
}

export function categoryLabels(a: Activity, max = 2): string[] {
  return a.categories
    .slice(0, max)
    .map((id) => getCategory(id)?.shortLabel)
    .filter((x): x is string => !!x);
}

export function criteriaSummary(c: SearchCriteria): { label: string; value: string }[] {
  const out = [
    { label: "Départ", value: c.origin.label },
    { label: "Rayon", value: `${c.radiusKm} km à vol d'oiseau` },
  ];
  const b = c.budget;
  if (b.preset !== "any") {
    const base = b.preset === "custom" ? `${b.customMax ?? "?"} € max` : (BUDGET_PRESETS.find((x) => x.id === b.preset)?.label ?? "");
    out.push({ label: "Budget", value: b.scope === "group" && b.preset !== "free" ? `${base} pour ${b.groupSize} pers.` : base });
  }
  out.push({
    label: "Envies",
    value: c.categories.length ? c.categories.map((id) => getCategory(id)?.shortLabel).join(", ") : "Ouvert à tout",
  });
  if (c.environment !== "any") out.push({ label: "Lieu", value: c.environment === "indoor" ? "Intérieur" : "Extérieur" });
  if (c.query) out.push({ label: "Mot-clé", value: c.query });
  return out;
}
