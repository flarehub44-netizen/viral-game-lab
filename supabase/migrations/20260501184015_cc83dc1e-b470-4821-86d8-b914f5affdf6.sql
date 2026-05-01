-- Hardening: restringir EXECUTE da função confirm_age_18 apenas a usuários autenticados.
-- A função já valida auth.uid() internamente, mas o linter (warnings 0028/0029) alerta
-- sobre SECURITY DEFINER exposto a anon/PUBLIC. Removemos a exposição desnecessária.

REVOKE EXECUTE ON FUNCTION public.confirm_age_18() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_age_18() FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_age_18() TO authenticated;