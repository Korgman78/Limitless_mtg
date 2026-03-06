# Sealed Optimizer - Strategic Notes

## Decision Changelog
- 2026-02-18: Rolled back "all-in HC/scoring" experiment (5 simultaneous changes) after severe regression on set_02.
- 2026-02-18: Implemented and kept HC micro-upgrade `best-of-k` (K=2) after positive multi-metric validation on set_02.
- 2026-02-18: Kept production axis weights at `power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0` as baseline.
- 2026-02-18: Added `set_03_latest50` (new latest trophy sample) to avoid overfitting on 2 datasets.
- 2026-02-18: Hardened benchmark transport/parsing (`retry` + tolerant JSON decode) to reduce transient false failures.
- 2026-02-18: Validated protocol `3 sets x 3 seeds` on prod config; all protocol runs completed with `0` benchmark-side failures.
- 2026-02-19: Curve component scale tuning decision = **NO-GO** (keep prod baseline; mixed robustness across sets).
- 2026-02-19: Accepted and deployed micro-fix `final post-pass 1-swap` (in-color only, bounded budget); validated positive/neutral on set_02 and set_03.
- 2026-02-20: Implemented HC instrumentation (`evalCalls`, `iterationsDone`, `timeToBest`, `deadlineHit`) in optimizer debug output; kept.
- 2026-02-20: Tested role-aware HC neighborhood ordering on `set_02` and `set_03`; **NO-GO** cross-set, full rollback of ordering logic.
- 2026-02-20: Exposed `debugHcSummary` through async parent aggregation (status result now includes telemetry when `debug=true`).
- 2026-02-20: Captured HC telemetry baseline on `set_02_latest50` + `set_03_latest50` (prod weights, seed 1337, debug mode).
- 2026-02-21: Budget guardrail A/B (reduced HC neighborhood breadth) tested on set_02 + set_03 => **NO-GO**, rollback applied and redeployed.
- 2026-02-21: Light annealing micro-tune (tiny late escape probability) tested on set_02 + set_03 => **NO-GO**, rollback applied and redeployed.
- 2026-02-23: Increased pre-rank color coverage (`MAX_MAIN_PAIRS: 10 -> 12`) tested on set_02 + set_03 => **NO-GO** cross-set, rollback applied and redeployed.
- 2026-02-23: Conditional pre-rank wildcard pair (`+1` near-cutoff uncertainty only) tested on set_02 + set_03 => **NO-GO** cross-set, rollback applied and redeployed.

## Update 2026-02-23 (Pre-rank color coverage: `MAX_MAIN_PAIRS=12`)
Decision:
- **NO-GO** cross-set.
- Full rollback applied (`MAX_MAIN_PAIRS` restored to `10`) and `sealed-optimizer` redeployed.

What changed in test:
- Single isolated change in `sealedOptimizerCore.ts`:
  - `MAX_MAIN_PAIRS: 10 -> 12`
- No scoring, axis, annealing, HC budget, or weights change.

Reports:
- Candidate reruns:
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_mainpairs12_full50_rerun.json`
  - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_mainpairs12_full50_rerun.json`
- Baseline references:
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`
  - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`

Observed deltas vs baseline:
- `set_02` (49 processed; 1 shard failure):
  - `Avg Top1`: `-0.1033`
  - `Avg Jaccard Best3`: `+0.0058`
  - `Color Match Top3`: `+1.27 pts`
  - `Strict Match Top3`: `+2.65 pts`
  - `Beats Player`: stable (`100%`)
- `set_03` (49 processed):
  - `Avg Top1`: `-0.2367`
  - `Avg Jaccard Best3`: `-0.0139`
  - `Color Match Top3`: `-4.08 pts`
  - `Strict Match Top3`: `-4.08 pts`
  - `Beats Player`: stable (`100%`)

Cross-set weighted delta (set_02 + set_03):
- `Avg Top1`: `-0.1700`
- `Avg Jaccard Best3`: `-0.0041`
- `Color Match Top3`: `-1.41 pts`
- `Strict Match Top3`: `-0.72 pt`
- `Beats Player`: stable (`100%`)

Interpretation:
- Increasing pre-rank pair coverage globally improves alignment on one set but degrades another.
- This indicates **distribution sensitivity** (pool/meta composition differs across recent windows).
- A global static bump of pair coverage is not robust enough for production.

Action taken:
- Reverted to `MAX_MAIN_PAIRS=10`.
- Keep exploring **conditional** coverage rules instead of a global constant increase.

## Update 2026-02-23 (Conditional wildcard pair near pre-rank cutoff)
Decision:
- **NO-GO** cross-set.
- Full rollback applied (wildcard logic removed), `sealed-optimizer` redeployed.

What changed in test:
- Single isolated change:
  - keep `MAX_MAIN_PAIRS=10`
  - add `+1` extra pair only if pair #11 is very close to pair #10 pre-rank support.
- No score formula/weights/HC/annealing change.

Reports:
- Candidate:
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_wildcard11_full50.json`
  - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_wildcard11_full50.json`
- Baseline:
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`
  - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`

Observed deltas vs baseline:
- `set_02`:
  - `Avg Top1`: `+0.0056`
  - `Avg Jaccard Best3`: `-0.0008`
  - `Color Match Top3`: `+0.00 pt`
  - `Strict Match Top3`: `+0.00 pt`
- `set_03`:
  - `Avg Top1`: `-0.0743`
  - `Avg Jaccard Best3`: `-0.0035`
  - `Color Match Top3`: `-4.08 pts`
  - `Strict Match Top3`: `-2.04 pts`

Cross-set weighted delta:
- `Avg Top1`: `-0.0339`
- `Avg Jaccard Best3`: `-0.0021`
- `Color Match Top3`: `-2.02 pts`
- `Strict Match Top3`: `-1.01 pt`

Interpretation:
- Even targeted color-family expansion around pre-rank cutoff is not robust.
- The issue is likely not “coverage count” but **which families** are prioritized under different pool distributions.

## Update 2026-02-20 (HC instrumentation + role-aware ordering A/B)
Decision:
- Keep **instrumentation only**.
- Roll back **role-aware ordering** completely.
- Baseline behavior remains unchanged apart from telemetry visibility in debug mode.

What was tested:
- Change bundle:
  1. HC instrumentation (no score/search behavior impact expected)
  2. Role-aware candidate ordering for add/cut swaps in HC
- Scenario: `prod_current` (`power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0`)
- Datasets:
  - `set_02_latest50` (50 pools)
  - `set_03_latest50` (49 pools)

Reports:
- `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_hcinst_roleorder_full50.json`
- `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_hcinst_roleorder_full50.json`

Reference baseline for comparison:
- `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`
- `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`

Observed deltas vs baseline:
- `set_02`:
  - `Avg Top1`: `-0.1290`
  - `Avg Jaccard Best3`: `-0.0001`
  - `Color Match Top3`: `+2.00 pts`
  - `Strict Match Top3`: `+2.00 pts`
  - `Beats`: stable (`100%`)
- `set_03`:
  - `Avg Top1`: `-0.2151`
  - `Avg Jaccard Best3`: `-0.0159`
  - `Color Match Top3`: `-6.12 pts`
  - `Strict Match Top3`: `-4.08 pts`
  - `Beats`: stable (`100%`)

Interpretation:
- Role-aware ordering is **not robust cross-set**.
- It can improve some alignment dimensions on one set while clearly degrading on another.
- Under current protocol, this is a strict **NO-GO**.

Action taken:
- Ordering logic removed.
- Instrumentation retained to guide next low-risk iterations.

## Update 2026-02-20 (HC telemetry baseline capture)
Scope:
- Scenario: `prod_current` (`power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0`)
- Seed: `1337`
- Mode: `debug=true`
- Sets: `set_02_latest50` and `set_03_latest50`

Reports:
- `backend/reports/benchmarks/set_02_latest50/reports/hc_telemetry_prod_current_debug_full50.json`
- `backend/reports/benchmarks/set_03_latest50/reports/hc_telemetry_prod_current_debug_full50.json`
- Combined:
  - `backend/reports/benchmarks/protocol_eval/hc_telemetry_prod_current_debug_full50_combined.json`
  - `backend/reports/benchmarks/protocol_eval/hc_telemetry_prod_current_debug_full50_summary.md`

Set-level summary:
- `set_02_latest50`:
  - processed `49`, failed `1`
  - avg API elapsed `36,243 ms`
  - avg eval calls `1,273.84`
  - avg iterations done `22.80`
  - avg HC elapsed `315.22 ms`
  - avg time-to-best `213.75 ms`
  - avg deadline-hit rate `19.21%`
- `set_03_latest50`:
  - processed `49`, failed `0`
  - avg API elapsed `35,837 ms`
  - avg eval calls `1,285.90`
  - avg iterations done `24.75`
  - avg HC elapsed `324.78 ms`
  - avg time-to-best `219.89 ms`
  - avg deadline-hit rate `19.79%`

Cross-set aggregate (98 pools):
- avg runs per optimize call: `27.57`
- avg eval calls: `1,279.87`
- avg iterations done: `23.78`
- avg HC elapsed: `320.00 ms`
- avg time-to-best: `216.82 ms` (~`67.8%` of HC elapsed)
- avg deadline-hit rate: `19.50%`

Interpretation:
- Search is moderately budget-constrained (~20% deadline hit).
- Best score is typically found before the end of HC runtime, but not extremely early (around two-thirds of elapsed HC time).
- Current baseline is suitable for controlled micro-optimizations on search budget/ordering only (no score formula changes).

Next low-risk experiments (one at a time):
1. Budget guardrail A/B: slightly reduce neighborhood breadth (not scoring) to lower deadline-hit rate.
   - Status: **tested => NO-GO** (see update below), rolled back.
2. Next candidate: tiny late escape probability (light annealing micro-tune).

## Update 2026-02-21 (Budget guardrail A/B)
Decision:
- **NO-GO**. Reduced neighborhood breadth degraded quality/alignment cross-set.
- Full rollback applied in `sealedOptimizerCore.ts`; function redeployed.

What changed in test:
- HC neighborhood reduced slightly:
  - utility sideboard top `10 -> 9`
  - creature sideboard top `8 -> 7`
  - base cuts `7 -> 6`
  - random candidate ratio `0.30 -> 0.25`
- No scoring or weight changes.

Reports:
- `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_guardrailA_full50.json`
- `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_guardrailA_full50.json`

Compared vs baseline (`postpass_full50_v2`):
- `set_02`:
  - `Avg Top1`: `-0.0560`
  - `Avg Jaccard Best3`: `-0.0118`
  - `Color Match Top3`: `-6.00 pts`
  - `Strict Match Top3`: `0.00 pt`
  - `Beats Player`: `-4.00 pts` (`96%` vs `100%`)
- `set_03`:
  - `Avg Top1`: `-0.2024`
  - `Avg Jaccard Best3`: `-0.0147`
  - `Color Match Top3`: `-2.04 pts`
  - `Strict Match Top3`: `-2.04 pts`
  - `Beats Player`: stable (`100%`)

Conclusion:
- Even small neighborhood reductions hurt robustness/quality.
- Keep current neighborhood size and move to next isolated low-risk candidate (light annealing micro-tune).

## Update 2026-02-21 (Light annealing micro-tune)
Decision:
- **NO-GO**. Tiny late escape probability degraded cross-set robustness.
- Full rollback applied in `sealedOptimizerCore.ts`; function redeployed.

What changed in test:
- Added very small late-stage escape branch in HC when no improvement:
  - start after `70%` of iterations
  - trigger probability `1.5%`
  - max `2` random tries
  - accept only mildly negative moves (`delta >= -0.05`)
- No scoring/weight/formula changes.

Reports:
- `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_lateescape_full50.json`
- `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_lateescape_full50.json`

Compared vs baseline (`postpass_full50_v2`):
- `set_02`:
  - `Avg Top1`: `-0.0780`
  - `Avg Jaccard Best3`: `+0.0019`
  - `Color Match Top3`: `-0.78 pts`
  - `Strict Match Top3`: `+0.61 pt`
  - `Beats Player`: `+0.00` (49/1 run due to transient shard failure)
- `set_03`:
  - `Avg Top1`: `-0.2592`
  - `Avg Jaccard Best3`: `-0.0170`
  - `Color Match Top3`: `-6.12 pts`
  - `Strict Match Top3`: `-4.08 pts`
  - `Beats Player`: `-2.04 pts`

Cross-set quick aggregate (set_02 + set_03):
- `Avg Top1`: `-0.1653`
- `Avg Jaccard Best3`: `-0.0078`
- `Color Match Top3`: `-3.47 pts`
- `Strict Match Top3`: `-1.73 pts`

Conclusion:
- Late stochastic escapes are not robust under current runtime constraints.
- Keep current HC behavior (best-of-k + early annealing only).

## End-of-Day Checkpoint (resume tomorrow)
Current status to keep in mind:
- **Kept in code/prod baseline**:
  - HC micro-change `best-of-k (K=2)` stays active.
  - Weights stay at `power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0`.
- **Curve & Structure tuning status**:
  - `curve_skeleton_75` showed promising upside in quick screening.
  - But on `set_01` with 3 seeds, it was mixed:
    - `Avg Top1 +0.3184`, `Avg Jaccard Best3 +0.0062`
    - `Color Match Top3 -3.33 pts`, `Strict Match Top3 -1.33 pts`, `Beats -0.67 pts`
  - Conclusion: **no prod switch yet** on curve sub-component scales.

Concrete next steps for next session:
1. Run 3-seed confirmation on `set_02_latest50` and `set_03_latest50` for:
   - baseline
   - `curve_skeleton_75`
   - `curve_corridor_75`
2. Build one cross-set table (set_01 + set_02 + set_03) with deltas vs baseline.
3. Apply decision gate:
   - accept only if gains are robust cross-set and no material regression on:
     - `Color Match Top3`
     - `Strict Match Top3`
     - `Beats Player`
4. If still mixed:
   - keep current prod baseline,
   - keep `curve_corridor_75` as safer candidate,
   - continue one-component-at-a-time tuning.

## Update 2026-02-19 (Curve & Structure confirmation)
Decision:
- **No production change** on curve component scales for now.
- Keep current prod baseline:
  - HC `best-of-k (K=2)` enabled
  - weights `power=2.0`, `consistency=1.3`, `curve=1.0`, `synergy=1.0`

Runs completed:
- `set_02_latest50` (3 seeds, full50):
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_curve_struct_seed1337_shortlist.json`
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_curve_struct_seed2027_shortlist.json`
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_curve_struct_seed31415_shortlist.json`
- `set_03_latest50`:
  - seed 1337 from existing screen report (full50)
  - seeds 2027/31415 run in `limit=20` for quick confirmation:
    - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_curve_struct_seed2027_shortlist_limit20.json`
    - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_curve_struct_seed31415_shortlist_limit20.json`

Key summary:
- `set_02` (3 seeds, full50) vs baseline:
  - `curve_skeleton_75`: `Top1 +0.2460`, `Jaccard +0.0041`, `Strict +1.33`, `Beats -2.00`
  - `curve_corridor_75`: `Top1 -0.1165`, `Jaccard +0.0097`, `Color +1.07`, `Strict +0.88`, `Beats +0.00`
- `set_03` (3 seeds, mixed full/limit20) vs baseline:
  - `curve_skeleton_75`: `Top1 +0.2175`, `Jaccard -0.0062`, `Strict +1.67`, `Beats +0.00`
  - `curve_corridor_75`: `Top1 +0.0640`, `Jaccard -0.0089`, `Strict +0.00`, `Beats +0.00`

Interpretation:
- `curve_skeleton_75` still has upside on score/strict match, but remains unstable on robustness criteria (`Beats` already negative on set_02, and previously mixed on set_01).
- `curve_corridor_75` is safer but too neutral to justify a production switch now.

Conclusion:
- **Go/No-Go = NO-GO** for curve scale changes at this time.
- Continue with baseline and move to next isolated improvement cycle.

## Update 2026-02-19 (Micro-fix post-pass local 1-swap)
Decision:
- **Accepted**: post-pass local `1-for-1` swap on final builds (in-color only), to reduce weak filler artifacts (ex: `Chaos Spewer`-type cases).
- Deployed in:
  - `supabase/functions/_shared/sealedOptimizerCore.ts`
  - function `sealed-optimizer` redeployed.

What changed (scope intentionally narrow):
- After final selection, run a tiny local polish step on each of Top 3 builds:
  - try at most one improving `add/cut` swap
  - in-color candidates only
  - bounded search budget (`MAX_ADDS` / `MAX_EVALS`)
- No axis formula change, no weight change, no HC profile change.

Perf/stability note:
- First naive version caused `WORKER_LIMIT` (too many full land-resolved rescoring calls).
- Final kept version is lightweight:
  - loop uses local `calculateDeckScore`
  - full `scoreDeckWithResolvedLands` only once for the best found swap
- Stable again in benchmark runs.

Validation summary:
- Qualitative pool check:
  - RU top build no longer keeps `Chaos Spewer` in the tested case.
  - practical replacement observed (`Run Away Together`) with score improvement.

- set_02 (`50 pools`) comparison vs reference `prod_current_rerun`:
  - pre report:
    - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_rerun.json`
  - post report:
    - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`
  - delta:
    - `Avg Top1`: `+0.0606`
    - `Avg Jaccard Best3`: `+0.0240`
    - `Color Match Top3`: `+5.75 pts`
    - `Strict Match Top3`: `+0.83 pt`
    - `Beats Player`: `+0.00`
    - success/fail: `48/2 -> 50/0`

- set_03 (`49 pools`) quick comparison:
  - pre reference used:
    - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_protocol_3seeds.json` (`prod_current_s1337`)
  - post report:
    - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_prod_current_postpass_full50_v2.json`
  - delta:
    - `Avg Top1`: `+0.0757`
    - `Avg Jaccard Best3`: `+0.0020`
    - `Color Match Top3`: `+0.00 pt`
    - `Strict Match Top3`: `+0.00 pt`
    - `Beats Player`: `+0.00`

Interpretation:
- Positive/neutral across key metrics on 2 sets.
- Most visible gain on set_02 alignment and robustness.
- Change is narrow, explainable, and low-risk.

Next steps (priority order, historical block now completed):
1. **Protocol confirmation on set_01** with same `prod_current` scenario after post-pass.
2. Optional **3-seed confirmation** for post-pass itself (`s1337/s2027/s31415`) to validate seed stability.
3. Isolated HC follow-up:
   - instrumentation: **done and kept**
   - role-aware neighborhood ordering: **tested then rolled back (NO-GO)**

## ML Track (staged, low-risk)
Objective:
- Use ML as an accelerator for search/calibration, not as a full replacement of the scoring engine.
- Keep current optimizer as authoritative baseline while measuring incremental gains.

Phase 1 (recommended first): swap ranking model
- Build a supervised model that predicts whether a candidate `add/cut` swap will improve final score.
- Inputs (feature candidates):
  - card-level: WR, CMC, colors, removal flag, creature flag, dependency tags
  - deck context: current curve buckets, creature/removal counts, color sources
  - pair context: local synergy deltas with current deck
- Target:
  - binary (`improves > epsilon`) or regression (`delta score`)
- Integration:
  - model only reorders swap candidates in HC/post-pass
  - scoring formula remains unchanged

Phase 2: automatic weight/component calibration
- Run constrained search over:
  - axis weights (`power/consistency/curve/synergy`)
  - curve sub-scales (`topHeavy/skeletonShape/earlyCreature/creatureCorridor/removalAxis`)
- Objective:
  - maximize multi-metric utility, not single `Top1`
  - include penalties for regressions on `Color/Strict/Beats`

Phase 3: learned synergy enrichment
- Train a format-aware synergy signal (pair or small-set interactions) from replay/trophy data.
- Use it as an additive signal to existing synergy, behind a feature flag.

Non-negotiable safety rules:
1. One ML integration at a time.
2. A/B on fixed pools, fixed seeds, fixed runtime budgets.
3. Keep if and only if multi-metric win with no material `Beats` regression.
4. Hard rollback path preserved (disable flag => baseline behavior).

Go/No-Go metrics for ML experiments:
- `Avg Top1`
- `Avg Jaccard Best3`
- `Color Match Top3`
- `Strict Match Top3`
- `Optimizer beats player`
- Worker-limit/stability indicators

## Goal
- Build a sealed optimizer that is both:
  - strong on absolute score (`Avg Top1`)
  - aligned with human trophy builds (`Jaccard`, color/archetype match in Top3)
  - stable under edge compute limits

## Current Baseline (as of latest runs)
- Tested on three datasets: `set_01_initial` (50), `set_02_latest50` (50), `set_03_latest50` (49 valid fetched records).
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

## Protocol Update (completed)
- Plan 1 executed: fixed protocol with multiple seeds.
- Plan 2 executed: run-stability hardening in benchmark tooling.
- Protocol now used for decisions:
  - same scenarios, same pool files
  - **3 sets x 3 seeds**
  - pool-by-pool comparison preferred over raw global averages

Reference report:
- `backend/reports/benchmarks/protocol_eval/protocol_eval_summary.md`

## Global Quality Snapshot (prod config, 3 sets x 3 seeds)
Using weights `2.0 / 1.3 / 1.0 / 1.0` with HC `(3 x 55)`:

- Aggregate mean ranges across seeds:
  - `Avg Top1`: **83.47 - 83.51**
  - `Avg Jaccard Best3`: **0.5339 - 0.5422**
  - `Color Match Top3`: **56.38% - 59.07%**
  - `Strict Match Top3`: **31.54% - 32.22%**
  - `Optimizer beats player`: **98.67% - 99.33%**
- Stability:
  - benchmark-side failures on protocol runs: **0**
  - diversity top3: **3.0** (stable)
- Seed sensitivity:
  - low on Top1/Jaccard (small spread)
  - moderate on color/strict alignment (expected variance)

Interpretation:
- Overall quality is now **good and stable** for current stage.
- Main weakness remains **alignment consistency** on some pools (strict/color match ceiling), not absolute scoring power.
- Next gains are likely from targeted structural tuning (Curve & Structure decomposition), not from broad HC overhauls.

## Curve & Structure - Seed-1 Sweep (completed)
Goal:
- Start Curve & Structure tuning with low runtime cost (1 seed) before 3-seed confirmation.
- Change exactly one curve sub-component at a time.

Scenarios tested (`seed=1337`, weights unchanged):
- `curve_baseline`
- `curve_topheavy_75`
- `curve_skeleton_75`
- `curve_early_75`
- `curve_corridor_75`
- `curve_removal_3`

Primary reports:
- set_03 full screen:
  - `backend/reports/benchmarks/set_03_latest50/reports/calibration_runner_report_curve_struct_seed1337_screen.json`
- cross-set shortlist validation (baseline + skeleton_75 + corridor_75):
  - `backend/reports/benchmarks/set_01_initial/reports_archive/calibration_runner_report_curve_struct_seed1337_shortlist.json`
  - `backend/reports/benchmarks/set_02_latest50/reports/calibration_runner_report_curve_struct_seed1337_shortlist.json`
  - summary:
    - `backend/reports/benchmarks/protocol_eval/curve_struct_seed1337_summary.md`

Cross-set aggregate deltas vs `curve_baseline`:
- `curve_skeleton_75`:
  - `Avg Top1`: **+0.1722**
  - `Avg Jaccard Best3`: **+0.0081**
  - `Color Match Top3`: **+2.71 pts**
  - `Strict Match Top3`: **+1.35 pts**
  - `Beats Player`: **-0.67 pts**
- `curve_corridor_75`:
  - `Avg Top1`: **+0.0078**
  - `Avg Jaccard Best3`: **+0.0139**
  - `Color Match Top3`: **+0.70 pts**
  - `Strict Match Top3`: **+0.68 pts**
  - `Beats Player`: **+0.00 pts**

Interpretation:
- `skeleton_75` is the highest-upside candidate (stronger Top1 and alignment), but slightly riskier on beat-rate.
- `corridor_75` is the safer candidate (best Jaccard gain, no beat-rate loss, almost neutral Top1).

Recommended next decision step:
1. Run **3-seed confirmation** for `baseline vs skeleton_75 vs corridor_75`.
2. If strict stability is prioritized: choose `corridor_75`.
3. If score+alignment upside is prioritized and beat-rate remains acceptable in 3-seed: choose `skeleton_75`.

## Status Update (latest before pause)
### `curve_skeleton_75` - 3 seeds on `set_01` (completed)
Report:
- `backend/reports/benchmarks/set_01_initial/reports_archive/calibration_runner_report_curve_skeleton75_3seeds.json`

Compared to baseline 3-seed protocol on `set_01`:
- Mean delta:
  - `Avg Top1`: **+0.3184**
  - `Avg Jaccard Best3`: **+0.0062**
  - `Color Match Top3`: **-3.33 pts**
  - `Strict Match Top3`: **-1.33 pts**
  - `Beats Player`: **-0.67 pts**

Interpretation:
- On `set_01`, `curve_skeleton_75` improves score metrics but reduces alignment metrics.
- Decision cannot be taken on `set_01` alone; cross-set confirmation remains mandatory.

## Next Steps (tomorrow)
1. Complete 3-seed confirmation on:
   - `set_02_latest50`
   - `set_03_latest50`
   for `curve_skeleton_75`.
2. Compare `curve_skeleton_75` vs:
   - baseline
   - `curve_corridor_75` (safe candidate)
   using the same 3-seed protocol.
3. Apply go/no-go gate:
   - Keep change only if gains are robust cross-set and no material regression on:
     - `Color Match Top3`
     - `Strict Match Top3`
     - `Beats Player`
4. If trade-off remains mixed:
   - prefer `curve_corridor_75` for stability, or
   - keep baseline and continue with another single-component sweep.

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
   - Role-aware ordering tested and rolled back (**NO-GO cross-set**).
   - Revisit only with stricter gating design and isolated A/B after instrumentation analysis.
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
- Same pool sets, same seeds, same scenario config.
- Keep only if multi-metric win (not just Top1).
- Immediate rollback if significant alignment regression.

## Evaluation Protocol (must remain constant)
- Always compare on identical pool sets.
- Use **3 sets x 3 seeds** for acceptance decisions.
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
