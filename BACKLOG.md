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
