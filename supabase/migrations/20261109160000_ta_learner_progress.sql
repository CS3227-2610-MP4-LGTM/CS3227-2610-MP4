-- Persist directory ordering independently of Auth account fields.
alter table public.profiles add column created_at timestamptz not null default now();

-- Keep the ordering timestamp private to the narrow TA directory RPC.
revoke select on table public.profiles from authenticated;
grant select (id, display_name, role) on table public.profiles to authenticated;

create function public.list_ta_learners(
  p_limit integer default 20, p_before timestamptz default null, p_after_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='ta') then
    return jsonb_build_object('status','forbidden');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 or ((p_before is null) <> (p_after_id is null)) then
    return jsonb_build_object('status','invalid');
  end if;
  select jsonb_build_object('status','ok',
    'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'displayName',display_name) order by created_at desc,id asc),'[]'::jsonb),
    'anchors',coalesce(jsonb_agg(jsonb_build_object('createdAt',created_at,'id',id) order by created_at desc,id asc),'[]'::jsonb))
    into result from (
      select id,display_name,created_at from public.profiles where role='learner'
        and (p_before is null or created_at < p_before or (created_at=p_before and id>p_after_id))
      order by created_at desc,id asc limit p_limit+1
    ) bounded;
  return result;
end;
$$;
revoke all on function public.list_ta_learners(integer,timestamptz,uuid) from public,anon,service_role;
grant execute on function public.list_ta_learners(integer,timestamptz,uuid) to authenticated;

create function public.read_ta_learner(p_learner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target public.profiles;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='ta') then
    return jsonb_build_object('status','forbidden');
  end if;
  select * into target from public.profiles where id=p_learner_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if target.role <> 'learner' then return jsonb_build_object('status','forbidden'); end if;
  return jsonb_build_object('status','ok','learner',jsonb_build_object('id',target.id,'displayName',target.display_name));
end;
$$;
revoke all on function public.read_ta_learner(uuid) from public,anon,service_role;
grant execute on function public.read_ta_learner(uuid) to authenticated;
