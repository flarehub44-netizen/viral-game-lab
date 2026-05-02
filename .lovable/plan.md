## Problema

No modo demo, o HUD durante o jogo mostra o ganho calculado como `entrada × 0,05 × base × barreiras` (fórmula linear da base escolhida). Porém, ao terminar a rodada, a tela de fim de jogo mostra um valor diferente, porque `settleDemoRound` foi alterado para usar a curva pública `m(b)` do modo live (ignorando a base).

Resultado: o jogador vê R$ X durante o jogo e recebe R$ Y na tela final — quebra de confiança.

## Solução

Unificar o cálculo: o `settleDemoRound` deve usar **exatamente a mesma fórmula** que o HUD (`0.05 × base × barreiras`), respeitando a base escolhida pelo jogador (×2, ×5, ×10, ×20).

## Mudanças

### 1. `src/game/economy/demoRound.ts`
- Reverter `demoMultiplierFor(barriers, base)` para usar a fórmula linear: `DEMO_MULTIPLIER_PER_BARRIER_FACTOR × base × barriers` (sem cap próprio; só `MAX_ROUND_PAYOUT` no payout final).
- Remover o import de `multiplierForBarriers` que não será mais usado.
- Atualizar comentários: deixar claro que demo usa fórmula linear baseada na base, separada da curva live.

### 2. `src/test/demoRound.test.ts`
- Reescrever os testes que validavam a curva pública para validar a fórmula linear:
  - `demoMultiplierFor(20, 5)` → `5` (atinge meta em 20 barreiras)
  - `demoMultiplierFor(20, 10)` → `10`
  - `demoMultiplierFor(10, 5)` → `2.5`
  - Base passa a importar (não é ignorada)
- Manter testes de cap em `MAX_ROUND_PAYOUT` e de débito da entrada.

## Resultado

Durante e após o jogo demo, o jogador verá o mesmo valor. A consistência entre HUD e tela de fim de jogo é restaurada. Modo live permanece intocado (continua usando `multiplierForBarriers` da curva pública).