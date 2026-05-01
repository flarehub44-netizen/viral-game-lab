## Correção

Erro anterior: zerei `stakeCredits` no DEMO, então o bloco "Ganho atual em R$" sumiu do HUD do DEMO. As zonas devem sumir, mas o ganho financeiro (DEMO usa créditos fictícios; LIVE usa R$ real) deve continuar visível em ambos.

## Mudanças

**`src/pages/Index.tsx`** — passar sempre o stake para o GameCanvas (também no DEMO):
```tsx
stakeCredits={activeRound.stake_amount}  // sem ternário isDemo
```
`targetMultiplier` e `resultMultiplier` continuam só no LIVE (no DEMO o multiplicador é skill puro = barreiras × 0.05).

**`src/components/GameCanvas.tsx`** — unificar o HUD central: quando `stake > 0`, sempre mostrar o card "Ganho atual R$ X,XX · ×N · Entrada R$ Y · Barreiras: N", para DEMO e LIVE. Diferenças:
- Label: `"Ganho (demo)"` no DEMO, `"Ganho atual"` ou `"Potencial"` no LIVE.
- O `liveMultiplier` no DEMO já é calculado localmente como `min(passedNow * 0.05, 5)` (mantém a regra skill-based).
- Sem mais ramificação `isDemoMode ? ... : stake > 0 ? ...` — vira um único bloco.

Resultado:
- DEMO HUD: `Ganho (demo) R$ 1,20 · ×1.20 · Entrada R$ 1,00 · Barreiras: 24`
- LIVE HUD: `Ganho atual R$ 1,45 · ×1.45 · Entrada R$ 1,00 · Barreiras: 18`
- Sem nenhuma menção a Zona/Fase em ambos.

## Arquivos modificados

- `src/pages/Index.tsx` (1 linha)
- `src/components/GameCanvas.tsx` (consolidar bloco central)
