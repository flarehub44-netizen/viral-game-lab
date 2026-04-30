# Disaster Recovery - Neon Split LIVE

## Objetivo
Restabelecer operação segura com mínimo impacto financeiro e preservar integridade de ledger.

## Classificação de severidade
- **P1 financeiro**: risco de perda/incorreção financeira.
- **P2 operacional**: degradação sem impacto financeiro direto.

## RTO/RPO
- **P1 financeiro**: RTO 30 min, RPO 0 para ledger.
- **P2 operacional**: RTO 2 h, RPO <= 5 min para telemetria.

## Cenários e procedimentos

### 1) Indisponibilidade Supabase/API
1. Declarar incidente e pausar rollout.
2. Desligar feature flag do novo fluxo se houver erro em cadeia.
3. Redirecionar operação para modo de contenção (sem expansão canary).
4. Validar health checks e integridade de conexao.
5. Reabrir tráfego gradualmente após estabilidade.

### 2) Degradação Edge Functions (`start-round`/`end-round`)
1. Verificar latências p95 e error rate 5xx.
2. Se crítico por 15 min, rollback de flag para 0%.
3. Validar filas de rounds `open` e aplicar fechamento forçado por timeout quando necessário.
4. Corrigir causa raiz e reexecutar smoke tests.

### 3) Corrupção lógica de rodada/contrato (seed/signature/status)
1. Bloquear avanço de canary.
2. Marcar eventos suspeitos como `rejected` com `client_report`.
3. Rodar reconciliação de rounds no período afetado.
4. Abrir análise forense de exploit.

### 4) Falha de monitoramento/alertas
1. Ativar monitoramento secundário manual.
2. Suspender avanço de rollout até restaurar alerta automático.
3. Registrar janela cega e impacto.

## Comunicação
- P1: comunicação inicial em até 10 min para Produto e Tech Lead.
- Atualização de status a cada 15 min até normalização.
- Postmortem em até 48 h.

## Critérios de retorno à operação normal
- Métricas da Fase 5 estáveis por 24 h.
- Sem divergência financeira.
- Aprovação formal de Produto + Tech Lead.
