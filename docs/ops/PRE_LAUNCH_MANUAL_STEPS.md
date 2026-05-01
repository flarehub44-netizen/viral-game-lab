# Etapas Manuais Pré-Lançamento

Estas ações não podem ser automatizadas via código — precisam ser executadas uma vez
no painel do Supabase ou no terminal antes de receber usuários reais.

---

## Item 5 — Secrets do Supabase (BLOQUEADOR)

Acesse **Supabase Dashboard → Project Settings → Edge Functions → Secrets** e configure:

| Secret | Valor | Descrição |
|--------|-------|-----------|
| `SYNC_PAY_CLIENT_ID` | *fornecido pela SyncPay* | Client ID OAuth |
| `SYNC_PAY_CLIENT_SECRET` | *fornecido pela SyncPay* | Client Secret OAuth |
| `SYNC_PAY_WEBHOOK_URL` | `https://<seu-projeto>.supabase.co/functions/v1/pix-webhook` | URL de callback PIX |
| `SYNC_PAY_WEBHOOK_BEARER_TOKEN` | `openssl rand -hex 32` | Token que a SyncPay envia no header `Authorization` |
| `SYNC_PAY_WEBHOOK_IP_ALLOWLIST` | IPs fornecidos pela SyncPay | (opcional se usar bearer) |
| `LAYOUT_SIGNATURE_SECRET` | `openssl rand -hex 32` | HMAC da assinatura do layout |
| `CRON_SECRET` | `openssl rand -hex 32` | Autentica o agendador de close-stale-rounds |

> Gere cada segredo: `openssl rand -hex 32`

---

## Item 6 — Configurar Webhook na SyncPay

No painel da SyncPay:

1. Registre a URL: `https://<seu-projeto>.supabase.co/functions/v1/pix-webhook`
2. Configure o header `Authorization: Bearer <SYNC_PAY_WEBHOOK_BEARER_TOKEN>`
3. Assine os eventos: `cashin.create`, `cashin.update`, `cashout.create`, `cashout.update`
4. Verifique que o `SYNC_PAY_WEBHOOK_BEARER_TOKEN` bate com o secret do Supabase

**Verificação**: envie um POST manual ao webhook e confirme HTTP 401 sem bearer, HTTP 200 com bearer correto:
```bash
# Deve retornar 401
curl -X POST https://<projeto>.supabase.co/functions/v1/pix-webhook \
  -H "event: cashin.create" -H "Content-Type: application/json" -d '{}'

# Deve retornar 400 (bearer válido, payload inválido — confirma auth OK)
curl -X POST https://<projeto>.supabase.co/functions/v1/pix-webhook \
  -H "Authorization: Bearer <SYNC_PAY_WEBHOOK_BEARER_TOKEN>" \
  -H "event: cashin.create" -H "Content-Type: application/json" -d '{}'
```

---

## Item 7 — Agendar Edge Functions (Supabase Cron)

Acesse **Supabase Dashboard → Database → Extensions** e ative `pg_cron` se não estiver ativo.

Em seguida, no **SQL Editor**:

```sql
-- close-stale-rounds: roda a cada minuto
SELECT cron.schedule(
  'close-stale-rounds-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<seu-projeto>.supabase.co/functions/v1/close-stale-rounds',
    headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- process-lgpd-deletions: roda às 02:00 UTC
SELECT cron.schedule(
  'process-lgpd-deletions-job',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<seu-projeto>.supabase.co/functions/v1/process-lgpd-deletions',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

**Verificação**:
```sql
SELECT jobname, schedule, active, last_run_status
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

---

## Item 8 — Smoke Test PIX (Sandbox SyncPay)

Execute o script de smoke test com as credenciais de sandbox:

```powershell
# Configure as variáveis de ambiente antes
$env:SUPABASE_URL = "https://<projeto>.supabase.co"
$env:SUPABASE_ANON_KEY = "<sua-anon-key>"
$env:SYNC_PAY_WEBHOOK_BEARER_TOKEN = "<token>"

.\scripts\smoke-pix-webhook.ps1
```

Checklist manual:
- [ ] Criar depósito PIX (R$5,00) via `create-pix-deposit` e obter QR code
- [ ] Simular confirmação via webhook manual (ou usar sandbox SyncPay)
- [ ] Verificar que saldo subiu no banco (`SELECT balance FROM wallets WHERE user_id = '<id>'`)
- [ ] Solicitar saque PIX (`request-pix-withdrawal`)
- [ ] Verificar que saldo baixou e `pix_withdrawals` tem `status = 'requested'`
- [ ] Simular webhook `cashout.update` com `status = paid`
- [ ] Verificar `pix_withdrawals.status = 'paid'`

---

## Item 9 — Load Test (≥ 500 concorrentes)

### Pré-requisitos
```bash
# Instalar k6
winget install k6  # Windows
# ou: choco install k6
```

### Executar
```bash
# Teste básico (50 VUs, 60s)
npx cross-env \
  SUPABASE_URL=https://<projeto>.supabase.co \
  SUPABASE_ANON_KEY=<key> \
  k6 run --vus 50 --duration 60s scripts/load-start-end-round.js

# Teste de capacidade completo (500 VUs, 5 min)
k6 run --vus 500 --duration 5m scripts/load-start-end-round.js
```

### Critério de aprovação
- p95 latência `start-round` < 3000ms
- Taxa de erro < 1%
- Nenhum erro de `insufficient_balance` para usuários com saldo suficiente
- `v_monitor_alerts` sem alertas críticos após o teste

```sql
-- Verificar após o teste
SELECT * FROM v_monitor_alerts;
SELECT * FROM v_rtp_live ORDER BY window_start DESC LIMIT 10;
SELECT * FROM v_round_health;
```

---

## Item 10 (continuação) — Ativar Criptografia de CPF

Após aplicar a migration `20260501230000_cpf_encryption_infra.sql`:

### Passo 1: Gerar chave
```bash
openssl rand -hex 32
# Exemplo: a3f8c2d1e4b5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

### Passo 2: Configurar no Vault
```sql
UPDATE vault.secrets
SET secret = '<sua-chave-gerada>'
WHERE name = 'cpf_crypt_key_v1';
```

### Passo 3: Rodar backfill
```sql
SELECT public.backfill_cpf_encryption();
-- Deve retornar o número de CPFs criptografados
```

### Passo 4: Verificar
```sql
-- Deve retornar 0 (nenhum CPF em plaintext sem criptografia)
SELECT COUNT(*) FROM profiles WHERE cpf IS NOT NULL AND cpf_enc IS NULL;

-- Teste de roundtrip
SELECT
  user_id,
  cpf,
  public.cpf_decrypt(cpf_enc) AS cpf_decrypted,
  cpf = public.cpf_decrypt(cpf_enc) AS match
FROM profiles
WHERE cpf IS NOT NULL
LIMIT 5;
```

### Passo 5: (futuro) Remover coluna plaintext
Após confirmar backfill, aplique:
```sql
ALTER TABLE public.profiles DROP COLUMN cpf;
DROP CONSTRAINT IF EXISTS profiles_cpf_format;
```
