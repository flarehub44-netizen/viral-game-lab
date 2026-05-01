## Objetivo

1. Tornar o **modo demo** a experiência inicial padrão (sem precisar passar pela tela de login para ver o lobby).
2. Mostrar de forma **nítida e grande, no topo da tela de jogo**, quanto o usuário está ganhando em **R$** em tempo real.
3. A cada barreira passada (cada "fase"), exibir um **popup animado** mostrando o ganho atualizado em R$.

---

## Mudanças

### 1. Demo como tela principal (`src/pages/Index.tsx`)

Atualmente quando o visitante chega em `/` sem sessão, ele vê `AuthScreen` e precisa clicar em "Jogar demo" para entrar no lobby.

- Alterar o estado inicial `guestDemoActive` para começar como `true` quando não há sessão (ou seja, default = demo ativo).
- Manter `sessionStorage` apenas como override (se o usuário fez logout deliberadamente, etc.).
- Mover o acesso ao `AuthScreen` (login/cadastro) para dentro do `LobbyScreen` em demo, via o botão **"Entrar / Criar conta"** já existente (`onSignIn={leaveDemoToAuth}`).
- Usuários autenticados continuam indo direto para o lobby online normalmente — sem alteração no fluxo logado.

Resultado: ao abrir o app, o visitante já cai no **Lobby Demo** com saldo fictício R$ 150 e pode jogar imediatamente. O CTA para criar conta fica visível no lobby.

### 2. HUD principal de ganho em R$ (`src/components/GameCanvas.tsx`)

Hoje o topo mostra apenas Score (esquerda) e ×N bolinhas (direita). A informação "Entrada R$ X" aparece em fonte minúscula (text-[9px]).

Adicionar um **bloco central no topo** (entre o botão de menu e o contador de bolinhas), grande e nítido:

```text
┌──────────────────────────────┐
│        GANHO ATUAL           │
│      R$ 12,50                │   ← grande, verde neon
│     ×2.50  · Barreira 7      │   ← linha auxiliar
└──────────────────────────────┘
```

- Calcular `liveWinnings = stakeCredits * (stats.currentMultiplier ?? 0)` em tempo real.
- Cor: verde neon (`hsl(140 90% 58%)`) quando ganho > entrada, cinza quando < entrada, branco neutro quando = 0.
- Tipografia: `text-3xl font-black tabular-nums` com `text-shadow` neon.
- Tamanho compacto em mobile (max-width 420px): empilhar verticalmente; o bloco "Bolinhas" continua à direita mas com peso visual menor.
- O bloco antigo `Entrada R$ X` fica como sub-label discreto.
- Esconder/desativar o `ClimbHUD` redundante no canto direito (ou reduzir, já que a info principal vai para o topo central).

### 3. Popup "+R$ X,XX" a cada barreira passada

Hoje o engine já mostra um popup `+gained` (pontos de score) toda vez que uma barreira é cruzada (linha ~665 de `engine.ts`). Vamos somar a isso um popup de ganho em R$.

Abordagem **sem mexer no engine** (mantém engine puro, sem economia):

- Em `GameCanvas.tsx`, manter um `useRef` do último `barriersPassed`.
- Em cada update de `stats` (callback `onStatsChange` já chamado a cada 100ms), comparar `stats.barriersPassed` com o ref:
  - Se aumentou, calcular novo ganho `R$ = stake × stats.currentMultiplier` e empurrar um item em um array de overlay React (`floatingWins`).
  - Cada item tem `id`, `value`, `delta` (R$ ganhos vs barreira anterior), `createdAt`.
  - Renderizar como camada absoluta sobre o canvas, com animação CSS `float-up` (já existe no projeto, ver `src/index.css`) — sobe e desaparece em ~1.2s.
  - Auto-purge de itens com idade > 1500ms.
- Texto do popup: `+R$ 1,25` (delta) em fonte grande verde, com sub-linha `Total R$ 12,50`.

### 4. Tela de Game Over (`src/components/GameOverScreen.tsx`)

Verificar que o ganho final em R$ continua claro (já é mostrado via `serverEconomy.payout`), apenas garantir consistência visual com o novo HUD (mesma cor verde neon e tipografia).

---

## Detalhes técnicos

- **Sem mudanças no engine** (`src/game/engine.ts`) nem na economia/migrations. Tudo é camada de apresentação em `GameCanvas.tsx` e `Index.tsx`.
- **Sem mudanças no backend** — o cálculo `stake × currentMultiplier` já vem do engine; apenas formatamos como R$.
- **Edge case do payout final**: o engine usa `multiplierForBarrier(...)` que interpola até o `finalMultiplier` na barreira-alvo. O ganho exibido durante o jogo bate com o `payout` final do servidor quando a última barreira é atingida. Em rodadas que terminam antes do alvo (script-terminate), o último valor exibido será o real.
- **Cap visual**: respeitar `MAX_ROUND_PAYOUT = 400` — se `liveWinnings > 400`, mostrar `R$ 400,00` (com indicador "máx").
- **Acessibilidade**: o bloco principal recebe `aria-live="polite"` para que leitores de tela anunciem mudanças significativas (a cada barreira, não a cada frame).
- **Performance**: array `floatingWins` limitado a 6 itens simultâneos; itens antigos são removidos por TTL.

---

## Arquivos modificados

- `src/pages/Index.tsx` — demo como default; lobby vira tela inicial.
- `src/components/GameCanvas.tsx` — novo bloco "Ganho atual" + sistema de popups R$ por barreira.
- `src/components/ClimbHUD.tsx` — simplificar/reduzir (ou remover bloco "Pag." duplicado).
- (opcional) `src/components/GameOverScreen.tsx` — alinhamento visual.

Sem alterações em: engine, migrations, edge functions, RLS.
