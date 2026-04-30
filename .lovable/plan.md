
# Corrigir a mecânica de Fusão (Super Ball)

## Problema atual

A fusão tem 3 bugs que cancelam o benefício prometido:

1. **Tap duplo dispara split + merge**: o 1º toque multiplica as bolinhas, então o merge funde só 2 das muitas que acabaram de aparecer — saldo é sempre **mais bolinhas**, nunca menos.
2. **Fórmula quadrática anula o "5x"**: a super conta como 5 no `effectiveBalls`, mas como o score base é `n²`, fundir reduz o potencial de pontos a longo prazo (menos bolinhas para splits futuros = score menor).
3. **Visual genérico**: só muda matiz pra dourado. Sem aura, sem trilha, sem contador no HUD — o jogador não percebe que a super existe.

## Correções

### 1. Cancelar split quando vira merge (`src/game/engine.ts` ~ linha 327)

Detectar tap duplo **antes** de aplicar o split: se o intervalo entre toques for < 250ms, fazer rollback do split do 1º toque (restaurar bolinhas adicionadas) e então fundir. Alternativa mais simples: usar **delay de 250ms** no split — só executa se nenhum 2º toque chegar. Trade-off: adiciona latência ao tap simples. 

**Solução escolhida**: manter split imediato, mas no merge **remover também as bolinhas criadas pelo split anterior** (guardar `lastSplitSpawned: Ball[]` no `onTap` e desfazer no `mergeNearest`).

### 2. Reescrever bônus da Super Ball

Em vez de mexer na fórmula quadrática, dar à super ball **3 benefícios diretos**:

- **+10 pts flat por barreira passada** (independente da fórmula)
- **Imune a 1 colisão** (escudo único — absorve 1 hit e perde o status super)
- **Aumenta combo bar em +50%** ao passar barreiras (combo cresce mais rápido)

Isso torna a super um **trade tático real**: troca quantidade por sobrevivência + bônus garantido.

### 3. Melhorar visual e feedback

- **Aura dourada pulsante** ao redor da super ball (gradient radial animado)
- **Trilha dourada** dedicada (sobrescreve a trilha do skin)
- **Contador no HUD**: badge "⭐ x2" no canto superior quando há super balls ativas
- **Texto explicativo** no `floatText` do merge: "SUPER! +10/barreira • escudo"
- **SFX diferenciado** ao passar barreira com super ativa (já existe `sfx.merge`, adicionar `sfx.superPass`)

### 4. Ajustar HUD/dicas

- Atualizar a dica do countdown que menciona toque duplo, esclarecendo o benefício real ("Toque duplo = funde 2 bolas em uma Super (escudo + bônus)")
- No `GameCanvas.tsx`, adicionar o badge contador de supers ativas

## Arquivos afetados

- `src/game/engine.ts` — lógica do merge, bônus da super, rollback do split, render da aura
- `src/game/audio.ts` — novo SFX `superPass`
- `src/components/GameCanvas.tsx` — badge HUD de super balls ativas
- (opcional) `src/game/engine.ts` lista de tips do countdown

## Detalhes técnicos

- Adicionar campo `superShield: boolean` em `Ball` (true ao virar super; vira false ao absorver hit, e nesse caso `isSuper` também volta a false mas a bolinha sobrevive)
- No bloco de score (linha 838+), iterar supers vivas e adicionar `superCount * 10 * comboMult * scoreMult * rushMult` ao gained
- Remover a linha `effectiveBalls = aliveNow + superCount * 4` — voltar para `effectiveBalls = aliveNow` e somar bônus flat separado
- No `onTap`, armazenar `this.lastSpawnedFromSplit: Ball[]` antes de retornar; em `mergeNearest`, marcar essas como `alive = false` antes de fundir
