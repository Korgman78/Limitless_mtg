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

### Etape 9ter : Banc local reproductible (pour tester un changement)

```bash
# 1) Pools trophee ArenaDirect : liste lue dans trophy_decks (Supabase), pool complet
#    demande a 17Lands (/api/deck/draft/, sans cookie). Tirage aleatoire reproductible.
python backend/sealed-optimizer/etl_arena_direct_sealed_replay.py --set FRA \
  --source supabase --sample random --sample-seed 42 --limit 55 --output backend/tmp/fra_ad_random55.json

# 2) Deux runs (reference et variante), memes pools, meme graine
node --use-system-ca backend/sealed-optimizer/local_bench/bench.mjs --set FRA \
  --input backend/tmp/fra_ad_random55.json --limit 50 --out backend/tmp/ref.json
node --use-system-ca backend/sealed-optimizer/local_bench/bench.mjs --set FRA \
  --input backend/tmp/fra_ad_random55.json --limit 50 --diversity 3.0 --out backend/tmp/var.json

# 3) Comparaison appariee
python backend/sealed-optimizer/local_bench/compare.py backend/tmp/ref.json backend/tmp/var.json \
  --label-a ref --label-b var --out backend/reports/benchmarks/local_bench/FRA_<date>_var_vs_ref.md
```

**Ce que ca fait** : `bench.mjs` execute le coeur en local et reproduit le mode deep de la fonction (5 shards, un profil et une graine par shard, agregation). Le budget est en nombre d'evaluations par shard (`--max-evals`, defaut 15 000) et sans deadline : deux runs identiques donnent exactement les memes builds, meme machine chargee. Environ 9 min pour 50 pools.

**Options de variante** : `--weights p,c,cv,s`, `--tuning '{"multicolor":{...},"power":{...},"search":{...},"context":{"shrinkK":500}}'` (reglages exportes par le coeur : `MULTICOLOR_CONSISTENCY`, `POWER_TUNING`, `SEARCH_TUNING`), `--diversity`, `--extra-trios`, `--polish-check true|false`, `--seed`.

**`compare.py`** : ecart pool par pool + IC 95 % bootstrap pour Jaccard top1/best3, Color/Strict match top1/top3 (archetypes normalises), similarite entre builds, score top1 (si memes poids). Pas de "beats player" (acquis par construction).

**Critere de decision** (voir `backend/reports/benchmarks/ALGO_STRATEGY.md`) : un changement de score doit mieux predire les victoires sur deux sets (etape 9bis) et ne rien degrader significativement sur le banc ; un changement de recherche se juge sur le banc seul.

### Etape 9bis : Calibration sur resultats reels (optionnel)

```bash
python backend/sealed-optimizer/outcome_calibration/outcome_calibration.py --set MSH
```

**Ce que ca fait** : verifie que le score de production predit les victoires, sur le `game_data` public de 17Lands (toutes les parties enregistrees, pas seulement les trophees). Chaque deck est note avec le vrai coeur `sealedOptimizerCore.ts` (execute par Node), puis compare a son bilan, a niveau de joueur egal.

**Proxy** : 17Lands ne publie pas les parties ArenaDirect_Sealed, seulement Sealed / TradSealed. Le script compare d'abord le GIH WR des cartes entre Sealed et ArenaDirect_Sealed (correlation corrigee du bruit) et s'arrete sous le seuil (0,88 par defaut), car le Sealed peut etre tres different selon le set (choix de pack de couleurs, niveau moins competitif). Mesures au 2026-10-07 : FRA 0,95, MSH 0,92, HOB 0,89, ECL 0,70, SOS 0,61.

**Resultat** : une fiche synthese par run (`.md` + `.json`) dans `backend/reports/benchmarks/outcome_calibration/` :
- effet du score en points de WR (toutes paires, et au sein d'une meme paire) ;
- WR par quintile de score, par tranche de niveau ;
- saturation des axes ;
- poids des axes refits sur les victoires, compares a la prod ;
- par paire : score moyen vs victoires au-dessus de l'attendu.

**Options** : `--event TradSealed` pour un autre proxy, `--threshold` pour le seuil, `--force` pour analyser malgre un proxy refuse (resultat indicatif). Pour comparer une variante : `--weights` et/ou `--tuning` (meme format que le banc), `--label` ; reference reglable avec `--base-tuning` / `--base-weights` / `--base-label` (defaut : prod). La fiche ajoute alors l'ecart de log-loss apparie avec son IC 95 %, et une section "Decks tricolores" (sous- ou sur-notation a score egal). Le `game_data` est mis en cache dans `backend/tmp/outcome_calibration/`.

**Prerequis** : Node.js >= 22.6 (execution native du TypeScript), `numpy` et `scikit-learn`. Le flag `--use-system-ca` est ajoute automatiquement quand Node le supporte (proxy TLS d'entreprise).

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
[ ] 11b. outcome_calibration : (optionnel) score vs victoires reelles
[ ] 12. deploy edge fn    : si code modifie
```

## Notes importantes

- **Bonus sheets** : les scripts `populate_card_list.py` et `enrich_card_tags.py` detectent automatiquement les child sets via l'API Scryfall (`parent_set_code` + `set_type` in `masterpiece`, `bonus`). Les cartes bonus sont stockees sous le `set_code` du set parent.

- **Ordre critique** : les etapes 1-5 doivent etre executees dans l'ordre. L'ETL (6-7) peut tourner en parallele. La calibration (8) et le benchmark (9) necessitent que les trophy decks soient en base.

- **Variable TARGET_SET** : la plupart des scripts utilisent une variable `TARGET_SET` en haut du fichier. Penser a la modifier avant chaque run.

- **Environnement Windows** : si les emojis dans les prints posent probleme, prefixer avec `PYTHONIOENCODING=utf-8`.

- **Cartes DFC** : Scryfall stocke les double-face sous "Front // Back". Le script populate les stocke avec ce nom complet. Si l'ETL 17Lands cree des entrees avec juste le nom de la face avant, elles resteront avec des champs null mais sont filtrees par l'optimizer (`cost !== null`).
