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
