/**
 * Demo provider: FICTITIOUS activities placed around the origin, for development, tests and demos.
 * Every item has `isDemo: true` and is labelled « Démo » in the UI. Never enabled in production.
 */
import type { CategoryId } from "@/config/categories";
import { inferEnvironment } from "@/lib/activity/normalize";
import { unknownPrice, type Activity, type ActivityPrice } from "@/lib/activity/types";
import { env, isProduction } from "@/lib/env";
import type { ActivityProvider, ProviderContext } from "@/lib/providers/types";
import { parisDate } from "@/lib/search/dates";

const DEMO_ATTRIBUTION = "Données fictives de démonstration";

interface DemoSeed {
  name: string;
  categories: CategoryId[];
  dLat: number;
  dLon: number;
  price: ActivityPrice;
  description: string;
  event?: boolean;
  wheelchair?: boolean | null;
}

const free: ActivityPrice = { kind: "free", min: 0, max: 0, currency: "EUR", label: null, status: "verified" };
const paid = (min: number, max = min): ActivityPrice => ({ kind: "paid", min, max, currency: "EUR", label: null, status: "verified" });

const SEEDS: DemoSeed[] = [
  { name: "[Démo] Sentier des crêtes", categories: ["nature"], dLat: 0.05, dLon: 0.03, price: free, description: "Boucle fictive de 8 km avec points de vue." },
  { name: "[Démo] Jardin des simples", categories: ["parks", "family"], dLat: -0.01, dLon: 0.012, price: free, description: "Jardin fictif de plantes médicinales." },
  { name: "[Démo] Musée de l'horlogerie", categories: ["culture"], dLat: 0.008, dLon: -0.006, price: paid(7), description: "Collection fictive d'horloges anciennes.", wheelchair: true },
  { name: "[Démo] Château de Montfictif", categories: ["heritage"], dLat: 0.12, dLon: -0.08, price: paid(9, 12), description: "Forteresse médiévale imaginaire." },
  { name: "[Démo] Bowling des Lilas", categories: ["leisure"], dLat: -0.03, dLon: -0.02, price: paid(6), description: "Bowling fictif de 12 pistes." },
  { name: "[Démo] Mur d'escalade Vertigo", categories: ["sport"], dLat: 0.02, dLon: 0.04, price: paid(14), description: "Salle de bloc fictive." },
  { name: "[Démo] Base de canoë du Moulin", categories: ["nautical"], dLat: -0.15, dLon: 0.1, price: paid(18, 25), description: "Location fictive de canoës." },
  { name: "[Démo] Marché fermier du samedi", categories: ["markets", "food"], dLat: 0.004, dLon: 0.002, price: free, description: "Marché fictif de producteurs.", event: true },
  { name: "[Démo] Atelier poterie", categories: ["workshops"], dLat: -0.006, dLon: 0.009, price: paid(35), description: "Initiation fictive au tour." },
  { name: "[Démo] Ferme pédagogique", categories: ["animals", "family"], dLat: 0.09, dLon: 0.07, price: unknownPrice(), description: "Ferme fictive ouverte aux visites." },
  { name: "[Démo] Festival des lanternes", categories: ["events", "unusual"], dLat: 0.015, dLon: -0.02, price: paid(5), description: "Festival fictif de lumières.", event: true },
  { name: "[Démo] Spa des sources", categories: ["wellness"], dLat: -0.08, dLon: -0.05, price: paid(55, 90), description: "Spa fictif." },
];

export const demoProvider: ActivityProvider = {
  id: "demo",
  label: "Démo",
  attribution: DEMO_ATTRIBUTION,
  isConfigured: () => true,
  isEnabled: () => env().DEMO_DATA && !isProduction(),
  appliesTo: () => true,
  async search(ctx: ProviderContext) {
    const { origin } = ctx.criteria;
    const fetchedAt = new Date().toISOString();
    const day = ctx.window.from ?? parisDate(ctx.now);
    const activities: Activity[] = SEEDS.map((s, i) => ({
      id: `demo:${i}`,
      kind: s.event ? "event" : "place",
      name: s.name,
      description: s.description,
      image: null,
      sourceUrl: null,
      website: null,
      wikipediaUrl: null,
      wikidataId: null,
      provider: "demo",
      providerLabel: "Démo",
      sources: [{ provider: "demo", providerLabel: "Démo", url: null, attribution: DEMO_ATTRIBUTION }],
      address: null,
      city: origin.city,
      location: { lat: origin.lat + s.dLat, lon: origin.lon + s.dLon },
      distanceKm: null,
      categories: s.categories,
      price: s.price,
      environment: inferEnvironment(s.categories),
      audience: { childrenWelcome: null, ageMin: null, ageMax: null, status: "unknown" },
      accessibility: { wheelchair: s.wheelchair ?? null, status: s.wheelchair == null ? "unknown" : "verified" },
      dates: s.event ? [{ start: `${day}T10:00:00`, end: `${day}T18:00:00` }] : null,
      openingHours: null,
      infoStatus: "indicative",
      fetchedAt,
      updatedAt: null,
      isDemo: true,
      notability: 0.2,
    }));
    return { activities, cacheHit: false, note: "Mode démo : des activités fictives sont incluses." };
  },
};
