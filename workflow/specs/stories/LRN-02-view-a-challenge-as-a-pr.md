# LRN-02 — View a challenge as a PR

## Story

As a Learner, I want to view a challenge as a PR with description, code and diff so
that I can understand the proposed change.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [LRN-02 allocation](../PRODUCT-SPEC.md#learner) and
  [navigation and UI](../PRODUCT-SPEC.md#5-navigation-and-ui).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for inert code;
  [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for the shared view;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for access failures;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for visibility;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for accessibility.
- **Security:** No SEC dependency; viewing challenge material calls no model.
- **Contracts:** [Immutable published revisions](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions)
  for live versus historical access;
  [code, proposals and locations](../INTEGRATION-SPEC.md#code-proposals-and-locations)
  for the Learner projection and line numbering;
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  for unavailable records;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types) and
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface) for challenge and own
  attempt reads.
- **Related stories:** [LRN-01](LRN-01-browse-challenges.md) owns catalogue cards;
  [LRN-03](LRN-03-manage-line-comments.md) owns draft comments;
  [LRN-04](LRN-04-submit-a-final-review.md) owns submission;
  [LRN-05](LRN-05-grade-a-submitted-review.md) owns the result;
  [LRN-06](LRN-06-feedback-hints-and-retry.md) owns the retry entry;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns access recovery.

## Acceptance criteria

- **LRN-02.1:** Opening `/learner/challenges/:challengeId` for a permitted live
  challenge shows a PR header with the challenge title as the page heading and
  fields labelled “Description”, “Language”, “Difficulty” and “Flaw categories”.
  Values come from ChallengeView and use product display labels. A “Back to
  challenges” link leads to `/learner/challenges`. No invented repository,
  branch, commit or author identity appears in the PR header.
- **LRN-02.2:** Below the header, one shared SYS-04 region labelled “Source” shows
  the Learner new-file projection from the integration contract, including its
  derived display path and line numbers. It exposes no working code, true
  before/after change, private annotations, answer locations, fixes or
  pre-submission hints.
- **LRN-02.3:** Code and header text render inert under SYS-02. Source resembling
  scripts, markup, URLs or imports is displayed as text and cannot run or fetch
  resources. There is no run, build or execute action. LRN-03's comment controls
  sit beside eligible numbered lines in this region under the location contract.
- **LRN-02.4:** For a Learner with no first attempt on this challenge, a successful
  load opens the review workspace with LRN-03 comment controls and LRN-04's
  submission action. Opening the workspace itself creates no attempt. The
  displayed live revision is the one used by the eventual first submission;
  a later publication cannot silently replace the code under an open review.
  LRN-04 owns the stale-revision outcome at submission.
- **LRN-02.5:** If the Learner already has a first attempt on this challenge,
  including one pending or failed grading, the page instead shows “You have
  already submitted a review of this challenge.” and “View first attempt” to
  `/learner/history/:submissionId` for that attempt. It offers no new first-review
  editor or submission action. This rule spans revisions and also applies when
  a second attempt exists; eligible retry entry belongs to LRN-06 on the result.
- **LRN-02.6:** Loading challenge material and checking for an existing attempt
  shows “Loading challenge…” with no editable review until both checks succeed.
  A non-access read failure shows “We couldn't load this challenge. Try again.”
  and “Try again”, which repeats both checks at the same URL. A failed history
  check cannot be treated as proof that no attempt exists.
- **LRN-02.7:** A missing challenge shows “Challenge not found” and “We couldn't
  find this challenge.” with “Back to challenges”. An existing unpublished or
  archived challenge is unavailable through this live URL and follows ACC-03.5's
  forbidden-record screen, without a review editor. Historical access remains
  through LRN-08, not through a fallback old revision at this URL. Other account
  and access failures follow ACC-03.

## Use cases

### UC-LRN-02-1 — Inspect a PR before reviewing

**Actor:** Learner

**Preconditions:** Usable signed-in account; published challenge visible to it.

**Trigger:** Activate “View challenge” or open the detail URL directly.

1. The Learner waits for the challenge and existing-attempt checks.
2. The PR header and labelled source region appear.
3. The Learner examines the source in its Learner new-file projection.
4. A new reviewer continues through LRN-03 and LRN-04; an existing reviewer uses
   “View first attempt” to reach LRN-05.

**Alternate paths:** “Back to challenges” returns to the catalogue. Existing
attempts always follow LRN-02.5 rather than opening another first review.

**Failure paths:** Read failures follow LRN-02.6; missing and unavailable challenges
follow LRN-02.7. Session expiry and role/record denial follow ACC-03.

**Postconditions:** Viewing creates no submission and exposes only the Learner
projection. Any draft is governed by LRN-03; existing attempts remain unchanged.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| First attempt exists against an older revision | LRN-02.5 links to that attempt, not a new first review. |
| New publication while a review is open | LRN-02.4 retains the opened code; LRN-04 handles submission conflict. |
| No trailing LF, or source with a trailing LF | LRN-02.2 follows the contract's line convention without inventing a line. |
| Source contains executable-looking markup | LRN-02.3 displays it without execution or external requests. |
| Challenge removed from discovery after opening | A fresh detail read uses LRN-02.7; submission uses LRN-04. |

## UI notes

Keep the PR header above the single “Source” region and show its derived path.
Line controls remain keyboard reachable and source scrolling must not displace
review actions under SYS-17. Focus the page heading after entry; announce
loading and failures. Review controls and submitted-result controls belong to
the linked stories, not separate PR journeys in this story.
