-- Submission grading is a service-only mutation surface. The private key
-- ledger records either a started run or the outcome observed without a run.
create table private.learner_grading_requests (
  submission_id uuid not null references public.submissions (id),
  idempotency_key uuid not null,
  intent text not null check (intent in ('initial', 'retry')),
  grading_run_id uuid unique references public.grading_runs (id),
  outcome jsonb,
  check (grading_run_id is not null or outcome is not null),
  primary key (submission_id, idempotency_key)
);

alter table private.learner_grading_requests enable row level security;
revoke all on table private.learner_grading_requests from public, anon, authenticated, service_role;

create or replace function private.protect_grading_run_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.submission_id, new.run_number, new.created_at)
    is distinct from (old.id, old.submission_id, old.run_number, old.created_at) then
    raise exception 'Grading run provenance is immutable' using errcode = '23514';
  end if;
  if old.state in ('failed', 'completed') and (new.state, new.finished_at, new.failure_code)
    is distinct from (old.state, old.finished_at, old.failure_code) then
    raise exception 'Terminal grading runs are immutable' using errcode = '23514';
  end if;
  if old.state = 'pending' and new.state is distinct from old.state then
    raise exception 'Stored pending grading runs cannot transition' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.lock_learner_grading_submission(p_account_id uuid, p_submission_id uuid)
returns public.submissions language plpgsql set search_path = '' as $$
declare
  submission public.submissions;
begin
  select s.* into submission from public.submissions s
  join public.profiles p on p.id = s.learner_id and p.role = 'learner'
  where s.id = p_submission_id and s.learner_id = p_account_id
  for update of s;
  if not found then raise exception 'FORBIDDEN'; end if;
  return submission;
end;
$$;

create function public.start_learner_grading(
  p_account_id uuid, p_submission_id uuid, p_idempotency_key uuid, p_intent text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  recorded private.learner_grading_requests;
  latest public.grading_runs;
  grading jsonb;
  outcome jsonb;
  at_time timestamptz;
  next_id uuid;
begin
  perform private.lock_learner_grading_submission(p_account_id, p_submission_id);
  if p_idempotency_key is null or p_intent is null or p_intent not in ('initial', 'retry') then
    raise exception 'VALIDATION_ERROR';
  end if;
  select k.* into recorded from private.learner_grading_requests k
  where k.submission_id = p_submission_id and k.idempotency_key = p_idempotency_key;

  at_time := clock_timestamp();
  if found then
    if recorded.intent <> p_intent then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    if recorded.outcome is not null then
      return recorded.outcome;
    end if;
    select r.* into latest from public.grading_runs r where r.id = recorded.grading_run_id;
    if latest.state = 'failed' then
      return jsonb_build_object('status', 'failed', 'failureCode', coalesce(latest.failure_code, 'SERVICE_UNAVAILABLE'));
    elsif latest.state = 'running' and latest.created_at + interval '60 seconds' <= at_time then
      return jsonb_build_object('status', 'failed', 'failureCode', 'AI_TIMEOUT');
    end if;
    return jsonb_build_object('status', 'invalid_state');
  end if;

  grading := private.ta_grading_view(p_submission_id);
  select r.* into latest from public.grading_runs r where r.submission_id = p_submission_id
  order by r.run_number desc limit 1;
  if grading is not null then
    outcome := jsonb_build_object('status', 'completed', 'grading', grading);
  elsif latest.id is null and p_intent = 'retry' then
    outcome := jsonb_build_object('status', 'pending');
  elsif latest.state in ('pending', 'completed')
    or exists (select 1 from public.ai_grades g where g.submission_id = p_submission_id)
    or (p_intent = 'retry' and latest.state = 'failed' and latest.failure_code = 'PAYLOAD_TOO_LARGE')
    or (latest.state = 'running' and latest.created_at + interval '60 seconds' > at_time) then
    outcome := jsonb_build_object('status', 'invalid_state');
  elsif p_intent = 'initial' and latest.state = 'failed' then
    outcome := jsonb_build_object('status', 'failed', 'failureCode', coalesce(latest.failure_code, 'SERVICE_UNAVAILABLE'));
  elsif p_intent = 'initial' and latest.state = 'running' then
    outcome := jsonb_build_object('status', 'failed', 'failureCode', 'AI_TIMEOUT');
  end if;

  if outcome is not null then
    insert into private.learner_grading_requests (submission_id, idempotency_key, intent, outcome)
    values (p_submission_id, p_idempotency_key, p_intent, outcome);
    return outcome;
  end if;

  if latest.state = 'running' then
    update public.grading_runs set state = 'failed', failure_code = 'AI_TIMEOUT', finished_at = at_time
    where id = latest.id and state = 'running';
    if not found then raise exception 'INVALID_STATE'; end if;
  end if;

  insert into public.grading_runs (submission_id, state, run_number, created_at)
  values (p_submission_id, 'running', coalesce(latest.run_number, 0) + 1, at_time)
  returning id into next_id;
  insert into private.learner_grading_requests (submission_id, idempotency_key, intent, grading_run_id)
  values (p_submission_id, p_idempotency_key, p_intent, next_id);
  return jsonb_build_object('status', 'started', 'gradingRunId', next_id);
end;
$$;

-- Read the pinned private context only for the exact unexpired run. A stable
-- function checks authorization, eligibility and flaws in the same snapshot.
create function public.llm_grading_context(account_id uuid, submission_id uuid, grading_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  submission public.submissions;
  context jsonb;
begin
  select s.* into submission from public.submissions s
  join public.profiles p on p.id = s.learner_id and p.role = 'learner'
  where s.id = llm_grading_context.submission_id and s.learner_id = account_id;
  if not found then raise exception 'FORBIDDEN'; end if;

  if exists (select 1 from public.ai_grades g where g.submission_id = submission.id)
    or not exists (
      select 1 from public.grading_runs r
      where r.id = grading_run_id and r.submission_id = submission.id and r.state = 'running'
        and r.created_at + interval '60 seconds' > statement_timestamp()
    ) then
    raise exception 'INVALID_STATE';
  end if;

  select jsonb_build_object('revisionId', submission.revision_id, 'flaws', coalesce(jsonb_agg(
    jsonb_build_object('id', f.id, 'revision_id', f.revision_id, 'category', f.category,
      'start_line', f.start_line, 'end_line', f.end_line,
      'source_start_line', f.source_start_line, 'source_end_line', f.source_end_line,
      'original_snippet', f.original_snippet, 'replacement_snippet', f.replacement_snippet,
      'explanation', f.explanation, 'fix', f.fix)
    order by f.start_line, f.id), '[]'::jsonb))
  into context from public.revision_flaws f where f.revision_id = submission.revision_id;
  return context;
end;
$$;

-- Preserve the existing signature and ACL while rejecting calls without a run.
create or replace function public.llm_grading_context(account_id uuid, submission_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.llm_grading_context(account_id, submission_id, null::uuid)
$$;

revoke all on function public.llm_grading_context(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.llm_grading_context(uuid, uuid, uuid) to service_role;

create function public.fail_learner_grading(
  p_account_id uuid, p_submission_id uuid, p_grading_run_id uuid, p_failure_code text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  at_time timestamptz;
  recorded_code text;
begin
  perform private.lock_learner_grading_submission(p_account_id, p_submission_id);
  if p_failure_code is null or p_failure_code not in
    ('RATE_LIMITED', 'PAYLOAD_TOO_LARGE', 'INVALID_AI_OUTPUT', 'AI_UNAVAILABLE', 'AI_TIMEOUT', 'SERVICE_UNAVAILABLE') then
    raise exception 'VALIDATION_ERROR';
  end if;
  if exists (select 1 from public.ai_grades g where g.submission_id = p_submission_id) then
    raise exception 'INVALID_STATE';
  end if;
  at_time := clock_timestamp();
  update public.grading_runs
  set state = 'failed', finished_at = at_time,
    failure_code = case when created_at + interval '60 seconds' <= at_time then 'AI_TIMEOUT' else p_failure_code end
  where id = p_grading_run_id and submission_id = p_submission_id and state = 'running'
  returning failure_code into recorded_code;
  if not found then raise exception 'INVALID_STATE'; end if;
  return jsonb_build_object('failureCode', recorded_code);
end;
$$;

create function public.complete_learner_grading(
  p_account_id uuid, p_submission_id uuid, p_grading_run_id uuid, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  submission public.submissions;
  original jsonb := p_payload->'original';
  matching jsonb := p_payload->'matching';
  new_grade_id uuid;
  at_time timestamptz;
  written integer;
  completed_outcome jsonb;
begin
  submission := private.lock_learner_grading_submission(p_account_id, p_submission_id);
  if exists (select 1 from public.ai_grades g where g.submission_id = p_submission_id) then
    raise exception 'INVALID_STATE';
  end if;
  at_time := clock_timestamp();
  update public.grading_runs set state = 'completed', finished_at = at_time
  where id = p_grading_run_id and submission_id = p_submission_id and state = 'running'
    and created_at + interval '60 seconds' > at_time;
  if not found then raise exception 'INVALID_STATE'; end if;

  insert into public.ai_grades (submission_id, score, passed, identification_points, explanation_points, fix_points)
  values (p_submission_id, (original->>'score')::integer, (original->>'passed')::boolean,
    (original->>'identificationPoints')::numeric, (original->>'explanationPoints')::numeric, (original->>'fixPoints')::numeric)
  returning id into new_grade_id;

  insert into public.ai_grade_evidence (grade_id, grading_run_id, provider_output_retried, created_at)
  values (new_grade_id, p_grading_run_id, (p_payload->>'providerOutputRetried')::boolean, at_time);

  insert into public.ai_grade_comment_results (grade_id, comment_id, kind, explanation_credit, fix_credit, feedback)
  select new_grade_id, c."commentId",
    case when c.matched then 'matched'
         when matching->'duplicateCommentIds' ? c."commentId"::text then 'duplicate'
         when matching->'unmatchedCommentIds' ? c."commentId"::text then 'unmatched' end,
    c."explanationCredit", c."fixCredit", c.feedback
  from jsonb_to_recordset(original->'comments') as c(
    "commentId" uuid, matched boolean, "explanationCredit" numeric, "fixCredit" numeric, feedback text
  );
  get diagnostics written = row_count;
  if written <> (select count(*) from public.submission_comments c where c.submission_id = p_submission_id) then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.ai_grade_assessments (grade_id, flaw_id, comment_id, distance)
  select new_grade_id, a."flawId", a."commentId", m.distance
  from jsonb_to_recordset(p_payload->'assessments') as a("flawId" uuid, "commentId" uuid)
  left join jsonb_to_recordset(matching->'matches') as m("flawId" uuid, "commentId" uuid, distance integer)
    on m."flawId" = a."flawId" and m."commentId" = a."commentId";
  get diagnostics written = row_count;
  if written <> (select count(*) from public.revision_flaws f where f.revision_id = submission.revision_id)
    or jsonb_array_length(matching->'matches') is distinct from (original->>'matchedCount')::integer then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.ai_grade_eligible_hints (grade_id, hint_id, category, ordinal)
  select new_grade_id, h.id, f.category, row_number() over (order by f.start_line, f.id) - 1
  from public.ai_grade_assessments a
  join public.revision_flaws f on f.id = a.flaw_id
  join public.flaw_hints h on h.flaw_id = a.flaw_id
  where a.grade_id = new_grade_id and a.comment_id is null;

  insert into public.review_flags (submission_id, source, kind, created_at)
  select p_submission_id, 'rule', f.kind, at_time
  from jsonb_array_elements_text(p_payload->'ruleFlags') as f(kind);

  -- Freeze the learner-safe projection before a later moderation can change it.
  completed_outcome := jsonb_build_object('status', 'completed', 'grading', private.ta_grading_view(p_submission_id));
  update private.learner_grading_requests k set outcome = completed_outcome
  where k.submission_id = p_submission_id and k.grading_run_id = p_grading_run_id;
  return completed_outcome;
end;
$$;

create or replace function public.read_learner_submission(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owner_id uuid;
  latest public.grading_runs;
  grading jsonb;
  flags jsonb;
  state text;
  failure text;
begin
  if actor is null or private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select s.learner_id into owner_id from public.submissions s where s.id = p_submission_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if owner_id <> actor then return jsonb_build_object('status', 'forbidden'); end if;

  -- The shared completed-grade projection contains only learner-permitted
  -- evidence. It omits private flaw IDs, locations and matching pairs.
  grading := private.ta_grading_view(p_submission_id);
  if grading is null then
    select r.* into latest from public.grading_runs r where r.submission_id = p_submission_id
    order by r.run_number desc limit 1;
    if not found then
      state := 'pending';
    elsif latest.state = 'running' and latest.created_at + interval '60 seconds' <= statement_timestamp() then
      state := 'failed';
      failure := 'AI_TIMEOUT';
    elsif latest.state = 'failed' then
      state := 'failed';
      failure := coalesce(latest.failure_code, 'SERVICE_UNAVAILABLE');
    elsif latest.state = 'completed' then
      -- A historical run without its grade is an inconsistent read.
      raise exception 'SERVICE_UNAVAILABLE';
    else
      state := 'running';
    end if;
    grading := jsonb_build_object(
      'state', state, 'failureCode', failure, 'original', null, 'effective', null, 'overrides', '[]'::jsonb
    );
  end if;
  select coalesce(jsonb_agg(private.ta_flag_view(f.id) order by f.created_at, f.id), '[]'::jsonb) into flags
  from public.review_flags f where f.submission_id = p_submission_id;
  return jsonb_build_object('status', 'ok',
    'submission', private.learner_submission_projection(p_submission_id) || jsonb_build_object('grading', grading, 'flags', flags));
end;
$$;

revoke all on function private.lock_learner_grading_submission(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.start_learner_grading(uuid, uuid, uuid, text),
  public.complete_learner_grading(uuid, uuid, uuid, jsonb),
  public.fail_learner_grading(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.start_learner_grading(uuid, uuid, uuid, text),
  public.complete_learner_grading(uuid, uuid, uuid, jsonb),
  public.fail_learner_grading(uuid, uuid, uuid, text) to service_role;
