// Contexte d'optimisation d'un set, charge depuis Supabase (API REST).
// Reproduit loadOptimizationContext / buildOptimization / scoreCustomDeck de
// supabase/functions/sealed-optimizer/index.ts, mais pour tout le set d'un coup,
// afin d'executer le coeur sealedOptimizerCore.ts en local (Node >= 22.6).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const BASIC_TO_COLOR = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const MANA_COLORS = ["W", "U", "B", "R", "G"];

// Constantes du mode "deep" de index.ts (5 shards en serie).
export const SHARD_PROFILES = ["skeleton", "power_mana_safe", "power_greedy_splash", "curve_creatures", "synergy_if_online"];
export const SHARD_SEED_STRIDE = 1009;
export const DEEP_SHARD_RESTARTS = 2;
export const DEEP_SHARD_ITERATIONS = 40;
export const DEEP_SHARD_MAX_MS = 1_650;
export const FINAL_BUILD_COUNT = 3;

export const loadCore = async (repoRoot) =>
  import(pathToFileURL(path.join(repoRoot, "supabase/functions/_shared/sealedOptimizerCore.ts")).href);

const readEnv = (repoRoot) =>
  Object.fromEntries(
    fs.readFileSync(path.join(repoRoot, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );

export const normalizeName = (name) =>
  name.toLowerCase().replace(/\s*\/\/\s*/g, " ").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
const splitCardBase = (name) => (name.includes(" //") ? name.split(" //")[0].trim() : name.trim());
const normalizeFormat = (v) =>
  (["ArenaDirectSealed", "Arena Direct Sealed", "Sealed"].includes(v) ? "ArenaDirect_Sealed" : v);
const wrFallbackFormatsFor = (f) =>
  [...new Set(f === "ArenaDirect_Sealed" ? ["ArenaDirect_Sealed", "TradDraft", "Sealed", "PremierDraft"] : [f, "PremierDraft"])];

// Applique un JSON de reglages au coeur, par section :
//   {"multicolor": {...}, "power": {...}, "search": {...}, "context": {...}}
// Un JSON sans section connue est traite comme "multicolor" (ancien format).
// Renvoie les options de contexte (ex: {shrinkK}) a passer a loadSetContext.
export const applyTuning = (core, tuning) => {
  if (!tuning) return {};
  const t = typeof tuning === "string" ? JSON.parse(tuning) : tuning;
  const sections = { multicolor: core.MULTICOLOR_CONSISTENCY, power: core.POWER_TUNING, search: core.SEARCH_TUNING };
  const known = Object.keys(t).some((k) => k in sections || k === "context");
  if (!known) {
    Object.assign(core.MULTICOLOR_CONSISTENCY, t);
    return {};
  }
  for (const [k, target] of Object.entries(sections)) if (t[k]) Object.assign(target, t[k]);
  return t.context || {};
};

export const describeTuning = (core) => ({
  multicolor: { ...core.MULTICOLOR_CONSISTENCY },
  power: { ...core.POWER_TUNING },
  search: { ...core.SEARCH_TUNING },
});

// options.shrinkK : lissage du GIH vers la moyenne du format selon l'echantillon,
// wr' = (n * wr + K * moyenne) / (n + K), n = parties "in hand" de la carte.
export const loadSetContext = async (repoRoot, setCode, rawFormat = "ArenaDirect_Sealed", options = {}) => {
  const shrinkK = Math.max(0, Number(options.shrinkK || 0));
  const env = readEnv(repoRoot);
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_KEY || env.VITE_SUPABASE_KEY;
  const fetchAll = async (table, query) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
      });
      if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
      const page = await r.json();
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  };

  const format = normalizeFormat(rawFormat);
  const queryFormats = format === "ArenaDirect_Sealed" ? ["ArenaDirect_Sealed", "TradDraft"] : [format];
  const wrFormats = wrFallbackFormatsFor(format);

  const cardList = await fetchAll(
    "card_list",
    `set_code=eq.${setCode}&select=card_name,card_cmc,card_type,rarity,colors,card_cost,oracle_text,is_removal,is_mana_producer,produced_colours,dependency_tags,dependency_min_support,dependency_scope,token_support_tags,token_support_count,support_tags`,
  );
  const metaByNorm = new Map();
  for (const row of cardList) {
    for (const k of [normalizeName(row.card_name), normalizeName(splitCardBase(row.card_name))]) {
      if (!metaByNorm.has(k)) metaByNorm.set(k, row);
    }
  }
  // Nom 17Lands / MTGA -> nom canonique card_list (cartes doubles "A // B").
  const canonical = (name) => metaByNorm.get(normalizeName(name))?.card_name || name;

  const means = {};
  for (const f of new Set([...wrFormats, ...queryFormats])) {
    const rows = await fetchAll("archetype_stats", `set_code=eq.${setCode}&format=eq.${f}&archetype_name=eq.All%20Decks&select=win_rate`);
    const m = Number(rows?.[0]?.win_rate);
    means[f] = Number.isFinite(m) ? m : 55;
  }
  const primaryMean = means[wrFormats[0]];

  // GIH WR avec chaine de repli, recale par delta a la moyenne du format.
  const wrByNorm = new Map();
  for (let fi = 0; fi < wrFormats.length; fi++) {
    const f = wrFormats[fi];
    const rows = await fetchAll("card_stats", `set_code=eq.${setCode}&format=eq.${f}&filter_context=eq.Global&select=card_name,gih_wr,img_count`);
    const offset = fi === 0 ? 0 : primaryMean - means[f];
    for (const row of rows) {
      if (row.gih_wr == null) continue;
      let wr = row.gih_wr + offset;
      if (shrinkK > 0) {
        const n = Math.max(0, Number(row.img_count || 0));
        wr = (n * wr + shrinkK * primaryMean) / (n + shrinkK);
      }
      for (const k of [normalizeName(row.card_name), normalizeName(splitCardBase(row.card_name))]) {
        if (!wrByNorm.has(k)) wrByNorm.set(k, wr);
      }
    }
  }

  // Synergies : premier format gagnant par paire, comme en prod.
  const synergyRows = [];
  for (const f of queryFormats) {
    synergyRows.push(...(await fetchAll("synergy_scores", `set_code=eq.${setCode}&format=eq.${f}&select=card_a,card_b,synergy_score`)));
  }
  const synSeen = new Set();
  const synergies = [];
  for (const r of synergyRows) {
    const a = canonical(r.card_a);
    const b = canonical(r.card_b);
    const k = [a, b].sort().join("::");
    if (synSeen.has(k)) continue;
    synSeen.add(k);
    synergies.push({ card_a: a, card_b: b, synergy_score: r.synergy_score });
  }

  let skeletons = [];
  for (const f of queryFormats) {
    const rows = await fetchAll(
      "archetypal_skeletons",
      `set_code=eq.${setCode}&format=eq.${f}&select=archetype_name,is_alternative,sample_size,avg_mana_curve,creature_ratio,deck_list,core_cards,importance_cards`,
    );
    if (rows.length) { skeletons = rows; break; }
  }

  const metaMap = new Map(cardList.map((row) => [row.card_name, row]));
  const wrMap = new Map();
  for (const row of cardList) {
    const wr = wrByNorm.get(normalizeName(row.card_name)) ?? wrByNorm.get(normalizeName(splitCardBase(row.card_name)));
    if (wr != null) wrMap.set(row.card_name, wr);
  }

  return { setCode, format, canonical, metaMap, wrMap, synergies, skeletons, primaryMean, cardCount: cardList.length };
};

// ─── Helpers recopies de index.ts ────────────────────────────────────────────

export const findBestSkeletonForPlan = (skeletons, mainColors) => {
  if (!skeletons.length || !mainColors.length) return null;
  const target = new Set(mainColors);
  let best = null;
  let bestTuple = [-1, -1, -1];
  for (const s of skeletons) {
    const colors = [...new Set([...String(s.archetype_name || "")].map((c) => c.toUpperCase()).filter((c) => MANA_COLORS.includes(c)))];
    if (!colors.length) continue;
    const sset = new Set(colors);
    let overlap = 0;
    for (const c of target) if (sset.has(c)) overlap++;
    if (overlap === 0) continue;
    const exact = overlap === target.size && target.size === sset.size;
    const tuple = [exact ? 100 + overlap : overlap, s.is_alternative ? 0 : 1, Number(s.sample_size || 0)];
    if (tuple[0] > bestTuple[0] || (tuple[0] === bestTuple[0] && (tuple[1] > bestTuple[1] || (tuple[1] === bestTuple[1] && tuple[2] > bestTuple[2])))) {
      best = s;
      bestTuple = tuple;
    }
  }
  return best;
};

export const landPoolCard = (name, qty, meta) => ({
  name, qty, wr: 0,
  colors: meta?.colors || BASIC_TO_COLOR[name] || "",
  cmc: Number(meta?.card_cmc ?? 0),
  cost: meta?.card_cost || null,
  type: meta?.card_type || "Land",
  rarity: meta?.rarity || "common",
  isCreature: false, isRemoval: false,
  isManaProducer: meta?.is_mana_producer ?? true,
  producedColours: meta?.produced_colours || BASIC_TO_COLOR[name] || null,
  oracleText: meta?.oracle_text || null,
  dependencyTags: [], dependencyMinSupport: null, dependencyScope: null,
  tokenSupportTags: [], tokenSupportCount: 0, supportTags: [],
});

const extractCostDemand = (cost) => {
  const demand = {};
  for (const m of String(cost || "").toUpperCase().matchAll(/\{([^}]+)\}/g)) {
    const symbol = m[1].trim();
    if (MANA_COLORS.includes(symbol)) { demand[symbol] = (demand[symbol] || 0) + 1; continue; }
    if (symbol.includes("/")) {
      const parts = symbol.split("/").filter((p) => MANA_COLORS.includes(p));
      for (const p of parts) demand[p] = (demand[p] || 0) + 1 / parts.length;
    }
  }
  return demand;
};

export const deriveDeckColorPlan = (cards, poolCards, landsProvided) => {
  const poolMap = new Map(poolCards.map((pc) => [pc.name, pc]));
  const spellDemand = Object.fromEntries(MANA_COLORS.map((c) => [c, 0]));
  const landDemand = Object.fromEntries(MANA_COLORS.map((c) => [c, 0]));
  for (const dc of cards) {
    const pc = poolMap.get(dc.name);
    if (!pc) continue;
    const fromCost = extractCostDemand(pc.cost);
    for (const c of MANA_COLORS) if ((fromCost[c] || 0) > 0) spellDemand[c] += fromCost[c] * dc.qty;
    if (Object.values(fromCost).every((v) => v <= 0)) {
      for (const c of String(pc.colors || "").toUpperCase()) if (MANA_COLORS.includes(c)) spellDemand[c] += 0.5 * dc.qty;
    }
  }
  for (const land of landsProvided) {
    if (BASICS.has(land.name)) landDemand[BASIC_TO_COLOR[land.name]] += land.qty;
  }
  const useLandPlan = Object.values(landDemand).some((v) => v > 0);
  const source = useLandPlan ? landDemand : spellDemand;
  const ordered = MANA_COLORS.map((c) => ({ c, v: source[c] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  if (ordered.length === 0) return { mainColors: ["W", "U"], splashColor: null };
  if (ordered.length === 1) return { mainColors: [ordered[0].c], splashColor: null };
  const second = ordered[1]?.v || 0;
  const third = ordered[2]?.v || 0;
  const includeThirdAsMain = third > 0 && (useLandPlan ? third >= Math.max(3, second * 0.5) : third >= second * 0.7);
  return {
    mainColors: (includeThirdAsMain ? ordered.slice(0, 3) : ordered.slice(0, 2)).map((x) => x.c),
    splashColor: includeThirdAsMain ? (ordered[3]?.c || null) : (ordered[2]?.c || null),
  };
};

// Separe une liste {nom: qte} en sorts et terrains, noms canonicalises.
export const splitSpellsAndLands = (ctx, counts) => {
  const spells = [];
  const lands = [];
  for (const [rawName, qty] of Object.entries(counts)) {
    if (!qty) continue;
    if (BASICS.has(rawName)) { lands.push({ name: rawName, qty }); continue; }
    const name = ctx.canonical(rawName);
    if ((ctx.metaMap.get(name)?.card_type || "").includes("Land")) lands.push({ name, qty });
    else spells.push({ name, qty });
  }
  return { spells, lands };
};

// Score d'un deck deja construit, comme scoreCustomDeck de index.ts.
export const scoreProvidedDeck = (core, ctx, counts, weights, pairMap, colorPlan = null) => {
  const { spells, lands } = splitSpellsAndLands(ctx, counts);
  const poolCards = core.buildPoolCards(spells, ctx.metaMap, ctx.wrMap);
  if (poolCards.length === 0) return null;
  const cards = poolCards.map((pc) => ({ name: pc.name, qty: pc.qty }));
  const scoringPool = [...poolCards];
  for (const l of lands) if (!scoringPool.some((p) => p.name === l.name)) scoringPool.push(landPoolCard(l.name, l.qty, ctx.metaMap.get(l.name)));
  const plan = colorPlan || deriveDeckColorPlan(cards, poolCards, lands);
  const skeleton = findBestSkeletonForPlan(ctx.skeletons, plan.mainColors);
  const scored = core.scoreDeckWithProvidedLands(
    cards, scoringPool, pairMap, plan.mainColors, plan.splashColor, skeleton, lands, weights, ctx.primaryMean, null,
  );
  return {
    ...scored,
    plan,
    nSpells: spells.reduce((s, c) => s + c.qty, 0),
    nScored: poolCards.reduce((s, c) => s + c.qty, 0),
    nLands: lands.reduce((s, l) => s + l.qty, 0),
    archetype: plan.mainColors.join("") + (plan.splashColor ? plan.splashColor.toLowerCase() : ""),
  };
};
