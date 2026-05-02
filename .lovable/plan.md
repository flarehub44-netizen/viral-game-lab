
# Plano: Onboarding com ganhos pequenos + retenção

Quatro features integradas em torno de um conceito central: **carteira-bônus separada da carteira real**, com rollover de 10× (boas-vindas/missões/streak) ou 5× (free spins). Bônus nunca sai como saque até o rollover ser cumprido.

---

## 1. Fundação: carteira-bônus separada

Toda a mecânica abaixo depende disso.

### Banco
- Adicionar à `wallets`: `bonus_balance numeric default 0`, `bonus_rollover_required numeric default 0`, `bonus_rollover_progress numeric default 0`.
- Nova tabela `bonus_grants` (auditoria): `id, user_id, kind` (welcome/mission/streak/freespin), `amount, rollover_multiplier, granted_at, meta jsonb`.
- Estender `ledger_entries.kind` para aceitar: `bonus_grant`, `bonus_to_real` (conversão pós-rollover), `bonus_stake`, `bonus_payout`.

### Regras de gasto
- Ao iniciar rodada, `start_round_atomic` consome **primeiro do `bonus_balance`**, depois do `balance` real. Isso garante que stake conta para rollover.
- Cada R$ apostado de qualquer carteira incrementa `bonus_rollover_progress` em 1× (100% contribui).
- Ao liquidar, `settle_round_atomic` credita payout proporcional: se a stake foi 100% bônus, payout vai 100% para `bonus_balance`; misto, divide proporcionalmente.
- Quando `bonus_rollover_progress >= bonus_rollover_required` E `bonus_balance > 0`: dispara conversão automática `bonus_balance → balance` (entrada `bonus_to_real` no ledger), zera contadores.

### Saque
- `request_pix_withdrawal` continua usando só `balance` real. Bônus nunca é sacável diretamente.

---

## 2. Bônus de boas-vindas (R$ 1, rollover 10×)

- Novo edge function `claim-welcome-bonus`:
  - Verifica `over_18_confirmed_at IS NOT NULL`.
  - Verifica que não existe `bonus_grants` com `kind='welcome'` para o user.
  - Anti-fraude: só 1 por device fingerprint + IP (consulta `api_request_logs` ou tabela nova `welcome_bonus_claims` com unique em `device_fingerprint` e `ip_hash`).
  - Credita R$ 1 em `bonus_balance`, define `bonus_rollover_required += 10`.
  - Registra `bonus_grants` + `ledger_entries(kind='bonus_grant')`.
- UI: banner no `LobbyScreen` "Você ganhou R$ 1 grátis para começar!" → botão "Resgatar". Some após resgate.

---

## 3. Primeira rodada real enviesada

- No `start-round`, contar `select count(*) from game_rounds where user_id = ? and mode != 'sandbox'`.
- Se 0: usar tabela alternativa `WELCOME_MULTIPLIER_TABLE` (pesos: ×0=0%, ×1.2=40%, ×1.5=35%, ×2.0=25%) → garante vitória entre R$1.20 e R$2.00 por R$1 apostado.
- Marcador `client_report.welcome_round = true` para auditoria.
- Não conta como "rodada normal" para RTP (excluído de relatórios de RTP por flag).

---

## 4. Missões diárias pagando bônus

Hoje em `progression.ts` missões só dão XP local. Adicionar payout em saldo-bônus.

- Nova tabela `daily_missions_claims`: `user_id, mission_seed (date YYYY-MM-DD), mission_id, completed_at, claimed_at, bonus_amount`.
- 3 missões/dia, payout fixo: R$ 0,10 / R$ 0,15 / R$ 0,25 (total R$ 0,50/dia).
- Edge function `claim-mission-reward`: valida missão completa server-side (recomputa critério a partir de `game_rounds` do dia), credita bônus com rollover 10×.
- UI: botão "Resgatar R$ X" no `MissionsPanel` quando completa.

> **Importante**: a validação de missão hoje é client-only. Para pagar dinheiro real, precisa recomputar no servidor. Critérios simples primeiro: "jogue 3 rodadas hoje", "passe 30 barreiras numa rodada", "alcance ×2 ou mais".

---

## 5. Login diário com streak

- Nova tabela `daily_logins`: `user_id, login_date (date), streak_day, bonus_amount, claimed_at`.
- Tabela de recompensa: D1=R$0,05 / D2=R$0,10 / D3=R$0,15 / D4=R$0,20 / D5=R$0,25 / D6=R$0,30 / D7=R$0,50 → reset.
- Edge function `claim-daily-login`: verifica último `login_date`; se ontem → streak+1; se >1 dia → reset para D1; se hoje → erro "já resgatado".
- UI: popup `DailyLoginPopup` ao abrir o lobby uma vez/dia, mostrando os 7 dias com o atual destacado.

---

## 6. Free spins (3 rodadas grátis, rollover 5×)

- Adicionar `wallets.free_spins_remaining int default 0`.
- Concedido junto com boas-vindas (`claim-welcome-bonus` também seta `free_spins_remaining = 3`).
- Em `start-round`, se body tem `use_free_spin=true` E `free_spins_remaining > 0` E `stake = 1`: pular débito, decrementar contador, marcar `client_report.free_spin = true`. Payout vai 100% para `bonus_balance` com rollover 5× (separado do bônus principal — usar `bonus_rollover_required += payout * 5`).
- UI: botão "Usar rodada grátis" no `RoundSetupScreen` quando há free spins.

---

## 7. Tela de progresso de rollover

- Novo card no `WalletScreen` mostrando:
  - Saldo real: R$ X,XX (sacável)
  - Saldo bônus: R$ Y,YY
  - Rollover: R$ progress / R$ required (barra de progresso)
  - "Faltam R$ Z em apostas para liberar o bônus"

---

## Detalhes técnicos resumidos

### Tabelas novas
- `bonus_grants` (auditoria de cada concessão)
- `daily_missions_claims` (anti-double-claim de missões)
- `daily_logins` (streak)
- `welcome_bonus_claims` (anti-fraude de boas-vindas)

### Colunas adicionadas
- `wallets`: `bonus_balance`, `bonus_rollover_required`, `bonus_rollover_progress`, `free_spins_remaining`

### RPCs novas
- `grant_bonus_atomic(user, amount, rollover_mult, kind, meta)`
- `consume_for_stake_atomic(user, stake)` → retorna `{from_real, from_bonus}`
- `credit_payout_atomic(user, payout, bonus_ratio)` → credita proporcional + checa conversão
- `claim_daily_login(user)` → calcula streak e credita

### Edge functions novas
- `claim-welcome-bonus`
- `claim-daily-login`
- `claim-mission-reward`

### Edge functions alteradas
- `start-round`: detecta 1ª rodada (tabela enviesada) + suporta `use_free_spin` + chama `consume_for_stake_atomic`
- `end-round`: chama `credit_payout_atomic` em vez de creditar direto

### Front
- Novo: `BonusBanner`, `DailyLoginPopup`, `BonusWalletCard`
- Alterado: `LobbyScreen`, `MissionsPanel`, `RoundSetupScreen`, `WalletScreen`

---

## Custo máximo por usuário

| Item | Valor |
|---|---|
| Boas-vindas | R$ 1,00 |
| 3 free spins (EV ~R$0.86 cada) | ~R$ 2,57 teóricos, mas 90% volta em rollover |
| 1ª rodada enviesada (EV ~R$1.45 sobre R$1 stake) | ~R$ 0,45 |
| Missões D1 | R$ 0,50 |
| Login streak D1 | R$ 0,05 |
| **Total D1** | ~R$ 2,00 nominal, **~R$ 0,80 real** após rollover |

Dentro do orçamento "até R$1" você pediu, considerando que ~60% do bônus retorna via casa (rollover 10× num jogo com RTP ~85% gera ~R$1.50 de revenue por R$1 de bônus).

---

## Ordem de implementação sugerida

1. **Fase 1** (fundação): tabelas + colunas + RPCs de carteira-bônus + tela de progresso. Sem feature visível ao usuário ainda.
2. **Fase 2**: bônus de boas-vindas + banner no lobby.
3. **Fase 3**: 1ª rodada enviesada (silencioso, sem UI nova).
4. **Fase 4**: login diário + popup.
5. **Fase 5**: missões pagando bônus.
6. **Fase 6**: free spins.

Posso entregar tudo de uma vez ou fase por fase. Recomendo fase por fase para você validar conversão a cada passo.

---

## Confirmação

- Implemento tudo de uma vez, ou fase por fase?
- Manter tudo atrás de feature flag (`feature_flags` table) para canary rollout? Recomendo sim.
