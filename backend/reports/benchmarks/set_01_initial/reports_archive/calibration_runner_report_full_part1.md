# Sealed Optimizer Calibration Runner Report

Date: 2026-02-14T20:00:28.926282+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_with_pools_cleaned_part1.json`
Pools: 25
Baseline scenario: `baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 84.2280 | 0.5727 | 40.00% | 24.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| consistency_plus | 84.9508 | 0.5602 | 44.00% | 24.00% | 3.00 | +0.7228 | -0.0125 | +4.00 pts |
| curve_plus | 84.4677 | 0.5538 | 40.91% | 22.73% | 3.00 | +0.2397 | -0.0189 | +0.91 pts |
| synergy_plus | 84.2717 | 0.5582 | 45.83% | 25.00% | 3.00 | +0.0437 | -0.0145 | +5.83 pts |
| curve_half | 84.6830 | 0.5879 | 52.17% | 30.43% | 3.00 | +0.4550 | +0.0152 | +12.17 pts |

## Weights

- `baseline`: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `consistency_plus`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `curve_plus`: power=2.0, consistency=1.0, curve=1.3, synergy=1.0 | hc=(3x55) | max_ms=10000
- `synergy_plus`: power=2.0, consistency=1.0, curve=1.0, synergy=1.3 | hc=(3x55) | max_ms=10000
- `curve_half`: power=2.0, consistency=1.0, curve=0.5, synergy=1.0 | hc=(3x55) | max_ms=10000
