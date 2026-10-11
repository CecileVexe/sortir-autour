import type { Metadata } from "next";
import { FavoritesList } from "@/components/favorites-list";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

export default function FavorisPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Mes favoris</h1>
      <p className="mt-2 max-w-2xl text-forest-800">
        Enregistrés uniquement dans ce navigateur, sans compte. Les informations datent du moment où tu les as ajoutés.
      </p>
      <FavoritesList />
    </div>
  );
}
