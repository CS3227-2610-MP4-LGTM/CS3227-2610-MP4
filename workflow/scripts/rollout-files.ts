import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { matchesRepository, parseRollout, type RolloutSummary } from "./rollout-parser";

export interface RolloutFile {
  summary: RolloutSummary;
  inRepository: boolean;
}

export async function readRollout(path: string, repository: string, tokenSource: "preferred" | "token_count" = "preferred"): Promise<RolloutFile> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  return { summary: parseRollout(lines, tokenSource), inRepository: matchesRepository(lines, repository) };
}

export async function discoverRollouts(directory: string): Promise<string[]> {
  const paths: string[] = [];
  // Do not follow symlinks or inspect files other than rollout JSONL.
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await discoverRollouts(path));
    else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) paths.push(path);
  }
  return paths;
}

export interface Selection {
  list?: number;
  id?: string;
  path?: string;
  tokenSource?: "preferred" | "token_count";
}

export interface RolloutEnvironment {
  CODEX_HOME?: string;
  CODEX_THREAD_ID?: string;
  CODEX_SESSION_ID?: string;
}

export async function summarizeRollouts(
  selection: Selection,
  env: RolloutEnvironment = {
    CODEX_HOME: process.env.CODEX_HOME,
    CODEX_THREAD_ID: process.env.CODEX_THREAD_ID,
    CODEX_SESSION_ID: process.env.CODEX_SESSION_ID,
  },
  repository = process.cwd(),
): Promise<RolloutSummary[]> {
  const repo = resolve(repository);
  if (selection.path) return [(await readRollout(selection.path, repo, selection.tokenSource)).summary];
  const paths = await discoverRollouts(join(env.CODEX_HOME || join(homedir(), ".codex"), "sessions"));
  const candidates: RolloutFile[] = [];
  for (const path of paths) {
    // A disappearing or unreadable rollout must not leak a filesystem error/path.
    try { candidates.push(await readRollout(path, repo, selection.tokenSource)); }
    catch { /* Ignore inaccessible candidates. */ }
  }
  const time = (file: RolloutFile) => Date.parse(file.summary.endTime) || Date.parse(file.summary.startTime) || 0;
  const recent = (values: RolloutFile[]) => values.sort((a, b) => time(b) - time(a));
  if (selection.list !== undefined) {
    return recent(candidates.filter(file => file.inRepository)).slice(0, selection.list).map(file => file.summary);
  }
  const thread = selection.id || env.CODEX_THREAD_ID;
  const session = selection.id || env.CODEX_SESSION_ID;
  const byThread = thread ? candidates.filter(file => file.summary.threadId === thread) : [];
  const bySession = session ? candidates.filter(file => file.summary.sessionId === session) : [];
  const matches = recent(byThread.length ? byThread : bySession);
  if (matches.length) {
    if (new Set(matches.map(file => file.summary.threadId)).size > 1) throw new Error();
    // Split rollouts may already have cumulative totals; select one, never sum them.
    return [(matches.find(file => file.summary.tokens.total_tokens !== "unknown") ?? matches[0]).summary];
  }
  // An explicit or environment-provided identity must never silently select another session.
  if (thread || session) return [];
  return recent(candidates.filter(file => file.inRepository)).slice(0, 1).map(file => file.summary);
}
