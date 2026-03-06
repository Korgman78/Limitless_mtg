# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T14:12:45.780718+00:00
Input: `backend\reports\benchmarks\set_02_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `curve_baseline_s2027`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s2027 | 82.9580 | 0.5529 | 58.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s2027 | 83.2590 | 0.5708 | 64.00% | 32.00% | 3.00 | +0.3010 | +0.0179 | +6.00 pts |
| curve_corridor_75_s2027 | 82.8624 | 0.5704 | 60.00% | 30.00% | 3.00 | -0.0956 | +0.0175 | +2.00 pts |

## Weights

- `curve_baseline_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
