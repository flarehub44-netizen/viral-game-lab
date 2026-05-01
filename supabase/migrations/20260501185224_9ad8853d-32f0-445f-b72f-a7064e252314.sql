-- ============================================================================
-- M3a — PIX (deposits + withdrawals + webhook_events)
-- DB-first flow: row created BEFORE calling payment provider.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PIX_DEPOSITS (provider_ref nullable while pending)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pix_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_ref text UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  qr_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','failed','expired')),
  webhook_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pix_deposits_user_created_idx
  ON public.pix_deposits (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pix_deposits_idempotency_key_idx
  ON public.pix_deposits (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.pix_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_deposits_select_own" ON public.pix_deposits;
CREATE POLICY "pix_deposits_select_own"
  ON public.pix_deposits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- PIX_WITHDRAWALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pix_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  pix_key text NOT NULL,
  pix_key_type text NOT NULL CHECK (pix_key_type IN ('cpf','email','phone','evp')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','paid','failed','reversed')),
  provider_ref text UNIQUE,
  processed_at timestamptz,
  webhook_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pix_withdrawals_user_created_idx
  ON public.pix_withdrawals (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pix_withdrawals_idempotency_key_idx
  ON public.pix_withdrawals (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.pix_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_withdrawals_select_own" ON public.pix_withdrawals;
CREATE POLICY "pix_withdrawals_select_own"
  ON public.pix_withdrawals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- WEBHOOK_EVENTS (forensic anti-replay log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ip text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id, event_type, status)
);

CREATE INDEX IF NOT EXISTS webhook_events_provider_processed_idx
  ON public.webhook_events(provider, processed_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No SELECT for any role — only service_role bypasses RLS.
DROP POLICY IF EXISTS "webhook_events_no_read" ON public.webhook_events;
CREATE POLICY "webhook_events_no_read"
  ON public.webhook_events FOR SELECT
  USING (false);

-- ----------------------------------------------------------------------------
-- DEPOSIT RPCs (DB-first flow)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pix_deposit_pending(
  p_user_id uuid,
  p_amount numeric,
  p_expires_at timestamptz,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.pix_deposits
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.pix_deposits(user_id, provider_ref, amount, qr_code, expires_at, status, idempotency_key)
  VALUES (p_user_id, NULL, p_amount, '', p_expires_at, 'pending', p_idempotency_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_pix_deposit_pending(
  p_deposit_id uuid, p_provider_ref text, p_qr_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_deposits
    SET provider_ref = p_provider_ref, qr_code = p_qr_code
  WHERE id = p_deposit_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found_or_not_pending'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_pix_deposit_pending(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pix_deposit_pending(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_pix_deposit_pending(p_deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_deposits SET status = 'failed'
  WHERE id = p_deposit_id AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_pix_deposit_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pix_deposit_pending(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_pix_deposit(
  p_provider_ref text, p_amount numeric, p_webhook_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep public.pix_deposits%rowtype;
  v_balance numeric;
BEGIN
  SELECT * INTO v_dep FROM public.pix_deposits
  WHERE provider_ref = p_provider_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF v_dep.status = 'confirmed' THEN RETURN v_dep.id; END IF;
  IF v_dep.status <> 'pending' THEN RAISE EXCEPTION 'invalid_deposit_state'; END IF;
  IF round(p_amount::numeric, 2) <> round(v_dep.amount::numeric, 2) THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  v_balance := round((v_balance + v_dep.amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_balance, updated_at = now()
  WHERE user_id = v_dep.user_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (v_dep.user_id, 'deposit', v_dep.amount, v_balance,
          'pix_deposit:' || v_dep.provider_ref,
          jsonb_build_object('pix_deposit_id', v_dep.id));

  UPDATE public.pix_deposits
    SET status = 'confirmed', confirmed_at = now(),
        webhook_payload = COALESCE(p_webhook_payload, '{}'::jsonb)
  WHERE id = v_dep.id;

  RETURN v_dep.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_pix_deposit(text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pix_deposit(text, numeric, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- WITHDRAWAL RPCs (with idempotency from p0_security_hardening)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_pix_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_pix_key text,
  p_pix_key_type text,
  p_provider_ref text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_withdraw_id uuid;
  v_existing uuid;
BEGIN
  IF p_amount < 5 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'withdraw_amount_out_of_bounds';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.pix_withdrawals
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new_balance := round((v_balance - p_amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.pix_withdrawals(user_id, amount, pix_key, pix_key_type, provider_ref, idempotency_key)
  VALUES (p_user_id, p_amount, p_pix_key, p_pix_key_type, p_provider_ref, p_idempotency_key)
  RETURNING id INTO v_withdraw_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'withdraw', p_amount, v_new_balance,
          'pix_withdraw:' || v_withdraw_id::text,
          jsonb_build_object('pix_withdrawal_id', v_withdraw_id, 'provider_ref', p_provider_ref));

  RETURN v_withdraw_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_pix_withdrawal(
  p_withdrawal_id uuid, p_provider_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_withdrawals SET provider_ref = p_provider_ref
  WHERE id = p_withdrawal_id AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found_or_already_processed'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_pix_withdrawal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_pix_withdrawal(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_pix_withdrawal(p_withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pix_withdrawals%rowtype;
  v_balance numeric;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_row FROM public.pix_withdrawals
  WHERE id = p_withdrawal_id AND status = 'requested' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found_or_already_processed'; END IF;

  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = v_row.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  v_new_balance := round((v_balance + v_row.amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
  WHERE user_id = v_row.user_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (v_row.user_id, 'adjustment', v_row.amount, v_new_balance,
          'pix_withdraw_reversal:' || p_withdrawal_id::text,
          jsonb_build_object('pix_withdrawal_id', p_withdrawal_id, 'reason', 'syncpay_call_failed'));

  UPDATE public.pix_withdrawals
    SET status = 'failed', processed_at = now()
  WHERE id = p_withdrawal_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_pix_withdrawal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_pix_withdrawal(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- WEBHOOK RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_syncpay_cashout_webhook(
  p_reference_id text, p_status text, p_payload jsonb DEFAULT '{}'::jsonb
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
  SELECT * INTO v_row FROM public.pix_withdrawals
  WHERE provider_ref = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  IF p_status IN ('completed', 'paid') THEN v_next_status := 'paid';
  ELSIF p_status IN ('failed', 'reversed', 'refunded') THEN v_next_status := 'failed';
  ELSE v_next_status := 'processing';
  END IF;

  -- Final states are immutable
  IF v_row.status IN ('paid', 'failed') THEN
    IF v_row.status <> v_next_status THEN
      UPDATE public.pix_withdrawals SET webhook_payload = COALESCE(p_payload, '{}'::jsonb)
      WHERE id = v_row.id;
    END IF;
    RETURN v_row.id;
  END IF;

  UPDATE public.pix_withdrawals
    SET status = v_next_status,
        processed_at = CASE WHEN v_next_status IN ('paid', 'failed') THEN now() ELSE processed_at END,
        webhook_payload = COALESCE(p_payload, '{}'::jsonb)
  WHERE id = v_row.id;

  RETURN v_row.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_syncpay_cashout_webhook(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_syncpay_cashout_webhook(text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.register_webhook_event(
  p_provider text, p_provider_event_id text, p_event_type text,
  p_status text, p_payload jsonb, p_source_ip text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_events(provider, provider_event_id, event_type, status, payload, source_ip)
  VALUES (p_provider, p_provider_event_id, p_event_type, p_status,
          COALESCE(p_payload, '{}'::jsonb), p_source_ip);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_webhook_event(text, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_webhook_event(text, text, text, text, jsonb, text) TO service_role;