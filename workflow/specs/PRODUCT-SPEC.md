# LGTM product specification

## 1. Product overview

LGTM is a code review academy for people learning to review code, people authoring
review exercises, and teaching assistants supporting that learning. Learners review
pull requests with planted flaws and receive AI-graded feedback. Authors turn working
code into challenges through AI flaw injection. TAs moderate AI grades and see where
learners struggle through AI performance summaries. Submitted code is displayed,
never executed, under [SYS-02](TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code).

The learning loop is to practise identifying a problem, explain its consequences,
propose an actionable fix, and use feedback to improve the next review.

## 2. Roles

- **Learner:** Finds an appropriate challenge, reads its proposed changes, writes
  review comments and submits a final review. Uses grades, feedback, hints and
  review history to improve.
- **Author:** Supplies working code, configures the intended flaws, evaluates AI
  proposals and publishes a coherent exercise. Maintains the challenge catalogue
  through edits, unpublishing and archiving.
- **TA:** Reviews submissions and flags, corrects assessments with reasons, and
  uses learner summaries and category progress to guide further practice.

Access rules and historical preservation have their sole definition in
[SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit). Account journeys are
defined by the shared stories below.

## 3. Story index

**Must** stories are required for the core learning and moderation loop. **Should**
stories extend that loop with additional learning support. AI is **Yes** for AI
generation or a dedicated AI-result interaction; ordinary record browsing and
human moderation do not by themselves make a story an AI story.

### Shared accounts

| ID | Story | Priority | AI |
| --- | --- | --- | --- |
| [ACC-01](stories/ACC-01-sign-up-with-a-role.md) | As a new user, I want to sign up with a role so that I can enter the appropriate workspace. | Must | No |
| [ACC-02](stories/ACC-02-sign-in-and-sign-out.md) | As an account holder, I want to sign in and sign out so that I can start and end access in this browser. | Must | No |
| [ACC-03](stories/ACC-03-role-based-landing-and-navigation.md) | As a signed-in user, I want a role-based landing page and navigation so that I can reach my work. | Must | No |

### Learner

| ID | Story | Priority | AI |
| --- | --- | --- | --- |
| [LRN-01](stories/LRN-01-browse-challenges.md) | As a Learner, I want to browse challenges by language, difficulty and flaw category so that I can choose relevant practice. | Must | No |
| [LRN-02](stories/LRN-02-view-a-challenge-as-a-pr.md) | As a Learner, I want to view a challenge as a PR with description, code and diff so that I can understand the proposed change. | Must | No |
| [LRN-03](stories/LRN-03-manage-line-comments.md) | As a Learner, I want to add, edit and remove line comments before submission so that I can develop my review. | Must | No |
| [LRN-04](stories/LRN-04-submit-a-final-review.md) | As a Learner, I want to submit a final review that locks its comments so that my assessment is based on a fixed attempt. | Must | No |
| [LRN-05](stories/LRN-05-grade-a-submitted-review.md) | As a Learner, I want my submitted review graded using location matching and AI assessment so that I can measure my review quality. | Must | Yes |
| [LRN-06](stories/LRN-06-feedback-hints-and-retry.md) | As a Learner, I want feedback, eligible hints and one retry so that I can learn from missed flaws without seeing answers. | Must | Yes |
| [LRN-07](stories/LRN-07-report-an-unmatched-comment.md) | As a Learner, I want to report an unmatched comment that I believe identifies a real issue absent from the answer key so that a TA can review it. | Must | No |
| [LRN-08](stories/LRN-08-review-history.md) | As a Learner, I want review history showing both attempts, grades and moderation outcomes so that I can track my learning. | Should | No |

### Author

| ID | Story | Priority | AI |
| --- | --- | --- | --- |
| [AUT-01](stories/AUT-01-create-a-draft.md) | As an Author, I want to create a draft with title, description, language, difficulty and pasted working code so that I can prepare a challenge. | Must | No |
| [AUT-02](stories/AUT-02-configure-flaws.md) | As an Author, I want to configure flaw count, categories and difficulty so that the exercise targets the intended skills. | Must | No |
| [AUT-03](stories/AUT-03-generate-flaw-proposals.md) | As an Author, I want AI to propose flaws and their answer key together so that the exercise and assessment agree. | Must | Yes |
| [AUT-04](stories/AUT-04-preview-and-decide-flaws.md) | As an Author, I want to preview the code and diff and approve or reject each flaw so that I control the final exercise. | Must | Yes |
| [AUT-05](stories/AUT-05-publish-a-challenge.md) | As an Author, I want to publish an approved challenge with its generated hints ready so that Learners can practise it. | Must | Yes |
| [AUT-06](stories/AUT-06-maintain-challenges.md) | As an Author, I want to edit, unpublish and archive challenges so that I can maintain the catalogue while preserving past attempts. | Must | No |

### TA

| ID | Story | Priority | AI |
| --- | --- | --- | --- |
| [TA-01](stories/TA-01-inspect-submissions.md) | As a TA, I want to inspect submissions, comments and assessments so that I can review learner work. | Must | No |
| [TA-02](stories/TA-02-resolve-flagged-submissions.md) | As a TA, I want a flagged-submission queue with reasons and resolution history so that I can resolve cases needing moderation. | Must | No |
| [TA-03](stories/TA-03-override-a-grade.md) | As a TA, I want to override a grade with a justification so that I can correct an assessment transparently. | Must | No |
| [TA-04](stories/TA-04-learner-performance-summary.md) | As a TA, I want an AI learner performance summary of recurring strengths and blind spots so that I can focus my support. | Must | Yes |
| [TA-05](stories/TA-05-category-progress-and-recommendations.md) | As a TA, I want progress per flaw category and rule-based challenge recommendations so that I can guide each learner's next practice. | Should | No |

## 4. Product decisions

### Flaw proposals and answer keys

Flaw injection proposes discrete flaws. Each proposal contains a category, original
and replacement snippet, explanation and fix. Rejecting a flaw excludes its change
from the challenge. The answer key comes from the same proposal output and contains
only the flaws retained in the published exercise. AUT-03–AUT-05 own the associated
journeys; output schemas belong to `INTEGRATION-SPEC.md`.

### Hints and attempts

Hints are written once per flaw when a challenge is published, never per learner.
They give neither the flaw's exact location nor its fix. A Learner sees hints only
after submitting, for flaws that attempt missed, within
[SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit). Publication completes only
when all required hints are available. A Learner may retry a challenge once. The
retry is graded separately and both attempts are retained; the first attempt counts
for TA category progress and recommendations. LRN-06 owns this journey. Hint
schemas and publication consistency belong to `INTEGRATION-SPEC.md`; AI controls
and limits belong to `AI-SECURITY-SPEC.md`.

### Grading

A grade weights identification at 50%, explanation at 30% and an actionable fix at
20%. Identification is determined by matching a comment's location to a flaw's
location within a tolerance. Only one comment counts per flaw; additional comments
on that flaw earn no extra credit. Comments that match no flaw reduce identification
credit. A Learner who believes an unmatched comment identifies a real issue can
report it through LRN-07. AI judges only the explanation and fix of matched
comments. Grades are computed on the server and presented as a score out of 100,
with the pass mark and a pass/fail outcome. Matching tolerance, comment selection,
the scoring formula including unmatched-comment penalties, aggregation, rounding
and the pass-mark value belong to `INTEGRATION-SPEC.md`. LRN-05 owns the grading
journey; [SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit) owns the effect
and history of TA overrides.

### Moderation flags

Rules flag a submission when its score is near the pass mark, grading needed a
retry to obtain valid AI output, location matching and AI judgement disagree, or
the Learner reports an issue absent from the answer key. The grading-output retry
is distinct from the Learner's challenge retry. TA-02 owns queue review and
resolution. The flagging rule's grade boundary is the pass mark. Proximity to that
mark and disagreement definitions belong to
`INTEGRATION-SPEC.md`; retry limits belong to `AI-SECURITY-SPEC.md`.

### Recommendations

TA challenge recommendations are rule-based: select the learner's weakest flaw
categories, then challenges the learner has not attempted. They do not use AI.
TA-05 owns the progress and recommendation journey; tie-breaking and category
progress contracts belong to `INTEGRATION-SPEC.md`.

### Challenge input

Challenges accept only Python, Java, JavaScript and TypeScript, supplied as pasted
code. A size cap applies; its value and measurement belong to `INTEGRATION-SPEC.md`.

### Shared vocabularies

Authoring, discovery and reporting share the difficulty values **Easy**, **Medium**
and **Hard**, and the flaw categories **Logic bug**, **Edge case**, **Error handling**,
**Security** and **Performance**. `INTEGRATION-SPEC.md` only encodes these product
vocabularies.

## 5. Navigation and UI

The UI uses labelled actions, short forms, readable lists and clear empty, pending
and failure states. Account screens and exact role destinations belong to
[ACC-01](stories/ACC-01-sign-up-with-a-role.md),
[ACC-02](stories/ACC-02-sign-in-and-sign-out.md) and
[ACC-03](stories/ACC-03-role-based-landing-and-navigation.md).

| Role | Main screens and movement |
| --- | --- |
| Learner | Challenge catalogue → PR review → submission result and feedback. The result offers eligible learning actions. Review history → attempt detail returns to a previous result; catalogue navigation remains available. |
| Author | Challenge list → new draft → flaw configuration → proposal preview → publication result. Existing challenge detail offers editing and lifecycle actions, then returns to the list. |
| TA | Submission list or flagged queue → submission detail → grade assessment and flag resolution. Learner list → learner detail combines category progress, recommendations and the performance summary, with links to supporting submissions. |

All roles use one shared code and diff view under
[SYS-04](TECHNICAL-SPEC.md#sys-04--shared-building-blocks). Surrounding controls suit
the task: Learners comment, Authors evaluate proposals, and TAs inspect review
evidence. Shared rendering does not change record visibility under
[SYS-12](TECHNICAL-SPEC.md#sys-12--record-access-and-audit). No execution controls or
mockups form part of this specification.

## 6. Top-level use cases

These paths connect the indexed stories; detailed alternate and failure paths
belong to each story.

- **Learner:** Create an account or sign in → browse by practice needs → open a PR →
  add comments → submit → receive a grade and feedback → use eligible learning
  actions → revisit the attempt in history.
- **Author:** Create an account or sign in → create a draft → configure flaws →
  request proposals → inspect and decide each proposal → publish → maintain the
  challenge through its lifecycle.
- **TA:** Sign in → inspect the flagged queue → open a submission and supporting
  evidence → retain or override the grade with a reason → resolve the flag → review
  learner progress, summary and recommendations.
- **Connected path:** An Author publishes a challenge → a Learner reviews and
  submits it → grading produces a rule-based flag → a TA inspects the submission,
  records any justified override and resolves the flag → the Learner sees the
  effective assessment and moderation history in the submission result.

## 7. Non-functional requirements

The shared baseline is [TECHNICAL-SPEC section 6](TECHNICAL-SPEC.md#6-non-functional-requirements),
including security, accessibility, resource use, tests and code quality. This
product spec adds two observable learning requirements:

- Assessment displays distinguish a pending or failed grade from a completed
  grade; unavailable grading never appears as a zero score.
- Learner-facing feedback separates earned credit, missed criteria and next
  learning actions, without exposing private answer material. Moderation outcomes
  are visibly distinguished from the original AI assessment.

## 8. Out of scope and assumptions

The exclusions in [TECHNICAL-SPEC section 7](TECHNICAL-SPEC.md#7-out-of-scope) apply.
LGTM additionally excludes running code-based tests for learners, automatic fixes
applied to learner work, public leaderboards and a general-purpose AI chat tutor.

- **ASM-01:** Authors provide working source code suitable for an exercise;
  LGTM does not establish correctness by running it.
- **ASM-02:** This product uses the single learning space and email-independent
  access assumptions in [TECHNICAL-SPEC section 1](TECHNICAL-SPEC.md#1-purpose-boundaries-and-assumptions).
