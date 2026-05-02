
## Objetivo

1. **`/admin/sandbox`** — Igualar visualmente à tela "Iniciar partida" do jogo real e **remover o teto visual de R$ 400** no card *Pagamento máximo* (mostrar entrada × 50 puro).
2. **Página demo** (`RoundSetupScreen` em modo `demo`) — **remover o seletor de multiplicador** (Base ×2/×5/×10/×20) e os elementos relacionados.

---

## Mudanças

### 1) `src/pages/admin/AdminSandbox.tsx`

- **Pagamento máximo sem teto R$ 400**: substituir
  ```ts
  const maxPayout = bet > 0 ? Math.min(bet * MULTIPLIER_CURVE_HARD_CAP, MAX_ROUND_PAYOUT) : 0;
  ```
  por
  ```ts
  const maxPayout = bet > 0 ? bet * MULTIPLIER_CURVE_HARD_CAP : 0;
  ```
  Remover o import não-usado de `MAX_ROUND_PAYOUT`.
  
  Resultado visual: aposta R$ 50 → mostra **R$ 2.500,00** (em vez de R$ 400,00).

- **Texto de rodapé**: adicionar a mesma frase do jogo real abaixo do card de saldo simulado:
  > "Pagamento: entrada × multiplicador da curva."
  
  E o aviso 18+:
  > "Jogue com responsabilidade. Proibido para menores de 18 anos."

- O resto (header, banner sandbox, seletor de stakes, card de entrada, grid mult/payout, ferramentas admin) já espelha a tela real e fica como está.

> **Nota importante**: o teto continua existindo no backend (`MAX_PAYOUT = 400` no edge function `admin-action`). A mudança é **apenas visual** conforme pedido. Se quiser remover o teto também no servidor para sandbox, sinalize — mantenho como está por segurança.

---

### 2) `src/components/economy/RoundSetupScreen.tsx` (modo demo)

Remover do bloco `isDemo`:

- O bloco inteiro do **seletor "Base do multiplicador"** (linhas ~100-129): chip "Base ×N", título e botões 2x/5x/10x/20x.
- A barra/banner verde "🎯 Escolha sua **base ×N,00**" (linhas ~92-96).
- Fixar `meta` em um valor padrão constante (`DEMO_DEFAULT_BASE`) — sem `useState` para meta no demo, só no live continua usando `DEFAULT_META_MULTIPLIER`.
- Manter o card **"META / R$ X / base ×N,00"** e a fórmula de `perBarrier` calculados com a base default (a economia demo continua igual; só a UI de escolha some).

Antes/depois (esquema):
```text
DEMO antes:                       DEMO depois:
[Iniciar partida]                 [Iniciar partida]
[Banner: Escolha sua base ×N]     [Valor de entrada]
[Chip Base ×N]                    [Botões 1/2/5/10/20/50]
[Botões 2/5/10/20]                [Card entrada]
[Valor de entrada]                [Por barreira | META]
[Botões 1/2/5/10/20/50]           [Saldo + fórmula]
[Card entrada]                    [Botão JOGAR]
[Por barreira | META]
[Saldo + fórmula]
[Botão JOGAR]
```

---

## Arquivos editados

- `src/pages/admin/AdminSandbox.tsx`
- `src/components/economy/RoundSetupScreen.tsx`

Sem mudanças em backend, migrations ou edge functions.
