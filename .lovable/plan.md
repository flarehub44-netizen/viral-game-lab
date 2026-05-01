## Diagnóstico (confirmado pelo session replay)

Quando a última bolinha morre, o `tap` (pointerdown→click) com que o usuário derrubou a bolinha viaja na fila do navegador e cai no `GameOverScreen` que monta no mesmo lugar. O botão "Jogar de novo" ocupa quase toda a largura — recebe o click e dispara `handleRetry → openRoundSetup`, levando direto para "Iniciar partida". O GameOverScreen pisca por ~50ms (visível na barra de XP animando 11% → 67% no replay) e some.

## Correção

Travar a interação com o GameOverScreen por 700ms após montagem para "consumir" o tap residual.

**`src/components/GameOverScreen.tsx`**:

1. Adicionar estado `armed`:
```tsx
const [armed, setArmed] = useState(false);
useEffect(() => {
  const t = window.setTimeout(() => setArmed(true), 700);
  return () => window.clearTimeout(t);
}, []);
```

2. Envolver os botões em um wrapper que ignora cliques enquanto `!armed`:
```tsx
<div className={armed ? "" : "pointer-events-none opacity-70"}>
  ... botões ...
</div>
```

Isso resolve o problema sem mudar o engine, o Index.tsx, ou a lógica de save/economy. O GameOverScreen permanece visível normalmente; apenas os botões ficam clicáveis após 700ms.

## Arquivos modificados

- `src/components/GameOverScreen.tsx`
