# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T16:05:44.201856+00:00
Input: `backend\reports\benchmarks\set_03_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 49
Baseline scenario: `curve_baseline_s2027`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s2027 | 83.5069 | 0.5365 | 63.27% | 32.65% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s2027 | 83.8720 | 0.5470 | 63.27% | 32.65% | 3.00 | +0.3651 | +0.0105 | +0.00 pts |
| curve_corridor_75_s2027 | 83.5608 | 0.5227 | 55.10% | 30.61% | 3.00 | +0.0539 | -0.0138 | -8.17 pts |

## Weights

- `curve_baseline_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
