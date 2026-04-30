-- CLIMB LIVE deterministic contract + end-round status tracking

alter table public.game_rounds
  add column if not exists layout_seed text,
  add column if not exists target_barrier int,
  add column if not exists max_duration_seconds int,
  add column if not exists layout_signature text,
  add column if not exists round_status text not null default 'open',
  add column if not exists ended_at timestamptz,
  add column if not exists client_report jsonb not null default '{}'::jsonb;

update public.game_rounds
set
  layout_seed = coalesce(layout_seed, id::text),
  target_barrier = coalesce(target_barrier, 12),
  max_duration_seconds = coalesce(max_duration_seconds, 30),
  layout_signature = coalesce(layout_signature, md5(id::text)),
  round_status = coalesce(round_status, 'open')
where
  layout_seed is null
  or target_barrier is null
  or max_duration_seconds is null
  or layout_signature is null
  or round_status is null;

alter table public.game_rounds
  alter column layout_seed set not null,
  alter column target_barrier set not null,
  alter column max_duration_seconds set not null,
  alter column layout_signature set not null;

alter table public.game_rounds
  drop constraint if exists game_rounds_target_barrier_check,
  add constraint game_rounds_target_barrier_check check (target_barrier >= 1),
  drop constraint if exists game_rounds_max_duration_seconds_check,
  add constraint game_rounds_max_duration_seconds_check check (max_duration_seconds between 5 and 600),
  drop constraint if exists game_rounds_round_status_check,
  add constraint game_rounds_round_status_check check (round_status in ('open','closed','expired','rejected'));

create index if not exists game_rounds_status_created_idx
  on public.game_rounds (round_status, created_at);
create index if not exists game_rounds_layout_signature_idx
  on public.game_rounds (layout_signature);
create index if not exists game_rounds_id_status_idx
  on public.game_rounds (id, round_status);
