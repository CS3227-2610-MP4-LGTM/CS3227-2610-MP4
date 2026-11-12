import "server-only";
import { z } from "zod";
import { fail } from "./errors";
import { validateLearnerText, type RetainedFlaw } from "./safety";
import { fullCaseFold } from "./unicode-case-fold";
export const categories = [
    "logic_bug", "edge_case", "error_handling", "security", "performance"
] as const;
const category = z.enum(categories), language = z.enum([
    "python", "java", "javascript", "typescript"
]), difficulty = z.enum([
    "easy", "medium", "hard"
]);
const id = z.uuid(), positive = z.number().int().min(1), count = z.number().int().nonnegative();
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const text = (max: number) => z.string().transform(s => s.trim()).refine(s => s.isWellFormed() && s.length > 0 && [...s].length <= max);
const code = z.string().transform(s => s.replace(/\r\n?/g, "\n")).refine(s => s.isWellFormed() && !!s.trim() && new TextEncoder().encode(s).length <= 20000);
const flaw = z.strictObject({
    key: id,
    category,
    startLine: positive,
    endLine: positive,
    explanation: text(2000),
    fix: text(2000)
}).refine(f => f.endLine >= f.startLine);
const categoryCount = z.strictObject({
    category,
    totalFlaws: count,
    identifiedFlaws: count
}).refine(c => c.identifiedFlaws <= c.totalFlaws);
const progress = z.strictObject({
    learnerId: id,
    categories: z.array(z.strictObject({
        category,
        totalFlaws: count,
        identifiedFlaws: count,
        identificationRate: z.number().min(0).max(1).nullable(),
        completedFirstAttempts: count
    })).length(5).refine(a => a.every((c, i) => c.category === categories[i] && c.identifiedFlaws <= c.totalFlaws))
});
const envelope = <O extends string, P extends z.ZodType>(operation: O, payload: P) => z.strictObject({
    schemaVersion: z.literal(1),
    operation: z.literal(operation),
    payload
});
const injection = z.strictObject({
    language,
    difficulty,
    workingCode: code,
    flawCount: positive.max(5),
    categories: z.array(category).min(1).max(5).refine(unique)
});
const hintInput = z.strictObject({
    language,
    difficulty,
    flawedCode: code,
    flaws: z.array(flaw).min(1).max(5).refine(a => unique(a.map(f => f.key)))
});
const assessmentInput = z.strictObject({
    language,
    flawedCode: code,
    matches: z.array(z.strictObject({
        ...flaw.shape,
        comment: z.strictObject({
            id,
            line: positive,
            body: text(2000)
        })
    })).max(5).refine(a => unique(a.map(f => f.key)) && unique(a.map(f => f.comment.id)))
});
const summaryInput = z.strictObject({
    submissions: z.array(z.strictObject({
        submissionId: id,
        revisionId: id,
        attemptNumber: z.union([z.literal(1), z.literal(2)]),
        submittedAt: z.iso.datetime({
            offset: true
        }),
        originalScore: count.max(100),
        effectiveScore: count.max(100),
        categories: z.array(categoryCount).max(5).refine(a => unique(a.map(c => c.category))),
        comments: z.array(z.strictObject({
            commentId: id,
            body: text(2000),
            feedback: text(2000).nullable()
        })).max(50)
    })).max(20).refine(a => unique(a.map(s => s.submissionId))),
    progress
});
const input = z.discriminatedUnion("operation", [
    envelope("inject_flaws", injection), envelope("generate_hints", hintInput), envelope("assess_review", assessmentInput), envelope("summarize_learner", summaryInput)
]);
type ParsedInput = z.infer<typeof input>;
export type InputEnvelope = ParsedInput extends infer E ? E extends {
    payload: infer P;
    operation: infer O;
} ? E & {
    payload: P & (O extends "inject_flaws" ? object : {
        workingCode?: never;
    });
} : never : never;
const proposal = z.strictObject({
    key: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    category,
    sourceStartLine: positive,
    sourceEndLine: positive,
    originalSnippet: code,
    replacementSnippet: code.refine(s => !s.endsWith("\n")),
    explanation: text(2000),
    fix: text(2000)
});
export type Proposal = z.infer<typeof proposal>;
const credit = z.union([
    z.literal(0), z.literal(0.5), z.literal(1)
]);
const summaryItem = z.strictObject({
    category,
    text: text(2000),
    submissionIds: z.array(id).min(1).max(20).refine(unique)
});
const output = z.discriminatedUnion("operation", [
    envelope("inject_flaws", z.strictObject({
        proposals: z.array(proposal).min(1).max(5)
    })), envelope("generate_hints", z.strictObject({
        hints: z.array(z.strictObject({
            key: id,
            text: text(500)
        })).min(1).max(5)
    })), envelope("assess_review", z.strictObject({
        assessments: z.array(z.strictObject({
            key: id,
            commentId: id,
            explanationCredit: credit,
            fixCredit: credit,
            feedback: text(2000)
        })).max(5)
    })), envelope("summarize_learner", z.strictObject({
        strengths: z.array(summaryItem).max(5),
        blindSpots: z.array(summaryItem).max(5),
        nextSteps: z.array(summaryItem).max(5)
    }))
]);
export type OutputEnvelope = z.infer<typeof output>;
type WireSchema = z.core.JSONSchema.BaseSchema;
interface WireObject extends WireSchema {
    properties: Record<string, WireSchema>;
    required: string[];
}
interface WireList extends WireSchema {
    items: WireObject;
}

export function socOutputSchema(snapshot: InputEnvelope) {
    const contract = output.options.find(option => option.shape.operation.value === snapshot.operation)!;
    const schema = z.toJSONSchema(contract, {
        io: "input",
        unrepresentable: "any",
        override: ({ jsonSchema }) => {
            // SoC's grammar omits these keywords. The app enforces string bounds.
            delete jsonSchema.minLength;
            delete jsonSchema.maxLength;
        },
    });
    delete schema.$schema;
    const payload = schema.properties!.payload as WireObject;
    const lists = payload.properties as Record<string, WireList>;
    switch (snapshot.operation) {
    case "inject_flaws": {
        const { categories, flawCount, workingCode } = snapshot.payload;
        const { proposals } = lists;
        proposals.minItems = proposals.maxItems = flawCount;
        const fields = proposals.items.properties;
        fields.category = { type: "string", enum: categories };
        const lineCount = workingCode.replace(/\n$/, "").split("\n").length;
        fields.sourceStartLine.maximum = fields.sourceEndLine.maximum = lineCount;
        break;
    }
    case "generate_hints": {
        const { flaws } = snapshot.payload;
        const { hints } = lists;
        hints.minItems = hints.maxItems = flaws.length;
        hints.items.properties.key = { type: "string", enum: flaws.map(flaw => flaw.key) };
        break;
    }
    case "assess_review": {
        const { assessments } = lists;
        const { matches } = snapshot.payload;
        assessments.minItems = assessments.maxItems = matches.length;
        if (!matches.length) break;

        const item = assessments.items;
        const wireCredit = { type: "number", enum: credit.options.map(level => level.value) } as const;
        const fields = { ...item.properties };
        delete fields.explanationCredit;
        delete fields.fixCredit;
        const pairs = matches.map(({ key, comment }) => {
            const properties: WireObject["properties"] = {
                ...fields,
                key: { type: "string", enum: [key] },
                commentId: { type: "string", enum: [comment.id] },
                explanationCredit: wireCredit,
                fixCredit: wireCredit,
            };
            return { ...item, properties, required: Object.keys(properties) };
        });
        payload.properties.assessments = { ...assessments, items: pairs.length === 1 ? pairs[0] : { anyOf: pairs } };
        break;
    }
    case "summarize_learner": {
        const evidence = categories.flatMap(category => {
            const ids = snapshot.payload.submissions
                .filter(submission => submission.categories.some(entry => entry.category === category))
                .map(submission => submission.submissionId);
            return ids.length ? [{ category, ids }] : [];
        });
        for (const [name, list] of Object.entries(lists)) {
            if (!evidence.length) {
                list.maxItems = 0;
                continue;
            }
            const item = list.items;
            const items = evidence.map(({ category, ids }): WireObject => ({
                ...item,
                properties: {
                    ...item.properties,
                    category: { type: "string", enum: [category] },
                    submissionIds: {
                        ...item.properties.submissionIds,
                        maxItems: ids.length,
                        items: { type: "string", enum: ids },
                    },
                },
            }));
            payload.properties[name] = { ...list, items: items.length === 1 ? items[0] : { anyOf: items } };
        }
        break;
    }
    }
    return schema;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
    const p = schema.safeParse(value);
    if (!p.success)
        fail("VALIDATION_ERROR");
    return p.data;
}
export function validateInputData(value: unknown): InputEnvelope {
    return parse(input, value);
}
export function validateInput(value: unknown): InputEnvelope {
    const parsed = parse(input, value);
    if (parsed.operation === "generate_hints" || parsed.operation === "assess_review") {
        const fs = parsed.operation === "generate_hints" ? parsed.payload.flaws : parsed.payload.matches;
        const n = parsed.payload.flawedCode.replace(/\n$/, "").split("\n").length;
        if (fs.some(f => f.endLine < f.startLine || f.endLine > n || ("comment" in f && z.object({
            line: positive.max(n)
        }).safeParse(f.comment).success === false)))
            fail("VALIDATION_ERROR");
    }
    return parsed;
}
export function assembleCandidate(source: string, values: unknown[]) {
    const codeValue = parse(code, source), parsedProposals = values.map(p => parse(proposal, p));
    if (!unique(parsedProposals.map(p => p.key)))
        fail("INVALID_AI_OUTPUT");
    const trailing = codeValue.endsWith("\n"), lines = codeValue.replace(/\n$/, "").split("\n"), result: string[] = [], flaws: (Proposal & {
        startLine: number;
        endLine: number;
    })[] = [];
    const proposals = parsedProposals.map(p => {
        const snippetLines = p.originalSnippet.split("\n");
        let sourceStartLine: number | undefined;
        for (let start = 0; start + snippetLines.length <= lines.length; start++) {
            if (!snippetLines.every((line, offset) => lines[start + offset] === line))
                continue;
            if (sourceStartLine !== undefined)
                fail("INVALID_AI_OUTPUT");
            sourceStartLine = start + 1;
        }
        if (sourceStartLine === undefined)
            fail("INVALID_AI_OUTPUT");
        return { ...p, sourceStartLine, sourceEndLine: sourceStartLine + snippetLines.length - 1 };
    });
    let consumed = 0;
    for (const p of [...proposals].sort((a, b) => a.sourceStartLine - b.sourceStartLine)) {
        if (p.sourceStartLine <= consumed)
            fail("INVALID_AI_OUTPUT");
        result.push(...lines.slice(consumed, p.sourceStartLine - 1));
        const startLine = result.length + 1;
        result.push(...p.replacementSnippet.split("\n"));
        flaws.push({
            ...p,
            startLine,
            endLine: result.length
        });
        consumed = p.sourceEndLine;
    }
    result.push(...lines.slice(consumed));
    const candidate = result.join("\n") + (trailing ? "\n" : "");
    parse(code, candidate);
    return {
        code: candidate,
        proposals,
        flaws
    };
}
const protectedFlaw = z.object({
    key: id,
    originalSnippet: code,
    replacementSnippet: code,
    explanation: text(2000),
    fix: text(2000)
});
const uuidInFeedback = /[0-9a-f](?:[\s\p{P}\p{S}\p{Cf}]*[0-9a-f]){31}/u;
const uuidIgnoredMarks = /[\p{Default_Ignorable_Code_Point}\p{M}]/gu;
export const retainedContextSchema = z.array(protectedFlaw).min(1).max(5).refine(a => unique(a.map(f => f.key)));
/** Caller captures every retained flaw from the authorized revision, including
 * unmatched flaws excluded from provider projections. Missing context fails closed. */
export function validateRetainedContext(snapshot: InputEnvelope, retainedFlaws?: RetainedFlaw[]) {
    const expected = snapshot.operation === "generate_hints" ? snapshot.payload.flaws : snapshot.operation === "assess_review" ? snapshot.payload.matches : [];
    if (!expected.length)
        return;
    const context = retainedContextSchema.safeParse(retainedFlaws);
    if (!context.success)
        fail("INVALID_AI_OUTPUT");
    if (snapshot.operation === "generate_hints" && context.data.length !== expected.length)
        fail("INVALID_AI_OUTPUT");
    for (const flaw of expected) {
        const retained = context.data.find(f => f.key === flaw.key);
        if (!retained || retained.explanation !== flaw.explanation || retained.fix !== flaw.fix)
            fail("INVALID_AI_OUTPUT");
    }
}
export function validateOutput(snapshot: unknown, value: unknown, options?: {
    retainedFlaws: RetainedFlaw[];
}): OutputEnvelope {
    const captured = validateInput(snapshot), result = parse(output, value);
    if (captured.operation !== result.operation)
        fail("INVALID_AI_OUTPUT");
    validateRetainedContext(captured, options?.retainedFlaws);
    const retained = options?.retainedFlaws ?? [];
    if (captured.operation === "inject_flaws" && result.operation === "inject_flaws") {
        if (result.payload.proposals.length !== captured.payload.flawCount || result.payload.proposals.some(p => !captured.payload.categories.includes(p.category)))
            fail("INVALID_AI_OUTPUT");
        result.payload.proposals = assembleCandidate(captured.payload.workingCode, result.payload.proposals).proposals;
    }
    else if (captured.operation === "generate_hints" && result.operation === "generate_hints") {
        const keys = captured.payload.flaws.map(f => f.key);
        if (result.payload.hints.length !== keys.length || !unique(result.payload.hints.map(h => h.key)) || result.payload.hints.some(h => !keys.includes(h.key)))
            fail("INVALID_AI_OUTPUT");
        result.payload.hints.forEach(h => {
            h.text = validateLearnerText(h.text, {
                maxCodePoints: 500,
                retainedFlaws: retained
            });
        });
    }
    else if (captured.operation === "assess_review" && result.operation === "assess_review") {
        const pairs = captured.payload.matches.map(m => m.key + ":" + m.comment.id), actual = result.payload.assessments.map(a => a.key + ":" + a.commentId);
        if (actual.length !== pairs.length || !unique(actual) || actual.some(p => !pairs.includes(p)))
            fail("INVALID_AI_OUTPUT");
        result.payload.assessments.forEach(a => {
            a.feedback = validateLearnerText(a.feedback, {
                maxCodePoints: 2000,
                retainedFlaws: retained
            });
            // Decompose accented hex letters and remove marks that would fold to letters.
            const unmarkedFeedback = a.feedback.normalize("NFKC").normalize("NFD").replace(uuidIgnoredMarks, "");
            const feedbackForIdCheck = fullCaseFold(unmarkedFeedback).replace(uuidIgnoredMarks, "");
            if (uuidInFeedback.test(feedbackForIdCheck))
                fail("INVALID_AI_OUTPUT");
        });
    }
    else if (captured.operation === "summarize_learner" && result.operation === "summarize_learner") {
        const items = [
            ...result.payload.strengths, ...result.payload.blindSpots, ...result.payload.nextSteps
        ];
        if (!items.length)
            fail("INVALID_AI_OUTPUT");
        for (const item of items)
            for (const id of item.submissionIds) {
                const s = captured.payload.submissions.find(s => s.submissionId === id);
                if (!s || !s.categories.some(c => c.category === item.category))
                    fail("INVALID_AI_OUTPUT");
            }
    }
    return result;
}
export function parseBoundedJson(raw: string): unknown {
    if (new TextEncoder().encode(raw).length > 131072)
        fail("PAYLOAD_TOO_LARGE");
    try {
        return JSON.parse(raw);
    }
    catch {
        fail("VALIDATION_ERROR");
    }
}
