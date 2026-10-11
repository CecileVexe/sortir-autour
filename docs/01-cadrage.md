# Sortir Autour — Phase 1 : cadrage technique

> Audit réalisé le 11/10/2026. Les quotas des services gratuits changent souvent : chaque chiffre ci-dessous a été vérifié à cette date (documentation officielle ou test en direct) et devra être revérifié avant une mise en production.

## 1. Le besoin en bref

Une application web (France uniquement, interface en français) qui aide à trouver **des sorties réelles** autour d'un point de départ, selon la distance, le public, le budget, l'environnement (intérieur/extérieur), les catégories et la date.

- **Deux parcours** : un questionnaire guidé (principal) et une recherche rapide par filtres (« Je sais ce que je cherche »).
- **Un seul moteur** : les deux parcours produisent le même objet `SearchCriteria`, envoyé à la même route serveur.
- **Données réelles uniquement**, avec des liens vers les sources. Une donnée inconnue reste inconnue : rien n'est inventé.
- **IA facultative** (Groq) : elle sert à interpréter le texte libre et à expliquer les résultats, jamais à produire des lieux.
- **Coût nul** : Vercel Hobby (usage personnel ou démo), services gratuits, aucune base de données payante.

## 2. Décisions validées avec toi

| Sujet | Décision |
|---|---|
| Nom / dossier | Sortir Autour — `sortir-autour/` |
| Zone | France uniquement |
| Usage | Personnel / démo / portfolio (compatible Vercel Hobby, non commercial) |
| Événements | OpenAgenda + DATAtourisme (comptes gratuits à créer par toi) |
| IA | Groq (offre gratuite), en phase 4 |
| Clé IA personnelle | Pas dans le MVP (l'architecture la permettra) |
| Git | Dépôt local + dépôt GitHub **public** |
| Rate limit / cache partagé | Upstash Redis gratuit (repli mémoire documenté) |

## 3. Audit des sources de données

### Géocodage (étape « lieu de départ »)

| Source | Résultat de l'audit | Verdict |
|---|---|---|
| **Géoplateforme IGN** (`data.geopf.fr/geocodage`) | Remplace l'API Adresse (décommissionnée fin janvier 2026). Testée en direct : `/search` (communes, adresses), `/completion` (autocomplétion), `/reverse`. Sans clé. Limite de **50 req/s par IP**, réponse 429 au-delà. Licence ouverte. | ✅ **Retenue** |
| Nominatim (OSM) | 1 req/s maximum pour toute l'application, **autocomplétion interdite** par la politique d'usage. | ❌ Écartée |
| Géolocalisation du navigateur | Utilisée seulement sur action explicite, puis géocodage inverse IGN pour afficher la ville. | ✅ Facultative |

### Lieux et activités permanentes

| Source | Ce qu'on obtient | Limites | Verdict |
|---|---|---|---|
| **DATAtourisme API** (`api.datatourisme.fr/v1`) | Base nationale des offices de tourisme : lieux, **fêtes et manifestations**, circuits. Filtre natif `geo_distance=lat,lon,20km`, filtre par type, images (`hasMainRepresentation`), descriptions, **prix** (`offers.priceSpecification`), contacts et sites web. | Clé gratuite (en-tête `X-API-Key`). **1 000 req/h**, ~10 req/s soutenues, 100 résultats par page. Licence Ouverte Etalab : citer le producteur (`hasBeenCreatedBy`) et la date de mise à jour. La qualité varie selon les offices de tourisme. La plateforme « Diffuseur » ferme en octobre 2027, mais l'API est la voie recommandée. | ✅ **Source principale** |
| **OpenStreetMap via Overpass** | Testé en direct : musées, parcs, châteaux, piscines, bowlings, etc., avec coordonnées, `website`, `opening_hours`, `fee`, `wheelchair` et souvent un lien `wikidata`. Excellente couverture des lieux. | Instance publique : environ 10 000 requêtes/jour pour toute l'application, **surchargée et peu fiable** (429/504 fréquents), usage commercial déconseillé. Pas d'images ni de descriptions. ODbL : attribution « © contributeurs OpenStreetMap » obligatoire. | ✅ **Retenue**, avec cache agressif, délai d'expiration court et instance de secours |
| **Wikidata** (SPARQL) | Testé en direct (`wikibase:around`). Sert à enrichir les lieux OSM qui ont un tag `wikidata` : **image Wikimedia Commons** (P18), description courte, lien Wikipédia. | Délai d'expiration de 60 s, `User-Agent` obligatoire. Les images Commons sont sous licences variées (CC BY-SA…) : il faut afficher l'auteur et la licence, ou un lien vers la page du fichier. | ✅ **Enrichissement** (pas une source de lieux autonome) |

### Événements

| Source | Ce qu'on obtient | Limites | Verdict |
|---|---|---|---|
| **DATAtourisme** (`/entertainmentAndEvent`) | Événements des offices de tourisme, filtrables par rayon. | Pas de filtre de date documenté côté serveur : le filtrage par date se fera chez nous. | ✅ Retenue |
| **OpenAgenda** (`api.openagenda.com/v2`) | Agendas culturels (villes, médiathèques, festivals). Filtres `geo[northEast/southWest]` (rectangle), `timings[gte/lte]`, `relative[]=upcoming`, `age`, `accessibility`. Images, conditions tarifaires en texte libre. | Clé de lecture gratuite obligatoire (403 sans clé, vérifié). **Pas de recherche transversale à tous les agendas** : les événements se lisent agenda par agenda. Stratégie : chercher les agendas officiels par nom de commune ou de département (`/v2/agendas?search=…&official=1`), puis interroger 3 à 5 agendas avec le rectangle géographique. Quota non publié. Licence ouverte, à vérifier agenda par agenda. | ✅ Retenue, en source secondaire et avec un périmètre limité |
| Ticketmaster / Eventbrite / Meetup | Couverture française faible ou API fermée ou restreinte, conditions peu compatibles. | — | ❌ Écartées pour le MVP |

### Articles de découverte locale et recherche web

Aucune API de recherche web n'est à la fois gratuite, durable et autorisée pour cet usage : Google Programmable Search est fermé aux nouveaux comptes, Bing Search API a été retirée, et Brave ou SerpAPI imposent des quotas très faibles avec des conditions restrictives. **Les « articles » ne seront donc pas couverts par un moteur web dans le MVP.** En revanche :
- les fiches DATAtourisme et OpenAgenda jouent ce rôle (titre, image, description, lien vers la source) ;
- le lien Wikipédia sert d'« article » pour le patrimoine.

L'architecture prévoit un fournisseur `web-articles` à brancher plus tard si une API compatible apparaît.

### Météo (fonctionnalité secondaire)

**Open-Meteo**, testé en direct : sans clé et gratuit pour un usage non commercial. Il servira à une indication « temps prévu » et à mettre en avant les activités en intérieur s'il pleut. Facultatif.

### Informations qui ne pourront PAS être garanties

- **Les horaires d'ouverture en temps réel.** Le champ OSM `opening_hours` est indicatif ; on n'affichera jamais « ouvert maintenant » comme une certitude.
- **Les prix.** Souvent absents. Le champ OSM `fee=yes/no` signale seulement payant ou gratuit, et les conditions tarifaires d'OpenAgenda sont du texte libre. L'interface affichera « Prix non renseigné », et un prix manquant ne comptera jamais comme gratuit.
- **L'adéquation aux enfants ou aux PMR.** On ne l'affiche que si la source le dit explicitement (`wheelchair=yes`, critère d'âge OpenAgenda, équipements DATAtourisme).
- **L'exhaustivité.** Les résultats sont un échantillon des sources interrogées, pas « toutes les activités de la zone ». L'interface le dira.
- **Intérieur ou extérieur.** C'est déduit du type de lieu (un musée est en intérieur, une randonnée en extérieur) et sera marqué comme « déduit ». Sinon : « inconnu ».

## 4. Contraintes Vercel (Hobby)

- Usage **non commercial** uniquement (conforme à ton choix).
- Fonctions serverless : durée maximale et quotas mensuels (invocations, CPU actif, bande passante) limités. Les chiffres exacts diffèrent selon les sources tierces et seront vérifiés sur vercel.com/docs/limits au moment du déploiement. La conception vise de toute façon des réponses en moins de 10 s. Si le quota est dépassé, Vercel met le projet en pause au lieu de facturer.
- Conséquences sur la conception :
  - appels aux fournisseurs **en parallèle** avec un délai d'expiration de 6 à 8 s chacun et un résultat partiel si l'un d'eux échoue ;
  - **cache** des réponses des fournisseurs : 24 h pour les lieux, 1 à 3 h pour les événements, 7 jours pour le géocodage ;
  - recherche lancée **uniquement sur validation**, jamais à chaque changement de filtre ;
  - autocomplétion du lieu avec un délai d'attente de 250 ms (debounce) et au moins 3 caractères.
- Pas de tâche planifiée, pas de serveur permanent, pas de base de données.

## 5. Architecture proposée

```
Navigateur (Next.js App Router, React, Tailwind)
  ├─ /                 Accueil : questionnaire (Mode A) + accès « Je sais ce que je cherche » (Mode B)
  ├─ /recherche        Mode B : lieu obligatoire, puis filtres
  └─ /resultats?…      Résultats (les critères sont dans l'URL : page partageable, bouton retour)
          │  GET/POST /api/search  (validation Zod)
          ▼
Serveur (route handlers Node.js sur Vercel)
  ├─ geocoding/        Géoplateforme : /api/geocode (autocomplétion, recherche, inverse)
  ├─ providers/        interface ActivityProvider { id, enabled(), search(ctx) }
  │    ├─ datatourisme   (lieux + événements)
  │    ├─ overpass       (lieux OSM) → enrichissement Wikidata (images, Wikipédia)
  │    ├─ openagenda     (événements)
  │    └─ demo           (données fictives, dev/tests uniquement, marquées « Démo »)
  ├─ normalize/        Conversion vers le modèle commun Activity (+ validation Zod des réponses)
  ├─ geo/              Haversine, rectangle englobant, filtrage par rayon
  ├─ dedupe/           Identifiants croisés (wikidata, url), nom normalisé + distance < 150 m
  ├─ ranking/          Score déterministe : catégorie, budget, public, environnement, distance, complétude, date
  ├─ ai/               interface AiProvider (Groq), quotas, typage des erreurs, repli sans IA
  ├─ cache/            Data Cache de Next.js (+ Redis si activé)
  ├─ ratelimit/        Selon la décision du § 9
  └─ errors/ + log/    Erreurs typées, messages utilisateur sans données sensibles
```

**Pile technique** : Next.js 15 (App Router) + TypeScript strict, Tailwind CSS v4, composants accessibles Radix/shadcn (seulement ceux utiles), icônes `lucide-react`, Zod, Vitest pour les tests unitaires et de routes, Playwright pour le parcours principal. Versions figées dans `package-lock.json` et vérifiées au moment de l'installation.

**Modèle `Activity`** : il reprend le contrat du cahier des charges (id stable `provider:sourceId`, nom, description, image avec crédit et licence, URL source, fournisseur, adresse, ville, coordonnées, distance, catégories, prix et devise ou null, environnement avec indication « déduit », public, dates, statut de l'information `verified | indicative | unknown`, date de récupération, attribution).

**Catégories** : un fichier de configuration unique (`config/categories.ts`) associe chaque catégorie à son libellé, son icône, ses tags OSM, ses types DATAtourisme et ses mots-clés OpenAgenda. Ajouter une catégorie revient à ajouter une entrée.

**Distance** : **à vol d'oiseau** (Haversine), affichée comme telle (« ≈ 12 km à vol d'oiseau »). Le texte « à moins de 30 minutes » est converti en rayon approximatif et signalé comme une approximation. Les temps de trajet routiers sont reportés (OSRM public interdit pour la production, et les autres services sont payants).

## 6. Principaux risques

| Risque | Mitigation |
|---|---|
| Overpass public lent ou indisponible | Délai d'expiration de 8 s, instance de secours, cache 24 h, résultat partiel avec un message « source OSM momentanément indisponible » |
| Quota DATAtourisme de 1 000 req/h partagé par tous les utilisateurs | Cache par cellule géographique arrondie + rayon + type, une ou deux requêtes par recherche |
| OpenAgenda sans recherche géographique globale | Découverte des agendas par commune ou département, mise en cache 24 h, 5 agendas au maximum |
| Données hétérogènes ou incomplètes | Validation Zod tolérante (champs facultatifs), statut d'information, pas d'invention |
| Doublons entre DATAtourisme, OSM et OpenAgenda | Déduplication multicritère et fusion des champs (on garde la donnée la plus riche, avec ses sources) |
| Licences des images (Commons, offices de tourisme) | Crédit et licence affichés, image générique par catégorie sinon |
| Abus sur les routes publiques | Rate limit (§ 9), taille d'entrée maximale, validation stricte |
| IA qui hallucine | L'IA reçoit seulement les identifiants et les données récupérées, renvoie un JSON validé ; tout identifiant inconnu est rejeté |

## 7. Périmètre du MVP

**Inclus**
- Accueil, questionnaire en 8 étapes + résultats, recherche rapide (Mode B)
- Lieu : autocomplétion IGN, géolocalisation facultative, modification à tout moment
- Moteur unique : DATAtourisme + OSM/Wikidata + OpenAgenda, normalisation, déduplication, filtrage par rayon, classement
- Résultats : cartes, résumé des critères, tri (pertinence, distance, prix si connu), modification rapide des filtres, « Voir plus », états de chargement, sans résultat (avec suggestions), d'erreur et de filtres non vérifiables
- Favoris locaux (localStorage) et partage (Web Share API ou copie du lien)
- Mode démo explicite en développement
- IA Groq (phase 4) : texte libre → critères, explication « pourquoi ça correspond », gestion fine des erreurs (429, crédit, clé invalide, indisponible, non configurée)
- Tests, README, `.env.example`, déploiement Vercel documenté

**Reporté**
- Vue cartographique (Leaflet + tuiles OSM : faisable ensuite)
- Recommandations météo au-delà d'une simple indication
- Historique des recherches, listes de sorties, « à proximité de cette activité »
- Clé IA personnelle
- Fournisseur d'articles web
- Temps de trajet routier

## 8. Ce dont j'aurai besoin de ta part (avant la phase 3)

1. **Clé DATAtourisme** : formulaire sur https://www.datatourisme.fr/utiliser-les-donnees/ (indique « projet personnel non commercial »).
2. **Clé de lecture OpenAgenda** : créer un compte sur openagenda.com, puis Paramètres du compte → clé API publique.
3. **Clé Groq** (phase 4) : console.groq.com → API Keys.
4. Plus tard : les mêmes variables dans le tableau de bord Vercel.

Les clés iront **uniquement** dans `.env.local` (ignoré par git) et dans les variables d'environnement Vercel. Le dépôt GitHub étant public, aucune clé ne sera jamais commitée.

Sans clé, l'application fonctionne quand même avec OSM/Wikidata (le fournisseur concerné est simplement désactivé et l'interface le signale).

## 9. Rate limit et cache partagé

Décision : Upstash Redis (offre gratuite). `ratelimit/` et `cache/` ont chacun un adaptateur Redis et un adaptateur mémoire ; sans les variables Upstash, l'application fonctionne avec une protection partielle, documentée comme telle.

## 10. Constats après intégration (phases 2 et 3, 11/10/2026)

Tests réels avec les clés :
- **DATAtourisme** : filtres `geo_distance`, `type` (avec héritage des sous-classes) et `start`/`end` (dates des événements) fonctionnels. **Aucune image renvoyée** en pratique (Lyon, Annecy), même avec `fields=hasMainRepresentation`. Le filtre d'exclusion `filters=type!=…` renvoie 0 résultat : le tri des hébergements et commerces se fait donc de notre côté. Chaque fiche a une page publique lisible (`uri`), utilisée comme lien source.
- **OpenAgenda** : `/v2/events` sur tous les agendas renvoie 403 (droit `events:transverse` requis). Le tri `recentlyAddedEvents.desc` donne de bien meilleurs agendas que la pertinence seule (beaucoup d'agendas « officiels » sont dormants). Les filtres `geo[...]` et `timings[...]` fonctionnent, et les images et la licence sont fournies par événement.
- **Overpass** : instance principale saturée ce soir-là (504 même sur une requête minuscule, 15 à 27 s sinon). Conséquences : requête par rectangle et clauses exactes, tags très répandus limités aux lieux documentés, recherche en deux phases (les résultats rapides d'abord, OSM ensuite), copie de secours en cache de 7 jours.
- **Groq** : `llama-3.3-70b-versatile` a été retiré en août 2026. Modèle par défaut : `openai/gpt-oss-20b`, configurable.
