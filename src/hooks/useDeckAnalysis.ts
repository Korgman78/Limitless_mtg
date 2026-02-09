import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useSkeletons, ArchetypalSkeleton } from '../queries/useSkeletons';
import {
  type AnalysisSkeleton,
  type DeckAnalysisResult,
  type DeckCardMeta,
  type DeckCardStat,
  type CoreCardStatus,
  type SynergyRow,
  DECK_ANALYSIS_CACHE_VERSION,
  parseMtgaDeck,
  isLandCard,
  detectArchetypeFromColors,
  buildUserNonLandQtyMap,
  selectBestSkeletonVariant,
  computeAnalysis,
} from '../utils/deckAnalysisCore';

// ─── Fetch helpers (Supabase I/O) ───────────────────────────────────────────

type CardListRow = {
  card_name: string;
  card_cmc: number | null;
  card_type: string | null;
  rarity: string | null;
  colors: string | null;
  card_cost?: string | null;
};

const mapRowToMeta = (row: CardListRow): DeckCardMeta => ({
  cmc: Number(row.card_cmc ?? 0),
  type: row.card_type || '',
  rarity: row.rarity || null,
  colors: row.colors || null,
  cost: row.card_cost || null,
});

async function fetchDeckMeta(
  activeSet: string,
  cardNames: string[],
): Promise<{
  metaByName: Record<string, DeckCardMeta>;
  canonicalByName: Record<string, string>;
}> {
  const metaByName: Record<string, DeckCardMeta> = {};
  const canonicalByName: Record<string, string> = {};
  if (!activeSet || cardNames.length === 0)
    return { metaByName, canonicalByName };

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
  if (error || !data) return { metaByName, canonicalByName };

  const hasCardCost = !withCostQuery.error;
  const selectCols = hasCardCost
    ? 'card_name,card_cmc,card_type,rarity,colors,card_cost'
    : 'card_name,card_cmc,card_type,rarity,colors';

  for (const row of data as CardListRow[]) {
    metaByName[row.card_name] = mapRowToMeta(row);
    canonicalByName[row.card_name] = row.card_name;
  }

  const missingNames = [...new Set(cardNames)].filter(
    (name) => !canonicalByName[name],
  );

  if (missingNames.length > 0) {
    const resolvedRows = await Promise.all(
      missingNames.map(async (inputName) => {
        const { data: d, error: e } = await supabase
          .from('card_list')
          .select(selectCols)
          .eq('set_code', activeSet)
          .ilike('card_name', `${inputName} //%`)
          .limit(1);
        if (e) return { inputName, row: null as CardListRow | null };
        return {
          inputName,
          row: (d?.[0] as unknown as CardListRow | undefined) ?? null,
        };
      }),
    );

    for (const item of resolvedRows) {
      if (!item.row) continue;
      metaByName[item.inputName] = mapRowToMeta(item.row);
      canonicalByName[item.inputName] = item.row.card_name;
    }
  }

  for (const name of [...new Set(cardNames)]) {
    canonicalByName[name] = canonicalByName[name] || name;
  }

  return { metaByName, canonicalByName };
}

async function fetchCardStats(
  activeSet: string,
  cardNames: string[],
  format: string,
  canonicalByName: Record<string, string>,
): Promise<Record<string, DeckCardStat>> {
  const statByName: Record<string, DeckCardStat> = {};
  if (!activeSet || cardNames.length === 0) return statByName;
  const canonicalNames = [
    ...new Set(cardNames.map((name) => canonicalByName[name] || name)),
  ];

  const { data, error } = await supabase
    .from('card_stats')
    .select('card_name,gih_wr,alsa')
    .eq('set_code', activeSet)
    .eq('format', format)
    .eq('filter_context', 'Global')
    .in('card_name', canonicalNames);

  if (error || !data) return statByName;

  const byCanonical: Record<string, DeckCardStat> = {};
  for (const row of data as Array<{
    card_name: string;
    gih_wr: number | null;
    alsa: number | null;
  }>) {
    byCanonical[row.card_name] = {
      gih_wr: row.gih_wr,
      alsa: row.alsa,
      frequency: null,
    };
  }
  for (const inputName of cardNames) {
    const canonical = canonicalByName[inputName] || inputName;
    if (byCanonical[canonical]) statByName[inputName] = byCanonical[canonical];
  }
  return statByName;
}

async function fetchLocalCardWr(
  activeSet: string,
  cardNames: string[],
  format: string,
  filterContext: string,
  canonicalByName: Record<string, string>,
): Promise<Record<string, number | null>> {
  const wrByName: Record<string, number | null> = {};
  if (!activeSet || cardNames.length === 0 || !filterContext) return wrByName;
  const canonicalNames = [
    ...new Set(cardNames.map((name) => canonicalByName[name] || name)),
  ];

  const { data, error } = await supabase
    .from('card_stats')
    .select('card_name,gih_wr')
    .eq('set_code', activeSet)
    .eq('format', format)
    .eq('filter_context', filterContext)
    .in('card_name', canonicalNames);

  if (error || !data) return wrByName;

  const byCanonical: Record<string, number | null> = {};
  for (const row of data as Array<{
    card_name: string;
    gih_wr: number | null;
  }>) {
    byCanonical[row.card_name] = row.gih_wr;
  }
  for (const inputName of cardNames) {
    const canonical = canonicalByName[inputName] || inputName;
    if (canonical in byCanonical) wrByName[inputName] = byCanonical[canonical];
  }
  return wrByName;
}

async function fetchArchetypeAndGlobalAvgWr(
  activeSet: string,
  format: string,
  archetypeName: string,
): Promise<{ archetypeAvgWr: number | null; globalAvgWr: number | null }> {
  if (!activeSet) return { archetypeAvgWr: null, globalAvgWr: null };

  const { data, error } = await supabase
    .from('archetype_stats')
    .select('archetype_name,win_rate')
    .eq('set_code', activeSet)
    .eq('format', format)
    .in('archetype_name', [archetypeName, 'All Decks']);

  if (error || !data) return { archetypeAvgWr: null, globalAvgWr: null };

  const archetypeAvgWr =
    (data.find(
      (row: { archetype_name: string; win_rate: number }) =>
        row.archetype_name === archetypeName,
    )?.win_rate ?? null) as number | null;
  const globalAvgWr =
    (data.find(
      (row: { archetype_name: string; win_rate: number }) =>
        row.archetype_name === 'All Decks',
    )?.win_rate ?? null) as number | null;

  return { archetypeAvgWr, globalAvgWr };
}

async function fetchSynergyRows(
  activeSet: string,
  cardNames: string[],
  format: string,
): Promise<SynergyRow[]> {
  if (!activeSet || cardNames.length < 2) return [];

  const { data, error } = await supabase
    .from('synergy_scores')
    .select('card_a,card_b,synergy_score')
    .eq('set_code', activeSet)
    .eq('format', format)
    .in('card_a', cardNames)
    .in('card_b', cardNames);

  if (error || !data) return [];
  return data as SynergyRow[];
}

// ─── Creature status (computed) ──────────────────────────────────────────────

export type CreatureStatus = {
  label: string;
  helper: string;
  containerClass: string;
  titleClass: string;
  textClass: string;
  iconClass: string;
};

const getCreatureStatus = (delta: number): CreatureStatus => {
  if (delta <= -4)
    return {
      label: 'Very Low Creature Count',
      helper:
        'Your deck is missing significant board presence versus the skeleton.',
      containerClass: 'bg-red-500/15 border-red-300/50 ring-red-300/20',
      titleClass: 'text-red-200/90',
      textClass: 'text-red-100',
      iconClass: 'text-red-200',
    };
  if (delta <= -2)
    return {
      label: 'Low Creature Count',
      helper: 'You are below the skeleton creature baseline.',
      containerClass: 'bg-amber-500/15 border-amber-300/50 ring-amber-300/20',
      titleClass: 'text-amber-200/90',
      textClass: 'text-amber-100',
      iconClass: 'text-amber-200',
    };
  if (delta >= 4)
    return {
      label: 'Very Creature-Heavy',
      helper:
        'Your deck runs many more creatures than the skeleton profile.',
      containerClass:
        'bg-orange-500/15 border-orange-300/50 ring-orange-300/20',
      titleClass: 'text-orange-200/90',
      textClass: 'text-orange-100',
      iconClass: 'text-orange-200',
    };
  if (delta >= 2)
    return {
      label: 'Creature-Heavy',
      helper: 'You are above the skeleton creature baseline.',
      containerClass: 'bg-amber-500/15 border-amber-300/50 ring-amber-300/20',
      titleClass: 'text-amber-200/90',
      textClass: 'text-amber-100',
      iconClass: 'text-amber-200',
    };
  return {
    label: 'Creature Count On Profile',
    helper: 'Your creature count is close to the skeleton baseline.',
    containerClass:
      'bg-emerald-500/15 border-emerald-300/50 ring-emerald-300/20',
    titleClass: 'text-emerald-200/90',
    textClass: 'text-emerald-100',
    iconClass: 'text-emerald-200',
  };
};

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseDeckAnalysisProps {
  activeSet: string;
  activeFormat: string;
  onFormatChange?: (format: string) => void;
  onMatchedArchetype: (
    archetypeName: string,
    format: string,
    isAlternative: boolean,
  ) => void;
}

export function useDeckAnalysis({
  activeSet,
  activeFormat,
  onFormatChange,
  onMatchedArchetype,
}: UseDeckAnalysisProps) {
  const [analysisFormat, setAnalysisFormat] = useState(activeFormat);
  const {
    data: analysisSkeletons = [],
    isLoading: isSkeletonsLoading,
  } = useSkeletons(activeSet, analysisFormat);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [deckImportText, setDeckImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isAnalyzingDeck, setIsAnalyzingDeck] = useState(false);
  const [deckAnalysis, setDeckAnalysis] =
    useState<DeckAnalysisResult | null>(null);
  const [zoomedCardName, setZoomedCardName] = useState<string | null>(null);

  const storageKey = useMemo(
    () => `deck-test-panel:${activeSet}`,
    [activeSet],
  );

  // Sync format when parent changes
  useEffect(() => {
    setAnalysisFormat(activeFormat);
  }, [activeFormat]);

  // Restore from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DeckAnalysisResult;
      const cacheIsCurrent =
        parsed?.cacheVersion === DECK_ANALYSIS_CACHE_VERSION;
      if (
        cacheIsCurrent &&
        parsed &&
        parsed.mainCards &&
        parsed.curveRows &&
        parsed.matchedArchetype
      ) {
        setDeckAnalysis(parsed);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore cache errors.
    }
  }, [storageKey]);

  // Persist to localStorage
  useEffect(() => {
    try {
      if (!deckAnalysis) return;
      localStorage.setItem(storageKey, JSON.stringify(deckAnalysis));
    } catch {
      // Ignore cache errors.
    }
  }, [storageKey, deckAnalysis]);

  // ── Actions ──────────────────────────────────────────────────────────────

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
      setImportError(
        'No valid main deck cards found. Paste an MTGA decklist starting with "Deck".',
      );
      return;
    }

    setIsAnalyzingDeck(true);
    setShowImportModal(false);
    setShowAnalysisModal(true);

    try {
      // Primary path: server-side analysis.
      try {
        const { data, error } = await supabase.functions.invoke(
          'deck-analysis',
          {
            body: {
              setCode: activeSet,
              format: analysisFormat,
              deckText: deckImportText,
            },
          },
        );

        if (!error && data?.analysis) {
          setDeckAnalysis(data.analysis as DeckAnalysisResult);
          return;
        }
      } catch {
        // Silent fallback to local pipeline below.
      }

      // Fallback path: local computation.
      if (isSkeletonsLoading) {
        setImportError(
          'Archetypal skeletons are still loading. Retry in a second.',
        );
        setShowAnalysisModal(false);
        setShowImportModal(true);
        return;
      }

      const allSkeletons = analysisSkeletons as AnalysisSkeleton[];
      const analysisPool = allSkeletons.filter(
        (s) => !s.is_alternative && (s.sample_size || 0) >= 20,
      );

      if (analysisPool.length === 0) {
        setImportError(`No skeletons available for ${analysisFormat}.`);
        setShowAnalysisModal(false);
        setShowImportModal(true);
        return;
      }

      const uniqueNames = [
        ...new Set(
          [...parsedDeck.mainCards, ...parsedDeck.sideboardCards].map(
            (c) => c.name,
          ),
        ),
      ];
      const { metaByName, canonicalByName } = await fetchDeckMeta(
        activeSet,
        uniqueNames,
      );
      const statByName = await fetchCardStats(
        activeSet,
        uniqueNames,
        analysisFormat,
        canonicalByName,
      );

      const bestMatch = detectArchetypeFromColors(
        parsedDeck.mainCards,
        analysisPool,
        metaByName,
      );

      if (!bestMatch) {
        setImportError('Could not detect a matching archetype.');
        setShowAnalysisModal(false);
        setShowImportModal(true);
        return;
      }

      const userNonLandQtyMap = buildUserNonLandQtyMap(
        parsedDeck.mainCards,
        metaByName,
      );
      const variantMatch = selectBestSkeletonVariant(
        bestMatch.archetype_name,
        allSkeletons,
        userNonLandQtyMap,
      );
      const matchedSkeleton = variantMatch?.skeleton ?? bestMatch;

      const [localWrByName, avgWr] = await Promise.all([
        fetchLocalCardWr(
          activeSet,
          uniqueNames,
          analysisFormat,
          matchedSkeleton.archetype_name,
          canonicalByName,
        ),
        fetchArchetypeAndGlobalAvgWr(
          activeSet,
          analysisFormat,
          matchedSkeleton.archetype_name,
        ),
      ]);

      const canonicalNameOf = (inputName: string): string =>
        canonicalByName[inputName] || inputName;
      const mainNonLandUnique = [
        ...new Set(
          parsedDeck.mainCards
            .map((c) => c.name)
            .filter((name) => !isLandCard(name, metaByName)),
        ),
      ];
      const sideboardCandidateUnique = [
        ...new Set(
          parsedDeck.sideboardCards
            .filter((card) => !isLandCard(card.name, metaByName))
            .filter(
              (card) => !new Set(mainNonLandUnique).has(card.name),
            )
            .map((card) => card.name),
        ),
      ];

      const synergyLookupNames = [
        ...new Set(
          [...mainNonLandUnique, ...sideboardCandidateUnique].map(
            (name) => canonicalNameOf(name),
          ),
        ),
      ];
      const pairRows = await fetchSynergyRows(
        activeSet,
        synergyLookupNames,
        analysisFormat,
      );

      const analysis = computeAnalysis({
        parsedDeck,
        allSkeletons,
        metaByName,
        statByName,
        localWrByName,
        archetypeAvgWr: avgWr.archetypeAvgWr,
        globalAvgWr: avgWr.globalAvgWr,
        pairRows,
        matchedSkeleton,
        format: analysisFormat,
        canonicalByName,
      });

      setDeckAnalysis(analysis);
    } finally {
      setIsAnalyzingDeck(false);
    }
  };

  const openMatchedArchetype = () => {
    if (!deckAnalysis) return;
    if (deckAnalysis.format !== activeFormat && onFormatChange)
      onFormatChange(deckAnalysis.format);
    onMatchedArchetype(
      deckAnalysis.matchedArchetype,
      deckAnalysis.format,
      Boolean(deckAnalysis.matchedIsAlternative),
    );
    setShowAnalysisModal(false);
  };

  const openLastDeck = () => {
    if (!deckAnalysis) return;
    setShowAnalysisModal(true);
  };

  // ── Computed values ──────────────────────────────────────────────────────

  const creatureDelta = deckAnalysis
    ? deckAnalysis.creatureCount - deckAnalysis.skeletonCreatureCount
    : 0;

  const creatureTone =
    creatureDelta <= 1 && creatureDelta >= -1
      ? 'text-emerald-300'
      : Math.abs(creatureDelta) <= 3
        ? 'text-amber-300'
        : 'text-red-300';

  const creatureStatus = useMemo(
    () => getCreatureStatus(creatureDelta),
    [creatureDelta],
  );

  const matchedSkeletonForDisplay = useMemo(() => {
    if (!deckAnalysis) return null;
    return (
      (analysisSkeletons as AnalysisSkeleton[]).find(
        (s) =>
          !s.is_alternative &&
          s.archetype_name === deckAnalysis.matchedArchetype,
      ) || null
    );
  }, [analysisSkeletons, deckAnalysis]);

  const effectiveCoreCards: CoreCardStatus[] = useMemo(() => {
    if (!deckAnalysis) return [];
    if (deckAnalysis.coreCards && deckAnalysis.coreCards.length > 0)
      return deckAnalysis.coreCards;

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
            : `Too many ${row.cmc}-drops (${row.actual} vs ${Math.round(row.expected)} skeleton).`,
        )
    : [];

  const minorCurveInsights = deckAnalysis
    ? deckAnalysis.curveInsights.filter(
        (insight) => !criticalCurveInsights.includes(insight),
      )
    : [];

  const curveMaxReference = useMemo(() => {
    if (!deckAnalysis) return 1;
    return Math.max(
      ...deckAnalysis.curveRows.map((item) =>
        Math.max(item.actual, item.expected),
      ),
      1,
    );
  }, [deckAnalysis]);

  return {
    // State
    showImportModal,
    showAnalysisModal,
    deckImportText,
    importError,
    isAnalyzingDeck,
    deckAnalysis,
    analysisFormat,
    zoomedCardName,

    // Computed
    creatureDelta,
    creatureTone,
    creatureStatus,
    effectiveCoreCards,
    corePresent,
    coreMissing,
    criticalCurveInsights,
    minorCurveInsights,
    curveMaxReference,

    // Actions
    setDeckImportText,
    setAnalysisFormat,
    setShowImportModal,
    setShowAnalysisModal,
    setZoomedCardName,
    openImportModal,
    runDeckAnalysis,
    openMatchedArchetype,
    openLastDeck,
  };
}
