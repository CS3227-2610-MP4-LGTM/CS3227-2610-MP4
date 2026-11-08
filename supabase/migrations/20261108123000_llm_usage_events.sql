-- Durable, append-only transition evidence. Reservation rows remain the atomic
-- budget projection; events preserve dispatch, settlement and expiry history.
create table private.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references private.llm_operations(id),
  reservation_id uuid references private.ai_usage_records(id),
  account_id uuid not null references public.profiles(id),
  environment_id text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  event_type text not null check (event_type in (
    'operation_reserved', 'operation_completed', 'operation_failed',
    'operation_expired', 'attempt_reserved', 'attempt_dispatched',
    'attempt_settled', 'accounting_snapshot'
  )),
  details jsonb not null
);

alter table private.llm_usage_events enable row level security;
revoke all on private.llm_usage_events from public, anon, authenticated, service_role;
create index llm_usage_events_operation on private.llm_usage_events(operation_id, recorded_at, id);

create function private.append_llm_usage_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  kind text;
  event_details jsonb;
  reservation uuid;
  operation uuid;
begin
  if tg_table_name = 'llm_operations' then
    if tg_op = 'UPDATE' and old.state = new.state then
      return new;
    end if;
    kind := 'operation_' || case new.state when 'active' then 'reserved' else new.state end;
    operation := new.id;
    event_details := jsonb_build_object('state', new.state, 'expiresAt', new.expires_at);
  else
    if tg_op = 'INSERT' then
      kind := 'attempt_reserved';
    elsif old.outcome is distinct from new.outcome then
      kind := 'attempt_settled';
    elsif old.dispatched is distinct from new.dispatched then
      kind := 'attempt_dispatched';
    else
      return new;
    end if;
    reservation := new.id;
    operation := new.operation_id;
    event_details := jsonb_build_object(
      'reservedAt', new.reserved_at,
      'inputTokens', new.input_tokens,
      'outputTokens', new.output_tokens,
      'dispatched', new.dispatched,
      'outcome', new.outcome,
      'chargedTokens', new.charged_tokens,
      'settlement', new.settlement
    );
  end if;
  insert into private.llm_usage_events(
    operation_id, reservation_id, account_id, environment_id, event_type, details
  ) values (
    operation, reservation, new.account_id, new.environment_id, kind, event_details
  );
  return new;
end;
$$;

revoke all on function private.append_llm_usage_event() from public, anon, authenticated, service_role;

create trigger llm_operation_events
  after insert or update on private.llm_operations
  for each row execute function private.append_llm_usage_event();
create trigger llm_attempt_events
  after insert or update on private.ai_usage_records
  for each row execute function private.append_llm_usage_event();

create function private.reject_llm_usage_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AI usage events are immutable' using errcode = '42501';
end;
$$;

revoke all on function private.reject_llm_usage_event_mutation() from public, anon, authenticated, service_role;
create trigger immutable_llm_usage_events
  before update or delete on private.llm_usage_events
  for each row execute function private.reject_llm_usage_event_mutation();
create trigger no_truncate_llm_usage_events
  before truncate on private.llm_usage_events
  for each statement execute function private.reject_llm_usage_event_mutation();

-- Existing installations get an explicitly labelled starting snapshot; it does
-- not pretend to reconstruct transitions that predate this audit migration.
insert into private.llm_usage_events(
  operation_id, reservation_id, account_id, environment_id, event_type, details
)
select operation_id, id, account_id, environment_id, 'accounting_snapshot',
  jsonb_build_object(
    'reservedAt', reserved_at,
    'inputTokens', input_tokens,
    'outputTokens', output_tokens,
    'dispatched', dispatched,
    'outcome', outcome,
    'chargedTokens', charged_tokens,
    'settlement', settlement
  )
from private.ai_usage_records;
