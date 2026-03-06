# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T16:19:18.738758+00:00
Input: `backend\reports\benchmarks\set_03_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 20
Baseline scenario: `curve_baseline_s2027`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s2027 | 84.4070 | 0.5081 | 60.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s2027 | 84.5810 | 0.4981 | 60.00% | 35.00% | 3.00 | +0.1740 | -0.0100 | +0.00 pts |
| curve_corridor_75_s2027 | 84.3095 | 0.5017 | 60.00% | 30.00% | 3.00 | -0.0975 | -0.0064 | +0.00 pts |

## Weights

- `curve_baseline_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
