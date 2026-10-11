import type { Metadata } from "next";
import Link from "next/link";
import { ResultsView } from "@/components/results-view";
import { decodeCriteria } from "@/lib/search/criteria";

export const metadata: Metadata = { title: "Résultats", robots: { index: false } };

export default async function ResultatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = typeof sp.c === "string" ? sp.c : null;
  const criteria = decodeCriteria(raw);

  if (!criteria) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Ce lien de recherche n&apos;est pas valide</h1>
        <p className="mt-3 text-forest-800">Il est incomplet ou a été modifié. Relance une recherche depuis l&apos;accueil.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-control bg-balise px-5 py-3 font-display font-semibold text-forest-900">
            Répondre au questionnaire
          </Link>
          <Link href="/recherche" className="rounded-control border-2 border-forest-800 px-5 py-3 font-medium text-forest-800">
            Recherche rapide
          </Link>
        </div>
      </div>
    );
  }

  return <ResultsView criteria={criteria} />;
}
