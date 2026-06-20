import { supabase } from '../supabase';
import {
  type AnalysisSkeleton,
  type DeckAnalysisResult,
  type DeckCardMeta,
  type DeckCardStat,
  type SynergyRow,
  parseMtgaDeck,
  isLandCard,
  detectArchetypeFromColors,
  buildUserNonLandQtyMap,
  selectBestSkeletonVariant,
  computeAnalysis,
} from './deckAnalysisCore';

/**
 * Pipeline d'analyse de deck réutilisable, extrait de useDeckAnalysis ("Test my
 * deck"). Tente d'abord l'edge function `deck-analysis`, puis retombe sur le
 * calcul local. Sert à scorer le deck du joueur ET celui de l'utilisateur dans
 * Draft Practice avec exactement le même moteur.
 */

// ─── Fetch helpers (copiés à l'identique de useDeckAnalysis.ts) ──────────────

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

// ─── Public API ──────────────────────────────────────────────────────────────

/** Convertit une cardlist {nom: qté} en texte MTGA pour le pipeline. */
export function cardlistToDeckText(cardlist: Record<string, number>): string {
  const lines = Object.entries(cardlist)
    .filter(([, qty]) => qty > 0)
    .map(([name, qty]) => `${qty} ${name}`);
  return `Deck\n${lines.join('\n')}`;
}

/**
 * Analyse un deck (texte MTGA) avec le même moteur que "Test my deck".
 * `allSkeletons` doit être fourni par l'appelant (via useSkeletons) pour le
 * fallback local ; l'edge function n'en a pas besoin.
 */
export async function analyzeDeckText(
  activeSet: string,
  format: string,
  deckText: string,
  allSkeletons: AnalysisSkeleton[],
): Promise<DeckAnalysisResult | null> {
  // Chemin primaire : edge function server-side (identique à Test my deck).
  try {
    const { data, error } = await supabase.functions.invoke('deck-analysis', {
      body: { setCode: activeSet, format, deckText },
    });
    if (!error && data?.analysis) return data.analysis as DeckAnalysisResult;
  } catch {
    // Fallback local ci-dessous.
  }

  // Chemin de secours : calcul local.
  const parsedDeck = parseMtgaDeck(deckText);
  if (parsedDeck.mainCards.length === 0) return null;

  const analysisPool = allSkeletons.filter(
    (s) => !s.is_alternative && (s.sample_size || 0) >= 20,
  );
  if (analysisPool.length === 0) return null;

  const uniqueNames = [
    ...new Set(
      [...parsedDeck.mainCards, ...parsedDeck.sideboardCards].map((c) => c.name),
    ),
  ];
  const { metaByName, canonicalByName } = await fetchDeckMeta(
    activeSet,
    uniqueNames,
  );
  const statByName = await fetchCardStats(
    activeSet,
    uniqueNames,
    format,
    canonicalByName,
  );

  const bestMatch = detectArchetypeFromColors(
    parsedDeck.mainCards,
    analysisPool,
    metaByName,
  );
  if (!bestMatch) return null;

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
      format,
      matchedSkeleton.archetype_name,
      canonicalByName,
    ),
    fetchArchetypeAndGlobalAvgWr(
      activeSet,
      format,
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
        .filter((card) => !new Set(mainNonLandUnique).has(card.name))
        .map((card) => card.name),
    ),
  ];

  const synergyLookupNames = [
    ...new Set(
      [...mainNonLandUnique, ...sideboardCandidateUnique].map((name) =>
        canonicalNameOf(name),
      ),
    ),
  ];
  const pairRows = await fetchSynergyRows(
    activeSet,
    synergyLookupNames,
    format,
  );

  return computeAnalysis({
    parsedDeck,
    allSkeletons,
    metaByName,
    statByName,
    localWrByName,
    archetypeAvgWr: avgWr.archetypeAvgWr,
    globalAvgWr: avgWr.globalAvgWr,
    pairRows,
    matchedSkeleton,
    format,
    canonicalByName,
  });
}

// ─── Scoring : un score 0-100 dérivé des sorties du moteur ────────────────────

export type DeckScore = {
  score: number; // 0..100
  avgWr: number | null;
  curveFit: number; // 0..1
  creatureFit: number; // 0..1
  coreCoverage: number | null; // 0..1
  corePresent: number;
  coreTotal: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Synthétise un "Deck Score" 0-100 à partir des dimensions produites par
 * computeAnalysis (mêmes paramètres que Test my deck : WR moyen, adéquation de
 * courbe, ratio de créatures vs squelette trophée, couverture des core cards).
 */
export function scoreDeckAnalysis(a: DeckAnalysisResult): DeckScore {
  // Champs défensifs : l'edge function est une source externe.
  const mainNonLandNames = a.mainNonLandNames || [];
  const localWrByName = a.localWrByName || {};
  const statByName = a.statByName || {};
  const curveRows = a.curveRows || [];
  const coreCards = a.coreCards || [];

  // WR moyen des cartes non-terrains (contexte archétype puis global en secours)
  const wrs = mainNonLandNames
    .map((n) => localWrByName[n] ?? statByName[n]?.gih_wr ?? null)
    .filter((w): w is number => w != null);
  const avgWr = wrs.length ? wrs.reduce((s, w) => s + w, 0) / wrs.length : null;

  // Puissance : 50% → 0, 60% → 1
  const power = avgWr != null ? clamp01((avgWr - 50) / 10) : 0.5;

  // Courbe : somme des écarts absolus au squelette, 0 écart = 1, ≥12 = 0
  const curveDeltaSum = curveRows.reduce((s, r) => s + Math.abs(r.delta), 0);
  const curveFit = clamp01(1 - curveDeltaSum / 12);

  // Créatures : écart au squelette, 0 = 1, ≥6 = 0
  const creatureDelta = Math.abs(
    (a.creatureCount || 0) - (a.skeletonCreatureCount || 0),
  );
  const creatureFit = clamp01(1 - creatureDelta / 6);

  // Couverture des core cards
  const coreTotal = coreCards.length;
  const corePresent = coreCards.filter((c) => c.present).length;
  const coreCoverage = coreTotal > 0 ? corePresent / coreTotal : null;

  const composite =
    0.4 * power +
    0.2 * curveFit +
    0.15 * creatureFit +
    0.25 * (coreCoverage ?? 0.75);

  return {
    score: Math.round(composite * 100),
    avgWr,
    curveFit,
    creatureFit,
    coreCoverage,
    corePresent,
    coreTotal,
  };
}
