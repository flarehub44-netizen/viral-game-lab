## Fase 2 — Escalada pós-alvo (sutil, sem indicador visual)

### Objetivo
Quando o jogador passar do `deathTargetBarrier`, o layout fica progressivamente mais difícil (gap menor, velocidade maior, spawn mais rápido) e a curva de payout ganha uma cauda controlada — sem cap forçado, sem aviso visual. O game over só acontece quando todas as bolas morrem.

### Parâmetros (perfil "Médio" já aprovado)
- `gap` × `0.92^extra` por barreira além do alvo (≈ −8% por barreira)
- `speed` += `15 px/s` por barreira além do alvo
- `spawnEvery` × `0.95^extra` (mínimo 0.45s) — acelera a cadência
- Pisos de segurança: `gap ≥ 0.025`, `speed ≤ 320 px/s`

### Curva de payout — cauda
A curva `multiplierForBarriers` hoje satura em `b ≥ 20`. Vamos estender:

```text
âncoras atuais  → ... [19, 10] [20, 20]
nova cauda      →     [22, 26] [25, 32] [30, 40] [40, 50]  // crescimento côncavo
HARD_CAP        →     50  (era 20)
```

Crescimento côncavo (raiz) acima do alvo do tier 20×, contribuindo ~6–8% do RTP via "tail bonus". `MAX_PAYOUT=400` continua sendo o teto absoluto no settle.

### Mudanças por arquivo

**`src/game/economy/multiplierCurve.ts`** (+ espelho em `supabase/functions/_shared/multiplierCurve.ts`)
- Adicionar âncoras de cauda; subir `MULTIPLIER_CURVE_HARD_CAP` para 50.
- Manter `m(target_do_tier_X) === tier_X.multiplier` (RTP base intocado).
- Atualizar testes de unidade da curva.

**`src/game/economy/liveDeterministicLayout.ts`**
- Subir `count` default de 50 → 80 (suporta jogadores que vão muito além).
- Para `i > targetBarrier`, computar `extra = i - targetBarrier` e aplicar:
  - `gapSize = max(0.025, baseExtremeGap × 0.92^extra)`
  - `speed = min(320, baseSpeed + 15 × extra)`
- Manter difficulty `"extreme"` no telemetry para essas linhas.

**`src/game/engine.ts`**
- No `spawnBarrier` (modo live), quando `layoutCursor >= layoutPlan.length`, gerar barreira procedural com a mesma fórmula de escalada (continuidade infinita em vez de cair no fallback antigo).
- Acelerar `nextSpawnIn` quando `barriersPassedCount > targetBarrier`: multiplicar por `0.95^extra` com piso 0.45s.
- Nada de mudança de cor/HUD: visibilidade da fase 2 é sutil (escolha aprovada).

**`supabase/migrations/*` — função `compute_multiplier_for_barrier`**
- Espelhar a nova curva (mesmas âncoras + cap 50). Sem mudança de schema.

**`supabase/functions/_shared/multiplierTable.ts`**
- Sem mudança nos tiers (RTP base preservado). Comentário explicando que a cauda é bônus de skill.

### Validação
- `multiplierCurve.test.ts`: novos casos para `b=22, 25, 30, 40, 50, 60` (satura no cap).
- Novo `phase2Layout.test.ts`: confere que para `extra=1..10`, `gap` e `speed` respeitam piso/teto e a forma esperada.
- Atualizar `rtpSimulation.test.ts` (Monte Carlo) com perfil de jogador "skilled" que sobrevive +N barreiras: confirma que RTP empírico fica em ~88–92% no pior caso (dentro do orçamento de cauda 6–8%).

### Fora de escopo
- Nenhum indicador visual de fase 2 (decisão do usuário).
- Sem mudança no fluxo `start-round` / `end-round` (continua Fase 1).
- Nada no demo: ele já é "skill puro" sem alvo.

### Risco e mitigação
- **RTP runaway**: pisos de gap/speed + `MAX_PAYOUT=400` por rodada limitam dano. Monte Carlo valida.
- **Cauda muito generosa**: se o teste mostrar RTP > 92%, ajustar âncoras para crescimento mais côncavo (ex.: `[30, 35]` em vez de `[30, 40]`).
- **Performance**: subir `count` para 80 é trivial (rodada média não chega a 30).