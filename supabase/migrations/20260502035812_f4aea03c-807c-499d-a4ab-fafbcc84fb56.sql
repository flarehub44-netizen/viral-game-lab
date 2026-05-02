CREATE OR REPLACE FUNCTION public.start_round_atomic(p_user_id uuid, p_stake numeric, p_result_mult numeric, p_payout numeric, p_net numeric, p_visual jsonb, p_layout_seed text, p_target_barrier integer, p_max_duration_seconds integer, p_layout_signature text, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_after_stake numeric;
  v_round_id uuid;
  v_existing uuid;
  v_open_round uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.game_rounds
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- Auto-expira rodadas abandonadas (sem end-round) deste usuário antes de bloquear.
  -- Considera abandonada qualquer rodada open com mais de (max_duration_seconds + 30s grace),
  -- ou simplesmente mais de 5 minutos se max_duration_seconds for nulo.
  UPDATE public.game_rounds
     SET round_status = 'expired',
         ended_at = now(),
         client_report = COALESCE(client_report, '{}'::jsonb)
                         || jsonb_build_object('reason', 'auto_expired_on_new_round_start')
   WHERE user_id = p_user_id
     AND round_status = 'open'
     AND created_at < now() - (interval '1 second' * (COALESCE(max_duration_seconds, 0) + 30));

  SELECT id INTO v_open_round FROM public.game_rounds
  WHERE user_id = p_user_id AND round_status = 'open' LIMIT 1;
  IF v_open_round IS NOT NULL THEN
    RAISE EXCEPTION 'open_round_exists';
  END IF;

  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_after_stake := round((v_balance - p_stake)::numeric, 2);
  IF v_after_stake < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;

  UPDATE public.wallets SET balance = v_after_stake, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'stake', p_stake, v_after_stake,
          p_idempotency_key || ':stake', '{}'::jsonb);

  INSERT INTO public.game_rounds (
    user_id, stake, mode, target_multiplier, result_multiplier, payout, net_result,
    visual_result, layout_seed, target_barrier, max_duration_seconds, layout_signature,
    round_status, idempotency_key
  ) VALUES (
    p_user_id, p_stake, 'target_20x', 20, p_result_mult, 0, -p_stake,
    p_visual, p_layout_seed, p_target_barrier, p_max_duration_seconds, p_layout_signature,
    'open', p_idempotency_key
  ) RETURNING id INTO v_round_id;

  RETURN v_round_id;
END;
$function$;

-- Limpa rodadas atualmente travadas para destravar usuários afetados agora.
UPDATE public.game_rounds
   SET round_status = 'expired',
       ended_at = now(),
       client_report = COALESCE(client_report, '{}'::jsonb)
                       || jsonb_build_object('reason', 'one_time_cleanup_open_rounds')
 WHERE round_status = 'open'
   AND created_at < now() - interval '60 seconds';