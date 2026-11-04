// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { matchesRepository, parseRollout, rolloutTokenSources, rolloutTurnTags } from "../../../workflow/scripts/rollout-parser";
import { summarizeRollouts } from "../../../workflow/scripts/rollout-files";

const time = "2026-01-01T00:00:00.000Z";
const record = (type: string, payload: unknown, timestamp = time) => JSON.stringify({ type, payload, timestamp });
const meta = (id = "thread-a", session = "shared-session", cwd = "/synthetic-repo") => record("session_meta", {
  id, session_id: session, cwd, timestamp: time, cli_version: "1.0", originator: "codex-tui",
  source: "cli", model_provider: "openai", git: { branch: "docs/example" },
});
const usage = { input_tokens: 100, cached_input_tokens: 70, cache_write_input_tokens: 2,
  output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 999 }; // Deliberately not a derived sum.
const context = (id: string, model = "model-a", effort = "medium") => record("turn_context", { turn_id: id, model, effort });
const complete = (id: string, duration: unknown) => record("event_msg", { type: "task_complete", turn_id: id, duration_ms: duration });
const settings = (tier: string) => record("event_msg", { type: "thread_settings_applied", thread_settings: { service_tier: tier } });
const started = () => record("event_msg", { type: "task_started" });
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("pure rollout projection", () => {
  it("projects metadata, last timestamp, switched turn settings and completed durations", () => {
    // Real ordering: first settings follow context; between-turn settings precede the next start.
    const lines = [meta(), started(), context("a"), settings("default"), context("a"), complete("a", 10),
      settings("default"), started(), context("b"), complete("b", 20),
      started(), context("c", "model-b", "high"), settings("priority"), complete("c", 30),
      settings("default"), record("future", { secret: "ignored" }, "2026-01-02T00:00:00Z")];
    const summary = parseRollout(lines);
    expect(summary).toMatchObject({ sessionId: "shared-session", threadId: "thread-a", startTime: time,
      endTime: "2026-01-02T00:00:00Z", cliVersion: "1.0", originator: "codex-tui", source: "cli",
      modelProvider: "openai", gitBranch: "docs/example", turnCount: 3, totalTurnDurationMs: 60 });
    expect(summary.turnValues).toEqual([
      { model: "model-a", effort: "medium", serviceTier: "default", turns: 2 },
      { model: "model-b", effort: "high", serviceTier: "priority", turns: 1 },
    ]);
    expect(rolloutTurnTags(lines).slice(0, 3)).toEqual(["event_msg.task_started", "turn_context", "event_msg.thread_settings_applied"]);
  });
  it("does not attribute a missing setting to a previous turn or overwrite a completed turn", () => {
    const summary = parseRollout([started(), context("a"), settings("priority"), complete("a", 1),
      started(), context("b"), complete("b", 2), settings("default")]);
    expect(summary.turnValues.map(value => value.serviceTier)).toEqual(["priority", "unknown"]);
  });
  it("prefers the last thread usage, falls back to last total usage, and preserves recorded numbers", () => {
    const fallback = record("event_msg", { type: "token_count", info: { total_token_usage: usage } });
    expect(parseRollout([fallback]).tokens).toEqual(usage);
    expect(parseRollout([fallback, record("token_usage_record", {})]).tokens).toEqual(usage);
    const lines = [record("token_usage_record", { thread_token_usage: usage }), fallback,
      record("token_usage_record", { thread_token_usage: { input_tokens: 200 } }), fallback];
    expect(parseRollout(lines).tokens).toEqual({ input_tokens: 200, cached_input_tokens: "unknown",
      cache_write_input_tokens: "unknown", output_tokens: "unknown", reasoning_output_tokens: "unknown", total_tokens: "unknown" });
    expect(parseRollout(lines, "token_count").tokens).toEqual(usage);
  });
  it("retains the last usable record from each token source across missing usage", () => {
    const lines = [record("token_usage_record", { thread_token_usage: usage, usage }),
      record("event_msg", { type: "token_count", info: { total_token_usage: usage } }),
      record("event_msg", { type: "token_count", info: null }),
      record("event_msg", { type: "token_count", info: { total_token_usage: null } }),
      record("token_usage_record", {}), record("token_usage_record", { thread_token_usage: null }),
      record("token_usage_record", { thread_token_usage: {} })];
    expect(parseRollout(lines).tokens).toEqual(usage);
    expect(parseRollout(lines, "token_count").tokens).toEqual(usage);
    expect(rolloutTokenSources(lines)).toEqual({ thread: usage, tokenCount: usage,
      latestResponse: parseRollout([]).tokens });
  });
  it("retains the last valid end timestamp across malformed and partial lines", () => {
    expect(parseRollout([meta(), record("future", {}, "2026-01-02T00:00:00Z"), "{", "null",
      JSON.stringify({ type: "future", timestamp: "invalid" }), "{\"timestamp\":"]).endTime).toBe("2026-01-02T00:00:00Z");
    expect(parseRollout(["{", "null"]).endTime).toBe("unknown");
  });
  it("projects recorded per-response usage separately from both cumulative sources", () => {
    const response = { ...usage, input_tokens: 3 };
    const lines = [record("token_usage_record", { thread_token_usage: usage, usage: response }),
      record("event_msg", { type: "token_count", info: { total_token_usage: { ...usage, input_tokens: 97 } } })];
    expect(rolloutTokenSources(lines)).toEqual({ thread: usage, tokenCount: { ...usage, input_tokens: 97 }, latestResponse: response });
  });
  it("reports unknown for malformed, missing, invalid and unfinished data", () => {
    const summary = parseRollout(["{", "null", record("turn_context", { model: 42 }),
      record("event_msg", { type: "token_count", info: { total_token_usage: { input_tokens: -1, output_tokens: "12" } } }), "bad"]);
    expect(summary.sessionId).toBe("unknown");
    expect(summary.endTime).toBe(time);
    expect(summary.totalTurnDurationMs).toBe("unknown");
    expect(summary.turnValues[0]).toEqual({ model: "unknown", effort: "unknown", serviceTier: "unknown", turns: 1 });
    expect(Object.values(summary.tokens)).toEqual(Array(6).fill("unknown"));
    expect(parseRollout([context("a"), complete("a", 2), context("b")]).totalTurnDurationMs).toBe(2);
    expect(parseRollout([complete("a", "bad")]).totalTurnDurationMs).toBe("unknown");
    expect(parseRollout([]).turnCount).toBe("unknown");
  });
  it("never emits a sentinel from strings outside the summary allowlist", () => {
    const sentinel = "PRIVATE_SENTINEL";
    // Synthetic examples of every excluded record family and sensitive nested data.
    const excluded = [
      record("response_item", { type: sentinel, role: sentinel, content: [{ text: sentinel }], arguments: sentinel, output: sentinel, encrypted_content: sentinel }),
      record("world_state", { state: { base_instructions: sentinel, environments: { local: { cwd: sentinel } } } }),
      record("event_msg", { type: "item_completed", item: { command: [sentinel], stdout: sentinel, stderr: sentinel, aggregated_output: sentinel } }),
      record("event_msg", { type: "token_count", info: { total_token_usage: usage }, rate_limits: { credits: { balance: sentinel }, plan_type: sentinel } }),
      record("session_meta", { id: "thread", session_id: "session", cwd: sentinel, creator_account_id: sentinel, creator_user_id: sentinel,
        git: { repository_url: sentinel, commit_hash: sentinel }, base_instructions: { text: sentinel, provenance: { model: sentinel } }, source_extra: sentinel }),
      record("turn_context", { turn_id: sentinel, cwd: sentinel, summary: sentinel, collaboration_mode: { settings: { developer_instructions: sentinel } } }),
      record("event_msg", { type: "task_complete", turn_id: sentinel, last_agent_message: sentinel, duration_ms: 1 }),
      record("token_usage_record", { response_id: sentinel, session_id: sentinel, thread_id: sentinel, turn_id: sentinel, thread_token_usage: usage }),
      record("event_msg", { type: "thread_settings_applied", thread_id: sentinel, thread_settings: { cwd: sentinel, model: sentinel, personality: sentinel } }),
    ];
    expect(JSON.stringify(parseRollout(excluded))).not.toContain(sentinel);
    expect(JSON.stringify(rolloutTokenSources(excluded))).not.toContain(sentinel);
    expect(JSON.stringify(rolloutTurnTags(excluded))).not.toContain(sentinel);
    expect(matchesRepository(excluded, sentinel)).toBe(true);
  });
});

async function fixtureHome() {
  const home = await mkdtemp(join(tmpdir(), "rollout-test-")); temporary.push(home);
  const directory = join(home, "sessions", "synthetic"); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "rollout-a.jsonl"), [meta(), context("a")].join("\n"));
  await writeFile(join(directory, "rollout-b.jsonl"), [meta("thread-b"), record("future", {}, "2026-01-02T00:00:00Z")].join("\n"));
  await writeFile(join(directory, "rollout-other.jsonl"), meta("other", "other-session", "/other-repo"));
  return { home, directory };
}

describe("file selection and CLI", () => {
  it("keeps shared sessions separate and prefers environment thread identity", async () => {
    const { home } = await fixtureHome();
    const env = { CODEX_HOME: home, CODEX_THREAD_ID: "thread-a", CODEX_SESSION_ID: "shared-session" };
    expect((await summarizeRollouts({}, env, "/synthetic-repo"))[0].threadId).toBe("thread-a");
    expect((await summarizeRollouts({ list: 10 }, env, "/synthetic-repo")).map(value => value.threadId)).toEqual(["thread-b", "thread-a"]);
    await expect(summarizeRollouts({ id: "shared-session" }, env, "/synthetic-repo")).rejects.toThrow();
    expect(await summarizeRollouts({ id: "missing" }, env, "/synthetic-repo")).toEqual([]);
    expect((await summarizeRollouts({}, { CODEX_HOME: home }, "/synthetic-repo"))[0].threadId).toBe("thread-b");
    expect((await summarizeRollouts({ id: "other-session" }, env, "/synthetic-repo"))[0].threadId).toBe("other");
  });
  it("reads explicit paths and suppresses all raw filesystem/argument errors", async () => {
    const { home, directory } = await fixtureHome();
    expect((await summarizeRollouts({ path: join(directory, "rollout-a.jsonl") }, {}, "/synthetic-repo"))[0].sessionId).toBe("shared-session");
    const success = spawnSync("bun", ["workflow/scripts/rollout-summary.ts", "--path", join(directory, "rollout-a.jsonl")], { encoding: "utf8" });
    expect(success.status).toBe(0);
    expect(JSON.parse(success.stdout).threadId).toBe("thread-a");
    for (const args of [["--path", join(home, "PRIVATE_SENTINEL")], ["--PRIVATE_SENTINEL"], ["--list", "-1"]]) {
      const result = spawnSync("bun", ["workflow/scripts/rollout-summary.ts", ...args], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual(parseRollout([]));
      expect(result.stdout).not.toContain("PRIVATE_SENTINEL");
    }
  });
});
