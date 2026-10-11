/** Questionnaire / filter options. Labels are user-facing (French). */

export const RADIUS_PRESETS_KM = [5, 10, 20, 30, 50, 100] as const;
export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 150;

export const COMPANIONS = [
  { id: "solo", label: "Seul" },
  { id: "couple", label: "En couple" },
  { id: "family", label: "En famille avec des enfants" },
  { id: "friends", label: "Entre amis" },
  { id: "group", label: "En groupe" },
  { id: "toddlers", label: "Avec des enfants en bas âge" },
  { id: "teens", label: "Avec des adolescents" },
] as const;
export type CompanionId = (typeof COMPANIONS)[number]["id"];

export const AGE_GROUPS = [
  { id: "u12", label: "Moins de 12 ans", min: 0, max: 11 },
  { id: "12-17", label: "12 à 17 ans", min: 12, max: 17 },
  { id: "18-25", label: "18 à 25 ans", min: 18, max: 25 },
  { id: "26-39", label: "26 à 39 ans", min: 26, max: 39 },
  { id: "40-59", label: "40 à 59 ans", min: 40, max: 59 },
  { id: "60+", label: "60 ans et plus", min: 60, max: 120 },
] as const;
export type AgeGroupId = (typeof AGE_GROUPS)[number]["id"];

export const BUDGET_PRESETS = [
  { id: "any", label: "Peu importe", max: null },
  { id: "free", label: "Gratuit", max: 0 },
  { id: "lt10", label: "Moins de 10 €", max: 10 },
  { id: "10-25", label: "De 10 à 25 €", max: 25 },
  { id: "25-50", label: "De 25 à 50 €", max: 50 },
  { id: "gt50", label: "Plus de 50 €", max: null },
  { id: "custom", label: "Budget personnalisé", max: null },
] as const;
export type BudgetPresetId = (typeof BUDGET_PRESETS)[number]["id"];

export const ENVIRONMENTS = [
  { id: "any", label: "Les deux" },
  { id: "indoor", label: "En intérieur" },
  { id: "outdoor", label: "En extérieur" },
] as const;

export const WHEN_OPTIONS = [
  { id: "any", label: "Peu importe" },
  { id: "today", label: "Aujourd'hui" },
  { id: "weekend", label: "Ce week-end" },
  { id: "date", label: "À une date précise" },
] as const;

export const EVENT_TYPES = [
  { id: "any", label: "Les deux" },
  { id: "permanent", label: "Lieux et activités permanentes" },
  { id: "events", label: "Événements temporaires" },
] as const;

export const MOODS = [
  { id: "calm", label: "Plutôt calme" },
  { id: "dynamic", label: "Plutôt dynamique" },
] as const;
export const DURATIONS = [
  { id: "short", label: "Sortie courte" },
  { id: "day", label: "Journée complète" },
] as const;
export const BOOKINGS = [
  { id: "spontaneous", label: "Sur un coup de tête" },
  { id: "booked", label: "Je veux bien réserver" },
] as const;
export const FAME = [
  { id: "famous", label: "Lieux connus" },
  { id: "hidden", label: "Découvertes originales" },
] as const;

export const SORTS = [
  { id: "relevance", label: "Pertinence" },
  { id: "distance", label: "Distance" },
  { id: "price", label: "Prix (connus)" },
] as const;

export const TEXT_LIMITS = { query: 120, ideal: 500 } as const;
