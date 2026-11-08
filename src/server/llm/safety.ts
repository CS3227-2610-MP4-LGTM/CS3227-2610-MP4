import "server-only";
import { fail } from "./errors";
export type RetainedFlaw = {
    key?: string;
    originalSnippet?: string;
    replacementSnippet?: string;
    explanation: string;
    fix: string;
};
import { fullCaseFold } from "./unicode-case-fold";
function tokens(value: string) {
    return fullCaseFold(value.normalize("NFKC")).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}
export function validateLearnerText(value: string, options: {
    maxCodePoints: number;
    retainedFlaws: RetainedFlaw[];
}) {
    const text = value.trim();
    if (!text || !text.isWellFormed() || [...text].length > options.maxCodePoints || /<[^>]*>|`|!?\[[^\]]*\]\([^)]*\)|(?:[a-z][a-z\d+.-]*:[^\s]|www\.)|\blines?\s*\d|\bL\d/iu.test(text))
        fail("INVALID_AI_OUTPUT");
    // Reference links (including collapsed/image forms) and definitions are
    // links even when their destination is a relative path or non-HTTP scheme.
    if (/!?\[[^\]\n]+\]\s*\[[^\]\n]*\]|^\s{0,3}\[[^\]\n]+\]:\s*\S/imu.test(text))
        fail("INVALID_AI_OUTPUT");
    const candidate = tokens(text);
    const candidateWindows = new Map<number, Set<string>>();
    for (const flaw of options.retainedFlaws)
        for (const value of [
            flaw.originalSnippet, flaw.replacementSnippet, flaw.explanation, flaw.fix
        ]) {
            const protectedTokens = tokens(value ?? "");
            const width = Math.min(8, protectedTokens.length);
            if (width < 4)
                continue;
            let windows = candidateWindows.get(width);
            if (!windows) {
                windows = new Set<string>();
                for (let index = 0; index <= candidate.length - width; index++)
                    windows.add(candidate.slice(index, index + width).join("\0"));
                candidateWindows.set(width, windows);
            }
            for (let index = 0; index <= protectedTokens.length - width; index++) {
                if (windows.has(protectedTokens.slice(index, index + width).join("\0")))
                    fail("INVALID_AI_OUTPUT");
            }
        }
    return text;
}
