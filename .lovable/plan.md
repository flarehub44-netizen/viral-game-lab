## Objetivo

Diminuir a frequência com que os multiplicadores altos (×3, ×5, ×10, ×20) saem nas rodadas, mantendo o jogo divertido mas com um **RTP ~70%** (perfil casino tradicional, hoje está ~78–85%).

## Diagnóstico

A economia tem 3 alavancas que precisam ser ajustadas em conjunto, senão a mudança de uma só é compensada pela outra:

1. **Tabela de tiers** (`multiplierTable.ts`) — sorteia o `target_barrier` (alvo estatístico de morte). Hoje os tiers altos somam 5%:
   - ×3 = 2,5% · ×5 = 1,5% · ×10 = 0,8% · ×20 = 0,2%
2. **Curva de payout** (`multiplierCurve.ts`) — converte barreiras passadas em multiplicador efetivo. A cauda atual chega a ×50.
3. **Dificuldade pós-alvo** (`liveDeterministicLayout.ts`) — quanto a dificuldade aumenta quando o jogador passa do alvo. Hoje gap × 0,92 e +15 px/s por barreira extra (escalada relativamente suave).

O efeito combinado é que mesmo nos tiers baixos um jogador que joga bem consegue avançar muito além do alvo e cair na cauda alta da curva.

## Mudanças propostas

### 1. Tabela de tiers — cortar massa dos altos, empurrar para baixos

| Mult | Hoje | Novo |
|---|---|---|
| 0    | 0,300 | **0,380** |
| 0,5  | 0,220 | **0,250** |
| 0,8  | 0,160 | **0,170** |
| 1,0  | 0,110 | **0,090** |
| 1,2  | 0,070 | **0,055** |
| 1,5  | 0,050 | **0,030** |
| 2,0  | 0,040 | **0,015** |
| 3,0  | 0,025 | **0,007** |
| 5,0  | 0,015 | **0,003** |
| 10,0 | 0,008 | **0,0008** |
| 20,0 | 0,002 | **0,0002** |
| **RTP teórico** | **0,857** | **~0,53** |

(O RTP empírico fica acima do teórico porque a curva permite passar do alvo. Com a curva e dificuldade ajustadas abaixo, o alvo final é ~70%.)

### 2. Curva de payout — achatar a cauda pós-alvo

Manter o trecho até barreira 30 quase igual (compatibilidade com tiers/UI), mas **achatar a cauda Fase 2** que hoje vai a ×50:

```
Hoje:  [33, 26] [38, 32] [45, 40] [60, 50]
Novo:  [33, 22] [38, 25] [45, 28] [60, 30]
```

Hard cap da curva: ×50 → **×30**.

### 3. Dificuldade pós-alvo — escalada mais agressiva

Em `liveDeterministicLayout.ts`:

| Const | Hoje | Novo |
|---|---|---|
| `PHASE2_GAP_DECAY` | 0,92 | **0,86** |
| `PHASE2_SPEED_STEP` | 15 | **22** |
| `PHASE2_GAP_FLOOR` | 0,025 | **0,02** |

Resultado: passar 5+ barreiras do alvo fica significativamente mais difícil → cauda alta vira evento raro de verdade.

## Arquivos a editar (sempre nos PARES espelhados)

- `src/game/economy/multiplierTable.ts` + `supabase/functions/_shared/multiplierTable.ts` — novas probabilidades
- `src/game/economy/multiplierCurve.ts` + `supabase/functions/_shared/multiplierCurve.ts` — nova cauda + cap
- `src/game/economy/liveDeterministicLayout.ts` — novas constantes Fase 2
- `src/game/economy/constants.ts` — atualizar `TARGET_RTP` para `70.0`
- **Migration SQL** — atualizar a função `compute_multiplier_for_barrier` com as novas âncoras (essa é a fonte de verdade do payout no `settle_round_atomic`)

## Validação

- Rodar `npm run test` — testes de RTP (`rtpSimulation.test.ts`, `skilledRtpSimulation.test.ts`) provavelmente vão precisar de novos thresholds. Vou ajustar os bounds esperados para a nova faixa (RTP casual ~65–72%, skilled ~70–78%).
- Rodar `scripts/check-multiplier-sync.js` para garantir que client e Edge estão idênticos.

## Resumo do efeito esperado

- Multiplicadores ×5+: de ~2,5% para **~0,4%** dos rounds.
- ×10/×20 viram “raros de verdade” (combinados <0,1%).
- RTP empírico cai de ~78% para **~70%** — margem de casino saudável.
- Jogadores skilled ainda podem chegar à cauda, mas com muito mais esforço.
