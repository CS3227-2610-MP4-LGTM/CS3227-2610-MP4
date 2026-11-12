-- LRN-07: a Learner reports an unmatched comment on their own completed result.
-- Reports reuse public.review_flags (its learner check constraint and the
-- review_flags_report_once index) and are written only through this function.

-- Request ledger, scoped to report creation on submissions the actor owns. A
-- completed entry references the immutable flag or records the definitive
-- rejection, so a replay never reevaluates eligibility.
create table private.learner_report_requests (
  actor_id uuid not null references public.profiles (id),
  submission_id uuid not null references public.submissions (id),
  idempotency_key uuid not null,
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  outcome text not null check (outcome in ('ok', 'not_found', 'ineligible', 'already_reported')),
  flag_id uuid references public.review_flags (id),
  primary key (actor_id, submission_id, idempotency_key),
  check ((outcome = 'ok') = (flag_id is not null))
);

alter table private.learner_report_requests enable row level security;
revoke all on table private.learner_report_requests from public, anon, authenticated, service_role;

create function public.create_learner_report(p_submission_id uuid, p_idempotency_key uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  owner_id uuid;
  report_comment_id uuid;
  report_reason text;
  request_fingerprint bytea;
  recorded private.learner_report_requests%rowtype;
  outcome text;
  new_flag_id uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_submission_id is null or p_idempotency_key is null
    or not private.valid_submission_uuid(p_submission_id::text)
    or not private.valid_submission_uuid(p_idempotency_key::text)
    or jsonb_typeof(p_payload) is distinct from 'object'
    or not p_payload ?& array['commentId', 'reason']
    or p_payload - array['commentId', 'reason'] <> '{}'::jsonb
    or jsonb_typeof(p_payload -> 'commentId') <> 'string'
    or not private.valid_submission_uuid(p_payload ->> 'commentId')
    or jsonb_typeof(p_payload -> 'reason') <> 'string' then
    return jsonb_build_object('status', 'invalid');
  end if;

  report_comment_id := (p_payload ->> 'commentId')::uuid;
  report_reason := private.normalize_display_name(p_payload ->> 'reason');
  if not private.valid_domain_text(report_reason, 2000) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Ownership is checked before any ledger access; records outside it never
  -- reach the ledger and only their existing-vs-absent classification leaves.
  select submission.learner_id into owner_id from public.submissions as submission
  where submission.id = p_submission_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if owner_id <> actor then
    return jsonb_build_object('status', 'forbidden');
  end if;

  -- Canonical payload: lowercase comment UUID and trimmed reason.
  request_fingerprint := sha256(convert_to(
    jsonb_build_object('commentId', report_comment_id::text, 'reason', report_reason)::text, 'UTF8'));

  -- A duplicate in progress can be checked again without waiting.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'learner-report:' || actor::text || ':' || p_submission_id::text || ':' || p_idempotency_key::text, 0
  )) then
    return jsonb_build_object('status', 'in_progress');
  end if;

  select request.* into recorded from private.learner_report_requests as request
  where request.actor_id = actor and request.submission_id = p_submission_id
    and request.idempotency_key = p_idempotency_key;
  if found then
    if recorded.fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    if recorded.outcome = 'ok' then
      return jsonb_build_object('status', 'ok', 'flag', private.ta_flag_view(recorded.flag_id));
    end if;
    return jsonb_build_object('status', recorded.outcome);
  end if;

  -- Distinct keys for one (submission, comment) pair serialize here, so the
  -- later request observes the committed flag instead of the unique index.
  perform pg_advisory_xact_lock(hashtextextended(
    'learner-report-pair:' || p_submission_id::text || ':' || report_comment_id::text, 0
  ));

  if not exists (
    select 1 from public.submission_comments as comment
    where comment.submission_id = p_submission_id and comment.id = report_comment_id
  ) then
    outcome := 'not_found';
  elsif not exists (
    -- Eligible only when the completed original grade lists the comment as
    -- unmatched. Publication state is irrelevant (historical results qualify).
    select 1 from public.ai_grades as grade
    join public.ai_grade_comment_results as result on result.grade_id = grade.id
    where grade.submission_id = p_submission_id and result.comment_id = report_comment_id and result.kind = 'unmatched'
  ) then
    outcome := 'ineligible';
  elsif exists (
    select 1 from public.review_flags as flag
    where flag.submission_id = p_submission_id and flag.comment_id = report_comment_id and flag.source = 'learner'
  ) then
    outcome := 'already_reported';
  else
    insert into public.review_flags (submission_id, source, kind, comment_id, reason)
    values (p_submission_id, 'learner', 'learner_report', report_comment_id, report_reason)
    returning id into new_flag_id;
    outcome := 'ok';
  end if;

  insert into private.learner_report_requests (actor_id, submission_id, idempotency_key, fingerprint, outcome, flag_id)
  values (actor, p_submission_id, p_idempotency_key, request_fingerprint, outcome, new_flag_id);

  if outcome = 'ok' then
    return jsonb_build_object('status', 'ok', 'flag', private.ta_flag_view(new_flag_id));
  end if;
  return jsonb_build_object('status', outcome);
end;
$$;

revoke all on function public.create_learner_report(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_learner_report(uuid, uuid, jsonb) to authenticated;
