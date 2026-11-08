import "server-only";
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
export function getLlmConfig(env: Record<string, string | undefined>) {
    if (![
        "local", "test", "ci", "development", "production"
    ].includes(env.APP_ENV ?? ""))
        throw new Error("APP_ENV required");
    const provider = env.AI_PROVIDER ?? (env.APP_ENV === "development" ? "fake" : undefined);
    if (provider !== "fake")
        throw new Error("AI_PROVIDER: live enforcement is unavailable; SOCLAAS_API_KEY cannot enable it");
    return {
        provider: "fake" as const,
        limits: effectiveLimits(ceilings)
    };
}
