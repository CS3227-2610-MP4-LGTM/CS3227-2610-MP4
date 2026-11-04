# ACC-02 — Sign in and sign out

## Story

As an account holder, I want to sign in and sign out so that I can start and end
access in this browser.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [ACC-02 allocation](../PRODUCT-SPEC.md#shared-accounts).
- **System:** [SYS-05](../TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle)
  for credentials and sign-out scope;
  [SYS-07](../TECHNICAL-SPEC.md#sys-07--ssr-cookies-and-proxy-refresh) for session
  transport and refresh;
  [SYS-08](../TECHNICAL-SPEC.md#sys-08--authorization-at-the-data-boundary) for
  protected operations;
  [SYS-09](../TECHNICAL-SPEC.md#sys-09--authentication-with-cache-components) for
  transitions between accounts;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for failure categories;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for visibility;
  [SYS-16](../TECHNICAL-SPEC.md#sys-16--security-baseline) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for shared safeguards
  and accessibility.
- **Security:** No SEC dependency; no AI operation. `AI-SECURITY-SPEC.md` does not
  exist yet.
- **Contracts:** No separate account contract; SYS-05 owns credential requirements.
  `INTEGRATION-SPEC.md` does not exist yet.
- **Related stories:** [ACC-01](ACC-01-sign-up-with-a-role.md) owns sign-up;
  [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns landing, expired-session
  notices and access-recovery screens.

## Acceptance criteria

- **ACC-02.1:** A signed-out visitor opening `/sign-in` sees “Sign in”, required
  fields “Email” and “Password”, a “Sign in” button and a “Create an account” link
  to `/sign-up`. Password entry is masked. There is no role selector or excluded
  authentication method from SYS-05.
- **ACC-02.2:** Invalid form submission stays on `/sign-in`, establishes no session
  and displays all applicable field errors. Empty email shows “Enter your email.”;
  otherwise email failing SYS-05 validation shows “Enter a valid email address.”
  Empty password shows “Enter a password.”; otherwise a password below the SYS-05
  minimum shows “Password is too short.” Passwords are submitted unchanged and
  no composition rules are added, under SYS-05.
- **ACC-02.3:** With valid form fields, “Sign in” changes to “Signing in…” and is
  disabled while pending. Accepted credentials lead to ACC-03's role landing if
  the account is usable. ACC-03 owns missing-profile and service-failure recovery
  after authentication. A failed request re-enables the button, retains email
  and clears password.
- **ACC-02.4:** Unknown email and incorrect password both show exactly “Email or
  password is incorrect.” No workspace opens, per SYS-05. Throttling shows “Too
  many attempts. Try again later.” An unavailable sign-in service shows “Sign-in
  is unavailable. Try again.” A lost connection with an unknown outcome shows
  “We couldn't confirm sign-in. Try again.” Each keeps the sign-in form available
  using ACC-02.3's field retention.
- **ACC-02.5:** Activating “Sign out” from the shared signed-in navigation changes
  it to “Signing out…” and prevents repeat activation while pending. Successful
  sign-out opens `/sign-in` with “You have signed out.” The current browser loses
  access under SYS-05; other devices follow that requirement's scope.
- **ACC-02.6:** If sign-out reports a provider failure, the user still reaches
  `/sign-in`, with “Local sign-out completed, but the service could not confirm
  sign-out. Sign in again to continue.” This is a failure notice, not the success
  notice in ACC-02.5; local credential clearing follows SYS-05. The sign-in form
  and account-creation link remain available.
- **ACC-02.7:** Back navigation, reload and prefetched navigation after sign-out
  cannot restore protected content. Signing in as a different account shows that
  account's role and permitted records only, under SYS-09 and SYS-12. Opening a
  protected page after sign-out follows ACC-03's signed-out rule.
- **ACC-02.8:** A signed-in account opening `/sign-in` or using “Create an account”
  follows ACC-03's public account-page rule. Successful sign-in always uses that
  story's role landing; it does not resume a previously requested protected URL.

## Use cases

### UC-ACC-02-1 — Enter a workspace

**Actor:** Account holder

**Preconditions:** Signed out; existing account.

**Trigger:** Open `/sign-in` directly or arrive from protected access.

1. The user enters email and password and activates “Sign in”.
2. The form shows the pending state.
3. Accepted credentials lead to the appropriate ACC-03 destination.

**Alternate paths:** “Create an account” opens ACC-01. An existing authenticated
session follows ACC-02.8.

**Failure paths:** Field errors follow ACC-02.2; credential, throttle, service and
connection failures follow ACC-02.4. Account-recovery outcomes follow ACC-03.

**Postconditions:** The workspace is visible only when the account meets the
referenced system requirements; failed sign-in provides no workspace access.

### UC-ACC-02-2 — Leave this browser's workspace

**Actor:** Signed-in account holder

**Preconditions:** Shared navigation or an account-recovery screen is visible.

**Trigger:** Activate “Sign out”.

1. The user sees the sign-out pending state.
2. The sign-in form replaces the workspace with the applicable outcome notice.
3. A subsequent protected-page request follows ACC-03.

**Alternate paths:** The user signs in to a different account under ACC-02.7.

**Failure paths:** Provider failure follows ACC-02.6.

**Postconditions:** Current-browser credentials are cleared under SYS-05; the
visible notice distinguishes complete success from provider failure.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Unknown email versus wrong password | Indistinguishable ACC-02.4 message. |
| Repeated sign-in or sign-out activation while pending | ACC-02.3 or ACC-02.5 pending control. |
| Session already expired when “Sign out” is activated | Clear the local session and use ACC-02.5 unless the provider reports failure, then ACC-02.6. |
| Other browser/device still signed in | SYS-05 scope; this browser's notice does not claim all-device sign-out. |
| Back after switching from Author to Learner | ACC-02.7; no Author content or navigation remains accessible. |

## UI notes

Keep sign-in and sign-out messages adjacent to the sign-in form and announce them
under SYS-17. Focus the first invalid field for field errors; announce request
errors without displaying raw provider details. “Sign out” is a clearly labelled
action in the shared navigation and ACC-03 recovery screens. No account-recovery
method excluded by SYS-05 is offered.
