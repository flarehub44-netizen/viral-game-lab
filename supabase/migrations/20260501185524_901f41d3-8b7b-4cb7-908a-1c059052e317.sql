-- Fix: views must use security_invoker so RLS of caller applies, not creator's.
DROP VIEW IF EXISTS public.v_round_health CASCADE;
DROP VIEW IF EXISTS public.v_rtp_live CASCADE;
DROP VIEW IF EXISTS public.v_monitor_alerts CASCADE;

CREATE VIEW public.v_round_health
WITH (security_invoker=on) AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  count(*) AS total_rounds,
  count(*) FILTER (WHERE round_status = 'closed') AS closed_rounds,
  count(*) FILTER (WHERE round_status = 'expired') AS expired_rounds,
  count(*) FILTER (WHERE round_status = 'rejected') AS rejected_rounds
FROM public.game_rounds
WHERE mode IS DISTINCT FROM 'sandbox'
GROUP BY 1;

CREATE VIEW public.v_rtp_live
WITH (security_invoker=on) AS
SELECT
  date_trunc('hour', created_at) AS bucket_hour,
  sum(stake) AS total_stake,
  sum(payout) AS total_payout,
  CASE WHEN sum(stake) > 0 THEN sum(payout) / sum(stake) ELSE 0 END AS rtp
FROM public.game_rounds
WHERE mode IS DISTINCT FROM 'sandbox'
GROUP BY 1;

CREATE VIEW public.v_monitor_alerts
WITH (security_invoker=on) AS
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
  total_rounds, rejected_rounds, open_rounds_over_5min,
  CASE WHEN total_stake > 0 THEN total_payout / total_stake ELSE 0 END AS rtp,
  CASE WHEN total_rounds > 0 THEN rejected_rounds::numeric / total_rounds ELSE 0 END AS rejected_rate,
  webhook_duplicates_1h, rate_limit_exceeded_1h
FROM last1h, fraud1h;

-- Grant SELECT to authenticated; RLS on base tables (game_rounds/fraud_signals)
-- already restricts non-admins to their own rows. Admins see everything via has_role.
GRANT SELECT ON public.v_round_health, public.v_rtp_live, public.v_monitor_alerts TO authenticated;