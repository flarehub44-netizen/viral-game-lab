
# Neon Split — Jogo Arcade Viral

## Conceito em uma frase
Toque na tela para dividir sua bolinha de luz em duas. Sobreviva ao túnel infinito de barreiras com o máximo de bolinhas possível. Quanto mais bolinhas vivas, maior o multiplicador.

## Mecânica central (core loop ~60s por partida)

**Controle**: 1 dedo, 1 ação (tap).
- **Tap** = todas as bolinhas vivas se dividem em 2, abrindo em leque horizontal
- Bolinhas caem continuamente pelo túnel (gravidade constante)
- Barreiras coloridas sobem em direção a elas com 1+ fendas
- Bolinha que bate na barreira = explode em partículas (perdida)
- Bolinha que passa pela fenda = +1 ponto × multiplicador
- **Multiplicador** = número de bolinhas vivas (1, 2, 4, 8, 16, 32...)
- Game over quando a última bolinha morre
- Velocidade aumenta progressivamente

**Tensão**: dividir muito = mais pontos mas maior chance de perder tudo. Dividir pouco = sobrevivência fácil mas score baixo. O sweet spot é o que cria o vício.

**Power-ups raros** (aparecem flutuando no túnel):
- Escudo (1 bolinha sobrevive a 1 colisão)
- Slow-mo (2 segundos de câmera lenta cinematográfica — ótimo pra clipes)
- Magnet (atrai bolinhas pra fenda mais próxima)

## Estética

Estilo **minimalista neon**:
- Fundo preto profundo com gradiente sutil
- Bolinhas com glow neon (ciano, magenta, amarelo, verde — cor muda conforme multiplicador sobe)
- Barreiras com bordas neon brilhantes
- Partículas de explosão exageradas e satisfatórias
- Trail de luz atrás de cada bolinha
- Screen shake leve em colisões grandes
- Flash branco em "perfect pass" (todas as bolinhas passam)

## Telas

```
┌─────────────────────┐
│   NEON SPLIT        │
│                     │
│   ▶ TAP TO PLAY    │
│                     │
│   🏆 Leaderboard    │
│   👤 Seu apelido    │
│   🎵 Som on/off     │
└─────────────────────┘
```

1. **Splash/Menu**: logo neon pulsante, botão grande TAP TO PLAY, melhor score, link leaderboard
2. **Jogo**: HUD minimalista no topo (score grande, multiplicador ×N em destaque, bolinhas vivas)
3. **Game Over**: score final animado, "novo recorde!" se aplicável, botões: JOGAR DE NOVO / COMPARTILHAR / LEADERBOARD
4. **Leaderboard**: top 100 global, sua posição destacada, filtro "hoje / semana / sempre"
5. **Onboarding rápido**: primeira partida tem tutorial fantasma de 5s ("toque para dividir")

## Compartilhamento viral

Ao game over:
- Botão **"Compartilhar"** gera uma imagem (canvas) com: score, multiplicador máximo atingido, "Bata meu recorde em [URL]"
- Web Share API no mobile, fallback copiar link no desktop
- Link contém `?challenge=SCORE` — quem entra vê "Seu amigo fez 12.480. Consegue mais?"

## Backend (Lovable Cloud)

**Auth**: anônima por padrão (gera UUID + apelido editável). Opcional: Google sign-in pra preservar score entre dispositivos.

**Tabela `scores`**:
- id, user_id, nickname, score, max_multiplier, duration_seconds, created_at
- RLS: qualquer um lê (SELECT público), só o dono insere
- Índice em score DESC para leaderboard rápido

**Edge function `submit-score`**: valida que score é plausível dado o tempo de partida (anti-cheat básico) antes de inserir.

**Leaderboard**: query top 100 por janela temporal (hoje / 7d / sempre).

## Detalhes técnicos

- **Render**: Canvas 2D (suficiente, performante, simples). Não precisa WebGL.
- **Game loop**: requestAnimationFrame com delta time fixo
- **Física**: simples — gravidade vertical constante, bolinhas se espalham horizontalmente ao dividir com easing
- **Mobile-first**: viewport vertical, touch events, mas funciona com clique no desktop
- **Áudio**: synth simples via Web Audio API (sem assets) — beep curto na divisão, whoosh na barreira, explosão grave no game over
- **Persistência local**: melhor score, apelido e som on/off em localStorage
- **Sem dependências pesadas**: só React + canvas puro

## Escopo de entrega

1. Engine do jogo (canvas, loop, física, colisão)
2. Sistema de divisão e multiplicador
3. Geração procedural de barreiras com dificuldade crescente
4. Power-ups (escudo, slow-mo, magnet)
5. Telas (menu, jogo, game over, leaderboard, edição de apelido)
6. Lovable Cloud: tabela scores + RLS + edge function de submit
7. Botão compartilhar com imagem gerada e link de desafio
8. Detecção de `?challenge=` na URL pra modo "bata o recorde"
9. Tutorial fantasma na primeira partida (flag em localStorage)
10. Polish: partículas, screen shake, transições, áudio sintetizado

## Fora do escopo (v2 futuro)

- Skins de bolinha desbloqueáveis
- Modos alternativos (daily challenge com seed fixo)
- Conquistas
- Login social além de Google
- Anúncios / monetização
