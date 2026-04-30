# Plano: Tornar Neon Split viciante

Foco em três pilares de jogos viciantes: **feedback imediato**, **progressão visível** e **variedade que surpreende**. Sem apostas, sem dinheiro — só dopamina honesta.

---

## 1. Feedback que dá tesão (game feel)

O que o jogador sente a cada ação importa mais que qualquer feature.

- **Combo / streak**: cada barreira passada sem perder bola incrementa um combo (x2, x3, x5...). Texto grande pulsando no centro+topo: "COMBO x7!" com cor mudando conforme sobe.
- **Score popup flutuante**: ao passar uma barreira, número "+8" sobe da bola e some, na cor do combo.
- **Screen shake sutil** ao perder bola (3-5px, 120ms).
- **Slow-motion de 150ms** quando sobra só 1 bola (tensão de "quase morri").
- **Flash branco rápido** ao splitar com muitas bolas (recompensa visual de poder).
- **Som mais rico**: tom do "pass" sobe junto com o combo, não só com nº de bolas. Som especial a cada múltiplo de 10 do combo.

## 2. Progressão e "só mais uma"

O loop de morrer e querer voltar.

- **XP por rodada** = score + bônus por combo máximo + bônus por tempo. Salvo localmente.
- **Nível do jogador** com barra de progresso na tela inicial e na game over. Subir de nível = pequena animação celebrativa.
- **Missões diárias simples** (3 por dia, resetam à meia-noite local):
  - "Faça 50 pontos numa rodada"
  - "Chegue a combo x10"
  - "Sobreviva 60 segundos"
  - Cada missão = bolada de XP extra.
- **Conquistas one-shot** (badges desbloqueáveis, mostradas no menu):
  - Primeira split, 10 bolas vivas, combo x20, 100 pontos, 5 min de jogo total, etc.
- Tela de game over mostra: **"Novo recorde pessoal!"**, **XP ganho com barrinha enchendo**, **missões completadas**, e botão **"Jogar de novo"** GRANDE e centralizado (não precisar clicar fundo).

## 3. Variedade que surpreende (sem virar bagunça)

- **Eventos a cada ~15s**: barreira dupla, barreira com 2 gaps, barreira mais larga, ou "chuva de XP" (orbs caem e ao tocar dão pontos extras).
- **Power-ups raros** (orbs dourados que aparecem ocasionalmente entre barreiras):
  - Escudo (próxima colisão é perdoada)
  - Bola fantasma (atravessa 1 barreira sem morrer)
  - Multiplicador 2x de pontos por 5s
- **Curva de dificuldade mais inteligente**: hoje sobe linear até 150s. Mudar para ondas — 20s subindo, 5s "respiro" mais fácil, próxima onda começa um pouco mais difícil. Cria ritmo.

## 4. Polimento de controles e responsividade

- **Confirmar que tap em qualquer lugar da tela funciona** (já funciona, validar área).
- **Hold para split contínuo? Não** — manter tap único, mas adicionar feedback visual de "tap registrado" (mini ripple onde o dedo tocou).
- **Botão de pause maior e mais óbvio** no canto.
- **Tela de game over não aparece instantânea**: 400ms de "fade do caos" pra jogador absorver o que aconteceu, depois UI entra.

---

## Detalhes técnicos

**Arquivos a criar:**
- `src/game/progression.ts` — XP, nível, missões diárias, conquistas (tudo em localStorage).
- `src/game/powerups.ts` — lógica de spawn/coleta de power-ups.
- `src/components/MissionsPanel.tsx` — painel de missões na tela inicial.
- `src/components/AchievementsPanel.tsx` — grid de badges.
- `src/components/ComboDisplay.tsx` — overlay do combo durante o jogo.
- `src/components/ScorePopup.tsx` — números flutuantes (ou desenhado no canvas).

**Arquivos a editar:**
- `src/game/engine.ts` — adicionar combo tracking, eventos por onda, power-ups, slow-mo, screen shake, score popups no canvas, callback de XP/missão completada.
- `src/game/audio.ts` — sons novos (combo up, power-up, missão completa, level up).
- `src/components/StartScreen.tsx` — barra de XP/nível, botões de Missões e Conquistas.
- `src/components/GameOverScreen.tsx` — animação de XP ganho, missões completadas, recorde com flair.
- `src/pages/Index.tsx` — telas novas (missões, conquistas), passar callbacks de progressão.

**Persistência:** tudo em localStorage por enquanto (XP, nível, missões do dia, conquistas, recorde). Sem backend novo — o leaderboard online continua só pra recordes de score como já é.

**Performance:** manter MAX_BALLS=128, manter sprite cache, não passar de ~60 partículas no pico. Power-ups e popups reaproveitam pools.

---

## O que NÃO vai mudar
- Visual neon, cores HSL, fundo, mecânica core de tap-to-split.
- Leaderboard online existente.
- Estrutura mobile-first.

Posso começar pela **base de progressão (XP + missões + conquistas)** e depois o **game feel (combo + popups + shake + slow-mo)**, terminando com **power-ups e eventos**. Aprovando, faço nessa ordem.