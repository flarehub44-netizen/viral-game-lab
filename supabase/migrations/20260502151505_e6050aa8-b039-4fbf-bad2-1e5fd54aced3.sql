
-- 1. Estende a tabela wallets com campos de bônus
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rollover_required numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_rollover_progress numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_spins_remaining integer NOT NULL DEFAULT 0;

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_bonus_balance_nonneg CHECK (bonus_balance >= 0),
  ADD CONSTRAINT wallets_bonus_rollover_required_nonneg CHECK (bonus_rollover_required >= 0),
  ADD CONSTRAINT wallets_bonus_rollover_progress_nonneg CHECK (bonus_rollover_progress >= 0),
  ADD CONSTRAINT wallets_free_spins_nonneg CHECK (free_spins_remaining >= 0);

-- 2. Tabela bonus_grants (auditoria de cada concessão)
CREATE TABLE IF NOT EXISTS public.bonus_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('welcome', 'mission', 'streak', 'freespin_payout', 'manual')),
  amount numeric NOT NULL CHECK (amount >= 0),
  rollover_multiplier numeric NOT NULL DEFAULT 10 CHECK (rollover_multiplier >= 0),
  rollover_added numeric NOT NULL DEFAULT 0 CHECK (rollover_added >= 0),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bonus_grants_user_idx ON public.bonus_grants(user_id, granted_at DESC);

ALTER TABLE public.bonus_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY bonus_grants_select_own ON public.bonus_grants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3. Tabela welcome_bonus_claims (anti-fraude)
CREATE TABLE IF NOT EXISTS public.welcome_bonus_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  device_fingerprint text,
  ip_hash text,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS welcome_bonus_claims_device_uidx
  ON public.welcome_bonus_claims(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS welcome_bonus_claims_ip_idx
  ON public.welcome_bonus_claims(ip_hash) WHERE ip_hash IS NOT NULL;

ALTER TABLE public.welcome_bonus_claims ENABLE ROW LEVEL SECURITY;
-- Sem leitura pública; só admin
CREATE POLICY welcome_bonus_claims_select_admin ON public.welcome_bonus_claims
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Tabela daily_logins (streak)
CREATE TABLE IF NOT EXISTS public.daily_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  login_date date NOT NULL,
  streak_day smallint NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
  bonus_amount numeric NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, login_date)
);
CREATE INDEX IF NOT EXISTS daily_logins_user_idx ON public.daily_logins(user_id, login_date DESC);

ALTER TABLE public.daily_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_logins_select_own ON public.daily_logins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 5. Tabela daily_missions_claims
CREATE TABLE IF NOT EXISTS public.daily_missions_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mission_seed date NOT NULL,
  mission_id text NOT NULL,
  bonus_amount numeric NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_seed, mission_id)
);
CREATE INDEX IF NOT EXISTS daily_missions_claims_user_idx
  ON public.daily_missions_claims(user_id, mission_seed DESC);

ALTER TABLE public.daily_missions_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_missions_claims_select_own ON public.daily_missions_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 6. Função: conceder bônus atomicamente
CREATE OR REPLACE FUNCTION public.grant_bonus_atomic(
  p_user_id uuid,
  p_amount numeric,
  p_rollover_multiplier numeric,
  p_kind text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bonus numeric;
  v_rollover_add numeric;
  v_grant_id uuid;
  v_balance_after numeric;
BEGIN
  IF p_amount <= 0 OR p_amount > 100 THEN
    RAISE EXCEPTION 'invalid_bonus_amount';
  END IF;
  IF p_rollover_multiplier < 0 OR p_rollover_multiplier > 50 THEN
    RAISE EXCEPTION 'invalid_rollover_multiplier';
  END IF;
  IF p_kind NOT IN ('welcome', 'mission', 'streak', 'freespin_payout', 'manual') THEN
    RAISE EXCEPTION 'invalid_bonus_kind';
  END IF;

  v_rollover_add := round((p_amount * p_rollover_multiplier)::numeric, 2);

  UPDATE public.wallets
     SET bonus_balance = round((bonus_balance + p_amount)::numeric, 2),
         bonus_rollover_required = round((bonus_rollover_required + v_rollover_add)::numeric, 2),
         updated_at = now()
   WHERE user_id = p_user_id
   RETURNING bonus_balance INTO v_new_bonus;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  INSERT INTO public.bonus_grants (user_id, kind, amount, rollover_multiplier, rollover_added, meta)
  VALUES (p_user_id, p_kind, p_amount, p_rollover_multiplier, v_rollover_add, COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO v_grant_id;

  SELECT balance + v_new_bonus INTO v_balance_after FROM public.wallets WHERE user_id = p_user_id;

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'adjustment', p_amount, v_balance_after,
          'bonus_grant:' || v_grant_id::text,
          jsonb_build_object('bonus_grant_id', v_grant_id, 'bonus_kind', p_kind,
                             'rollover_added', v_rollover_add) || COALESCE(p_meta, '{}'::jsonb));

  RETURN v_grant_id;
END;
$$;

-- 7. Função: resgatar login diário (calcula streak)
CREATE OR REPLACE FUNCTION public.claim_daily_login(p_user_id uuid)
RETURNS TABLE(streak_day smallint, bonus_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_yesterday date := v_today - 1;
  v_last_date date;
  v_last_streak smallint;
  v_new_streak smallint;
  v_amount numeric;
  v_amounts numeric[] := ARRAY[0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50];
BEGIN
  IF EXISTS (SELECT 1 FROM public.daily_logins WHERE user_id = p_user_id AND login_date = v_today) THEN
    RAISE EXCEPTION 'already_claimed_today';
  END IF;

  SELECT login_date, dl.streak_day INTO v_last_date, v_last_streak
  FROM public.daily_logins dl
  WHERE user_id = p_user_id
  ORDER BY login_date DESC
  LIMIT 1;

  IF v_last_date IS NULL OR v_last_date < v_yesterday THEN
    v_new_streak := 1;
  ELSIF v_last_date = v_yesterday THEN
    v_new_streak := LEAST(7, v_last_streak + 1);
  ELSE
    -- v_last_date = v_today já tratado acima
    v_new_streak := v_last_streak;
  END IF;

  v_amount := v_amounts[v_new_streak];

  INSERT INTO public.daily_logins (user_id, login_date, streak_day, bonus_amount)
  VALUES (p_user_id, v_today, v_new_streak, v_amount);

  PERFORM public.grant_bonus_atomic(
    p_user_id, v_amount, 10, 'streak',
    jsonb_build_object('streak_day', v_new_streak, 'login_date', v_today)
  );

  streak_day := v_new_streak;
  bonus_amount := v_amount;
  RETURN NEXT;
END;
$$;

-- 8. Substitui start_round_atomic: consome bônus primeiro, depois saldo real
CREATE OR REPLACE FUNCTION public.start_round_atomic(
  p_user_id uuid, p_stake numeric, p_result_mult numeric, p_payout numeric, p_net numeric,
  p_visual jsonb, p_layout_seed text, p_target_barrier integer, p_max_duration_seconds integer,
  p_layout_signature text, p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_bonus numeric;
  v_after_real numeric;
  v_after_bonus numeric;
  v_use_from_bonus numeric := 0;
  v_use_from_real numeric := 0;
  v_round_id uuid;
  v_existing uuid;
  v_open_round uuid;
  v_new_progress numeric;
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

  SELECT balance, bonus_balance INTO v_balance, v_bonus FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF (v_balance + v_bonus) < p_stake THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  -- Consome bônus primeiro
  v_use_from_bonus := LEAST(v_bonus, p_stake);
  v_use_from_real := round((p_stake - v_use_from_bonus)::numeric, 2);
  v_use_from_bonus := round(v_use_from_bonus::numeric, 2);

  v_after_real := round((v_balance - v_use_from_real)::numeric, 2);
  v_after_bonus := round((v_bonus - v_use_from_bonus)::numeric, 2);

  IF v_after_real < 0 OR v_after_bonus < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;

  -- Atualiza progresso de rollover (toda aposta conta 100%)
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

  INSERT INTO public.game_rounds (
    user_id, stake, mode, target_multiplier, result_multiplier, payout, net_result,
    visual_result, layout_seed, target_barrier, max_duration_seconds, layout_signature,
    round_status, idempotency_key, client_report
  ) VALUES (
    p_user_id, p_stake, 'target_20x', 20, p_result_mult, 0, -p_stake,
    p_visual, p_layout_seed, p_target_barrier, p_max_duration_seconds, p_layout_signature,
    'open', p_idempotency_key,
    jsonb_build_object('stake_from_real', v_use_from_real, 'stake_from_bonus', v_use_from_bonus)
  ) RETURNING id INTO v_round_id;

  RETURN v_round_id;
END;
$$;

-- 9. Substitui settle_round_atomic: payout proporcional + conversão pós-rollover
CREATE OR REPLACE FUNCTION public.settle_round_atomic(
  p_user_id uuid, p_round_id uuid, p_barriers_passed integer, p_alive integer,
  p_forced_by_timeout boolean, p_client_report jsonb
)
RETURNS TABLE(round_id uuid, round_status text, result_multiplier numeric,
              payout numeric, net_result numeric, reached_target boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.game_rounds%rowtype;
  v_balance numeric;
  v_bonus numeric;
  v_rollover_req numeric;
  v_rollover_prog numeric;
  v_payout numeric := 0;
  v_payout_real numeric := 0;
  v_payout_bonus numeric := 0;
  v_effective_mult numeric := 0;
  v_net numeric;
  v_reached boolean := false;
  v_status text;
  v_max_payout numeric := 400;
  v_idem text;
  v_barriers integer;
  v_stake_from_bonus numeric := 0;
  v_bonus_ratio numeric := 0;
  v_new_balance numeric;
  v_new_bonus numeric;
  v_converted numeric := 0;
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
  v_reached := v_barriers >= COALESCE(v_row.target_barrier, 0)
               AND COALESCE(v_row.target_barrier, 0) > 0;

  v_effective_mult := public.compute_multiplier_for_barrier(v_barriers);
  v_payout := round((v_row.stake * v_effective_mult)::numeric, 2);
  IF v_payout > v_max_payout THEN v_payout := v_max_payout; END IF;

  -- Razão bônus: payout vai proporcionalmente ao quanto da stake veio do bônus
  v_stake_from_bonus := COALESCE((v_row.client_report->>'stake_from_bonus')::numeric, 0);
  IF v_row.stake > 0 THEN
    v_bonus_ratio := v_stake_from_bonus / v_row.stake;
  END IF;
  v_payout_bonus := round((v_payout * v_bonus_ratio)::numeric, 2);
  v_payout_real := round((v_payout - v_payout_bonus)::numeric, 2);

  IF v_payout > 0 THEN
    SELECT w.balance, w.bonus_balance, w.bonus_rollover_required, w.bonus_rollover_progress
      INTO v_balance, v_bonus, v_rollover_req, v_rollover_prog
    FROM public.wallets w WHERE w.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

    v_new_balance := round((v_balance + v_payout_real)::numeric, 2);
    v_new_bonus := round((v_bonus + v_payout_bonus)::numeric, 2);

    -- Verifica conversão: se rollover atingido E há bônus, converte tudo em saldo real
    IF v_rollover_req > 0 AND v_rollover_prog >= v_rollover_req AND v_new_bonus > 0 THEN
      v_converted := v_new_bonus;
      v_new_balance := round((v_new_balance + v_converted)::numeric, 2);
      v_new_bonus := 0;
      -- Reset dos contadores
      UPDATE public.wallets w
         SET balance = v_new_balance, bonus_balance = 0,
             bonus_rollover_required = 0, bonus_rollover_progress = 0,
             updated_at = now()
       WHERE w.user_id = p_user_id;
    ELSE
      UPDATE public.wallets w
         SET balance = v_new_balance, bonus_balance = v_new_bonus, updated_at = now()
       WHERE w.user_id = p_user_id;
    END IF;

    v_idem := COALESCE(v_row.idempotency_key, v_row.id::text) || ':payout';
    INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
    VALUES (p_user_id, 'payout', v_payout, v_new_balance + v_new_bonus, v_idem,
            jsonb_build_object(
              'round_id', v_row.id, 'reached_target', v_reached,
              'barriers_passed', v_barriers, 'effective_multiplier', v_effective_mult,
              'payout_to_real', v_payout_real, 'payout_to_bonus', v_payout_bonus,
              'bonus_converted_to_real', v_converted
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
                        'reached_target', v_reached, 'barriers_passed', v_barriers,
                        'alive', p_alive, 'effective_multiplier', v_effective_mult,
                        'payout_to_real', v_payout_real, 'payout_to_bonus', v_payout_bonus,
                        'bonus_converted_to_real', v_converted
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
$$;
