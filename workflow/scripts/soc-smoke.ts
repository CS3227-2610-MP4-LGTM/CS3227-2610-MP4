import { readFile, realpath } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
    ceilings, getSocKey, reviewedSocDeployment, socEfforts, socOperationSettings,
    type LlmEnvironment,
} from "../../src/server/llm/config";
import {
    retainedContextSchema, validateInput, validateOutput, validateRetainedContext, type InputEnvelope,
} from "../../src/server/llm/contracts";
import { errorCode, fail } from "../../src/server/llm/errors";
import { UnsafeLearnerText } from "../../src/server/llm/safety";
import { createSocClient } from "../../src/server/llm/soc";

type Dependencies = {
    env: LlmEnvironment;
    readFile: (path: string) => Promise<string>;
    fetch: typeof fetch;
    clock: () => number;
    sleep: (ms: number) => Promise<void>;
};
const maxCalls = 30;
const spacingMs = 4000;
const caseIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/i);
const fixture = z.strictObject({
    caseId: caseIdSchema.optional(),
    payload: z.unknown(),
    retainedFlaws: retainedContextSchema.optional(),
});
const fixtureSchema = z.array(fixture.transform(value => ({ ...value, labels: undefined }))).min(1).max(maxCalls);
const credit = z.literal([0, 0.5, 1]);
const pairIdentity = z.object({ key: z.uuid(), commentId: z.uuid() });
const singleLabels = z.strictObject({ explanation_label: credit, fix_label: credit });
const pairLabel = pairIdentity.extend(singleLabels.shape).strict();
const labelledFixtureSchema = z.array(z.union([
    fixture.extend({ caseId: caseIdSchema, ...singleLabels.shape })
        .transform(({ explanation_label, fix_label, ...value }) => ({
            ...value, labels: { explanation_label, fix_label },
        })),
    fixture.extend({ caseId: caseIdSchema, assessment_labels: z.array(pairLabel).min(2).max(5) })
        .transform(({ assessment_labels, ...value }) => ({ ...value, labels: assessment_labels })),
])).min(1).max(maxCalls);
const assessmentPairs = z.object({ operation: z.literal("assess_review"),
    payload: z.object({ assessments: z.array(pairIdentity).max(5) }),
});
function pairKey(pair: z.infer<typeof pairIdentity>) {
    return pair.key + ":" + pair.commentId;
}
function hasDuplicatePair(output: unknown) {
    const parsed = assessmentPairs.safeParse(output);
    if (!parsed.success) return false;
    const keys = parsed.data.payload.assessments.map(pairKey);
    return new Set(keys).size !== keys.length;
}
const columns = [
    "case_id", "operation", "effort", "max_tokens", "latency_ms", "prompt_tokens", "completion_tokens",
    "finish_reason", "reasoning_chars", "answer_chars", "valid", "rejection_reason", "rejection_detail", "assessment_credits",
    "explanation_label", "fix_label", "exact_agreement", "attempt", "assessment_labels",
];

function positiveInteger(value: string, max: number, option: string) {
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max)
        throw new Error(`${option} must be an integer from 1 to ${max}`);
    return number;
}

function csvCell(value: string | number | boolean | undefined) {
    const cell = String(value ?? "");
    return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export async function runSocSmoke(args: string[], deps: Dependencies): Promise<string> {
    let values;
    try {
        ({ values } = parseArgs({ args, options: {
            live: { type: "boolean" },
            operation: { type: "string" },
            input: { type: "string", multiple: true },
            "labelled-input": { type: "string" },
            repeat: { type: "string", default: "1" },
            effort: { type: "string" },
            "max-tokens": { type: "string" },
        } }));
    } catch {
        throw new Error("Use --live --operation (--input or --labelled-input) [--repeat] [--effort] [--max-tokens]");
    }
    if (!values.live) throw new Error("--live is required");
    const key = getSocKey(deps.env);
    if (!values.operation || !Object.hasOwn(socOperationSettings, values.operation))
        throw new Error("--operation is missing or invalid");
    const operation = values.operation as InputEnvelope["operation"];
    const labelledInput = values["labelled-input"];
    if (labelledInput !== undefined && (operation !== "assess_review" || values.input?.length))
        throw new Error("--labelled-input requires assess_review and cannot be combined with --input");
    const inputPaths = labelledInput === undefined ? values.input : [labelledInput];
    if (!inputPaths?.length) throw new Error("--input or --labelled-input is required");
    const repeat = positiveInteger(values.repeat, maxCalls, "--repeat");
    const defaults = socOperationSettings[operation];
    const effort = z.enum(socEfforts).safeParse(values.effort ?? defaults.effort);
    if (!effort.success) throw new Error("--effort must be none, low, medium or high");
    const maxOutputTokens = values["max-tokens"] === undefined ? defaults.maxOutputTokens :
        positiveInteger(values["max-tokens"], ceilings.outputTokens, "--max-tokens");
    const client = createSocClient({ ...reviewedSocDeployment, fetch: deps.fetch }, key, ceilings);

    const cases = [];
    let maximumCalls = 0;
    const inputSchema = labelledInput === undefined ? fixtureSchema : labelledFixtureSchema;
    for (const path of inputPaths) {
        let fixtures;
        try {
            fixtures = inputSchema.parse(JSON.parse(await deps.readFile(path)));
        } catch {
            fail("VALIDATION_ERROR");
        }
        for (const fixture of fixtures) {
            const snapshot = validateInput({ schemaVersion: 1, operation, payload: fixture.payload });
            if (snapshot.operation === "assess_review") {
                const { matches } = snapshot.payload;
                if (Array.isArray(fixture.labels)) {
                    const labels = new Set(fixture.labels.map(pairKey));
                    if (matches.length !== fixture.labels.length || labels.size !== fixture.labels.length ||
                        matches.some(({ key, comment }) => !labels.has(pairKey({ key, commentId: comment.id }))))
                        fail("VALIDATION_ERROR");
                } else if (!matches.length || (fixture.labels && matches.length !== 1)) {
                    fail("VALIDATION_ERROR");
                }
            }
            maximumCalls += (Array.isArray(fixture.labels) ? ceilings.attemptsPerOperation : 1) * repeat;
            if (maximumCalls > maxCalls) throw new Error("A run allows at most 30 calls");
            validateRetainedContext(snapshot, fixture.retainedFlaws);
            const prepared = client.prepare(snapshot, { effort: effort.data, maxOutputTokens });
            cases.push({
                caseId: fixture.caseId ?? `case-${cases.length + 1}`,
                snapshot,
                retainedFlaws: fixture.retainedFlaws ?? [],
                prepared,
                labels: fixture.labels,
            });
        }
    }

    const rows = [columns.join(",")];
    let lastStart: number | undefined;
    for (let run = 0; run < repeat; run++) {
        for (const { caseId, prepared, snapshot, retainedFlaws, labels } of cases) {
            const pairs = Array.isArray(labels) ? labels : undefined;
            const single = Array.isArray(labels) ? undefined : labels;
            const maxAttempts = pairs ? ceilings.attemptsPerOperation : 1;
            while (lastStart !== undefined && deps.clock() - lastStart < spacingMs)
                await deps.sleep(spacingMs - (deps.clock() - lastStart));
            const operationDeadline = deps.clock() + ceilings.operationMs;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                while (lastStart !== undefined && deps.clock() - lastStart < spacingMs)
                    await deps.sleep(spacingMs - (deps.clock() - lastStart));
                const start = deps.clock();
                const remaining = operationDeadline - start;
                if (remaining <= 0) break;
                const attemptMs = Math.min(ceilings.attemptMs, remaining);
                lastStart = start;
                let result: Awaited<ReturnType<typeof prepared.execute>> | undefined;
                let rejectionReason = "";
                let rejectionDetail = "";
                let credits: string | undefined;
                let exactAgreement: boolean | undefined;
                const controller = new AbortController();
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    const timeout = new Promise<never>((_, reject) => {
                        timer = setTimeout(() => {
                            controller.abort();
                            reject(Object.assign(new Error("AI_TIMEOUT"), { code: "AI_TIMEOUT" }));
                        }, attemptMs);
                    });
                    const response = await Promise.race([prepared.execute(controller.signal), timeout]);
                    if (deps.clock() - start >= attemptMs) fail("AI_TIMEOUT");
                    result = response;
                    if (response.detail) {
                        rejectionDetail = response.detail;
                        fail("INVALID_AI_OUTPUT");
                    }
                    try {
                        const output = validateOutput(snapshot, response.output, { retainedFlaws });
                        if (output.operation === "assess_review") {
                            const { assessments } = output.payload;
                            if (Array.isArray(labels)) {
                                const byPair = new Map(assessments.map(assessment => [pairKey(assessment), assessment]));
                                exactAgreement = labels.every(label => {
                                    const assessment = byPair.get(pairKey(label));
                                    return assessment?.explanationCredit === label.explanation_label && assessment.fixCredit === label.fix_label;
                                });
                                credits = JSON.stringify(assessments.map(({ key, commentId, explanationCredit, fixCredit }) =>
                                    ({ key, commentId, explanationCredit, fixCredit })));
                            } else {
                                credits = JSON.stringify(assessments.map(({ explanationCredit, fixCredit }) => ({ explanationCredit, fixCredit })));
                                if (labels) {
                                    const [{ explanationCredit, fixCredit }] = assessments;
                                    exactAgreement = explanationCredit === labels.explanation_label && fixCredit === labels.fix_label;
                                }
                            }
                        }
                    } catch (error) {
                        rejectionDetail = error instanceof UnsafeLearnerText ? "safety" :
                            hasDuplicatePair(response.output) ? "duplicate_pair" : "contract";
                        fail("INVALID_AI_OUTPUT");
                    }
                } catch (error) {
                    const expired = !result && deps.clock() - start >= attemptMs;
                    if (expired) controller.abort();
                    const code = expired ? "AI_TIMEOUT" : errorCode(error, "AI_UNAVAILABLE");
                    rejectionReason = code === "AI_TIMEOUT" || code === "INVALID_AI_OUTPUT" ? code : "AI_UNAVAILABLE";
                } finally {
                    clearTimeout(timer);
                }
                rows.push([
                    caseId, operation, effort.data, prepared.outputTokens, Math.round(deps.clock() - start),
                    result?.usage?.inputTokens, result?.usage?.outputTokens, result?.stats.finishReason,
                    result?.stats.reasoningChars, result?.stats.answerChars, !rejectionReason,
                    rejectionReason, rejectionDetail, credits,
                    single?.explanation_label, single?.fix_label, exactAgreement, attempt,
                    pairs && JSON.stringify(pairs),
                ].map(csvCell).join(","));
                if (rejectionReason !== "INVALID_AI_OUTPUT") break;
            }
        }
    }
    return rows.join("\n") + "\n";
}

async function main() {
    if (!process.versions.bun || !process.execArgv.includes("--no-env-file") ||
        process.execArgv.some(arg => arg === "--env-file" || arg.startsWith("--env-file=")))
        throw new Error("Run with bun --no-env-file --conditions=react-server");
    if (process.env.APP_ENV === "production" || process.env.APP_ENV === "ci" ||
        (process.env.CI && process.env.CI !== "false" && process.env.CI !== "0"))
        throw new Error("Use the development SOCLAAS_API_KEY from a local shell");
    const csv = await runSocSmoke(process.argv.slice(2), {
        env: process.env,
        readFile: async path => {
            const actual = await realpath(path);
            if ([path, actual].some(file => basename(file).startsWith(".env") || extname(file) !== ".json"))
                fail("VALIDATION_ERROR");
            return readFile(actual, "utf8");
        },
        fetch: globalThis.fetch,
        clock: () => performance.now(),
        sleep,
    });
    process.stdout.write(csv);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main().catch((error: unknown) => {
        process.stderr.write((error instanceof Error ? error.message : "AI_UNAVAILABLE") + "\n");
        process.exitCode = 1;
    });
}
