# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T14:53:47.019199+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json`
Pools: 50
Baseline scenario: `prod_current_s1337`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 84.1176 | 0.5241 | 52.00% | 32.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| prod_current_s2027 | 83.9192 | 0.5257 | 50.00% | 32.00% | 3.00 | -0.1984 | +0.0016 | -2.00 pts |
| prod_current_s31415 | 84.0152 | 0.5305 | 54.00% | 32.00% | 3.00 | -0.1024 | +0.0064 | +2.00 pts |

## Weights

- `prod_current_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
