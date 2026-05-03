## Remover prefixo "R$" no modo Sandbox (/admin/sandbox)

Atualmente o `GameCanvas` exibe valores como `R$ 0,00` no HUD central ("Ganho atual") e nos popups por barreira (`+R$ X,XX`). No sandbox queremos manter os números (ex.: `0,00`) sem o prefixo `R$`, sem afetar os modos demo público e live.

### Mudanças

1. **`src/components/GameCanvas.tsx`**
   - Adicionar prop opcional `hideCurrencySymbol?: boolean` (default `false`).
   - Onde hoje renderiza `R$ {formatBRL(currentWin)}` no HUD central, passar a renderizar apenas `{formatBRL(currentWin)}` quando `hideCurrencySymbol` for `true`.
   - Mesmo tratamento para os popups flutuantes por barreira (`+R$ {formatBRL(w.total)}` → `+{formatBRL(w.total)}`).

2. **`src/pages/admin/AdminSandbox.tsx`**
   - Passar `hideCurrencySymbol` para o `<GameCanvas>` do sandbox.

### Fora de escopo
- `GameOverScreen` e `RoundSetupScreen` continuam como estão (o pedido foi sobre o display "R$ 0,00" durante o jogo). Se você quiser remover o `R$` também nessas telas no sandbox, me avise que estendo o plano.
