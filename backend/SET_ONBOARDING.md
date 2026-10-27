# Onboarding d'un nouveau set

Runbook pour ajouter une extension à Limitless MTG. Reconstitué depuis les
configs réelles — à suivre dans l'ordre. Dernier set onboardé : **FRA — Reality
Fracture**, sortie Arena le 2026-09-29 (cf. section en bas).

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
  PYTHONIOENCODING=utf-8 python backend/enrichment/enrich_card_tags.py
  ```
  Le script finit par un bloc **STATS** (Removal, Mana Producers, Dependencies,
  Support Tags) : le garder, c'est la matière première de l'étape suivante.
  `python backend/enrichment/enrich_card_tags.py --review` liste en plus les
  cartes contenant « target » mais non taguées removal.

  **Fixing** — `produced_colours` vient du champ `produced_mana` de Scryfall
  (cartes qui produisent elles-mêmes du mana), **plus** les cartes qui vont
  chercher un terrain : basic landcycling, `<Type>cycling`, « search your
  library for … basic land / land card(s) » (tag `land_search`, ajouté le
  2026-10-27 : les 5 landcyclers de FRA ne comptaient pas comme fixing). Le
  score de l'optimizer ne voit **que** ce champ et les terrains : tout fixer
  absent de la liste « Mana Producers » est invisible pour lui.

- [ ] **Corrections par set, avec l'IA** : le détecteur générique ne connaît pas
  les mécaniques du set et produit des faux positifs. Démarche :
  1. Donner à l'IA la sortie STATS + l'oracle text des cartes du set
     (`card_list`), et lui demander de passer en revue : faux positifs de
     dépendance (mots parasites capturés par les regex), removal manquants ou
     en trop, **mécaniques inédites** du set à encoder en `dependency_tags` /
     `support_tags`, **fixers oubliés** (landcycling, fetch, Trésors,
     « add one mana of any color » conditionnel…), seuils de dépendance.
  2. L'IA écrit `backend/corrections/correct_msh_tags.py` sur le modèle de
     **`correct_fra_tags.py`** (pas `correct_sos_tags.py`, qui ÉCRASE les
     `support_tags`) : helpers `dep()` pour les dépendances, `sup()` qui
     **fusionne** avec les support tags déjà posés (multicolored,
     land_search…). Docstring en tête : mécaniques du set + décompte des
     corrections par section.
  3. Relire le script (chaque correction est une ligne commentée), puis :
     ```bash
     PYTHONIOENCODING=utf-8 python backend/corrections/correct_msh_tags.py
     ```
     Il écrit directement en base (pas de dry-run) : relire avant de lancer.
  4. Si les mots parasites sont génériques (pas propres au set), les ajouter
     à `EXCLUDED_DEPENDENCY_WORDS` dans `enrich_card_tags.py` pour les sets
     suivants (fait pour FRA : `more`, `then`, `different`…).

  ⚠️ **Ordre impératif** : `populate_card_list` → `enrich_card_tags` →
  `correct_xxx_tags`. Relancer `enrich_card_tags.py` plus tard **réécrit tous
  les tags du set et efface les corrections** : il faut alors relancer
  `correct_xxx_tags.py` juste après. Pour un ajout ponctuel (ex. une nouvelle
  règle de détection), préférer une mise à jour ciblée des cartes concernées.
- [ ] **Basculer le ciblage ETL** sur le nouveau set — éditer
  `TARGET_SET_CODES` dans :
  - `backend/etl_script.py`           (metagame + player-level)
  - `backend/etl_script_trophydecks.py`
  - `backend/etl_script_synergy.py`
  - `backend/calculate_archetypal_decks.py`
  - `backend/etl_trophy_draft_picks.py` (Draft Practice)

  Et `TARGET_SET` dans les 4 scripts manuels : `populate_card_list.py`,
  `enrichment/enrich_card_tags.py`, `scryfall_enrichment.py`,
  `enrichment/populate_arena_ids.py`.

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
- [ ] **Arena IDs — obligatoire, dès le jour J** (17Lands publie les `mtga_id`
  dès la sortie). Le Training Diary, l'overlay et l'import MTGA en dépendent :
  sans eux, les drafts du diary sont enregistrés sans noms ni images (cf. FRA).
  ```bash
  PYTHONIOENCODING=utf-8 python backend/enrichment/populate_arena_ids.py MSH
  ```
  Contrôle : tout `card_list` du set doit avoir un `arena_id`, sauf les 5
  terrains de base.
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
- [x] `populate_arena_ids.py HOB` — fait (188/193, les 5 terrains de base en moins).
- [ ] Retirer `MSH` des 5 ciblages ETL une fois qu'il ne sort plus de trophy decks.
  Ça supprime 93 appels 17Lands/jour à vide, et surtout ça fige son
  `win_rate_history` : `daily_etl` continue sinon d'y empiler des valeurs
  identiques, qui aplatissent la sparkline en trois semaines.

---

## Cas concret — FRA (Reality Fracture), sortie Arena 2026-09-29

Onboarding préparé le 2026-09-20 (J-9).

Vérifications faites le 2026-09-20 :
- Code **`FRA`** confirmé des deux côtés — Scryfall (`code: fra`,
  `arena_code: fra`, « Reality Fracture », 2026-10-02 en papier) et 17Lands
  (`FRA` déjà listé dans `https://www.17lands.com/data/expansions`,
  `card_ratings` renvoie `[]`, normal avant la sortie).
  ⚠️ Le set s'appelle « Reality Fractur**e** », pas « Reality Fractured ».
- **Pas de set enfant bonus**, mais une tranche **Special Guests** : les sets
  enfants sont `tfra` / `tfrc` (tokens) et `frc` « Reality Fracture Commander »
  (`set_type: commander`, hors boosters de draft). ⚠️ Corrigé le 2026-10-16 :
  10 Special Guests (`spg` n° 159→168 — Eye of Ugin, Splinter Twin, Consider…)
  sont bien dans les boosters Arena. `spg` est un set permanent sans
  `parent_set_code`, donc invisible pour `fetch_bonus_sheet_codes` ;
  `populate_card_list.py` les récupère désormais par date de sortie
  (`set:spg date=<released_at du set>`).
- **Spoiler complet** : 461 prints, collector numbers **1→461 sans aucun trou**.
  La requête du script (`q=set:fra`, dédoublonnée par carte) ramène
  **285 cartes** — 86C / 109U / 64R / 26M —, du même ordre que MSH (281 en base)
  et TLA (286).

Fait dans le code (commit du 2026-09-20) :
- `FRA` ajouté à côté de `HOB` dans les 5 ciblages ETL (`etl_script`,
  `etl_script_trophydecks`, `etl_script_synergy`, `calculate_archetypal_decks`,
  `etl_trophy_draft_picks`).
- `TARGET_SET = "FRA"` dans les 4 scripts manuels de Phase 1/2
  (`populate_card_list`, `enrich_card_tags`, `scryfall_enrichment`,
  `populate_arena_ids`).
- **`MSH` retiré des 5 ciblages** (dette laissée par l'onboarding HOB) : 0 trophy
  deck MSH sur les 14 derniers jours contre 2 548 pour HOB. Ça supprime les
  appels 17Lands à vide et fige son `win_rate_history`, qui s'aplatissait sinon.

Ligne `sets` **créée inactive** le 2026-09-20, avec `start_date = 2026-09-30` —
un jour de décalage volontaire sur la sortie Arena (09-29) pour écarter les
winrates de J1, toujours bruitées. Ça ne coûte aucun trophy deck : leur scrap ne
lit ni `start_date` ni `active`, il prend les dernières 24 h en dur.

```sql
insert into sets (code, name, active, start_date)
values ('FRA', 'Reality Fracture', false, '2026-09-30')
on conflict (code) do update
  set name = excluded.name,
      active = excluded.active,
      start_date = excluded.start_date;
```

**Phase 1 exécutée le 2026-09-20** : `card_list` peuplée (285 cartes, 285
`image_url`, 283 `oracle_text`), puis `enrich_card_tags.py` (55 removal,
42 producteurs de mana), puis `corrections/correct_fra_tags.py` — 131
corrections. FRA est un set **planeswalker-matters** que le détecteur générique
ne savait pas lire ; le script encode son vocabulaire réel :

| Mécanique | Cartes | Traitement |
|---|---|---|
| `empower <PW> N` — crée/charge un jeton planeswalker | 34 | support `planeswalker` |
| Cycle de 10 terrains « enters tapped unless you control a planeswalker » | 10 | dépendance `planeswalker` (min 5) |
| `prepared` — créature // sort, copie du sort | 17 | support `prepared` (+ dép. sur Codie) |
| `Threshold` — sept cartes ou plus au cimetière | 6 payoffs | dépendance `threshold` + 29 enablers |

Au passage, les mots parasites capturés par les regex génériques (`more` pour
« seven or more », `then`, `different`, `opponent`, `cast`, `charge`, `plain`,
`legendary`) ont été ajoutés à `EXCLUDED_DEPENDENCY_WORDS` dans
`enrich_card_tags.py` — les prochains sets n'auront plus à les corriger à la
main. Après corrections : `dependency_tags` = `{noncreature_spell: 15,
planeswalker: 17, threshold: 6, prepared: 1, …}`, 57 removal.

Le jour J (2026-09-29), un seul UPDATE, faisable depuis un téléphone :
```sql
update sets set active = true where code = 'FRA';
```

**Reste à faire :**
- [x] Créer la ligne `sets` (SQL ci-dessus) — fait le 2026-09-20, `active=false`.
- [x] Phase 1 : `populate_card_list.py` + `enrichment/enrich_card_tags.py`.
- [x] `corrections/correct_fra_tags.py` — écrit et appliqué.
- [ ] J : `update sets set active = true where code = 'FRA';`
- [ ] J+1/J+3 : `scryfall_enrichment.py` (après le 1er `daily_etl` sur FRA).
- [x] `populate_arena_ids.py FRA` — oublié jusqu'au 2026-10-16 : les 3 drafts FRA
      du diary avaient été synchronisés sans noms de cartes, donc sans images, et
      leurs decks ne contenaient que les terrains de base. Lancé (290/295, les
      5 terrains de base en moins), Special Guests ajoutés, puis
      `node --use-system-ca diary/sync/backfill-names.js FRA` (123 picks réparés).
- [x] Retirer `HOB` des 5 ciblages ETL — fait sur GitHub (commits a916396 et
      précédents).
- [x] Calibrer le sealed optimizer sur FRA (584 trophy decks Sealed au
      2026-10-04) :
      ```bash
      python backend/sealed-optimizer/calibrate_dependency_thresholds.py --set FRA --skip-tag mv_ge_3 --update
      ```
      Dry run du 2026-10-04 : `planeswalker` 5→3, `threshold` 4-6→3,
      `noncreature_spell` 6-7→9, `instant_sorcery` 6→8. `mv_ge_3` volontairement
      **ignoré** (P25 = 13) : ce tag ne porte que sur *Your Fate Ends Here*, et le
      P25 mesure la courbe typique d'un deck Sealed, pas le besoin de la carte.
      On garde 4. **Appliqué le 2026-10-04** (35 cartes modifiées).

**Calibrage — deux bugs corrigés dans `calibrate_dependency_thresholds.py`**
(2026-10-04), qui auraient faussé tout calibrage d'un set à mécaniques
non tribales :
- Les tags portés par des `support_tags` (`planeswalker`, `threshold`,
  `prepared`…) tombaient dans la branche tribale et comptaient 0 partout → seuil
  recommandé de 1, ce qui neutralise la dépendance. Le script reproduit désormais
  le repli générique de l'optimizer (`computeDependencyPenalty`).
- Les cartes doubles (DFC, `prepared`) sont listées sous leur face avant dans
  les trophy decks, mais sous « A // B » dans `card_list`. Faute de
  correspondance, elles étaient comptées comme sorts non-créature, ce qui
  gonflait `noncreature_spell` (11 au lieu de 9).

**GIH WR manquants en début de set** (2026-10-04) : en ArenaDirect_Sealed et
TradDraft, 17Lands renvoie `gih_wr = null` pour la majorité des rares les
premiers jours. Le sealed optimizer écartait silencieusement ces cartes, du pool
comme des decks importés. Il se replie désormais sur Sealed puis PremierDraft
(commit 3fec1d1). Cartes FRA sans WR : 138 → 26 sur 290.

**Fixing par recherche de terrain** (2026-10-27) : les 5 landcyclers communs
(Vinelasher Adept, Undulating Witness, Apex Witchstalker, Awaken the Inferno,
Hexhaven Battalion) et 3 cartes qui vont chercher des terrains (Simulacrum
Shaper, Fblthp, Knows the Way, Hexhaven Invigorator) n'étaient pas comptés comme
sources de mana : Scryfall ne les liste pas dans `produced_mana`. Détection
ajoutée à `enrich_card_tags.py` (tag `land_search`) et les 8 cartes FRA mises à
jour en base de façon ciblée (sans relancer le script complet, qui aurait
effacé les corrections). À faire : poids propre dans le score (une carte à
landcycling coûte souvent 4-5 mais se cycle pour {2}), puis repasser le banc.

**Dette HOB soldée au passage** : `correct_hob_tags.py` n'a jamais été écrit (le
faux positif connu reste le cycle de bicolores tagué `is_removal`). À arbitrer :
soit on l'écrit, soit on l'assume puisque HOB sort bientôt de la fenêtre chaude.

---

## Gotchas
- **`populate_arena_ids.py` est obligatoire dès J** (17Lands publie les
  `mtga_id` dès la sortie). Le Training Diary traduit les `grpId` du Player.log
  en noms via `card_list.arena_id` : sans eux, picks et decks sont enregistrés
  sans nom et sans image. Rattrapage : `node diary/sync/backfill-names.js SET`
  pour les picks ; les decks se refont en resynchronisant, tant que le draft est
  encore dans le Player.log.
- **Special Guests** (`spg`) : pas de `parent_set_code`, donc à vérifier à part
  (`populate_card_list.py` les gère). Repère : 17Lands liste plus de cartes que
  `card_list`.
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
