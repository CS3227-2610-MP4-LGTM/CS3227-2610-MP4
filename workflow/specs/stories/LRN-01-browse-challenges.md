# LRN-01 — Browse challenges

## Story

As a Learner, I want to browse challenges by language, difficulty and flaw category
so that I can choose relevant practice.

**Priority:** Must

**AI:** No

## Dependencies

- **Product:** [LRN-01 allocation](../PRODUCT-SPEC.md#learner),
  [challenge input](../PRODUCT-SPEC.md#challenge-input) and
  [shared vocabularies](../PRODUCT-SPEC.md#shared-vocabularies).
- **System:** [SYS-02](../TECHNICAL-SPEC.md#sys-02--untrusted-input-and-submitted-code)
  for validated inputs and inert text;
  [SYS-11](../TECHNICAL-SPEC.md#sys-11--authentication-and-authorization-failures)
  for access failures;
  [SYS-12](../TECHNICAL-SPEC.md#sys-12--record-access-and-audit) for discovery;
  [SYS-17](../TECHNICAL-SPEC.md#sys-17--simple-accessible-ui) for accessibility.
- **Security:** No SEC dependency; browsing performs no AI operation.
- **Contracts:** [Shared values and bounds](../INTEGRATION-SPEC.md#shared-values-and-bounds)
  for filter values and page bounds;
  [immutable published revisions](../INTEGRATION-SPEC.md#sys-12-decision-immutable-published-revisions)
  for catalogue eligibility;
  [transport, concurrency and errors](../INTEGRATION-SPEC.md#transport-concurrency-and-errors)
  for cursor validation and ordering;
  [shared response types](../INTEGRATION-SPEC.md#shared-response-types) for cards;
  [Learner surface](../INTEGRATION-SPEC.md#learner-surface) for catalogue reads.
- **Related stories:** [ACC-03](ACC-03-role-based-landing-and-navigation.md) owns
  landing, navigation, unfiltered empty lists and access recovery;
  [LRN-02](LRN-02-view-a-challenge-as-a-pr.md) owns opening a card.

## Acceptance criteria

- **LRN-01.1:** At `/learner/challenges`, a permitted Learner sees the ACC-03
  heading and navigation, then filters labelled “Language”, “Difficulty” and
  “Flaw category”. Each is single-select, initially “All languages”,
  “All difficulties” and “All categories”, respectively. Choices use the product
  labels and contract values linked above. No free-text or multiple selection
  changes these filters.
- **LRN-01.2:** Each catalogue card shows its title, description, language,
  difficulty and approved category labels from ChallengeCard, and a “View
  challenge” link to `/learner/challenges/:challengeId`. Only discoverable live
  publications appear, in the contract's catalogue order. Cards show no private
  answers, hints or proposed flaws. Text remains inert under SYS-02.
- **LRN-01.3:** Changing a filter immediately requests the first page for the
  selected combination. Filters combine with AND under the Learner contract.
  Selected values are encoded as `language`, `difficulty` and `category` in the
  page URL query; an “All” choice omits its parameter. A filter change removes
  `cursor`. Back, forward, reload and a directly opened filtered URL restore the
  selections and request that URL's page, rather than silently clearing filters.
- **LRN-01.4:** Pagination uses the shared default page bound and returned cursor;
  the screen never requests an unbounded list. “Next page” is available only
  when nextCursor is nonnull and opens the same filters with that cursor in the
  URL. On a cursor page, “First page” removes only `cursor`. These actions keep
  filter selections. The final page has no “Next page” action; no total page
  count is invented from a cursor response.
- **LRN-01.5:** An empty successful response with at least one active filter
  shows “No challenges match these filters.” and “Clear filters”. That action
  removes all three filter parameters and `cursor`, restores the “All” choices
  and requests `/learner/challenges`. The same action is available whenever a
  filter is active. An unfiltered empty catalogue uses ACC-03.8 instead.
- **LRN-01.6:** Initial loading, filter changes and pagination show “Loading
  challenges…” in the results region. Superseded results cannot appear as the
  new selection's results. While a page request is pending, pagination controls
  are disabled; changing a filter may replace the pending selection. Success
  replaces the region with the requested cards or the applicable empty state.
- **LRN-01.7:** A catalogue read failure other than an ACC-03 access outcome
  shows “We couldn't load challenges. Try again.” and “Try again” in the results
  region. Retry requests the same filters and cursor; the URL and controls keep
  those selections. Invalid filter values or an invalid/filter-mismatched cursor
  instead show “These filters or this page aren't valid.” with “Clear filters”,
  which opens the clean catalogue URL. Neither failure appears as an empty list.

## Use cases

### UC-LRN-01-1 — Find relevant practice

**Actor:** Learner

**Preconditions:** Usable signed-in Learner account; catalogue is permitted.

**Trigger:** Open `/learner/challenges` through navigation or a saved URL.

1. The Learner sees the selected filters and the loading state, then cards.
2. The Learner chooses filters and sees their combined results at the new URL.
3. The Learner uses “Next page” or “First page” to browse bounded results.
4. “View challenge” opens the selected PR journey in LRN-02.

**Alternate paths:** A filtered empty page offers LRN-01.5; back and reload restore
LRN-01.3's state. An unfiltered empty list follows ACC-03.

**Failure paths:** Read and invalid-query recovery follow LRN-01.7. Authentication,
expiry, profile and authorization outcomes follow ACC-03 without a catalogue
fallback that exposes forbidden material.

**Postconditions:** Browsing creates no attempt. The URL identifies the visible
filter/page selection; selecting a card transfers control to LRN-02.

## Edge cases

| Condition | Observable outcome / criterion |
| --- | --- |
| Each filter alone, then all three together | LRN-01.3 applies AND and preserves the selected values. |
| Filter changes on a later page | LRN-01.3 removes the old cursor. |
| Slow older response arrives after a newer selection | LRN-01.6 prevents mismatched results. |
| A challenge is unpublished between list read and card activation | LRN-02 owns the detail access outcome; no attempt is created by browsing. |
| Malformed query or stale cursor | LRN-01.7 offers a clean catalogue request. |

## UI notes

Keep filters above the results with visible labels and a labelled results region.
Announce loading, errors and empty outcomes under SYS-17; retain focus on a changed
filter, and move focus to the results heading after pagination. Cards and
pagination must be keyboard reachable at phone width. Do not add an AI action to
discovery. Landing and global navigation labels remain owned by ACC-03.
