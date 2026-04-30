-- Amplia faixa de entrada alinhada ao cliente (até R$ 50).

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.game_rounds'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%stake%'
  loop
    execute format('alter table public.game_rounds drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.game_rounds
  add constraint game_rounds_stake_amount_check check (stake >= 1 and stake <= 50);
