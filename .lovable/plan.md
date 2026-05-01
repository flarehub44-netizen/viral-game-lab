
## Resumo

Aplicar 3 correções que resolvem os bugs de `age_required` no depósito PIX e saldo inicial em contas reais.

## 1. Corrigir Edge Function `create-pix-deposit`

**Causa raiz:** o código chama o RPC `get_user_pix_identity` que retorna apenas `(cpf, phone)`. Como `prof.over_18_confirmed_at` sempre vem `undefined`, a checagem `!prof.over_18_confirmed_at` é sempre verdadeira → todo usuário recebe 403 `age_required`.

**Correção:** trocar o RPC por uma leitura direta da tabela `profiles` usando o cliente admin (service role bypassa RLS, funciona para qualquer usuário, admin ou não):

```ts
const { data: prof, error: profErr } = await admin
  .from("profiles")
  .select("display_name, cpf, phone, over_18_confirmed_at, deleted_at")
  .eq("user_id", user.id)
  .maybeSingle();
```

Mantém todas as validações já existentes (`deleted_at`, `over_18_confirmed_at`, CPF, telefone).

## 2. Migration: saldo inicial = R$ 0 em contas reais

```sql
-- Default da coluna passa a ser zero
ALTER TABLE public.wallets ALTER COLUMN balance SET DEFAULT 0.00;

-- Trigger handle_new_user cria wallet com saldo 0
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  INSERT INTO public.wallets (user_id, balance) VALUES (NEW.id, 0.00) ...

-- Zerar wallets de teste que ainda não tiveram nenhum movimento
UPDATE public.wallets
SET balance = 0.00, updated_at = now()
WHERE balance = 150.00
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM public.ledger_entries
    WHERE kind IN ('deposit', 'payout', 'adjustment')
  );
```

> Modo demo (localStorage) continua começando com R$ 150 — sem alteração.

## 3. Mensagem `age_required` em PT-BR

Adicionar em `src/lib/pixEdgeErrors.ts`:

```ts
age_required: "Confirme que você tem 18+ antes de depositar.",
```

## Arquivos afetados

- `supabase/functions/create-pix-deposit/index.ts` — substitui RPC por SELECT direto.
- Nova migration — default da `wallets.balance`, trigger `handle_new_user`, reset das 3 wallets de teste.
- `src/lib/pixEdgeErrors.ts` — nova entrada `age_required`.

## Resultado

- ✅ Qualquer usuário (admin ou não) com 18+ confirmado e CPF/telefone consegue gerar o QR Code PIX.
- ✅ Toda nova conta real começa com R$ 0,00.
- ✅ Wallets atuais sem histórico vão para R$ 0,00.
- ✅ Erros do PIX aparecem com mensagens claras em português.
