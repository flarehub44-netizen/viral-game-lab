-- P1 hardening:
-- 1) make request rate limiting atomic per actor/action key
-- 2) enforce monotonic cashout status transitions (no regressions from final states)

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
BEGIN
  v_key := coalesce(p_user_id::text, '') || '|' || coalesce(p_ip, '') || '|' || coalesce(p_device_fingerprint, '') || '|' || coalesce(p_action, '');

  -- Serialize checks for same actor/action to prevent burst races.
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

  RETURN v_count < greatest(1, p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.guard_request_rate(uuid, text, text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_syncpay_cashout_webhook(
  p_reference_id text,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pix_withdrawals%rowtype;
  v_next_status text;
BEGIN
  SELECT * INTO v_row
  FROM public.pix_withdrawals
  WHERE provider_ref = p_reference_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal_not_found';
  END IF;

  IF p_status IN ('completed', 'paid') THEN
    v_next_status := 'paid';
  ELSIF p_status IN ('failed', 'reversed', 'refunded') THEN
    v_next_status := 'failed';
  ELSE
    v_next_status := 'processing';
  END IF;

  -- Final states are immutable: ignore late/out-of-order regressions.
  IF v_row.status IN ('paid', 'failed') THEN
    IF v_row.status <> v_next_status THEN
      UPDATE public.pix_withdrawals
        SET webhook_payload = coalesce(p_payload, '{}'::jsonb)
      WHERE id = v_row.id;
    END IF;
    RETURN v_row.id;
  END IF;

  UPDATE public.pix_withdrawals
    SET status = v_next_status,
        processed_at = CASE WHEN v_next_status IN ('paid', 'failed') THEN now() ELSE processed_at END,
        webhook_payload = coalesce(p_payload, '{}'::jsonb)
  WHERE id = v_row.id;

  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_syncpay_cashout_webhook(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_syncpay_cashout_webhook(text, text, jsonb) TO service_role;
