// Banc local du sealed optimizer sur des pools trophee.
// Reproduit le mode "deep" de supabase/functions/sealed-optimizer/index.ts
// (5 shards en serie, un profil de recherche et une graine par shard, puis
// agregation MMR), mais en executant le coeur en local : pas de deploy, pas de
// limite CPU Supabase, et un budget en nombre d'evaluations qui rend chaque run
// reproductible.
//
// Usage :
//   node --use-system-ca bench.mjs --set FRA --input pools.json --out run.json
//        [--weights 2,1.3,1,1] [--seed 1337] [--max-evals 15000] [--limit 50]
//
// --tuning '{"multicolor":{...},"power":{...},"search":{...},"context":{"shrinkK":500}}'
//          reglages par section (voir applyTuning dans lib/context.mjs)
// --extra-trios 3 : bases tricolores ajoutees aux paires (SEARCH_TUNING, recherche)
// --diversity 4.0 : penalite de similarite (top 3 d'un shard ET agregation des shards)
// --polish-check : le polish final verifie le score avec terrains avant d'accepter
// --max-evals : budget par shard, sans deadline (defaut 15000).
//               0 = deadline de prod en ms seule (non reproductible).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]?.startsWith("--") ? "true" : arr[i + 1]]);
    return acc;
  }, []),
);
const SET = String(args.set || "").toUpperCase();
const FORMAT = args.format || "ArenaDirect_Sealed";
const SEED = Number(args.seed ?? 1337);
const MAX_EVALS = Number(args["max-evals"] ?? 15000);
// Avec un budget en evaluations : pas de deadline (Infinity), resultat reproductible
// meme si la machine est chargee. Sans budget : deadline de prod (1,65 s par shard).
const MAX_MS = args["max-ms"] != null ? Number(args["max-ms"]) : (MAX_EVALS > 0 ? Number.POSITIVE_INFINITY : 1_650);
const LIMIT = Number(args.limit ?? 0);
if (!SET || !args.input || !args.out) {
  console.error("Usage : bench.mjs --set FRA --input pools.json --out run.json [--weights p,c,cv,s] [--seed n] [--max-evals n]");
  process.exit(1);
}

const lib = await import(pathToFileURL(path.join(REPO_ROOT, "backend/sealed-optimizer/lib/context.mjs")).href);
const core = await lib.loadCore(REPO_ROOT);
const ctxOptions = lib.applyTuning(core, args.tuning || null);
const ctx = await lib.loadSetContext(REPO_ROOT, SET, FORMAT, ctxOptions);
const pairMap = core.buildPairMap(ctx.synergies);

if (args["extra-trios"] != null) core.SEARCH_TUNING.extraTrios = Number(args["extra-trios"]);
if (args.diversity != null) core.SEARCH_TUNING.finalDiversityLambda = Number(args.diversity);
// Meme coefficient que index.ts, qui lit SEARCH_TUNING.finalDiversityLambda.
const AGG_LAMBDA = core.SEARCH_TUNING.finalDiversityLambda;
if (args["polish-check"] != null) core.SEARCH_TUNING.polishCheckLands = args["polish-check"] === "true";

let weights = core.DEFAULT_SCORE_WEIGHTS;
if (args.weights) {
  const [power, consistency, curve, synergy] = String(args.weights).split(",").map(Number);
  weights = { power, consistency, curve, synergy };
}

// ─── Agregation des shards (copie de aggregateShardResults, index.ts) ────────
const deckSignature = (cards) =>
  cards.flatMap((c) => Array(Math.max(0, c.qty || 0)).fill(c.name)).sort((a, b) => a.localeCompare(b)).join("|");

const multisetJaccard = (a, b) => {
  const am = new Map(), bm = new Map();
  for (const c of a) am.set(c.name, (am.get(c.name) || 0) + c.qty);
  for (const c of b) bm.set(c.name, (bm.get(c.name) || 0) + c.qty);
  let inter = 0, uni = 0;
  for (const k of new Set([...am.keys(), ...bm.keys()])) {
    inter += Math.min(am.get(k) || 0, bm.get(k) || 0);
    uni += Math.max(am.get(k) || 0, bm.get(k) || 0);
  }
  return uni > 0 ? inter / uni : 0;
};

const aggregateShards = (shardBuilds) => {
  const bySig = new Map();
  for (const b of shardBuilds) {
    const sig = deckSignature(b.cards);
    const prev = bySig.get(sig);
    if (!prev || b.score > prev.score) bySig.set(sig, b);
  }
  const remaining = [...bySig.values()].sort((a, b) => b.score - a.score);
  const selected = [];
  const used = new Set();
  const pick = (distinctOnly) => {
    let bestIdx = -1, bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      if (distinctOnly && used.has(cand.archetype)) continue;
      let maxSim = 0;
      for (const p of selected) maxSim = Math.max(maxSim, multisetJaccard(cand.cards, p.cards));
      const mmr = cand.score - AGG_LAMBDA * maxSim;
      if (mmr > bestMmr) { bestMmr = mmr; bestIdx = i; }
    }
    return bestIdx;
  };
  while (selected.length < lib.FINAL_BUILD_COUNT && remaining.length > 0) {
    const idx = pick(true);
    if (idx < 0) break;
    const p = remaining.splice(idx, 1)[0];
    selected.push(p);
    used.add(p.archetype);
  }
  while (selected.length < lib.FINAL_BUILD_COUNT && remaining.length > 0) {
    selected.push(remaining.splice(pick(false), 1)[0]);
  }
  return selected;
};

// ─── Comparaison au deck joueur ──────────────────────────────────────────────
const countsOf = (cards) => {
  const m = {};
  for (const c of cards) m[c.name] = (m[c.name] || 0) + c.qty;
  return m;
};
const jaccardCounts = (a, b) => {
  let inter = 0, uni = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    inter += Math.min(a[k] || 0, b[k] || 0);
    uni += Math.max(a[k] || 0, b[k] || 0);
  }
  return uni > 0 ? inter / uni : 0;
};
// Archetype normalise : couleurs principales triees + splash. Corrige la
// comparaison sensible a l'ordre du benchmark historique ("UW" != "WU").
const archKey = (arch) => {
  const s = String(arch || "");
  const main = [...s].filter((c) => "WUBRG".includes(c)).sort().join("");
  const splash = [...s].filter((c) => "wubrg".includes(c)).sort().join("");
  return `${main}|${splash}`;
};
const colorKey = (arch) => [...String(arch || "").toUpperCase()].filter((c) => "WUBRG".includes(c)).sort().join("");

// ─── Run ─────────────────────────────────────────────────────────────────────
const input = JSON.parse(fs.readFileSync(args.input, "utf8"));
let records = Array.isArray(input) ? input : input.records || [];
if (LIMIT > 0) records = records.slice(0, LIMIT);

console.error(
  `${SET} : ${records.length} pools, poids ${JSON.stringify(weights)}, multicolore ${JSON.stringify(core.MULTICOLOR_CONSISTENCY)}, ` +
  `trios ${core.SEARCH_TUNING.extraTrios}, diversite ${core.SEARCH_TUNING.finalDiversityLambda}/${AGG_LAMBDA}, graine ${SEED}, ` +
  `budget ${MAX_EVALS > 0 ? `${MAX_EVALS} evals/shard` : "temps seul"}, deadline ${MAX_MS} ms`,
);

const results = [];
const started = Date.now();
for (const [idx, rec] of records.entries()) {
  const t0 = Date.now();
  // Pool : sans basiques (comme parsePoolText), noms canonicalises.
  const parsed = new Map();
  for (const [rawName, qty] of Object.entries(rec.pool_cardlist || {})) {
    if (!qty || lib.BASICS.has(rawName)) continue;
    const name = ctx.canonical(rawName);
    parsed.set(name, (parsed.get(name) || 0) + Number(qty));
  }
  const poolCards = core.buildPoolCards(
    [...parsed.entries()].map(([name, qty]) => ({ name, qty })), ctx.metaMap, ctx.wrMap,
  );

  const shardBuilds = [];
  const shardEvals = [];
  for (let i = 0; i < lib.SHARD_PROFILES.length; i++) {
    const shardSeed = (Math.trunc(SEED) + (i + 1) * lib.SHARD_SEED_STRIDE) >>> 0;
    const res = core.optimizePool(
      poolCards, pairMap, ctx.skeletons, weights, ctx.primaryMean, null, true, 20,
      lib.SHARD_PROFILES[i], lib.DEEP_SHARD_RESTARTS, lib.DEEP_SHARD_ITERATIONS, shardSeed, MAX_MS,
      MAX_EVALS > 0 ? MAX_EVALS : null,
    );
    const hc = res.debugHcSummary;
    shardEvals.push(hc ? Math.round(hc.avgEvalCalls * hc.runs) : 0);
    shardBuilds.push(...res.builds);
  }
  const builds = aggregateShards(shardBuilds);

  // Deck joueur : avec ses terrains, plan de couleurs deduit comme en prod.
  const player = lib.scoreProvidedDeck(core, ctx, rec.player_deck_cardlist || {}, weights, pairMap);
  const playerSpells = countsOf(lib.splitSpellsAndLands(ctx, rec.player_deck_cardlist || {}).spells);

  results.push({
    aggregate_id: rec.aggregate_id,
    wins: rec.wins,
    losses: rec.losses,
    player: player ? { score: player.score, archetype: player.archetype } : null,
    builds: builds.map((b) => ({
      score: b.score,
      archetype: b.archetype,
      jaccard: jaccardCounts(playerSpells, countsOf(b.cards)),
      cards: b.cards,
      lands: b.lands,
    })),
    shard_evals: shardEvals,
    ms: Date.now() - t0,
  });
  if ((idx + 1) % 10 === 0) console.error(`  ${idx + 1}/${records.length} pools (${Math.round((Date.now() - started) / 1000)} s)`);
}

// ─── Resume ──────────────────────────────────────────────────────────────────
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const valid = results.filter((r) => r.builds.length && r.player);
const summary = {
  pools: valid.length,
  avg_top1_score: mean(valid.map((r) => r.builds[0].score)),
  avg_jaccard_top1: mean(valid.map((r) => r.builds[0].jaccard)),
  avg_jaccard_best3: mean(valid.map((r) => Math.max(...r.builds.map((b) => b.jaccard)))),
  color_match_top1: mean(valid.map((r) => +(colorKey(r.builds[0].archetype) === colorKey(r.player.archetype)))),
  color_match_top3: mean(valid.map((r) => +r.builds.some((b) => colorKey(b.archetype) === colorKey(r.player.archetype)))),
  strict_match_top1: mean(valid.map((r) => +(archKey(r.builds[0].archetype) === archKey(r.player.archetype)))),
  strict_match_top3: mean(valid.map((r) => +r.builds.some((b) => archKey(b.archetype) === archKey(r.player.archetype)))),
  avg_shard_evals: mean(valid.flatMap((r) => r.shard_evals)),
  avg_ms_per_pool: mean(valid.map((r) => r.ms)),
};

fs.writeFileSync(args.out, JSON.stringify({
  meta: { set: SET, format: FORMAT, weights, ...lib.describeTuning(core), context: ctxOptions, aggregation_lambda: AGG_LAMBDA, seed: SEED, max_evals_per_shard: MAX_EVALS, max_ms: MAX_MS, input: path.basename(args.input), created_at: new Date().toISOString() },
  summary,
  results,
}, null, 1));
console.error(JSON.stringify(summary, null, 1));
