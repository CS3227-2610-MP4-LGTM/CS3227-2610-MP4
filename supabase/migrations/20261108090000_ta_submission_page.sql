-- User-scoped, bounded inspection only. RLS remains active for every source.
create function public.list_ta_submissions(
  p_limit integer default 20, p_learner_id uuid default null,
  p_challenge_id uuid default null, p_grading_state text default null,
  p_before timestamptz default null, p_after_id uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'ta') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or (p_grading_state is not null and p_grading_state not in ('pending','running','failed','completed'))
    or ((p_before is null) <> (p_after_id is null)) then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object('status', 'ok', 'items', coalesce((
    select jsonb_agg(item order by submitted_at desc, id asc) from (
      select s.id, s.submitted_at, jsonb_build_object(
        'id', s.id, 'challengeId', s.challenge_id, 'revisionId', s.revision_id,
        'title', r.title, 'learner', jsonb_build_object('id', p.id, 'displayName', p.display_name),
        'attemptNumber', s.attempt_number, 'submittedAt', s.submitted_at,
        'gradingState', coalesce(run.state, 'pending'),
        'effectiveScore', case when run.state = 'completed' then coalesce(o.score, g.score) else null end,
        'openFlagCount', (select count(*) from public.review_flags f where f.submission_id = s.id
          and not exists (select 1 from public.flag_resolutions x where x.flag_id = f.id))
      ) as item
      from public.submissions s
      join public.profiles p on p.id = s.learner_id
      join public.challenge_revisions r on r.id = s.revision_id
      left join lateral (select state from public.grading_runs where submission_id = s.id order by run_number desc limit 1) run on true
      left join public.ai_grades g on g.submission_id = s.id
      left join lateral (select score from public.grade_overrides where submission_id = s.id order by audit_order desc limit 1) o on true
      where (p_learner_id is null or s.learner_id = p_learner_id)
        and (p_challenge_id is null or s.challenge_id = p_challenge_id)
        and (p_grading_state is null or coalesce(run.state, 'pending') = p_grading_state)
        and (p_before is null or s.submitted_at < p_before or (s.submitted_at = p_before and s.id > p_after_id))
      order by s.submitted_at desc, s.id asc limit p_limit + 1
    ) bounded
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.list_ta_submissions(integer,uuid,uuid,text,timestamptz,uuid) from public, anon, service_role;
grant execute on function public.list_ta_submissions(integer,uuid,uuid,text,timestamptz,uuid) to authenticated;
