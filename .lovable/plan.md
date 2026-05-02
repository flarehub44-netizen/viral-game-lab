## Objetivo

Hoje `/admin/sandbox` é uma "tela técnica" (input de stake + botão verde + simulação RTP). O jogo real começa pelo **RoundSetupScreen** (com seletor de stake, "online players", saldo, multiplicador máximo, CTA grande "JOGAR") e abre o **GameCanvas** com HUD completo. Vamos fazer o sandbox seguir o mesmo fluxo, mantendo o que é específico de admin (sorteio enviesado, simulação RTP, reset DB).

## O que melhorar

### 1. Pré-jogo igual ao real
Substituir o input numérico cru por uma versão do `RoundSetupScreen`:
- Botões de stake (`BET_AMOUNTS`: 1, 2, 5, 10, 20, 50) em vez de `<input>`.
- Card "Entrada selecionada R$ X,XX" grande.
- Cards "Multiplicador máximo" e "Pagamento máximo" (entrada × 50).
- Pílula "X online" (mesmo `pseudoOnlinePlayers`).
- CTA inferior fixo "JOGAR" no mesmo verde neon do real.
- Header com botão voltar e título "Sandbox · Preview do jogo".

### 2. Faixa de admin sempre visível
Banner discreto no topo deixando claro que é sandbox:
- "Modo Sandbox · não movimenta carteira · 80% vitória forçada"
- Badge com o multiplicador sorteado **depois** que o jogador termina (não antes, pra não estragar o reveal).

### 3. Saldo "fake" coerente
Hoje não mostra saldo. Adicionar saldo simulado (ex.: R$ 1.000 fixo, só visual) para o card "Saldo atual" parecer real, sem nunca tocar a wallet do admin.

### 4. Controles de admin agrupados
Mover para uma seção colapsável "Ferramentas de admin" abaixo do setup:
- Forçar resultado: dropdown com `MULTIPLIER_TIERS` (×0, ×0.2, … ×20) + opção "Aleatório enviesado (padrão)".
- Forçar `target_barrier` específica (override do mapeamento atual) — útil pra testar layouts longos.
- Simulação RTP (já existe, só recolher).
- Limpar rodadas sandbox (já existe).

### 5. Tela de jogo com painel overlay
No `GameCanvas` ativo, adicionar overlay `position: absolute` no canto (top-left, fora da área de toque) mostrando:
- "SANDBOX" badge.
- Multiplicador alvo da rodada (já sorteado): `×{result_multiplier}`.
- Target barrier e duração máxima.
- Botão "Sair" pequeno (hoje o `onExit` existe mas a UX pode ser mais clara).

### 6. Pós-jogo: tela de resultado real
Hoje o resultado é só um `toast.message`. O jogo real mostra `GameOverScreen` com score, multiplicador final, payout. Reusar o mesmo componente em modo "sandbox" (sem botão de "rejogar com saldo") para o admin ver exatamente o que o jogador veria.

### 7. Atalhos de teste rápido
Linha de "presets" no setup: 3 botões pequenos
- "Vitória grande" → força ×10/×20
- "Vitória média" → força ×2/×3
- "Derrota" → força ×0/×0.2

Cada um já dispara `startPlay` com o resultado override.

## Mudanças técnicas

### Frontend
- Reescrever `src/pages/admin/AdminSandbox.tsx`:
  - Extrair pré-jogo num componente `SandboxSetup` baseado em `RoundSetupScreen` (sem props de demo, sem free spins, sem seletor de meta).
  - Componente `SandboxAdminTools` (collapsible) com presets, override de multiplicador e RTP sim.
  - Overlay `SandboxHUD` no modo `activeRound`.
  - Reusar `GameOverScreen` ao invés de `toast`.

### Backend (edge function `admin-action`)
- Estender `sandbox_round` para aceitar parâmetros opcionais:
  - `force_multiplier?: number` — pula o sorteio enviesado e usa esse valor exato (validado contra `MULTIPLIER_TIERS`).
  - `force_target_barrier?: number` — override do `mapMultiplierToLayout`.
- Manter comportamento padrão (sorteio 80/20) quando não vierem.
- Validar que `force_multiplier` está em `MULTIPLIER_TIERS` para não burlar a tabela de RTP.

### Sem mudanças
- DB: `admin_sandbox_round` RPC já aceita os parâmetros necessários.
- `GameCanvas`, `GameOverScreen`: reusados como estão.
- Layout signature, idempotência, logging: inalterados.

## Layout final (referência)

```text
┌────────────────────────────────────┐
│  [←] Sandbox · Preview do jogo     │
│  ⚠ Não movimenta carteira          │
├────────────────────────────────────┤
│  ● 412 online                      │
│  Iniciar partida (sandbox)         │
│  Entrada (R$): [1][2][5][10][20]…  │
│  ┌───── Entrada selecionada ─────┐ │
│  │        R$ 5,00                │ │
│  └───────────────────────────────┘ │
│  [Mult máx 50×] [Pagamento R$250]  │
│  Saldo atual: R$ 1.000,00 (fake)   │
│                                    │
│  ▼ Ferramentas de admin            │
│    Preset: [Win+] [Win] [Loss]     │
│    Forçar mult: [×──── select]     │
│    Sim RTP: [N=5000] [Rodar]       │
│    [Limpar sandbox DB]             │
│                                    │
│  ┌──────── JOGAR ─────────┐        │
│  └────────────────────────┘        │
└────────────────────────────────────┘
```

## Fora de escopo
- Trocar a engine ou física do jogo.
- Mudar o RTP teórico ou a tabela de multiplicadores.
- Métricas/analytics novas.
