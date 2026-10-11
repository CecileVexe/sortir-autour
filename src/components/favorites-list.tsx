"use client";

import Link from "next/link";
import { ActivityCard } from "@/components/activity-card";
import { useFavorites } from "@/lib/favorites";

export function FavoritesList() {
  const { list, loaded, isFavorite, toggle, clear } = useFavorites();
  if (!loaded) return null;

  if (list.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-dashed border-forest-800/30 p-8">
        <p className="font-display text-xl font-bold">Aucun favori pour l&apos;instant</p>
        <p className="mt-1 text-forest-800">Touche le cœur sur une carte de résultat pour la retrouver ici.</p>
        <Link href="/" className="mt-4 inline-block rounded-control bg-balise px-5 py-3 font-display font-semibold text-forest-900">
          Trouver une sortie
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Supprimer tous les favoris de ce navigateur ?")) clear();
          }}
          className="min-h-11 rounded-control px-3 text-brick hover:bg-brick/10"
        >
          Tout supprimer
        </button>
      </div>
      <ul className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(({ activity }) => (
          <li key={activity.id}>
            <ActivityCard a={activity} favorite={isFavorite(activity.id)} onToggleFavorite={toggle} />
          </li>
        ))}
      </ul>
    </>
  );
}
