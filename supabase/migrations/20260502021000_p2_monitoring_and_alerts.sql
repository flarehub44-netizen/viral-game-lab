-- P2 hardening:
-- 1) add fraud signal logging on repeated rate-limit violations
-- 2) extend monitor alerts with replay/retry anomaly counters

CREATE OR REPLACE FUNCTION public.guard_request_rate(
  p_user_id uuid,
  p_action text,
  p_ip text,
  p_device_fingerprint text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_key text;
  v_allowed boolean;
BEGIN
  v_key := coalesce(p_user_id::text, '') || '|' || coalesce(p_ip, '') || '|' || coalesce(p_device_fingerprint, '') || '|' || coalesce(p_action, '');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));

  SELECT count(*)
    INTO v_count
  FROM public.api_request_logs
  WHERE action = p_action
    AND created_at >= now() - (interval '1 second' * greatest(1, p_window_seconds))
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_ip IS NOT NULL AND ip = p_ip)
      OR (p_device_fingerprint IS NOT NULL AND device_fingerprint = p_device_fingerprint)
    );

  INSERT INTO public.api_request_logs (user_id, ip, device_fingerprint, action)
  VALUES (p_user_id, p_ip, p_device_fingerprint, p_action);

  v_allowed := v_count < greatest(1, p_limit);
  IF NOT v_allowed AND p_user_id IS NOT NULL THEN
    PERFORM public.log_fraud_signal(
      p_user_id,
      NULL,
      'rate_limit_exceeded',
      3,
      jsonb_build_object('action', p_action, 'ip', p_ip, 'device', p_device_fingerprint)
    );
  END IF;

  RETURN v_allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) TO service_role;

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
