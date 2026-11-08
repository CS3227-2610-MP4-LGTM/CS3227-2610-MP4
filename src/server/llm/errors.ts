import "server-only";
export function fail(code: string): never {
    throw Object.assign(new Error(code), {
        code
    });
}
const codes = new Set([
    "VALIDATION_ERROR", "PAYLOAD_TOO_LARGE", "INVALID_AI_OUTPUT", "AI_UNAVAILABLE", "AI_TIMEOUT", "SERVICE_UNAVAILABLE", "RATE_LIMITED", "INVALID_STATE", "IDEMPOTENCY_CONFLICT", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "VERSION_CONFLICT"
]);
export function errorCode(error: unknown, fallback = "SERVICE_UNAVAILABLE") {
    const code = (error as {
        code?: unknown;
    })?.code;
    return typeof code === "string" && codes.has(code) ? code : fallback;
}
