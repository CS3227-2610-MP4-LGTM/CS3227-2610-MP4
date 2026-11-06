-- Table creation never grants API access implicitly. Every domain migration
-- must grant its intended user/admin operations explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres revoke all on tables from anon, authenticated, service_role;

create or replace function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare obj record;
begin
  for obj in
    select object_identity from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
    execute format('revoke all on table %s from public, anon, authenticated, service_role', obj.object_identity);
  end loop;
end;
$$;

-- ECMAScript String.trim whitespace, matching the Zod validation on the server.
-- PostgreSQL's default btrim only removes U+0020, not tabs/newlines or NBSP.
create function private.normalize_display_name(value text)
returns text
language sql immutable strict
set search_path = ''
as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function private.normalize_display_name(text) from public, anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null check (role in ('learner', 'author', 'ta')),
  unique (id, role)
);

-- A nonrecursive, invoker-readable projection of the stored profile role.
-- Its composite FK prevents a second/divergent role authority. Only the initial
-- provisioning trigger writes it; callers can see only their own role row.
create table private.profile_roles (
  id uuid primary key,
  role text not null,
  foreign key (id, role) references public.profiles(id, role) on delete cascade
);
alter table private.profile_roles enable row level security;
revoke all on table private.profile_roles from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant select on table private.profile_roles to authenticated;
create policy own_profile_role on private.profile_roles for select to authenticated
  using (id = (select auth.uid()));

revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
create policy own_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy ta_learner_profiles on public.profiles for select to authenticated
  using (role = 'learner' and exists (
    select 1 from private.profile_roles as actor
    where actor.id = (select auth.uid()) and actor.role = 'ta'
  ));

create function private.provision_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare display_name text; selected_role text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'display_name') is distinct from 'string'
    or jsonb_typeof(new.raw_user_meta_data -> 'role') is distinct from 'string' then
    raise exception 'Invalid account profile metadata' using errcode = '23514';
  end if;
  display_name := private.normalize_display_name(new.raw_user_meta_data ->> 'display_name');
  selected_role := new.raw_user_meta_data ->> 'role';
  if char_length(display_name) not between 1 and 80
    or selected_role not in ('learner', 'author', 'ta') then
    raise exception 'Invalid account profile metadata' using errcode = '23514';
  end if;
  insert into public.profiles(id, display_name, role) values(new.id, display_name, selected_role);
  insert into private.profile_roles(id, role) values(new.id, selected_role);
  return new;
end;
$$;
revoke all on function private.provision_profile() from public, anon, authenticated, service_role;
create trigger provision_profile after insert on auth.users
  for each row execute function private.provision_profile();
