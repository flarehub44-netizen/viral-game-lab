## Objetivo

Reintroduzir o **multiplicador como referência base** no modo Demo, sem alterar a regra de pagamento atual (linear: `barreiras × 0,05`, máximo ×5,00). O multiplicador máximo (`×5,00`) e o ganho potencial máximo (`entrada × 5`) passam a ser exibidos como "base" tanto na tela de setup quanto no HUD durante a partida, comunicando claramente o teto de potencial da entrada escolhida.

## O que muda

### 1. `RoundSetupScreen.tsx` (modo demo)

Reorganizar o card de stats para destacar o multiplicador-base:

- Renomear o card "Ganho máximo (×5)" para **"Base ×5,00 → R$ {bet × 5}"**, com label superior "Multiplicador base" e valor em destaque.
- Manter o card "Por barreira: R$ {bet × 0,05}" ao lado.
- Atualizar a faixa de instrução verde para deixar claro: *"Multiplicador base ×5,00 — cada barreira vale ×0,05 da entrada. Quanto mais passar, mais perto do teto."*
- Texto de rodapé do saldo: incluir explicitamente "Base ×5,00".

### 2. `GameCanvas.tsx` HUD demo

Acrescentar a referência base junto ao "Ganho atual":

- Abaixo da linha `×{demoCurrentMultiplier} · N barreiras`, adicionar uma micro-barra de progresso visual `demoCurrentMultiplier / 5,00` (preenchimento verde neon) com a legenda **"base ×5,00"** à direita.
- Substituir a linha "Demo · cada barreira vale ×0,05" por **"Base ×5,00 · ×0,05 por barreira"** (mais compacto e destacando o teto).
- Quando `demoAtCap` for `true`, a barra fica 100% preenchida com glow laranja e o texto "MÁX" continua aparecendo.

### 3. Sem mudanças de regra/economy

- `demoRound.ts`, `serverRound.ts` e cálculos permanecem como estão.
- Pagamento continua: `min(barreiras × 0,05, 5,0) × stake`, máx R$ MAX_ROUND_PAYOUT.
- Nenhuma migração de banco, nenhuma edge function alterada.
- Nenhum teste precisa mudar (lógica intocada); apenas snapshots/rotulagem visual.

## Detalhes técnicos

**Cálculo da progressão da barra (já disponível):**
```ts
const demoBaseMax = 5.0;
const demoProgressPct = Math.min(demoCurrentMultiplier / demoBaseMax, 1) * 100;
```

**Estrutura do novo bloco no HUD (resumo):**
```text
┌──────────────────────────────┐
│ GANHO ATUAL                  │
│ R$ 1,25                      │
│ ×0,25 · 5 barreiras          │
│ ▓▓▓░░░░░░░░░░░  base ×5,00   │
└──────────────────────────────┘
   Base ×5,00 · ×0,05 por barreira
```

## Arquivos afetados

- `src/components/economy/RoundSetupScreen.tsx` — rotulagem e card "Base ×5,00".
- `src/components/GameCanvas.tsx` — micro-barra de progresso e nova legenda no HUD demo.

Sem novos arquivos, sem mudanças de schema, sem novas dependências.