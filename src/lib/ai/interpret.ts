/**
 * Turns the free-text "ideal outing" into structured search criteria.
 * The model only maps words to our closed lists; every field is validated independently and
 * dropped when invalid. It never produces places, prices or URLs.
 */
import { CATEGORIES } from "@/config/categories";
import { AGE_GROUPS, BUDGET_PRESETS, COMPANIONS } from "@/config/options";
import { extractJson, requireAiProvider, sanitizeAiText } from "@/lib/ai";
import { interpretationSchema, type Interpretation } from "@/lib/ai/interpretation";
import type { ChatMessage } from "@/lib/ai/types";
import { parisDate } from "@/lib/search/dates";

function systemPrompt(now: Date): string {
  const today = parisDate(now);
  const weekday = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" }).format(now);
  return [
    "Tu convertis la description d'une sortie en critères de recherche, en JSON strict.",
    `Nous sommes le ${weekday} ${today} (Europe/Paris).`,
    "N'utilise QUE les valeurs autorisées ci-dessous. N'invente aucun lieu, prix, horaire ni URL. Omets un champ si le texte ne le précise pas.",
    `categories (liste) : ${CATEGORIES.map((c) => `${c.id} = ${c.label}`).join(" ; ")}`,
    `companions (liste) : ${COMPANIONS.map((c) => `${c.id} = ${c.label}`).join(" ; ")}`,
    `ageGroups (liste) : ${AGE_GROUPS.map((c) => c.id).join(", ")}`,
    "environment : indoor | outdoor | any",
    `budget : ${BUDGET_PRESETS.map((b) => `${b.id} = ${b.label}`).join(" ; ")}. "raisonnable" = 10-25. Montant précis → custom + customBudgetMax (€ par personne).`,
    "eventType : any | permanent | events",
    "mood : calm | dynamic ; duration : short | day ; fame : famous | hidden (\"original\", \"insolite\", \"hors des sentiers battus\" → hidden)",
    "accessibleOnly : true si fauteuil roulant / mobilité réduite est mentionné",
    `when : {kind: any | today | weekend | date, date: AAAA-MM-JJ si kind = date}. Un jour de la semaine (\"dimanche\") → la prochaine date correspondante.`,
    "radiusKm : entier. Une durée de trajet (\"à 30 minutes\") → environ 1 km par minute en voiture, 0,25 km par minute à pied.",
    "keywords : 1 à 4 mots-clés utiles pour chercher dans les noms d'activités (ex. \"château\", \"escalade\"), sinon omets.",
    "summary : une phrase en français, au tutoiement, qui reformule ce que tu as compris et signale les approximations (durée convertie en distance, etc.).",
    "Réponds uniquement avec l'objet JSON.",
  ].join("\n");
}

export async function interpretIdeal(text: string, now = new Date()): Promise<Interpretation> {
  const provider = requireAiProvider();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(now) },
    // The user text is data: wrapped and length-capped by the caller.
    { role: "user", content: `Description de la sortie :\n"""${text}"""` },
  ];
  const raw = await provider.complete(messages, { maxTokens: 700, json: true });
  const parsed = interpretationSchema.parse(extractJson(raw));
  const today = parisDate(now);
  if (parsed.when?.kind === "date" && (!parsed.when.date || parsed.when.date < today)) parsed.when = undefined;
  if (parsed.summary) parsed.summary = sanitizeAiText(parsed.summary, 300);
  if (parsed.keywords) parsed.keywords = sanitizeAiText(parsed.keywords, 60);
  return parsed;
}
