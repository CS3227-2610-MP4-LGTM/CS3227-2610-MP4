-- T-22: Author publication (SYS-10.3 "Publication"). Revisions, private
-- answers, flaws, hints and the published pointer are written only by
-- persist_author_publication; no table grants change.

-- Durable replay for publication requests, keyed by actor, challenge and
-- Idempotency-Key. The fingerprint is the expected versions the request sent.
create table private.author_publication_requests (
  actor_id uuid not null references public.profiles (id),
  challenge_id uuid not null references public.challenges (id),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  state text not null check (state in ('active', 'completed', 'failed')),
  expires_at timestamptz not null,
  revision_id uuid references public.challenge_revisions (id),
  failure_code text,
  primary key (actor_id, challenge_id, idempotency_key)
);
alter table private.author_publication_requests enable row level security;
revoke all on private.author_publication_requests from public, anon, authenticated, service_role;

-- SYS-12.1: an Author reads private answers, flaws and hints only for their
-- own challenges. The earlier policies let any Author read them for another
-- Author's live revision. TA access is unchanged.
drop policy read_revision_answers on public.revision_answers;
drop policy read_revision_flaws on public.revision_flaws;
drop policy read_flaw_hints on public.flaw_hints;

create policy read_revision_answers on public.revision_answers for select to authenticated
  using ((
      (select private.current_domain_role()) = 'ta'
      or ((select private.current_domain_role()) = 'author' and exists (
        select 1 from public.challenge_revisions revision
        join public.challenges challenge on challenge.id = revision.challenge_id
        where revision.id = revision_answers.revision_id and challenge.author_id = (select auth.uid())))
    )
    and exists (select 1 from public.challenge_revisions where id = revision_answers.revision_id));

create policy read_revision_flaws on public.revision_flaws for select to authenticated
  using ((
      (select private.current_domain_role()) = 'ta'
      or ((select private.current_domain_role()) = 'author' and exists (
        select 1 from public.challenge_revisions revision
        join public.challenges challenge on challenge.id = revision.challenge_id
        where revision.id = revision_flaws.revision_id and challenge.author_id = (select auth.uid())))
    )
    and exists (select 1 from public.challenge_revisions where id = revision_flaws.revision_id));

create policy read_flaw_hints on public.flaw_hints for select to authenticated
  using ((
      (select private.current_domain_role()) = 'ta'
      or ((select private.current_domain_role()) = 'author' and exists (
        select 1 from public.challenge_revisions revision
        join public.challenges challenge on challenge.id = revision.challenge_id
        where revision.id = flaw_hints.revision_id and challenge.author_id = (select auth.uid())))
    )
    and exists (select 1 from public.challenge_revisions where id = flaw_hints.revision_id));

-- SYS-10.3 "Publication": the only path that writes a revision, its private
-- answers, flaws and hints, and the published pointer. Actions: claim
-- (admission and replay), fail (record a confirmed failure), complete (the
-- atomic publication transaction). The candidate is assembled here from the
-- stored active proposal set, never taken from the caller.
create function public.persist_author_publication(p_input jsonb)
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
  request private.author_publication_requests%rowtype;
  op private.llm_operations%rowtype;
  challenge public.challenges%rowtype;
  draft public.challenge_drafts%rowtype;
  hints jsonb := p_input -> 'hints';
  hint_fields constant text[] := array['key', 'text'];
  proposal record;
  source_lines text[];
  result_lines text[] := array[]::text[];
  replacement_lines text[];
  consumed integer := 0;
  approved integer := 0;
  final_start integer;
  candidate text;
  new_revision uuid;
  flaw_id uuid;
  hint_text text;
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

  perform pg_advisory_xact_lock(hashtextextended('author-publication:' || actor::text || ':' || target::text || ':' || mutation_key::text, 0));
  select * into request from private.author_publication_requests
    where actor_id = actor and challenge_id = target and idempotency_key = mutation_key for update;
  if found then
    if request.request_fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'failed', 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    if request.state = 'completed' then
      return jsonb_build_object('status', 'completed', 'revisionId', request.revision_id);
    end if;
    if request.state = 'failed' then
      return jsonb_build_object('status', 'failed', 'code', request.failure_code);
    end if;
    if request.expires_at <= clock_timestamp() then
      update private.author_publication_requests set state = 'failed', failure_code = 'AI_TIMEOUT'
        where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
      return jsonb_build_object('status', 'failed', 'code', 'AI_TIMEOUT');
    end if;
    if action = 'claim' then
      return jsonb_build_object('status', 'pending');
    end if;
  elsif action = 'claim' then
    insert into private.author_publication_requests (actor_id, challenge_id, idempotency_key, request_fingerprint, state, expires_at)
      values (actor, target, mutation_key, request_fingerprint, 'active', clock_timestamp() + interval '45 seconds');
    return jsonb_build_object('status', 'started');
  else
    raise exception 'INVALID_STATE';
  end if;

  if action = 'fail' then
    code := p_input ->> 'code';
    -- NOT_PUBLISHABLE records an ineligible candidate (AUT-05.1).
    if code is null or code not in ('VALIDATION_ERROR', 'PAYLOAD_TOO_LARGE', 'INVALID_AI_OUTPUT', 'AI_UNAVAILABLE', 'AI_TIMEOUT',
      'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'INVALID_STATE', 'IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN',
      'NOT_FOUND', 'VERSION_CONFLICT', 'NOT_PUBLISHABLE') then
      code := 'SERVICE_UNAVAILABLE';
    end if;
    update private.author_publication_requests set state = 'failed', failure_code = code
      where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
    return jsonb_build_object('status', 'failed', 'code', code);
  end if;

  -- complete: the provider operation must be this request's completed, unexpired,
  -- verified-settled generate_hints operation (SEC-05 rejects late results).
  select * into op from private.llm_operations where id = (p_input ->> 'operationId')::uuid for update;
  if not found or op.account_id <> actor or op.resource_id <> target or op.operation <> 'generate_hints'
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

  -- Serialize with edits, decisions, generation, lifecycle changes and attempts.
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
  -- The versions checked here must be the ones this request was admitted with
  -- (the ledger fingerprint is JSON.stringify([rowVersion, draftVersion])).
  if request.request_fingerprint <> '[' || (p_input ->> 'expectedRowVersion') || ',' || (p_input ->> 'expectedDraftVersion') || ']' then
    raise exception 'VALIDATION_ERROR';
  end if;
  -- Every decision or edit increments the draft version, so unchanged versions
  -- mean the hints were generated for this exact candidate.
  if draft.generation_id is null
    or not exists (select 1 from public.proposals where proposal_set_id = draft.generation_id)
    or exists (
      select 1 from public.proposals p left join public.proposal_decisions d on d.proposal_id = p.id
      where p.proposal_set_id = draft.generation_id and coalesce(d.decision, 'pending') not in ('approved', 'rejected'))
  then
    raise exception 'NOT_PUBLISHABLE';
  end if;

  -- Structural hint checks (SEC-02); SEC-03's text checks run at the LLM boundary.
  -- Element types are checked in their own statement: SQL does not guarantee OR
  -- evaluation order, and `item - hint_fields` raises on a non-object.
  if jsonb_typeof(hints) is distinct from 'array'
    or exists (select 1 from jsonb_array_elements(hints) item where jsonb_typeof(item) <> 'object') then
    raise exception 'INVALID_AI_OUTPUT';
  end if;
  if exists (
    select 1 from jsonb_array_elements(hints) item
    where not item ?& hint_fields or item - hint_fields <> '{}'::jsonb
      or jsonb_typeof(item -> 'key') <> 'string' or jsonb_typeof(item -> 'text') <> 'string'
      or private.valid_domain_text(item ->> 'text', 500) is not true)
    or (select count(distinct item ->> 'key') from jsonb_array_elements(hints) item) <> jsonb_array_length(hints)
  then
    raise exception 'INVALID_AI_OUTPUT';
  end if;

  -- Assemble the retained candidate in source order (INTEGRATION-SPEC §2).
  source_lines := private.domain_code_lines(draft.working_code);
  for proposal in
    select p.* from public.proposals p join public.proposal_decisions d on d.proposal_id = p.id
    where p.proposal_set_id = draft.generation_id and d.decision = 'approved' order by p.source_start_line
  loop
    if proposal.source_start_line <= consumed or proposal.source_end_line > cardinality(source_lines) then
      raise exception 'NOT_PUBLISHABLE';
    end if;
    approved := approved + 1;
    result_lines := result_lines || coalesce(source_lines[consumed + 1:proposal.source_start_line - 1], array[]::text[])
      || string_to_array(proposal.replacement_snippet, E'\n');
    consumed := proposal.source_end_line;
  end loop;
  if approved = 0 then
    raise exception 'NOT_PUBLISHABLE';
  end if;
  result_lines := result_lines || coalesce(source_lines[consumed + 1:], array[]::text[]);
  candidate := array_to_string(result_lines, E'\n') || case when right(draft.working_code, 1) = E'\n' then E'\n' else '' end;
  if private.valid_domain_code(candidate) is not true then
    raise exception 'NOT_PUBLISHABLE';
  end if;
  -- Exactly one hint per retained flaw and no extras.
  if jsonb_array_length(hints) <> approved or exists (
    select 1 from jsonb_array_elements(hints) item
    where not exists (
      select 1 from public.proposals p join public.proposal_decisions d on d.proposal_id = p.id
      where p.proposal_set_id = draft.generation_id and d.decision = 'approved' and p.id::text = item ->> 'key'))
  then
    raise exception 'INVALID_AI_OUTPUT';
  end if;

  insert into public.challenge_revisions (challenge_id, revision_number, title, description, language, difficulty, flawed_code)
    values (target, (select coalesce(max(revision_number), 0) + 1 from public.challenge_revisions where challenge_id = target),
      draft.title, draft.description, draft.language, draft.difficulty, candidate)
    returning id into new_revision;
  -- The insert trigger checks the server-derived diff against both sides of the code.
  begin
    insert into public.revision_answers (revision_id, working_code, real_diff)
      values (new_revision, draft.working_code, p_input -> 'diff');
  exception when check_violation or not_null_violation then
    raise exception 'NOT_PUBLISHABLE';
  end;
  consumed := 0;
  for proposal in
    select p.* from public.proposals p join public.proposal_decisions d on d.proposal_id = p.id
    where p.proposal_set_id = draft.generation_id and d.decision = 'approved' order by p.source_start_line
  loop
    replacement_lines := string_to_array(proposal.replacement_snippet, E'\n');
    -- The final range is the replacement's range, shifted by earlier retained edits.
    final_start := proposal.source_start_line + consumed;
    begin
      insert into public.revision_flaws (revision_id, proposal_id, category, original_snippet, replacement_snippet,
        source_start_line, source_end_line, start_line, end_line, explanation, fix)
        values (new_revision, proposal.id, proposal.category, proposal.original_snippet, proposal.replacement_snippet,
          proposal.source_start_line, proposal.source_end_line, final_start, final_start + cardinality(replacement_lines) - 1,
          proposal.explanation, proposal.fix)
        returning id into flaw_id;
    exception when check_violation or not_null_violation then
      raise exception 'NOT_PUBLISHABLE';
    end;
    consumed := consumed + cardinality(replacement_lines) - (proposal.source_end_line - proposal.source_start_line + 1);
    select item ->> 'text' into hint_text from jsonb_array_elements(hints) item where item ->> 'key' = proposal.id::text;
    begin
      insert into public.flaw_hints (flaw_id, revision_id, text, generation_metadata)
        values (flaw_id, new_revision, hint_text, jsonb_build_object('operationId', op.id));
    exception when check_violation or not_null_violation then
      raise exception 'INVALID_AI_OUTPUT';
    end;
  end loop;
  update public.challenges set status = 'published', published_revision_id = new_revision,
    row_version = row_version + 1, updated_at = now() where id = target;
  update private.author_publication_requests set state = 'completed', revision_id = new_revision
    where actor_id = actor and challenge_id = target and idempotency_key = mutation_key;
  return jsonb_build_object('status', 'completed', 'revisionId', new_revision);
end;
$$;

revoke all on function public.persist_author_publication(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.persist_author_publication(jsonb) to service_role;
