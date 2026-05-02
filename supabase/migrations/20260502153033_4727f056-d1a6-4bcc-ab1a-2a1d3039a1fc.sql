CREATE OR REPLACE FUNCTION public.request_pix_withdrawal(p_user_id uuid, p_amount numeric, p_pix_key text, p_pix_key_type text, p_provider_ref text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_withdraw_id uuid;
  v_existing uuid;
  v_last_withdrawal timestamptz;
  v_cycle_start timestamptz;
  v_deposited numeric := 0;
  v_wagered numeric := 0;
  v_required numeric := 0;
BEGIN
  IF p_amount < 30 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'withdraw_amount_out_of_bounds';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.pix_withdrawals
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT MAX(created_at) INTO v_last_withdrawal
  FROM public.pix_withdrawals
  WHERE user_id = p_user_id
    AND status NOT IN ('failed', 'reversed');

  v_cycle_start := COALESCE(v_last_withdrawal, 'epoch'::timestamptz);

  SELECT COALESCE(SUM(amount), 0) INTO v_deposited
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'deposit'
    AND created_at > v_cycle_start;

  SELECT COALESCE(SUM(amount), 0) INTO v_wagered
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'stake'
    AND created_at > v_cycle_start;

  v_required := round((v_deposited * 2)::numeric, 2);

  IF v_wagered < v_required THEN
    RAISE EXCEPTION 'rollover_not_met:%:%:%',
      round(v_deposited::numeric, 2),
      round(v_wagered::numeric, 2),
      v_required;
  END IF;

  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new_balance := round((v_balance - p_amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.pix_withdrawals(user_id, amount, pix_key, pix_key_type, provider_ref, idempotency_key)
  VALUES (p_user_id, p_amount, p_pix_key, p_pix_key_type, p_provider_ref, p_idempotency_key)
  RETURNING id INTO v_withdraw_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'withdraw', p_amount, v_new_balance,
          'pix_withdraw:' || v_withdraw_id::text,
          jsonb_build_object(
            'pix_withdrawal_id', v_withdraw_id,
            'provider_ref', p_provider_ref,
            'rollover_deposited', v_deposited,
            'rollover_wagered', v_wagered,
            'rollover_required', v_required
          ));

  RETURN v_withdraw_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;