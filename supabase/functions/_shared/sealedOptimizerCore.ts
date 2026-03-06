// â”€â”€â”€ Sealed Optimizer â€” Shared pure logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types, constants and functions for optimising a sealed pool into the best
// 2-3 deck builds.  No I/O â€” keep this file portable across Deno and Node.
//
// Design principles:
//   1. ONE score used everywhere (HC search = final ranking)
//   2. Karsten mana math for source requirements
//   3. Strict splash discipline (CMC >= 4, 1 off-pip, premium only)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PoolCard = {
  name: string;
  qty: number;
  wr: number;
  colors: string;
  cmc: number;
  cost: string | null;
  type: string;
  rarity: string;
  isCreature: boolean;
  isRemoval: boolean;
  isManaProducer: boolean;
  producedColours: string | null;
  oracleText: string | null;
  dependencyTags: string[];
  dependencyMinSupport: number | null;
  dependencyScope: string | null;
  tokenSupportTags: string[];
  tokenSupportCount: number;
};

export type DeckCard = { name: string; qty: number };

export type ScoreBreakdown = {
  wrScore: number;
  synergyScore: number;
  wrNormalized: number;
  synergyBaseNormalized: number;
  dependencyAxisScale: number;
  dependencyAxisDelta: number;
  synergyNormalized: number;
  qualityScore: number;
  powerWeightedContribution: number;
  synergyWeightedContribution: number;
  consistencyWeightedContribution: number;
  curveWeightedContribution: number;
  consistencyScore: number;
  curveBaseScore: number;
  removalAxisScale: number;
  removalAxisDelta: number;
  curveScore: number;
  skeletonSimilarity: number;
  creatureTarget: number;
  curvePenalty: number;
  curveTopHeavyScale: number;
  curveSkeletonScale: number;
  curveEarlyCreatureScale: number;
  curveCreatureCorridorScale: number;
  curveTopHeavyPenalty: number;
  curveSkeletonPenalty: number;
  curveEarlyCreaturePenalty: number;
  curveCreatureCorridorPenalty: number;
  manaPenalty: number;
  dependencyPenalty: number;
  consistencyAdjustment: number;
  curveAdjustment: number;
  skeletonAdjustment: number;
  creatureAdjustment: number;
  removalAdjustment: number;
  dependencyAdjustment: number;
  totalAdjustment: number;
};

export type ScoreWeights = {
  power: number;
  consistency: number;
  curve: number;
  synergy: number;
};

export type CurveComponentScales = {
  topHeavy: number;
  skeletonShape: number;
  earlyCreature: number;
  creatureCorridor: number;
  removalAxis: number;
};

export type SearchProfile =
  | "skeleton"
  | "power_mana_safe"
  | "power_greedy_splash"
  | "curve_creatures"
  | "synergy_if_online";

export type DeckStats = {
  creatureCount: number;
  removalCount: number;
  avgCmc: number;
  totalCards: number;
  skeletonSimilarity: number;
};

export type SealedDeckResult = {
  rank: number;
  score: number;
  archetype: string;
  mainColors: string[];
  splashColor: string | null;
  cards: DeckCard[];
  lands: DeckCard[];
  stats: DeckStats;
  scoreBreakdown: ScoreBreakdown;
};

export type SealedOptimizerResult = {
  setCode: string;
  format: string;
  builds: SealedDeckResult[];
  poolSize: number;
  weightsApplied: ScoreWeights;
  debugPairDiagnostics?: {
    stage: "pre_rank" | "main_eval" | "splash_eval";
    archetype: string;
    support?: number;
    eligibleCount?: number;
    score?: number;
    consistencyScore?: number;
    removalCount?: number;
    reason: string;
  }[];
  debugCandidates?: {
    archetype: string;
    score: number;
    qualityScore: number;
    totalAdjustment: number;
    consistencyScore: number;
    curveScore: number;
    creatureCount: number;
    removalCount: number;
    manaPenalty: number;
    curvePenalty: number;
    dependencyPenalty: number;
  }[];
  debugHcSummary?: {
    runs: number;
    avgEvalCalls: number;
    avgIterationsDone: number;
    avgElapsedMs: number;
    avgTimeToBestMs: number;
    deadlineHitRate: number;
  };
};

export type HcTelemetry = {
  evalCalls: number;
  iterationsDone: number;
  elapsedMs: number;
  timeToBestMs: number;
  deadlineHit: boolean;
  restartsStarted: number;
  restartsCompleted: number;
};

export type Skeleton = {
  archetype_name: string;
  is_alternative?: boolean;
  sample_size?: number;
  avg_mana_curve?: Record<string, number>;
  creature_ratio?: number;
  deck_list: { name: string; type: string }[];
  core_cards?: { name: string; rank: number; frequency: number }[];
  importance_cards?: { name: string; frequency?: number; is_core?: boolean }[];
};

export type SynergyRow = { card_a: string; card_b: string; synergy_score: number | null };

export type CardMeta = {
  card_name: string;
  colors: string | null;
  card_cmc: number | null;
  card_cost: string | null;
  card_type: string | null;
  rarity: string | null;
  is_removal: boolean;
  is_mana_producer: boolean;
  produced_colours: string | null;
  oracle_text?: string | null;
  dependency_tags?: string[] | null;
  dependency_min_support?: number | null;
  dependency_scope?: string | null;
  token_support_tags?: string[] | null;
  token_support_count?: number | null;
};

export type CardStat = { card_name: string; gih_wr: number | null; filter_context: string };

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const TOTAL_DECK_SIZE = 40;
export const LANDS_MIN = 16;
export const LANDS_MAX = 18;
export const TARGET_CREATURE_MIN = 13;
export const TARGET_REMOVAL_MIN = 4;
export const CREATURE_CORRIDOR_MIN = 12;
export const CREATURE_CORRIDOR_MAX = 18;

export const SYNERGY_WEIGHT = 1;
export const CURVE_PENALTY_FACTOR = 0.05;
export const SKELETON_INIT_BONUS = 0.05;

export const NUM_RESTARTS = 3;
export const ITERATION_LIMIT = 55;
const DEFAULT_SPELL_SLOTS = 23;
const MAX_MAIN_PAIRS = 10;
const MAX_SPLASH_BASES = 6;
const CANDIDATES_PER_MAIN_ARCHETYPE = 2;
const CANDIDATES_PER_SPLASH_ARCHETYPE = 2;
export const DEFAULT_MAX_OPTIMIZE_MS = 10_000;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  power: 2, consistency: 1.3, curve: 1, synergy: 1,
};

const DEFAULT_OPTIMIZER_SEED = 1337;
const TOPK_PER_ARCHETYPE_PRE_RESCORE = 3;
const TOPK_PER_ARCHETYPE_FINAL = 3;
const FINAL_DIVERSITY_LAMBDA = 2.2;
const FINAL_BUILD_COUNT = 3;
const HC_BEST_OF_K = 2;
const HC_BEST_OF_K_STRONG_DELTA = 0.20;
const FINAL_LOCAL_SWAP_MAX_ADDS = 10;
const FINAL_LOCAL_SWAP_MAX_EVALS = 120;
const DEFAULT_SEARCH_PROFILE: SearchProfile = "skeleton";

const VALID_SEARCH_PROFILES = new Set<SearchProfile>([
  "skeleton",
  "power_mana_safe",
  "power_greedy_splash",
  "curve_creatures",
  "synergy_if_online",
]);

const normalizeSearchProfile = (v: unknown): SearchProfile =>
  VALID_SEARCH_PROFILES.has(v as SearchProfile)
    ? (v as SearchProfile)
    : DEFAULT_SEARCH_PROFILE;

const createSeededRng = (seed: number): (() => number) => {
  let t = (Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_OPTIMIZER_SEED) >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const hashString32 = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const createAttemptRng = (baseSeed: number, archetypeCode: string, attempt: number): (() => number) => {
  const mixed = (
    (Math.trunc(baseSeed) >>> 0)
    ^ hashString32(archetypeCode)
    ^ (Math.imul((attempt + 1) >>> 0, 0x9E3779B1) >>> 0)
  ) >>> 0;
  return createSeededRng(mixed);
};

const sampleWithoutReplacement = <T>(
  values: T[],
  take: number,
  rng: () => number,
): T[] => {
  if (take <= 0 || values.length === 0) return [];
  const arr = [...values];
  const n = Math.min(arr.length, take);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, n);
};

export const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
type ManaColor = (typeof COLOR_ORDER)[number];
const COLOR_SET = new Set<string>(COLOR_ORDER);

const BASIC_LAND_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const isLandType = (t: string | null | undefined): boolean => (t || "").includes("Land");
const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest",
};
const BASIC_TO_COLOR: Record<string, string> = {
  Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G",
};

const PAIRS: string[][] = [];
for (let i = 0; i < COLOR_ORDER.length; i++)
  for (let j = i + 1; j < COLOR_ORDER.length; j++)
    PAIRS.push([COLOR_ORDER[i], COLOR_ORDER[j]]);

const TRIOS: string[][] = [];
for (let i = 0; i < COLOR_ORDER.length; i++) {
  for (let j = i + 1; j < COLOR_ORDER.length; j++) {
    for (let k = j + 1; k < COLOR_ORDER.length; k++) {
      TRIOS.push([COLOR_ORDER[i], COLOR_ORDER[j], COLOR_ORDER[k]]);
    }
  }
}

const getMainColorSetsForProfile = (profile: SearchProfile): string[][] => {
  if (profile === "power_greedy_splash") {
    // Greedy shard explicitly explores both classic 2-color bases
    // and 3-color bases (which then allow 4-color splash runs).
    return [...PAIRS, ...TRIOS];
  }
  return PAIRS;
};

// â”€â”€â”€ Parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const parsePoolText = (text: string): { name: string; qty: number }[] => {
  const cards: { name: string; qty: number }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(Deck|Sideboard)$/i.test(line)) continue;
    const match = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/);
    if (!match) continue;
    const qty = Number(match[1]);
    const name = match[2].trim();
    if (!qty || !name || BASIC_LAND_NAMES.has(name)) continue;
    cards.push({ name, qty });
  }
  return cards;
};

// â”€â”€â”€ Mana symbol helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const extractColors = (raw: string | null | undefined): string[] =>
  raw ? [...raw.toUpperCase()].filter((ch) => COLOR_SET.has(ch)) : [];

const extractCreatureSubtypes = (typeLine: string): string[] => {
  const split = typeLine.split(/—|â€”|-/);
  const rhs = split.length > 1 ? split.slice(1).join("-") : "";
  return rhs
    .split(/\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

const extractManaSymbols = (cost: string | null): string[] =>
  cost ? [...cost.toUpperCase().matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim()) : [];

const countColorSymbolsIncludingHybrid = (cost: string | null, color: string): number => {
  let count = 0;
  for (const s of extractManaSymbols(cost)) {
    if (s === color) count++;
    else if (s.includes("/") && s.split("/").includes(color)) count++;
  }
  return count;
};

const countRequiredColorPipsForDeck = (
  cost: string | null,
  color: string,
  deckColors: string[],
): number => {
  let count = 0;
  const deckColorSet = new Set(deckColors);
  for (const symbol of extractManaSymbols(cost)) {
    if (symbol === color) {
      count++;
      continue;
    }
    if (!symbol.includes("/")) continue;

    const options = symbol
      .split("/")
      .map((p) => p.trim())
      .filter((p) => COLOR_SET.has(p as ManaColor));
    if (!options.includes(color)) continue;

    // Hybrid should only be forced on a color when it is the ONLY deck color
    // able to pay this symbol. This fixes off-color hybrid under-penalization
    // (e.g. {B/R}{B/R}{B/R} in UR should count as 3 red requirements).
    const feasible = options.filter((p) => deckColorSet.has(p));
    if (feasible.length === 1 && feasible[0] === color) count++;
  }
  return count;
};

const canPaySymbolWithColors = (symbol: string, allowed: Set<string>): boolean => {
  if (symbol === "X" || /^\d+$/.test(symbol)) return true;
  if (COLOR_SET.has(symbol)) return allowed.has(symbol);
  if (symbol.endsWith("/P")) {
    const base = symbol.replace("/P", "");
    return COLOR_SET.has(base) ? allowed.has(base) : true;
  }
  if (symbol.includes("/")) {
    const parts = symbol.split("/");
    if (parts.includes("2")) return true;
    return parts.some((p) => COLOR_SET.has(p) && allowed.has(p));
  }
  return true;
};

const isCastableWithColors = (
  cost: string | null, cardColors: string[], mainColors: string[], splashColor: string | null,
): boolean => {
  const allowed = new Set(mainColors);
  if (splashColor) allowed.add(splashColor);
  const symbols = extractManaSymbols(cost);
  if (symbols.length > 0) return symbols.every((s) => canPaySymbolWithColors(s, allowed));
  if (cardColors.length === 0) return true;
  return cardColors.every((c) => allowed.has(c));
};

const hasOffColorTransformCost = (
  card: PoolCard, mainColors: string[], splashColor: string | null,
): boolean => {
  const oracle = (card.oracleText || "").toLowerCase();
  if (!oracle.includes("transform")) return false;
  const allowed = new Set(mainColors);
  if (splashColor) allowed.add(splashColor);
  for (const m of oracle.matchAll(/pay\s+(\{[^}]+\})/gi)) {
    for (const symbol of extractManaSymbols((m[1] || "").toUpperCase())) {
      if (!canPaySymbolWithColors(symbol, allowed)) return true;
    }
  }
  return false;
};

// â”€â”€â”€ Splash discipline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const isPremiumSplashCard = (card: PoolCard, splashColor: string): boolean => {
  if (countColorSymbolsIncludingHybrid(card.cost, splashColor) !== 1) return false;
  if (card.cmc < 3) return false;
  if (card.isRemoval && card.cmc >= 3) return true;
  if (card.wr >= 58 && card.cmc >= 3) return true;
  if (card.wr >= 57 && card.cmc >= 4) return true;
  return card.rarity === "rare" || card.rarity === "mythic";
};

const cardMatchesColors = (
  card: PoolCard, cardColors: string[], mainColors: string[], splashColor: string | null,
): boolean => {
  if (!isCastableWithColors(card.cost, cardColors, mainColors, splashColor)) return false;
  if (hasOffColorTransformCost(card, mainColors, splashColor)) return false;
  if (!splashColor) return true;
  const mainSet = new Set(mainColors);
  const usesOffColor = cardColors.some((c) => !mainSet.has(c));
  if (!usesOffColor) return true;
  return isPremiumSplashCard(card, splashColor);
};

// â”€â”€â”€ Pool card enrichment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const buildPoolCards = (
  parsedPool: { name: string; qty: number }[],
  metaMap: Map<string, CardMeta>,
  wrMap: Map<string, number>,
): PoolCard[] => {
  // Exclude cards with no WR data at all (neither primary sealed nor fallback format).
  // Using synthetic defaults (e.g. 50) makes these cards artificially playable.
  return parsedPool
    .filter(({ name }) => wrMap.has(name))
    .map(({ name, qty }) => {
    const meta = metaMap.get(name);
    const type = meta?.card_type || "";
    return {
      name, qty,
      wr: wrMap.get(name) as number,
      colors: meta?.colors || "",
      cmc: Number(meta?.card_cmc ?? 0),
      cost: meta?.card_cost || null,
      type,
      rarity: meta?.rarity || "common",
      isCreature: type.includes("Creature"),
      isRemoval: meta?.is_removal ?? false,
      isManaProducer: meta?.is_mana_producer ?? false,
      producedColours: meta?.produced_colours || null,
      oracleText: meta?.oracle_text || null,
      dependencyTags: (meta?.dependency_tags || []).map((t) => (t || "").toLowerCase().trim()).filter(Boolean),
      dependencyMinSupport: meta?.dependency_min_support ?? null,
      dependencyScope: meta?.dependency_scope ?? null,
      tokenSupportTags: (meta?.token_support_tags || []).map((t) => (t || "").toLowerCase().trim()).filter(Boolean),
      tokenSupportCount: Math.max(0, Number(meta?.token_support_count ?? 0) || 0),
    };
    });
};

// â”€â”€â”€ Filter eligible cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const filterEligibleCards = (
  pool: PoolCard[], mainColors: string[], splashColor: string | null,
): PoolCard[] =>
  pool.filter((card) => cardMatchesColors(card, extractColors(card.colors), mainColors, splashColor));

// â”€â”€â”€ Synergy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const buildPairMap = (rows: SynergyRow[]): Record<string, Record<string, number>> => {
  const map: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const s = Number(row.synergy_score ?? 0);
    if (!map[row.card_a]) map[row.card_a] = {};
    if (!map[row.card_b]) map[row.card_b] = {};
    map[row.card_a][row.card_b] = s;
    map[row.card_b][row.card_a] = s;
  }
  return map;
};

const getDeckSynergyScore = (
  cards: DeckCard[], pairMap: Record<string, Record<string, number>>,
): number => {
  // Multiset-aware synergy:
  // - duplicate copies contribute to pair density,
  // - with diminishing returns for extra copies.
  const weightedCopies: { name: string; weight: number }[] = [];
  for (const c of cards) {
    for (let i = 0; i < c.qty; i++) {
      const w = i === 0 ? 1.0 : i === 1 ? 0.65 : 0.4;
      weightedCopies.push({ name: c.name, weight: w });
    }
  }

  const n = weightedCopies.length;
  if (n <= 1) return 0;

  let weightedTotal = 0;
  let possibleWeight = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pairWeight = weightedCopies[i].weight * weightedCopies[j].weight;
      possibleWeight += pairWeight;
      const s = pairMap[weightedCopies[i].name]?.[weightedCopies[j].name];
      if (typeof s === "number") weightedTotal += s * pairWeight;
    }
  }
  if (possibleWeight <= 0) return 0;
  return (weightedTotal / possibleWeight) * SYNERGY_WEIGHT;
};

// â”€â”€â”€ Skeleton similarity (weighted Jaccard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const weightedJaccard = (left: Record<string, number>, right: Record<string, number>): number => {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (names.size === 0) return 0;
  let inter = 0, union = 0;
  for (const name of names) {
    inter += Math.min(left[name] || 0, right[name] || 0);
    union += Math.max(left[name] || 0, right[name] || 0);
  }
  return union > 0 ? inter / union : 0;
};

// â”€â”€â”€ Karsten mana math â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Weight non-land mana producers by their CMC.
// A 4-CMC dork can't fix your T2 play; count it as a fraction of a source.
const nonLandSourceWeight = (cmc: number): number => {
  if (cmc <= 1) return 1.0;
  if (cmc === 2) return 0.7;
  if (cmc === 3) return 0.4;
  return 0.2;
};

// Karsten-style requirements scaled for Limited (40-card, 17-land decks).
// Targets ~85% on-curve cast probability (between the 80% and 90% tables).
// Previous values (16/14/10 …) were 60-card constructed numbers — far too strict
// for sealed where 9/8 land splits are the norm.
const karstenRequiredSources = (pips: number, cmc: number, isSplash: boolean): number => {
  if (isSplash) return cmc >= 6 ? 3 : cmc >= 4 ? 4 : 6;
  if (pips >= 3) return cmc <= 3 ? 14 : cmc <= 4 ? 13 : cmc <= 5 ? 12 : 11;
  if (pips === 2) return cmc <= 2 ? 12 : cmc <= 3 ? 11 : cmc <= 4 ? 10 : 9;
  return cmc <= 2 ? 8 : cmc <= 3 ? 7 : 6;
};

const hasActiveSplashDemand = (
  cards: DeckCard[],
  poolMap: Map<string, PoolCard>,
  mainColors: string[],
  splashColor: string | null,
): boolean => {
  if (!splashColor) return false;
  const allColors = [...mainColors, splashColor];
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    if (countRequiredColorPipsForDeck(pc.cost, splashColor, allColors) > 0) return true;
  }
  return false;
};

const estimateSourcesFromDeck = (
  cards: DeckCard[], poolMap: Map<string, PoolCard>,
  mainColors: string[], splashColor: string | null,
): Record<string, number> => {
  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const demand: Record<string, number> = {};
  for (const c of allColors) demand[c] = 0;

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    for (const color of allColors) {
      const requiredPips = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      demand[color] += requiredPips * dc.qty;
    }
  }

  const totalDemand = allColors.reduce((s, c) => s + (demand[c] || 0), 0);
  const sources: Record<string, number> = {};
  if (totalDemand <= 0) {
    const even = Math.floor(17 / Math.max(1, allColors.length));
    for (const c of allColors) sources[c] = even;
    return sources;
  }
  const totalLands = 17;
  for (const c of allColors) sources[c] = (demand[c] / totalDemand) * totalLands;

  // Non-land mana producers in deck count as partial sources (weighted by CMC)
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc || isLandType(pc.type) || !pc.isManaProducer) continue;
    const produced = extractColors(pc.producedColours || "");
    const weight = nonLandSourceWeight(pc.cmc);
    for (const color of allColors)
      if (produced.includes(color)) sources[color] = (sources[color] || 0) + dc.qty * weight;
  }
  return sources;
};

const computeSourcesFromLands = (
  lands: DeckCard[], cards: DeckCard[], poolMap: Map<string, PoolCard>,
  mainColors: string[], splashColor: string | null,
): Record<string, number> => {
  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const sources: Record<string, number> = {};
  for (const c of allColors) sources[c] = 0;

  for (const land of lands) {
    const basicColor = BASIC_TO_COLOR[land.name];
    if (basicColor && allColors.includes(basicColor)) {
      sources[basicColor] += land.qty;
    } else {
      const isFetch = /evolving wilds|terramorphic expanse|fabled passage/i.test(land.name);
      if (isFetch) {
        for (const c of allColors) sources[c] += land.qty;
        continue;
      }
      const pc = poolMap.get(land.name);
      if (!pc) continue;
      for (const c of extractColors(pc.producedColours || pc.colors || ""))
        if (allColors.includes(c)) sources[c] += land.qty;
    }
  }

  // Non-land mana producers (same weighting as during scoring)
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc || isLandType(pc.type) || !pc.isManaProducer) continue;
    const weight = nonLandSourceWeight(pc.cmc);
    for (const c of extractColors(pc.producedColours || ""))
      if (allColors.includes(c)) sources[c] += dc.qty * weight;
  }
  return sources;
};

const COMBINATORIC_CACHE = new Map<string, number>();
const HYPER_TAIL_CACHE = new Map<string, number>();

const nChooseK = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  const key = `${n}|${kk}`;
  const cached = COMBINATORIC_CACHE.get(key);
  if (cached != null) return cached;
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
  }
  COMBINATORIC_CACHE.set(key, result);
  return result;
};

const hyperGeoAtLeastInt = (
  sourcesInDeck: number,
  draws: number,
  required: number,
): number => {
  const K = Math.max(0, Math.min(40, Math.trunc(sourcesInDeck)));
  const n = Math.max(0, Math.min(40, Math.trunc(draws)));
  const k = Math.max(0, Math.trunc(required));
  if (k <= 0) return 1;
  if (K <= 0 || n <= 0) return 0;
  if (k > K || k > n) return 0;
  const key = `${K}|${n}|${k}`;
  const cached = HYPER_TAIL_CACHE.get(key);
  if (cached != null) return cached;

  const denom = nChooseK(40, n);
  if (denom <= 0) return 0;
  let numer = 0;
  const upper = Math.min(K, n);
  for (let x = k; x <= upper; x++) {
    numer += nChooseK(K, x) * nChooseK(40 - K, n - x);
  }
  const prob = Math.max(0, Math.min(1, numer / denom));
  HYPER_TAIL_CACHE.set(key, prob);
  return prob;
};

const hyperGeoAtLeast = (
  effectiveSources: number,
  draws: number,
  required: number,
): number => {
  const kEff = Math.max(0, Math.min(40, effectiveSources || 0));
  const low = Math.floor(kEff);
  const high = Math.ceil(kEff);
  if (low === high) return hyperGeoAtLeastInt(low, draws, required);
  const frac = kEff - low;
  const pLow = hyperGeoAtLeastInt(low, draws, required);
  const pHigh = hyperGeoAtLeastInt(high, draws, required);
  return pLow * (1 - frac) + pHigh * frac;
};

const getCastabilityTarget = (
  maxRequiredPips: number,
  totalRequiredPips: number,
  cmc: number,
): number => {
  const c = Math.max(1, Math.round(cmc || 0));
  if (maxRequiredPips >= 3) return c <= 4 ? 0.74 : 0.70;
  if (maxRequiredPips === 2) return c <= 3 ? 0.80 : c <= 4 ? 0.76 : 0.72;
  if (totalRequiredPips >= 2) return c <= 3 ? 0.81 : c <= 4 ? 0.77 : 0.73;
  return c <= 2 ? 0.86 : c <= 3 ? 0.82 : c <= 4 ? 0.78 : 0.73;
};

const getConsistencyCardWeight = (cmc: number, qty: number): number => {
  const c = Math.max(1, Math.round(cmc || 0));
  const q = Math.max(1, qty || 1);
  if (c <= 2) return q * 1.25;
  if (c === 3) return q * 1.12;
  return q;
};

const computeConsistencyScoreFromCastability = (
  cards: DeckCard[],
  poolMap: Map<string, PoolCard>,
  mainColors: string[],
  splashColor: string | null,
  sources: Record<string, number>,
  totalLands: number,
): number => {
  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const effectiveLandCount = Math.max(14, Math.min(19, Math.round(totalLands || 17)));
  let weightedSum = 0;
  let totalWeight = 0;
  const reliabilities: number[] = [];
  const reqAggByColor: Record<string, { weightedReq: number; weight: number }> = {};
  const earlyDemandByColor: Record<string, number> = {};
  const midDemandByColor: Record<string, number> = {};
  for (const color of allColors) {
    reqAggByColor[color] = { weightedReq: 0, weight: 0 };
    earlyDemandByColor[color] = 0;
    midDemandByColor[color] = 0;
  }

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;

    const requiredByColor: Record<string, number> = {};
    let totalRequired = 0;
    let maxRequired = 0;
    for (const color of allColors) {
      const req = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      if (req <= 0) continue;
      requiredByColor[color] = req;
      totalRequired += req;
      if (req > maxRequired) maxRequired = req;
    }

    if (totalRequired <= 0) continue;

    const cmc = Math.max(1, Math.round(Number(pc.cmc || 0)));
    const turn = Math.max(2, Math.min(7, cmc));
    const drawsPlay = 7 + Math.max(0, turn - 1);
    const drawsDraw = drawsPlay + 1;

    let colorPlayProb = 1;
    let colorDrawProb = 1;
    for (const [color, req] of Object.entries(requiredByColor)) {
      const src = Math.max(0, Number(sources[color] || 0));
      const pPlay = hyperGeoAtLeast(src, drawsPlay, req);
      const pDraw = hyperGeoAtLeast(src, drawsDraw, req);
      colorPlayProb *= pPlay;
      colorDrawProb *= pDraw;
    }
    const landNeed = Math.max(1, cmc);
    const landPlayProb = hyperGeoAtLeast(effectiveLandCount, drawsPlay, landNeed);
    const landDrawProb = hyperGeoAtLeast(effectiveLandCount, drawsDraw, landNeed);

    // Blend color access with raw land-count availability so expensive spells
    // don't look artificially free just because colored pips are easy.
    const castPlay = colorPlayProb * (0.5 + 0.5 * landPlayProb);
    const castDraw = colorDrawProb * (0.5 + 0.5 * landDrawProb);
    const castProb = Math.max(0, Math.min(1, (castPlay + castDraw) * 0.5));

    const target = getCastabilityTarget(maxRequired, totalRequired, cmc);
    const reliability = Math.max(0, Math.min(1, castProb / Math.max(1e-6, target)));
    const weight = getConsistencyCardWeight(cmc, dc.qty);

    weightedSum += reliability * weight;
    totalWeight += weight;
    reliabilities.push(reliability);

    for (const [color, req] of Object.entries(requiredByColor)) {
      const reqTarget = karstenRequiredSources(req, cmc, splashColor === color);
      reqAggByColor[color].weightedReq += reqTarget * weight;
      reqAggByColor[color].weight += weight;
      if (cmc <= 2) earlyDemandByColor[color] += dc.qty * req;
      if (cmc <= 3) midDemandByColor[color] += dc.qty * req;
    }
  }

  if (totalWeight <= 0) return 100;
  let score = (weightedSum / totalWeight) * 100;

  // Color-adequacy floor: compare weighted required sources per active color
  // against available sources. This catches unstable 3c mana bases without
  // over-penalizing a single demanding singleton card.
  let activeColorCount = 0;
  let deficitSum = 0;
  let deficitMax = 0;
  for (const color of allColors) {
    const agg = reqAggByColor[color];
    if (!agg || agg.weight <= 0) continue;
    activeColorCount++;
    const weightedTarget = agg.weightedReq / agg.weight;
    const available = Math.max(0, Number(sources[color] || 0));
    const deficit = Math.max(0, weightedTarget - available);
    deficitSum += deficit;
    if (deficit > deficitMax) deficitMax = deficit;
  }
  if (deficitSum > 0) {
    const baseFactor = activeColorCount >= 3 ? 4.5 : 3.5;
    score -= deficitSum * baseFactor;
    if (activeColorCount >= 3) {
      score -= deficitMax * 1.5;
    }
  }

  // Early-color floor: if a color is demanded early, require enough sources
  // even with fixers. This prevents shaky 3-color 5/6/6 bases from scoring as
  // highly stable just because they include a couple of mana dorks.
  for (const color of allColors) {
    const src = Math.max(0, Number(sources[color] || 0));
    const earlyDemand = earlyDemandByColor[color] || 0;
    const midDemand = midDemandByColor[color] || 0;

    if (earlyDemand >= 2) {
      const floor = 8;
      const deficit = Math.max(0, floor - src);
      if (deficit > 0) {
        score -= deficit * (activeColorCount >= 3 ? 6.0 : 4.5);
      }
      continue;
    }

    if (midDemand >= 4) {
      const floor = 7;
      const deficit = Math.max(0, floor - src);
      if (deficit > 0) {
        score -= deficit * (activeColorCount >= 3 ? 3.8 : 2.8);
      }
    }
  }

  // Mild tail sensitivity: keeps the metric robust, while avoiding a single
  // demanding singleton collapsing the entire axis.
  reliabilities.sort((a, b) => a - b);
  const tailTake = Math.min(4, reliabilities.length);
  if (tailTake > 0) {
    const tailAvg = reliabilities.slice(0, tailTake).reduce((s, v) => s + v, 0) / tailTake;
    score = score * 0.72 + tailAvg * 100 * 0.28;
  }

  // Slight compression at the top end to keep separation between very stable
  // decks without over-rewarding already-perfect bases.
  score = Math.pow(Math.max(0, Math.min(1, score / 100)), 1.32) * 100;
  return clamp(score, 0, 100);
};

const computeManaPenalty = (
  cards: DeckCard[], poolMap: Map<string, PoolCard>,
  mainColors: string[], splashColor: string | null,
  sourcesOverride?: Record<string, number>,
  totalLandsOverride?: number,
): number => {
  const estimated = sourcesOverride || estimateSourcesFromDeck(cards, poolMap, mainColors, splashColor);
  const consistency = computeConsistencyScoreFromCastability(
    cards,
    poolMap,
    mainColors,
    splashColor,
    estimated,
    totalLandsOverride ?? 17,
  );
  // Keep API/telemetry contract unchanged: consistency is derived from
  // manaPenalty via normalizeConsistencyScore(100 - p*450).
  return Math.max(0, (100 - consistency) / 450);
};

// â”€â”€â”€ Dependency penalty (linear, capped, DB-tags only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const computeDependencyPenalty = (cards: DeckCard[], poolMap: Map<string, PoolCard>): number => {
  // Build creature type support map from deck
  const typeSupport = new Map<string, number>();
  let creatureCount = 0;
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    const typeLine = pc.type || "";
    if (!typeLine.includes("Creature")) continue;
    creatureCount += dc.qty;
    for (const t of extractCreatureSubtypes(typeLine))
      typeSupport.set(t, (typeSupport.get(t) || 0) + dc.qty);
    // Changeling counts as full tribal support (MTG rules: all creature types).
    if ((pc.oracleText || "").toLowerCase().includes("changeling"))
      typeSupport.set("__changeling__", (typeSupport.get("__changeling__") || 0) + dc.qty);
  }
  // Non-creature token producers can provide real tribal support.
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    if (pc.isCreature) continue;
    const tokenTags = pc.tokenSupportTags || [];
    const tokenCountPerCopy = Math.max(0, pc.tokenSupportCount || 0);
    if (!tokenTags.length || tokenCountPerCopy <= 0) continue;
    const supportQty = tokenCountPerCopy * dc.qty;
    creatureCount += supportQty;
    for (const tag of tokenTags) {
      typeSupport.set(tag, (typeSupport.get(tag) || 0) + supportQty);
    }
  }

  let penalty = 0;
  const nonCreatureSpellCount = cards.reduce((sum, dc) => {
    const pc = poolMap.get(dc.name);
    if (!pc) return sum;
    if ((pc.type || "").includes("Land")) return sum;
    if (pc.isCreature) return sum;
    return sum + dc.qty;
  }, 0);
  const instantSorceryCount = cards.reduce((sum, dc) => {
    const pc = poolMap.get(dc.name);
    if (!pc) return sum;
    const type = pc.type || "";
    if (type.includes("Instant") || type.includes("Sorcery")) return sum + dc.qty;
    return sum;
  }, 0);
  const mvGeCount = (n: number) =>
    cards.reduce((sum, dc) => {
      const pc = poolMap.get(dc.name);
      if (!pc) return sum;
      return sum + ((pc.cmc >= n) ? dc.qty : 0);
    }, 0);

  const bestTribalChooseSupport = (ownChangelingSupport = 0): number => {
    const changelingCount = typeSupport.get("__changeling__") || 0;
    let bestTypeSupport = 0;
    for (const [tag, count] of typeSupport.entries()) {
      if (tag === "__changeling__") continue;
      if (count > bestTypeSupport) bestTypeSupport = count;
    }
    const effectiveChangeling = Math.max(0, changelingCount - ownChangelingSupport);
    return Math.min(creatureCount, bestTypeSupport + effectiveChangeling);
  };

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    if (pc.dependencyMinSupport == null) continue;
    const scope = (pc.dependencyScope || "").toLowerCase();
    const isTribalChoose = scope === "tribal_choose" || (scope === "tribal" && pc.dependencyTags.length === 0);
    if (pc.dependencyTags.length === 0 && !isTribalChoose) continue;
    const minSupport = pc.dependencyMinSupport ?? 5;
    const changeling = (typeSupport.get("__changeling__") || 0);
    const ownTypeTokens = extractCreatureSubtypes(pc.type || "");
    const ownHasChangeling = (pc.oracleText || "").toLowerCase().includes("changeling");
    const ownChangelingSupport = ownHasChangeling ? dc.qty : 0;
    const specialSupports: number[] = [];
    const tribalTags: string[] = [];
    if (isTribalChoose) {
      specialSupports.push(bestTribalChooseSupport(ownChangelingSupport));
    }
    for (const tag of pc.dependencyTags) {
      if (tag === "instant_sorcery") {
        specialSupports.push(instantSorceryCount);
        continue;
      }
      if (tag === "noncreature_spell") {
        specialSupports.push(nonCreatureSpellCount);
        continue;
      }
      const mvMatch = tag.match(/^mv_ge_(\d+)$/);
      if (mvMatch) {
        const threshold = Number(mvMatch[1]);
        if (Number.isFinite(threshold)) {
          specialSupports.push(mvGeCount(threshold));
        }
        continue;
      }
      tribalTags.push(tag);
    }

    let tribalSupport = 0;
    if (tribalTags.length > 0) {
      for (const tag of new Set(tribalTags)) {
        const ownTypeSupport = ownTypeTokens.includes(tag) ? dc.qty : 0;
        tribalSupport += Math.max(0, (typeSupport.get(tag) || 0) - ownTypeSupport);
      }
      tribalSupport += Math.max(0, changeling - ownChangelingSupport);
      const creatureCap = Math.max(
        0,
        creatureCount - (ownTypeTokens.length > 0 || ownHasChangeling ? dc.qty : 0),
      );
      tribalSupport = Math.min(tribalSupport, creatureCap);
    }

    const bestSupport = Math.max(tribalSupport, ...specialSupports, 0);
    if (bestSupport >= minSupport) continue;
    const missing = Math.max(0, minSupport - bestSupport);
    const ratioMissing = minSupport > 0 ? missing / minSupport : 1;
    // Hard dependencies must be strongly punished when threshold is not met.
    // This intentionally makes off-plan cards (e.g. tribal payoffs without tribe)
    // very unlikely to survive hill-climbing swaps.
    const perCopyPenalty = Math.min(2.8, 0.6 + ratioMissing * 3.0);
    // Multiple copies of an off-plan hard-dependency card are significantly worse.
    // Copy weights: 1st=1.0, 2nd=1.7, 3rd+=2.3 each.
    let copyWeight = 0;
    for (let i = 1; i <= dc.qty; i++) {
      if (i === 1) copyWeight += 1.0;
      else if (i === 2) copyWeight += 1.7;
      else copyWeight += 2.3;
    }
    penalty += perCopyPenalty * copyWeight;
  }
  return penalty;
};

const isFixerOnlyCard = (pc: PoolCard): boolean => {
  const tags = new Set((pc.dependencyTags || []).map((t) => t.toLowerCase()));
  if (tags.has("fixer_only")) return true;
  if ((pc.dependencyScope || "").toLowerCase() === "fixer") return true;
  return false;
};

const computeFixerOnlyPenalty = (
  cards: DeckCard[],
  poolMap: Map<string, PoolCard>,
  mainColors: string[],
  splashColor: string | null,
): number => {
  const activeSplash = hasActiveSplashDemand(cards, poolMap, mainColors, splashColor);
  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const colorPipDemand: Record<string, number> = {};
  for (const c of allColors) colorPipDemand[c] = 0;
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    for (const c of allColors) {
      colorPipDemand[c] += countRequiredColorPipsForDeck(pc.cost, c, allColors) * dc.qty;
    }
  }
  const activeColorCount = allColors.filter((c) => (colorPipDemand[c] || 0) > 0).length;
  const splashPipDemand = splashColor ? (colorPipDemand[splashColor] || 0) : 0;

  // Fixers have diminishing returns:
  // - low-color decks: penalize from copy #1
  // - normal splash decks: allow 1 copy
  // - heavy splash / true multicolor: allow up to 2 copies
  let freeCopies = 0;
  if (activeSplash) freeCopies = 1;
  if (activeColorCount >= 4 || (activeColorCount >= 3 && splashPipDemand >= 2)) {
    freeCopies = 2;
  }

  let penalty = 0;
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    if (!isFixerOnlyCard(pc)) continue;

    for (let i = 1; i <= dc.qty; i++) {
      if (i <= freeCopies) continue;
      const over = i - freeCopies;
      if (!activeSplash) {
        penalty += 1.8 + (over - 1) * 1.6;
      } else {
        penalty += 0.8 + (over - 1) * 1.4;
      }
    }
  }
  return penalty;
};


type SupportContext = {
  typeSupport: Map<string, number>;
  changelingSupport: number;
  creatureCount: number;
  instantSorceryCount: number;
  nonCreatureSpellCount: number;
  mvGeCounts: Map<number, number>;
};

const buildSupportContext = (cards: PoolCard[]): SupportContext => {
  const typeSupport = new Map<string, number>();
  let changelingSupport = 0;
  let creatureCount = 0;
  let instantSorceryCount = 0;
  let nonCreatureSpellCount = 0;
  const mvGeCounts = new Map<number, number>();

  for (const pc of cards) {
    const qty = Math.max(0, pc.qty || 0);
    if (qty <= 0) continue;
    const typeLine = pc.type || "";

    if (!typeLine.includes("Land") && !pc.isCreature) nonCreatureSpellCount += qty;
    if (typeLine.includes("Instant") || typeLine.includes("Sorcery")) instantSorceryCount += qty;

    const cmc = Number(pc.cmc || 0);
    for (let threshold = 0; threshold <= 8; threshold++) {
      if (cmc >= threshold) {
        mvGeCounts.set(threshold, (mvGeCounts.get(threshold) || 0) + qty);
      }
    }

    if (!typeLine.includes("Creature")) continue;
    creatureCount += qty;
    for (const t of extractCreatureSubtypes(typeLine)) {
      typeSupport.set(t, (typeSupport.get(t) || 0) + qty);
    }
    if ((pc.oracleText || "").toLowerCase().includes("changeling")) {
      changelingSupport += qty;
    }

    const tokenTags = pc.tokenSupportTags || [];
    const tokenCountPerCopy = Math.max(0, pc.tokenSupportCount || 0);
    if (!pc.isCreature && tokenTags.length > 0 && tokenCountPerCopy > 0) {
      const supportQty = tokenCountPerCopy * qty;
      creatureCount += supportQty;
      for (const tag of tokenTags) {
        typeSupport.set(tag, (typeSupport.get(tag) || 0) + supportQty);
      }
    }
  }

  return {
    typeSupport,
    changelingSupport,
    creatureCount,
    instantSorceryCount,
    nonCreatureSpellCount,
    mvGeCounts,
  };
};

const getDependencySupportForCard = (
  pc: PoolCard,
  ctx: SupportContext,
  selfQtyToExclude = 0,
): number => {
  const scope = (pc.dependencyScope || "").toLowerCase();
  const isTribalChoose = scope === "tribal_choose" || (scope === "tribal" && pc.dependencyTags.length === 0);
  if (pc.dependencyMinSupport == null) return Number.POSITIVE_INFINITY;
  if (!pc.dependencyTags.length && !isTribalChoose) return Number.POSITIVE_INFINITY;

  const ownTypeTokens = extractCreatureSubtypes(pc.type || "");
  const ownHasChangeling = (pc.oracleText || "").toLowerCase().includes("changeling");
  const ownChangelingSupport = ownHasChangeling ? selfQtyToExclude : 0;

  const specialSupports: number[] = [];
  const tribalTags: string[] = [];
  if (isTribalChoose) {
    let bestTypeSupport = 0;
    for (const [, count] of ctx.typeSupport.entries()) {
      if (count > bestTypeSupport) bestTypeSupport = count;
    }
    const effectiveChangeling = Math.max(0, ctx.changelingSupport - ownChangelingSupport);
    specialSupports.push(Math.min(ctx.creatureCount, bestTypeSupport + effectiveChangeling));
  }
  for (const tag of pc.dependencyTags) {
    if (tag === "instant_sorcery") {
      specialSupports.push(ctx.instantSorceryCount);
      continue;
    }
    if (tag === "noncreature_spell") {
      specialSupports.push(ctx.nonCreatureSpellCount);
      continue;
    }
    const mvMatch = tag.match(/^mv_ge_(\d+)$/);
    if (mvMatch) {
      const threshold = Number(mvMatch[1]);
      if (Number.isFinite(threshold)) {
        specialSupports.push(ctx.mvGeCounts.get(threshold) || 0);
      }
      continue;
    }
    tribalTags.push(tag);
  }

  // Tribal multi-tag dependencies should be evaluated as a union of supports
  // (e.g. Elf OR Faerie), not as max(single-tag support).
  let tribalSupport = 0;
  if (tribalTags.length > 0) {
    for (const tag of new Set(tribalTags)) {
      const ownTypeSupport = ownTypeTokens.includes(tag) ? selfQtyToExclude : 0;
      tribalSupport += Math.max(0, (ctx.typeSupport.get(tag) || 0) - ownTypeSupport);
    }
    tribalSupport += Math.max(0, ctx.changelingSupport - ownChangelingSupport);
    const creatureCap = Math.max(
      0,
      ctx.creatureCount - (ownTypeTokens.length > 0 || ownHasChangeling ? selfQtyToExclude : 0),
    );
    tribalSupport = Math.min(tribalSupport, creatureCap);
  }

  return Math.max(tribalSupport, ...specialSupports, 0);
};

const getCardUtilityScore = (
  pc: PoolCard,
  _skeleton: Skeleton | null,
  formatMean: number,
  jitter = 0,
  searchProfile: SearchProfile = DEFAULT_SEARCH_PROFILE,
  mainColors: string[] = [],
  splashColor: string | null = null,
  supportCtx: SupportContext | null = null,
): number => {
  let score = pc.wr;

  const wrFloor = formatMean - 2;
  if (pc.wr < wrFloor) {
    score -= (wrFloor - pc.wr);
  }

  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const mainSet = new Set(mainColors);
  const cardColors = new Set(extractColors(pc.colors));
  const maxMainPips = Math.max(
    0,
    ...mainColors.map((c) => countRequiredColorPipsForDeck(pc.cost, c, allColors)),
  );
  const splashPips = splashColor
    ? countRequiredColorPipsForDeck(pc.cost, splashColor, allColors)
    : 0;
  const isSplashOnly = !!splashColor &&
    cardColors.has(splashColor) &&
    ![...cardColors].some((c) => mainSet.has(c));
  const isBomb = pc.wr >= formatMean + 10 || /mythic|rare/i.test(pc.rarity || "");

  switch (searchProfile) {
    case "power_mana_safe": {
      score += (pc.wr - formatMean) * 0.18;
      if (maxMainPips >= 3) score -= 1.2;
      else if (maxMainPips === 2) score -= 0.45;
      if (isSplashOnly && pc.cmc < 4) score -= 1.5;
      if (isSplashOnly && splashPips > 1) score -= 0.9;
      break;
    }
    case "power_greedy_splash": {
      score += (pc.wr - formatMean) * 0.24;
      if (isBomb) score += 0.7;
      if (isSplashOnly && pc.cmc >= 4 && splashPips <= 1) score += 0.9;
      if (isSplashOnly && pc.cmc < 4) score -= 0.65;
      if (maxMainPips >= 3) score -= 0.35;
      break;
    }
    case "curve_creatures": {
      if (pc.isCreature) {
        if (pc.cmc >= 2 && pc.cmc <= 4) score += 1.0;
        else if (pc.cmc <= 5) score += 0.5;
      } else if (pc.cmc === 2) {
        score -= 0.8;
      }
      if (pc.isRemoval) score += 0.25;
      break;
    }
    case "synergy_if_online": {
      if (pc.dependencyMinSupport != null) {
        const ctx = supportCtx ?? buildSupportContext([pc]);
        const support = getDependencySupportForCard(pc, ctx, 0);
        const need = Math.max(1, pc.dependencyMinSupport);
        if (support >= need) {
          score += 1.1 + Math.min(0.6, ((support - need) / need) * 0.6);
        } else {
          const missingRatio = (need - support) / need;
          score -= 1.5 + missingRatio * 1.8;
        }
      } else if (pc.isCreature && pc.cmc <= 4) {
        score += 0.2;
      }
      break;
    }
    case "skeleton":
    default:
      break;
  }

  return score + jitter;
};

// â”€â”€â”€ Deck scoring (single unified score) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getIdealCurve = (skeleton: Skeleton | null): Record<number, number> => {
  const dflt: Record<number, number> = { 1: 3, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1 };
  if (!skeleton?.avg_mana_curve) return dflt;
  const curve: Record<number, number> = {};
  for (const [k, v] of Object.entries(skeleton.avg_mana_curve)) curve[Number(k)] = v;
  return curve;
};

const getCreatureTarget = (skeleton: Skeleton | null, spellCount: number): number => {
  const ratio = Number(skeleton?.creature_ratio ?? 0);
  const bySkeleton = Number.isFinite(ratio) && ratio > 0
    ? Math.round((spellCount * ratio) / 100)
    : 15;
  return Math.min(CREATURE_CORRIDOR_MAX, Math.max(CREATURE_CORRIDOR_MIN, bySkeleton));
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeWrScore = (wrScore: number, formatMean: number): number => {
  // Linear normalization centered on format average:
  // -4 pts vs format => 0, format average => 50, +4 pts => 100.
  return clamp(((wrScore - formatMean + 4) / 8) * 100, 0, 100);
};

const normalizeSynergyScore = (synergyScore: number): number => {
  return clamp(50 + synergyScore * 40, 0, 100);
};

const normalizeConsistencyScore = (manaPenalty: number): number =>
  clamp(100 - manaPenalty * 450, 0, 100);

const normalizeCurveScore = (curvePenalty: number): number =>
  clamp(100 - curvePenalty * 90, 0, 100);

const DEFAULT_CURVE_COMPONENT_SCALE = 90;
const DEFAULT_REMOVAL_AXIS_SCALE = 4;

export const DEFAULT_CURVE_COMPONENT_SCALES: CurveComponentScales = {
  topHeavy: DEFAULT_CURVE_COMPONENT_SCALE,
  skeletonShape: DEFAULT_CURVE_COMPONENT_SCALE,
  earlyCreature: DEFAULT_CURVE_COMPONENT_SCALE,
  creatureCorridor: DEFAULT_CURVE_COMPONENT_SCALE,
  removalAxis: DEFAULT_REMOVAL_AXIS_SCALE,
};

const sanitizeCurveComponentScales = (
  input?: Partial<CurveComponentScales> | null,
): CurveComponentScales => {
  const clampScale = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    topHeavy: clampScale(input?.topHeavy, DEFAULT_CURVE_COMPONENT_SCALES.topHeavy, 0, 200),
    skeletonShape: clampScale(input?.skeletonShape, DEFAULT_CURVE_COMPONENT_SCALES.skeletonShape, 0, 200),
    earlyCreature: clampScale(input?.earlyCreature, DEFAULT_CURVE_COMPONENT_SCALES.earlyCreature, 0, 200),
    creatureCorridor: clampScale(input?.creatureCorridor, DEFAULT_CURVE_COMPONENT_SCALES.creatureCorridor, 0, 200),
    removalAxis: clampScale(input?.removalAxis, DEFAULT_CURVE_COMPONENT_SCALES.removalAxis, 0, 12),
  };
};

const computeCurveAndStructurePenalty = (
  expanded: PoolCard[],
  cards: DeckCard[],
  poolMap: Map<string, PoolCard>,
  skeleton: Skeleton | null,
  creatureCount: number,
  curveScales: CurveComponentScales,
): {
  topHeavy: number;
  skeletonShape: number;
  earlyCreatureProfile: number;
  creatureCorridor: number;
  total: number;
} => {
  const totalSpells = expanded.length;
  if (totalSpells <= 0) {
    return {
      topHeavy: 0,
      skeletonShape: 0,
      earlyCreatureProfile: 0,
      creatureCorridor: 0,
      total: 0,
    };
  }

  const actualCurve: Record<number, number> = {};
  for (const pc of expanded) {
    const bucket = Math.min(Math.max(Math.round(pc.cmc), 1), 7);
    actualCurve[bucket] = (actualCurve[bucket] || 0) + 1;
  }

  // 1) Main shape guardrail: penalize top-heavy distributions more than small
  // micro-differences between CMC2/CMC3 buckets.
  const twoThree = (actualCurve[2] || 0) + (actualCurve[3] || 0);
  const fourFive = (actualCurve[4] || 0) + (actualCurve[5] || 0);
  const sixPlus = (actualCurve[6] || 0) + (actualCurve[7] || 0);
  const maxFourFive = twoThree * 0.8 + 1;
  const excessFourFive = Math.max(0, fourFive - maxFourFive);
  const excessSixPlus = Math.max(0, sixPlus - 1.5);
  const topHeavyPenalty = excessFourFive * 0.07 + excessSixPlus * 0.12;

  // 2) Mild skeleton-shape anchoring (for metagame realism), much softer than
  // the previous strict absolute-delta penalty.
  const idealCurve = getIdealCurve(skeleton);
  const bucketWeights: Record<number, number> = {
    1: 0.2,
    2: 0.35,
    3: 0.25,
    4: 0.15,
    5: 0.1,
    6: 0.05,
    7: 0.03,
  };
  let weightedDelta = 0;
  for (let cmc = 1; cmc <= 7; cmc++) {
    weightedDelta += Math.abs((actualCurve[cmc] || 0) - (idealCurve[cmc] || 0)) * (bucketWeights[cmc] || 0);
  }
  const skeletonPenalty = weightedDelta * CURVE_PENALTY_FACTOR * 2;

  // 3) Creature profile in early buckets (CMC2/CMC3) is part of the axis.
  const deckCreatureRatioRaw = totalSpells > 0 ? creatureCount / totalSpells : 0;
  const deckCreatureRatio = clamp(deckCreatureRatioRaw, 0.42, 0.75);
  const bucketTotals: Record<number, number> = {};
  const bucketCreatures: Record<number, number> = {};
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    const cmcBucket = Math.min(7, Math.max(1, Math.round(Number(pc.cmc || 0))));
    bucketTotals[cmcBucket] = (bucketTotals[cmcBucket] || 0) + dc.qty;
    if (pc.isCreature) {
      bucketCreatures[cmcBucket] = (bucketCreatures[cmcBucket] || 0) + dc.qty;
    }
  }

  let earlyCreaturePenalty = 0;
  for (const cmc of [2, 3]) {
    const totalInBucket = bucketTotals[cmc] || 0;
    if (totalInBucket < 4) continue;
    const creaturesInBucket = bucketCreatures[cmc] || 0;
    const expectedCreatures = totalInBucket * deckCreatureRatio;
    const minAllowedCreatures = Math.max(1, Math.floor(expectedCreatures));
    const missing = Math.max(0, minAllowedCreatures - creaturesInBucket);
    if (missing <= 0) continue;
    earlyCreaturePenalty += missing * (cmc === 2 ? 0.05 : 0.035);
  }

  // 4) Light global creature corridor pressure (moved from structure adjust).
  let creatureCorridorPenalty = 0;
  if (creatureCount < CREATURE_CORRIDOR_MIN) {
    creatureCorridorPenalty += (CREATURE_CORRIDOR_MIN - creatureCount) * 0.07;
  } else if (creatureCount > CREATURE_CORRIDOR_MAX) {
    creatureCorridorPenalty += (creatureCount - CREATURE_CORRIDOR_MAX) * 0.05;
  }

  const topHeavyScaled = topHeavyPenalty * (curveScales.topHeavy / DEFAULT_CURVE_COMPONENT_SCALE);
  const skeletonScaled = skeletonPenalty * (curveScales.skeletonShape / DEFAULT_CURVE_COMPONENT_SCALE);
  const earlyCreatureScaled = earlyCreaturePenalty * (curveScales.earlyCreature / DEFAULT_CURVE_COMPONENT_SCALE);
  const creatureCorridorScaled =
    creatureCorridorPenalty * (curveScales.creatureCorridor / DEFAULT_CURVE_COMPONENT_SCALE);

  const total = topHeavyScaled + skeletonScaled + earlyCreatureScaled + creatureCorridorScaled;
  return {
    topHeavy: topHeavyPenalty,
    skeletonShape: skeletonPenalty,
    earlyCreatureProfile: earlyCreaturePenalty,
    creatureCorridor: creatureCorridorPenalty,
    total,
  };
};

const computeStructureAdjustment = (
  removalCount: number,
  dependencyPenalty: number,
): {
  creatureAdjustment: number;
  removalAdjustment: number;
  skeletonAdjustment: number;
  dependencyAdjustment: number;
  totalAdjustment: number;
} => {
  let removalAdjustment = 0;
  if (removalCount >= TARGET_REMOVAL_MIN) removalAdjustment = 0;
  else if (removalCount === TARGET_REMOVAL_MIN - 1) removalAdjustment = -3;
  else removalAdjustment = -6;

  const skeletonAdjustment = 0;
  const creatureAdjustment = 0;

  const dependencyAdjustment = dependencyPenalty > 0.5
    ? -Math.min(10, dependencyPenalty)
    : 0;

  const totalAdjustment =
    removalAdjustment + dependencyAdjustment;

  return {
    creatureAdjustment,
    removalAdjustment,
    skeletonAdjustment,
    dependencyAdjustment,
    totalAdjustment,
  };
};

const computeLegacyEquivalentAxisScales = (
  scoreWeights: ScoreWeights,
  curveScales: CurveComponentScales,
): { dependencyAxisScale: number; removalAxisScale: number } => {
  const totalWeight =
    scoreWeights.power +
    scoreWeights.synergy +
    scoreWeights.consistency +
    scoreWeights.curve;

  const dependencyAxisScale =
    scoreWeights.synergy > 0 ? totalWeight / scoreWeights.synergy : 0;
  const removalAxisScale = curveScales.removalAxis;

  return { dependencyAxisScale, removalAxisScale };
};

const computeAdjustedAxisScores = (
  synergyBaseNormalized: number,
  curveBaseScore: number,
  dependencyAdjustment: number,
  removalAdjustment: number,
  scoreWeights: ScoreWeights,
  curveScales: CurveComponentScales,
): {
  dependencyAxisScale: number;
  dependencyAxisDelta: number;
  removalAxisScale: number;
  removalAxisDelta: number;
  synergyAxisScore: number;
  curveAxisScore: number;
} => {
  const scales = computeLegacyEquivalentAxisScales(scoreWeights, curveScales);
  const dependencyAxisDelta = dependencyAdjustment * scales.dependencyAxisScale;
  const removalAxisDelta = removalAdjustment * scales.removalAxisScale;
  return {
    dependencyAxisScale: scales.dependencyAxisScale,
    dependencyAxisDelta,
    removalAxisScale: scales.removalAxisScale,
    removalAxisDelta,
    synergyAxisScore: synergyBaseNormalized + dependencyAxisDelta,
    curveAxisScore: curveBaseScore + removalAxisDelta,
  };
};

const computeCompositeScore = (
  wrNormalized: number,
  synergyAxisScore: number,
  consistencyScore: number,
  curveAxisScore: number,
  scoreWeights: ScoreWeights,
): number => {
  const totalWeight =
    scoreWeights.power +
    scoreWeights.synergy +
    scoreWeights.consistency +
    scoreWeights.curve;

  return (
    scoreWeights.power * wrNormalized +
    scoreWeights.synergy * synergyAxisScore +
    scoreWeights.consistency * consistencyScore +
    scoreWeights.curve * curveAxisScore
  ) / Math.max(1e-6, totalWeight);
};

const computeAxisWeightedContributions = (
  wrNormalized: number,
  synergyAxisScore: number,
  consistencyScore: number,
  curveAxisScore: number,
  scoreWeights: ScoreWeights,
): {
  powerWeightedContribution: number;
  synergyWeightedContribution: number;
  consistencyWeightedContribution: number;
  curveWeightedContribution: number;
} => {
  const totalWeight =
    scoreWeights.power +
    scoreWeights.synergy +
    scoreWeights.consistency +
    scoreWeights.curve;
  const denom = Math.max(1e-6, totalWeight);
  return {
    powerWeightedContribution: (wrNormalized * scoreWeights.power) / denom,
    synergyWeightedContribution: (synergyAxisScore * scoreWeights.synergy) / denom,
    consistencyWeightedContribution: (consistencyScore * scoreWeights.consistency) / denom,
    curveWeightedContribution: (curveAxisScore * scoreWeights.curve) / denom,
  };
};

export const calculateDeckScore = (
  cards: DeckCard[], pool: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  mainColors: string[], splashColor: string | null,
  skeleton: Skeleton | null,
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  curveComponentScales?: Partial<CurveComponentScales> | null,
): { score: number; breakdown: ScoreBreakdown; stats: DeckStats } => {
  const curveScales = sanitizeCurveComponentScales(curveComponentScales);
  const poolMap = new Map<string, PoolCard>();
  for (const pc of pool) poolMap.set(pc.name, pc);

  const expanded: PoolCard[] = [];
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (pc) for (let i = 0; i < dc.qty; i++) expanded.push(pc);
  }
  if (expanded.length === 0) {
    const zero: ScoreBreakdown = {
      wrScore: 0,
      synergyScore: 0,
      wrNormalized: 0,
      synergyBaseNormalized: 0,
      dependencyAxisScale: 0,
      dependencyAxisDelta: 0,
      synergyNormalized: 0,
      qualityScore: 0,
      powerWeightedContribution: 0,
      synergyWeightedContribution: 0,
      consistencyWeightedContribution: 0,
      curveWeightedContribution: 0,
      consistencyScore: 0,
      curveBaseScore: 0,
      removalAxisScale: 0,
      removalAxisDelta: 0,
      curveScore: 0,
      skeletonSimilarity: 0,
      creatureTarget: 0,
      curvePenalty: 0,
      curveTopHeavyScale: 0,
      curveSkeletonScale: 0,
      curveEarlyCreatureScale: 0,
      curveCreatureCorridorScale: 0,
      curveTopHeavyPenalty: 0,
      curveSkeletonPenalty: 0,
      curveEarlyCreaturePenalty: 0,
      curveCreatureCorridorPenalty: 0,
      manaPenalty: 0,
      dependencyPenalty: 0,
      consistencyAdjustment: 0,
      curveAdjustment: 0,
      skeletonAdjustment: 0,
      creatureAdjustment: 0,
      removalAdjustment: 0,
      dependencyAdjustment: 0,
      totalAdjustment: 0,
    };
    return { score: 0, breakdown: zero, stats: { creatureCount: 0, removalCount: 0, avgCmc: 0, totalCards: 0, skeletonSimilarity: 0 } };
  }

  const n = expanded.length;

  const bombThreshold = formatMean + 10;
  let wrSum = 0, creatureCount = 0, removalCount = 0, cmcSum = 0;
  for (const pc of expanded) {
    wrSum += pc.wr > bombThreshold ? pc.wr * 1.15 : pc.wr;
    if (pc.isCreature) creatureCount++;
    if (pc.isRemoval) removalCount++;
    cmcSum += pc.cmc;
  }
  const wrScore = wrSum / n;

  const synergyScore = getDeckSynergyScore(cards, pairMap);

  let skeletonSimilarity = 0;
  if (skeleton) {
    const deckQty: Record<string, number> = {};
    for (const c of cards) deckQty[c.name] = (deckQty[c.name] || 0) + c.qty;
    const skelQty: Record<string, number> = {};
    for (const sc of skeleton.deck_list || [])
      if (!(sc.type || '').includes('Land')) skelQty[sc.name] = (skelQty[sc.name] || 0) + 1;
    skeletonSimilarity = weightedJaccard(deckQty, skelQty);
  }

  const curvePenaltyBreakdown = computeCurveAndStructurePenalty(
    expanded,
    cards,
    poolMap,
    skeleton,
    creatureCount,
    curveScales,
  );
  const curvePenalty = curvePenaltyBreakdown.total;

  const effectiveSplash = hasActiveSplashDemand(cards, poolMap, mainColors, splashColor) ? splashColor : null;
  const manaPenalty = computeManaPenalty(cards, poolMap, mainColors, effectiveSplash);
  const dependencyPenalty = computeDependencyPenalty(cards, poolMap);
  const fixerOnlyPenalty = computeFixerOnlyPenalty(cards, poolMap, mainColors, effectiveSplash);
  const dependencyAndFixerPenalty = dependencyPenalty + fixerOnlyPenalty;

  const wrNormalized = normalizeWrScore(wrScore, formatMean);
  const synergyBaseNormalized = normalizeSynergyScore(synergyScore);
  const consistencyScore = normalizeConsistencyScore(manaPenalty);
  const curveBaseScore = normalizeCurveScore(curvePenalty);

  const creatureTarget = getCreatureTarget(skeleton, n);
  const structureAdjustment = computeStructureAdjustment(
    removalCount,
    dependencyAndFixerPenalty,
  );
  const adjustedAxes = computeAdjustedAxisScores(
    synergyBaseNormalized,
    curveBaseScore,
    structureAdjustment.dependencyAdjustment,
    structureAdjustment.removalAdjustment,
    scoreWeights,
    curveScales,
  );
  const weightedCompositeScore = computeCompositeScore(
    wrNormalized,
    adjustedAxes.synergyAxisScore,
    consistencyScore,
    adjustedAxes.curveAxisScore,
    scoreWeights,
  );
  const axisContrib = computeAxisWeightedContributions(
    wrNormalized,
    adjustedAxes.synergyAxisScore,
    consistencyScore,
    adjustedAxes.curveAxisScore,
    scoreWeights,
  );

  const qualityScore = weightedCompositeScore;
  const consistencyAdjustment = 0;
  const curveAdjustment = 0;
  const totalAdjustment = 0;
  const score = weightedCompositeScore;

  return {
    score,
    breakdown: {
      wrScore,
      synergyScore,
      wrNormalized,
      synergyBaseNormalized,
      dependencyAxisScale: adjustedAxes.dependencyAxisScale,
      dependencyAxisDelta: adjustedAxes.dependencyAxisDelta,
      synergyNormalized: adjustedAxes.synergyAxisScore,
      qualityScore,
      powerWeightedContribution: axisContrib.powerWeightedContribution,
      synergyWeightedContribution: axisContrib.synergyWeightedContribution,
      consistencyWeightedContribution: axisContrib.consistencyWeightedContribution,
      curveWeightedContribution: axisContrib.curveWeightedContribution,
      consistencyScore,
      curveBaseScore,
      removalAxisScale: adjustedAxes.removalAxisScale,
      removalAxisDelta: adjustedAxes.removalAxisDelta,
      curveScore: adjustedAxes.curveAxisScore,
      skeletonSimilarity,
      creatureTarget,
      curvePenalty,
      curveTopHeavyScale: curveScales.topHeavy,
      curveSkeletonScale: curveScales.skeletonShape,
      curveEarlyCreatureScale: curveScales.earlyCreature,
      curveCreatureCorridorScale: curveScales.creatureCorridor,
      curveTopHeavyPenalty: curvePenaltyBreakdown.topHeavy,
      curveSkeletonPenalty: curvePenaltyBreakdown.skeletonShape,
      curveEarlyCreaturePenalty: curvePenaltyBreakdown.earlyCreatureProfile,
      curveCreatureCorridorPenalty: curvePenaltyBreakdown.creatureCorridor,
      manaPenalty,
      dependencyPenalty: dependencyAndFixerPenalty,
      consistencyAdjustment,
      curveAdjustment,
      skeletonAdjustment: structureAdjustment.skeletonAdjustment,
      creatureAdjustment: structureAdjustment.creatureAdjustment,
      removalAdjustment: structureAdjustment.removalAdjustment,
      dependencyAdjustment: structureAdjustment.dependencyAdjustment,
      totalAdjustment,
    },
    stats: { creatureCount, removalCount, avgCmc: n > 0 ? cmcSum / n : 0, totalCards: n, skeletonSimilarity },
  };
};

export const scoreDeckWithResolvedLands = (
  cards: DeckCard[],
  pool: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  mainColors: string[],
  splashColor: string | null,
  skeleton: Skeleton | null,
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  curveComponentScales?: Partial<CurveComponentScales> | null,
): {
  score: number;
  breakdown: ScoreBreakdown;
  stats: DeckStats;
  lands: DeckCard[];
} => {
  const initial = calculateDeckScore(
    cards,
    pool,
    pairMap,
    mainColors,
    splashColor,
    skeleton,
    scoreWeights,
    formatMean,
    curveComponentScales,
  );

  const lands = determineLands(cards, pool, mainColors, splashColor);
  const poolMap = new Map<string, PoolCard>();
  for (const pc of pool) poolMap.set(pc.name, pc);

  const actualSources = computeSourcesFromLands(
    lands,
    cards,
    poolMap,
    mainColors,
    splashColor,
  );
  const actualManaPenalty = computeManaPenalty(
    cards,
    poolMap,
    mainColors,
    splashColor,
    actualSources,
    lands.reduce((sum, l) => sum + l.qty, 0),
  );
  const actualConsistency = normalizeConsistencyScore(actualManaPenalty);
  const baseScore = computeCompositeScore(
    initial.breakdown.wrNormalized,
    initial.breakdown.synergyNormalized,
    actualConsistency,
    initial.breakdown.curveScore,
    scoreWeights,
  );
  const score = baseScore;

  return {
    score,
    lands,
    stats: initial.stats,
    breakdown: {
      ...initial.breakdown,
      manaPenalty: actualManaPenalty,
      consistencyScore: actualConsistency,
      qualityScore: baseScore,
      totalAdjustment: 0,
    },
  };
};

export const scoreDeckWithProvidedLands = (
  cards: DeckCard[],
  pool: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  mainColors: string[],
  splashColor: string | null,
  skeleton: Skeleton | null,
  providedLands: DeckCard[],
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  curveComponentScales?: Partial<CurveComponentScales> | null,
): {
  score: number;
  breakdown: ScoreBreakdown;
  stats: DeckStats;
  lands: DeckCard[];
} => {
  const initial = calculateDeckScore(
    cards,
    pool,
    pairMap,
    mainColors,
    splashColor,
    skeleton,
    scoreWeights,
    formatMean,
    curveComponentScales,
  );

  const lands = providedLands
    .filter((l) => Number(l.qty || 0) > 0)
    .map((l) => ({ name: l.name, qty: Number(l.qty) }));

  const poolMap = new Map<string, PoolCard>();
  for (const pc of pool) poolMap.set(pc.name, pc);

  const actualSources = computeSourcesFromLands(
    lands,
    cards,
    poolMap,
    mainColors,
    splashColor,
  );
  const actualManaPenalty = computeManaPenalty(
    cards,
    poolMap,
    mainColors,
    splashColor,
    actualSources,
    lands.reduce((sum, l) => sum + l.qty, 0),
  );
  const actualConsistency = normalizeConsistencyScore(actualManaPenalty);
  const baseScore = computeCompositeScore(
    initial.breakdown.wrNormalized,
    initial.breakdown.synergyNormalized,
    actualConsistency,
    initial.breakdown.curveScore,
    scoreWeights,
  );
  const score = baseScore;

  return {
    score,
    lands,
    stats: initial.stats,
    breakdown: {
      ...initial.breakdown,
      manaPenalty: actualManaPenalty,
      consistencyScore: actualConsistency,
      qualityScore: baseScore,
      totalAdjustment: 0,
    },
  };
};
const initCompetitive = (
  eligible: PoolCard[],
  skeleton: Skeleton | null,
  targetSpells: number,
  formatMean: number,
  mainColors: string[],
  splashColor: string | null,
  searchProfile: SearchProfile,
  jitterStrength = 0,
  rng: () => number = Math.random,
): DeckCard[] => {
  const available = new Map<string, number>();
  const eligibleMap = new Map<string, PoolCard>();
  for (const pc of eligible) {
    available.set(pc.name, (available.get(pc.name) || 0) + pc.qty);
    eligibleMap.set(pc.name, pc);
  }

  const utilityByName = new Map<string, number>();
  const supportCtx = buildSupportContext(eligible);
  for (const pc of eligible) {
    const jitter = jitterStrength > 0 ? (rng() - 0.5) * jitterStrength : 0;
    utilityByName.set(
      pc.name,
      getCardUtilityScore(
        pc,
        skeleton,
        formatMean,
        jitter,
        searchProfile,
        mainColors,
        splashColor,
        supportCtx,
      ),
    );
  }

  const deckMap = new Map<string, number>();
  let total = 0;
  let creatureCount = 0;
  let removalCount = 0;
  const creatureTarget = getCreatureTarget(skeleton, targetSpells);

  const addOne = (name: string): boolean => {
    const remaining = available.get(name) || 0;
    if (remaining <= 0 || total >= targetSpells) return false;
    available.set(name, remaining - 1);
    deckMap.set(name, (deckMap.get(name) || 0) + 1);
    total++;
    const pc = eligibleMap.get(name);
    if (pc?.isCreature) creatureCount++;
    if (pc?.isRemoval) removalCount++;
    return true;
  };

  const bestCandidate = (predicate: (pc: PoolCard) => boolean): PoolCard | null => {
    let best: PoolCard | null = null;
    let bestScore = -Infinity;
    for (const pc of eligible) {
      if ((available.get(pc.name) || 0) <= 0) continue;
      if (!predicate(pc)) continue;
      let score = utilityByName.get(pc.name) ?? pc.wr;
      if (score > bestScore) {
        bestScore = score;
        best = pc;
      }
    }
    return best;
  };

  // 1) Optional skeleton anchors.
  // Skeleton profile starts closest to trophy shape; others only keep a tiny anchor.
  if (skeleton) {
    const anchorCap = searchProfile === "skeleton" ? 7 : 3;
    const anchors = (skeleton.deck_list || [])
      .filter((s) => !(s.type || "").includes("Land"))
      .map((s) => s.name)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .filter((name) => eligibleMap.has(name))
      .sort((a, b) => (utilityByName.get(b) || -999) - (utilityByName.get(a) || -999))
      .slice(0, anchorCap);
    for (const name of anchors) {
      if (total >= Math.min(targetSpells, anchorCap)) break;
      addOne(name);
    }
  }

  const fillRemovalFloor = (targetRemoval: number) => {
    while (total < targetSpells && removalCount < targetRemoval) {
      const cand = bestCandidate((pc) => pc.isRemoval);
      if (!cand) break;
      addOne(cand.name);
    }
  };

  const fillCreatureBackbone = (targetCreature: number, preferEarly = false) => {
    while (total < targetSpells && creatureCount < targetCreature) {
      const cand = bestCandidate((pc) =>
        pc.isCreature && (!preferEarly || (pc.cmc >= 2 && pc.cmc <= 4))
      ) || bestCandidate((pc) => pc.isCreature);
      if (!cand) break;
      addOne(cand.name);
    }
  };

  const fillBest = () => {
    while (total < targetSpells) {
      const cand = bestCandidate(() => true);
      if (!cand) break;
      addOne(cand.name);
    }
  };

  switch (searchProfile) {
    case "curve_creatures":
      fillCreatureBackbone(creatureTarget + 1, true);
      fillRemovalFloor(TARGET_REMOVAL_MIN);
      fillBest();
      break;
    case "power_greedy_splash":
      fillRemovalFloor(Math.max(2, TARGET_REMOVAL_MIN - 1));
      fillCreatureBackbone(Math.max(creatureTarget - 1, CREATURE_CORRIDOR_MIN - 1), false);
      fillBest();
      break;
    case "power_mana_safe":
      fillRemovalFloor(TARGET_REMOVAL_MIN);
      fillCreatureBackbone(creatureTarget, false);
      fillBest();
      break;
    case "synergy_if_online":
      fillCreatureBackbone(creatureTarget, true);
      fillRemovalFloor(TARGET_REMOVAL_MIN);
      fillBest();
      break;
    case "skeleton":
    default:
      fillRemovalFloor(TARGET_REMOVAL_MIN);
      fillCreatureBackbone(creatureTarget, false);
      fillBest();
      break;
  }

  return [...deckMap.entries()].map(([name, qty]) => ({ name, qty }));
};

// â”€â”€â”€ Hill Climbing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const deckCardSet = (deck: DeckCard[]): Set<string> => new Set(deck.map((c) => c.name));
const totalQty = (deck: DeckCard[]): number => deck.reduce((s, c) => s + c.qty, 0);

export const hillClimbOptimize = (
  eligible: PoolCard[], pairMap: Record<string, Record<string, number>>,
  mainColors: string[], splashColor: string | null,
  skeleton: Skeleton | null, targetSpells: number,
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  searchProfile: SearchProfile = DEFAULT_SEARCH_PROFILE,
  hcRestarts = NUM_RESTARTS,
  hcIterationLimit = ITERATION_LIMIT,
  rng: () => number = Math.random,
  optimizeDeadlineMs?: number,
  curveComponentScales?: Partial<CurveComponentScales> | null,
): { deck: DeckCard[]; score: number; breakdown: ScoreBreakdown; stats: DeckStats; telemetry: HcTelemetry } => {
  const runStartedMs = Date.now();
  const hardDeadline = Number.isFinite(Number(optimizeDeadlineMs))
    ? Number(optimizeDeadlineMs)
    : null;
  const isTimeUp = () => hardDeadline != null && Date.now() >= hardDeadline;
  let deadlineHit = false;
  let evalCalls = 0;
  let iterationsDone = 0;
  let restartsStarted = 0;
  let restartsCompleted = 0;
  let timeToBestMs = 0;

  const eligibleMap = new Map<string, PoolCard>();
  for (const pc of eligible) eligibleMap.set(pc.name, pc);
  const supportCtx = buildSupportContext(eligible);
  const utilityByName = new Map<string, number>();
  for (const pc of eligible) {
    utilityByName.set(
      pc.name,
      getCardUtilityScore(
        pc,
        skeleton,
        formatMean,
        0,
        searchProfile,
        mainColors,
        splashColor,
        supportCtx,
      ),
    );
  }
  const scoreDeck = (deck: DeckCard[]) => {
    evalCalls++;
    return calculateDeckScore(
      deck,
      eligible,
      pairMap,
      mainColors,
      splashColor,
      skeleton,
      scoreWeights,
      formatMean,
      curveComponentScales,
    );
  };

  let bestDeck: DeckCard[] = [];
  let bestScore = -Infinity;
  let bestBreakdown: ScoreBreakdown = {
    wrScore: 0,
    synergyScore: 0,
    wrNormalized: 0,
    synergyBaseNormalized: 0,
    dependencyAxisScale: 0,
    dependencyAxisDelta: 0,
    synergyNormalized: 0,
    qualityScore: 0,
    powerWeightedContribution: 0,
    synergyWeightedContribution: 0,
    consistencyWeightedContribution: 0,
    curveWeightedContribution: 0,
    consistencyScore: 0,
    curveBaseScore: 0,
    removalAxisScale: 0,
    removalAxisDelta: 0,
    curveScore: 0,
    skeletonSimilarity: 0,
    creatureTarget: 0,
    curvePenalty: 0,
    curveTopHeavyScale: 0,
    curveSkeletonScale: 0,
    curveEarlyCreatureScale: 0,
    curveCreatureCorridorScale: 0,
    curveTopHeavyPenalty: 0,
    curveSkeletonPenalty: 0,
    curveEarlyCreaturePenalty: 0,
    curveCreatureCorridorPenalty: 0,
    manaPenalty: 0,
    dependencyPenalty: 0,
    consistencyAdjustment: 0,
    curveAdjustment: 0,
    skeletonAdjustment: 0,
    creatureAdjustment: 0,
    removalAdjustment: 0,
    dependencyAdjustment: 0,
    totalAdjustment: 0,
  };
  let bestStats: DeckStats = { creatureCount: 0, removalCount: 0, avgCmc: 0, totalCards: 0, skeletonSimilarity: 0 };

  for (let restart = 0; restart < hcRestarts; restart++) {
    if (isTimeUp()) {
      deadlineHit = true;
      break;
    }
    restartsStarted++;
    const restartJitter = 0.9 + restart * 0.8;
    let currentDeck = initCompetitive(
      eligible,
      skeleton,
      targetSpells,
      formatMean,
      mainColors,
      splashColor,
      searchProfile,
      restartJitter,
      rng,
    );

    if (totalQty(currentDeck) < targetSpells * 0.5) continue;

    let current = scoreDeck(currentDeck);

    for (let iter = 0; iter < hcIterationLimit; iter++) {
      if (isTimeUp()) {
        deadlineHit = true;
        break;
      }
      iterationsDone++;
      let improved = false;
      const deckQtyByName = new Map<string, number>();
      for (const c of currentDeck) deckQtyByName.set(c.name, c.qty);
      const creatureTarget = getCreatureTarget(skeleton, targetSpells);
      // Copy-aware neighborhood:
      // allow adding a card if deck currently has fewer copies than pool availability.
      // This fixes local optima where a premium 2-of can't be re-added once reduced to 1x.
      const eligibleForAdd = eligible.filter((pc) => (deckQtyByName.get(pc.name) || 0) < pc.qty);
      const utilitySideboard = eligibleForAdd
        .sort((a, b) => (utilityByName.get(b.name) || b.wr) - (utilityByName.get(a.name) || a.wr))
        .slice(0, 10);
      const creatureSideboard = current.stats.creatureCount < creatureTarget
        ? eligibleForAdd
            .filter((pc) => pc.isCreature)
            .sort((a, b) => (utilityByName.get(b.name) || b.wr) - (utilityByName.get(a.name) || a.wr))
            .slice(0, 8)
        : [];
      const sideboardMap = new Map<string, PoolCard>();
      for (const card of [...utilitySideboard, ...creatureSideboard]) sideboardMap.set(card.name, card);
      const randomSideTake = Math.max(2, Math.floor((utilitySideboard.length + creatureSideboard.length) * 0.3));
      const randomSidePool = eligibleForAdd.filter((pc) => !sideboardMap.has(pc.name));
      for (const pc of sampleWithoutReplacement(randomSidePool, randomSideTake, rng)) {
        sideboardMap.set(pc.name, pc);
      }
      const sideboard = [...sideboardMap.values()];
      if (sideboard.length === 0) break;

      // Always consider cutting non-creature 3+ duplicates (even if high WR)
      const excessDuplicates = currentDeck.filter((c) => {
        if (c.qty < 3) return false;
        const pc = eligibleMap.get(c.name);
        return pc && !pc.isCreature;
      });
      const baseCuts = [...currentDeck].sort((a, b) => {
        return (utilityByName.get(a.name) || eligibleMap.get(a.name)?.wr || 50) -
          (utilityByName.get(b.name) || eligibleMap.get(b.name)?.wr || 50);
      }).slice(0, 7);
      const cutNames = new Set(baseCuts.map((c) => c.name));
      const randomCutTake = Math.max(2, Math.floor(baseCuts.length * 0.3));
      const randomCutPool = currentDeck.filter((c) => !cutNames.has(c.name));
      const randomCuts = sampleWithoutReplacement(randomCutPool, randomCutTake, rng);
      const cutCandidates = [...baseCuts, ...excessDuplicates.filter((c) => !cutNames.has(c.name)), ...randomCuts];

      const buildSwap = (addCard: PoolCard, cutCandidate: DeckCard) => {
        const di = currentDeck.findIndex((c) => c.name === cutCandidate.name);
        if (di < 0) return null;
        const newDeck = currentDeck
          .map((c, i) => i === di ? (c.qty > 1 ? { name: c.name, qty: c.qty - 1 } : null) : c)
          .filter((c): c is DeckCard => c != null && c.qty > 0);

        const ei = newDeck.findIndex((c) => c.name === addCard.name);
        if (ei >= 0) newDeck[ei] = { name: addCard.name, qty: newDeck[ei].qty + 1 };
        else newDeck.push({ name: addCard.name, qty: 1 });
        const newResult = scoreDeck(newDeck);
        return { newDeck, newResult };
      };

      let bestSwap: { deck: DeckCard[]; result: ReturnType<typeof calculateDeckScore> } | null = null;
      let bestDelta = 0.001;
      let positiveCount = 0;
      let stopSearch = false;

      for (const addCard of sideboard) {
        if (isTimeUp()) {
          deadlineHit = true;
          break;
        }
        if (stopSearch || positiveCount >= HC_BEST_OF_K) break;
        // CMC-aware neighborhood:
        // favor "replace role with role" swaps first (same/near CMC),
        // then fall back to global cut candidates.
        const focusedCuts = new Map<string, DeckCard>();
        for (const c of cutCandidates) focusedCuts.set(c.name, c);
        const addCmc = Number(addCard.cmc || 0);
        for (const c of currentDeck) {
          const cutCmc = Number(eligibleMap.get(c.name)?.cmc || 0);
          if (Math.abs(cutCmc - addCmc) <= 1) focusedCuts.set(c.name, c);
        }
        const cutsForAdd = [...focusedCuts.values()].sort((a, b) => {
          const aCmc = Number(eligibleMap.get(a.name)?.cmc || 0);
          const bCmc = Number(eligibleMap.get(b.name)?.cmc || 0);
          const da = Math.abs(aCmc - addCmc);
          const db = Math.abs(bCmc - addCmc);
          if (da !== db) return da - db;
          return (utilityByName.get(a.name) || eligibleMap.get(a.name)?.wr || 50) -
            (utilityByName.get(b.name) || eligibleMap.get(b.name)?.wr || 50);
        });

        for (const cutCandidate of cutsForAdd) {
          if (isTimeUp()) {
            deadlineHit = true;
            break;
          }
          const swap = buildSwap(addCard, cutCandidate);
          if (!swap) continue;
          const { newDeck, newResult } = swap;
          const delta = newResult.score - current.score;
          if (delta > 0.001) {
            if (delta > bestDelta) {
              bestDelta = delta;
              bestSwap = { deck: newDeck, result: newResult };
            }
            positiveCount++;
            if (bestDelta >= HC_BEST_OF_K_STRONG_DELTA) stopSearch = true;
            break;
          }
        }
      }
      if (bestSwap) {
        currentDeck = bestSwap.deck;
        current = bestSwap.result;
        improved = true;
      }
      if (!improved) {
        // Small simulated-annealing window to escape local minima:
        // allow a few mildly negative moves early in the run.
        const annealIters = Math.min(10, hcIterationLimit);
        if (iter < annealIters && sideboard.length > 0 && cutCandidates.length > 0) {
          if (isTimeUp()) {
            deadlineHit = true;
            break;
          }
          const temp = Math.max(0.06, 0.55 * (1 - iter / Math.max(1, annealIters)));
          let accepted = false;
          for (let t = 0; t < 4; t++) {
            if (isTimeUp()) {
              deadlineHit = true;
              break;
            }
            const addCard = sideboard[Math.floor(rng() * sideboard.length)];
            const cutCard = cutCandidates[Math.floor(rng() * cutCandidates.length)];
            const swap = buildSwap(addCard, cutCard);
            if (!swap) continue;
            const delta = swap.newResult.score - current.score;
            if (delta > 0 || Math.exp(delta / Math.max(0.01, temp)) > rng()) {
              currentDeck = swap.newDeck;
              current = swap.newResult;
              accepted = true;
              break;
            }
          }
          if (accepted) continue;
        }

        break;
      }
    }

    if (current.score > bestScore) {
      bestDeck = currentDeck;
      bestScore = current.score;
      bestBreakdown = current.breakdown;
      bestStats = current.stats;
      timeToBestMs = Date.now() - runStartedMs;
    }
    restartsCompleted++;
  }

  const elapsedMs = Date.now() - runStartedMs;
  return {
    deck: bestDeck,
    score: bestScore,
    breakdown: bestBreakdown,
    stats: bestStats,
    telemetry: {
      evalCalls,
      iterationsDone,
      elapsedMs,
      timeToBestMs,
      deadlineHit,
      restartsStarted,
      restartsCompleted,
    },
  };
};

// â”€â”€â”€ Land determination (Karsten-based) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const determineLands = (
  cards: DeckCard[], pool: PoolCard[],
  mainColors: string[], splashColor: string | null,
): DeckCard[] => {
  const spellCount = totalQty(cards);
  const landCount = Math.min(Math.max(TOTAL_DECK_SIZE - spellCount, LANDS_MIN), LANDS_MAX);
  const poolMap = new Map<string, PoolCard>();
  for (const pc of pool) poolMap.set(pc.name, pc);

  const effectiveSplash = hasActiveSplashDemand(cards, poolMap, mainColors, splashColor) ? splashColor : null;
  const allColors = [...mainColors, ...(effectiveSplash ? [effectiveSplash] : [])];
  const pipDemand: Record<string, number> = {};
  const targetSources: Record<string, number> = {};
  const currentSources: Record<string, number> = {};
  const reqSamplesByColor: Record<string, number[]> = {};
  for (const c of allColors) {
    pipDemand[c] = 0;
    targetSources[c] = 0;
    currentSources[c] = 0;
    reqSamplesByColor[c] = [];
  }

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    for (const color of allColors) {
      const requiredPips = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      pipDemand[color] += requiredPips * dc.qty;
      if (requiredPips > 0) {
        const req = karstenRequiredSources(requiredPips, pc.cmc || 0, effectiveSplash === color);
        for (let i = 0; i < dc.qty; i++) reqSamplesByColor[color].push(req);
      }
    }
  }

  // Aggregate Karsten requirements into a robust per-color target:
  // weighted blend of median, upper quartile, and max requirement.
  for (const color of allColors) {
    const samples = reqSamplesByColor[color];
    if (!samples || samples.length === 0) {
      targetSources[color] = 0;
      continue;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    const median = sorted[Math.floor((n - 1) * 0.5)];
    const q75 = sorted[Math.floor((n - 1) * 0.75)];
    const maxReq = sorted[n - 1];
    const blended = median * 0.35 + q75 * 0.5 + maxReq * 0.15;
    targetSources[color] = Math.max(0, Math.min(17, blended));
  }

  // Non-land mana producers as partial sources (weighted by CMC)
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc || isLandType(pc.type) || !pc.isManaProducer) continue;
    const weight = nonLandSourceWeight(pc.cmc);
    for (const color of allColors)
      if (extractColors(pc.producedColours || "").includes(color)) currentSources[color] += dc.qty * weight;
  }

  // Utility lands (duals, fetches)
  const utilityCandidates = pool
    .filter((pc) => isLandType(pc.type) && !BASIC_LAND_NAMES.has(pc.name))
    .map((pc) => {
      const allProduced = extractColors(pc.producedColours || pc.colors || "");
      const produced = allProduced.filter((c) => allColors.includes(c));
      const isFetch = /evolving wilds|terramorphic expanse|fabled passage/i.test(pc.name);
      const hasSplashColor = !!effectiveSplash && produced.includes(effectiveSplash);
      return { pc, produced, isFetch, hasSplashColor, colorCount: new Set(produced).size };
    })
    .filter(({ produced, isFetch, hasSplashColor, colorCount }) => {
      if (isFetch) return true;
      if (produced.length === 0) return false;
      // In 2-color decks, only keep lands that actually fix both colors.
      if (allColors.length <= 2) return colorCount >= 2;
      // In splash decks, allow either real two-color fixing or explicit splash fixing.
      return colorCount >= 2 || hasSplashColor;
    });

  const selectedUtility: typeof utilityCandidates = [];
  const remaining = [...utilityCandidates];
  const utilityLandSources: Record<string, number> = {};
  for (const c of allColors) utilityLandSources[c] = 0;

  while (selectedUtility.length < landCount && remaining.length > 0) {
    const deficits: Record<string, number> = {};
    for (const c of allColors) deficits[c] = Math.max(0, (targetSources[c] || 0) - (currentSources[c] || 0));

    let bestIdx = -1, bestGain = 0;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let gain = 0;
      if (cand.isFetch) { for (const c of allColors) if (deficits[c] > 0) gain++; }
      else { for (const c of cand.produced) gain += Math.min(1, deficits[c] || 0); }
      if (gain > bestGain + 1e-9) { bestGain = gain; bestIdx = i; }
    }
    if (bestIdx < 0 || bestGain <= 0) break;

    const picked = remaining.splice(bestIdx, 1)[0];
    selectedUtility.push(picked);
    if (picked.isFetch) {
      for (const c of allColors) {
        currentSources[c]++;
        utilityLandSources[c]++;
      }
    } else {
      for (const c of picked.produced) {
        currentSources[c]++;
        utilityLandSources[c]++;
      }
    }
  }

  // Allocate basics by exhaustive search over compositions.
  // Objective mixes:
  // 1) Karsten source deficits
  // 2) card-level castability adequacy (on-curve pressure)
  // 3) soft main-color balance regularization
  // 4) splash/basic sanity and early-color land floors
  const basicsToAssign = Math.max(0, landCount - selectedUtility.length);
  const basicsByColor: Record<string, number> = {};
  for (const c of allColors) basicsByColor[c] = 0;

  if (allColors.length > 0 && basicsToAssign > 0) {
    // Strong early-land floors for main colors.
    // We relax only if the floor system is infeasible for the available basics.
    const mainLandFloor: Record<string, number> = {};
    for (const c of mainColors) {
      let earlyDemand = 0;
      for (const dc of cards) {
        const pc = poolMap.get(dc.name);
        if (!pc) continue;
        const pips = countRequiredColorPipsForDeck(pc.cost, c, allColors);
        if (pips <= 0) continue;
        if ((pc.cmc || 0) <= 3) earlyDemand += dc.qty * Math.max(1, pips);
      }
      const floor = earlyDemand > 0 ? Math.max(5, Math.ceil(4 + earlyDemand * 0.45)) : 4;
      mainLandFloor[c] = floor;
    }
    const computeMinBasicsNeeded = (): number => {
      let needed = 0;
      for (const c of mainColors) needed += Math.max(0, (mainLandFloor[c] || 0) - (utilityLandSources[c] || 0));
      return needed;
    };
    while (computeMinBasicsNeeded() > basicsToAssign) {
      const reducible = [...mainColors]
        .filter((c) => (mainLandFloor[c] || 0) > 4)
        .sort((a, b) => (mainLandFloor[b] || 0) - (mainLandFloor[a] || 0));
      if (reducible.length === 0) break;
      mainLandFloor[reducible[0]] -= 1;
    }

    const colors = [...allColors];
    const comp = new Array<number>(colors.length).fill(0);
    let bestObj = Number.POSITIVE_INFINITY;
    let bestComp = [...comp];

    const evaluateComposition = (counts: number[]): number => {
      const basics: Record<string, number> = {};
      for (let i = 0; i < colors.length; i++) basics[colors[i]] = counts[i] || 0;

      const sources: Record<string, number> = {};
      for (const c of colors) sources[c] = (currentSources[c] || 0) + (basics[c] || 0);

      // 1) Karsten deficits by color.
      let deficitPenalty = 0;
      for (const c of colors) {
        const deficit = Math.max(0, (targetSources[c] || 0) - (sources[c] || 0));
        deficitPenalty += deficit * deficit;
      }

      // 2) Card-level castability adequacy (multi-color aware).
      let castabilityPenalty = 0;
      for (const dc of cards) {
        const pc = poolMap.get(dc.name);
        if (!pc) continue;
        let hasRequirement = false;
        let adequacy = 1;
        for (const c of colors) {
          const pips = countRequiredColorPipsForDeck(pc.cost, c, colors);
          if (pips <= 0) continue;
          hasRequirement = true;
          const req = karstenRequiredSources(pips, pc.cmc || 0, effectiveSplash === c);
          const src = sources[c] || 0;
          const colorAdequacy = req > 0 ? clamp(src / req, 0, 1) : 1;
          adequacy *= colorAdequacy;
        }
        if (!hasRequirement) continue;
        const cmc = pc.cmc || 0;
        const cmcWeight = cmc <= 2 ? 1.7 : cmc === 3 ? 1.3 : cmc === 4 ? 1.0 : 0.7;
        const cardPenalty = (1 - adequacy) * (1 - adequacy) * cmcWeight;
        castabilityPenalty += cardPenalty * dc.qty;
      }

      // 3) Main color balance regularization (soft, demand-aware).
      let balancePenalty = 0;
      if (mainColors.length >= 2) {
        const demandTotal = mainColors.reduce((s, c) => s + (pipDemand[c] || 0), 0);
        const sourceTotal = mainColors.reduce((s, c) => s + (sources[c] || 0), 0);
        if (demandTotal > 0 && sourceTotal > 0) {
          for (const c of mainColors) {
            const demandShare = (pipDemand[c] || 0) / demandTotal;
            const sourceShare = (sources[c] || 0) / sourceTotal;
            balancePenalty += Math.pow(sourceShare - demandShare, 2);
          }
        }
        for (let i = 0; i < mainColors.length; i++) {
          for (let j = i + 1; j < mainColors.length; j++) {
            const diff = Math.abs((sources[mainColors[i]] || 0) - (sources[mainColors[j]] || 0));
            if (diff > 3) balancePenalty += Math.pow(diff - 3, 2) * 0.35;
          }
        }
      }

      // 4) Splash/basic sanity + early-color land floors (land-only).
      let splashPenalty = 0;
      if (effectiveSplash) {
        const splashLandSources = (utilityLandSources[effectiveSplash] || 0) + (basics[effectiveSplash] || 0);
        if (splashLandSources <= 0) splashPenalty += 1.2;
      }

      // Hard-ish floor for early main-color access from LANDS only.
      // If unmet, the composition is heavily penalized.
      let earlyFloorPenalty = 0;
      for (const c of mainColors) {
        const minLandSources = mainLandFloor[c] || 0;
        if (minLandSources <= 0) continue;
        const landSources = (utilityLandSources[c] || 0) + (basics[c] || 0);
        const deficit = Math.max(0, minLandSources - landSources);
        earlyFloorPenalty += deficit * deficit * 40;
      }

      return (
        deficitPenalty +
        castabilityPenalty * 2.6 +
        balancePenalty * 6 +
        splashPenalty +
        earlyFloorPenalty
      );
    };

    const search = (idx: number, remainingCount: number): void => {
      if (idx === colors.length - 1) {
        comp[idx] = remainingCount;
        const obj = evaluateComposition(comp);
        if (obj < bestObj - 1e-9) {
          bestObj = obj;
          bestComp = [...comp];
        }
        return;
      }
      for (let x = 0; x <= remainingCount; x++) {
        comp[idx] = x;
        search(idx + 1, remainingCount - x);
      }
    };

    search(0, basicsToAssign);
    for (let i = 0; i < colors.length; i++) basicsByColor[colors[i]] = bestComp[i] || 0;
  }

  const lands: DeckCard[] = [];
  for (const { pc } of selectedUtility) lands.push({ name: pc.name, qty: 1 });
  for (const c of allColors) {
    const qty = basicsByColor[c] || 0;
    if (COLOR_TO_BASIC[c] && qty > 0) lands.push({ name: COLOR_TO_BASIC[c], qty });
  }
  return lands;
};

// â”€â”€â”€ Match skeleton for color pair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const findBestSkeleton = (colorCode: string, skeletons: Skeleton[]): Skeleton | null => {
  const target = [...colorCode].sort().join("");
  const exact = skeletons.filter((s) => extractColors(s.archetype_name).sort().join("") === target);
  if (exact.length === 0) return null;
  return exact.sort((a, b) => {
    const aAlt = a.is_alternative ? 1 : 0;
    const bAlt = b.is_alternative ? 1 : 0;
    if (aAlt !== bAlt) return aAlt - bAlt;
    return (b.sample_size || 0) - (a.sample_size || 0);
  })[0];
};

// â”€â”€â”€ Deduplication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const deckSignature = (cards: DeckCard[]): string =>
  [...cards].sort((a, b) => a.name.localeCompare(b.name)).map((c) => `${c.name}:${c.qty}`).join("|");

const toQtyMap = (cards: DeckCard[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.name, (m.get(c.name) || 0) + c.qty);
  return m;
};

const multisetJaccard = (a: DeckCard[], b: DeckCard[]): number => {
  const ma = toQtyMap(a);
  const mb = toQtyMap(b);
  const keys = new Set<string>([...ma.keys(), ...mb.keys()]);
  let inter = 0;
  let uni = 0;
  for (const k of keys) {
    const qa = ma.get(k) || 0;
    const qb = mb.get(k) || 0;
    inter += Math.min(qa, qb);
    uni += Math.max(qa, qb);
  }
  if (uni <= 0) return 0;
  return inter / uni;
};

const isInColorPlan = (
  pc: PoolCard,
  mainColors: string[],
  splashColor: string | null,
): boolean => {
  const allowed = new Set<string>([...mainColors, ...(splashColor ? [splashColor] : [])]);
  const cardColors = extractColors(pc.colors);
  if (cardColors.length === 0) return true;
  return cardColors.every((c) => allowed.has(c));
};


// Main optimizer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const optimizePool = (
  poolCards: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  skeletons: Skeleton[],
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  curveComponentScales?: Partial<CurveComponentScales> | null,
  debug = false,
  debugLimit = 20,
  searchProfile: SearchProfile = DEFAULT_SEARCH_PROFILE,
  hcRestarts = NUM_RESTARTS,
  hcIterationLimit = ITERATION_LIMIT,
  seed = DEFAULT_OPTIMIZER_SEED,
  maxOptimizeMs = DEFAULT_MAX_OPTIMIZE_MS,
): SealedOptimizerResult => {
  const activeSearchProfile = normalizeSearchProfile(searchProfile);
  const budgetMs = Math.max(1_000, Math.min(10_000, Number(maxOptimizeMs) || DEFAULT_MAX_OPTIMIZE_MS));
  const optimizeDeadline = Date.now() + budgetMs;
  const isBudgetExhausted = () => Date.now() >= optimizeDeadline;
  let budgetExhausted = false;
  const results: {
    score: number; archetype: string; mainColors: string[];
    splashColor: string | null; deck: DeckCard[];
    breakdown: ScoreBreakdown; stats: DeckStats; signature: string;
  }[] = [];
  const debugPairDiagnostics: {
    stage: "pre_rank" | "main_eval" | "splash_eval";
    archetype: string;
    support?: number;
    eligibleCount?: number;
    score?: number;
    consistencyScore?: number;
    removalCount?: number;
    reason: string;
  }[] = [];
  const hcTelemetryRuns: HcTelemetry[] = [];

  const mainColorSets = getMainColorSetsForProfile(activeSearchProfile);
  const preRankedMainSets = [...mainColorSets]
    .map((mainColors) => {
      const eligible = filterEligibleCards(poolCards, mainColors, null).filter((pc) => !isLandType(pc.type));
      if (eligible.length === 0) return { mainColors, support: -9999 };
      const supportCtx = buildSupportContext(eligible);

      const utilities: number[] = [];
      for (const pc of eligible) {
        const util = getCardUtilityScore(
          pc,
          null,
          formatMean,
          0,
          activeSearchProfile,
          mainColors,
          null,
          supportCtx,
        );
        for (let i = 0; i < pc.qty; i++) utilities.push(util);
      }
      utilities.sort((a, b) => b - a);
      const topPlayable = utilities.slice(0, DEFAULT_SPELL_SLOTS);
      const baseScore = topPlayable.reduce((sum, v) => sum + v, 0);
      return { mainColors, support: baseScore };
    })
    .sort((a, b) => b.support - a.support);

  const rankedMainSets = preRankedMainSets.slice(0, MAX_MAIN_PAIRS).map((item) => item.mainColors);
  if (debug) {
    const selectedSet = new Set(rankedMainSets.map((p) => p.join("")));
    for (const item of preRankedMainSets) {
      const code = item.mainColors.join("");
      const reason =
        item.support <= -9999
          ? "no_eligible_cards_for_pair"
          : selectedSet.has(code)
            ? "selected_for_main_eval"
            : "excluded_pre_rank_cutoff";
      debugPairDiagnostics.push({
        stage: "pre_rank",
        archetype: code,
        support: Number(item.support.toFixed(2)),
        reason,
      });
    }
  }

  // Try each pair without splash
  const acceptedMainResults: {
    score: number; archetype: string; mainColors: string[];
    splashColor: string | null; deck: DeckCard[];
    breakdown: ScoreBreakdown; stats: DeckStats; signature: string;
  }[] = [];
  for (const mainColors of rankedMainSets) {
    if (isBudgetExhausted()) {
      budgetExhausted = true;
      if (debug) {
        debugPairDiagnostics.push({
          stage: "main_eval",
          archetype: mainColors.join(""),
          reason: "budget_exhausted_before_pair",
        });
      }
      break;
    }
    const pairCode = mainColors.join("");
    const skeleton = findBestSkeleton(mainColors.join(""), skeletons);
    const eligible = filterEligibleCards(poolCards, mainColors, null).filter((pc) => !isLandType(pc.type));
    if (eligible.length < DEFAULT_SPELL_SLOTS * 0.6) {
      if (debug) {
        debugPairDiagnostics.push({
          stage: "main_eval",
          archetype: pairCode,
          eligibleCount: eligible.length,
          reason: "insufficient_eligible_cards",
        });
      }
      continue;
    }

    for (let attempt = 0; attempt < CANDIDATES_PER_MAIN_ARCHETYPE; attempt++) {
      if (isBudgetExhausted()) {
        budgetExhausted = true;
        if (debug) {
          debugPairDiagnostics.push({
            stage: "main_eval",
            archetype: pairCode,
            eligibleCount: eligible.length,
            reason: `budget_exhausted_a${attempt + 1}`,
          });
        }
        break;
      }
      const attemptRng = createAttemptRng(seed, pairCode, attempt);
      const result = hillClimbOptimize(
        eligible,
        pairMap,
        mainColors,
        null,
        skeleton,
        DEFAULT_SPELL_SLOTS,
        scoreWeights,
        formatMean,
        activeSearchProfile,
        hcRestarts,
        hcIterationLimit,
        attemptRng,
        optimizeDeadline,
        curveComponentScales,
      );
      if (debug) hcTelemetryRuns.push(result.telemetry);
      if (result.deck.length <= 0) {
        if (debug) {
          debugPairDiagnostics.push({
            stage: "main_eval",
            archetype: pairCode,
            eligibleCount: eligible.length,
            reason: `empty_deck_after_optimize_a${attempt + 1}`,
          });
        }
        continue;
      }
      if (result.breakdown.consistencyScore < 20) {
        if (debug) {
          debugPairDiagnostics.push({
            stage: "main_eval",
            archetype: pairCode,
            eligibleCount: eligible.length,
            score: Number(result.score.toFixed(2)),
            consistencyScore: Number(result.breakdown.consistencyScore.toFixed(2)),
            removalCount: result.stats.removalCount,
            reason: `failed_consistency_gate_a${attempt + 1}`,
          });
        }
        continue;
      }
      const accepted = {
          score: result.score, archetype: mainColors.join(""), mainColors: [...mainColors],
          splashColor: null, deck: result.deck, breakdown: result.breakdown,
          stats: result.stats, signature: deckSignature(result.deck),
        };
      results.push(accepted);
      acceptedMainResults.push(accepted);
      if (debug) {
        debugPairDiagnostics.push({
          stage: "main_eval",
          archetype: pairCode,
          eligibleCount: eligible.length,
          score: Number(result.score.toFixed(2)),
          consistencyScore: Number(result.breakdown.consistencyScore.toFixed(2)),
          removalCount: result.stats.removalCount,
          reason: `accepted_main_a${attempt + 1}`,
        });
      }
    }
    if (budgetExhausted) break;
  }

  // Try splash for top base pairs
  acceptedMainResults.sort((a, b) => b.score - a.score);
  const topPairs = acceptedMainResults.slice(0, MAX_SPLASH_BASES);
  if (debug) {
    const topSet = new Set(topPairs.map((r) => r.mainColors.join("")));
    for (const base of acceptedMainResults) {
      const code = base.mainColors.join("");
      if (!topSet.has(code)) {
        debugPairDiagnostics.push({
          stage: "splash_eval",
          archetype: code,
          score: Number(base.score.toFixed(2)),
          consistencyScore: Number(base.breakdown.consistencyScore.toFixed(2)),
          removalCount: base.stats.removalCount,
          reason: "base_not_in_top_splash_bases",
        });
      }
    }
  }
  for (const base of topPairs) {
    if (isBudgetExhausted()) {
      budgetExhausted = true;
      if (debug) {
        debugPairDiagnostics.push({
          stage: "splash_eval",
          archetype: base.mainColors.join(""),
          reason: "budget_exhausted_before_base_splash",
        });
      }
      break;
    }
    const skeleton = findBestSkeleton(base.mainColors.join(""), skeletons);
    for (const splash of COLOR_ORDER) {
      if (isBudgetExhausted()) {
        budgetExhausted = true;
        if (debug) {
          debugPairDiagnostics.push({
            stage: "splash_eval",
            archetype: base.mainColors.join("") + splash.toLowerCase(),
            reason: "budget_exhausted_before_splash",
          });
        }
        break;
      }
      if (base.mainColors.includes(splash)) continue;
      const eligible = filterEligibleCards(poolCards, base.mainColors, splash).filter((pc) => !isLandType(pc.type));
      const splashCode = base.mainColors.join("") + splash.toLowerCase();
      if (eligible.length < DEFAULT_SPELL_SLOTS * 0.6) {
        if (debug) {
          debugPairDiagnostics.push({
            stage: "splash_eval",
            archetype: splashCode,
            eligibleCount: eligible.length,
            reason: "insufficient_eligible_cards",
          });
        }
        continue;
      }

      const trioCode = [...base.mainColors, splash]
        .sort((a, b) => COLOR_ORDER.indexOf(a as ManaColor) - COLOR_ORDER.indexOf(b as ManaColor))
        .join("");
      const trioSkeleton = findBestSkeleton(trioCode, skeletons);

      for (let attempt = 0; attempt < CANDIDATES_PER_SPLASH_ARCHETYPE; attempt++) {
        if (isBudgetExhausted()) {
          budgetExhausted = true;
          if (debug) {
            debugPairDiagnostics.push({
              stage: "splash_eval",
              archetype: splashCode,
              eligibleCount: eligible.length,
              reason: `budget_exhausted_a${attempt + 1}`,
            });
          }
          break;
        }
        const attemptRng = createAttemptRng(seed, splashCode, attempt);
        const result = hillClimbOptimize(
          eligible,
          pairMap,
          base.mainColors,
          splash,
          trioSkeleton || skeleton,
          DEFAULT_SPELL_SLOTS,
          scoreWeights,
          formatMean,
          activeSearchProfile,
          hcRestarts,
          hcIterationLimit,
          attemptRng,
          optimizeDeadline,
          curveComponentScales,
        );
        if (debug) hcTelemetryRuns.push(result.telemetry);
        if (result.deck.length <= 0) {
          if (debug) {
            debugPairDiagnostics.push({
              stage: "splash_eval",
              archetype: splashCode,
              eligibleCount: eligible.length,
              reason: `empty_deck_after_optimize_a${attempt + 1}`,
            });
          }
          continue;
        }
        if (result.breakdown.consistencyScore < 20) {
          if (debug) {
            debugPairDiagnostics.push({
              stage: "splash_eval",
              archetype: splashCode,
              eligibleCount: eligible.length,
              score: Number(result.score.toFixed(2)),
              consistencyScore: Number(result.breakdown.consistencyScore.toFixed(2)),
              removalCount: result.stats.removalCount,
              reason: `failed_consistency_gate_a${attempt + 1}`,
            });
          }
          continue;
        }
        results.push({
            score: result.score, archetype: base.mainColors.join("") + splash.toLowerCase(),
            mainColors: [...base.mainColors], splashColor: splash,
            deck: result.deck, breakdown: result.breakdown,
            stats: result.stats, signature: deckSignature(result.deck),
          });
        if (debug) {
          debugPairDiagnostics.push({
            stage: "splash_eval",
            archetype: splashCode,
            eligibleCount: eligible.length,
            score: Number(result.score.toFixed(2)),
            consistencyScore: Number(result.breakdown.consistencyScore.toFixed(2)),
            removalCount: result.stats.removalCount,
            reason: `accepted_splash_a${attempt + 1}`,
          });
        }
      }
      if (budgetExhausted) break;
    }
    if (budgetExhausted) break;
  }

  // Sort by THE score, dedup, take top 3
  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    if (seen.has(r.signature)) return false;
    seen.add(r.signature);
    return true;
  });

  const poolMap = new Map<string, PoolCard>();
  for (const pc of poolCards) poolMap.set(pc.name, pc);
  const resolved = unique.map((r) => {
    const activeSplash = hasActiveSplashDemand(r.deck, poolMap, r.mainColors, r.splashColor)
      ? r.splashColor
      : null;
    const archetype = activeSplash
      ? r.mainColors.join("") + activeSplash.toLowerCase()
      : r.mainColors.join("");
    return { ...r, activeSplash, resolvedArchetype: archetype };
  });

  // Keep top-K candidates per resolved archetype label BEFORE re-scoring.
  // This avoids freezing each archetype to a single local optimum too early.
  const perArchetypePreRescore = new Map<string, typeof resolved>();
  for (const r of resolved) {
    const arr = perArchetypePreRescore.get(r.resolvedArchetype) || [];
    if (arr.length < TOPK_PER_ARCHETYPE_PRE_RESCORE) {
      arr.push(r);
      perArchetypePreRescore.set(r.resolvedArchetype, arr);
    }
  }
  const candidatesForRescore = [...perArchetypePreRescore.values()].flat();

  // Re-score ALL candidates with actual optimized land allocation.
  // During hill-climbing, computeManaPenalty used estimateSourcesFromDeck (proportional
  // heuristic over 17 generic lands). Now we run determineLands for each candidate and
  // recompute manaPenalty / consistencyScore / baseScore / score with real sources.
  const rescored = candidatesForRescore.map((r) => {
    const lands = determineLands(r.deck, poolCards, r.mainColors, r.activeSplash);
    const actualSources = computeSourcesFromLands(lands, r.deck, poolMap, r.mainColors, r.activeSplash);
    const manaPenalty = computeManaPenalty(
      r.deck,
      poolMap,
      r.mainColors,
      r.activeSplash,
      actualSources,
      lands.reduce((sum, l) => sum + l.qty, 0),
    );
    const consistencyScore = normalizeConsistencyScore(manaPenalty);

    // Collect mana debug info (stored on candidate, included in debugCandidates)
    let manaDebug: string | undefined;
    if (debug) {
      const allC = [...r.mainColors, ...(r.activeSplash ? [r.activeSplash] : [])];
      const dbgNeeded: Record<string, { needed: number; card: string; pips: number; cmc: number }> = {};
      for (const c of allC) dbgNeeded[c] = { needed: 0, card: "", pips: 0, cmc: 0 };
      for (const dc of r.deck) {
        const pc = poolMap.get(dc.name);
        if (!pc) continue;
        for (const color of allC) {
          const pips = countRequiredColorPipsForDeck(pc.cost, color, allC);
          if (pips > 0) {
            const req = karstenRequiredSources(pips, pc.cmc || 0, r.activeSplash === color);
            if (req > dbgNeeded[color].needed) {
              dbgNeeded[color] = { needed: req, card: dc.name, pips, cmc: pc.cmc || 0 };
            }
          }
        }
      }
      manaDebug = allC.map((c) => {
        const n = dbgNeeded[c];
        const src = actualSources[c] || 0;
        const def = Math.max(0, n.needed - src);
        return `${c}:need${n.needed}(${n.card} ${n.pips}p@${n.cmc})have${src.toFixed(1)} def${def.toFixed(1)}`;
      }).join(" | ");
    }
    const baseScore = computeCompositeScore(
      r.breakdown.wrNormalized,
      r.breakdown.synergyNormalized,
      consistencyScore,
      r.breakdown.curveScore,
      scoreWeights,
    );
    const score = baseScore;
    return {
      ...r,
      lands,
      score,
      breakdown: { ...r.breakdown, manaPenalty, consistencyScore, qualityScore: baseScore, totalAdjustment: 0 },
      manaDebug,
    };
  });

  // Keep top-K rescored variants per archetype until final selection.
  // This preserves intra-archetype alternatives (e.g. WG variants with/without
  // specific pip-heavy cards) instead of collapsing too early to one local optimum.
  const rescoredGrouped = new Map<string, typeof rescored>();
  for (const r of rescored) {
    const arr = rescoredGrouped.get(r.resolvedArchetype) || [];
    arr.push(r);
    rescoredGrouped.set(r.resolvedArchetype, arr);
  }
  const topPerArchetype = [...rescoredGrouped.values()]
    .flatMap((arr) => arr.sort((a, b) => b.score - a.score).slice(0, TOPK_PER_ARCHETYPE_FINAL))
    .sort((a, b) => b.score - a.score);

  const uniqueCandidatePool: typeof topPerArchetype = [];
  const seenCandidateSigs = new Set<string>();
  for (const c of topPerArchetype) {
    if (seenCandidateSigs.has(c.signature)) continue;
    seenCandidateSigs.add(c.signature);
    uniqueCandidatePool.push(c);
  }

  // Final diversified top-3 (MMR-style) over full candidate pool.
  // Prefer distinct archetypes first, then fallback to best remaining MMR.
  const selected: typeof uniqueCandidatePool = [];
  const remaining = [...uniqueCandidatePool];
  const usedArchetypes = new Set<string>();

  while (selected.length < FINAL_BUILD_COUNT && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      if (usedArchetypes.has(cand.resolvedArchetype)) continue;
      let maxSim = 0;
      for (const pick of selected) {
        maxSim = Math.max(maxSim, multisetJaccard(cand.deck, pick.deck));
      }
      const mmrScore = cand.score - FINAL_DIVERSITY_LAMBDA * maxSim;
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    usedArchetypes.add(picked.resolvedArchetype);
  }

  while (selected.length < FINAL_BUILD_COUNT && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const pick of selected) {
        maxSim = Math.max(maxSim, multisetJaccard(cand.deck, pick.deck));
      }
      const mmrScore = cand.score - FINAL_DIVERSITY_LAMBDA * maxSim;
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  const top3 = selected;

  // Final local polish (single improving 1-for-1 swap, in-color only).
  // Purpose: remove weak filler cards missed by HC neighborhood truncation,
  // without changing global scoring or search profile behavior.
  const polishFinalSingleSwap = (cand: typeof top3[number]) => {
    const initialSplash = hasActiveSplashDemand(cand.deck, poolMap, cand.mainColors, cand.activeSplash)
      ? cand.activeSplash
      : null;
    const initialTrioCode = initialSplash
      ? [...cand.mainColors, initialSplash].join("")
      : cand.mainColors.join("");
    const initialSkeleton = findBestSkeleton(initialTrioCode, skeletons) || findBestSkeleton(cand.mainColors.join(""), skeletons);
    const scoringEligible = filterEligibleCards(poolCards, cand.mainColors, initialSplash)
      .filter((pc) => !isLandType(pc.type));
    const currentLight = calculateDeckScore(
      cand.deck,
      scoringEligible,
      pairMap,
      cand.mainColors,
      initialSplash,
      initialSkeleton,
      scoreWeights,
      formatMean,
      curveComponentScales,
    );

    const deckQty = new Map<string, number>();
    for (const dc of cand.deck) deckQty.set(dc.name, (deckQty.get(dc.name) || 0) + dc.qty);

    const candidatePool = filterEligibleCards(poolCards, cand.mainColors, initialSplash)
      .filter((pc) => !isLandType(pc.type))
      .filter((pc) => isInColorPlan(pc, cand.mainColors, initialSplash));
    if (candidatePool.length === 0) return cand;

    const addCandidates = candidatePool
      .filter((pc) => (deckQty.get(pc.name) || 0) < pc.qty)
      .sort((a, b) => (b.wr - a.wr))
      .slice(0, FINAL_LOCAL_SWAP_MAX_ADDS);
    if (addCandidates.length === 0) return cand;

    const cutCandidates = [...cand.deck].sort((a, b) => {
      const awr = poolMap.get(a.name)?.wr || 50;
      const bwr = poolMap.get(b.name)?.wr || 50;
      return awr - bwr;
    });
    if (cutCandidates.length === 0) return cand;

    let bestDelta = 0.001;
    let best: {
      deck: DeckCard[];
      score: number;
      breakdown: ScoreBreakdown;
      stats: DeckStats;
      lands: DeckCard[];
      activeSplash: string | null;
      resolvedArchetype: string;
      signature: string;
    } | null = null;
    let evals = 0;

    for (const add of addCandidates) {
      if (evals >= FINAL_LOCAL_SWAP_MAX_EVALS) break;
      for (const cut of cutCandidates) {
        if (evals >= FINAL_LOCAL_SWAP_MAX_EVALS) break;
        if (add.name === cut.name) continue;
        evals++;

        const di = cand.deck.findIndex((c) => c.name === cut.name);
        if (di < 0) continue;
        const newDeck = cand.deck
          .map((c, i) => i === di ? (c.qty > 1 ? { name: c.name, qty: c.qty - 1 } : null) : c)
          .filter((c): c is DeckCard => c != null && c.qty > 0);
        const ei = newDeck.findIndex((c) => c.name === add.name);
        if (ei >= 0) newDeck[ei] = { name: add.name, qty: newDeck[ei].qty + 1 };
        else newDeck.push({ name: add.name, qty: 1 });

        const trialSplash = hasActiveSplashDemand(newDeck, poolMap, cand.mainColors, initialSplash)
          ? initialSplash
          : null;
        const trioCode = trialSplash
          ? [...cand.mainColors, trialSplash].join("")
          : cand.mainColors.join("");
        const trialSkeleton = findBestSkeleton(trioCode, skeletons) || findBestSkeleton(cand.mainColors.join(""), skeletons);
        const trialEligible = filterEligibleCards(poolCards, cand.mainColors, trialSplash).filter((pc) => !isLandType(pc.type));
        const trialLight = calculateDeckScore(
          newDeck,
          trialEligible,
          pairMap,
          cand.mainColors,
          trialSplash,
          trialSkeleton,
          scoreWeights,
          formatMean,
          curveComponentScales,
        );
        const delta = trialLight.score - currentLight.score;
        if (delta > bestDelta) {
          const trial = scoreDeckWithResolvedLands(
            newDeck,
            poolCards,
            pairMap,
            cand.mainColors,
            trialSplash,
            trialSkeleton,
            scoreWeights,
            formatMean,
            curveComponentScales,
          );
          bestDelta = delta;
          best = {
            deck: newDeck,
            score: trial.score,
            breakdown: trial.breakdown,
            stats: trial.stats,
            lands: trial.lands,
            activeSplash: trialSplash,
            resolvedArchetype: trialSplash
              ? cand.mainColors.join("") + trialSplash.toLowerCase()
              : cand.mainColors.join(""),
            signature: deckSignature(newDeck),
          };
        }
      }
    }

    if (!best) return cand;
    return {
      ...cand,
      deck: best.deck,
      score: best.score,
      breakdown: best.breakdown,
      stats: best.stats,
      lands: best.lands,
      activeSplash: best.activeSplash,
      resolvedArchetype: best.resolvedArchetype,
      signature: best.signature,
    };
  };

  const polishedTop3 = top3.map(polishFinalSingleSwap);

  // Post-processing: compute display metadata
  const builds: SealedDeckResult[] = polishedTop3.map((r, idx) => ({
    rank: idx + 1,
    score: Number(r.score.toFixed(2)),
    archetype: r.resolvedArchetype,
    mainColors: r.mainColors,
    splashColor: r.activeSplash,
    cards: r.deck,
    lands: r.lands,
    stats: {
      ...r.stats,
      avgCmc: Number(r.stats.avgCmc.toFixed(2)),
      totalCards: totalQty(r.deck) + totalQty(r.lands),
      skeletonSimilarity: Number(r.stats.skeletonSimilarity.toFixed(3)),
    },
    scoreBreakdown: {
      wrScore: Number(r.breakdown.wrScore.toFixed(2)),
      synergyScore: Number(r.breakdown.synergyScore.toFixed(4)),
      wrNormalized: Number(r.breakdown.wrNormalized.toFixed(2)),
      synergyBaseNormalized: Number(r.breakdown.synergyBaseNormalized.toFixed(2)),
      dependencyAxisScale: Number(r.breakdown.dependencyAxisScale.toFixed(4)),
      dependencyAxisDelta: Number(r.breakdown.dependencyAxisDelta.toFixed(2)),
      synergyNormalized: Number(r.breakdown.synergyNormalized.toFixed(2)),
      qualityScore: Number(r.breakdown.qualityScore.toFixed(2)),
      powerWeightedContribution: Number(r.breakdown.powerWeightedContribution.toFixed(2)),
      synergyWeightedContribution: Number(r.breakdown.synergyWeightedContribution.toFixed(2)),
      consistencyWeightedContribution: Number(r.breakdown.consistencyWeightedContribution.toFixed(2)),
      curveWeightedContribution: Number(r.breakdown.curveWeightedContribution.toFixed(2)),
      consistencyScore: Number(r.breakdown.consistencyScore.toFixed(2)),
      curveBaseScore: Number(r.breakdown.curveBaseScore.toFixed(2)),
      removalAxisScale: Number(r.breakdown.removalAxisScale.toFixed(4)),
      removalAxisDelta: Number(r.breakdown.removalAxisDelta.toFixed(2)),
      curveScore: Number(r.breakdown.curveScore.toFixed(2)),
      skeletonSimilarity: Number(r.breakdown.skeletonSimilarity.toFixed(3)),
      creatureTarget: Number(r.breakdown.creatureTarget.toFixed(2)),
      curvePenalty: Number(r.breakdown.curvePenalty.toFixed(4)),
      curveTopHeavyScale: Number(r.breakdown.curveTopHeavyScale.toFixed(4)),
      curveSkeletonScale: Number(r.breakdown.curveSkeletonScale.toFixed(4)),
      curveEarlyCreatureScale: Number(r.breakdown.curveEarlyCreatureScale.toFixed(4)),
      curveCreatureCorridorScale: Number(r.breakdown.curveCreatureCorridorScale.toFixed(4)),
      curveTopHeavyPenalty: Number(r.breakdown.curveTopHeavyPenalty.toFixed(4)),
      curveSkeletonPenalty: Number(r.breakdown.curveSkeletonPenalty.toFixed(4)),
      curveEarlyCreaturePenalty: Number(r.breakdown.curveEarlyCreaturePenalty.toFixed(4)),
      curveCreatureCorridorPenalty: Number(r.breakdown.curveCreatureCorridorPenalty.toFixed(4)),
      manaPenalty: Number(r.breakdown.manaPenalty.toFixed(4)),
      dependencyPenalty: Number(r.breakdown.dependencyPenalty.toFixed(4)),
      consistencyAdjustment: Number(r.breakdown.consistencyAdjustment.toFixed(2)),
      curveAdjustment: Number(r.breakdown.curveAdjustment.toFixed(2)),
      skeletonAdjustment: Number(r.breakdown.skeletonAdjustment.toFixed(2)),
      creatureAdjustment: Number(r.breakdown.creatureAdjustment.toFixed(2)),
      removalAdjustment: Number(r.breakdown.removalAdjustment.toFixed(2)),
      dependencyAdjustment: Number(r.breakdown.dependencyAdjustment.toFixed(2)),
      totalAdjustment: Number(r.breakdown.totalAdjustment.toFixed(2)),
    },
  }));

  const debugHcSummary = (() => {
    if (!debug || hcTelemetryRuns.length === 0) return undefined;
    const runs = hcTelemetryRuns.length;
    const sum = hcTelemetryRuns.reduce(
      (acc, t) => {
        acc.evalCalls += t.evalCalls;
        acc.iterationsDone += t.iterationsDone;
        acc.elapsedMs += t.elapsedMs;
        acc.timeToBestMs += t.timeToBestMs;
        acc.deadlineHits += t.deadlineHit ? 1 : 0;
        return acc;
      },
      { evalCalls: 0, iterationsDone: 0, elapsedMs: 0, timeToBestMs: 0, deadlineHits: 0 },
    );
    return {
      runs,
      avgEvalCalls: Number((sum.evalCalls / runs).toFixed(2)),
      avgIterationsDone: Number((sum.iterationsDone / runs).toFixed(2)),
      avgElapsedMs: Number((sum.elapsedMs / runs).toFixed(2)),
      avgTimeToBestMs: Number((sum.timeToBestMs / runs).toFixed(2)),
      deadlineHitRate: Number(((sum.deadlineHits * 100) / runs).toFixed(2)),
    };
  })();

  return {
    setCode: "",
    format: "",
    builds,
    poolSize: poolCards.reduce((s, pc) => s + pc.qty, 0),
    weightsApplied: { ...scoreWeights },
    debugPairDiagnostics: debug
      ? debugPairDiagnostics.slice(0, Math.max(10, Math.min(200, debugLimit * 10)))
      : undefined,
    debugCandidates: debug
      ? rescored.slice(0, Math.max(1, Math.min(50, debugLimit))).map((r) => ({
          archetype: r.resolvedArchetype,
          score: Number(r.score.toFixed(2)),
          qualityScore: Number(r.breakdown.qualityScore.toFixed(2)),
          totalAdjustment: Number(r.breakdown.totalAdjustment.toFixed(2)),
          consistencyScore: Number(r.breakdown.consistencyScore.toFixed(2)),
          curveScore: Number(r.breakdown.curveScore.toFixed(2)),
          creatureCount: r.stats.creatureCount,
          removalCount: r.stats.removalCount,
          manaPenalty: Number(r.breakdown.manaPenalty.toFixed(4)),
          curvePenalty: Number(r.breakdown.curvePenalty.toFixed(4)),
          dependencyPenalty: Number(r.breakdown.dependencyPenalty.toFixed(4)),
          manaDebug: r.manaDebug,
        }))
      : undefined,
    debugHcSummary,
  };
};




