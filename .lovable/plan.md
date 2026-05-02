## Monte Carlo "skilled" — validação empírica do RTP da cauda (Fase 2)

### Objetivo
Validar, via simulação determinística, que a cauda de payout introduzida na Fase 2 (âncoras [22,26] → [40,50]) não estoura o RTP empírico mesmo quando o jogador é hábil e sobrevive bastante além do `target_barrier` do tier sorteado. Critério: RTP agregado fica em ~88–92% no perfil "skilled" (orçamento de cauda 6–8% acima do RTP teórico de ~85,7%).

### Por que é necessário
Hoje o `rtpSimulation.test.ts` só amostra `sampleMultiplier` puro — assume que o jogador sempre morre exatamente no `target_barrier` do tier sorteado, então valida apenas o RTP teórico (85,7%). Isso ignora completamente a cauda da Fase 2: jogadores que passam do alvo ganham mais do que a tabela teórica prevê, e precisamos provar que a escalada de dificuldade (`gap × 0.92^extra`, `speed + 15·extra`, spawn `× 0.95^extra`) compensa esse bônus.

### Modelo de jogador (probabilístico, sem física)
Em vez de simular Canvas/colisão, modelo a sobrevivência por barreira como uma probabilidade que depende apenas de skill e dificuldade efetiva:

```text
P(passa barreira i | passou i-1) = clamp(skillFactor / dificuldade(i), 0, 0.995)
```

Onde:
- `dificuldade(i)` é uma função decrescente em `gapSize(i)` e crescente em `speed(i)` — ambos extraídos diretamente de `buildLayoutRow(i, target, rng)` (mesma fonte de verdade do engine).
- `skillFactor` define o perfil:
  - `casual` ≈ 1.0 (morre próximo ao alvo)
  - `skilled` ≈ 1.4 (frequentemente passa do alvo)
  - `expert` ≈ 1.8 (vai longe na cauda)

A rodada termina na primeira barreira `i` em que o jogador falha. Payout = `multiplierForBarriers(i-1) × stake`, capado por `MAX_ROUND_PAYOUT`.

### Calibração
1. Rodar 100k rodadas com `casual` e ajustar `skillFactor` para que o RTP empírico bata o teórico (~85,7%) — confirma que o modelo está alinhado com o desenho da Fase 1.
2. Com a calibração travada, medir RTP de `skilled` e `expert` para ver onde a cauda pousa.

### Mudanças por arquivo

**Novo: `src/test/skilledRtpSimulation.test.ts`**
- Função `simulateSkilledRound(seed, skillFactor)`:
  - Sorteia tier via `sampleMultiplier` para obter `target_barrier` (do `MULTIPLIER_TIERS[k].visual.barriers_crossed`).
  - Itera `i = 1..80`, gerando `buildLayoutRow(i, target, rng)`.
  - Calcula `dificuldade(i) = (1 / gapSize) × (speed / 80)` (normalizado pela baseline).
  - Em cada barreira amostra Bernoulli com a probabilidade acima; para na primeira falha.
  - Retorna `min(MAX_ROUND_PAYOUT, multiplierForBarriers(i-1)) × stake`.
- Três suites:
  - `casual`: 100k rodadas em 10 seeds → RTP ∈ [83%, 88%] (sanity check da calibração).
  - `skilled`: 100k rodadas → RTP ∈ [85%, 92%].
  - `expert`: 100k rodadas → RTP ∈ [86%, 94%] (margem maior, mas ainda abaixo do teto operacional).
- Reporta também distribuição de barreiras alcançadas (p50, p90, p99) como diagnóstico via `console.log` no teste.

**Atualizar: `.lovable/plan.md`**
- Marcar item de Monte Carlo como concluído na seção Validação.

### Fora de escopo
- Simulação física real (Canvas + colisão de bolas) — desnecessária para a métrica de RTP.
- Mudanças na curva ou no layout — este passo é só validação. Se o teste falhar, abro um plano separado para ajustar âncoras (ex.: trocar `[30,40]` por `[30,35]` conforme o plano da Fase 2 já antecipava).
- Ajuste do rótulo do HUD do demo (item separado, fica para depois).

### Critério de aceite
- Os três blocos (`casual`/`skilled`/`expert`) passam dentro das bandas declaradas em pelo menos 9 de 10 seeds, e o RTP agregado das 100k rodadas de cada perfil cai dentro da banda. Se `expert` estourar 94%, ajusto a calibração ou abro plano de tuning das âncoras.
