-- Enable row level security on every table created in `public`, mirroring the
-- "Enable automatic RLS" setting of the hosted lgtm-dev and lgtm-prod projects
-- so that a table without policies is unreachable locally too.
-- Idempotent, so it is harmless where the hosted setting already applies.

create schema if not exists private;

create or replace function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where object_type = 'table'
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists enable_rls_on_new_tables;

create event trigger enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_tables();
