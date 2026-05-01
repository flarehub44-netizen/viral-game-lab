-- P0 security hardening:
-- 1) block broad profile updates from authenticated users
-- 2) add controlled RPC for display name updates
-- 3) enforce withdrawal idempotency at DB level

-- ---------------------------------------------------------------------------
-- 1) Profiles: remove broad direct UPDATE policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Controlled update path for display name only.
CREATE OR REPLACE FUNCTION public.set_profile_display_name(p_display_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_name := left(trim(coalesce(p_display_name, '')), 24);
  IF length(v_name) < 1 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;

  UPDATE public.profiles
  SET display_name = v_name,
      updated_at = now()
  WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_display_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_display_name(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Withdrawals: idempotency key support
-- ---------------------------------------------------------------------------
ALTER TABLE public.pix_withdrawals
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS pix_withdrawals_idempotency_key_idx
  ON public.pix_withdrawals (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.request_pix_withdrawal(uuid, numeric, text, text, text);

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
    SELECT id INTO v_existing
    FROM public.pix_withdrawals
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT balance INTO v_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  v_new_balance := round((v_balance - p_amount)::numeric, 2);

  UPDATE public.wallets
  SET balance = v_new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.pix_withdrawals(user_id, amount, pix_key, pix_key_type, provider_ref, idempotency_key)
  VALUES (p_user_id, p_amount, p_pix_key, p_pix_key_type, p_provider_ref, p_idempotency_key)
  RETURNING id INTO v_withdraw_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (
    p_user_id,
    'withdraw',
    p_amount,
    v_new_balance,
    'pix_withdraw:' || v_withdraw_id::text,
    jsonb_build_object('pix_withdrawal_id', v_withdraw_id, 'provider_ref', p_provider_ref)
  );

  RETURN v_withdraw_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) TO service_role;
