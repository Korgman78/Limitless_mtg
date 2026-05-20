# Sealed Optimizer Calibration Runner Report

Date: 2026-05-09T09:54:07.147491+00:00
Input: `backend\tmp\_tmp_arena_direct_sealed_trophy_SOS_50.json`
Pools: 2
Baseline scenario: `baseline`

## Scenario Comparison

| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Diversity Top3 | dTop1 vs baseline | dJaccard Best3 | dColor Match |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 74.5150 | 0.2902 | 50.00% | 0.00% | 3.00 | +0.0000 | +0.0000 | +0.00 pts |
| consistency_plus | 75.4150 | 0.3555 | 50.00% | 0.00% | 3.00 | +0.9000 | +0.0653 | +0.00 pts |

## Weights

- `baseline`: power=2.0, consistency=1.0, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
- `consistency_plus`: power=2.0, consistency=1.3, curve=1.0, synergy=1.0 | hc=(3x55) | max_ms=10000
