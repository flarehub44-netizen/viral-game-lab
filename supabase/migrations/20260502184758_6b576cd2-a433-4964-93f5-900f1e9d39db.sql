-- ============================================================================
-- Saques: exigir aprovação admin antes de enviar ao gateway PIX
-- ============================================================================
-- Mudanças:
-- 1. Pedidos passam a entrar em status 'pending_approval' (em vez de ir direto
--    para 'requested', que aciona a chamada ao Syncpay).
-- 2. Admin aprova → status vira 'requested' (continua o fluxo atual: edge
--    function envia ao gateway, depois 'processing' → 'paid'/'failed').
-- 3. Admin rejeita com motivo obrigatório → estorna saldo, status 'rejected'.
-- 4. Auditoria completa em admin_action_logs + ledger_entries.
-- ============================================================================

-- 1) Colunas novas em pix_withdrawals
ALTER TABLE public.pix_withdrawals
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2) Trocar request_pix_withdrawal: agora cria com 'pending_approval'
CREATE OR REPLACE FUNCTION public.request_pix_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_pix_key text,
  p_pix_key_type text,
  p_provider_ref text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_withdraw_id uuid;
  v_existing uuid;
  v_last_withdrawal timestamptz;
  v_cycle_start timestamptz;
  v_deposited numeric := 0;
  v_wagered numeric := 0;
  v_required numeric := 0;
BEGIN
  IF p_amount < 30 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'withdraw_amount_out_of_bounds';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.pix_withdrawals
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- Rollover (igual ao anterior)
  SELECT MAX(created_at) INTO v_last_withdrawal
  FROM public.pix_withdrawals
  WHERE user_id = p_user_id
    AND status NOT IN ('failed', 'reversed', 'rejected');

  v_cycle_start := COALESCE(v_last_withdrawal, 'epoch'::timestamptz);

  SELECT COALESCE(SUM(amount), 0) INTO v_deposited
  FROM public.ledger_entries
  WHERE user_id = p_user_id AND kind = 'deposit' AND created_at > v_cycle_start;

  SELECT COALESCE(SUM(amount), 0) INTO v_wagered
  FROM public.ledger_entries
  WHERE user_id = p_user_id AND kind = 'stake' AND created_at > v_cycle_start;

  v_required := round((v_deposited * 2)::numeric, 2);

  IF v_wagered < v_required THEN
    RAISE EXCEPTION 'rollover_not_met:%:%:%',
      round(v_deposited::numeric, 2),
      round(v_wagered::numeric, 2),
      v_required;
  END IF;

  -- Debita saldo já no pedido (reserva o valor)
  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_new_balance := round((v_balance - p_amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  -- Status inicial agora é 'pending_approval' (antes era 'requested')
  INSERT INTO public.pix_withdrawals(
    user_id, amount, pix_key, pix_key_type, provider_ref, idempotency_key, status
  )
  VALUES (
    p_user_id, p_amount, p_pix_key, p_pix_key_type, p_provider_ref, p_idempotency_key, 'pending_approval'
  )
  RETURNING id INTO v_withdraw_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (p_user_id, 'withdraw', p_amount, v_new_balance,
          'pix_withdraw_request:' || v_withdraw_id::text,
          jsonb_build_object(
            'pix_withdrawal_id', v_withdraw_id,
            'provider_ref', p_provider_ref,
            'rollover_deposited', v_deposited,
            'rollover_wagered', v_wagered,
            'rollover_required', v_required,
            'awaiting_admin_approval', true
          ));

  RETURN v_withdraw_id;
END;
$$;

-- 3) Função: admin aprova → muda para 'requested' (libera para gateway)
CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(
  p_actor uuid,
  p_withdrawal_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_row public.pix_withdrawals%rowtype;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT * INTO v_row FROM public.pix_withdrawals
  WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_row.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'invalid_state_for_approval:%', v_row.status;
  END IF;

  UPDATE public.pix_withdrawals
     SET status = 'requested',
         approved_by = p_actor,
         approved_at = now()
   WHERE id = p_withdrawal_id;

  PERFORM public.log_data_access_event(
    p_actor, v_row.user_id, 'admin_approve_withdrawal',
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_row.amount)
  );

  PERFORM public.admin_log_action(
    p_actor, 'approve_withdrawal', v_row.user_id,
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_row.amount)
  );

  RETURN p_withdrawal_id;
END;
$$;

-- 4) Função: admin rejeita → estorna saldo, motivo obrigatório
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(
  p_actor uuid,
  p_withdrawal_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.pix_withdrawals%rowtype;
  v_balance numeric;
  v_new_balance numeric;
  v_clean_reason text;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  v_clean_reason := trim(coalesce(p_reason, ''));
  IF length(v_clean_reason) < 3 OR length(v_clean_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_rejection_reason';
  END IF;

  SELECT * INTO v_row FROM public.pix_withdrawals
  WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_row.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'invalid_state_for_rejection:%', v_row.status;
  END IF;

  -- Estorna saldo
  SELECT balance INTO v_balance FROM public.wallets
  WHERE user_id = v_row.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  v_new_balance := round((v_balance + v_row.amount)::numeric, 2);

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now()
  WHERE user_id = v_row.user_id;

  UPDATE public.pix_withdrawals
     SET status = 'rejected',
         rejected_by = p_actor,
         rejected_at = now(),
         rejection_reason = v_clean_reason,
         processed_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.ledger_entries(user_id, kind, amount, balance_after, idempotency_key, meta)
  VALUES (v_row.user_id, 'adjustment', v_row.amount, v_new_balance,
          'pix_withdraw_rejection:' || p_withdrawal_id::text,
          jsonb_build_object(
            'pix_withdrawal_id', p_withdrawal_id,
            'reason', 'admin_rejected',
            'rejection_reason', v_clean_reason,
            'admin_id', p_actor
          ));

  PERFORM public.log_data_access_event(
    p_actor, v_row.user_id, 'admin_reject_withdrawal',
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_row.amount, 'reason', v_clean_reason)
  );

  PERFORM public.admin_log_action(
    p_actor, 'reject_withdrawal', v_row.user_id,
    jsonb_build_object('withdrawal_id', p_withdrawal_id, 'amount', v_row.amount, 'reason', v_clean_reason)
  );

  RETURN p_withdrawal_id;
END;
$$;

-- 5) Índice para listar pedidos pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_pix_withdrawals_pending
  ON public.pix_withdrawals(created_at DESC)
  WHERE status = 'pending_approval';