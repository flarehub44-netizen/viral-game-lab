
# Fase 1 — Multiplicador determinístico pré-alvo

## Objetivo

Trocar o "reveal mode" (jogo termina forçadamente quando bate `barriers_crossed`) por um modelo onde:

1. Servidor sorteia o **tier** (multiplicador) usando a `MULTIPLIER_TIERS` atual — **RTP teórico 85,7% preservado**.
2. Tier mapeia para um `death_target_barrier` (alvo estatístico de morte).
3. Layout determinístico via `layout_seed` + dificuldade calibrada para que **a morte natural aconteça em torno do alvo**.
4. Jogo termina **só quando `aliveBalls === 0`**.
5. Payout = `stake × m(barriers_passed)`, onde `m(b)` é uma curva pública e auditável.
6. Sem indicador visual de fase 2 (decisão do usuário) — esta fase 1 nem implementa fase 2.

Fora de escopo: escalada de dificuldade pós-alvo (fase 2), end-round condicional, débito no end-round. Esses ficam para iterações seguintes.

## Mudança comportamental

| Antes | Depois (Fase 1) |
|---|---|
| Tier sorteia multiplicador → payout fixo | Tier sorteia multiplicador → vira **alvo estatístico de morte** |
| Engine força game over no `barriers_crossed` | Engine roda até `aliveBalls === 0` |
| Payout independe de quantas barreiras passou de fato | Payout = `stake × m(barriers_passed_real)` |
| Cliente recebe `visual_result` pronto | Cliente recebe `layout_seed`, `death_target`, params da curva `m(b)` |
| RTP empírico = teórico (porque payout não varia) | RTP empírico converge ao teórico via calibração da dificuldade |

## Arquitetura

### Servidor (`supabase/functions/start-round`)

1. Continua sorteando `resultMultiplier` via `sampleMultiplier()` (sem mudança na tabela).
2. Mapeia `resultMultiplier → death_target_barrier` (mesma função `mapMultiplierToLayout`, renomeada).
3. **Não calcula `payout` no start-round.** Em vez disso, devolve:
   - `layout_seed`, `layout_signature` (já existe)
   - `death_target_barrier`
   - `multiplier_curve_params` (coeficientes da `m(b)`)
   - `max_payout_cap` (R$ 400)
   - `tier_reference` (só pra debug/auditoria, não usado no payout)
4. `start_round_atomic` continua debitando o stake (decisão de mover débito pro end-round fica pra fase 2).
5. Grava `result_multiplier` apenas como referência teórica do tier sorteado, não como payout final.

### Curva de multiplicador `m(b)`

Função pública, mesma no cliente e no servidor:

```
m(b) = base + slope × b^exponent
defaults: base = 0, slope = 0.045, exponent = 1.35
```

Cap: `m(b) ≤ tier_max_multiplier × 1.05` (margem de 5% só pra evitar borda).

A curva é **idêntica para todos os rounds**. O que muda por round é o `death_target_barrier` — calibrado para que `m(death_target) ≈ tier_multiplier`.

Validação: `m(death_target_barrier_para_tier_X) ≈ multiplier_do_tier_X` deve passar em teste unitário.

### Calibração da dificuldade no engine

Hoje o engine usa `getDifficultySnapshot(elapsed)` (curva temporal por onda). Precisa virar:

```
difficulty(elapsed, barriersPassed, deathTarget) =
   baseDifficulty(elapsed) × calibrationFactor(deathTarget)
```

Onde `calibrationFactor` é tal que a probabilidade de morrer em torno de `deathTarget` é máxima. Ajuste fino vem da simulação Monte Carlo.

Inicialmente: usar tabela empírica simples `deathTarget → { gapMultiplier, speedMultiplier, spawnIntervalMultiplier }`, calibrada por simulação offline. Sem escalada pós-alvo nesta fase — depois de `deathTarget`, dificuldade continua igual (jogador bom vai eventualmente morrer pela aleatoriedade).

### Engine (`src/game/engine.ts`)

1. Substituir `RoundScript` por `RoundConfig`:
   ```ts
   interface RoundConfig {
     layoutSeed: string;
     deathTargetBarrier: number;
     multiplierCurve: { base: number; slope: number; exponent: number; cap: number };
   }
   ```
2. Remover `shouldTerminateScriptRound` e a chamada que termina por `barriersPassedCount >= script.barriers_crossed`.
3. Game over agora só por `aliveBalls === 0` (ou abandono manual).
4. Aplicar `calibrationFactor(deathTarget)` em `getDifficultySnapshot`.
5. Expor `currentMultiplier = m(barriersPassed)` em `PublicGameStats` (HUD já mostra; só mudar fonte).

### Layout determinístico

Hoje o layout é gerado parcialmente determinístico via `layout_seed`. Garantir que:
- Mesmo seed + mesma `calibrationFactor` → mesma sequência de barreiras (gaps, posições, velocidades).
- Servidor pode replayar o layout pra validar `barriers_passed` reportado.

### End-round (`supabase/functions/submit-score` ou novo `end-round`)

1. Cliente envia: `round_id`, `barriers_passed`, `elapsed_seconds`, `death_position`, `client_report` (telemetria).
2. Servidor:
   - Carrega round (status='open').
   - Recomputa layout via `layout_seed` (sanity check: `barriers_passed` é fisicamente plausível?).
   - Calcula `payout = min(stake × m(barriers_passed), MAX_PAYOUT)`.
   - Credita payout via `end_round_atomic` (novo RPC) — debita já foi no start.
   - Marca `round_status='closed'`.
3. Anti-cheat: jogadores com `barriers_passed` consistentemente acima do esperado entram em fila de auditoria (telemetria, não bloqueio automático).

### Cliente

- `src/game/economy/serverRound.ts` ganha campos `death_target_barrier`, `multiplier_curve`.
- `src/game/economy/demoRound.ts` espelha a mesma lógica (curve + calibration table).
- `Index.tsx` passa `RoundConfig` em vez de `visualScript` para `GameCanvas`.
- HUD: `currentMultiplier` agora é dinâmico (já é, só muda a fonte).

## Calibração e simulação (entregável crítico)

Criar `src/test/rtpSimulation.test.ts` (ou expandir o existente) com:

1. Simulação de jogador idealizado modelado por `reaction_time_ms` (3 perfis: 250ms ruim, 180ms médio, 120ms bom).
2. Para cada tier, rodar 10k rodadas → medir distribuição de `barriers_passed`.
3. Ajustar `calibrationFactor(deathTarget)` até que a média de `barriers_passed` para o jogador médio ≈ `deathTarget`.
4. Validar RTP global ponderado: `Σ P(tier) × E[m(barriers_passed) | tier] ≈ 0.857 ± 0.02`.
5. Validar RTP por perfil: ruim ≥ 0.70, bom ≤ 0.95.

Esse teste roda no CI e bloqueia PR se RTP sair do range.

## Banco de dados

Nenhuma alteração de schema obrigatória nesta fase. `game_rounds.payout` e `net_result` ficam `NULL` até o end-round. `round_status` já existe (`open`/`closed`).

Opcional (recomendado): migration adicionando colunas `death_target_barrier int`, `barriers_passed_actual int` em `game_rounds` para auditoria.

## Risco de regressão

- **Demo mode** precisa ser portado em paralelo (mesma lógica). Senão demo continua reveal mode e online é novo modelo — divergência ruim.
- **Rounds abertos no momento do deploy** podem quebrar. Mitigação: migration que fecha rounds com `status='open'` mais antigos que 1h, ou flag de feature.
- **Anti-cheat** fica mais frouxo nesta fase (validação de `barriers_passed` é por replay aproximado). Aceitável pra MVP, endurecer na fase 2.

## Telemetria pós-deploy

Dashboard (mesmo informal, query SQL) acompanhando por 1 semana após release:
- RTP empírico real por dia.
- Distribuição de `barriers_passed` por tier vs. esperado.
- % de rounds onde `barriers_passed > death_target × 1.5` (sinal de jogador bom ou exploit).
- Payout médio por usuário (top 1% — flag pra revisão).

## Checklist de implementação

1. Criar `src/game/economy/multiplierCurve.ts` com `m(b)` e tipos `RoundConfig`.
2. Criar `supabase/functions/_shared/multiplierCurve.ts` (espelho).
3. Adicionar tabela de calibração `calibrationByDeathTarget` (cliente + servidor espelhados).
4. Refatorar `start-round` para devolver `RoundConfig` em vez de `visual_result` payout-fixo.
5. Refatorar `engine.ts`: remover terminação forçada, usar `calibrationFactor`, expor `currentMultiplier` dinâmico.
6. Criar Edge Function `end-round` (ou estender `submit-score`) com cálculo de payout no fechamento.
7. Criar RPC `end_round_atomic`.
8. Portar `demoRound.ts` para o novo modelo.
9. Atualizar `Index.tsx` e `GameCanvas.tsx` para o novo contrato.
10. Escrever simulação Monte Carlo + teste de RTP no CI.
11. Calibrar tabela `calibrationByDeathTarget` rodando a simulação iterativamente até RTP ≈ 85,7%.
12. Adicionar migration opcional com colunas de auditoria.
13. Smoke test E2E: rodar 1 round demo + 1 round online ponta a ponta.
14. Telemetria: query SQL salva em `docs/` para acompanhar RTP empírico.

## O que fica pra fase 2

- Escalada de dificuldade pós-alvo (`-8% gap, +15 px/s` por barreira excedente).
- Indicador visual sutil (você escolheu "sem indicador" — então essa fase 2 só ganha a escalada matemática).
- Débito do stake movido pro end-round (em vez de start-round).
- End-round condicional (payout só se atingiu o alvo).
- Endurecimento do anti-cheat (validação física estrita).
