// Note chaque deck 17Lands avec le score du sealed optimizer (coeur de production),
// comme le chemin "score a custom deck" de supabase/functions/sealed-optimizer.
// Appele par outcome_calibration.py ; pas besoin de le lancer a la main.
//
// Usage : node score_decks.mjs <repoRoot> <decks.json> <out.csv> <SET> <format> [poids] [reglages]
//   poids    : "power,consistency,curve,synergy" ("" ou absent = poids de production)
//   reglages : JSON par section, voir applyTuning dans lib/context.mjs
//              (ex: {"multicolor":{"deficitFactor":3.5},"power":{"bombMode":"none"}})

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoRoot, decksPath, outPath, SET, FORMAT, WEIGHTS_ARG, TUNING_ARG] = process.argv.slice(2);
const lib = await import(pathToFileURL(path.join(repoRoot, "backend/sealed-optimizer/lib/context.mjs")).href);
const core = await lib.loadCore(repoRoot);
const ctxOptions = lib.applyTuning(core, TUNING_ARG || null);
const ctx = await lib.loadSetContext(repoRoot, SET, FORMAT || "ArenaDirect_Sealed", ctxOptions);
const pairMap = core.buildPairMap(ctx.synergies);

let weights = core.DEFAULT_SCORE_WEIGHTS;
if (WEIGHTS_ARG) {
  const [power, consistency, curve, synergy] = WEIGHTS_ARG.split(",").map(Number);
  weights = { power, consistency, curve, synergy };
}
console.error(
  `contexte: ${ctx.cardCount} cartes, ${ctx.wrMap.size} WR, moyenne ${ctx.primaryMean}, ` +
  `${ctx.synergies.length} synergies, ${ctx.skeletons.length} skeletons, poids ${JSON.stringify(weights)}, ` +
  `reglages ${JSON.stringify({ ...lib.describeTuning(core), context: ctxOptions })}`,
);

const cols = [
  "draft_id", "build_index", "wins", "games", "skill_bucket", "main_colors", "splash_colors",
  "n_spells", "n_spells_scored", "n_lands", "score", "wrScore", "wrNormalized", "synergyNormalized",
  "synergyScore", "consistencyScore", "curveScore", "curvePenalty", "dependencyPenalty",
  "removalCount", "creatureCount", "avgCmc", "skeletonSimilarity",
];
const out = [cols.join(",")];
let skipped = 0;

for (const d of JSON.parse(fs.readFileSync(decksPath, "utf8"))) {
  const mainColors = [...(d.main_colors || "")].filter((c) => "WUBRG".includes(c));
  if (mainColors.length === 0) { skipped++; continue; }
  // Le plan de couleurs vient de 17Lands (plus fiable que la deduction par les terrains).
  const splash = [...(d.splash_colors || "")].filter((c) => "WUBRG".includes(c))[0] || null;
  const s = lib.scoreProvidedDeck(core, ctx, d.deck, weights, pairMap, { mainColors, splashColor: splash });
  if (!s || s.nScored < 15) { skipped++; continue; }
  const b = s.breakdown;
  out.push([
    d.draft_id, d.build_index, d.wins, d.games, d.skill_bucket, d.main_colors, d.splash_colors,
    s.nSpells, s.nScored, s.nLands,
    s.score, b.wrScore, b.wrNormalized, b.synergyNormalized, b.synergyScore, b.consistencyScore,
    b.curveScore, b.curvePenalty, b.dependencyPenalty, s.stats.removalCount, s.stats.creatureCount,
    s.stats.avgCmc, s.stats.skeletonSimilarity,
  ].map((v) => (typeof v === "number" ? Number(v.toFixed(4)) : v)).join(","));
}

fs.writeFileSync(outPath, out.join("\n"));
console.error(`${out.length - 1} decks notes, ${skipped} ignores (trop peu de cartes avec WR)`);
