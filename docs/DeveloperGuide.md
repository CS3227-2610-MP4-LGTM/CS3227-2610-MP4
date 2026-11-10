---
layout: default
title: Developer Guide
nav_order: 2
---

# LGTM Developer Guide

## Git workflow

We use the forking workflow. The team repository,
[CS3227-2610-MP4-LGTM/CS3227-2610-MP4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4),
is `upstream`; each member works in their own fork, which is `origin`.
Nobody pushes to `upstream` directly; all changes arrive through PRs.

One-time setup, after forking on GitHub:

```bash
git clone git@github.com:<your-username>/CS3227-2610-MP4.git
cd CS3227-2610-MP4
git remote add upstream https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4.git
git remote set-url --push upstream no_push   # guard against pushing upstream
```

For each change:

```bash
git fetch upstream
git switch -c <type>/<issue>-<slug> upstream/master
# ...work, commit with Conventional Commits...
git push -u origin <type>/<issue>-<slug>
gh pr create --repo CS3227-2610-MP4-LGTM/CS3227-2610-MP4 --base master
```

To keep your fork's `master` current:

```bash
git switch master
git pull --ff-only upstream master
git push origin master
```

## Database (Supabase)

LGTM stores its data in Supabase (Postgres, Auth and Storage). Development
and tests run against a local Supabase stack in Docker; nobody connects to a
hosted project from their machine.

### Hosted projects

The `CS3227-2610-MP4-LGTM` organisation has two projects, both in Singapore
(Southeast Asia):

| Project | Purpose |
| --- | --- |
| `lgtm-dev` | Shared development and preview deployments |
| `lgtm-prod` | Production |

Both have the Data API enabled, **do not** expose new tables automatically,
and enable row level security (RLS) on new tables automatically. The local
stack mirrors these settings (`auto_expose_new_tables = false` in
`supabase/config.toml`, plus the `enable_rls_on_new_tables` migration), so a
migration that works locally behaves the same way on hosted projects.

Humans and deployment workflows apply migrations to hosted projects. Agents use
local Supabase only. The denied-command lists live in
[Codex guardrails](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/rules/guardrails.rules) and
[Claude settings](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.claude/settings.json), covering commands such as `link`,
`db pull`, `migration repair` and `inspect` through plain, bunx and npx invocations.

CLI 3.0.0 defaults `db reset`, `db lint` and `gen types --lang typescript` to
local targets. These forms, local stack commands, `migration new`,
`functions new/serve`, and all repository `db:*` scripts remain available,
including `bun run db:reset` and `bun run db:types`.

Codex matches literal prefixes: for reset, lint and type generation, hosted-target
flags are blocked only as separate tokens immediately after the subcommand.
Attached values (`gen types --remote=project`), flags after other arguments
(`gen types --lang typescript --remote`), and global options before blocked
prefixes remain gaps. Claude also matches trailing and attached hosted flags.
These limits never authorize hosted access.

### Prerequisites

Docker Desktop (or another Docker-compatible runtime) must be running. The
Supabase CLI is a pinned dev dependency, so `bun install` provides it; use the
`db:*` scripts or `bunx supabase`, not a globally installed CLI.

### First-time setup

```bash
bun run db:start
```

The first start downloads the Supabase images and takes a few minutes. Then
add the local stack's values to `.env.local` in the repository root:

```bash
bunx supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --override-name auth.secret_key=SUPABASE_SECRET_KEY \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY)=' \
  >> .env.local
```

| Variable | Exposed to | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | Public key; queries are subject to RLS |
| `SUPABASE_SECRET_KEY` | Server only | Bypasses RLS |

Never prefix `SUPABASE_SECRET_KEY` with `NEXT_PUBLIC_` and never commit
`.env*` files.

### Scripts

| Command | What it does |
| --- | --- |
| `bun run db:start` | Starts the local stack; Studio is at http://127.0.0.1:54323 |
| `bun run db:stop` | Stops the stack, keeping its data |
| `bun run db:status` | Shows URLs and keys of the running stack |
| `bun run db:reset` | Recreates the local database from `supabase/migrations/` and `supabase/seed.sql` |
| `bun run db:types` | Regenerates `src/lib/supabase/database.types.ts` for `public`, `graphql_public` and `private` from the local database |

### Changing the schema

1. Create a migration: `bunx supabase migration new <name>`.
2. Write the SQL in the new file under `supabase/migrations/`:
   - RLS is enabled automatically on new `public` tables, but no policies
     exist until you add them. Add a policy for each role that needs access.
   - New tables are not exposed to the Data API. Grant only what each role
     needs, for example
     `grant select, insert on public.reviews to authenticated;`. This
     applies to `service_role` too, so the admin client also needs grants.
   - Keep helper functions that should not be callable over the Data API in
     the `private` schema.
3. Apply it locally with `bun run db:reset`.
4. Regenerate types with `bun run db:types` and commit the migration and the
   types together. CI applies every migration to a fresh database, runs
   `supabase db lint`, and fails if the committed types are stale.

Never edit a migration that has been merged; add a new one instead.

### Explicit grants for domain and LLM migrations

New `public` tables receive no default grants for `anon`, `authenticated`
or `service_role`. The
[auth-core migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261106151000_auth_core.sql)
enforces this alongside automatic RLS. Every domain-schema and LLM migration
must grant its required operations explicitly. This includes `service_role`
for the approved admin operations in
[SYS-10.3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access):
bypassing RLS does not supply table privileges. Explicit grants do not
authorize any additional admin-client use.

### Domain schema

Domain tables use explicit grants and RLS. `authenticated` can select from
role-readable domain tables under policies that use the stored profile role
and record ownership or moderation scope. `anon` and `service_role` have no
table access to the new domain records. None of these roles has a write grant
on them. The private audit-order table has explicit RLS and revokes, and the
migration revokes default function execution and sequence privileges. See the
[domain schema migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261107120000_domain_schema.sql).

Learners can read the live revision and revisions pinned by their own
submissions. Answer keys and cached hint text are separate from those revision
rows and remain restricted to the owning Author and TAs within their read
scope. The owning Learner and TAs can read grade results, comment feedback and
eligible hint references. Flaw matches and grade-to-run provenance stay in
separate TA-only tables. A database trigger preserves a grading run's
submission, run number and creation time and prevents any transition out of
`completed`, including for trusted SQL writers.

### Clients

| Import | Use in | Acts as |
| --- | --- | --- |
| `@/lib/supabase/client` | Client Components | The signed-in user (RLS applies) |
| `@/server/supabase/server` | Server Components, Server Functions, Route Handlers | The signed-in user, read from request cookies |
| `@/server/supabase/admin` | Server code, after authorizing the caller | Service role (bypasses RLS) |

Prefer the user-scoped clients so RLS enforces access. Use the admin client
only for the named SYS-10.3 operations after their authorization preconditions;
the application auth flow never uses it.

### Auth foundation

The server-only helpers in
[`src/server/auth/`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/service.ts)
provide `signUp`, `signIn` and local-scope `signOut`. Sign-up validates a
request against
[SYS-05's credential rules](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle)
and
[SYS-06's profile rules](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-06--profile-provisioning-and-immutable-role).
A private trigger provisions the profile atomically with the Auth account.

Auth helpers return categories and field-error codes without UI copy or raw
provider diagnostics. They distinguish authenticated success, confirmed
creation without a session, rejection, throttling and service unavailability.
Sign-out clears current-browser auth cookies even when the provider cannot
confirm local-scope revocation; it reports that failure separately.

[`getAccount` and `readProfile`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/account.ts)
verify identity with `auth.getUser()` and read the stored `public.profiles`
role. Failure categories map to HTTP 401, 403 and 503 through `authErrorResponse`.

In later migrations, RLS policies needing the caller's role must read
`private.profile_roles` (own row only), not `profiles`, to avoid policy
recursion. This constrained projection is populated by the provisioning trigger
and bound to the immutable public profile by its `(id, role)` foreign key.

[`src/proxy.ts`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/proxy.ts)
refreshes session transport and forwards refreshed cookies to server reads,
preserving SSR cache-prevention headers. Protected operations still authorize
at their own server boundary.

### Account pages

Visitors create an account at `/sign-up` or enter an existing account at
`/sign-in`. A usable signed-in account opening either page or `/` goes to its
stored role's landing:

| Role | Landing | Navigation |
| --- | --- | --- |
| Learner | `/learner/challenges` — “Challenges” | Challenges; Review history |
| Author | `/author/challenges` — “My challenges” | My challenges; Create challenge |
| TA | `/ta/submissions` — “Submissions” | Submissions; Flagged submissions; Learners |

Shared navigation shows the account's display name, role and “Sign out”.
Signed-out protected access opens sign-in. Cross-role access shows
“Access denied” with “Go to my workspace”.
Invalid profiles show “Account unavailable”; account-service failures show
“Service unavailable”. Both recovery screens offer “Try again” and “Sign out”.

The shared
[`AccountEntry`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/account-entry.tsx)
and [`WorkspacePage`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/account/workspace-page.tsx)
boundaries recheck verified identity and stored role on each request. Pages put
session work behind Suspense and `connection()` with Cache Components enabled;
protected results use no cache scopes. The
[auth actions](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/auth/actions.ts)
invalidate the root layout before redirecting after authentication changes so
prior account navigation is discarded. Sign-in always uses the role landing.

### Learner challenge catalogue and PR view

In **Challenges**, use **Language**, **Difficulty** and **Flaw category** to
narrow the published catalogue. Each card shows its title, description,
language, difficulty and flaw categories. Selected filters combine with AND.
The URL stores the filters and page cursor for reload and browser Back or
Forward. Changing a filter starts at the first page. **Next page** and
**First page** keep the filters, and **Clear filters** resets the catalogue.

The results region announces “Loading challenges…” and focuses **Results**
after pagination. “No challenges available.” is the unfiltered empty state.
“No challenges match these filters.” appears when a filter is active and there
are no matches. For invalid filters or a stale page, use **Clear filters**.
For a read failure, **Try again** repeats the current page request.

Choose **View challenge** to open the PR view. The title, **Description**,
**Language**, **Difficulty** and **Flaw categories** appear above **Source**.
The focusable source region scrolls independently for long lines and displays
the published source as numbered additions to a single file.
**Back to challenges** returns to the catalogue. Opening the view creates no attempt.
If the signed-in Learner already has a first attempt on the challenge,
**View first attempt** links to that attempt's history URL even if the attempt
used an older revision or grading is pending or failed.

“Loading challenge…” covers both the material and first-attempt reads.
**Try again** repeats both checks on a read failure. A missing challenge shows
“Challenge not found”. An unpublished or archived challenge shows
“Access denied” with “This item isn't available to your account.” Account failures
follow the shared workspace recovery above.

#### Learner read contracts

| Endpoint | Request and success data |
| --- | --- |
| `GET /api/v1/challenges` | Optional `language`, `difficulty`, `category`, `cursor` and `limit`. Returns `{ items, nextCursor }` with only live published cards. Default limit 20, with API limits 1–50. |
| `GET /api/v1/challenges/:id` | UUID path parameter and no query parameters. Returns the live card fields and its `CodeDiff` projection. |

Responses use `{ data }` or `{ error: { code, message } }` with
`Cache-Control: private, no-store`. Invalid input returns 400. Missing sessions
return 401. Unusable profiles, wrong roles and existing non-live records
return 403. An absent challenge returns 404 on detail and an unavailable read
returns 503. The list sorts by descending publication time and ascending
challenge ID. Use the returned cursor with the same filters. Its anchor must
still match the filtered live revision.

The server readers verify the account and stored Learner role for each
protected read and use the signed-in user's Supabase client. The catalogue and
detail database functions grant execution to `authenticated` and check the
stored role. They expose sorted, unique approved categories from the live
revision. Detail returns the live revision ID or the access decision, then
the server reads the matching source under RLS. The first-attempt action
queries only attempt one for the verified Learner and challenge. A failed
lookup remains a read failure. These reads use no cross-request cache.
See the [server readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/challenges.ts)
and [Learner browse migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108130000_learner_browse.sql).

The open view keeps the loaded revision ID and source together. Fresh reads
follow the live pointer. The shared renderer takes an authorized `CodeDiff`
and renders text literally. For Learners, the server projects only the flawed
source as additions, with one-based line numbers and a language-derived
filename. A trailing newline adds no extra line.
See [CodeDiffView](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/components/code-diff.tsx)
and the [Learner projection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/projection.ts).

#### Learner browse checks

- `bun run test tests/unit/learner` covers validation, source projection and
  rendering, loading, recovery and focus without Supabase.
- With local Supabase running,
  `bun run test:integration tests/integration/domain/learner-browse` covers
  the endpoints and direct database access, including record isolation and
  pagination.
- `bun run test:e2e tests/e2e/learner` uses the production build and local
  Supabase to exercise filter URL history, access outcomes, first-attempt
  links, account switching and keyboard access at 320 CSS pixels.

### Learner first review

On a challenge you have yet to submit, choose **Add comment** on a source line.
Each line can have multiple comments. Use **Edit** or **Remove** to revise the
draft, or **Cancel** to close the open editor. Comments are ordered by line,
then by the order you added them on that line. You can draft up to 50 comments
with up to 2,000 Unicode code points per comment after trimming. A comment must
contain text.

Drafts stay in the current page's memory. With draft comments or unsaved editor
text, leaving in the app opens **Leave this review?**. Choose **Keep reviewing**
to stay or **Leave review** to discard the draft and continue. Reloading or
closing the page uses the browser's warning where supported. Successful
submission and an expired session that cannot refresh bypass the leave dialog.

Finish or cancel the open comment editor before choosing **Submit review**.
The **Submit review?** dialog shows the comment count and warns when there are
no comments. **Keep reviewing** returns to the draft.
**Confirm submission** submits the loaded revision and locks the draft while the
request is in progress. A confirmed review opens **Review result** with the
pinned **Source**, read-only **Submitted comments** and automatic grading.

If the app cannot confirm the outcome, the draft stays locked. **Check
submission** replays the same request. A temporary failure during that check
keeps the outcome uncertain so you can check again. After a confirmed rejection,
the draft stays visible. A changed or unavailable revision requires returning
to **Challenges**, and an attempt-limit rejection points to **Review history**.

#### Learner submission contract

For the POST contract, see “Learner surface” and “Transport, concurrency and
errors” in [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).
Comment lines must be in nondecreasing order.

The workspace sends `X-LGTM-Workspace-Account-Id` with its loaded account UUID
on both submission and status checks. The header is optional on the POST.
When present, it must be a UUID that matches the verified account or the route
rejects the request before the database call. This prevents a stale tab from
submitting its draft under another account's active session. The verified
session determines the actor. When an `Origin` is supplied, the route checks
it against the inbound `Host` and request protocol.

The user-scoped submission function checks the stored Learner role and locks
the challenge row while checking publication, the live revision and attempt
eligibility. In one transaction it creates the first attempt, assigns comment
IDs and zero-based ordinals, and records the outcome in the private submission
ledger. The ledger keys each request by actor, challenge and idempotency key
and compares a fingerprint of the validated input. Replays of a recorded request
return its outcome. Changing the payload under the same key returns
`409 IDEMPOTENCY_CONFLICT`. A definitive rejection from the publication,
attempt or revision-line checks is recorded without creating a submission.
A request rejected by HTTP validation before the database call leaves the
ledger untouched.

The migration grants both submission and result-read function execution to
`authenticated`. It keeps direct write grants and ledger access closed.
Opening the result starts grading separately from submission. The result
function returns the pinned code, submitted comments and grading state only to
the owning Learner. See the
[server submission contract](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/submissions.ts)
and [Learner submission migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261109120000_learner_submissions.sql).

#### Learner submission checks

- `bun run test tests/unit/learner` covers draft controls, status checks and
  HTTP validation without Supabase.
- `bun run test:integration tests/integration/domain/learner-submission`
  exercises submission, replay, lifecycle checks and record access against
  local Supabase.
- `bun run test:e2e tests/e2e/learner/review.spec.ts` exercises the
  keyboard review flow and leave warnings on a production build.

### Learner grading

**Review result** shows the challenge, attempt number, submission time, pinned
code and read-only comments. Opening a pending result starts grading
automatically. **Grading pending** and **Grading your review…** show progress
until the grade succeeds or fails. Reopening the page observes a running grade
or displays the stored **Original assessment** when grading has completed.

**Original assessment** shows the score out of 100, pass mark, pass status,
component points and matched and missed flaw counts. After grading, the
**Submitted comments** section becomes **Earned credit**, where each comment
is **Matched**, **Unmatched** or **Duplicate**.
Matched comments show **Explanation credit** and **Fix credit**. Unmatched and
duplicate comments show **No credit** and dashes for both credits.

A failed grade leaves the review saved and gives the reason. **Retry grading**
reruns assessment of the same submission after a retryable failure. If the
review exceeds the AI input limit, the page shows the size-limit message and
keeps the submitted evidence available. Choose **Try again** if the result
could not load, or **Check status** if the page could not confirm the grading
state.

[**Retry challenge**](#learner-feedback-hints-and-retry) starts a second review
attempt after a completed first assessment.

For request and response contracts, see “Learner surface” and “Transport,
concurrency and errors” in [INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#3-api-contracts).

Run the grading unit checks with `bun run test tests/unit/learner`. With
local Supabase running, use `bun run test:integration tests/integration/domain/learner-grading.test.ts tests/integration/llm/learner-grading tests/integration/ta/progress/learner-grading.test.ts`
to check grading, replay and first-attempt TA progress. Use
`bun run test:e2e tests/e2e/learner/grading.spec.ts` for the browser flow
with the fake provider.

### Learner feedback, hints and retry

After the original assessment completes, **Earned credit** shows **Feedback**
as plain text alongside the credits for each matched comment. **Missed
criteria** lists matched comments that received less than full credit for
**Explanation**, **Actionable fix** or both. It also shows missed flaw counts
by category in the same order as the catalogue's **Flaw category** choices.
The counts keep the flaws' locations and answers private. When neither list
has entries, the section shows “No missed criteria in this assessment.”

Choose **Show hint** under a category to reveal its next eligible hint.
**Loading hint…** pauses that control while earlier hints stay visible.
After the last hint in the category, the control gives way to **All hints
shown**. With no missed flaws, the result shows “No hints needed for missed
flaws.” Hints start collapsed each time you reopen the result. Each reveal
is quota-free and reads approved cached text on demand.
Eligible hints remain available on completed results after unpublication or
archiving. A second attempt uses its own original assessment's eligible hints.

“We couldn't load this hint. Try again.” offers **Try again** for the same
hint. “This hint isn't available for this review.” offers **Refresh result**
to recheck eligibility. Account failures use the shared workspace recovery.

#### Retry a challenge

Under **Next actions**, **Retry challenge** is available once the first
attempt's original assessment completes, provided the challenge is still
published and you have no second attempt. A passing score qualifies.
Eligibility requires a completed original assessment even when a TA override
exists. The first result checks these reasons in order.

1. “Retry is available after your first assessment completes.”
2. “You have used your retry.”
3. “Retry is unavailable while this challenge is not published.”

If the result can't check eligibility, use **Check retry availability**.
**Browse challenges** remains available in the result navigation.

The link opens `/learner/history/:submissionId/retry` with the first attempt's
ID. **Loading retry…** appears while the page checks access and eligibility,
including when browser history restores the page. An eligible entry opens
**Retry review** with the challenge title and **Attempt 2**. The draft uses
the first attempt's pinned code even after a newer revision is published.
It starts with independent, editable copies of the original comments in
their submitted order. Reloading or returning after discarding edits starts
from fresh copies.

The retry uses the [same draft and submission controls](#learner-first-review),
including **Leave this review?** when leaving with copied comments or draft
work, **Confirm submission** to send the review and **Check submission** if
the outcome is uncertain. Successful submission opens **Review result** for
attempt two. If eligibility changes after the editor opens, submission
rechecks it and keeps the draft visible on rejection.

A failed entry read shows **Retry unavailable** and “We couldn't load your
retry. Try again.” Use **Try again** at the same URL. An owned but ineligible
entry shows **Retry unavailable**, the reason and **Back to result**. Opening
the retry URL for attempt two shows “A second attempt cannot be retried.”
A missing attempt shows **Review not found**. Access failures use the shared
workspace recovery.

#### Feedback and retry contracts

`GET /api/v1/submissions/:id/hints/:hintId` follows the Learner surface in
[INTEGRATION-SPEC §3](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md#learner-surface)
and is sent with `Cache-Control: private, no-store`. The authenticated-only
`read_learner_submission_hint` database function checks the stored Learner
role, submission ownership, pinned revision and the exact completed original
grade's eligible hint for a missed flaw. Hint text is fetched separately from
the result and rendered as plain text. The result response carries eligible
hint references.

The result and retry pages use the caller-scoped `read_learner_retry_eligibility`
database function to read publication status and the second submission ID.
The retry POST uses the existing submission endpoint and adds
`previousSubmissionId` alongside the first attempt's `revisionId` and the
draft comments. The submission function checks ownership, original grade
completion, publication and attempt eligibility under the challenge lock,
which serializes competing second attempts. It records the outcome in the
existing idempotency ledger. The server and client check that a successful
acknowledgement identifies attempt two linked to the specified first
submission and pinned revision.
See the [feedback and retry migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261110130000_learner_feedback_retry.sql).

#### Feedback and retry checks

Run the Learner unit tests without Supabase:

```bash
bun run test tests/unit/learner
```

With local Supabase running, check the hint projection and access boundaries,
then exercise retry ownership, revision pinning and concurrent creation:

```bash
bun run test:integration tests/integration/domain/learner-feedback-and-hints.test.ts tests/integration/domain/learner-retry-challenge.test.ts
```

With local Supabase and Chromium installed, run the production-build browser
journeys with the fake provider. These cover keyboard use at 320 CSS pixels,
retry submission and history restoration before and after unpublication.

```bash
bun run test:e2e tests/e2e/learner/feedback-and-retry-challenge.spec.ts tests/e2e/learner/retry-history-restore.spec.ts --project chromium
```

### TA submission inspection

Sign in as a TA to open **Submissions** at `/ta/submissions`. Each attempt has
its own card with the learner's display name and ID, challenge title, attempt
number, UTC submission time, grading status, effective score and open flag count.
Use **Learner ID** and **Challenge ID** (UUIDs), and **Grading status** to filter,
then choose **Apply filters**. Filters combine with AND and start at the first
page. **Clear filters** resets the list. The URL preserves applied filters and
pagination for reload and browser Back or Forward. **Next page** and **First
page** keep the applied filters.

“No submissions yet.” is the unfiltered empty state; “No submissions match
these filters.” is the filtered empty state. Invalid IDs show “Enter a valid
ID.” An invalid URL or cursor shows “This submissions page isn't valid.”;
use **First page** or **Clear filters** to recover. Loading announces “Loading
submissions…”. A read failure offers **Try again** for the current request.

Choose **View submission** to open `/ta/submissions/:id`. The **Submission**
view shows the attempt's pinned revision through the shared read-only diff
renderer and its ordered **Submitted comments**, including line numbers,
matching, duplicate/unmatched status, explanation and fix credit, and feedback.
**Original assessment** shows the stored AI score, pass/fail result, pass mark
60, point breakdown and matched/missed counts. **Current grade** separately
shows the effective score and whether it comes from the original AI assessment
or a stored TA override. **Private answer key** shows each flaw's locations,
original/replacement snippets, explanation, fix and per-flaw assessment.
**Override history** and **Resolution history** show stored moderation decisions.

Pending, running and failed grading have no available score; a completed zero
is displayed as `0 / 100`. **Refresh submission** rereads stored evidence without
starting grading or changing moderation records. Reopening a submission retains
its pinned evidence after challenge edits, republication, unpublication or
archiving. Code, snippets and comments are displayed as text and never executed.

Loading announces “Loading submission…”. A missing record shows “Submission
not found.”; a read failure offers **Try again**. **Back to submissions** is
always available. Valid page context `from=flags` adds **Back to flagged
submissions**; `from=learner&learnerId=<matching learner UUID>` adds **Back to
learner**. Account
and role failures use the shared workspace recovery described above.

#### TA read contracts

| Endpoint | Request and success data |
| --- | --- |
| `GET /api/v1/ta/submissions` | Optional `learnerId`, `challengeId`, `gradingState`, `cursor` and `limit`. Returns `{ items, nextCursor }`; default limit 20, API limits 1–50. Grading states are `pending`, `running`, `failed`, `completed`. |
| `GET /api/v1/ta/submissions/:id` | UUID path parameter, no query parameters. Returns the pinned submission, comments, private answer key, matching, per-flaw `assessments`, original/effective grades and stored override/flag/resolution records. Page return context is not sent to this endpoint. |

Both endpoints verify identity and the stored TA role before reading through
the signed-in user's Supabase client and RLS. Projections expose learner IDs
and display names without email addresses. Responses use `{ data }` or
`{ error: { code, message } }` and `Cache-Control: private, no-store`.
Invalid inputs return 400, missing sessions 401, wrong roles or unusable profiles
403, absent detail records 404 and unavailable reads 503. Unknown or duplicate
query fields are rejected. The list sorts by descending submission time and
ascending submission ID; cursors are bounded and bound to the same filters.
Protected page shells defer account reads behind Suspense and `connection()`;
protected results have no cache scopes.

See the [TA server readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/ta/submissions.ts)
and [list migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108090000_ta_submission_page.sql).

#### TA inspection checks

- `bun run test tests/unit/ta/inspection` covers validation, filter-bound
  cursors, list/detail rendering, stored assessment states and recovery.
- With local Supabase running,
  `bun run test:integration tests/integration/ta/inspection/reads.test.ts`
  checks protected reads, direct RLS access, retained revision evidence and
  GET-only behavior with fixture records.
- `bun run test:e2e tests/e2e/ta/inspection` uses the production build and local
  Supabase for URL history, refresh/retry, account transitions, return links,
  keyboard access and 320 CSS pixel width.

### TA learner progress and recommendations

Open **Learners** at `/ta/learners`. Cards show display names and learner IDs,
so learners with the same name can be distinguished without exposing email.
Choose **View learner** to open **Learner performance** at
`/ta/learners/:learnerId`. **Next page** and **First page** navigate the directory;
its URL preserves pagination for reload and browser Back/Forward. An empty
list says “No learners yet.” An invalid page offers **First page**; read errors
provide **Try again**. Missing learners show “Learner not found.”

**Category progress** shows Logic bug, Edge case, Error handling, Security and
Performance, with identified/total flaws, identification rate and completed
first-attempt counts. Rates display two decimal places. “Not observed” means
there are no eligible flaws in that category; `0.00%` means flaws were observed
but none identified. All five categories remain visible with no evidence.
Progress uses original matching from completed first attempts across retained
history, including unpublished and archived challenges. Pending, running and
failed grading, learner retries and grade overrides do not change these counts.

**Recommended challenges** is rule-based advice, with up to five published,
unattempted challenges showing language, difficulty and practice categories.
Any prior attempt excludes that challenge, including failed or pending attempts
and attempts on older revisions. Recommendations target the two weakest
observed categories (or the only observed category). No observations or eligible
candidates shows “No eligible recommendations right now.” Cards offer advice
without assigning practice or starting a review.

Both sections load independently on entry. **Refresh progress and
recommendations** rereads current history and publication eligibility. Each
section has its own **Try again**; one failure leaves the other's successful
result visible. Failed refreshes retain successful content labelled
“Previously loaded progress” or “Previously loaded recommendations”. These reads
make no AI request. The separate **Performance summary** region currently has
no summary content or generation action.

**View submissions** opens the learner-filtered submissions list. Open an attempt
there and use **Back to learner** to return. **Back to learners** returns to the
directory. Account and role failures use shared workspace recovery.

#### Learner progress read contracts

| Endpoint | Request and success data |
| --- | --- |
| `GET /api/v1/ta/learners` | Optional `cursor` and `limit` (default 20, range 1–50). Returns `{ items: [{ id, displayName }], nextCursor }`. |
| `GET /api/v1/ta/learners/:id/progress` | UUID path parameter; no query fields. Returns `{ learnerId, categories }`, with `category`, `totalFlaws`, `identifiedFlaws`, `identificationRate` and `completedFirstAttempts` per category. Rate is a fraction rounded to four decimal places, or null. |
| `GET /api/v1/ta/learners/:id/recommendations` | UUID path parameter; optional `limit` (default 5, range 1–10). Returns `{ items: [{ challenge, targetCategories }] }`; `challenge` follows the shared ChallengeCard contract. |

These GET endpoints use the TA identity/role guard, user-scoped reads and the
same response envelopes, private/no-store headers and error status mapping as
TA inspection. Unknown and repeated query fields are rejected. Learner identity
is resolved server-side for the detail page; there is no separate identity GET
endpoint. A missing learner returns not-found; a target with another role is
forbidden.

Directory ordering is profile creation time descending, then ID ascending;
bounded opaque cursors carry that anchor. The migration adds `profiles.created_at`,
revokes authenticated table-wide SELECT, and grants SELECT only on `id`,
`display_name` and `role`, subject to existing RLS. Do not use wildcard profile
projections. The narrow security-definer RPCs
`list_ta_learners(p_limit, p_before, p_after_id)` and
`read_ta_learner(p_learner_id)` verify the caller's stored TA role with a fixed
empty search path. Execution is granted to authenticated users, revoked from
PUBLIC, anon and service_role; direct timestamp reads remain unavailable.

The shared aggregator counts original matched flaws over eligible pinned
first-attempt evidence. Recommendation weakness ordering uses unrounded ratios,
then greater total flaws, then shared category order. Candidates sort by more
target-category matches, easier difficulty, then challenge ID ascending. Reads
recompute eligibility without changing submissions, grades, challenges or summaries.

See the [progress readers](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/ta/progress.ts),
[shared aggregation and selection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/ta/progress.ts)
and [identity migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261109160000_ta_learner_progress.sql).

#### Learner progress checks

- `bun run test tests/unit/ta/progress` covers aggregation, deterministic rules,
  validation, directory/detail rendering and independent section recovery.
- With local Supabase running, `bun run test:integration tests/integration/ta/progress`
  covers protected reads, RPC/grant boundaries and retained original evidence.
- `bun run test:e2e tests/e2e/ta/progress` covers production browser navigation,
  refresh/retry, submission round trips, keyboard access and phone-width layouts.

### TA flag resolution and grade overrides

Open **Flagged submissions** at `/ta/flags`. The queue defaults to **Open**;
choose **Resolved** under **Status** to inspect prior decisions. **Flag reason**
offers **All**, **Score near the pass mark**, **AI grading output needed a retry**,
**Location match and AI assessment disagree**, and **Learner reported an unmatched
comment**. **Apply filters** combines status and reason and starts at the first
page. Applied filters and pagination stay in the URL for reload and browser
Back or Forward; **Next page** and **First page** retain filters. Each entry
shows the submission ID, reason, status and recorded time. **View submission**
opens its pinned evidence and marks the **Selected flag**.

An empty default queue shows “No flagged submissions.”; a filtered empty queue
shows “No flags match these filters.” with **Show open flags**. Loading announces
“Loading flagged submissions…”. A failed read offers **Try again**; an invalid
queue URL shows “This queue page isn't valid.” with **First page** recovery.

On the submission, choose **Resolve flag**, select **Upheld** or **Dismissed**
under **Disposition**, enter a **Reason**, then choose **Save resolution**.
Either disposition resolves the flag without changing its grade. **Add correction**
appends another resolution to a resolved flag; earlier entries remain visible.
**Resolution history** shows each TA's ID, UTC time, disposition and reason,
with the latest marked **Latest resolution**. A missing selected flag shows
“Flag not found.” and **Back to flagged submissions**.

For a completed assessment, choose **Override grade**, enter a **Replacement
score** (a whole number from 0 to 100) and **Reason**, then **Save override**.
Both forms require a reason of 1–2,000 Unicode code points after trimming.
**Current grade** uses the latest override and the pass mark of 60;
**Original assessment** remains unchanged. **Override history** retains each
TA's ID, time, score and reason and marks **Current override**. To correct a
score, append another override. Overrides do not change matching, per-flaw
credit, hints, category evidence or flags, and do not rerun AI grading.
The form identifies override reasons as learner-visible; learner result/history
screens remain outside this implementation.

Saving disables the forms and **Refresh submission**. A successful save announces
“Resolution saved.” or “Grade override saved.”. Validation focuses the first
invalid field. After a temporary save failure, **Try again** explicitly retries
the same unchanged action safely, including after **Refresh submission**; refresh
only rereads stored evidence. A state or conflict rejection requires refreshing
and starting a new action. Session expiry opens sign-in; role/profile/account
failures replace protected content with the shared recovery screen. Returning
after sign-in or account recovery never automatically resubmits a decision.

#### Moderation contracts and persistence

| Endpoint | Request and success data |
| --- | --- |
| `GET /api/v1/ta/flags` | Optional `status` (`open` by default, or `resolved`), `kind`, `cursor`, `limit` (default 20, range 1–50). Returns `{ items, nextCursor }`. Kinds are `near_pass_mark`, `grading_output_retried`, `assessment_disagreement`, `learner_report`. |
| `POST /api/v1/ta/submissions/:id/overrides` | UUID ID and UUID `Idempotency-Key`; strict JSON `{ score, reason }`. Returns `{ override, grading }` with status 201. |
| `POST /api/v1/ta/flags/:id/resolutions` | UUID ID and UUID `Idempotency-Key`; strict JSON `{ disposition, reason }`, disposition `upheld` or `dismissed`. Returns the updated flag with status 201. |

These contracts verify identity and stored TA role through the user-scoped
client. They use the same private, no-store envelopes and access recovery as
TA inspection. Queue ordering is descending flag time, then ascending ID;
cursors bind to filters and unknown/duplicate query fields are rejected.
POSTs require a same-origin `Origin`, cap bodies at 32 KiB and validate fields
with Zod and again in the database. Invalid requests return 400, missing records
404, oversized bodies 413, and unavailable operations 503. State and idempotency
conflicts return 409 (`INVALID_STATE`, `VERSION_CONFLICT` or
`IDEMPOTENCY_CONFLICT`). An override requires a completed stored assessment.

The [moderation migration](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/supabase/migrations/20261108150000_ta_moderation.sql)
grants authenticated callers only constrained moderation RPC execution; the RPC
checks the TA role. Direct forged inserts, updates and deletes remain denied;
human moderation never uses the admin client. Actor, timestamp and submission-wide
`auditOrder` are database-derived. Both append operations lock the same submission
so concurrent decisions survive with unique audit order, including tied timestamps.
The highest override audit order determines the effective grade; any resolution
makes a flag resolved. Historical submissions remain moderatable after challenge
publication changes. The shared
[effective-grade projection](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/lib/grading/effective-grade.ts)
also supports owning-Learner-authorized stored rows without exposing private keys.

Idempotency is scoped to actor, operation, resource and key. Replaying the same
canonical payload returns its saved result; changing the payload with that key
conflicts. The validated incomplete-assessment rejection is retained even if
grading later completes: a new explicit action needs a new key. Keys/results
are private, with RLS enabled and table access revoked. Audit append and saved
result are atomic, so a lost response can be retried without duplicate history.

#### Moderation checks

- `bun run test tests/unit/ta/moderation` covers filters, forms, validation,
  access recovery and effective-grade projection. Supplementary recovery tests
  are in `tests/unit/ta/moderation-recovery.test.tsx`.
- `bun run test:integration tests/integration/ta/moderation/writes.test.ts`
  uses local Supabase for protected reads/writes, append ordering, idempotency,
  retained evidence and direct database boundaries.
- `bun run test:e2e tests/e2e/ta/moderation` exercises queue/detail decisions,
  retries, session recovery, keyboard access and phone width against a production
  build with local Supabase and the fake provider.

### Auth tests and settings

`bun run test` runs unit tests without Supabase. Start the local stack before
running the separate integration suite:

```bash
bun run db:start
bun run test:integration
```

Integration tests run in Vitest's Node environment against real local Auth,
API and Postgres services. Auth tests cover provisioning, immutable roles,
profile visibility and refresh behavior. Domain tests use `pg` to check RLS,
grants, constraints and grading-run history with scoped and trusted SQL
sessions. They roll back seeded domain rows before deleting fixture accounts.
To run the domain tests alone, use `bun run test:integration tests/integration/domain`.
Tests capture local CLI configuration in memory. Auth tests inject throttling
failures to stay within the provider limit. CI's `integration` job runs these
suites and is required by the `verify` job. Local `bun run verify` runs lint,
typecheck, unit tests and build. CI uses Node 24 from `.node-version`.

For browser account journeys, install Chromium once, then run:

```bash
bunx playwright install chromium
bun run test:e2e
```

Keep local Supabase running. Playwright's
[launcher](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/tests/e2e/account/server.ts)
gets local settings from the CLI, builds the app and starts an isolated
production server on port 3100. It does not reuse a development server. The
suite covers all roles, refresh, cookie deletion, denied access and account
switching through back, prefetch and reload. Fixtures create and clean up local
accounts; one worker and zero retries bound Auth traffic. CI's separate `e2e`
job runs this suite against local Auth and is also required by `verify`.

Local `auth.rate_limit.sign_in_sign_ups` is 300 per five minutes per IP to
support repeated integration/fix-round runs. This does not change hosted
limits. After changing local Auth configuration, run `bun run db:stop` then
`bun run db:start` to reload it; stopping preserves local data.

Hosted settings require a human dashboard review under
[SYS-15.2–15.4](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth),
including the authoritative
[SYS-05 credential policy](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle).
Local configuration and passing integration tests do not verify hosted settings.

## Shared LLM boundary

The server-only modules in
[`src/server/llm/`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/boundary.ts)
provide reusable validation, authorization, fake and SoCLaaS execution, and
durable usage accounting.

`createLlmBoundary({client, accounting, env, clock, limits})` takes a
user-scoped Supabase client and server environment settings. Callers can also
pass an injected `provider` in place of `env`. Its
`execute(request, serverSelection?)` accepts only
`{operation, resourceId, idempotencyKey, expectedVersion?}` with UUIDs for IDs.
Author operations require the captured draft version as `expectedVersion`.
The boundary verifies identity, stored role, ownership and eligible persisted
state before capturing input or reserving usage, then rechecks identity and the
captured fingerprint before returning generated data.

Every input and output uses the strict envelope
`{schemaVersion: 1, operation, payload}`:

| Operation | Authorized caller and resource | Model input / validated output |
| --- | --- | --- |
| `inject_flaws` | Author; owned challenge draft | Working code and flaw configuration / proposals |
| `generate_hints` | Author; owned challenge draft with resolved proposal decisions | Assembled flawed code and retained flaws / keyed hints |
| `assess_review` | Learner; own eligible persisted submission | Pinned flawed code and selected flaw/comment pairs / keyed credit assessments and feedback |
| `summarize_learner` | TA; learner ID | Latest 20 completed submissions and category progress / strengths, blind spots and next steps with evidence |

The grading service matches comments against the pinned revision and binds
assessment to the active grading run. The boundary rechecks that run before
dispatch and after a successful response. An empty match set returns an empty
assessment without provider dispatch or quota. The grading service scores the
validated result and persists the original assessment. The final write rechecks
ownership, run eligibility and the deadline. See the
[grading service](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/learner/grade-submission.ts).

Contracts reject unknown fields, invalid ranges, duplicate or mismatched keys,
unsupported values and unsupported evidence. Candidate assembly validates source
snippets and non-overlapping replacements. Pasted code is normalized and bounded,
never executed. Server-owned instructions remain separate from untrusted data;
tools, browsing, code execution and callbacks are disabled. Hint and feedback
checks reject markup, code fences, links and line references. Protected-text
overlap checks use Unicode NFKC and full case folding across every retained
flaw's original/replacement snippets, explanation and fix: eight-token overlaps,
or a whole protected value of four to seven tokens, are rejected.

### Accounting and failures

[`createAccountingStore`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/accounting.ts)
uses admin-only accounting RPCs by default; its optional SQL executor supports
local committed-connection tests without adding a runtime `pg` dependency.
The environment namespace is trusted server configuration, never role input.
Accounting tables have RLS and no direct client or service-role table grants.
Dedicated functions perform atomic reservations, dispatch marking, settlement,
close and expiry; immutable events record operation and attempt transitions.
`readUsage()` exposes only the verified caller's account usage and budget,
not environment counters or private model material. Callers cannot reset usage.

Each attempt reserves both account and environment capacity before dispatch:

| Ceiling | Account | Environment |
| --- | --- | --- |
| Active operations | 1 | 4 |
| Attempts per UTC minute | 4 | 20 |
| Attempts per UTC day | 20 | 100 |
| Tokens per UTC day | 300,000 | 1,500,000 |

Reservations keep their original UTC windows across rollover. Verified usage
settles once within reserved input/output components; uncertain dispatch or usage
charges the full reservation, while proven undispatched work releases it.
Expiry releases active slots, charges unresolved dispatched attempts conservatively
and rejects late settlement. No database transaction spans a provider call.
Duplicate keys return in-progress/replay metadata without another dispatch;
accounting does not store generated role results for replay.

The maximum is 32,768 input tokens, 8,192 output tokens, 128 KiB of response,
15 seconds per attempt and 35 seconds per operation. Input measurement conservatively
counts the full serialized request's UTF-8 bytes plus overhead. Limits may be
lowered, never raised above these ceilings. Only invalid output permits one
automatic retry, using the same snapshot and operation deadline with a fresh
reservation. Transport failure and timeout are not retried. Deadlines also cover
settlement, close and final boundary revalidation.

Success returns `{data: validatedEnvelope, meta: {attempts, outputRetried, deadline}}`;
duplicate admission returns status metadata, and failures return `{error: {code}}`.
Safe codes include `INVALID_AI_OUTPUT`, `AI_TIMEOUT`, `AI_UNAVAILABLE` and
`SERVICE_UNAVAILABLE`; raw provider errors, credentials and private text are
excluded from diagnostics. Accounting outages fail closed.

### Provider configuration

`getLlmConfig` validates settings on use and names invalid settings without
printing their values. Configure the provider independently in each environment.

| Environment | Provider settings |
| --- | --- |
| Local, test and CI | Use the fake provider. Set `APP_ENV` to `local`, `test` or `ci` and set `AI_PROVIDER=fake`. |
| Hosted development (Vercel Preview) | Use the live SoC provider. Set `APP_ENV=development`, `AI_PROVIDER=soclaas` and the development `SOCLAAS_API_KEY`. |
| Hosted production (Vercel Production) | Set `APP_ENV=production` and select `AI_PROVIDER=fake` explicitly or opt in with `AI_PROVIDER=soclaas` and the separate production `SOCLAAS_API_KEY`. |

Keep both SoC keys server-only. The app pins `qwen3.6:35b` with a reviewed
262,144-token context and uses `reasoning_effort=none` for each operation.
Completion tokens cover both answer and reasoning. See the per-operation
output caps in
[`src/server/llm/config.ts`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/src/server/llm/config.ts)
and the configuration requirements in
[SYS-15](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md#sys-15--configuration-and-hosted-auth).

Each request sends a strict `json_schema` response format derived from the
operation's output contract and the captured input. Input preflight counts
the serialized schema. The app validates the response before accepting it.

Repeat the configuration review in
[SEC-04](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md#sec-04--bound-soc-requests-and-usage)
before enabling live dispatch and whenever the key, model or ceilings change.

### Manual SoCLaaS smoke

From the repository root in a local shell, export the development key as
`SOCLAAS_API_KEY`. Pass `--live` to authorize live requests and keep Bun's
environment-file loading disabled.

```bash
bun --no-env-file --conditions=react-server workflow/scripts/soc-smoke.ts \
  --live --operation inject_flaws \
  --input workflow/scripts/fixtures/soc-smoke/inject-flaws.json
```

The fixture directory also includes `generate-hints.json`,
`assess-review.json`, `summarize-learner.json` and a separate five-flaw
`inject-flaws-stress.json` case. Match `--operation` to the input files.
Repeat `--input` for more files and use `--repeat` to run the same cases
again. The script starts calls at least four seconds apart and allows at
most 30 calls per run. The script-only options `--effort` (`none`, `low`,
`medium`, or `high`) and `--max-tokens` (1–8,192) override the corresponding
app defaults for that run.

Each input file is a JSON array of cases with a `payload` and optional
`caseId`. For hint and assessment cases, include the revision's complete
retained flaw set in `retainedFlaws`, including unmatched flaws for
`assess_review`. The script uses this set locally to check the answer
for protected text and sends only the operation payload in the model's
input envelope.

Run the 21 labelled E6 assessment cases with the app's default effort and cap.

```bash
bun --no-env-file --conditions=react-server workflow/scripts/soc-smoke.ts \
  --live --operation assess_review \
  --labelled-input workflow/scripts/fixtures/soc-smoke/assess-review-e6.json
```

Use `--labelled-input` on its own with `assess_review`. Each E6 case
requires a `caseId`, a payload with one matched comment, and
`explanation_label` and `fix_label` values of `0`, `0.5`, or `1`.
For multiple matches, use
`workflow/scripts/fixtures/soc-smoke/assess-review-multi-match.json` as the
labelled input. Multi-match cases group expected credits in
`assessment_labels` keyed by flaw and comment pair. Labels stay local to the
smoke runner.

The script writes one CSV row per call with case and settings, latency,
token counts when available, finish reason, answer and reasoning character
counts, validation outcome, rejection reason and detail, and parsed
assessment credits when applicable. Labelled rows include expected credits.
`exact_agreement` is `true` when every expected credit matches on a valid
response and `false` when any differs. It is blank on invalid or unlabelled
rows. Multi-match cases report each attempt, including invalid output retried
within the operation limits. A repeated flaw and comment pair in a rejected
assessment is identified as `duplicate_pair`. The CSV omits credentials and
raw model text.

### Fake provider and targeted tests

The fake provider has deterministic success, malformed-output and failure scenarios.
Run unit checks without Supabase, and integration checks with the local stack:

```bash
bun run test tests/unit/server/llm tests/unit/llm-internal
bun run db:start
APP_ENV=test AI_PROVIDER=fake bun run test:integration tests/integration/llm
bun run test:integration tests/integration/auth tests/integration/domain
```

The integration harness obtains local configuration in memory, rejects non-loopback
services, commits synthetic fixtures to race independent database connections and
cleans up its own records. Do not supply hosted credentials or make live model
calls. CI includes LLM tests alongside auth/domain integration with explicit fake
settings. See the
[acceptance interface reference](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/tests/integration/llm/README.md)
for contract signatures; its failing-first execution notes describe the G2 baseline.
Full verify, production build and browser journeys remain human G4 checks.

## Deployment

| Workflow | Trigger | GitHub environment | What it deploys |
| --- | --- | --- | --- |
| `deploy-dev.yml` | Push to `master` or manual run | `development` (only allows `master`) | Vercel Preview with the development alias |
| `deploy-prod.yml` | Push of a `v*` tag | `production` (waits for approval) | Vercel Production; the tagged commit must be on `master` |

Cut releases by creating a `v*` tag through a GitHub release targeting `master`.

Migrations apply first, then the application builds and deploys; a later
failure does not roll migrations back.

Configure these secrets and variables in each GitHub environment:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `VERCEL_TOKEN` | Token scoped to the Vercel project; authenticates the Vercel pull, build, deploy and development alias steps |
| Secret | `SUPABASE_DB_URL` | Database connection string for that environment's migration step |
| Variable | `VERCEL_ORG_ID` | Selects the Vercel organisation |
| Variable | `VERCEL_PROJECT_ID` | Selects the Vercel project |

In Vercel, configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ENV` and
`AI_PROVIDER` for Preview and Production. Preview uses `lgtm-dev` and
Production uses `lgtm-prod`. Keep `SUPABASE_SECRET_KEY` server-only. For live
SoCLaaS, follow [Provider configuration](#provider-configuration) and set the
server-only `SOCLAAS_API_KEY` in the Vercel environment that opts in.

`vercel.json` selects Singapore (`sin1`), disables Git-triggered deployments,
and configures no cron jobs.

## Product site (GitHub Pages)

The product page is `docs/index.md`. Keep its description of LGTM and its
three roles aligned with [the README](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/README.md), which is the source of
truth for product information.

GitHub Pages builds the site with its built-in Jekyll build and the
[Just the Docs remote theme](https://github.com/just-the-docs/just-the-docs/releases/tag/v0.12.0),
pinned to `v0.12.0` with `color_scheme: dark` in `docs/_config.yml`. The
`jekyll-remote-theme` plugin loads the theme; `jekyll-relative-links` converts
relative Markdown links to their published URLs. No Gemfile, application
build or custom deployment workflow is needed.

Both `docs/index.md` and `docs/DeveloperGuide.md` are rendered on the site.
Their front matter sets `layout: default`, a navigation `title` and
`nav_order` (1 for the product page, 2 for the guide). Use relative Markdown
links within `docs/` so they work on GitHub and the site; use full GitHub URLs
for links to repository files outside `docs/`.

{% raw %}
In any `docs/` Markdown, wrap literal `{{` and `{%` in
`{% raw %}`...<code>&#123;% endraw %&#125;</code>, even inside code blocks;
otherwise Jekyll may silently drop them or break the build.
{% endraw %}

After the site files reach `master`, a repository maintainer must configure
**Settings → Pages → Build and deployment**:

1. Set **Source** to **Deploy from a branch**.
2. Set **Branch** to **master** and the folder to **/docs**.
3. Click **Save**.

These are repository settings, not options in `_config.yml`. See GitHub's
[publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
Subsequent changes to `docs/` on `master` trigger GitHub's Pages build. Use the
published URL shown in Pages settings. Do not add a `.nojekyll` file, which
would bypass Jekyll processing.

## Agent workflow

Start feature work in a human-led main session with
[sdd-orchestrate](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills/sdd-orchestrate/SKILL.md).
The orchestrator routes work, checks gates itself and maintains the
feature handoff. Specialists return evidence, never write their own handoffs
or spawn more agents. Humans own commits and PRs.
After each stage, the orchestrator records the agent's rollout token total
in the handoff (or `unavailable`), and at close-out records its own session total.
Use [`--per-turn`](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/rollout-summary.ts#L6) for per-response token records.

Low handles copy, styling, docs and comments without behaviour changes in the
main session, with targeted checks and no handoff. Standard handles behaviour
on existing foundations: main-session tests and implementation, independent
reviewer, then main-session docs. High uses every specialist for auth/session/
role work, database enforcement, privileged access, AI/SEC work or CI/deploy
changes. The planner proposes routes; actual changes can escalate them. Only
a human can downgrade with a recorded reason.

The loop is Ready → Plan → Tests → Implement → Review → Docs → Close-out.
G1 approves and commits the plan in the feature's own PR; G2 reads and commits
failing acceptance tests before code; G3 resolves blocked work or decisions;
G4 runs `bun run verify` and `bun run test:e2e`, commits, logs and opens the PR.
Existing tasks skip planning. Agent checks use targeted tests, lint and
typecheck because full verify is unreliable inside agent sessions. Tests use
local Supabase and the fake LLM provider. The orchestration skill owns the
gate messages, fix-round limit and human commit sequence.

This uses **orchestrator–subagent** coordination for the loop and
**generator–verifier** coordination between implementer and reviewer. On high,
correctness and security reviewers run in parallel and write nothing. Each
gets fresh context without the parent conversation or handoff, so findings
come from code and tests. Before and after reviews, the orchestrator compares
tree hashes: a sandbox label or a report cannot establish that no files
changed. A mismatch invalidates the review and stops for a human.

Every task's Reads names exact spec headings and story files. Each specialist
skill adds its fixed reading set; agents extract those sections rather than
loading complete specs. Spawn prompts place fixed instructions before task
values to share a cacheable prefix. Sessions without spawning follow the same
stages themselves and request fresh review sessions at the review gate.

All roles use `gpt-6.1-sol` for consistent model behaviour. Effort follows the
work: planner high for decomposition and capacity decisions; test-writer,
implementer and reviewer medium for bounded code work; security-reviewer high
for access and adversarial paths; docs low for checked guide updates. Low-route
main-session work uses low effort.

Reviewer files request a read-only sandbox, but the workflow does not rely
on it. The orchestrator's before/after tree comparison is the check.

| File or location | Purpose |
| --- | --- |
| [workflow/PLAN.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/PLAN.md) | Task format, capacity and role groups; planner adds approved feature tasks. |
| [workflow/templates/handoff.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/handoff.md) | Template for each feature's coordination record. |
| `workflow/handoffs/<issue>-<slug>.md` | Per-feature route, stages, decisions, findings and next action; created when a standard/high feature starts. |
| [workflow/templates/story-spec.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/templates/story-spec.md) | Shared format for story specifications. |
| [workflow/specs/README.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/README.md) | Spec boundaries, identifiers and reading conventions. |
| [workflow/specs/PRODUCT-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/PRODUCT-SPEC.md) | Product decisions, story allocation and UI vocabulary. |
| [workflow/specs/TECHNICAL-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/TECHNICAL-SPEC.md) | SYS requirements. |
| [workflow/specs/INTEGRATION-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/INTEGRATION-SPEC.md) | Data, contracts, fixtures and integration verification. |
| [workflow/specs/AI-SECURITY-SPEC.md](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/AI-SECURITY-SPEC.md) | SEC requirements and attack surfaces. |
| [workflow/specs/stories/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/specs/stories/) | One file per story, using the shared story template. |
| [workflow/scripts/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/workflow/scripts/) | `rollout-summary.ts`: session-log metadata CLI; `rollout-files.ts`: safe rollout discovery and selection; `rollout-parser.ts`: projects records into approved summary fields. |
| [.codex/config.toml](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/config.toml), [.codex/agents/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.codex/agents) | Agent limits and the six specialist definitions. |
| [.agents/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.agents/skills) | Canonical procedures: sdd-orchestrate, sdd-plan, sdd-test, sdd-implement, sdd-review, sdd-security-review and sdd-docs. |
| [.claude/skills/](https://github.com/CS3227-2610-MP4-LGTM/CS3227-2610-MP4/blob/master/.claude/skills) | Matching pointer stubs for Claude Code. |

## Acknowledgements

The application was scaffolded with `create-next-app`.
