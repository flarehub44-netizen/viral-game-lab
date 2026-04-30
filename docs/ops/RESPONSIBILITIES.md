# Responsabilidades operacionais - LIVE

## Papéis
- **On-call primario (Eng)**: resposta imediata, triagem e mitigação.
- **On-call backup (Eng)**: cobertura e execução paralela de diagnóstico.
- **Tech Lead**: decisão técnica final de rollback/retomada.
- **Produto**: aprova gate de rollout e comunicação de impacto.
- **Responsável de Operação**: valida runbook, checklist e evidências de gate.

## Rotação on-call
- Rotação semanal com primário + backup.
- Handover obrigatório no início/fim da semana.
- Contato de escalonamento validado diariamente.

## Aprovações obrigatórias
- Avanço de canary exige:
  - Aprovação de Produto
  - Aprovação de Tech Lead
  - Aprovação do responsável de operação
- Se qualquer métrica crítica falhar, avanço bloqueado.

## Escalation path
- **P1**: On-call (imediato) -> Tech Lead (5 min) -> Produto/Negócio (15 min).
- **P2**: On-call -> responsável de domínio (30 min).

## Autoridade de rollback
- On-call primário pode executar rollback para 0% sem aprovação prévia em P1.
- Pós-rollback: notificar Tech Lead e Produto imediatamente.
