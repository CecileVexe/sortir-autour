"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  AccessibilityField,
  AgesField,
  BudgetField,
  CategoriesField,
  CompanionsField,
  EnvironmentField,
  EventTypeField,
  IdealField,
  PreferencesField,
  WhenField,
  type FieldProps,
} from "@/components/criteria-fields";
import { AiIdealAssist } from "@/components/ai";
import { LocationPicker } from "@/components/location-picker";
import { RadiusPicker } from "@/components/radius-picker";
import type { CriteriaDraft } from "@/lib/search/criteria";
import { draftToCriteria, resultsHref, useDraft } from "@/lib/search/use-draft";

interface Step {
  id: string;
  title: string;
  short: string;
  render: (p: FieldProps) => React.ReactNode;
  /** Hidden when it would not change the results (e.g. ages for a solo outing). */
  visible?: (d: CriteriaDraft) => boolean;
}

const STEPS: Step[] = [
  {
    id: "lieu",
    title: "D'où pars-tu ?",
    short: "Départ",
    render: ({ draft, update }) => <LocationPicker value={draft.origin} onChange={(origin) => update({ origin })} autoFocus size="lg" />,
  },
  {
    id: "distance",
    title: "Jusqu'où es-tu prêt à aller ?",
    short: "Distance",
    render: ({ draft, update }) => <RadiusPicker value={draft.radiusKm} onChange={(radiusKm) => update({ radiusKm })} />,
  },
  { id: "avec-qui", title: "Avec qui ?", short: "Avec qui", render: (p) => <CompanionsField {...p} /> },
  {
    id: "ages",
    title: "Quels âges ?",
    short: "Âges",
    render: (p) => <AgesField {...p} />,
    visible: (d) => d.companions.length === 0 || d.companions.some((c) => c === "family" || c === "toddlers" || c === "teens" || c === "group" || c === "friends"),
  },
  { id: "budget", title: "Quel budget ?", short: "Budget", render: (p) => <BudgetField {...p} /> },
  { id: "environnement", title: "Dedans ou dehors ?", short: "Lieu", render: (p) => <EnvironmentField {...p} /> },
  { id: "categories", title: "Qu'est-ce qui te tente ?", short: "Envies", render: (p) => <CategoriesField {...p} /> },
  {
    id: "plus",
    title: "Derniers détails",
    short: "Détails",
    render: (p) => (
      <div className="space-y-7">
        <WhenField {...p} />
        <EventTypeField {...p} />
        <PreferencesField {...p} />
        <AccessibilityField {...p} />
        <div>
          <IdealField {...p} />
          <AiIdealAssist draft={p.draft} setDraft={(d) => p.update(d)} />
        </div>
      </div>
    ),
  },
];

export function Questionnaire() {
  const router = useRouter();
  const { draft, update, ready } = useDraft();
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const steps = useMemo(() => STEPS.filter((s) => !s.visible || s.visible(draft)), [draft]);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const isLast = index >= steps.length - 1;
  const canContinue = step.id !== "lieu" || !!draft.origin;

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [index]);

  function next() {
    if (!canContinue) return;
    if (isLast) submit();
    else setIndex((i) => i + 1);
  }

  function submit() {
    const c = draftToCriteria(draft);
    if (!c) {
      setIndex(0);
      return;
    }
    router.push(resultsHref(c));
  }

  return (
    <section aria-labelledby="questionnaire-title" className="relative rounded-card border border-forest-800/15 bg-card p-5 sm:p-8">
      {/* Progress: trail markers, one per step. */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-forest-700">
          <span>
            Étape {index + 1} sur {steps.length}
          </span>
          {draft.origin && index > 0 && <span className="truncate pl-3">Départ : {draft.origin.label}</span>}
        </div>
        <ol className="flex gap-1.5" aria-label="Progression">
          {steps.map((s, i) => (
            <li key={s.id} className="flex-1">
              <button
                type="button"
                disabled={i > index && !draft.origin}
                onClick={() => (i === 0 || draft.origin ? setIndex(i) : undefined)}
                aria-current={i === index ? "step" : undefined}
                aria-label={`${s.short}${i < index ? " (fait)" : ""}`}
                className={clsx(
                  "block h-2 w-full rounded-full transition-colors disabled:cursor-not-allowed",
                  i < index ? "bg-forest-700" : i === index ? "bg-balise" : "bg-contour",
                )}
              />
            </li>
          ))}
        </ol>
      </div>

      <h2
        id="questionnaire-title"
        ref={headingRef}
        tabIndex={-1}
        className="mb-6 font-display text-3xl font-bold text-forest-900 outline-none sm:text-[2.6rem]"
      >
        {step.title}
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div className="min-h-[180px]">{ready ? step.render({ draft, update }) : null}</div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className={clsx("inline-flex min-h-12 items-center gap-1 rounded-control px-3 font-medium text-forest-800 hover:bg-forest-100", index === 0 && "invisible")}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            Retour
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {index > 0 && !isLast && (
              <button type="button" onClick={submit} className="min-h-12 rounded-control px-3 font-medium text-lake hover:bg-lake/10">
                Voir les sorties maintenant
              </button>
            )}
            <button
              type="submit"
              disabled={!canContinue}
              className="inline-flex min-h-12 items-center gap-2 rounded-control bg-balise px-6 font-display text-lg font-semibold text-forest-900 hover:bg-balise-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLast ? (
                <>
                  <Search className="h-5 w-5" aria-hidden="true" />
                  Voir les sorties
                </>
              ) : (
                <>
                  Continuer
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
        {step.id === "lieu" && !draft.origin && (
          <p className="mt-3 text-[0.95rem] text-forest-700">Choisis un lieu dans la liste pour continuer.</p>
        )}
      </form>
    </section>
  );
}
