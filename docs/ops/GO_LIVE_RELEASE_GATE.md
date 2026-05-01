# Go-Live Release Gate (Dinheiro Real)

## Gate de bloqueio (deve ser 100% verde)
- [ ] Sem NO-GO aberto na auditoria de produção
- [ ] `start-round` e `end-round` com rate limit ativo
- [ ] Garantia de uma round OPEN por usuário ativa no banco
- [ ] Job de `close_stale_open_rounds` ativo e monitorado
- [ ] Fluxo Pix: depósito, webhook e saque em ambiente real/sandbox validado
- [ ] Reconciliação financeira diária automatizada
- [ ] CVEs high/critical zerados ou com waiver formal aprovado por Security
- [ ] LGPD: export/delete request funcionando e trilha de acesso ativa
- [ ] Stress test (>=1000 usuários concorrentes) aprovado
- [ ] Drill de desastre validado nos últimos 90 dias

## Aprovações obrigatórias
- [ ] Tech Lead
- [ ] Product Owner
- [ ] Security
- [ ] Legal/Compliance
- [ ] Financeiro
- [ ] CTO

## Artefatos obrigatórios no release
- Relatório de auditoria atualizado.
- Relatório de stress test e capacidade.
- Snapshot de dashboards e alertas ativos.
- Plano de rollback testado.
- Plano de comunicação de incidente.

## Política de rollback
- Qualquer incidente financeiro (P1) = rollback imediato para 0% tráfego novo.
- Freeze de release até RCA com owner e prazo de correção.
