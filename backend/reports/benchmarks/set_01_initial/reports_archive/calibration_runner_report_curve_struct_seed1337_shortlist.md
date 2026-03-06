# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T20:18:52.335848+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json`
Pools: 50
Baseline scenario: `curve_baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline | 84.0210 | 0.5247 | 48.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75 | 84.2322 | 0.5369 | 52.00% | 32.00% | 3.00 | +0.2112 | +0.0122 | +4.00 pts |
| curve_corridor_75 | 83.9880 | 0.5371 | 46.00% | 30.00% | 3.00 | -0.0330 | +0.0124 | -2.00 pts |

## Weights

- `curve_baseline`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
