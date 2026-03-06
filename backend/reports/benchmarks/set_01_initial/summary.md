# Sealed Optimizer Benchmarks Summary

Updated: 2026-02-14

## Data and Method
- Source: 17Lands ArenaDirect Sealed trophy pools (ECL).
- Pool reconstruction: maindeck + sideboard.
- Player deck score via `score_custom_deck`.
- Similarity: multiset Jaccard on spells (basic lands excluded).
- Top3 builds aggregated with diversity (MMR).

## Baseline Benchmark (2026-02-12, 50 pools)
- Player avg score: 67.1130 (median 66.435).
- Algo Top1 avg: 80.6304 (median 80.515). Delta Top1 - player: +13.5174.
- Top1 > player: 100% (50/50).
- Jaccard avg: Top1 0.4135, Best-of-3 0.5283.
- Match in Top3: strict archetype 38%, color match 62%.
- Top3 diversity: 3.0 archetypes on average.

## Iteration 2 vs Baseline (2026-02-13, 50 pools)
- Top1 avg: 84.1612 (+3.5308).
- Jaccard Top1: 0.4142 (+0.0008).
- Jaccard Best-of-3: 0.5069 (-0.0213).
- Strict archetype match Top3: 34% (-4 pts).
- Color match Top3: 54% (-8 pts).
- Takeaway: stronger absolute scores, weaker alignment to player builds.

## Calibration Runner (2026-02-13, 50 pools)
Weights: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 (baseline).
- consistency_plus: consistency=1.3
- curve_plus: curve=1.3
- synergy_plus: synergy=1.3
All runs: hc=(3x55), max_ms=10000.

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Delta vs baseline |
|---|---:|---:|---:|---:|---|
| baseline | 83.9450 | 0.5276 | 52.00% | 34.00% | ref |
| consistency_plus | 84.3567 | 0.5215 | 52.17% | 36.96% | +Top1, -Jaccard |
| curve_plus | 83.9576 | 0.5183 | 48.98% | 30.61% | worse alignment |
| synergy_plus | 84.0891 | 0.5423 | 51.06% | 34.04% | best Jaccard |

Takeaway: consistency_plus maximizes Top1; synergy_plus maximizes alignment; curve_plus regresses alignment.

## Curve Half Experiments (curve=0.5)
Weights: power=2.0, consistency=1.0, curve=0.5, synergy=1.0.

1) Split run (2026-02-14, 47 pools, compared to baseline on same pools)
- Top1: 83.7471 (-0.0669)
- Jaccard Best3: 0.5457 (+0.0108)
- Color match Top3: 58.33% (+9.39 pts)
- Strict match Top3: 37.50% (+7.71 pts)

2) Standalone run (2026-02-14, 50 pools, no baseline comparison)
- Top1: 83.6298
- Jaccard Best3: 0.5511
- Color match Top3: 57.45%
- Strict match Top3: 36.17%

3) Partial 25-pool run (full scenario set)
- curve_half had best alignment in that subset (Jaccard 0.5879; color 52.17%; strict 30.43%).

Takeaway: curve_half improves alignment with minimal Top1 loss. Needs full 50-pool, same-set comparison across all scenarios for a final call.

## Recommendation Snapshot
- If prioritizing Top1 score: consistency_plus.
- If prioritizing alignment to player decks: curve_half is the strongest candidate so far.

## Caveats
- Some runs used 47 or 25 pools due to timeouts; cross-run comparisons are indicative only when pool sets differ.