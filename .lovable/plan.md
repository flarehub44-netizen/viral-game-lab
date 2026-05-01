## Modelo híbrido aprovado

- **DEMO**: Skill puro fácil. Sem tabela de RTP. Sem sorteio prévio. Multiplicador final = `min(barriers × 0.05, 5.0)`. Ganho = `stake × multiplicador` direto, sem meta. Cada barreira passada já vale dinheiro.
- **LIVE**: Mantém regra atual implementada (skill puro com meta). Servidor sorteia multiplicador + meta no start, debita stake. Layout vira **calibrado** para que o jogador morra estatisticamente próximo ao `target_barrier`. Se atingir meta = paga `stake × mult`. Se não = R$ 0. Payout NÃO é imutável (continua condicionado à meta), mas o layout é desenhado para que a distribuição real de mortes faça o RTP convergir para 85.7% no agregado.

Os dois modos passam a ter UI/HUD diferentes, porque a mecânica é diferente.

---

## Parte 1 — DEMO (cliente puro)

### 1.1 `src/game/economy/demoRound.ts`
Remover `sampleMultiplier` / `computeRoundEconomy` / `mapMultiplierToLayout` do fluxo demo.

- `startDemoRound(stake)`:
  - Debita stake da carteira (igual hoje).
  - Não sorteia multiplicador. Não grava `result_multiplier`/`target_barrier`.
  - Retorna `ActiveServerRound` com `result_multiplier=0`, `target_barrier=0`, `payout_amount=0`, `max_duration_seconds=120` (longo), `layout_seed=demo:<roundId>`.
- Nova `settleDemoRound(round, barriersPassed)`:
  - `multiplier = min(barriersPassed × 0.05, 5.0)`, arredondado a 2 casas.
  - `payout = round(stake × multiplier, 2)`, capado a `MAX_ROUND_PAYOUT`.
  - Credita payout (mesmo se 0). Empurra histórico com o multiplicador realizado.
  - Retorna `{ payout, netResult, multiplier }`.

### 1.2 Layout do DEMO (novo: `src/game/economy/demoLayout.ts`)
Função `generateDemoBarrier(index)`:
- `difficulty = min(0.15 + index × 0.008, 0.40)`.
- `gapSize = lerp(0.50, 0.30, difficulty)` (30%-50%).
- `gapPosition = Math.random()`.
- `speed = 50 + index × 1.2` (cap em ~170).
- Sem dificuldade `extreme`/`very_hard`.

O engine precisa aceitar uma fonte de barreiras pluggável (ver Parte 3).

---

## Parte 2 — LIVE (servidor + cliente)

### 2.1 Layout calibrado (`src/game/economy/liveDeterministicLayout.ts`)
Trocar a curva atual por bandas baseadas em `distanceToTarget = targetBarrier - i`:

```text
> 10:  gap 0.35 + rng×0.10   (fácil)
6-10:  gap 0.22 + rng×0.10   (médio)
3-5:   gap 0.15 + rng×0.05   (difícil)
1-2:   gap 0.08 + rng×0.04   (muito difícil)
<= 0:  gap 0.04 + rng×0.03   (quase impossível)
```
Velocidade ramp: `80 + min(100, i×2.0)`.

Atualizar `liveDeterministicLayout.test.ts` para validar a curva (gap em índices `target-15`, `target`, `target+5`).

### 2.2 Backend permanece como hoje
- `start_round_atomic` + `settle_round_atomic` já implementam skill-with-target. Sem mudanças de SQL.
- `start-round` Edge: sem mudanças (já assina `layout_seed` que vai alimentar a nova curva calibrada).
- `end-round` Edge: sem mudanças (já chama `settle_round_atomic` que paga só se atingiu meta).

### 2.3 Comunicação
A resposta do `start-round` continua com `result_multiplier` e `target_barrier`. O cliente já trata isso como "alvo" desde a última iteração.

---

## Parte 3 — Engine / Canvas

### 3.1 `src/game/engine.ts` / `GravityClimb.ts`
Hoje o engine gera barreiras procedurais via `difficulty.ts` ou consome layout determinístico LIVE. Adicionar um terceiro caminho:

- Aceitar nas opções de `start({ ... })`: `barrierSource: "procedural" | "deterministic-live" | "demo-easy"`.
- `demo-easy` chama `generateDemoBarrier(index)` a cada novo spawn.
- `deterministic-live` segue como hoje, lendo do layout pré-gerado por `liveDeterministicLayout`.

### 3.2 `src/components/GameCanvas.tsx`
- Se `mode === "demo"`: passar `barrierSource="demo-easy"` e **esconder** o HUD de meta (não há meta no demo). Mostrar HUD simples: "Barreiras: N · Multiplicador atual: ×M.MM · Ganho: R$ X,XX" — atualizado em tempo real conforme `barriers × 0.05`.
- Se `mode === "live"`: manter HUD de meta como está (META BATIDA, faltam X barreiras).

### 3.3 `src/components/economy/RoundSetupScreen.tsx`
- DEMO: aviso "Modo treino. Cada barreira vale 0,05× sua entrada (até ×5,00). Sem meta — você ganha pelo que conseguir."
- LIVE: manter aviso atual ("precisa atingir a meta de N barreiras ou perde a entrada").

### 3.4 `src/components/GameOverScreen.tsx`
- DEMO: bloco "Você passou N barreiras → ×M.MM → R$ X,XX". Sem "meta atingida/não atingida".
- LIVE: manter layout atual com "META ATINGIDA ✓ / NÃO ATINGIDA ✗".

### 3.5 `src/pages/Index.tsx`
- `handleGameOver` no DEMO: chamar `settleDemoRound` (já existe) — só ajustar para usar o multiplicador linear realizado em vez de validar meta.
- LIVE: sem mudanças.

---

## Parte 4 — Testes

- `src/test/demoRound.test.ts`: reescrever para a nova fórmula linear (sem meta, sem tabela). Casos: 0 barreiras → ×0; 20 barreiras → ×1.0; 100 barreiras → ×5.0 (cap).
- `src/test/liveDeterministicLayout.test.ts`: adicionar asserts da curva por banda de distância.
- `src/test/rtpSimulation.test.ts`: simular jogador médio no LIVE com a nova curva e validar que a distribuição de mortes converge perto do `target_barrier` (RTP real ≈ tabela teórica × taxa de sucesso esperada).

---

## Arquivos modificados / criados

**Novos:**
- `src/game/economy/demoLayout.ts` — gerador de barreiras fáceis.

**Modificados:**
- `src/game/economy/demoRound.ts` — fórmula linear, remove sorteio.
- `src/game/economy/liveDeterministicLayout.ts` — bandas calibradas por distância ao alvo.
- `src/game/engine.ts` (e/ou `GravityClimb.ts`) — opção `barrierSource`.
- `src/components/GameCanvas.tsx` — HUD condicional por modo.
- `src/components/GameOverScreen.tsx` — bloco condicional por modo.
- `src/components/economy/RoundSetupScreen.tsx` — aviso por modo.
- `src/pages/Index.tsx` — passa `mode` para o engine, settle ajustado.
- Testes acima.

**Sem mudanças:**
- Backend (`start-round`, `end-round`, RPCs `start_round_atomic` / `settle_round_atomic`).

---

## Observação importante

No LIVE, mantendo a regra "não atingiu meta = R$ 0", o **RTP real** vai ficar **abaixo** de 85.7% (porque mesmo um sorteio de ×5.00 vira R$ 0 se o jogador morrer antes da meta). A tabela de 85.7% passa a ser um teto teórico — o RTP efetivo depende da habilidade média. Se quiser RTP exato de 85.7%, precisaríamos voltar para o modelo "payout imutável" (Opção A pura). Vale validar isso depois com dados reais.