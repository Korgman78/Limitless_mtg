# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T19:21:04.723953+00:00
Input: `backend\reports\benchmarks\set_03_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 49
Baseline scenario: `curve_baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curve_baseline | 83.7882 | 0.5276 | 59.18% | 30.61% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| curve_topheavy_75 | 83.7255 | 0.5439 | 59.18% | 30.61% | 3.00 | -0.0627 | +0.0163 | +0.00 pts |
| curve_skeleton_75 | 83.8224 | 0.5474 | 65.31% | 32.65% | 3.00 | +0.0342 | +0.0198 | +6.13 pts |
| curve_early_75 | 83.7888 | 0.5353 | 61.22% | 30.61% | 3.00 | +0.0006 | +0.0077 | +2.04 pts |
| curve_corridor_75 | 83.7353 | 0.5532 | 63.27% | 32.65% | 3.00 | -0.0529 | +0.0256 | +4.09 pts |
| curve_removal_3 | 83.9567 | 0.5345 | 57.14% | 30.61% | 3.00 | +0.1685 | +0.0069 | -2.04 pts |

## Weights

- `curve_baseline`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_topheavy_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_skeleton_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_early_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_corridor_75`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_removal_3`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
