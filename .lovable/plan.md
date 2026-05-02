## Objetivo

Estender o "comprimento" do jogo: hoje a curva termina em **60 barreiras** (cap ×50). Vamos esticá-la para **200 barreiras**, mantendo o mesmo RTP-alvo (~78–80%) e a mesma forma da curva, só que ~3,3× mais longa. Isso exige ajustar 3 eixos juntos: **curva**, **dificuldade do layout** e **duração máxima da rodada**.

## Princípio de escala

Fator de escala `S = 200 / 60 ≈ 3.33`. Aplicamos S a:
- âncoras de barreira da curva (`MULTIPLIER_CURVE_ANCHORS`)
- alvo de morte de cada tier (`visual.barriers_crossed`)
- duração visual de cada tier (`visual.duration_seconds`)
- janela `max_duration_seconds` no servidor

Para a dificuldade não explodir, **suavizamos** a rampa do layout proporcionalmente (a "easy zone" precisa cobrir muito mais barreiras antes do alvo).

---

## 1. Curva de multiplicadores (cliente + servidor + SQL)

Arquivos espelhados — mudar os 3:
- `src/game/economy/multiplierCurve.ts`
- `supabase/functions/_shared/multiplierCurve.ts`
- `supabase/migrations/<novo>.sql` recriando `compute_multiplier_for_barrier`

Novas âncoras (barreira, multiplicador) — mesma forma, eixo X esticado:

```text
[0,0] [7,0] [17,0.5] [27,0.8] [37,1.0] [47,1.2] [57,1.5]
[67,2.0] [77,3.0] [87,5.0] [97,10.0] [100,20.0]
[110,26.0] [127,32.0] [150,40.0] [200,50.0]
```

`MULTIPLIER_CURVE_HARD_CAP` permanece **50** (o teto absoluto continua sendo `MAX_ROUND_PAYOUT=400`).

## 2. Tabela de tiers (cliente + servidor)

Arquivos espelhados:
- `src/game/economy/multiplierTable.ts`
- `supabase/functions/_shared/multiplierTable.ts`

Para cada tier multiplicar `visual.barriers_crossed` e `visual.duration_seconds` por ~3,33 (arredondando):

| mult | barriers (atual → novo) | duration s (atual → novo) |
|---|---|---|
| ×0    | 2  → 7   | 9  → 30 |
| ×0.5  | 5  → 17  | 18 → 60 |
| ×0.8  | 8  → 27  | 24 → 80 |
| ×1.0  | 11 → 37  | 30 → 100 |
| ×1.2  | 14 → 47  | 36 → 120 |
| ×1.5  | 17 → 57  | 42 → 140 |
| ×2.0  | 20 → 67  | 48 → 160 |
| ×3.0  | 23 → 77  | 57 → 190 |
| ×5.0  | 26 → 87  | 68 → 220 |
| ×10   | 29 → 97  | 78 → 260 |
| ×20   | 30 → 100 | 87 → 290 |

Probabilidades **não mudam** — RTP teórico continua ≈ 85,7%.

## 3. Layout (dificuldade) — `src/game/economy/liveDeterministicLayout.ts`

A função `buildLayoutRow` hoje classifica zonas pela **distância ao alvo** com limiares fixos (10/5/2). Esses limiares precisam crescer junto com S, senão o jogador entra na zona "extreme" cedo demais (alvo agora pode ser 100). Novos limiares:

```text
distanceToTarget > 33  → easy   (gap 0.35–0.45)
distanceToTarget > 17  → medium (gap 0.22–0.32)
distanceToTarget > 7   → hard   (gap 0.15–0.20)
distanceToTarget > 0   → very_hard (gap 0.08–0.12)
distanceToTarget ≤ 0   → extreme  (gap 0.04–0.07)
```

Speed ramp (hoje `80 + min(100, index*2.0)`): suavizar para escalada mais longa →  
`speed = 80 + min(140, index * 0.7)` (teto sobe de 180 para 220, mas demora muito mais para chegar).

Fase 2 (pós-alvo) permanece igual em **forma**, mas suavizamos o passo:
- `PHASE2_GAP_DECAY`: 0.92 → **0.96** (decai mais devagar por barreira extra)
- `PHASE2_SPEED_STEP`: 15 → **6** (acréscimo por barreira extra)
- `PHASE2_SPEED_CEIL`: 320 → **300**
- `PHASE2_GAP_FLOOR`: 0.025 (mantém)

`generateDeterministicLayout(..., count = 80)` → aumentar default para **220** (cobre os 200 + cauda).

## 4. Duração máxima da rodada (servidor)

Hoje `max_duration_seconds` vem de `mapMultiplierToLayout()` em `start-round` (provavelmente derivado de `visual.duration_seconds`). Como dobramos as durações na tabela de tiers, o teto natural sobe.

A constraint do banco é `max_duration_seconds BETWEEN 5 AND 600`. O novo máximo (×20 → 290s) cabe — **não precisa migration de constraint**.

Verificar/ajustar `mapMultiplierToLayout` em `supabase/functions/start-round/` para usar `visual.duration_seconds` (já atualizado) + uma folga (ex.: `+30s`).

## 5. Engine — verificações

`src/game/engine.ts` precisa aguentar rodadas mais longas:
- Caps internos (`max balls = 128`, `max barriers gerados`) — confirmar que o engine já gera barreiras infinitamente via `buildLayoutRow` (o código atual já faz isso para continuidade pós-`count`).
- `RoundScript.barriers_crossed`/`score_target`/`duration_seconds` no modo "reveal" — já parametrizado pelo `visual_result`, então herda os novos valores automaticamente.

## 6. Testes a atualizar

- `src/test/skilledRtpSimulation.test.ts` — `MAX_BARRIERS_SIMULATED` 80 → **220**, e recalibrar `skillFactor` dos perfis (provavelmente cair: jogo mais longo = mais oportunidades de morrer). Rodar Monte Carlo para encontrar novas bandas e atualizar `PROFILES.rtpMin/rtpMax`.
- `src/game/economy/multiplierCurve.test.ts` — atualizar valores esperados em pontos âncora.
- `src/game/economy/multiplierTable.test.ts` — atualizar `barriers_crossed` esperados por tier.
- `src/game/economy/phase2Layout.test.ts` — ajustar expectativas com novos `PHASE2_*`.
- `scripts/check-multiplier-sync.js` continua funcionando (checa só a igualdade entre cliente/servidor).

## 7. Migration SQL

Novo arquivo `supabase/migrations/<timestamp>_curve_extended_200.sql`:
- `CREATE OR REPLACE FUNCTION public.compute_multiplier_for_barrier` com as novas 16 âncoras.
- `IMMUTABLE`, `SET search_path = public`.

## Riscos / observações

- **RTP empírico** vai cair um pouco (curva mais longa = jogador morre estatisticamente antes do alvo com mais frequência). Esperado: ~75–78% no perfil casual. Se cair muito, suavizamos os limiares de zona ou empurramos os primeiros âncoras um pouco para a esquerda.
- **Sensação de jogo**: rodadas até **5 minutos** (×20). Confirmar se isso é desejável — se preferir teto menor, comprimimos a parte alta da curva (ex.: alvo do ×20 em 80 ao invés de 100, cap de duração em 200s).
- **Cauda extrema**: chegar em ×50 exige passar 200 barreiras. Com a Fase 2 suavizada, ainda é possível para experts; se quiser tornar quase impossível, basta apertar `PHASE2_GAP_DECAY` de volta para ~0.93.

## Ordem de execução

1. Migration SQL (curva)
2. Espelhos `multiplierCurve.ts` (cliente + edge)
3. Espelhos `multiplierTable.ts` (cliente + edge)
4. `liveDeterministicLayout.ts` (zonas + Fase 2 + count default)
5. Confirmar `mapMultiplierToLayout` no `start-round` usa `visual.duration_seconds`
6. Atualizar testes e rodar Monte Carlo para recalibrar bandas de RTP
