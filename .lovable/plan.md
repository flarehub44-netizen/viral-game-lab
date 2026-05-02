## Objetivo

Reorganizar o `GameOverScreen.tsx` para que o foco visual principal seja o **resultado financeiro da rodada** (saldo + pagamento), e não os pontos. Também remover o bloco "Multiplicador" do card.

## Mudanças em `src/components/GameOverScreen.tsx`

### 1. Reduzir destaque dos Pontos (topo)
- Trocar `text-6xl font-black text-glow-cyan` por `text-3xl font-bold text-foreground/80` (sem glow).
- Manter o label "Pontos" pequeno acima.
- Mover o bloco de Pontos para dentro da mesma linha do grid Recorde/Combo/Tempo, virando um grid de 4 colunas (Pontos · Recorde · Combo · Tempo), todos no mesmo tamanho discreto.
- Resultado: nenhum número de pontos compete visualmente com o resultado em R$.

### 2. Promover "Resultado da rodada" como herói
- Mover o card `serverEconomy` para **logo abaixo do header** (antes dos Pontos/stats).
- Aumentar o destaque:
  - Título "Resultado da rodada" ganha tamanho `text-sm` (era `text-xs`).
  - Valor de **Pagamento**: `text-4xl font-black` com glow verde forte quando `payout > 0`.
  - Valor de **Saldo da rodada**: `text-3xl font-black`, mantendo verde/destrutivo conforme sinal.
  - Borda do card mais grossa/luminosa: `border-2` + sombra colorida (`shadow-[0_0_24px_hsl(140_80%_40%/0.3)]` para ganho, `shadow-[0_0_18px_hsl(0_70%_40%/0.25)]` para perda).
  - Padding maior: `p-5`.

### 3. Remover bloco "Multiplicador"
- Excluir o `<div>` do "Multiplicador" no grid `grid-cols-2` superior do card.
- Reorganizar o card para um layout de 2 linhas:
  - Linha 1 (grid 2 col, centralizado): **Entrada** | **Pagamento** (pagamento maior).
  - Linha 2 (1 col centralizada destacada): **Saldo da rodada** (o número herói do card).
- A frase de feedback embaixo permanece.

### 4. Demais elementos (Barreiras, Créditos, XP, Missões, Conquistas, Botões)
- Sem alterações de estrutura — apenas continuam abaixo do card herói + bloco de stats compactos.

## Hierarquia visual final (de cima para baixo)

```
[Fim de jogo] [Novo recorde · Nível ↑]

╔═══════════════════════════════╗
║   RESULTADO DA RODADA         ║   ← herói
║                               ║
║   Entrada      Pagamento      ║
║   R$ 1,00      R$ 2,60 ★      ║
║                               ║
║   Saldo da rodada             ║
║      +R$ 1,60 ★★              ║
║                               ║
║   Boa rodada! ...             ║
╚═══════════════════════════════╝

Pontos · Recorde · Combo · Tempo   ← compacto, mesma linha
4.147    4.147    ×1     95s

[Barreiras: 73]  [+40 créditos]
[Barra de XP / Nível]
[Missões / Conquistas]
[Botões]
```

## Fora de escopo
- Não mexer no canvas do jogo, no HUD em jogo, nem na lógica do progression/economia.
- Não mexer no layout do card de XP/Nível nem nas missões.
