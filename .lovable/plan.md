# Plano

## Problema 1 — Saldo da bolinha vs. ganho atual divergem (demo e sandbox)

**Causa raiz**: existe um off-by-one entre o índice da barreira e a contagem do HUD.

- `barrierIndex` em `engine.ts` é **0-based** (a 1ª barreira tem `barrierIndex = 0`, a 37ª tem `barrierIndex = 36`).
- `barriersPassedCount` é uma **contagem** (1-based: vira 1 após passar a 1ª barreira).
- O HUD/popup "Ganho atual" usa `barriersPassed` direto na fórmula `0,05 × base × max(0, count − 7)`.
- As **etiquetas R$** desenhadas em cada barreira usam `predictedMultiplier(barrierIndex, …)` em `barrierVisual.ts`, que aplica `max(0, idx − 7)` sobre o índice 0-based.

Resultado: a etiqueta R$ desenhada **na própria barreira que o jogador vai cruzar** mostra o valor de **uma barreira a menos** do que o HUD exibe depois de cruzá-la. Isso é exatamente o que aparece na imagem 1 (HUD R$375 enquanto as próximas barreiras mostram R$412,50 / R$425 / R$437,50 / R$450 — sequência deslocada).

**Correção**: alinhar `predictedMultiplier` para usar a mesma semântica do HUD (contagem 1-based). Como a etiqueta numa barreira deve representar o valor que o jogador terá **após cruzá-la**, basta tratar `barrierIndex` como `barrierIndex + 1`.

```ts
// src/game/economy/barrierVisual.ts
export function predictedMultiplier(
  barrierIndex: number,
  mode: "live" | "demo",
  demoBase: number,
): number {
  // barrierIndex é 0-based no engine; para alinhar com o HUD (que usa
  // barriersPassedCount, 1-based), usamos a contagem equivalente após
  // cruzar esta barreira.
  const passedAfter = Math.floor(barrierIndex) + 1;
  if (mode === "demo") {
    const effective = Math.max(0, passedAfter - DEMO_FREE_BARRIERS);
    return DEMO_PER_BARRIER_FACTOR * demoBase * effective;
  }
  return multiplierForBarriers(passedAfter);
}
```

Isso conserta os 3 lugares afetados: cor/glow da barreira, etiqueta R$ na barreira, e mantém o HUD coerente com o que vai entrar no saldo. Aplica-se igualmente a demo, sandbox e live (mesma fonte de verdade visual).

Também simplifico/alinho os popups flutuantes em `GameCanvas.tsx` que recalculam o multiplicador localmente: já estão corretos (usam `barriersPassed`), só vou conferir que a fórmula bate (não muda nada substantivo).

## Problema 2 — Remover badge "SANDBOX" do canto superior esquerdo

Em `src/pages/admin/AdminSandbox.tsx` (linhas ~125–134) há uma `div` que renderiza a tag roxa "SANDBOX" sobre o canvas durante o jogo (a da imagem 2). Vou removê-la por completo.

## Arquivos a alterar

- `src/game/economy/barrierVisual.ts` — corrigir `predictedMultiplier` (off-by-one).
- `src/pages/admin/AdminSandbox.tsx` — remover o bloco do badge SANDBOX no canvas.

Sem mudanças em backend, schema ou testes (a fórmula do `demoMultiplierFor` que liquida a rodada continua usando `barriersPassed` 1-based, então o saldo creditado já corresponderá ao valor anunciado pela última etiqueta cruzada).
