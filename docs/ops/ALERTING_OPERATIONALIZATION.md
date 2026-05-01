# Operacionalização de PagerDuty/OpsGenie + Statuspage + Drills

## Objetivo
Tornar monitoramento e resposta a incidentes executáveis, não apenas documentais.

## 1) PagerDuty / OpsGenie
- Criar serviço `neon-live-economy`.
- Rotação:
  - Primário (24x7)
  - Backup (24x7)
- Regras de roteamento:
  - P1 financeiro: página imediata.
  - P2 operacional: notificação + ack em até 30 min.
- Integração com alertas:
  - `critical_rtp_out_of_band`
  - `critical_rejected_rate`
  - `critical_open_rounds`
  - `payout_discrepancy_count > 0`

## 2) Statuspage
- Criar componentes:
  - API Live Rounds
  - Payments Pix
  - Leaderboard
- Automatizar publicação em P1:
  - Mensagem inicial em até 10 min
  - Atualização a cada 15 min
  - Encerramento + RCA em até 48h
- Script pronto no repositório:
  - `scripts/statuspage-create-incident.ps1`

## 3) Drill operacional
- Frequência:
  - Drill técnico mensal
  - DR drill trimestral
- Cenários:
  1. indisponibilidade start-round
  2. rtp fora de banda por 20 min
  3. webhook Pix atrasado
  4. múltiplas rounds OPEN
- Evidências mínimas:
  - timeline do incidente
  - tempo de ack
  - tempo de mitigação
  - ações de prevenção

Script de disparo de P1 para simulação:
- `scripts/pagerduty-trigger.ps1`

### Checklist executável (evidência mínima)
Pré-requisitos:
- Routing key da Events API v2 do PagerDuty salvo em gerenciador de secrets (não commitar).
- `PageId` + API key do Statuspage salvos em gerenciador de secrets (não commitar).
- Canal interno (Slack/Teams) para centralizar timeline durante o drill.

Execução (exemplo Windows/PowerShell):
- Disparar alerta simulado:

```powershell
.\scripts\pagerduty-trigger.ps1 -RoutingKey "<ROUTING_KEY>" -Summary "DRILL: start-round indisponível" -Severity critical
```

- Abrir comunicação externa simulada:

```powershell
.\scripts\statuspage-create-incident.ps1 -PageId "<PAGE_ID>" -ApiKey "<STATUSPAGE_API_KEY>" `
  -Name "DRILL: Degradação API Live Rounds" `
  -Body "Exercício operacional: investigação em andamento." `
  -Status investigating
```

Artefatos para anexar no postmortem:
- Print ou export do incidente no PagerDuty (ACK + escalate timeline).
- Link do incidente no Statuspage + updates.
- Logs correlatos (Edge Functions / Postgres) com intervalo de tempo do drill.

## 4) Métricas de sucesso
- MTTA P1 <= 5 min
- MTTR P1 <= 30 min
- 100% dos P1 com postmortem
