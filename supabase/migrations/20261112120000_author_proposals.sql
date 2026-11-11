-- T-21: Author proposal generation (SYS-10.3 "Proposal generation") and
-- user-scoped proposal decisions. No table grants change: proposal records and
-- the draft's generation pointer are written only by these functions.

-- Durable replay for generation requests, keyed by actor, challenge and
-- Idempotency-Key. The fingerprint is the expected versions the request sent.
create table private.author_proposal_requests (
  actor_id uuid not null references public.profiles (id),
  challenge_id uuid not null references public.challenges (id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  state text not null check (state in ('active', 'completed', 'failed')),
  expires_at timestamptz not null,
  proposal_set_id uuid references public.proposal_sets (id),
  failure_code text,
  primary key (actor_id, challenge_id, idempotency_key)
);
alter table private.author_proposal_requests enable row level security;
revoke all on private.author_proposal_requests from public, anon, authenticated, service_role;

-- Validates one inject_flaws result against the locked draft. Any failure
-- rejects the whole set (AUT-03.3, SEC-02).
create function private.valid_injected_proposals(proposals jsonb, working_code text, flaw_count integer, allowed public.flaw_category[])
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  fields constant text[] := array['key', 'category', 'sourceStartLine', 'sourceEndLine', 'originalSnippet', 'replacementSnippet', 'explanation', 'fix'];
  source_lines text[] := private.domain_code_lines(working_code);
  result_lines text[] := array[]::text[];
  item jsonb;
  consumed integer := 0;
  start_line integer;
  end_line integer;
  candidate text;
begin
  if jsonb_typeof(proposals) is distinct from 'array' or jsonb_array_length(proposals) <> flaw_count then
    return false;
  end if;
  if (select count(distinct value ->> 'key') from jsonb_array_elements(proposals)) <> flaw_count then
    return false;
  end if;
  for item in
    select value from jsonb_array_elements(proposals)
    order by case when (value ->> 'sourceStartLine') ~ '^[0-9]{1,6}$' then (value ->> 'sourceStartLine')::integer end nulls first
  loop
    if jsonb_typeof(item) <> 'object' or not item ?& fields or item - fields <> '{}'::jsonb
      or jsonb_typeof(item -> 'key') <> 'string' or (item ->> 'key') !~ '^[a-z0-9_-]{1,40}$'
      or jsonb_typeof(item -> 'category') <> 'string'
      or not ((item ->> 'category') = any (allowed::text[]))
      or jsonb_typeof(item -> 'sourceStartLine') <> 'number' or (item ->> 'sourceStartLine') !~ '^[1-9][0-9]{0,5}$'
      or jsonb_typeof(item -> 'sourceEndLine') <> 'number' or (item ->> 'sourceEndLine') !~ '^[1-9][0-9]{0,5}$'
      or jsonb_typeof(item -> 'originalSnippet') <> 'string'
      or jsonb_typeof(item -> 'replacementSnippet') <> 'string'
      or jsonb_typeof(item -> 'explanation') <> 'string' or private.valid_domain_text(item ->> 'explanation', 2000) is not true
      or jsonb_typeof(item -> 'fix') <> 'string' or private.valid_domain_text(item ->> 'fix', 2000) is not true
      or private.valid_domain_code(item ->> 'replacementSnippet') is not true
      or right(item ->> 'replacementSnippet', 1) = E'\n'
    then
      return false;
    end if;
    start_line := (item ->> 'sourceStartLine')::integer;
    end_line := (item ->> 'sourceEndLine')::integer;
    if start_line <= consumed or end_line < start_line or end_line > cardinality(source_lines)
      or array_to_string(source_lines[start_line:end_line], E'\n') is distinct from item ->> 'originalSnippet'
    then
      return false;
    end if;
    result_lines := result_lines || coalesce(source_lines[consumed + 1:start_line - 1], array[]::text[])
      || string_to_array(item ->> 'replacementSnippet', E'\n');
    consumed := end_line;
  end loop;
  result_lines := result_lines || coalesce(source_lines[consumed + 1:], array[]::text[]);
  candidate := array_to_string(result_lines, E'\n') || case when right(working_code, 1) = E'\n' then E'\n' else '' end;
  -- The assembled candidate obeys the same 20,000-byte code cap as working code.
  return private.valid_domain_code(candidate) is true;
end;
$$;

-- SYS-10.3 "Proposal generation": the only admin path that writes proposal
-- sets, proposals, pending decisions and the active-generation pointer.
-- Actions: claim (admission and replay), fail (record a confirmed failure),
-- complete (atomic persistence of a validated result).
create function public.persist_author_proposals(p_input jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := (p_input ->> 'accountId')::uuid;
  target uuid := (p_input ->> 'challengeId')::uuid;
  mutation_key uuid := (p_input ->> 'idempotencyKey')::uuid;
  action text := p_input ->> 'action';
  request_fingerprint text := p_input ->> 'requestFingerprint';
  request private.author_proposal_requests%rowtype;
  op private.llm_operations%rowtype;
  challenge public.challenges%rowtype;
  draft public.challenge_drafts%rowtype;
  snapshot jsonb := p_input -> 'snapshot';
  proposals jsonb := p_input -> 'proposals';
  set_id uuid;
  proposal_id uuid;
  item jsonb;
  code text;
begin
  if actor is null or target is null or mutation_key is null or action not in ('claim', 'fail', 'complete')
    or request_fingerprint is null or request_fingerprint = '' then
    raise exception 'VALIDATION_ERROR';
  end if;
  -- 'fail' only closes this actor's own existing request, so it still runs after a
  -- role change and replays never wait for expiry (SEC-05.3).
  if action <> 'fail' and not exists (select 1 from public.profiles where id = actor and role = 'author') then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.challenges where id = target and author_id = actor) then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('author-proposals:' || actor::text || ':' || target::text || ':' || mutation_key::text, 0));
  select * into request from private.author_proposal_requests
    where actor_id = actor and challenge_id = target and idempotency_key = mutation_key for update;
  if found then
    if request.request_fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'failed', 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    if request.state = 'completed' then
      return jsonb_build_object('status', 'completed', 'challengeId', target);
    end if;
    if request.state = 'failed' then
      return jsonb_build_object('status', 'failed', 'code', request.failure_code);
    end if;
    if request.expires_at <= clock_timestamp() then
      update private.author_proposal_requests set state = 'failed', failure_code = 'AI_TIMEOUT'
        where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
      return jsonb_build_object('status', 'failed', 'code', 'AI_TIMEOUT');
    end if;
    if action = 'claim' then
      return jsonb_build_object('status', 'pending');
    end if;
  elsif action = 'claim' then
    insert into private.author_proposal_requests (actor_id, challenge_id, idempotency_key, request_fingerprint, state, expires_at)
      values (actor, target, mutation_key, request_fingerprint, 'active', clock_timestamp() + interval '45 seconds');
    return jsonb_build_object('status', 'started');
  else
    raise exception 'INVALID_STATE';
  end if;

  if action = 'fail' then
    code := p_input ->> 'code';
    if code is null or code not in ('VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE', 'INVALID_AI_OUTPUT', 'AI_UNAVAILABLE', 'AI_TIMEOUT',
      'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'INVALID_STATE', 'IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN',
      'NOT_FOUND', 'VERSION_CONFLICT') then
      code := 'SERVICE_UNAVAILABLE';
    end if;
    update private.author_proposal_requests set state = 'failed', failure_code = code
      where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
    return jsonb_build_object('status', 'failed', 'code', code);
  end if;

  -- complete: the provider operation must be this request's completed, unexpired,
  -- verified-settled inject_flaws operation (SEC-05 rejects late results).
  select * into op from private.llm_operations where id = (p_input ->> 'operationId')::uuid for update;
  if not found or op.account_id <> actor or op.resource_id <> target or op.operation <> 'inject_flaws'
    or op.idempotency_key <> mutation_key then
    raise exception 'INVALID_STATE';
  end if;
  if op.expires_at <= clock_timestamp() then
    raise exception 'AI_TIMEOUT';
  end if;
  if op.state <> 'completed'
    or not exists (select 1 from private.ai_usage_records u where u.operation_id = op.id and u.dispatched and u.outcome = 'verified')
    or exists (select 1 from private.ai_usage_records u where u.operation_id = op.id and u.outcome is null)
  then
    raise exception 'INVALID_STATE';
  end if;

  -- Serialize with edits, decisions, publication and lifecycle changes.
  select * into challenge from public.challenges where id = target for update;
  if challenge.status = 'archived' then
    raise exception 'INVALID_STATE';
  end if;
  select * into draft from public.challenge_drafts where challenge_id = target;
  if not found then
    raise exception 'INVALID_STATE';
  end if;
  if jsonb_typeof(p_input -> 'expectedRowVersion') is distinct from 'number'
    or jsonb_typeof(p_input -> 'expectedDraftVersion') is distinct from 'number'
    or challenge.row_version::text <> p_input ->> 'expectedRowVersion'
    or draft.draft_version::text <> p_input ->> 'expectedDraftVersion' then
    raise exception 'VERSION_CONFLICT';
  end if;
  -- The result is accepted only against the unchanged captured snapshot.
  if snapshot is distinct from jsonb_build_object(
      'schemaVersion', 1, 'operation', 'inject_flaws',
      'payload', jsonb_build_object(
        'language', draft.language::text, 'difficulty', draft.difficulty::text, 'workingCode', draft.working_code,
        'flawCount', draft.flaw_count, 'categories', to_jsonb(draft.categories::text[])))
  then
    raise exception 'VERSION_CONFLICT';
  end if;
  if private.valid_injected_proposals(proposals, draft.working_code, draft.flaw_count, draft.categories) is not true then
    raise exception 'INVALID_AI_OUTPUT';
  end if;

  insert into public.proposal_sets (challenge_id, source_draft_version, input_snapshot)
    values (target, draft.draft_version, jsonb_build_object(
      'title', draft.title, 'description', draft.description, 'language', draft.language::text,
      'difficulty', draft.difficulty::text, 'workingCode', draft.working_code, 'flawCount', draft.flaw_count,
      'categories', to_jsonb(draft.categories::text[])))
    returning id into set_id;
  -- Server-assigned proposal IDs; the model-local key is not persisted.
  for item in select value from jsonb_array_elements(proposals) order by (value ->> 'sourceStartLine')::integer loop
    insert into public.proposals (proposal_set_id, category, original_snippet, replacement_snippet,
      source_start_line, source_end_line, explanation, fix)
      values (set_id, (item ->> 'category')::public.flaw_category, item ->> 'originalSnippet', item ->> 'replacementSnippet',
        (item ->> 'sourceStartLine')::integer, (item ->> 'sourceEndLine')::integer, item ->> 'explanation', item ->> 'fix')
      returning id into proposal_id;
    insert into public.proposal_decisions (proposal_id, decision) values (proposal_id, 'pending');
  end loop;
  -- The new set replaces the active one whole; historical sets are kept.
  update public.challenge_drafts set generation_id = set_id, draft_version = draft_version + 1 where challenge_id = target;
  update public.challenges set row_version = row_version + 1, updated_at = now() where id = target;
  update private.author_proposal_requests set state = 'completed', proposal_set_id = set_id
    where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
  return jsonb_build_object('status', 'completed', 'challengeId', target);
end;
$$;

-- AUT-04.2: the owning Author approves or rejects one proposal of the active
-- set. User-scoped under SYS-10.3; never edits generated text.
create function public.decide_author_proposal(p_challenge_id uuid, p_proposal_id uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  fields constant text[] := array['expectedRowVersion', 'expectedDraftVersion', 'decision'];
  challenge public.challenges%rowtype;
  draft public.challenge_drafts%rowtype;
  proposal_set uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'author' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_challenge_id is null or p_proposal_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or not p_payload ?& fields or p_payload - fields <> '{}'::jsonb
    or jsonb_typeof(p_payload -> 'expectedRowVersion') <> 'number'
    or jsonb_typeof(p_payload -> 'expectedDraftVersion') <> 'number'
    or (p_payload ->> 'expectedRowVersion') !~ '^[1-9][0-9]{0,9}$'
    or (p_payload ->> 'expectedDraftVersion') !~ '^[1-9][0-9]{0,9}$'
    or (p_payload ->> 'expectedRowVersion')::bigint > 2147483647
    or (p_payload ->> 'expectedDraftVersion')::bigint > 2147483647
    or jsonb_typeof(p_payload -> 'decision') <> 'string'
    or (p_payload ->> 'decision') not in ('approved', 'rejected') then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into challenge from public.challenges where id = p_challenge_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if challenge.author_id <> actor then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select p.proposal_set_id into proposal_set from public.proposals p
    join public.proposal_sets s on s.id = p.proposal_set_id
    where p.id = p_proposal_id and s.challenge_id = p_challenge_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if challenge.status = 'archived' then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  select * into draft from public.challenge_drafts where challenge_id = p_challenge_id;
  if challenge.row_version <> (p_payload ->> 'expectedRowVersion')::integer
    or draft.draft_version <> (p_payload ->> 'expectedDraftVersion')::integer then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  -- Only active-set proposals can be decided; sets are never mixed.
  if draft.generation_id is distinct from proposal_set then
    return jsonb_build_object('status', 'invalid_state');
  end if;

  update public.proposal_decisions set decision = p_payload ->> 'decision' where proposal_id = p_proposal_id;
  update public.challenge_drafts set draft_version = draft_version + 1 where challenge_id = p_challenge_id;
  update public.challenges set row_version = row_version + 1, updated_at = now() where id = p_challenge_id;
  return jsonb_build_object('status', 'ok', 'challengeId', p_challenge_id);
end;
$$;

revoke all on function private.valid_injected_proposals(jsonb, text, integer, public.flaw_category[]) from public, anon, authenticated, service_role;
revoke all on function public.persist_author_proposals(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.decide_author_proposal(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.persist_author_proposals(jsonb) to service_role;
grant execute on function public.decide_author_proposal(uuid, uuid, jsonb) to authenticated;
