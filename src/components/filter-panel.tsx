"use client";

import { Search } from "lucide-react";
import {
  AccessibilityField,
  AgesField,
  BudgetField,
  CategoriesField,
  CompanionsField,
  EnvironmentField,
  EventTypeField,
  PreferencesField,
  QueryField,
  WhenField,
  type FieldProps,
} from "@/components/criteria-fields";
import { RadiusPicker } from "@/components/radius-picker";

/** Every filter on one screen. Used by the quick search and by "Modifier les filtres" on results. */
export function FilterPanel({ draft, update, onSubmit, submitLabel = "Voir les sorties" }: FieldProps & { onSubmit: () => void; submitLabel?: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-8"
    >
      <QueryField draft={draft} update={update} onSubmit={onSubmit} />
      <section aria-label="Distance">
        <p className="mb-3 font-display text-lg font-semibold">Distance maximale</p>
        <RadiusPicker value={draft.radiusKm} onChange={(radiusKm) => update({ radiusKm })} />
      </section>
      <CategoriesField draft={draft} update={update} compact />
      <BudgetField draft={draft} update={update} />
      <div className="grid gap-8 md:grid-cols-2">
        <CompanionsField draft={draft} update={update} />
        <AgesField draft={draft} update={update} />
        <EnvironmentField draft={draft} update={update} />
        <EventTypeField draft={draft} update={update} />
        <WhenField draft={draft} update={update} />
        <PreferencesField draft={draft} update={update} />
      </div>
      <AccessibilityField draft={draft} update={update} />
      <div className="sticky bottom-0 -mx-4 border-t border-forest-800/10 bg-paper/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-balise px-6 font-display text-lg font-semibold text-forest-900 hover:bg-balise-deep sm:w-auto"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
