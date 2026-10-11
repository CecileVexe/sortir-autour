import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources, méthode et confidentialité" };

const SOURCES = [
  {
    name: "DATAtourisme",
    url: "https://www.datatourisme.fr/",
    what: "Lieux, circuits et événements publiés par les offices de tourisme et comités départementaux.",
    licence: "Licence Ouverte / Open Licence 2.0 (Etalab). Le producteur et la date de mise à jour sont cités sur chaque carte.",
  },
  {
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    what: "Musées, parcs, châteaux, sites naturels, équipements de loisirs… cartographiés par les contributeurs.",
    licence: "© contributeurs OpenStreetMap, Open Database License (ODbL).",
  },
  {
    name: "Wikidata et Wikimedia Commons",
    url: "https://www.wikidata.org/",
    what: "Descriptions courtes, liens Wikipédia et photos des lieux référencés dans OpenStreetMap.",
    licence: "Wikidata : CC0. Photos : licence propre à chaque image (auteur et licence indiqués sous la carte).",
  },
  {
    name: "OpenAgenda",
    url: "https://openagenda.com/",
    what: "Événements des agendas publics (villes, médiathèques, festivals) liés à ta commune.",
    licence: "Licence indiquée par chaque agenda, le plus souvent Licence Ouverte 2.0.",
  },
  {
    name: "IGN Géoplateforme",
    url: "https://geoservices.ign.fr/",
    what: "Recherche de ville ou d'adresse et conversion en coordonnées.",
    licence: "Licence Ouverte 2.0.",
  },
];

export default function AProposPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Sources, méthode et confidentialité</h1>

      <section className="mt-10 space-y-4" aria-labelledby="sources">
        <h2 id="sources" className="font-display text-2xl font-bold">
          D&apos;où viennent les sorties
        </h2>
        <p>
          Toutes les sorties proviennent de bases de données ouvertes. Aucune n&apos;est générée par une intelligence artificielle. Chaque
          carte renvoie vers sa source.
        </p>
        <ul className="space-y-4">
          {SOURCES.map((s) => (
            <li key={s.name} className="rounded-card border border-forest-800/15 bg-card p-4">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-display text-lg font-bold text-lake underline-offset-2 hover:underline">
                {s.name}
              </a>
              <p className="mt-1">{s.what}</p>
              <p className="mt-1 text-[0.95rem] text-forest-700">{s.licence}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="methode">
        <h2 id="methode" className="font-display text-2xl font-bold">
          Comment les résultats sont choisis
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Les distances sont calculées à vol d&apos;oiseau depuis ton point de départ, pas en temps de trajet.</li>
          <li>Une même activité présente dans plusieurs sources est fusionnée en une seule carte.</li>
          <li>
            Un critère contredit par la source (par exemple un lieu signalé comme non accessible) écarte l&apos;activité. Une information
            absente ne l&apos;écarte pas : elle est signalée comme « non vérifiée » et l&apos;activité est classée plus bas.
          </li>
          <li>Exception : avec le budget « Gratuit », une activité sans prix connu est masquée, car rien ne prouve qu&apos;elle est gratuite.</li>
          <li>« Intérieur » ou « extérieur » est souvent déduit du type de lieu (un musée est en intérieur) et signalé comme tel.</li>
          <li>Les dates ne sont garanties que pour les événements. Les horaires des lieux ne sont jamais présentés comme vérifiés.</li>
          <li>Les résultats sont un échantillon des sources interrogées, pas un inventaire complet.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="confidentialite">
        <h2 id="confidentialite" className="font-display text-2xl font-bold">
          Confidentialité
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Pas de compte, pas de cookie publicitaire, pas de traceur.</li>
          <li>
            Ta position n&apos;est demandée que si tu cliques sur « Utiliser ma position ». Elle est arrondie à une centaine de mètres et sert
            uniquement à nommer ta commune et à calculer les distances. Elle n&apos;est pas enregistrée.
          </li>
          <li>Tes réponses au questionnaire restent dans l&apos;onglet de ton navigateur. Les favoris restent dans ton navigateur.</li>
          <li>Le serveur conserve des journaux techniques anonymes (nombre de résultats, erreurs des sources), sans texte saisi ni position.</li>
        </ul>
      </section>

      <section id="mentions" className="mt-10 space-y-3" aria-labelledby="mentions-title">
        <h2 id="mentions-title" className="font-display text-2xl font-bold">
          Mentions légales
        </h2>
        <p>
          Sortir Autour est un projet personnel, non commercial, hébergé par Vercel Inc. (440 N Barranca Ave #4133, Covina, CA 91723,
          États-Unis). Les informations sont fournies à titre indicatif : vérifie toujours les horaires, les tarifs et les conditions
          d&apos;accès auprès des organisateurs.
        </p>
      </section>
    </div>
  );
}
