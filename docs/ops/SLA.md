# SLA operacional - Neon Split LIVE

## Escopo
Este SLA cobre as APIs de rodada LIVE (`start-round`, `end-round`) e a reconciliação financeira de `game_rounds`, `wallets` e `ledger_entries`.

## Objetivos de disponibilidade
- Uptime mensal das APIs de rodada: **99,9%**.
- Janela máxima de indisponibilidade mensal aceitável: **43m 49s**.

## Objetivos de performance
- `start-round` latência p95: **<= 500ms**.
- `end-round` latência p95: **<= 300ms**.
- Alerta crítico de latência sustentada por 15 min:
  - `start-round` p95 **> 800ms**
  - `end-round` p95 **> 500ms**

## SLA financeiro
- Reconciliação de stake/payout por rodada: **100%**.
- Divergência financeira (`payout_discrepancy_count`): **0 tolerado**.
- Qualquer divergência financeira abre incidente **P1**.

## SLOs de integridade de rodada
- `rejected_rate` (janela 1h): alvo **<= 0,5%**, crítico **>= 1,0%**.
- `open_rounds_over_5min`: alvo **<= 5**, crítico **>= 20**.
- RTP (janela 1h): alvo **85,7%**, banda aceitável **83,7% a 87,7%**.

## Tempos de resposta operacional
- MTTA P1: **<= 5 min**.
- MTTR P1: **<= 30 min**.
- MTTA P2: **<= 30 min**.
- MTTR P2: **<= 2 h**.

## Créditos/mitigação operacional
Quando houver violação do SLA:
1. Acionar on-call imediatamente.
2. Congelar expansão de canary.
3. Avaliar rollback via feature flag para 0%.
4. Publicar postmortem e plano de prevenção.
