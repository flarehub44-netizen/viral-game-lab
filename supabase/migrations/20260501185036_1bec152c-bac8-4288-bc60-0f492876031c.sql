-- ============================================================================
-- M2 — ECONOMY (game_rounds, ledger, fraud, rate-limit, feature flags, scores upgrade)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LEDGER (immutable financial log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('stake', 'payout', 'deposit', 'withdraw', 'adjustment')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  balance_after numeric(12,2) NOT NULL CHECK (balance_after >= 0),
  idempotency_key text UNIQUE,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_user_created_idx
  ON public.ledger_entries (user_id, created_at DESC);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger_select_own" ON public.ledger_entries;
CREATE POLICY "ledger_select_own"
  ON public.ledger_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies → service_role only.

-- ----------------------------------------------------------------------------
-- GAME_ROUNDS (with full climb-live contract from day 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake numeric(12,2) NOT NULL CHECK (stake >= 1 AND stake <= 50),
  mode text NOT NULL DEFAULT 'target_20x',
  target_multiplier numeric(12,4) NOT NULL DEFAULT 20,
  result_multiplier numeric(12,4) NOT NULL CHECK (result_multiplier >= 0 AND result_multiplier <= 20),
  payout numeric(12,2) NOT NULL CHECK (payout >= 0),
  net_result numeric(12,2) NOT NULL,
  visual_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout_seed text NOT NULL,
  target_barrier int NOT NULL CHECK (target_barrier >= 1),
  max_duration_seconds int NOT NULL CHECK (max_duration_seconds BETWEEN 5 AND 600),
  layout_signature text NOT NULL,
  round_status text NOT NULL DEFAULT 'open'
    CHECK (round_status IN ('open','closed','expired','rejected')),
  ended_at timestamptz,
  client_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_rounds_user_created_idx
  ON public.game_rounds (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_rounds_status_created_idx
  ON public.game_rounds (round_status, created_at);
CREATE INDEX IF NOT EXISTS game_rounds_layout_signature_idx
  ON public.game_rounds (layout_signature);
CREATE INDEX IF NOT EXISTS game_rounds_id_status_idx
  ON public.game_rounds (id, round_status);

-- Single open round per user
CREATE UNIQUE INDEX IF NOT EXISTS game_rounds_single_open_per_user_idx
  ON public.game_rounds (user_id) WHERE round_status = 'open';

ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_rounds_select_own" ON public.game_rounds;
CREATE POLICY "game_rounds_select_own"
  ON public.game_rounds FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies → service_role only.

-- ----------------------------------------------------------------------------
-- start_round_atomic (full v2 with climb-live params)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_round_atomic(
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
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_new numeric;
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

  v_new := round((v_balance - p_stake + p_payout)::numeric, 2);
  IF v_new < 0 THEN RAISE EXCEPTION 'negative_balance'; END IF;

  UPDATE public.wallets SET balance = v_new, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'stake', p_stake, round((v_balance - p_stake)::numeric, 2),
          p_idempotency_key || ':stake', '{}'::jsonb);

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'payout', p_payout, v_new,
          p_idempotency_key || ':payout', '{}'::jsonb);

  INSERT INTO public.game_rounds (
    user_id, stake, mode, target_multiplier, result_multiplier, payout, net_result,
    visual_result, layout_seed, target_barrier, max_duration_seconds, layout_signature,
    round_status, idempotency_key
  ) VALUES (
    p_user_id, p_stake, 'target_20x', 20, p_result_mult, p_payout, p_net,
    p_visual, p_layout_seed, p_target_barrier, p_max_duration_seconds, p_layout_signature,
    'open', p_idempotency_key
  ) RETURNING id INTO v_round_id;

  RETURN v_round_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- FRAUD_SIGNALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.game_rounds(id) ON DELETE SET NULL,
  signal text NOT NULL,
  score smallint NOT NULL DEFAULT 1 CHECK (score >= 1 AND score <= 100),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_signals_user_created_idx
  ON public.fraud_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_signals_signal_created_idx
  ON public.fraud_signals (signal, created_at DESC);

ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_signals_select_own" ON public.fraud_signals;
CREATE POLICY "fraud_signals_select_own"
  ON public.fraud_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_fraud_signal(
  p_user_id uuid,
  p_round_id uuid,
  p_signal text,
  p_score smallint DEFAULT 5,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fraud_signals(user_id, round_id, signal, score, payload)
  VALUES (p_user_id, p_round_id, p_signal, p_score, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_fraud_signal(uuid, uuid, text, smallint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_fraud_signal(uuid, uuid, text, smallint, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- API_REQUEST_LOGS + guard_request_rate (atomic version with advisory lock)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip text,
  device_fingerprint text,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_request_logs_action_created_idx
  ON public.api_request_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS api_request_logs_user_action_created_idx
  ON public.api_request_logs (user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS api_request_logs_ip_action_created_idx
  ON public.api_request_logs (ip, action, created_at DESC);

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_request_logs_select_own" ON public.api_request_logs;
CREATE POLICY "api_request_logs_select_own"
  ON public.api_request_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_request_rate(
  p_user_id uuid,
  p_action text,
  p_ip text,
  p_device_fingerprint text,
  p_limit integer DEFAULT 20,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_key text;
BEGIN
  v_key := COALESCE(p_user_id::text, '') || '|' || COALESCE(p_ip, '') || '|' || COALESCE(p_device_fingerprint, '') || '|' || COALESCE(p_action, '');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));

  SELECT count(*) INTO v_count
  FROM public.api_request_logs
  WHERE action = p_action
    AND created_at >= now() - (interval '1 second' * GREATEST(1, p_window_seconds))
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_ip IS NOT NULL AND ip = p_ip)
      OR (p_device_fingerprint IS NOT NULL AND device_fingerprint = p_device_fingerprint)
    );

  INSERT INTO public.api_request_logs (user_id, ip, device_fingerprint, action)
  VALUES (p_user_id, p_ip, p_device_fingerprint, p_action);

  RETURN v_count < GREATEST(1, p_limit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) TO service_role;

-- ----------------------------------------------------------------------------
-- close_stale_open_rounds (cron will be set up in M3 if pg_cron available)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_stale_open_rounds(p_grace_seconds integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.game_rounds
       SET round_status = 'expired',
           ended_at = now(),
           client_report = COALESCE(client_report, '{}'::jsonb) || jsonb_build_object(
             'reason', 'cron_timeout', 'grace_seconds', p_grace_seconds
           )
     WHERE round_status = 'open'
       AND created_at <= now() - (interval '1 second' * GREATEST(60, p_grace_seconds))
     RETURNING id, user_id
  )
  SELECT count(*) INTO v_count FROM upd;

  INSERT INTO public.fraud_signals(user_id, round_id, signal, score, payload)
  SELECT user_id, id, 'open_round_timeout', 3, jsonb_build_object('source', 'close_stale_open_rounds')
  FROM (
    SELECT id, user_id FROM public.game_rounds
    WHERE round_status = 'expired'
      AND ended_at >= now() - interval '10 seconds'
  ) t;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_stale_open_rounds(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_open_rounds(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- FEATURE_FLAGS (public read; admin write only via service_role)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percent smallint NOT NULL DEFAULT 0 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_select_all" ON public.feature_flags;
CREATE POLICY "feature_flags_select_all"
  ON public.feature_flags FOR SELECT
  TO anon, authenticated
  USING (true);
-- No write policies → service_role only.

-- ----------------------------------------------------------------------------
-- SCORES upgrade: link to user + round (anti-fabrication)
-- ----------------------------------------------------------------------------
ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.game_rounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scores_user_id_idx ON public.scores (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scores_round_id_idx ON public.scores (round_id);

CREATE UNIQUE INDEX IF NOT EXISTS scores_round_id_unique_idx
  ON public.scores (round_id) WHERE round_id IS NOT NULL;