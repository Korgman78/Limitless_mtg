# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T16:42:34.394787+00:00
Input: `backend\reports\benchmarks\set_03_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 20
Baseline scenario: `curve_baseline_s31415`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s31415 | 84.2980 | 0.5033 | 60.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s31415 | 84.7285 | 0.5018 | 60.00% | 30.00% | 3.00 | +0.4305 | -0.0015 | +0.00 pts |
| curve_corridor_75_s31415 | 84.5650 | 0.4970 | 60.00% | 30.00% | 3.00 | +0.2670 | -0.0063 | +0.00 pts |

## Weights

- `curve_baseline_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
