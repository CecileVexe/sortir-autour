import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Cette page n&apos;existe pas</h1>
      <p className="mt-3 text-forest-800">Le sentier s&apos;arrête ici. Reviens à l&apos;accueil pour chercher une sortie.</p>
      <Link href="/" className="mt-6 inline-block rounded-control bg-balise px-5 py-3 font-display font-semibold text-forest-900">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
