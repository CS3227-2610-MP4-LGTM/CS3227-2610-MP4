-- A private, caller-owned card projection; no private answer material leaves it.
create function private.learner_submission_card(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  detail jsonb;
  submission jsonb;
begin
  -- Reuse the canonical read's role/ownership checks, timeout state and grade rules.
  detail := public.read_learner_submission(p_submission_id);
  if detail->>'status' is distinct from 'ok' then raise exception 'SERVICE_UNAVAILABLE'; end if;
  submission := detail->'submission';
  return jsonb_build_object(
    'id', submission->'id', 'challengeId', submission->'challengeId',
    'revisionId', submission->'revisionId', 'title', submission->'challenge'->'title',
    'learner', submission->'learner', 'attemptNumber', submission->'attemptNumber',
    'submittedAt', submission->'submittedAt', 'gradingState', submission->'grading'->'state',
    'effectiveScore', submission->'grading'->'effective'->'score',
    'openFlagCount', (select count(*) from jsonb_array_elements(submission->'flags') f where f->>'status' = 'open')
  );
end;
$$;

create function public.list_learner_submissions(
  p_limit integer default 20, p_challenge_id uuid default null,
  p_before timestamptz default null, p_after_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  items jsonb;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or ((p_before is null) <> (p_after_id is null)) then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- Materialize the limited identities before running any card projections.
  with candidates as materialized (
    select s.id, s.submitted_at from public.submissions s
    where s.learner_id = actor
      and (p_challenge_id is null or s.challenge_id = p_challenge_id)
      and (p_before is null or s.submitted_at < p_before or (s.submitted_at = p_before and s.id > p_after_id))
    order by s.submitted_at desc, s.id asc limit p_limit + 1
  )
  select coalesce(jsonb_agg(private.learner_submission_card(c.id) order by c.submitted_at desc, c.id asc), '[]'::jsonb)
    into items from candidates c;
  return jsonb_build_object('status', 'ok', 'items', items);
end;
$$;
revoke all on function private.learner_submission_card(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_learner_submissions(integer,uuid,timestamptz,uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_learner_submissions(integer,uuid,timestamptz,uuid) to authenticated;
