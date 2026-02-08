import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASIC_LAND_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const MAX_CMC_BUCKET = 7;
const STRONG_ADD_SYNERGY_MIN = 2.3;
const STRONG_ADD_MIN_LINKS = 3;
const CACHE_VERSION = 5;
const VARIANT_SWITCH_MARGIN = 0.04;
const COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;
type ManaColor = (typeof COLOR_ORDER)[number];

type ParsedDeckCard = { name: string; qty: number };
type ParsedDeck = {
  mainCards: ParsedDeckCard[];
  sideboardCards: ParsedDeckCard[];
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
  wrSource: "local" | "global" | "none";
};

type PotentialAddCard = {
  name: string;
  qty: number;
  avgSynergy: number;
  supportPairs: number;
  wr: number | null;
  wrSource: "local" | "global" | "none";
  isTop15Importance: boolean;
  hasStrongSynergy: boolean;
  hasStrongWr: boolean;
  matchCount: number;
};

type DeckAnalysisResult = {
  cacheVersion: number;
  format: string;
  matchedArchetype: string;
  matchedIsAlternative: boolean;
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
  recommendations: null;
};

type SkeletonCard = {
  name: string;
  type: string;
};

type ImportanceCard = {
  name: string;
  frequency?: number;
  is_core?: boolean;
};

type SkeletonWithCore = {
  id?: string;
  archetype_name: string;
  is_alternative?: boolean;
  sample_size?: number;
  avg_mana_curve?: Record<string, number>;
  creature_ratio?: number;
  deck_list: SkeletonCard[];
  core_cards?: { name: string; rank: number; frequency: number }[];
  importance_cards?: ImportanceCard[];
};

type SynergyRow = { card_a: string; card_b: string; synergy_score: number | null };

type CardListRow = {
  card_name: string;
  card_cmc: number | null;
  card_type: string | null;
  rarity: string | null;
  colors: string | null;
  card_cost?: string | null;
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const emptyColorRecord = (): Record<ManaColor, number> => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
});

const isManaColor = (value: string): value is ManaColor =>
  (COLOR_ORDER as readonly string[]).includes(value);

const extractColors = (raw: string | null | undefined): ManaColor[] => {
  if (!raw) return [];
  const matches = raw.toUpperCase().match(/[WUBRG]/g);
  if (!matches) return [];
  const unique = [...new Set(matches)].filter(isManaColor);
  return unique.sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
};

const normalizeArchetypeCode = (raw: string): string => extractColors(raw).join("");

const compareSkeletonQuality = (a: SkeletonWithCore, b: SkeletonWithCore): number => {
  const aCoreCount = a.core_cards?.length || 0;
  const bCoreCount = b.core_cards?.length || 0;
  if (aCoreCount !== bCoreCount) return bCoreCount - aCoreCount;
  return (b.sample_size || 0) - (a.sample_size || 0);
};

const parseManaCost = (
  manaCost: string | null | undefined,
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

    if (symbol.includes("/")) {
      const options = extractColors(symbol);
      if (options.length > 0) hybridSymbols.push(options);
    }
  }

  return { fixedPips, hybridSymbols };
};

const parseMtgaDeck = (rawText: string): ParsedDeck => {
  const mainMap = new Map<string, number>();
  const sideMap = new Map<string, number>();
  const lines = rawText.split(/\r?\n/);
  let section: "none" | "main" | "sideboard" = "none";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Deck$/i.test(line)) {
      section = "main";
      continue;
    }
    if (/^Sideboard$/i.test(line)) {
      section = "sideboard";
      continue;
    }
    if (section === "none") continue;

    const mtgaMatch = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/);
    if (!mtgaMatch) continue;

    const qty = Number(mtgaMatch[1]);
    const name = mtgaMatch[2].trim();
    if (!qty || !name) continue;

    const target = section === "main" ? mainMap : sideMap;
    target.set(name, (target.get(name) || 0) + qty);
  }

  return {
    mainCards: [...mainMap.entries()].map(([name, qty]) => ({ name, qty })),
    sideboardCards: [...sideMap.entries()].map(([name, qty]) => ({ name, qty })),
  };
};

const isLandCard = (name: string, metaByName: Record<string, DeckCardMeta>): boolean => {
  if (BASIC_LAND_NAMES.has(name)) return true;
  return (metaByName[name]?.type || "").includes("Land");
};

const isCreatureCard = (name: string, metaByName: Record<string, DeckCardMeta>): boolean =>
  (metaByName[name]?.type || "").includes("Creature");

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

const buildPairMap = (rows: SynergyRow[]): Record<string, Record<string, number>> => {
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

const detectArchetypeFromColors = (
  mainCards: ParsedDeckCard[],
  analysisPool: SkeletonWithCore[],
  metaByName: Record<string, DeckCardMeta>,
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
      (a, b) => seedCardTotals[b] - seedCardTotals[a] || COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b),
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
  const detectedCode = [...detectedColors].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)).join("");

  const exactMatches = analysisPool.filter((candidate) => normalizeArchetypeCode(candidate.archetype_name) === detectedCode);
  if (exactMatches.length > 0) return [...exactMatches].sort(compareSkeletonQuality)[0];

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
      (bestMatch != null && Math.abs(score - bestScore) < 1e-9 && compareSkeletonQuality(candidate, bestMatch) < 0)
    ) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch) return bestMatch;
  return [...analysisPool].sort(compareSkeletonQuality)[0] || null;
};

const buildUserNonLandQtyMap = (
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

const buildSkeletonNonLandQtyMap = (skeleton: SkeletonWithCore): Record<string, number> => {
  const qtyMap: Record<string, number> = {};
  for (const card of skeleton.deck_list || []) {
    if ((card.type || "").includes("Land")) continue;
    qtyMap[card.name] = (qtyMap[card.name] || 0) + 1;
  }
  return qtyMap;
};

const weightedJaccard = (left: Record<string, number>, right: Record<string, number>): number => {
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

type VariantMatchResult = {
  skeleton: SkeletonWithCore;
  score: number;
};

const selectBestSkeletonVariant = (
  archetypeName: string,
  allSkeletons: SkeletonWithCore[],
  userNonLandQtyMap: Record<string, number>,
): VariantMatchResult | null => {
  const candidates = allSkeletons.filter(
    (s) => s.archetype_name === archetypeName && (s.deck_list?.length || 0) > 0,
  );
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((skeleton) => ({
      skeleton,
      score: weightedJaccard(userNonLandQtyMap, buildSkeletonNonLandQtyMap(skeleton)),
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

  if (bestOverall.skeleton.is_alternative && bestOverall.score < bestMain.score + VARIANT_SWITCH_MARGIN) {
    return bestMain;
  }
  return bestOverall;
};

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function secrets.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const mapCardListRowToMeta = (row: CardListRow): DeckCardMeta => ({
  cmc: Number(row.card_cmc ?? 0),
  type: row.card_type || "",
  rarity: row.rarity || null,
  colors: row.colors || null,
  cost: row.card_cost || null,
});

const resolveCardMetaWithSplitFallback = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  inputCardNames: string[],
): Promise<{
  metaByInputName: Record<string, DeckCardMeta>;
  canonicalByInputName: Record<string, string>;
}> => {
  const uniqueNames = [...new Set(inputCardNames)];
  const metaByInputName: Record<string, DeckCardMeta> = {};
  const canonicalByInputName: Record<string, string> = {};

  const withCostQuery = await supabase
    .from("card_list")
    .select("card_name,card_cmc,card_type,rarity,colors,card_cost")
    .eq("set_code", setCode)
    .in("card_name", uniqueNames);
  const fallbackQuery = withCostQuery.error
    ? await supabase
        .from("card_list")
        .select("card_name,card_cmc,card_type,rarity,colors")
        .eq("set_code", setCode)
        .in("card_name", uniqueNames)
    : null;
  const exactRows = (withCostQuery.error ? fallbackQuery?.data : withCostQuery.data) || [];
  const exactError = withCostQuery.error ? fallbackQuery?.error : withCostQuery.error;
  if (exactError) throw exactError;

  const hasCardCost = !withCostQuery.error;
  const selectCols = hasCardCost
    ? "card_name,card_cmc,card_type,rarity,colors,card_cost"
    : "card_name,card_cmc,card_type,rarity,colors";

  for (const row of exactRows as CardListRow[]) {
    metaByInputName[row.card_name] = mapCardListRowToMeta(row);
    canonicalByInputName[row.card_name] = row.card_name;
  }

  const missingNames = uniqueNames.filter((name) => !canonicalByInputName[name]);
  if (missingNames.length > 0) {
    const resolvedRows = await Promise.all(
      missingNames.map(async (inputName) => {
        const { data, error } = await supabase
          .from("card_list")
          .select(selectCols)
          .eq("set_code", setCode)
          .ilike("card_name", `${inputName} //%`)
          .limit(1);
        if (error) throw error;
        return { inputName, row: (data?.[0] as CardListRow | undefined) ?? null };
      }),
    );

    for (const item of resolvedRows) {
      if (!item.row) continue;
      metaByInputName[item.inputName] = mapCardListRowToMeta(item.row);
      canonicalByInputName[item.inputName] = item.row.card_name;
    }
  }

  for (const inputName of uniqueNames) {
    canonicalByInputName[inputName] = canonicalByInputName[inputName] || inputName;
  }

  return { metaByInputName, canonicalByInputName };
};

const buildAnalysis = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  deckText: string,
): Promise<DeckAnalysisResult> => {
  const parsedDeck = parseMtgaDeck(deckText);
  if (parsedDeck.mainCards.length === 0) {
    throw new Error('No valid main deck cards found. Paste an MTGA decklist starting with "Deck".');
  }

  const { data: skeletonsData, error: skeletonsError } = await supabase
    .from("archetypal_skeletons")
    .select("id,archetype_name,is_alternative,sample_size,avg_mana_curve,creature_ratio,deck_list,core_cards,importance_cards")
    .eq("set_code", setCode)
    .eq("format", format);
  if (skeletonsError) throw skeletonsError;
  const allSkeletons = (skeletonsData || []) as SkeletonWithCore[];
  const analysisPool = allSkeletons.filter(
    (s) => !s.is_alternative && (s.sample_size || 0) >= 20,
  );
  if (analysisPool.length === 0) throw new Error(`No skeletons available for ${format}.`);

  const uniqueNames = [...new Set([...parsedDeck.mainCards, ...parsedDeck.sideboardCards].map((c) => c.name))];
  const { metaByInputName: metaByName, canonicalByInputName } = await resolveCardMetaWithSplitFallback(
    supabase,
    setCode,
    uniqueNames,
  );
  const canonicalNames = [...new Set(uniqueNames.map((name) => canonicalByInputName[name] || name))];

  const { data: globalStatsRows, error: globalStatsError } = await supabase
    .from("card_stats")
    .select("card_name,gih_wr,alsa")
    .eq("set_code", setCode)
    .eq("format", format)
    .eq("filter_context", "Global")
    .in("card_name", canonicalNames);
  if (globalStatsError) throw globalStatsError;
  const statByCanonical: Record<string, DeckCardStat> = {};
  for (const row of (globalStatsRows || []) as Array<{
    card_name: string;
    gih_wr: number | null;
    alsa: number | null;
  }>) {
    statByCanonical[row.card_name] = { gih_wr: row.gih_wr, alsa: row.alsa, frequency: null };
  }
  const statByName: Record<string, DeckCardStat> = {};
  for (const inputName of uniqueNames) {
    const canonicalName = canonicalByInputName[inputName] || inputName;
    const stat = statByCanonical[canonicalName];
    if (stat) statByName[inputName] = stat;
  }

  const bestMatch = detectArchetypeFromColors(parsedDeck.mainCards, analysisPool, metaByName);
  if (!bestMatch) throw new Error("Could not detect a matching archetype.");
  const userNonLandQtyMap = buildUserNonLandQtyMap(parsedDeck.mainCards, metaByName);
  const variantMatch = selectBestSkeletonVariant(bestMatch.archetype_name, allSkeletons, userNonLandQtyMap);
  const matchedSkeleton = variantMatch?.skeleton ?? bestMatch;

  const { data: localWrRows, error: localWrError } = await supabase
    .from("card_stats")
    .select("card_name,gih_wr")
    .eq("set_code", setCode)
    .eq("format", format)
    .eq("filter_context", matchedSkeleton.archetype_name)
    .in("card_name", canonicalNames);
  if (localWrError) throw localWrError;
  const localWrByCanonical: Record<string, number | null> = {};
  for (const row of (localWrRows || []) as Array<{ card_name: string; gih_wr: number | null }>) {
    localWrByCanonical[row.card_name] = row.gih_wr;
  }
  const localWrByName: Record<string, number | null> = {};
  for (const inputName of uniqueNames) {
    const canonicalName = canonicalByInputName[inputName] || inputName;
    if (canonicalName in localWrByCanonical) {
      localWrByName[inputName] = localWrByCanonical[canonicalName];
    }
  }

  const { data: avgRows, error: avgError } = await supabase
    .from("archetype_stats")
    .select("archetype_name,win_rate")
    .eq("set_code", setCode)
    .eq("format", format)
    .in("archetype_name", [matchedSkeleton.archetype_name, "All Decks"]);
  if (avgError) throw avgError;
  const archetypeAvgWr = (avgRows || []).find((r) => r.archetype_name === matchedSkeleton.archetype_name)?.win_rate ?? null;
  const globalAvgWr = (avgRows || []).find((r) => r.archetype_name === "All Decks")?.win_rate ?? null;

  const qtyByName = Object.fromEntries(parsedDeck.mainCards.map((c) => [c.name, c.qty]));
  const mainNonLandNames = parsedDeck.mainCards.map((c) => c.name).filter((name) => !isLandCard(name, metaByName));
  const mainNonLandUnique = [...new Set(mainNonLandNames)];
  const canonicalNameOf = (inputName: string): string => canonicalByInputName[inputName] || inputName;

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
  const expectedCreatureRatio = (matchedSkeleton.creature_ratio || 0) * 100;
  const skeletonCreatureCount = (matchedSkeleton.deck_list || []).filter((card) => (card.type || "").includes("Creature")).length;

  const coreCards = (matchedSkeleton.core_cards || []).map((card) => ({
    name: card.name,
    rank: card.rank,
    present: qtyByName[card.name] != null,
  }));

  const importanceByName = Object.fromEntries(
    (matchedSkeleton.importance_cards || []).map((card) => [card.name, { frequency: card.frequency, is_core: card.is_core }]),
  );

  const curveRows: CurveRow[] = Array.from({ length: MAX_CMC_BUCKET }, (_, idx) => idx + 1).map((cmc) => {
    const expected = Number(matchedSkeleton?.avg_mana_curve?.[String(cmc)] || 0);
    const actual = Number(userCurve[cmc] || 0);
    const delta = Number((actual - expected).toFixed(1));
    return { cmc, expected, actual, delta };
  });

  const curveInsights = curveRows.map(curveInsightText).filter((item): item is string => item != null).slice(0, 4);
  if (curveInsights.length === 0) curveInsights.push("Mana curve is close to the skeleton profile. Keep current spread.");

  const mainNonLandSet = new Set(mainNonLandUnique);
  const sideboardCandidates = parsedDeck.sideboardCards
    .filter((card) => !isLandCard(card.name, metaByName))
    .filter((card) => !mainNonLandSet.has(card.name));
  const sideboardQtyByName = Object.fromEntries(sideboardCandidates.map((card) => [card.name, card.qty]));
  const sideboardCandidateUnique = [...new Set(sideboardCandidates.map((card) => card.name))];

  const synergyLookupNames = [
    ...new Set([...mainNonLandUnique, ...sideboardCandidateUnique].map((name) => canonicalNameOf(name))),
  ];
  const { data: pairRowsRaw, error: pairError } = await supabase
    .from("synergy_scores")
    .select("card_a,card_b,synergy_score")
    .eq("set_code", setCode)
    .eq("format", format)
    .in("card_a", synergyLookupNames)
    .in("card_b", synergyLookupNames);
  if (pairError) throw pairError;
  const pairMap = buildPairMap((pairRowsRaw || []) as SynergyRow[]);

  const coreSet = new Set(coreCards.map((card) => card.name));
  const top25Set = new Set(Object.keys(importanceByName));
  const top15ImportanceSet = new Set((matchedSkeleton.importance_cards || []).slice(0, 15).map((card) => card.name));
  const wrBaseline = archetypeAvgWr ?? globalAvgWr ?? 55;

  const lowSynergyCards = mainNonLandUnique
    .map((name) => {
      const canonicalName = canonicalNameOf(name);
      const peers = mainNonLandUnique
        .filter((peer) => peer !== name)
        .map((peer) => canonicalNameOf(peer));
      const { avg, count } = getAverageSynergy(canonicalName, peers, pairMap);
      const localWr = localWrByName[name] ?? null;
      const globalWr = statByName[name]?.gih_wr ?? null;
      const wr = localWr ?? globalWr ?? null;
      const wrSource: "local" | "global" | "none" = localWr != null ? "local" : globalWr != null ? "global" : "none";
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
      const canonicalName = canonicalNameOf(name);
      const canonicalMain = mainNonLandUnique.map((cardName) => canonicalNameOf(cardName));
      const { avg, count } = getAverageSynergy(canonicalName, canonicalMain, pairMap);
      const localWr = localWrByName[name] ?? null;
      const globalWr = statByName[name]?.gih_wr ?? null;
      const wr = localWr ?? globalWr ?? null;
      const wrSource: "local" | "global" | "none" = localWr != null ? "local" : globalWr != null ? "global" : "none";
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
    .sort((a, b) => b.matchCount - a.matchCount || (b.avgSynergy - a.avgSynergy) || ((b.wr ?? -999) - (a.wr ?? -999)))
    .slice(0, 6);

  return {
    cacheVersion: CACHE_VERSION,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { setCode, format, deckText, forceRefresh } = await req.json() as {
      setCode?: string;
      format?: string;
      deckText?: string;
      forceRefresh?: boolean;
    };

    if (!setCode || !format || !deckText) {
      return json(400, { error: "Missing required payload: setCode, format, deckText." });
    }

    const supabase = getSupabaseAdmin();
    const algoVersion = Number(Deno.env.get("ANALYSIS_ALGO_VERSION") ?? "1");
    const ttlSeconds = Number(Deno.env.get("ANALYSIS_CACHE_TTL_SECONDS") ?? "86400");

    const normalizedDeck = deckText.replace(/\r\n/g, "\n").trim();
    const deckHash = await sha256Hex(normalizedDeck);
    const cacheKey = await sha256Hex(`${setCode}|${format}|${deckHash}|v${algoVersion}|schema${CACHE_VERSION}`);

    if (!forceRefresh) {
      const { data: cacheRow } = await supabase
        .from("deck_analysis_cache")
        .select("result,expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cacheRow?.result && cacheRow?.expires_at && new Date(cacheRow.expires_at).getTime() > Date.now()) {
        return json(200, { analysis: cacheRow.result, cached: true });
      }
    }

    const analysis = await buildAnalysis(supabase, setCode, format, normalizedDeck);

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase.from("deck_analysis_cache").upsert({
      cache_key: cacheKey,
      set_code: setCode,
      format,
      archetype_name: analysis.matchedArchetype,
      deck_hash: deckHash,
      algo_version: algoVersion,
      result: analysis,
      expires_at: expiresAt,
      computed_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });

    return json(200, { analysis, cached: false });
  } catch (error) {
    const err = error as {
      name?: unknown;
      message?: unknown;
      error?: unknown;
      stack?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    let message = "Unknown error";
    if (typeof error === "string" && error.length > 0) {
      message = error;
    } else if (typeof err?.message === "string" && err.message.length > 0) {
      message = err.message;
    } else if (typeof err?.error === "string" && err.error.length > 0) {
      message = err.error;
    }

    let raw: string | null = null;
    try {
      raw = JSON.stringify(error);
    } catch {
      raw = String(error);
    }

    console.error("[deck-analysis] request failed", {
      message,
      raw,
      code: err?.code ?? null,
      details: err?.details ?? null,
      hint: err?.hint ?? null,
    });

    return json(500, {
      error: message,
      details: {
        name: typeof err?.name === "string" ? err.name : typeof error,
        code: err?.code ?? null,
        stack: typeof err?.stack === "string" ? err.stack : null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
        raw,
      },
    });
  }
});
