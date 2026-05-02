## Objetivo

Demo e Sandbox passam a aplicar a **mesma lógica de contagem do jogo real**: as primeiras 7 barreiras são "aquecimento" e valem ×0. O ganho só começa a partir da 8ª barreira passada. A fórmula linear `0,05 × base × barreiras` continua, mas aplicada às barreiras *contáveis* (`max(0, barreirasPassadas − 7)`).

Isso faz o demo/sandbox simularem visualmente o ritmo do jogo real (jogador entende que "preciso passar das primeiras barreiras antes do dinheiro começar a contar"), mas mantendo a fórmula linear simples e o mesmo resultado entre HUD e tela de fim de jogo.

## Constante compartilhada

Adicionar em `src/game/economy/demoRound.ts`:
```
export const DEMO_FREE_BARRIERS = 7;
```

Espelha o offset da curva real (`MULTIPLIER_CURVE_ANCHORS[1]` = `[7, 0]`).

## Mudanças

### 1. `src/game/economy/demoRound.ts`
- Exportar `DEMO_FREE_BARRIERS = 7`.
- Em `demoMultiplierFor(barriers, base)`: usar `effectiveBarriers = max(0, barriers − DEMO_FREE_BARRIERS)` antes de multiplicar. `0,05 × base × effectiveBarriers`.
- `settleDemoRound` continua chamando `demoMultiplierFor` — herda automaticamente.

### 2. `src/components/GameCanvas.tsx`
- O HUD do demo (`demoCurrentMultiplier`, `demoCurrentWin`, `demoPerBarrierValue`, popup de barreira passada) deve usar a mesma fórmula com offset. Trocar por `Math.max(0, passedNow - DEMO_FREE_BARRIERS)` nos três pontos onde `passedNow` é usado para cálculo demo.
- Importar `DEMO_FREE_BARRIERS` de `@/game/economy/demoRound`.

### 3. `src/pages/admin/AdminSandbox.tsx`
- `handleGameOver` calcula localmente o multiplicador — ajustar para `Math.max(0, barriers - DEMO_FREE_BARRIERS)` antes de multiplicar pela base.
- Importar `DEMO_FREE_BARRIERS`.

### 4. Testes (`src/test/demoRound.test.ts`)
- Atualizar valores esperados:
  - `demoMultiplierFor(7, 5)` → `0` (zona de aquecimento)
  - `demoMultiplierFor(8, 5)` → `0.05 × 5 × 1 = 0.25`
  - `demoMultiplierFor(20, 5)` → `0.05 × 5 × 13 = 3.25` (antes era 5)
  - `demoMultiplierFor(27, 5)` → `0.05 × 5 × 20 = 5` (atinge meta da base 5 com 20 barreiras *contáveis* → total 27)
  - Ajustar testes de `settleDemoRound` proporcionalmente.

## Resultado

Durante o jogo demo/sandbox, o jogador vê o ganho parado em R$ 0,00 nas primeiras 7 barreiras e começa a subir a partir da 8ª — exatamente como no jogo real. O valor mostrado no HUD é o mesmo que aparece na tela de fim de jogo (consistência preservada). A fórmula linear baseada na "base escolhida" continua a mesma, só com o offset de aquecimento.