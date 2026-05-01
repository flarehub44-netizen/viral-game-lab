## Mudança de regra

Hoje o jogo é "reveal-only": o servidor sorteia o multiplicador no início e o pagamento já está garantido — o jogador apenas assiste a animação. Você quer skill puro:

- Servidor (LIVE) e cliente (DEMO) sorteiam o multiplicador e a **meta de barreiras** no início.
- Entrada é debitada imediatamente.
- Pagamento (entrada × multiplicador) só é creditado se o jogador **atingir a meta**.
- Se não atingir a meta, payout = R$ 0 → perde a entrada inteira.
- Aplica-se a DEMO e LIVE.

Implicações:
- O multiplicador deixa de ser garantia e vira um **alvo**.
- O RTP teórico não muda (mesma tabela), mas o RTP real cai conforme habilidade do jogador.
- A UI muda: HUD mostra "Meta: passar X barreiras × multiplicador" e o card de game over mostra "Atingiu meta? Sim/Não".

## Parte 1 — Backend (LIVE)

### 1.1 `supabase/functions/start-round/index.ts`
Hoje cria a rodada com `payout` e `net_result` já calculados via `start_round_atomic`. Mudar para:
- Debitar apenas a **entrada** (lock).
- Gravar `result_multiplier`, `target_barrier` no `game_rounds` mas **não** creditar payout. `payout = 0`, `net_result = -stake`, `round_status = "open"`.
- Resposta ao cliente: continua enviando `result_multiplier`, `target_barrier`, mas o cliente entende que isso é **alvo** e payout só vem do `end-round`.

Precisa de migração: criar/ajustar RPC `start_round_atomic` para apenas debitar (não creditar).

### 1.2 `supabase/functions/end-round/index.ts`
Hoje aceita `barriers_passed` mas não usa para decidir payout. Mudar:
- Ler `target_barrier` e `result_multiplier` da rodada.
- Calcular `reachedTarget = barriers_passed >= target_barrier`.
- Se `reachedTarget`: `payout = stake × result_multiplier` (com cap). Creditar via novo RPC `settle_round_atomic`.
- Se não: `payout = 0`. Net = `-stake` (já debitado no start, nada a fazer no saldo).
- Atualizar `game_rounds.payout`, `net_result`, `round_status="closed"` e gravar `client_report.reached_target`.
- Resposta inclui `reached_target: bool`.

Precisa de migração: criar RPC `settle_round_atomic(p_round_id, p_payout, p_user_id)` que credita o pagamento na carteira atomicamente e cria `ledger_entries` com `kind="payout"`.

### 1.3 Migrações de banco
- Nova função RPC `settle_round_atomic` (idempotente, valida ownership, soma na carteira).
- Ajustar `start_round_atomic` para não computar payout (só debitar stake e gravar rodada).

## Parte 2 — DEMO (cliente)

### 2.1 `src/game/economy/demoRound.ts`
- `startDemoRound`: debitar somente a entrada na carteira local. Salvar `result_multiplier` e `target_barrier` na rodada ativa, mas **não** creditar payout. Não criar `pushDemoHistoryRow` ainda.
- Criar nova função `settleDemoRound(roundId, barriersPassed)`:
  - Lê multiplicador/target da rodada (precisa armazenar em algum store; atalho: passar como parâmetros vindos de `activeRoundRef.current`).
  - Se `barriersPassed >= targetBarrier`: credita `payout = stake × multiplier` na carteira, registra ledger.
  - Se não: payout = 0, nada a creditar.
  - Empurra linha no `pushDemoHistoryRow` com payout final.
  - Retorna `{ payout, netResult, reachedTarget }`.

### 2.2 `src/pages/Index.tsx` (`handleGameOver`)
- DEMO: chamar `settleDemoRound(activeRound, barriersPassed)` em vez de já assumir payout pré-calculado.
- LIVE: já chama `end-round` com `barriers_passed`. Atualizar `serverEconomy` com a resposta do `end-round` (que agora contém payout real, podendo ser 0).
- Atualizar `setServerEconomy` para usar o resultado do settle (não o `activeRoundRef.current` antigo).

## Parte 3 — UI

### 3.1 `src/components/economy/RoundSetupScreen.tsx`
Mostrar mensagem clara antes de jogar: "Você precisa atingir a meta para ganhar. Se não conseguir, perde a entrada."

### 3.2 `src/components/GameCanvas.tsx` (HUD)
- Trocar label "Ganho atual" / "Potencial" por "Meta: passar N barreiras × M.MM".
- O card central mostra o ganho **somente** se `passedNow >= targetBarrier`. Antes, mostrar "Faltam X barreiras para ganhar R$ Y,YY" em cinza.
- Quando atingir meta: card vira verde com "META BATIDA! Ganho garantido R$ Y,YY" pulsando.
- DEMO usa o mesmo padrão (skill puro).

### 3.3 `src/components/GameOverScreen.tsx`
- Mostrar bloco grande "META ATINGIDA ✓" (verde) ou "META NÃO ATINGIDA ✗" (vermelho).
- Linha clara: "Meta: 20 barreiras · Você passou: 13".
- Bloco de economia:
  - Se atingiu meta: Entrada −R$ 1,00 / Pagamento +R$ 5,00 / Lucro +R$ 4,00.
  - Se não: Entrada −R$ 1,00 / Pagamento R$ 0,00 / **Perdeu R$ 1,00** (vermelho).

## Parte 4 — Testes a atualizar

- `src/test/demoRound.test.ts` — comportamento de pagamento condicional.
- `src/test/endRoundValidation.test.ts` — payout depende de `barriers_passed`.
- `src/test/rtpSimulation.test.ts` — recalibrar RTP esperado (o RTP real vai variar com habilidade; o teste deve simular um jogador "perfeito" que sempre atinge a meta para validar a tabela).

## Arquivos modificados / criados

**Backend / banco:**
- `supabase/functions/start-round/index.ts` — não creditar payout.
- `supabase/functions/end-round/index.ts` — calcular payout baseado em `barriers_passed`.
- Migração: nova RPC `settle_round_atomic`; ajuste de `start_round_atomic`.

**Cliente:**
- `src/game/economy/demoRound.ts` — separar start/settle.
- `src/pages/Index.tsx` — `handleGameOver` chama settle e atualiza `serverEconomy`.
- `src/components/GameCanvas.tsx` — HUD orientada a meta.
- `src/components/GameOverScreen.tsx` — exibir status da meta + ganho/perda real.
- `src/components/economy/RoundSetupScreen.tsx` — aviso da regra.

**Testes:**
- `src/test/demoRound.test.ts`, `src/test/endRoundValidation.test.ts`, `src/test/rtpSimulation.test.ts`.

## Aviso

Esta é uma mudança de modelo de negócio: o jogo deixa de pagar com base em sorte e passa a depender de habilidade. Jogadores acostumados ao modelo atual perderão mais. O RTP teórico se mantém mas o RTP real será **menor** (dependente de skill).
