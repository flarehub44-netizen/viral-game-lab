-- Perfis (18+ / KYC), carteira, ledger e rodadas servidor-first

create type public.kyc_status as enum ('none', 'pending', 'approved');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  over_18_confirmed_at timestamptz,
  kyc_status public.kyc_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric(12, 2) not null default 150.00
    check (balance >= 0 and balance <= 1000000),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('stake', 'payout', 'deposit', 'withdraw', 'adjustment')),
  amount numeric(12, 2) not null check (amount >= 0),
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  idempotency_key text unique,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stake numeric(12, 2) not null check (stake >= 1 and stake <= 20),
  mode text not null default 'target_20x',
  target_multiplier numeric(12, 4) not null default 20,
  result_multiplier numeric(12, 4) not null check (result_multiplier >= 0 and result_multiplier <= 20),
  payout numeric(12, 2) not null check (payout >= 0),
  net_result numeric(12, 2) not null,
  visual_result jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index game_rounds_user_created_idx on public.game_rounds (user_id, created_at desc);
create index ledger_entries_user_created_idx on public.ledger_entries (user_id, created_at desc);

-- Novo usuário: perfil + carteira inicial
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'player'), '@', 1)
    )
  );
  insert into public.wallets (user_id, balance)
  values (new.id, 150.00);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.game_rounds enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "wallets_select_own"
  on public.wallets for select
  using (auth.uid() = user_id);

create policy "ledger_select_own"
  on public.ledger_entries for select
  using (auth.uid() = user_id);

create policy "game_rounds_select_own"
  on public.game_rounds for select
  using (auth.uid() = user_id);

-- Transação atômica: apenas service_role (Edge Function)
create or replace function public.start_round_atomic(
  p_user_id uuid,
  p_stake numeric,
  p_result_mult numeric,
  p_payout numeric,
  p_net numeric,
  p_visual jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new numeric;
  v_round_id uuid;
  v_existing uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing
    from public.game_rounds
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if v_balance < p_stake then
    raise exception 'insufficient_balance';
  end if;

  v_new := round((v_balance - p_stake + p_payout)::numeric, 2);
  if v_new < 0 then
    raise exception 'negative_balance';
  end if;

  update public.wallets
  set balance = v_new, updated_at = now()
  where user_id = p_user_id;

  insert into public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  values (
    p_user_id,
    'stake',
    p_stake,
    round((v_balance - p_stake)::numeric, 2),
    p_idempotency_key || ':stake',
    '{}'::jsonb
  );

  insert into public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  values (
    p_user_id,
    'payout',
    p_payout,
    v_new,
    p_idempotency_key || ':payout',
    '{}'::jsonb
  );

  insert into public.game_rounds (
    user_id,
    stake,
    mode,
    target_multiplier,
    result_multiplier,
    payout,
    net_result,
    visual_result,
    idempotency_key
  )
  values (
    p_user_id,
    p_stake,
    'target_20x',
    20,
    p_result_mult,
    p_payout,
    p_net,
    p_visual,
    p_idempotency_key
  )
  returning id into v_round_id;

  return v_round_id;
end;
$$;

revoke all on function public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text) from public;
grant execute on function public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text) to service_role;
