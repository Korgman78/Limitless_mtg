# Sealed Optimizer Calibration Runner Report

Date: 2026-02-19T13:23:10.290813+00:00
Input: `backend\reports\benchmarks\set_02_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `curve_baseline_s1337`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline_s1337 | 82.8634 | 0.5721 | 64.00% | 32.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_skeleton_75_s1337 | 83.2522 | 0.5673 | 60.00% | 32.00% | 3.00 | +0.3888 | -0.0048 | -4.00 pts |
| curve_corridor_75_s1337 | 82.9016 | 0.5697 | 62.00% | 32.00% | 3.00 | +0.0382 | -0.0024 | -2.00 pts |
| curve_baseline_s2027 | 82.9862 | 0.5607 | 60.00% | 30.00% | 3.00 | +0.1228 | -0.0114 | -4.00 pts |
| curve_skeleton_75_s2027 | 83.2582 | 0.5649 | 62.00% | 32.00% | 3.00 | +0.3948 | -0.0072 | -2.00 pts |
| curve_corridor_75_s2027 | 82.9046 | 0.5692 | 62.00% | 32.00% | 3.00 | +0.0412 | -0.0029 | -2.00 pts |
| curve_baseline_s31415 | 83.0140 | 0.5680 | 62.00% | 32.00% | 3.00 | +0.1506 | -0.0041 | -2.00 pts |
| curve_skeleton_75_s31415 | 83.2628 | 0.5639 | 60.00% | 32.00% | 3.00 | +0.3994 | -0.0082 | -4.00 pts |
| curve_corridor_75_s31415 | 82.8942 | 0.5657 | 62.00% | 32.00% | 3.00 | +0.0308 | -0.0064 | -2.00 pts |

## Weights

- `curve_baseline_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_baseline_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_baseline_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
