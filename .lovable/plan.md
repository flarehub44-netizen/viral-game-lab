# Mostrar potencial real de ganho no card "Pagamento máximo"

## Contexto

Na tela de setup da rodada (live), o card "PAGAMENTO MÁXIMO" hoje exibe `min(stake × 50, R$ 400)`. Isso faz o valor travar em R$ 400 sempre que a aposta for ≥ R$ 8, escondendo o potencial real e dando a impressão de que todas as apostas pagam o mesmo máximo.

A intenção: mostrar o **potencial bruto** (`stake × multiplicador máximo da curva`), e usar a linha "teto R$ 400" apenas como aviso de que existe um limite global. O servidor continua intacto — o teto continua sendo aplicado no settlement; muda só a apresentação.

## Mudança

**Arquivo único:** `src/components/economy/RoundSetupScreen.tsx`

No `useMemo` que calcula os stats (linha ~48-50), trocar:

```ts
const maxPayout = Math.min(MAX_ROUND_PAYOUT, bet * MULTIPLIER_CURVE_HARD_CAP);
```

por:

```ts
const maxPayout = bet * MULTIPLIER_CURVE_HARD_CAP;
```

O resto do JSX já está pronto: o card mostra `R$ {maxPayout}` em destaque e, logo abaixo, "teto R$ 400" como nota — agora os dois números fazem sentido juntos.

### Comportamento resultante


| Aposta | Antes (display) | Depois (display) | Pagamento real (servidor) |
| ------ | --------------- | ---------------- | ------------------------- |
| R$ 1   | R$ 50,00        | R$ 50,00         | até R$ 50                 |
| R$ 5   | R$ 250,00       | R$ 250,00        | até R$ 250                |
| R$ 8   | R$ 400,00       | R$ 400,00        | até R$ 400                |
| R$ 20  | R$ 400,00       | R$ 1.000,00      | até R$ 400                |
| R$ 50  | R$ 400,00       | R$ 2.500,00      | até R$ 400                |


A linha "teto R$ 400" deixa claro que há limite — o jogador entende que apostar mais de R$ 8 não aumenta o pagamento máximo possível.

## Fora de escopo

- Servidor / edge functions / settlement: nada muda, o teto continua aplicado.
- Texto explicativo do final da tela (já menciona "máx R$ 400").
- Demo mode: não usa esse cálculo.