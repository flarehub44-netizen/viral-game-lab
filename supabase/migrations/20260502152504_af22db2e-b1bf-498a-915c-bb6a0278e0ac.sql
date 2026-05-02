CREATE OR REPLACE FUNCTION public.start_round_atomic(p_user_id uuid, p_stake numeric, p_result_mult numeric, p_payout numeric, p_net numeric, p_visual jsonb, p_layout_seed text, p_target_barrier integer, p_max_duration_seconds integer, p_layout_signature text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_bonus numeric;
  v_free_spins integer;
  v_after_real numeric;
  v_after_bonus numeric;
  v_use_from_bonus numeric := 0;
  v_use_from_real numeric := 0;
  v_round_id uuid;
  v_existing uuid;
  v_open_round uuid;
  v_use_free_spin boolean := false;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.game_rounds
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  UPDATE public.game_rounds
     SET round_status = 'expired', ended_at = now(),
         client_report = COALESCE(client_report, '{}'::jsonb)
                         || jsonb_build_object('reason', 'auto_expired_on_new_round_start')
   WHERE user_id = p_user_id AND round_status = 'open'
     AND created_at < now() - (interval '1 second' * (COALESCE(max_duration_seconds, 0) + 30));

  SELECT id INTO v_open_round FROM public.game_rounds
  WHERE user_id = p_user_id AND round_status = 'open' LIMIT 1;
  IF v_open_round IS NOT NULL THEN RAISE EXCEPTION 'open_round_exists'; END IF;

  SELECT balance, bonus_balance, free_spins_remaining
    INTO v_balance, v_bonus, v_free_spins
  FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  -- Free spin auto: stake R$1 + tem giros disponíveis
  IF p_stake = 1 AND v_free_spins > 0 THEN
    v_use_free_spin := true;
    v_use_from_real := 0;
    v_use_from_bonus := 0;
    v_after_real := v_balance;
    v_after_bonus := v_bonus;

    UPDATE public.wallets
       SET free_spins_remaining = v_free_spins - 1,
           updated_at = now()
     WHERE user_id = p_user_id;

    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'stake', 0, v_balance + v_bonus,
            p_idempotency_key || ':stake',
            jsonb_build_object('free_spin', true, 'nominal_stake', p_stake));
  ELSE
    IF (v_balance + v_bonus) < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

    -- Consome bônus primeiro
    v_use_from_bonus := LEAST(v_bonus, p_stake);
    v_use_from_real := round((p_stake - v_use_from_bonus)::numeric, 2);
    v_use_from_bonus := round(v_use_from_bonus::numeric, 2);

    v_after_real := round((v_balance - v_use_from_real)::numeric, 2);
    v_after_bonus := round((v_bonus - v_use_from_bonus)::numeric, 2);

    IF v_after_real < 0 OR v_after_bonus < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;

    UPDATE public.wallets
       SET balance = v_after_real,
           bonus_balance = v_after_bonus,
           bonus_rollover_progress = round((bonus_rollover_progress + p_stake)::numeric, 2),
           updated_at = now()
     WHERE user_id = p_user_id;

    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'stake', p_stake, v_after_real + v_after_bonus,
            p_idempotency_key || ':stake',
            jsonb_build_object('from_real', v_use_from_real, 'from_bonus', v_use_from_bonus));
  END IF;

  INSERT INTO public.game_rounds (
    user_id, stake, mode, target_multiplier, result_multiplier, payout, net_result,
    visual_result, layout_seed, target_barrier, max_duration_seconds, layout_signature,
    round_status, idempotency_key, client_report
  ) VALUES (
    p_user_id, p_stake, 'target_20x', 20, p_result_mult, 0,
    CASE WHEN v_use_free_spin THEN 0 ELSE -p_stake END,
    p_visual, p_layout_seed, p_target_barrier, p_max_duration_seconds, p_layout_signature,
    'open', p_idempotency_key,
    jsonb_build_object(
      'stake_from_real', v_use_from_real,
      'stake_from_bonus', CASE WHEN v_use_free_spin THEN p_stake ELSE v_use_from_bonus END,
      'free_spin', v_use_free_spin
    )
  ) RETURNING id INTO v_round_id;

  RETURN v_round_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;