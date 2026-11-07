# TA-01 — Inspect submissions

## Story

As a TA, I want to inspect submissions, comments and assessments so that I can
review learner work.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [TA-01 allocation](../PRODUCT-SPEC.md#ta),
  [grading](../PRODUCT-SPEC.md#grading) and
  [navigation](../PRODUCT-SPEC.md#5-navigation-and-ui).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert evidence; [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks)
  for code/diff display;
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  and [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit)
  for protected, retained moderation evidence;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for accessible UI.
- **Security:** None; this story reads stored evidence and starts no AI operation.
- **Contracts:** [Shared bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds),
  [code and locations](../INTEGRATION-SPEC.md#code-proposals-and-locations),
  [transport and pagination](../INTEGRATION-SPEC.md#transport-concurrency-and-errors),
  [response types](../INTEGRATION-SPEC.md#shared-response-types),
  [TA surface](../INTEGRATION-SPEC.md#ta-surface) and
  [matching and score](../INTEGRATION-SPEC.md#matching-and-score).
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  role navigation, list empty states and access recovery;
  [TA-02](TA-02-resolve-flagged-submissions.md) owns flag resolution;
  [TA-03](TA-03-override-a-grade.md) owns grade overrides.

## Acceptance criteria

- **TA-01.1:** Given a usable signed-in TA account, opening `/ta/submissions`
  shows “Submissions” and ACC-03 navigation. Each attempt has its own row with
  “Learner”, “Challenge”, “Attempt”, “Submitted”, “Grading status”, “Effective
  score”, “Open flags” and “View submission”. The latter opens
  `/ta/submissions/:submissionId`. Learners are identified by display name and
  ID, never email. Times include date, time and timezone. An empty unfiltered
  list uses ACC-03's “No submissions yet.”
- **TA-01.2:** “Learner ID” and “Challenge ID” are optional filters; “Grading
  status” offers “All”, “Pending”, “Running”, “Failed” and “Completed”. “Apply
  filters” applies all entries and resets the cursor; “Clear filters” restores
  the unfiltered first page. An invalid ID shows “Enter a valid ID.” beside its
  field without applying filters. No matches shows “No submissions match these
  filters.” with “Clear filters”. Applied filters and cursor are retained in the
  URL so reload/back restores the requested list.
- **TA-01.3:** Lists follow the shared page bound and ordering. “Next page” is
  available only for a nonnull nextCursor; cursor pages offer “First page”,
  retaining filters. During reads show “Loading submissions…” and disable page
  controls. Failure shows “We couldn't load submissions. Try again.” with “Try
  again” for the same query. An invalid cursor shows “This submissions page isn't
  valid.” with “First page”. A failure never appears as an empty list.
- **TA-01.4:** On submission detail, show “Submission”, learner display name and
  ID, challenge title, attempt number, submitted time, and “Back to submissions”.
  Show the pinned working-to-flawed code diff, final line numbers, every comment
  in submitted order and the private answer key from TaSubmissionView. Each
  answer identifies category, source/final location, original/replacement snippet,
  explanation and fix. “No comments submitted.” is a valid empty review. Reads
  never execute code or allow editing submission content or answers.
- **TA-01.5:** For completed grading, “Original assessment” shows original score
  out of 100, pass mark, pass/fail, component points, matched/missed counts and
  every comment's matching status, credits and feedback when present. Show
  private matching and per-flaw assessment evidence, including missed flaws and
  duplicate/unmatched comments, according to the matching contract. Missing
  feedback or unassessed credits show “Not assessed”, not invented feedback or
  credit. “Current grade” separately shows effective score, pass/fail and source
  “Original AI assessment” or “TA override”. Override history follows TA-03;
  flags and resolutions follow TA-02.
- **TA-01.6:** Pending, running and failed grading are labelled “Pending”,
  “Running” and “Failed” on list and detail. Their score is “Not available”;
  detail states “Assessment not available.” and offers “Refresh submission”.
  Completed zero scores remain `0 / 100`. Refresh rereads stored state without
  starting grading. Code, submitted comments and available moderation evidence
  remain readable even without a completed grade.
- **TA-01.7:** Detail loading shows “Loading submission…”. Read failure shows
  “We couldn't load this submission. Try again.” with “Try again” and “Back to
  submissions”. An absent record shows “Submission not found.” with the back
  link. Session, role and forbidden-record failures use ACC-03, including no
  automatic replay. No failed read reveals another account's protected content.
- **TA-01.8:** A submission remains inspectable after challenge editing,
  republication, unpublishing or archiving, using its pinned revision and
  retained original assessment. Links from the flagged queue or learner detail
  open this same evidence. Learner detail uses “Back to learner” to return to
  `/ta/learners/:learnerId`; queue entry uses “Back to flagged submissions” to
  `/ta/flags`. “Back to submissions” is always available; navigation starts no
  moderation action.

## Use cases

### UC-TA-01-1 — Inspect an attempt

**Actor:** TA

**Preconditions:** Usable signed-in TA account; a submission exists in scope.

**Trigger:** Open “Submissions” or a supporting submission link.

1. The TA filters/pages the list and activates “View submission”.
2. The detail presents the pinned diff, comments and answer key.
3. The TA compares matching and original assessment with the current grade.
4. The TA continues to TA-02/TA-03 or returns using the labelled back link.

**Alternate paths:** Empty/filter results follow TA-01.1–2; incomplete grading
follows TA-01.6; historical submissions follow TA-01.8.

**Failure paths:** List failure follows TA-01.3; missing/unavailable detail and
access recovery follow TA-01.7.

**Postconditions:** Inspection changes no submission, answer, grade or flag.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Two attempts on the same challenge | Separate rows and evidence under TA-01.1 and TA-01.4. |
| Zero comments or all comments unmatched | TA-01.4–5 retains the complete review and matching evidence. |
| Completed zero versus failed grading | TA-01.6 distinguishes a score from unavailable grading. |
| Challenge has a newer revision or is archived | TA-01.8 retains the submitted revision. |
| Filter changes while on a later page | TA-01.2 resets pagination to the matching first page. |

## UI notes

Use SYS-04's shared code/diff renderer with labelled, keyboard-scrollable regions.
Keep original assessment, current grade, private answer evidence and moderation
history distinct. Use text for statuses, not colour alone. Associate filter
errors with inputs, announce pending/failure states and focus the main heading
after navigation under SYS-17. Lists stack readably at phone width. Treat code,
names, comments and assessment text as inert content.
