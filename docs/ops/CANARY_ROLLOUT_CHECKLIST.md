# Checklist de rollout canario

## Pré-requisitos
- Feature flag ativa e segmentação por coorte habilitada.
- Painel de monitoramento e alertas ativos.
- On-call primário e backup confirmados.

## Etapas
1. **Staging sintético (1-2 dias)**  
   Validar smoke, carga e exploit tests.
2. **Produção interna (1 dia)**  
   Staff/dev apenas, com validação manual de UX e fluxo financeiro.
3. **5% (24h)**  
   Coorte baixa exposição.
4. **25% (48h)**  
   Sem incidentes financeiros.
5. **50% (72h)**  
   RTP estável e alertas em `ok`.
6. **75% (24h)**  
   Operação verde.
7. **100% (full)**  
   Manter flag por 7 dias para rollback rápido.

## Gate por etapa (deve permanecer estável na janela inteira)
- RTP 1h entre 83,7% e 87,7%.
- `rejected_rate` <= 0,5%.
- `start-round` p95 <= 500ms.
- `end-round` p95 <= 300ms.
- `open_rounds_over_5min` <= 5.
- `payout_discrepancy_count` = 0.

## Aprovação formal para avanço
- Produto: aprovado
- Tech Lead: aprovado
- Operação: aprovado

## Rollback
- Qualquer violação crítica => feature flag 0% imediatamente.
- Abrir incidente, congelar expansão e registrar RCA.
