# Sealed Optimizer Benchmark Report (ArenaDirect_Sealed / ECL)

Date: 2026-02-12  
Source data:
- `backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json`
- `backend/tmp/_tmp_trophy_pool_replay_report_cleaned_combined.json`

## 1) Scope & Method

- 50 derniers trophy decks ArenaDirect Sealed collectes depuis 17Lands.
- Reconstruction du pool complet par run: `Maindeck + Sideboard`.
- Nettoyage applique: selection automatique du bon `deck_index` (on exclut les snapshots type `78/0` qui representent le pool entier et non un deck joue).
- Replay de l'algo sur chaque pool (top 3 builds).
- Scoring du deck joueur via `score_custom_deck`.
- Similarite deck joueur vs builds proposes avec Jaccard multiset (spells only, sans terrains de base).

## 2) Coverage

- Pools cibles: 50
- Bench reussis: 50
- Echecs techniques: 0

## 3) Core Metrics (50 runs)

- Score joueur moyen: **67.1130** (mediane **66.435**)
- Score top1 algo moyen: **80.6304** (mediane **80.515**)
- Delta moyen top1 - joueur: **+13.5174**
- Taux top1 > joueur (selon la grille interne): **100%** (50/50)

## 4) Similarity Metrics

- Jaccard moyen vs top1: **0.4135** (mediane **0.4180**)
- Jaccard moyen vs meilleur des top3: **0.5283** (mediane **0.5667**)
- Part des runs avec top1 Jaccard >= 0.40: **56.0%**
- Part des runs avec top1 Jaccard >= 0.50: **46.0%**
- Part des runs avec best-of-3 Jaccard >= 0.50: **70.0%**
- Part des runs avec best-of-3 Jaccard >= 0.60: **42.0%**

Interpretation rapide:
- Le top1 n'imite pas systematiquement le deck joueur (Jaccard modere).
- Le top3 couvre mieux la ligne joueur (Jaccard best-of-3 sensiblement plus haut).

## 5) Archetype Matching

### Match global

- Match archetype strict (exact string) present dans top3: **38.0%** (19/50)
- Match sur set de couleurs (plus permissif) present dans top3: **62.0%** (31/50)

Distribution du premier rang de match:
- Match strict: rank1=11, rank2=6, rank3=2
- Match couleurs: rank1=18, rank2=7, rank3=6

### Match par archetype joueur (n >= 2)

| Archetype joueur | n | Match strict top3 | Match couleurs top3 | Match strict rank1 |
|---|---:|---:|---:|---:|
| UR  | 6 | 100% | 100% | 50.0% |
| WU  | 6 | 100% | 100% | 83.3% |
| WG  | 3 | 100% | 100% | 0.0% |
| BG  | 4 | 50.0% | 50.0% | 25.0% |
| GBu | 3 | 0.0% | 33.3% | 0.0% |
| WGb | 2 | 0.0% | 50.0% | 0.0% |
| BGw | 2 | 0.0% | 0.0% | 0.0% |
| GBr | 2 | 0.0% | 50.0% | 0.0% |

Lecture:
- Tres bon recouvrement sur archetypes bicolores "coeur meta" (UR/WU/WG).
- Recouvrement faible sur certains profils splash/3 couleurs (ex: GBu/BGw).

## 6) Diversity of Suggestions

- Diversite moyenne des 3 propositions: **3 archetypes distincts** par pool.
- L'agregation top3 apporte donc une vraie couverture strategique, pas juste 3 variantes quasi identiques.

## 7) What This Benchmark Proves (and Does Not)

Ce que ca valide:
- Cohesion de l'optimiseur vis-a-vis de sa propre fonction de score.
- Capacite a proposer des alternatives differenciees tout en restant souvent proches du deck joueur.

Ce que ca ne valide pas encore:
- Superiorite reelle en winrate en partie (validation externe manquante).
- Impact causal de chaque brique (skeleton/synergy/shards) sans ablation.

## 8) Recommended Next Steps

1. Ablations controlees:
   - sans shard synergy
   - sans skeleton
   - sans diversification finale (MMR)
   - et comparaison des memes metriques.
2. Eval externe:
   - panel humain blind (choix de build),
   - ou replay resultats en match data si accessible.
3. Stabilite bench:
   - harden du client bench sur erreurs JSON transitoires (retry court idempotent).
