---
layout: default
title: User Guide
nav_order: 2
---

# LGTM User Guide

LGTM is a code review academy. Learners review code with planted flaws and get
AI-graded feedback. Authors turn working code into review challenges. TAs check
grades and support learners.

This guide is for peer testers using the deployed app at
<https://lgtm-cs3227.vercel.app>.

## Contents

- [Getting started](#getting-started)
- [Navigating LGTM](#navigating-lgtm)
- [Learner guide](#learner-guide)
- [Author guide](#author-guide)
- [TA guide](#ta-guide)
- [AI features](#ai-features)
- [Usage limits](#usage-limits)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## Getting started

### What you need

- A current web browser with JavaScript turned on.
- An email address. LGTM doesn't send a confirmation email.
- A password of at least 6 characters.

To try every role, create one account per role. Each account needs its own
email address.

### Create an account and choose a role

1. Open <https://lgtm-cs3227.vercel.app>. You arrive at **Sign in**.
2. Select **Create an account**.
3. Enter a **Display name** of up to 80 characters. Other users may see it.
4. Enter your **Email** and a **Password** of at least 6 characters.
5. Under **Role**, choose one:
   - **Learner — Practise reviewing code**
   - **Author — Create review challenges**
   - **TA — Moderate grades and support learners**
6. Select **Create account**. The button shows **Creating account…** while it
   works.

You can't change your role after you create the account.

**Success:** your workspace opens with the notice **Account created.** If you
see **Account created. Sign in to continue.** instead, sign in with the same
email and password.

**Next:** see [What you see after signing in](#what-you-see-after-signing-in).

### Sign in

1. Open <https://lgtm-cs3227.vercel.app>.
2. Enter your **Email** and **Password**.
3. Select **Sign in**.

**Success:** your role's first screen opens. Signing in always takes you
there, even if you were on another page before.

If you aren't signed in and open a workspace page, LGTM shows **Sign in** with
**Sign in to continue.** When your session ends, you see **Your session has
expired. Sign in again.**

### Sign out

1. Select **Sign out** at the top of any workspace page.

**Success:** **Sign in** opens with **You have signed out.**

If you have unsaved review comments, LGTM asks you first. See
[Unsaved review comments](#unsaved-review-comments).

### The three roles at a glance

| Role | What you do |
| --- | --- |
| Learner | Browse published challenges, comment on lines of code, submit a review, read your grade and feedback, use hints, retry once and report comments you think were marked wrongly. |
| Author | Create a draft from working code, ask AI to propose flaws, approve or reject each one, preview the result and publish it for Learners. |
| TA | Inspect any submission with its private answer key, work through flagged submissions, override grades, resolve flags and read each learner's progress and AI summary. |

## Navigating LGTM

### What you see after signing in

The bar at the top of every workspace page shows **LGTM.**, your role's links,
your display name, your role and **Sign out**. Select the **LGTM** logo to
return to your first screen.

| Role | First screen | Links in the top bar |
| --- | --- | --- |
| Learner | **Challenges** | **Challenges**, **Review history** |
| Author | **My challenges** | **My challenges**, **Create challenge** |
| TA | **Submissions** | **Submissions**, **Flagged submissions**, **Learners** |

### Move between screens

Use the top bar to move between your role's main screens. Each screen also
has links back to where you came from, such as **Back to challenges** or
**Back to submissions**. Your browser's back and forward buttons also work.

Long lists show **Next page** and **First page**. The Author's challenge list
uses **Load more** instead.

### The code view

All roles see code in the same read-only view. Each line shows its line
numbers and a marker: **+** for an added line and **−** for a removed line.

- Learners see the challenge code as one new file, so every line is marked
  **+**. Line numbers in comments refer to the right-hand number.
- Authors see the real changes between their working code and the flawed
  code.

### Unsaved review comments

Review comments live only on the page until you submit them. If you try to
leave a review that has comments, LGTM shows **Leave this review?** with
**Your unsaved comments will be lost.**

- Select **Keep reviewing** to stay.
- Select **Leave review** to discard the comments and continue.

This applies to the top-bar links, **Sign out** and the browser's back button.
Reloading or closing the tab shows your browser's own warning instead.

### When LGTM cannot confirm an action

Sometimes LGTM sends a request but can't tell whether it finished, for
example after a network drop. It then shows a message such as **We couldn't
confirm submission.** and a **Check** button, such as **Check submission**,
**Check save**, **Check report**, **Check generation** or **Check
publication**.

Select the **Check** button before you change anything. It looks up the same
request and never does the action twice.

### Access and account screens

| Screen | What it means | What to do |
| --- | --- | --- |
| **Access denied** — **This page isn't available for your role.** | The page belongs to another role. | Select **Go to my workspace**. |
| **Access denied** — **This item isn't available to your account.** | The item belongs to someone else. | Select **Go to my workspace**. |
| **Account unavailable** — **We couldn't load a valid account profile.** | Your account profile couldn't be read. | Select **Try again**. If it persists, select **Sign out** and report it. |
| **Service unavailable** — **We can't check your account right now. Try again.** | The account service didn't respond. | Select **Try again**, or **Sign out**. |

## Learner guide

### Find a challenge

1. Select **Challenges** in the top bar.
2. Narrow the list with **Language**, **Difficulty** and **Flaw category**.
   The list updates as you choose.
3. On a challenge card, select **View challenge**.

Each card shows the description, language, difficulty and flaw categories.
Languages are Python, Java, JavaScript and TypeScript. Difficulties are Easy,
Medium and Hard. Flaw categories are Logic bug, Edge case, Error handling,
Security and Performance.

To reset the filters, select **Clear filters**. If nothing matches, you see
**No challenges match these filters.** If no challenges are published yet, you
see **No challenges available.**

**Next:** [Review a challenge](#review-a-challenge).

### Review a challenge

The challenge page shows the title, description, metadata and the code.

1. Find a line you think has a problem.
2. Move the pointer over the line to show the **+** control in its gutter,
   then select it. With a keyboard, Tab to **Add comment on line N** and
   press Enter or Space. On devices without hover, the **+** stays visible.
3. Type your comment in **Comment on line N**. Say what is wrong, why it
   matters and how to fix it. Grading rewards all three.
4. Select **Add comment** to save it, or **Cancel**.

To change a comment, select **Edit**, change the text and select **Save
comment**. To delete it, select **Remove**.

You can add up to 50 comments, each up to 2,000 characters. You can add more
than one comment on a line. At 50 comments you see **Comment limit reached.
Remove a comment to add another.**

Comments aren't saved until you submit. See
[Unsaved review comments](#unsaved-review-comments).

**Next:** [Submit your review](#submit-your-review).

### Submit your review

1. Finish or cancel any comment you are editing.
2. Select **Submit review**.
3. The **Submit review?** dialog shows how many comments you wrote and
   **Submitted comments cannot be changed.** With no comments, it also asks
   **You haven't added any comments. Submit an empty review?**
4. Select **Confirm submission**, or **Keep reviewing** to go back.

**Success:** the **Review result** page opens and grading starts.

You can submit each challenge once, plus one retry. If you open a challenge you
have already reviewed, you see **You have already submitted a review of this
challenge.** and **View first attempt**.

**Next:** [Read your result](#read-your-result).

### Read your result

Grading starts by itself when the **Review result** page opens. You see
**Grading pending**, then **Grading your review…**. Stay on the page; it
updates on its own. If you leave first, grading starts the next time you open
the result.

When grading finishes, the page shows:

- **Current grade**: your score out of 100, **Passed** or **Not passed**, and
  whether it comes from the **Original AI assessment** or a **TA override**.
- **Override history** and **Moderation flags**: any TA changes and open or
  resolved flags. See [Grading and moderation flags](#grading-and-moderation-flags).
- **Original assessment**: the AI-graded score, the **Pass mark** of 60,
  **Matched flaws**, **Missed flaws** and the **Component points** for
  **Identification**, **Explanation** and **Actionable fix**.
- **Earned credit**: each of your comments marked **Matched**, **Duplicate** or
  **Unmatched**, with its **Explanation credit**, **Fix credit** and, for
  matched comments, AI **Feedback**.
- **Missed criteria**: matched comments that lost explanation or fix credit,
  and hints for flaws you missed.
- **Next actions**: **Retry challenge**, or the reason you can't retry.

If grading fails, you see **Grading failed. Your review is still saved.** with
the reason. Select **Retry grading** to try again. A failed grade never shows
as a score of zero. See [Troubleshooting](#troubleshooting) for each reason.

**Next:** [Use hints](#use-hints), [Retry a challenge](#retry-a-challenge) or
[Report an unmatched comment](#report-an-unmatched-comment).

### Use hints

Hints appear under **Missed criteria**, grouped by flaw category, for example
**Edge case · 1 missed**. They describe the kind of problem but never its
location or fix.

1. Select **Show hint** for a category.
2. Read the hint. Select **Show hint** again for the next one in that
   category.

When you have seen them all, you see **All hints shown**. If you missed no
flaws, you see **No hints needed for missed flaws.** Hints were written when
the challenge was published, so showing one doesn't use AI.

### Retry a challenge

You get one retry per challenge, after your first attempt is graded.

1. On your first attempt's **Review result**, select **Retry challenge**.
2. The **Retry review** page opens for **Attempt 2**. Your first attempt's
   comments are already filled in.
3. Add, edit or remove comments as in [Review a challenge](#review-a-challenge).
4. Select **Submit review**, then **Confirm submission**.

**Success:** the second attempt's **Review result** opens and grading starts.
Both attempts stay in your history. Your first attempt's result then shows
**You have used your retry.**

### Report an unmatched comment

If grading marked a comment **Unmatched** but you think it found a real
problem, you can ask a TA to look at it. Reporting doesn't change your grade.

1. On the **Review result**, find the comment marked **Unmatched**.
2. Select **Report unmatched comment**.
3. In **Reason**, explain why the comment identifies a real issue. You can use
   up to 2,000 characters.
4. Select **Send report**, or **Cancel**.

**Success:** you see **Report sent. A TA can review this comment.** The
comment shows **Reported**, and a **Learner reported an unmatched comment**
flag appears under **Moderation flags** with **Awaiting TA review.**

You can report each unmatched comment once. **Duplicate** and **Matched**
comments can't be reported.

### Check your review history

1. Select **Review history** in the top bar.
2. Each card shows the **Challenge**, **Attempt**, **Submitted** time in UTC,
   **Grading status**, **Effective score** and **Open flags**.
3. Select **View result** or the challenge title to open that attempt.

With no reviews yet, you see **No reviews yet.** To go back to the catalogue,
select **Browse challenges**.

## Author guide

### Create a draft challenge

1. Select **Create challenge** in the top bar or on **My challenges**.
2. Under **Challenge details**, fill in:
   - **Title**, up to 120 characters.
   - **Description**, up to 4,000 characters. Learners see it.
   - **Language**: Python, Java, JavaScript or TypeScript.
   - **Difficulty**: Easy, Medium or Hard.
   - **Working code**: paste one source file of correct code, up to 20,000
     bytes. Code is displayed, never run.
3. Under **Flaws to inject**, choose a **Flaw count** from 1 to 5 and tick
   one to five **Flaw categories**.
4. Select **Save draft**. Select **Cancel** to leave without saving.

**Success:** **Flaw configuration** opens with **Draft saved.**

**Next:** [Configure flaws](#configure-flaws) or go straight to
[Generate flaw proposals](#generate-flaw-proposals).

### Configure flaws

**Flaw configuration** lets you change **Difficulty**, **Flaw count** and
**Flaw categories** before you generate proposals.

1. Change the fields you want.
2. Select **Save configuration**.

**Success:** you see **Configuration saved.**

If proposals already exist, LGTM asks **Clear the current proposals?** with
**Saving changes clears the current proposals and decisions.** Select **Save
configuration** to go ahead or **Cancel** to keep them. After clearing, you see
**Generate new proposals to continue.**

### Generate flaw proposals

The **AI flaw proposals** section appears on **Flaw configuration**, the
challenge page and **Proposal preview**. It shows the saved flaw count,
categories and difficulty.

1. Save any changes first. Otherwise you see **Save your changes before
   generating proposals.**
2. Select **Generate proposals**. You see **Generating proposals…**.

**Success:** **Proposal preview** opens with **Proposals generated. Review
every proposal before publishing.**

If proposals already exist, LGTM asks **Replace the current proposals?** with
**New proposals replace the current proposals and reset their decisions.**
Select **Generate new proposals** or **Cancel**.

Generation uses AI and counts toward your [usage limits](#usage-limits). See
[Flaw proposals](#flaw-proposals) for what it does and how it fails.

### Approve or reject proposals

On **Proposal preview**, each proposal shows its category, its **Source** line
range in your working code, the **Original code**, the **Replacement code**, an
**Explanation** and a **Fix**.

1. Read each proposal.
2. Select **Approve** to keep it or **Reject** to drop it. You see **Saving
   decision…**, then **Decision:** shows **Approved** or **Rejected**.
3. You can change a decision at any time before you publish.

Until every proposal has a decision, you see **Decide every proposal to
preview the final challenge.** If you reject them all, you see **Approve at
least one proposal to preview or publish.**

### Preview the final challenge

1. When every proposal has a decision and at least one is approved, select
   **Preview final challenge**.

**Success:** **Final challenge preview** shows your working code compared with
the flawed code Learners will review. The **Answer key** lists each kept flaw
with its category, line range, explanation and fix. Learners never see the
answer key.

Changing a decision hides the preview. Select **Preview final challenge**
again.

### Publish a challenge

The **Publication** section appears under the final preview. It shows the
number of **Retained flaws** and their **Flaw categories**.

1. Select **Publish challenge**. You see **Preparing hints and publishing…**.

**Success:** **Publication result** opens with **Challenge published.** and
the revision number and time. Learners can now find the challenge.

From there:

- Select **View published challenge** to see the published code changes,
  answer key and the hint for each flaw.
- Select **Back to challenges** to return to your list.

Publishing uses AI to write the hints and counts toward your
[usage limits](#usage-limits). The challenge isn't published until every hint
is ready. See [Hints at publication](#hints-at-publication).

### Find and edit your challenges

**My challenges** lists your challenges with their **Status**, **Language** and
**Difficulty**. Use the **Status** filter to show one status, and **Clear
filter** to show all.

1. Select **View challenge** to open a challenge. It shows its details, the
   **Working draft code** and the **AI flaw proposals** section.
2. Select **Edit draft** to change any field, then **Save changes**.
3. Select **Proposal preview** to return to existing proposals.

Editing a published challenge changes only your working draft. The page shows
**The published revision stays live until you publish a new revision.** To
update what Learners see, generate proposals, decide them and publish again.
That creates a new revision. Learners keep their earlier attempts.

## TA guide

### Inspect submissions

1. Select **Submissions** in the top bar.
2. To filter, enter a **Learner ID** or **Challenge ID**, choose a **Grading
   status**, then select **Apply filters**. **Clear filters** resets them.
3. Select **View submission** on a card.

The **Submission** page shows:

- The learner, challenge, attempt, submission time and grading status.
- The code and each **Submitted comment** with its match status, credits and
  AI feedback.
- The **Private answer key**: each flaw's category, lines, original and
  replacement snippets, explanation, fix and whether it was matched or missed.
- **Original assessment**, **Current grade**, **Override history** and any
  flags.

Select **Refresh submission** to load the latest state.

### Work through flagged submissions

1. Select **Flagged submissions** in the top bar. It shows open flags by
   default.
2. To filter, choose a **Status** (**Open** or **Resolved**) and a **Flag
   reason**, then select **Apply filters**.
3. Select **View submission** on a flag.

The submission opens with that flag marked **Selected flag**. Select **Back to
flagged submissions** to return. See
[Grading and moderation flags](#grading-and-moderation-flags) for what each
reason means.

### Override a grade

You can override a grade once the original assessment is complete.

1. On the **Submission** page, select **Override grade**.
2. Enter a **Replacement score**, a whole number from 0 to 100.
3. Enter a **Reason**, up to 2,000 characters. The learner sees it.
4. Select **Save override**, or **Cancel**.

**Success:** you see **Grade override saved.** The **Current grade** shows
**TA override**, and the override joins **Override history**. The learner sees
the new grade and your reason on their result.

To change it later, add another override. The latest one sets the grade.

### Resolve a flag

1. On the **Submission** page, find the flag and select **Resolve flag**.
2. Choose a **Disposition**: **Upheld** or **Dismissed**.
3. Enter a **Reason**, up to 2,000 characters.
4. Select **Save resolution**, or **Cancel**.

**Success:** you see **Resolution saved.** The flag shows **Resolved** and the
entry appears under **Resolution history**. The learner sees it too.

Resolving a flag doesn't change the grade. To change the grade, also
[override it](#override-a-grade). To correct a resolved flag, select **Add
correction**.

### Review learner performance

1. Select **Learners** in the top bar.
2. Select **View learner** on a learner.

**Learner performance** shows:

- **Performance summary**: the latest AI summary. See
  [Generate a performance summary](#generate-a-performance-summary).
- **Category progress**: for each flaw category, **Identified flaws**, **Total
  flaws**, **Identification rate** and **Completed first attempts**. Only
  graded first attempts count. Retries and overrides don't change these
  numbers. **Not observed** means there is no evidence in that category yet.
- **Recommended challenges**: published challenges the learner hasn't tried,
  in their weakest categories. These come from fixed rules, not AI.

Select **View submissions** to see this learner's submissions. Select
**Refresh progress and recommendations** to reload those sections.

### Generate a performance summary

1. On **Learner performance**, select **Generate summary**. If a summary
   exists, the button reads **Regenerate summary**.
2. You see **Generating performance summary…**.

**Success:** you see **Performance summary generated.** The summary is labelled
**AI-generated summary — review the supporting submissions.** It lists
**Strengths**, **Blind spots** and **Suggested next steps**, each by category
with **View supporting submission** links.

If new evidence arrives later, you see **This summary is out of date. Generate
a new summary to include current evidence.**

Generating a summary uses AI and counts toward your
[usage limits](#usage-limits). See [Performance summaries](#performance-summaries).

## AI features

### Code is never run

LGTM only displays code. No code you paste, review or read is ever run, by
LGTM or by the AI. AI sees code as text only.

While an AI action runs, a status message shows and you can't start it again.
Each action has a time limit of about 35 seconds. If the AI returns an answer
LGTM can't use, LGTM tries once more by itself. That retry counts toward your
[usage limits](#usage-limits).

### Flaw proposals

**What it does:** given your working code, flaw count, categories and
difficulty, the AI proposes flaws. Each proposal includes the code change, an
explanation and a fix. These become the answer key for the flaws you approve.

**While it runs:** **Generating proposals…**

**When it fails:**

| Message | What to do |
| --- | --- |
| **The AI returned invalid proposals. Try again.** | Select **Try again**. |
| **Proposal generation timed out. Try again.** | Select **Try again**. |
| **We couldn't generate proposals right now. Try again.** | Select **Try again**. |
| **AI generation is unavailable within the current limits. Try again later.** | See [Usage limits](#usage-limits). |
| **This draft is too large for AI generation. Reduce it before trying again.** | Shorten the working code or description, save, then generate again. |

### Hints at publication

**What it does:** when you publish, the AI writes one hint per kept flaw.
Hints describe the kind of problem without giving its location or fix. They
are written once, at publication, and every Learner gets the same hints.

**While it runs:** **Preparing hints and publishing…**

**When it fails:** the challenge isn't published.

| Message | What to do |
| --- | --- |
| **The AI returned invalid hints. The challenge wasn't published.** | Select **Try publishing again**. |
| **We couldn't publish the challenge right now.** | Select **Try publishing again**. |
| **Publication is unavailable within the current AI limits. Try again later.** | See [Usage limits](#usage-limits), then **Try publishing again**. |
| **Publication timed out. Check publication before trying again.** | Select **Check publication** first. |
| **This candidate is too large for AI publication.** | Reject a flaw or shorten the code, then preview and publish again. |

### Review grading

**What it does:** LGTM first matches your comments to flaws by location, without
AI. The AI then judges only the explanation and fix of matched comments. It
gives each **0**, **0.5** or **1** credit and writes feedback. If no comment
matches a flaw, LGTM grades without calling the AI.

**While it runs:** **Grading pending**, then **Grading your review…**

**When it fails:** **Grading failed. Your review is still saved.** and one of
these. Your review is never lost and a failure never counts as zero.

| Message | What to do |
| --- | --- |
| **Grading usage limit reached. Try grading again later.** | See [Usage limits](#usage-limits), then **Retry grading**. |
| **We couldn't produce a valid assessment. Try grading again.** | Select **Retry grading**. |
| **AI grading is unavailable. Try grading again.** | Select **Retry grading**. |
| **Grading timed out. Try grading again.** | Select **Retry grading**. |
| **Grading is unavailable. Try grading again later.** | Wait, then select **Retry grading**. |
| **This review is too large for grading. Your submitted review is saved.** | There is no retry. Report it to the team. |

#### Grading and moderation flags

A grade weights identification at 50%, explanation at 30% and fix at 20%. A
comment matches a flaw if it is on one of the flaw's lines or the line just
before or after. Only one comment counts per flaw; extra comments on the same
flaw are marked **Duplicate** and earn nothing. Each **Unmatched** comment
cancels the identification credit of one matched flaw. The pass mark is 60.

LGTM flags a submission for TA review in these cases:

| Flag | When |
| --- | --- |
| **Score near the pass mark** | The score is from 55 to 65. |
| **AI grading output needed a retry** | The AI's first answer couldn't be used. |
| **Location match and AI assessment disagree** | A matched comment got neither explanation nor fix credit. |
| **Learner reported an unmatched comment** | The learner [reported a comment](#report-an-unmatched-comment). |

### Performance summaries

**What it does:** the AI reads a learner's graded submissions and summarises
recurring **Strengths**, **Blind spots** and **Suggested next steps**. Each
point links to the submissions behind it. Check those submissions before you
act on the summary.

**While it runs:** **Generating performance summary…** Any previous summary
stays visible, marked **Previous summary**.

**When it fails:**

| Message | What to do |
| --- | --- |
| **A completed submission is required to generate a summary.** | Wait until the learner has a graded submission. |
| **Summary generation is temporarily limited. Try again later.** | See [Usage limits](#usage-limits), then **Try again**. |
| **Summary generation timed out. Try again.** | Select **Try again**. |
| **We couldn't generate a valid summary. Try again.** | Select **Try again**. |
| **There is too much evidence to generate this summary.** | Generating again won't help. Report it to the team. |
| **Summary generation is unavailable. Try again.** | Select **Try again**. |
| **We couldn't confirm the generation result. Refresh learner performance.** | Select **Refresh learner performance**. |

## Usage limits

### What counts

Four actions use AI:

- Learner: grading a review, including **Retry grading**.
- Author: **Generate proposals** and **Publish challenge**.
- TA: **Generate summary** and **Regenerate summary**.

Each action sends one request to the AI. If the AI's answer can't be used,
LGTM sends one more, so one action can count as two requests. Each request also
counts its size in tokens, the text sent plus the reply.

Browsing, commenting, submitting, showing hints, reports and moderation don't
use AI. Grading a review in which no comment matches a flaw doesn't either.

### Limits

Your account and the whole deployed app each have limits. Everyone using the
app shares the app limits, so other testers' actions affect you.

| Limit | Your account | Whole app |
| --- | --- | --- |
| AI actions running at once | 1 | 4 |
| AI requests per minute | 4 | 20 |
| AI requests per day | 20 | 100 |
| Tokens per day | 300,000 | 1,500,000 |

Minutes are clock minutes, so the per-minute count resets at the start of each
minute.

### What you see at a limit

The action stops before it calls the AI, and you see one of these:

- Learner: **Grading usage limit reached. Try grading again later.**
- Author, generating: **AI generation is unavailable within the current
  limits. Try again later.**
- Author, publishing: **Publication is unavailable within the current AI
  limits. Try again later.**
- TA: **Summary generation is temporarily limited. Try again later.**

You also see these if another AI action from your account is still running.
Wait for it to finish, then try again. LGTM doesn't show how much of a limit
you have left.

### Daily reset

Daily limits reset at 00:00 UTC, which is 08:00 in Singapore (SGT).

## Known limitations

- **Accounts:** there is no email confirmation, password reset, social sign-in
  (OAuth) or two-factor sign-in (MFA). Keep a note of your password.
- **One role per account:** you choose it at sign-up and can't change it. Use
  a separate email address for each role you want to test.
- **No account settings:** you can't change your display name, email or
  password, or delete your account.
- **Review drafts aren't saved:** comments disappear if you reload, close or
  leave the page before you submit.
- **Two attempts per challenge:** one review and one retry. A second attempt
  can't be retried.
- **No running code:** LGTM never runs code or tests. Reviews are read-only.
- **One file per challenge:** Authors paste a single file of up to 20,000
  bytes, in Python, Java, JavaScript or TypeScript only.
- **Challenge status filter:** the Author **Status** filter also lists
  **Unpublished** and **Archived**. No challenge can reach those statuses yet,
  so those filters show **No matching challenges.**
- **TA filters use IDs:** the **Challenge ID** filter needs a challenge's ID,
  which TA screens don't show. Use **Learner ID** or the challenge title on
  the cards instead.
- **Times are in UTC:** most dates show in UTC. The Author's publication time
  uses your browser's time zone.
- **Shared AI limits:** other testers can use up the app-wide AI limits. See
  [Usage limits](#usage-limits).

## Troubleshooting

For AI failures, see the tables under [AI features](#ai-features).

| Message on screen | What to do |
| --- | --- |
| **Email or password is incorrect.** | Check both and sign in again. There is no password reset. |
| **We couldn't create an account with these details. Check them or sign in.** | The email may already have an account. Try **Sign in**, or use another email. |
| **Too many attempts. Try again later.** | Wait a few minutes before signing in or signing up again. |
| **Sign-in is unavailable. Try again.** | Wait a moment and select **Sign in** again. |
| **Account creation is unavailable. Try again.** | Wait a moment and select **Create account** again. |
| **We couldn't confirm account creation. Try signing in, or try again.** | Try **Sign in** first. If that fails, create the account again. |
| **We couldn't confirm sign-in. Try again.** | Select **Sign in** again. |
| **Choose Learner, Author or TA.** | Choose a **Role** before you select **Create account**. |
| **Password is too short.** | Use at least 6 characters. |
| **Your session has expired. Sign in again.** | Sign in again. Unsubmitted comments are lost. |
| **Local sign-out completed, but the service could not confirm sign-out. Sign in again to continue.** | You are signed out in this browser. Sign in to continue. |
| **We couldn't confirm sign-out. Try again.** | Select **Sign out** again. |
| **This page isn't available for your role.** | Select **Go to my workspace**. See [Access and account screens](#access-and-account-screens). |
| **This item isn't available to your account.** | The item belongs to someone else. Select **Go to my workspace**. |
| **We couldn't load challenges. Try again.** | Select **Try again**. |
| **These filters or this page aren't valid.** | Select **Clear filters**. |
| **We couldn't find this challenge.** | Select **Back to challenges** and pick another. |
| **Add or save your comment, or cancel editing, before submitting.** | Select **Add comment**, **Save comment** or **Cancel**, then submit. |
| **Enter a comment.** | Type some text, or select **Cancel**. |
| **Comment is too long.** | Shorten the comment to 2,000 characters or fewer. |
| **This challenge changed since you opened it. Your review has not been submitted.** | The Author published a new revision. Select **Back to challenges**, reopen it and review again. |
| **This challenge is no longer available for submission.** | Select **Back to challenges** and pick another. |
| **You can't submit another attempt for this challenge.** | You have used both attempts. Open **Review history**. |
| **This review is too large to submit. Shorten or remove comments and try again.** | Shorten or remove comments, then submit again. |
| **Too many requests. Try again later.** | Wait a minute, then try again. |
| **We couldn't confirm submission. Check submission again before changing your review.** | Select **Check submission**. See [When LGTM cannot confirm an action](#when-lgtm-cannot-confirm-an-action). |
| **Submission is still being confirmed. Check again.** | Wait a moment, then select **Check submission**. |
| **This submission request couldn't be reused. Open Review history to check your attempts.** | Open **Review history** to see whether the review was saved. |
| **We couldn't update grading status.** | Select **Check status**. |
| **We couldn't load this review result. Try again.** | Select **Try again**. |
| **We couldn't check retry availability.** | Select **Check retry availability**. |
| **Retry is available after your first assessment completes.** | Wait for grading to finish, or select **Retry grading** if it failed. |
| **We couldn't load this hint. Try again.** | Select **Try again**. |
| **This hint isn't available for this review.** | Select **Refresh result**. |
| **This comment has already been reported.** | No action needed. A TA will review it. |
| **This comment isn't available for reporting.** | Select **Back to result**. Only **Unmatched** comments can be reported. |
| **Enter a reason.** | Type a reason before you send or save. |
| **We couldn't confirm your report. Check report again.** | Select **Check report**. |
| **We couldn't reuse this report request. Refresh the result to check your reports.** | Select **Refresh result**. |
| **We couldn't save the draft. Try again.** | Select **Save draft** again. |
| **We couldn't confirm whether the draft was saved.** | Select **Check save**. |
| **Working code exceeds the size limit.** | Shorten the code to 20,000 bytes or fewer. |
| **Choose supported flaw categories without duplicates.** | Tick between one and five **Flaw categories**. |
| **This draft changed. Reload it before saving.** | Select **Reload draft**. The draft was changed in another tab or window. |
| **This challenge changed. Reload it before continuing.** | Select **Reload challenge**. |
| **Save your changes before generating proposals.** | Select **Save configuration** first. |
| **We couldn't confirm proposal generation.** | Select **Check generation**. |
| **We couldn't save this decision. Try again.** | Select **Approve** or **Reject** again. |
| **We couldn't confirm this decision. Refresh the draft.** | Select **Refresh draft**. |
| **We couldn't load the preview. Try again.** | Select **Try again**. |
| **Review the current proposals and approve at least one flaw before publishing.** | Select **Back to proposal preview** and decide every proposal. |
| **We couldn't confirm publication.** | Select **Check publication**. |
| **This challenge changed. Reload it before publishing.** | Select **Reload draft**. |
| **We couldn't load submissions. Try again.** | Select **Try again**. |
| **Enter a valid ID.** | Paste the full ID, or clear the field. |
| **Enter a whole number from 0 to 100.** | Fix the **Replacement score**. |
| **Select Upheld or Dismissed.** | Choose a **Disposition**. |
| **This flag changed. Refresh before saving.** | Select **Cancel**, then **Refresh submission**. |
| **We couldn't load learner performance. Try again.** | Select **Try again**. |
