-- Top 10 hardening (phase 1)
-- 1) single open round per user
-- 2) rate limiting primitives
-- 3) stale open-round auto-close primitives
-- 4) fraud signal logging
-- 6) pix deposit/withdraw primitives
-- 7) LGPD access audit primitive
-- 10) feature flag storage primitive

-- ---------------------------------------------------------------------------
-- Item 1: single OPEN round per user + RPC guard
-- ---------------------------------------------------------------------------

create unique index if not exists game_rounds_single_open_per_user_idx
  on public.game_rounds (user_id)
  where round_status = 'open';

create or replace function public.start_round_atomic(
  p_user_id uuid,
  p_stake numeric,
  p_result_mult numeric,
  p_payout numeric,
  p_net numeric,
  p_visual jsonb,
  p_layout_seed text,
  p_target_barrier int,
  p_max_duration_seconds int,
  p_layout_signature text,
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
  v_open_round uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing
    from public.game_rounds
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select id into v_open_round
  from public.game_rounds
  where user_id = p_user_id and round_status = 'open'
  limit 1;

  if v_open_round is not null then
    raise exception 'open_round_exists';
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
    layout_seed,
    target_barrier,
    max_duration_seconds,
    layout_signature,
    round_status,
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
    p_layout_seed,
    p_target_barrier,
    p_max_duration_seconds,
    p_layout_signature,
    'open',
    p_idempotency_key
  )
  returning id into v_round_id;

  return v_round_id;
end;
$$;

revoke all on function public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) from public;
grant execute on function public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Item 2: shared rate limiting primitives
-- ---------------------------------------------------------------------------

create table if not exists public.api_request_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ip text,
  device_fingerprint text,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_request_logs_action_created_idx
  on public.api_request_logs (action, created_at desc);
create index if not exists api_request_logs_user_action_created_idx
  on public.api_request_logs (user_id, action, created_at desc);
create index if not exists api_request_logs_ip_action_created_idx
  on public.api_request_logs (ip, action, created_at desc);

alter table public.api_request_logs enable row level security;

drop policy if exists "api_request_logs_select_own" on public.api_request_logs;
create policy "api_request_logs_select_own"
  on public.api_request_logs for select
  using (auth.uid() = user_id);

create or replace function public.guard_request_rate(
  p_user_id uuid,
  p_action text,
  p_ip text,
  p_device_fingerprint text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*)
    into v_count
  from public.api_request_logs
  where action = p_action
    and created_at >= now() - (interval '1 second' * greatest(1, p_window_seconds))
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_ip is not null and ip = p_ip)
      or (p_device_fingerprint is not null and device_fingerprint = p_device_fingerprint)
    );

  insert into public.api_request_logs (user_id, ip, device_fingerprint, action)
  values (p_user_id, p_ip, p_device_fingerprint, p_action);

  return v_count < greatest(1, p_limit);
end;
$$;

revoke all on function public.guard_request_rate(uuid, text, text, text, integer, integer) from public;
grant execute on function public.guard_request_rate(uuid, text, text, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Item 3/4: stale-round closure + fraud events
-- ---------------------------------------------------------------------------

create table if not exists public.fraud_signals (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  round_id uuid references public.game_rounds(id) on delete set null,
  signal text not null,
  score smallint not null default 1 check (score >= 1 and score <= 100),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fraud_signals_user_created_idx
  on public.fraud_signals (user_id, created_at desc);
create index if not exists fraud_signals_signal_created_idx
  on public.fraud_signals (signal, created_at desc);

alter table public.fraud_signals enable row level security;

drop policy if exists "fraud_signals_select_own" on public.fraud_signals;
create policy "fraud_signals_select_own"
  on public.fraud_signals for select
  using (auth.uid() = user_id);

create or replace function public.log_fraud_signal(
  p_user_id uuid,
  p_round_id uuid,
  p_signal text,
  p_score smallint default 5,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fraud_signals(user_id, round_id, signal, score, payload)
  values (p_user_id, p_round_id, p_signal, p_score, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.log_fraud_signal(uuid, uuid, text, smallint, jsonb) from public;
grant execute on function public.log_fraud_signal(uuid, uuid, text, smallint, jsonb) to service_role;

create or replace function public.close_stale_open_rounds(
  p_grace_seconds integer default 300
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with upd as (
    update public.game_rounds
      set round_status = 'expired',
          ended_at = now(),
          client_report = coalesce(client_report, '{}'::jsonb) || jsonb_build_object(
            'reason', 'cron_timeout',
            'grace_seconds', p_grace_seconds
          )
    where round_status = 'open'
      and created_at <= now() - (interval '1 second' * greatest(60, p_grace_seconds))
    returning id, user_id
  )
  select count(*) into v_count from upd;

  insert into public.fraud_signals(user_id, round_id, signal, score, payload)
  select user_id, id, 'open_round_timeout', 3, jsonb_build_object('source', 'close_stale_open_rounds')
  from (
    select id, user_id from public.game_rounds
    where round_status = 'expired'
      and ended_at >= now() - interval '10 seconds'
  ) t;

  return v_count;
end;
$$;

revoke all on function public.close_stale_open_rounds(integer) from public;
grant execute on function public.close_stale_open_rounds(integer) to service_role;

do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    -- non-fatal: environment may not allow extension install in migrations
    null;
  end;

  begin
    perform cron.unschedule('close-stale-open-rounds');
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      'close-stale-open-rounds',
      '*/1 * * * *',
      $job$select public.close_stale_open_rounds(300);$job$
    );
  exception when others then
    null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Item 6: Pix payment primitives (deposit + withdraw)
-- ---------------------------------------------------------------------------

create table if not exists public.pix_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_ref text not null unique,
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000),
  qr_code text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','failed','expired')),
  webhook_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pix_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000),
  pix_key text not null,
  pix_key_type text not null check (pix_key_type in ('cpf','email','phone','evp')),
  status text not null default 'requested' check (status in ('requested','processing','paid','failed','reversed')),
  provider_ref text unique,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pix_deposits_user_created_idx
  on public.pix_deposits (user_id, created_at desc);
create index if not exists pix_withdrawals_user_created_idx
  on public.pix_withdrawals (user_id, created_at desc);

alter table public.pix_deposits enable row level security;
alter table public.pix_withdrawals enable row level security;

drop policy if exists "pix_deposits_select_own" on public.pix_deposits;
create policy "pix_deposits_select_own"
  on public.pix_deposits for select
  using (auth.uid() = user_id);

drop policy if exists "pix_withdrawals_select_own" on public.pix_withdrawals;
create policy "pix_withdrawals_select_own"
  on public.pix_withdrawals for select
  using (auth.uid() = user_id);

create or replace function public.create_pix_deposit_request(
  p_user_id uuid,
  p_provider_ref text,
  p_amount numeric,
  p_qr_code text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.pix_deposits(user_id, provider_ref, amount, qr_code, expires_at)
  values (p_user_id, p_provider_ref, p_amount, p_qr_code, p_expires_at)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_pix_deposit_request(uuid, text, numeric, text, timestamptz) from public;
grant execute on function public.create_pix_deposit_request(uuid, text, numeric, text, timestamptz) to service_role;

create or replace function public.confirm_pix_deposit(
  p_provider_ref text,
  p_amount numeric,
  p_webhook_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep public.pix_deposits%rowtype;
  v_balance numeric;
  v_user_id uuid;
begin
  select * into v_dep
  from public.pix_deposits
  where provider_ref = p_provider_ref
  for update;

  if not found then
    raise exception 'deposit_not_found';
  end if;

  if v_dep.status = 'confirmed' then
    return v_dep.id;
  end if;

  if v_dep.status <> 'pending' then
    raise exception 'invalid_deposit_state';
  end if;

  if round(p_amount::numeric, 2) <> round(v_dep.amount::numeric, 2) then
    raise exception 'amount_mismatch';
  end if;

  v_user_id := v_dep.user_id;

  select balance into v_balance
  from public.wallets
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  v_balance := round((v_balance + v_dep.amount)::numeric, 2);

  update public.wallets
  set balance = v_balance,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  values (
    v_user_id,
    'deposit',
    v_dep.amount,
    v_balance,
    'pix_deposit:' || v_dep.provider_ref,
    jsonb_build_object('pix_deposit_id', v_dep.id)
  );

  update public.pix_deposits
    set status = 'confirmed',
        confirmed_at = now(),
        webhook_payload = coalesce(p_webhook_payload, '{}'::jsonb)
  where id = v_dep.id;

  return v_dep.id;
end;
$$;

revoke all on function public.confirm_pix_deposit(text, numeric, jsonb) from public;
grant execute on function public.confirm_pix_deposit(text, numeric, jsonb) to service_role;

create or replace function public.request_pix_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_pix_key text,
  p_pix_key_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
  v_withdraw_id uuid;
begin
  if p_amount < 5 or p_amount > 5000 then
    raise exception 'withdraw_amount_out_of_bounds';
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_balance';
  end if;

  v_new_balance := round((v_balance - p_amount)::numeric, 2);

  update public.wallets
    set balance = v_new_balance,
        updated_at = now()
  where user_id = p_user_id;

  insert into public.pix_withdrawals(user_id, amount, pix_key, pix_key_type)
  values (p_user_id, p_amount, p_pix_key, p_pix_key_type)
  returning id into v_withdraw_id;

  insert into public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  values (
    p_user_id,
    'withdraw',
    p_amount,
    v_new_balance,
    'pix_withdraw:' || v_withdraw_id::text,
    jsonb_build_object('pix_withdrawal_id', v_withdraw_id)
  );

  return v_withdraw_id;
end;
$$;

revoke all on function public.request_pix_withdrawal(uuid, numeric, text, text) from public;
grant execute on function public.request_pix_withdrawal(uuid, numeric, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Item 7/10: lgpd access audit + feature flags
-- ---------------------------------------------------------------------------

create table if not exists public.data_access_audit (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_access_audit_target_created_idx
  on public.data_access_audit(target_user_id, created_at desc);

alter table public.data_access_audit enable row level security;

drop policy if exists "data_access_audit_select_own_target" on public.data_access_audit;
create policy "data_access_audit_select_own_target"
  on public.data_access_audit for select
  using (auth.uid() = target_user_id);

create or replace function public.log_data_access_event(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.data_access_audit(actor_user_id, target_user_id, action, context)
  values (p_actor_user_id, p_target_user_id, p_action, coalesce(p_context, '{}'::jsonb));
end;
$$;

revoke all on function public.log_data_access_event(uuid, uuid, text, jsonb) from public;
grant execute on function public.log_data_access_event(uuid, uuid, text, jsonb) to service_role;

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  rollout_percent smallint not null default 0 check (rollout_percent >= 0 and rollout_percent <= 100),
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

drop policy if exists "feature_flags_read_all" on public.feature_flags;
create policy "feature_flags_read_all"
  on public.feature_flags for select
  using (true);

create table if not exists public.lgpd_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'requested' check (status in ('requested','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists lgpd_deletion_requests_user_created_idx
  on public.lgpd_deletion_requests(user_id, requested_at desc);

alter table public.lgpd_deletion_requests enable row level security;

drop policy if exists "lgpd_deletion_requests_select_own" on public.lgpd_deletion_requests;
create policy "lgpd_deletion_requests_select_own"
  on public.lgpd_deletion_requests for select
  using (auth.uid() = user_id);

create or replace function public.request_lgpd_deletion(
  p_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.lgpd_deletion_requests(user_id, reason)
  values (p_user_id, p_reason)
  returning id into v_id;

  perform public.log_data_access_event(
    p_user_id,
    p_user_id,
    'lgpd_deletion_requested',
    jsonb_build_object('request_id', v_id)
  );

  return v_id;
end;
$$;

revoke all on function public.request_lgpd_deletion(uuid, text) from public;
grant execute on function public.request_lgpd_deletion(uuid, text) to service_role;
