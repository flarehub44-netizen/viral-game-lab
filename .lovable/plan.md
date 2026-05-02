Você está certo: na sandbox e no demo deveria contabilizar no momento em que a bolinha passa pela barrinha/linha da barreira. O motivo de não estar acontecendo assim é uma diferença entre o valor visual da barreira e a contagem oficial usada pelo HUD.

Do I know what the issue is? Sim.

O problema exato:
- A contagem oficial do jogo (`barriersPassedCount`) só aumenta quando a barreira sobe até passar de uma linha fixa no topo da área de jogo (`height * 0.25 - 20`).
- Mas as bolinhas ficam jogando mais abaixo, perto do meio da área útil.
- Então, visualmente, a bolinha já atravessou a barreira R$ 100,00, mas o código ainda não considera aquela barreira como “passada” até ela subir mais.
- Por isso o HUD ainda mostra R$ 37,50 / 10 barreiras enquanto a tela já exibe uma barreira de R$ 100,00 ou R$ 112,50 sendo atravessada.
- Isso aparece no sandbox/demo porque há várias barreiras visíveis ao mesmo tempo e a fórmula demo cresce rápido. No live, o layout/ritmo atual acaba ficando alinhado o suficiente, então não vamos mexer nele.

Plano de correção apenas para sandbox/demo:

1. Manter o live intacto
   - Não alterar o modo live, curva live, payout live, teto live ou layout live.
   - A correção será condicional para `mode === "demo"`, que também é usado pelo sandbox.

2. Alterar o ponto de contabilização no demo/sandbox
   - No demo/sandbox, a barreira será contabilizada quando ela cruzar a zona real das bolinhas, não só quando passar da linha fixa do topo.
   - Usar como referência a área onde as bolinhas se estabilizam (`playZoneTop`/`playZoneBottom`), para que o HUD avance assim que a bolinha efetivamente passou pela barrinha.

3. Evitar contabilização antecipada indevida
   - A barreira só será marcada como passada uma vez (`!bar.passed`).
   - A contagem seguirá sequencial e continuará alimentando:
     - “Ganho atual”;
     - popup `+R$`;
     - saldo final do demo;
     - saldo final do sandbox.

4. Corrigir a etiqueta visual do demo/sandbox se necessário
   - Conferir se o valor escrito na barreira corresponde à barreira que será contabilizada naquele momento.
   - Se houver defasagem visual restante, ajustar apenas a previsão visual do demo/sandbox para que a etiqueta e o HUD avancem juntos.

5. Validar com o caso do print
   - Quando a bolinha atravessar a barreira escrita “R$ 100,00”, o HUD deve atualizar para R$ 100,00 naquele momento, não continuar em R$ 37,50.
   - Sandbox e demo continuam sem teto de R$ 400.
   - A flag visual de sandbox continua removida.

Arquivos previstos:
- `src/game/engine.ts`
- possivelmente `src/game/economy/barrierVisual.ts`, só se a etiqueta ainda precisar de ajuste fino no demo/sandbox
- teste de regressão em `src/test/...` para garantir que demo/sandbox contabilizam no ponto correto

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>