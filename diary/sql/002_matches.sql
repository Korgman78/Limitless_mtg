-- ─── Matchs joués, à la maille de la partie ──────────────────────────────────
-- Le score d'un événement Arena compte les MATCHS. En BO3 (Traditional) un
-- 2-1 en matchs peut cacher un 5-4 en parties : c'est cette granularité que
-- cette table conserve, avec l'archétype de chaque adversaire.
--
-- Alimenté depuis le Player.log (finalMatchResult + gameObjects). Table
-- re-générable : DELETE autorisé, contrairement à diary_events/diary_notes.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists diary_matches (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references diary_events (id) on delete cascade,

  -- matchId d'Arena : rend l'import idempotent.
  match_id        text not null unique,
  match_number    smallint,

  opponent_name   text,
  -- Couleurs déduites des cartes adverses vues en jeu, ex "UB". Null si trop
  -- peu de cartes ont été révélées pour conclure.
  opponent_colors text,

  games_won       smallint not null default 0,
  games_lost      smallint not null default 0,
  won             boolean,

  created_at      timestamptz not null default now()
);

create index if not exists diary_matches_event_idx
  on diary_matches (event_id, match_number);

alter table diary_matches enable row level security;

drop policy if exists diary_matches_read on diary_matches;
drop policy if exists diary_matches_insert on diary_matches;
drop policy if exists diary_matches_update on diary_matches;
drop policy if exists diary_matches_delete on diary_matches;

create policy diary_matches_read   on diary_matches for select using (true);
create policy diary_matches_insert on diary_matches for insert with check (true);
create policy diary_matches_update on diary_matches for update using (true) with check (true);
create policy diary_matches_delete on diary_matches for delete using (true);
