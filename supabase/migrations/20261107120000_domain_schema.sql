-- The only API privileges introduced below are explicit SELECT grants.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public, private
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public, private
  revoke all on sequences from public, anon, authenticated, service_role;

create extension if not exists btree_gist with schema extensions;

create type public.challenge_language as enum ('python', 'java', 'javascript', 'typescript');
create type public.challenge_difficulty as enum ('easy', 'medium', 'hard');
create type public.flaw_category as enum ('logic_bug', 'edge_case', 'error_handling', 'security', 'performance');

create function private.valid_domain_text(value text, max_length integer)
returns boolean
language sql immutable strict
set search_path = ''
as $$
  select value = private.normalize_display_name(value)
    and char_length(value) between 1 and max_length;
$$;

create function private.valid_domain_code(value text)
returns boolean
language sql immutable strict
set search_path = ''
as $$
  select octet_length(value) <= 20000
    and strpos(value, E'\r') = 0
    and private.normalize_display_name(value) <> '';
$$;

create function private.domain_code_lines(value text)
returns text[]
language sql immutable strict
set search_path = ''
as $$
  -- Ignore only the terminator, preserving real blank lines.
  select string_to_array(
    case when right(value, 1) = E'\n' then left(value, -1) else value end, E'\n'
  );
$$;

create function private.valid_domain_categories(value public.flaw_category[])
returns boolean
language sql immutable strict
set search_path = ''
as $$
  select array_ndims(value) = 1
    and cardinality(value) between 1 and 5
    and (select count(distinct category) from unnest(value) as categories(category)) = cardinality(value);
$$;

create function private.valid_proposal_snapshot(snapshot jsonb)
returns boolean
language plpgsql immutable strict
set search_path = ''
as $$
declare
  fields constant text[] := array['title', 'description', 'language', 'difficulty', 'workingCode', 'flawCount', 'categories'];
begin
  if jsonb_typeof(snapshot) <> 'object' then
    return false;
  end if;
  if not snapshot ?& fields or snapshot - fields <> '{}'::jsonb then
    return false;
  end if;
  if jsonb_typeof(snapshot -> 'categories') <> 'array' then
    return false;
  end if;
  return jsonb_typeof(snapshot -> 'title') = 'string'
    and private.valid_domain_text(snapshot ->> 'title', 120)
    and jsonb_typeof(snapshot -> 'description') = 'string'
    and private.valid_domain_text(snapshot ->> 'description', 4000)
    and snapshot ->> 'language' in ('python', 'java', 'javascript', 'typescript')
    and snapshot ->> 'difficulty' in ('easy', 'medium', 'hard')
    and jsonb_typeof(snapshot -> 'workingCode') = 'string'
    and private.valid_domain_code(snapshot ->> 'workingCode')
    and jsonb_typeof(snapshot -> 'flawCount') = 'number'
    and snapshot ->> 'flawCount' in ('1', '2', '3', '4', '5')
    and jsonb_array_length(snapshot -> 'categories') between 1 and 5
    and (
      select count(distinct category) = jsonb_array_length(snapshot -> 'categories')
      from jsonb_array_elements_text(snapshot -> 'categories') as categories(category)
      where category in ('logic_bug', 'edge_case', 'error_handling', 'security', 'performance')
    );
end;
$$;

create function private.valid_summary_output(summary jsonb)
returns boolean
language plpgsql immutable strict
set search_path = ''
as $$
declare
  fields constant text[] := array['strengths', 'blindSpots', 'nextSteps'];
  field text;
  item jsonb;
begin
  if jsonb_typeof(summary) <> 'object' then
    return false;
  end if;
  if not summary ?& fields or summary - fields <> '{}'::jsonb then
    return false;
  end if;
  foreach field in array fields loop
    if jsonb_typeof(summary -> field) <> 'array' then
      return false;
    end if;
    for item in select entry from jsonb_array_elements(summary -> field) as items(entry) loop
      if jsonb_typeof(item) <> 'object' then
        return false;
      end if;
      if item - array['text', 'category'] <> '{}'::jsonb
        or (jsonb_typeof(item -> 'text') = 'string' and private.valid_domain_text(item ->> 'text', 2000)) is not true
        or (item ? 'category' and (item ->> 'category' in (
          'logic_bug', 'edge_case', 'error_handling', 'security', 'performance'
        )) is not true)
      then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  author_role text generated always as ('author') stored,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  published_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1 check (row_version >= 1),
  foreign key (author_id, author_role) references public.profiles (id, role),
  check (
    (status = 'draft' and published_revision_id is null)
    or (status in ('published', 'unpublished') and published_revision_id is not null)
    or status = 'archived'
  )
);

create table public.proposal_sets (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  source_draft_version integer not null check (source_draft_version >= 1),
  input_snapshot jsonb not null check (private.valid_proposal_snapshot(input_snapshot) is true),
  created_at timestamptz not null default now(),
  unique (challenge_id, id)
);

create table public.challenge_drafts (
  challenge_id uuid primary key references public.challenges (id),
  title text not null check (private.valid_domain_text(title, 120)),
  description text not null check (private.valid_domain_text(description, 4000)),
  language public.challenge_language not null,
  difficulty public.challenge_difficulty not null,
  working_code text not null check (private.valid_domain_code(working_code)),
  flaw_count integer not null check (flaw_count between 1 and 5),
  categories public.flaw_category[] not null check (private.valid_domain_categories(categories)),
  generation_id uuid,
  draft_version integer not null default 1 check (draft_version >= 1),
  foreign key (challenge_id, generation_id) references public.proposal_sets (challenge_id, id)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_set_id uuid not null references public.proposal_sets (id),
  category public.flaw_category not null,
  original_snippet text not null,
  replacement_snippet text not null check (
    private.valid_domain_code(replacement_snippet) and right(replacement_snippet, 1) <> E'\n'
  ),
  source_start_line integer not null check (source_start_line >= 1),
  source_end_line integer not null check (source_end_line >= source_start_line),
  explanation text not null check (private.valid_domain_text(explanation, 2000)),
  fix text not null check (private.valid_domain_text(fix, 2000)),
  exclude using gist (
    proposal_set_id with =,
    int8range(source_start_line::bigint, source_end_line::bigint, '[]') with &&
  )
);

create table public.proposal_decisions (
  proposal_id uuid primary key references public.proposals (id),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected'))
);

create table public.challenge_revisions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id),
  revision_number integer not null check (revision_number >= 1),
  title text not null check (private.valid_domain_text(title, 120)),
  description text not null check (private.valid_domain_text(description, 4000)),
  language public.challenge_language not null,
  difficulty public.challenge_difficulty not null,
  flawed_code text not null check (private.valid_domain_code(flawed_code)),
  published_at timestamptz not null default now(),
  unique (challenge_id, revision_number),
  unique (challenge_id, id)
);

alter table public.challenges
  add foreign key (id, published_revision_id) references public.challenge_revisions (challenge_id, id);

create table public.revision_answers (
  revision_id uuid primary key references public.challenge_revisions (id),
  working_code text not null check (private.valid_domain_code(working_code)),
  real_diff jsonb not null check (jsonb_typeof(real_diff) = 'object')
);

create table public.revision_flaws (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.revision_answers (revision_id),
  proposal_id uuid not null references public.proposals (id),
  category public.flaw_category not null,
  original_snippet text not null,
  replacement_snippet text not null check (
    private.valid_domain_code(replacement_snippet) and right(replacement_snippet, 1) <> E'\n'
  ),
  source_start_line integer not null check (source_start_line >= 1),
  source_end_line integer not null check (source_end_line >= source_start_line),
  start_line integer not null check (start_line >= 1),
  end_line integer not null check (end_line >= start_line),
  explanation text not null check (private.valid_domain_text(explanation, 2000)),
  fix text not null check (private.valid_domain_text(fix, 2000)),
  unique (revision_id, proposal_id),
  unique (revision_id, id),
  exclude using gist (revision_id with =, int8range(start_line::bigint, end_line::bigint, '[]') with &&)
);

create table public.flaw_hints (
  id uuid primary key default gen_random_uuid(),
  flaw_id uuid not null unique,
  revision_id uuid not null,
  text text not null check (private.valid_domain_text(text, 500)),
  generation_metadata jsonb not null check (jsonb_typeof(generation_metadata) = 'object'),
  foreign key (revision_id, flaw_id) references public.revision_flaws (revision_id, id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  learner_role text generated always as ('learner') stored,
  challenge_id uuid not null,
  revision_id uuid not null,
  attempt_number integer not null check (attempt_number in (1, 2)),
  previous_submission_id uuid,
  previous_attempt_number integer generated always as (1) stored,
  submitted_at timestamptz not null default now(),
  unique (learner_id, challenge_id, attempt_number),
  unique (id, learner_id, challenge_id, revision_id, attempt_number),
  foreign key (learner_id, learner_role) references public.profiles (id, role),
  foreign key (challenge_id, revision_id) references public.challenge_revisions (challenge_id, id),
  foreign key (previous_submission_id, learner_id, challenge_id, revision_id, previous_attempt_number)
    references public.submissions (id, learner_id, challenge_id, revision_id, attempt_number),
  check ((attempt_number = 1) = (previous_submission_id is null))
);

create table public.submission_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id),
  ordinal integer not null check (ordinal between 0 and 49),
  line integer not null check (line >= 1),
  body text not null check (private.valid_domain_text(body, 2000)),
  unique (submission_id, ordinal),
  unique (submission_id, id)
);

create table public.grading_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id),
  state text not null check (state in ('pending', 'running', 'failed', 'completed')),
  failure_code text,
  run_number integer not null check (run_number >= 1),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (submission_id, run_number),
  check ((state in ('completed', 'failed')) = (finished_at is not null)),
  check (failure_code is null or state = 'failed')
);

create unique index grading_runs_one_active
  on public.grading_runs (submission_id) where state in ('pending', 'running');

create table public.ai_grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id),
  score integer not null check (score between 0 and 100),
  passed boolean not null check (passed = (score >= 60)),
  identification_points numeric not null check (identification_points between 0 and 50),
  explanation_points numeric not null check (explanation_points between 0 and 30),
  fix_points numeric not null check (fix_points between 0 and 20)
);

create table public.ai_grade_evidence (
  grade_id uuid primary key references public.ai_grades (id),
  grading_run_id uuid not null unique references public.grading_runs (id),
  provider_output_retried boolean not null,
  created_at timestamptz not null default now()
);

create table public.ai_grade_comment_results (
  grade_id uuid not null references public.ai_grades (id),
  comment_id uuid not null references public.submission_comments (id),
  kind text not null check (kind in ('matched', 'unmatched', 'duplicate')),
  explanation_credit numeric check (explanation_credit in (0, 0.5, 1)),
  fix_credit numeric check (fix_credit in (0, 0.5, 1)),
  feedback text check (private.valid_domain_text(feedback, 2000)),
  primary key (grade_id, comment_id),
  check (
    (kind = 'matched' and explanation_credit is not null and fix_credit is not null and feedback is not null)
    or (kind <> 'matched' and explanation_credit is null and fix_credit is null and feedback is null)
  )
);

create table public.ai_grade_assessments (
  grade_id uuid not null references public.ai_grade_evidence (grade_id),
  flaw_id uuid not null references public.revision_flaws (id),
  comment_id uuid,
  distance integer check (distance between 0 and 1),
  primary key (grade_id, flaw_id),
  unique (grade_id, comment_id),
  foreign key (grade_id, comment_id) references public.ai_grade_comment_results (grade_id, comment_id),
  check ((comment_id is null) = (distance is null))
);

create table public.ai_grade_eligible_hints (
  grade_id uuid not null references public.ai_grades (id),
  hint_id uuid not null references public.flaw_hints (id),
  category public.flaw_category not null,
  ordinal integer not null check (ordinal between 0 and 4),
  primary key (grade_id, hint_id),
  unique (grade_id, ordinal)
);

-- A single unique key covers both append-only audit tables. The writer supplies
-- the order; allocating it is a separate operation.
create table private.submission_audit_orders (
  submission_id uuid not null references public.submissions (id),
  audit_order bigint not null check (audit_order >= 1),
  primary key (submission_id, audit_order)
);

create table public.grade_overrides (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id),
  actor_id uuid not null,
  actor_role text generated always as ('ta') stored,
  created_at timestamptz not null default now(),
  audit_order bigint not null,
  score integer not null check (score between 0 and 100),
  reason text not null check (private.valid_domain_text(reason, 2000)),
  foreign key (actor_id, actor_role) references public.profiles (id, role),
  foreign key (submission_id, audit_order) references private.submission_audit_orders (submission_id, audit_order)
);

create table public.review_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id),
  source text not null,
  kind text not null,
  comment_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (submission_id, comment_id) references public.submission_comments (submission_id, id),
  check (
    (source = 'rule' and kind in ('near_pass_mark', 'grading_output_retried', 'assessment_disagreement')
      and comment_id is null and reason is null)
    or (source = 'learner' and kind = 'learner_report' and comment_id is not null
      and reason is not null and private.valid_domain_text(reason, 2000))
  )
);

create unique index review_flags_rule_once
  on public.review_flags (submission_id, kind) where source = 'rule';
create unique index review_flags_report_once
  on public.review_flags (submission_id, comment_id) where source = 'learner';

create table public.flag_resolutions (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.review_flags (id),
  actor_id uuid not null,
  actor_role text generated always as ('ta') stored,
  created_at timestamptz not null default now(),
  audit_order bigint not null,
  disposition text not null check (disposition in ('upheld', 'dismissed')),
  reason text not null check (private.valid_domain_text(reason, 2000)),
  foreign key (actor_id, actor_role) references public.profiles (id, role)
);

create table public.performance_summaries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  learner_role text generated always as ('learner') stored,
  requested_by uuid not null,
  requester_role text generated always as ('ta') stored,
  input_fingerprint text not null check (private.normalize_display_name(input_fingerprint) <> ''),
  output jsonb not null check (private.valid_summary_output(output)),
  created_at timestamptz not null default now(),
  foreign key (learner_id, learner_role) references public.profiles (id, role),
  foreign key (requested_by, requester_role) references public.profiles (id, role)
);

create table public.performance_summary_evidence (
  summary_id uuid not null references public.performance_summaries (id),
  item_kind text not null check (item_kind in ('strengths', 'blindSpots', 'nextSteps')),
  item_ordinal integer not null check (item_ordinal >= 0),
  submission_id uuid not null references public.submissions (id),
  primary key (summary_id, item_kind, item_ordinal, submission_id)
);

create function private.protect_challenge_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.author_id, new.created_at) is distinct from (old.id, old.author_id, old.created_at) then
    raise exception 'Challenge identity is immutable' using errcode = '23514';
  end if;
  if old.status = 'archived' then
    raise exception 'Archived challenges cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger protect_challenge_identity before update on public.challenges
  for each row execute function private.protect_challenge_identity();

create function private.protect_draft_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.challenge_id is distinct from old.challenge_id
    or new.draft_version::bigint <> old.draft_version::bigint + 1
  then
    raise exception 'Draft edits must advance the version of the same challenge' using errcode = '23514';
  end if;
  if exists (select 1 from public.challenges where id = old.challenge_id and status = 'archived') then
    raise exception 'Archived challenge drafts cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger protect_draft_version before update on public.challenge_drafts
  for each row execute function private.protect_draft_version();

create function private.check_proposal_range()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_lines text[];
begin
  select private.domain_code_lines(input_snapshot ->> 'workingCode') into source_lines
    from public.proposal_sets where id = new.proposal_set_id;
  if source_lines is null
    or new.source_start_line < 1
    or new.source_end_line > cardinality(source_lines)
    or new.original_snippet is distinct from
      array_to_string(source_lines[new.source_start_line:new.source_end_line], E'\n')
  then
    raise exception 'Proposal source range does not match the snapshot' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_proposal_range before insert on public.proposals
  for each row execute function private.check_proposal_range();

-- Validate stored diff text against both pinned code versions, without generating
-- diffs here. Hunks account for all changes and omit only equal context lines.
create function private.valid_revision_diff(
  diff jsonb, language public.challenge_language, working_code text, flawed_code text
)
returns boolean
language plpgsql stable strict
set search_path = ''
as $$
declare
  old_lines text[] := private.domain_code_lines(working_code);
  new_lines text[] := private.domain_code_lines(flawed_code);
  hunk jsonb;
  line jsonb;
  key text;
  old_pos integer := 1;
  new_pos integer := 1;
  old_start integer;
  new_start integer;
  old_count integer;
  new_count integer;
  old_next integer;
  new_next integer;
begin
  if jsonb_typeof(diff) <> 'object' then
    return false;
  end if;
  if not diff ?& array['path', 'before', 'after', 'hunks']
    or diff - array['path', 'before', 'after', 'hunks'] <> '{}'::jsonb
    or diff -> 'path' is distinct from to_jsonb(case language
      when 'python' then 'challenge.py'
      when 'java' then 'Challenge.java'
      when 'javascript' then 'challenge.js'
      when 'typescript' then 'challenge.ts'
    end)
    or diff -> 'before' is distinct from to_jsonb(working_code)
    or diff -> 'after' is distinct from to_jsonb(flawed_code)
    or jsonb_typeof(diff -> 'hunks') <> 'array'
  then
    return false;
  end if;
  for hunk in select entry from jsonb_array_elements(diff -> 'hunks') as hunks(entry) loop
    if jsonb_typeof(hunk) <> 'object' then
      return false;
    end if;
    if not hunk ?& array['oldStart', 'oldCount', 'newStart', 'newCount', 'lines']
      or hunk - array['oldStart', 'oldCount', 'newStart', 'newCount', 'lines'] <> '{}'::jsonb
      or jsonb_typeof(hunk -> 'lines') <> 'array'
    then
      return false;
    end if;
    foreach key in array array['oldStart', 'oldCount', 'newStart', 'newCount'] loop
      if jsonb_typeof(hunk -> key) <> 'number' or hunk ->> key !~ '^[0-9]{1,5}$' then
        return false;
      end if;
    end loop;
    old_count := (hunk ->> 'oldCount')::integer;
    new_count := (hunk ->> 'newCount')::integer;
    old_start := (hunk ->> 'oldStart')::integer + case when old_count = 0 then 1 else 0 end;
    new_start := (hunk ->> 'newStart')::integer + case when new_count = 0 then 1 else 0 end;
    if old_start < old_pos or new_start < new_pos
      or old_start + old_count > cardinality(old_lines) + 1
      or new_start + new_count > cardinality(new_lines) + 1
      or old_lines[old_pos:old_start - 1] is distinct from new_lines[new_pos:new_start - 1]
    then
      return false;
    end if;
    old_next := old_start;
    new_next := new_start;
    for line in select entry from jsonb_array_elements(hunk -> 'lines') as lines(entry) loop
      if jsonb_typeof(line) <> 'object' then
        return false;
      end if;
      if not line ?& array['kind', 'text', 'oldLine', 'newLine']
        or line - array['kind', 'text', 'oldLine', 'newLine'] <> '{}'::jsonb
        or jsonb_typeof(line -> 'text') <> 'string'
      then
        return false;
      end if;
      case line ->> 'kind'
        when 'context' then
          if line -> 'oldLine' is distinct from to_jsonb(old_next)
            or line -> 'newLine' is distinct from to_jsonb(new_next)
            or line ->> 'text' is distinct from old_lines[old_next]
            or line ->> 'text' is distinct from new_lines[new_next]
          then
            return false;
          end if;
          old_next := old_next + 1;
          new_next := new_next + 1;
        when 'removed' then
          if line -> 'oldLine' is distinct from to_jsonb(old_next)
            or line -> 'newLine' <> 'null'::jsonb
            or line ->> 'text' is distinct from old_lines[old_next]
          then
            return false;
          end if;
          old_next := old_next + 1;
        when 'added' then
          if line -> 'newLine' is distinct from to_jsonb(new_next)
            or line -> 'oldLine' <> 'null'::jsonb
            or line ->> 'text' is distinct from new_lines[new_next]
          then
            return false;
          end if;
          new_next := new_next + 1;
        else
          return false;
      end case;
    end loop;
    if old_next <> old_start + old_count or new_next <> new_start + new_count then
      return false;
    end if;
    old_pos := old_next;
    new_pos := new_next;
  end loop;
  return old_lines[old_pos:] = new_lines[new_pos:];
end;
$$;

create function private.check_revision_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  revision public.challenge_revisions%rowtype;
begin
  select * into revision from public.challenge_revisions where id = new.revision_id;
  if private.valid_revision_diff(new.real_diff, revision.language, new.working_code, revision.flawed_code) is not true then
    raise exception 'Revision diff does not describe its pinned code' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_revision_answer before insert on public.revision_answers
  for each row execute function private.check_revision_answer();

create function private.check_revision_flaw()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_lines text[];
  final_lines text[];
begin
  select private.domain_code_lines(answer.working_code), private.domain_code_lines(revision.flawed_code)
    into source_lines, final_lines
    from public.challenge_revisions revision
    join public.revision_answers answer on answer.revision_id = revision.id
    join public.proposals proposal on proposal.id = new.proposal_id
    join public.proposal_sets proposal_set on proposal_set.id = proposal.proposal_set_id
    where revision.id = new.revision_id and proposal_set.challenge_id = revision.challenge_id
      and (proposal.category, proposal.source_start_line, proposal.source_end_line,
        proposal.original_snippet, proposal.replacement_snippet, proposal.explanation, proposal.fix)
        = (new.category, new.source_start_line, new.source_end_line,
          new.original_snippet, new.replacement_snippet, new.explanation, new.fix);
  if source_lines is null
    or new.source_start_line < 1 or new.source_end_line > cardinality(source_lines)
    or new.start_line < 1 or new.end_line > cardinality(final_lines)
    or new.original_snippet is distinct from array_to_string(source_lines[new.source_start_line:new.source_end_line], E'\n')
    or new.replacement_snippet is distinct from array_to_string(final_lines[new.start_line:new.end_line], E'\n')
  then
    raise exception 'Flaw ranges do not match the revision and proposal' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_revision_flaw before insert on public.revision_flaws
  for each row execute function private.check_revision_flaw();

create function private.check_comment_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  line_count integer;
begin
  select cardinality(private.domain_code_lines(revision.flawed_code)) into line_count
    from public.submissions submission
    join public.challenge_revisions revision on revision.id = submission.revision_id
    where submission.id = new.submission_id;
  if line_count is null or new.line > line_count then
    raise exception 'Comment line is outside the pinned revision' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_comment_line before insert on public.submission_comments
  for each row execute function private.check_comment_line();

create function private.check_grade_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_grades grade
    join public.grading_runs run on run.submission_id = grade.submission_id
    where grade.id = new.grade_id and run.id = new.grading_run_id and run.state = 'completed'
  ) then
    raise exception 'Original grade must refer to a completed run of its submission' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_grade_run before insert on public.ai_grade_evidence
  for each row execute function private.check_grade_run();

create function private.protect_grading_run_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.submission_id, new.run_number, new.created_at)
    is distinct from (old.submission_id, old.run_number, old.created_at)
  then
    raise exception 'Grading run provenance is immutable' using errcode = '23514';
  end if;
  if old.state = 'completed' and new.state is distinct from old.state then
    raise exception 'Completed grading runs cannot change state' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger protect_grading_run_history before update on public.grading_runs
  for each row execute function private.protect_grading_run_history();

create function private.check_grade_comment_result()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_grades grade
    join public.submission_comments comment on comment.submission_id = grade.submission_id
    where grade.id = new.grade_id and comment.id = new.comment_id
  ) then
    raise exception 'Grade comment must belong to the same submission' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_grade_comment_result before insert on public.ai_grade_comment_results
  for each row execute function private.check_grade_comment_result();

create function private.check_grade_assessment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_grades grade
    join public.submissions submission on submission.id = grade.submission_id
    join public.revision_flaws flaw on flaw.revision_id = submission.revision_id
    where grade.id = new.grade_id and flaw.id = new.flaw_id
  ) or (new.comment_id is not null and not exists (
    select 1 from public.ai_grade_comment_results result
    where result.grade_id = new.grade_id and result.comment_id = new.comment_id and result.kind = 'matched'
  )) then
    raise exception 'Assessment must link the pinned flaw and a match of the same grade' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_grade_assessment before insert on public.ai_grade_assessments
  for each row execute function private.check_grade_assessment();

create function private.check_grade_eligible_hint()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_grade_assessments assessment
    join public.flaw_hints hint on hint.flaw_id = assessment.flaw_id
    join public.revision_flaws flaw on flaw.id = assessment.flaw_id
    where assessment.grade_id = new.grade_id and assessment.comment_id is null
      and hint.id = new.hint_id and flaw.category = new.category
  ) then
    raise exception 'Eligible hint must describe a missed flaw of the same grade' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_grade_eligible_hint before insert on public.ai_grade_eligible_hints
  for each row execute function private.check_grade_eligible_hint();

create function private.claim_submission_audit_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stream_id uuid;
begin
  if tg_table_name = 'grade_overrides' then
    stream_id := new.submission_id;
  else
    select submission_id into stream_id from public.review_flags where id = new.flag_id;
  end if;
  insert into private.submission_audit_orders (submission_id, audit_order) values (stream_id, new.audit_order);
  return new;
end;
$$;

create trigger claim_submission_audit_order before insert on public.grade_overrides
  for each row execute function private.claim_submission_audit_order();
create trigger claim_submission_audit_order before insert on public.flag_resolutions
  for each row execute function private.claim_submission_audit_order();

create function private.check_summary_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.performance_summaries summary
    join public.submissions submission on submission.learner_id = summary.learner_id
    where summary.id = new.summary_id and submission.id = new.submission_id
      and summary.output -> new.item_kind -> new.item_ordinal is not null
  ) then
    raise exception 'Summary evidence must refer to a summary item and the same learner' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_summary_evidence before insert on public.performance_summary_evidence
  for each row execute function private.check_summary_evidence();

create function private.reject_immutable_domain_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '23514';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'proposal_sets', 'proposals', 'challenge_revisions', 'revision_answers', 'revision_flaws',
    'flaw_hints', 'submissions', 'submission_comments', 'ai_grades', 'ai_grade_evidence',
    'ai_grade_comment_results', 'ai_grade_assessments', 'ai_grade_eligible_hints', 'grade_overrides',
    'review_flags', 'flag_resolutions', 'performance_summaries', 'performance_summary_evidence'
  ] loop
    execute format('create trigger immutable_row before update or delete on public.%I
      for each row execute function private.reject_immutable_domain_write()', table_name);
  end loop;
end;
$$;

create trigger immutable_row before update or delete on private.submission_audit_orders
  for each row execute function private.reject_immutable_domain_write();

create index submissions_by_challenge on public.submissions (challenge_id, learner_id);
create index submissions_by_revision on public.submissions (revision_id, learner_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'challenges', 'challenge_drafts', 'proposal_sets', 'proposals', 'proposal_decisions',
    'challenge_revisions', 'revision_answers', 'revision_flaws', 'flaw_hints',
    'submissions', 'submission_comments', 'grading_runs', 'ai_grades', 'ai_grade_evidence',
    'ai_grade_assessments', 'ai_grade_comment_results', 'ai_grade_eligible_hints',
    'grade_overrides', 'review_flags', 'flag_resolutions', 'performance_summaries',
    'performance_summary_evidence'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

alter table private.submission_audit_orders enable row level security;
revoke all on table private.submission_audit_orders from public, anon, authenticated, service_role;

create function private.current_domain_role()
returns text
language sql stable security invoker
set search_path = ''
as $$
  select role from private.profile_roles where id = (select auth.uid());
$$;

grant execute on function private.current_domain_role() to authenticated;

-- Parent policies remain in force in these subqueries. The graph terminates
-- at stored roles and submissions, with no edge from submissions to challenges.
create policy read_submissions on public.submissions for select to authenticated
  using ((select private.current_domain_role()) = 'ta' or learner_id = (select auth.uid()));

create policy read_challenges on public.challenges for select to authenticated
  using (
    author_id = (select auth.uid())
    or ((select private.current_domain_role()) in ('learner', 'ta') and status = 'published')
    or exists (select 1 from public.submissions where challenge_id = challenges.id)
  );

create policy read_challenge_revisions on public.challenge_revisions for select to authenticated
  using (
    exists (
      select 1 from public.challenges challenge where challenge.id = challenge_revisions.challenge_id
        and (challenge.author_id = (select auth.uid())
          or (challenge.status = 'published' and challenge.published_revision_id = challenge_revisions.id))
    )
    or exists (select 1 from public.submissions where revision_id = challenge_revisions.id)
  );

create policy read_challenge_drafts on public.challenge_drafts for select to authenticated
  using (exists (
    select 1 from public.challenges challenge
    where challenge.id = challenge_drafts.challenge_id and challenge.author_id = (select auth.uid())
  ));

create policy read_proposal_sets on public.proposal_sets for select to authenticated
  using (exists (
    select 1 from public.challenges challenge
    where challenge.id = proposal_sets.challenge_id and challenge.author_id = (select auth.uid())
  ));

create policy read_proposals on public.proposals for select to authenticated
  using (exists (select 1 from public.proposal_sets where id = proposals.proposal_set_id));

create policy read_proposal_decisions on public.proposal_decisions for select to authenticated
  using (exists (select 1 from public.proposals where id = proposal_decisions.proposal_id));

create policy read_revision_answers on public.revision_answers for select to authenticated
  using ((select private.current_domain_role()) in ('author', 'ta')
    and exists (select 1 from public.challenge_revisions where id = revision_answers.revision_id));

create policy read_revision_flaws on public.revision_flaws for select to authenticated
  using ((select private.current_domain_role()) in ('author', 'ta')
    and exists (select 1 from public.challenge_revisions where id = revision_flaws.revision_id));

create policy read_flaw_hints on public.flaw_hints for select to authenticated
  using ((select private.current_domain_role()) in ('author', 'ta')
    and exists (select 1 from public.challenge_revisions where id = flaw_hints.revision_id));

create policy read_submission_comments on public.submission_comments for select to authenticated
  using (exists (select 1 from public.submissions where id = submission_comments.submission_id));

create policy read_grading_runs on public.grading_runs for select to authenticated
  using (exists (select 1 from public.submissions where id = grading_runs.submission_id));

create policy read_ai_grades on public.ai_grades for select to authenticated
  using (exists (select 1 from public.submissions where id = ai_grades.submission_id));

create policy read_ai_grade_evidence on public.ai_grade_evidence for select to authenticated
  using ((select private.current_domain_role()) = 'ta');

create policy read_ai_grade_assessments on public.ai_grade_assessments for select to authenticated
  using ((select private.current_domain_role()) = 'ta');

create policy read_ai_grade_comment_results on public.ai_grade_comment_results for select to authenticated
  using (exists (select 1 from public.ai_grades where id = ai_grade_comment_results.grade_id));

create policy read_ai_grade_eligible_hints on public.ai_grade_eligible_hints for select to authenticated
  using (exists (select 1 from public.ai_grades where id = ai_grade_eligible_hints.grade_id));

create policy read_grade_overrides on public.grade_overrides for select to authenticated
  using (exists (select 1 from public.submissions where id = grade_overrides.submission_id));

create policy read_review_flags on public.review_flags for select to authenticated
  using (exists (select 1 from public.submissions where id = review_flags.submission_id));

create policy read_flag_resolutions on public.flag_resolutions for select to authenticated
  using (exists (select 1 from public.review_flags where id = flag_resolutions.flag_id));

create policy read_performance_summaries on public.performance_summaries for select to authenticated
  using ((select private.current_domain_role()) = 'ta');

create policy read_performance_summary_evidence on public.performance_summary_evidence for select to authenticated
  using ((select private.current_domain_role()) = 'ta');
