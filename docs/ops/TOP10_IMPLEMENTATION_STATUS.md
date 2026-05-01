# Top 10 Implementation Status

Data: 2026-04-30

## 1) Single OPEN round per user
- Implementado.
- Evidências:
  - Índice parcial único `game_rounds_single_open_per_user_idx`.
  - `start_round_atomic` agora falha com `open_round_exists`.

## 2) Rate limiting por usuário/IP/device
- Implementado (base server-side).
- Evidências:
  - Tabela `api_request_logs`.
  - Função `guard_request_rate`.
  - Aplicado em `start-round`, `end-round`, `submit-score`, `create-pix-deposit`, `request-pix-withdrawal`.

## 3) Auto-close de rounds OPEN
- Implementado (base).
- Evidências:
  - Função `close_stale_open_rounds`.
  - Agendamento `pg_cron` tentado com fallback não fatal.
- Estado operacional:
  - Job `close-stale-open-rounds` confirmado ativo no projeto remoto (rodando `close_stale_open_rounds(300)` a cada minuto).

## 4) Antifraude mínima
- Implementado (base).
- Evidências:
  - Tabela `fraud_signals`.
  - Função `log_fraud_signal`.
  - Eventos de replay/signature mismatch/seed mismatch em `end-round`.

## 5) CVEs high/critical
- Parcialmente resolvido.
- Evidências:
  - `gh` removido de dependências.
  - `react-router-dom` atualizado.
  - `npm audit` saiu de high/critical para apenas low/moderate.
- Pendência:
  - Tratar moderados restantes com plano de upgrade controlado.

## 6) Pix (depósito/saque/webhook/reconciliação)
- Implementado (MVP backend).
- Evidências:
  - Tabelas: `pix_deposits`, `pix_withdrawals`.
  - RPCs: `create_pix_deposit_request`, `confirm_pix_deposit`, `request_pix_withdrawal`.
  - Edge functions: `create-pix-deposit`, `pix-webhook`, `request-pix-withdrawal`.
- Pendências críticas:
  - Integração operacional com Sync Pay (secrets + cadastro de webhook + smoke Pix real).
  - Endurecimento do webhook: **allowlist de IP e/ou bearer** deve estar configurado antes de receber eventos reais (sem “modo aberto”).
  - Validar titularidade CPF com provedor/KYC externo.

## 7) LGPD técnico
- Implementado (base).
- Evidências:
  - Tabelas: `data_access_audit`, `lgpd_deletion_requests`.
  - RPCs: `log_data_access_event`, `request_lgpd_deletion`.
  - Edge functions: `lgpd-export`, `lgpd-delete-request`.
- Pendência:
  - Workflow operacional de processamento de deleção e SLA jurídico.

## 8) Observabilidade e alertas
- Implementado (baseline documental + views existentes).
- Evidências:
  - Documento `OBSERVABILITY_AND_ALERTING_BASELINE.md`.
  - Views `v_round_health`, `v_rtp_live`, `v_monitor_alerts`.
- Pendência:
  - Conectar dashboards/alertas reais (PagerDuty/OpsGenie).

## 9) Stress tests
- Implementado (script base).
- Evidências:
  - Script `scripts/load-start-end-round.js`.
  - Script npm: `test:load`.
- Pendência:
  - Rodar campanha real com evidência (1000 concorrentes + soak 24h).

## 10) Gate formal de release
- Implementado (processo).
- Evidências:
  - Documento `GO_LIVE_RELEASE_GATE.md`.
  - Tabela `feature_flags` + helper `src/lib/featureFlags.ts`.
- Pendência:
  - Integrar gate no pipeline CI/CD e aprovação de signatários.
