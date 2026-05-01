-- Painel admin: is_admin, RLS, audit log, RPCs privilegiados, views excluem sandbox.

-- ---------------------------------------------------------------------------
-- 1. Coluna is_admin
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Função is_admin (SECURITY DEFINER — não sofre RLS recursivo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.user_id = p_uid LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Audit log (leitura só admin; escrita via service_role nas RPCs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_idx
  ON public.admin_action_logs (created_at DESC);

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_action_logs_select_admin" ON public.admin_action_logs;
CREATE POLICY "admin_action_logs_select_admin"
  ON public.admin_action_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

REVOKE ALL ON public.admin_action_logs FROM public;
GRANT SELECT ON public.admin_action_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS: admins podem SELECT em tabelas operacionais
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "wallets_select_admin" ON public.wallets;
CREATE POLICY "wallets_select_admin"
  ON public.wallets FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ledger_select_admin" ON public.ledger_entries;
CREATE POLICY "ledger_select_admin"
  ON public.ledger_entries FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "game_rounds_select_admin" ON public.game_rounds;
CREATE POLICY "game_rounds_select_admin"
  ON public.game_rounds FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "pix_deposits_select_admin" ON public.pix_deposits;
CREATE POLICY "pix_deposits_select_admin"
  ON public.pix_deposits FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "pix_withdrawals_select_admin" ON public.pix_withdrawals;
CREATE POLICY "pix_withdrawals_select_admin"
  ON public.pix_withdrawals FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "fraud_signals_select_admin" ON public.fraud_signals;
CREATE POLICY "fraud_signals_select_admin"
  ON public.fraud_signals FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Views de monitoramento: excluir rodadas sandbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_round_health AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  count(*) AS total_rounds,
  count(*) FILTER (WHERE round_status = 'closed') AS closed_rounds,
  count(*) FILTER (WHERE round_status = 'expired') AS expired_rounds,
  count(*) FILTER (WHERE round_status = 'rejected') AS rejected_rounds
FROM public.game_rounds
WHERE mode IS DISTINCT FROM 'sandbox'
GROUP BY 1;

CREATE OR REPLACE VIEW public.v_rtp_live AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  sum(stake) AS total_stake,
  sum(payout) AS total_payout,
  CASE WHEN sum(stake) > 0 THEN sum(payout) / sum(stake) ELSE 0 END AS rtp
FROM public.game_rounds
WHERE mode IS DISTINCT FROM 'sandbox'
GROUP BY 1;

CREATE OR REPLACE VIEW public.v_monitor_alerts AS
WITH last1h AS (
  SELECT
    count(*) AS total_rounds,
    count(*) FILTER (WHERE round_status = 'rejected') AS rejected_rounds,
    sum(stake) AS total_stake,
    sum(payout) AS total_payout,
    count(*) FILTER (
      WHERE round_status = 'open'
        AND created_at <= now() - interval '5 minutes'
    ) AS open_rounds_over_5min
  FROM public.game_rounds
  WHERE created_at >= now() - interval '1 hour'
    AND mode IS DISTINCT FROM 'sandbox'
)
SELECT
  now() AS generated_at,
  CASE
    WHEN total_rounds > 0 AND rejected_rounds::numeric / total_rounds >= 0.01 THEN 'critical_rejected_rate'
    WHEN total_rounds > 0 AND rejected_rounds::numeric / total_rounds > 0.005 THEN 'warn_rejected_rate'
    WHEN total_stake > 0 AND (total_payout / total_stake < 0.837 OR total_payout / total_stake > 0.877) THEN 'critical_rtp_out_of_band'
    WHEN open_rounds_over_5min >= 20 THEN 'critical_open_rounds'
    WHEN open_rounds_over_5min > 5 THEN 'warn_open_rounds'
    ELSE 'ok'
  END AS status,
  total_rounds,
  rejected_rounds,
  open_rounds_over_5min,
  CASE WHEN total_stake > 0 THEN total_payout / total_stake ELSE 0 END AS rtp,
  CASE WHEN total_rounds > 0 THEN rejected_rounds::numeric / total_rounds ELSE 0 END AS rejected_rate
FROM last1h;

-- ---------------------------------------------------------------------------
-- 6. RPCs admin (somente service_role — Edge Function chama com service key)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_admin_id uuid,
  p_action text,
  p_target uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  INSERT INTO public.admin_action_logs (admin_id, action, target_user_id, payload)
  VALUES (p_admin_id, p_action, p_target, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_credit_wallet(
  p_actor uuid,
  p_target uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal numeric;
  v_new numeric;
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  v_new := round((v_bal + p_amount)::numeric, 2);
  IF v_new > 1000000 THEN
    RAISE EXCEPTION 'balance_cap_exceeded';
  END IF;

  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_target;

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (
    p_target,
    'adjustment',
    p_amount,
    v_new,
    'admin_credit:' || p_actor::text || ':' || gen_random_uuid()::text,
    jsonb_build_object('admin_id', p_actor, 'note', p_note, 'kind', 'admin_credit')
  );

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_credit_wallet', jsonb_build_object('amount', p_amount, 'note', p_note));
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_credit_wallet(uuid, uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_credit_wallet(uuid, uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_debit_wallet(
  p_actor uuid,
  p_target uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal numeric;
  v_new numeric;
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  v_new := round((v_bal - p_amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_target;

  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (
    p_target,
    'adjustment',
    p_amount,
    v_new,
    'admin_debit:' || p_actor::text || ':' || gen_random_uuid()::text,
    jsonb_build_object('admin_id', p_actor, 'note', p_note, 'kind', 'admin_debit')
  );

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_debit_wallet', jsonb_build_object('amount', p_amount, 'note', p_note));
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_debit_wallet(uuid, uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_debit_wallet(uuid, uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_kyc(
  p_actor uuid,
  p_target uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_status NOT IN ('none', 'pending', 'approved') THEN
    RAISE EXCEPTION 'invalid_kyc_status';
  END IF;

  UPDATE public.profiles
  SET kyc_status = p_status::public.kyc_status, updated_at = now()
  WHERE user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_set_kyc', jsonb_build_object('kyc_status', p_status));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_kyc(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_age_confirmed(
  p_actor uuid,
  p_target uuid,
  p_confirmed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.profiles
  SET over_18_confirmed_at = CASE WHEN p_confirmed THEN COALESCE(over_18_confirmed_at, now()) ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_set_age_confirmed', jsonb_build_object('confirmed', p_confirmed));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_age_confirmed(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_age_confirmed(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_actor uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_actor = p_target THEN
    RAISE EXCEPTION 'cannot_ban_self';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_target AND is_admin = true) THEN
    RAISE EXCEPTION 'cannot_ban_admin';
  END IF;

  UPDATE public.profiles SET deleted_at = now(), updated_at = now() WHERE user_id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_ban_user', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_unban_user(p_actor uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.profiles SET deleted_at = NULL, updated_at = now() WHERE user_id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_unban_user', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unban_user(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(
  p_actor uuid,
  p_key text,
  p_enabled boolean,
  p_rollout smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  INSERT INTO public.feature_flags (key, enabled, rollout_percent, rules, updated_at)
  VALUES (
    p_key,
    p_enabled,
    COALESCE(p_rollout, 0)::smallint,
    '{}'::jsonb,
    now()
  )
  ON CONFLICT (key) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    rollout_percent = CASE
      WHEN p_rollout IS NULL THEN public.feature_flags.rollout_percent
      ELSE EXCLUDED.rollout_percent
    END,
    updated_at = now();

  PERFORM public.log_data_access_event(p_actor, p_actor, 'admin_set_feature_flag', jsonb_build_object('key', p_key, 'enabled', p_enabled));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_sandbox_round(
  p_admin_id uuid,
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
  v_id uuid;
BEGIN
  IF NOT public.is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF p_stake < 1 OR p_stake > 50 THEN
    RAISE EXCEPTION 'invalid_stake';
  END IF;

  INSERT INTO public.game_rounds (
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
    idempotency_key,
    ended_at
  )
  VALUES (
    p_admin_id,
    p_stake,
    'sandbox',
    20,
    p_result_mult,
    p_payout,
    p_net,
    p_visual,
    p_layout_seed,
    p_target_barrier,
    p_max_duration_seconds,
    p_layout_signature,
    'closed',
    p_idempotency_key,
    now()
  )
  RETURNING id INTO v_id;

  PERFORM public.log_data_access_event(p_admin_id, p_admin_id, 'admin_sandbox_round', jsonb_build_object('round_id', v_id, 'mult', p_result_mult));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sandbox_round(
  uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text
) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_sandbox_round(
  uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_sandbox_rounds(p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  DELETE FROM public.game_rounds
  WHERE user_id = p_actor AND mode = 'sandbox';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_data_access_event(p_actor, p_actor, 'admin_delete_sandbox_rounds', jsonb_build_object('deleted', v_n));
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_sandbox_rounds(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_sandbox_rounds(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_actor uuid,
  p_query text,
  p_limit int DEFAULT 25
)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  kyc_status text,
  is_admin boolean,
  deleted_at timestamptz,
  balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin(p_actor) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    COALESCE(u.email, '')::text AS email,
    p.display_name::text,
    p.kyc_status::text,
    p.is_admin,
    p.deleted_at,
    w.balance
  FROM auth.users u
  INNER JOIN public.profiles p ON p.user_id = u.id
  INNER JOIN public.wallets w ON w.user_id = u.id
  WHERE
    (p_query IS NULL OR length(trim(p_query)) = 0)
    OR u.email ILIKE '%' || trim(p_query) || '%'
    OR p.display_name ILIKE '%' || trim(p_query) || '%'
    OR u.id::text = trim(p_query)
  ORDER BY u.created_at DESC
  LIMIT greatest(1, least(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_users(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_search_users(uuid, text, int) TO service_role;
