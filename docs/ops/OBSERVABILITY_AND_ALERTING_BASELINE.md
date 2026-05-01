# Observability and Alerting Baseline

## Objetivo
Estabelecer baseline mínimo de observabilidade para liberar tráfego real em produção.

## Dashboards obrigatórios
1. `rounds_live_overview`
   - total_rounds_1h
   - rejected_rate_1h
   - open_rounds_over_5min
2. `economy_integrity`
   - total_stake_1h
   - total_payout_1h
   - rtp_1h
   - payout_discrepancy_count
3. `edge_latency`
   - start-round p50/p95/p99
   - end-round p50/p95/p99
   - 4xx/5xx rate
4. `payments_pix`
   - pix_deposit_pending_count
   - pix_deposit_confirmed_count
   - pix_withdraw_requested_count
   - pix_withdraw_failed_count

## Alertas Severity 1
- `rejected_rate_1h >= 1%`
- `open_rounds_over_5min >= 20`
- `rtp_1h < 0.837 or rtp_1h > 0.877`
- `start-round p95 > 800ms (15 min)`
- `end-round p95 > 500ms (15 min)`
- `payout_discrepancy_count > 0`

## Alertas Severity 2
- `rejected_rate_1h > 0.5%`
- `open_rounds_over_5min > 5`
- `pix_deposit_pending_count` crescendo por 15 min
- `pix_withdraw_failed_count > 0` em janela de 30 min

## Destinos e escalonamento
- Destino primário: PagerDuty/OpsGenie.
- Fallback: canal de incidentes (Slack/Teams).
- Escalonamento:
  - T+0: On-call primário.
  - T+5 min: On-call backup + Tech Lead.
  - T+15 min: Produto + Stakeholders.

## Evidência mínima para auditoria
- Screenshot do dashboard em produção.
- Export dos alert rules.
- Registro de teste de firing/acknowledge.
- Registro de drill de incidente nos últimos 30 dias.
