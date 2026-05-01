-- 1) start_round_atomic: apenas debita a entrada (não credita payout adiantado)
CREATE OR REPLACE FUNCTION public.start_round_atomic(
  p_user_id uuid,
  p_stake numeric,
  p_result_mult numeric,
  p_payout numeric,
  p_net numeric,
  p_visual jsonb,
  p_layout_seed text,
  p_target_barrier integer,
  p_max_duration_seconds integer,
  p_layout_signature text,
  p_idempotency_key text
)
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

  -- Pagamento NÃO é creditado aqui. Será via settle_round_atomic se o jogador atingir a meta.
  -- A rodada armazena o multiplicador potencial (p_result_mult) e o payout potencial (p_payout)
  -- para que o cliente saiba a recompensa em jogo. Os campos `payout` e `net_result` no banco
  -- ficam zerados/negativos até a liquidação no end-round.
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

-- 2) settle_round_atomic: credita payout APENAS se o jogador atingiu a meta
CREATE OR REPLACE FUNCTION public.settle_round_atomic(
  p_user_id uuid,
  p_round_id uuid,
  p_barriers_passed integer,
  p_alive integer,
  p_forced_by_timeout boolean,
  p_client_report jsonb
)
RETURNS TABLE(
  round_id uuid,
  round_status text,
  result_multiplier numeric,
  payout numeric,
  net_result numeric,
  reached_target boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.game_rounds%rowtype;
  v_balance numeric;
  v_new_balance numeric;
  v_payout numeric := 0;
  v_net numeric;
  v_reached boolean := false;
  v_status text;
  v_max_payout numeric := 400;
  v_idem text;
BEGIN
  SELECT * INTO v_row FROM public.game_rounds
  WHERE id = p_round_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found'; END IF;

  -- Se já foi liquidada, retorna o estado atual (idempotente)
  IF v_row.round_status <> 'open' THEN
    RETURN QUERY SELECT v_row.id, v_row.round_status::text, v_row.result_multiplier,
                        v_row.payout, v_row.net_result,
                        COALESCE((v_row.client_report->>'reached_target')::boolean, false);
    RETURN;
  END IF;

  v_reached := COALESCE(p_barriers_passed, 0) >= COALESCE(v_row.target_barrier, 0)
               AND COALESCE(v_row.target_barrier, 0) > 0;

  IF v_reached THEN
    v_payout := round((v_row.stake * v_row.result_multiplier)::numeric, 2);
    IF v_payout > v_max_payout THEN v_payout := v_max_payout; END IF;

    SELECT balance INTO v_balance FROM public.wallets
    WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

    v_new_balance := round((v_balance + v_payout)::numeric, 2);
    UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
    WHERE user_id = p_user_id;

    v_idem := COALESCE(v_row.idempotency_key, v_row.id::text) || ':payout';
    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'payout', v_payout, v_new_balance, v_idem,
            jsonb_build_object('round_id', v_row.id, 'reached_target', true));
  END IF;

  v_net := round((v_payout - v_row.stake)::numeric, 2);
  v_status := CASE WHEN p_forced_by_timeout THEN 'expired' ELSE 'closed' END;

  UPDATE public.game_rounds
  SET round_status = v_status,
      ended_at = now(),
      payout = v_payout,
      net_result = v_net,
      client_report = COALESCE(p_client_report, '{}'::jsonb)
                      || jsonb_build_object(
                        'reached_target', v_reached,
                        'barriers_passed', COALESCE(p_barriers_passed, 0),
                        'alive', p_alive
                      )
  WHERE id = p_round_id AND round_status = 'open';

  RETURN QUERY SELECT v_row.id, v_status, v_row.result_multiplier, v_payout, v_net, v_reached;
END;
$function$;