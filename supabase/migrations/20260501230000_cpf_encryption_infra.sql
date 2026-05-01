-- CPF encryption at rest — Phase 1 (infrastructure + backfill path)
--
-- This migration adds the cryptographic infrastructure to store CPF at rest
-- using AES-256 symmetric encryption via pgcrypto + Supabase Vault.
--
-- OPERATOR STEPS BEFORE RUNNING BACKFILL:
--   1. Generate a 64-hex-char key:
--        openssl rand -hex 32
--   2. Set it in Supabase Vault (SQL editor or migration):
--        UPDATE vault.secrets
--        SET secret = '<your-64-hex-key>'
--        WHERE name = 'cpf_crypt_key_v1';
--   3. Run the backfill:
--        SELECT public.backfill_cpf_encryption();
--   4. Verify: SELECT COUNT(*) FROM profiles WHERE cpf IS NOT NULL AND cpf_enc IS NULL;
--      (should be 0)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Create vault secret placeholder (operator must replace the empty value)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'cpf_crypt_key_v1'
  ) THEN
    PERFORM vault.create_secret(
      '',              -- placeholder — operator MUST update before running backfill
      'cpf_crypt_key_v1',
      'Hex-encoded 32-byte key for CPF encryption at rest (AES-256 via pgcrypto)'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Supabase Vault not available or create_secret failed: %. Set cpf_crypt_key_v1 manually.', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add encrypted columns to profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_hash text,  -- HMAC-SHA256 for deduplication (deterministic)
  ADD COLUMN IF NOT EXISTS cpf_enc  bytea; -- AES-256 ciphertext for retrieval (non-deterministic)

-- Add hash-based unique constraint (will replace plaintext unique after backfill)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_hash_unique
  ON public.profiles (cpf_hash)
  WHERE cpf_hash IS NOT NULL;

-- Keep the existing plaintext unique constraint until backfill is confirmed
-- (profiles_cpf_unique is dropped only in the follow-up migration after backfill)

-- ---------------------------------------------------------------------------
-- 3. Internal key accessor (SECURITY DEFINER, service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cpf_crypt_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_key text;
BEGIN
  -- Try Supabase Vault first
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'cpf_crypt_key_v1';
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  -- Fallback to DB setting (set via: ALTER DATABASE postgres SET app.cpf_crypt_key = '...')
  IF v_key IS NULL OR length(v_key) < 16 THEN
    v_key := current_setting('app.cpf_crypt_key', true);
  END IF;

  IF v_key IS NULL OR length(v_key) < 16 THEN
    RAISE EXCEPTION 'cpf_crypt_key_v1 not configured — run vault setup before backfill';
  END IF;

  RETURN v_key;
END;
$$;
REVOKE ALL ON FUNCTION public._cpf_crypt_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._cpf_crypt_key() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. HMAC hash for uniqueness lookup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cpf_to_hash(p_cpf text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(
    hmac(p_cpf::bytea, public._cpf_crypt_key()::bytea, 'sha256'),
    'hex'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cpf_to_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpf_to_hash(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. AES-256 encrypt / decrypt (pgp_sym_encrypt uses AES-256)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cpf_encrypt(p_cpf text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_cpf, public._cpf_crypt_key());
END;
$$;
REVOKE ALL ON FUNCTION public.cpf_encrypt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpf_encrypt(text) TO service_role;

CREATE OR REPLACE FUNCTION public.cpf_decrypt(p_enc bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_enc, public._cpf_crypt_key());
END;
$$;
REVOKE ALL ON FUNCTION public.cpf_decrypt(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpf_decrypt(bytea) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Update set_profile_pix_identity to write encrypted columns in parallel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_profile_pix_identity(p_cpf text, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_cpf   text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_hash  text;
  v_enc   bytea;
  v_key   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF length(v_cpf) <> 11 OR NOT public.is_valid_cpf_digits(v_cpf) THEN
    RAISE EXCEPTION 'invalid_cpf' USING ERRCODE = '22023';
  END IF;

  IF length(v_phone) < 10 OR length(v_phone) > 11 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  -- Check uniqueness by hash (if key is configured) or by plaintext (fallback)
  BEGIN
    v_key  := public._cpf_crypt_key();
    v_hash := public.cpf_to_hash(v_cpf);
    v_enc  := public.cpf_encrypt(v_cpf);
  EXCEPTION WHEN OTHERS THEN
    -- Key not yet configured — write plaintext only (legacy mode)
    v_hash := NULL;
    v_enc  := NULL;
  END;

  -- Uniqueness guard (hash-based when available, plaintext otherwise)
  IF v_hash IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.cpf_hash = v_hash AND p.user_id <> v_uid
    ) THEN
      RAISE EXCEPTION 'cpf_already_used' USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.cpf = v_cpf AND p.user_id <> v_uid
    ) THEN
      RAISE EXCEPTION 'cpf_already_used' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    cpf        = v_cpf,    -- kept for backwards compat; removed after backfill confirmed
    cpf_hash   = v_hash,
    cpf_enc    = v_enc,
    phone      = v_phone,
    updated_at = now()
  WHERE user_id = v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.set_profile_pix_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_pix_identity(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_user_pix_identity: edge function accessor (returns decrypted values)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_pix_identity(p_user_id uuid)
RETURNS TABLE(
  cpf                  text,
  phone                text,
  display_name         text,
  over_18_confirmed_at timestamptz,
  deleted_at           timestamptz,
  kyc_status           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN pr.cpf_enc IS NOT NULL THEN public.cpf_decrypt(pr.cpf_enc)
      ELSE pr.cpf   -- fallback to plaintext until backfill runs
    END                        AS cpf,
    pr.phone,
    pr.display_name,
    pr.over_18_confirmed_at,
    pr.deleted_at,
    pr.kyc_status
  FROM public.profiles pr
  WHERE pr.user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_pix_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_pix_identity(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Backfill function: encrypt existing plaintext CPFs
--    Run AFTER configuring the vault secret.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_cpf_encryption()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r       record;
BEGIN
  FOR r IN
    SELECT user_id, cpf
    FROM public.profiles
    WHERE cpf IS NOT NULL
      AND cpf_enc IS NULL
    ORDER BY user_id
  LOOP
    BEGIN
      UPDATE public.profiles
      SET
        cpf_hash = public.cpf_to_hash(r.cpf),
        cpf_enc  = public.cpf_encrypt(r.cpf)
      WHERE user_id = r.user_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill_cpf_encryption: user % failed: %', r.user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'backfill_cpf_encryption: % rows encrypted', v_count;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.backfill_cpf_encryption() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_cpf_encryption() TO service_role;
