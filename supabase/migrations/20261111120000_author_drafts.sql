-- T-20 Author draft writes. Authors still have no direct table write grants:
-- the two user-callable functions below are the only write paths, and reads
-- stay on the existing owner RLS policies.

-- This ledger is scoped to Author challenge creation. A row exists only for a
-- committed creation and pins the challenge that a replayed key returns.
create table private.author_challenge_create_requests (
  actor_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  challenge_id uuid not null references public.challenges (id),
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

alter table private.author_challenge_create_requests enable row level security;
revoke all on table private.author_challenge_create_requests from public, anon, authenticated, service_role;

-- Validates a complete draft object using the HTTP field names. Each check runs
-- only after the type checks it depends on, because SQL does not guarantee the
-- evaluation order of AND operands.
create function private.valid_author_draft_fields(fields jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  names constant text[] := array['title', 'description', 'language', 'difficulty', 'workingCode', 'flawCount', 'categories'];
begin
  if fields is null or jsonb_typeof(fields) <> 'object' then
    return false;
  end if;
  if not fields ?& names or fields - names <> '{}'::jsonb then
    return false;
  end if;
  if jsonb_typeof(fields -> 'title') <> 'string' or jsonb_typeof(fields -> 'description') <> 'string'
    or jsonb_typeof(fields -> 'language') <> 'string' or jsonb_typeof(fields -> 'difficulty') <> 'string'
    or jsonb_typeof(fields -> 'workingCode') <> 'string' or jsonb_typeof(fields -> 'flawCount') <> 'number'
    or jsonb_typeof(fields -> 'categories') <> 'array' then
    return false;
  end if;
  if not coalesce(private.valid_domain_text(fields ->> 'title', 120), false)
    or not coalesce(private.valid_domain_text(fields ->> 'description', 4000), false)
    or not coalesce(private.valid_domain_code(fields ->> 'workingCode'), false)
    or fields ->> 'language' not in ('python', 'java', 'javascript', 'typescript')
    or fields ->> 'difficulty' not in ('easy', 'medium', 'hard')
    or fields ->> 'flawCount' not in ('1', '2', '3', '4', '5') then
    return false;
  end if;
  if jsonb_array_length(fields -> 'categories') not between 1 and 5 then
    return false;
  end if;
  return (
    select count(distinct category.value) = jsonb_array_length(fields -> 'categories')
    from jsonb_array_elements(fields -> 'categories') as category(value)
    where jsonb_typeof(category.value) = 'string'
      and category.value #>> '{}' in ('logic_bug', 'edge_case', 'error_handling', 'security', 'performance')
  );
end;
$$;

revoke all on function private.valid_author_draft_fields(jsonb) from public, anon, authenticated, service_role;

create function public.create_author_challenge(p_idempotency_key uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  request_fingerprint bytea;
  recorded private.author_challenge_create_requests%rowtype;
  new_challenge_id uuid;
begin
  if actor is null or private.current_domain_role() is distinct from 'author' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_idempotency_key is null or not private.valid_author_draft_fields(p_payload) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- The fingerprint is derived here from the validated canonical jsonb text;
  -- callers cannot supply it.
  request_fingerprint := sha256(convert_to(p_payload::text, 'UTF8'));

  -- A concurrent duplicate is reported as in progress and is safe to replay.
  -- Only a committed ledger row establishes a prior outcome.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'author-challenge-create:' || actor::text || ':' || p_idempotency_key::text, 0
  )) then
    return jsonb_build_object('status', 'in_progress');
  end if;

  select request.* into recorded from private.author_challenge_create_requests as request
  where request.actor_id = actor and request.idempotency_key = p_idempotency_key;
  if found then
    if recorded.fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    return jsonb_build_object('status', 'ok', 'challengeId', recorded.challenge_id);
  end if;

  insert into public.challenges (author_id) values (actor) returning id into new_challenge_id;
  insert into public.challenge_drafts (
    challenge_id, title, description, language, difficulty, working_code, flaw_count, categories
  ) values (
    new_challenge_id,
    p_payload ->> 'title',
    p_payload ->> 'description',
    (p_payload ->> 'language')::public.challenge_language,
    (p_payload ->> 'difficulty')::public.challenge_difficulty,
    p_payload ->> 'workingCode',
    (p_payload ->> 'flawCount')::integer,
    array(select category::public.flaw_category from jsonb_array_elements_text(p_payload -> 'categories') as categories(category))
  );
  insert into private.author_challenge_create_requests (actor_id, idempotency_key, fingerprint, challenge_id)
  values (actor, p_idempotency_key, request_fingerprint, new_challenge_id);

  return jsonb_build_object('status', 'ok', 'challengeId', new_challenge_id);
end;
$$;

create function public.update_author_draft(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  names constant text[] := array['title', 'description', 'language', 'difficulty', 'workingCode', 'flawCount', 'categories'];
  versions constant text[] := array['expectedRowVersion', 'expectedDraftVersion'];
  current_author uuid;
  current_status text;
  current_row_version integer;
  current_draft record;
  merged jsonb;
begin
  if actor is null or private.current_domain_role() is distinct from 'author' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if p_challenge_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not p_payload ?& versions
    or p_payload - names - versions <> '{}'::jsonb
    or p_payload - versions = '{}'::jsonb
    or jsonb_typeof(p_payload -> 'expectedRowVersion') <> 'number'
    or jsonb_typeof(p_payload -> 'expectedDraftVersion') <> 'number'
    or (p_payload ->> 'expectedRowVersion') !~ '^[1-9][0-9]{0,9}$'
    or (p_payload ->> 'expectedDraftVersion') !~ '^[1-9][0-9]{0,9}$'
    -- Match the HTTP bound (int4 max); compare as bigint so the cast cannot overflow.
    or (p_payload ->> 'expectedRowVersion')::bigint > 2147483647
    or (p_payload ->> 'expectedDraftVersion')::bigint > 2147483647 then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Edits, publication and lifecycle changes serialize on the challenge row.
  select challenge.author_id, challenge.status, challenge.row_version
  into current_author, current_status, current_row_version
  from public.challenges as challenge where challenge.id = p_challenge_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if current_author <> actor then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if current_status = 'archived' then
    return jsonb_build_object('status', 'invalid_state');
  end if;

  select draft.* into current_draft from public.challenge_drafts as draft where draft.challenge_id = p_challenge_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if current_row_version <> (p_payload ->> 'expectedRowVersion')::integer
    or current_draft.draft_version <> (p_payload ->> 'expectedDraftVersion')::integer then
    return jsonb_build_object('status', 'version_conflict');
  end if;

  merged := jsonb_build_object(
    'title', current_draft.title,
    'description', current_draft.description,
    'language', current_draft.language::text,
    'difficulty', current_draft.difficulty::text,
    'workingCode', current_draft.working_code,
    'flawCount', current_draft.flaw_count,
    'categories', to_jsonb(current_draft.categories::text[])
  ) || (p_payload - versions);
  if not private.valid_author_draft_fields(merged) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Every accepted edit invalidates the active proposal set. Historical sets,
  -- published revisions and the published pointer are left untouched.
  update public.challenge_drafts set
    title = merged ->> 'title',
    description = merged ->> 'description',
    language = (merged ->> 'language')::public.challenge_language,
    difficulty = (merged ->> 'difficulty')::public.challenge_difficulty,
    working_code = merged ->> 'workingCode',
    flaw_count = (merged ->> 'flawCount')::integer,
    categories = array(select category::public.flaw_category from jsonb_array_elements_text(merged -> 'categories') as categories(category)),
    generation_id = null,
    draft_version = draft_version + 1
  where challenge_id = p_challenge_id;
  update public.challenges set row_version = row_version + 1, updated_at = now() where id = p_challenge_id;

  return jsonb_build_object('status', 'ok', 'challengeId', p_challenge_id);
end;
$$;

revoke all on function public.create_author_challenge(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_author_draft(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_author_challenge(uuid, jsonb) to authenticated;
grant execute on function public.update_author_draft(uuid, jsonb) to authenticated;
