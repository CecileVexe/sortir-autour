"use client";

/**
 * Criteria fields shared by the questionnaire (one field per step) and the quick-search filter panel
 * (all fields at once). Both edit the same `CriteriaDraft`, so both feed the same search engine.
 */
import { Accessibility } from "lucide-react";
import { clsx } from "clsx";
import { CATEGORIES, type CategoryId } from "@/config/categories";
import {
  AGE_GROUPS,
  BOOKINGS,
  BUDGET_PRESETS,
  COMPANIONS,
  DURATIONS,
  ENVIRONMENTS,
  EVENT_TYPES,
  FAME,
  MOODS,
  TEXT_LIMITS,
  WHEN_OPTIONS,
} from "@/config/options";
import { CategoryIcon } from "@/components/category-icon";
import { FieldLabel, MultiChips, SingleChips } from "@/components/ui/chips";
import type { CriteriaDraft } from "@/lib/search/criteria";
import { parisDate } from "@/lib/search/dates";

export interface FieldProps {
  draft: CriteriaDraft;
  update: (patch: Partial<CriteriaDraft>) => void;
}

export function CompanionsField({ draft, update }: FieldProps) {
  return (
    <div>
      <FieldLabel hint="Plusieurs choix possibles.">Avec qui sors-tu ?</FieldLabel>
      <MultiChips label="Avec qui" options={COMPANIONS} value={draft.companions} onChange={(companions) => update({ companions })} />
    </div>
  );
}

export function AgesField({ draft, update }: FieldProps) {
  return (
    <div>
      <FieldLabel hint="Facultatif. Indique les tranches d'âge présentes, surtout s'il y a des enfants.">Quels âges ?</FieldLabel>
      <MultiChips label="Tranches d'âge" options={AGE_GROUPS} value={draft.ageGroups} onChange={(ageGroups) => update({ ageGroups })} />
    </div>
  );
}

export function BudgetField({ draft, update }: FieldProps) {
  const b = draft.budget;
  const setBudget = (patch: Partial<CriteriaDraft["budget"]>) => update({ budget: { ...b, ...patch } });
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint="Prix d'entrée indicatif. Quand la source ne donne pas de prix, on l'affiche comme « Prix non renseigné ».">
          Quel budget ?
        </FieldLabel>
        <SingleChips label="Budget" options={BUDGET_PRESETS} value={b.preset} onChange={(preset) => setBudget({ preset: preset ?? "any" })} />
      </div>
      {b.preset === "custom" && (
        <label className="flex max-w-xs items-center gap-2 rounded-control border-2 border-forest-800/25 bg-card px-3 py-2">
          <span className="text-forest-700">Maximum</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={10000}
            value={b.customMax ?? ""}
            onChange={(e) => setBudget({ customMax: e.target.value === "" ? null : Math.max(0, Math.min(10000, Number(e.target.value))) })}
            className="w-24 bg-transparent text-right text-lg outline-none"
            aria-label="Budget maximum en euros"
          />
          <span>€</span>
        </label>
      )}
      {b.preset !== "any" && b.preset !== "free" && (
        <div className="flex flex-wrap items-center gap-3">
          <SingleChips
            label="Le budget s'entend"
            options={[
              { id: "person", label: "Par personne" },
              { id: "group", label: "Pour tout le groupe" },
            ]}
            value={b.scope}
            onChange={(scope) => setBudget({ scope: scope ?? "person" })}
          />
          {b.scope === "group" && (
            <label className="inline-flex items-center gap-2 text-[0.97rem]">
              <span>Nombre de personnes</span>
              <input
                type="number"
                min={1}
                max={50}
                value={b.groupSize}
                onChange={(e) => setBudget({ groupSize: Math.max(1, Math.min(50, Number.parseInt(e.target.value, 10) || 1)) })}
                className="w-16 rounded-control border-2 border-forest-800/25 bg-card px-2 py-1 text-right"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function EnvironmentField({ draft, update }: FieldProps) {
  return (
    <div>
      <FieldLabel hint="Souvent déduit du type de lieu (un musée est en intérieur) : on te le signale quand c'est le cas.">
        Dedans ou dehors ?
      </FieldLabel>
      <SingleChips label="Intérieur ou extérieur" options={ENVIRONMENTS} value={draft.environment} onChange={(environment) => update({ environment: environment ?? "any" })} />
    </div>
  );
}

export function CategoriesField({ draft, update, compact = false }: FieldProps & { compact?: boolean }) {
  const open = draft.categories.length === 0;
  const toggle = (id: CategoryId) =>
    update({ categories: draft.categories.includes(id) ? draft.categories.filter((c) => c !== id) : [...draft.categories, id] });
  return (
    <div>
      <FieldLabel hint="Choisis-en autant que tu veux, ou reste ouvert à tout.">Qu&apos;est-ce qui te tente ?</FieldLabel>
      <button
        type="button"
        aria-pressed={open}
        onClick={() => update({ categories: [] })}
        className={clsx(
          "mb-3 inline-flex min-h-11 items-center rounded-full border px-4 py-2 font-medium",
          open ? "border-forest-800 bg-balise text-forest-900" : "border-forest-800/25 bg-card hover:border-forest-800/60",
        )}
      >
        Je suis ouvert à toutes les propositions
      </button>
      <div role="group" aria-label="Catégories" className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
        {CATEGORIES.map((c) => {
          const on = draft.categories.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.id)}
              className={clsx(
                "flex min-h-14 items-center gap-3 rounded-control border px-3 py-2 text-left text-[0.95rem] leading-tight transition-colors",
                on ? "border-forest-800 bg-forest-800 text-paper" : "border-forest-800/20 bg-card hover:border-forest-800/60",
              )}
            >
              <CategoryIcon id={c.id} className={clsx("h-5 w-5 shrink-0", on ? "text-balise" : "text-forest-700")} />
              <span>{compact ? c.shortLabel : c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WhenField({ draft, update }: FieldProps) {
  const today = parisDate(new Date());
  return (
    <div className="space-y-3">
      <FieldLabel hint="Les dates ne sont garanties que pour les événements. Pour les lieux, vérifie les horaires sur leur site.">Quand ?</FieldLabel>
      <SingleChips
        label="Quand"
        options={WHEN_OPTIONS}
        value={draft.when.kind}
        onChange={(kind) => update({ when: { kind: kind ?? "any", date: kind === "date" ? (draft.when.date ?? today) : null } })}
      />
      {draft.when.kind === "date" && (
        <input
          type="date"
          min={today}
          value={draft.when.date ?? today}
          onChange={(e) => update({ when: { kind: "date", date: e.target.value || today } })}
          className="rounded-control border-2 border-forest-800/25 bg-card px-3 py-2"
          aria-label="Date de la sortie"
        />
      )}
    </div>
  );
}

export function EventTypeField({ draft, update }: FieldProps) {
  return (
    <div>
      <FieldLabel>Plutôt des lieux ou des événements ?</FieldLabel>
      <SingleChips label="Type de sortie" options={EVENT_TYPES} value={draft.eventType} onChange={(eventType) => update({ eventType: eventType ?? "any" })} />
    </div>
  );
}

export function AccessibilityField({ draft, update }: FieldProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-control border border-forest-800/20 bg-card p-3">
      <input
        type="checkbox"
        checked={draft.accessibleOnly}
        onChange={(e) => update({ accessibleOnly: e.target.checked })}
        className="mt-1 h-5 w-5 accent-forest-800"
      />
      <span>
        <span className="flex items-center gap-2 font-medium">
          <Accessibility className="h-5 w-5 text-forest-700" aria-hidden="true" />
          Accessible aux personnes à mobilité réduite
        </span>
        <span className="block text-[0.95rem] text-forest-700">
          On écarte les lieux signalés comme non accessibles et on met en avant ceux qui le sont. L&apos;information manque souvent.
        </span>
      </span>
    </label>
  );
}

export function PreferencesField({ draft, update }: FieldProps) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint="Tout est facultatif.">Quelques envies en plus</FieldLabel>
        <div className="space-y-3">
          <SingleChips label="Ambiance" options={MOODS} value={draft.mood} onChange={(mood) => update({ mood })} allowNone />
          <SingleChips label="Durée" options={DURATIONS} value={draft.duration} onChange={(duration) => update({ duration })} allowNone />
          <SingleChips label="Réservation" options={BOOKINGS} value={draft.booking} onChange={(booking) => update({ booking })} allowNone />
          <SingleChips label="Notoriété" options={FAME} value={draft.fame} onChange={(fame) => update({ fame })} allowNone />
        </div>
      </div>
    </div>
  );
}

export function IdealField({ draft, update }: FieldProps) {
  return (
    <div>
      <label htmlFor="ideal" className="mb-1 block font-display text-lg font-semibold">
        Décris la sortie idéale
      </label>
      <p id="ideal-hint" className="mb-2 text-[0.95rem] text-forest-700">
        Facultatif. Les mots-clés servent à affiner le classement (par exemple : « original », « au calme », « château »).
      </p>
      <textarea
        id="ideal"
        aria-describedby="ideal-hint"
        rows={3}
        maxLength={TEXT_LIMITS.ideal}
        value={draft.ideal}
        onChange={(e) => update({ ideal: e.target.value })}
        placeholder="Une sortie originale pour deux dimanche, pas trop loin, avec un budget raisonnable."
        className="w-full rounded-control border-2 border-forest-800/25 bg-card p-3 placeholder:text-forest-700/60 focus:border-forest-800"
      />
      <p className="text-right text-sm text-forest-700">
        {draft.ideal.length}/{TEXT_LIMITS.ideal}
      </p>
    </div>
  );
}

export function QueryField({ draft, update, onSubmit }: FieldProps & { onSubmit?: () => void }) {
  return (
    <div>
      <label htmlFor="query" className="mb-1 block font-display text-lg font-semibold">
        Une envie précise ?
      </label>
      <input
        id="query"
        type="search"
        maxLength={TEXT_LIMITS.query}
        value={draft.query}
        onChange={(e) => update({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="château, escalade, marché de Noël…"
        className="h-12 w-full rounded-control border-2 border-forest-800/25 bg-card px-3 text-lg placeholder:text-forest-700/60 focus:border-forest-800"
      />
    </div>
  );
}
