# Integração Sync Pay (Pix real)

Referências usadas:

- [Portal Sync Pay](https://app.syncpayments.com.br/)
- [Auth Token API](https://syncpay.apidog.io/gera-o-token-de-utiliza%C3%A7%C3%A3o-da-aplica%C3%A7%C3%A3o-18075876e0)
- [Cash-In Pix API](https://syncpay.apidog.io/solicita%C3%A7%C3%A3o-de-dep%C3%B3sito-via-pix-18075879e0.md)
- [Cash-Out Pix API](https://syncpay.apidog.io/solicita%C3%A7%C3%A3o-de-saque-pix-18075881e0.md)
- [Webhook CashIn OnUpdate](https://syncpay.apidog.io/onupdate-19542520e0.md)
- [Webhook CashOut OnUpdate](https://syncpay.apidog.io/onupdate-19542541e0.md)
- [CRUD Webhooks parceiro](https://syncpay.apidog.io/) — `POST /api/partner/v1/webhooks`

## Variáveis de ambiente (Edge Functions — Supabase Secrets)

Definir no projeto Supabase (`Project Settings → Edge Functions → Secrets` ou `supabase secrets set`):

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `SYNC_PAY_CLIENT_ID` | Sim | UUID do parceiro (SyncPay) |
| `SYNC_PAY_CLIENT_SECRET` | Sim | Secret do parceiro |
| `SYNC_PAY_BASE_URL` | Não | Default: `https://app.syncpayments.com.br` |
| `SYNC_PAY_WEBHOOK_URL` | Sim para cash-in | URL pública da função `pix-webhook` (passada no body do cash-in) |
| `SYNC_PAY_WEBHOOK_BEARER_TOKEN` | Recomendado | Mesmo valor configurado no webhook da SyncPay (header `Authorization: Bearer …` nos POSTs de webhook) |
| `SYNC_PAY_WEBHOOK_IP_ALLOWLIST` | Opcional | IPs de origem da SyncPay, separados por vírgula. Se **vazio**, a função **não** exige IP (usa bearer e demais validações). |

**URL do webhook (exemplo):**  
`https://<PROJECT_REF>.supabase.co/functions/v1/pix-webhook`

### Cadastro de webhooks na SyncPay (API)

Com um Bearer obtido em `POST /api/partner/v1/auth-token`, crie dois webhooks apontando para a mesma URL:

```bash
# Exemplo — substitua TOKEN e URL
curl -sS -X POST "$BASE/api/partner/v1/webhooks" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Neon cashin","url":"https://SEU_REF.supabase.co/functions/v1/pix-webhook","event":"cashin","trigger_all_products":true}'

curl -sS -X POST "$BASE/api/partner/v1/webhooks" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Neon cashout","url":"https://SEU_REF.supabase.co/functions/v1/pix-webhook","event":"cashout","trigger_all_products":true}'
```

O token exibido na resposta do `POST /webhooks` deve ser copiado para o painel se a SyncPay usar esse token no header `Authorization` dos callbacks — alinhe com `SYNC_PAY_WEBHOOK_BEARER_TOKEN` no Supabase.

## Dados do usuário (CPF e telefone)

O app grava **CPF** e **celular (DDD)** em `public.profiles` (`cpf`, `phone`) via RPC `set_profile_pix_identity`. As Edge Functions `create-pix-deposit` e `request-pix-withdrawal` leem esses campos (não usam mais `user_metadata`).

## Funções implementadas

- `create-pix-deposit`
  - Obtém token Sync Pay (com cache em memória ~1h, conforme doc SyncPay).
  - Solicita cash-in (`/api/partner/v1/cash-in`).
  - Fluxo DB-first: `create_pix_deposit_pending` → SyncPay → `finalize_pix_deposit_pending`.
- `request-pix-withdrawal`
  - Reserva saldo no banco → SyncPay cash-out → `finalize_pix_withdrawal`.
  - Documento do titular da chave: CPF do perfil quando a chave não é CPF.
- `pix-webhook`
  - **Pré-requisito**: configure **pelo menos um** de `SYNC_PAY_WEBHOOK_BEARER_TOKEN` ou `SYNC_PAY_WEBHOOK_IP_ALLOWLIST` não vazio; se **ambos** estiverem ausentes, responde `503 webhook_security_not_configured`.
  - Se a allowlist de IP estiver **vazia**, a checagem de IP é **ignorada** (útil quando só o bearer está configurado).
  - Eventos: `cashin.create`, `cashin.update`, `cashout.create`, `cashout.update`.
  - `cashin.*` com `status=completed` → `confirm_pix_deposit`.
  - `cashout.*` → `apply_syncpay_cashout_webhook`.

## Smoke test (HTTP — webhook, sem Pix real)

```powershell
.\scripts\smoke-pix-webhook.ps1 -WebhookUrl "https://<PROJECT_REF>.supabase.co/functions/v1/pix-webhook"
```

Com bearer configurado (não commitar o token):

```powershell
.\scripts\smoke-pix-webhook.ps1 -WebhookUrl "https://<PROJECT_REF>.supabase.co/functions/v1/pix-webhook" `
  -BearerToken $env:SYNC_PAY_WEBHOOK_BEARER_TOKEN `
  -IncludeWrongBearerTest
```

Enquanto secrets não existirem, use `-Allow503AsPass` se quiser tratar `503` como esperado.

## Smoke test end-to-end (app + banco)

1. Aplicar migration `profiles_pix_identity` (colunas `cpf`/`phone` + RPC `set_profile_pix_identity`).
2. Configurar todos os secrets listados acima e cadastrar webhooks na SyncPay.
3. Fazer deploy das Edge Functions alteradas (`pix-webhook`, `create-pix-deposit`, `request-pix-withdrawal`, `_shared/syncpay.ts`):
   ```bash
   supabase functions deploy pix-webhook create-pix-deposit request-pix-withdrawal
   ```
4. No app (modo online): **Carteira** → preencher CPF/telefone se solicitado → **Depositar PIX** → valor mínimo (R$ 5) → pagar no banco.
5. Confirmar no SQL Editor (ou Table Editor):
   - `webhook_events` com eventos `cashin.update` / `completed`;
   - `pix_deposits.status = 'confirmed'`;
   - `wallets.balance` e `ledger_entries` com linha `deposit`.
6. **Sacar PIX**: exige `profiles.kyc_status = 'approved'` e maioridade confirmada; teste com conta já aprovada ou espere `403 kyc_required`.

## Checklist pós deploy

1. Secrets SyncPay + `SYNC_PAY_WEBHOOK_URL` no Supabase.
2. Webhooks `cashin` e `cashout` na SyncPay com a URL da `pix-webhook`.
3. `SYNC_PAY_WEBHOOK_BEARER_TOKEN` alinhado ao que a SyncPay envia em `Authorization` (se aplicável).
4. Opcional: `SYNC_PAY_WEBHOOK_IP_ALLOWLIST` com IPs oficiais do provedor.
5. Depósito real de baixo valor e reconciliação em `pix_deposits`, `wallets`, `ledger_entries`.
6. Saque de baixo valor (conta com KYC aprovado).
