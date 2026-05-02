## Ajustes em Demo e Sandbox

Dois problemas no `RoundSetupScreen` (demo/sandbox) e na renderização das barreiras (engine):

### 1. Card de stats em demo/sandbox igual ao live (imagem 1 → imagem 2)

Hoje, em modo demo/sandbox, `RoundSetupScreen` mostra dois cards inferiores: **"POR BARREIRA"** e **"META"**. No live, mostra **"MULTIPLICADOR MÁXIMO"** (50×) e **"PAGAMENTO MÁXIMO"** (R$).

**Mudança em `src/components/economy/RoundSetupScreen.tsx`:**

- Remover o branch `else` que renderiza os cards "Por barreira" / "META".
- Sempre renderizar o bloco do live (multiplicador máximo + pagamento máximo), independente de `economySource`.
- No cálculo de `stats`, sempre computar `maxPayout = bet × MULTIPLIER_CURVE_HARD_CAP` (já capado no display por `MAX_ROUND_PAYOUT` do live? — manter como hoje no live, sem alteração de cap, já que demo nunca paga isso de fato; é só rótulo visual coerente).
- Manter o parágrafo de explicação inferior diferenciado por modo (demo continua dizendo "entrada × 0,05 × base × barreiras"), pois descreve a fórmula real.

### 2. Etiquetas R$ visuais nas barreiras em demo/sandbox (imagem 3)

Hoje, em demo/sandbox, todas as barreiras a partir da 1ª já mostram um valor R$ (R$ 12,50, R$ 25,00, ...), mas a contagem que paga só começa na 8ª barreira (`DEMO_FREE_BARRIERS = 7`). Fica enganoso.

**Mudança em `src/game/economy/barrierVisual.ts`:**

- Em `predictedMultiplier`, no branch `mode === "demo"`, aplicar o mesmo offset que `demoMultiplierFor` usa:
  ```
  const effective = Math.max(0, barrierIndex - DEMO_FREE_BARRIERS);
  return DEMO_PER_BARRIER_FACTOR * demoBase * effective;
  ```
- Importar `DEMO_FREE_BARRIERS` de `./demoRound` (já está em `src/game/economy/`).
- Resultado: as 7 primeiras barreiras ficam com `multiplier = 0` → `styleForMultiplier` retorna o estilo neutro (cinza, sem glow) e a etiqueta R$ não é desenhada (engine já tem guard `style.multiplier > 0` na linha 887). A 8ª barreira passa a ser a primeira com valor visível, batendo com o que efetivamente paga.

Modo live não muda — usa a curva oficial `multiplierForBarriers` que já tem o offset embutido.

### Arquivos editados

- `src/components/economy/RoundSetupScreen.tsx` — unificar cards de stats.
- `src/game/economy/barrierVisual.ts` — aplicar offset de aquecimento no demo.

### Sem migrações, sem mudanças de backend, sem mudança de fórmula de pagamento. Apenas alinhamento visual.