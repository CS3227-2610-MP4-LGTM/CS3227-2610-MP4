# ACC-01 — Sign up with a role

## Story

As a new user, I want to sign up with a role so that I can enter the appropriate
workspace.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [ACC-01 allocation](../PRODUCT-SPEC.md#shared-accounts).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for input validation;
  [SYS-05](../TECHNICAL-SPEC.md#sys-05--credentials-and-session-lifecycle) for
  credentials and session creation;
  [SYS-06](../TECHNICAL-SPEC.md#sys-06--profile-provisioning-and-immutable-role) for
  profile fields, role choices, bounds and atomic creation;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for failure categories;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for visibility;
  [SYS-16](../TECHNICAL-SPEC.md#sys-16--security-baseline) and
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for shared safeguards
  and accessibility.
- **Security:** No SEC dependency; this story has no AI operation.
  `AI-SECURITY-SPEC.md` does not exist yet.
- **Contracts:** No separate account contract is required here; field requirements
  and bounds are owned by SYS-05–SYS-06. `INTEGRATION-SPEC.md` does not exist yet.
- **Related stories:** [ACC-02](ACC-02-sign-in-and-sign-out.md) owns existing-account
  sign-in; [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns destinations
  and access-recovery screens.

## Acceptance criteria

- **ACC-01.1:** A signed-out visitor opening `/sign-up` sees the heading
  “Create an account”, required fields “Display name”, “Email”, “Password” and
  “Role”, a “Create account” button and a “Sign in” link to `/sign-in`. Password
  entry is masked. No role is selected initially; the role choices are those in
  SYS-06, labelled “Learner — Practise reviewing code”, “Author — Create review
  challenges” and “TA — Moderate grades and support learners”. The form states
  “Your role cannot be changed after account creation.”
- **ACC-01.2:** Submitting invalid fields leaves the visitor on `/sign-up`, shows
  all applicable field errors and creates no account, under SYS-02 and SYS-06.
  The following messages apply; for a field, the first applicable row wins.

  | Field / condition | Message |
  | --- | --- |
  | Display name blank after the normalization required by SYS-06 | “Enter a display name.” |
  | Display name exceeds the SYS-06 bound | “Display name is too long.” |
  | Email empty | “Enter your email.” |
  | Email fails SYS-05 email validation | “Enter a valid email address.” |
  | Password empty | “Enter a password.” |
  | Password below the SYS-05 minimum | “Password is too short.” |
  | Role missing or outside the SYS-06 choices | “Choose Learner, Author or TA.” |

- **ACC-01.3:** With valid new-account details, “Create account” changes to
  “Creating account…” and cannot be activated again while the request is pending.
  On success, the user reaches the landing page defined by ACC-03 for the selected
  role and sees “Account created.” No email-receipt step interrupts this journey,
  per SYS-05. The displayed name follows SYS-06 normalization. Password handling
  follows SYS-05; form submission does not alter the entered password.
- **ACC-01.4:** An existing email or other non-field account-creation rejection
  shows “We couldn't create an account with these details. Check them or sign in.”
  with the “Sign in” link. No new workspace is opened and the existing account's
  role is unchanged, per SYS-06.
- **ACC-01.5:** A throttled request shows “Too many attempts. Try again later.”
  An unavailable account service or provisioning failure shows “Account creation
  is unavailable. Try again.” In either case the form remains available, no
  success is shown and no workspace opens. Atomic-creation outcomes are governed
  by SYS-06. On any completed request failure, display name, email and role remain
  populated, the password is cleared, and “Create account” is available again.
- **ACC-01.6:** If account creation is confirmed but a usable session cannot be
  established, the user reaches `/sign-in` with “Account created. Sign in to
  continue.” The user is not invited to create the account again. If the request
  outcome is unknown because the connection was interrupted, the form instead
  shows “We couldn't confirm account creation. Try signing in, or try again.”
  with the same field retention as ACC-01.5 and a “Sign in” link; it does not claim
  that creation failed or succeeded.
- **ACC-01.7:** A signed-in visitor opening `/sign-up` follows ACC-03's public
  account-page rule. Choosing a different role in a later sign-up request cannot
  change an existing account's role, under SYS-06.

## Use cases

### UC-ACC-01-1 — Create an account

**Actor:** New user

**Preconditions:** Signed out; account service available.

**Trigger:** Open `/sign-up`.

1. The visitor enters a display name, email and password and selects a role.
2. The visitor activates “Create account” and sees the pending state.
3. Successful creation opens the selected role's landing page with confirmation.

**Alternate paths:** “Sign in” opens the existing-account journey. A confirmed
creation without a usable session follows ACC-01.6.

**Failure paths:** Invalid fields follow ACC-01.2; account rejection follows
ACC-01.4; throttling, service failure and uncertain outcomes follow ACC-01.5–6.

**Postconditions:** Success provides the account/session outcome in SYS-05–SYS-06;
failure never grants workspace access.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Whitespace-only name or name just beyond the shared bound | ACC-01.2 uses the SYS-06 definition, including trimming. |
| Password containing spaces | ACC-01.3 preserves its value under SYS-05. |
| Two activations while creation is pending | One pending form action under ACC-01.3; no second account under SYS-06. |
| Retry after a lost response created the account | ACC-01.6 offers sign-in; a later duplicate rejection follows ACC-01.4. |
| Forged role value submitted outside the form | Role validation outcome in ACC-01.2; no account under SYS-06. |

## UI notes

Keep the form on one screen. Use the full role labels specified in ACC-01.1.
Help text beside display name and password communicates the current bounds from
SYS-05–SYS-06. Associate errors with their fields and focus the first invalid field
after validation; announce request-level failures and pending state under SYS-17.
Do not add confirmation-password or email-confirmation screens. Recovery links use
the account destinations in ACC-02–ACC-03.
