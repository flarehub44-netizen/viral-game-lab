## Remover "Barreiras aprox." da tela do modo conta

No `RoundSetupScreen.tsx`, no bloco do modo `server`, há um grid de 3 cards: **Meta máxima / barreira / Barreiras aprox.** O terceiro card ("BARREIRAS APROX. ~5") é só visual e não agrega valor.

### Mudança
- Trocar `grid-cols-3` por `grid-cols-2` no ramo `economySource === "server"`.
- Remover o `<div>` do card "Barreiras aprox.".
- Modo demo continua igual.

### Arquivo
- `src/components/economy/RoundSetupScreen.tsx` (linhas 168–188)
