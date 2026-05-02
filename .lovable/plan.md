## Objetivo

Tornar as rodadas mais longas e exigir mais skill para atingir cada multiplicador, multiplicando todas as âncoras de barreira por **1.5×**. As probabilidades dos tiers ficam intactas — como cada tier agora exige mais barreiras (e a dificuldade pós-baseline aumenta), o RTP efetivo cai naturalmente para a faixa **~75–80%**.

## Nova curva (âncoras × 1.5, arredondadas para inteiro)

```text
barreiras  multiplicador      mudança
   0        0.0
   2        0.0          (era 1)
   5        0.5          (era 3)   → primeira devolução parcial mais tarde
   8        0.8          (era 5)
  11        1.0          (era 7)   → empate na barreira 11
  14        1.2          (era 9)
  17        1.5          (era 11)
  20        2.0          (era 13)
  23        3.0          (era 15)
  26        5.0          (era 17)
  29        10.0         (era 19)
  30        20.0         (era 20)  → tier máximo agora na 30 (antes 20)
  33        26.0         (cauda fase 2)
  38        32.0
  45        40.0
  60        50.0         (cap absoluto)
```

## Novos `target_barrier` e `max_duration_seconds` da tabela de tiers

Cada tier tem seu `barriers_crossed` (alvo de morte) e `duration_seconds` escalados em 1.5×, mantendo `probability`, `multiplier`, `balls_count` e `score_target` inalterados:

```text
mult  prob   barriers (era→novo)   duration (era→novo)
0.0   0.30        1 →  2                  6 →  9
0.5   0.22        3 →  5                 12 → 18
0.8   0.16        5 →  8                 16 → 24
1.0   0.11        7 → 11                 20 → 30
1.2   0.07        9 → 14                 24 → 36
1.5   0.05       11 → 17                 28 → 42
2.0   0.04       13 → 20                 32 → 48
3.0   0.025      15 → 23                 38 → 57
5.0   0.015      17 → 26                 45 → 68
10.0  0.008      19 → 29                 52 → 78
20.0  0.002      20 → 30                 58 → 87
```

## Arquivos a alterar

A curva e a tabela aparecem em **5 lugares** que precisam ficar sincronizados (já existe um script de sync — `scripts/check-multiplier-sync.js`):

1. **`src/game/economy/multiplierCurve.ts`** — `MULTIPLIER_CURVE_ANCHORS` com novos valores
2. **`supabase/functions/_shared/multiplierCurve.ts`** — espelho idêntico
3. **`src/game/economy/multiplierTable.ts`** — `MULTIPLIER_TIERS` com novos `barriers_crossed` e `duration_seconds`
4. **`supabase/functions/_shared/multiplierTable.ts`** — espelho idêntico
5. **Migration nova** — `CREATE OR REPLACE FUNCTION public.compute_multiplier_for_barrier(integer)` reescrita com as novas âncoras (a função SQL é usada pelo `end-round` para validar/calcular payout no servidor)

## Atualizações em testes

- `src/game/economy/multiplierCurve.test.ts` — atualizar assertions de interpolação (b=4 não dá mais 0.65; agora b=6 ou b=7 corresponde à interpolação entre 5→8)
- `src/test/rtpSimulation.test.ts` — bandas continuam válidas (não dependem das âncoras de barreira, só da tabela de tiers e do RNG)
- `src/test/skilledRtpSimulation.test.ts` — **vai detectar a queda de RTP**. Atualizar bandas esperadas para casual ~75–82%, skilled ~80–86%, expert ~84–90%
- `src/game/economy/phase2Layout.test.ts` — verificar se há assertions sobre barreiras específicas

## Comportamento esperado pós-mudança

- **Rodada média** dura ~50% mais tempo (mais engajamento por aposta).
- **Empate** (1.0×) move da barreira 7 para a 11 — jogador casual sente mais "perda controlada" no início.
- **RTP empírico** cai dos atuais ~85,7% (casual) para ~75–80% — a casa ganha mais por rodada.
- **Tier máximo (20×)** vira evento muito mais raro de fato concretizar (precisa chegar na barreira 30 em vez de 20), mesmo a probabilidade de sorteio permanecendo 0.2%.
- **Cauda Fase 2 (26×, 32×, 40×, 50×)** fica praticamente inalcançável na prática — vira "lendário".

## Validação pós-mudança

1. Rodar `npm run test` — checar que os testes de RTP refletem a nova realidade (e ajustar bandas).
2. Rodar `node scripts/check-multiplier-sync.js` — garantir que os 4 arquivos TS estão sincronizados.
3. Jogar 10–20 rodadas em modo demo para sentir o ritmo.
4. Após algumas rodadas reais, conferir RTP empírico no banco: `SELECT SUM(payout)/SUM(stake) FROM game_rounds WHERE round_status='settled' AND created_at > now() - interval '1 day'`.

## Observações importantes

- **Sem migration de dados** — só schema (substituição da função SQL). Rodadas em aberto continuam válidas pois usam o `target_barrier` armazenado no `game_rounds`.
- **Sem mudança no engine, UI ou wallet** — toda a lógica de payout já lê da curva/tabela; basta atualizar as fontes.
- **O texto da `RulesScreen`** que menciona "RTP 85.7%" precisa ser revisado — proponho trocar para "RTP teórico ~78%" ou remover o número exato (posso confirmar o valor exato com simulação após implementar).
