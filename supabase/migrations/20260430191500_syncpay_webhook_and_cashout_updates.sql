-- Sync Pay integration adjustments

alter table public.pix_withdrawals
  add column if not exists webhook_payload jsonb not null default '{}'::jsonb;

create or replace function public.request_pix_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_pix_key text,
  p_pix_key_type text,
  p_provider_ref text default null
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

  insert into public.pix_withdrawals(user_id, amount, pix_key, pix_key_type, provider_ref)
  values (p_user_id, p_amount, p_pix_key, p_pix_key_type, p_provider_ref)
  returning id into v_withdraw_id;

  insert into public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  values (
    p_user_id,
    'withdraw',
    p_amount,
    v_new_balance,
    'pix_withdraw:' || v_withdraw_id::text,
    jsonb_build_object('pix_withdrawal_id', v_withdraw_id, 'provider_ref', p_provider_ref)
  );

  return v_withdraw_id;
end;
$$;

revoke all on function public.request_pix_withdrawal(uuid, numeric, text, text, text) from public;
grant execute on function public.request_pix_withdrawal(uuid, numeric, text, text, text) to service_role;

create or replace function public.apply_syncpay_cashout_webhook(
  p_reference_id text,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pix_withdrawals%rowtype;
begin
  select * into v_row
  from public.pix_withdrawals
  where provider_ref = p_reference_id
  for update;

  if not found then
    raise exception 'withdrawal_not_found';
  end if;

  if p_status in ('completed', 'paid') then
    update public.pix_withdrawals
      set status = 'paid',
          processed_at = now(),
          webhook_payload = coalesce(p_payload, '{}'::jsonb)
    where id = v_row.id;
  elsif p_status in ('failed', 'reversed', 'refunded') then
    update public.pix_withdrawals
      set status = 'failed',
          processed_at = now(),
          webhook_payload = coalesce(p_payload, '{}'::jsonb)
    where id = v_row.id;
  else
    update public.pix_withdrawals
      set status = 'processing',
          webhook_payload = coalesce(p_payload, '{}'::jsonb)
    where id = v_row.id;
  end if;

  return v_row.id;
end;
$$;

revoke all on function public.apply_syncpay_cashout_webhook(text, text, jsonb) from public;
grant execute on function public.apply_syncpay_cashout_webhook(text, text, jsonb) to service_role;
