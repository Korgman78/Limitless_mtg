# Sealed Optimizer - Guide de setup pour un nouveau set

## Vue d'ensemble

Le Sealed Optimizer necessite un pipeline de preparation des donnees en base avant de pouvoir fonctionner sur un nouveau set. Ce guide couvre toutes les etapes, dans l'ordre.

**Prerequis** :
- `.env` a la racine du projet avec `SUPABASE_URL` / `SUPABASE_KEY` (ou variantes `VITE_*`)
- Python 3.x avec `requests`, `python-dotenv`
- Supabase CLI (`npx supabase`) + token d'acces pour le deploy

---

## Pipeline complet

### Etape 0 : Ajouter le set dans la table `sets`

Creer une entree dans la table Supabase `sets` avec le `code` du set (ex: `SOS`), la `start_date`, etc. Sans cette entree, l'ETL et certaines features (MetagamePulse "since start") ne fonctionneront pas.

### Etape 1 : Peupler la card list

```bash
# Dans backend/populate_card_list.py, modifier TARGET_SET :
TARGET_SET = "SOS"

python backend/populate_card_list.py
```

**Ce que ca fait** : recupere toutes les cartes du set depuis Scryfall + detecte automatiquement les **bonus sheets** (child sets de type `masterpiece` ou `bonus`, ex: SOA pour SOS) et les stocke sous le `set_code` parent.

**Resultat** : table `card_list` peuplee avec `card_name`, `set_code`, `colors`, `card_cmc`, `card_cost`, `rarity`, `card_type`.

### Etape 2 : Enrichir les tags (oracle_text, removal, dependencies, etc.)

```bash
# Dans backend/enrichment/enrich_card_tags.py, modifier TARGET_SET :
TARGET_SET = "SOS"

python backend/enrichment/enrich_card_tags.py
```

**Ce que ca fait** : re-fetche Scryfall (set principal + bonus sheets), analyse le `oracle_text` de chaque carte, et upsert dans `card_list` :
- `oracle_text`
- `is_removal` (detection par regex)
- `is_mana_producer` + `produced_colours`
- `dependency_tags` + `dependency_min_support` + `dependency_scope` (tribal, instant_sorcery, etc.)
- `token_support_tags` + `token_support_count`
- `support_tags` (lifegain, graveyard_leaves, multicolored, converge)

**Mode review** : `python backend/enrichment/enrich_card_tags.py --review` pour lister les cartes non-taguees removal contenant "target".

### Etape 3 : Corrections manuelles (LLM-driven)

```bash
python backend/corrections/correct_sos_tags.py
python backend/corrections/correct_soa_tags.py   # si bonus sheet
```

**Ce que ca fait** : corrige les faux positifs du tagging automatique, ajoute des mecaniques specifiques au set (ex: lifegain pour SOS/Witherbloom, converge pour 5-color, graveyard_leaves pour Lorehold).

**Pour un nouveau set** : creer un nouveau fichier `correct_XXX_tags.py` dans `corrections/`. Analyser les tags generes a l'etape 2 et identifier :
1. Faux positifs dependency a retirer
2. Faux positifs removal a corriger
3. Mecaniques du set non detectees automatiquement
4. Support tags manquants

Si le set a une bonus sheet : creer aussi un `correct_XXX_bonus_tags.py` pour les corrections specifiques.

### Etape 4 : Peupler les arena_id

```bash
python backend/enrichment/populate_arena_ids.py SOS
```

**Ce que ca fait** : recupere les `arena_id` depuis l'API 17Lands et les injecte dans `card_list`. Necessaire pour le mapping entre le log MTGA (qui utilise les arena_id) et les cartes en base.

### Etape 5 : Enrichissement Scryfall (card_stats)

```bash
# Dans backend/scryfall_enrichment.py, modifier TARGET_SET :
TARGET_SET = "SOS"

python backend/scryfall_enrichment.py
```

**Ce que ca fait** : enrichit les lignes de `card_stats` (pas `card_list`) avec `card_cmc`, `card_cost`, `card_type` depuis Scryfall. Utile pour les cartes qui arrivent via l'ETL 17Lands sans ces metadonnees.

### Etape 6 : Lancer l'ETL metagame

```bash
# Dans backend/etl_script.py, modifier TARGET_SET_CODES :
TARGET_SET_CODES = ["SOS"]

python backend/etl_script.py
```

**Ce que ca fait** : fetch les stats 17Lands (card_stats, archetype_stats) pour tous les formats. C'est l'ETL principal, orchestre par GitHub Actions en production.

### Etape 7 : ETL Trophy Decks + Synergies

```bash
# etl_script_trophydecks.py - configurer TARGET_SET_CODES, TARGET_FORMATS, TARGET_DATE
python backend/etl_script_trophydecks.py

# etl_script_synergy.py - configurer TARGET_SET_CODES, TARGET_FORMATS
python backend/etl_script_synergy.py
```

**Ce que ca fait** :
- Trophy decks : scrape les decks 7-x depuis 17Lands (utilises par MetagamePulse et les archetype skeletons)
- Synergies : calcule les lift scores inter-cartes (utilises par l'optimizer pour le score synergy)

### Etape 8 : Calibration des thresholds de dependance

```bash
# Dry run pour voir les seuils recommandes
python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set SOS

# Ecrire en BDD
python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set SOS --update
```

**Ce que ca fait** : analyse les trophy decks sealed pour ajuster `dependency_min_support` de chaque carte en fonction de la composition reelle des decks gagnants.

### Etape 9 : Benchmark et validation

```bash
# 1) Extraire les trophy pools (sealed)
python backend/sealed-optimizer/etl_arena_direct_sealed_replay.py --set SOS --format ArenaDirect_Sealed --limit 50

# 2) Replay l'optimizer et comparer aux decks joueurs
python backend/sealed-optimizer/benchmark_trophy_pool_replay.py \
  --input backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools.json \
  --output backend/tmp/_tmp_trophy_pool_replay_report.json \
  --set SOS --format ArenaDirect_Sealed --limit 50

# 3) Calibration multi-scenarios
python backend/sealed-optimizer/calibration_runner.py \
  --input backend/tmp/_tmp_arena_direct_sealed_trophy_with_pools_cleaned.json \
  --output-md backend/reports/benchmarks/set_XX_SOS_50/reports/calibration_runner_report.md \
  --limit 50
```

### Etape 10 : Deploy de la edge function

```bash
npx supabase functions deploy sealed-optimizer --project-ref <PROJECT_REF>
```

Necessaire uniquement si le code de `sealedOptimizerCore.ts` ou `index.ts` a change. Les donnees en base sont lues dynamiquement.

---

## Checklist rapide

```
[ ] 1. Table sets        : ajouter le set (code, start_date)
[ ] 2. populate_card_list : peupler card_list (auto bonus sheets)
[ ] 3. enrich_card_tags   : oracle_text, removal, dependencies, support
[ ] 4. correct_XXX_tags   : corrections manuelles post-enrichissement
[ ] 5. populate_arena_ids : arena_id depuis 17Lands
[ ] 6. scryfall_enrichment: enrichir card_stats
[ ] 7. etl_script         : stats 17Lands (card_stats, archetype_stats)
[ ] 8. etl_trophydecks    : trophy decks 7-x
[ ] 9. etl_synergy        : lift scores inter-cartes
[ ] 10. calibrate_deps    : ajuster dependency_min_support
[ ] 11. benchmark         : valider sur les trophy pools
[ ] 12. deploy edge fn    : si code modifie
```

## Notes importantes

- **Bonus sheets** : les scripts `populate_card_list.py` et `enrich_card_tags.py` detectent automatiquement les child sets via l'API Scryfall (`parent_set_code` + `set_type` in `masterpiece`, `bonus`). Les cartes bonus sont stockees sous le `set_code` du set parent.

- **Ordre critique** : les etapes 1-5 doivent etre executees dans l'ordre. L'ETL (6-7) peut tourner en parallele. La calibration (8) et le benchmark (9) necessitent que les trophy decks soient en base.

- **Variable TARGET_SET** : la plupart des scripts utilisent une variable `TARGET_SET` en haut du fichier. Penser a la modifier avant chaque run.

- **Environnement Windows** : si les emojis dans les prints posent probleme, prefixer avec `PYTHONIOENCODING=utf-8`.

- **Cartes DFC** : Scryfall stocke les double-face sous "Front // Back". Le script populate les stocke avec ce nom complet. Si l'ETL 17Lands cree des entrees avec juste le nom de la face avant, elles resteront avec des champs null mais sont filtrees par l'optimizer (`cost !== null`).
