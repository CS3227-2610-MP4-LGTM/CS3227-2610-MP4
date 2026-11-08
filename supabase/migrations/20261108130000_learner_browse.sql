-- Only the approved category values leave the private answer records.
create function private.learner_revision_categories(p_revision_id uuid)
returns text[]
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct category::text collate "C" order by category::text collate "C"), '{}')
  from public.revision_flaws
  where revision_id = p_revision_id;
$$;

revoke all on function private.learner_revision_categories(uuid) from public, anon, authenticated, service_role;

-- The detail boundary classifies an ID without revealing non-live material.
-- The application reads the returned revision's source through existing RLS.
create function public.read_learner_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  challenge_status text;
  revision_id uuid;
begin
  if private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select challenge.status, challenge.published_revision_id into challenge_status, revision_id
  from public.challenges as challenge where challenge.id = p_challenge_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if challenge_status <> 'published' then
    return jsonb_build_object('status', 'forbidden');
  end if;

  return jsonb_build_object('status', 'ok', 'revisionId', revision_id,
    'categories', private.learner_revision_categories(revision_id));
end;
$$;

revoke all on function public.read_learner_challenge(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_learner_challenge(uuid) to authenticated;

-- Restrict filters and the keyset window before projecting categories for the
-- returned rows. Fetch one extra row to tell the caller whether to continue.
create function public.list_learner_challenges(
  p_limit integer,
  p_language public.challenge_language default null,
  p_difficulty public.challenge_difficulty default null,
  p_category public.flaw_category default null,
  p_before timestamptz default null,
  p_after_id uuid default null
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  items jsonb;
  anchor_revision_id uuid;
begin
  if private.current_domain_role() is distinct from 'learner' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_limit is null or p_limit not between 1 and 50
    or (p_before is null) <> (p_after_id is null) then
    return jsonb_build_object('status', 'invalid');
  end if;

  with live as not materialized (
    select revision.challenge_id, revision.id, revision.title, revision.description,
      revision.language, revision.difficulty, revision.published_at
    from public.challenges as challenge
    join public.challenge_revisions as revision
      on revision.challenge_id = challenge.id and revision.id = challenge.published_revision_id
    where challenge.status = 'published'
      and (p_language is null or revision.language = p_language)
      and (p_difficulty is null or revision.difficulty = p_difficulty)
      and (p_category is null or exists (
        select 1 from public.revision_flaws as flaw
        where flaw.revision_id = revision.id and flaw.category = p_category
      ))
  ), cursor_anchor as (
    select id from live where challenge_id = p_after_id and published_at = p_before
    union all
    select null::uuid where p_before is null
  )
  select (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.challenge_id,
      'revisionId', page.id,
      'title', page.title,
      'description', page.description,
      'language', page.language,
      'difficulty', page.difficulty,
      'publishedAt', page.published_at,
      'categories', private.learner_revision_categories(page.id)
    ) order by page.published_at desc, page.challenge_id), '[]')
    from (
      select * from live
      where p_before is null or published_at < p_before
        or (published_at = p_before and challenge_id > p_after_id)
      order by published_at desc, challenge_id
      limit p_limit + 1
    ) as page
  ), cursor_anchor.id into items, anchor_revision_id
  from cursor_anchor;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The API compares this anchor with the cursor before sending the page.
  if anchor_revision_id is not null then
    return jsonb_build_object('status', 'ok', 'items', items, 'anchorRevisionId', anchor_revision_id);
  end if;
  return jsonb_build_object('status', 'ok', 'items', items);
end;
$$;

revoke all on function public.list_learner_challenges(integer, public.challenge_language, public.challenge_difficulty, public.flaw_category, timestamptz, uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_learner_challenges(integer, public.challenge_language, public.challenge_difficulty, public.flaw_category, timestamptz, uuid) to authenticated;
