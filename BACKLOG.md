# Backlog

Suivi des tâches et pistes non urgentes. Coche `[x]` quand c'est fait.

---

## 🗄️ Optimisation du stockage Supabase

**Contexte** : le projet a dépassé les 500 Mo (alerte Supabase). Le facteur de
croissance dominant est le nombre de lignes de `card_stats` :

```
lignes ≈ cartes (~280) × contextes couleur (21) × formats (4) ≈ 23 000 lignes / set
```

Chaque nouveau set ajoute ~23 000 lignes rien que dans `card_stats`.
Les tableaux d'historique (`win_rate_history`, `alsa_history`) sont déjà plafonnés
à 21 points, et les ETL font des **upserts** (pas d'append) → il n'y a **pas** de
versions empilées. Le levier n'est donc pas la déduplication mais la **dégradation
de granularité pour les vieux sets**.

### Étape 0 — Mesurer (à faire en premier)
- [ ] Lancer dans le SQL Editor pour identifier le top des tables :
  ```sql
  SELECT relname AS table,
         pg_size_pretty(pg_total_relation_size(relid)) AS total,
         pg_size_pretty(pg_relation_size(relid))       AS data,
         pg_size_pretty(pg_indexes_size(relid))        AS index,
         n_live_tup AS lignes
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC;
  ```
- [ ] Confirmer que `card_stats` (et éventuellement `synergy_scores`) dominent.

### Pistes classées par ratio impact / effort

#### 🥇 1. Dégrader la granularité des vieux sets (levier n°1)
Pour un set que les ETL ne fetchent plus depuis >2 semaines (piloter via la table
`sets` : colonnes `active`, `start_date`) :
- [ ] Ne garder que `filter_context = 'Global'` (÷ ~21 les lignes du set) :
  ```sql
  DELETE FROM card_stats
  WHERE set_code = 'XXX' AND filter_context <> 'Global';
  ```
- [ ] Supprimer les formats à faible intérêt historique pour les vieux sets
  (ex. `ArenaDirect_Sealed`, voire `TradDraft`).

#### 🥈 2. Tronquer les historiques des vieux sets
Pour un set figé, la courbe 21 points n'a plus d'usage :
- [ ] Réduire les arrays à la valeur finale :
  ```sql
  UPDATE card_stats
  SET win_rate_history = ARRAY[gih_wr]::numeric[],
      alsa_history     = ARRAY[alsa]::numeric[]
  WHERE set_code = 'XXX';
  ```

#### 🥉 3. Purger `card_player_level_stats` pour les vieux sets
Table de l'onglet Compare (× 3 `player_level`). Purge intégrale envisageable :
- [ ] `DELETE FROM card_player_level_stats WHERE set_code = 'XXX';`

#### 4. Surveiller `synergy_scores` (pairwise → croît en cartes²)
- [ ] Vérifier sa taille (peut être le 2ᵉ poste après `card_stats`).
- [ ] Appliquer la même stratégie de purge/dégrade pour les vieux sets.

#### 5. Purger les données réellement éphémères
- [ ] `sealed_optimizer_jobs` : nettoyage hebdo automatique (voir tâche dédiée ci-dessous).
- [ ] `press_articles` : ne garder que N jours/semaines de contenu texte.
- [ ] `card_map` / `trophy_deck_map` / `trophy_map_archetype_cards` : coordonnées UMAP
  régénérées à chaque run → ne garder que le set courant.

#### 6. Récupérer réellement l'espace disque (indispensable après purge)
Un `DELETE`/`UPDATE` ne rend pas l'espace en Postgres.
- [ ] `VACUUM FULL <table>;` après les grosses purges (lock exclusif → hors usage),
  ou `pg_repack` pour éviter le lock.
- [ ] Vérifier aussi le bloat des index.

#### 7. Automatiser (cible finale)
- [ ] Activer l'extension **`pg_cron`** dans Supabase.
- [ ] Fonction hebdo qui, pour chaque set inactif >14 j (via `sets`), applique les
  étapes 1–3 puis un `VACUUM`.
- [ ] Rendre le script idempotent et re-lançable.

| Levier | Cible | Gain estimé | Effort |
|--------|-------|-------------|--------|
| Contextes → Global (vieux sets) | `card_stats` | ~95 % / set | Faible |
| Tronquer history (vieux sets) | `card_stats` | Moyen | Faible |
| Purge player_level (vieux sets) | `card_player_level_stats` | Élevé | Faible |
| Purge/dégrade synergy | `synergy_scores` | À mesurer (potentiellement gros) | Faible |
| Purge éphémères (jobs, press, UMAP) | tables diverses | Moyen | Faible |
| `VACUUM FULL` post-purge | tout | Déclenche la libération réelle | Faible |

---

## 🧹 Nettoyage automatique de `sealed_optimizer_jobs`

**Contexte** : cette table stocke les jobs de la feature Sealed Optimizer
(payloads `jsonb` volumineux). Aucun intérêt à conserver ces jobs.

- [ ] Vider ponctuellement (libère l'espace immédiatement) :
  ```sql
  TRUNCATE TABLE public.sealed_optimizer_jobs;
  ```
- [ ] Mettre en place un nettoyage automatique **hebdomadaire** via `pg_cron` :
  ```sql
  DELETE FROM public.sealed_optimizer_jobs
  WHERE created_at < now() - interval '7 days';
  ```

---

## 🧪 Sealed optimizer : pistes d'amélioration (revue du 2026-10-07)

**Contexte** : revue globale de l'algo et du scoring
(`supabase/functions/_shared/sealedOptimizerCore.ts`). Constat : les tests passés
(`backend/reports/benchmarks/ALGO_STRATEGY.md`) visaient surtout la recherche (HC,
annealing, couverture des paires), alors que les leviers sont plutôt la mesure de
puissance, le protocole d'évaluation et la calibration du score.

**Outil disponible** : `backend/sealed-optimizer/outcome_calibration/` vérifie si le
score prédit les victoires sur les parties publiques 17Lands (fiches dans
`backend/reports/benchmarks/outcome_calibration/`). Sert de banc de test pour les
pistes ci-dessous.

### Remarques déjà actées
- **Déséquilibre des couleurs** : normal qu'un format ait des couleurs fortes. Le
  « biais RU / anti-vert » mesuré sur SOS venait du Sealed, qui n'est pas un proxy
  d'ArenaDirect pour SOS. Sur MSH et HOB (proxies valides), le score classe
  correctement les paires (même effet du score au sein d'une paire et entre paires).
- **Shards en série** : imposé par la limite CPU par requête des Edge Functions
  Supabase (`WORKER_LIMIT`). Paralléliser n'est pas une option.
- **Sealed ≠ ArenaDirect_Sealed** (choix de pack de couleurs, moins compétitif) :
  écarts forts sur SOS et ECL, faibles sur FRA, MSH, HOB. L'outil refuse les sets
  où le proxy est trop éloigné.

### Enseignements de l'outil (MSH et HOB, 2026-10-07)
- Le score prédit bien les victoires : +10 pts de score ≈ +3 pts de WR, et
  Q1 → Q5 ≈ +7 à +10 pts de WR à niveau de joueur égal. Pas de refonte nécessaire.
- Pas d'erreur de classement entre paires de couleurs sur ces sets.
- Saturation de la synergie propre à SOS (< 5 % des decks au plafond sur MSH/HOB).
- Poids recalés sur les victoires : la puissance porte l'essentiel ; synergie
  (ratio 0,06–0,11 vs 0,5 en prod), courbe (0,10–0,26 vs 0,5) et consistance
  (0,26–0,32 vs 0,65) pèsent moins. Gain prédictif minime, et courbe / consistance
  sont sous-estimées par ces données (les joueurs évitent d'eux-mêmes les decks
  absurdes, alors que ces axes servent de garde-fous à l'optimizer).

### Pistes, par ordre de priorité
1. [x] **Benchmark trophée ArenaDirect reproductible** (prérequis, petit effort) —
   fait le 2026-10-07 : banc local `backend/sealed-optimizer/local_bench/`
   (`bench.mjs` + `compare.py`), budget `maxEvals` optionnel dans le cœur (la prod
   n'est pas modifiée tant qu'on ne le lui passe pas). Reste à choisir le budget de
   prod avant déploiement (mesure SOS 15k vs 45k à refaire, runs saturés).
   Bug trouvé : le Strict Match de `calibration_runner.py` compare les archétypes
   comme des chaînes ordonnées (« UW » ≠ « WU »), environ 17 pts sous-comptés.
   - budget en nombre d'évaluations au lieu de millisecondes (`Date.now()`) ;
   - comparaison pool par pool (test apparié, intervalle par bootstrap) : l'écart dû
     à la seule graine atteint ±4 pts de Color Match ;
   - retirer « beats player » des critères (100 % attendu par construction).
2. [ ] **Pondération plus centrée sur la puissance** (aucun redéploiement : poids
   passés via `scoreWeights`). Testé le 2026-10-07 avec 2 / 1,0 / 0,6 / 0,3 :
   prédit mieux les victoires sur MSH et HOB (significatif), mais sur 50 pools FRA
   le Jaccard best3 baisse (−0,055, significatif) : les builds 2 et 3 deviennent des
   variantes du build 1. À retester avec le réglage de diversité (point 4).
   - scénario candidat : puissance 2, consistance 1,0, courbe 0,6, synergie 0,3
     (prod : 2 / 1,3 / 1 / 1) ;
   - valider sur les deux bancs : l'outil (prédiction au moins aussi bonne) et le
     benchmark trophée (évolution des builds proposés) ;
   - baisse modérée de la courbe, consistance proche de la prod (garde-fous).
2bis. [x] **Tricolores** (traité le 2026-10-07)
   - Score : à score égal, un tricolore gagnait comme un bicolore noté +2,8 pts
     (MSH) / +4,1 pts (HOB), significatif. Les termes multicolores de la
     consistance (`MULTICOLOR_CONSISTENCY`) remis à parité avec les bicolores
     (3,5 / 0 / 4,5 / 2,8) : prédiction meilleure sur MSH et HOB (significatif),
     sous-notation ramenée à ~2 pts (non significatif) ; banc trophée neutre sur SOS,
     tendance positive sur FRA (Color/Strict top3 +6 pts, non significatif).
     **Retenu, à déployer** (changer les valeurs par défaut dans le cœur).
   - Recherche : ajouter 3 trios dans chaque profil (`SEARCH_TUNING.extraTrios`)
     n'apporte rien (FRA : top1 changé sur 3 pools ; SOS : neutre). Le profil
     `power_greedy_splash` propose déjà des bases tricolores. **Non retenu.**
   - Variante plus légère (2,5 / 0 / 3,0 / 2,0) : mieux sur MSH, non significatif
     sur HOB. Non retenue (critère : amélioration sur les deux sets).
3. [ ] **Relancer l'outil sur FRA** dès que 17Lands publie son game_data Sealed
   (proxy le plus proche d'ArenaDirect : 0,95). Confirmation des points 1 et 2.
4. [x] **Diversité et polish** (traité le 2026-10-07, base : parité multicolore)
   - Coefficient de diversité unifié (`SEARCH_TUNING.finalDiversityLambda`, même
     valeur à l'agrégation des shards dans `index.ts`) : 2,2 partout = neutre ;
     **4,0 retenu** (builds 2-3 plus variés sur FRA et SOS, Jaccard best3 +0,028 sur
     SOS, significatif ; FRA Color/Strict top3 −4 pts, non significatif, à surveiller).
   - Polish final vérifié avec terrains puis top 3 retrié
     (`SEARCH_TUNING.polishCheckLands`) : score top1 en hausse sur FRA et SOS
     (significatif), alignement neutre. **Retenu.**
   - Poids candidats 2 / 1,0 / 0,6 / 0,3 retestés avec diversité 4,0 : Jaccard best3
     FRA toujours −0,039 (significatif). **Non retenus** ; une variante intermédiaire
     reste possible plus tard.
5. [x] **Mesure de puissance** (traité le 2026-10-07, réglages `POWER_TUNING`,
   comparés à la parité sur MSH et HOB)
   - **Bonus « bomb » continu retenu** (+1,5 par point au-delà de moyenne+5, au lieu
     de ×1,15 au-delà de moyenne+10) : prédit mieux sur MSH et HOB (significatif) ;
     banc trophée : Jaccard best3 FRA +0,019 et Jaccard top1 SOS +0,040 (significatifs).
   - Sans bonus : moins bien (MSH). Fenêtre ±6 au lieu de ±4 : moins bien sur les deux
     sets (pas de saturation à corriger). Lissage du GIH (K = 500) : moins bien sur
     les deux sets (échantillons ArenaDirect assez grands). Non retenus.
6. [ ] **Nombre de terrains** (mis de côté le 2026-10-07) : 87 % des decks joueurs
   ont 17 terrains, 12 % en ont 16. À score égal, un deck à 16 terrains gagne comme
   un deck à 17 noté +3,5 pts (MSH, juste significatif) / +1,8 pt (HOB, non
   significatif) ; trop peu de decks à 18 pour conclure. Explorer 16/18 avec ce score
   n'apporterait presque rien ; à reprendre si le signal se confirme sur FRA.
7. [x] **Falaise sur les removals** (non retenu le 2026-10-07) : à score égal, les
   decks à 0-1, 2 ou 3 removals ne gagnent pas significativement plus ou moins que
   ceux à 4+ (MSH et HOB). Le palier actuel est donc bien calibré en moyenne.
8. [ ] **Normalisation de la synergie relative au set** (mis de côté le 2026-10-07) :
   la saturation n'apparaît que sur SOS (59 % des decks à 100), où le Sealed n'est pas
   un proxy valide d'ArenaDirect : aucune donnée de victoires pour valider une
   correction. Synergie peu prédictive sur MSH/HOB.
9. [ ] **Contexte rechargé par chaque shard** : le mettre en cache dans le job parent
   (gain de temps total modeste, aucun gain de qualité).
10. [ ] **GIH par paire de couleurs** (`filter_context`) : pas de biais entre paires
    sur MSH/HOB, à ne reprendre que si FRA en montre un.
11. [ ] **Déployer le lot validé** (valeurs par défaut déjà passées dans le cœur et
    `index.ts`, non déployées) : parité multicolore, bonus bomb linéaire, diversité 4,0
    unifiée, polish vérifié, budget 12 000 évaluations par shard. Après déploiement :
    vérifier en mode `debug` le taux de shards coupés par la deadline CPU
    (`debugHcSummary.deadlineHitRate`) ; s'il est élevé, baisser `DEEP_SHARD_MAX_EVALS`.
