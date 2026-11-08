import "server-only";
import { createAdminClient } from "@/server/supabase/admin";
import { effectiveLimits, type Limits } from "./config";
import { errorCode, fail } from "./errors";
import type { Json } from "@/lib/supabase/database.types";
export type SqlExecutor = {
    query: (sql: string, values?: unknown[]) => Promise<{
        rows: Record<string, unknown>[];
    }>;
};
export type ReservationInput = {
    accountId: string;
    operation: string;
    resourceId: string;
    idempotencyKey: string;
    fingerprint: string;
    inputTokens: number;
    outputTokens: number;
    operationId?: string;
};
export type Admission = {
    status: string;
    operationId: string;
    reservationId: string;
    expiresAt: string;
};
export type Settlement = {
    reservationId: string;
    outcome: "verified" | "uncertain" | "not_dispatched";
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
};
export type Usage = {
    account: {
        active: number;
        minuteAttempts: number;
        dayAttempts: number;
        dayTokens: number;
    };
    environment: {
        active: number;
        minuteAttempts: number;
        dayAttempts: number;
        dayTokens: number;
    };
};
export type Accounting = {
    expire?: () => Promise<void>;
    reserve: (input: ReservationInput) => Promise<Admission>;
    markDispatched: (input: {
        reservationId: string;
    }) => Promise<void>;
    settle: (input: Settlement) => Promise<void>;
    close: (input: {
        operationId: string;
        outcome: "completed" | "failed";
    }) => Promise<void>;
    read?: (input: {
        accountId: string;
        at?: number;
    }) => Promise<Usage>;
    gradingContext?: (input: {
        accountId: string;
        submissionId: string;
    }) => Promise<unknown>;
};
export function createAccountingStore(options: {
    db?: SqlExecutor;
    clock: () => number;
    limits: Limits;
    environmentId: string;
}) {
    const limits = effectiveLimits(options.limits);
    async function rpc(name: "llm_accounting" | "llm_grading_context", args: Record<string, unknown>) {
        try {
            if (options.db) {
                const values = name === "llm_accounting" ? [args.action, JSON.stringify(args.args)] : [args.account_id, args.submission_id];
                const result = await options.db.query(name === "llm_accounting" ? "select public.llm_accounting($1::text,$2::jsonb) as result" : "select public.llm_grading_context($1::uuid,$2::uuid) as result", values);
                return result.rows[0].result;
            }
            const admin = createAdminClient();
            const result = name === "llm_accounting" ? await admin.rpc("llm_accounting", {
                action: args.action as string,
                args: args.args as Json
            }) : await admin.rpc("llm_grading_context", {
                account_id: args.account_id as string,
                submission_id: args.submission_id as string
            });
            if (result.error)
                throw result.error;
            return result.data;
        }
        catch (error) {
            // SQL business errors carry a fixed message rather than Postgres' SQLSTATE.
            const message = (error as {
                message?: string;
            })?.message;
            fail(message && errorCode({
                code: message
            }, "") ? message : errorCode(error));
        }
    }
    async function call(action: string, input: object = {}) {
        const argumentsFor = (value: object) => ({
            ...value,
            environmentId: options.environmentId,
            now: new Date(options.clock()).toISOString(),
            limits,
        });
        const commitExpiry = () => rpc("llm_accounting", { action: "expire", args: argumentsFor({}) });
        const mutation = ["dispatch", "settle", "close"].includes(action);
        // SQL rejects late transitions with INVALID_STATE. Commit expiry in its
        // own transaction first so that rejection cannot restore an active slot.
        if (mutation) await commitExpiry();
        try {
            return await rpc("llm_accounting", { action, args: argumentsFor(input) });
        } catch (error) {
            // Also cover a real clock crossing expiry between the two calls.
            if (mutation) await commitExpiry();
            throw error;
        }
    }
    return {
        reserve: async (input: ReservationInput) => await call("reserve", input) as Admission,
        markDispatched: async (input: {
            reservationId: string;
        }) => {
            await call("dispatch", input);
        },
        settle: async (input: Settlement) => {
            await call("settle", input);
        },
        close: async (input: {
            operationId: string;
            outcome: "completed" | "failed";
        }) => {
            await call("close", input);
        },
        expire: async () => {
            await call("expire");
        },
        read: async (input: {
            accountId: string;
            at?: number;
        }) => await call("read", {
            ...input,
            at: input.at === undefined ? undefined : new Date(input.at).toISOString()
        }) as Usage,
        gradingContext: async (input: {
            accountId: string;
            submissionId: string;
        }) => rpc("llm_grading_context", {
            account_id: input.accountId,
            submission_id: input.submissionId
        })
    };
}
