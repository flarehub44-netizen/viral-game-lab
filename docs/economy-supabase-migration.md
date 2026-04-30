# Economia servidor-first (rodadas RTP discreto)

Implementação atual: o resultado da rodada é **sorteado na Edge Function** `start-round` com a tabela em [supabase/functions/_shared/multiplierTable.ts](../supabase/functions/_shared/multiplierTable.ts) (espelho de [src/game/economy/multiplierTable.ts](../src/game/economy/multiplierTable.ts)). O cliente **não** calcula pagamento; apenas anima o `visual_result`.

## Tabelas (migration)

Ver [supabase/migrations/20260430140000_economy_profiles_wallets_rounds.sql](../supabase/migrations/20260430140000_economy_profiles_wallets_rounds.sql):

- **`profiles`** — `display_name`, `over_18_confirmed_at`, `kyc_status`, FK `auth.users`.
- **`wallets`** — saldo `numeric(12,2)`, inicial 150 no trigger `handle_new_user`.
- **`ledger_entries`** — append-only (`stake`, `payout`, …), `idempotency_key` único por lançamento.
- **`game_rounds`** — uma linha por rodada já liquidada (`result_multiplier`, `payout`, `visual_result` jsonb).

RLS: leitura própria por `auth.uid()`; escritos sensíveis via **service role** na função.

## RPC transacional

`public.start_round_atomic(...)` (SECURITY DEFINER): valida saldo, atualiza `wallets`, insere duas linhas no ledger (`:stake` e `:payout` em `idempotency_key`) e grava `game_rounds`. Idempotência: mesma `idempotency_key` + `user_id` devolve o `id` existente sem cobrar de novo.

## Edge Function `start-round`

- Valida JWT (`Authorization`), carrega `profiles` (bloqueio se `over_18_confirmed_at` nulo).
- Entrada **1–20**, modo `target_20x`, teto de pagamento **400** (implícito em stake×mult máximo).
- Sorteia multiplicador com `crypto.getRandomValues`, monta `visual_result`, chama `start_round_atomic`.
- Resposta: `round_id`, `stake_amount`, `result_multiplier`, `payout_amount`, `net_result`, `visual_result`.

Config: [supabase/config.toml](../supabase/config.toml) — `[functions.start-round] verify_jwt = true`.

## Frontend

- Auth obrigatória ([AuthProvider](../src/contexts/AuthContext.tsx)); confirmação 18+ grava `profiles.over_18_confirmed_at`.
- `supabase.functions.invoke("start-round", { body })` com sessão ativa.
- [GameEngine](../src/game/engine.ts) modo **revelação**: encerra quando barreiras/score/tempo atingem `visual_result`.

## Legado local

[wallet.ts](../src/game/economy/wallet.ts) / [settlement.ts](../src/game/economy/settlement.ts) permanecem no repo como referência ou testes; **não** fazem parte do fluxo principal autenticado.
