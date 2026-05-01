## Problema

PIX foi pago mas saldo não creditou. Verificado no banco:
- `pix_deposits` mais recente (R$ 10) está como `pending` com `provider_ref` preenchido — confirmando que a cobrança foi criada na SyncPay.
- Não há **nenhum** log na função `pix-webhook` — a SyncPay até pode estar tentando chamar, mas o request está sendo recusado antes de qualquer processamento útil.

Causa raiz no `supabase/functions/pix-webhook/index.ts`: a função foi desenhada para um esquema de webhook **que a SyncPay não usa**:

- Exige header `event` com valores `cashin.create`/`cashin.update`. A SyncPay envia o status no corpo (campo `status` com valor `PAID_OUT`), sem header `event`.
- Exige header `x-pix-signature` + `x-pix-timestamp` com HMAC SHA-256. A SyncPay não envia HMAC.
- Exige `SYNC_PAY_WEBHOOK_HMAC_SECRET` configurado (retorna 503 se faltar). Não existe esse segredo.
- Filtra por `status === "completed"`. SyncPay envia `PAID_OUT`.
- Lê `data.id` para `provider_ref`. SyncPay envia `identifier` no payload.

A integração SyncPay funcional (referência do outro projeto) faz:
1. Bearer token simples no header (opcional — autenticidade da URL é o suficiente quando o bearer está configurado).
2. Lê `identifier` + `status === "PAID_OUT"` direto do JSON do corpo.
3. Aciona `confirm_pix_deposit` quando status indica pagamento.

## Correção

Reescrever `supabase/functions/pix-webhook/index.ts` para o formato real da SyncPay:

1. **Autenticação simples por bearer token**: validar `Authorization: Bearer <SYNC_PAY_WEBHOOK_BEARER_TOKEN>`. O secret `SYNC_PAY_WEBHOOK_BEARER_TOKEN` precisa ser configurado e a mesma string colada no painel SyncPay como header customizado do webhook (se a SyncPay suportar) — caso contrário, deixamos o bearer **opcional**: se o segredo não estiver setado, aceita qualquer chamada (seguro o suficiente porque a URL é secreta e o `confirm_pix_deposit` valida `provider_ref` + `amount`).
2. **Remover** dependência de headers `event`, `x-pix-signature`, `x-pix-timestamp`, `SYNC_PAY_WEBHOOK_HMAC_SECRET`, `SYNC_PAY_WEBHOOK_STRICT`, allowlist de IP — nada disso a SyncPay envia.
3. **Parser do payload** que aceita as variantes documentadas:
   - `identifier` (ID interno da SyncPay) → vira `providerRef`
   - `amount` em float BRL → casado com o `pix_deposits.amount`
   - `status` com valores típicos: `PAID_OUT`/`PAID`/`COMPLETED` → confirma; `FAILED`/`REFUNDED`/`EXPIRED` → marca falha; outros → ignora.
4. **Idempotência mantida**: continua chamando `register_webhook_event` para evitar processamento duplicado, e `confirm_pix_deposit` (que já é idempotente — se já confirmou, retorna o mesmo ID sem duplicar saldo).
5. **Suporte a cashout**: adapta o handler de saída usando o mesmo padrão (`reference_id` + `status`).

## Polling de fallback (proteção extra)

Para os depósitos que **já foram pagos** mas ficaram travados em `pending` (como o R$ 10 e R$ 25 do usuário), criar uma rota leve de reconciliação:
- Edge function `reconcile-pix-deposit` chamada pelo front durante o polling existente. Para um `deposit_id` específico que está pendente há mais de N segundos, ela consulta o status na SyncPay (endpoint `/api/partner/v1/cash-in/<identifier>` ou similar) e, se vier pago, chama `confirm_pix_deposit` para creditar.
- Isso garante que mesmo se o webhook falhar de novo, o saldo é creditado em até 5–10s pelo polling do front.

## Reconciliação manual dos 2 depósitos travados

Após corrigir o webhook, **creditar manualmente** os dois depósitos PIX que o usuário já pagou (R$ 10 + R$ 25 = R$ 35 no total para o user `ccf31041-...`). Isso é uma migração/SQL one-shot consultando o status na SyncPay para confirmar que foram realmente pagos antes de creditar.

## Detalhes técnicos

**Arquivos:**
- `supabase/functions/pix-webhook/index.ts` — reescrita completa, ~80 linhas.
- `supabase/functions/_shared/syncpay.ts` — adicionar `syncPayGetCashIn(identifier)` para consulta de status.
- `supabase/functions/reconcile-pix-deposit/index.ts` — novo arquivo. Recebe `{ deposit_id }`, valida ownership via JWT do usuário, consulta SyncPay e confirma se pago.
- `src/hooks/usePixDepositPolling.ts` — chamar `reconcile-pix-deposit` a cada 3 polls (≈9s) enquanto status estiver `pending` e `provider_ref` existir.
- `supabase/config.toml` — adicionar `[functions.reconcile-pix-deposit]` com `verify_jwt = true`.

**Secrets:**
- Manter `SYNC_PAY_WEBHOOK_BEARER_TOKEN` (opcional — se preenchido, validamos; se não, aceitamos sem).
- Não precisa mais de HMAC nem allowlist nem strict mode.

**Reconciliação dos 2 pagamentos do usuário:**
- Migração que insere ledger entries + atualiza `pix_deposits` para `confirmed`, contanto que SyncPay confirme. Como não consigo chamar a SyncPay daqui no plano, vou fazer isso dentro de um edge function admin, ou simplesmente disparar `confirm_pix_deposit` por SQL quando você confirmar que os pagamentos realmente saíram do seu app de banco.

**Webhook URL na SyncPay:**
- Verifique no painel SyncPay se o webhook URL configurado é exatamente `https://vezortwznwmziqukypjj.supabase.co/functions/v1/pix-webhook` (esse é o secret `SYNC_PAY_WEBHOOK_URL`). Se não for, ajusta lá.