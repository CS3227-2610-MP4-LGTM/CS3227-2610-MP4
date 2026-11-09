/** Pure projection of Codex JSONL. Never return raw records or parse errors. */
export type Known<T> = T | "unknown";
export interface TokenTotals {
  input_tokens: Known<number>;
  cached_input_tokens: Known<number>;
  cache_write_input_tokens: Known<number>;
  output_tokens: Known<number>;
  reasoning_output_tokens: Known<number>;
  total_tokens: Known<number>;
}
const responseTokenFields = [
  "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens",
] as const;
export const responseColumns = [
  "timestamp", "seconds_since_previous_response", ...responseTokenFields, "compaction",
] as const;
export interface RolloutResponse extends Pick<TokenTotals, typeof responseTokenFields[number]> {
  timestamp: Known<string>;
  seconds_since_previous_response: Known<number>;
  compaction: boolean;
}
export interface TurnValues {
  model: Known<string>;
  effort: Known<string>;
  serviceTier: Known<string>;
  turns: number;
}
export interface RolloutSummary {
  sessionId: Known<string>;
  threadId: Known<string>;
  startTime: Known<string>;
  endTime: Known<string>;
  cliVersion: Known<string>;
  originator: Known<string>;
  source: Known<string>;
  modelProvider: Known<string>;
  gitBranch: Known<string>;
  turnValues: TurnValues[];
  turnCount: Known<number>;
  totalTurnDurationMs: Known<number>;
  tokens: TokenTotals;
}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : {};
const string = (value: unknown): Known<string> =>
  typeof value === "string" && value.length > 0 ? value : "unknown";
const number = (value: unknown): Known<number> =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : "unknown";
const timestamp = (value: unknown): Known<string> =>
  typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))
    ? value : "unknown";

function* records(lines: Iterable<string>): Generator<ObjectValue> {
  for (const line of lines) {
    if (!line.trim()) continue;
    try { yield object(JSON.parse(line)); }
    catch { yield {}; }
  }
}

function tokens(value: unknown): TokenTotals {
  const usage = object(value);
  return {
    input_tokens: number(usage.input_tokens),
    cached_input_tokens: number(usage.cached_input_tokens),
    cache_write_input_tokens: number(usage.cache_write_input_tokens),
    output_tokens: number(usage.output_tokens),
    reasoning_output_tokens: number(usage.reasoning_output_tokens),
    total_tokens: number(usage.total_tokens),
  };
}

/** Structural diagnostics only: fixed tags, never record payloads or unknown type strings. */
export function rolloutTurnTags(lines: Iterable<string>): string[] {
  const tags: string[] = [];
  for (const record of records(lines)) {
    if (record.type === "turn_context") tags.push("turn_context");
    if (record.type === "event_msg") {
      const type = object(record.payload).type;
      if (type === "task_started" || type === "thread_settings_applied" || type === "task_complete") {
        tags.push(`event_msg.${type}`);
      }
    }
  }
  return tags;
}

/** Recorded token fields for source comparison; never derive or replace totals. */
export function rolloutTokenSources(lines: Iterable<string>): {
  thread: TokenTotals; tokenCount: TokenTotals; latestResponse: TokenTotals;
} {
  let thread = tokens(undefined);
  let tokenCount = tokens(undefined);
  let latestResponse = tokens(undefined);
  for (const record of records(lines)) {
    const payload = object(record.payload);
    if (record.type === "token_usage_record") {
      const next = recordedTokens(payload.thread_token_usage);
      if (next) thread = next;
      latestResponse = tokens(payload.usage);
    }
    if (record.type === "event_msg" && payload.type === "token_count") {
      const next = recordedTokens(object(payload.info).total_token_usage);
      if (next) tokenCount = next;
    }
  }
  return { thread, tokenCount, latestResponse };
}

function recordedTokens(value: unknown): TokenTotals | undefined {
  const parsed = tokens(value);
  return Object.values(parsed).some(value => value !== "unknown") ? parsed : undefined;
}

/** Project model responses in rollout order. IDs are used only for internal matching. */
export function parseRolloutResponses(lines: readonly string[], hasEarlierRollout = false): RolloutResponse[] {
  // Modern rollouts also write token_count snapshots for the same responses.
  let hasLedger = false;
  for (const record of records(lines)) {
    if (record.type === "token_usage_record") {
      hasLedger = true;
      break;
    }
  }
  const responses: RolloutResponse[] = [];
  const compactionIds = new Map<string, number>();
  const compactionBoundaries = new Set<number>();
  const identifiedResponses = new Map<string, RolloutResponse>();
  let previousTime = NaN;
  let previousSnapshot: TokenTotals | undefined;
  const baseline = tokens(undefined);
  // A later split may inherit usage from an earlier file. Wait for a local baseline.
  if (!hasEarlierRollout) {
    for (const field of responseTokenFields) baseline[field] = 0;
  }

  for (const record of records(lines)) {
    const payload = object(record.payload);
    const event = record.type === "event_msg" ? payload.type : undefined;
    if (record.type === "compacted" || event === "context_compacted") {
      const id = payload.compaction_response_id;
      if (hasLedger && typeof id === "string" && id) compactionIds.set(id, responses.length);
      else compactionBoundaries.add(responses.length);
      continue;
    }
    if (hasLedger ? record.type !== "token_usage_record" : event !== "token_count") continue;
    const id = hasLedger && typeof payload.response_id === "string" ? payload.response_id : "";
    if (id && identifiedResponses.has(id)) continue;
    const info = object(payload.info);
    const cumulative = tokens(hasLedger ? payload.thread_token_usage : info.total_token_usage);
    const direct = tokens(hasLedger ? payload.usage : info.last_token_usage);
    if (!hasLedger) {
      const hasSnapshot = responseTokenFields.some(field => cumulative[field] !== "unknown");
      // Rate limit updates can repeat the last usage or have no usage at all.
      if (hasSnapshot && responseTokenFields.every(field => cumulative[field] === previousSnapshot?.[field])) continue;
      if (!hasSnapshot && responseTokenFields.every(field => direct[field] === "unknown")) continue;
      previousSnapshot = hasSnapshot ? cumulative : undefined;
    }

    const usage = tokens(undefined);
    for (const field of responseTokenFields) {
      const previous = baseline[field];
      const current = cumulative[field];
      const reported = direct[field];
      usage[field] = reported !== "unknown" ? reported
        : current !== "unknown" && previous !== "unknown" ? number(current - previous) : "unknown";
      baseline[field] = current !== "unknown" ? current
        : previous !== "unknown" && reported !== "unknown" ? number(previous + reported) : "unknown";
    }
    const recordedTime = timestamp(record.timestamp);
    const currentTime = Date.parse(recordedTime);
    const elapsed = currentTime - previousTime;
    const response: RolloutResponse = {
      timestamp: recordedTime === "unknown" ? "unknown" : new Date(currentTime).toISOString(),
      seconds_since_previous_response: elapsed >= 0 ? elapsed / 1000 : "unknown",
      input_tokens: usage.input_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      output_tokens: usage.output_tokens,
      reasoning_output_tokens: usage.reasoning_output_tokens,
      total_tokens: usage.total_tokens,
      compaction: false,
    };
    responses.push(response);
    if (id) identifiedResponses.set(id, response);
    previousTime = currentTime;
  }
  // A linked marker can follow the compaction response and duplicate a context event.
  for (const [id, boundary] of compactionIds) {
    const response = identifiedResponses.get(id);
    if (response) {
      response.compaction = true;
      compactionBoundaries.delete(boundary);
    } else compactionBoundaries.add(boundary);
  }
  for (const boundary of compactionBoundaries) {
    if (responses[boundary]) responses[boundary].compaction = true;
  }
  return responses;
}

/** token_count override is for comparing the two recorded sources, without deriving totals. */
export function parseRollout(
  lines: Iterable<string>,
  tokenSource: "preferred" | "token_count" = "preferred",
): RolloutSummary {
  const summary: RolloutSummary = {
    sessionId: "unknown", threadId: "unknown", startTime: "unknown", endTime: "unknown",
    cliVersion: "unknown", originator: "unknown", source: "unknown",
    modelProvider: "unknown", gitBranch: "unknown", turnValues: [],
    turnCount: "unknown", totalTurnDurationMs: "unknown", tokens: tokens(undefined),
  };
  let metaSeen = false;
  let pendingTier: Known<string> = "unknown";
  let activeTurnId: string | undefined;
  let preferred: TokenTotals | undefined;
  let fallback: TokenTotals | undefined;
  const turns = new Map<string, TurnValues>();
  const durations = new Map<string, Known<number>>();
  for (const record of records(lines)) {
    const endTime = timestamp(record.timestamp);
    if (endTime !== "unknown") summary.endTime = endTime;
    const payload = object(record.payload);
    if (record.type === "session_meta" && !metaSeen) {
      metaSeen = true;
      summary.sessionId = string(payload.session_id);
      summary.threadId = string(payload.id);
      summary.startTime = timestamp(payload.timestamp);
      summary.cliVersion = string(payload.cli_version);
      summary.originator = string(payload.originator);
      summary.source = string(payload.source);
      summary.modelProvider = string(payload.model_provider);
      summary.gitBranch = string(object(payload.git).branch);
    }
    if (record.type === "event_msg" && payload.type === "thread_settings_applied") {
      const tier = string(object(payload.thread_settings).service_tier);
      const activeTurn = activeTurnId === undefined ? undefined : turns.get(activeTurnId);
      if (activeTurn) activeTurn.serviceTier = tier;
      else pendingTier = tier;
    }
    if (record.type === "turn_context") {
      // Repeated contexts for a turn are updates, not additional turns.
      const id = typeof payload.turn_id === "string" ? payload.turn_id : `missing-${turns.size}`;
      const existing = turns.get(id);
      turns.set(id, { model: string(payload.model), effort: string(payload.effort),
        serviceTier: existing?.serviceTier ?? pendingTier, turns: 1 });
      activeTurnId = id;
      pendingTier = "unknown";
    }
    if (record.type === "event_msg" && payload.type === "task_complete") {
      const id = typeof payload.turn_id === "string" ? payload.turn_id : `missing-${durations.size}`;
      durations.set(id, number(payload.duration_ms));
      if (payload.turn_id === activeTurnId || typeof payload.turn_id !== "string") activeTurnId = undefined;
    }
    if (record.type === "token_usage_record") {
      const next = recordedTokens(payload.thread_token_usage);
      if (next) preferred = next;
    }
    if (record.type === "event_msg" && payload.type === "token_count") {
      const next = recordedTokens(object(payload.info).total_token_usage);
      if (next) fallback = next;
    }
  }
  if (turns.size) summary.turnCount = turns.size;
  const groups = new Map<string, TurnValues>();
  for (const turn of turns.values()) {
    const key = JSON.stringify([turn.model, turn.effort, turn.serviceTier]);
    const group = groups.get(key);
    if (group) group.turns++;
    else groups.set(key, { ...turn });
  }
  summary.turnValues = [...groups.values()];
  // Sum recorded completed-turn durations only; do not estimate an active turn.
  if (durations.size && [...durations.values()].every(value => value !== "unknown")) {
    summary.totalTurnDurationMs = [...durations.values()].reduce<number>((sum, value) => sum + (value as number), 0);
  }
  summary.tokens = (tokenSource === "preferred" ? preferred ?? fallback : fallback) ?? tokens(undefined);
  return summary;
}

/** Discovery predicate only: the cwd must never become part of a summary. */
export function matchesRepository(lines: Iterable<string>, repository: string): boolean {
  for (const record of records(lines)) {
    if (record.type === "session_meta") return object(record.payload).cwd === repository;
  }
  return false;
}
