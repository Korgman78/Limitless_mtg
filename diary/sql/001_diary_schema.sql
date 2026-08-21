-- ─── MTG Training Diary — schéma initial ─────────────────────────────────────
-- Projet Supabase partagé avec Limitless. Toutes les tables sont préfixées
-- `diary_` pour rester isolées des tables du metagame.
--
-- Sécurité : outil perso, la clé anon est déjà publique (bundle Vite). RLS est
-- activé avec des policies ouvertes en lecture/écriture, MAIS aucune policy
-- DELETE n'est créée — la suppression physique est donc impossible via l'API
-- REST. Les suppressions passent par `deleted_at` (soft delete), ce qui protège
-- l'historique contre un effacement accidentel ou malveillant.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Événements (un draft ou un sealed) ──────────────────────────────────────

create table if not exists diary_events (
  id          uuid primary key default gen_random_uuid(),
  set_code    text not null,
  format      text not null,          -- PremierDraft | TradDraft | Sealed | ArenaDirect_Sealed
  event_type  text not null check (event_type in ('draft', 'sealed')),
  played_at   timestamptz not null default now(),
  wins        smallint not null default 0 check (wins >= 0 and wins <= 12),
  losses      smallint not null default 0 check (losses >= 0 and losses <= 6),
  source      text not null default 'manual' check (source in ('manual', 'overlay')),
  draft_id    text,                   -- draftId du log Arena, sert à dédupliquer l'import overlay
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un même draft Arena ne doit pas pouvoir être importé deux fois par l'overlay.
create unique index if not exists diary_events_draft_id_key
  on diary_events (draft_id)
  where draft_id is not null;

create index if not exists diary_events_set_played_idx
  on diary_events (set_code, played_at desc)
  where deleted_at is null;

-- ─── Phase de pick (draft uniquement, alimenté par l'overlay) ────────────────

create table if not exists diary_picks (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references diary_events (id) on delete cascade,
  pack_number  smallint not null,
  pick_number  smallint not null,
  picked_card  text,                  -- null si le nom n'a pas pu être résolu
  picked_arena_id integer,
  pack_cards   jsonb not null default '[]'::jsonb,  -- [{arenaId, name}] du pack complet
  created_at   timestamptz not null default now(),
  unique (event_id, pack_number, pick_number)
);

create index if not exists diary_picks_event_idx
  on diary_picks (event_id, pack_number, pick_number);

-- ─── Pool (sealed uniquement, saisi à la main) ───────────────────────────────

create table if not exists diary_pool_cards (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references diary_events (id) on delete cascade,
  card_name  text not null,
  qty        smallint not null default 1 check (qty > 0),
  unique (event_id, card_name)
);

-- ─── Versions de deck ────────────────────────────────────────────────────────
-- Une ligne par version construite pendant l'événement. `decklist_raw` garde
-- l'export MTGA tel quel : c'est la source de vérité, le parsing est refait à
-- l'affichage par parseMtgaDeck().

create table if not exists diary_deck_versions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references diary_events (id) on delete cascade,
  version_no   smallint not null,
  label        text,                  -- ex: "build initial", "après 0-2"
  decklist_raw text not null,
  created_at   timestamptz not null default now(),
  unique (event_id, version_no)
);

create index if not exists diary_deck_versions_event_idx
  on diary_deck_versions (event_id, version_no);

-- ─── Commentaires qualitatifs ────────────────────────────────────────────────
-- Modèle clé/valeur plutôt que colonnes fixes : les sections diffèrent entre
-- draft et sealed, et la liste évoluera.
--
-- Sections draft  : pick_phase | deck_quality | gameplay | overperformers
--                   | underperformers | other
-- Sections sealed : deck_choice | deck_quality | gameplay | overperformers
--                   | underperformers | other

create table if not exists diary_notes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references diary_events (id) on delete cascade,
  section    text not null,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (event_id, section)
);

-- ─── Synthèses LLM hebdomadaires ─────────────────────────────────────────────

create table if not exists diary_weekly_reports (
  id           uuid primary key default gen_random_uuid(),
  week_start   date not null unique,  -- lundi de la semaine couverte
  body_md      text not null,
  event_count  smallint not null default 0,
  generated_at timestamptz not null default now()
);

-- ─── updated_at automatique ──────────────────────────────────────────────────

create or replace function diary_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diary_events_touch on diary_events;
create trigger diary_events_touch
  before update on diary_events
  for each row execute function diary_touch_updated_at();

drop trigger if exists diary_notes_touch on diary_notes;
create trigger diary_notes_touch
  before update on diary_notes
  for each row execute function diary_touch_updated_at();

-- ─── RLS : ouvert en lecture/écriture, fermé en suppression ──────────────────

alter table diary_events        enable row level security;
alter table diary_picks         enable row level security;
alter table diary_pool_cards    enable row level security;
alter table diary_deck_versions enable row level security;
alter table diary_notes         enable row level security;
alter table diary_weekly_reports enable row level security;

-- Deux niveaux :
--   * diary_events et diary_notes portent le contenu irremplaçable (l'historique
--     et tes commentaires). Aucune policy DELETE : suppression = deleted_at.
--   * les autres tables sont du contenu re-générable (picks ré-importables,
--     pool/deck re-collables). DELETE autorisé pour permettre les corrections
--     et les remplacements par l'app.

do $$
declare
  t text;
  deletable text[] := array[
    'diary_picks',
    'diary_pool_cards',
    'diary_deck_versions',
    'diary_weekly_reports'
  ];
begin
  foreach t in array array[
    'diary_events',
    'diary_picks',
    'diary_pool_cards',
    'diary_deck_versions',
    'diary_notes',
    'diary_weekly_reports'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);

    execute format(
      'create policy %I on %I for select using (true)', t || '_read', t);
    execute format(
      'create policy %I on %I for insert with check (true)', t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (true) with check (true)', t || '_update', t);

    if t = any (deletable) then
      execute format(
        'create policy %I on %I for delete using (true)', t || '_delete', t);
    end if;
  end loop;
end;
$$;
