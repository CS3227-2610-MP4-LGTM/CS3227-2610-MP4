import "server-only";
import { buildRequest, measureRequest, type Provider } from "./provider";
import { validateInput, validateOutput, validateRetainedContext, type OutputEnvelope } from "./contracts";
import { effectiveLimits, type Limits } from "./config";
import { errorCode, fail } from "./errors";
import type { Accounting, Settlement } from "./accounting";
import type { RetainedFlaw } from "./safety";

export type RunInput = {
    accountId: string;
    resourceId: string;
    idempotencyKey: string;
    snapshot: unknown;
    retainedFlaws: RetainedFlaw[];
    fingerprint: string;
};
export type RunResult = {
    data: OutputEnvelope;
    meta: { attempts: number; outputRetried: boolean; deadline: number };
} | {
    data?: never;
    error: { code: string };
} | {
    data?: never;
    meta: { status: string; attempts: number; outputRetried: boolean };
};

export function createOperationRunner(options: {
    provider: Provider;
    accounting: Accounting;
    clock: () => number;
    limits: Limits;
    measureInput?: (request: ReturnType<typeof buildRequest>) => number;
    diagnostics?: { log: unknown; trace: unknown };
}) {
    const limits = effectiveLimits(options.limits);
    const { accounting, provider, clock } = options;
    return {
        async run(input: RunInput): Promise<RunResult> {
            let operationId: string | undefined;
            let operationClosed = false;
            let attempts = 0;
            let deadline = clock() + limits.operationMs;

            function checkDeadline() {
                if (clock() >= deadline) fail("AI_TIMEOUT");
            }
            async function expire() {
                // This is a separate committed transition. A rejected late
                // settlement/close must not roll back the expiry that frees slots.
                if (accounting.expire) await accounting.expire();
            }
            async function settle(input: Settlement) {
                if (clock() >= deadline) {
                    await expire();
                    fail("AI_TIMEOUT");
                }
                try {
                    await accounting.settle(input);
                } catch (error) {
                    if (clock() >= deadline) {
                        await expire();
                        fail("AI_TIMEOUT");
                    }
                    throw error;
                }
                checkDeadline();
            }
            async function close(outcome: "completed" | "failed") {
                if (operationId && !operationClosed) {
                    await accounting.close({ operationId, outcome });
                    operationClosed = true;
                }
            }

            try {
                const snapshot = validateInput(input.snapshot);
                if (snapshot.operation === "assess_review" && !snapshot.payload.matches.length) {
                    return {
                        data: { schemaVersion: 1, operation: "assess_review", payload: { assessments: [] } },
                        meta: { attempts: 0, outputRetried: false, deadline },
                    };
                }
                validateRetainedContext(snapshot, input.retainedFlaws);
                const request = buildRequest(snapshot);
                const inputTokens = (options.measureInput ?? measureRequest)(request);
                if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > limits.inputTokens) fail("PAYLOAD_TOO_LARGE");

                for (let index = 0; index < limits.attemptsPerOperation; index++) {
                    checkDeadline();
                    const admitted = await accounting.reserve({
                        accountId: input.accountId, resourceId: input.resourceId,
                        idempotencyKey: input.idempotencyKey, fingerprint: input.fingerprint,
                        operation: snapshot.operation, inputTokens, outputTokens: limits.outputTokens, operationId,
                    });
                    operationId = admitted.operationId;
                    if (admitted.status !== "reserved") {
                        operationId = undefined;
                        return { meta: { status: admitted.status, attempts: 0, outputRetried: false } };
                    }
                    const reservationDeadline = Date.parse(admitted.expiresAt);
                    if (!Number.isFinite(reservationDeadline)) fail("SERVICE_UNAVAILABLE");
                    deadline = Math.min(deadline, reservationDeadline);
                    const reservationId = admitted.reservationId;
                    checkDeadline();
                    try {
                        await accounting.markDispatched({ reservationId });
                    } catch {
                        await settle({ reservationId, outcome: "not_dispatched" });
                        fail("SERVICE_UNAVAILABLE");
                    }
                    checkDeadline();
                    attempts++;
                    const controller = new AbortController();
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    let result: Awaited<ReturnType<Provider["execute"]>>;
                    try {
                        const timeout = Math.min(limits.attemptMs, deadline - clock());
                        if (timeout <= 0) fail("AI_TIMEOUT");
                        const attemptDeadline = clock() + timeout;
                        const timedOut = new Promise<never>((_, reject) => {
                            timer = setTimeout(() => {
                                controller.abort();
                                reject(Object.assign(new Error("AI_TIMEOUT"), { code: "AI_TIMEOUT" }));
                            }, timeout);
                        });
                        result = await Promise.race([
                            provider.execute(request, { maxOutputTokens: limits.outputTokens, signal: controller.signal }),
                            timedOut,
                        ]);
                        if (clock() >= attemptDeadline) {
                            controller.abort();
                            fail("AI_TIMEOUT");
                        }
                    } catch (error) {
                        const code = errorCode(error, "AI_UNAVAILABLE");
                        await settle({ reservationId, outcome: "uncertain" });
                        if (code === "INVALID_AI_OUTPUT" && index + 1 < limits.attemptsPerOperation) continue;
                        fail(code === "AI_TIMEOUT" || code === "INVALID_AI_OUTPUT" ? code : "AI_UNAVAILABLE");
                    } finally {
                        if (timer) clearTimeout(timer);
                    }

                    const usage = result.usage;
                    const validUsage = usage?.verified && Number.isSafeInteger(usage.inputTokens) &&
                        Number.isSafeInteger(usage.outputTokens) && usage.inputTokens >= 0 && usage.outputTokens >= 0 &&
                        usage.inputTokens <= inputTokens && usage.outputTokens <= limits.outputTokens;
                    await settle({
                        reservationId,
                        outcome: validUsage ? "verified" : "uncertain",
                        ...(validUsage ? { usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } } : {}),
                    });
                    let validated: OutputEnvelope;
                    try {
                        if (usage?.verified && !validUsage) fail("INVALID_AI_OUTPUT");
                        if (new TextEncoder().encode(JSON.stringify(result.output)).length > limits.responseBytes) fail("INVALID_AI_OUTPUT");
                        validated = validateOutput(snapshot, result.output, { retainedFlaws: input.retainedFlaws });
                    } catch {
                        if (index + 1 < limits.attemptsPerOperation) continue;
                        fail("INVALID_AI_OUTPUT");
                    }
                    checkDeadline();
                    await close("completed");
                    checkDeadline();
                    return { data: validated, meta: { attempts, outputRetried: attempts > 1, deadline } };
                }
                fail("INVALID_AI_OUTPUT");
            } catch (error) {
                let code = clock() >= deadline ? "AI_TIMEOUT" : errorCode(error);
                try {
                    if (clock() >= deadline) await expire();
                    else await close("failed");
                } catch {
                    // Once expiry is committed, INVALID_STATE from a late close
                    // is expected. Actual accounting outages still fail closed.
                    if (code !== "AI_TIMEOUT") code = "SERVICE_UNAVAILABLE";
                }
                return { error: { code } };
            }
        },
    };
}
