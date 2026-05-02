## Problema

Em `/admin/sandbox`, há **3 barras/headers empilhados** no topo da tela:
1. Header do layout admin (`AdminPage`)
2. Header próprio do `AdminSandbox` (botão voltar + badge "SANDBOX")
3. Header do `RoundSetupScreen` (botão voltar + indicador "X online")

A imagem mostra que o usuário quer manter **apenas o terceiro** — o do `RoundSetupScreen`, com o botão voltar à esquerda e o "362 online" à direita (idêntico ao demo).

## Solução

Remover o header próprio do `AdminSandbox` (linhas 157-173). O `RoundSetupScreen` já cuida do botão voltar e do indicador online, então não precisa de wrapper adicional.

## Mudança

### `src/pages/admin/AdminSandbox.tsx` — bloco "Setup pré-jogo"

Substituir o JSX que envolve o `RoundSetupScreen`:
- Remover a `div` flex com o header sandbox (botão voltar + badge "SANDBOX" + spacer).
- Manter apenas o `RoundSetupScreen` direto no container.
- A identificação "sandbox" continua visível durante o jogo (badge no canto do `GameCanvas`) e na URL.

Resultado: a página fica visualmente idêntica ao demo, com um único header (o do `RoundSetupScreen`).