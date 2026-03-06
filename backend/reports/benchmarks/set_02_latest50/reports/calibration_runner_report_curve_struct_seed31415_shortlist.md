# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T15:09:46.456302+00:00
Input: `backend\reports\benchmarks\set_02_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `curve_baseline_s31415`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s31415 | 82.9926 | 0.5599 | 60.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s31415 | 83.1584 | 0.5620 | 56.00% | 32.00% | 3.00 | +0.1658 | +0.0021 | -4.00 pts |
| curve_corridor_75_s31415 | 82.6294 | 0.5678 | 61.22% | 32.65% | 3.00 | -0.3632 | +0.0079 | +1.22 pts |

## Weights

- `curve_baseline_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
