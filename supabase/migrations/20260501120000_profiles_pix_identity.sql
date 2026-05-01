-- CPF e telefone no perfil (PIX SyncPay). Validação de checksum no servidor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS phone text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_cpf_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cpf_format
      CHECK (cpf IS NULL OR cpf ~ '^\d{11}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_phone_format
      CHECK (phone IS NULL OR phone ~ '^\d{10,11}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_cpf_unique'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cpf_unique UNIQUE (cpf);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_valid_cpf_digits(p_digits text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int;
  s int := 0;
  d1 int;
  d2 int;
BEGIN
  IF p_digits IS NULL OR length(p_digits) <> 11 THEN
    RETURN false;
  END IF;
  IF p_digits ~ '^(\d)\1{10}$' THEN
    RETURN false;
  END IF;

  s := 0;
  FOR i IN 1..9 LOOP
    s := s + substring(p_digits, i, 1)::int * (11 - i);
  END LOOP;
  d1 := (s * 10) % 11;
  IF d1 IN (10, 11) THEN d1 := 0; END IF;
  IF d1 <> substring(p_digits, 10, 1)::int THEN
    RETURN false;
  END IF;

  s := 0;
  FOR i IN 1..10 LOOP
    s := s + substring(p_digits, i, 1)::int * (12 - i);
  END LOOP;
  d2 := (s * 10) % 11;
  IF d2 IN (10, 11) THEN d2 := 0; END IF;
  RETURN d2 = substring(p_digits, 11, 1)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_pix_identity(p_cpf text, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF length(v_cpf) <> 11 OR NOT public.is_valid_cpf_digits(v_cpf) THEN
    RAISE EXCEPTION 'invalid_cpf' USING ERRCODE = '22023';
  END IF;

  IF length(v_phone) < 10 OR length(v_phone) > 11 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.cpf = v_cpf AND p.user_id <> v_uid
  ) THEN
    RAISE EXCEPTION 'cpf_already_used' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
  SET cpf = v_cpf,
      phone = v_phone,
      updated_at = now()
  WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_pix_identity(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_profile_pix_identity(text, text) TO authenticated;
