# Problematic Pools Analysis (prod_current baseline)

Scope: `set_02_latest50` + `set_03_latest50` (baseline `prod_current_postpass_full50_v2`)

Badness score: `(1-best3_jaccard)*0.6 + no_color_top3*0.25 + no_strict_top3*0.15`

## Set-Level Snapshot
| Set | Processed | Color miss % | Strict miss % | Low overlap % (best3 jaccard < 0.45) |
|---|---:|---:|---:|---:|
| set_02_latest50 | 50 | 38.00% | 70.00% | 20.00% |
| set_03_latest50 | 49 | 42.86% | 69.39% | 32.65% |

## Top 20 Problematic Pools
| # | Set | Aggregate ID | Player Arch | Top1 Arch | Best3 Jaccard | Top1 Jaccard | Color Top3 | Strict Top3 | Score gap (Top1-Player) | Cause |
|---:|---|---|---|---|---:|---:|---|---|---:|---|
| 1 | set_02_latest50 | `1b4da0773fa3435e84aed1573efd8704` | GW | UR | 0.0698 | 0.0698 | False | False | +11.96 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 2 | set_03_latest50 | `4064bab699774574aa4ec244c7cb15f7` | WU | UR | 0.2105 | 0.1795 | False | False | +21.34 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 3 | set_02_latest50 | `10a6a9973fc846f18e70bb335c33489d` | GWb | WUR | 0.2368 | 0.2368 | False | False | +10.63 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 4 | set_03_latest50 | `4651471b15a94ff48a7a3f1c760a6e8f` | GB | WU | 0.2432 | 0.0222 | False | False | +5.05 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 5 | set_03_latest50 | `42ca8812330342b2a0bfdd4c7f0a3bc0` | UW | BG | 0.2432 | 0.0222 | False | False | +6.35 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 6 | set_02_latest50 | `9d3e463138c34eb7bc76966ceddf31f9` | BRG | WU | 0.2703 | 0.0444 | False | False | +13.54 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 7 | set_03_latest50 | `b3ff042b4e804339ba405c809cdd670e` | GB | UR | 0.2778 | 0.0222 | False | False | +10.27 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 8 | set_02_latest50 | `e0c417409a7a415080e8d226d71b8bcb` | RWb | BR | 0.2821 | 0.2821 | False | False | +14.80 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 9 | set_02_latest50 | `272cceebe1bf47778f2e4c52cbd9c0b6` | BGw | UG | 0.2973 | 0.1707 | False | False | +10.45 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 10 | set_03_latest50 | `44d05c30d5e84e60b2e40ea72b6f1596` | BGu | UR | 0.2973 | 0.0667 | False | False | +9.15 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 11 | set_03_latest50 | `a57248d9c36f436aa1d9370d8baa79c2` | BGw | WU | 0.3056 | 0.1750 | False | False | +17.58 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 12 | set_03_latest50 | `e955ae41c5c7484a8387e4a092140489` | GBW | UR | 0.3056 | 0.0217 | False | False | +16.29 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 13 | set_03_latest50 | `dc21270ba51f4219b59fd7c002efbad9` | BR | WG | 0.3056 | 0.1190 | False | False | +5.49 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 14 | set_03_latest50 | `26c7929cc10f4f939592910ef51087aa` | GB | WUR | 0.3333 | 0.0435 | False | False | +5.94 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 15 | set_03_latest50 | `b37fd3bdee964b89be027db61cddb793` | GB | WU | 0.3333 | 0.0667 | False | False | +3.16 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 16 | set_02_latest50 | `4dbb3417d8234acd87ae27f29a74396a` | WUg | WG | 0.3429 | 0.3429 | False | False | +17.27 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 17 | set_03_latest50 | `7a20d9c6a6584b409112f6253d87bf55` | WG | UR | 0.3529 | 0.1220 | False | False | +6.25 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 18 | set_02_latest50 | `0af6ba7bcdea4d6890bcb12f14ee92fc` | WG | WBG | 0.3824 | 0.3824 | False | False | +2.83 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 19 | set_03_latest50 | `ccba74d3d98c4d009322c94d27d13c97` | WGb | UBG | 0.3824 | 0.2368 | False | False | +4.99 | Color-family miss (optimizer never reaches player color pair in Top3). |
| 20 | set_03_latest50 | `4211c737608942f8bb4f2d26728e48ae` | RG | UBG | 0.3824 | 0.2368 | False | False | +6.56 | Color-family miss (optimizer never reaches player color pair in Top3). |
