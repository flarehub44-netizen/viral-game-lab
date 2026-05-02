CREATE OR REPLACE FUNCTION public.claim_mission_atomic(
  p_user_id uuid,
  p_mission_id text,
  p_mission_seed date,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_claim_id uuid;
  v_grant_id uuid;
BEGIN
  IF p_amount <= 0 OR p_amount > 1 THEN
    RAISE EXCEPTION 'invalid_mission_amount';
  END IF;
  IF length(coalesce(p_mission_id, '')) = 0 OR length(p_mission_id) > 64 THEN
    RAISE EXCEPTION 'invalid_mission_id';
  END IF;
  IF p_mission_seed IS NULL OR p_mission_seed > (now() AT TIME ZONE 'UTC')::date
     OR p_mission_seed < (now() AT TIME ZONE 'UTC')::date - 1 THEN
    RAISE EXCEPTION 'invalid_mission_seed';
  END IF;

  SELECT id INTO v_existing FROM public.daily_missions_claims
  WHERE user_id = p_user_id AND mission_id = p_mission_id AND mission_seed = p_mission_seed;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  INSERT INTO public.daily_missions_claims (user_id, mission_id, mission_seed, bonus_amount)
  VALUES (p_user_id, p_mission_id, p_mission_seed, p_amount)
  RETURNING id INTO v_claim_id;

  v_grant_id := public.grant_bonus_atomic(
    p_user_id, p_amount, 10, 'mission',
    jsonb_build_object('mission_id', p_mission_id, 'mission_seed', p_mission_seed, 'claim_id', v_claim_id)
  );

  RETURN v_claim_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_mission_atomic(uuid, text, date, numeric) FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS daily_missions_claims_user_mission_seed_uniq
  ON public.daily_missions_claims (user_id, mission_id, mission_seed);