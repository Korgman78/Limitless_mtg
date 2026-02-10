import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';

// ─── Types ──────────────────────────────────────────────────────────────────
// These types mirror the response shape from sealedOptimizerCore.ts.
// Keep in sync when the API contract changes.

export type PoolCardMeta = {
  cmc: number;
  type: string;
  colors: string | null;
  cost: string | null;
  rarity: string | null;
};

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

export type SealedDeckResult = {
  rank: number;
  score: number;
  archetype: string;
  mainColors: string[];
  splashColor: string | null;
  cards: Array<{ name: string; qty: number }>;
  lands: Array<{ name: string; qty: number }>;
  stats: {
    creatureCount: number;
    removalCount: number;
    avgCmc: number;
    totalCards: number;
    skeletonSimilarity: number;
  };
  scoreBreakdown: ScoreBreakdown;
};

export type SealedOptimizerResult = {
  setCode: string;
  format: string;
  builds: SealedDeckResult[];
  poolSize: number;
  weightsApplied: {
    power: number;
    consistency: number;
    curve: number;
    synergy: number;
  };
};

export type PoolAnalysisCache = {
  cacheVersion: number;
  result: SealedOptimizerResult;
  metaByName: Record<string, PoolCardMeta>;
  selectedBuildIndex: number;
  computeTimeMs: number | null;
};

type CardListRow = {
  card_name: string;
  card_cmc: number | null;
  card_type: string | null;
  colors: string | null;
  card_cost?: string | null;
  rarity?: string | null;
};

const POOL_ANALYSIS_CACHE_VERSION = 2;
const POOL_ANALYSIS_TIMEOUT_MS = 25_000;

const mapMetaRow = (row: CardListRow): PoolCardMeta => ({
  cmc: Number(row.card_cmc ?? 0),
  type: row.card_type || '',
  colors: row.colors || null,
  cost: row.card_cost || null,
  rarity: row.rarity || null,
});

const isSealedFormat = (format: string): boolean =>
  format === 'Sealed' ||
  format === 'ArenaDirect_Sealed' ||
  format === 'ArenaDirectSealed';

async function fetchPoolMetaByName(
  setCode: string,
  names: string[],
): Promise<Record<string, PoolCardMeta>> {
  const byName: Record<string, PoolCardMeta> = {};
  if (!setCode || names.length === 0) return byName;

  const uniqueNames = [...new Set(names)];
  const withCostQuery = await supabase
    .from('card_list')
    .select('card_name,card_cmc,card_type,colors,card_cost,rarity')
    .eq('set_code', setCode)
    .in('card_name', uniqueNames);
  const fallbackQuery = withCostQuery.error
    ? await supabase
        .from('card_list')
        .select('card_name,card_cmc,card_type,colors,rarity')
        .eq('set_code', setCode)
        .in('card_name', uniqueNames)
    : null;

  const rows = withCostQuery.error ? fallbackQuery?.data : withCostQuery.data;
  const error = withCostQuery.error ? fallbackQuery?.error : withCostQuery.error;
  if (error || !rows) return byName;

  for (const row of rows as CardListRow[]) {
    byName[row.card_name] = mapMetaRow(row);
  }

  const missing = uniqueNames.filter((name) => !byName[name]);
  if (missing.length === 0) return byName;

  const hasCardCost = !withCostQuery.error;
  const splitRows = await Promise.all(
    missing.map(async (inputName) => {
      const selectCols = hasCardCost
        ? 'card_name,card_cmc,card_type,colors,card_cost,rarity'
        : 'card_name,card_cmc,card_type,colors,rarity';
      const { data } = await supabase
        .from('card_list')
        .select(selectCols)
        .eq('set_code', setCode)
        .ilike('card_name', `${inputName} //%`)
        .limit(1);
      return {
        inputName,
        row: (data?.[0] as CardListRow | undefined) ?? null,
      };
    }),
  );

  for (const item of splitRows) {
    if (!item.row) continue;
    byName[item.inputName] = mapMetaRow(item.row);
  }

  return byName;
}

interface UsePoolAnalysisProps {
  activeSet: string;
  activeFormat: string;
  onFormatChange?: (format: string) => void;
}

export function usePoolAnalysis({
  activeSet,
  activeFormat,
  onFormatChange,
}: UsePoolAnalysisProps) {
  const [analysisFormat, setAnalysisFormat] = useState(activeFormat);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [poolImportText, setPoolImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isAnalyzingPool, setIsAnalyzingPool] = useState(false);
  const [poolAnalysis, setPoolAnalysis] = useState<PoolAnalysisCache | null>(
    null,
  );
  const [selectedBuildIndex, setSelectedBuildIndex] = useState(0);
  const [zoomedCardName, setZoomedCardName] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const storageKey = useMemo(
    () => `pool-test-panel:${activeSet}:${activeFormat}`,
    [activeSet, activeFormat],
  );
  const canUsePool = isSealedFormat(activeFormat);

  useEffect(() => {
    if (!canUsePool) return;
    setAnalysisFormat(activeFormat);
  }, [activeFormat, canUsePool]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PoolAnalysisCache;
      const isCurrent = parsed?.cacheVersion === POOL_ANALYSIS_CACHE_VERSION;
      if (!isCurrent || !parsed?.result?.builds?.length) {
        localStorage.removeItem(storageKey);
        return;
      }
      setPoolAnalysis(parsed);
      setSelectedBuildIndex(
        Math.max(0, Math.min(parsed.selectedBuildIndex ?? 0, parsed.result.builds.length - 1)),
      );
    } catch {
      // Ignore cache parse errors.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (!poolAnalysis) return;
      const payload: PoolAnalysisCache = {
        ...poolAnalysis,
        selectedBuildIndex,
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore cache write errors.
    }
  }, [storageKey, poolAnalysis, selectedBuildIndex]);

  const openImportModal = () => {
    setPoolImportText('');
    setImportError(null);
    setAnalysisFormat(canUsePool ? activeFormat : 'ArenaDirect_Sealed');
    setShowImportModal(true);
  };

  const openLastPool = () => {
    if (!poolAnalysis) return;
    setShowAnalysisModal(true);
  };

  const runPoolAnalysis = async () => {
    setImportError(null);
    if (!poolImportText.trim()) {
      setImportError('Paste a valid MTGA sealed pool before analyzing.');
      return;
    }

    setIsAnalyzingPool(true);
    setShowImportModal(false);
    setShowAnalysisModal(true);

    try {
      const invokePromise = supabase.functions.invoke('sealed-optimizer', {
        body: {
          setCode: activeSet,
          format: analysisFormat,
          poolText: poolImportText,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Pool analysis timed out (25s). Try reducing pool size or retry.')),
          POOL_ANALYSIS_TIMEOUT_MS,
        ),
      );

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (!mountedRef.current) return;

      if (error || !data?.result?.builds?.length) {
        throw new Error(error?.message || data?.error || 'Pool analysis failed.');
      }

      const result = data.result as SealedOptimizerResult;
      const computeTimeMs: number | null =
        typeof data.computeTimeMs === 'number' ? data.computeTimeMs : null;

      const allNames = [
        ...new Set(
          result.builds.flatMap((build) => [
            ...build.cards.map((card) => card.name),
            ...build.lands.map((land) => land.name),
          ]),
        ),
      ];
      const metaByName = await fetchPoolMetaByName(activeSet, allNames);

      if (!mountedRef.current) return;

      const cache: PoolAnalysisCache = {
        cacheVersion: POOL_ANALYSIS_CACHE_VERSION,
        result,
        metaByName,
        selectedBuildIndex: 0,
        computeTimeMs,
      };

      setPoolAnalysis(cache);
      setSelectedBuildIndex(0);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error
          ? err.message
          : 'Pool analysis failed. Try again.';
      setImportError(message);
      setShowAnalysisModal(false);
      setShowImportModal(true);
    } finally {
      if (mountedRef.current) {
        setIsAnalyzingPool(false);
      }
    }
  };

  const changeBuild = (index: number) => {
    if (!poolAnalysis) return;
    const safe = Math.max(0, Math.min(index, poolAnalysis.result.builds.length - 1));
    setSelectedBuildIndex(safe);
  };

  const openBuildArchetype = (onMatchedArchetype: (archetypeName: string, format: string, isAlternative: boolean) => void) => {
    if (!poolAnalysis) return;
    const build = poolAnalysis.result.builds[selectedBuildIndex];
    if (!build) return;
    const archetype = build.mainColors.join('');
    if (analysisFormat !== activeFormat && onFormatChange) {
      onFormatChange(analysisFormat);
    }
    onMatchedArchetype(archetype, analysisFormat, false);
    setShowAnalysisModal(false);
  };

  return {
    canUsePool,
    analysisFormat,
    setAnalysisFormat,
    showImportModal,
    setShowImportModal,
    showAnalysisModal,
    setShowAnalysisModal,
    poolImportText,
    setPoolImportText,
    importError,
    isAnalyzingPool,
    poolAnalysis,
    selectedBuildIndex,
    zoomedCardName,
    setZoomedCardName,
    openImportModal,
    openLastPool,
    runPoolAnalysis,
    changeBuild,
    openBuildArchetype,
  };
}
