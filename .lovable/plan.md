## Regra de rollover 2x para saque

Hoje qualquer usuário com saldo + KYC aprovado pode sacar. Vamos exigir que o **total apostado desde o último saque** (ou desde a criação da conta, se nunca houve saque) seja **≥ 2× o total depositado no mesmo período**, antes de liberar qualquer saque PIX.

### Definição da regra

Para cada usuário, em todo momento:

```text
rollover_required = 2 × Σ depósitos confirmados após o último saque
rollover_progress = Σ stakes (apostas) após o último saque
liberado_para_sacar = rollover_progress ≥ rollover_required
```

- Se nunca depositou, `rollover_required = 0` → liberado (mas só vai conseguir sacar saldo de bônus/inicial, que é 0 em conta real).
- Depósitos contam quando viram `kind='deposit'` no `ledger_entries` (já é o que o webhook PIX faz).
- Apostas contam quando viram `kind='stake'` no `ledger_entries` (já registrado em `start_round_atomic`).
- Após um saque ser **solicitado** com sucesso, o contador zera (próximo ciclo começa do zero, exigindo novo rollover sobre depósitos futuros).

### Mudanças

**1. Banco — nova função SQL `get_withdrawal_rollover(p_user_id)`**

Retorna `(deposited numeric, wagered numeric, required numeric, remaining numeric, eligible boolean)`. Lê `ledger_entries` filtrando por `created_at > last_withdrawal_at` (ou desde sempre se não houver). `required = 2 × deposited`. Função `STABLE SECURITY DEFINER`, executável por `authenticated` (cada usuário consulta o próprio) e por `service_role`.

**2. Banco — `request_pix_withdrawal` passa a validar**

Antes de debitar saldo, calcula rollover dentro da transação (com `FOR UPDATE` no wallet já em uso) e, se `wagered < 2 × deposited`, lança `RAISE EXCEPTION 'rollover_not_met'`. Garantia server-side: mesmo que o front seja burlado, o saque é rejeitado.

**3. Edge function `request-pix-withdrawal`**

Tradução do erro `rollover_not_met` em resposta `403 { error: "rollover_not_met", deposited, wagered, required, remaining }` para a UI exibir o quanto falta.

**4. Erro mapeado em `src/lib/pixEdgeErrors.ts`**

Nova chave `rollover_not_met` com mensagem em PT-BR: "Você precisa apostar pelo menos R$ X,XX para liberar saques (regra de rollover 2x sobre depósitos)."

**5. UI — `WithdrawScreen.tsx`**

- Ao montar, chama RPC `get_withdrawal_rollover` e exibe um card no topo:
  - Barra de progresso `wagered / required`.
  - Texto: "Apostado: R$ X / R$ Y necessários • Faltam R$ Z".
  - Quando `eligible=false`, desabilita o botão "Solicitar saque" (igual ao bloqueio de KYC), com aviso amber.
- Mantém o aviso server-side como rede de segurança caso o estado mude entre carregar a tela e clicar.

**6. UI — `WalletScreen.tsx`** (pequeno indicador opcional)

Mostrar uma linha discreta "Rollover: R$ X / R$ Y" perto do botão de saque, para o jogador entender por que o saque está travado antes mesmo de abrir a tela.

### Detalhes técnicos

- **Fonte de verdade do "último saque"**: `MAX(created_at) FROM pix_withdrawals WHERE user_id=$1 AND status IN ('requested','processing','approved','completed')`. Saques `failed`/`reversed` não zeram o contador.
- **Por que não usar `ledger_entries kind='withdraw'`**: o registro do ledger só é criado quando o saque é debitado; queremos usar a mesma tabela para detectar tentativas em curso e evitar double-spend de rollover.
- **Stakes contam, payouts não**: o objetivo do rollover é volume de jogo, não resultado. `Σ amount WHERE kind='stake'`.
- **Reembolsos** (`kind='refund'` se existir) e ajustes admin (`adjustment`) **não** contam como aposta; e ajustes positivos não contam como depósito.
- **Migração**: nova migration cria `get_withdrawal_rollover` e substitui `request_pix_withdrawal` (mantém assinatura, adiciona o check). Sem mudança de schema/tabelas.

### Arquivos afetados

- `supabase/migrations/<novo>.sql` — função `get_withdrawal_rollover` + `CREATE OR REPLACE FUNCTION request_pix_withdrawal` com check de rollover.
- `supabase/functions/request-pix-withdrawal/index.ts` — tratar erro `rollover_not_met`.
- `src/lib/pixEdgeErrors.ts` — nova mensagem.
- `src/components/economy/WithdrawScreen.tsx` — chamar RPC, exibir progresso, desabilitar botão.
- `src/components/economy/WalletScreen.tsx` — linha de status do rollover (opcional, leve).

### Fora de escopo (perguntar depois se quiser)

- Aplicar rollover também a saldos de bônus separados (não há tabela de bônus hoje).
- Resetar rollover ao final de cada mês (atualmente reseta só após saque bem-sucedido).
- Mostrar histórico de ciclos de rollover.
