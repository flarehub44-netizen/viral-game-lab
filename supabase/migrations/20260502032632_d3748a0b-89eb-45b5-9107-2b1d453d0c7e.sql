-- Rollover 2x: o jogador só pode sacar quando tiver apostado pelo menos
-- 2x o total depositado desde o último saque registrado.

-- Helper interno reutilizável (calcula rollover do usuário no ciclo atual)
CREATE OR REPLACE FUNCTION public.get_withdrawal_rollover(p_user_id uuid)
RETURNS TABLE(
  deposited numeric,
  wagered numeric,
  required numeric,
  remaining numeric,
  eligible boolean,
  cycle_started_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_last_withdrawal timestamptz;
  v_cycle_start timestamptz;
  v_deposited numeric := 0;
  v_wagered numeric := 0;
  v_required numeric := 0;
  v_remaining numeric := 0;
BEGIN
  -- Permite apenas o próprio usuário, admin ou o service_role consultar.
  IF v_caller IS NOT NULL
     AND v_caller <> p_user_id
     AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Último saque "vivo" (não conta tentativas que falharam/reverteram).
  SELECT MAX(created_at) INTO v_last_withdrawal
  FROM public.pix_withdrawals
  WHERE user_id = p_user_id
    AND status NOT IN ('failed', 'reversed');

  v_cycle_start := COALESCE(v_last_withdrawal, 'epoch'::timestamptz);

  -- Soma depósitos confirmados desde o início do ciclo.
  SELECT COALESCE(SUM(amount), 0) INTO v_deposited
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'deposit'
    AND created_at > v_cycle_start;

  -- Soma stakes (apostas iniciadas) desde o início do ciclo.
  SELECT COALESCE(SUM(amount), 0) INTO v_wagered
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'stake'
    AND created_at > v_cycle_start;

  v_required := round((v_deposited * 2)::numeric, 2);
  v_remaining := GREATEST(0, round((v_required - v_wagered)::numeric, 2));

  deposited := round(v_deposited::numeric, 2);
  wagered := round(v_wagered::numeric, 2);
  required := v_required;
  remaining := v_remaining;
  eligible := v_wagered >= v_required;
  cycle_started_at := v_last_withdrawal;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_rollover(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_rollover(uuid) TO authenticated, service_role;

-- Atualiza request_pix_withdrawal para validar a regra antes de debitar.
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
  v_last_withdrawal timestamptz;
  v_cycle_start timestamptz;
  v_deposited numeric := 0;
  v_wagered numeric := 0;
  v_required numeric := 0;
BEGIN
  IF p_amount < 5 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'withdraw_amount_out_of_bounds';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.pix_withdrawals
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  -- Verificação de rollover (2x depósitos no ciclo atual).
  SELECT MAX(created_at) INTO v_last_withdrawal
  FROM public.pix_withdrawals
  WHERE user_id = p_user_id
    AND status NOT IN ('failed', 'reversed');

  v_cycle_start := COALESCE(v_last_withdrawal, 'epoch'::timestamptz);

  SELECT COALESCE(SUM(amount), 0) INTO v_deposited
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'deposit'
    AND created_at > v_cycle_start;

  SELECT COALESCE(SUM(amount), 0) INTO v_wagered
  FROM public.ledger_entries
  WHERE user_id = p_user_id
    AND kind = 'stake'
    AND created_at > v_cycle_start;

  v_required := round((v_deposited * 2)::numeric, 2);

  IF v_wagered < v_required THEN
    RAISE EXCEPTION 'rollover_not_met:%:%:%',
      round(v_deposited::numeric, 2),
      round(v_wagered::numeric, 2),
      v_required;
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
          jsonb_build_object(
            'pix_withdrawal_id', v_withdraw_id,
            'provider_ref', p_provider_ref,
            'rollover_deposited', v_deposited,
            'rollover_wagered', v_wagered,
            'rollover_required', v_required
          ));

  RETURN v_withdraw_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_pix_withdrawal(uuid, numeric, text, text, text, text) TO service_role;