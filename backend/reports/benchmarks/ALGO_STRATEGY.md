# Sealed Optimizer - Strategic Notes

## Goal
- Build a sealed optimizer that is both:
- strong on absolute score (`Avg Top1`)
- aligned with human trophy builds (`Jaccard`, color/archetype match in Top3)

## Current Baseline (as of latest runs)
- Tested on two 50-pool datasets (`set_01_initial`, `set_02_latest50`).
- Default family compared:
- `baseline` (2 / 1 / 1 / 1)
- `consistency_plus` (2 / 1.3 / 1 / 1)
- `curve_plus` (2 / 1 / 1.3 / 1)
- `synergy_plus` (2 / 1 / 1 / 1.3)
- `curve_half` (2 / 1 / 0.5 / 1)
- plus custom blend `2 / 1.25 / 0.75 / 1`.

## Key Takeaways
- `consistency_plus` is the strongest stable option for overall competitiveness.
- `curve_half` improves alignment metrics in many runs, but with less stability on score.
- `synergy_plus` is strong for alignment (`Jaccard`, color/strict match), weaker on pure Top1.
- `curve_plus` underperforms on alignment and is currently not recommended.

## Decision Applied
- Production default moved to:
- `power = 2.0`
- `consistency = 1.3`
- `curve = 1.0`
- `synergy = 1.0`
- Implemented in `supabase/functions/_shared/sealedOptimizerCore.ts`.

## Why This Decision
- Best robust trade-off across both datasets with less variance than more aggressive blends.
- Keeps strong score behavior while preserving acceptable alignment.
- Good anchor version before deeper structural tuning.

## Next Priority (Algorithm)
1. Rework `Curve & Structure` axis to better reflect real deck quality:
- explicit per-component auditability (raw, scale, delta)
- better top-heavy penalty calibration
- tighter relationship between early plays and creature corridor
2. Improve stability of scenario comparison:
- reduce run failures (JSON parse / transient status issues)
- enforce strict same-pool comparison for scenario verdicts
3. Run controlled ablations:
- no synergy shard
- no skeleton influence
- reduced dependency safety
- quantify marginal value of each block.

## Evaluation Protocol (must remain constant)
- Always compare on identical pool sets.
- Report at least:
- `Avg Top1`
- `Avg Jaccard Best3`
- `Color Match Top3`
- `Strict Match Top3`
- `Diversity Top3`
- Keep latency/compute cost visible for each scenario.

## Working Rule
- Any weighting change proposed for prod must be backed by:
- at least one 50-pool run on current set
- direct comparison vs current prod baseline
- explicit trade-off statement (score vs alignment vs stability).
