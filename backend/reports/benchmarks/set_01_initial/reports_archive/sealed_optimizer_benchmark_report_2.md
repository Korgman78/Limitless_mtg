# Sealed Optimizer Benchmark Report 2 (Replay Trophy Pools)

Date: 2026-02-13 14:54:22 UTC

## Scope
- Baseline: `backend\tmp\_tmp_trophy_pool_replay_report_cleaned_combined.json`
- Iteration 2: `backend\tmp\_tmp_trophy_pool_replay_report_iter2.json`
- Records benchmarkes: baseline=50, iteration2=50

## KPI Delta (Iteration 2 vs Baseline)

| Metrique | Baseline | Iteration 2 | Delta | Verdict |
|---|---:|---:|---:|---|
| Top1 algo moyen | 80.6304 | 84.1612 | +3.5308 | progression |
| Best-of-3 algo moyen | 80.6304 | 84.1612 | +3.5308 | progression |
| Jaccard moyen vs top1 | 0.4135 | 0.4142 | +0.0008 | progression |
| Jaccard moyen vs meilleur top3 | 0.5283 | 0.5069 | -0.0213 | regression |
| Match archetype strict dans top3 (%) | 38.00% | 34.00% | -4.00 pts | regression |
| Match couleurs dans top3 (%) | 62.00% | 54.00% | -8.00 pts | regression |
| Top1 Jaccard >= 0.50 (%) | 46.00% | 46.00% | +0.00 pts | stable |
| Best-of-3 Jaccard >= 0.60 (%) | 42.00% | 40.00% | -2.00 pts | regression |
| Diversite archetypes top3 (moyenne) | 3.0000 | 3.0000 | +0.0000 | stable |

## Core Scores
- Joueur moyen: baseline 67.1130 -> iter2 74.6872 (+7.5742)
- Top1 moyen: baseline 80.6304 -> iter2 84.1612 (+3.5308)
- Best-of-3 moyen: baseline 80.6304 -> iter2 84.1612 (+3.5308)
- Delta moyen (best - joueur): baseline 13.5174 -> iter2 9.4740 (-4.0434)

## Similarity / Alignment
- Jaccard moyen top1: baseline 0.4135 -> iter2 0.4142 (+0.0008)
- Jaccard moyen best-of-3: baseline 0.5283 -> iter2 0.5069 (-0.0213)
- Match strict top3: baseline 38.00% -> iter2 34.00% (-4.00 pts)
- Match couleurs top3: baseline 62.00% -> iter2 54.00% (-8.00 pts)

## Lecture rapide
- Progressions notables:
  - Top1 algo moyen: +3.5308
  - Best-of-3 algo moyen: +3.5308
  - Jaccard moyen vs top1: +0.0008
- Regressions notables:
  - Match couleurs dans top3 (%): -8.00 pts
  - Match archetype strict dans top3 (%): -4.00 pts
  - Best-of-3 Jaccard >= 0.60 (%): -2.00 pts
  - Jaccard moyen vs meilleur top3: -0.0213

## Note
- Les deltas sont calcules a perimetre comparable (50 pools).
- Les metriques d'alignement (Jaccard, matching archetype/couleurs) sont interpretees en `higher is better`.