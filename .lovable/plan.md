## Popup obrigatório de multiplicador no final da rodada

Hoje, ao terminar a rodada, o jogo já pula direto para a tela "Fim de Jogo". Quando o jogador atinge a meta, um popup de "Meta batida!" aparece sobreposto à tela final, mas ele se fecha sozinho em ~2 s e também fecha se clicar em qualquer lugar.

A nova regra: sempre que o jogador **ganhar um multiplicador** (= teve pagamento > 0 na rodada), exibir antes da tela "Fim de Jogo" um popup com a mensagem **"Parabéns! Você ganhou um Multiplicador de X%"** que **só fecha clicando no botão "Fechar"**.

### Mudanças

**1. `src/components/GoalReachedPopup.tsx`** — virar modal travado:
- Remover o `setTimeout` de auto-dismiss e o `onClick` do overlay.
- Adicionar `aria-modal="true"`.
- Trocar o texto/layout para a mensagem solicitada: "Parabéns!" + "Você ganhou um multiplicador de" + valor em **%** (ex.: ×1.50 → **150%**).
- Botão único "Fechar" no rodapé do card; é o único caminho para sair.
- Continua mostrando o multiplicador em ×N e o número de barreiras como subtítulo, para o jogador entender o que rendeu o ganho.

**2. `src/pages/Index.tsx`** — mostrar popup **antes** da tela final:
- Em `handleGameOver`, em vez de chamar `setScreen("over")` imediatamente e depois `setGoalPopup(...)`, fazer:
  - Se houve ganho (`payout > 0` no demo, ou `barriers >= target_barrier` no live), guardar o popup em estado e **adiar** o `setScreen("over")`.
  - Quando o usuário clicar em "Fechar", o handler do popup chama `setScreen("over")` + `setGoalPopup(null)`.
  - Se não houve ganho (perdeu), continua indo direto para "Fim de Jogo" como hoje.
- Critério de "ganhou": ampliar a condição atual (que hoje só dispara quando atinge a meta exata) para qualquer rodada com `resultMultiplier > 0` / `payout > 0`. Assim cobre os ganhos parciais da nova curva (×0.5, ×0.8, ×1.0 etc).
- Tela intermediária visível durante o popup: fundo do canvas pausado (já fica nesse estado quando o engine para). O popup fica sobre um overlay escuro, então o jogador não vê a tela "Fim de Jogo" por trás — vê apenas a parada do jogo com o modal.

### Detalhes técnicos

- O popup também é o gatilho de transição: `onContinue` dispara `setScreen("over")` em vez de só fechar o popup.
- Como o popup pode aparecer em demo e em live, a condição é uniforme: usar o `resultMultiplier` calculado pelo `serverRound` / `demoRound`. Isso já existe no estado local de `handleGameOver`.
- A formatação em porcentagem é `Math.round(multiplier * 100)`. Mantemos o ×N.NN abaixo como referência técnica.
- Sem mudança em backend, banco ou edge functions.

### Arquivos afetados

- `src/components/GoalReachedPopup.tsx` — modal travado, novo conteúdo.
- `src/pages/Index.tsx` — adiar `setScreen("over")` até o popup fechar; ampliar critério para "ganhou multiplicador".

### Fora de escopo

- Som / animação de celebração extra.
- Tipos diferentes de popup por faixa de multiplicador (épico, lendário etc).
