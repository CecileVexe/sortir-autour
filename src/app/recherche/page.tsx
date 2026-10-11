import type { Metadata } from "next";
import { QuickSearch } from "@/components/quick-search";

export const metadata: Metadata = {
  title: "Recherche rapide",
  description: "Choisis ton point de départ puis filtre directement les sorties par distance, budget, thème et date.",
};

export default function RecherchePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold text-forest-900 sm:text-5xl">Je sais ce que je cherche</h1>
      <p className="mt-3 max-w-2xl text-lg text-forest-800">Commence par ton point de départ : les filtres apparaissent ensuite.</p>
      <QuickSearch />
    </div>
  );
}
