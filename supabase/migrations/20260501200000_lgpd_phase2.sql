-- LGPD Phase 2: consentimento, anonimização e job de deleção automática.
--
-- Retenção de registros financeiros:
--   ledger_entries e game_rounds são mantidos sem PII para cumprimento da
--   Lei 9.613/1998 (5 anos) e da Resolução BCB 1/2020. O perfil é anonimizado.

-- ---------------------------------------------------------------------------
-- 1. Soft-delete flag em profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Impede usuários deletados de iniciar novas rodadas (consultado no start-round)
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tabela de consentimentos (ToS / política de privacidade)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type    text NOT NULL CHECK (document_type IN ('tos', 'privacy_policy', 'age_confirmation')),
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  ip_address       text,
  user_agent       text
);

CREATE INDEX IF NOT EXISTS user_consents_user_idx
  ON public.user_consents (user_id, accepted_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_consents_select_own" ON public.user_consents;
CREATE POLICY "user_consents_select_own"
  ON public.user_consents FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON public.user_consents FROM public;
GRANT SELECT ON public.user_consents TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Função de anonimização / deleção de PII (LGPD Art. 18)
--
--    Preserva ledger_entries e game_rounds (obrigação legal financeira).
--    Remove/anonimiza todo dado pessoal identificável.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_lgpd_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id uuid;
BEGIN
  -- Verifica se há solicitação pendente
  SELECT id INTO v_request_id
  FROM public.lgpd_deletion_requests
  WHERE user_id = p_user_id
    AND status IN ('requested', 'processing')
  ORDER BY requested_at DESC
  LIMIT 1;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'no_pending_deletion_request';
  END IF;

  -- Marca como em processamento
  UPDATE public.lgpd_deletion_requests
  SET status = 'processing'
  WHERE id = v_request_id;

  -- Anonimiza perfil (mantém o row para não quebrar FKs financeiras)
  UPDATE public.profiles
  SET
    display_name          = 'Usuário Deletado',
    cpf                   = NULL,
    phone                 = NULL,
    over_18_confirmed_at  = NULL,
    kyc_status            = 'none',
    deleted_at            = now(),
    updated_at            = now()
  WHERE user_id = p_user_id;

  -- Remove consentimentos (dados pessoais não financeiros)
  DELETE FROM public.user_consents WHERE user_id = p_user_id;

  -- Remove depósitos e saques PIX pendentes (dados pessoais com Pix key)
  -- Registros 'confirmed' ou 'paid' são mantidos para auditoria financeira
  DELETE FROM public.pix_deposits
  WHERE user_id = p_user_id AND status IN ('pending', 'failed', 'expired');

  DELETE FROM public.pix_withdrawals
  WHERE user_id = p_user_id AND status IN ('requested', 'failed', 'reversed');

  -- Conclui a solicitação
  UPDATE public.lgpd_deletion_requests
  SET
    status       = 'completed',
    completed_at = now()
  WHERE id = v_request_id;

  -- Registra no audit log
  PERFORM public.log_data_access_event(
    p_user_id,
    p_user_id,
    'lgpd_deletion_executed',
    jsonb_build_object('request_id', v_request_id, 'source', 'process_lgpd_deletion')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_lgpd_deletion(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.process_lgpd_deletion(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Cron diário: processa solicitações com ≥ 15 dias (SLA LGPD)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_process_lgpd_deletions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count   integer := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM public.lgpd_deletion_requests
    WHERE status = 'requested'
      AND requested_at <= now() - INTERVAL '15 days'
  LOOP
    BEGIN
      PERFORM public.process_lgpd_deletion(v_user_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Não aborta o lote; loga e continua
      RAISE WARNING 'auto_process_lgpd_deletions: user % failed: %', v_user_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_process_lgpd_deletions() FROM public;
GRANT EXECUTE ON FUNCTION public.auto_process_lgpd_deletions() TO service_role;

-- Agenda cron diário às 02:00 UTC
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('auto-process-lgpd-deletions');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'auto-process-lgpd-deletions',
      '0 2 * * *',
      $job$SELECT public.auto_process_lgpd_deletions();$job$
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
