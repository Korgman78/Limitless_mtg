# Protocol Eval Summary (3 sets x 3 seeds)

## set_01
| Scenario | Processed | Failed | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 50 | 0 | 84.1176 | 0.5241 | 52.00% | 32.00% | 100.00% |
| prod_current_s2027 | 50 | 0 | 83.9192 | 0.5257 | 50.00% | 32.00% | 98.00% |
| prod_current_s31415 | 50 | 0 | 84.0152 | 0.5305 | 54.00% | 32.00% | 98.00% |

## set_02
| Scenario | Processed | Failed | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 50 | 0 | 82.8600 | 0.5583 | 60.00% | 32.00% | 98.00% |
| prod_current_s2027 | 50 | 0 | 82.9150 | 0.5609 | 62.00% | 32.00% | 100.00% |
| prod_current_s31415 | 50 | 0 | 82.8178 | 0.5587 | 62.00% | 32.00% | 98.00% |

## set_03
| Scenario | Processed | Failed | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player |
|---|---:|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 49 | 0 | 83.5553 | 0.5193 | 57.14% | 30.61% | 100.00% |
| prod_current_s2027 | 49 | 0 | 83.5994 | 0.5400 | 61.22% | 32.65% | 100.00% |
| prod_current_s31415 | 49 | 0 | 83.5661 | 0.5334 | 61.22% | 32.65% | 100.00% |

## Aggregate (mean across sets)
| Scenario | Avg Top1 | Avg Jaccard Best3 | Color Match Top3 | Strict Match Top3 | Beats Player | Total Fails |
|---|---:|---:|---:|---:|---:|---:|
| prod_current_s1337 | 83.5110 | 0.5339 | 56.38% | 31.54% | 99.33% | 0 |
| prod_current_s2027 | 83.4779 | 0.5422 | 57.74% | 32.22% | 99.33% | 0 |
| prod_current_s31415 | 83.4664 | 0.5409 | 59.07% | 32.22% | 98.67% | 0 |
