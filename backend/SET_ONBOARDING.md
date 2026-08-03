# Onboarding d'un nouveau set

Runbook pour ajouter une extension à Limitless MTG. Reconstitué depuis les
configs réelles — à suivre dans l'ordre. Exemple courant : **MSH — Marvel Super
Heroes**, sortie Arena le 2026-06-23.

## Comment l'app gère les sets (à savoir avant de commencer)
- L'app liste les sets de la table Supabase **`sets`** où `active=true`, **moins**
  ceux présents dans `EMBARGOED_SETS` (`src/constants.ts`).
- Chaque script ETL piloté par cron a un **`TARGET_SET_CODES` / `TARGET_SET` codé
  en dur** pointant sur le set « vivant ». C'est le principal levier manuel à
  basculer à chaque nouveau set.
- Les UMAP (`trophy_map.yml`, `card_map.yml`) ciblent **tous les sets actifs**
  (`TARGET_SET_CODES = []`) → automatiques, rien à faire.
- ⚠️ **Tous les scripts ne réagissent pas pareil au flag `active`** — c'est ce qui
  décide de ce qui se passe si on cible un set avant de l'activer :

  | Script | Ciblage | Set inactif ? |
  |---|---|---|
  | `etl_script.py` (daily_etl) | `TARGET_SET_CODES` ∩ **sets actifs** | **ignoré** (warning « sets non trouvés ») |
  | `etl_script_trophydecks.py` | `TARGET_SET_CODES` seul | traité quand même |
  | `etl_script_synergy.py` | `TARGET_SET_CODES` seul | traité quand même |
  | `calculate_archetypal_decks.py` | `TARGET_SET_CODES` seul | traité quand même |
  | `etl_trophy_draft_picks.py` | `TARGET_SET_CODES` sinon actifs | traité quand même |
  | UMAP trophy/card map | sets actifs (`[]`) | ignoré |

  Conséquence pratique : **cibler un set avant sa sortie ne casse rien**, et c'est
  même nécessaire pour les trophy decks. Les scripts non gated tournent à vide
  (17Lands renvoie des listes vides) ; `etl_script.py` attend l'activation, ce
  qui est sans perte puisqu'il refetch toute la fenêtre depuis `start_date` à
  chaque run — le 1er run après activation rattrape tout l'historique.
- **Ce qui est rattrapable et ce qui ne l'est pas.** `etl_script.py` (metagame,
  cartes, player-level) est *self-healing* : il relit toute la période à chaque
  run. Les **trophy decks** ne le sont pas — le scrap ne voit que les dernières
  24 h, une journée manquée se rejoue seulement à la main
  (`python backend/etl_script_trophydecks.py --date YYYY-MM-DD`). D'où la règle :
  **ajouter le set au ciblage trophy decks AVANT la sortie Arena.**
- **17Lands n'a aucune donnée tant que le set n'est pas jouable sur Arena.** Tout
  ce qui dépend de 17Lands reste vide avant le lancement (c'est normal).

---

## Phase 0 — Pré-sortie (avant que les cartes soient sur Scryfall)

- [ ] **Vérifier le code du set.** Il doit être identique chez **Scryfall** et
  **17Lands** (souvent le code 3 lettres, parfois différent). Vérifier sur
  `scryfall.com/sets` ET sur 17lands. ⚠️ Un code 17Lands erroné = scrap vide
  silencieux.
- [ ] **Créer la ligne dans la table `sets`** (Supabase, manuel — aucun script ne
  le fait). Voir la requête SQL ci-dessous.
  - `start_date` = date de début des données 17Lands (= sortie Arena). Tant qu'il
    n'y a pas de data, les requêtes renvoient vide.
- [ ] **(Recommandé) Embargo** : ajouter le code à `EMBARGOED_SETS` dans
  `src/constants.ts` → set scrappé mais **masqué en prod** le temps que les
  données se remplissent. Commit + déploiement Vercel.
  - *Variante sans PC* : créer la ligne avec **`active = false`** et la basculer à
    `true` le jour J depuis l'interface Supabase. Même effet de masquage, mais le
    levier est en base au lieu d'être dans le code — pas de commit ni de déploiement
    à faire depuis un téléphone. Contrepartie : `etl_script.py` et les UMAP ne
    couvrent pas le set tant qu'il est inactif (sans perte, cf. tableau plus haut).
- [ ] **Formats** : les 4 standards (`PremierDraft`, `TradDraft`, `Sealed`,
  `ArenaDirect_Sealed`) sont déjà dans `FORMAT_OPTIONS`. Rien à faire sauf format
  inédit.

### Requête SQL — créer le set (exemple MSH)
```sql
insert into sets (code, name, active, start_date)
values ('MSH', 'Marvel Super Heroes', true, '2026-06-23')
on conflict (code) do update
  set name = excluded.name,
      active = excluded.active,
      start_date = excluded.start_date;
```

---

## Phase 1 — Cartes disponibles sur Scryfall (spoiler complet)

Tous les scripts lisent `.env` à la racine (`SUPABASE_URL`/`SUPABASE_KEY` ou
`VITE_*`). Remplacer `MSH` par le code du set.

Ces étapes alimentent **`card_list`** (peuplée depuis Scryfall) — elles ne
dépendent PAS de 17Lands, donc faisables dès que le spoiler est sur Scryfall.

> 💡 **Windows** : lancer les scripts Python avec `PYTHONUTF8=1` (sinon crash
> `UnicodeEncodeError` sur les emojis, console cp1252). Ex. PowerShell :
> `$env:PYTHONUTF8='1'; venv\Scripts\python.exe backend\populate_card_list.py`

- [ ] **Peupler `card_list`** (gère les bonus sheets via `parent_set_code`) :
  ```bash
  # éditer TARGET_SET = "MSH" en tête du script, puis :
  python backend/populate_card_list.py
  ```
- [ ] **Tags** (rule-based, pas de LLM) : enrichit `card_list` avec `oracle_text`,
  `is_removal`, `is_mana_producer`, `produced_colours`, `dependency_tags`,
  `support_tags`. Récupère lui-même l'oracle text depuis Scryfall.
  ```bash
  # éditer TARGET_SET = "MSH", puis :
  python backend/enrichment/enrich_card_tags.py
  ```
- [ ] **Corrections par set** : créer `backend/corrections/correct_msh_tags.py`
  (modèle : `correct_sos_tags.py`) pour corriger les faux positifs, encoder les
  **mécaniques inédites du set** et recalibrer les seuils. Étape importante pour
  un set à identité forte. Lancer après `enrich_card_tags.py`.
- [ ] **Basculer le ciblage ETL** sur le nouveau set — éditer
  `TARGET_SET_CODES` dans :
  - `backend/etl_script.py`           (metagame + player-level)
  - `backend/etl_script_trophydecks.py`
  - `backend/etl_script_synergy.py`
  - `backend/calculate_archetypal_decks.py`

  Pendant la transition, on peut viser les deux : `["SOS", "MSH"]` pour continuer
  à rafraîchir l'ancien set un temps.

---

## Phase 2 — Post-lancement Arena (quand 17Lands a des données, ~24-72 h après)

- [ ] Les crons remplissent automatiquement : metagame + player-level
  (`daily_etl`, 15:00 UTC), trophy decks → synergies → skeletons
  (`etl_script_trophydecks.yaml`), meta pulse (`meta_pulse.yaml`).
- [ ] **Enrichir `card_stats`** (type, keywords) — ⚠️ dépend de `card_stats`,
  donc **uniquement après** que `etl_script.py` ait tourné une 1ʳᵉ fois :
  ```bash
  python backend/scryfall_enrichment.py   # éditer TARGET_SET = "MSH"
  ```
- [ ] **Arena IDs** (import MTGA) — dépend des arena ids publiés par 17Lands :
  ```bash
  python backend/enrichment/populate_arena_ids.py MSH
  ```
- [ ] **UMAP** trophy & card maps prennent le set automatiquement (ciblage `[]`)
  à leur cron (tous les 3 jours). Rien à faire.
- [ ] **Lever l'embargo** : retirer le code de `EMBARGOED_SETS` + commit /
  déploiement, quand les données sont suffisantes et que tu veux publier.
- [ ] **Sealed optimizer** : quand assez de trophy decks Sealed, calibrer :
  ```bash
  python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set MSH --update
  ```

---

## Cas concret — HOB (The Hobbit), sortie Arena 2026-08-10

Onboarding préparé le 2026-08-03, avec une contrainte : **pas de PC disponible le
jour de la sortie**. Le levier du jour J est donc en base, pas dans le code.

Vérifications faites le 2026-08-03 :
- Code **`HOB`** confirmé des deux côtés — Scryfall (`arena_code: hob`,
  « The Hobbit », 2026-08-14 en papier) et 17Lands (présent dans
  `https://www.17lands.com/data/expansions`, `card_ratings` renvoie `[]`, normal
  avant la sortie).
- **Pas de bonus sheet à rattacher.** Les sets enfants sont `thob` (tokens) et
  `hoc` « The Hobbit Eternal » (`set_type: eternal`, `booster: false`) : hors
  boosters de draft, donc hors périmètre. `fetch_bonus_sheet_codes` ne retient que
  `masterpiece`/`bonus`, ce qui est le bon comportement ici (même schéma que
  `tle` pour TLA).

Fait dans le code (commit du 2026-08-03) :
- `HOB` ajouté à côté de `MSH` dans les 5 ciblages ETL (`etl_script`,
  `etl_script_trophydecks`, `etl_script_synergy`, `calculate_archetypal_decks`,
  `etl_trophy_draft_picks`).
- `TARGET_SET = "HOB"` dans les 4 scripts manuels de Phase 1/2.
- ⚠️ `etl_script_synergy.py` était resté sur `["SOS"]` (calibrage des seuils du
  2026-07-31) : les synergies MSH n'étaient plus recalculées depuis. Remis sur
  `["MSH", "HOB"]`.

Ligne créée le 2026-08-03, inactive, avec `start_date = 2026-08-12` — un jour de
décalage volontaire sur la sortie Arena (08-10) pour écarter les winrates de J1,
toujours bruitées. Ça ne coûte aucun trophy deck : leur scrap ne lit ni
`start_date` ni `active`, il prend les dernières 24 h en dur.

Reste donc **un seul UPDATE** le jour J, faisable depuis un téléphone :
```sql
update sets set active = true where code = 'HOB';
```
> **MSH reste actif**, comme les 11 autres sets consultables. `active` signifie
> « visible dans l'app », pas « en cours d'exploitation » — cf. la section sur le
> ciblage : c'est `TARGET_SET_CODES` qui porte l'info « ce set est vivant ».

**Spoiler complet dès le 2026-08-03** : HOB est un mini-set de **193 cartes**
(70C / 55U / 53R / 15M), numérotées 1→193 sans aucun trou ; les numéros 194→321
sont des traitements alternatifs des mêmes cartes. Pour comparaison, le run de
base fait 277 cartes sur MSH et 286 sur TLA. Le test de complétude fiable est la
**contiguïté des collector numbers**, pas le volume : un spoiler partiel laisse
des trous.

Phase 1 exécutée le 2026-08-03 : `card_list` peuplée (193 cartes, 193 `image_url`)
puis `enrich_card_tags.py` (26 removal, 22 producteurs de mana, 50 support tags).

**À faire au retour du PC (2026-08-14), rien n'étant bloquant d'ici là :**
- [ ] `corrections/correct_hob_tags.py` (à écrire, modèle `correct_sos_tags.py`).
  Faux positif identifié : le cycle de bicolores — *Elvenking's Halls*,
  *Goblin-town*, *Iron Hills*, *Lake-town*, *Mirkwood* — est tagué `is_removal`,
  soit 5 des 26 removal du set. Ce sont des terrains qui se sacrifient pour poser
  deux marqueurs +1/+1, la règle les attrape sur « Sacrifice this land … target ».
- [ ] `scryfall_enrichment.py` — débloqué dès le 1er `daily_etl` sur HOB, puisqu'il
  enrichit des lignes `card_stats` existantes et ne sait pas en créer.
- [ ] `populate_arena_ids.py HOB` — seulement si tu utilises l'overlay Arena ou le
  mapping des logs MTGA du sealed optimizer ; le front web ne lit jamais `arena_id`.
- [ ] Retirer `MSH` des 5 ciblages ETL une fois qu'il ne sort plus de trophy decks.
  Ça supprime 93 appels 17Lands/jour à vide, et surtout ça fige son
  `win_rate_history` : `daily_etl` continue sinon d'y empiler des valeurs
  identiques, qui aplatissent la sparkline en trois semaines.

---

## Gotchas
- **Code 17Lands ≠ Scryfall** possible → vérifier avant tout (sinon scrap vide).
- **Set enfant `eternal`** (ex. `hoc` pour HOB, `tle` pour TLA) : ce n'est PAS une
  bonus sheet de draft (`booster: false`) → à ne pas ajouter à `card_list`.
- **Scryfall exige un User-Agent custom** depuis 2024 : sans lui l'API renvoie
  `400` et les scripts ressortent « 0 carte » silencieusement. Déjà géré
  (`HEADERS_SCRYFALL`) dans `populate_card_list.py`, `scryfall_enrichment.py`,
  `enrich_card_tags.py`.
- **Tables et dépendances** : `populate_card_list` + `enrich_card_tags` écrivent
  dans **`card_list`** (Scryfall, dispo en Phase 1). `scryfall_enrichment` écrit
  dans **`card_stats`** (créée par 17Lands → Phase 2 seulement). Ne pas lancer
  `scryfall_enrichment` avant le 1ᵉʳ run de `etl_script.py`.
- **Bonus sheets** : après `populate_card_list`, vérifier que les cartes bonus
  sont bien rattachées (le script les détecte via `parent_set_code`, type
  `masterpiece`/`bonus`).
- Le **player-level** est inclus dans `etl_script.py` (pas de script séparé) →
  couvert dès que le ciblage est sur le nouveau set.
- Ordre **`card_list` → enrichment → tags → corrections** : chaque étape lit la
  précédente, ne pas inverser.
- Table `sets` : colonnes = `code`, `name`, `active`, `start_date`.
