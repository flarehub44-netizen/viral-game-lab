-- Monitoring views for CLIMB/LIVE operations

create or replace view public.v_round_health as
select
  date_trunc('hour', created_at) as bucket_hour,
  count(*) as total_rounds,
  count(*) filter (where round_status = 'closed') as closed_rounds,
  count(*) filter (where round_status = 'expired') as expired_rounds,
  count(*) filter (where round_status = 'rejected') as rejected_rounds
from public.game_rounds
group by 1;

create or replace view public.v_rtp_live as
select
  date_trunc('hour', created_at) as bucket_hour,
  sum(stake) as total_stake,
  sum(payout) as total_payout,
  case when sum(stake) > 0 then sum(payout) / sum(stake) else 0 end as rtp
from public.game_rounds
group by 1;

create or replace view public.v_monitor_alerts as
with last1h as (
  select
    count(*) as total_rounds,
    count(*) filter (where round_status = 'rejected') as rejected_rounds,
    sum(stake) as total_stake,
    sum(payout) as total_payout,
    count(*) filter (
      where round_status = 'open'
      and created_at <= now() - interval '5 minutes'
    ) as open_rounds_over_5min
  from public.game_rounds
  where created_at >= now() - interval '1 hour'
)
select
  now() as generated_at,
  case
    when total_rounds > 0 and rejected_rounds::numeric / total_rounds >= 0.01 then 'critical_rejected_rate'
    when total_rounds > 0 and rejected_rounds::numeric / total_rounds > 0.005 then 'warn_rejected_rate'
    when total_stake > 0 and (total_payout / total_stake < 0.837 or total_payout / total_stake > 0.877) then 'critical_rtp_out_of_band'
    when open_rounds_over_5min >= 20 then 'critical_open_rounds'
    when open_rounds_over_5min > 5 then 'warn_open_rounds'
    else 'ok'
  end as status,
  total_rounds,
  rejected_rounds,
  open_rounds_over_5min,
  case when total_stake > 0 then total_payout / total_stake else 0 end as rtp,
  case when total_rounds > 0 then rejected_rounds::numeric / total_rounds else 0 end as rejected_rate
from last1h;
