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
  SELECT * INTO v_row FROM public.game_rounds gr
  WHERE gr.id = p_round_id AND gr.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'round_not_found'; END IF;

  IF v_row.round_status <> 'open' THEN
    round_id := v_row.id;
    round_status := v_row.round_status::text;
    result_multiplier := v_row.result_multiplier;
    payout := v_row.payout;
    net_result := v_row.net_result;
    reached_target := COALESCE((v_row.client_report->>'reached_target')::boolean, false);
    RETURN NEXT;
    RETURN;
  END IF;

  v_reached := COALESCE(p_barriers_passed, 0) >= COALESCE(v_row.target_barrier, 0)
               AND COALESCE(v_row.target_barrier, 0) > 0;

  IF v_reached THEN
    v_payout := round((v_row.stake * v_row.result_multiplier)::numeric, 2);
    IF v_payout > v_max_payout THEN v_payout := v_max_payout; END IF;

    SELECT w.balance INTO v_balance FROM public.wallets w
    WHERE w.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

    v_new_balance := round((v_balance + v_payout)::numeric, 2);
    UPDATE public.wallets w SET balance = v_new_balance, updated_at = now()
    WHERE w.user_id = p_user_id;

    v_idem := COALESCE(v_row.idempotency_key, v_row.id::text) || ':payout';
    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'payout', v_payout, v_new_balance, v_idem,
            jsonb_build_object('round_id', v_row.id, 'reached_target', true));
  END IF;

  v_net := round((v_payout - v_row.stake)::numeric, 2);
  v_status := CASE WHEN p_forced_by_timeout THEN 'expired' ELSE 'closed' END;

  UPDATE public.game_rounds gr
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
  WHERE gr.id = p_round_id AND gr.round_status = 'open';

  round_id := v_row.id;
  round_status := v_status;
  result_multiplier := v_row.result_multiplier;
  payout := v_payout;
  net_result := v_net;
  reached_target := v_reached;
  RETURN NEXT;
END;
$function$;