-- Webhook security hardening (Option B):
-- allowlist IP + strict idempotency + forensic logs

create table if not exists public.webhook_events (
  id bigserial primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  source_ip text,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id, event_type, status)
);

create index if not exists webhook_events_provider_processed_idx
  on public.webhook_events(provider, processed_at desc);

alter table public.webhook_events enable row level security;

drop policy if exists "webhook_events_no_read" on public.webhook_events;
create policy "webhook_events_no_read"
  on public.webhook_events for select
  using (false);

create or replace function public.register_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_status text,
  p_payload jsonb,
  p_source_ip text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_events(
    provider,
    provider_event_id,
    event_type,
    status,
    payload,
    source_ip
  )
  values (
    p_provider,
    p_provider_event_id,
    p_event_type,
    p_status,
    coalesce(p_payload, '{}'::jsonb),
    p_source_ip
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.register_webhook_event(text, text, text, text, jsonb, text) from public;
grant execute on function public.register_webhook_event(text, text, text, text, jsonb, text) to service_role;
