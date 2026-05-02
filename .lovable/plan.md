## Objetivo

No HUD durante o jogo, exibir a **mesma "Meta máxima"** mostrada na tela de setup (entrada × meta escolhida) em vez do payout real sorteado pelo servidor. Os dois cards passam a refletir o mesmo número.

## Contexto atual

- **Setup** (`RoundSetupScreen.tsx`): mostra `metaGain = stake × meta` → ex.: R$ 1,00 × 20 = **R$ 20,00**.
- **HUD em jogo** (`GameCanvas.tsx`, linhas 362–399): mostra `livePotentialPayout = stake × result_multiplier` → ex.: R$ 1,00 × 1,50 = **R$ 1,50** (multiplicador real do servidor).
- Resultado: jogador vê R$ 20 antes de iniciar e R$ 1,50 ao começar — inconsistente.

## Mudanças

### 1. `src/pages/Index.tsx`
Passar a `meta` selecionada (target multiplier visual, ex. 20) para o `GameCanvas` junto com `stake`. Hoje só `stake` e `livePotentialPayout` chegam lá.

- Adicionar estado/prop `targetMeta` (já existe como `selectedMeta` ou similar no fluxo de start round — reaproveitar) e repassar ao `<GameCanvas targetMeta={...} />`.

### 2. `src/components/GameCanvas.tsx`
Bloco em `stake > 0 && !isDemoMode` (linhas 362–399):

- Substituir `livePotentialPayout` por `stake * targetMeta` para o número grande.
- Substituir o subtexto `×{liveRoundMultiplier} · Entrada R$ {stake}` por `×{targetMeta} · Entrada R$ {stake}`.
- Manter o rótulo "Meta da rodada" e o estado `reachedGoal` (que já é baseado em barreiras cruzadas vs. `goalBarriers`).
- Remover o badge `(máx)` do `liveIsCapped`, pois deixa de ser relevante.
- Quando `reachedGoal === true`, manter `+R$ {stake * targetMeta}` (ganho garantido = a meta).

### 3. Resultado final na tela de "round over"
Verificar (`Index.tsx` / tela de resultado) que o **payout real** continua sendo exibido corretamente no fim — esta mudança é apenas visual no HUD durante a partida; a economia e o crédito na carteira não mudam.

## Observações

- O multiplicador real do servidor (`result_multiplier`) continua sendo usado internamente para creditar a carteira. Só não é mais exibido no card grande do HUD.
- Isso significa que o jogador verá "R$ 20,00" durante toda a partida e, no fim, receberá o valor real (que pode ser menor). Convém ter clareza disso na tela de resultado — mas não faz parte deste escopo a menos que você peça.
