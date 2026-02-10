// ─── Sealed Optimizer Edge Function ──────────────────────────────────────────
// POST endpoint that takes an MTGA sealed pool and returns the top 2-3 builds.
// Pattern follows deck-analysis/index.ts.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type CardMeta,
  type CardStat,
  type ScoreWeights,
  type SealedOptimizerResult,
  type Skeleton,
  type SynergyRow,
  DEFAULT_SCORE_WEIGHTS,
  parsePoolText,
  buildPoolCards,
  buildPairMap,
  optimizePool,
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
};

const CARD_LIST_COLS =
  "card_name,card_cmc,card_type,rarity,colors,card_cost,oracle_text,is_removal,is_mana_producer,produced_colours,dependency_tags,dependency_min_support,dependency_scope";

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
    .select(CARD_LIST_COLS)
    .eq("set_code", setCode)
    .in("card_name", uniqueNames);

  const fallbackQuery = fullQuery.error
    ? await supabase
        .from("card_list")
        .select("card_name,card_cmc,card_type,rarity,colors,card_cost")
        .eq("set_code", setCode)
        .in("card_name", uniqueNames)
    : null;

  const exactRows =
    (fullQuery.error ? fallbackQuery?.data : fullQuery.data) || [];
  const queryError = fullQuery.error ? fallbackQuery?.error : fullQuery.error;
  if (queryError) throw queryError;

  const hasNewCols = !fullQuery.error;
  const selectCols = hasNewCols
    ? CARD_LIST_COLS
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

// ─── Build analysis ──────────────────────────────────────────────────────────

const buildOptimization = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  poolText: string,
  scoreWeights?: Partial<ScoreWeights>,
  debug = false,
  debugLimit = 20,
  hcRestarts = 2,
  hcIterations = 35,
  seed = 1337,
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

  // Compute-safe profile for large pools to avoid WORKER_LIMIT on Edge runtime.
  // Caller can still request higher values, but we cap dynamically by pool size.
  let effectiveHcRestarts = hcRestarts;
  let effectiveHcIterations = hcIterations;
  if (poolTotalQty >= 95) {
    effectiveHcRestarts = Math.min(effectiveHcRestarts, 1);
    effectiveHcIterations = Math.min(effectiveHcIterations, 25);
  } else if (poolTotalQty >= 80) {
    effectiveHcRestarts = Math.min(effectiveHcRestarts, 2);
    effectiveHcIterations = Math.min(effectiveHcIterations, 30);
  }

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
    debug,
    debugLimit,
    effectiveHcRestarts,
    effectiveHcIterations,
    seed,
  );
  result.setCode = setCode;
  result.format = normalizedFormat;

  return result;
};

// ─── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { setCode, format, poolText, scoreWeights, debug, debugLimit, hcRestarts, hcIterations, seed } = (await req.json()) as {
      setCode?: string;
      format?: string;
      poolText?: string;
      scoreWeights?: Partial<ScoreWeights>;
      debug?: boolean;
      debugLimit?: number;
      hcRestarts?: number;
      hcIterations?: number;
      seed?: number;
    };

    if (!setCode || !format || !poolText) {
      return json(400, {
        error: "Missing required payload: setCode, format, poolText.",
      });
    }

    const supabase = getSupabaseAdmin();
    const startTime = Date.now();

    const resolvedDebug = !!debug;
    const resolvedDebugLimit = Math.max(1, Math.min(50, Number(debugLimit ?? 20) || 20));
    const resolvedHcRestarts = Math.max(1, Math.min(6, Number(hcRestarts ?? 2) || 2));
    const resolvedHcIterations = Math.max(20, Math.min(120, Number(hcIterations ?? 35) || 35));
    const resolvedSeed = Number.isFinite(Number(seed)) ? Number(seed) : 1337;

    const result = await buildOptimization(
      supabase,
      setCode,
      format,
      poolText,
      scoreWeights,
      resolvedDebug,
      resolvedDebugLimit,
      resolvedHcRestarts,
      resolvedHcIterations,
      resolvedSeed,
    );

    const elapsed = Date.now() - startTime;
    console.log(
      `[sealed-optimizer] ${setCode}/${format} — ${result.builds.length} builds in ${elapsed}ms`,
    );

    return json(200, { result, computeTimeMs: elapsed });
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
    } else if (
      typeof err?.message === "string" &&
      err.message.length > 0
    ) {
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

    console.error("[sealed-optimizer] request failed", {
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
