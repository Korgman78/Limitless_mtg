# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T22:47:21.993838+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json`
Pools: 50
Baseline scenario: `curve_skeleton_75_s1337`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_skeleton_75_s1337 | 84.2310 | 0.5338 | 50.00% | 32.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s2027 | 84.4382 | 0.5352 | 48.00% | 30.00% | 3.00 | +0.2072 | +0.0014 | -2.00 pts |
| curve_skeleton_75_s31415 | 84.3380 | 0.5300 | 48.00% | 30.00% | 3.00 | +0.1070 | -0.0038 | -2.00 pts |

## Weights

- `curve_skeleton_75_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
