## Problema

Na captura enviada o HUD mostra `R$ 0,00` e `×0.00` mesmo com 13 fases passadas. Causa raiz:

1. O engine só preenche `stats.currentMultiplier` quando `finalMultiplier > 0` (linha 699 de `engine.ts`). Em rodadas demo com multiplicador resultado **0** (perda), nunca há ganho ao vivo — fica zerado a rodada inteira.
2. Quando `barriersPassed > targetBarrier` (no print 13/4) a interpolação interna do engine pode ficar travada/saturada.
3. O HUD novo está 100% acoplado a `stats.currentMultiplier`, então herda os dois bugs.

## Correção

Calcular o multiplicador exibido no próprio `GameCanvas.tsx`, em camadas, **sem mexer no engine** (mantém pureza e contratos servidor-first):

1. **Camada A — engine real**: se `stats.currentMultiplier > 0`, usar esse valor (caminho ideal, rodadas vencedoras).
2. **Camada B — interpolação do resultado**: se for rodada com `resultMultiplier > 0` mas o engine ainda não emitiu, calcular `min(1, barriersPassed / targetBarrier) × resultMultiplier`.
3. **Camada C — preview otimista**: se a rodada é perdedora (`resultMultiplier = 0`), mostrar uma **previsão** baseada em `targetMultiplier` (ex.: 20×) com cor neutra/cinza e label "Potencial", para que o jogador veja progresso visual mesmo perdendo. Quando o jogo terminar a tela de Game Over já mostra o resultado real (R$ 0).

Cores:
- Verde neon: ganho > entrada (lucro real).
- Amarelo: ganho > 0 mas < entrada.
- Cinza com label "potencial": modo preview (rodada perdedora ainda em curso).
- Branco neutro: zero absoluto (antes da 1ª fase).

Também trocar o rótulo "Fase X / Y" para não mostrar `13 / 4` quando passa do alvo — usar `min(passed, target)` ou ocultar denominador quando ultrapassa.

## Arquivos

- `src/components/GameCanvas.tsx` — adicionar fallback de multiplicador (camadas A/B/C), label "Potencial" quando preview, clamp do contador de fases.

Sem mudanças em engine, economia, backend, ou outros componentes.
