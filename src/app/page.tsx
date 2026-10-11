import { ChevronRight, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { Questionnaire } from "@/components/questionnaire";
import { TopoBackground } from "@/components/topo-background";
import { getCategory, type CategoryId } from "@/config/categories";

const SHOWCASE: { id: CategoryId; example: string }[] = [
  { id: "nature", example: "Une boucle avec vue, une cascade, un belvédère" },
  { id: "heritage", example: "Un château, une abbaye, des remparts" },
  { id: "culture", example: "Un musée, une expo, un concert" },
  { id: "markets", example: "Le marché du dimanche, une brocante" },
  { id: "animals", example: "Une ferme pédagogique, un centre équestre" },
  { id: "unusual", example: "Une grotte, un phare, un lieu étonnant" },
];

export default function HomePage() {
  return (
    <>
      <div className="relative overflow-hidden">
        <TopoBackground className="pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:gap-12 lg:pt-16">
          <div className="lg:pt-6">
            <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] text-forest-900 sm:text-6xl">Où sortir autour de chez toi ?</h1>
            <p className="mt-5 max-w-md text-lg text-forest-800">
              Quelques questions, et on te propose des sorties réelles près de ton point de départ : balades, patrimoine, musées,
              marchés, événements.
            </p>
            <p className="mt-4 max-w-md text-[0.95rem] text-forest-700">
              Les lieux viennent des offices de tourisme, d&apos;OpenStreetMap et d&apos;OpenAgenda, avec un lien vers chaque source.
              Rien n&apos;est inventé : une information inconnue reste affichée comme telle.
            </p>
          </div>
          <Questionnaire />
        </div>
      </div>

      <section aria-labelledby="direct-title" className="mx-auto max-w-6xl px-4 sm:px-6">
        <Link
          href="/recherche"
          className="group flex flex-col gap-4 rounded-card border-2 border-forest-800 bg-forest-800 p-6 text-paper sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div className="flex items-start gap-4">
            <SlidersHorizontal className="mt-1 h-7 w-7 shrink-0 text-balise" aria-hidden="true" />
            <div>
              <h2 id="direct-title" className="font-display text-2xl font-bold">
                Je sais ce que je cherche
              </h2>
              <p className="mt-1 max-w-xl text-forest-100">
                Tous les filtres sur un seul écran, et une recherche par mot-clé. Ton point de départ d&apos;abord, le reste ensuite.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 self-start rounded-control bg-balise px-5 py-3 font-display font-semibold text-forest-900 group-hover:bg-balise-deep sm:self-auto">
            Recherche rapide
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </span>
        </Link>
      </section>

      <section aria-labelledby="exemples-title" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <h2 id="exemples-title" className="font-display text-3xl font-bold text-forest-900">
          Le genre de sorties que tu trouveras
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE.map(({ id, example }) => (
            <li key={id} className="flex items-start gap-4 rounded-card border border-forest-800/15 bg-card p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-forest-100">
                <CategoryIcon id={id} className="h-5 w-5 text-forest-800" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{getCategory(id)?.label}</p>
                <p className="text-[0.97rem] text-forest-700">{example}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fonctionnement-title" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <h2 id="fonctionnement-title" className="font-display text-3xl font-bold text-forest-900">
          Comment ça marche
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            ["Ton point de départ", "Une ville, un code postal ou ta position. On mesure les distances à vol d'oiseau à partir de là."],
            ["Tes envies", "Distance, compagnie, budget, intérieur ou extérieur, thèmes : réponds à ce qui compte pour toi."],
            ["Des sorties vérifiables", "Chaque proposition renvoie vers sa source. Les prix et horaires inconnus sont signalés, jamais devinés."],
          ].map(([title, text], i) => (
            <li key={title} className="border-l-4 border-balise pl-4">
              <p className="font-display text-sm font-semibold text-forest-700">Étape {i + 1}</p>
              <p className="font-display text-xl font-bold">{title}</p>
              <p className="mt-1 text-forest-800">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
