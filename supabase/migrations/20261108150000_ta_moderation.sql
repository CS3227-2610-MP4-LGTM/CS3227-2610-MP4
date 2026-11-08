-- Human moderation is available only through these constrained, user-scoped paths.
-- Keys cascade with fixture/resource identities and are never exposed via the API.
create table private.ta_moderation_keys (
 actor_id uuid not null references public.profiles(id) on delete cascade,
 submission_id uuid not null references public.submissions(id) on delete cascade,
 operation text not null check(operation in ('override','resolution')),
 resource_id uuid not null,
 key uuid not null,
 payload jsonb not null,
 result jsonb not null,
 primary key(actor_id, operation, resource_id, key)
);
alter table private.ta_moderation_keys enable row level security;
revoke all on private.ta_moderation_keys from public, anon, authenticated, service_role;

create function private.ta_flag_view(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('id',f.id,'submissionId',f.submission_id,'source',f.source,
 'kind',f.kind,'commentId',f.comment_id,'reason',f.reason,'createdAt',f.created_at,
 'status',case when exists(select 1 from public.flag_resolutions r where r.flag_id=f.id) then 'resolved' else 'open' end,
 'resolutions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'actorId',r.actor_id,
 'createdAt',r.created_at,'auditOrder',r.audit_order,'disposition',r.disposition,'reason',r.reason) order by r.audit_order)
 from public.flag_resolutions r where r.flag_id=f.id),'[]'::jsonb)) from public.review_flags f where f.id=p_id;
$$;

-- This projection includes only learner-permitted grade evidence, never private keys.
create function private.ta_grading_view(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
 select jsonb_build_object('state',run.state,'failureCode',run.failure_code,
 'original',jsonb_build_object('score',g.score,'passed',g.passed,'passMark',60,
 'identificationPoints',g.identification_points,'explanationPoints',g.explanation_points,'fixPoints',g.fix_points,
 'matchedCount',(select count(*) from public.ai_grade_assessments a where a.grade_id=g.id and a.comment_id is not null),
 'missedCount',(select count(*) from public.ai_grade_assessments a where a.grade_id=g.id and a.comment_id is null),
 'unmatchedCommentIds',coalesce((select jsonb_agg(c.id order by c.ordinal) from public.submission_comments c join public.ai_grade_comment_results r on r.comment_id=c.id where r.grade_id=g.id and r.kind='unmatched'),'[]'::jsonb),
 'duplicateCommentIds',coalesce((select jsonb_agg(c.id order by c.ordinal) from public.submission_comments c join public.ai_grade_comment_results r on r.comment_id=c.id where r.grade_id=g.id and r.kind='duplicate'),'[]'::jsonb),
 'comments',coalesce((select jsonb_agg(jsonb_build_object('commentId',c.id,'matched',r.kind='matched','explanationCredit',r.explanation_credit,'fixCredit',r.fix_credit,'feedback',r.feedback) order by c.ordinal) from public.submission_comments c join public.ai_grade_comment_results r on r.comment_id=c.id where r.grade_id=g.id),'[]'::jsonb),
 'eligibleHints',coalesce((select jsonb_agg(jsonb_build_object('hintId',h.hint_id,'category',h.category) order by h.ordinal) from public.ai_grade_eligible_hints h where h.grade_id=g.id),'[]'::jsonb)),
 'effective',jsonb_build_object('score',coalesce(latest.score,g.score),'passed',coalesce(latest.score,g.score)>=60,'source',case when latest.id is null then 'ai' else 'ta' end),
 'overrides',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'actorId',o.actor_id,'createdAt',o.created_at,'auditOrder',o.audit_order,'score',o.score,'reason',o.reason) order by o.audit_order) from public.grade_overrides o where o.submission_id=p_id),'[]'::jsonb))
 from public.ai_grades g
 join lateral (select state,failure_code from public.grading_runs where submission_id=p_id order by run_number desc limit 1) run on true
 left join lateral (select id,score from public.grade_overrides where submission_id=p_id order by audit_order desc limit 1) latest on true
 where g.submission_id=p_id and run.state='completed';
$$;

create function private.append_ta_moderation(p_operation text,p_id uuid,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor uuid := auth.uid(); sid uuid; canonical jsonb; saved private.ta_moderation_keys%rowtype;
 next_order bigint; new_id uuid; result jsonb; reason text; replacement numeric;
begin
 if p_operation not in ('override','resolution') or actor is null or not exists(select 1 from public.profiles where id=actor and role='ta') then
  return jsonb_build_object('status','forbidden');
 end if;
 if p_id is null or p_key is null or jsonb_typeof(p_payload) is distinct from 'object'
  or jsonb_typeof(p_payload->'reason') is distinct from 'string'
  or (select count(*) from jsonb_object_keys(p_payload)) <> 2 then
  return jsonb_build_object('status','invalid');
 end if;
 -- ECMAScript trim whitespace; length(text) counts Unicode code points.
 reason := btrim(p_payload->>'reason', E' \t\n\r\f' || chr(11) || chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
 if char_length(reason) not between 1 and 2000 then return jsonb_build_object('status','invalid'); end if;
 if p_operation='override' then
  if not(p_payload ? 'score') or jsonb_typeof(p_payload->'score') is distinct from 'number' then return jsonb_build_object('status','invalid'); end if;
  replacement := (p_payload->>'score')::numeric;
  if replacement < 0 or replacement > 100 or trunc(replacement) <> replacement then return jsonb_build_object('status','invalid'); end if;
  canonical := jsonb_build_object('score',replacement::integer,'reason',reason);
  sid := p_id;
 else
  if not(p_payload ? 'disposition') or jsonb_typeof(p_payload->'disposition') is distinct from 'string'
   or p_payload->>'disposition' not in ('upheld','dismissed') then return jsonb_build_object('status','invalid'); end if;
  canonical := jsonb_build_object('disposition',p_payload->>'disposition','reason',reason);
  select submission_id into sid from public.review_flags where id=p_id;
 end if;
 -- Lock the same parent for both operations; it survives historical publication changes.
 perform 1 from public.submissions where id=sid for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into saved from private.ta_moderation_keys where actor_id=actor and operation=p_operation and resource_id=p_id and key=p_key;
 if found then
  if saved.payload <> canonical then return jsonb_build_object('status','idempotency_conflict'); end if;
  return saved.result;
 end if;
 if p_operation='override' and private.ta_grading_view(sid) is null then
  -- A validated, authorized decision has a stable outcome even if grading later
  -- completes. The caller must start an explicit new action with a new key.
  result := jsonb_build_object('status','invalid_state');
  insert into private.ta_moderation_keys values(actor,sid,p_operation,p_id,p_key,canonical,result);
  return result;
 end if;
 select coalesce(max(audit_order),0)+1 into next_order from private.submission_audit_orders where submission_id=sid;
 if p_operation='override' then
  insert into public.grade_overrides(submission_id,actor_id,created_at,audit_order,score,reason)
  values(sid,actor,clock_timestamp(),next_order,replacement::integer,reason) returning id into new_id;
  result := jsonb_build_object('status','ok','override',(select value from jsonb_array_elements(private.ta_grading_view(sid)->'overrides') where value->>'id'=new_id::text),'grading',private.ta_grading_view(sid));
 else
  insert into public.flag_resolutions(flag_id,actor_id,created_at,audit_order,disposition,reason)
  values(p_id,actor,clock_timestamp(),next_order,canonical->>'disposition',reason);
  result := jsonb_build_object('status','ok','flag',private.ta_flag_view(p_id));
 end if;
 insert into private.ta_moderation_keys values(actor,sid,p_operation,p_id,p_key,canonical,result);
 return result;
end;
$$;
create function public.append_ta_override(p_id uuid,p_payload jsonb,p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$ select private.append_ta_moderation('override',p_id,p_payload,p_key); $$;
create function public.append_ta_resolution(p_id uuid,p_payload jsonb,p_key uuid) returns jsonb
language sql security definer set search_path = '' as $$ select private.append_ta_moderation('resolution',p_id,p_payload,p_key); $$;

create function public.list_ta_flags(p_limit integer default 20,p_status text default 'open',p_kind text default null,p_before timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='ta') then return jsonb_build_object('status','forbidden'); end if;
 if p_limit is null or p_limit not between 1 and 50 or p_status is null or p_status not in ('open','resolved')
 or (p_kind is not null and p_kind not in ('near_pass_mark','grading_output_retried','assessment_disagreement','learner_report'))
 or ((p_before is null) <> (p_after_id is null)) then return jsonb_build_object('status','invalid'); end if;
 return jsonb_build_object('status','ok','items',coalesce((select jsonb_agg(item order by created_at desc,id) from (
 select f.id,f.created_at,private.ta_flag_view(f.id) item from public.review_flags f
 where (p_kind is null or f.kind=p_kind)
 and ((p_status='resolved') = exists(select 1 from public.flag_resolutions r where r.flag_id=f.id))
 and (p_before is null or f.created_at<p_before or (f.created_at=p_before and f.id>p_after_id))
 order by f.created_at desc,f.id limit p_limit+1) bounded),'[]'::jsonb));
end;
$$;
revoke all on function private.ta_flag_view(uuid), private.ta_grading_view(uuid), private.append_ta_moderation(text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.append_ta_override(uuid,jsonb,uuid),public.append_ta_resolution(uuid,jsonb,uuid),public.list_ta_flags(integer,text,text,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.append_ta_override(uuid,jsonb,uuid),public.append_ta_resolution(uuid,jsonb,uuid),public.list_ta_flags(integer,text,text,timestamptz,uuid) to authenticated;
