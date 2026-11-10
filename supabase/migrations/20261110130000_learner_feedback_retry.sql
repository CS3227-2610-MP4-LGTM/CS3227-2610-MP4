create or replace function public.create_learner_submission(p_challenge_id uuid, p_idempotency_key uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  revision_id uuid;
  previous_id uuid;
  source_revision_id uuid;
  canonical_payload jsonb;
  comments jsonb := '[]'::jsonb;
  comment jsonb;
  comment_line numeric;
  previous_line integer := 0;
  comment_body text;
  comment_index integer := 0;
  invalid_comment_index integer;
  request_fingerprint bytea;
  recorded private.submission_create_requests%rowtype;
  challenge_status text;
  live_revision_id uuid;
  line_count integer;
  outcome text;
  new_submission_id uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_challenge_id is null or p_idempotency_key is null
    or not private.valid_submission_uuid(p_challenge_id::text)
    or not private.valid_submission_uuid(p_idempotency_key::text)
    or jsonb_typeof(p_payload) is distinct from 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not p_payload ?& array['revisionId', 'comments']
    or p_payload - array['revisionId', 'comments', 'previousSubmissionId'] <> '{}'::jsonb
    or jsonb_typeof(p_payload -> 'revisionId') <> 'string'
    or not private.valid_submission_uuid(p_payload ->> 'revisionId')
    or jsonb_typeof(p_payload -> 'comments') <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if jsonb_array_length(p_payload -> 'comments') > 50 then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_payload ? 'previousSubmissionId' then
    if jsonb_typeof(p_payload -> 'previousSubmissionId') <> 'string'
      or not private.valid_submission_uuid(p_payload ->> 'previousSubmissionId') then
      return jsonb_build_object('status', 'invalid');
    end if;
    previous_id := (p_payload ->> 'previousSubmissionId')::uuid;
  end if;
  revision_id := (p_payload ->> 'revisionId')::uuid;
  for comment in select value from jsonb_array_elements(p_payload -> 'comments') loop
    if jsonb_typeof(comment) <> 'object' then
      return jsonb_build_object('status', 'invalid');
    end if;
    if not comment ?& array['line', 'body']
      or comment - array['line', 'body'] <> '{}'::jsonb
      or jsonb_typeof(comment -> 'line') <> 'number'
      or jsonb_typeof(comment -> 'body') <> 'string' then
      return jsonb_build_object('status', 'invalid');
    end if;
    comment_line := (comment ->> 'line')::numeric;
    comment_body := private.normalize_display_name(comment ->> 'body');
    if comment_line <> trunc(comment_line) or comment_line not between 1 and 2147483647
      or not private.valid_domain_text(comment_body, 2000) then
      return jsonb_build_object('status', 'invalid');
    end if;
    if comment_line < previous_line then
      raise sqlstate 'PGRST' using
        message = '{"code":"VALIDATION_ERROR","message":"Comments must be in line order.","details":null,"hint":null}',
        detail = '{"status":400,"headers":{}}';
    end if;
    previous_line := comment_line::integer;
    comments := comments || jsonb_build_array(jsonb_build_object('line', comment_line::integer, 'body', comment_body));
  end loop;

  -- Keep first-attempt fingerprints compatible with the existing ledger.
  canonical_payload := jsonb_build_object('revisionId', revision_id, 'comments', comments);
  if previous_id is not null then
    canonical_payload := canonical_payload || jsonb_build_object('previousSubmissionId', previous_id);
  end if;
  request_fingerprint := sha256(convert_to(canonical_payload::text, 'UTF8'));

  -- A duplicate in progress can be checked again without waiting for the
  -- challenge lock. Only a committed ledger row establishes a prior outcome.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'submission-create:' || actor::text || ':' || p_challenge_id::text || ':' || p_idempotency_key::text, 0
  )) then
    return jsonb_build_object('status', 'in_progress');
  end if;

  select request.* into recorded from private.submission_create_requests as request
  where request.actor_id = actor and request.challenge_id = p_challenge_id and request.idempotency_key = p_idempotency_key;
  if found then
    if recorded.fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    if recorded.outcome = 'ok' then
      return jsonb_build_object('status', 'ok', 'submission', private.learner_submission_projection(recorded.submission_id));
    end if;
    if recorded.outcome = 'invalid' then
      return jsonb_build_object('status', 'invalid', 'invalidCommentIndex', recorded.invalid_comment_index);
    end if;
    return jsonb_build_object('status', recorded.outcome);
  end if;

  -- Publication and all distinct creation keys serialize on the challenge.
  select challenge.status, challenge.published_revision_id into challenge_status, live_revision_id
  from public.challenges as challenge where challenge.id = p_challenge_id
  for update;

  if not found then
    outcome := 'not_found';
  elsif challenge_status <> 'published' then
    outcome := 'lifecycle_unavailable';
  elsif previous_id is null then
    source_revision_id := live_revision_id;
  else
    select first_attempt.revision_id into source_revision_id
    from public.submissions first_attempt
    join public.ai_grades g on g.submission_id = first_attempt.id
    join public.ai_grade_evidence e on e.grade_id = g.id
    join public.grading_runs r on r.id = e.grading_run_id
      and r.submission_id = first_attempt.id and r.state = 'completed'
    where first_attempt.id = previous_id and first_attempt.learner_id = actor
      and first_attempt.challenge_id = p_challenge_id and first_attempt.attempt_number = 1
      and not exists (
        select 1 from public.submissions second_attempt
        where second_attempt.learner_id = actor and second_attempt.challenge_id = p_challenge_id
          and second_attempt.attempt_number = 2
      );
    if not found then outcome := 'attempt_limit'; end if;
  end if;

  if outcome is null and source_revision_id is distinct from revision_id then
    outcome := 'version_conflict';
  end if;

  if outcome is null then
    select cardinality(private.domain_code_lines(revision.flawed_code)) into strict line_count
    from public.challenge_revisions as revision where revision.id = source_revision_id;

    for comment in select value from jsonb_array_elements(comments) loop
      if (comment ->> 'line')::integer > line_count then
        outcome := 'invalid';
        invalid_comment_index := comment_index;
        exit;
      end if;
      comment_index := comment_index + 1;
    end loop;

    if outcome is null then
      if previous_id is null and exists (
        select 1 from public.submissions as submission
        where submission.learner_id = actor and submission.challenge_id = p_challenge_id and submission.attempt_number = 1
      ) then
        outcome := 'attempt_limit';
      else
        insert into public.submissions (learner_id, challenge_id, revision_id, attempt_number, previous_submission_id)
        values (actor, p_challenge_id, revision_id, case when previous_id is null then 1 else 2 end, previous_id)
        returning id into new_submission_id;

        insert into public.submission_comments (submission_id, ordinal, line, body)
        select new_submission_id, entry.ordinality - 1, (entry.value ->> 'line')::integer, entry.value ->> 'body'
        from jsonb_array_elements(comments) with ordinality as entry(value, ordinality);

        outcome := 'ok';
      end if;
    end if;
  end if;

  insert into private.submission_create_requests (
    actor_id, challenge_id, idempotency_key, fingerprint, outcome, submission_id, invalid_comment_index
  )
  values (actor, p_challenge_id, p_idempotency_key, request_fingerprint, outcome, new_submission_id, invalid_comment_index);

  if outcome = 'ok' then
    return jsonb_build_object('status', 'ok', 'submission', private.learner_submission_projection(new_submission_id));
  end if;
  if outcome = 'invalid' then
    return jsonb_build_object('status', 'invalid', 'invalidCommentIndex', invalid_comment_index);
  end if;
  return jsonb_build_object('status', outcome);
end;
$$;

create function public.read_learner_retry_eligibility(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source public.submissions;
  published boolean;
  second_id uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select s.* into source from public.submissions s where s.id = p_submission_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if source.learner_id <> actor then return jsonb_build_object('status', 'forbidden'); end if;

  select c.status = 'published' into strict published from public.challenges c where c.id = source.challenge_id;
  select s.id into second_id from public.submissions s
  where s.previous_submission_id = coalesce(source.previous_submission_id, source.id)
    and s.learner_id = actor and s.challenge_id = source.challenge_id and s.attempt_number = 2;

  return jsonb_build_object('status', 'ok', 'published', published, 'secondSubmissionId', second_id);
end;
$$;

create function public.read_learner_submission_hint(p_submission_id uuid, p_hint_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source public.submissions;
  hint public.flaw_hints;
  hint_category public.flaw_category;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select s.* into source from public.submissions s where s.id = p_submission_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if source.learner_id <> actor then return jsonb_build_object('status', 'forbidden'); end if;

  select h.* into hint from public.flaw_hints h where h.id = p_hint_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if hint.revision_id <> source.revision_id then return jsonb_build_object('status', 'forbidden'); end if;

  select eligible.category into hint_category
  from public.ai_grades g
  join public.ai_grade_evidence e on e.grade_id = g.id
  join public.grading_runs r on r.id = e.grading_run_id and r.submission_id = source.id and r.state = 'completed'
  join public.ai_grade_eligible_hints eligible on eligible.grade_id = g.id and eligible.hint_id = hint.id
  join public.ai_grade_assessments a on a.grade_id = g.id and a.flaw_id = hint.flaw_id and a.comment_id is null
  where g.submission_id = source.id;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;

  return jsonb_build_object('status', 'ok',
    'hint', jsonb_build_object('hintId', hint.id, 'category', hint_category, 'text', hint.text));
end;
$$;

revoke all on function public.read_learner_retry_eligibility(uuid),
  public.read_learner_submission_hint(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_learner_retry_eligibility(uuid),
  public.read_learner_submission_hint(uuid, uuid) to authenticated;
