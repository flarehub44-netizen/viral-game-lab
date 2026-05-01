# Multiplicador como BASE no Demo

## Regra de pagamento (Demo)

```
ganho = entrada × 0,05 × base × barreiras
multiplicador atual = 0,05 × base × barreiras
```

A "meta" é atingida exatamente em **20 barreiras** (= ×base). Após 20 barreiras o ganho continua crescendo linearmente, sem teto próprio — apenas o limite global de segurança `MAX_ROUND_PAYOUT = R$ 400` permanece como guarda-chuva.

### Exemplos

| Base | Entrada | 5 barreiras | 10 barreiras | 20 barreiras (META) | 30 barreiras |
|---|---|---|---|---|---|
| ×2  | R$ 1 | R$ 0,50 | R$ 1,00 | R$ 2,00 | R$ 3,00 |
| ×5  | R$ 1 | R$ 1,25 | R$ 2,50 | R$ 5,00 | R$ 7,50 |
| ×10 | R$ 1 | R$ 2,50 | R$ 5,00 | R$ 10,00 | R$ 15,00 |
| ×20 | R$ 1 | R$ 5,00 | R$ 10,00 | R$ 20,00 | R$ 30,00 |

## O que muda

### 1. `src/game/economy/demoRound.ts`
- Aceitar `base: number` (multiplicador escolhido) na função de início de rodada.
- Substituir a constante `DEMO_CAP = 5.0` pela fórmula: `multiplier = 0.05 * base * barriers`.
- Manter `MAX_ROUND_PAYOUT` (R$ 400) como guarda global; sem teto por base.
- Persistir `base` no objeto da rodada ativa para o GameCanvas/HUD lerem.

### 2. `src/components/economy/RoundSetupScreen.tsx`
- Reintroduzir o seletor de multiplicador (chips) **também no Demo**, opções: **2x / 5x / 10x / 20x** (default 5x).
- Cards de stats:
  - "Base" → mostra `×{base},00` e o ganho correspondente em 20 barreiras (`entrada × base`).
  - "Por barreira" → `entrada × 0,05 × base` (ex.: base ×10, R$1 → R$ 0,50).
- Texto explicativo: "Cada barreira vale entrada × 0,05 × base. Você atinge a meta em 20 barreiras, mas pode continuar lucrando depois."

### 3. `src/components/GameCanvas.tsx` (HUD do Demo)
- Receber `base` da rodada ativa.
- Calcular ao vivo: `currentMultiplier = 0.05 * base * barriersCrossed`.
- Barra de progresso: `min(barriersCrossed / 20, 1) * 100` — chega a 100% em 20 barreiras (meta atingida).
- Após 20 barreiras: barra fica destacada (verde/glow) com badge "META ✓" e o multiplicador continua subindo no rótulo.
- Rótulo: `base ×{base},00 · ×{0.05*base} por barreira`.

### 4. `src/pages/Index.tsx`
- Passar o `base` selecionado pelo `RoundSetupScreen` para `startDemoRound({ stake, base })`.
- Mesmo fluxo do Live (que já passa multiplicador) — só que sem chamar Edge Function.

### 5. `src/test/demoRound.test.ts`
- Atualizar testes para a nova fórmula com `base` parametrizada.
- Casos: base 2/5/10/20 × barreiras 0/5/10/20/30 conferindo a tabela acima.
- Verificar que `MAX_ROUND_PAYOUT` ainda corta ganhos absurdos.

## Não muda
- Modo **Live**: continua usando a tabela RTP 85,7% e Edge Function `start-round`. Nada da economia online é tocado.
- Carteira demo (`walletStore`): mesma lógica de débito/crédito.
- Engine de jogo: nenhuma alteração na física/renderização.

## Riscos / observações
- Sem teto por base, uma rodada base ×20 com 100 barreiras pagaria R$ 100. O `MAX_ROUND_PAYOUT = R$ 400` é a única trava — confirmar que essa trava é aplicada no settlement do demo (será verificada na implementação).
- A "meta" deixa de ser um corte e passa a ser um marco visual.
