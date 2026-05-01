-- PIX safe order: cria registro no banco ANTES de chamar SyncPay.
-- Previne double-spend em saque e depósitos órfãos.

-- pix_deposits.provider_ref pode ser NULL enquanto aguarda resposta SyncPay
ALTER TABLE public.pix_deposits ALTER COLUMN provider_ref DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Depósito PIX: fluxo DB-first
-- ---------------------------------------------------------------------------

-- 1. Cria registro pendente antes de chamar SyncPay
CREATE OR REPLACE FUNCTION public.create_pix_deposit_pending(
  p_user_id uuid,
  p_amount numeric,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.pix_deposits(user_id, provider_ref, amount, qr_code, expires_at, status)
  VALUES (p_user_id, NULL, p_amount, '', p_expires_at, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz) TO service_role;

-- 2. Finaliza com dados reais do SyncPay após sucesso
CREATE OR REPLACE FUNCTION public.finalize_pix_deposit_pending(
  p_deposit_id uuid,
  p_provider_ref text,
  p_qr_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_deposits
    SET provider_ref = p_provider_ref,
        qr_code = p_qr_code
  WHERE id = p_deposit_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit_not_found_or_not_pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_pix_deposit_pending(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_pix_deposit_pending(uuid, text, text) TO service_role;

-- 3. Cancela registro se SyncPay falhar
CREATE OR REPLACE FUNCTION public.cancel_pix_deposit_pending(
  p_deposit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_deposits
    SET status = 'failed'
  WHERE id = p_deposit_id AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pix_deposit_pending(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_pix_deposit_pending(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Saque PIX: fluxo DB-first (saldo reservado antes de chamar SyncPay)
-- ---------------------------------------------------------------------------

-- 4. Vincula provider_ref do SyncPay após sucesso
CREATE OR REPLACE FUNCTION public.finalize_pix_withdrawal(
  p_withdrawal_id uuid,
  p_provider_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pix_withdrawals
    SET provider_ref = p_provider_ref
  WHERE id = p_withdrawal_id AND status = 'requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal_not_found_or_already_processed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_pix_withdrawal(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_pix_withdrawal(uuid, text) TO service_role;

-- 5. Reverte saque se SyncPay falhar: restaura saldo e marca como failed
CREATE OR REPLACE FUNCTION public.reverse_pix_withdrawal(
  p_withdrawal_id uuid
)
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
  SELECT * INTO v_row
  FROM public.pix_withdrawals
  WHERE id = p_withdrawal_id AND status = 'requested'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal_not_found_or_already_processed';
  END IF;

  SELECT balance INTO v_balance
  FROM public.wallets
  WHERE user_id = v_row.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  v_new_balance := round((v_balance + v_row.amount)::numeric, 2);

  UPDATE public.wallets
    SET balance = v_new_balance,
        updated_at = now()
  WHERE user_id = v_row.user_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (
    v_row.user_id,
    'adjustment',
    v_row.amount,
    v_new_balance,
    'pix_withdraw_reversal:' || p_withdrawal_id::text,
    jsonb_build_object(
      'pix_withdrawal_id', p_withdrawal_id,
      'reason', 'syncpay_call_failed'
    )
  );

  UPDATE public.pix_withdrawals
    SET status = 'failed',
        processed_at = now()
  WHERE id = p_withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_pix_withdrawal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reverse_pix_withdrawal(uuid) TO service_role;
