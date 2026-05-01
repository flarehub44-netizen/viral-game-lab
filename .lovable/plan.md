# Por que o saldo continua zerado

Confirmado nos dados:

- 2 depósitos `pending` no banco (R$ 10 + R$ 25), ambos com `provider_ref` (cobrança criada com sucesso na SyncPay).
- **Zero logs** na função `pix-webhook` desde que foi reescrita → a SyncPay não chamou nosso webhook (URL provavelmente não está configurada no painel deles, ou o evento ainda não disparou).
- **Zero logs** em `reconcile-pix-deposit` → a reconciliação nunca rodou, porque ela só dispara dentro do `DepositScreen` (modal de depósito). Assim que o usuário fechou o modal e foi para a `WalletScreen`, o polling parou.

Resultado: ninguém credita o saldo.

# Plano

## 1. Reconciliar agora os 2 PIX já pagos

Chamar `reconcile-pix-deposit` server-side para os 2 `provider_ref` pendentes consultando o status real na SyncPay e creditando via `confirm_pix_deposit` se vierem como `PAID_OUT`. Isso resolve o saldo do usuário imediatamente.

## 2. Reconciliação automática na carteira (correção principal)

Criar um hook `usePixDepositReconciliation` que roda na `WalletScreen` ao montar:

- Busca todos os `pix_deposits` do usuário com `status='pending'`, `provider_ref not null` e ainda dentro de `expires_at`.
- Para cada um, dispara `reconcile-pix-deposit` em paralelo.
- Refaz a busca após terminar para atualizar a lista de transações.

Adicionar também um botão discreto "Atualizar status" em cada linha "AGUARDANDO PIX" do histórico para o usuário forçar a reconciliação manualmente.

## 3. Reconciliação periódica em background

Criar uma Edge Function agendada `reconcile-pending-deposits` (cron a cada 2 min) que varre `pix_deposits` com `status='pending'` mais antigos que 30s e ainda não expirados, e chama a SyncPay para cada um. Isso garante que mesmo se o usuário nunca abrir a carteira, o crédito sai assim que o PIX for pago.

## 4. Validar config do webhook SyncPay

Pedir confirmação no painel SyncPay de que o webhook está apontando para:
`https://vezortwznwmziqukypjj.supabase.co/functions/v1/pix-webhook`

(O webhook continua sendo o caminho preferencial — a reconciliação é só um fallback robusto.)

## Detalhes técnicos

- **Reconciliação manual dos 2 PIX**: rodar via `supabase--curl_edge_functions` no `reconcile-pix-deposit` com Authorization Bearer do usuário, ou alternativamente um script SQL chamando direto `confirm_pix_deposit` se a SyncPay confirmar status `PAID_OUT` via consulta manual.
- **Hook na WalletScreen**: `useEffect` no mount, query `select id from pix_deposits where user_id=auth.uid() and status='pending' and provider_ref is not null and expires_at > now()`, depois `Promise.allSettled` chamando `supabase.functions.invoke('reconcile-pix-deposit', { body: { deposit_id } })`.
- **Cron**: `supabase/config.toml` com `[functions.reconcile-pending-deposits]` + `schedule = "*/2 * * * *"`. A função usa service role e itera limitado a 50 depósitos por execução.
- **Idempotência já garantida**: `confirm_pix_deposit` é uma RPC que já trata duplicata via `provider_ref` único — chamadas repetidas são seguras.

Após sua aprovação, eu implemento e em seguida confirmo que os R$ 35 caíram no seu saldo.
