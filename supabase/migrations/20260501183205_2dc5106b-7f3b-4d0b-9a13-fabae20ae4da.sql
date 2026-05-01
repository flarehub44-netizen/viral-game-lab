-- B1 fix: caminho controlado para confirmar idade 18+
-- A policy 'profiles_update_own' foi removida no P0 hardening, deixando o AgeGate sem caminho para gravar over_18_confirmed_at.
-- Esta RPC permite ao próprio usuário marcar a confirmação de idade, sem reabrir UPDATE amplo em profiles.

CREATE OR REPLACE FUNCTION public.confirm_age_18()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ts  timestamptz := now();
  v_existing timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Idempotente: se já confirmado, retorna o timestamp existente sem sobrescrever.
  SELECT over_18_confirmed_at INTO v_existing
  FROM public.profiles
  WHERE user_id = v_uid;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE public.profiles
  SET over_18_confirmed_at = v_ts,
      updated_at = v_ts
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN v_ts;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_age_18() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_age_18() TO authenticated;