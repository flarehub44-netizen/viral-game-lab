# RC Freeze e rollout canario

## RC Freeze (antes da Fase 1)
- Congelar contrato `start-round`/`end-round` e esquema de `game_rounds`.
- Bloquear mudanças de gameplay/economia fora de bugfix crítico.
- Exigir evidências de testes de regressão e segurança antes de cada avanço.

## Ambiente canario recomendado
Estratégia híbrida em camadas:
1. Staging com tráfego sintético (1-2 dias).
2. Produção interna (staff/dev) por 1 dia.
3. Produção com feature flag: 5% por 24 h.
4. Expansão para 25% por 48 h.
5. Expansão para 50% por 72 h.
6. Expansão para 75% por 24 h.
7. 100% após 96 h sem incidente crítico.

## Segmentação inicial
- Priorizar usuários ativos de baixo stake.
- Excluir high-rollers nas fases iniciais.
- Manter hash fixo por usuário para sessão estável.

## Gates de avanço por etapa
Todos os itens abaixo devem permanecer dentro da banda durante toda a janela:
- RTP (1h): 83,7% a 87,7%.
- `rejected_rate` (1h): <= 0,5%.
- `start-round` p95 <= 500ms.
- `end-round` p95 <= 300ms.
- `open_rounds_over_5min` <= 5.
- `payout_discrepancy_count` = 0.

## Regras de rollback
- Qualquer métrica crítica fora da banda: rollback imediato para 0%.
- Congelar expansão e abrir incidente.
- Somente retomar após RCA e aprovação formal.
