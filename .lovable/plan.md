# Roadmap Neon Split v2

Vou implementar tudo em **5 fases independentes**. Cada fase já entrega valor sozinha, então você pode pausar entre uma e outra. Recomendo começar pelas Fases 1-3 (alto impacto, baixo risco) e avaliar antes de Squads/Replay (Fase 5, exige bastante backend).

---

## Fase 1 — Gameplay novo (mais variedade e tensão)

**1.1 Power-ups novos** (`src/game/engine.ts`)
- `bomb`: limpa todas as barreiras visíveis na tela + screen shake + pontos por barreira destruída
- `score2x`: multiplicador de pontos 2x por 8s (visual: HUD pulsando dourado)
- `repel` (ímã reverso): empurra bolinhas pro centro, longe das paredes laterais por 4s
- Adiciona ao spawn pool com pesos balanceados (bomb mais raro)

**1.2 Boss barriers** a cada 60s
- Barreira 3x mais alta com gap único de ~10% da largura
- Aviso visual 2s antes ("⚠ BOSS")
- Recompensa: `aliveBalls × 50 × comboMult`
- Cor pulsante vermelha → roxa

**1.3 Rush event** a cada 30s (10s de duração)
- Velocidade de barreiras +60%, pontos 3x
- Overlay com vinheta vermelha + label "RUSH ×3"
- Respeita `slowMo` (não acumula buff)

**1.4 Combo decay visível**
- Barra fica vermelha + classe `animate-pulse` quando `comboBar < 0.25`
- Tick sonoro a cada 200ms nos últimos 1.5s

**1.5 Tap duplo = merge**
- Detecta 2 taps em <250ms
- Funde 2 bolinhas mais próximas em 1 "super ball" (raio +50%, hue dourado)
- Super ball vale 5x pontos ao passar barreira
- Trade-off: menos bolinhas = menos chance de sobrevivência mas mais pontos

---

## Fase 2 — Progressão persistente

**2.1 Sistema de XP/nível** (`src/game/progression.ts` novo)
- XP = score / 10 por run
- Curva: nível N requer `N² × 100` XP
- Cada nível desbloqueia um "track" de dificuldade (Easy/Normal/Hard/Insane) selecionável no menu
- Tracks afetam: spawn rate, gap width, boss frequency
- HUD na StartScreen: barra de XP + nível atual

**2.2 Conquistas** (`src/game/achievements.ts` novo)
- 15-20 conquistas iniciais: "Primeiro ×32", "100 perfeitos seguidos", "1 min sem morrer", "Coletou os 3 power-ups numa run", "Boss destruído", "10 dias seguidos completando missões", etc.
- Verificadas no `applyRunToMissions` e em momentos-chave do engine
- Toast ao desbloquear + badge na tela de Game Over
- Tela dedicada `/achievements` (botão no menu)

**2.3 Modo diário com seed fixa**
- Botão "Daily Challenge" no menu
- Seed = data atual (`YYYY-MM-DD`) → todos os jogadores enfrentam mesma sequência de barreiras/power-ups
- Salva run no Supabase com flag `is_daily=true` e `daily_seed`
- Ranking diário separado na Leaderboard (aba "Hoje" / "All-time")

---

## Fase 3 — Polimento e acessibilidade

**3.1 Countdown com dicas rotativas**
- Array de 10-15 dicas: "Toque rápido = mais pontos", "Near-miss vale bônus", "Combo perfeito × multiplica", etc.
- Mostra abaixo do número regressivo

**3.2 Trail customizável por skin**
- Tipos: `glow` (atual), `stars`, `fire`, `pixels`, `ribbon`
- Adiciona campo `trail` em `Skin`
- Renderização específica por tipo no engine

**3.3 Vibração diferenciada**
- Curta (10ms) no near-miss
- Média (40ms) no hit
- Padrão `[80, 40, 80]` no game over
- Padrão `[20, 20, 20]` ao desbloquear conquista

**3.4 Modo daltônico**
- Toggle nas settings
- Adiciona padrões geométricos nas barreiras (listras/pontos) além da cor
- Power-ups com ícones SVG distintos (não só letra)

**3.5 Settings menu** (`src/components/SettingsScreen.tsx` novo)
- Volume música/SFX separados (sliders)
- Toggle haptic (on/medium/off)
- Toggle FPS counter
- Toggle daltônico
- Botão "Resetar progresso" (com confirm)

---

## Fase 4 — Backend para diário e conquistas

**4.1 Tabela `daily_scores`** (migration)
```sql
create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  score int not null,
  daily_seed text not null,
  duration_seconds int not null,
  created_at timestamptz default now()
);
create index on public.daily_scores (daily_seed, score desc);
```
RLS: SELECT público, INSERT só via edge function.

**4.2 Edge function `submit-daily`**
- Valida seed = hoje
- Limita 1 submissão por nickname/dia (mantém maior score)

**4.3 Tabela `achievements_unlocked`** (opcional, para sincronizar entre devices)
- Por enquanto fica em localStorage; sincroniza só se usuário fizer login (Fase 5)

---

## Fase 5 — Social/Competitivo (opcional, alto custo)

**5.1 Auth real** (email/Google) — necessário pra tudo abaixo

**5.2 Ghost run em desafios**
- Quando entra em link `?challenge=`, busca o run do desafiante via realtime
- Mostra barra lateral com score do ghost subindo

**5.3 Replay do top 1 diário**
- Engine grava "tap events" durante a run (timestamp + seed da run)
- Modo "Watch" reproduz determinísticamente
- Armazena em tabela `replays` (texto comprimido)

**5.4 Squads/Clans**
- Tabelas `squads`, `squad_members`
- Ranking semanal coletivo (soma top 10 runs da semana)
- Convite por código

---

## Detalhes técnicos

- **Compatibilidade**: nada quebra runs antigas — XP começa em 0 com lifetime score atual convertido
- **Performance**: power-ups novos reusam pool de partículas, boss barrier é só um Barrier com flag `boss=true`
- **Estado do engine**: rush e boss timers vivem no engine; React só lê via `PublicGameStats`
- **localStorage keys novos**: `ns_xp`, `ns_level`, `ns_track`, `ns_achievements`, `ns_settings`
- **Code splitting**: Settings/Achievements como rotas separadas com lazy load
- **Testes manuais**: cada fase fecha com round de QA visual no preview

---

## Tempo estimado relativo

| Fase | Esforço | Impacto retenção |
|------|---------|------------------|
| 1 — Gameplay | Médio | Alto |
| 2 — Progressão | Médio | Muito alto |
| 3 — Polimento | Baixo | Médio |
| 4 — Backend diário | Baixo | Médio |
| 5 — Social | Alto | Alto (mas niche) |

**Recomendação**: aprovar Fases 1-4 agora. Fase 5 depois de ver tração real.

Pode aprovar tudo, ou me dizer "só fase 1" / "1 e 2" etc. que ajusto o escopo.
