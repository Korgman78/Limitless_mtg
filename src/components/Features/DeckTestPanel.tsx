import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, Sparkles, Target, X } from 'lucide-react';
import { FORMAT_OPTIONS } from '../../constants';
import { supabase } from '../../supabase';
import { haptics } from '../../utils/haptics';
import { ArchetypalSkeleton, useSkeletons } from '../../queries/useSkeletons';
import { getCardImage } from '../../utils/helpers';
import { ManaIcons } from '../Common';

type SkeletonWithCore = ArchetypalSkeleton & {
  core_cards?: { name: string; rank: number; frequency: number }[];
};

type ParsedDeckCard = {
  name: string;
  qty: number;
};

type ParsedDeck = {
  mainCards: ParsedDeckCard[];
  sideboardCards: ParsedDeckCard[];
  totalMainCards: number;
  totalSideboardCards: number;
};

type DeckCardMeta = {
  cmc: number;
  type: string;
  rarity: string | null;
  colors: string | null;
  cost: string | null;
};

type DeckCardStat = {
  gih_wr: number | null;
  alsa: number | null;
  frequency: number | null;
};

type CoreCardStatus = {
  name: string;
  rank: number;
  present: boolean;
};

type CurveRow = {
  cmc: number;
  expected: number;
  actual: number;
  delta: number;
};

type LowSynergyCard = {
  name: string;
  qty: number;
  avgSynergy: number;
  supportPairs: number;
  wr: number | null;
  wrSource: 'local' | 'global' | 'none';
};

type PotentialAddCard = {
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

type RecommendationSwap = {
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

type RecommendationResult = {
  summary: string[];
  swaps: RecommendationSwap[];
  generatedAt: string;
};

type DeckAnalysisResult = {
  cacheVersion?: number;
  format: string;
  matchedArchetype: string;
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

interface DeckTestPanelProps {
  activeSet: string;
  activeFormat: string;
  onFormatChange?: (format: string) => void;
  onMatchedArchetype: (archetypeName: string, format: string) => void;
  className?: string;
}

const BASIC_LAND_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const SEALED_FORMATS = new Set(['Sealed', 'ArenaDirect_Sealed']);
const ENABLE_SEALED_RECOMMENDATIONS = false;
const MAX_CMC_BUCKET = 7;
const DECK_ANALYSIS_CACHE_VERSION = 4;
const STRONG_ADD_SYNERGY_MIN = 2.3;
const STRONG_ADD_MIN_LINKS = 3;
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'] as const;

type ManaColor = (typeof COLOR_ORDER)[number];

const COLOR_SET = new Set<string>(COLOR_ORDER);

const isManaColor = (value: string): value is ManaColor => COLOR_SET.has(value);

const emptyColorRecord = (): Record<ManaColor, number> => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
});

const extractColors = (raw: string | null | undefined): ManaColor[] => {
  if (!raw) return [];
  const matches = raw.toUpperCase().match(/[WUBRG]/g);
  if (!matches) return [];
  const unique = [...new Set(matches)].filter(isManaColor);
  return unique.sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
};

const normalizeArchetypeCode = (raw: string): string => extractColors(raw).join('');

const compareSkeletonQuality = (a: SkeletonWithCore, b: SkeletonWithCore): number => {
  const aCoreCount = a.core_cards?.length || 0;
  const bCoreCount = b.core_cards?.length || 0;
  if (aCoreCount !== bCoreCount) return bCoreCount - aCoreCount;

  return (b.sample_size || 0) - (a.sample_size || 0);
};

const parseManaCost = (
  manaCost: string | null | undefined
): { fixedPips: Record<ManaColor, number>; hybridSymbols: ManaColor[][] } => {
  const fixedPips = emptyColorRecord();
  const hybridSymbols: ManaColor[][] = [];
  if (!manaCost) return { fixedPips, hybridSymbols };

  const symbols = [...manaCost.toUpperCase().matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
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
      if (options.length > 0) {
        hybridSymbols.push(options);
      }
    }
  }

  return { fixedPips, hybridSymbols };
};

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

const normalizeFrequency = (value: number | null | undefined): number => {
  if (value == null || Number.isNaN(value)) return 35;
  if (value > 1) return clamp(value);
  return clamp(value * 100);
};

const normalizeWR = (value: number | null | undefined): number => {
  if (value == null || Number.isNaN(value)) return 50;
  return clamp((value - 45) * 5);
};

const parseMtgaDeck = (rawText: string): ParsedDeck => {
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

    const mtgaMatch = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/);
    if (!mtgaMatch) continue;

    const qty = Number(mtgaMatch[1]);
    const name = mtgaMatch[2].trim();
    if (!qty || !name) continue;

    const target = section === 'main' ? mainMap : sideMap;
    target.set(name, (target.get(name) || 0) + qty);
  }

  const mainCards = [...mainMap.entries()].map(([name, qty]) => ({ name, qty }));
  const sideboardCards = [...sideMap.entries()].map(([name, qty]) => ({ name, qty }));

  return {
    mainCards,
    sideboardCards,
    totalMainCards: mainCards.reduce((sum, card) => sum + card.qty, 0),
    totalSideboardCards: sideboardCards.reduce((sum, card) => sum + card.qty, 0),
  };
};

const buildPairMap = (
  rows: Array<{ card_a: string; card_b: string; synergy_score: number | null }>
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

const getAverageSynergy = (
  cardName: string,
  peers: string[],
  pairMap: Record<string, Record<string, number>>
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

const isLandCard = (name: string, metaByName: Record<string, DeckCardMeta>): boolean => {
  if (BASIC_LAND_NAMES.has(name)) return true;
  return (metaByName[name]?.type || '').includes('Land');
};

const isCreatureCard = (name: string, metaByName: Record<string, DeckCardMeta>): boolean =>
  (metaByName[name]?.type || '').includes('Creature');

const cmcBucket = (name: string, metaByName: Record<string, DeckCardMeta>): number => {
  const cmc = Number(metaByName[name]?.cmc ?? 0);
  if (!Number.isFinite(cmc)) return 0;
  return Math.min(Math.max(Math.round(cmc), 0), MAX_CMC_BUCKET);
};

const curveInsightText = (row: CurveRow): string | null => {
  if (row.delta <= -1.75) return `Not enough ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`;
  if (row.delta >= 1.75) return `Too many ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`;
  return null;
};

const detectArchetypeFromColors = (
  mainCards: ParsedDeckCard[],
  analysisPool: SkeletonWithCore[],
  metaByName: Record<string, DeckCardMeta>
): SkeletonWithCore | null => {
  const nonLandCards = mainCards.filter((card) => !isLandCard(card.name, metaByName));
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
    const fixedColors = COLOR_ORDER.filter((color) => profile.fixedPips[color] > 0);
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

  const activeSeedColors = new Set<ManaColor>(COLOR_ORDER.filter((color) => seedCardTotals[color] > 3));

  const pipTotals = emptyColorRecord();
  const cardTotals = emptyColorRecord();

  const pickColor = (options: ManaColor[]): ManaColor => {
    const activeOptions = options.filter((color) => activeSeedColors.has(color));
    const source = activeOptions.length > 0 ? activeOptions : options;
    return [...source].sort(
      (a, b) => seedCardTotals[b] - seedCardTotals[a] || COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)
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
    pipTotals[b] - pipTotals[a] || cardTotals[b] - cardTotals[a] || COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b);

  const activeFinal = COLOR_ORDER.filter((color) => cardTotals[color] > 3).sort(sortByStrength);
  const fallbackColors = [...COLOR_ORDER]
    .sort(sortByStrength)
    .filter((color) => pipTotals[color] > 0 || cardTotals[color] > 0);
  const detectedColors = activeFinal.length > 0 ? activeFinal : fallbackColors.slice(0, 2);

  if (detectedColors.length === 0) return null;

  const detectedCode = [...detectedColors]
    .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b))
    .join('');

  const exactMatches = analysisPool.filter((candidate) => normalizeArchetypeCode(candidate.archetype_name) === detectedCode);
  if (exactMatches.length > 0) {
    return [...exactMatches].sort(compareSkeletonQuality)[0];
  }

  const detectedSet = new Set(detectedColors);
  let bestMatch: SkeletonWithCore | null = null;
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

export const DeckTestPanel: React.FC<DeckTestPanelProps> = ({
  activeSet,
  activeFormat,
  onFormatChange,
  onMatchedArchetype,
  className,
}) => {
  const [analysisFormat, setAnalysisFormat] = useState(activeFormat);
  const { data: analysisSkeletons = [], isLoading: isSkeletonsLoading } = useSkeletons(activeSet, analysisFormat);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [deckImportText, setDeckImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isAnalyzingDeck, setIsAnalyzingDeck] = useState(false);
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] = useState(false);
  const [deckAnalysis, setDeckAnalysis] = useState<DeckAnalysisResult | null>(null);
  const [zoomedCardName, setZoomedCardName] = useState<string | null>(null);

  const storageKey = useMemo(() => `deck-test-panel:${activeSet}`, [activeSet]);

  useEffect(() => {
    setAnalysisFormat(activeFormat);
  }, [activeFormat]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DeckAnalysisResult;
      const cacheIsCurrent = parsed?.cacheVersion === DECK_ANALYSIS_CACHE_VERSION;
      if (cacheIsCurrent && parsed && parsed.mainCards && parsed.curveRows && parsed.matchedArchetype) {
        setDeckAnalysis(parsed);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore cache errors.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (!deckAnalysis) return;
      localStorage.setItem(storageKey, JSON.stringify(deckAnalysis));
    } catch {
      // Ignore cache errors.
    }
  }, [storageKey, deckAnalysis]);

  const fetchDeckMeta = async (cardNames: string[]): Promise<Record<string, DeckCardMeta>> => {
    const metaByName: Record<string, DeckCardMeta> = {};
    if (!activeSet || cardNames.length === 0) return metaByName;

    const withCostQuery = await supabase
      .from('card_list')
      .select('card_name,card_cmc,card_type,rarity,colors,card_cost')
      .eq('set_code', activeSet)
      .in('card_name', cardNames);
    const fallbackQuery = withCostQuery.error
      ? await supabase
          .from('card_list')
          .select('card_name,card_cmc,card_type,rarity,colors')
          .eq('set_code', activeSet)
          .in('card_name', cardNames)
      : null;

    const data = withCostQuery.error ? fallbackQuery?.data : withCostQuery.data;
    const error = withCostQuery.error ? fallbackQuery?.error : withCostQuery.error;

    if (error || !data) return metaByName;

    for (const row of data as Array<{
      card_name: string;
      card_cmc: number | null;
      card_type: string | null;
      rarity: string | null;
      colors: string | null;
      card_cost?: string | null;
    }>) {
      metaByName[row.card_name] = {
        cmc: Number(row.card_cmc ?? 0),
        type: row.card_type || '',
        rarity: row.rarity || null,
        colors: row.colors || null,
        cost: row.card_cost || null,
      };
    }

    return metaByName;
  };

  const fetchCardStats = async (cardNames: string[], format: string): Promise<Record<string, DeckCardStat>> => {
    const statByName: Record<string, DeckCardStat> = {};
    if (!activeSet || cardNames.length === 0) return statByName;

    const { data, error } = await supabase
      .from('card_stats')
      .select('card_name,gih_wr,alsa')
      .eq('set_code', activeSet)
      .eq('format', format)
      .eq('filter_context', 'Global')
      .in('card_name', cardNames);

    if (error || !data) return statByName;

    for (const row of data as Array<{
      card_name: string;
      gih_wr: number | null;
      alsa: number | null;
    }>) {
      statByName[row.card_name] = {
        gih_wr: row.gih_wr,
        alsa: row.alsa,
        frequency: null,
      };
    }
    return statByName;
  };

  const fetchLocalCardWr = async (
    cardNames: string[],
    format: string,
    filterContext: string
  ): Promise<Record<string, number | null>> => {
    const wrByName: Record<string, number | null> = {};
    if (!activeSet || cardNames.length === 0 || !filterContext) return wrByName;

    const { data, error } = await supabase
      .from('card_stats')
      .select('card_name,gih_wr')
      .eq('set_code', activeSet)
      .eq('format', format)
      .eq('filter_context', filterContext)
      .in('card_name', cardNames);

    if (error || !data) return wrByName;

    for (const row of data as Array<{ card_name: string; gih_wr: number | null }>) {
      wrByName[row.card_name] = row.gih_wr;
    }

    return wrByName;
  };

  const fetchArchetypeAndGlobalAvgWr = async (
    format: string,
    archetypeName: string
  ): Promise<{ archetypeAvgWr: number | null; globalAvgWr: number | null }> => {
    if (!activeSet) return { archetypeAvgWr: null, globalAvgWr: null };

    const { data, error } = await supabase
      .from('archetype_stats')
      .select('archetype_name,win_rate')
      .eq('set_code', activeSet)
      .eq('format', format)
      .in('archetype_name', [archetypeName, 'All Decks']);

    if (error || !data) return { archetypeAvgWr: null, globalAvgWr: null };

    const archetypeAvgWr =
      (data.find((row: { archetype_name: string; win_rate: number }) => row.archetype_name === archetypeName)?.win_rate ??
        null) as number | null;
    const globalAvgWr =
      (data.find((row: { archetype_name: string; win_rate: number }) => row.archetype_name === 'All Decks')?.win_rate ??
        null) as number | null;

    return { archetypeAvgWr, globalAvgWr };
  };

  const fetchSynergyRows = async (
    cardNames: string[],
    format: string
  ): Promise<Array<{ card_a: string; card_b: string; synergy_score: number | null }>> => {
    if (!activeSet || cardNames.length < 2) return [];

    const { data, error } = await supabase
      .from('synergy_scores')
      .select('card_a,card_b,synergy_score')
      .eq('set_code', activeSet)
      .eq('format', format)
      .in('card_a', cardNames)
      .in('card_b', cardNames);

    if (error || !data) return [];
    return data as Array<{ card_a: string; card_b: string; synergy_score: number | null }>;
  };

  const openImportModal = () => {
    setDeckImportText('');
    setImportError(null);
    setAnalysisFormat(activeFormat);
    setShowImportModal(true);
  };

  const runDeckAnalysis = async () => {
    setImportError(null);
    const parsedDeck = parseMtgaDeck(deckImportText);

    if (parsedDeck.mainCards.length === 0) {
      setImportError('No valid main deck cards found. Paste an MTGA decklist starting with "Deck".');
      return;
    }

    setIsAnalyzingDeck(true);
    try {
      // Primary path: server-side analysis (faster, consistent business rules).
      try {
        const { data, error } = await supabase.functions.invoke('deck-analysis', {
          body: {
            setCode: activeSet,
            format: analysisFormat,
            deckText: deckImportText,
          },
        });

        if (!error && data?.analysis) {
          setDeckAnalysis(data.analysis as DeckAnalysisResult);
          setShowImportModal(false);
          setShowAnalysisModal(true);
          return;
        }
      } catch {
        // Silent fallback to legacy local pipeline below.
      }

      // Fallback path: local computation (kept for resilience during rollout).
      if (isSkeletonsLoading) {
        setImportError('Archetypal skeletons are still loading. Retry in a second.');
        return;
      }

      const analysisPool = (analysisSkeletons as SkeletonWithCore[]).filter(
        (s) => !s.is_alternative && (s.sample_size || 0) >= 20
      );

      if (analysisPool.length === 0) {
        setImportError(`No skeletons available for ${analysisFormat}.`);
        return;
      }

      const uniqueNames = [...new Set([...parsedDeck.mainCards, ...parsedDeck.sideboardCards].map((c) => c.name))];
      const [metaByName, statByName] = await Promise.all([
        fetchDeckMeta(uniqueNames),
        fetchCardStats(uniqueNames, analysisFormat),
      ]);

      const qtyByName = Object.fromEntries(parsedDeck.mainCards.map((c) => [c.name, c.qty]));
      const mainNonLandNames = parsedDeck.mainCards
        .map((c) => c.name)
        .filter((name) => !isLandCard(name, metaByName));
      const mainNonLandUnique = [...new Set(mainNonLandNames)];

      const bestMatch = detectArchetypeFromColors(parsedDeck.mainCards, analysisPool, metaByName);

      if (!bestMatch) {
        setImportError('Could not detect a matching archetype.');
        return;
      }

      const [localWrByName, avgWr] = await Promise.all([
        fetchLocalCardWr(uniqueNames, analysisFormat, bestMatch.archetype_name),
        fetchArchetypeAndGlobalAvgWr(analysisFormat, bestMatch.archetype_name),
      ]);

      const userCurve: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
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
      const expectedCreatureRatio = (bestMatch.creature_ratio || 0) * 100;
      const skeletonCreatureCount = bestMatch.deck_list.filter((card) => (card.type || '').includes('Creature')).length;

      const coreCards = (bestMatch.core_cards || []).map((card) => ({
        name: card.name,
        rank: card.rank,
        present: qtyByName[card.name] != null,
      }));

      const importanceByName = Object.fromEntries(
        (bestMatch.importance_cards || []).map((card) => [
          card.name,
          { frequency: card.frequency, is_core: card.is_core },
        ])
      );

      const curveRows: CurveRow[] = Array.from({ length: MAX_CMC_BUCKET }, (_, idx) => idx + 1).map((cmc) => {
        const expected = Number(bestMatch?.avg_mana_curve?.[String(cmc)] || 0);
        const actual = Number(userCurve[cmc] || 0);
        const delta = Number((actual - expected).toFixed(1));
        return { cmc, expected, actual, delta };
      });

      const curveInsights = curveRows.map(curveInsightText).filter((item): item is string => item != null).slice(0, 4);
      if (curveInsights.length === 0) {
        curveInsights.push('Mana curve is close to the skeleton profile. Keep current spread.');
      }

      const mainNonLandSet = new Set(mainNonLandUnique);
      const sideboardCandidates = parsedDeck.sideboardCards
        .filter((card) => !isLandCard(card.name, metaByName))
        .filter((card) => !mainNonLandSet.has(card.name));
      const sideboardQtyByName = Object.fromEntries(sideboardCandidates.map((card) => [card.name, card.qty]));
      const sideboardCandidateUnique = [...new Set(sideboardCandidates.map((card) => card.name))];

      const synergyLookupNames = [...new Set([...mainNonLandUnique, ...sideboardCandidateUnique])];
      const pairRows = await fetchSynergyRows(synergyLookupNames, analysisFormat);
      const pairMap = buildPairMap(pairRows);
      const coreSet = new Set(coreCards.map((card) => card.name));
      const top25Set = new Set(Object.keys(importanceByName));
      const top15ImportanceSet = new Set((bestMatch.importance_cards || []).slice(0, 15).map((card) => card.name));
      const wrBaseline = avgWr.archetypeAvgWr ?? avgWr.globalAvgWr ?? 55;

      const lowSynergyCards = mainNonLandUnique
        .map((name) => {
          const peers = mainNonLandUnique.filter((peer) => peer !== name);
          const { avg, count } = getAverageSynergy(name, peers, pairMap);
          const localWr = localWrByName[name] ?? null;
          const globalWr = statByName[name]?.gih_wr ?? null;
          const wr = localWr ?? globalWr ?? null;
          const wrSource: 'local' | 'global' | 'none' = localWr != null ? 'local' : globalWr != null ? 'global' : 'none';
          return {
            name,
            qty: qtyByName[name] || 1,
            avgSynergy: Number(avg.toFixed(2)),
            supportPairs: count,
            wr,
            wrSource,
          };
        })
        .filter((row) => row.supportPairs >= 3)
        .filter((row) => !coreSet.has(row.name))
        .filter((row) => !top25Set.has(row.name))
        .filter((row) => row.wr != null)
        .filter((row) => (row.wr as number) <= wrBaseline + 2)
        .filter((row) => row.avgSynergy <= 2.1)
        .sort((a, b) => (a.avgSynergy - b.avgSynergy) || ((a.wr ?? 999) - (b.wr ?? 999)))
        .slice(0, 5);

      const potentialAdds = sideboardCandidateUnique
        .map((name) => {
          const { avg, count } = getAverageSynergy(name, mainNonLandUnique, pairMap);
          const localWr = localWrByName[name] ?? null;
          const globalWr = statByName[name]?.gih_wr ?? null;
          const wr = localWr ?? globalWr ?? null;
          const wrSource: 'local' | 'global' | 'none' = localWr != null ? 'local' : globalWr != null ? 'global' : 'none';
          const hasStrongSynergy = count >= STRONG_ADD_MIN_LINKS && avg >= STRONG_ADD_SYNERGY_MIN;
          const hasStrongWr = wr != null && wr > wrBaseline + 2;
          const isTop15Importance = top15ImportanceSet.has(name);
          const matchCount = Number(hasStrongSynergy) + Number(hasStrongWr) + Number(isTop15Importance);
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
            (b.avgSynergy - a.avgSynergy) ||
            ((b.wr ?? -999) - (a.wr ?? -999))
        )
        .slice(0, 6);

      const nextAnalysis: DeckAnalysisResult = {
        cacheVersion: DECK_ANALYSIS_CACHE_VERSION,
        format: analysisFormat,
        matchedArchetype: bestMatch.archetype_name,
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
        archetypeAvgWr: avgWr.archetypeAvgWr,
        globalAvgWr: avgWr.globalAvgWr,
        importanceByName,
        recommendations: null,
      };

      setDeckAnalysis(nextAnalysis);
      setShowImportModal(false);
      setShowAnalysisModal(true);
    } finally {
      setIsAnalyzingDeck(false);
    }
  };

  const generateRecommendations = async () => {
    if (!deckAnalysis) return;
    if (!ENABLE_SEALED_RECOMMENDATIONS) return;
    if (!SEALED_FORMATS.has(deckAnalysis.format)) return;

    const sideboardCandidates = deckAnalysis.sideboardCards
      .filter((card) => !isLandCard(card.name, deckAnalysis.metaByName))
      .filter((card) => !deckAnalysis.mainNonLandNames.includes(card.name));

    if (sideboardCandidates.length === 0) {
      setDeckAnalysis((prev) =>
        prev
          ? {
              ...prev,
              recommendations: {
                generatedAt: new Date().toISOString(),
                summary: ['No usable non-land sideboard cards found for recommendation generation.'],
                swaps: [],
              },
            }
          : prev
      );
      return;
    }

    setIsGeneratingRecommendations(true);
    try {
      const relevantNames = [...new Set([...deckAnalysis.mainNonLandNames, ...sideboardCandidates.map((c) => c.name)])];
      const pairRows = await fetchSynergyRows(relevantNames, deckAnalysis.format);
      const pairMap = buildPairMap(pairRows);

      const coreSet = new Set(deckAnalysis.coreCards.map((card) => card.name));
      const curveByCmc = Object.fromEntries(deckAnalysis.curveRows.map((row) => [row.cmc, row]));
      const ratioGap = deckAnalysis.creatureRatio - deckAnalysis.expectedCreatureRatio;

      const addScored = sideboardCandidates.map((candidate) => {
        const name = candidate.name;
        const isCreature = isCreatureCard(name, deckAnalysis.metaByName);
        const cmc = cmcBucket(name, deckAnalysis.metaByName);
        const curveRow = curveByCmc[cmc] as CurveRow | undefined;
        const curveNeed = curveRow && curveRow.delta <= -1.5 ? clamp(Math.abs(curveRow.delta) * 16, 0, 28) : 0;
        const ratioNeed = ratioGap < -3 ? (isCreature ? 18 : 0) : ratioGap > 3 ? (!isCreature ? 18 : 0) : 6;

        const synergyData = getAverageSynergy(name, deckAnalysis.mainNonLandNames, pairMap);
        const synergyScore = synergyData.count > 0 ? clamp((synergyData.avg / 5) * 100) : 25;

        const wr = deckAnalysis.statByName[name]?.gih_wr ?? null;
        const wrScore = normalizeWR(wr);
        const freqScore = normalizeFrequency(
          deckAnalysis.importanceByName[name]?.frequency ?? deckAnalysis.statByName[name]?.frequency
        );
        const coreBonus = coreSet.has(name) ? 12 : 0;

        const score = wrScore * 0.28 + freqScore * 0.18 + synergyScore * 0.28 + curveNeed + ratioNeed + coreBonus;

        return {
          name,
          score,
          avgSynergy: synergyData.count > 0 ? Number(synergyData.avg.toFixed(2)) : null,
          wr,
          isCore: coreSet.has(name),
        };
      });

      const cutScored = deckAnalysis.mainNonLandNames.map((name) => {
        const isCreature = isCreatureCard(name, deckAnalysis.metaByName);
        const cmc = cmcBucket(name, deckAnalysis.metaByName);
        const curveRow = curveByCmc[cmc] as CurveRow | undefined;
        const curveExcess = curveRow && curveRow.delta >= 1.5 ? clamp(curveRow.delta * 16, 0, 30) : 0;
        const ratioExcess = ratioGap > 3 ? (isCreature ? 18 : 0) : ratioGap < -3 ? (!isCreature ? 18 : 0) : 6;

        const synergyData = getAverageSynergy(name, deckAnalysis.mainNonLandNames.filter((card) => card !== name), pairMap);
        const avgSyn = synergyData.count > 0 ? synergyData.avg : 0;
        const weakSynergy = synergyData.count > 0 ? clamp((2.6 - avgSyn) * 30, 0, 100) : 45;

        const wr = deckAnalysis.statByName[name]?.gih_wr ?? null;
        const wrWeakness = wr == null ? 45 : clamp((58 - wr) * 6, 0, 100);
        const corePenalty = coreSet.has(name) ? -28 : 0;

        const score = weakSynergy * 0.45 + wrWeakness * 0.35 + curveExcess + ratioExcess + corePenalty;
        return {
          name,
          score,
          avgSynergy: synergyData.count > 0 ? Number(avgSyn.toFixed(2)) : null,
          wr,
          isCore: coreSet.has(name),
        };
      });

      addScored.sort((a, b) => b.score - a.score);
      cutScored.sort((a, b) => b.score - a.score);

      const usedCuts = new Set<string>();
      const usedAdds = new Set<string>();
      const swaps: RecommendationSwap[] = [];

      for (const add of addScored) {
        if (swaps.length >= 3) break;
        if (usedAdds.has(add.name)) continue;

        const cut = cutScored.find((candidate) => !usedCuts.has(candidate.name) && candidate.name !== add.name);
        if (!cut) continue;

        const addCmc = cmcBucket(add.name, deckAnalysis.metaByName);
        const reasonParts: string[] = [];
        const addCurve = curveByCmc[addCmc] as CurveRow | undefined;
        if (addCurve && addCurve.delta <= -1.5) reasonParts.push(`fills ${addCmc}-drop gap`);
        if (add.isCore) reasonParts.push('aligns with archetype core');
        if (add.avgSynergy != null && add.avgSynergy >= 1.0) reasonParts.push('improves internal synergy');
        if (Math.abs(ratioGap) > 3) reasonParts.push('improves creature/spell balance');

        const reason = reasonParts.length > 0 ? reasonParts.join(', ') : 'raises card quality and fit';

        swaps.push({
          add: add.name,
          cut: cut.name,
          reason,
          addScore: Number(add.score.toFixed(1)),
          cutScore: Number(cut.score.toFixed(1)),
          addSynergy: add.avgSynergy,
          cutSynergy: cut.avgSynergy,
          addWR: add.wr,
          cutWR: cut.wr,
          addIsCore: add.isCore,
          cutIsCore: cut.isCore,
        });

        usedAdds.add(add.name);
        usedCuts.add(cut.name);
      }

      const summary: string[] = [];
      const curveStress = deckAnalysis.curveRows.filter((row) => Math.abs(row.delta) >= 1.75);
      if (curveStress.length > 0) {
        summary.push(
          `Primary curve stress: ${curveStress
            .map((row) => `${row.cmc}-drop ${row.delta > 0 ? 'excess' : 'shortage'}`)
            .slice(0, 2)
            .join(', ')}.`
        );
      }
      if (Math.abs(ratioGap) > 3) {
        summary.push(
          ratioGap > 0
            ? 'Current list is creature-heavy versus skeleton profile; proposals bias toward non-creature value.'
            : 'Current list is spell-heavy versus skeleton profile; proposals bias toward board presence.'
        );
      }
      if (summary.length === 0) {
        summary.push('Deck is close to target profile; recommendations focus on synergy and win-rate upgrades.');
      }

      setDeckAnalysis((prev) =>
        prev
          ? {
              ...prev,
              recommendations: {
                summary,
                swaps,
                generatedAt: new Date().toISOString(),
              },
            }
          : prev
      );
    } finally {
      setIsGeneratingRecommendations(false);
    }
  };

  const openMatchedArchetype = () => {
    if (!deckAnalysis) return;
    if (deckAnalysis.format !== activeFormat && onFormatChange) onFormatChange(deckAnalysis.format);
    onMatchedArchetype(deckAnalysis.matchedArchetype, deckAnalysis.format);
    setShowAnalysisModal(false);
    haptics.success();
  };

  const openLastDeck = () => {
    if (!deckAnalysis) return;
    setShowAnalysisModal(true);
    haptics.light();
  };

  const creatureDelta = deckAnalysis ? deckAnalysis.creatureCount - deckAnalysis.skeletonCreatureCount : 0;
  const creatureTone =
    creatureDelta <= 1 && creatureDelta >= -1
      ? 'text-emerald-300'
      : Math.abs(creatureDelta) <= 3
      ? 'text-amber-300'
      : 'text-red-300';
  const creatureStatus = useMemo(() => {
    if (creatureDelta <= -4) {
      return {
        label: 'Very Low Creature Count',
        helper: 'Your deck is missing significant board presence versus the skeleton.',
        containerClass: 'bg-red-500/15 border-red-300/50 ring-red-300/20',
        titleClass: 'text-red-200/90',
        textClass: 'text-red-100',
        iconClass: 'text-red-200',
      };
    }
    if (creatureDelta <= -2) {
      return {
        label: 'Low Creature Count',
        helper: 'You are below the skeleton creature baseline.',
        containerClass: 'bg-amber-500/15 border-amber-300/50 ring-amber-300/20',
        titleClass: 'text-amber-200/90',
        textClass: 'text-amber-100',
        iconClass: 'text-amber-200',
      };
    }
    if (creatureDelta >= 4) {
      return {
        label: 'Very Creature-Heavy',
        helper: 'Your deck runs many more creatures than the skeleton profile.',
        containerClass: 'bg-orange-500/15 border-orange-300/50 ring-orange-300/20',
        titleClass: 'text-orange-200/90',
        textClass: 'text-orange-100',
        iconClass: 'text-orange-200',
      };
    }
    if (creatureDelta >= 2) {
      return {
        label: 'Creature-Heavy',
        helper: 'You are above the skeleton creature baseline.',
        containerClass: 'bg-amber-500/15 border-amber-300/50 ring-amber-300/20',
        titleClass: 'text-amber-200/90',
        textClass: 'text-amber-100',
        iconClass: 'text-amber-200',
      };
    }
    return {
      label: 'Creature Count On Profile',
      helper: 'Your creature count is close to the skeleton baseline.',
      containerClass: 'bg-emerald-500/15 border-emerald-300/50 ring-emerald-300/20',
      titleClass: 'text-emerald-200/90',
      textClass: 'text-emerald-100',
      iconClass: 'text-emerald-200',
    };
  }, [creatureDelta]);

  const matchedSkeletonForDisplay = useMemo(() => {
    if (!deckAnalysis) return null;
    return (analysisSkeletons as SkeletonWithCore[]).find(
      (s) => !s.is_alternative && s.archetype_name === deckAnalysis.matchedArchetype
    ) || null;
  }, [analysisSkeletons, deckAnalysis]);

  const effectiveCoreCards = useMemo(() => {
    if (!deckAnalysis) return [];
    if (deckAnalysis.coreCards && deckAnalysis.coreCards.length > 0) return deckAnalysis.coreCards;

    const matchedCore = matchedSkeletonForDisplay?.core_cards || [];
    if (matchedCore.length === 0) return [];

    return matchedCore.map((card) => ({
      name: card.name,
      rank: card.rank,
      present: deckAnalysis.qtyByName[card.name] != null,
    }));
  }, [deckAnalysis, matchedSkeletonForDisplay]);

  const corePresent = effectiveCoreCards.filter((card) => card.present);
  const coreMissing = effectiveCoreCards.filter((card) => !card.present);
  const criticalCurveInsights = deckAnalysis
    ? deckAnalysis.curveRows
        .filter((row) => Math.abs(row.delta) >= 1.75)
        .map((row) =>
          row.delta < 0
            ? `Not enough ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`
            : `Too many ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`
        )
    : [];
  const minorCurveInsights = deckAnalysis
    ? deckAnalysis.curveInsights.filter((insight) => !criticalCurveInsights.includes(insight))
    : [];

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            haptics.light();
            openImportModal();
          }}
          className={
            (className ? `${className} h-10` : null) ||
            'h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-indigo-500/15 border border-indigo-400/30 hover:bg-indigo-500/25 text-indigo-200 text-[10px] font-bold uppercase tracking-widest transition-all'
          }
        >
          <Sparkles size={13} className="text-indigo-300" />
          Test My Deck
        </button>

        {deckAnalysis && (
          <button
            onClick={openLastDeck}
            className="h-10 inline-flex items-center gap-2 px-3 rounded-xl bg-cyan-500/12 border border-cyan-400/30 hover:bg-cyan-500/22 text-cyan-200 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            <Target size={13} className="text-cyan-300" />
            See My Deck
          </button>
        )}
      </div>

      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm p-3 md:p-6 flex items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-4xl bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg md:text-xl font-black tracking-tight text-white uppercase">Test My Deck</h3>
                  <p className="text-[11px] md:text-xs text-slate-400 mt-1">
                    Paste an MTGA decklist, choose format, then run a visual fit audit.
                  </p>
                </div>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr]">
                <div className="bg-slate-950/40 border-r border-slate-800 p-4 md:p-5 space-y-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Checklist</p>
                  <ul className="space-y-2 text-[11px] text-slate-400">
                    <li>1. Keep the `Deck` header.</li>
                    <li>2. Include Sideboard to unlock Potential Adds.</li>
                    <li>3. One decklist per run.</li>
                    <li>4. Confirm format before analysis.</li>
                  </ul>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Format</label>
                    <select
                      value={analysisFormat}
                      onChange={(e) => setAnalysisFormat(e.target.value)}
                      className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      {FORMAT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 md:p-5 space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">MTGA Import</label>
                  <textarea
                    value={deckImportText}
                    onChange={(e) => setDeckImportText(e.target.value)}
                    placeholder={'Deck\n1 Card Name (SET) 123\n...\n\nSideboard\n...'}
                    className="w-full min-h-[230px] md:min-h-[300px] bg-slate-950/70 border border-slate-700 rounded-2xl p-3 md:p-4 text-xs md:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                  />
                  {importError && (
                    <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                      {importError}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 md:px-6 pb-5 md:pb-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={runDeckAnalysis}
                  disabled={isAnalyzingDeck}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-2"
                >
                  <Sparkles size={12} />
                  {isAnalyzingDeck ? 'Analyzing...' : 'Analyze Deck'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showAnalysisModal && deckAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm p-3 md:p-6 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              className="w-full max-w-[1180px] mx-auto bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl"
            >
              <div className="p-5 md:p-6 border-b border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-bold">Deck Analysis Dashboard</p>
                  <h3 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
                    <span>Best Match:</span>
                    <ManaIcons colors={deckAnalysis.matchedArchetype} size="sm" />
                    <span className="text-indigo-300">{deckAnalysis.matchedArchetype}</span>
                  </h3>
                  <p className="text-xs mt-1 text-slate-300">{deckAnalysis.format}</p>
                </div>

                <button
                  onClick={() => setShowAnalysisModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-4 md:p-6 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                    <p className="text-[11px] md:text-xs uppercase tracking-[0.14em] text-slate-300 font-extrabold">Creature Count</p>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
                      <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 md:py-4">
                        <p className="text-[10px] text-amber-200/75 uppercase">Current Deck</p>
                        <p className="text-4xl md:text-5xl font-black leading-none mt-1 text-amber-300">
                          {deckAnalysis.creatureCount}
                        </p>
                      </div>
                      <p className="text-sm md:text-base text-slate-500 font-semibold tracking-wide">VS</p>
                      <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 md:py-4 text-right">
                        <p className="text-[10px] text-cyan-200/75 uppercase">Skeleton</p>
                        <p className="text-4xl md:text-5xl font-black leading-none mt-1 text-cyan-300">
                          {deckAnalysis.skeletonCreatureCount}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-xs text-slate-400">Delta </span>
                      <span className={`text-sm font-black ${creatureTone}`}>{creatureDelta > 0 ? '+' : ''}{creatureDelta}</span>
                    </div>
                    <div className={`mt-4 rounded-2xl border ring-1 px-3.5 py-2.5 ${creatureStatus.containerClass}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className={`${creatureStatus.iconClass} mt-0.5 shrink-0`} />
                        <div className="space-y-1">
                          <p className={`text-[10px] uppercase tracking-widest font-bold ${creatureStatus.titleClass}`}>Creature Status</p>
                          <p className={`text-[12px] font-semibold ${creatureStatus.textClass}`}>{creatureStatus.label}</p>
                          <p className={`text-[12px] font-semibold ${creatureStatus.textClass}`}>{creatureStatus.helper}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] md:text-xs uppercase tracking-[0.14em] text-slate-300 font-extrabold">Core Cards Coverage</p>
                      <p className="text-xl md:text-2xl font-black text-amber-300">
                        {corePresent.length}/{effectiveCoreCards.length}
                      </p>
                    </div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-[10px] text-slate-200 uppercase tracking-wide font-bold mb-1.5">Present</p>
                        {corePresent.length === 0 ? (
                          <p className="text-xs text-slate-500">No core cards found in current main deck.</p>
                        ) : (
                          <div className="overflow-x-auto pb-1 -mx-1 px-1">
                            <div className="flex gap-2 min-w-max">
                              {corePresent.map((card) => (
                                <button
                                  key={card.name}
                                  type="button"
                                  className="group relative"
                                  title={card.name}
                                  onClick={() => setZoomedCardName(card.name)}
                                >
                                  <div className="w-12 sm:w-14 md:w-16 aspect-[2/3] rounded-md overflow-hidden border border-amber-400/35 shadow-lg transition-transform duration-200 group-hover:scale-110">
                                    <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="absolute -top-1 -left-1 px-1 py-[1px] rounded bg-black/80 text-[8px] font-bold text-amber-200 border border-amber-400/35">
                                    #{card.rank}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-200 uppercase tracking-wide font-bold mb-1.5">Missing</p>
                        {coreMissing.length === 0 ? (
                          <p className="text-xs text-emerald-300">All core cards are present.</p>
                        ) : (
                          <div className="overflow-x-auto pb-1 -mx-1 px-1">
                            <div className="flex gap-2 min-w-max">
                              {coreMissing.map((card) => (
                                <button
                                  key={card.name}
                                  type="button"
                                  className="group relative opacity-90"
                                  title={card.name}
                                  onClick={() => setZoomedCardName(card.name)}
                                >
                                  <div className="w-12 sm:w-14 md:w-16 aspect-[2/3] rounded-md overflow-hidden border border-slate-600/70 shadow-lg transition-transform duration-200 group-hover:scale-110">
                                  <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                </div>
                                <div className="absolute -top-1 -left-1 px-1 py-[1px] rounded bg-black/80 text-[8px] font-bold text-slate-300 border border-slate-500/60">
                                  #{card.rank}
                                </div>
                              </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart3 size={13} className="text-indigo-300" />
                    <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">Mana Curve Fit</h4>
                  </div>

                  <div className="grid grid-cols-7 gap-2 md:gap-3 h-56 md:h-64">
                    {deckAnalysis.curveRows.map((row) => {
                      const maxReference = Math.max(
                        ...deckAnalysis.curveRows.map((item) => Math.max(item.actual, item.expected)),
                        1
                      );
                      const expectedHeight = Math.max((row.expected / maxReference) * 100, 4);
                      const actualHeight = Math.max((row.actual / maxReference) * 100, 4);
                      return (
                        <div key={row.cmc} className="flex flex-col items-center justify-end gap-2">
                          <div className="text-[10px] text-slate-400 font-bold">
                            {row.actual}/{Math.round(row.expected)}
                          </div>
                          <div className="h-44 md:h-52 w-full rounded-xl bg-slate-900/50 border border-slate-800/60 p-2 flex items-end justify-center gap-1.5">
                            <div
                              className="w-[42%] rounded-t-md bg-gradient-to-t from-amber-600 to-orange-400"
                              style={{ height: `${actualHeight}%` }}
                              title={`Current Deck ${row.actual}`}
                            />
                            <div
                              className="w-[42%] rounded-t-md bg-gradient-to-t from-cyan-500 to-indigo-400"
                              style={{ height: `${expectedHeight}%` }}
                              title={`Skeleton ${row.expected.toFixed(1)}`}
                            />
                          </div>
                          <div className="text-xs font-black text-slate-300">{row.cmc}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-slate-500 uppercase tracking-wide">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded bg-gradient-to-r from-amber-600 to-orange-400" />
                      Current Deck
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-1.5 rounded bg-gradient-to-r from-cyan-500 to-indigo-400" />
                      Skeleton
                    </div>
                  </div>

                  {criticalCurveInsights.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-amber-300/50 bg-amber-500/15 ring-1 ring-amber-300/20 px-3.5 py-2.5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-200 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-amber-200/90 font-bold">Curve Alerts</p>
                          {criticalCurveInsights.slice(0, 3).map((insight) => (
                            <p key={insight} className="text-[12px] text-amber-100 font-semibold">
                              {insight}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {minorCurveInsights.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {minorCurveInsights.map((insight) => (
                        <span
                          key={insight}
                          className="px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-700 text-[11px] text-slate-300"
                        >
                          {insight}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
                          Weakest Cards
                        </h4>
                        <div className="relative group">
                          <button
                            type="button"
                            aria-label="Weakest Cards rules"
                            className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
                          >
                            ?
                          </button>
                          <div className="pointer-events-none absolute left-0 top-6 z-20 w-72 rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl px-3 py-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150">
                            <p className="text-[10px] text-slate-200 font-semibold">
                              Non-land cards only. Sorted by lowest internal synergy.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Excludes core cards and top-25 archetype cards.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Keeps cards with enough pair data and no premium WR profile.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              WR priority: local archetype, then global in the same format.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {deckAnalysis.lowSynergyCards.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No clear intruder detected after filtering out core/high-frequency/high-WR cards.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {deckAnalysis.lowSynergyCards.map((card) => (
                          <div
                            key={card.name}
                            className="px-2.5 md:px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                className="group relative shrink-0"
                                title={card.name}
                                onClick={() => setZoomedCardName(card.name)}
                              >
                                <div className="w-9 sm:w-10 md:w-11 aspect-[2/3] rounded-md overflow-hidden border border-slate-700 transition-transform duration-200 group-hover:scale-110 shadow-lg">
                                  <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                </div>
                              </button>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-200 truncate">
                                  {card.qty > 1 ? `${card.qty}x ` : ''}{card.name}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-xs font-black text-amber-300">{card.avgSynergy.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500">
                                WR {card.wr?.toFixed(1) ?? '--'} {card.wrSource === 'global' ? '(global)' : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4 md:p-6">
                    <div className="flex items-center mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[11px] md:text-xs text-slate-300 uppercase tracking-[0.14em] font-extrabold">
                          Potential Adds
                        </h4>
                        <div className="relative group">
                          <button
                            type="button"
                            aria-label="Potential Adds rules"
                            className="w-4 h-4 rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-400 transition-colors flex items-center justify-center"
                          >
                            ?
                          </button>
                          <div className="pointer-events-none absolute left-0 top-6 z-20 w-72 rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl px-3 py-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150">
                            <p className="text-[10px] text-slate-200 font-semibold">
                              Sideboard candidates only. A card is shown if it meets at least 2 of 3 rules.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Rule 1: strong synergy with your current main deck cards.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Rule 2: WR {'>'} baseline +2 (local archetype WR first, otherwise global same format).
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Rule 3: card is in the archetype top 15 importance ranking.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {deckAnalysis.potentialAdds.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No sideboard card currently meets at least 2 of the 3 add conditions.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {deckAnalysis.potentialAdds.map((card) => (
                          <div
                            key={card.name}
                            className="px-2.5 md:px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                className="group relative shrink-0"
                                title={card.name}
                                onClick={() => setZoomedCardName(card.name)}
                              >
                                <div className="w-9 sm:w-10 md:w-11 aspect-[2/3] rounded-md overflow-hidden border border-slate-700 transition-transform duration-200 group-hover:scale-110 shadow-lg">
                                  <img src={getCardImage(card.name)} alt={card.name} className="w-full h-full object-cover" />
                                </div>
                              </button>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-200 truncate">
                                  {card.qty > 1 ? `${card.qty}x ` : ''}{card.name}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {card.hasStrongSynergy && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/30 text-[9px] font-bold text-cyan-200">
                                      Strong synergy
                                    </span>
                                  )}
                                  {card.hasStrongWr && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-400/30 text-[9px] font-bold text-emerald-200">
                                      WR +2
                                    </span>
                                  )}
                                  {card.isTop15Importance && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/30 text-[9px] font-bold text-amber-200">
                                      Top 15
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-xs font-black text-indigo-300">{card.matchCount}/3</span>
                              <span className="text-[10px] text-slate-500">Syn {card.avgSynergy.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500">
                                WR {card.wr?.toFixed(1) ?? '--'} {card.wrSource === 'global' ? '(global)' : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAnalysisModal(false);
                    openImportModal();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Analyze Another Deck
                </button>
                <button
                  onClick={openMatchedArchetype}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                >
                  <Target size={12} />
                  Open Matched Archetype
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {zoomedCardName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomedCardName(null)}
            className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.82, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.82, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-3 max-w-sm w-full"
            >
              <img
                src={getCardImage(zoomedCardName)}
                alt={zoomedCardName}
                className="max-h-[70vh] w-auto rounded-2xl shadow-2xl border border-slate-600"
              />
              <button
                onClick={() => setZoomedCardName(null)}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
