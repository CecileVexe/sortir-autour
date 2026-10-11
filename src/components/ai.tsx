"use client";

import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCategory } from "@/config/categories";
import { BUDGET_PRESETS, COMPANIONS } from "@/config/options";
import { applyInterpretation, type Interpretation } from "@/lib/ai/interpretation";
import type { CriteriaDraft, SearchCriteria } from "@/lib/search/criteria";

interface AiStatus {
  enabled: boolean;
  provider: string | null;
  maxInputChars: number;
}
interface AiErrorBody {
  aiError?: { code: string; message: string };
  error?: { message: string };
}

let statusPromise: Promise<AiStatus> | null = null;

/** AI availability, fetched once per page load. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/ai/status")
      .then((r) => r.json() as Promise<AiStatus>)
      .catch(() => ({ enabled: false, provider: null, maxInputChars: 0 }));
    let alive = true;
    statusPromise.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

async function postAi<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & AiErrorBody;
  if (!res.ok || json.aiError || json.error) {
    throw new Error(json.aiError?.message ?? json.error?.message ?? "Le service IA ne répond pas. Tu peux continuer avec les filtres classiques.");
  }
  return json;
}

function describe(i: Interpretation): string[] {
  const out: string[] = [];
  if (i.categories?.length) out.push(`Envies : ${i.categories.map((c) => getCategory(c)?.shortLabel).join(", ")}`);
  if (i.companions?.length) out.push(`Avec : ${i.companions.map((c) => COMPANIONS.find((x) => x.id === c)?.label).join(", ")}`);
  if (i.budget) out.push(`Budget : ${i.budget === "custom" && i.customBudgetMax != null ? `${i.customBudgetMax} € max` : BUDGET_PRESETS.find((b) => b.id === i.budget)?.label}`);
  if (i.environment && i.environment !== "any") out.push(i.environment === "indoor" ? "En intérieur" : "En extérieur");
  if (i.radiusKm) out.push(`Rayon : ${i.radiusKm} km (approximatif)`);
  if (i.when && i.when.kind !== "any") out.push(`Quand : ${i.when.kind === "today" ? "aujourd'hui" : i.when.kind === "weekend" ? "ce week-end" : i.when.date}`);
  if (i.eventType && i.eventType !== "any") out.push(i.eventType === "events" ? "Événements" : "Lieux permanents");
  if (i.mood) out.push(i.mood === "calm" ? "Plutôt calme" : "Plutôt dynamique");
  if (i.fame) out.push(i.fame === "hidden" ? "Découvertes originales" : "Lieux connus");
  if (i.accessibleOnly) out.push("Accessible PMR");
  if (i.keywords) out.push(`Mots-clés : ${i.keywords}`);
  return out;
}

/** "Analyse my description" — proposes criteria; nothing changes until the user applies them. */
export function AiIdealAssist({ draft, setDraft }: { draft: CriteriaDraft; setDraft: (d: CriteriaDraft) => void }) {
  const status = useAiStatus();
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "error"; msg: string } | { kind: "done"; i: Interpretation } | { kind: "applied" }>({
    kind: "idle",
  });
  if (!status?.enabled) return null;
  const text = draft.ideal.trim();

  async function run() {
    setState({ kind: "loading" });
    try {
      const { interpretation } = await postAi<{ interpretation: Interpretation }>("/api/ai/interpret", { text });
      setState({ kind: "done", i: interpretation });
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <div className="mt-3 rounded-control border border-lake/30 bg-lake/5 p-3">
      {state.kind !== "done" && (
        <button
          type="button"
          onClick={run}
          disabled={text.length < 5 || state.kind === "loading"}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-lake hover:bg-lake/10 disabled:opacity-50"
        >
          {state.kind === "loading" ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
          Transformer ma description en critères (IA)
        </button>
      )}
      {state.kind === "idle" && (
        <p className="px-2 text-sm text-forest-700">Facultatif. L&apos;IA propose des critères ; rien n&apos;est modifié sans ton accord.</p>
      )}
      {state.kind === "applied" && <p className="px-2 text-sm font-medium text-forest-800">Critères appliqués. Tu peux les ajuster aux étapes précédentes.</p>}
      {state.kind === "error" && (
        <p role="alert" className="px-2 text-sm text-brick">
          {state.msg}
        </p>
      )}
      {state.kind === "done" && (
        <div className="space-y-2 px-1">
          {state.i.summary && <p className="text-[0.95rem]">{state.i.summary}</p>}
          {describe(state.i).length > 0 ? (
            <ul className="list-disc pl-5 text-[0.95rem] text-forest-800">
              {describe(state.i).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.95rem] text-forest-700">Aucun critère précis n&apos;a été détecté.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft(applyInterpretation(draft, state.i));
                setState({ kind: "applied" });
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-control bg-forest-800 px-4 font-medium text-paper"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Appliquer ces critères
            </button>
            <button type="button" onClick={() => setState({ kind: "idle" })} className="inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-forest-800 hover:bg-forest-100">
              <X className="h-4 w-4" aria-hidden="true" /> Ignorer
            </button>
          </div>
          <p className="text-xs text-forest-700">Proposé par une IA ({status.provider}) : vérifie avant d&apos;appliquer.</p>
        </div>
      )}
    </div>
  );
}

export interface AiExplanation {
  summary: string | null;
  items: { id: string; why: string }[];
}

/** Results: explains the first activities, on demand only. */
export function AiExplainPanel({ criteria, ids, onExplained }: { criteria: SearchCriteria; ids: string[]; onExplained: (e: AiExplanation) => void }) {
  const status = useAiStatus();
  const [state, setState] = useState<{ kind: "idle" | "loading" } | { kind: "error"; msg: string } | { kind: "done"; summary: string | null }>({ kind: "idle" });
  if (!status?.enabled || ids.length === 0) return null;

  async function run() {
    setState({ kind: "loading" });
    try {
      const { explanation } = await postAi<{ explanation: AiExplanation }>("/api/ai/explain", { criteria, ids });
      onExplained(explanation);
      setState({ kind: "done", summary: explanation.summary });
    } catch (err) {
      setState({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <div className="mb-4 rounded-control border border-lake/30 bg-lake/5 px-4 py-3">
      {state.kind === "done" ? (
        <div>
          <p className="flex items-center gap-2 font-medium text-lake-deep">
            <Sparkles className="h-5 w-5" aria-hidden="true" /> Synthèse (IA, à partir des données affichées)
          </p>
          {state.summary && <p className="mt-1">{state.summary}</p>}
          <p className="mt-1 text-xs text-forest-700">Les explications apparaissent sur les premières cartes. Vérifie les informations sur les sites sources.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={state.kind === "loading"}
            className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-lake hover:bg-lake/10 disabled:opacity-60"
          >
            {state.kind === "loading" ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
            Pourquoi ces suggestions ? (IA)
          </button>
          {state.kind === "error" ? (
            <p role="alert" className="text-sm text-brick">
              {state.msg}
            </p>
          ) : (
            <p className="text-sm text-forest-700">Une IA résume les premières propositions, sans rien inventer.</p>
          )}
        </div>
      )}
    </div>
  );
}
