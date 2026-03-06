# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T16:48:11.401760+00:00
Input: `backend\reports\benchmarks\set_03_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 49
Baseline scenario: `prod_current_s1337`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 83.5553 | 0.5193 | 57.14% | 30.61% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| prod_current_s2027 | 83.5994 | 0.5400 | 61.22% | 32.65% | 3.00 | +0.0441 | +0.0207 | +4.08 pts |
| prod_current_s31415 | 83.5661 | 0.5334 | 61.22% | 32.65% | 3.00 | +0.0108 | +0.0141 | +4.08 pts |

## Weights

- `prod_current_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
