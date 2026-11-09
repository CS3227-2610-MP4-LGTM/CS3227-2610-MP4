import "server-only";
import type { InputEnvelope } from "./contracts";

export const socModel = "qwen3.5:9b";
export const socDestination = "https://soclaas-api.comp.nus.edu.sg/v1/chat/completions";
export const socEfforts = ["none", "low", "medium", "high"] as const;
export type SocEffort = typeof socEfforts[number];
export const socOperationSettings = {
    inject_flaws: { effort: "none", maxOutputTokens: 1280 },
    generate_hints: { effort: "none", maxOutputTokens: 384 },
    assess_review: { effort: "none", maxOutputTokens: 576 },
    summarize_learner: { effort: "none", maxOutputTokens: 1024 },
} as const satisfies Record<InputEnvelope["operation"], { effort: SocEffort; maxOutputTokens: number }>;

// Checked against the model listing and the separate hosted allocations during
// T-05 configuration review. Recheck when credentials, model or ceilings change.
export const reviewedSocDeployment = { contextTokens: 65536, verifiedLimits: true } as const;

export const ceilings = {
    inputTokens: 32768,
    outputTokens: 8192,
    responseBytes: 131072,
    attemptMs: 15000,
    operationMs: 35000,
    attemptsPerOperation: 2,
    account: {
        active: 1,
        minuteAttempts: 4,
        dayAttempts: 20,
        dayTokens: 300000
    },
    environment: {
        active: 4,
        minuteAttempts: 20,
        dayAttempts: 100,
        dayTokens: 1500000
    }
};
export type Limits = typeof ceilings;
export function effectiveLimits(value: Limits): Limits {
    const result = {
        ...ceilings,
        account: {
            ...ceilings.account
        },
        environment: {
            ...ceilings.environment
        }
    };
    for (const key of [
        "inputTokens", "outputTokens", "responseBytes", "attemptMs", "operationMs", "attemptsPerOperation"
    ] as const) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 1)
            throw new Error("AI_PROVIDER limits");
        result[key] = Math.min(value[key], ceilings[key]);
    }
    for (const scope of ["account", "environment"] as const)
        for (const key of [
            "active", "minuteAttempts", "dayAttempts", "dayTokens"
        ] as const) {
            if (!Number.isSafeInteger(value[scope][key]) || value[scope][key] < 1)
                throw new Error("AI_PROVIDER limits");
            result[scope][key] = Math.min(value[scope][key], ceilings[scope][key]);
        }
    return result;
}
export type LlmEnvironment = Record<string, string | undefined>;

export function getSocKey(env: LlmEnvironment) {
    const key = env.SOCLAAS_API_KEY;
    if (!key || !/^[!-~]+$/.test(key)) throw new Error("SOCLAAS_API_KEY missing or invalid");
    return key;
}

export function getLlmConfig(env: LlmEnvironment) {
    if (![
        "local", "test", "ci", "development", "production"
    ].includes(env.APP_ENV ?? ""))
        throw new Error("APP_ENV required");
    const provider = env.AI_PROVIDER ?? (env.APP_ENV === "development" ? "fake" : undefined);
    const limits = effectiveLimits(ceilings);
    if (provider === "fake") return { provider, limits } as const;
    if (provider !== "soclaas" || !["development", "production"].includes(env.APP_ENV!) ||
        env.NODE_ENV === "test" || (env.CI && env.CI !== "false" && env.CI !== "0"))
        throw new Error("AI_PROVIDER missing, invalid or unavailable in APP_ENV");
    return { provider, limits, apiKey: getSocKey(env) } as const;
}
