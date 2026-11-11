import type { WorkspaceAccessFailure } from "@/lib/auth/workspace-access";
import type { FinalPreview } from "@/lib/author/preview";
import {
  categoryLabels, difficultyLabels, languageLabels, type Category, type Difficulty, type Language,
} from "@/lib/learner/challenges";

export const authorChallengesHref = "/author/challenges";
export const challengeHref = (id: string) => `${authorChallengesHref}/${id}`;
export const editDraftHref = (id: string) => `${challengeHref(id)}/edit`;
export const configurationHref = (id: string) => `${challengeHref(id)}/configuration`;
export const proposalsHref = (id: string) => `${challengeHref(id)}/proposals`;

/** INTEGRATION-SPEC §1: 128 KiB UTF-8 request bodies and the 20,000-byte pasted-code cap. */
export const authorBodyLimit = 128 * 1024;
export const codeByteLimit = 20_000;
export const titleLimit = 120;
export const descriptionLimit = 4000;
export const flawCountRange = { min: 1, max: 5 } as const;

export const lifecycleStatuses = ["draft", "published", "unpublished", "archived"] as const;
export type LifecycleStatus = typeof lifecycleStatuses[number];
export const statusLabels: Record<LifecycleStatus, string> = {
  draft: "Draft", published: "Published", unpublished: "Unpublished", archived: "Archived",
};

export const languages = Object.keys(languageLabels) as Language[];
export const difficulties = Object.keys(difficultyLabels) as Difficulty[];
export const categories = Object.keys(categoryLabels) as Category[];

export const draftFields = ["title", "description", "language", "difficulty", "workingCode", "flawCount", "categories"] as const;
export type DraftField = typeof draftFields[number];

export type DraftValues = {
  title: string;
  description: string;
  language: Language;
  difficulty: Difficulty;
  workingCode: string;
  flawCount: number;
  categories: Category[];
};

/** Exact field messages from AUT-01.2 and AUT-02.2, shared by forms and the server. */
export const fieldMessages = {
  titleMissing: "Enter a title.",
  titleLong: "Title is too long.",
  descriptionMissing: "Enter a description.",
  descriptionLong: "Description is too long.",
  language: "Choose a supported language.",
  difficulty: "Choose a difficulty.",
  codeMissing: "Paste working code.",
  codeLarge: "Working code exceeds the size limit.",
  codeInvalid: "Working code contains invalid characters.",
  flawCount: "Choose a whole-number flaw count within the allowed range.",
  categories: "Choose supported flaw categories without duplicates.",
} as const;

/** Error-envelope messages. The client matches these exactly where one status/code has two meanings. */
export const authorErrorMessages = {
  invalid: "The challenge request is invalid.",
  unauthenticated: "Sign in to continue.",
  forbidden: "This challenge isn't available to your account.",
  notFound: "Challenge not found.",
  versionConflict: "This challenge changed. Reload it before continuing.",
  archived: "Archived challenges can't be edited.",
  inProgress: "This save is still being confirmed. Check again.",
  idempotencyConflict: "This save request was already used for different values.",
  tooLarge: "The request is too large.",
  unavailable: "We couldn't complete the challenge request. Try again.",
  uncertain: "We couldn't confirm the challenge change. Check again.",
} as const;

/** Exact AUT-03 and AUT-04 on-screen messages. */
export const proposalMessages = {
  unsaved: "Save your changes before generating proposals.",
  generating: "Generating proposals…",
  generated: "Proposals generated. Review every proposal before publishing.",
  replace: "New proposals replace the current proposals and reset their decisions.",
  invalidOutput: "The AI returned invalid proposals. Try again.",
  changed: "This draft changed. Reload it before generating proposals.",
  limited: "AI generation is unavailable within the current limits. Try again later.",
  tooLarge: "This draft is too large for AI generation. Reduce it before trying again.",
  timeout: "Proposal generation timed out. Try again.",
  failed: "We couldn't generate proposals right now. Try again.",
  uncertain: "We couldn't confirm proposal generation.",
  saving: "Saving decision…",
  undecided: "Decide every proposal to preview the final challenge.",
  noneApproved: "Approve at least one proposal to preview or publish.",
  decisionFailed: "We couldn't save this decision. Try again.",
  decisionUncertain: "We couldn't confirm this decision. Refresh the draft.",
  decisionConflict: "This draft changed. Reload it before reviewing proposals.",
  absent: "Generate proposals before reviewing flaws.",
  previewFailed: "We couldn't load the preview. Try again.",
} as const;

export type ProposalWithDecision = {
  id: string;
  category: Category;
  sourceStartLine: number;
  sourceEndLine: number;
  originalSnippet: string;
  replacementSnippet: string;
  explanation: string;
  fix: string;
  decision: "pending" | "approved" | "rejected";
};

export type AuthorDraft = DraftValues & {
  id: string;
  status: LifecycleStatus;
  rowVersion: number;
  publishedRevisionId: string | null;
  draftVersion: number;
  generationId: string | null;
  proposals: ProposalWithDecision[];
};

export type AuthorChallengeCard = {
  id: string;
  status: LifecycleStatus;
  title: string;
  language: Language;
  difficulty: Difficulty;
  createdAt: string;
};

export type AuthorChallengePage = { items: AuthorChallengeCard[]; nextCursor: string | null };

export type FieldErrors = Partial<Record<DraftField, string[]>>;
export type DraftPatch = Partial<DraftValues> & { expectedRowVersion: number; expectedDraftVersion: number };

export type AuthorWriteResult =
  | { status: "ok"; draft: AuthorDraft }
  | { status: "invalid"; fieldErrors?: FieldErrors }
  | { status: "failed" | "uncertain" | "conflict" | "invalid_state" }
  | WorkspaceAccessFailure;
export type AuthorReadResult =
  | { status: "ok"; draft: AuthorDraft }
  | { status: "not_found" | "forbidden" | "unavailable" }
  | WorkspaceAccessFailure;
export type ExpectedVersions = { expectedRowVersion: number; expectedDraftVersion: number };
export type GenerationResult =
  | { status: "ok"; draft: AuthorDraft }
  | { status: "invalid_output" | "limited" | "too_large" | "timeout" | "failed" | "conflict" | "uncertain" }
  | WorkspaceAccessFailure;
export type DecisionResult =
  | { status: "ok"; draft: AuthorDraft }
  | { status: "failed" | "conflict" | "uncertain" }
  | WorkspaceAccessFailure;
export type FinalPreviewResult =
  | { status: "ok"; preview: { draftVersion: number } & FinalPreview }
  | { status: "incomplete" | "unavailable" }
  | WorkspaceAccessFailure;
export type AuthorPageResult =
  | { status: "ok"; page: AuthorChallengePage }
  | { status: "invalid" | "unavailable" }
  | WorkspaceAccessFailure;

/**
 * Structural shapes accepted at component boundaries. Server DTOs satisfy them;
 * components look up labels defensively instead of trusting literal unions.
 */
export type DraftView = {
  id: string;
  status: string;
  rowVersion: number;
  publishedRevisionId: string | null;
  draftVersion: number;
  title: string;
  description: string;
  language: string;
  difficulty: string;
  workingCode: string;
  flawCount: number;
  categories: string[];
  generationId: string | null;
  proposals: readonly unknown[];
};
export type DraftWriteOutcome = { status: string; draft?: DraftView; fieldErrors?: Partial<Record<string, string[]>> };
export type DraftReadOutcome = { status: string; draft?: DraftView };
export type ChallengeCardView = {
  id: string; status: string; title: string; language: string; difficulty: string; createdAt: string;
};
export type ChallengePageOutcome = { status: string; page?: { items: ChallengeCardView[]; nextCursor: string | null } };

/** Display label for a stored vocabulary value, falling back to the raw value as plain text. */
export function labelFor(labels: Record<string, string>, value: string) {
  return Object.hasOwn(labels, value) ? labels[value] : value;
}

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** PostgreSQL text and jsonb cannot store U+0000, so it is rejected as invalid input. */
const unstorable = (value: string) => value.includes("\u0000") || loneSurrogate.test(value);

export function normalizeCode(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

export function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

type Check<T> = { ok: true; value: T } | { ok: false; message: string };

function text(value: unknown, limit: number, missing: string, long: string): Check<string> {
  if (typeof value !== "string" || unstorable(value)) return { ok: false, message: missing };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: missing };
  // Bounds count Unicode code points, not UTF-16 units.
  if ([...trimmed].length > limit) return { ok: false, message: long };
  return { ok: true, value: trimmed };
}

function code(value: unknown): Check<string> {
  if (typeof value !== "string") return { ok: false, message: fieldMessages.codeMissing };
  if (unstorable(value)) return { ok: false, message: fieldMessages.codeInvalid };
  const normalized = normalizeCode(value);
  if (!normalized.trim()) return { ok: false, message: fieldMessages.codeMissing };
  if (utf8Length(normalized) > codeByteLimit) return { ok: false, message: fieldMessages.codeLarge };
  return { ok: true, value: normalized };
}

function choice<T extends string>(value: unknown, allowed: readonly T[], message: string): Check<T> {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? { ok: true, value: value as T } : { ok: false, message };
}

function flawCount(value: unknown): Check<number> {
  return typeof value === "number" && Number.isInteger(value) && value >= flawCountRange.min && value <= flawCountRange.max
    ? { ok: true, value } : { ok: false, message: fieldMessages.flawCount };
}

function categoryList(value: unknown): Check<Category[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || new Set(value).size !== value.length
    || !value.every(item => typeof item === "string" && (categories as string[]).includes(item))) {
    return { ok: false, message: fieldMessages.categories };
  }
  // Vocabulary order makes equal selections fingerprint and compare equally.
  return { ok: true, value: orderedCategories(value as string[]) };
}

const checks: { [K in DraftField]: (value: unknown) => Check<DraftValues[K]> } = {
  title: value => text(value, titleLimit, fieldMessages.titleMissing, fieldMessages.titleLong),
  description: value => text(value, descriptionLimit, fieldMessages.descriptionMissing, fieldMessages.descriptionLong),
  language: value => choice(value, languages, fieldMessages.language),
  difficulty: value => choice(value, difficulties, fieldMessages.difficulty),
  workingCode: code,
  flawCount,
  categories: categoryList,
};

/**
 * Validates the named fields with the shared AUT-01/AUT-02 rules. Text is
 * trimmed and code is LF-normalized; an absent value counts as missing.
 */
export function validateDraftFields(input: Record<string, unknown>, fields: readonly DraftField[] = draftFields) {
  const values: Partial<DraftValues> = {};
  const fieldErrors: FieldErrors = {};
  for (const field of fields) {
    const result = checks[field](input[field]);
    if (result.ok) (values as Record<DraftField, unknown>)[field] = result.value;
    else fieldErrors[field] = [result.message];
  }
  return { values, fieldErrors, valid: Object.keys(fieldErrors).length === 0 };
}

/** Categories in vocabulary order, so equal selections compare and fingerprint equally. */
export function orderedCategories(values: Iterable<string>) {
  const selected = new Set(values);
  return categories.filter(category => selected.has(category));
}
