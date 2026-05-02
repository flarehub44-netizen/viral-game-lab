## Objetivo

Mostrar de forma visual, durante o jogo (live e demo), quanto cada barreira vai pagar quando for ultrapassada. Combinação de duas dicas visuais:

1. **Cor/brilho da barreira graduado** pelo multiplicador previsto naquela barreira.
2. **Etiqueta "R$ X,XX" flutuando logo acima da barreira**, atualizando ao subir.

Isso vale para todas as barreiras com valor > 0 (na live a partir da ~8ª; no demo desde a 1ª).

---

## Como funciona (regra de cor)

Cada barreira sabe sua "posição na fila" (índice). O multiplicador previsto é:

- **Live**: `multiplierForBarriers(index)` (curva pública oficial, já existe em `multiplierCurve.ts`).
- **Demo**: `0.05 × baseMult × index` (mesma fórmula que o HUD já usa).

A partir do multiplicador, escolhemos uma faixa de cor (HSL):

| Multiplicador previsto | Cor da barreira | Intensidade |
|---|---|---|
| 0 (zona morta) | cinza-escuro neutro | sem glow |
| 0 < m ≤ 0.5 | verde apagado (hue 140, 55% sat) | glow leve |
| 0.5 < m ≤ 1.5 | verde médio (hue 140, 80% sat) | glow médio |
| 1.5 < m ≤ 5 | verde-cyan (hue 160, 100%) | glow forte |
| 5 < m ≤ 20 | dourado (hue 48, 100%) | glow intenso + pulse |
| > 20 (cauda) | rosa/magenta (hue 320, 100%) | glow máximo + pulse |

A barreira ganha um leve `shadowBlur` proporcional ao tier. O "pulse" das duas faixas raras é uma oscilação sutil de brilho (já temos `performance.now()` no loop).

## Como funciona (etiqueta R$)

Para cada barreira visível na tela, desenhamos no canvas (acima da barra, alinhada ao centro do gap) um pequeno texto:

```
R$ 0,80
```

- Fonte 11px bold, tabular-nums, cor branca com `shadowBlur` na cor da barreira (legibilidade sobre qualquer fundo).
- Valor = `stake × multiplicadorPrevistoNaBarreira`, capado em `MAX_ROUND_PAYOUT`.
- Se `stake === 0` (modo sem aposta), não desenhamos a etiqueta.
- Quando a barreira é ultrapassada (`bar.passed = true`): a etiqueta vira verde-glow forte por ~250ms e some junto com a barreira.

## Mudanças no código

### 1. `src/game/engine.ts`
- Adicionar 2 campos ao tipo `Barrier`: `barrierIndex: number` (posição na sequência, = `barriersPassedCount + i` no momento do spawn) e opcional `passedAt?: number` (ms para fade da etiqueta).
- No `spawnBarrier()` (3 ramos: live com layoutPlan, demo, fallback), preencher `barrierIndex` com o índice global daquela barreira.
- Quando uma barreira é marcada `passed = true` (loop de update, ~linha 678), gravar `passedAt = performance.now()`.
- Adicionar dois novos campos no engine: `private stakeCredits = 0;` e `private demoBaseMultiplier = 0;` definidos em `start()` via novas opções `stakeCredits?: number` e `demoBaseMultiplier?: number`.
- No bloco de render das barreiras (~linhas 818–841), substituir a cor fixa `hsl(140,100%,55%)` por uma função `colorForBarrier(barrierIndex)` que devolve `{ hue, sat, light, glow, pulse }`. Aplicar `ctx.shadowColor` + `ctx.shadowBlur` antes de `fillRect` para o glow (resetar depois).
- Logo após desenhar a barra, se `stakeCredits > 0`, calcular o valor R$ e desenhar o texto com `ctx.fillText` no `(width/2, bar.y - 6)`. Se `passedAt` está dentro de 250ms, usar cor verde forte; caso contrário, branco com sombra colorida.

### 2. `src/components/GameCanvas.tsx`
- Passar `stakeCredits` e `demoBaseMultiplier` (= `demoBase`) na chamada `engine.start({...})`.
- Nada mais muda no HUD React. Os popups flutuantes existentes continuam funcionando como reforço.

### 3. (Opcional) `src/game/economy/barrierVisual.ts` (novo)
Helper isolado e testável:

```ts
export function colorForBarrier(
  barrierIndex: number,
  mode: "live" | "demo",
  demoBase: number,
): { hue: number; sat: number; light: number; glow: number; pulse: boolean }
```

Mantém a paleta acima em um único lugar e permite teste unitário simples (faixa correta para cada multiplicador).

---

## Performance

- A curva já é O(log n) leve; chamamos uma vez por barreira por frame (no máximo ~10 barreiras visíveis). Sem impacto perceptível.
- `ctx.shadowBlur` é caro se aplicado por glyph; agrupamos: setamos shadow uma vez por barreira, desenhamos retângulo + texto, resetamos.
- Texto numérico cacheado por valor não é necessário nesta escala (≤10 textos/frame).

---

## Fora de escopo

- Não vamos mudar a fórmula da curva nem o layout/dificuldade.
- Não vamos adicionar legenda/leyenda na tela (intuição visual + etiqueta R$ já comunicam).
- Não vamos animar o número da etiqueta subindo (mantido estático para legibilidade).

---

## Resultado esperado

- Live: as primeiras barreiras (índice 0–7) aparecem em cinza apagado sem etiqueta numérica significativa (R$ 0,00). A partir da 8ª, ficam verdes claras e com R$ baixo. Por volta da 67–87 viram verde-cyan brilhante com R$ médio, e perto da 97–110 viram douradas pulsantes mostrando R$ alto.
- Demo: já desde a 1ª barreira aparece a etiqueta com o R$ subindo de forma linear; as cores acompanham os mesmos thresholds.
