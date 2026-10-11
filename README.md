# Sortir Autour

Application web qui propose des **sorties réelles** autour d'un point de départ en France : nature, patrimoine, musées, marchés, événements… selon la distance, le public, le budget, l'environnement (intérieur ou extérieur), les thèmes et la date.

- **Deux parcours, un seul moteur** : un questionnaire guidé (page d'accueil) et une recherche rapide avec filtres (`/recherche`). Les deux produisent les mêmes critères et appellent la même route `/api/search`.
- **Données ouvertes et vérifiables** : DATAtourisme (offices de tourisme), OpenStreetMap (avec Wikidata et Wikimedia Commons) et OpenAgenda. Chaque carte renvoie vers sa source. Une information inconnue reste affichée comme inconnue.
- **IA facultative** (Groq) : elle transforme une description libre en critères et explique les résultats. Elle n'invente aucun lieu ni aucun prix, et l'application fonctionne entièrement sans elle.
- **Coût nul** : Vercel Hobby, services gratuits, aucune base de données obligatoire.

> Projet personnel non commercial. Le cadrage (audit des sources, choix techniques) est dans [`docs/01-cadrage.md`](docs/01-cadrage.md).

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Variables d'environnement](#variables-denvironnement)
3. [Sources de données](#sources-de-données)
4. [Architecture](#architecture)
5. [Moteur de recherche](#moteur-de-recherche)
6. [IA et quotas](#ia-et-quotas)
7. [Sécurité et vie privée](#sécurité-et-vie-privée)
8. [Tests et qualité](#tests-et-qualité)
9. [Déploiement sur Vercel](#déploiement-sur-vercel)
10. [Limites connues et coûts](#limites-connues-et-coûts)
11. [Faire évoluer le projet](#faire-évoluer-le-projet)

---

## Démarrage rapide

Prérequis : **Node.js 20.9 ou plus récent** (testé avec Node 22) et npm.

```bash
npm install
cp .env.example .env.local   # puis renseigne au moins DATATOURISME_API_KEY et OPENAGENDA_API_KEY
npm run dev                  # http://localhost:3000
```

Sans aucune clé, l'application démarre quand même : OpenStreetMap ne demande pas de clé, et les sources non configurées sont signalées dans l'interface. Pour travailler hors ligne, ou sans dépendre des API, mets `DEMO_DATA=true` (des activités **fictives**, marquées « Démo », sont ajoutées ; ce réglage est ignoré en production).

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm start` | Build et serveur de production en local |
| `npm run typecheck` | Vérification TypeScript (strict) |
| `npm run lint` | ESLint (règles Next.js + TypeScript) |
| `npm test` | Tests unitaires et de routes (Vitest) |
| `npm run test:e2e` | Parcours complets dans un navigateur (Playwright) |
| `npm run check` | typecheck + lint + tests + build |

---

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example). Aucune n'est exposée au navigateur.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATATOURISME_API_KEY` | Recommandée | Source principale (lieux et événements des offices de tourisme) |
| `OPENAGENDA_API_KEY` | Recommandée | Événements culturels |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommandées en production | Cache partagé et limitation de débit fiable |
| `AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` | Non | Fonctions IA |
| `AI_DAILY_LIMIT`, `AI_PER_USER_PER_HOUR`, `AI_MAX_INPUT_CHARS` | Non | Plafonds de coût de l'IA |
| `PROVIDER_*_ENABLED` | Non | Active ou désactive une source sans toucher au code |
| `APP_CONTACT` | Conseillée | Contact placé dans le User-Agent (règles d'usage OSM et Wikidata) |
| `DEMO_DATA` | Non | Données fictives en développement |

**Obtenir les clés**
- **DATAtourisme** : formulaire sur <https://www.datatourisme.fr/utiliser-les-donnees/>. La clé se passe dans l'en-tête `X-API-Key`.
- **OpenAgenda** : crée un compte sur <https://openagenda.com>, puis Paramètres du compte → clé API (clé publique de lecture).
- **Upstash** : <https://console.upstash.com>, puis *Create database* (offre gratuite, région Europe). Copie *UPSTASH_REDIS_REST_URL* et *UPSTASH_REDIS_REST_TOKEN* depuis l'onglet REST API.
- **Groq** : <https://console.groq.com/keys>.

---

## Sources de données

Audit détaillé (quotas, licences, limites) : [`docs/01-cadrage.md`](docs/01-cadrage.md).

| Source | Apporte | Accès | Licence / attribution | Cache |
|---|---|---|---|---|
| **IGN Géoplateforme** | Autocomplétion d'adresses, géocodage inverse | Sans clé, 50 req/s par IP | Licence Ouverte 2.0 | 7 jours |
| **DATAtourisme** | Lieux, circuits, fêtes et manifestations ; prix structurés | Clé gratuite, 1 000 req/h | Licence Ouverte 2.0 : producteur et date de mise à jour cités sur chaque carte | Lieux 24 h, événements 2 h |
| **OpenStreetMap (Overpass)** | Musées, parcs, châteaux, sites naturels, loisirs… | Sans clé, instances publiques partagées | © contributeurs OpenStreetMap, ODbL | 24 h + copie de secours de 7 jours |
| **Wikidata / Wikimedia Commons** | Descriptions courtes, liens Wikipédia, photos (auteur et licence affichés) | Sans clé | CC0 (Wikidata) ; licence propre à chaque photo | Avec OSM |
| **OpenAgenda** | Événements des agendas publics liés à la commune | Clé de lecture gratuite | Licence indiquée par événement (souvent Licence Ouverte 2.0) | Agendas 24 h, événements 2 h |

**Constats importants, vérifiés en conditions réelles (octobre 2026)**
- L'API DATAtourisme **ne renvoie pas d'images**, même si le schéma prévoit le champ. Les images viennent de Wikimedia Commons (via Wikidata) et d'OpenAgenda. Sinon, une illustration générique par catégorie est affichée, jamais une fausse photo.
- La recherche OpenAgenda sur **tous** les agendas exige un droit spécial (`events:transverse`). L'application trouve donc les agendas récemment actifs liés à la commune, puis lit leurs événements dans la zone.
- Les **instances publiques d'Overpass sont souvent saturées** (réponses 504, 15 à 25 s). D'où la recherche en deux temps décrite plus bas, le cache et la copie de secours.
- Aucune API de recherche web n'est à la fois gratuite, durable et autorisée pour cet usage : il n'y a **pas de recherche d'« articles » sur le web**. Les fiches des offices de tourisme, d'OpenAgenda et de Wikipédia jouent ce rôle.

---

## Architecture

```
src/
├─ app/                       Pages (App Router) et routes serveur
│  ├─ page.tsx                Accueil + questionnaire (mode A)
│  ├─ recherche/              Recherche rapide (mode B)
│  ├─ resultats/              Résultats (critères encodés dans ?c=, lien partageable)
│  ├─ favoris/, a-propos/     Favoris locaux ; sources, méthode, confidentialité
│  └─ api/
│     ├─ search/              POST : moteur de recherche (phases "fast" et "full")
│     ├─ geocode/             GET : autocomplétion ; POST : géocodage inverse
│     └─ ai/                  status, interpret, explain
├─ components/                Interface (questionnaire, filtres, cartes, résultats, IA)
├─ config/
│  ├─ categories.ts           Catégories : tags OSM, classes DATAtourisme, mots-clés (source unique)
│  └─ options.ts              Options du questionnaire et des filtres
└─ lib/
   ├─ search/                 criteria (Zod), engine, ranking, dedupe, dates, use-draft
   ├─ providers/              Fournisseurs de données (interface commune) + registre
   │  ├─ datatourisme/  osm/ (+ wikidata)  openagenda/  demo/
   ├─ geocoding/              Géoplateforme IGN
   ├─ geo/                    Haversine, rectangle englobant, filtrage par rayon
   ├─ activity/               Modèle Activity, normalisation, formatage
   ├─ ai/                     Interface fournisseur, Groq, quotas, interprétation, explications
   ├─ cache/  ratelimit/      Upstash Redis ou mémoire
   ├─ security/url.ts         Contrôle des URL externes
   ├─ env.ts  errors.ts  log.ts  http.ts  api.ts
```

**Choix structurants**
- **Next.js 16 (App Router) et TypeScript strict** : interface et routes serveur dans un seul projet, déployable tel quel sur Vercel.
- **Tailwind CSS v4** pour le design system (tokens dans `globals.css`), avec des composants maison accessibles plutôt qu'une bibliothèque lourde. Icônes `lucide-react`.
- **Zod** valide toutes les entrées (critères, corps de requête) et toutes les réponses des fournisseurs, de façon tolérante : un champ inattendu est ignoré, jamais inventé.
- **Pas de base de données** : les critères vivent dans l'URL, le brouillon du questionnaire dans `sessionStorage`, les favoris dans `localStorage`. Le seul stockage serveur est le cache Redis, facultatif.
- **Distances à vol d'oiseau** (Haversine), toujours indiquées comme telles. Le calcul routier demanderait un service payant ou interdit en production.
- **Images non optimisées par Vercel** (`images.unoptimized`) : les sources fournissent déjà des vignettes dimensionnées, et le quota gratuit d'optimisation d'images de Vercel est limité. Le chargement reste différé.

---

## Moteur de recherche

1. **Validation** des critères (Zod), puis limitation de débit par visiteur.
2. **Fournisseurs en parallèle**, chacun isolé : une source en panne ou trop lente est signalée, sans faire échouer la recherche.
3. **Deux phases** :
   - `fast` : DATAtourisme et OpenAgenda, plus OSM s'il est en cache. Les résultats s'affichent tout de suite.
   - `full` : lancée automatiquement par l'interface si une source lente manque. Elle interroge Overpass (jusqu'à environ 28 s) ; le reste est servi depuis le cache. La liste est complétée sans action de l'utilisateur.
4. **Normalisation** vers le modèle commun `Activity` (`src/lib/activity/types.ts`). Les champs inconnus restent `null`, et le statut de l'information (`verified`, `indicative`, `unknown`) est conservé.
5. **Filtrage par rayon** côté serveur (Haversine), après une requête par rectangle ou par rayon auprès de chaque source.
6. **Déduplication** entre sources : identifiant Wikidata, même page web, nom normalisé et distance (moins de 200 m), avec fusion des champs les plus riches et de toutes les sources.
7. **Filtres et classement déterministes** (`ranking.ts`) :
   - un critère **contredit** par la source écarte l'activité (lieu non accessible, prix au-dessus du budget, en extérieur alors qu'on veut l'intérieur…) ;
   - une information **absente** n'écarte pas : elle baisse le score et apparaît comme « non vérifiée » sur la carte. Seule exception : le budget « Gratuit », où un prix inconnu n'est pas considéré comme gratuit ;
   - le score tient compte de la distance, de la catégorie, du mot-clé, du budget, du public, de l'environnement, des envies, des dates et de la complétude de la fiche. Une passe de diversité évite les séries d'éléments identiques.
8. **Pagination** (18 par page). L'interface distingue le nombre de résultats correspondants du nombre d'activités récupérées, et précise que ce n'est pas un inventaire complet.

---

## IA et quotas

Trois modes :

| Mode | Configuration | Comportement |
|---|---|---|
| Sans IA (par défaut) | `AI_PROVIDER=none` | Tout fonctionne. Le texte « sortie idéale » sert de bonus de mots-clés dans le classement. |
| IA du propriétaire | `AI_PROVIDER=groq` + `GROQ_API_KEY` | Boutons « Transformer ma description en critères » et « Pourquoi ces suggestions ? » |
| Clé personnelle | Non proposée dans le MVP | L'interface `AiProvider` le permettrait (clé gardée en mémoire, jamais stockée). |

**Garde-fous**
- Appels uniquement **sur action de l'utilisateur**, via des routes serveur. La clé n'est jamais exposée.
- L'IA ne reçoit que des listes fermées (catégories, budgets…) ou les données **réellement récupérées**, rechargées côté serveur à partir de leur identifiant. Sa réponse JSON est validée : tout identifiant inconnu est rejeté, et les liens et le HTML sont retirés.
- **Plafonds** : `AI_DAILY_LIMIT` par jour pour tout le site (compteur Redis), `AI_PER_USER_PER_HOUR` par visiteur, `AI_MAX_INPUT_CHARS` pour la taille du texte, et une taille de réponse limitée. Pense aussi à fixer une limite de dépenses dans la console du fournisseur.
- **Erreurs distinguées**, avec un message clair et un retour au mode classique : quota temporaire (429), crédit épuisé, clé invalide, fournisseur indisponible, IA non configurée, plafond du site atteint. L'application n'affiche jamais un quota restant qu'elle ne connaît pas.
- Le modèle Groq par défaut est `openai/gpt-oss-20b`. Groq retire régulièrement des modèles (`llama-3.3-70b-versatile` a été retiré en août 2026) : il se change via `GROQ_MODEL`.

---

## Sécurité et vie privée

- **Validation serveur** de tous les paramètres (Zod), corps de requête limité à 8 Ko (413 au-delà), textes nettoyés et tronqués.
- **Limitation de débit** sur `/api/search`, `/api/geocode` et `/api/ai/*`. Avec Upstash, c'est une fenêtre glissante globale fiable. **Sans Upstash, le compteur est en mémoire, par instance serverless : c'est une protection partielle**, qu'un client déterminé peut contourner.
- **URL externes contrôlées** (`safeExternalUrl`) : uniquement http(s), pas d'IP locale ni d'identifiants dans l'URL. Les liens s'ouvrent avec `rel="noopener noreferrer"`. Les images ne sont optimisées que depuis des hôtes autorisés.
- **En-têtes** : `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`.
- **Secrets** : uniquement dans `.env.local` (ignoré par git) et dans les variables Vercel. Les messages d'erreur ne révèlent ni les clés ni les détails internes.
- **Vie privée** : pas de compte, pas de traceur. La géolocalisation n'est demandée qu'au clic ; elle est arrondie à environ 100 m et envoyée en POST, jamais dans une URL ni un journal. Les journaux serveur ne contiennent ni texte saisi ni position.

---

## Tests et qualité

```bash
npm run typecheck && npm run lint && npm test && npm run build
PW_CHANNEL=msedge npm run test:e2e     # ou, en CI : npx playwright install chromium && npm run test:e2e
```

- **107 tests unitaires et de routes** (Vitest) : distances, rayon, filtres de budget et de catégorie, classement et tri, normalisation sur de **vraies réponses d'API** (`tests/fixtures/`), données incomplètes ou malformées, déduplication, dates (fuseau Europe/Paris), sûreté des URL, phases du moteur, pannes et délais des sources, erreurs et quotas IA (429, crédit, clé invalide, réseau), routes `/api/search`, `/api/geocode` et `/api/ai/*` (validation, 413, 429).
- **10 tests de bout en bout** (Playwright, ordinateur et mobile) : questionnaire complet avec retour arrière, recherche rapide, absence de résultat avec suggestions, tri, modification des filtres, lien invalide. Ils tournent avec des données **fictives** et un géocodage simulé : aucune dépendance réseau.

Les données fictives (`src/lib/providers/demo`, `src/test-utils`) ne servent qu'au développement et aux tests. Elles sont toujours étiquetées « Démo » et désactivées en production.

---

## Déploiement sur Vercel

1. **Pousse le dépôt sur GitHub** (il ne contient aucun secret : vérifie que `.env.local` n'est pas suivi avec `git status`).
2. Sur <https://vercel.com/new>, importe le dépôt. Le framework *Next.js* est détecté automatiquement ; les commandes par défaut conviennent.
3. Dans **Settings → Environment Variables**, ajoute au minimum `DATATOURISME_API_KEY` et `OPENAGENDA_API_KEY`. Ajoute aussi, de préférence, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` et `APP_CONTACT`, puis, si tu veux l'IA, `AI_PROVIDER=groq` et `GROQ_API_KEY`. **Ne mets jamais `DEMO_DATA=true` en production** (il y est de toute façon ignoré).
4. Lance le déploiement. Chaque push sur `main` redéploie automatiquement.
5. Vérifie, dans *Settings → Functions*, que la durée maximale autorise 40 s (`maxDuration` de la route de recherche, nécessaire pour attendre Overpass en phase complète).

**Procédure de test après déploiement**
1. Ouvre l'URL de production. Saisis « Lyon » : les suggestions doivent apparaître, venant de l'IGN.
2. Va au bout du questionnaire. Des résultats doivent s'afficher en quelques secondes, puis le bandeau « Recherche dans OpenStreetMap en cours » doit apparaître et disparaître.
3. Ouvre « À savoir sur ces résultats » : aucune source ne doit être « non configurée ».
4. Clique sur « Voir l'activité » sur plusieurs cartes : la source doit s'ouvrir dans un nouvel onglet.
5. Recherche rapide : un mot-clé (« château ») et un budget « Gratuit » doivent filtrer réellement.
6. Teste sur un téléphone : pas de défilement horizontal, bouton de géolocalisation fonctionnel (HTTPS requis).
7. Si l'IA est activée, teste « Transformer ma description en critères ». Sans clé, les boutons IA ne doivent pas apparaître.
8. Lance une dizaine de recherches très rapprochées : un message de limitation doit apparaître. Ce n'est fiable qu'avec Upstash.
9. Dans **Vercel → Logs**, vérifie l'absence d'erreurs et repère les lignes `search` (sources et nombre de résultats).

---

## Limites connues et coûts

**Ce qui ne peut pas être garanti** : les horaires d'ouverture et l'ouverture « maintenant », les prix (souvent absents), l'adéquation aux enfants ou aux personnes à mobilité réduite quand la source ne la précise pas, et l'exhaustivité. Les dates ne sont fiables que pour les événements.

**Quotas gratuits (octobre 2026, à revérifier)**

| Service | Limite gratuite | Si l'usage augmente |
|---|---|---|
| Vercel Hobby | Usage **non commercial** ; quotas mensuels (invocations, CPU, bande passante) ; mise en pause si dépassement | Pro à 20 $ par mois et par membre (obligatoire pour un usage commercial) |
| DATAtourisme | 1 000 requêtes/h, environ 10 req/s | Le cache limite les appels à 1 à 4 requêtes par zone et par jour |
| Overpass public | Environ 10 000 requêtes par jour pour toute l'application, fiabilité faible, usage commercial déconseillé | Instance auto-hébergée ou service payant ; `OVERPASS_URLS` permet de changer d'instance |
| OpenAgenda | Quota non publié | Contacter OpenAgenda ; demander le droit `events:transverse` |
| IGN Géoplateforme | 50 req/s par IP | Large pour cet usage |
| Upstash Redis | 500 000 commandes par mois, 256 Mo | Paiement à l'usage, 0,20 $ pour 100 000 commandes. Une recherche (deux phases) coûte environ 10 à 15 commandes, soit environ 35 000 recherches par mois dans l'offre gratuite |
| Groq | Limites par modèle et par organisation (429 au-delà) | Offre payante à l'usage ; `AI_DAILY_LIMIT` plafonne côté site |

Avertissement connu et sans conséquence au build : « Failed to find font override values for font Atkinson Hyperlegible Next ». Next.js ne connaît pas encore les métriques de cette police récente ; le rendu n'est pas affecté.

---

## Faire évoluer le projet

- **Ajouter une catégorie** : une entrée dans `src/config/categories.ts` (tags OSM, classes DATAtourisme, mots-clés) et une icône dans `src/components/category-icon.tsx`.
- **Ajouter une source** : implémente `ActivityProvider` (`src/lib/providers/types.ts`), normalise vers `Activity`, ajoute-la à `src/lib/providers/registry.ts` avec un drapeau `PROVIDER_X_ENABLED`. Marque-la `slow: true` avec une méthode `peek()` si elle est lente.
- **Ajouter un fournisseur IA** : implémente `AiProvider` (`src/lib/ai/types.ts`) et ajoute-le au registre `src/lib/ai/index.ts`.
- **Pistes déjà préparées** : vue cartographique (Leaflet et tuiles OSM, les coordonnées sont là), suggestions selon la météo (Open-Meteo, gratuit sans clé), historique des recherches (les critères sont sérialisables), listes de sorties (à partir des favoris), « à proximité de cette activité » (relancer la recherche avec l'activité comme point de départ).
