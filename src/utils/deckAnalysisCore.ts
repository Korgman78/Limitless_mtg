// ─── Shared deck-analysis logic ───────────────────────────────────────────────
// Pure types, constants and functions used by BOTH the frontend (DeckTestPanel)
// and the Supabase Edge Function (supabase/functions/deck-analysis).
//
// Keep this file free of React / Deno / Supabase imports so it stays portable.
// A mirror copy lives at supabase/functions/_shared/deckAnalysisCore.ts —
// run `cp src/utils/deckAnalysisCore.ts supabase/functions/_shared/deckAnalysisCore.ts`
// after any change here.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

export const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;
export type ManaColor = (typeof COLOR_ORDER)[number];

export type ParsedDeckCard = { name: string; qty: number };

export type ParsedDeck = {
  mainCards: ParsedDeckCard[];
  sideboardCards: ParsedDeckCard[];
  totalMainCards: number;
  totalSideboardCards: number;
};

export type DeckCardMeta = {
  cmc: number;
  type: string;
  rarity: string | null;
  colors: string | null;
  cost: string | null;
};

export type DeckCardStat = {
  gih_wr: number | null;
  alsa: number | null;
  frequency: number | null;
};

export type CoreCardStatus = {
  name: string;
  rank: number;
  present: boolean;
};

export type CurveRow = {
  cmc: number;
  expected: number;
  actual: number;
  delta: number;
};

export type LowSynergyCard = {
  name: string;
  qty: number;
  avgSynergy: number;
  supportPairs: number;
  wr: number | null;
  wrSource: 'local' | 'global' | 'none';
  hasWeakSynergy: boolean;
  hasLowWr: boolean;
  isNonKey: boolean;
  matchCount: number;
};

export type PotentialAddCard = {
  name: string;
  qty: number;
  avgSynergy: number;
  supportPairs: number;
  wr: number | null;
  wrSource: 'local' | 'global' | 'none';
  isTop15Importance: boolean;
  hasStrongSynergy: boolean;
  hasStrongWr: boolean;
  matchCount: number;
};

export type RecommendationSwap = {
  add: string;
  cut: string;
  reason: string;
  addScore: number;
  cutScore: number;
  addSynergy: number | null;
  cutSynergy: number | null;
  addWR: number | null;
  cutWR: number | null;
  addIsCore: boolean;
  cutIsCore: boolean;
};

export type RecommendationResult = {
  summary: string[];
  swaps: RecommendationSwap[];
  generatedAt: string;
};

export type DeckAnalysisResult = {
  cacheVersion?: number;
  format: string;
  matchedArchetype: string;
  matchedIsAlternative?: boolean;
  creatureCount: number;
  skeletonCreatureCount: number;
  creatureRatio: number;
  expectedCreatureRatio: number;
  curveRows: CurveRow[];
  curveInsights: string[];
  coreCards: CoreCardStatus[];
  lowSynergyCards: LowSynergyCard[];
  potentialAdds: PotentialAddCard[];
  mainCards: ParsedDeckCard[];
  sideboardCards: ParsedDeckCard[];
  mainNonLandNames: string[];
  qtyByName: Record<string, number>;
  metaByName: Record<string, DeckCardMeta>;
  statByName: Record<string, DeckCardStat>;
  localWrByName: Record<string, number | null>;
  archetypeAvgWr: number | null;
  globalAvgWr: number | null;
  importanceByName: Record<string, { frequency?: number; is_core?: boolean }>;
  recommendations: RecommendationResult | null;
};

/** Minimal skeleton shape consumed by analysis functions. */
export type AnalysisSkeleton = {
  id?: string;
  archetype_name: string;
  is_alternative?: boolean;
  sample_size?: number;
  avg_mana_curve?: Record<string, number>;
  creature_ratio?: number;
  deck_list: { name: string; type: string }[];
  core_cards?: { name: string; rank: number; frequency: number }[];
  importance_cards?: { name: string; frequency?: number; is_core?: boolean }[];
};

export type VariantMatchResult = {
  skeleton: AnalysisSkeleton;
  score: number;
};

export type SynergyRow = {
  card_a: string;
  card_b: string;
  synergy_score: number | null;
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const BASIC_LAND_NAMES = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
]);

export const MAX_CMC_BUCKET = 7;
export const STRONG_ADD_SYNERGY_MIN = 2.3;
export const STRONG_ADD_MIN_LINKS = 3;
export const WEAK_CUT_SYNERGY_MAX = 2.0;
export const WEAK_CUT_MIN_LINKS = 3;
export const VARIANT_SWITCH_MARGIN = 0.04;
export const DECK_ANALYSIS_CACHE_VERSION = 6;

// ─── Color helpers ───────────────────────────────────────────────────────────

const COLOR_SET = new Set<string>(COLOR_ORDER);

export const isManaColor = (value: string): value is ManaColor =>
  COLOR_SET.has(value);

export const emptyColorRecord = (): Record<ManaColor, number> => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
});

export const extractColors = (raw: string | null | undefined): ManaColor[] => {
  if (!raw) return [];
  const matches = raw.toUpperCase().match(/[WUBRG]/g);
  if (!matches) return [];
  const unique = [...new Set(matches)].filter(isManaColor);
  return unique.sort(
    (a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b),
  );
};

export const normalizeArchetypeCode = (raw: string): string =>
  extractColors(raw).join('');

export const parseManaCost = (
  manaCost: string | null | undefined,
): { fixedPips: Record<ManaColor, number>; hybridSymbols: ManaColor[][] } => {
  const fixedPips = emptyColorRecord();
  const hybridSymbols: ManaColor[][] = [];
  if (!manaCost) return { fixedPips, hybridSymbols };

  const symbols = [
    ...manaCost.toUpperCase().matchAll(/\{([^}]+)\}/g),
  ].map((m) => m[1].trim());

  for (const symbol of symbols) {
    if (isManaColor(symbol)) {
      fixedPips[symbol] += 1;
      continue;
    }
    const phyrexianMatch = symbol.match(/^([WUBRG])\/P$/);
    if (phyrexianMatch && isManaColor(phyrexianMatch[1])) {
      fixedPips[phyrexianMatch[1]] += 1;
      continue;
    }
    if (symbol.includes('/')) {
      const options = extractColors(symbol);
      if (options.length > 0) hybridSymbols.push(options);
    }
  }

  return { fixedPips, hybridSymbols };
};

// ─── Numeric helpers ─────────────────────────────────────────────────────────

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

export const normalizeFrequency = (
  value: number | null | undefined,
): number => {
  if (value == null || Number.isNaN(value)) return 35;
  if (value > 1) return clamp(value);
  return clamp(value * 100);
};

export const normalizeWR = (value: number | null | undefined): number => {
  if (value == null || Number.isNaN(value)) return 50;
  return clamp((value - 45) * 5);
};

// ─── Deck parsing ────────────────────────────────────────────────────────────

export const parseMtgaDeck = (rawText: string): ParsedDeck => {
  const mainMap = new Map<string, number>();
  const sideMap = new Map<string, number>();
  const lines = rawText.split(/\r?\n/);
  let section: 'none' | 'main' | 'sideboard' = 'none';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Deck$/i.test(line)) {
      section = 'main';
      continue;
    }
    if (/^Sideboard$/i.test(line)) {
      section = 'sideboard';
      continue;
    }
    if (section === 'none') continue;

    const mtgaMatch = line.match(
      /^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/,
    );
    if (!mtgaMatch) continue;

    const qty = Number(mtgaMatch[1]);
    const name = mtgaMatch[2].trim();
    if (!qty || !name) continue;

    const target = section === 'main' ? mainMap : sideMap;
    target.set(name, (target.get(name) || 0) + qty);
  }

  const mainCards = [...mainMap.entries()].map(([name, qty]) => ({
    name,
    qty,
  }));
  const sideboardCards = [...sideMap.entries()].map(([name, qty]) => ({
    name,
    qty,
  }));

  return {
    mainCards,
    sideboardCards,
    totalMainCards: mainCards.reduce((sum, card) => sum + card.qty, 0),
    totalSideboardCards: sideboardCards.reduce(
      (sum, card) => sum + card.qty,
      0,
    ),
  };
};

// ─── Card helpers ────────────────────────────────────────────────────────────

export const isLandCard = (
  name: string,
  metaByName: Record<string, DeckCardMeta>,
): boolean => {
  if (BASIC_LAND_NAMES.has(name)) return true;
  return (metaByName[name]?.type || '').includes('Land');
};

export const isCreatureCard = (
  name: string,
  metaByName: Record<string, DeckCardMeta>,
): boolean => (metaByName[name]?.type || '').includes('Creature');

export const cmcBucket = (
  name: string,
  metaByName: Record<string, DeckCardMeta>,
): number => {
  const cmc = Number(metaByName[name]?.cmc ?? 0);
  if (!Number.isFinite(cmc)) return 0;
  return Math.min(Math.max(Math.round(cmc), 0), MAX_CMC_BUCKET);
};

export const curveInsightText = (row: CurveRow): string | null => {
  if (row.delta <= -1.75)
    return `Not enough ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`;
  if (row.delta >= 1.75)
    return `Too many ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`;
  return null;
};

// ─── Synergy helpers ─────────────────────────────────────────────────────────

export const buildPairMap = (
  rows: SynergyRow[],
): Record<string, Record<string, number>> => {
  const map: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const a = row.card_a;
    const b = row.card_b;
    const score = Number(row.synergy_score ?? 0);
    if (!map[a]) map[a] = {};
    if (!map[b]) map[b] = {};
    map[a][b] = score;
    map[b][a] = score;
  }
  return map;
};

export const getAverageSynergy = (
  cardName: string,
  peers: string[],
  pairMap: Record<string, Record<string, number>>,
): { avg: number; count: number } => {
  const scores: number[] = [];
  for (const peer of peers) {
    if (peer === cardName) continue;
    const value = pairMap[cardName]?.[peer];
    if (value != null) scores.push(value);
  }
  if (scores.length === 0) return { avg: 0, count: 0 };
  const avg = scores.reduce((sum, v) => sum + v, 0) / scores.length;
  return { avg, count: scores.length };
};

// ─── Skeleton helpers ────────────────────────────────────────────────────────

export const compareSkeletonQuality = (
  a: AnalysisSkeleton,
  b: AnalysisSkeleton,
): number => {
  const aCoreCount = a.core_cards?.length || 0;
  const bCoreCount = b.core_cards?.length || 0;
  if (aCoreCount !== bCoreCount) return bCoreCount - aCoreCount;
  return (b.sample_size || 0) - (a.sample_size || 0);
};

export const buildUserNonLandQtyMap = (
  mainCards: ParsedDeckCard[],
  metaByName: Record<string, DeckCardMeta>,
): Record<string, number> => {
  const qtyMap: Record<string, number> = {};
  for (const card of mainCards) {
    if (isLandCard(card.name, metaByName)) continue;
    qtyMap[card.name] = (qtyMap[card.name] || 0) + card.qty;
  }
  return qtyMap;
};

export const buildSkeletonNonLandQtyMap = (
  skeleton: AnalysisSkeleton,
): Record<string, number> => {
  const qtyMap: Record<string, number> = {};
  for (const card of skeleton.deck_list || []) {
    if ((card.type || '').includes('Land')) continue;
    qtyMap[card.name] = (qtyMap[card.name] || 0) + 1;
  }
  return qtyMap;
};

export const weightedJaccard = (
  left: Record<string, number>,
  right: Record<string, number>,
): number => {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (names.size === 0) return 0;

  let intersection = 0;
  let union = 0;
  for (const name of names) {
    const l = left[name] || 0;
    const r = right[name] || 0;
    intersection += Math.min(l, r);
    union += Math.max(l, r);
  }
  return union > 0 ? intersection / union : 0;
};

export const selectBestSkeletonVariant = (
  archetypeName: string,
  allSkeletons: AnalysisSkeleton[],
  userNonLandQtyMap: Record<string, number>,
): VariantMatchResult | null => {
  const candidates = allSkeletons.filter(
    (s) =>
      s.archetype_name === archetypeName && (s.deck_list?.length || 0) > 0,
  );
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((skeleton) => ({
      skeleton,
      score: weightedJaccard(
        userNonLandQtyMap,
        buildSkeletonNonLandQtyMap(skeleton),
      ),
    }))
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
      const qualityDelta = compareSkeletonQuality(a.skeleton, b.skeleton);
      if (qualityDelta !== 0) return qualityDelta;
      const aAlt = Boolean(a.skeleton.is_alternative);
      const bAlt = Boolean(b.skeleton.is_alternative);
      if (aAlt !== bAlt) return aAlt ? 1 : -1;
      return 0;
    });

  const bestOverall = scored[0];
  const bestMain = scored.find((entry) => !entry.skeleton.is_alternative);
  if (!bestMain) return bestOverall;

  if (
    bestOverall.skeleton.is_alternative &&
    bestOverall.score < bestMain.score + VARIANT_SWITCH_MARGIN
  ) {
    return bestMain;
  }
  return bestOverall;
};

// ─── Archetype detection ─────────────────────────────────────────────────────

export const detectArchetypeFromColors = (
  mainCards: ParsedDeckCard[],
  analysisPool: AnalysisSkeleton[],
  metaByName: Record<string, DeckCardMeta>,
): AnalysisSkeleton | null => {
  const nonLandCards = mainCards.filter(
    (card) => !isLandCard(card.name, metaByName),
  );
  if (nonLandCards.length === 0) return null;

  const seedCardTotals = emptyColorRecord();
  const profiles = nonLandCards.map((card) => {
    const meta = metaByName[card.name];
    const parsedCost = parseManaCost(meta?.cost);
    const fallbackColors = extractColors(meta?.colors);
    return {
      qty: card.qty,
      fixedPips: parsedCost.fixedPips,
      hybridSymbols: parsedCost.hybridSymbols,
      fallbackColors,
    };
  });

  for (const profile of profiles) {
    const fixedColors = COLOR_ORDER.filter(
      (color) => profile.fixedPips[color] > 0,
    );
    if (fixedColors.length > 0) {
      fixedColors.forEach((color) => {
        seedCardTotals[color] += profile.qty;
      });
      continue;
    }
    if (profile.hybridSymbols.length > 0) {
      for (const options of profile.hybridSymbols) {
        const weight = profile.qty / options.length;
        options.forEach((color) => {
          seedCardTotals[color] += weight;
        });
      }
      continue;
    }
    if (profile.fallbackColors.length > 0) {
      profile.fallbackColors.forEach((color) => {
        seedCardTotals[color] += profile.qty;
      });
    }
  }

  const activeSeedColors = new Set<ManaColor>(
    COLOR_ORDER.filter((color) => seedCardTotals[color] > 3),
  );
  const pipTotals = emptyColorRecord();
  const cardTotals = emptyColorRecord();

  const pickColor = (options: ManaColor[]): ManaColor => {
    const activeOptions = options.filter((color) =>
      activeSeedColors.has(color),
    );
    const source = activeOptions.length > 0 ? activeOptions : options;
    return [...source].sort(
      (a, b) =>
        seedCardTotals[b] - seedCardTotals[a] ||
        COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b),
    )[0];
  };

  for (const profile of profiles) {
    const colorsForCard = new Set<ManaColor>();

    COLOR_ORDER.forEach((color) => {
      const pipCount = profile.fixedPips[color];
      if (pipCount > 0) {
        pipTotals[color] += pipCount * profile.qty;
        colorsForCard.add(color);
      }
    });

    for (const options of profile.hybridSymbols) {
      const chosen = pickColor(options);
      pipTotals[chosen] += profile.qty;
      colorsForCard.add(chosen);
    }

    if (colorsForCard.size === 0 && profile.fallbackColors.length > 0) {
      const chosen = pickColor(profile.fallbackColors);
      pipTotals[chosen] += profile.qty;
      colorsForCard.add(chosen);
    }

    colorsForCard.forEach((color) => {
      cardTotals[color] += profile.qty;
    });
  }

  const sortByStrength = (a: ManaColor, b: ManaColor): number =>
    pipTotals[b] - pipTotals[a] ||
    cardTotals[b] - cardTotals[a] ||
    COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b);

  const activeFinal = COLOR_ORDER.filter(
    (color) => cardTotals[color] > 3,
  ).sort(sortByStrength);
  const fallbackColors = [...COLOR_ORDER]
    .sort(sortByStrength)
    .filter((color) => pipTotals[color] > 0 || cardTotals[color] > 0);
  const detectedColors =
    activeFinal.length > 0 ? activeFinal : fallbackColors.slice(0, 2);

  if (detectedColors.length === 0) return null;

  const detectedCode = [...detectedColors]
    .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b))
    .join('');

  const exactMatches = analysisPool.filter(
    (candidate) =>
      normalizeArchetypeCode(candidate.archetype_name) === detectedCode,
  );
  if (exactMatches.length > 0) {
    return [...exactMatches].sort(compareSkeletonQuality)[0];
  }

  const detectedSet = new Set(detectedColors);
  let bestMatch: AnalysisSkeleton | null = null;
  let bestScore = -1;

  for (const candidate of analysisPool) {
    const candidateColors = extractColors(candidate.archetype_name);
    if (candidateColors.length === 0) continue;
    let overlap = 0;
    candidateColors.forEach((color) => {
      if (detectedSet.has(color)) overlap += 1;
    });
    if (overlap === 0) continue;

    const recall = overlap / detectedSet.size;
    const precision = overlap / candidateColors.length;
    const score = recall * 0.65 + precision * 0.35;

    if (
      score > bestScore ||
      (bestMatch != null &&
        Math.abs(score - bestScore) < 1e-9 &&
        compareSkeletonQuality(candidate, bestMatch) < 0)
    ) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) return bestMatch;
  return [...analysisPool].sort(compareSkeletonQuality)[0] || null;
};

// ─── Full local analysis pipeline ────────────────────────────────────────────

export type AnalysisInputs = {
  parsedDeck: ParsedDeck;
  allSkeletons: AnalysisSkeleton[];
  metaByName: Record<string, DeckCardMeta>;
  statByName: Record<string, DeckCardStat>;
  localWrByName: Record<string, number | null>;
  archetypeAvgWr: number | null;
  globalAvgWr: number | null;
  pairRows: SynergyRow[];
  matchedSkeleton: AnalysisSkeleton;
  format: string;
  canonicalByName: Record<string, string>;
};

/**
 * Compute the full DeckAnalysisResult from pre-fetched data.
 * This is a pure function — no I/O, no side-effects.
 */
export const computeAnalysis = (inputs: AnalysisInputs): DeckAnalysisResult => {
  const {
    parsedDeck,
    matchedSkeleton,
    metaByName,
    statByName,
    localWrByName,
    archetypeAvgWr,
    globalAvgWr,
    pairRows,
    format,
    canonicalByName,
  } = inputs;

  const qtyByName = Object.fromEntries(
    parsedDeck.mainCards.map((c) => [c.name, c.qty]),
  );
  const mainNonLandNames = parsedDeck.mainCards
    .map((c) => c.name)
    .filter((name) => !isLandCard(name, metaByName));
  const mainNonLandUnique = [...new Set(mainNonLandNames)];

  const canonicalNameOf = (inputName: string): string =>
    canonicalByName[inputName] || inputName;

  // Curve + creature count
  const userCurve: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0,
  };
  let creatures = 0;
  let spells = 0;
  for (const { name, qty } of parsedDeck.mainCards) {
    if (isLandCard(name, metaByName)) continue;
    const bucket = cmcBucket(name, metaByName);
    userCurve[bucket] += qty;
    if (isCreatureCard(name, metaByName)) creatures += qty;
    else spells += qty;
  }

  const nonLandTotal = creatures + spells;
  const creatureRatio = nonLandTotal > 0 ? (creatures / nonLandTotal) * 100 : 0;
  const expectedCreatureRatio = (matchedSkeleton.creature_ratio || 0) * 100;
  const skeletonCreatureCount = (matchedSkeleton.deck_list || []).filter(
    (card) => (card.type || '').includes('Creature'),
  ).length;

  // Core cards
  const coreCards = (matchedSkeleton.core_cards || []).map((card) => ({
    name: card.name,
    rank: card.rank,
    present: qtyByName[card.name] != null,
  }));

  const importanceByName = Object.fromEntries(
    (matchedSkeleton.importance_cards || []).map((card) => [
      card.name,
      { frequency: card.frequency, is_core: card.is_core },
    ]),
  );

  // Curve rows
  const curveRows: CurveRow[] = Array.from(
    { length: MAX_CMC_BUCKET },
    (_, idx) => idx + 1,
  ).map((cmc) => {
    const expected = Number(
      matchedSkeleton?.avg_mana_curve?.[String(cmc)] || 0,
    );
    const actual = Number(userCurve[cmc] || 0);
    const delta = Number((actual - expected).toFixed(1));
    return { cmc, expected, actual, delta };
  });

  const curveInsights = curveRows
    .map(curveInsightText)
    .filter((item): item is string => item != null)
    .slice(0, 4);
  if (curveInsights.length === 0) {
    curveInsights.push(
      'Mana curve is close to the skeleton profile. Keep current spread.',
    );
  }

  // Synergy analysis
  const mainNonLandSet = new Set(mainNonLandUnique);
  const sideboardCandidates = parsedDeck.sideboardCards
    .filter((card) => !isLandCard(card.name, metaByName))
    .filter((card) => !mainNonLandSet.has(card.name));
  const sideboardQtyByName = Object.fromEntries(
    sideboardCandidates.map((card) => [card.name, card.qty]),
  );
  const sideboardCandidateUnique = [
    ...new Set(sideboardCandidates.map((card) => card.name)),
  ];

  const pairMap = buildPairMap(pairRows);
  const coreSet = new Set(coreCards.map((card) => card.name));
  const top25Set = new Set(Object.keys(importanceByName));
  const top25ImportanceSet = new Set(
    (matchedSkeleton.importance_cards || [])
      .slice(0, 25)
      .map((card) => card.name),
  );
  const wrBaseline = archetypeAvgWr ?? globalAvgWr ?? 55;

  // Mirror of Potential Adds: card shown if it meets at least 2 of 3 rules.
  // Rule 1 – Weak synergy with deck peers
  // Rule 2 – WR at or below archetype baseline
  // Rule 3 – Not in top-25 importance (non-key card)
  // Core cards are always excluded (never suggest cutting a core card).
  const lowSynergyCards = mainNonLandUnique
    .filter((name) => !coreSet.has(name))
    .map((name) => {
      const canonicalName = canonicalNameOf(name);
      const peers = mainNonLandUnique
        .filter((peer) => peer !== name)
        .map((peer) => canonicalNameOf(peer));
      const { avg, count } = getAverageSynergy(canonicalName, peers, pairMap);
      const localWr = localWrByName[name] ?? null;
      const globalWr = statByName[name]?.gih_wr ?? null;
      const wr = localWr ?? globalWr ?? null;
      const wrSource: 'local' | 'global' | 'none' =
        localWr != null ? 'local' : globalWr != null ? 'global' : 'none';
      const hasWeakSynergy =
        count >= WEAK_CUT_MIN_LINKS && avg <= WEAK_CUT_SYNERGY_MAX;
      const hasLowWr = wr != null && wr <= wrBaseline;
      const isNonKey = !top25ImportanceSet.has(name);
      const matchCount =
        Number(hasWeakSynergy) + Number(hasLowWr) + Number(isNonKey);
      return {
        name,
        qty: qtyByName[name] || 1,
        avgSynergy: Number(avg.toFixed(2)),
        supportPairs: count,
        wr,
        wrSource,
        hasWeakSynergy,
        hasLowWr,
        isNonKey,
        matchCount,
      };
    })
    .filter((row) => row.matchCount >= 2)
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount ||
        a.avgSynergy - b.avgSynergy ||
        (a.wr ?? 999) - (b.wr ?? 999),
    )
    .slice(0, 5);

  const potentialAdds = sideboardCandidateUnique
    .map((name) => {
      const canonicalName = canonicalNameOf(name);
      const canonicalMain = mainNonLandUnique.map((cardName) =>
        canonicalNameOf(cardName),
      );
      const { avg, count } = getAverageSynergy(
        canonicalName,
        canonicalMain,
        pairMap,
      );
      const localWr = localWrByName[name] ?? null;
      const globalWr = statByName[name]?.gih_wr ?? null;
      const wr = localWr ?? globalWr ?? null;
      const wrSource: 'local' | 'global' | 'none' =
        localWr != null ? 'local' : globalWr != null ? 'global' : 'none';
      const hasStrongSynergy =
        count >= STRONG_ADD_MIN_LINKS && avg >= STRONG_ADD_SYNERGY_MIN;
      const hasStrongWr = wr != null && wr > wrBaseline + 2;
      const isTop15Importance = top25ImportanceSet.has(name);
      const matchCount =
        Number(hasStrongSynergy) +
        Number(hasStrongWr) +
        Number(isTop15Importance);
      return {
        name,
        qty: sideboardQtyByName[name] || 1,
        avgSynergy: Number(avg.toFixed(2)),
        supportPairs: count,
        wr,
        wrSource,
        isTop15Importance,
        hasStrongSynergy,
        hasStrongWr,
        matchCount,
      };
    })
    .filter((row) => row.matchCount >= 2)
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount ||
        b.avgSynergy - a.avgSynergy ||
        (b.wr ?? -999) - (a.wr ?? -999),
    )
    .slice(0, 6);

  return {
    cacheVersion: DECK_ANALYSIS_CACHE_VERSION,
    format,
    matchedArchetype: matchedSkeleton.archetype_name,
    matchedIsAlternative: Boolean(matchedSkeleton.is_alternative),
    creatureCount: creatures,
    skeletonCreatureCount,
    creatureRatio,
    expectedCreatureRatio,
    curveRows,
    curveInsights,
    coreCards,
    lowSynergyCards,
    potentialAdds,
    mainCards: parsedDeck.mainCards,
    sideboardCards: parsedDeck.sideboardCards,
    mainNonLandNames: mainNonLandUnique,
    qtyByName,
    metaByName,
    statByName,
    localWrByName,
    archetypeAvgWr,
    globalAvgWr,
    importanceByName,
    recommendations: null,
  };
};
