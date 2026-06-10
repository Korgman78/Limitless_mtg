# Backend Scripts

Scripts Python d'ETL, enrichissement et outils pour Limitless MTG.
Tous lisent `.env` a la racine du projet (`SUPABASE_URL` / `SUPABASE_KEY` ou variantes `VITE_*`).

## ETL (orchestre par GitHub Actions)

| Script | Description | Usage |
|--------|-------------|-------|
| `etl_script.py` | Fetch 17Lands + ingestion metagame stats (tous formats) | Configure `TARGET_SET_CODES`, `ALL_FORMATS` en haut du fichier |
| `etl_script_trophydecks.py` | Scrape trophy decks (7-x) depuis 17Lands | Configure `TARGET_SET_CODES`, `TARGET_FORMATS`, `TARGET_DATE` |
| `etl_script_synergy.py` | Calcul des synergies inter-cartes (lift scoring) | Configure `TARGET_SET_CODES`, `TARGET_FORMATS` |
| `calculate_archetypal_decks.py` | Clustering des trophy decks en skeletons d'archetypes | Configure `TARGET_SET_CODES`, `TARGET_FORMATS` |
| `etl_umap_trophymap.py` | Projection UMAP des trophy decks (Trophies Map) : coords 2D + ancres archetypales + cartes signature par archetype + index recherche carte | Lit `trophy_decks`/`archetypal_skeletons` en base (pas de scrape 17Lands). `TARGET_SET_CODES=[]` = tous sets actifs. Cron tous les 3 jours (`trophy_map.yml`). Alimente `trophy_deck_map` + `trophy_map_archetype_cards`. Deps : `numpy`, `scikit-learn`, `umap-learn` |
| `etl_umap_cardmap.py` | Projection UMAP des **cartes** (Card Graphs, modes Map/Communities) : matrice carte×deck → coords 2D (cosine) + communautes Louvain depuis `synergy_scores`. Lit `trophy_decks` (matrice) + `synergy_scores` (graphe). `TARGET_SET_CODES=[]` = tous sets actifs. Cron tous les 3 jours (`card_map.yml`, 18:30 après la Trophy Map). Alimente `card_map`. Deps : `numpy`, `umap-learn`, `networkx` |

## Enrichissement cartes (`enrichment/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `populate_card_list.py` | Peuple `card_list` avec les metadonnees d'un set | `python populate_card_list.py` |
| `populate_arena_ids.py` | Ajoute les `arena_id` depuis 17Lands | `python enrichment/populate_arena_ids.py [SET_CODE]` |
| `scryfall_enrichment.py` | Enrichit avec les donnees Scryfall (type, keywords) | `python scryfall_enrichment.py` |
| `enrich_card_tags.py` | Tags tribaux, dependency_tags, support_tags, is_removal, is_mana_producer | `python enrichment/enrich_card_tags.py` |

## Corrections LLM par set (`corrections/`)

Un fichier par extension. Run apres `enrich_card_tags.py` pour corriger faux positifs, ajouter les mecaniques specifiques du set, et calibrer les seuils.

| Script | Description |
|--------|-------------|
| `correct_sos_tags.py` | Corrections pour SOS (Secrets of Strixhaven) |

## Sealed Optimizer (`sealed-optimizer/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `calibrate_dependency_thresholds.py` | Calibre `dependency_min_support` depuis les trophy decks sealed | Voir exemples ci-dessous |
| `test_sealed_optimizer.py` | Test de l'optimizer sur un pool (`test_sealed_pool.txt`) | Voir exemples ci-dessous |
| `benchmark_sealed_optimizer.py` | Benchmark latence/perf de l'optimizer | `python sealed-optimizer/benchmark_sealed_optimizer.py --set ECL` |
| `etl_arena_direct_sealed_replay.py` | Extrait les derniers trophy decks ArenaDirect_Sealed avec pool complet (maindeck+sideboard) | `python sealed-optimizer/etl_arena_direct_sealed_replay.py --set ECL --limit 50` |
| `benchmark_trophy_pool_replay.py` | Rejoue l'optimizer sur ces pools, score le deck joueur, calcule Jaccard vs top 3 | `python sealed-optimizer/benchmark_trophy_pool_replay.py --limit 50` |
| `calibration_runner.py` | Lance plusieurs scenarios (weights/params) sur les pools trophy, puis compare les KPI vs baseline | `python sealed-optimizer/calibration_runner.py --limit 50` |

---

## Exemples d'utilisation

### calibrate_dependency_thresholds.py

```bash
# Dry run : afficher les seuils recommandes pour tout le set
python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set ECL

# Filtrer sur une seule carte
python backend/sealed-optimizer/calibrate_dependency_thresholds.py --card "Maralen, Fae Ascendant"

# Ecrire les seuils en BDD
python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set ECL --update
```

### test_sealed_optimizer.py

Le pool a tester est lu depuis `test_sealed_pool.txt` a la racine.
Configuration via variables d'environnement :

```bash
# Defaults
python backend/sealed-optimizer/test_sealed_optimizer.py

# Custom weights et parametres
SEALED_W_POWER=2 SEALED_W_CONSISTENCY=1 SEALED_W_CURVE=1 SEALED_W_SYNERGY=1 \
SEALED_HC_RESTARTS=2 SEALED_HC_ITERATIONS=35 SEALED_SEED=1337 SEALED_DEBUG=1 \
python backend/sealed-optimizer/test_sealed_optimizer.py
```

### benchmark_sealed_optimizer.py

```bash
python backend/sealed-optimizer/benchmark_sealed_optimizer.py --set ECL --restarts 2 --iterations 35
```

### Replay trophies ArenaDirect Sealed

```bash
# 1) Extraire les derniers trophies + pool complet
python backend/sealed-optimizer/etl_arena_direct_sealed_replay.py --set ECL --format ArenaDirect_Sealed --limit 50

# 2) Rejouer l'algo sur ces pools et comparer au deck joueur
python backend/sealed-optimizer/benchmark_trophy_pool_replay.py \
  --input backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools.json \
  --output backend/tmp/_tmp_trophy_pool_replay_report.json \
  --set ECL --format ArenaDirect_Sealed --limit 50

# 3) Calibration multi-scenarios sur les 50 pools
python backend/sealed-optimizer/calibration_runner.py \
  --input backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json \
  --output-json backend/reports/benchmarks/calibration_runner_report.json \
  --output-md backend/reports/benchmarks/calibration_runner_report.md \
  --limit 50

# Smoke test rapide (2 scenarios)
python backend/sealed-optimizer/calibration_runner.py --scenario-set smoke --limit 10
```
