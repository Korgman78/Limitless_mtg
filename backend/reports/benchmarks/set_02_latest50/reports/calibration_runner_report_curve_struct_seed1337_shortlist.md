# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T21:16:15.324574+00:00
Input: `backend\reports\benchmarks\set_02_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `curve_baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline | 82.8734 | 0.5699 | 62.00% | 32.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75 | 83.1446 | 0.5623 | 60.00% | 32.00% | 3.00 | +0.2712 | -0.0076 | -2.00 pts |
| curve_corridor_75 | 82.9826 | 0.5736 | 62.00% | 32.00% | 3.00 | +0.1092 | +0.0037 | +0.00 pts |

## Weights

- `curve_baseline`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
