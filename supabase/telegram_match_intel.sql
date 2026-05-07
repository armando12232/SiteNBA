create table if not exists public.telegram_match_intel (
  id uuid primary key default gen_random_uuid(),
  chat_id text,
  message_id text,
  message_date timestamptz,
  type text not null default 'discipline',
  home_team text,
  away_team text,
  referee text,
  avg_ucl_cards numeric,
  avg_league_cards numeric,
  ref_last numeric[] default '{}',
  teams jsonb not null default '[]'::jsonb,
  source_text text not null,
  raw_update jsonb,
  created_at timestamptz not null default now(),
  unique (chat_id, message_id)
);

create index if not exists telegram_match_intel_type_created_idx
  on public.telegram_match_intel (type, created_at desc);

create index if not exists telegram_match_intel_teams_idx
  on public.telegram_match_intel using gin (teams);
