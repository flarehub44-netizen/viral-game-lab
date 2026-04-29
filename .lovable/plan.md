
# Plano: Evoluir Neon Split em 4 fases

Vou dividir as 14 melhorias em fases sequenciais. Cada fase é entregável por si só e pode ser jogada antes de avançar para a próxima. Isso reduz risco de regressão (o jogo já teve várias correções de performance e anti-cheat) e te deixa parar em qualquer ponto.

---

## Fase 1 — Game Feel & Estabilidade (base sólida)

Foco: fazer o jogo *parecer* mais polido sem mudar gameplay.

1. **Countdown 3-2-1-GO** antes de cada run (no `GameCanvas`). Engine ganha estado `"countdown"` que congela spawn/colisão mas mantém render.
2. **Haptic feedback** (`navigator.vibrate`): 8ms no tap, 40ms no hit, 20ms ao pegar power-up. Respeita o mute (sem vibrar se mudo).
3. **Pausa automática** em `visibilitychange` (aba escondida) e quando janela perde foco. Overlay "PAUSADO — toque para continuar".
4. **Botão Menu seguro**: substituir clique direto por **long-press 600ms** com anel de progresso visual. Evita exit acidental com o polegar.
5. **Sprites em DPR alto**: `buildSprites` renderiza em 2x quando `dpr >= 2` para não borrar em Retina.
6. **Trail estável**: trocar `(elapsedMs | 0) % 2` por contador de frame interno (`this.frameCount++`).

**Arquivos:** `src/game/engine.ts`, `src/components/GameCanvas.tsx`

---

## Fase 2 — Game Feel Avançado (vício)

Foco: mecânicas que mudam como o jogador *sente* a partida.

7. **Near-miss bônus**: detectar quando bola passa a < 6px da borda do gap. Award `+5 × comboMult`, flash sutil cor ciano, vibrate(15), texto flutuante "NEAR!".
8. **Warning flash de barreira difícil**: barreiras com gap total < 0.18 (largura normalizada) ou com `gapCount=2` em alta dificuldade ganham um pulso vermelho 500ms antes de entrarem na zona do jogador.
9. **Barra de combo** no HUD: barra horizontal abaixo do score que enche a cada perfect pass e drena devagar (~3s para zerar). Cor muda por tier (1.5x→ciano, 2x→magenta, 3x+→amarelo, 6x+→branco). Quando enche, o multiplicador vira efetivo.

**Arquivos:** `src/game/engine.ts`, `src/components/GameCanvas.tsx`

---

## Fase 3 — Retenção & Loop Social

Foco: motivos para voltar e para compartilhar.

10. **Missões diárias** (3 por dia, geradas por seed da data — sem backend novo):
    - Pool de templates: "Faça N perfect passes seguidos", "Sobreviva Ns sem power-up", "Atinja ×N bolinhas", "Faça N near-misses numa run", "Faça M pontos numa única run".
    - Estado em `localStorage`: `ns_missions_YYYY-MM-DD` com progresso. Reseta automático ao virar o dia.
    - UI: card no `StartScreen` mostrando 3 missões com checkbox de progresso. Toast no `GameOverScreen` quando completa.
    - Sem recompensa funcional (apenas check + contador "X dias seguidos completando todas") — evita pay-to-win e mantém honesto.

11. **Skins de bola desbloqueáveis** por marcos:
    - 5 paletas extras: "Solar" (laranja/vermelho), "Toxic" (verde/lima), "Ice" (azul/branco), "Void" (roxo/preto), "Rainbow" (cicla hue).
    - Desbloqueio: 100, 500, 2k, 10k, 50k pontos lifetime (somatório em localStorage).
    - Seletor de skin no `StartScreen` (ao lado do nickname). Skin escolhida injeta `HUES` customizado na engine.

12. **Percentil no Game Over**: query no Supabase ao salvar score:
    ```
    SELECT count(*) FROM scores
    WHERE created_at >= today_start AND score < my_score
    ```
    Calcula `melhor que X%` e exibe no `GameOverScreen`. Como a tabela só permite SELECT público (RLS já configurada), faço a query direto do client. Não precisa migration.

13. **Share com imagem**: gerar PNG 1080×1080 num canvas offscreen com:
    - Fundo gradiente neon (mesmo do jogo)
    - Score grande, nickname, max-multiplier, tempo
    - Texto "Bata meu score" + URL com `?challenge=`
    - Logo "NEON SPLIT"
    
    Usa `canvas.toBlob` → `navigator.share({ files: [...] })` em mobile, fallback para download em desktop.

14. **Tutorial recorrente**: mostrar tutorial sempre que `bestScore < 50` (não só primeira vez). Versão mais curta (2s, sem bloquear) quando `bestScore` entre 50–200.

**Arquivos:** `src/components/StartScreen.tsx`, `src/components/GameOverScreen.tsx`, `src/components/GameCanvas.tsx`, `src/game/engine.ts`, novos: `src/game/missions.ts`, `src/game/skins.ts`, `src/lib/shareCard.ts`

---

## Fase 4 — Polish de UX

Foco: ajustes finos no menu e HUD.

15. **HUD reorganizado durante o jogo**:
    - Score: move para canto superior esquerdo, tamanho reduzido (3xl → 2xl).
    - Bolinhas (×N): canto superior direito (já está OK).
    - Centro do topo: livre para combos, "PERFECT!", "NEAR!", "+points" — área dedicada de feedback.
    - Botão menu: ícone hambúrguer pequeno no canto, com long-press já da Fase 1.

16. **StartScreen vivo**: bolinhas neon caindo no fundo + barreiras passando lentamente como demo loop. Reusa engine em modo "attract" (sem colisão, sem score, baixa intensidade). Quando o usuário aperta Jogar, transição suave para o countdown.

**Arquivos:** `src/components/GameCanvas.tsx`, `src/components/StartScreen.tsx`, `src/game/engine.ts` (modo attract)

---

## Considerações técnicas

- **Sem mudança de banco**: percentil usa SELECT existente; missões/skins ficam em `localStorage`. Anti-cheat existente continua válido (near-miss adiciona pouco ao score total).
- **Edge function**: nenhuma mudança necessária.
- **Performance**: barra de combo é 1 retângulo extra por frame, near-miss check é O(balls × gaps) só quando bola cruza barrier (já no loop existente), warning flash usa shader simples (1 retângulo). Tudo cabe no orçamento atual.
- **Mute respeitado**: vibração também silencia quando o usuário mutar (princípio: 1 toggle = "modo silencioso completo").
- **localStorage**: 3 chaves novas (`ns_missions_<date>`, `ns_unlocks`, `ns_skin`, `ns_lifetime_score`). Total < 2KB.

## Como atacar

Recomendo executar **Fase 1 + Fase 2 juntas** (são as que mais transformam a sensação do jogo, ~30min de trabalho), depois testar, e só então atacar Fase 3 (retenção, mais código novo) e Fase 4 (polish).

Aprove o plano e eu começo pelas Fases 1 e 2. Se quiser priorizar diferente (ex: pular tutorial recorrente, ou fazer só a barra de combo), me diz quais números remover.
