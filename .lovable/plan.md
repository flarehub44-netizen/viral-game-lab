## Objetivo

Eliminar TODA exposição visual de "zonas" e "fases" (DEMO e LIVE) e transformar o DEMO em jogo de habilidade puro: barreiras aleatórias, fáceis, multiplicador = `barreiras × 0.05` (cap ×5), encerra apenas quando todas as bolinhas morrem. LIVE continua com layout determinístico, mas sem qualquer rótulo de zona/fase e com cor única (verde neon).

## Parte 1 — Remover zonas/fases visuais

**`src/components/ZoneTransition.tsx`** — deletar arquivo.

**`src/components/ClimbHUD.tsx`** — deletar arquivo (verificar com `rg` se está importado em algum lugar; remover import se houver).

**`src/components/GameCanvas.tsx`**:
- Remover import e uso de `ZoneTransition` (linha 8 e 406).
- Remover bloco "Fase {phaseDisplay}" do HUD (linha 333-335) e a variável `phaseDisplay` (linhas 116-119).
- Nos popups de barreira passada, trocar `Fase {w.barrier}` por `Barreira {w.barrier}` (linha 400).
- Manter contadores internos de barreiras (`stats.barriersPassed`) — só remover o vocabulário "Fase".

**`src/components/GameOverScreen.tsx`**:
- Remover props `climbZone` e `climbMultiplier` (linhas 22-23, 41-42).
- Remover bloco que renderiza "Zona alcançada" e "Multiplicador final visual" (linhas 137-143).
- Manter `barriersPassed` mas exibir como "Barreiras: N" em vez do bloco antigo, em uma linha simples ao lado de Combo/Tempo (no LIVE, o bloco `serverEconomy` continua mostrando multiplicador correto).

**`src/pages/Index.tsx`**:
- Remover `climbZone={lastStats.currentZone}` e `climbMultiplier={lastStats.currentMultiplier}` da chamada de `GameOverScreen` (linhas 741-742). Manter `barriersPassed`.
- Manter o registro interno `finalZone: stats.currentZone` em `applyRound` (linha 490) — é só dado interno de progressão, nunca exibido.

**`src/game/engine.ts`**:
- Manter `currentZone` / `nextZoneThreshold` no `PublicGameStats` (são usados internamente para tint/decisões), mas garantir que NENHUM componente visual os consome (já feito acima).
- Remover o "Multiplier zone tint" (linha ~796) — não pintar o canvas com cor de zona; usar sempre verde neon.
- Forçar cor de barreira fixa verde neon (`hsl(140 90% 55%)` ou `#00ff88`) no `spawnBarrier` / render — sem variação por zona.

## Parte 2 — DEMO skill puro

**`src/pages/Index.tsx`** (linhas 709-723) — quando `isDemo`:
- Passar `visualScript={null}` (já está).
- `allowScriptTerminate={false}` (já está) — DEMO encerra só quando `alive === 0`.
- NÃO passar `targetBarrier`, `layoutPlan`, `resultMultiplier` (passar `undefined`/`null`).
- Passar `mode="demo"` (já está).
- `stakeCredits` continua passando para que o cálculo de `liveMultiplier` no HUD use a regra DEMO (ver abaixo). Alternativa: passar `stakeCredits={0}` para esconder bloco "Ganho atual" (não há aposta real). **Decisão: passar `stakeCredits={0}`** — DEMO não tem dinheiro, HUD mostra só multiplicador, bolinhas e barreiras conforme spec.

**`src/components/GameCanvas.tsx`** — quando `mode === "demo"`:
- Calcular multiplicador como `Math.min(passedNow * 0.05, 5)` localmente (ignora `stats.currentMultiplier`, `resultMultiplier`, `targetMultiplier`).
- HUD central: quando `mode === "demo"` mostrar caixa simplificada com "MODO DEMO", `×{mult.toFixed(2)}`, sem linhas de R$/entrada.
- Quando `mode === "live"`: manter o HUD atual (já mostra ganho em R$, multiplicador, entrada) mas sem "Fase".

**`src/game/engine.ts`** — modo demo (skill-based, sem script):
- Em `spawnBarrier`, quando `this.mode === "demo"` e não há `script`/`layoutPlan`:
  - `gapSize = lerp(0.50, 0.30, difficulty)` onde `difficulty = min(0.45, 0.15 + barrierIndex * 0.01)`.
  - `gapPosition = Math.random()`.
  - `speed = min(140, 60 + barrierIndex * 1.5)` px/s.
  - cor fixa verde neon.
- LIVE (com `layoutPlan` ou `script`): manter geração determinística atual, só forçar cor verde neon e remover qualquer log/tint de zona.
- Confirmar que DEMO termina via `onGameOver` apenas quando `alive === 0` (já é o comportamento padrão quando `allowScriptTerminate=false` e sem `script`).

## Parte 3 — Limpeza de vocabulário

`rg -i "zona|fase " src/` após as mudanças deve retornar zero ocorrências em componentes/páginas (apenas `zoneCalculator.ts`, `progression.ts`, `engine.ts` internos).

## Arquivos modificados

- `src/components/GameCanvas.tsx`
- `src/components/GameOverScreen.tsx`
- `src/pages/Index.tsx`
- `src/game/engine.ts`

## Arquivos deletados

- `src/components/ZoneTransition.tsx`
- `src/components/ClimbHUD.tsx` (após verificar não há imports)

## Não alterado

- `src/game/economy/zoneCalculator.ts` — segue existindo só como utilitário interno (RTP/calibração), não é importado por nenhum componente visual.
- `src/game/economy/liveDeterministicLayout.ts` — segue gerando layout do LIVE.
- `src/game/progression.ts` — `bestZone`/`zonesReachedCount` continuam como métricas internas (não exibidas).
- Backend / Edge Functions — sem mudanças.

## Validação pós-implementação

- DEMO: jogar → multiplicador sobe ×0.05 por barreira até cap ×5, termina quando bolinhas acabam, HUD mostra só multiplier/bolinhas/barreiras, sem "Zona"/"Fase".
- LIVE: rodada continua determinística, GameOverScreen mostra economia mas não menciona zona, canvas verde uniforme.
- `rg -i "Zona |Fase " src/components src/pages` retorna vazio.
