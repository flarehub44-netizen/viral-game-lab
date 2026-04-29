create table public.scores (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 20),
  score integer not null check (score >= 0 and score <= 10000000),
  max_multiplier integer not null check (max_multiplier >= 1 and max_multiplier <= 4096),
  duration_seconds integer not null check (duration_seconds >= 0 and duration_seconds <= 3600),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "Scores are viewable by everyone"
on public.scores for select
using (true);

create policy "Anyone can insert scores"
on public.scores for insert
with check (true);

create index scores_score_desc_idx on public.scores (score desc, created_at desc);
create index scores_created_at_idx on public.scores (created_at desc);