
ALTER TABLE public.wallets ALTER COLUMN balance SET DEFAULT 0.00;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  VALUES (NEW.id, 0.00)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

UPDATE public.wallets
SET balance = 0.00, updated_at = now()
WHERE balance = 150.00
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM public.ledger_entries
    WHERE kind IN ('deposit', 'payout', 'adjustment')
  );
