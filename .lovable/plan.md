# Remover "Meta da rodada" do HUD e mostrar só o ganho atual

## Contexto

O card central do HUD durante a partida (no modo **live**) ainda mostra:

```
META DA RODADA
R$ 20,00
×20.00 · Entrada R$ 1,00
0/9 · FALTAM 9
```

Isso é resquício do modelo antigo (meta fixa em N barreiras). Com a curva contínua atual, o jogador ganha de forma incremental e perde quando acabam as bolas — não existe mais "meta" nem contador "faltam X". O HUD precisa refletir o que realmente está acontecendo: **quanto o jogador está ganhando agora**.

O modo demo já faz isso corretamente (card "Ganho atual" verde com o valor atualizado por barreira). Vamos aplicar o mesmo padrão no live, mas usando a curva real (`multiplierForBarriers`) em vez do cálculo simplificado do demo.

## Mudanças

**Arquivo único:** `src/components/GameCanvas.tsx`

### 1. Calcular ganho ao vivo usando a curva oficial

- Importar `multiplierForBarriers` de `@/game/economy/multiplierCurve`.
- Em modo live, calcular a cada render:
  - `liveCurrentMultiplier = multiplierForBarriers(passedNow)`
  - `liveCurrentWin = min(stake * liveCurrentMultiplier, MAX_ROUND_PAYOUT)`
  - `liveAtPayoutCap = stake * liveCurrentMultiplier >= MAX_ROUND_PAYOUT`
- Remover as variáveis hoje obsoletas no escopo live: `goalBarriers`, `reachedGoal`, `remainingBarriers`, `livePotentialPayout`, `liveIsCapped`. (Mantenho `liveRoundMultiplier` apenas se ainda for usado em outro lugar — verificarei na hora.)

### 2. Substituir o bloco do HUD live (linhas ~365-411)

Trocar todo o card "Meta da rodada" por uma versão equivalente ao card do demo, mostrando:

- Label: **"Ganho atual"**
- Valor grande: `R$ {liveCurrentWin}` (verde quando > 0, com glow)
- Linha secundária: `×{multiplicador atual} · {passedNow} barreiras` + tag `(máx)` quando atinge `MAX_ROUND_PAYOUT`

Sem barra de progresso (não há meta), sem contagem "X/Y barreiras", sem "faltam".

### 3. Ajustar popups flutuantes por barreira (linhas ~462-500)

Hoje, no live, cada popup mostra "Barreira N" + "Faltam X para R$ Y". Substituir por algo simétrico ao demo:

- `+R$ {ganho acumulado naquela barreira}`
- Subtítulo: `Barreira N · ×{mult}`

E remover a lógica `justReachedGoal` / "META!" — não há mais meta a bater.

### 4. Atualizar o `useEffect` de popups (linhas 122-145)

- Remover dependência de `goalBarriers` e `livePotentialPayout`.
- Para live, `total` passa a ser `min(stake * multiplierForBarriers(passed), MAX_ROUND_PAYOUT)`.

### 5. Limpeza

- Remover comentários e código morto referentes a "meta de barreiras" no live.
- Manter o modo **demo** intacto (continua usando seu card próprio).
- Não tocar em props da interface (`targetBarrier`, `targetMultiplier`, `resultMultiplier` continuam sendo recebidas — só não são mais usadas para renderizar a "meta" no live; podem ser úteis para debug/QA futuro).

## Fora de escopo

- Edge functions, tabela de tiers, lógica de settlement: nada muda.
- `RoundSetupScreen` (já foi limpo na etapa anterior).
- Tela de game over / resumo da rodada.

## Resultado esperado

Durante uma partida live, o jogador vê apenas:

```
Ganho atual
R$ 0,12
×0.12 · 3 barreiras
```

…que sobe a cada barreira passada, em vez do confuso "META R$ 20,00 · 0/9 FALTAM 9".
