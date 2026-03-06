# Sealed Optimizer Calibration Runner Report

Date: 2026-02-15T23:47:35.232373+00:00
Input: `backend\reports\benchmarks\set_02_latest50\arena_direct_trophy_with_pools.json`
Pools: 50
Baseline scenario: `baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 82.3674 | 0.5521 | 58.00% | 30.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| consistency_plus | 82.9929 | 0.5636 | 57.14% | 30.61% | 3.00 | +0.6255 | +0.0115 | -0.86 pts |
| curve_plus | 82.5031 | 0.5334 | 55.10% | 28.57% | 3.00 | +0.1357 | -0.0187 | -2.90 pts |
| synergy_plus | 82.2812 | 0.5662 | 59.18% | 32.65% | 3.00 | -0.0862 | +0.0141 | +1.18 pts |
| curve_half | 82.4651 | 0.5595 | 57.14% | 32.65% | 3.00 | +0.0977 | +0.0074 | -0.86 pts |

## Weights

- `baseline`: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `consistency_plus`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_plus`: power=2.0, consistency=1.0, curve=1.3, synergy=1.0 | hc=(3x55) | max_ms=10000
- `synergy_plus`: power=2.0, consistency=1.0, curve=1.0, synergy=1.3 | hc=(3x55) | max_ms=10000
- `curve_half`: power=2.0, consistency=1.0, curve=0.5, synergy=1.0 | hc=(3x55) | max_ms=10000
