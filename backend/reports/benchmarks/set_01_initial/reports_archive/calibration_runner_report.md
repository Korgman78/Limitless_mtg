# Sealed Optimizer Calibration Runner Report

Date: 2026-02-13T19:16:07.530778+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json`
Pools: 50
Baseline scenario: `baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 83.9450 | 0.5276 | 52.00% | 34.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| consistency_plus | 84.3567 | 0.5215 | 52.17% | 36.96% | 3.00 | +0.4117 | -0.0061 | +0.17 pts |
| curve_plus | 83.9576 | 0.5183 | 48.98% | 30.61% | 3.00 | +0.0126 | -0.0093 | -3.02 pts |
| synergy_plus | 84.0891 | 0.5423 | 51.06% | 34.04% | 3.00 | +0.1441 | +0.0147 | -0.94 pts |

## Weights

- `baseline`: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `consistency_plus`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_plus`: power=2.0, consistency=1.0, curve=1.3, synergy=1.0 | hc=(3x55) | max_ms=10000
- `synergy_plus`: power=2.0, consistency=1.0, curve=1.0, synergy=1.3 | hc=(3x55) | max_ms=10000
