-- Adiciona suporte a idempotência em create-pix-deposit.
-- Sem essa coluna, um clique duplo rápido criaria dois depósitos pendentes.

ALTER TABLE public.pix_deposits
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Garante unicidade: apenas um depósito pendente por chave por usuário
CREATE UNIQUE INDEX IF NOT EXISTS pix_deposits_idempotency_key_idx
  ON public.pix_deposits (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Atualiza a RPC para aceitar e persistir a chave de idempotência.
-- Se um depósito com a mesma chave já existe, retorna o ID existente.
CREATE OR REPLACE FUNCTION public.create_pix_deposit_pending(
  p_user_id       uuid,
  p_amount        numeric,
  p_expires_at    timestamptz,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Idempotência: retorna depósito existente se a chave já foi usada
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.pix_deposits
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.pix_deposits(user_id, provider_ref, amount, qr_code, expires_at, status, idempotency_key)
  VALUES (p_user_id, NULL, p_amount, '', p_expires_at, 'pending', p_idempotency_key)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_pix_deposit_pending(uuid, numeric, timestamptz, text) TO service_role;
