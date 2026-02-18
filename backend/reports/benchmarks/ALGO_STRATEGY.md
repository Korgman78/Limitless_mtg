# Sealed Optimizer - Strategic Notes

## Decision Changelog
- 2026-02-18: Rolled back "all-in HC/scoring" experiment (5 simultaneous changes) after severe regression on set_02.
- 2026-02-18: Implemented and kept HC micro-upgrade `best-of-k` (K=2) after positive multi-metric validation on set_02.
- 2026-02-18: Kept production axis weights at `power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0` as baseline.

## Goal
- Build a sealed optimizer that is both:
  - strong on absolute score (`Avg Top1`)
  - aligned with human trophy builds (`Jaccard`, color/archetype match in Top3)
  - stable under edge compute limits

## Current Baseline (as of latest runs)
- Tested on two 50-pool datasets: `set_01_initial`, `set_02_latest50`.
- Families compared:
  - `baseline` (2 / 1 / 1 / 1)
  - `consistency_plus` (2 / 1.3 / 1 / 1)
  - `curve_plus` (2 / 1 / 1.3 / 1)
  - `synergy_plus` (2 / 1 / 1 / 1.3)
  - `curve_half` (2 / 1 / 0.5 / 1)
  - custom blend `2 / 1.25 / 0.75 / 1`

## Key Takeaways
- `consistency_plus` is the strongest stable option for overall competitiveness.
- `curve_half` can improve alignment metrics, but is less stable on score.
- `synergy_plus` is often good for alignment, weaker on pure Top1.
- `curve_plus` underperforms on alignment and is not recommended currently.

## Production Decision Applied
- Current prod weights:
  - `power = 2.0`
  - `consistency = 1.3`
  - `curve = 1.0`
  - `synergy = 1.0`
- Implemented in `supabase/functions/_shared/sealedOptimizerCore.ts`.

## Why This Decision
- Best robust trade-off across both datasets, with lower variance than more aggressive blends.
- Keeps strong score behavior while preserving acceptable alignment.
- Good anchor version before deeper structural tuning.

## Post-Mortem: Failed "All-in" HC Upgrade (rolled back)
- Attempted together:
  - best-improvement/k-best HC
  - extended annealing
  - adaptive synergy normalization
  - adaptive curve penalties
  - multi-card swaps
- Observed on `set_02_latest50` (50 pools, prod weights):
  - severe quality regression (`Avg Top1`, `Jaccard`, color/strict match all down)
  - stability improved (fewer/no worker fails), but not worth quality loss
  - full rollback applied and redeployed

### Likely root causes
1. Too many coupled changes at once (search behavior + score scale shifts).
2. Higher per-iteration HC cost reduced effective convergence under shard time budget.
3. Extended annealing/reheating created too much late exploration.
4. Axis normalizations changed without immediate weight re-calibration.
5. Multi-card swaps increased variance/noise under constrained runtime.

## Correct Method (mandatory)
1. Freeze baseline: fixed code, weights, seed, pool set.
2. Change one variable at a time (never mix search and scoring changes).
3. Run A/B on identical 50 pools and identical scenario settings.
4. Accept only with multi-metric improvement (no major alignment regression).
5. Re-calibrate weights only after confirmed scoring-scale changes.
6. Keep rollback-ready checkpoints for each accepted step.

## Next Test Priority
- First candidate:
  - HC micro-upgrade only: `first-improvement` + tiny `best-of-k` (K=2)
  - no scoring/normalization changes
  - no multi-card swaps
  - no extended annealing
- Rationale:
  - likely low-risk quality gain
  - preserves current calibration
  - minimal worker-limit risk

## Implemented and Kept: HC `best-of-k` (K=2)
- Status: implemented and deployed in `supabase/functions/_shared/sealedOptimizerCore.ts`.
- Scope:
  - HC neighborhood changed from first positive swap to best-of-2 positive swaps.
  - No scoring/axis/weight/annealing changes.

### Validation on set_02 (latest 50 trophy pools)
- Report:
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_bestofk2_full50_deployed.md`
- Compared to reference `prod_current_rerun`:
  - Processed pools: `47` (vs `48` in reference; transient failures differ by run)
  - `Avg Top1`: `82.9156 -> 82.7747` (`-0.1409`, minor)
  - `Avg Jaccard Best3`: `0.5407 -> 0.5671` (`+0.0264`)
  - `Color Match Top3`: `56.25% -> 63.83%` (`+7.58 pts`)
  - `Strict Match Top3`: `29.17% -> 29.79%` (`+0.62 pt`)
  - `Diversity Top3`: `3.00 -> 3.00` (stable)
  - `Beats Player Rate`: `100% -> 100%` (stable)

### Decision
- Keep the change.
- Reason:
  - strong improvement on alignment metrics
  - no meaningful degradation on quality score (`Top1` down by only `0.14`)
  - diversity and beat-rate remain stable

## Potential Evolutions (beyond best-of-k)
### Priority A (high value, controlled risk)
1. Light annealing tune (not full extended annealing)
   - Keep current behavior, only add a very small late-stage escape probability.
   - Goal: avoid local traps without destabilizing convergence.
2. Local neighborhood quality upgrade
   - Smarter candidate ordering (role-aware swaps: curve slot, creature/non-creature role).
   - Goal: evaluate better swaps earlier with same compute budget.
3. HC budget instrumentation and auto-guardrails
   - Track per-run `evalCalls`, `iterationsDone`, `timeToBest`, deadline hits.
   - Add soft caps to keep worker risk low while preserving quality.

### Priority B (medium value, medium risk)
4. Multi-card swaps (strictly gated)
   - Reintroduce 2-for-2 only under very strict trigger conditions (high stagnation only).
   - Goal: unlock coupled pivots when 1-for-1 is blocked.
5. Curve & Structure calibration pass
   - Keep same axis formula, but retune component scales:
     - top-heavy
     - skeleton-shape
     - early-creature profile
     - creature corridor
     - removal integration
   - Goal: reduce false penalties on healthy sealed curves.
6. Dependency safety granularity
   - Distinguish hard-build-around dependencies vs soft-synergy dependencies.
   - Goal: avoid over-penalizing splashable/value cards.

### Priority C (high potential, higher effort)
7. Format-adaptive synergy normalization (guarded rollout)
   - Revisit percentile-based normalization with weight recalibration baked in.
   - Must be shipped only with dedicated scenario tuning.
8. Auto-calibration runner for weights/components
   - Semi-automated search over axis and sub-component scales on fixed trophy sets.
   - Goal: optimize globally across score + alignment + diversity metrics.
9. Controlled ablation framework
   - On/off toggles for skeleton, synergy blocks, dependency safety, removal profile coupling.
   - Goal: quantify real marginal value of each subsystem.

### Non-negotiable rollout rule for each evolution
- 1 change at a time.
- Same 50-pool set, same seeds, same scenario config.
- Keep only if multi-metric win (not just Top1).
- Immediate rollback if significant alignment regression.

## Evaluation Protocol (must remain constant)
- Always compare on identical pool sets.
- Always report:
  - `Avg Top1`
  - `Avg Jaccard Best3`
  - `Color Match Top3`
  - `Strict Match Top3`
  - `Diversity Top3`
  - worker failures
  - average compute time per pool

## Working Rule
- Any prod weighting change must include:
  - at least one 50-pool run on current set
  - direct comparison vs current prod baseline
  - explicit trade-off statement (score vs alignment vs stability)
  - reproducible report artifacts in `backend/reports/benchmarks/`
