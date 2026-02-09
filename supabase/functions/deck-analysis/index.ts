// ─── Deck Analysis Edge Function ──────────────────────────────────────────────
// POST endpoint that analyses an MTGA decklist against archetypal skeletons.
// Pure analysis logic is imported from the shared module to stay in sync with
// the frontend fallback pipeline.
// ──────────────────────────────────────────────────────────────────────────────

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type AnalysisSkeleton,
  type DeckAnalysisResult,
  type DeckCardMeta,
  type DeckCardStat,
  type SynergyRow,
  DECK_ANALYSIS_CACHE_VERSION,
  parseMtgaDeck,
  isLandCard,
  detectArchetypeFromColors,
  buildUserNonLandQtyMap,
  selectBestSkeletonVariant,
  computeAnalysis,
} from "../_shared/deckAnalysisCore.ts";

// ─── HTTP / infra helpers ────────────────────────────────────────────────────

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

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

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

// ─── Card metadata resolution (Supabase I/O) ────────────────────────────────

type CardListRow = {
  card_name: string;
  card_cmc: number | null;
  card_type: string | null;
  rarity: string | null;
  colors: string | null;
  card_cost?: string | null;
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
  const exactRows =
    (withCostQuery.error ? fallbackQuery?.data : withCostQuery.data) || [];
  const exactError = withCostQuery.error
    ? fallbackQuery?.error
    : withCostQuery.error;
  if (exactError) throw exactError;

  const hasCardCost = !withCostQuery.error;
  const selectCols = hasCardCost
    ? "card_name,card_cmc,card_type,rarity,colors,card_cost"
    : "card_name,card_cmc,card_type,rarity,colors";

  for (const row of exactRows as CardListRow[]) {
    metaByInputName[row.card_name] = mapCardListRowToMeta(row);
    canonicalByInputName[row.card_name] = row.card_name;
  }

  const missingNames = uniqueNames.filter(
    (name) => !canonicalByInputName[name],
  );
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
        return {
          inputName,
          row: (data?.[0] as CardListRow | undefined) ?? null,
        };
      }),
    );

    for (const item of resolvedRows) {
      if (!item.row) continue;
      metaByInputName[item.inputName] = mapCardListRowToMeta(item.row);
      canonicalByInputName[item.inputName] = item.row.card_name;
    }
  }

  for (const inputName of uniqueNames) {
    canonicalByInputName[inputName] =
      canonicalByInputName[inputName] || inputName;
  }

  return { metaByInputName, canonicalByInputName };
};

// ─── Orchestrator: fetch data then call shared computeAnalysis ───────────────

const buildAnalysis = async (
  supabase: ReturnType<typeof createClient>,
  setCode: string,
  format: string,
  deckText: string,
): Promise<DeckAnalysisResult> => {
  const parsedDeck = parseMtgaDeck(deckText);
  if (parsedDeck.mainCards.length === 0) {
    throw new Error(
      'No valid main deck cards found. Paste an MTGA decklist starting with "Deck".',
    );
  }

  // 1. Fetch skeletons
  const { data: skeletonsData, error: skeletonsError } = await supabase
    .from("archetypal_skeletons")
    .select(
      "id,archetype_name,is_alternative,sample_size,avg_mana_curve,creature_ratio,deck_list,core_cards,importance_cards",
    )
    .eq("set_code", setCode)
    .eq("format", format);
  if (skeletonsError) throw skeletonsError;
  const allSkeletons = (skeletonsData || []) as AnalysisSkeleton[];
  const analysisPool = allSkeletons.filter(
    (s) => !s.is_alternative && (s.sample_size || 0) >= 20,
  );
  if (analysisPool.length === 0)
    throw new Error(`No skeletons available for ${format}.`);

  // 2. Resolve card metadata
  const uniqueNames = [
    ...new Set(
      [...parsedDeck.mainCards, ...parsedDeck.sideboardCards].map((c) => c.name),
    ),
  ];
  const { metaByInputName: metaByName, canonicalByInputName } =
    await resolveCardMetaWithSplitFallback(supabase, setCode, uniqueNames);
  const canonicalNames = [
    ...new Set(
      uniqueNames.map((name) => canonicalByInputName[name] || name),
    ),
  ];

  // 3. Fetch global stats
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
    statByCanonical[row.card_name] = {
      gih_wr: row.gih_wr,
      alsa: row.alsa,
      frequency: null,
    };
  }
  const statByName: Record<string, DeckCardStat> = {};
  for (const inputName of uniqueNames) {
    const canonicalName = canonicalByInputName[inputName] || inputName;
    const stat = statByCanonical[canonicalName];
    if (stat) statByName[inputName] = stat;
  }

  // 4. Detect archetype
  const bestMatch = detectArchetypeFromColors(
    parsedDeck.mainCards,
    analysisPool,
    metaByName,
  );
  if (!bestMatch) throw new Error("Could not detect a matching archetype.");
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

  // 5. Fetch local WR + archetype avg WR
  const { data: localWrRows, error: localWrError } = await supabase
    .from("card_stats")
    .select("card_name,gih_wr")
    .eq("set_code", setCode)
    .eq("format", format)
    .eq("filter_context", matchedSkeleton.archetype_name)
    .in("card_name", canonicalNames);
  if (localWrError) throw localWrError;
  const localWrByCanonical: Record<string, number | null> = {};
  for (const row of (localWrRows || []) as Array<{
    card_name: string;
    gih_wr: number | null;
  }>) {
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
  const archetypeAvgWr =
    (avgRows || []).find(
      (r) => r.archetype_name === matchedSkeleton.archetype_name,
    )?.win_rate ?? null;
  const globalAvgWr =
    (avgRows || []).find((r) => r.archetype_name === "All Decks")?.win_rate ??
    null;

  // 6. Fetch synergy rows
  const canonicalNameOf = (inputName: string): string =>
    canonicalByInputName[inputName] || inputName;
  const mainNonLandUnique = [
    ...new Set(
      parsedDeck.mainCards
        .map((c) => c.name)
        .filter((name) => !isLandCard(name, metaByName)),
    ),
  ];
  const mainNonLandSet = new Set(mainNonLandUnique);
  const sideboardCandidateUnique = [
    ...new Set(
      parsedDeck.sideboardCards
        .filter((card) => !isLandCard(card.name, metaByName))
        .filter((card) => !mainNonLandSet.has(card.name))
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
  const { data: pairRowsRaw, error: pairError } = await supabase
    .from("synergy_scores")
    .select("card_a,card_b,synergy_score")
    .eq("set_code", setCode)
    .eq("format", format)
    .in("card_a", synergyLookupNames)
    .in("card_b", synergyLookupNames);
  if (pairError) throw pairError;

  // 7. Delegate to shared pure computation
  return computeAnalysis({
    parsedDeck,
    allSkeletons,
    metaByName,
    statByName,
    localWrByName,
    archetypeAvgWr,
    globalAvgWr,
    pairRows: (pairRowsRaw || []) as SynergyRow[],
    matchedSkeleton,
    format,
    canonicalByName: canonicalByInputName,
  });
};

// ─── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { setCode, format, deckText, forceRefresh } =
      (await req.json()) as {
        setCode?: string;
        format?: string;
        deckText?: string;
        forceRefresh?: boolean;
      };

    if (!setCode || !format || !deckText) {
      return json(400, {
        error: "Missing required payload: setCode, format, deckText.",
      });
    }

    const supabase = getSupabaseAdmin();
    const algoVersion = Number(
      Deno.env.get("ANALYSIS_ALGO_VERSION") ?? "1",
    );
    const ttlSeconds = Number(
      Deno.env.get("ANALYSIS_CACHE_TTL_SECONDS") ?? "86400",
    );

    const normalizedDeck = deckText.replace(/\r\n/g, "\n").trim();
    const deckHash = await sha256Hex(normalizedDeck);
    const cacheKey = await sha256Hex(
      `${setCode}|${format}|${deckHash}|v${algoVersion}|schema${DECK_ANALYSIS_CACHE_VERSION}`,
    );

    if (!forceRefresh) {
      const { data: cacheRow } = await supabase
        .from("deck_analysis_cache")
        .select("result,expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (
        cacheRow?.result &&
        cacheRow?.expires_at &&
        new Date(cacheRow.expires_at).getTime() > Date.now()
      ) {
        return json(200, { analysis: cacheRow.result, cached: true });
      }
    }

    const analysis = await buildAnalysis(
      supabase,
      setCode,
      format,
      normalizedDeck,
    );

    const expiresAt = new Date(
      Date.now() + ttlSeconds * 1000,
    ).toISOString();
    await supabase.from("deck_analysis_cache").upsert(
      {
        cache_key: cacheKey,
        set_code: setCode,
        format,
        archetype_name: analysis.matchedArchetype,
        deck_hash: deckHash,
        algo_version: algoVersion,
        result: analysis,
        expires_at: expiresAt,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );

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
