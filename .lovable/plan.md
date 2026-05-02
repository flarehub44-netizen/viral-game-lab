## Objetivo

Tornar `/admin/sandbox` uma **cópia 1:1 do jogo demo**, mas usando uma carteira fake (R$ 1.000 só para a UI, sem tocar a carteira real do admin nem o backend). Jogo fluido, livre, sem regras, sem scripting do servidor, sem ferramentas de força de resultado.

## Mudanças

### 1. `src/pages/admin/AdminSandbox.tsx` — reescrita simplificada

Remover toda a parte que conversa com o backend e usar a mesma engine econômica do demo:

- **Remover**: `invokeAdminAction({ type: "sandbox_round" })`, `forceMult`, `forceBarrier`, presets `Win+ ×20 / Win ×2 / Loss ×0`, simulação RTP, botão "Reset sandbox", `layoutPlan` determinístico, `MULTIPLIER_TIERS`, `sampleMultiplier`, `theoreticalRtp`, `MULTIPLIER_CURVE_HARD_CAP`.
- **Adicionar**: estado local de "carteira fake sandbox" (saldo inicial R$ 1.000) que substitui o `loadWallet`/`saveWallet` do demo. Implementação:
  - Calcular o ganho com a mesma fórmula do demo: `0,05 × base × barreiras` (base padrão = `DEMO_DEFAULT_BASE`).
  - Debitar a entrada do saldo fake ao iniciar; creditar o payout ao final.
  - O cálculo é puro (não persiste em `localStorage`), só state em memória do componente.
- **Setup pré-jogo**: usar `RoundSetupScreen` com `economySource="demo"` e `balance={fakeBalance}` — exatamente o que o demo já mostra.
- **Jogo ativo**: `GameCanvas` com `mode="demo"`, `visualScript={null}`, `allowScriptTerminate={false}`, sem `targetBarrier` nem `layoutPlan`. HUD overlay sandbox simplificado: só o badge "SANDBOX" no canto (sem `mult/target/payout`, pois o `GameCanvas` já mostra o ganho atual).
- **Fim de jogo**: `GameOverScreen` com `economySource="demo"` e `serverEconomy` montado a partir do cálculo local (stake, multiplicador final, payout, netResult). Botões "Jogar de novo" e "Voltar" reiniciam ou voltam ao setup.
- **Header**: manter o título "INICIAR PARTIDA" e o badge "SANDBOX" para deixar claro que é admin.

### 2. Arquivos a remover (não usados em mais lugar nenhum)

Verificar se `invokeAdminAction({ type: "sandbox_round" })` e `{ type: "reset_sandbox" })` são usados em outro lugar. Se não, remover os branches correspondentes em `supabase/functions/admin-action/index.ts` numa próxima iteração — **fora do escopo deste plano** (mantemos a edge function como está; apenas paramos de chamar).

## Resultado

`/admin/sandbox` passa a ser visualmente e funcionalmente idêntico ao demo: jogo livre, ganho linear por barreira (`0,05 × base × barreiras`), termina quando o jogador perde todas as bolas, e o que aparece no HUD durante o jogo é exatamente o que aparece na tela final. A única diferença é o saldo fictício de R$ 1.000 e o badge "SANDBOX" no topo.