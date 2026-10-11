/**
 * Single source of truth for activity categories.
 *
 * Each category maps to:
 *  - OSM tag selectors (used both to build Overpass queries and to classify OSM elements),
 *  - DATAtourisme POI classes (`type` values),
 *  - keywords (used to classify events from free-text sources such as OpenAgenda),
 *  - a default environment, used only as an *inferred* hint.
 *
 * Adding a category = adding one entry here (plus an icon in `components/category-icon.tsx`).
 */

export type Environment = "indoor" | "outdoor" | "mixed" | "unknown";

export interface OsmSelector {
  key: string;
  /** Exact values. Omit to match any value of `key`. */
  values?: readonly string[];
  /**
   * Very common tags (small squares, gyms, plaques…): only query features documented with a
   * Wikidata/Wikipedia/website tag. Keeps Overpass queries cheap and results relevant.
   */
  notableOnly?: boolean;
}

export interface CategoryDefinition {
  id: string;
  label: string;
  shortLabel: string;
  osm: readonly OsmSelector[];
  datatourisme: readonly string[];
  keywords: readonly string[];
  environment: Environment;
  /** True when the category is not suitable for children by nature (e.g. nightlife). */
  adultsOnly?: boolean;
  /** True when the category is family oriented by nature. Never used to claim a specific venue is child-friendly. */
  familyOriented?: boolean;
}

export const CATEGORIES = [
  {
    id: "nature",
    label: "Nature, promenades et randonnées",
    shortLabel: "Nature & rando",
    osm: [
      { key: "leisure", values: ["nature_reserve"] },
      { key: "tourism", values: ["viewpoint"] },
      { key: "natural", values: ["waterfall", "peak", "gorge", "cliff"] },
    ],
    datatourisme: [
      "WalkingTour", "Rambling", "EducationalTrail", "HorseTour", "CyclingTour", "NaturalHeritage", "NaturalCuriosity",
      "PointOfView", "Waterfall", "Peak", "Summit", "Gorge", "Canyon", "Forest", "Lake", "Mountain", "Valley", "Cliff", "FitnessPath",
    ],
    keywords: ["randonnée", "balade", "promenade", "sentier", "nature", "marche", "rando", "forêt"],
    environment: "outdoor",
  },
  {
    id: "parks",
    label: "Parcs, jardins et espaces naturels",
    shortLabel: "Parcs & jardins",
    osm: [
      { key: "leisure", values: ["park", "garden"], notableOnly: true },
      { key: "boundary", values: ["national_park"] },
    ],
    datatourisme: ["ParkAndGarden", "NaturalPark", "OutstandingTree", "Orchard", "PicnicArea", "Wetland"],
    keywords: ["parc", "jardin", "arboretum", "roseraie", "botanique"],
    environment: "outdoor",
    familyOriented: true,
  },
  {
    id: "culture",
    label: "Culture, musées et expositions",
    shortLabel: "Culture & musées",
    osm: [
      { key: "tourism", values: ["museum", "gallery"] },
      { key: "amenity", values: ["arts_centre", "theatre"] },
    ],
    datatourisme: [
      "Museum", "ArtGalleryOrExhibitionGallery", "InterpretationCentre", "Exhibition", "VisualArtsEvent", "Theater",
      "TheaterEvent", "Opera", "OperaHouse", "Concert", "Recital", "CulturalEvent", "Library", "Auditorium", "Cinematheque",
    ],
    keywords: ["exposition", "expo", "musée", "concert", "théâtre", "spectacle", "vernissage", "conférence", "lecture", "opéra", "danse"],
    environment: "indoor",
  },
  {
    id: "heritage",
    label: "Patrimoine et visites historiques",
    shortLabel: "Patrimoine",
    osm: [
      { key: "historic", values: ["castle", "ruins", "archaeological_site", "fort", "manor", "city_gate", "monastery", "aqueduct"] },
      { key: "historic", values: ["monument"], notableOnly: true },
    ],
    datatourisme: [
      "Castle", "CastleAndPrestigeMansion", "FortifiedCastle", "RemarkableBuilding", "RemarkableHouse", "ReligiousSite",
      "Abbey", "Cathedral", "Basilica", "Church", "Chapel", "Monastery", "Ruins", "ArcheologicalSite", "MegalithDolmenMenhir",
      "Citadel", "Fort", "Palace", "Aqueduct", "TechnicalHeritage", "IndustrialSite", "CityHeritage", "Mill", "Tower", "RemembranceSite", "Visit",
    ],
    keywords: ["patrimoine", "visite guidée", "château", "abbaye", "historique", "monument", "cathédrale", "journées du patrimoine"],
    environment: "mixed",
  },
  {
    id: "leisure",
    label: "Loisirs et divertissements",
    shortLabel: "Loisirs",
    osm: [
      { key: "leisure", values: ["bowling_alley", "escape_game", "miniature_golf", "amusement_arcade"] },
      { key: "amenity", values: ["cinema"] },
    ],
    datatourisme: ["BowlingAlley", "Cinema", "MiniGolf", "Game", "LeisureComplex", "BilliardRoom", "Casino", "ScreeningEvent", "ShowEvent", "CircusPlace"],
    keywords: ["cinéma", "projection", "jeu", "escape game", "bowling", "cirque", "humour", "magie"],
    environment: "indoor",
  },
  {
    id: "sport",
    label: "Activités sportives",
    shortLabel: "Sport",
    osm: [
      { key: "leisure", values: ["sports_centre"], notableOnly: true },
      { key: "leisure", values: ["ice_rink", "climbing", "golf_course", "trampoline_park"] },
      { key: "sport", values: ["climbing"] },
    ],
    datatourisme: [
      "ClimbingWall", "ViaFerrata", "GolfCourse", "IceSkatingRink", "SportsHall", "TennisComplex",
      "LeisureSportActivityProvider", "SportsEvent", "SportsCompetition", "SportsDemonstration", "AdventurePark", "EquipmentRental",
    ],
    keywords: ["sport", "course", "trail", "escalade", "vélo", "tournoi", "match", "yoga", "initiation"],
    environment: "mixed",
  },
  {
    id: "nautical",
    label: "Activités nautiques",
    shortLabel: "Nautique",
    osm: [
      { key: "leisure", values: ["water_park", "marina", "beach_resort"] },
      { key: "natural", values: ["beach"] },
      { key: "sport", values: ["canoe", "surfing", "sailing", "rowing"] },
    ],
    datatourisme: ["NauticalCentre", "Beach", "Marina", "SwimmingPool", "SightseeingBoat", "FluvialTour", "YachtClub", "BeachClub", "UnderwaterRoute"],
    keywords: ["canoë", "kayak", "paddle", "voile", "baignade", "plage", "bateau", "piscine", "nautique"],
    environment: "outdoor",
  },
  {
    id: "food",
    label: "Gastronomie et découvertes culinaires",
    shortLabel: "Gastronomie",
    osm: [{ key: "craft", values: ["winery", "brewery", "distillery", "cheese"] }],
    datatourisme: ["Tasting", "TastingProvider", "Producer", "Farmer", "Cellar", "Brewery", "Distillery", "LocalProductsShop", "Farm"],
    keywords: ["dégustation", "gastronomie", "vin", "cuisine", "œnologie", "bière", "fromage", "producteur", "terroir", "repas"],
    environment: "indoor",
  },
  {
    id: "markets",
    label: "Marchés et brocantes",
    shortLabel: "Marchés",
    osm: [{ key: "amenity", values: ["marketplace"] }],
    datatourisme: ["Market", "CoveredMarket", "SaleEvent", "GarageSale", "BricABrac", "FairOrShow", "AntiqueAndSecondhandGoodDealer"],
    keywords: ["marché", "brocante", "vide-grenier", "puces", "foire", "salon", "marché de noël"],
    environment: "outdoor",
  },
  {
    id: "workshops",
    label: "Artisanat et ateliers créatifs",
    shortLabel: "Ateliers",
    osm: [{ key: "craft", values: ["pottery", "glassblower", "blacksmith"] }],
    datatourisme: ["CraftsmanShop", "TrainingWorkshop", "IntroductionCourse", "Course", "Forge"],
    keywords: ["atelier", "stage", "initiation", "créatif", "poterie", "couture", "dessin", "peinture", "fabrication", "diy"],
    environment: "indoor",
  },
  {
    id: "animals",
    label: "Animaux et activités équestres",
    shortLabel: "Animaux",
    osm: [
      { key: "tourism", values: ["zoo", "aquarium"] },
      { key: "leisure", values: ["horse_riding"], notableOnly: true },
    ],
    datatourisme: ["ZooAnimalPark", "VivariumAquarium", "EquestrianCenter", "Stables", "TeachingFarm"],
    keywords: ["zoo", "animaux", "ferme", "équitation", "poney", "cheval", "aquarium"],
    environment: "outdoor",
    familyOriented: true,
  },
  {
    id: "themeparks",
    label: "Parcs de loisirs et attractions",
    shortLabel: "Parcs d'attractions",
    osm: [
      { key: "tourism", values: ["theme_park"] },
      { key: "leisure", values: ["water_park"] },
    ],
    datatourisme: ["ThemePark", "AdventurePark", "SummerToboggan", "TourismCableCar", "TouristTrain"],
    keywords: ["parc d'attractions", "attraction", "accrobranche", "luge"],
    environment: "outdoor",
    familyOriented: true,
  },
  {
    id: "unusual",
    label: "Activités insolites",
    shortLabel: "Insolite",
    osm: [
      { key: "tourism", values: ["attraction"] },
      { key: "natural", values: ["cave_entrance"], notableOnly: true },
      { key: "man_made", values: ["lighthouse"] },
    ],
    datatourisme: ["CaveSinkholeOrAven", "Lighthouse", "Mine", "RailBike", "TreeHouse", "Volcano", "NaturalCuriosity"],
    keywords: ["insolite", "original", "secret", "étonnant", "grotte", "souterrain", "nocturne"],
    environment: "mixed",
  },
  {
    id: "nightlife",
    label: "Vie nocturne et sorties en soirée",
    shortLabel: "Soirée",
    osm: [
      { key: "amenity", values: ["nightclub", "casino"] },
      { key: "leisure", values: ["dance"] },
    ],
    datatourisme: ["NightClub", "Cabaret", "BarOrPub", "BistroOrWineBar", "Casino"],
    keywords: ["soirée", "dj", "club", "bar", "boîte de nuit", "cabaret", "karaoké", "clubbing"],
    environment: "indoor",
    adultsOnly: true,
  },
  {
    id: "events",
    label: "Événements ponctuels et festivals",
    shortLabel: "Événements",
    osm: [],
    datatourisme: ["Festival", "TraditionalCelebration", "Carnival", "Parade", "LocalAnimation", "SocialEvent", "OpenDay", "Commemoration", "ChildrensEvent"],
    keywords: ["festival", "fête", "carnaval", "défilé", "animation", "portes ouvertes", "célébration"],
    environment: "mixed",
  },
  {
    id: "family",
    label: "Activités familiales",
    shortLabel: "En famille",
    osm: [{ key: "leisure", values: ["indoor_play", "trampoline_park"] }],
    datatourisme: ["PlayArea", "ChildrensEvent", "KidsClub", "TeachingFarm", "Trampoline"],
    keywords: ["famille", "enfant", "enfants", "jeune public", "en famille", "conte", "goûter", "kids"],
    environment: "mixed",
    familyOriented: true,
  },
  {
    id: "wellness",
    label: "Bien-être et détente",
    shortLabel: "Bien-être",
    osm: [
      { key: "amenity", values: ["public_bath"] },
      { key: "leisure", values: ["sauna"] },
      { key: "natural", values: ["hot_spring"] },
    ],
    datatourisme: ["Spa", "SpaResort", "Hammam", "ThalassotherapyCentre", "BalneotherapyCentre"],
    keywords: ["bien-être", "spa", "détente", "relaxation", "méditation", "sophrologie", "massage", "thermes"],
    environment: "indoor",
  },
] as const satisfies readonly CategoryDefinition[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

const byId = new Map<string, CategoryDefinition>(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): CategoryDefinition | undefined {
  return byId.get(id);
}

export function isCategoryId(id: string): id is CategoryId {
  return byId.has(id);
}

/** Categories whose OSM tags match the given element tags. */
export function categoriesFromOsmTags(tags: Readonly<Record<string, string>>): CategoryId[] {
  const out: CategoryId[] = [];
  for (const c of CATEGORIES) {
    const match = c.osm.some((s: OsmSelector) => {
      const v = tags[s.key];
      if (v === undefined) return false;
      return !s.values || s.values.includes(v);
    });
    if (match) out.push(c.id);
  }
  return out;
}

/** Categories matching any DATAtourisme class. */
export function categoriesFromDatatourismeTypes(types: readonly string[]): CategoryId[] {
  const set = new Set(types);
  return CATEGORIES.filter((c) => c.datatourisme.some((t: string) => set.has(t))).map((c) => c.id);
}

/** Normalise text for keyword matching: lowercase, no accents. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Categories whose keywords appear (whole word) in the given free text. */
export function categoriesFromText(text: string): CategoryId[] {
  const folded = ` ${foldText(text).replace(/[^a-z0-9' -]+/g, " ")} `;
  return CATEGORIES.filter((c) =>
    c.keywords.some((k: string) => folded.includes(` ${foldText(k)} `) || folded.includes(` ${foldText(k)}s `)),
  ).map((c) => c.id);
}
