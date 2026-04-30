## Objetivo

Deixar o jogo **leve** (rodar suave em qualquer celular) e capaz de **aguentar 500+ pessoas simultâneas** sem travar nem estourar custo do backend. Hoje o jogo tem muitas mecânicas empilhadas e cada partida grava no banco — isso pesa no aparelho e no servidor.

## Diagnóstico atual

**No celular do jogador (peso do jogo):**
- Engine com ~1275 linhas, sistemas paralelos (combo, rush, boss, power-ups, near-miss, repel, score2x, missões, conquistas, XP, skins, daily challenge)
- Até 64 bolinhas simultâneas, cada uma com trail de ~10 pontos
- Partículas, float texts, shake, flash, vinheta de rush, aura, pulso de combo bar
- HUD em React re-renderizando 10×/s com 20+ campos
- DPR até 2x (renderiza 4× mais pixels em retina)
- 9 telas diferentes (menu, game, over, leaderboard, achievements, settings, daily, etc.)

**No backend (escala 500+ usuários):**
- Cada game over chama uma edge function que faz `INSERT` no banco
- 500 jogadores × 1 partida/min = ~8 inserts/s contínuos (ok), mas em pico vira gargalo
- Daily challenge tem tabela própria + edge function própria, dobrando a carga
- Leaderboard é lido toda vez que alguém abre — sem cache

## Plano

### 1. Simplificar o jogo (cliente leve)

Reduzir engine ao núcleo:
- **Mecânica única:** tap divide bolinhas, passa pelos buracos das barreiras, ganha pontos
- Remover: combo/multiplicador, rush event, boss barriers, power-ups, near-miss, score2x, repel, magnet, slowmo, bomb, shield, skins, XP/níveis, conquistas, missões, daily challenge, configurações avançadas, tutorial dinâmico
- **Cap de bolinhas:** 32 (era 64)
- **Trail:** 4 pontos (era ~10)
- **Partículas:** 40 max (era 200+)
- **DPR:** cap em 1.5 (era 2) — economiza ~30% de pixels em retina
- **HUD:** só score + bolinhas vivas + mute + menu
- **Telas:** menu → jogo → game over → ranking (4 no total)
- **Stats emitidos pra React:** 5 campos (era 20+)

### 2. Reduzir carga no backend (escala)

- **Não gravar toda partida.** Só envia score se for novo recorde **pessoal** do jogador (validado no cliente via localStorage). Reduz inserts em ~95%.
- **Leaderboard com cache de 30s** no cliente: armazena resposta em memória + timestamp, só refaz fetch se passou 30s ou se acabou de jogar
- **Top 50 em vez de top 100** no leaderboard (resposta menor, query mais rápida)
- **Índice no banco:** `CREATE INDEX ON scores (score DESC)` pra ordenação ficar O(log n)
- Remover edge function `submit-daily-score` e tabela de daily (não usada mais)

### 3. Backend: instância correta

A instância padrão do Lovable Cloud aguenta o tráfego previsto **se** o ponto 2 for aplicado (só salva recorde pessoal + cache no cliente). Se o uso passar disso, dá pra subir a instância em **Backend → Configurações avançadas → Aumentar instância** (sem precisar de mudança de código).

## Telas finais

```
┌─ Menu ─────────────┐    ┌─ Jogo ──────┐    ┌─ Game Over ─┐
│  NEON SPLIT        │    │  Score: 42  │    │ Você fez:42 │
│  Recorde: 1234     │ →  │  Bolinhas:3 │ →  │ Recorde:1234│
│  Apelido: Player1  │    │  [canvas]   │    │ [De novo]   │
│  [JOGAR]           │    │             │    │ [Menu]      │
│  [RANKING]         │    │             │    │ [Ranking]   │
└────────────────────┘    └─────────────┘    └─────────────┘
```

## Arquivos afetados

**Reescritos enxutos:**
- `src/game/engine.ts` (~1275 → ~280 linhas)
- `src/game/audio.ts` (mantém só tap/split/pass/gameOver)
- `src/components/GameCanvas.tsx` (HUD mínimo)
- `src/components/StartScreen.tsx`
- `src/components/GameOverScreen.tsx`
- `src/components/Leaderboard.tsx` (com cache)
- `src/pages/Index.tsx` (4 telas)
- `supabase/functions/submit-score/index.ts` (mantém, simples)

**Deletados:**
- `src/components/AchievementsScreen.tsx`
- `src/components/DailyChallengeScreen.tsx`
- `src/components/SettingsScreen.tsx`
- `src/game/achievements.ts`
- `src/game/daily.ts`
- `src/game/missions.ts`
- `src/game/progression.ts`
- `src/game/settings.ts`
- `src/game/skins.ts`
- `src/lib/shareCard.ts`
- `supabase/functions/submit-daily-score/index.ts`

**Migração SQL:**
- Adicionar índice em `scores(score DESC)`
- Dropar tabela `daily_scores` (se existir)

## Resultado esperado

- Jogo carrega em <1s, roda 60fps até em celular básico
- Bundle JS ~40% menor
- Backend faz ~20× menos escritas (só recordes pessoais)
- Leaderboard com cache evita N consultas repetidas
- Suporta tranquilamente 500+ jogadores simultâneos na instância padrão

## Confirmação antes de implementar

1. Confirma que pode **remover** todas as mecânicas extras (combo, rush, boss, power-ups, conquistas, missões, daily, XP, skins)?
2. Mantém o **ranking online global** (com cache + só recorde pessoal)?
