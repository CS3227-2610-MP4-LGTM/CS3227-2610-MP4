-- Align the existing table constraint with the approved final SummaryOutput
-- contract. Legacy rows may keep separately stored evidence; this validator
-- accepts that historical storage shape, while the generation RPC below
-- requires the complete current output contract for every newly generated item.
create or replace function private.valid_summary_output(summary jsonb)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare section text; item jsonb; evidence jsonb; total integer:=0;
begin
  if jsonb_typeof(summary) is distinct from 'object'
    or not summary ?& array['strengths','blindSpots','nextSteps']
    or summary-array['strengths','blindSpots','nextSteps']<>'{}'::jsonb then return false; end if;
  foreach section in array array['strengths','blindSpots','nextSteps'] loop
    if jsonb_typeof(summary->section) is distinct from 'array' then return false; end if;
    if jsonb_array_length(summary->section)>5 then return false; end if;
    total:=total+jsonb_array_length(summary->section);
    for item in select value from jsonb_array_elements(summary->section) loop
      if jsonb_typeof(item) is distinct from 'object'
        or not item ?& array['category','text']
        or item-array['category','text','submissionIds']<>'{}'::jsonb
        or jsonb_typeof(item->'text') is distinct from 'string'
        or private.valid_domain_text(item->>'text',2000) is not true
        or (item->>'category' in ('logic_bug','edge_case','error_handling','security','performance')) is not true
        then return false; end if;
      if not item ? 'submissionIds' then continue; end if;
      if jsonb_typeof(item->'submissionIds') is distinct from 'array' then return false; end if;
      if jsonb_array_length(item->'submissionIds') not between 1 and 20
        or (select count(*)<>count(distinct value) from jsonb_array_elements(item->'submissionIds')) then return false; end if;
      for evidence in select value from jsonb_array_elements(item->'submissionIds') loop
        if jsonb_typeof(evidence) is distinct from 'string'
          or (evidence#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      end loop;
    end loop;
  end loop;
  return total>0;
end $$;

-- One dedicated admin surface owns summary mutation admission, durable replay,
-- failure recording and atomic immutable summary/evidence publication.
create table private.ta_summary_requests (
  account_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  learner_id uuid not null references public.profiles(id),
  state text not null check (state in ('active','completed','failed')),
  expires_at timestamptz not null,
  summary_id uuid references public.performance_summaries(id),
  failure_code text,
  primary key(account_id,learner_id,idempotency_key)
);
alter table private.ta_summary_requests enable row level security;
revoke all on private.ta_summary_requests from public, anon, authenticated, service_role;

create function public.persist_ta_summary(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (p_input->>'accountId')::uuid;
  learner uuid := (p_input->>'learnerId')::uuid;
  mutation_key uuid := (p_input->>'idempotencyKey')::uuid;
  action text := p_input->>'action';
  request private.ta_summary_requests%rowtype;
  op private.llm_operations%rowtype;
  saved public.performance_summaries%rowtype;
  section text; item jsonb; evidence jsonb; ordinal bigint;
  fingerprint text := p_input->>'inputFingerprint';
  snapshot jsonb := p_input->'snapshot';
  output jsonb := p_input->'output';
  code text;
begin
  if actor is null or learner is null or mutation_key is null or action not in ('claim','fail','complete') then raise exception 'VALIDATION_ERROR'; end if;
  if not exists(select 1 from public.profiles where id=actor and role='ta')
    or not exists(select 1 from public.profiles where id=learner and role='learner') then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ta-summary:'||actor::text||':'||learner::text||':'||mutation_key::text,0));
  select * into request from private.ta_summary_requests where account_id=actor and learner_id=learner and idempotency_key=mutation_key for update;
  if found then
    if request.state='completed' then
      select * into saved from public.performance_summaries where id=request.summary_id;
      return jsonb_build_object('status','completed','summary',jsonb_build_object('id',saved.id,'learnerId',saved.learner_id,'createdAt',saved.created_at,'inputFingerprint',saved.input_fingerprint,'output',saved.output));
    end if;
    if request.state='failed' then return jsonb_build_object('status','failed','code',request.failure_code); end if;
    if request.expires_at<=clock_timestamp() then
      update private.ta_summary_requests set state='failed',failure_code='AI_TIMEOUT' where account_id=actor and learner_id=learner and idempotency_key=mutation_key;
      return jsonb_build_object('status','failed','code','AI_TIMEOUT');
    end if;
    if action='claim' then return jsonb_build_object('status','pending'); end if;
  elsif action='claim' then
    insert into private.ta_summary_requests(account_id,idempotency_key,learner_id,state,expires_at)
      values(actor,mutation_key,learner,'active',clock_timestamp()+interval '35 seconds');
    return jsonb_build_object('status','started');
  else raise exception 'INVALID_STATE'; end if;
  if action='fail' then
    code:=p_input->>'code';
    if code not in ('VALIDATION_ERROR','PAYLOAD_TOO_LARGE','INVALID_AI_OUTPUT','AI_UNAVAILABLE','AI_TIMEOUT','SERVICE_UNAVAILABLE','RATE_LIMITED','INVALID_STATE','IDEMPOTENCY_CONFLICT','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','VERSION_CONFLICT') then raise exception 'VALIDATION_ERROR'; end if;
    update private.ta_summary_requests set state='failed',failure_code=code where account_id=actor and learner_id=learner and idempotency_key=mutation_key;
    return jsonb_build_object('status','failed','code',code);
  end if;
  select * into op from private.llm_operations where id=(p_input->>'operationId')::uuid for update;
  if not found or op.account_id<>actor or op.resource_id<>learner or op.operation<>'summarize_learner'
    or op.idempotency_key<>mutation_key or op.state<>'completed' or op.expires_at<=clock_timestamp()
    or fingerprint is null or op.fingerprint<>fingerprint
    or not exists(select 1 from private.ai_usage_records u where u.operation_id=op.id and u.dispatched and u.outcome='verified')
    or exists(select 1 from private.ai_usage_records u where u.operation_id=op.id and u.outcome is null)
    then raise exception 'INVALID_STATE'; end if;
  if snapshot->>'operation' is distinct from 'summarize_learner' or snapshot->>'schemaVersion' is distinct from '1'
    or snapshot#>>'{payload,progress,learnerId}' is distinct from learner::text
    or jsonb_typeof(snapshot#>'{payload,submissions}') is distinct from 'array'
    or jsonb_array_length(snapshot#>'{payload,submissions}') not between 1 and 20
    or private.valid_summary_output(output) is not true then raise exception 'VALIDATION_ERROR'; end if;
  for evidence in select value from jsonb_array_elements(snapshot#>'{payload,submissions}') loop
    if not exists(select 1 from public.submissions s join public.ai_grades g on g.submission_id=s.id
      where s.id=(evidence->>'submissionId')::uuid and s.learner_id=learner and s.revision_id=(evidence->>'revisionId')::uuid)
      then raise exception 'FORBIDDEN'; end if;
  end loop;
  foreach section in array array['strengths','blindSpots','nextSteps'] loop
    for item in select value from jsonb_array_elements(output->section) loop
      if not item ? 'submissionIds' then raise exception 'INVALID_AI_OUTPUT'; end if;
      for evidence in select value from jsonb_array_elements(item->'submissionIds') loop
        if not exists(select 1 from jsonb_array_elements(snapshot#>'{payload,submissions}') s
          where s->>'submissionId'=evidence#>>'{}' and exists(select 1 from jsonb_array_elements(s->'categories') c where c->>'category'=item->>'category'))
          then raise exception 'INVALID_AI_OUTPUT'; end if;
      end loop;
    end loop;
  end loop;
  insert into public.performance_summaries(learner_id,requested_by,input_fingerprint,output)
    values(learner,actor,fingerprint,output) returning * into saved;
  foreach section in array array['strengths','blindSpots','nextSteps'] loop
    for item,ordinal in select value, ordinality-1 from jsonb_array_elements(output->section) with ordinality loop
      for evidence in select value from jsonb_array_elements(item->'submissionIds') loop
        insert into public.performance_summary_evidence(summary_id,item_kind,item_ordinal,submission_id)
          values(saved.id,section,ordinal,(evidence#>>'{}')::uuid);
      end loop;
    end loop;
  end loop;
  update private.ta_summary_requests set state='completed',summary_id=saved.id where account_id=actor and learner_id=learner and idempotency_key=mutation_key;
  return jsonb_build_object('status','completed','summary',jsonb_build_object('id',saved.id,'learnerId',saved.learner_id,'createdAt',saved.created_at,'inputFingerprint',saved.input_fingerprint,'output',saved.output));
end $$;
revoke all on function public.persist_ta_summary(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.persist_ta_summary(jsonb) to service_role;
