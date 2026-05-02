-- Adiciona coluna de auditoria
ALTER TABLE public.game_rounds
  ADD COLUMN IF NOT EXISTS barriers_passed_actual integer;

-- Função pública: curva m(b) por interpolação linear nas âncoras.
-- Mantida em sincronia com src/game/economy/multiplierCurve.ts e
-- supabase/functions/_shared/multiplierCurve.ts.
CREATE OR REPLACE FUNCTION public.compute_multiplier_for_barrier(p_barriers integer)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  anchors numeric[][] := ARRAY[
    ARRAY[0::numeric, 0::numeric],
    ARRAY[1::numeric, 0::numeric],
    ARRAY[3::numeric, 0.5::numeric],
    ARRAY[5::numeric, 0.8::numeric],
    ARRAY[7::numeric, 1.0::numeric],
    ARRAY[9::numeric, 1.2::numeric],
    ARRAY[11::numeric, 1.5::numeric],
    ARRAY[13::numeric, 2.0::numeric],
    ARRAY[15::numeric, 3.0::numeric],
    ARRAY[17::numeric, 5.0::numeric],
    ARRAY[19::numeric, 10.0::numeric],
    ARRAY[20::numeric, 20.0::numeric]
  ];
  hard_cap numeric := 20;
  b numeric;
  i int;
  x0 numeric; y0 numeric; x1 numeric; y1 numeric; t numeric; y numeric;
BEGIN
  IF p_barriers IS NULL OR p_barriers <= 0 THEN
    RETURN 0;
  END IF;
  b := p_barriers::numeric;
  IF b >= anchors[array_length(anchors, 1)][1] THEN
    RETURN hard_cap;
  END IF;
  FOR i IN 1..(array_length(anchors, 1) - 1) LOOP
    x0 := anchors[i][1];
    y0 := anchors[i][2];
    x1 := anchors[i+1][1];
    y1 := anchors[i+1][2];
    IF b >= x0 AND b <= x1 THEN
      IF x1 = x0 THEN
        RETURN LEAST(hard_cap, y1);
      END IF;
      t := (b - x0) / (x1 - x0);
      y := y0 + (y1 - y0) * t;
      RETURN LEAST(hard_cap, GREATEST(0, round(y, 2)));
    END IF;
  END LOOP;
  RETURN 0;
END;
$$;

-- settle_round_atomic v2: payout = stake × m(barriers_passed) — sempre.
-- Mantém a mesma assinatura para não quebrar a edge function.
-- `reached_target` agora é só telemetria (true se passou do alvo do tier).
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
  v_effective_mult numeric := 0;
  v_net numeric;
  v_reached boolean := false;
  v_status text;
  v_max_payout numeric := 400;
  v_idem text;
  v_barriers integer;
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

  v_barriers := GREATEST(0, COALESCE(p_barriers_passed, 0));

  -- Telemetria: passou do alvo do tier?
  v_reached := v_barriers >= COALESCE(v_row.target_barrier, 0)
               AND COALESCE(v_row.target_barrier, 0) > 0;

  -- Multiplicador efetivo vem da CURVA, não do tier.
  v_effective_mult := public.compute_multiplier_for_barrier(v_barriers);
  v_payout := round((v_row.stake * v_effective_mult)::numeric, 2);
  IF v_payout > v_max_payout THEN v_payout := v_max_payout; END IF;

  IF v_payout > 0 THEN
    SELECT w.balance INTO v_balance FROM public.wallets w
    WHERE w.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

    v_new_balance := round((v_balance + v_payout)::numeric, 2);
    UPDATE public.wallets w SET balance = v_new_balance, updated_at = now()
    WHERE w.user_id = p_user_id;

    v_idem := COALESCE(v_row.idempotency_key, v_row.id::text) || ':payout';
    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'payout', v_payout, v_new_balance, v_idem,
            jsonb_build_object(
              'round_id', v_row.id,
              'reached_target', v_reached,
              'barriers_passed', v_barriers,
              'effective_multiplier', v_effective_mult,
              'tier_multiplier', v_row.result_multiplier
            ))
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  v_net := round((v_payout - v_row.stake)::numeric, 2);
  v_status := CASE WHEN p_forced_by_timeout THEN 'expired' ELSE 'closed' END;

  UPDATE public.game_rounds gr
  SET round_status = v_status,
      ended_at = now(),
      payout = v_payout,
      net_result = v_net,
      result_multiplier = v_effective_mult,
      barriers_passed_actual = v_barriers,
      client_report = COALESCE(p_client_report, '{}'::jsonb)
                      || jsonb_build_object(
                        'reached_target', v_reached,
                        'barriers_passed', v_barriers,
                        'alive', p_alive,
                        'tier_multiplier', v_row.result_multiplier,
                        'effective_multiplier', v_effective_mult
                      )
  WHERE gr.id = p_round_id AND gr.round_status = 'open';

  round_id := v_row.id;
  round_status := v_status;
  result_multiplier := v_effective_mult;
  payout := v_payout;
  net_result := v_net;
  reached_target := v_reached;
  RETURN NEXT;
END;
$function$;