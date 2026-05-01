# Auditoria Completa — Gravity Bet / Neon Split

## Objetivo
Verificar se todas as páginas e fluxos estão **funcionais** e **seguros** o bastante para receber usuários reais (com dinheiro real via Pix). Entregar um relatório executável e priorizado.

## Escopo

### Páginas / rotas a auditar
- `/` (Index) — fluxo demo + online: AuthScreen, AgeGate, Lobby, RoundSetup, Wallet, Deposit, Withdraw, KYC, Rules, GameCanvas, GameOver, Leaderboard, Nickname.
- `/admin/*` — Overview, Sandbox, Users, Flags, Fraud (verificar gating de acesso por role).
- `/404` (NotFound).

### Backend
- 12 Edge Functions: `start-round`, `end-round`, `submit-score`, `create-pix-deposit`, `request-pix-withdrawal`, `pix-webhook`, `lgpd-export`, `lgpd-delete-request`, `record-consent`, `admin-action`, `close-stale-rounds`, `process-lgpd-deletions`.
- 24 migrations / RLS / RPCs / triggers do projeto externo (`pbkdmcjlscjdvkaiypye`).

## Método

### 1. Auditoria estática (sem rodar nada)
- Ler cada página e mapear: estados, chamadas de rede, validação de input, tratamento de erro, loading/empty states.
- Ler cada Edge Function e checar: CORS, JWT (`getClaims`), validação Zod, rate limit (`guard_request_rate`), idempotência, uso de `service_role` vs anon, logs de fraude.
- Ler RLS de todas as tabelas: `wallets`, `ledger_entries`, `game_rounds`, `pix_deposits`, `pix_withdrawals`, `profiles`, `scores`, `user_roles`, `fraud_signals`, `data_access_audit`, `lgpd_deletion_requests`, `api_request_logs`.
- Diff contra o status documentado em `docs/ops/TOP10_IMPLEMENTATION_STATUS.md` e `AUDITORIA_PRODUCAO_2026-04-30.md` para identificar regressões ou gaps ainda abertos.

### 2. Auditoria dinâmica
- Rodar `npm run lint`, `npm run typecheck:strict`, `npm run test`.
- Rodar `npm audit --omit=dev` para CVEs.
- Consultar logs reais do Supabase externo via `supabase--analytics_query` e `supabase--edge_function_logs` para erros recentes em produção.
- Browser test do fluxo crítico no preview: signup → age gate → lobby → start round demo → game over → leaderboard. Tentar acessar `/admin` como usuário comum (deve bloquear).

### 3. Checklist por categoria (cada item: GO ✅ / WARNING ⚠️ / NO-GO 🔴 com evidência)
1. **Funcionalidade das páginas** — todas renderizam, navegação funciona, estados de erro/loading/empty cobertos.
2. **Autenticação & autorização** — login, signup, reset, OAuth, age gate, RLS, role-based admin gating, separação demo/online.
3. **Segurança financeira** — server-first, idempotência, atomicidade, MAX_PAYOUT, race conditions (single OPEN round), reconciliação.
4. **Anti-exploit** — layout signature, replay, time validation, state machine, rate limit, antifraude, anti-bot.
5. **Pix (dinheiro real)** — depósito, webhook (HMAC + IP allowlist), saque, idempotência, validação de titularidade CPF, limites, estados.
6. **Validação de input** — Zod no servidor, sanitização no cliente, limites de tamanho, XSS em nickname/display_name.
7. **Segredos e config** — nenhum secret no repo, `.env` correto, JWT verify_jwt apropriado por função.
8. **LGPD** — export, delete request, audit log, criptografia de CPF, consentimento.
9. **Observabilidade** — logs, views de monitor, alertas, runbooks.
10. **Qualidade de código** — lint, typecheck strict, testes verdes, CVEs.
11. **UX/Acessibilidade** — mobile-first 320-480px, estados de erro amigáveis, feedback de ações destrutivas.
12. **Admin** — RBAC, audit trail de ações administrativas, proteção contra escalation.

### 4. Entregáveis
- `/mnt/documents/AUDITORIA_COMPLETA_2026-05-01.md` — relatório completo com:
  - Veredito final (GO / GO-com-restrições / NO-GO)
  - Resumo executivo (contagem GO/WARN/NO-GO)
  - Bloqueadores críticos com evidência (arquivo:linha)
  - Warnings priorizados
  - Checklist página-por-página
  - Diff vs auditoria anterior (o que foi resolvido, o que regrediu, o que continua aberto)
  - Top 10 ações prioritárias antes de aceitar dinheiro real
- `/mnt/documents/auditoria_anexos/` — saídas brutas de lint, typecheck, npm audit, test, e logs relevantes.

## Restrições
- **Read-only**: não vou alterar código, schema nem rodar nenhuma ação destrutiva. Só leitura, testes e geração de relatório.
- Não vou disparar pagamentos reais nem testes de carga em produção.
- O Supabase deste app é **externo** (project ref `pbkdmcjlscjdvkaiypye`), então alguns checks (linter, scan) sobre o Lovable Cloud do sandbox não se aplicam — vou usar `supabase--analytics_query` / `supabase--edge_function_logs` que apontam para o externo, e leitura direta dos arquivos de migration para validar schema/RLS.

## Estimativa
~15–25 minutos de execução (leitura + testes + browser smoke + geração do relatório).

Aprova que eu siga?
