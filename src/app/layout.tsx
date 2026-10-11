import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Familjen_Grotesk } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import "./globals.css";

const display = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-familjen", weight: ["500", "600", "700"], display: "swap" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", weight: ["400", "500", "700"], display: "swap", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "Sortir Autour — des idées de sorties près de chez toi", template: "%s · Sortir Autour" },
  description:
    "Trouve des sorties réelles autour de toi : nature, patrimoine, musées, marchés, événements. Données des offices de tourisme, d'OpenStreetMap et d'OpenAgenda.",
  applicationName: "Sortir Autour",
};

export const viewport: Viewport = { themeColor: "#1f3d2e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-balise focus:px-4 focus:py-2 focus:rounded-control">
          Aller au contenu
        </a>
        <header className="border-b border-forest-800/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-lg font-bold text-forest-800 sm:text-xl" aria-label="Sortir Autour, accueil">
              <Logo className="h-8 w-8" />
              <span>Sortir Autour</span>
            </Link>
            <nav aria-label="Navigation principale" className="flex items-center gap-0.5 whitespace-nowrap text-[0.95rem] sm:gap-1">
              <Link href="/recherche" className="rounded-control px-2 py-2 text-forest-800 hover:bg-forest-100 sm:px-3">
                <span className="sm:hidden">Recherche</span>
                <span className="hidden sm:inline">Recherche rapide</span>
              </Link>
              <Link href="/favoris" className="rounded-control px-2 py-2 text-forest-800 hover:bg-forest-100 sm:px-3">
                Favoris
              </Link>
            </nav>
          </div>
        </header>
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <footer className="mt-16 border-t border-forest-800/10 bg-paper-deep">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-forest-800 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
            <div className="space-y-2">
              <p className="font-display text-base font-bold">Sortir Autour</p>
              <p className="max-w-prose text-forest-700">
                Projet personnel non commercial. Les informations proviennent de sources ouvertes et peuvent être incomplètes : vérifie
                toujours les horaires et les tarifs auprès de l&apos;organisateur avant de te déplacer.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-bold">Sources</p>
              <ul className="space-y-1 text-forest-700">
                <li>DATAtourisme (Licence Ouverte 2.0)</li>
                <li>© contributeurs OpenStreetMap (ODbL)</li>
                <li>OpenAgenda · Wikidata · Wikimedia Commons</li>
                <li>Géocodage : IGN Géoplateforme</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-bold">À propos</p>
              <ul className="space-y-1">
                <li>
                  <Link className="text-lake underline-offset-2 hover:underline" href="/a-propos">
                    Sources, méthode et confidentialité
                  </Link>
                </li>
                <li>
                  <Link className="text-lake underline-offset-2 hover:underline" href="/a-propos#mentions">
                    Mentions légales
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
