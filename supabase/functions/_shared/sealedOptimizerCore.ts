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
};

export type DeckCard = { name: string; qty: number };

export type ScoreBreakdown = {
  wrScore: number;
  synergyScore: number;
  wrNormalized: number;
  synergyNormalized: number;
  qualityScore: number;
  consistencyScore: number;
  curveScore: number;
  skeletonSimilarity: number;
  creatureTarget: number;
  curvePenalty: number;
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

export const NUM_RESTARTS = 2;
export const ITERATION_LIMIT = 35;
const DEFAULT_SPELL_SLOTS = 23;
const MAX_MAIN_PAIRS = 10;
const MAX_SPLASH_BASES = 4;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  power: 2, consistency: 1, curve: 1, synergy: 1,
};

const DEFAULT_OPTIMIZER_SEED = 1337;

const createSeededRng = (seed: number): (() => number) => {
  let t = (Number.isFinite(seed) ? Math.trunc(seed) : DEFAULT_OPTIMIZER_SEED) >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

export const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
type ManaColor = (typeof COLOR_ORDER)[number];
const COLOR_SET = new Set<string>(COLOR_ORDER);

const BASIC_LAND_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const isLandType = (t: string | null | undefined): boolean => (t || "").includes("Land");
const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest",
};

const PAIRS: string[][] = [];
for (let i = 0; i < COLOR_ORDER.length; i++)
  for (let j = i + 1; j < COLOR_ORDER.length; j++)
    PAIRS.push([COLOR_ORDER[i], COLOR_ORDER[j]]);

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
  return parsedPool.map(({ name, qty }) => {
    const meta = metaMap.get(name);
    const type = meta?.card_type || "";
    return {
      name, qty,
      wr: wrMap.get(name) ?? 50,
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
  cardNames: string[], pairMap: Record<string, Record<string, number>>,
): number => {
  const n = cardNames.length;
  const maxPairs = (n * (n - 1)) / 2;
  if (maxPairs <= 0) return 0;

  let total = 0;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = pairMap[cardNames[i]]?.[cardNames[j]];
      if (s != null) { total += s; counted++; }
    }
  }
  if (counted === 0) return 0;

  const avg = total / counted;
  const coverage = counted / maxPairs;
  return avg * coverage * SYNERGY_WEIGHT;
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

const karstenRequiredSources = (pips: number, cmc: number, isSplash: boolean): number => {
  if (isSplash) return cmc >= 6 ? 3 : cmc >= 4 ? 4 : 6;
  if (pips >= 3) return cmc <= 4 ? 16 : 15;
  if (pips === 2) return cmc <= 3 ? 14 : cmc <= 4 ? 13 : 12;
  return cmc <= 2 ? 10 : cmc <= 3 ? 9 : 8;
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
  for (const c of allColors) sources[c] = (demand[c] / totalDemand) * 17;
  if (splashColor) sources[splashColor] = Math.min(4, Math.max(3, sources[splashColor]));

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

const computeManaPenalty = (
  cards: DeckCard[], poolMap: Map<string, PoolCard>,
  mainColors: string[], splashColor: string | null,
): number => {
  const allColors = [...mainColors, ...(splashColor ? [splashColor] : [])];
  const needed: Record<string, number> = {};
  for (const c of allColors) needed[c] = 0;

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    for (const color of allColors) {
      const pips = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      if (pips > 0)
        needed[color] = Math.max(needed[color], karstenRequiredSources(pips, pc.cmc || 0, splashColor === color));
    }
  }

  const estimated = estimateSourcesFromDeck(cards, poolMap, mainColors, splashColor);
  let penalty = 0;
  for (const color of allColors) {
    const deficit = (needed[color] || 0) - (estimated[color] || 0);
    if (deficit > 0) penalty += deficit * 0.012;
  }

  if (splashColor) {
    for (const dc of cards) {
      const pc = poolMap.get(dc.name);
      if (!pc) continue;
      const splashPips = countRequiredColorPipsForDeck(pc.cost, splashColor, allColors);
      if (splashPips > 0 && pc.cmc <= 3) penalty += 0.06;
      if (splashPips >= 2) penalty += 0.08;
    }
  }

  // Triple pips of main color at low CMC
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    for (const color of mainColors) {
      const pips = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      if (pips >= 3 && pc.cmc <= 4) penalty += 0.01;
    }
  }
  return penalty;
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
    penalty += perCopyPenalty * dc.qty;
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
): number => {
  let score = pc.wr;

  const wrFloor = formatMean - 2;
  if (pc.wr < wrFloor) {
    score -= (wrFloor - pc.wr);
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
  return clamp(50 + (wrScore - formatMean) * 6, 0, 100);
};

const normalizeSynergyScore = (synergyScore: number): number => {
  return clamp(50 + synergyScore * 40, 0, 100);
};

const normalizeConsistencyScore = (manaPenalty: number): number =>
  clamp(100 - manaPenalty * 450, 0, 100);

const normalizeCurveScore = (curvePenalty: number): number =>
  clamp(100 - curvePenalty * 110, 0, 100);

const computeStructureAdjustment = (
  creatureCount: number,
  removalCount: number,
  creatureTarget: number,
  skeletonSimilarity: number,
  dependencyPenalty: number,
  cards: DeckCard[],
  poolMap: Map<string, PoolCard>,
): {
  creatureAdjustment: number;
  removalAdjustment: number;
  skeletonAdjustment: number;
  dependencyAdjustment: number;
  totalAdjustment: number;
} => {
  let creatureAdjustment = 0;
  if (creatureCount < CREATURE_CORRIDOR_MIN) {
    const missing = CREATURE_CORRIDOR_MIN - creatureCount;
    creatureAdjustment = -Math.min(4, 1 + missing);
  } else if (creatureCount > CREATURE_CORRIDOR_MAX) {
    const overflow = creatureCount - CREATURE_CORRIDOR_MAX;
    creatureAdjustment = -Math.min(3, 0.8 + overflow * 0.8);
  } else {
    const distance = Math.abs(creatureCount - creatureTarget);
    creatureAdjustment = clamp(1.5 - distance * 0.4, -2, 1.5);
  }

  // Creature-profile by CMC bucket (permissive but decisive on CMC2):
  // if a populated early bucket is too spell-heavy versus the deck's own
  // creature ratio, apply a stronger malus.
  // Target behavior (example for 7 cards at CMC2):
  // - 1/7 creatures: very very strong malus
  // - 2/7 creatures: very strong malus
  // - 3/7 creatures: medium malus
  // - >=4/7 creatures: acceptable (for ~60% creature decks)
  const totalSpells = cards.reduce((sum, dc) => sum + dc.qty, 0);
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
  let creatureCurvePenalty = 0;
  let evaluatedBuckets = 0;
  for (let cmc = 1; cmc <= 5; cmc++) {
    const totalInBucket = bucketTotals[cmc] || 0;
    if (totalInBucket < 4) continue; // permissive: only enforce when bucket is populated
    evaluatedBuckets++;
    const creaturesInBucket = bucketCreatures[cmc] || 0;
    const expectedCreatures = totalInBucket * deckCreatureRatio;
    const minAllowedCreatures = Math.max(1, Math.floor(expectedCreatures));
    const missing = Math.max(0, minAllowedCreatures - creaturesInBucket);

    if (missing > 0) {
      if (cmc === 2) {
        // Strong early-board requirement.
        if (missing >= 3) creatureCurvePenalty += 5.2;
        else if (missing === 2) creatureCurvePenalty += 3.8;
        else creatureCurvePenalty += 2.0;
      } else if (cmc === 3) {
        if (missing >= 3) creatureCurvePenalty += 3.0;
        else if (missing === 2) creatureCurvePenalty += 2.0;
        else creatureCurvePenalty += 1.1;
      } else {
        creatureCurvePenalty += missing * 0.8;
      }
    }
  }
  let creatureCurveAdjustment = 0;
  if (creatureCurvePenalty > 0) {
    creatureCurveAdjustment = -Math.min(6, creatureCurvePenalty);
  } else if (evaluatedBuckets > 0 && creatureCount >= creatureTarget - 1) {
    creatureCurveAdjustment = 0.4;
  }

  let nonCreatureDupOver = 0;
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc || pc.isCreature) continue;
    if (dc.qty > 2) nonCreatureDupOver += dc.qty - 2;
  }
  if (nonCreatureDupOver > 0) {
    creatureAdjustment -= Math.min(2, nonCreatureDupOver * 0.6);
  }
  creatureAdjustment = clamp(creatureAdjustment + creatureCurveAdjustment, -6, 2.2);

  // If creature count is acceptable but the deck is still far from skeleton shape,
  // apply a light profile malus to avoid over-rewarding "on-target count only".
  if (
    creatureCount >= CREATURE_CORRIDOR_MIN &&
    creatureCount <= CREATURE_CORRIDOR_MAX &&
    skeletonSimilarity < 0.25
  ) {
    const offSkeleton = 0.25 - skeletonSimilarity;
    const profileOffSkeletonPenalty = Math.min(2.0, offSkeleton * 10);
    creatureAdjustment = clamp(
      creatureAdjustment - profileOffSkeletonPenalty,
      -6,
      2.2,
    );
  }

  let removalAdjustment = 0;
  if (removalCount >= TARGET_REMOVAL_MIN + 1) removalAdjustment = 0.5;
  else if (removalCount === TARGET_REMOVAL_MIN) removalAdjustment = 0;
  else if (removalCount === TARGET_REMOVAL_MIN - 1) removalAdjustment = -3;
  else removalAdjustment = -6;

  const skeletonAdjustment = clamp((skeletonSimilarity - 0.25) * 20, -2, 2.5);

  const dependencyAdjustment = dependencyPenalty > 0.5
    ? -Math.min(6, dependencyPenalty * 2)
    : 0;

  const totalAdjustment = clamp(
    creatureAdjustment + removalAdjustment + skeletonAdjustment + dependencyAdjustment,
    -10,
    5,
  );

  return {
    creatureAdjustment,
    removalAdjustment,
    skeletonAdjustment,
    dependencyAdjustment,
    totalAdjustment,
  };
};

export const calculateDeckScore = (
  cards: DeckCard[], pool: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  mainColors: string[], splashColor: string | null,
  skeleton: Skeleton | null,
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
): { score: number; breakdown: ScoreBreakdown; stats: DeckStats } => {
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
      synergyNormalized: 0,
      qualityScore: 0,
      consistencyScore: 0,
      curveScore: 0,
      skeletonSimilarity: 0,
      creatureTarget: 0,
      curvePenalty: 0,
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

  const uniqueNames = [...new Set(cards.map((c) => c.name))];
  const synergyScore = getDeckSynergyScore(uniqueNames, pairMap);

  let skeletonSimilarity = 0;
  if (skeleton) {
    const deckQty: Record<string, number> = {};
    for (const c of cards) deckQty[c.name] = (deckQty[c.name] || 0) + c.qty;
    const skelQty: Record<string, number> = {};
    for (const sc of skeleton.deck_list || [])
      if (!(sc.type || '').includes('Land')) skelQty[sc.name] = (skelQty[sc.name] || 0) + 1;
    skeletonSimilarity = weightedJaccard(deckQty, skelQty);
  }

  const idealCurve = getIdealCurve(skeleton);
  const actualCurve: Record<number, number> = {};
  for (const pc of expanded) {
    const bucket = Math.min(Math.max(Math.round(pc.cmc), 1), 7);
    actualCurve[bucket] = (actualCurve[bucket] || 0) + 1;
  }
  let curveDelta = 0;
  for (let cmc = 1; cmc <= 7; cmc++) {
    curveDelta += Math.abs((actualCurve[cmc] || 0) - (idealCurve[cmc] || 0));
  }
  const curvePenalty = curveDelta * CURVE_PENALTY_FACTOR;

  const effectiveSplash = hasActiveSplashDemand(cards, poolMap, mainColors, splashColor) ? splashColor : null;
  const manaPenalty = computeManaPenalty(cards, poolMap, mainColors, effectiveSplash);
  const dependencyPenalty = computeDependencyPenalty(cards, poolMap);
  const fixerOnlyPenalty = computeFixerOnlyPenalty(cards, poolMap, mainColors, effectiveSplash);
  const dependencyAndFixerPenalty = dependencyPenalty + fixerOnlyPenalty;

  const wrNormalized = normalizeWrScore(wrScore, formatMean);
  const synergyNormalized = normalizeSynergyScore(synergyScore);
  const consistencyScore = normalizeConsistencyScore(manaPenalty);
  const curveScore = normalizeCurveScore(curvePenalty);

  const totalWeight = scoreWeights.power + scoreWeights.synergy + scoreWeights.consistency + scoreWeights.curve;
  const baseScore = (
    scoreWeights.power * wrNormalized +
    scoreWeights.synergy * synergyNormalized +
    scoreWeights.consistency * consistencyScore +
    scoreWeights.curve * curveScore
  ) / Math.max(1e-6, totalWeight);

  const creatureTarget = getCreatureTarget(skeleton, n);
  const structureAdjustment = computeStructureAdjustment(
    creatureCount,
    removalCount,
    creatureTarget,
    skeletonSimilarity,
    dependencyAndFixerPenalty,
    cards,
    poolMap,
  );

  const qualityScore = baseScore;
  const consistencyAdjustment = 0;
  const curveAdjustment = 0;
  const totalAdjustment = structureAdjustment.totalAdjustment;
  const score = clamp(baseScore + totalAdjustment, 0, 100);

  return {
    score,
    breakdown: {
      wrScore,
      synergyScore,
      wrNormalized,
      synergyNormalized,
      qualityScore,
      consistencyScore,
      curveScore,
      skeletonSimilarity,
      creatureTarget,
      curvePenalty,
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
const initCompetitive = (
  eligible: PoolCard[],
  skeleton: Skeleton | null,
  targetSpells: number,
  formatMean: number,
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
  for (const pc of eligible) {
    const jitter = jitterStrength > 0 ? (rng() - 0.5) * jitterStrength : 0;
    utilityByName.set(pc.name, getCardUtilityScore(pc, skeleton, formatMean, jitter));
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

  // 1) Seed with a few skeleton anchors (only if still sensible by utility).
  if (skeleton) {
    const anchors = (skeleton.deck_list || [])
      .filter((s) => !(s.type || "").includes("Land"))
      .map((s) => s.name)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .filter((name) => eligibleMap.has(name))
      .sort((a, b) => (utilityByName.get(b) || -999) - (utilityByName.get(a) || -999))
      .slice(0, 7);
    for (const name of anchors) {
      if (total >= Math.min(targetSpells, 7)) break;
      addOne(name);
    }
  }

  // 2) Force interaction floor first.
  while (total < targetSpells && removalCount < TARGET_REMOVAL_MIN) {
    const cand = bestCandidate((pc) => pc.isRemoval);
    if (!cand) break;
    addOne(cand.name);
  }

  // 3) Ensure creature backbone close to skeleton target.
  while (total < targetSpells && creatureCount < creatureTarget) {
    const cand = bestCandidate((pc) => pc.isCreature);
    if (!cand) break;
    addOne(cand.name);
  }

  // 4) Fill remaining slots with best contextual utility.
  while (total < targetSpells) {
    const cand = bestCandidate(() => true);
    if (!cand) break;
    addOne(cand.name);
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
  hcRestarts = NUM_RESTARTS,
  hcIterationLimit = ITERATION_LIMIT,
  rng: () => number = Math.random,
): { deck: DeckCard[]; score: number; breakdown: ScoreBreakdown; stats: DeckStats } => {
  const eligibleMap = new Map<string, PoolCard>();
  for (const pc of eligible) eligibleMap.set(pc.name, pc);
  const utilityByName = new Map<string, number>();
  for (const pc of eligible) {
    utilityByName.set(pc.name, getCardUtilityScore(pc, skeleton, formatMean));
  }

  let bestDeck: DeckCard[] = [];
  let bestScore = -Infinity;
  let bestBreakdown: ScoreBreakdown = {
    wrScore: 0,
    synergyScore: 0,
    wrNormalized: 0,
    synergyNormalized: 0,
    qualityScore: 0,
    consistencyScore: 0,
    curveScore: 0,
    skeletonSimilarity: 0,
    creatureTarget: 0,
    curvePenalty: 0,
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
    let currentDeck = initCompetitive(
      eligible,
      skeleton,
      targetSpells,
      formatMean,
      restart === 0 ? 0 : 2.2,
      rng,
    );

    if (totalQty(currentDeck) < targetSpells * 0.5) continue;

    let current = calculateDeckScore(currentDeck, eligible, pairMap, mainColors, splashColor, skeleton, scoreWeights, formatMean);

    for (let iter = 0; iter < hcIterationLimit; iter++) {
      let improved = false;
      const inDeck = deckCardSet(currentDeck);
      const creatureTarget = getCreatureTarget(skeleton, targetSpells);
      const utilitySideboard = eligible
        .filter((pc) => !inDeck.has(pc.name))
        .sort((a, b) => (utilityByName.get(b.name) || b.wr) - (utilityByName.get(a.name) || a.wr))
        .slice(0, 10);
      const creatureSideboard = current.stats.creatureCount < creatureTarget
        ? eligible
            .filter((pc) => !inDeck.has(pc.name) && pc.isCreature)
            .sort((a, b) => (utilityByName.get(b.name) || b.wr) - (utilityByName.get(a.name) || a.wr))
            .slice(0, 8)
        : [];
      const sideboardMap = new Map<string, PoolCard>();
      for (const card of [...utilitySideboard, ...creatureSideboard]) sideboardMap.set(card.name, card);
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
      const cutCandidates = [...baseCuts, ...excessDuplicates.filter((c) => !cutNames.has(c.name))];

      for (const addCard of sideboard) {
        for (const cutCandidate of cutCandidates) {
          const di = currentDeck.findIndex((c) => c.name === cutCandidate.name);
          if (di < 0) continue;

          const newDeck = currentDeck
            .map((c, i) => i === di ? (c.qty > 1 ? { name: c.name, qty: c.qty - 1 } : null) : c)
            .filter((c): c is DeckCard => c != null && c.qty > 0);

          const ei = newDeck.findIndex((c) => c.name === addCard.name);
          if (ei >= 0) newDeck[ei] = { name: addCard.name, qty: newDeck[ei].qty + 1 };
          else newDeck.push({ name: addCard.name, qty: 1 });

          const newResult = calculateDeckScore(newDeck, eligible, pairMap, mainColors, splashColor, skeleton, scoreWeights, formatMean);
          if (newResult.score > current.score + 0.001) {
            currentDeck = newDeck;
            current = newResult;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (!improved) break;
    }

    if (current.score > bestScore) {
      bestDeck = currentDeck;
      bestScore = current.score;
      bestBreakdown = current.breakdown;
      bestStats = current.stats;
    }
  }

  return { deck: bestDeck, score: bestScore, breakdown: bestBreakdown, stats: bestStats };
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
    if (picked.isFetch) { for (const c of allColors) currentSources[c]++; }
    else { for (const c of picked.produced) currentSources[c]++; }
  }

  const computeLandSources = (basics: Record<string, number>): Record<string, number> => {
    const sources: Record<string, number> = {};
    for (const c of allColors) sources[c] = (currentSources[c] || 0) + (basics[c] || 0);
    return sources;
  };

  const objective = (sources: Record<string, number>): number => {
    let value = 0;
    for (const c of allColors) {
      const deficit = Math.max(0, (targetSources[c] || 0) - (sources[c] || 0));
      value += deficit * deficit;
    }
    return value;
  };

  // Allocate basics by minimizing global source-deficit objective.
  const basicsToAssign = Math.max(0, landCount - selectedUtility.length);
  const basicsByColor: Record<string, number> = {};
  for (const c of allColors) basicsByColor[c] = 0;

  for (let i = 0; i < basicsToAssign; i++) {
    let bestColor = allColors[0];
    let bestObj = Number.POSITIVE_INFINITY;
    for (const c of allColors) {
      basicsByColor[c] += 1;
      const obj = objective(computeLandSources(basicsByColor));
      basicsByColor[c] -= 1;
      if (obj < bestObj - 1e-9) {
        bestObj = obj;
        bestColor = c;
      } else if (Math.abs(obj - bestObj) <= 1e-9 && (pipDemand[c] || 0) > (pipDemand[bestColor] || 0)) {
        bestColor = c;
      }
    }
    basicsByColor[bestColor] += 1;
  }

  // Safety rule: if a splash is active, keep at least one basic of splash color
  // whenever we play any basics at all. This avoids awkward manabases where
  // fetch/fixing exists but no target basic for the splash.
  if (effectiveSplash && basicsToAssign > 0 && (basicsByColor[effectiveSplash] || 0) === 0) {
    const donor = [...mainColors].sort((a, b) => (basicsByColor[b] || 0) - (basicsByColor[a] || 0))[0];
    if (donor && (basicsByColor[donor] || 0) > 1) {
      basicsByColor[donor] -= 1;
      basicsByColor[effectiveSplash] = (basicsByColor[effectiveSplash] || 0) + 1;
    }
  }

  // Early-curve floor: ensure enough LAND sources for colors with early-game demand.
  // Cards requiring a color at CMC <= 3 need reliable T2-T3 access from actual lands,
  // not from mana producers that arrive later.
  for (const color of mainColors) {
    let earlyCurveCards = 0;
    for (const dc of cards) {
      const pc = poolMap.get(dc.name);
      if (!pc) continue;
      const pips = countRequiredColorPipsForDeck(pc.cost, color, allColors);
      if (pips > 0 && pc.cmc <= 3) earlyCurveCards += dc.qty;
    }
    if (earlyCurveCards === 0) continue;
    // ~0.7 extra land source per early-curve card on a base of 4
    const minLandSources = Math.max(5, Math.ceil(4 + earlyCurveCards * 0.7));

    // Count actual land sources (basics + utility lands)
    let landSources = basicsByColor[color] || 0;
    for (const util of selectedUtility) {
      if (util.isFetch || util.produced.includes(color)) landSources++;
    }
    let deficit = minLandSources - landSources;
    if (deficit <= 0) continue;

    // Redistribute basics from the color with the most, but don't starve it below 4.
    const donors = mainColors
      .filter((c) => c !== color)
      .sort((a, b) => (basicsByColor[b] || 0) - (basicsByColor[a] || 0));
    for (const donor of donors) {
      if (deficit <= 0) break;
      const canTake = Math.max(0, (basicsByColor[donor] || 0) - 4);
      const take = Math.min(deficit, canTake);
      if (take > 0) {
        basicsByColor[donor] -= take;
        basicsByColor[color] += take;
        deficit -= take;
      }
    }
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


// Main optimizer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const optimizePool = (
  poolCards: PoolCard[],
  pairMap: Record<string, Record<string, number>>,
  skeletons: Skeleton[],
  scoreWeights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
  formatMean = 55,
  debug = false,
  debugLimit = 20,
  hcRestarts = NUM_RESTARTS,
  hcIterationLimit = ITERATION_LIMIT,
  seed = DEFAULT_OPTIMIZER_SEED,
): SealedOptimizerResult => {
  const rng = createSeededRng(seed);
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

  const preRankedPairs = [...PAIRS]
    .map((pair) => {
      const pairEligible = filterEligibleCards(poolCards, pair, null).filter((pc) => !isLandType(pc.type));
      if (pairEligible.length === 0) return { pair, support: -9999 };

      const utilities: number[] = [];
      for (const pc of pairEligible) {
        const util = getCardUtilityScore(pc, null, formatMean);
        for (let i = 0; i < pc.qty; i++) utilities.push(util);
      }
      utilities.sort((a, b) => b - a);
      const topPlayable = utilities.slice(0, DEFAULT_SPELL_SLOTS);
      const baseScore = topPlayable.reduce((sum, v) => sum + v, 0);
      return { pair, support: baseScore };
    })
    .sort((a, b) => b.support - a.support);

  const rankedPairs = preRankedPairs.slice(0, MAX_MAIN_PAIRS).map((item) => item.pair);
  if (debug) {
    const selectedSet = new Set(rankedPairs.map((p) => p.join("")));
    for (const item of preRankedPairs) {
      const code = item.pair.join("");
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
  for (const pair of rankedPairs) {
    const pairCode = pair.join("");
    const skeleton = findBestSkeleton(pair.join(""), skeletons);
    const eligible = filterEligibleCards(poolCards, pair, null).filter((pc) => !isLandType(pc.type));
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

    const result = hillClimbOptimize(
      eligible,
      pairMap,
      pair,
      null,
      skeleton,
      DEFAULT_SPELL_SLOTS,
      scoreWeights,
      formatMean,
      hcRestarts,
      hcIterationLimit,
      rng,
    );
    if (result.deck.length <= 0) {
      if (debug) {
        debugPairDiagnostics.push({
          stage: "main_eval",
          archetype: pairCode,
          eligibleCount: eligible.length,
          reason: "empty_deck_after_optimize",
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
          reason: "failed_consistency_gate",
        });
      }
      continue;
    }
    const accepted = {
        score: result.score, archetype: pair.join(""), mainColors: [...pair],
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
        reason: "accepted_main",
      });
    }
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
    const skeleton = findBestSkeleton(base.mainColors.join(""), skeletons);
    for (const splash of COLOR_ORDER) {
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

      const result = hillClimbOptimize(
        eligible,
        pairMap,
        base.mainColors,
        splash,
        trioSkeleton || skeleton,
        DEFAULT_SPELL_SLOTS,
        scoreWeights,
        formatMean,
        hcRestarts,
        hcIterationLimit,
        rng,
      );
      if (result.deck.length <= 0) {
        if (debug) {
          debugPairDiagnostics.push({
            stage: "splash_eval",
            archetype: splashCode,
            eligibleCount: eligible.length,
            reason: "empty_deck_after_optimize",
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
            reason: "failed_consistency_gate",
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
          reason: "accepted_splash",
        });
      }
    }
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

  // Keep only the best deck per resolved archetype label (e.g. UR once, URw once).
  const seenArchetypes = new Set<string>();
  const onePerArchetype = resolved.filter((r) => {
    if (seenArchetypes.has(r.resolvedArchetype)) return false;
    seenArchetypes.add(r.resolvedArchetype);
    return true;
  });

  const top3 = onePerArchetype.slice(0, 3);

  // Post-processing: compute display metadata

  const builds: SealedDeckResult[] = top3.map((r, idx) => {
    const lands = determineLands(r.deck, poolCards, r.mainColors, r.activeSplash);
    return {
      rank: idx + 1,
      score: Number(r.score.toFixed(2)),
      archetype: r.resolvedArchetype,
      mainColors: r.mainColors,
      splashColor: r.activeSplash,
      cards: r.deck,
      lands,
      stats: {
        ...r.stats,
        avgCmc: Number(r.stats.avgCmc.toFixed(2)),
        totalCards: totalQty(r.deck) + totalQty(lands),
        skeletonSimilarity: Number(r.stats.skeletonSimilarity.toFixed(3)),
      },
      scoreBreakdown: {
        wrScore: Number(r.breakdown.wrScore.toFixed(2)),
        synergyScore: Number(r.breakdown.synergyScore.toFixed(4)),
        wrNormalized: Number(r.breakdown.wrNormalized.toFixed(2)),
        synergyNormalized: Number(r.breakdown.synergyNormalized.toFixed(2)),
        qualityScore: Number(r.breakdown.qualityScore.toFixed(2)),
        consistencyScore: Number(r.breakdown.consistencyScore.toFixed(2)),
        curveScore: Number(r.breakdown.curveScore.toFixed(2)),
        skeletonSimilarity: Number(r.breakdown.skeletonSimilarity.toFixed(3)),
        creatureTarget: Number(r.breakdown.creatureTarget.toFixed(2)),
        curvePenalty: Number(r.breakdown.curvePenalty.toFixed(4)),
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
    };
  });

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
      ? onePerArchetype.slice(0, Math.max(1, Math.min(50, debugLimit))).map((r) => ({
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
        }))
      : undefined,
  };
};




