# Painel administrativo (`/admin`)

A rota `/admin` só é útil para contas com **`profiles.is_admin = true`**. Sem esse flag, o app responde como **404** (não revela a existência do painel).

Todas as ações privilegiadas passam pela Edge Function **`admin-action`** (JWT obrigatório), que confere `is_admin` no servidor antes de chamar as RPCs `SECURITY DEFINER`.

## Promover um usuário a administrador

No **SQL Editor** do Supabase (ou `psql`), substitua o UUID pelo `user_id` desejado (é o mesmo `auth.users.id`):

```sql
update public.profiles
set is_admin = true
where user_id = '00000000-0000-0000-0000-000000000000';
```

Para revogar:

```sql
update public.profiles
set is_admin = false
where user_id = '00000000-0000-0000-0000-000000000000';
```

## Deploy

1. Aplicar migrations (`supabase db push` ou fluxo do projeto).
2. Publicar a função: `supabase functions deploy admin-action`.

Variáveis usadas pela função: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, e opcionalmente `LAYOUT_SIGNATURE_SECRET` (mesmo do `start-round`).

## Sandbox

Rodadas criadas pelo painel usam **`game_rounds.mode = 'sandbox'`** e não movimentam carteira. As views `v_rtp_live`, `v_monitor_alerts` e `v_round_health` ignoram `sandbox` para não distorcer métricas de produção.
