-- This ledger is scoped to submission creation. A completed entry references
-- immutable submission data or records the definitive rejection.
create table private.submission_create_requests (
  actor_id uuid not null references public.profiles (id),
  challenge_id uuid not null,
  idempotency_key uuid not null,
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  outcome text not null check (outcome in ('ok', 'not_found', 'lifecycle_unavailable', 'version_conflict', 'attempt_limit', 'invalid')),
  submission_id uuid references public.submissions (id),
  invalid_comment_index integer check (invalid_comment_index between 0 and 49),
  primary key (actor_id, challenge_id, idempotency_key),
  check ((outcome = 'ok') = (submission_id is not null)),
  constraint submission_create_requests_invalid_index_check check ((outcome = 'invalid') = (invalid_comment_index is not null))
);

alter table private.submission_create_requests enable row level security;
revoke all on table private.submission_create_requests from public, anon, authenticated, service_role;

create function private.valid_submission_uuid(value text)
returns boolean
language sql immutable strict
set search_path = ''
as $$
  select value ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
$$;

-- Call only after authorizing ownership, including for recorded success replay.
-- Private flaws contribute only the approved category projection.
create function private.learner_submission_projection(p_submission_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', submission.id, 'challengeId', submission.challenge_id, 'revisionId', submission.revision_id,
    'attemptNumber', submission.attempt_number, 'previousSubmissionId', submission.previous_submission_id,
    'submittedAt', submission.submitted_at,
    'learner', jsonb_build_object('id', learner.id, 'displayName', learner.display_name),
    'challenge', jsonb_build_object(
      'id', submission.challenge_id, 'revisionId', revision.id, 'title', revision.title,
      'description', revision.description, 'language', revision.language, 'difficulty', revision.difficulty,
      'categories', private.learner_revision_categories(revision.id),
      'publishedAt', revision.published_at, 'source', revision.flawed_code
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', comment.id, 'ordinal', comment.ordinal, 'line', comment.line, 'body', comment.body
      ) order by comment.ordinal)
      from public.submission_comments as comment
      where comment.submission_id = submission.id
    ), '[]'::jsonb)
  )
  from public.submissions as submission
  join public.profiles as learner on learner.id = submission.learner_id
  join public.challenge_revisions as revision on revision.id = submission.revision_id
  where submission.id = p_submission_id;
$$;

create function public.create_learner_submission(p_challenge_id uuid, p_idempotency_key uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  revision_id uuid;
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
    or p_payload - array['revisionId', 'comments'] <> '{}'::jsonb
    or jsonb_typeof(p_payload -> 'revisionId') <> 'string'
    or not private.valid_submission_uuid(p_payload ->> 'revisionId')
    or jsonb_typeof(p_payload -> 'comments') <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if jsonb_array_length(p_payload -> 'comments') > 50 then
    return jsonb_build_object('status', 'invalid');
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

  request_fingerprint := sha256(convert_to(jsonb_build_object('revisionId', revision_id, 'comments', comments)::text, 'UTF8'));

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
  elsif live_revision_id is distinct from revision_id then
    outcome := 'version_conflict';
  else
    select cardinality(private.domain_code_lines(revision.flawed_code)) into strict line_count
    from public.challenge_revisions as revision where revision.id = live_revision_id;

    for comment in select value from jsonb_array_elements(comments) loop
      if (comment ->> 'line')::integer > line_count then
        outcome := 'invalid';
        invalid_comment_index := comment_index;
        exit;
      end if;
      comment_index := comment_index + 1;
    end loop;

    if outcome is null then
      if exists (
        select 1 from public.submissions as submission
        where submission.learner_id = actor and submission.challenge_id = p_challenge_id and submission.attempt_number = 1
      ) then
        outcome := 'attempt_limit';
      else
        insert into public.submissions (learner_id, challenge_id, revision_id, attempt_number)
        values (actor, p_challenge_id, revision_id, 1)
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

-- Outside the owner boundary, only the existing-vs-absent classification
-- leaves the database. No historical challenge data crosses that boundary.
create function public.read_learner_submission(p_submission_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  owner_id uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select submission.learner_id into owner_id from public.submissions as submission
  where submission.id = p_submission_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if owner_id <> actor then
    return jsonb_build_object('status', 'forbidden');
  end if;
  return jsonb_build_object('status', 'ok', 'submission', private.learner_submission_projection(p_submission_id));
end;
$$;

revoke all on function private.valid_submission_uuid(text) from public, anon, authenticated, service_role;
revoke all on function private.learner_submission_projection(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_learner_submission(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.read_learner_submission(uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_learner_submission(uuid, uuid, jsonb) to authenticated;
grant execute on function public.read_learner_submission(uuid) to authenticated;
