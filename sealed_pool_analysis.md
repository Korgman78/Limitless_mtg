# Sealed Pool Analysis (Human-First)

## Goal
Build the best `ECL` sealed deck from the full pool using a human/pro sealed process, **without** using the optimizer output first.

## Methodology (Pro Sealed Lens)
1. Identify raw power:
- Best cards by impact (bombs, premium interaction, strong top-end).
- Real removal first, then tempo interaction.

2. Measure color depth:
- Count *playable* cards per color, not total cards.
- Prioritize colors that provide both early game and finishing power.

3. Validate archetype cohesion:
- Tribal/package cards only if support is truly present.
- Avoid “good single card” splashes that damage consistency unless payoff is high.

4. Build a 23-spell shell:
- Creature baseline: ~13-16.
- Removal/interaction baseline: 4+.
- Keep curve functional (2-3-4 axis) before adding luxury top-end.

5. Mana and castability:
- Two-color base preferred unless splash is cheap and high EV.
- Splash only if fixing + pip requirements make it realistic.

6. Hard dependency sanity check:
- Cards with support thresholds must be checked deck-only (not pool-only).

7. Final sideboard plan:
- Have swap packages by matchup profile (aggro, grind, flyers, spell-heavy).

---

## Pool Read (Data + Card Text)
High-level signals from DB:
- Top WR cards in pool are mostly `UR` leaning (`Ashling's Command`, `Sanar`, `Sear`, `Explosive Prodigy`, etc.).
- Removal package is strongest in `R` (+ some `U` tempo and off-color options).
- Mana fixing available from artifacts (`Foraging Wickermaw`, `Firdoch Core`), but not enough reason to force greedy splashes.
- Several tribal/dependency cards exist; best-supported package here is closer to `Elemental/UR tempo-burn` than to a coherent 3-color tribal shell.

## Human Archetype Choice
### Main choice: **UR Midrange-Tempo**
Why:
- Best concentration of high-WR playable cards.
- Real interaction density (`Sear x2`, `Ashling's Command`, `Feed the Flames`, `Boulder Dash`, plus blue tempo).
- Better natural curve and cleaner manabase than 3-color alternatives.

### Optional splash stance
- A splash is possible if it adds a truly premium card with low deckbuilding cost.
- In this pool, splash is optional, not mandatory for deck quality.

---

## What I Expect Versus Optimizer
- Optimizer should ideally return `UR` in top 1 or top 2.
- If optimizer pushes another shell, I would inspect whether:
  - synergy scoring is still over-weighting weak interactions,
  - mana/castability penalties are too soft,
  - weak utility artifacts are being over-selected.
