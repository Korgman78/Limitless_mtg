# Sealed Optimizer Calibration Runner Report

Date: 2026-02-18T15:51:13.180811+00:00
Input: `backend\reports\benchmarks\set_02_latest50\data\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `prod_current_s1337`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 82.8600 | 0.5583 | 60.00% | 32.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| prod_current_s2027 | 82.9150 | 0.5609 | 62.00% | 32.00% | 3.00 | +0.0550 | +0.0026 | +2.00 pts |
| prod_current_s31415 | 82.8178 | 0.5587 | 62.00% | 32.00% | 3.00 | -0.0422 | +0.0004 | +2.00 pts |

## Weights

- `prod_current_s1337`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s2027`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `prod_current_s31415`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
