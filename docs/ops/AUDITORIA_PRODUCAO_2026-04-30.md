# AUDITORIA DE PRODUÇÃO - GRAVITY BET
## Data: 2026-04-30
## Auditor: Codex 5.3

## VEREDITO FINAL
🔴 NO-GO - Bloquear lançamento

## RESUMO EXECUTIVO
Total de itens auditados: 59  
✅ Aprovados: 4 (6,8%)  
⚠️ Warnings: 18 (30,5%)  
🔴 Bloqueadores: 37 (62,7%)

Regra aplicada: há NO-GO em itens críticos de Segurança Financeira, Anti-exploit, Infraestrutura, Segurança Técnica, Testes e Pagamentos.

---

## BLOQUEADORES CRÍTICOS
- Sem controle forte de concorrência para impedir múltiplas rounds OPEN por usuário.
  - Evidência: `start_round_atomic` não valida round OPEN existente e não existe índice único parcial em `game_rounds` (`supabase/migrations/20260430223500_start_round_atomic_v2.sql`).
  - Impacto: risco de inconsistência financeira sob requisições paralelas.
  - Esforço: médio.
  - Owner: Backend/Supabase.
- Sem auto-close de rounds abertas por job agendado.
  - Evidência: há view de alerta (`v_monitor_alerts`) mas não há `pg_cron`/worker de fechamento (`supabase/migrations/20260430224500_climb_monitoring_views.sql`).
  - Impacto: rounds presas e reconciliação operacional degradada.
  - Esforço: médio.
  - Owner: Backend/SRE.
- Sem rate limiting por endpoint/IP/usuário/device nas Edge Functions críticas.
  - Evidência: `start-round` e `end-round` não implementam throttle (`supabase/functions/start-round/index.ts`, `supabase/functions/end-round/index.ts`).
  - Impacto: abuso de API, exploração econômica, DoS lógico.
  - Esforço: médio.
  - Owner: Backend/Security.
- Sem implementação de pagamentos Pix real (depósito/saque/webhook/reconciliação/KYC de titularidade).
  - Evidência: ausência de serviços/entidades/fluxos Pix no código; UI menciona ausência de saque em demo.
  - Impacto: plataforma não apta a operar dinheiro real no Brasil.
  - Esforço: alto.
  - Owner: Payments + Backend.
- Dependências com CVEs high/critical.
  - Evidência: `npm audit --omit=dev --audit-level=high` retornou 34 vulnerabilidades (12 high, 6 critical).
  - Impacto: risco de comprometimento por supply chain e bibliotecas vulneráveis.
  - Esforço: médio-alto.
  - Owner: Frontend Platform.
- Compliance/LGPD sem evidência técnica executável para requisitos críticos.
  - Evidência: não há implementação comprovada de direito ao esquecimento, trilha de acesso a PII, governança DPO operacional.
  - Impacto: risco jurídico e regulatório.
  - Esforço: alto.
  - Owner: Legal/Compliance + Engenharia.

---

## WARNINGS (NÃO BLOQUEIAM, MAS EXIGEM AÇÃO)
- Arquitetura financeira está majoritariamente server-first, mas coexistem módulos legados de economia local (`src/game/economy/wallet.ts`, `src/game/economy/demoRound.ts`) e precisam isolamento rígido em produção.
- `MAX_PAYOUT` está aplicado no servidor e documentado no cliente, porém faltam testes de borda explícitos para teto extremo.
- Há runbooks e documentação de SLA/DR/canary (`docs/ops/*`), mas sem evidência automatizada de execução contínua.
- Testes Vitest estão verdes (26/26), mas sem cobertura formal por domínio crítico e sem prova de stress/soak.
- Replay em `end-round` é idempotente, mas sem pipeline formal de antifraude/reincidência.

---

## RECOMENDAÇÕES PRIORITÁRIAS (TOP 10)
1. Criar índice único parcial: uma `game_rounds` OPEN por usuário.
2. Incluir validação transacional de round OPEN no `start_round_atomic`.
3. Implementar auto-close via `pg_cron` + reconciliação obrigatória.
4. Implementar rate limiting (IP + user + fingerprint) em `start-round`, `end-round`, `submit-score`.
5. Implantar antifraude mínimo (velocity, heurísticas de bot, replay flags, investigação).
6. Implementar stack Pix completo com webhooks confiáveis e reconciliação.
7. Remediar CVEs high/critical e reduzir superfície de dependências.
8. Formalizar LGPD técnica (PII audit log, DSAR, retenção, evidência de acesso).
9. Executar stress tests reais (1000 usuários, 10k rounds/h, soak 24h).
10. Exigir gate de release com aprovação Tech/Product/Legal/Finance.

---

## ANÁLISE POR SEÇÃO

### Seção 1: Segurança Financeira
- Total de itens: 7
- Aprovados: 3
- Warnings: 2
- Bloqueadores: 2
- Status geral: NO-GO

1.1 Servidor é fonte única da verdade — **GO ✅**  
Evidência: `start-round` sorteia multiplicador e calcula payout (`start-round` linhas ~138-145), cliente só consome payload (`src/pages/Index.tsx` linhas ~291-347). `end-round` não recalcula payout (`end-round` linhas ~120-148).  
Correção: manter e impedir bypass com rotas internas não autorizadas.

1.2 RTP dentro da banda — **WARNING ⚠️**  
Evidência: teste existe só para 10k rounds e faixa 0.82-0.89 (`src/test/rtpSimulation.test.ts`), não 83.7-87.7 estrito nem 100k.  
Correção: simulação 100k+ por build/release e relatório estatístico versionado.

1.3 MAX_PAYOUT respeitado — **WARNING ⚠️**  
Evidência: cap `MAX_PAYOUT = 400` no servidor (`start-round` linhas ~11, ~141-143) e constante espelho no cliente (`src/game/economy/constants.ts`).  
Correção: adicionar testes de borda (stake=50, mult=20, arredondamento e tentativas de overflow).

1.4 Reconciliação de saldo — **GO ✅**  
Evidência: consulta MCP validou `wallet_delta` = `sum(net_result)` e `ledger_net` consistente para usuário real auditado; ledger registra `stake` e `payout` (`start_round_atomic_v2.sql`).  
Correção: automatizar reconciliação contínua com alerta P1.

1.5 Idempotência garantida — **GO ✅**  
Evidência: `start_round_atomic` retorna round existente por `idempotency_key`; `end-round` retorna `already_settled` se não OPEN.  
Correção: adicionar teste concorrente com retries simultâneos.

1.6 Transações atômicas — **WARNING ⚠️**  
Evidência: `start_round_atomic` encapsula débito+ledger+round em função PL/pgSQL (atômico). `end-round` atualiza estado da round, mas não há lançamento financeiro no fechamento (porque liquidação ocorre no start).  
Correção: documentar formalmente esse contrato e monitorar divergências por round.

1.7 Race conditions — **NO-GO 🔴**  
Evidência: não há garantia de “single OPEN round per user” em banco/índice; sem stress concorrente comprovado.  
Correção: índice único parcial + lock explícito + testes de corrida.

### Seção 2: Proteção Anti-Exploit
- Total de itens: 8
- Aprovados: 1
- Warnings: 3
- Bloqueadores: 4
- Status geral: NO-GO

2.1 Layout signature validation — **GO ✅**  
Evidência: `end-round` compara `layout_seed` e `layout_signature`; mismatch vira `rejected` com `client_report`.  
Correção: incluir hash com segredo server-side rotativo para endurecer.

2.2 Replay attack prevention — **WARNING ⚠️**  
Evidência: replay retorna `already_settled`, mas sem bloqueio/flag de fraude persistente.  
Correção: registrar replay score e bloquear após limiar.

2.3 Time validation — **WARNING ⚠️**  
Evidência: há `hardTimeout = max_duration + 30`, porém sem detecção robusta de velocidade impossível/cadência anômala.  
Correção: validar telemetria de tempo e consistência física mínima.

2.4 Round state machine — **WARNING ⚠️**  
Evidência: estados `open|closed|expired|rejected` com check constraint; update condicionado a `open`.  
Correção: formalizar transições permitidas em função dedicada com auditoria.

2.5 Single round per user — **NO-GO 🔴**  
Evidência: ausência de índice único parcial OPEN por usuário.  
Correção: `create unique index ... on game_rounds(user_id) where round_status='open';`.

2.6 Timeout enforcement — **NO-GO 🔴**  
Evidência: sem cron/worker de auto-close; apenas view de monitoramento.  
Correção: `pg_cron`/worker para expirar e reconciliar.

2.7 Anti-bot detection — **NO-GO 🔴**  
Evidência: inexistente no código auditado.  
Correção: heurísticas + risk engine + device telemetry.

2.8 Rate limiting — **NO-GO 🔴**  
Evidência: inexistente nas funções críticas.  
Correção: rate limiter distribuído por IP/user/device e quota dinâmica.

### Seção 5: Infraestrutura
- Total de itens: 8
- Aprovados: 0
- Warnings: 2
- Bloqueadores: 6
- Status geral: NO-GO

5.1 Disponibilidade — **NO-GO 🔴**  
Evidência: há meta em doc (`docs/ops/SLA.md`), sem prova operacional de 99.5%+ e failover.  
Correção: publicar histórico de uptime e estratégia multi-região.

5.2 Performance — **WARNING ⚠️**  
Evidência: SLOs documentados (`docs/ops/SLA.md`), sem evidência de p95 medido contínuo.  
Correção: dashboard p95 em produção com retenção e alerta.

5.3 Capacidade — **NO-GO 🔴**  
Evidência: sem stress test comprovado de carga alvo.  
Correção: executar e anexar relatório de load test.

5.4 Backup — **NO-GO 🔴**  
Evidência: sem evidência de restore testado, RPO/RTO auditáveis no ambiente real.  
Correção: testes trimestrais de restore com evidência.

5.5 Logs e auditoria — **NO-GO 🔴**  
Evidência: logs de app existem parcialmente; imutabilidade e retenção 90+ dias não comprovadas.  
Correção: pipeline append-only com retenção e trilha por round.

5.6 Monitoramento — **WARNING ⚠️**  
Evidência: views de monitor (`v_round_health`, `v_rtp_live`, `v_monitor_alerts`) existem; sem prova de dashboard real-time ativo 30+ dias.  
Correção: integrar Grafana/Datadog/Supabase dashboards com histórico.

5.7 Alerting — **NO-GO 🔴**  
Evidência: runbook cita on-call, mas sem PagerDuty/OpsGenie configurado comprovado.  
Correção: integração de alertas e rotação auditável.

5.8 Disaster Recovery — **NO-GO 🔴**  
Evidência: `docs/ops/DISASTER_RECOVERY.md` existe, sem drill comprovado últimos 90 dias.  
Correção: realizar DR drill e armazenar evidência.

### Seção 6: Segurança Técnica
- Total de itens: 8
- Aprovados: 1
- Warnings: 2
- Bloqueadores: 5
- Status geral: NO-GO

6.1 HTTPS obrigatório — **WARNING ⚠️**  
Evidência: endpoints Supabase usam `https://...supabase.co`; HSTS não comprovado nesta auditoria.  
Correção: validar HSTS/ciphers com scanner externo.

6.2 Autenticação — **NO-GO 🔴**  
Evidência: JWT e refresh existem via Supabase Auth, mas 2FA e política de timeout de sessão para operação financeira não comprovadas.  
Correção: habilitar MFA e política de sessão explícita.

6.3 Autorização — **GO ✅**  
Evidência: RLS habilitada em tabelas críticas e escrita sensível via `service_role`/RPC.  
Correção: auditoria periódica de policies por diff.

6.4 Criptografia — **WARNING ⚠️**  
Evidência: TLS em transporte presumido com Supabase; criptografia em repouso e controles específicos não validados por evidência desta auditoria.  
Correção: anexar evidência de compliance do provedor + chaves/segredos.

6.5 WAF — **NO-GO 🔴**  
Evidência: não encontrado.  
Correção: WAF com regras OWASP e mitigação DDoS.

6.6 Rate limiting — **NO-GO 🔴**  
Evidência: não encontrado por endpoint/IP/user.  
Correção: implementar imediatamente.

6.7 Vulnerabilidades — **NO-GO 🔴**  
Evidência: `npm audit` com high/critical abertas.  
Correção: plano de upgrade + verificação SCA em CI.

6.8 LGPD compliance — **NO-GO 🔴**  
Evidência: ausência de trilha técnica completa dos requisitos pedidos.  
Correção: implementar programa LGPD técnico-operacional.

### Seção 7: Testes
- Total de itens: 7
- Aprovados: 0
- Warnings: 2
- Bloqueadores: 5
- Status geral: NO-GO

7.1 Cobertura unitária — **NO-GO 🔴**  
Evidência: não há relatório de cobertura por domínio crítico (100/90/80).  
Correção: exigir coverage gates por pacote.

7.2 Testes de integração — **WARNING ⚠️**  
Evidência: existe script E2E `scripts/test-end-round.ps1`; não há suíte integrada contínua comprovada.  
Correção: automatizar no CI com ambiente isolado.

7.3 Testes E2E — **NO-GO 🔴**  
Evidência: sem fluxo completo de dinheiro real (cadastro + depósito Pix + rodada + saque Pix).  
Correção: suíte Playwright/Cypress com ambiente sandbox.

7.4 Testes de exploit — **WARNING ⚠️**  
Evidência: há teste de validação de `end-round`, porém parcial e sem hijacking/SQLi/XSS completos.  
Correção: suíte de segurança ofensiva automatizada.

7.5 Stress tests — **NO-GO 🔴**  
Evidência: não comprovado.  
Correção: k6/Gatling com metas explícitas.

7.6 RTP simulation — **NO-GO 🔴**  
Evidência: apenas 10k rounds em teste; requisito pede 100k.  
Correção: simulação 100k+ com controle de seed e relatório.

7.7 Regression tests — **NO-GO 🔴**  
Evidência: `npm run test` passa, mas lint falha (10 erros) e não há CI/CD de release comprovado.  
Correção: pipeline obrigatório com gates.

### Seção 8: Pagamentos
- Total de itens: 6
- Aprovados: 0
- Warnings: 0
- Bloqueadores: 6
- Status geral: NO-GO

8.1 Depósito Pix funcional — **NO-GO 🔴**  
Evidência: inexistente.
Correção: implementar gateway Pix + webhook de confirmação + reconciliação.

8.2 Saque Pix funcional — **NO-GO 🔴**  
Evidência: inexistente.
Correção: implementar fluxo de saque com SLA e estados.

8.3 Validação de Pix titular — **NO-GO 🔴**  
Evidência: inexistente.
Correção: validar CPF titular da chave e bloquear terceiros.

8.4 Limites de transação — **NO-GO 🔴**  
Evidência: não implementado para depósitos/saques reais.
Correção: limites mínimo/máximo + diário por usuário.

8.5 Reserva financeira — **NO-GO 🔴**  
Evidência: sem evidência técnica/processual auditável no repositório.
Correção: governança financeira formal e reconciliação diária.

8.6 Antifraude no pagamento — **NO-GO 🔴**  
Evidência: inexistente.
Correção: risk scoring + revisão manual em saques de risco.

### Seção 9: UX e Acessibilidade
- Total de itens: 6
- Aprovados: 0
- Warnings: 4
- Bloqueadores: 2
- Status geral: WARNING

9.1 Mobile-first funcional — **WARNING ⚠️**  
Evidência: design mobile-first presente, mas sem matriz de QA formal 320-480px.
Correção: suíte visual e device lab.

9.2 Cross-browser — **NO-GO 🔴**  
Evidência: não comprovado por testes formais.
Correção: matriz de navegadores em CI.

9.3 Acessibilidade básica — **NO-GO 🔴**  
Evidência: sem auditoria WCAG AA comprovada.
Correção: axe/lighthouse + correções.

9.4 Internacionalização — **WARNING ⚠️**  
Evidência: texto PT-BR presente; sem estratégia i18n formal.
Correção: camada de i18n e formatação robusta.

9.5 Onboarding — **WARNING ⚠️**  
Evidência: há telas e regras, mas sem validação quantitativa de first-time success.
Correção: medir funil e iterar onboarding.

9.6 Estados de erro — **WARNING ⚠️**  
Evidência: há toasts amigáveis em vários fluxos; sem catálogo completo de erros.
Correção: padronizar mensagens/recovery map.

### Seção 10: Operação e Suporte
- Total de itens: 6
- Aprovados: 0
- Warnings: 4
- Bloqueadores: 2
- Status geral: NO-GO

10.1 Equipe de suporte — **WARNING ⚠️**  
Evidência: responsabilidades documentadas (`docs/ops/RESPONSIBILITIES.md`), sem prova de operação ativa.
Correção: evidência de SLA de tickets e treinamento.

10.2 Painel administrativo — **WARNING ⚠️**  
Evidência: há componente de monitoramento, mas sem evidência de hardening e trilha administrativa completa.
Correção: RBAC estrito + audit trail.

10.3 Runbooks — **GO ✅**  
Evidência: runbooks presentes e estruturados (`docs/ops/SLA.md`, `DISASTER_RECOVERY.md`, `CANARY_ROLLOUT_CHECKLIST.md`).
Correção: versionar execução real dos runbooks.

10.4 On-call rotation — **WARNING ⚠️**  
Evidência: política de rotação documentada, sem prova de escala vigente.
Correção: calendário on-call auditável + confirmação diária.

10.5 Incident response — **WARNING ⚠️**  
Evidência: processo descrito em docs, sem evidência de drills/postmortems recentes.
Correção: exercícios mensais.

10.6 Comunicação com usuários — **NO-GO 🔴**  
Evidência: statuspage/canal público de incidentes não comprovado.
Correção: publicar canal de status e playbook de comunicação.

### Seção 12: Rollback e Contingência
- Total de itens: 3
- Aprovados: 0
- Warnings: 2
- Bloqueadores: 1
- Status geral: NO-GO

12.1 Feature flag funcional — **WARNING ⚠️**  
Evidência: estratégia em docs, sem implementação técnica verificável no código.
Correção: implantar sistema de feature flags com kill switch validado.

12.3 Versionamento de banco — **WARNING ⚠️**  
Evidência: migrations existem, mas reversibilidade formal e testes de rollback não comprovados.
Correção: estratégia de rollback forward-only + scripts de compensação testados.

12.4 Blue-green deployment — **NO-GO 🔴**  
Evidência: sem estratégia equivalente comprovada no pipeline.
Correção: implantar blue-green/canary automatizado com rollback em <60s.

---

## RISCOS NÃO MITIGADOS
- Exploração por concorrência em rounds abertas.
- Abuso de endpoints críticos sem limitação de taxa.
- Lacuna antifraude para dinheiro real.
- Exposição por CVEs altos/críticos.
- Risco legal/regulatório por lacunas LGPD/Pagamentos.

## CHECKLIST PRÉ GO-LIVE FINAL
Verificar antes do deploy:
- [ ] Todos os bloqueadores resolvidos
- [ ] Pelo menos 80% dos warnings tratados
- [ ] Equipe de suporte de plantão
- [ ] Plano de rollback testado
- [ ] Stakeholders notificados
- [ ] Backup recente do banco
- [ ] Monitoramento ativo
- [ ] War room configurado
- [ ] Comunicação preparada

## ASSINATURA DE APROVAÇÃO
Para liberar produção, exige aprovação de:
- [ ] Tech Lead
- [ ] Product Owner
- [ ] CTO
- [ ] CEO
- [ ] Legal/Compliance
- [ ] Financial

## PRÓXIMOS PASSOS
1. Bloquear go-live com dinheiro real imediatamente.
2. Executar plano de remediação dos NO-GO (Seções 1, 2, 6, 8 e 12).
3. Rodar nova auditoria com evidência executável (carga, segurança, DR drill, compliance).
4. Só considerar canário após zerar bloqueadores críticos.

Palavra final: este produto lida com dinheiro real de pessoas reais. No estado atual, o risco financeiro, técnico e regulatório ainda é inaceitável para produção.
