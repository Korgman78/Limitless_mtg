// ─── Sealed Optimizer Edge Function ──────────────────────────────────────────
// POST endpoint that takes an MTGA sealed pool and returns the top 2-3 builds.
// Pattern follows deck-analysis/index.ts.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type CardMeta,
  type CardStat,
  type CurveComponentScales,
  type DeckCard,
  type PoolCard,
  type SearchProfile,
  type ScoreWeights,
  type SealedDeckResult,
  type SealedOptimizerResult,
  type Skeleton,
  type SynergyRow,
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_MAX_OPTIMIZE_MS,
  ITERATION_LIMIT,
  NUM_RESTARTS,
  parsePoolText,
  buildPoolCards,
  buildPairMap,
  scoreDeckWithProvidedLands,
  optimizePool,
  COLOR_ORDER,
} from "../_shared/sealedOptimizerCore.ts";

// ─── HTTP helpers ────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in function secrets.",
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const JOB_TABLE = "sealed_optimizer_jobs";
const DEEP_SHARD_COUNT = 5;
const DEEP_MAX_PARALLEL_SHARDS = 1;
const SHARD_SEED_STRIDE = 1009;
const STALE_RUNNING_TIMEOUT_MS = 35_000;
const FINAL_MMR_LAMBDA = 1.8;
const FINAL_BUILD_COUNT = 3;
const DEEP_SHARD_RESTARTS = 2;
// Canary bump (+~10-15%) to improve search depth while staying worker-safe.
const DEEP_SHARD_ITERATIONS = 40;
const DEEP_SHARD_MAX_MS = 1_650;
const SHARD_PROFILES: SearchProfile[] = [
  "skeleton",
  "power_mana_safe",
  "power_greedy_splash",
  "curve_creatures",
  "synergy_if_online",
];

type JobKind = "single" | "parent" | "shard";

type OptimizationRunPayload = {
  setCode?: string;
  format?: string;
  poolText?: string;
  deckText?: string;
  scoreWeights?: Partial<ScoreWeights>;
  curveComponentScales?: Partial<CurveComponentScales>;
  debug?: boolean;
  debugLimit?: number;
  hcRestarts?: number;
  hcIterations?: number;
  seed?: number;
  maxOptimizeMs?: number;
  searchProfile?: SearchProfile;
};

type ResolvedOptimizationRun = {
  setCode: string;
  format: string;
  poolText: string;
  scoreWeights?: Partial<ScoreWeights>;
  curveComponentScales?: Partial<CurveComponentScales>;
  debug: boolean;
  debugLimit: number;
  hcRestarts: number;
  hcIterations: number;
  seed: number;
  maxOptimizeMs: number;
  searchProfile: SearchProfile;
};

type SealedOptimizerJobRow = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  job_kind: JobKind;
  parent_job_id: string | null;
  shard_index: number | null;
  shard_count: number | null;
  shard_seed: number | null;
  request_payload: ResolvedOptimizationRun | null;
  result_payload: { result?: SealedOptimizerResult; computeTimeMs?: number } | null;
  error_payload: unknown | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  compute_time_ms: number | null;
};

const JOB_SELECT =
  "id,status,job_kind,parent_job_id,shard_index,shard_count,shard_seed,request_payload,result_payload,error_payload,created_at,updated_at,started_at,finished_at,compute_time_ms";

const extractErrorPayload = (error: unknown) => {
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

  return {
    message,
    details: {
      name: typeof err?.name === "string" ? err.name : typeof error,
      code: err?.code ?? null,
      stack: typeof err?.stack === "string" ? err.stack : null,
      details: err?.details ?? null,
      hint: err?.hint ?? null,
      raw,
    },
  };
};

const resolveSearchProfile = (value: unknown): SearchProfile => {
  switch (value) {
    case "skeleton":
    case "power_mana_safe":
    case "power_greedy_splash":
    case "curve_creatures":
    case "synergy_if_online":
      return value;
    default:
      return "skeleton";
  }
};

const resolveOptimizationRun = (
  input: OptimizationRunPayload,
): ResolvedOptimizationRun => {
  const setCode = (input.setCode || "").trim();
  const format = (input.format || "").trim();
  const poolText = input.poolText || "";

  if (!setCode || !format || !poolText) {
    throw new Error("Missing required payload: setCode, format, poolText.");
  }

  return {
    setCode,
    format,
    poolText,
    scoreWeights: input.scoreWeights,
    curveComponentScales: input.curveComponentScales,
    debug: !!input.debug,
    debugLimit: Math.max(1, Math.min(50, Number(input.debugLimit ?? 20) || 20)),
    // No degraded 1x25 profile in API path.
    hcRestarts: Math.max(2, Math.min(8, Number(input.hcRestarts ?? NUM_RESTARTS) || NUM_RESTARTS)),
    hcIterations: Math.max(35, Math.min(120, Number(input.hcIterations ?? ITERATION_LIMIT) || ITERATION_LIMIT)),
    seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) : 1337,
    maxOptimizeMs: Math.max(
      2_000,
      Math.min(10_000, Number(input.maxOptimizeMs ?? DEFAULT_MAX_OPTIMIZE_MS) || DEFAULT_MAX_OPTIMIZE_MS),
    ),
    searchProfile: resolveSearchProfile(input.searchProfile),
  };
};

const missingJobTableHint =
  "Missing table sealed_optimizer_jobs. Create it with: " +
  "create extension if not exists pgcrypto; " +
  "create table if not exists public.sealed_optimizer_jobs (" +
  "id uuid primary key default gen_random_uuid(), " +
  "status text not null default 'queued', " +
  "job_kind text not null default 'single', " +
  "parent_job_id uuid null references public.sealed_optimizer_jobs(id) on delete cascade, " +
  "shard_index integer, shard_count integer, shard_seed integer, " +
  "request_payload jsonb, result_payload jsonb, error_payload jsonb, " +
  "compute_time_ms integer, " +
  "created_at timestamptz not null default now(), " +
  "updated_at timestamptz not null default now(), " +
  "started_at timestamptz, finished_at timestamptz);";

const isMissingJobTableError = (error: unknown): boolean => {
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  const msg = `${String(e?.message ?? "")} ${String(e?.details ?? "")}`.toLowerCase();
  return String(e?.code ?? "") === "42P01" || msg.includes("sealed_optimizer_jobs");
};

const parseIsoMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

type DeckCardLite = { name: string; qty: number };

const deriveShardSeed = (baseSeed: number, shardIndex: number): number =>
  (Math.trunc(baseSeed) + (shardIndex + 1) * SHARD_SEED_STRIDE) >>> 0;

const deckSignature = (cards: DeckCardLite[]): string =>
  cards
    .flatMap((c) => Array(Math.max(0, c.qty || 0)).fill(c.name))
    .sort((a, b) => a.localeCompare(b))
    .join("|");

const multisetJaccard = (a: DeckCardLite[], b: DeckCardLite[]): number => {
  const am = new Map<string, number>();
  const bm = new Map<string, number>();
  for (const c of a) am.set(c.name, (am.get(c.name) || 0) + c.qty);
  for (const c of b) bm.set(c.name, (bm.get(c.name) || 0) + c.qty);
  const keys = new Set([...am.keys(), ...bm.keys()]);
  let inter = 0;
  let uni = 0;
  for (const k of keys) {
    const av = am.get(k) || 0;
    const bv = bm.get(k) || 0;
    inter += Math.min(av, bv);
    uni += Math.max(av, bv);
  }
  return uni > 0 ? inter / uni : 0;
};

// ─── Card metadata resolution with split-card fallback ───────────────────────

type CardListRow = {
  card_name: string;
  card_cmc: number | null;
  card_type: string | null;
  rarity: string | null;
  colors: string | null;
  card_cost?: string | null;
  oracle_text?: string | null;
  is_removal?: boolean;
  is_mana_producer?: boolean;
  produced_colours?: string | null;
  dependency_tags?: string[] | null;
  dependency_min_support?: number | null;
  dependency_scope?: string | null;
  token_support_tags?: string[] | null;
  token_support_count?: number | null;
  support_tags?: string[] | null;
};

const CARD_LIST_COLS_BASE =
  "card_name,card_cmc,card_type,rarity,colors,card_cost,oracle_text,is_removal,is_mana_producer,produced_colours,dependency_tags,dependency_min_support,dependency_scope";
const CARD_LIST_COLS_WITH_TOKEN =
  `${CARD_LIST_COLS_BASE},token_support_tags,token_support_count,support_tags`;

const resolveCardMeta = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  inputNames: string[],
): Promise<{
  metaMap: Map<string, CardMeta>;
  canonicalByInput: Record<string, string>;
}> => {
  const uniqueNames = [...new Set(inputNames)];
  const metaMap = new Map<string, CardMeta>();
  const canonicalByInput: Record<string, string> = {};

  // Try with all columns first; fallback without new columns
  const fullQuery = await supabase
    .from("card_list")
    .select(CARD_LIST_COLS_WITH_TOKEN)
    .eq("set_code", setCode)
    .in("card_name", uniqueNames);

  const legacyFullQuery = fullQuery.error
    ? await supabase
        .from("card_list")
        .select(CARD_LIST_COLS_BASE)
        .eq("set_code", setCode)
        .in("card_name", uniqueNames)
    : null;

  const fallbackQuery = (fullQuery.error && legacyFullQuery?.error)
    ? await supabase
        .from("card_list")
        .select("card_name,card_cmc,card_type,rarity,colors,card_cost")
        .eq("set_code", setCode)
        .in("card_name", uniqueNames)
    : null;

  const exactRows =
    (!fullQuery.error
      ? fullQuery.data
      : (!legacyFullQuery?.error ? legacyFullQuery?.data : fallbackQuery?.data)
    ) || [];
  const queryError = !fullQuery.error
    ? fullQuery.error
    : (!legacyFullQuery?.error ? legacyFullQuery?.error : fallbackQuery?.error);
  if (queryError) throw queryError;

  const hasNewCols = !fullQuery.error || !legacyFullQuery?.error;
  const selectCols = hasNewCols
    ? (!fullQuery.error ? CARD_LIST_COLS_WITH_TOKEN : CARD_LIST_COLS_BASE)
    : "card_name,card_cmc,card_type,rarity,colors,card_cost";

  for (const row of exactRows as CardListRow[]) {
    metaMap.set(row.card_name, rowToMeta(row, hasNewCols));
    canonicalByInput[row.card_name] = row.card_name;
  }

  // Split card fallback for missing names
  const missingNames = uniqueNames.filter(
    (name) => !canonicalByInput[name],
  );
  if (missingNames.length > 0) {
    const resolved = await Promise.all(
      missingNames.map(async (inputName) => {
        const { data, error } = await supabase
          .from("card_list")
          .select(selectCols)
          .eq("set_code", setCode)
          .ilike("card_name", `${inputName} //%`)
          .limit(1);
        if (error) throw error;
        return {
          inputName,
          row: (data?.[0] as CardListRow | undefined) ?? null,
        };
      }),
    );

    for (const item of resolved) {
      if (!item.row) continue;
      metaMap.set(item.inputName, rowToMeta(item.row, hasNewCols));
      canonicalByInput[item.inputName] = item.row.card_name;
    }
  }

  // Ensure every input name has a canonical mapping
  for (const name of uniqueNames) {
    canonicalByInput[name] = canonicalByInput[name] || name;
  }

  return { metaMap, canonicalByInput };
};

const rowToMeta = (row: CardListRow, hasNewCols: boolean): CardMeta => ({
  card_name: row.card_name,
  colors: row.colors || null,
  card_cmc: row.card_cmc,
  card_cost: row.card_cost || null,
  card_type: row.card_type || null,
  rarity: row.rarity || null,
  oracle_text: hasNewCols ? (row.oracle_text || null) : null,
  is_removal: hasNewCols ? (row.is_removal ?? false) : false,
  is_mana_producer: hasNewCols ? (row.is_mana_producer ?? false) : false,
  produced_colours: hasNewCols ? (row.produced_colours || null) : null,
  dependency_tags: hasNewCols ? (row.dependency_tags || []) : [],
  dependency_min_support: hasNewCols ? (row.dependency_min_support ?? null) : null,
  dependency_scope: hasNewCols ? (row.dependency_scope || null) : null,
  token_support_tags: hasNewCols ? (row.token_support_tags || []) : [],
  support_tags: hasNewCols ? (row.support_tags || []) : [],
  token_support_count: hasNewCols ? (row.token_support_count ?? null) : null,
});

const splitCardBase = (name: string): string =>
  name.includes(" //") ? name.split(" //")[0].trim() : name.trim();

const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s*\/\/\s*/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const nameAliases = (name: string): string[] => {
  const base = splitCardBase(name);
  return [...new Set([name.trim(), base])].filter(Boolean);
};

const sanitizeScoreWeights = (input?: Partial<ScoreWeights>): ScoreWeights => {
  const toWeight = (value: unknown, fallback: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(4, Math.max(0, n));
  };
  // Backward compatibility with previous payload keys.
  const legacy = input as Partial<{
    wr: number;
    consistency: number;
    curve: number;
    synergy: number;
    skeleton: number;
    penalties: number;
  }> | undefined;

  return {
    power: toWeight(
      input?.power ?? legacy?.wr,
      DEFAULT_SCORE_WEIGHTS.power,
    ),
    consistency: toWeight(
      input?.consistency ?? legacy?.penalties,
      DEFAULT_SCORE_WEIGHTS.consistency,
    ),
    curve: toWeight(input?.curve, DEFAULT_SCORE_WEIGHTS.curve),
    synergy: toWeight(input?.synergy, DEFAULT_SCORE_WEIGHTS.synergy),
  };
};

const normalizeFormat = (raw: string): string => {
  const value = (raw || "").trim();
  if (value === "ArenaDirectSealed") return "ArenaDirect_Sealed";
  if (value === "Arena Direct Sealed") return "ArenaDirect_Sealed";
  if (value === "Sealed") return "ArenaDirect_Sealed";
  return value;
};

const BASIC_LANDS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const MANA_COLORS = [...COLOR_ORDER];
const MANA_COLOR_SET = new Set<string>(MANA_COLORS);
const BASIC_TO_COLOR: Record<string, string> = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
};

type LoadedOptimizationContext = {
  normalizedFormat: string;
  queryFormats: string[];
  primaryFormatMean: number;
  metaMap: Map<string, CardMeta>;
  canonicalByInput: Record<string, string>;
  wrByInput: Map<string, number>;
  pairMap: Record<string, Record<string, number>>;
  skeletons: Skeleton[];
};

const parseDeckMainText = (text: string): { name: string; qty: number }[] => {
  const rows: { name: string; qty: number }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^Deck$/i.test(line)) continue;
    if (/^Sideboard$/i.test(line)) break;
    const match = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?)?$/);
    if (!match) continue;
    const qty = Number(match[1]);
    const name = match[2].trim();
    if (!qty || !name) continue;
    rows.push({ name, qty });
  }
  return rows;
};

const extractCostDemand = (cost: string | null | undefined): Record<string, number> => {
  const demand: Record<string, number> = {};
  const symbols = [...String(cost || "").toUpperCase().matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
  for (const symbol of symbols) {
    if (MANA_COLOR_SET.has(symbol)) {
      demand[symbol] = (demand[symbol] || 0) + 1;
      continue;
    }
    if (symbol.includes("/")) {
      const parts = symbol.split("/").filter((p) => MANA_COLOR_SET.has(p));
      if (parts.length === 0) continue;
      const share = 1 / parts.length;
      for (const p of parts) demand[p] = (demand[p] || 0) + share;
    }
  }
  return demand;
};

const extractTextColors = (raw: string | null | undefined): string[] =>
  String(raw || "")
    .toUpperCase()
    .split("")
    .filter((c) => MANA_COLOR_SET.has(c));

const deriveDeckColorPlan = (
  cards: DeckCard[],
  poolCards: PoolCard[],
  landsProvided: DeckCard[],
): { mainColors: string[]; splashColor: string | null } => {
  const poolMap = new Map<string, PoolCard>();
  for (const pc of poolCards) poolMap.set(pc.name, pc);

  const spellDemand: Record<string, number> = {};
  const landDemand: Record<string, number> = {};
  for (const c of MANA_COLORS) {
    spellDemand[c] = 0;
    landDemand[c] = 0;
  }

  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    const fromCost = extractCostDemand(pc.cost);
    for (const color of MANA_COLORS) {
      const value = fromCost[color] || 0;
      if (value > 0) spellDemand[color] += value * dc.qty;
    }
    if (Object.values(fromCost).every((v) => v <= 0)) {
      const fallback = extractTextColors(pc.colors);
      for (const color of fallback) spellDemand[color] += 0.5 * dc.qty;
    }
  }

  for (const land of landsProvided) {
    if (BASIC_LANDS.has(land.name)) {
      const basicColor =
        land.name === "Plains"
          ? "W"
          : land.name === "Island"
            ? "U"
            : land.name === "Swamp"
              ? "B"
              : land.name === "Mountain"
                ? "R"
                : "G";
      landDemand[basicColor] += land.qty;
    }
  }

  const useLandPlan = Object.values(landDemand).some((v) => v > 0);
  const source = useLandPlan ? landDemand : spellDemand;
  const ordered = [...MANA_COLORS]
    .map((c) => ({ c, v: source[c] || 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);

  if (ordered.length === 0) return { mainColors: ["W", "U"], splashColor: null };
  if (ordered.length === 1) return { mainColors: [ordered[0].c], splashColor: null };

  const second = ordered[1]?.v || 0;
  const third = ordered[2]?.v || 0;
  const includeThirdAsMain = third > 0 && (useLandPlan ? third >= Math.max(3, second * 0.5) : third >= second * 0.7);

  const mainColors = includeThirdAsMain
    ? ordered.slice(0, 3).map((x) => x.c)
    : ordered.slice(0, 2).map((x) => x.c);

  const splashColor = includeThirdAsMain
    ? (ordered[3]?.c || null)
    : (ordered[2]?.c || null);

  return { mainColors, splashColor };
};

const buildProvidedLandPoolCard = (
  name: string,
  qty: number,
  meta: CardMeta | undefined,
): PoolCard => {
  const basicColor = BASIC_TO_COLOR[name];
  const produced = meta?.produced_colours || (basicColor || "");
  return {
    name,
    qty,
    wr: 0,
    colors: meta?.colors || (basicColor || ""),
    cmc: Number(meta?.card_cmc ?? 0),
    cost: meta?.card_cost || null,
    type: meta?.card_type || "Land",
    rarity: meta?.rarity || "common",
    isCreature: false,
    isRemoval: false,
    isManaProducer: meta?.is_mana_producer ?? true,
    producedColours: produced || null,
    oracleText: meta?.oracle_text || null,
    dependencyTags: [],
    dependencyMinSupport: null,
    dependencyScope: null,
    tokenSupportTags: [],
    tokenSupportCount: 0,
  };
};

const parseSkeletonColors = (archetypeName: string): string[] => {
  const colors: string[] = [];
  for (const ch of String(archetypeName || "")) {
    const up = ch.toUpperCase();
    if (!MANA_COLOR_SET.has(up)) continue;
    if (!colors.includes(up)) colors.push(up);
  }
  return colors;
};

const findBestSkeletonForPlan = (
  skeletons: Skeleton[],
  mainColors: string[],
): Skeleton | null => {
  if (!skeletons.length || !mainColors.length) return null;
  const target = new Set(mainColors);
  let best: Skeleton | null = null;
  let bestTuple: [number, number, number] = [-1, -1, -1]; // overlap, nonAlt, sample

  for (const s of skeletons) {
    const colors = parseSkeletonColors(s.archetype_name);
    if (!colors.length) continue;
    const sset = new Set(colors);
    let overlap = 0;
    for (const c of target) if (sset.has(c)) overlap++;
    if (overlap === 0) continue;
    const exact = overlap === target.size && target.size === sset.size ? 1 : 0;
    const nonAlt = s.is_alternative ? 0 : 1;
    const sample = Number(s.sample_size || 0);
    const tuple: [number, number, number] = [exact ? 100 + overlap : overlap, nonAlt, sample];
    if (
      tuple[0] > bestTuple[0] ||
      (tuple[0] === bestTuple[0] && tuple[1] > bestTuple[1]) ||
      (tuple[0] === bestTuple[0] && tuple[1] === bestTuple[1] && tuple[2] > bestTuple[2])
    ) {
      best = s;
      bestTuple = tuple;
    }
  }
  return best;
};

const formatArchetypeCode = (mainColors: string[], splashColor: string | null): string => {
  const head = [...mainColors].join("");
  if (!splashColor) return head;
  return `${head}${splashColor.toLowerCase()}`;
};

const loadOptimizationContext = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  inputNames: string[],
): Promise<LoadedOptimizationContext> => {
  const normalizedFormat = normalizeFormat(format);
  const queryFormats =
    normalizedFormat === "ArenaDirect_Sealed"
      ? ["ArenaDirect_Sealed", "TradDraft"]
      : [normalizedFormat];

  const formatMeanCache = new Map<string, number>();
  const getFormatGlobalMean = async (queryFormat: string): Promise<number> => {
    const cached = formatMeanCache.get(queryFormat);
    if (cached != null) return cached;
    const { data: meanRows, error: meanError } = await supabase
      .from("archetype_stats")
      .select("win_rate")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .eq("archetype_name", "All Decks")
      .limit(1);
    if (meanError) throw meanError;
    const mean = Number((meanRows?.[0] as { win_rate?: number | null } | undefined)?.win_rate);
    const resolvedMean = Number.isFinite(mean) ? mean : 55;
    formatMeanCache.set(queryFormat, resolvedMean);
    return resolvedMean;
  };

  const { metaMap, canonicalByInput } = await resolveCardMeta(
    supabase,
    setCode,
    inputNames,
  );
  const canonicalNames = [...new Set(inputNames.map((name) => canonicalByInput[name]))];
  const statsSynergyQueryNames = [...new Set(canonicalNames.flatMap((name) => nameAliases(name)))];

  const aliasToInput = new Map<string, string>();
  for (const inputName of inputNames) {
    const canonical = canonicalByInput[inputName] || inputName;
    for (const alias of [...nameAliases(inputName), ...nameAliases(canonical)]) {
      const key = normalizeName(alias);
      if (!aliasToInput.has(key)) aliasToInput.set(key, inputName);
    }
  }

  const wrByNormalized = new Map<string, number>();
  let primaryMean: number | null = null;

  for (let fi = 0; fi < queryFormats.length; fi++) {
    const queryFormat = queryFormats[fi];
    const { data: statsRows, error: statsError } = await supabase
      .from("card_stats")
      .select("card_name,gih_wr,filter_context")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .eq("filter_context", "Global")
      .in("card_name", statsSynergyQueryNames);
    if (statsError) throw statsError;

    const globalStats = (statsRows || []) as CardStat[];
    const formatMean = await getFormatGlobalMean(queryFormat);
    if (fi === 0) {
      primaryMean = formatMean;
      for (const row of globalStats) {
        if (row.gih_wr == null) continue;
        const norm = normalizeName(row.card_name);
        if (!wrByNormalized.has(norm)) wrByNormalized.set(norm, row.gih_wr);
      }
    } else {
      const offset = (primaryMean ?? 50) - formatMean;
      for (const row of globalStats) {
        if (row.gih_wr == null) continue;
        const norm = normalizeName(row.card_name);
        if (!wrByNormalized.has(norm)) wrByNormalized.set(norm, row.gih_wr + offset);
      }
    }
    if (wrByNormalized.size >= canonicalNames.length) break;
  }

  const wrByInput = new Map<string, number>();
  for (const inputName of inputNames) {
    const canonical = canonicalByInput[inputName];
    const candidates = [...nameAliases(inputName), ...nameAliases(canonical)];
    let wr: number | undefined;
    for (const c of candidates) {
      wr = wrByNormalized.get(normalizeName(c));
      if (wr != null) break;
    }
    if (wr != null) wrByInput.set(inputName, wr);
  }

  const unresolvedInputs = inputNames.filter((name) => !wrByInput.has(name));
  const unresolvedSplitBaseByInput = new Map<string, string>();
  for (const inputName of unresolvedInputs) {
    const canonical = canonicalByInput[inputName] || inputName;
    const base = splitCardBase(canonical);
    if (base && base !== canonical) unresolvedSplitBaseByInput.set(inputName, base);
  }

  if (unresolvedSplitBaseByInput.size > 0) {
    const unresolvedBases = [...new Set(unresolvedSplitBaseByInput.values())];
    const wrByBaseNorm = new Map<string, number>();
    for (let fi = 0; fi < queryFormats.length; fi++) {
      const queryFormat = queryFormats[fi];
      const { data: splitRows, error: splitErr } = await supabase
        .from("card_stats")
        .select("card_name,gih_wr,filter_context")
        .eq("set_code", setCode)
        .eq("format", queryFormat)
        .eq("filter_context", "Global")
        .in("card_name", unresolvedBases);
      if (splitErr) throw splitErr;
      const validRows = ((splitRows || []) as CardStat[]).filter((r) => r.gih_wr != null);
      const formatMean = await getFormatGlobalMean(queryFormat);
      const splitOffset = fi > 0 ? (primaryMean ?? 50) - formatMean : 0;
      for (const row of validRows) {
        const norm = normalizeName(row.card_name);
        if (!wrByBaseNorm.has(norm)) wrByBaseNorm.set(norm, row.gih_wr! + splitOffset);
      }
      if (wrByBaseNorm.size >= unresolvedBases.length) break;
    }
    for (const [inputName, base] of unresolvedSplitBaseByInput) {
      const wr = wrByBaseNorm.get(normalizeName(base));
      if (wr != null) wrByInput.set(inputName, wr);
    }
  }

  const synergyRowsByKey = new Map<string, SynergyRow>();
  for (const queryFormat of queryFormats) {
    const { data: synergyRows, error: synergyError } = await supabase
      .from("synergy_scores")
      .select("card_a,card_b,synergy_score")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .in("card_a", statsSynergyQueryNames)
      .in("card_b", statsSynergyQueryNames);
    if (synergyError) throw synergyError;
    for (const row of (synergyRows || []) as SynergyRow[]) {
      const normA = normalizeName(row.card_a);
      const normB = normalizeName(row.card_b);
      const mappedA = aliasToInput.get(normA) || row.card_a;
      const mappedB = aliasToInput.get(normB) || row.card_b;
      const left = mappedA <= mappedB ? mappedA : mappedB;
      const right = mappedA <= mappedB ? mappedB : mappedA;
      const key = `${left}::${right}`;
      if (!synergyRowsByKey.has(key)) {
        synergyRowsByKey.set(key, {
          card_a: left,
          card_b: right,
          synergy_score: row.synergy_score,
        });
      }
    }
  }
  const pairMap = buildPairMap([...synergyRowsByKey.values()]);

  let skeletons: Skeleton[] = [];
  for (const queryFormat of queryFormats) {
    const { data: skeletonsData, error: skeletonsError } = await supabase
      .from("archetypal_skeletons")
      .select(
        "archetype_name,is_alternative,sample_size,avg_mana_curve,creature_ratio,deck_list,core_cards,importance_cards",
      )
      .eq("set_code", setCode)
      .eq("format", queryFormat);
    if (skeletonsError) throw skeletonsError;
    if ((skeletonsData || []).length > 0) {
      skeletons = (skeletonsData || []) as Skeleton[];
      break;
    }
  }

  const primaryFormatMean = await getFormatGlobalMean(queryFormats[0]);

  return {
    normalizedFormat,
    queryFormats,
    primaryFormatMean,
    metaMap,
    canonicalByInput,
    wrByInput,
    pairMap,
    skeletons,
  };
};

// ─── Build analysis ──────────────────────────────────────────────────────────

const buildOptimization = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  poolText: string,
  scoreWeights?: Partial<ScoreWeights>,
  curveComponentScales?: Partial<CurveComponentScales>,
  debug = false,
  debugLimit = 20,
  searchProfile: SearchProfile = "skeleton",
  hcRestarts = NUM_RESTARTS,
  hcIterations = ITERATION_LIMIT,
  seed = 1337,
  maxOptimizeMs = DEFAULT_MAX_OPTIMIZE_MS,
): Promise<SealedOptimizerResult> => {
  const weights = sanitizeScoreWeights(scoreWeights);
  const normalizedFormat = normalizeFormat(format);
  // Canonical backbone for sealed: ArenaDirect_Sealed, then TradDraft.
  const queryFormats =
    normalizedFormat === "ArenaDirect_Sealed"
      ? ["ArenaDirect_Sealed", "TradDraft"]
      : [normalizedFormat];

  const formatMeanCache = new Map<string, number>();
  const getFormatGlobalMean = async (queryFormat: string): Promise<number> => {
    const cached = formatMeanCache.get(queryFormat);
    if (cached != null) return cached;

    const { data: meanRows, error: meanError } = await supabase
      .from("archetype_stats")
      .select("win_rate")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .eq("archetype_name", "All Decks")
      .limit(1);
    if (meanError) throw meanError;

    const mean = Number((meanRows?.[0] as { win_rate?: number | null } | undefined)?.win_rate);
    const resolvedMean = Number.isFinite(mean) ? mean : 55;
    formatMeanCache.set(queryFormat, resolvedMean);
    return resolvedMean;
  };

  // 1. Parse pool
  const parsedPool = parsePoolText(poolText);
  if (parsedPool.length === 0) {
    throw new Error("No valid cards found in pool text.");
  }
  const poolTotalQty = parsedPool.reduce((sum, c) => sum + Math.max(0, c.qty || 0), 0);
  const inputNames = parsedPool.map((c) => c.name);

  const effectiveHcRestarts = Math.max(1, Math.min(8, Math.trunc(hcRestarts)));
  const effectiveHcIterations = Math.max(10, Math.min(120, Math.trunc(hcIterations)));
  const effectiveMaxOptimizeMs = Math.max(1_000, Math.min(10_000, Math.trunc(maxOptimizeMs)));

  // 2. Resolve card metadata
  const { metaMap, canonicalByInput } = await resolveCardMeta(
    supabase,
    setCode,
    inputNames,
  );
  const canonicalNames = [
    ...new Set(inputNames.map((name) => canonicalByInput[name])),
  ];
  const statsSynergyQueryNames = [
    ...new Set(canonicalNames.flatMap((name) => nameAliases(name))),
  ];

  const aliasToInput = new Map<string, string>();
  for (const inputName of inputNames) {
    const canonical = canonicalByInput[inputName] || inputName;
    for (const alias of [...nameAliases(inputName), ...nameAliases(canonical)]) {
      const key = normalizeName(alias);
      if (!aliasToInput.has(key)) aliasToInput.set(key, inputName);
    }
  }

  // 3. Fetch card stats with fallback formats.
  //    When falling back to a secondary format (e.g. TradDraft), normalize WR
  //    by delta-to-mean so that format-wide WR differences don't inflate cards.
  //    Formula: adjusted_wr = primary_mean + (fallback_wr - fallback_mean)
  const wrByNormalized = new Map<string, number>();
  let primaryMean: number | null = null;

  for (let fi = 0; fi < queryFormats.length; fi++) {
    const queryFormat = queryFormats[fi];
    const { data: statsRows, error: statsError } = await supabase
      .from("card_stats")
      .select("card_name,gih_wr,filter_context")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .eq("filter_context", "Global")
      .in("card_name", statsSynergyQueryNames);
    if (statsError) throw statsError;

    const globalStats = (statsRows || []) as CardStat[];
    const formatMean = await getFormatGlobalMean(queryFormat);

    if (fi === 0) {
      // Primary format — store WR as-is and remember mean
      primaryMean = formatMean;
      for (const row of globalStats) {
        if (row.gih_wr == null) continue;
        const norm = normalizeName(row.card_name);
        if (!wrByNormalized.has(norm)) {
          wrByNormalized.set(norm, row.gih_wr);
        }
      }
    } else {
      // Fallback format — normalize by delta-to-mean
      const offset = (primaryMean ?? 50) - formatMean;
      for (const row of globalStats) {
        if (row.gih_wr == null) continue;
        const norm = normalizeName(row.card_name);
        if (!wrByNormalized.has(norm)) {
          wrByNormalized.set(norm, row.gih_wr + offset);
        }
      }
    }
    if (wrByNormalized.size >= canonicalNames.length) break;
  }

  // Map input names to canonical WR
  const wrByInput = new Map<string, number>();
  for (const inputName of inputNames) {
    const canonical = canonicalByInput[inputName];
    const candidates = [...nameAliases(inputName), ...nameAliases(canonical)];
    let wr: number | undefined;
    for (const c of candidates) {
      wr = wrByNormalized.get(normalizeName(c));
      if (wr != null) break;
    }
    if (wr != null) wrByInput.set(inputName, wr);
  }

  // Safety net for DFC/split cards: if WR is still missing, fetch by split base name.
  const unresolvedInputs = inputNames.filter((name) => !wrByInput.has(name));
  const unresolvedSplitBaseByInput = new Map<string, string>();
  for (const inputName of unresolvedInputs) {
    const canonical = canonicalByInput[inputName] || inputName;
    const base = splitCardBase(canonical);
    if (base && base !== canonical) {
      unresolvedSplitBaseByInput.set(inputName, base);
    }
  }
  if (unresolvedSplitBaseByInput.size > 0) {
    const unresolvedBases = [
      ...new Set(unresolvedSplitBaseByInput.values()),
    ];
    const wrByBaseNorm = new Map<string, number>();

    for (let fi = 0; fi < queryFormats.length; fi++) {
      const queryFormat = queryFormats[fi];
      const { data: splitRows, error: splitErr } = await supabase
        .from("card_stats")
        .select("card_name,gih_wr,filter_context")
        .eq("set_code", setCode)
        .eq("format", queryFormat)
        .eq("filter_context", "Global")
        .in("card_name", unresolvedBases);
      if (splitErr) throw splitErr;
      const validRows = ((splitRows || []) as CardStat[]).filter((r) => r.gih_wr != null);
      // Apply same delta-to-mean normalization for fallback formats
      const formatMean = await getFormatGlobalMean(queryFormat);
      const splitOffset = fi > 0 ? (primaryMean ?? 50) - formatMean : 0;
      for (const row of validRows) {
        const norm = normalizeName(row.card_name);
        if (!wrByBaseNorm.has(norm)) wrByBaseNorm.set(norm, row.gih_wr! + splitOffset);
      }
      if (wrByBaseNorm.size >= unresolvedBases.length) break;
    }

    for (const [inputName, base] of unresolvedSplitBaseByInput) {
      const wr = wrByBaseNorm.get(normalizeName(base));
      if (wr != null) wrByInput.set(inputName, wr);
    }
  }

  // 4. Fetch synergy scores with format fallback.
  const synergyRowsByKey = new Map<string, SynergyRow>();
  for (const queryFormat of queryFormats) {
    const { data: synergyRows, error: synergyError } = await supabase
      .from("synergy_scores")
      .select("card_a,card_b,synergy_score")
      .eq("set_code", setCode)
      .eq("format", queryFormat)
      .in("card_a", statsSynergyQueryNames)
      .in("card_b", statsSynergyQueryNames);
    if (synergyError) throw synergyError;
    for (const row of (synergyRows || []) as SynergyRow[]) {
      const normA = normalizeName(row.card_a);
      const normB = normalizeName(row.card_b);
      const mappedA = aliasToInput.get(normA) || row.card_a;
      const mappedB = aliasToInput.get(normB) || row.card_b;
      const left = mappedA <= mappedB ? mappedA : mappedB;
      const right = mappedA <= mappedB ? mappedB : mappedA;
      const key = `${left}::${right}`;
      if (!synergyRowsByKey.has(key)) {
        synergyRowsByKey.set(key, {
          card_a: left,
          card_b: right,
          synergy_score: row.synergy_score,
        });
      }
    }
  }
  const pairMap = buildPairMap([...synergyRowsByKey.values()]);

  // 5. Fetch skeletons with fallback formats.
  let skeletons: Skeleton[] = [];
  for (const queryFormat of queryFormats) {
    const { data: skeletonsData, error: skeletonsError } = await supabase
      .from("archetypal_skeletons")
      .select(
        "archetype_name,is_alternative,sample_size,avg_mana_curve,creature_ratio,deck_list,core_cards,importance_cards",
      )
      .eq("set_code", setCode)
      .eq("format", queryFormat);
    if (skeletonsError) throw skeletonsError;
    if ((skeletonsData || []).length > 0) {
      skeletons = (skeletonsData || []) as Skeleton[];
      break;
    }
  }

  // 6. Build enriched pool cards
  const poolCards = buildPoolCards(parsedPool, metaMap, wrByInput);


  // 7. Run optimizer
  const primaryFormatMean = await getFormatGlobalMean(queryFormats[0]);
  const result = optimizePool(
    poolCards,
    pairMap,
    skeletons,
    weights,
    primaryFormatMean,
    curveComponentScales,
    debug,
    debugLimit,
    searchProfile,
    effectiveHcRestarts,
    effectiveHcIterations,
    seed,
    effectiveMaxOptimizeMs,
  );
  result.setCode = setCode;
  result.format = normalizedFormat;

  return result;
};

const buildMetaByNamePayload = (
  names: string[],
  metaMap: Map<string, CardMeta>,
): Record<string, { cmc: number; type: string; colors: string | null; cost: string | null; rarity: string | null }> => {
  const out: Record<string, { cmc: number; type: string; colors: string | null; cost: string | null; rarity: string | null }> = {};
  for (const name of names) {
    if (BASIC_LANDS.has(name)) {
      out[name] = { cmc: 0, type: "Basic Land", colors: null, cost: null, rarity: null };
      continue;
    }
    const meta = metaMap.get(name);
    if (!meta) continue;
    out[name] = {
      cmc: Number(meta.card_cmc ?? 0),
      type: meta.card_type || "",
      colors: meta.colors || null,
      cost: meta.card_cost || null,
      rarity: meta.rarity || null,
    };
  }
  return out;
};

const scoreCustomDeck = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  deckText: string,
  scoreWeights?: Partial<ScoreWeights>,
  curveComponentScales?: Partial<CurveComponentScales>,
): Promise<{
  build: SealedDeckResult;
  metaByName: Record<string, { cmc: number; type: string; colors: string | null; cost: string | null; rarity: string | null }>;
}> => {
  const parsedMain = parseDeckMainText(deckText);
  if (parsedMain.length === 0) {
    throw new Error("No valid cards found in custom deck text.");
  }

  const nonBasicInputNames = parsedMain
    .map((c) => c.name)
    .filter((name) => !BASIC_LANDS.has(name));
  if (nonBasicInputNames.length === 0) {
    throw new Error("Custom deck has no non-land cards to score.");
  }

  const context = await loadOptimizationContext(
    supabase,
    setCode,
    format,
    nonBasicInputNames,
  );

  const providedLands: DeckCard[] = [];
  const nonLandParsed: { name: string; qty: number }[] = [];

  for (const row of parsedMain) {
    if (BASIC_LANDS.has(row.name)) {
      providedLands.push({ name: row.name, qty: row.qty });
      continue;
    }
    const meta = context.metaMap.get(row.name);
    const typeLine = String(meta?.card_type || "");
    if (typeLine.includes("Land")) {
      providedLands.push({ name: row.name, qty: row.qty });
      continue;
    }
    nonLandParsed.push(row);
  }

  if (nonLandParsed.length === 0) {
    throw new Error("Custom deck has no spells to score.");
  }

  const poolCards = buildPoolCards(nonLandParsed, context.metaMap, context.wrByInput);
  if (poolCards.length === 0) {
    throw new Error("No scorable cards found (missing WR data for all custom deck spells).");
  }

  const cards: DeckCard[] = poolCards.map((pc) => ({ name: pc.name, qty: pc.qty }));
  const scoringPoolMap = new Map<string, PoolCard>();
  for (const pc of poolCards) scoringPoolMap.set(pc.name, pc);
  for (const land of providedLands) {
    if (scoringPoolMap.has(land.name)) continue;
    const landMeta = context.metaMap.get(land.name);
    const poolCard = buildProvidedLandPoolCard(land.name, land.qty, landMeta);
    scoringPoolMap.set(land.name, poolCard);
  }
  const scoringPool = [...scoringPoolMap.values()];

  const weights = sanitizeScoreWeights(scoreWeights);
  const plan = deriveDeckColorPlan(cards, poolCards, providedLands);
  const skeleton = findBestSkeletonForPlan(context.skeletons, plan.mainColors);
  const scored = scoreDeckWithProvidedLands(
    cards,
    scoringPool,
    context.pairMap,
    plan.mainColors,
    plan.splashColor,
    skeleton,
    providedLands,
    weights,
    context.primaryFormatMean,
    curveComponentScales,
  );

  const allNames = [
    ...new Set([
      ...cards.map((c) => c.name),
      ...scored.lands.map((l) => l.name),
    ]),
  ];
  const archetype = formatArchetypeCode(plan.mainColors, plan.splashColor);
  const totalCards = cards.reduce((s, c) => s + c.qty, 0) + scored.lands.reduce((s, l) => s + l.qty, 0);

  return {
    build: {
      rank: 1,
      score: Number(scored.score.toFixed(2)),
      archetype,
      mainColors: plan.mainColors,
      splashColor: plan.splashColor,
      cards,
      lands: scored.lands,
      stats: {
        ...scored.stats,
        avgCmc: Number(scored.stats.avgCmc.toFixed(2)),
        skeletonSimilarity: Number(scored.stats.skeletonSimilarity.toFixed(3)),
        totalCards,
      },
      scoreBreakdown: {
        wrScore: Number(scored.breakdown.wrScore.toFixed(2)),
        synergyScore: Number(scored.breakdown.synergyScore.toFixed(4)),
        wrNormalized: Number(scored.breakdown.wrNormalized.toFixed(2)),
        synergyBaseNormalized: Number(scored.breakdown.synergyBaseNormalized.toFixed(2)),
        dependencyAxisScale: Number(scored.breakdown.dependencyAxisScale.toFixed(4)),
        dependencyAxisDelta: Number(scored.breakdown.dependencyAxisDelta.toFixed(2)),
        synergyNormalized: Number(scored.breakdown.synergyNormalized.toFixed(2)),
        qualityScore: Number(scored.breakdown.qualityScore.toFixed(2)),
        powerWeightedContribution: Number(scored.breakdown.powerWeightedContribution.toFixed(2)),
        synergyWeightedContribution: Number(scored.breakdown.synergyWeightedContribution.toFixed(2)),
        consistencyWeightedContribution: Number(scored.breakdown.consistencyWeightedContribution.toFixed(2)),
        curveWeightedContribution: Number(scored.breakdown.curveWeightedContribution.toFixed(2)),
        consistencyScore: Number(scored.breakdown.consistencyScore.toFixed(2)),
        curveBaseScore: Number(scored.breakdown.curveBaseScore.toFixed(2)),
        removalAxisScale: Number(scored.breakdown.removalAxisScale.toFixed(4)),
        removalAxisDelta: Number(scored.breakdown.removalAxisDelta.toFixed(2)),
        curveScore: Number(scored.breakdown.curveScore.toFixed(2)),
        skeletonSimilarity: Number(scored.breakdown.skeletonSimilarity.toFixed(3)),
        creatureTarget: Number(scored.breakdown.creatureTarget.toFixed(2)),
        curvePenalty: Number(scored.breakdown.curvePenalty.toFixed(4)),
        curveTopHeavyScale: Number(scored.breakdown.curveTopHeavyScale.toFixed(4)),
        curveSkeletonScale: Number(scored.breakdown.curveSkeletonScale.toFixed(4)),
        curveEarlyCreatureScale: Number(scored.breakdown.curveEarlyCreatureScale.toFixed(4)),
        curveCreatureCorridorScale: Number(scored.breakdown.curveCreatureCorridorScale.toFixed(4)),
        curveTopHeavyPenalty: Number(scored.breakdown.curveTopHeavyPenalty.toFixed(4)),
        curveSkeletonPenalty: Number(scored.breakdown.curveSkeletonPenalty.toFixed(4)),
        curveEarlyCreaturePenalty: Number(scored.breakdown.curveEarlyCreaturePenalty.toFixed(4)),
        curveCreatureCorridorPenalty: Number(scored.breakdown.curveCreatureCorridorPenalty.toFixed(4)),
        manaPenalty: Number(scored.breakdown.manaPenalty.toFixed(4)),
        dependencyPenalty: Number(scored.breakdown.dependencyPenalty.toFixed(4)),
        consistencyAdjustment: Number(scored.breakdown.consistencyAdjustment.toFixed(2)),
        curveAdjustment: Number(scored.breakdown.curveAdjustment.toFixed(2)),
        skeletonAdjustment: Number(scored.breakdown.skeletonAdjustment.toFixed(2)),
        creatureAdjustment: Number(scored.breakdown.creatureAdjustment.toFixed(2)),
        removalAdjustment: Number(scored.breakdown.removalAdjustment.toFixed(2)),
        dependencyAdjustment: Number(scored.breakdown.dependencyAdjustment.toFixed(2)),
        totalAdjustment: Number(scored.breakdown.totalAdjustment.toFixed(2)),
      },
    },
    metaByName: buildMetaByNamePayload(allNames, context.metaMap),
  };
};

const runOptimization = async (
  supabase: ReturnType<typeof createClient>,
  input: ResolvedOptimizationRun,
) => {
  const startTime = Date.now();
  const result = await buildOptimization(
    supabase,
    input.setCode,
    input.format,
    input.poolText,
    input.scoreWeights,
    input.curveComponentScales,
    input.debug,
    input.debugLimit,
    input.searchProfile,
    input.hcRestarts,
    input.hcIterations,
    input.seed,
    input.maxOptimizeMs,
  );
  const elapsed = Date.now() - startTime;
  return { result, computeTimeMs: elapsed };
};

const createOptimizationJob = async (
  supabase: ReturnType<typeof createClient>,
  requestPayload: ResolvedOptimizationRun,
  extras?: Partial<{
    status: SealedOptimizerJobRow["status"];
    job_kind: JobKind;
    parent_job_id: string | null;
    shard_index: number | null;
    shard_count: number | null;
    shard_seed: number | null;
  }>,
) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(JOB_TABLE)
    .insert({
      status: extras?.status ?? "queued",
      job_kind: extras?.job_kind ?? "single",
      parent_job_id: extras?.parent_job_id ?? null,
      shard_index: extras?.shard_index ?? null,
      shard_count: extras?.shard_count ?? null,
      shard_seed: extras?.shard_seed ?? null,
      request_payload: requestPayload,
      created_at: now,
      updated_at: now,
    })
    .select(JOB_SELECT)
    .single();
  if (error) throw error;
  return data as SealedOptimizerJobRow;
};

const getOptimizationJob = async (
  supabase: ReturnType<typeof createClient>,
  jobId: string,
) => {
  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select(JOB_SELECT)
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return data as SealedOptimizerJobRow;
};

const listShardJobs = async (
  supabase: ReturnType<typeof createClient>,
  parentJobId: string,
) => {
  const { data, error } = await supabase
    .from(JOB_TABLE)
    .select(JOB_SELECT)
    .eq("parent_job_id", parentJobId)
    .eq("job_kind", "shard")
    .order("shard_index", { ascending: true });
  if (error) throw error;
  return (data || []) as SealedOptimizerJobRow[];
};

const processShardJob = async (
  shardJobId: string,
  requestPayload: ResolvedOptimizationRun,
) => {
  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const { data: lockedRow, error: markRunningError } = await supabase
    .from(JOB_TABLE)
    .update({
      status: "running",
      started_at: startedAt,
      updated_at: startedAt,
      error_payload: null,
    })
    .eq("id", shardJobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (markRunningError) {
    console.error("[sealed-optimizer] failed to mark shard running", {
      shardJobId,
      error: markRunningError,
    });
    return;
  }

  // Another worker/poll already picked this shard.
  if (!lockedRow) {
    return;
  }

  const runStart = Date.now();
  try {
    const { result, computeTimeMs } = await runOptimization(supabase, requestPayload);
    const finishedAt = new Date().toISOString();
    const { error: doneError } = await supabase
      .from(JOB_TABLE)
      .update({
        status: "done",
        result_payload: { result, computeTimeMs },
        compute_time_ms: computeTimeMs,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", shardJobId);
    if (doneError) throw doneError;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const payload = extractErrorPayload(error);
    const computeTimeMs = Date.now() - runStart;
    const { error: failError } = await supabase
      .from(JOB_TABLE)
      .update({
        status: "failed",
        error_payload: payload,
        compute_time_ms: computeTimeMs,
        finished_at: finishedAt,
        updated_at: finishedAt,
      })
      .eq("id", shardJobId);
    if (failError) {
      console.error("[sealed-optimizer] failed to persist failed shard", {
        shardJobId,
        failError,
        originalError: payload,
      });
      return;
    }
    console.error("[sealed-optimizer] shard failed", {
      shardJobId,
      ...payload,
    });
  }
};

const kickQueuedShards = async (
  supabase: ReturnType<typeof createClient>,
  parentJobId: string,
) => {
  const shards = await listShardJobs(supabase, parentJobId);
  const runningCount = shards.filter((s) => s.status === "running").length;
  if (runningCount >= DEEP_MAX_PARALLEL_SHARDS) return 0;
  const openSlots = Math.max(0, DEEP_MAX_PARALLEL_SHARDS - runningCount);
  const queued = shards.filter((s) => s.status === "queued" && s.request_payload);
  if (openSlots <= 0 || queued.length === 0) return 0;

  const toLaunch = queued.slice(0, openSlots);
  for (const shard of toLaunch) {
    await processShardJob(shard.id, shard.request_payload!);
  }
  return toLaunch.length;
};

const aggregateShardResults = (
  shards: SealedOptimizerJobRow[],
): { result: SealedOptimizerResult; computeTimeMs: number } => {
  const doneRows = shards.filter(
    (s) => s.status === "done" && s.result_payload?.result?.builds?.length,
  );
  if (doneRows.length === 0) {
    throw new Error("No successful shard results to aggregate.");
  }

  const allBuilds = doneRows.flatMap((s) => s.result_payload!.result!.builds || []);
  const bySignature = new Map<string, SealedDeckResult>();
  for (const b of allBuilds) {
    const sig = deckSignature(b.cards);
    const prev = bySignature.get(sig);
    if (!prev || b.score > prev.score) bySignature.set(sig, b);
  }
  const deduped = [...bySignature.values()].sort((a, b) => b.score - a.score);

  const selected: SealedDeckResult[] = [];
  const remaining = [...deduped];
  const usedArchetypes = new Set<string>();

  // Pass 1: enforce distinct archetypes when possible.
  while (selected.length < FINAL_BUILD_COUNT && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      if (usedArchetypes.has(cand.archetype)) continue;
      let maxSim = 0;
      for (const pick of selected) {
        maxSim = Math.max(maxSim, multisetJaccard(cand.cards, pick.cards));
      }
      const mmrScore = cand.score - FINAL_MMR_LAMBDA * maxSim;
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    usedArchetypes.add(picked.archetype);
  }

  // Pass 2: if not enough distinct archetypes exist, complete with best MMR.
  while (selected.length < FINAL_BUILD_COUNT && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const pick of selected) {
        maxSim = Math.max(maxSim, multisetJaccard(cand.cards, pick.cards));
      }
      const mmrScore = cand.score - FINAL_MMR_LAMBDA * maxSim;
      if (mmrScore > bestMmr) {
        bestMmr = mmrScore;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  const ranked = selected.map((b, i) => ({ ...b, rank: i + 1 }));
  const sample = doneRows[0].result_payload!.result!;
  const hcSummaries = doneRows
    .map((s) => s.result_payload?.result?.debugHcSummary)
    .filter((x): x is NonNullable<SealedOptimizerResult["debugHcSummary"]> => !!x);

  const debugHcSummary = (() => {
    if (hcSummaries.length === 0) return undefined;
    const weighted = hcSummaries.reduce(
      (acc, s) => {
        const w = Math.max(1, Number(s.runs || 0));
        acc.runs += w;
        acc.evalCalls += Number(s.avgEvalCalls || 0) * w;
        acc.iterationsDone += Number(s.avgIterationsDone || 0) * w;
        acc.elapsedMs += Number(s.avgElapsedMs || 0) * w;
        acc.timeToBestMs += Number(s.avgTimeToBestMs || 0) * w;
        acc.deadlineHitRate += Number(s.deadlineHitRate || 0) * w;
        return acc;
      },
      { runs: 0, evalCalls: 0, iterationsDone: 0, elapsedMs: 0, timeToBestMs: 0, deadlineHitRate: 0 },
    );
    const denom = Math.max(1, weighted.runs);
    return {
      runs: weighted.runs,
      avgEvalCalls: Number((weighted.evalCalls / denom).toFixed(2)),
      avgIterationsDone: Number((weighted.iterationsDone / denom).toFixed(2)),
      avgElapsedMs: Number((weighted.elapsedMs / denom).toFixed(2)),
      avgTimeToBestMs: Number((weighted.timeToBestMs / denom).toFixed(2)),
      deadlineHitRate: Number((weighted.deadlineHitRate / denom).toFixed(2)),
    };
  })();

  const computeTimeMs = doneRows.reduce(
    (sum, s) => sum + Number(s.compute_time_ms || s.result_payload?.computeTimeMs || 0),
    0,
  );

  return {
    result: {
      setCode: sample.setCode,
      format: sample.format,
      builds: ranked,
      poolSize: sample.poolSize,
      weightsApplied: sample.weightsApplied || DEFAULT_SCORE_WEIGHTS,
      debugHcSummary,
    },
    computeTimeMs,
  };
};

const reconcileParentJob = async (
  supabase: ReturnType<typeof createClient>,
  parentJob: SealedOptimizerJobRow,
) => {
  const nowIso = new Date().toISOString();
  let shards = await listShardJobs(supabase, parentJob.id);
  const staleRunning = shards.filter((s) => {
    if (s.status !== "running") return false;
    const started = parseIsoMs(s.started_at);
    return started != null && Date.now() - started > STALE_RUNNING_TIMEOUT_MS;
  });
  if (staleRunning.length > 0) {
    for (const stale of staleRunning) {
      await supabase
        .from(JOB_TABLE)
        .update({
          status: "failed",
          error_payload: {
            message: "Shard timed out while running.",
            details: { code: "STALE_RUNNING_SHARD", shardId: stale.id },
          },
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", stale.id);
    }
    shards = await listShardJobs(supabase, parentJob.id);
  }

  const failed = shards.filter((s) => s.status === "failed");
  if (failed.length > 0) {
    await supabase
      .from(JOB_TABLE)
      .update({
        status: "failed",
        error_payload: {
          message: "One or more deep-search shards failed.",
          failedShards: failed.map((s) => ({
            id: s.id,
            shardIndex: s.shard_index,
            error: s.error_payload ?? null,
          })),
        },
        finished_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", parentJob.id);
    return await getOptimizationJob(supabase, parentJob.id);
  }

  const doneCount = shards.filter((s) => s.status === "done").length;
  const total = shards.length;
  if (total > 0 && doneCount === total) {
    const { result, computeTimeMs } = aggregateShardResults(shards);
    await supabase
      .from(JOB_TABLE)
      .update({
        status: "done",
        result_payload: { result, computeTimeMs },
        compute_time_ms: computeTimeMs,
        finished_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", parentJob.id);
    return await getOptimizationJob(supabase, parentJob.id);
  }

  if (parentJob.status === "queued") {
    await supabase
      .from(JOB_TABLE)
      .update({
        status: "running",
        started_at: parentJob.started_at || nowIso,
        updated_at: nowIso,
      })
      .eq("id", parentJob.id);
  }

  const launched = await kickQueuedShards(supabase, parentJob.id);
  if (launched > 0) {
    shards = await listShardJobs(supabase, parentJob.id);
    const rerunFailed = shards.filter((s) => s.status === "failed");
    if (rerunFailed.length > 0) {
      await supabase
        .from(JOB_TABLE)
        .update({
          status: "failed",
          error_payload: {
            message: "One or more deep-search shards failed.",
            failedShards: rerunFailed.map((s) => ({
              id: s.id,
              shardIndex: s.shard_index,
              error: s.error_payload ?? null,
            })),
          },
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", parentJob.id);
      return await getOptimizationJob(supabase, parentJob.id);
    }

    const doneAfterRun = shards.filter((s) => s.status === "done").length;
    if (shards.length > 0 && doneAfterRun === shards.length) {
      const { result, computeTimeMs } = aggregateShardResults(shards);
      await supabase
        .from(JOB_TABLE)
        .update({
          status: "done",
          result_payload: { result, computeTimeMs },
          compute_time_ms: computeTimeMs,
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", parentJob.id);
    }
  }

  return await getOptimizationJob(supabase, parentJob.id);
};

// ─── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as OptimizationRunPayload & {
      action?: "submit" | "status" | "run" | "score_custom_deck";
      jobId?: string;
      shardCount?: number;
    };
    const action = payload.action || "submit";
    const supabase = getSupabaseAdmin();

    if (action === "score_custom_deck") {
      const setCode = String(payload.setCode || "").trim();
      const format = String(payload.format || "").trim();
      const deckText = String(payload.deckText || "").trim();
      if (!setCode || !format || !deckText) {
        return json(400, {
          error: "Missing required payload: setCode, format, deckText.",
        });
      }
      const { build, metaByName } = await scoreCustomDeck(
        supabase,
        setCode,
        format,
        deckText,
        payload.scoreWeights,
        payload.curveComponentScales,
      );
      return json(200, { build, metaByName });
    }

    if (action === "status" || (!!payload.jobId && !payload.setCode)) {
      if (!payload.jobId) {
        return json(400, { error: "Missing required payload: jobId for status action." });
      }
      let job = await getOptimizationJob(supabase, payload.jobId);

      // If status is requested on a shard, return shard status directly.
      if (job.job_kind === "shard") {
        return json(job.status === "queued" || job.status === "running" ? 202 : 200, {
          jobId: job.id,
          status: job.status,
          kind: job.job_kind,
          parentJobId: job.parent_job_id,
          shardIndex: job.shard_index,
          shardCount: job.shard_count,
          error: job.status === "failed" ? (job.error_payload ?? { message: "Shard failed." }) : undefined,
          computeTimeMs: job.compute_time_ms ?? job.result_payload?.computeTimeMs ?? null,
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        });
      }

      // Parent mode: reconcile progress on each poll.
      if (job.job_kind === "parent" || job.job_kind === "single") {
        if (job.status === "queued" || job.status === "running") {
          job = await reconcileParentJob(supabase, job);
        }
      }

      const shards = await listShardJobs(supabase, job.id);
      const progress = {
        total: shards.length,
        queued: shards.filter((s) => s.status === "queued").length,
        running: shards.filter((s) => s.status === "running").length,
        done: shards.filter((s) => s.status === "done").length,
        failed: shards.filter((s) => s.status === "failed").length,
      };

      if (job.status === "done") {
        return json(200, {
          jobId: job.id,
          status: job.status,
          kind: job.job_kind,
          result: job.result_payload?.result ?? null,
          computeTimeMs: job.result_payload?.computeTimeMs ?? job.compute_time_ms ?? null,
          progress,
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        });
      }
      if (job.status === "failed") {
        return json(200, {
          jobId: job.id,
          status: job.status,
          kind: job.job_kind,
          error: job.error_payload ?? { message: "Optimization failed." },
          progress,
          createdAt: job.created_at,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
        });
      }
      return json(202, {
        jobId: job.id,
        status: job.status,
        kind: job.job_kind,
        progress,
        createdAt: job.created_at,
        startedAt: job.started_at,
      });
    }

    const resolvedRun = resolveOptimizationRun(payload);
    const shardCount = Math.max(2, Math.min(8, Number(payload.shardCount ?? DEEP_SHARD_COUNT) || DEEP_SHARD_COUNT));
    const nowIso = new Date().toISOString();

    const parentJob = await createOptimizationJob(supabase, resolvedRun, {
      status: "queued",
      job_kind: "parent",
      shard_count: shardCount,
    });

    const shardRows = Array.from({ length: shardCount }).map((_, idx) => {
      const shardSeed = deriveShardSeed(resolvedRun.seed, idx);
      const shardProfile = SHARD_PROFILES[idx % SHARD_PROFILES.length] || "skeleton";
      const shardRun: ResolvedOptimizationRun = {
        ...resolvedRun,
        seed: shardSeed,
        searchProfile: shardProfile,
        hcRestarts: Math.max(1, Math.min(DEEP_SHARD_RESTARTS, resolvedRun.hcRestarts)),
        hcIterations: Math.max(10, Math.min(DEEP_SHARD_ITERATIONS, resolvedRun.hcIterations)),
        maxOptimizeMs: Math.max(800, Math.min(DEEP_SHARD_MAX_MS, resolvedRun.maxOptimizeMs)),
      };
      return {
        status: "queued",
        job_kind: "shard" as JobKind,
        parent_job_id: parentJob.id,
        shard_index: idx,
        shard_count: shardCount,
        shard_seed: shardSeed,
        request_payload: shardRun,
        created_at: nowIso,
        updated_at: nowIso,
      };
    });

    const { error: shardInsertError } = await supabase.from(JOB_TABLE).insert(shardRows);
    if (shardInsertError) {
      await supabase
        .from(JOB_TABLE)
        .update({
          status: "failed",
          error_payload: extractErrorPayload(shardInsertError),
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", parentJob.id);
      throw shardInsertError;
    }

    const refreshedParent = await getOptimizationJob(supabase, parentJob.id);
    const shards = await listShardJobs(supabase, parentJob.id);
    const progress = {
      total: shards.length,
      queued: shards.filter((s) => s.status === "queued").length,
      running: shards.filter((s) => s.status === "running").length,
      done: shards.filter((s) => s.status === "done").length,
      failed: shards.filter((s) => s.status === "failed").length,
    };

    return json(202, {
      jobId: refreshedParent.id,
      status: refreshedParent.status,
      kind: refreshedParent.job_kind,
      progress,
      message: "Deep optimization accepted. Poll with action=status to process shards.",
    });
  } catch (error) {
    const payload = extractErrorPayload(error);
    if (isMissingJobTableError(error)) {
      return json(500, {
        error: payload.message,
        details: payload.details,
        hint: missingJobTableHint,
      });
    }
    console.error("[sealed-optimizer] request failed", payload);
    return json(500, {
      error: payload.message,
      details: payload.details,
    });
  }
});
