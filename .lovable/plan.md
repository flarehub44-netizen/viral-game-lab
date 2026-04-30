
# Plano: Apontar para Supabase externo

## Situação atual

- O `.env` e `src/integrations/supabase/client.ts` são auto-gerados pelo Lovable Cloud e apontam para `vezortwznwmziqukypjj` — **não podem ser editados**.
- O seu Supabase externo é `pbkdmcjlscjdvkaiypye` e está vazio (sem tabelas, sem functions).
- 5 arquivos no frontend importam o client de `@/integrations/supabase/client`.

## O que vou fazer

### 1. Criar client customizado apontando para seu Supabase

Criar `src/lib/supabaseExternal.ts` com URL e anon key do projeto `pbkdmcjlscjdvkaiypye`. Você vai precisar me fornecer a **anon key** do seu projeto externo (é pública, não é segredo).

### 2. Substituir todos os imports

Alterar os 5 arquivos que importam o client para usar o novo:
- `src/contexts/AuthContext.tsx`
- `src/pages/Index.tsx`
- `src/components/Leaderboard.tsx`
- `src/components/auth/AgeGateScreen.tsx`
- `src/components/admin/ClimbMonitoringPanel.tsx`

### 3. Gerar SQL consolidado para você rodar no Supabase Dashboard

Consolidar todas as 9 migrations em um único script SQL que você cola no **SQL Editor** do seu Supabase Dashboard. Isso cria:
- Tabela `scores` (com RLS público)
- Tabela `profiles` (com RLS por usuário)
- Tabela `wallets` (com RLS por usuário)
- Tabela `ledger_entries` (com RLS por usuário)
- Tabela `game_rounds` (com RLS por usuário + colunas CLIMB)
- Trigger `handle_new_user` (cria profile + wallet automático)
- RPC `start_round_atomic` v2 (11 parâmetros)
- Views de monitoramento (`v_round_health`, `v_rtp_live`, `v_monitor_alerts`)

### 4. Instruções para deploy das Edge Functions

As 3 edge functions (`start-round`, `end-round`, `submit-score`) precisam ser deployadas via **Supabase CLI** no seu projeto. Vou gerar o comando exato.

## O que você precisa fazer (antes de eu implementar)

1. **Me fornecer a anon key** do projeto `pbkdmcjlscjdvkaiypye` (encontra em Project Settings > API no dashboard do Supabase)
2. Após eu gerar o SQL, **colar e rodar no SQL Editor** do seu dashboard
3. Após eu ajustar o código, **fazer deploy das edge functions** via Supabase CLI:
   ```bash
   supabase link --project-ref pbkdmcjlscjdvkaiypye
   supabase functions deploy submit-score
   supabase functions deploy start-round
   supabase functions deploy end-round
   ```

## Resultado final

O app inteiro vai rodar contra o seu Supabase (`pbkdmcjlscjdvkaiypye`): auth, wallet, rounds, leaderboard e edge functions.
