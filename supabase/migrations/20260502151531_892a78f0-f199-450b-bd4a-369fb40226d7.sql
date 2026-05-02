
-- Revoga EXECUTE público das funções de fluxo interno (apenas service_role chama)
REVOKE EXECUTE ON FUNCTION public.start_round_atomic(uuid, numeric, numeric, numeric, numeric, jsonb, text, integer, integer, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.settle_round_atomic(uuid, uuid, integer, integer, boolean, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.grant_bonus_atomic(uuid, numeric, numeric, text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.claim_daily_login(uuid) FROM anon, authenticated, public;

-- Mantém execução para as funções que são chamadas pelo próprio usuário autenticado
-- (confirm_age_18, set_profile_display_name, set_profile_pix_identity, get_withdrawal_rollover)
-- e pelo backend (todas as outras já estão protegidas via RLS ou são server-only).
