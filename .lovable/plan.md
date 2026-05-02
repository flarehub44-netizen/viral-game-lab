## Problemas identificados

### 1. "Failed to send a request to the Edge Function" — `start-round`
Os logs mostram o erro real:
```
ERROR: LAYOUT_SIGNATURE_SECRET não configurado — impossível assinar layout.
  at signLayout (start-round/index.ts:94)
```
A função `start-round` exige o secret `LAYOUT_SIGNATURE_SECRET` para assinar o resultado da rodada (HMAC-SHA256), mas ele **não existe** na configuração de Lovable Cloud (segredos atuais: apenas `LOVABLE_API_KEY`, `SYNC_PAY_*`). Sem ele, toda chamada a `start-round` falha com 500, e o frontend mostra "Failed to send a request to the Edge Function".

### 2. Multiplicador travado em 20x
Em `RoundSetupScreen.tsx`, no modo conta (`server`):
- `canEditMeta = isDemo` (false no live) → todos os botões 5x/10x/15x/20x ficam `disabled`.
- O frontend envia sempre `mode: "target_20x"` em `Index.tsx:422`, e o backend rejeita qualquer outro valor (`if (mode !== "target_20x") return invalid_mode`).

Ou seja, hoje só existe um modo no servidor (meta fixa em 20x), mas a UI exibe 4 botões dando a impressão errada de que dá pra escolher.

## Plano

### Passo 1 — Configurar o secret faltante
Solicitar ao usuário, via `add_secret`, o `LAYOUT_SIGNATURE_SECRET` (string aleatória forte, ex.: 64 hex chars). Sem isso o backend não funciona. Vou gerar um valor sugerido e pedir confirmação para gravar.

### Passo 2 — Desbloquear o seletor de meta no modo conta
Atualizar `RoundSetupScreen.tsx`:
- Permitir edição dos botões 5x/10x/15x/20x também no modo `server` (`canEditMeta = true` sempre).
- Remover o texto "No modo conta, a meta é fixa em 20x".
- Passar a `meta` selecionada para `onConfirm` (já passa).

### Passo 3 — Aceitar múltiplos modos no backend
Atualizar `supabase/functions/start-round/index.ts`:
- Trocar a validação `mode !== "target_20x"` por whitelist `["target_5x","target_10x","target_15x","target_20x"]`.
- Extrair `targetMultiplier` do `mode` e usá-lo como meta da rodada (`script.score_target` / `barriers_crossed_target`).
- Persistir o `mode` em `game_rounds` para auditoria.

### Passo 4 — Frontend envia o modo correto
Atualizar `src/pages/Index.tsx` para mapear a meta escolhida (5/10/15/20) → `mode: target_${meta}x` ao chamar `start-round`.

### Passo 5 — Redeploy + teste
Deploy de `start-round` e teste via `curl_edge_functions` com cada um dos 4 modos para confirmar que retorna 200 e debita o stake corretamente.

## Detalhes técnicos

Arquivos alterados:
- `src/components/economy/RoundSetupScreen.tsx` — habilitar seletor no live, remover legenda
- `src/pages/Index.tsx` — enviar `mode` dinâmico baseado em `meta`
- `supabase/functions/start-round/index.ts` — whitelist de modos, derivar `targetMultiplier`
- Secret `LAYOUT_SIGNATURE_SECRET` adicionado em Lovable Cloud

Tabela de RTP (`multiplierTable.ts`) **não muda** — ela é independente da meta visual; a meta só define quantas barreiras a animação revela antes de pagar.

## Pergunta antes de implementar

Confirma que quer permitir as 4 metas (5x/10x/15x/20x) no modo conta? Ou prefere manter apenas 20x e só remover os botões falsos da UI?
