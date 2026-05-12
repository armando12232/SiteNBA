create table if not exists public.cs2_matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  league text not null,
  stage text,
  starts_at timestamptz,
  start_label text,
  status text not null default 'scheduled',
  match_format text not null default 'BO3',
  provider text,
  teams jsonb not null default '{}'::jsonb,
  odds jsonb not null default '{}'::jsonb,
  markets jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs2_matches_starts_at_idx
  on public.cs2_matches (starts_at asc nulls last);

create index if not exists cs2_matches_league_idx
  on public.cs2_matches (league);

create index if not exists cs2_matches_teams_idx
  on public.cs2_matches using gin (teams);

create index if not exists cs2_matches_markets_idx
  on public.cs2_matches using gin (markets);

alter table public.cs2_matches enable row level security;

comment on table public.cs2_matches is
  'CS2 match snapshots consumed by /api/sports?league=cs2&type=scoreboard. Write with service role from an approved data provider.';
