# Sealed Optimizer Calibration Runner Report

Date: 2026-02-14T18:26:42.103533+00:00
Input: `backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json (split runs)`
Pools: 47
Baseline scenario: `baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 83.8140 | 0.5349 | 48.94% | 29.79% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_half | 83.7471 | 0.5457 | 58.33% | 37.50% | 3.00 | -0.0669 | +0.0108 | +9.39 pts |

## Weights

- `baseline`: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_half`: power=2.0, consistency=1.0, curve=0.5, synergy=1.0 | hc=(3x55) | max_ms=10000
