# Onboarding d'un nouveau set

Runbook pour ajouter une extension à Limitless MTG. Reconstitué depuis les
configs réelles — à suivre dans l'ordre. Exemple courant : **MSH — Marvel Super
Heroes**, sortie Arena le 2026-06-16.

## Comment l'app gère les sets (à savoir avant de commencer)
- L'app liste les sets de la table Supabase **`sets`** où `active=true`, **moins**
  ceux présents dans `EMBARGOED_SETS` (`src/constants.ts`).
- Chaque script ETL piloté par cron a un **`TARGET_SET_CODES` / `TARGET_SET` codé
  en dur** pointant sur le set « vivant ». C'est le principal levier manuel à
  basculer à chaque nouveau set.
- Les UMAP (`trophy_map.yml`, `card_map.yml`) ciblent **tous les sets actifs**
  (`TARGET_SET_CODES = []`) → automatiques, rien à faire.
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
- [ ] **Formats** : les 4 standards (`PremierDraft`, `TradDraft`, `Sealed`,
  `ArenaDirect_Sealed`) sont déjà dans `FORMAT_OPTIONS`. Rien à faire sauf format
  inédit.

### Requête SQL — créer le set (exemple MSH)
```sql
insert into sets (code, name, active, start_date)
values ('MSH', 'Marvel Super Heroes', true, '2026-06-16')
on conflict (code) do update
  set name = excluded.name,
      active = excluded.active,
      start_date = excluded.start_date;
```

---

## Phase 1 — Cartes disponibles sur Scryfall (spoiler complet)

Tous les scripts lisent `.env` à la racine (`SUPABASE_URL`/`SUPABASE_KEY` ou
`VITE_*`). Remplacer `MSH` par le code du set.

- [ ] **Peupler `card_list`** (gère les bonus sheets via `parent_set_code`) :
  ```bash
  # éditer TARGET_SET = "MSH" en tête du script, puis :
  python backend/populate_card_list.py
  ```
- [ ] **Enrichissement, dans l'ordre** (chacun lit la table peuplée par l'étape
  précédente — ne pas inverser) :
  ```bash
  # 1) Scryfall : type, keywords  (éditer TARGET_SET = "MSH")
  python backend/scryfall_enrichment.py

  # 2) Arena IDs (import MTGA). Souvent à relancer post-lancement quand 17Lands
  #    publie les arena ids.
  python backend/enrichment/populate_arena_ids.py MSH

  # 3) Tags : tribal, removal, mana, dependency/support  (éditer TARGET_SET = "MSH")
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
- [ ] **UMAP** trophy & card maps prennent le set automatiquement (ciblage `[]`)
  à leur cron (tous les 3 jours). Rien à faire.
- [ ] **Lever l'embargo** : retirer le code de `EMBARGOED_SETS` + commit /
  déploiement, quand les données sont suffisantes et que tu veux publier.
- [ ] **Sealed optimizer** : quand assez de trophy decks Sealed, calibrer :
  ```bash
  python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set MSH --update
  ```

---

## Gotchas
- **Code 17Lands ≠ Scryfall** possible → vérifier avant tout (sinon scrap vide).
- **Bonus sheets** : après `populate_card_list`, vérifier que les cartes bonus
  sont bien rattachées (le script les détecte via `parent_set_code`, type
  `masterpiece`/`bonus`).
- Le **player-level** est inclus dans `etl_script.py` (pas de script séparé) →
  couvert dès que le ciblage est sur le nouveau set.
- Ordre **`card_list` → enrichment → tags → corrections** : chaque étape lit la
  précédente, ne pas inverser.
- Table `sets` : colonnes = `code`, `name`, `active`, `start_date`.
