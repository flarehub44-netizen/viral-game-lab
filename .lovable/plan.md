## Problema

O Edge Function `create-pix-deposit` está retornando 502 com `syncpay_cashin_failed`. O log mostra que a SyncPay respondeu HTTP 404 com uma página HTML do Next.js (painel "Sync Pay"), não com JSON da API.

Causa raiz: a base URL configurada em `supabase/functions/_shared/syncpay.ts` é `https://app.syncpayments.com.br`, que serve o **painel web** (front-end Next.js) e não a **API REST**. Por isso `/api/partner/v1/auth-token` cai num 404 do Next renderizado como HTML.

A integração que está funcionando no outro projeto chama os mesmos paths (`/api/partner/v1/auth-token`, `/api/partner/v1/cash-in`) mas no host correto da API.

## Correção

1. Atualizar o `DEFAULT_BASE_URL` em `supabase/functions/_shared/syncpay.ts` de `https://app.syncpayments.com.br` para `https://api.syncpayments.com.br` (host de API, separado do painel).

2. A função já lê `SYNC_PAY_BASE_URL` do env como override; vamos manter esse fallback para que, se a SyncPay mudar de domínio no futuro, dê para corrigir só pelo segredo sem redeploy de código.

3. Após o deploy da função (automático), refazer um depósito PIX para validar. Se voltar a falhar com outra mensagem (ex.: 401 `invalid_credentials`), aí o problema passa a ser nos UUIDs em `SYNC_PAY_CLIENT_ID`/`SYNC_PAY_CLIENT_SECRET` e te peço para conferir no painel.

## Detalhes técnicos

- Arquivo afetado: `supabase/functions/_shared/syncpay.ts` (1 linha — constante `DEFAULT_BASE_URL`).
- Sem mudança de banco, sem novos secrets.
- Sem mudança no fluxo do front-end ou no webhook.
- Caso o host correto seja outro (a SyncPay tem documentação privada), a próxima tentativa retornará outro código HTTP (não mais o HTML do painel) e ajustamos para o domínio definitivo. Você também pode definir `SYNC_PAY_BASE_URL` como segredo para forçar a URL exata sem alterar código.