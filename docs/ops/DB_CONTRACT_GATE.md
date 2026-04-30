# DB Contract Gate - checklist de validacao

## Migrações alvo
- `20260430223000_climb_live_contract.sql`
- `20260430223500_start_round_atomic_v2.sql`
- `20260430224500_climb_monitoring_views.sql`

## Validações obrigatórias
1. `game_rounds` possui colunas:
   - `layout_seed`, `layout_signature`
   - `target_barrier`, `max_duration_seconds`
   - `round_status`, `ended_at`, `client_report`
2. Constraint de stake no intervalo `1..50`.
3. RPC `start_round_atomic` aceita parâmetros v2:
   - `p_layout_seed`, `p_target_barrier`, `p_max_duration_seconds`, `p_layout_signature`.
4. Views existem e retornam linhas:
   - `v_round_health`, `v_rtp_live`, `v_monitor_alerts`.

## Queries de verificação rápida
```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'game_rounds'
order by column_name;
```

```sql
select routine_name, specific_name
from information_schema.routines
where routine_schema = 'public' and routine_name = 'start_round_atomic';
```

```sql
select * from public.v_monitor_alerts;
```
