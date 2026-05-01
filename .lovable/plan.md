## Problema

Você selecionou R$ 10 mas o PIX foi gerado com R$ 25. Olhando `src/components/economy/DepositScreen.tsx`:

- O valor inicial do campo é fixo em `"25"` (linha 17: `useState("25")`).
- Os botões de preset (R$ 10 / 25 / 50 / 100) **não têm destaque visual** quando clicados — não dá para distinguir o que está selecionado.
- O botão "Gerar PIX" não mostra o valor que vai ser enviado.

Resultado: provavelmente o clique em "R$ 10" não foi efetivado (toque fora do alvo, ou clicou em "Gerar PIX" antes do React aplicar) e o valor padrão "25" passou para a SyncPay sem feedback visual.

## Correção

Em `src/components/economy/DepositScreen.tsx`:

1. **Destacar o preset selecionado** — quando `amountNum === v`, o botão fica em verde com borda forte. Assim você vê de relance qual valor está ativo.
2. **Mostrar o valor no botão final** — trocar "Gerar PIX" por "Gerar PIX de R$ 10,00" (atualiza em tempo real conforme o input/preset). Confirmação visual antes do envio.

Sem mudanças de banco, sem mudança no Edge Function, sem novo secret. Só UX no front.

## Detalhes técnicos

- Arquivo: `src/components/economy/DepositScreen.tsx` (linhas 139–158).
- Comparação `amountNum === v` (já calculado no escopo) marca o preset ativo.
- Texto do botão: `` `Gerar PIX de R$ ${amountNum.toFixed(2).replace(".", ",")}` ``.
- Mantém o comportamento atual: clicar em preset chama `setAmountStr(String(v))`; "Gerar PIX" envia `amountNum` para `create-pix-deposit`.