-- ============================================================================
-- M3b — LGPD + ADMIN (refactored to has_role) + MONITORING VIEWS + CRON
-- W1 fix BY DESIGN: admin checks use has_role(uid,'admin'), not profiles.is_admin.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles soft-delete (for LGPD)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- USER_CONSENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('tos', 'privacy_policy', 'age_confirmation')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx
  ON public.user_consents (user_id, accepted_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_consents_select_own" ON public.user_consents;
CREATE POLICY "user_consents_select_own"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- LGPD_DELETION_REQUESTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lgpd_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','completed','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS lgpd_deletion_requests_user_created_idx
  ON public.lgpd_deletion_requests(user_id, requested_at DESC);

ALTER TABLE public.lgpd_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lgpd_deletion_requests_select_own" ON public.lgpd_deletion_requests;
CREATE POLICY "lgpd_deletion_requests_select_own"
  ON public.lgpd_deletion_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- DATA_ACCESS_AUDIT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_access_audit (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_access_audit_target_created_idx
  ON public.data_access_audit(target_user_id, created_at DESC);

ALTER TABLE public.data_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_access_audit_select_own_target" ON public.data_access_audit;
CREATE POLICY "data_access_audit_select_own_target"
  ON public.data_access_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = target_user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_data_access_event(
  p_actor_user_id uuid, p_target_user_id uuid, p_action text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.data_access_audit(actor_user_id, target_user_id, action, context)
  VALUES (p_actor_user_id, p_target_user_id, p_action, COALESCE(p_context, '{}'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_data_access_event(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_data_access_event(uuid, uuid, text, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- ADMIN_ACTION_LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_logs_created_idx
  ON public.admin_action_logs (created_at DESC);

ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_action_logs_select_admin" ON public.admin_action_logs;
CREATE POLICY "admin_action_logs_select_admin"
  ON public.admin_action_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- ADMIN-VISIBILITY policies on operational tables (use has_role, not is_admin)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "wallets_select_admin" ON public.wallets;
CREATE POLICY "wallets_select_admin"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ledger_select_admin" ON public.ledger_entries;
CREATE POLICY "ledger_select_admin"
  ON public.ledger_entries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "game_rounds_select_admin" ON public.game_rounds;
CREATE POLICY "game_rounds_select_admin"
  ON public.game_rounds FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- ADMIN RPCs (refactored: validate role via has_role, not is_admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_admin_id uuid, p_action text, p_target uuid, p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  INSERT INTO public.admin_action_logs (admin_id, action, target_user_id, payload)
  VALUES (p_admin_id, p_action, p_target, COALESCE(p_payload, '{}'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_credit_wallet(
  p_actor uuid, p_target uuid, p_amount numeric, p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_bal numeric; v_new numeric;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  v_new := round((v_bal + p_amount)::numeric, 2);
  IF v_new > 1000000 THEN RAISE EXCEPTION 'balance_cap_exceeded'; END IF;
  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_target;
  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_target, 'adjustment', p_amount, v_new,
          'admin_credit:' || p_actor::text || ':' || gen_random_uuid()::text,
          jsonb_build_object('admin_id', p_actor, 'note', p_note, 'kind', 'admin_credit'));
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_credit_wallet', jsonb_build_object('amount', p_amount, 'note', p_note));
  RETURN v_new;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_credit_wallet(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_wallet(uuid, uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_debit_wallet(
  p_actor uuid, p_target uuid, p_amount numeric, p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_bal numeric; v_new numeric;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_bal < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  v_new := round((v_bal - p_amount)::numeric, 2);
  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE user_id = p_target;
  INSERT INTO public.ledger_entries (user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_target, 'adjustment', p_amount, v_new,
          'admin_debit:' || p_actor::text || ':' || gen_random_uuid()::text,
          jsonb_build_object('admin_id', p_actor, 'note', p_note, 'kind', 'admin_debit'));
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_debit_wallet', jsonb_build_object('amount', p_amount, 'note', p_note));
  RETURN v_new;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_debit_wallet(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_debit_wallet(uuid, uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_kyc(p_actor uuid, p_target uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_status NOT IN ('none', 'pending', 'approved') THEN RAISE EXCEPTION 'invalid_kyc_status'; END IF;
  UPDATE public.profiles SET kyc_status = p_status::public.kyc_status, updated_at = now() WHERE user_id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_set_kyc', jsonb_build_object('kyc_status', p_status));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_kyc(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_age_confirmed(p_actor uuid, p_target uuid, p_confirmed boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles
    SET over_18_confirmed_at = CASE WHEN p_confirmed THEN COALESCE(over_18_confirmed_at, now()) ELSE NULL END,
        updated_at = now()
  WHERE user_id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_set_age_confirmed', jsonb_build_object('confirmed', p_confirmed));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_age_confirmed(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_age_confirmed(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_actor uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_actor = p_target THEN RAISE EXCEPTION 'cannot_ban_self'; END IF;
  IF public.has_role(p_target, 'admin') THEN RAISE EXCEPTION 'cannot_ban_admin'; END IF;
  UPDATE public.profiles SET deleted_at = now(), updated_at = now() WHERE user_id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_ban_user', '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_unban_user(p_actor uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles SET deleted_at = NULL, updated_at = now() WHERE user_id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  PERFORM public.log_data_access_event(p_actor, p_target, 'admin_unban_user', '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(
  p_actor uuid, p_key text, p_enabled boolean, p_rollout smallint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.feature_flags (key, enabled, rollout_percent, rules, updated_at)
  VALUES (p_key, p_enabled, COALESCE(p_rollout, 0)::smallint, '{}'::jsonb, now())
  ON CONFLICT (key) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    rollout_percent = CASE WHEN p_rollout IS NULL THEN public.feature_flags.rollout_percent ELSE EXCLUDED.rollout_percent END,
    updated_at = now();
  PERFORM public.log_data_access_event(p_actor, p_actor, 'admin_set_feature_flag', jsonb_build_object('key', p_key, 'enabled', p_enabled));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(uuid, text, boolean, smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_sandbox_round(
  p_admin_id uuid, p_stake numeric, p_result_mult numeric, p_payout numeric, p_net numeric,
  p_visual jsonb, p_layout_seed text, p_target_barrier int, p_max_duration_seconds int,
  p_layout_signature text, p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(p_admin_id, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_stake < 1 OR p_stake > 50 THEN RAISE EXCEPTION 'invalid_stake'; END IF;
  INSERT INTO public.game_rounds (
    user_id, stake, mode, target_multiplier, result_multiplier, payout, net_result,
    visual_result, layout_seed, target_barrier, max_duration_seconds, layout_signature,
    round_status, idempotency_key, ended_at
  ) VALUES (
    p_admin_id, p_stake, 'sandbox', 20, p_result_mult, p_payout, p_net,
    p_visual, p_layout_seed, p_target_barrier, p_max_duration_seconds, p_layout_signature,
    'closed', p_idempotency_key, now()
  ) RETURNING id INTO v_id;
  PERFORM public.log_data_access_event(p_admin_id, p_admin_id, 'admin_sandbox_round', jsonb_build_object('round_id', v_id, 'mult', p_result_mult));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_sandbox_round(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sandbox_round(uuid, numeric, numeric, numeric, numeric, jsonb, text, int, int, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_sandbox_rounds(p_actor uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.game_rounds WHERE user_id = p_actor AND mode = 'sandbox';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.log_data_access_event(p_actor, p_actor, 'admin_delete_sandbox_rounds', jsonb_build_object('deleted', v_n));
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_sandbox_rounds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_sandbox_rounds(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_actor uuid, p_query text, p_limit int DEFAULT 25
)
RETURNS TABLE (
  user_id uuid, email text, display_name text, kyc_status text,
  is_admin boolean, deleted_at timestamptz, balance numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  RETURN QUERY
  SELECT
    u.id AS user_id,
    COALESCE(u.email, '')::text AS email,
    p.display_name::text,
    p.kyc_status::text,
    public.has_role(u.id, 'admin') AS is_admin,
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
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(uuid, text, int) TO service_role;

-- ----------------------------------------------------------------------------
-- LGPD RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_lgpd_deletion(
  p_user_id uuid, p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.lgpd_deletion_requests(user_id, reason)
  VALUES (p_user_id, p_reason) RETURNING id INTO v_id;
  PERFORM public.log_data_access_event(p_user_id, p_user_id, 'lgpd_deletion_requested',
                                       jsonb_build_object('request_id', v_id));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_lgpd_deletion(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_lgpd_deletion(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.process_lgpd_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_request_id uuid;
BEGIN
  SELECT id INTO v_request_id FROM public.lgpd_deletion_requests
  WHERE user_id = p_user_id AND status IN ('requested', 'processing')
  ORDER BY requested_at DESC LIMIT 1;
  IF v_request_id IS NULL THEN RAISE EXCEPTION 'no_pending_deletion_request'; END IF;

  UPDATE public.lgpd_deletion_requests SET status = 'processing' WHERE id = v_request_id;

  UPDATE public.profiles SET
    display_name = 'Usuário Deletado',
    cpf = NULL, phone = NULL,
    over_18_confirmed_at = NULL, kyc_status = 'none',
    deleted_at = now(), updated_at = now()
  WHERE user_id = p_user_id;

  DELETE FROM public.user_consents WHERE user_id = p_user_id;
  DELETE FROM public.pix_deposits
    WHERE user_id = p_user_id AND status IN ('pending', 'failed', 'expired');
  DELETE FROM public.pix_withdrawals
    WHERE user_id = p_user_id AND status IN ('requested', 'failed', 'reversed');

  UPDATE public.lgpd_deletion_requests
    SET status = 'completed', completed_at = now()
  WHERE id = v_request_id;

  PERFORM public.log_data_access_event(p_user_id, p_user_id, 'lgpd_deletion_executed',
    jsonb_build_object('request_id', v_request_id, 'source', 'process_lgpd_deletion'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_lgpd_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_lgpd_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.auto_process_lgpd_deletions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_id uuid; v_count integer := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT user_id FROM public.lgpd_deletion_requests
    WHERE status = 'requested' AND requested_at <= now() - INTERVAL '15 days'
  LOOP
    BEGIN
      PERFORM public.process_lgpd_deletion(v_user_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_process_lgpd_deletions: user % failed: %', v_user_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.auto_process_lgpd_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_lgpd_deletions() TO service_role;

-- ----------------------------------------------------------------------------
-- MONITORING VIEWS (final versions: exclude sandbox + fraud counters)
-- ----------------------------------------------------------------------------
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
      WHERE round_status = 'open' AND created_at <= now() - interval '5 minutes'
    ) AS open_rounds_over_5min
  FROM public.game_rounds
  WHERE created_at >= now() - interval '1 hour'
    AND mode IS DISTINCT FROM 'sandbox'
),
fraud1h AS (
  SELECT
    count(*) FILTER (WHERE signal = 'syncpay_webhook_duplicate') AS webhook_duplicates_1h,
    count(*) FILTER (WHERE signal = 'rate_limit_exceeded') AS rate_limit_exceeded_1h
  FROM public.fraud_signals
  WHERE created_at >= now() - interval '1 hour'
)
SELECT
  now() AS generated_at,
  CASE
    WHEN total_rounds > 0 AND rejected_rounds::numeric / total_rounds >= 0.01 THEN 'critical_rejected_rate'
    WHEN total_rounds > 0 AND rejected_rounds::numeric / total_rounds > 0.005 THEN 'warn_rejected_rate'
    WHEN total_stake > 0 AND (total_payout / total_stake < 0.837 OR total_payout / total_stake > 0.877) THEN 'critical_rtp_out_of_band'
    WHEN open_rounds_over_5min >= 20 THEN 'critical_open_rounds'
    WHEN open_rounds_over_5min > 5 THEN 'warn_open_rounds'
    WHEN webhook_duplicates_1h >= 30 THEN 'critical_webhook_replay'
    WHEN webhook_duplicates_1h > 10 THEN 'warn_webhook_replay'
    WHEN rate_limit_exceeded_1h >= 40 THEN 'critical_rate_limit_abuse'
    WHEN rate_limit_exceeded_1h > 10 THEN 'warn_rate_limit_abuse'
    ELSE 'ok'
  END AS status,
  total_rounds,
  rejected_rounds,
  open_rounds_over_5min,
  CASE WHEN total_stake > 0 THEN total_payout / total_stake ELSE 0 END AS rtp,
  CASE WHEN total_rounds > 0 THEN rejected_rounds::numeric / total_rounds ELSE 0 END AS rejected_rate,
  webhook_duplicates_1h,
  rate_limit_exceeded_1h
FROM last1h, fraud1h;

-- ----------------------------------------------------------------------------
-- CRON JOBS (best-effort: pg_cron may not be installed in all envs)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('close-stale-open-rounds');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.schedule('close-stale-open-rounds', '*/1 * * * *',
                          $job$SELECT public.close_stale_open_rounds(300);$job$);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM cron.unschedule('auto-process-lgpd-deletions');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.schedule('auto-process-lgpd-deletions', '0 2 * * *',
                          $job$SELECT public.auto_process_lgpd_deletions();$job$);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;