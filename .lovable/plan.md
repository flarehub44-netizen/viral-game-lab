Encontrei o problema principal: o PIX está sendo gerado, mas o webhook da SyncPay não está chegando ao backend. Não há nenhum log de chamada em `pix-webhook` e a tabela `webhook_events` está vazia. Por isso o depósito fica em `pending` / “Aguardando PIX” e o saldo não é creditado automaticamente.

Também identifiquei uma falha importante na tentativa anterior de reconciliação: ela consultava um endpoint incorreto (`/cash-in/{id}`). A documentação atual da SyncPay mostra que o endpoint correto para consultar uma transação é:

```text
GET /api/partner/v1/transaction/{identifier}
```

Isso permite resolver o caso mesmo quando o webhook falha.

Plano de correção:

1. Recuperar os PIX pagos que ficaram pendentes
   - Consultar diretamente a SyncPay usando o endpoint correto `/api/partner/v1/transaction/{identifier}` para os depósitos pendentes.
   - Se a SyncPay retornar `completed`, executar o crédito via função atômica `confirm_pix_deposit`.
   - No caso atual, há um depósito recente de R$ 10,00 ainda `pending` com provider_ref `38ae9a72-5c53-4f6d-8a87-5e47735b6e0d`.
   - Também vou revisar os últimos depósitos de R$ 10,00 para confirmar se existe outro pago que não foi creditado.

2. Recriar a reconciliação automática usando o endpoint correto
   - Criar uma função backend `reconcile-pix-deposit` protegida por autenticação.
   - Ela receberá o `deposit_id`, validará que pertence ao usuário logado, buscará o status na SyncPay pelo `provider_ref` e, se estiver `completed`, chamará `confirm_pix_deposit`.
   - Ela também tratará `failed`, `refunded` e `med` sem creditar indevidamente.

3. Tornar a tela de depósito resiliente
   - Atualizar `usePixDepositPolling` para, enquanto o PIX estiver pendente, chamar a reconciliação periodicamente.
   - Assim, se o webhook continuar sem chegar, o saldo ainda será creditado quando a SyncPay confirmar o pagamento.

4. Corrigir o webhook para casar exatamente com a documentação SyncPay
   - Aceitar status `completed` como pago.
   - Ler `data.id` / `data.reference_id` / `identifier` com prioridade correta.
   - Ler o tipo de evento também do header `event`, porque a SyncPay envia `event: cashin.update` no cabeçalho.
   - Registrar logs úteis de payload recebido, referência desconhecida e resultado da confirmação.

5. Atualizar a biblioteca SyncPay compartilhada
   - Substituir/remover a consulta antiga `/cash-in/{identifier}`.
   - Implementar `syncPayGetTransaction(identifier)` usando `/api/partner/v1/transaction/{identifier}`.
   - Normalizar a resposta, que vem dentro de `data`, com campos `reference_id`, `amount`, `status`, `pix_code`.

6. Corrigir a experiência da Carteira
   - Adicionar botão “Atualizar status” nos PIX pendentes.
   - Ao abrir a carteira, tentar reconciliar automaticamente os PIX pendentes recentes antes de mostrar “Aguardando PIX”.
   - Atualizar saldo e histórico após reconciliação.

7. Verificação final
   - Conferir no banco se os depósitos pagos saíram de `pending` para `confirmed`.
   - Conferir se o saldo passou a refletir a soma real.
   - Verificar logs de `create-pix-deposit`, `pix-webhook` e da nova reconciliação.
   - Manter a exigência de autenticação nas funções chamadas pelo app e manter o webhook sem JWT para permitir chamadas externas da SyncPay.

Observação importante: como não há chamadas chegando em `pix-webhook`, ainda será necessário conferir se o webhook configurado na SyncPay aponta para a URL correta. Mas com a reconciliação pelo endpoint de transação, o saldo não dependerá exclusivamente do webhook.