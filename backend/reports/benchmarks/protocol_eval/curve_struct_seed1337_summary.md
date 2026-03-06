# Curve & Structure Sweep (Seed 1337)

## set_01
| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|
| curve_baseline | 84.0210 | 0.5247 | 48.00% | 30.00% | 98.00% |
| curve_skeleton_75 | 84.2322 | 0.5369 | 52.00% | 32.00% | 98.00% |
| curve_corridor_75 | 83.9880 | 0.5371 | 46.00% | 30.00% | 98.00% |

## set_02
| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|
| curve_baseline | 82.8734 | 0.5699 | 62.00% | 32.00% | 100.00% |
| curve_skeleton_75 | 83.1446 | 0.5623 | 60.00% | 32.00% | 98.00% |
| curve_corridor_75 | 82.9826 | 0.5736 | 62.00% | 32.00% | 100.00% |

## set_03
| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|
| curve_baseline | 83.7882 | 0.5276 | 59.18% | 30.61% | 100.00% |
| curve_skeleton_75 | 83.8224 | 0.5474 | 65.31% | 32.65% | 100.00% |
| curve_corridor_75 | 83.7353 | 0.5532 | 63.27% | 32.65% | 100.00% |

## Aggregate delta vs baseline (mean across sets)
- curve_skeleton_75: Top1 +0.1722, Jaccard +0.0081, Color +2.71 pts, Strict +1.35 pts, Beats -0.67 pts
- curve_corridor_75: Top1 +0.0078, Jaccard +0.0139, Color +0.70 pts, Strict +0.68 pts, Beats +0.00 pts
