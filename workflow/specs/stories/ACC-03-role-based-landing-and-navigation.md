# ACC-03 — Role-based landing and navigation

## Story

As a signed-in user, I want a role-based landing page and navigation so that I can
reach my work.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [ACC-03 allocation](../PRODUCT-SPEC.md#shared-accounts) and
  [product navigation](../PRODUCT-SPEC.md#5-navigation-and-ui).
- **System:** [SYS-04](../TECHNICAL-SPEC.md#sys-04--shared-building-blocks) for
  shared views;
  [SYS-06](../TECHNICAL-SPEC.md#sys-06--profile-provisioning-and-immutable-role)
  for the authoritative role;
  [SYS-07](../TECHNICAL-SPEC.md#sys-07--ssr-cookies-and-proxy-refresh),
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary),
  [SYS-09](../TECHNICAL-SPEC.md#sys-09--authentication-with-cache-components) and
  [SYS-10](../TECHNICAL-SPEC.md#sys-10--database-enforcement-and-privileged-access)
  for session, authorization and data-isolation mechanisms;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for failure categories;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for all record
  visibility; [SYS-16](../TECHNICAL-SPEC.md#sys-16--security-baseline) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for safeguards and UI.
- **Security:** No SEC dependency; navigation makes no AI request.
  `AI-SECURITY-SPEC.md` does not exist yet.
- **Contracts:** No separate account contract; SYS-06 owns the role vocabulary.
  `INTEGRATION-SPEC.md` does not exist yet.
- **Related stories:** [ACC-01](ACC-01-sign-up-with-a-role.md) owns account creation;
  [ACC-02](ACC-02-sign-in-and-sign-out.md) owns credential and sign-out forms.

## Acceptance criteria

- **ACC-03.1:** After successful sign-up or sign-in, and when opening `/`, a usable
  signed-in account lands at the destination below. The same rule applies when
  that account opens `/sign-in` or `/sign-up`. SYS-06 determines the role; no
  client-selected role changes the destination.

  | Role | Landing URL | Visible heading |
  | --- | --- | --- |
  | Learner | `/learner/challenges` | “Challenges” |
  | Author | `/author/challenges` | “My challenges” |
  | TA | `/ta/submissions` | “Submissions” |

- **ACC-03.2:** Shared signed-in navigation shows “LGTM”, the account's display
  name and role, the role-specific links below, and “Sign out” as defined by
  ACC-02. “LGTM” leads to the role landing in ACC-03.1. The current navigation
  section is indicated in text or accessible state as well as visually. Links
  for other roles are absent; this presentation grants no access beyond SYS-12.

  | Role | Link label | URL / screen heading |
  | --- | --- | --- |
  | Learner | Challenges | `/learner/challenges` / “Challenges” |
  | Learner | Review history | `/learner/history` / “Review history” |
  | Author | My challenges | `/author/challenges` / “My challenges” |
  | Author | Create challenge | `/author/challenges/new` / “Create challenge” |
  | TA | Submissions | `/ta/submissions` / “Submissions” |
  | TA | Flagged submissions | `/ta/flags` / “Flagged submissions” |
  | TA | Learners | `/ta/learners` / “Learners” |

- **ACC-03.3:** A signed-out visitor opening `/` or any protected page reaches
  `/sign-in` without protected content. Protected-page access shows “Sign in to
  continue.”; opening `/` needs no notice. No requested URL is resumed after
  authentication; ACC-03.1 always determines the destination. The HTTP data
  endpoint outcomes remain those in SYS-11.
- **ACC-03.4:** When a session expires but can refresh under SYS-07, the user
  continues at the requested permitted page without a sign-in interruption. If
  an expired session cannot refresh, navigation or a protected action replaces
  the protected screen with `/sign-in` and “Your session has expired. Sign in
  again.” The interrupted action is not automatically replayed after sign-in;
  the user lands under ACC-03.1 and must reopen the work. SYS-11 governs rejected
  operations; this story promises no recovery of unsaved form or review text.
- **ACC-03.5:** A usable signed-in account opening a direct URL in another role's
  area sees an access-denied screen headed “Access denied” with “This page isn't
  available for your role.” and a “Go to my workspace” link to its own landing.
  No destination content appears. A forbidden record in the user's own role area
  instead shows “This item isn't available to your account.” with the same
  heading and recovery link. The effective access rules are SYS-12, including
  direct requests independently of navigation.
- **ACC-03.6:** A verified account with a missing profile or invalid stored role
  sees “Account unavailable” and “We couldn't load a valid account profile.”,
  with “Try again” and “Sign out”. It sees no role navigation or workspace and
  cannot choose a replacement role. “Try again” rechecks the current destination;
  persistent failure retains this screen. SYS-11 owns the failure category and
  SYS-06 owns profile integrity.
- **ACC-03.7:** An authentication/profile-service outage while entering a workspace
  shows “Service unavailable” and “We can't check your account right now. Try
  again.”, with “Try again” and “Sign out”; no protected data or role navigation
  appears. Retry rechecks the destination and shows either the permitted page or
  the applicable outcome in ACC-03.3–6. Sign-out follows ACC-02, including failure
  presentation. There is no fallback workspace, under SYS-11.
- **ACC-03.8:** Opening a permitted navigation destination shows its heading and
  the same role navigation, including when its list has no records. Empty lists
  show: “No challenges available.” for the Learner catalogue; “No reviews yet.”
  for history; “No challenges yet.” for the Author list; “No submissions yet.” for
  TA submissions; “No flagged submissions.” for the queue; and “No learners yet.”
  for the TA learner list. The Author empty list includes “Create challenge”.
  List contents and downstream work belong to the role stories in the index.
- **ACC-03.9:** Browser back, reload, direct URLs and account switching preserve
  these same navigation and denial outcomes under SYS-09. Changing a URL, role
  input or editable metadata never exposes another role's navigation or records.

## Use cases

### UC-ACC-03-1 — Reach and navigate a workspace

**Actor:** Account holder in any role

**Preconditions:** Usable signed-in account.

**Trigger:** Complete authentication or open `/`.

1. The user reaches the role landing and sees the matching heading and navigation.
2. The user selects a role navigation link and reaches that screen.
3. The user selects “LGTM” to return to the role landing.

**Alternate paths:** Empty lists follow ACC-03.8; a direct permitted URL opens that
screen without first visiting the landing.

**Failure paths:** Missing/invalid profiles and outages follow ACC-03.6–7; forbidden
destinations follow ACC-03.5.

**Postconditions:** Only the role and records permitted by SYS-06 and SYS-12 are
available; a failed entry does not select a default role.

### UC-ACC-03-2 — Recover from blocked access

**Actor:** Visitor or account holder

**Preconditions:** Signed out, expired session, or unauthorized destination.

**Trigger:** Open a protected URL or attempt a protected action.

1. The user sees the sign-in or denial outcome for their state.
2. A signed-out user signs in through ACC-02; a user denied by role selects
   “Go to my workspace”.
3. The user reaches their role landing.

**Alternate paths:** Refreshable expiry continues the permitted request under
ACC-03.4. Service/profile recovery uses “Try again” or ACC-02 sign-out.

**Failure paths:** Failed sign-in remains in ACC-02; repeated service/profile
failure retains ACC-03.6–7.

**Postconditions:** No blocked content is shown and no interrupted action is
automatically resubmitted.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Learner opens an Author URL; Author opens a TA URL; TA opens a Learner URL | Each sees ACC-03.5 with its own workspace link; all other cross-role pairs behave identically. |
| Expired session and cross-role URL together | Unrefreshable session follows ACC-03.4; a successfully refreshed account then follows ACC-03.5. |
| Signed-in user revisits a bookmarked sign-up page | ACC-03.1, not another role-selection form. |
| Return destination supplied in a URL | ACC-03.1 and ACC-03.3 ignore it; external destinations are never followed, under SYS-16. |
| Account/profile service fails during a protected action | ACC-03.7 and SYS-11; retry does not replay the mutation. |
| No records visible under SYS-12 | ACC-03.8 empty state, with navigation still usable. |

## UI notes

Use one shared navigation structure with role-specific items and a main content
heading. At phone width, links may collapse into a labelled menu; all labels and
destinations remain keyboard reachable under SYS-17. Denial screens contain only
the account's own navigation and the recovery message. Profile/outage screens
replace role navigation with their recovery controls. Role pages use the common
code/diff view under SYS-04 when displaying code; each role's detailed interaction
belongs to its indexed story. URLs in this story are user-facing destinations,
not links to repository files.
