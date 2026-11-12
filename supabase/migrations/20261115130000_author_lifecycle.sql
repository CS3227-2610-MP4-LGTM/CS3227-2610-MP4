-- T-23 Author lifecycle actions: unpublish and archive. SYS-10.3 has no
-- lifecycle named use, so the only write path is one user-callable function
-- that checks the stored Author role and ownership itself. Authors still have
-- no direct write grant on challenges.

-- Records each checked lifecycle request, successful or failed, so a replayed
-- key returns its recorded outcome instead of being checked again. Keys are
-- scoped to the actor, the challenge and the action; failed operations record
-- failure (INTEGRATION-SPEC §3). A new key may always try again.
create table private.author_lifecycle_requests (
  actor_id uuid not null references public.profiles (id),
  challenge_id uuid not null references public.challenges (id),
  action text not null check (action in ('unpublish', 'archive')),
  idempotency_key uuid not null,
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  result_status text not null
    check (result_status in ('unpublished', 'archived', 'version_conflict', 'invalid_state')),
  result_row_version integer check (result_row_version >= 1),
  created_at timestamptz not null default now(),
  primary key (actor_id, challenge_id, action, idempotency_key),
  -- Successful outcomes carry the new rowVersion; failures carry none.
  check ((result_status in ('unpublished', 'archived')) = (result_row_version is not null))
);

alter table private.author_lifecycle_requests enable row level security;
revoke all on table private.author_lifecycle_requests from public, anon, authenticated, service_role;

-- Allowed transitions: published -> unpublished; draft, published or
-- unpublished -> archived. The published pointer is kept for history, and only
-- rowVersion changes: lifecycle fields are not draft fields (INTEGRATION-SPEC §3).
create function public.change_author_challenge_lifecycle(
  p_challenge_id uuid, p_action text, p_idempotency_key uuid, p_payload jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  request_fingerprint bytea;
  recorded private.author_lifecycle_requests%rowtype;
  challenge public.challenges%rowtype;
  target_status text;
begin
  if actor is null or private.current_domain_role() is distinct from 'author' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  -- Each check runs only after the type checks it depends on.
  if p_challenge_id is null or p_idempotency_key is null or p_action is null
    or p_action not in ('unpublish', 'archive') or jsonb_typeof(p_payload) is distinct from 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (select array_agg(field order by field) from jsonb_object_keys(p_payload) as keys(field)) is distinct from array['expectedRowVersion']
    or jsonb_typeof(p_payload -> 'expectedRowVersion') <> 'number' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (p_payload ->> 'expectedRowVersion') !~ '^[1-9][0-9]{0,9}$'
    or (p_payload ->> 'expectedRowVersion')::bigint > 2147483647 then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not exists (select 1 from public.challenges where id = p_challenge_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not exists (select 1 from public.challenges where id = p_challenge_id and author_id = actor) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  request_fingerprint := sha256(convert_to(p_action || ':' || p_payload::text, 'UTF8'));

  -- A concurrent duplicate is reported as in progress and is safe to replay.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'author-lifecycle:' || actor::text || ':' || p_challenge_id::text || ':' || p_action || ':' || p_idempotency_key::text, 0
  )) then
    return jsonb_build_object('status', 'in_progress');
  end if;

  select request.* into recorded from private.author_lifecycle_requests as request
  where request.actor_id = actor and request.challenge_id = p_challenge_id
    and request.action = p_action and request.idempotency_key = p_idempotency_key;
  if found then
    if recorded.fingerprint <> request_fingerprint then
      return jsonb_build_object('status', 'idempotency_conflict');
    end if;
    if recorded.result_status in ('version_conflict', 'invalid_state') then
      return jsonb_build_object('status', recorded.result_status);
    end if;
    return jsonb_build_object('status', 'ok', 'challenge', jsonb_build_object(
      'id', p_challenge_id, 'status', recorded.result_status, 'rowVersion', recorded.result_row_version));
  end if;

  -- The same row lock that publication, generation and attempt creation take,
  -- so a lifecycle change and a first attempt have one committed order (AUT-06.7).
  select * into challenge from public.challenges where id = p_challenge_id for update;
  if challenge.row_version <> (p_payload ->> 'expectedRowVersion')::integer then
    target_status := 'version_conflict';
  elsif p_action = 'unpublish' and challenge.status = 'published' then
    target_status := 'unpublished';
  elsif p_action = 'archive' and challenge.status in ('draft', 'published', 'unpublished') then
    target_status := 'archived';
  else
    target_status := 'invalid_state';
  end if;

  -- A failed check is recorded, so replaying its key can never apply later,
  -- for example once the row version reaches the one the request expected.
  if target_status in ('version_conflict', 'invalid_state') then
    insert into private.author_lifecycle_requests (
      actor_id, challenge_id, action, idempotency_key, fingerprint, result_status, result_row_version
    ) values (actor, p_challenge_id, p_action, p_idempotency_key, request_fingerprint, target_status, null);
    return jsonb_build_object('status', target_status);
  end if;

  update public.challenges set status = target_status, row_version = row_version + 1, updated_at = now()
  where id = p_challenge_id;
  insert into private.author_lifecycle_requests (
    actor_id, challenge_id, action, idempotency_key, fingerprint, result_status, result_row_version
  ) values (
    actor, p_challenge_id, p_action, p_idempotency_key, request_fingerprint, target_status, challenge.row_version + 1
  );

  return jsonb_build_object('status', 'ok', 'challenge', jsonb_build_object(
    'id', p_challenge_id, 'status', target_status, 'rowVersion', challenge.row_version + 1));
end;
$$;

revoke all on function public.change_author_challenge_lifecycle(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.change_author_challenge_lifecycle(uuid, text, uuid, jsonb) to authenticated;
