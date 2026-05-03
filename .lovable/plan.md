## Objetivo

Criar uma nova página de jogo acessível pelo painel admin, **sem economia/dinheiro**: o jogador joga livremente e acumula apenas **pontos** (score) e barreiras passadas. Nada de aposta, payout, multiplicador em R$, carteira ou rodada do servidor.

## Rota e navegação

- Nova rota: `/admin/arcade` (protegida pelo mesmo guard de admin já existente em `AdminPage.tsx`).
- Adicionar aba **"Arcade"** no header de `src/pages/admin/AdminPage.tsx`, ao lado de Sandbox.
- Registrar a rota em `src/App.tsx` como filha de `/admin`, lazy-loaded.
- Igual ao Sandbox, esconder o header quando estiver em `/admin/arcade` para experiência fullscreen (ajustar `hideHeader` em `AdminPage.tsx`).

## Página `AdminArcade.tsx`

Arquivo novo: `src/pages/admin/AdminArcade.tsx`.

Comportamento:
- Tela inicial minimalista com título "Arcade — Modo Pontos", botão **Jogar** e exibição do **melhor score** salvo localmente em `localStorage` (`ns_best_arcade`).
- Ao clicar Jogar, monta `<GameCanvas>` em modo `demo`, mas com `stakeCredits={0}` e **sem** `visualScript`, `targetBarrier`, `targetMultiplier`, `resultMultiplier`, `layoutPlan`. Isso já desativa o HUD central de "Ganho atual" (renderiza somente quando `stake > 0`) e os popups de R$ por barreira.
- `onGameOver(stats, summary)`: atualizar best score local, mostrar tela simples de Game Over com Score, Barreiras, Combo máx., Duração, e botões **Jogar de novo** / **Sair**. Não chama nenhuma Edge Function, não toca em wallet/ledger/round.
- `onExit`: volta para a tela inicial do Arcade (não sai de `/admin/arcade`).
- Botão "Voltar ao Admin" (link para `/admin/overview`) visível apenas na tela inicial e na tela de Game Over (já que o header está oculto).

## Garantias de "sem ganhos"

- Não importar `walletStore`, `serverRound`, `start-round`, `end-round`, `submit-score`.
- `stakeCredits = 0` → `GameCanvas` não renderiza o card de "Ganho atual" nem os popups verdes de R$.
- Nenhuma persistência além de `ns_best_arcade` (number) em localStorage.

## Detalhes técnicos

- Reusar `GameEngine` via `GameCanvas` sem tocar em `engine.ts`.
- Tipos de stats já expostos: `PublicGameStats` (score, barriersPassed, combo, durationSeconds) — suficientes para o resumo.
- Lazy import na `App.tsx` no mesmo padrão dos outros `Admin*`.

## Arquivos

- Novo: `src/pages/admin/AdminArcade.tsx`
- Editado: `src/App.tsx` (rota lazy)
- Editado: `src/pages/admin/AdminPage.tsx` (aba "Arcade" + `hideHeader` inclui `/admin/arcade`)

Sem migrações de banco, sem Edge Functions, sem mudanças no engine.