-- No admin table grants: these functions are the only privileged accounting port.
create table private.llm_operations (
 id uuid primary key default gen_random_uuid(), environment_id text not null,
 account_id uuid not null references public.profiles(id), operation text not null check(operation in ('inject_flaws','generate_hints','assess_review','summarize_learner')),
 resource_id uuid not null, idempotency_key uuid not null, fingerprint text not null,
 state text not null default 'active' check(state in ('active','completed','failed','expired')),
 expires_at timestamptz not null, unique(environment_id,account_id,operation,resource_id,idempotency_key)
);
create table private.ai_usage_records (
 id uuid primary key default gen_random_uuid(), operation_id uuid not null references private.llm_operations(id),
 account_id uuid not null references public.profiles(id), environment_id text not null,
 reserved_at timestamptz not null, input_tokens integer not null check(input_tokens between 0 and 32768),
 output_tokens integer not null check(output_tokens between 0 and 8192),
 dispatched boolean not null default false, outcome text check(outcome in ('verified','uncertain','not_dispatched')),
 charged_tokens integer not null check(charged_tokens>=0), settlement jsonb
);
alter table private.llm_operations enable row level security;
alter table private.ai_usage_records enable row level security;
revoke all on private.llm_operations,private.ai_usage_records from public,anon,authenticated,service_role;
create index llm_operations_environment on private.llm_operations(environment_id,account_id,state);
create index ai_usage_records_windows on private.ai_usage_records(environment_id,reserved_at,account_id);

-- Each call is one committed transaction. The namespace lock covers both scopes,
-- including simultaneous duplicate-key admission and all settlement adjustments.
create function public.llm_accounting(action text, args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 env text := args->>'environmentId';
 at_time timestamptz := (args->>'now')::timestamptz;
 op private.llm_operations%rowtype; r private.ai_usage_records%rowtype;
 account uuid := (args->>'accountId')::uuid;
 lim jsonb := args->'limits'; stats jsonb; scope text; budget text;
 target uuid; charge integer; settled jsonb;
begin
 if env is null or env='' or at_time is null then raise exception 'VALIDATION_ERROR'; end if;
 perform pg_advisory_xact_lock(hashtextextended('llm-accounting:'||env,0));
 -- Expiry releases only demonstrably undispatched attempts. Dispatched work keeps
 -- its full maximum charge even if a process died before settlement.
 update private.ai_usage_records u set outcome=case when u.dispatched then 'uncertain' else 'not_dispatched' end,
 charged_tokens=case when u.dispatched then u.input_tokens+u.output_tokens else 0 end,
 settlement=jsonb_build_object('expired',true)
 from private.llm_operations o where u.operation_id=o.id and o.environment_id=env and o.state='active' and o.expires_at<=at_time and u.outcome is null;
 update private.llm_operations set state='expired' where environment_id=env and state='active' and expires_at<=at_time;
 if action='expire' then return '{}'::jsonb; end if;
 if action in ('reserve','read') then
   select jsonb_object_agg(s.name,jsonb_build_object(
    'active',(select count(*) from private.llm_operations o where o.environment_id=env and o.state='active' and (s.name='environment' or o.account_id=account)),
    'minuteAttempts',(select count(*) from private.ai_usage_records u where u.environment_id=env and (s.name='environment' or u.account_id=account) and u.outcome is distinct from 'not_dispatched' and date_trunc('minute',u.reserved_at at time zone 'UTC')=date_trunc('minute',coalesce((args->>'at')::timestamptz,at_time) at time zone 'UTC')),
    'dayAttempts',(select count(*) from private.ai_usage_records u where u.environment_id=env and (s.name='environment' or u.account_id=account) and u.outcome is distinct from 'not_dispatched' and (u.reserved_at at time zone 'UTC')::date=(coalesce((args->>'at')::timestamptz,at_time) at time zone 'UTC')::date),
    'dayTokens',(select coalesce(sum(u.charged_tokens),0) from private.ai_usage_records u where u.environment_id=env and (s.name='environment' or u.account_id=account) and (u.reserved_at at time zone 'UTC')::date=(coalesce((args->>'at')::timestamptz,at_time) at time zone 'UTC')::date))) into stats from (values ('account'),('environment')) s(name);
   if action='read' then return stats; end if;
   if account is null or not exists(select 1 from public.profiles where id=account) then raise exception 'FORBIDDEN'; end if;
   select * into op from private.llm_operations where environment_id=env and account_id=account and operation=args->>'operation' and resource_id=(args->>'resourceId')::uuid and idempotency_key=(args->>'idempotencyKey')::uuid;
   if found then
    if op.fingerprint<>args->>'fingerprint' then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if args->>'operationId' is null then return jsonb_build_object('status',case when op.state='completed' then 'replay' else 'in_progress' end,'operationId',op.id); end if;
    if op.id<>(args->>'operationId')::uuid or op.state<>'active' then raise exception 'INVALID_STATE'; end if;
    if exists(select 1 from private.ai_usage_records where operation_id=op.id and outcome is null) then raise exception 'INVALID_STATE'; end if;
    if (select count(*) from private.ai_usage_records where operation_id=op.id)>=least(2,(lim->>'attemptsPerOperation')::int) then raise exception 'RATE_LIMITED'; end if;
   elsif args->>'operationId' is not null then raise exception 'INVALID_STATE'; end if;
   charge:=(args->>'inputTokens')::integer+(args->>'outputTokens')::integer;
   if charge is null or (args->>'inputTokens')::integer not between 0 and least(32768,(lim->>'inputTokens')::int) or (args->>'outputTokens')::integer not between 0 and least(8192,(lim->>'outputTokens')::int) then raise exception 'PAYLOAD_TOO_LARGE'; end if;
   foreach scope in array array['account','environment'] loop
    if op.id is null and (stats->scope->>'active')::int >= least((lim->scope->>'active')::int,case when scope='account' then 1 else 4 end) then raise exception 'RATE_LIMITED'; end if;
    foreach budget in array array['minuteAttempts','dayAttempts','dayTokens'] loop
     if (stats->scope->>budget)::bigint + (case when budget='dayTokens' then charge else 1 end) > least((lim->scope->>budget)::bigint,(case when scope='account' then (case budget when 'minuteAttempts' then 4 when 'dayAttempts' then 20 else 300000 end) else (case budget when 'minuteAttempts' then 20 when 'dayAttempts' then 100 else 1500000 end) end)) then raise exception 'RATE_LIMITED'; end if;
    end loop;
   end loop;
   if op.id is null then
    insert into private.llm_operations(environment_id,account_id,operation,resource_id,idempotency_key,fingerprint,expires_at)
    values(env,account,args->>'operation',(args->>'resourceId')::uuid,(args->>'idempotencyKey')::uuid,args->>'fingerprint',at_time+make_interval(secs=>least(35000,(lim->>'operationMs')::int)/1000.0)) returning * into op;
   end if;
   insert into private.ai_usage_records(operation_id,account_id,environment_id,reserved_at,input_tokens,output_tokens,charged_tokens)
   values(op.id,account,env,at_time,(args->>'inputTokens')::int,(args->>'outputTokens')::int,charge) returning id into target;
   return jsonb_build_object('status','reserved','operationId',op.id,'reservationId',target,'expiresAt',op.expires_at);
 end if;
 if action='close' then
  select * into op from private.llm_operations where id=(args->>'operationId')::uuid and environment_id=env;
  if not found or op.state='expired' or args->>'outcome' not in ('completed','failed') then raise exception 'INVALID_STATE'; end if;
  if exists(select 1 from private.ai_usage_records where operation_id=op.id and outcome is null) then raise exception 'INVALID_STATE'; end if;
  if op.state<>'active' and op.state<>args->>'outcome' then raise exception 'INVALID_STATE'; end if;
  update private.llm_operations set state=args->>'outcome' where id=op.id;return '{}'::jsonb;
 end if;
 select * into r from private.ai_usage_records where id=(args->>'reservationId')::uuid and environment_id=env;
 if not found then raise exception 'INVALID_STATE'; end if;
 select * into op from private.llm_operations where id=r.operation_id;
 if op.state<>'active' then raise exception 'INVALID_STATE'; end if;
 if action='dispatch' then
  if r.outcome is not null then raise exception 'INVALID_STATE'; end if;
  update private.ai_usage_records set dispatched=true where id=r.id; return '{}'::jsonb;
 end if;
 if action<>'settle' then raise exception 'VALIDATION_ERROR'; end if;
 settled=jsonb_build_object('outcome',args->>'outcome','usage',args->'usage');
 if r.outcome is not null then
  if r.settlement=settled then return '{}'::jsonb; end if;raise exception 'INVALID_STATE';
 end if;
 if args->>'outcome'='not_dispatched' then
  if r.dispatched then raise exception 'INVALID_STATE'; end if;charge:=0;
 elsif args->>'outcome'='verified' then
  if not r.dispatched or (args->'usage'->>'inputTokens')::int not between 0 and r.input_tokens or (args->'usage'->>'outputTokens')::int not between 0 and r.output_tokens or args->'usage' is null then raise exception 'INVALID_STATE'; end if;
  charge:=(args->'usage'->>'inputTokens')::int+(args->'usage'->>'outputTokens')::int;
 elsif args->>'outcome'='uncertain' then charge:=r.input_tokens+r.output_tokens;
 else raise exception 'VALIDATION_ERROR';end if;
 update private.ai_usage_records set outcome=args->>'outcome',charged_tokens=charge,settlement=settled where id=r.id;
 return '{}'::jsonb;
end $$;
revoke all on function public.llm_accounting(text,jsonb) from public,anon,authenticated;
grant execute on function public.llm_accounting(text,jsonb) to service_role;

-- Named SYS-10.3 Submission grading read; the verified owner/state gate is
-- repeated inside the function. Only this pinned submission's private context.
create function public.llm_grading_context(account_id uuid, submission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.submissions%rowtype; result jsonb;
begin
 select * into s from public.submissions where id=submission_id and learner_id=account_id;
 if not found or not exists(select 1 from public.profiles where id=account_id and role='learner') then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from public.ai_grades where ai_grades.submission_id=s.id) then raise exception 'INVALID_STATE'; end if;
 select jsonb_build_object('revisionId',s.revision_id,'flaws',coalesce(jsonb_agg(to_jsonb(f) order by f.start_line,f.id),'[]')) into result from public.revision_flaws f where f.revision_id=s.revision_id;
 return result;
end $$;
revoke all on function public.llm_grading_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.llm_grading_context(uuid,uuid) to service_role;

-- A user-scoped authorization decision exposes only the approved 403/404
-- distinction, never another author's draft or other private record fields.
create function public.challenge_generation_access(resource_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 if auth.uid() is null then return 'UNAUTHENTICATED'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and role='author') then return 'FORBIDDEN'; end if;
 select author_id into owner_id from public.challenges where id=resource_id;
 if not found then return 'NOT_FOUND'; end if;
 if owner_id<>auth.uid() then return 'FORBIDDEN'; end if;
 return 'OK';
end $$;
revoke all on function public.challenge_generation_access(uuid) from public,anon,service_role;
grant execute on function public.challenge_generation_access(uuid) to authenticated;
