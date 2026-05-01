-- ============================================================================
-- M1 — CORE SCHEMA (consolidated, audited)
-- Replaces the 18 unapplied migrations for profiles/wallets/user_roles.
-- Incorporates fixes for W1 (user_roles + has_role) and W6 (display_name regex).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.kyc_status AS ENUM ('none', 'pending', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- PROFILES (no is_admin column → W1 by design)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  over_18_confirmed_at timestamptz,
  kyc_status public.kyc_status NOT NULL DEFAULT 'none',
  cpf text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_cpf_format CHECK (cpf IS NULL OR cpf ~ '^\d{11}$'),
  CONSTRAINT profiles_phone_format CHECK (phone IS NULL OR phone ~ '^\d{10,11}$'),
  CONSTRAINT profiles_cpf_unique UNIQUE (cpf)
);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT only own profile. NO direct UPDATE policy → must go through RPCs (P0 hardening).
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- WALLETS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 150.00
    CHECK (balance >= 0 AND balance <= 1000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies → only service_role (Edge Functions / RPCs).

-- ----------------------------------------------------------------------------
-- USER_ROLES (W1: replaces profiles.is_admin anti-pattern)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role: SECURITY DEFINER to avoid RLS recursion. Restricted to authenticated.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE/DELETE policies → admin role mutations must go via service_role only.

-- ----------------------------------------------------------------------------
-- handle_new_user: trigger on auth.users insert → creates profile + wallet
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(COALESCE(NEW.email, 'player'), '@', 1)
    )
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.id, 150.00)
  ON CONFLICT (user_id) DO NOTHING;

  -- Default role: 'user' (admin must be granted manually via service_role)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- confirm_age_18 (idempotent; replaces previous version)
-- ----------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.confirm_age_18() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_age_18() TO authenticated;

-- ----------------------------------------------------------------------------
-- set_profile_display_name (W6: regex on allowed chars)
-- ----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'invalid_display_name_length';
  END IF;

  -- W6: enforce strict char allowlist (letters, digits, space, hyphen, underscore)
  IF v_name !~ '^[A-Za-z0-9 _\-]{1,24}$' THEN
    RAISE EXCEPTION 'invalid_display_name_chars' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET display_name = v_name,
      updated_at = now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_profile_display_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_display_name(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- CPF checksum validation
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- set_profile_pix_identity (CPF + phone with validation)
-- ----------------------------------------------------------------------------
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
    RAISE EXCEPTION 'unauthenticated';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_profile_pix_identity(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_pix_identity(text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- get_user_pix_identity: server-side CPF read for edge functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_pix_identity(p_user_id uuid)
RETURNS TABLE (cpf text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpf, phone FROM public.profiles WHERE user_id = p_user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_pix_identity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pix_identity(uuid) TO service_role;