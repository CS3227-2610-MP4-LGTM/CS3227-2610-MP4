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
