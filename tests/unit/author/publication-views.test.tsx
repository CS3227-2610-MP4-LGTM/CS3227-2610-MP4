/// <reference types="vite/client" />
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ComponentType } from "react";
import { action, challengeId, expectAnnouncement, listHref, revisionId, workingCode } from "./evidence";

/**
 * T-22 interfaces:
 * - `PublicationResult({ publication })` in `src/components/author/publication-result.tsx`, where
 *   `publication` is the INTEGRATION-SPEC `AuthorPublication`. The publication time is a `<time>`
 *   element whose `dateTime` is `publishedAt`.
 * - `PublishedRevision({ revision })` in `src/components/author/published-revision.tsx`, where
 *   `revision` is `{ publication, challenge: ChallengeView, answerKey: RevisionFlaw[], hints }`.
 */
afterEach(cleanup);

type Component = ComponentType<Record<string, unknown>>;
const resultPath = "/src/components/author/publication-result.tsx";
const revisionPath = "/src/components/author/published-revision.tsx";
const results = import.meta.glob<{ PublicationResult: Component }>("/src/components/author/publication-result.tsx");
const revisions = import.meta.glob<{ PublishedRevision: Component }>("/src/components/author/published-revision.tsx");

async function load<T>(modules: Record<string, () => Promise<T>>, path: string) {
  if (!modules[path]) throw new Error(`Missing T-22 component: ${path}`);
  return modules[path]();
}

const publication = {
  id: challengeId, status: "published", rowVersion: 6, revisionId, revisionNumber: 2, publishedAt: "2026-11-11T08:00:00.000Z",
};
const flawId = "00000000-0000-4000-8000-000000000301";
const flawedCode = "function total(items) {\n  return items.length - 1;\n}\n";
const revision = {
  publication,
  challenge: {
    id: challengeId, revisionId, title: "Checkout totals", description: "Review the changes to discounts and basket totals.",
    language: "javascript", difficulty: "easy", categories: ["logic_bug"], publishedAt: publication.publishedAt,
    code: {
      path: "challenge.js", before: workingCode, after: flawedCode,
      hunks: [{ oldStart: 1, oldCount: 3, newStart: 1, newCount: 3, lines: [
        { kind: "context", text: "function total(items) {", oldLine: 1, newLine: 1 },
        { kind: "removed", text: "  return items.length;", oldLine: 2, newLine: null },
        { kind: "added", text: "  return items.length - 1;", oldLine: null, newLine: 2 },
        { kind: "context", text: "}", oldLine: 3, newLine: 3 },
      ] }],
    },
  },
  answerKey: [{
    id: flawId, revisionId, proposalId: "00000000-0000-4000-8000-000000001102", category: "logic_bug",
    originalSnippet: "  return items.length;", replacementSnippet: "  return items.length - 1;",
    sourceStartLine: 2, sourceEndLine: 2, startLine: 2, endLine: 2,
    explanation: "Undercounts every basket by one.", fix: "Return the full length.",
  }],
  hints: [{ id: "00000000-0000-4000-8000-000000000401", flawId, text: "Compare the count with the number of items." }],
};

it("AUT-05.3 SYS-17.1 shows Challenge published. on Publication result with revision, time and both routes onward", async () => {
  const { PublicationResult } = await load(results, resultPath);
  const { container } = render(<PublicationResult publication={publication} />);
  const heading = screen.getByRole("heading", { level: 1, name: "Publication result" });
  expect(document.activeElement).toBe(heading);
  expectAnnouncement("Challenge published.");
  expect(container.textContent).toMatch(/Revision\D{0,12}2\b/);
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(publication.publishedAt);
  expect(action("View published challenge").getAttribute("href")).toBe(`${listHref}/${challengeId}/revisions/${revisionId}`);
  expect(action("Back to challenges").getAttribute("href")).toBe(listHref);
});

it("AUT-05.3 SYS-04.2 shows the owning Author the published real diff, retained answers and hints", async () => {
  const { PublishedRevision } = await load(revisions, revisionPath);
  const { container } = render(<PublishedRevision revision={revision} />);
  const text = container.textContent ?? "";
  expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/\S/);
  expect(text).toContain("Checkout totals");
  expect(text).toMatch(/Revision\D{0,12}2\b/);
  // The real working-to-flawed diff shows both the removed and the added line.
  expect(text).toContain("return items.length;");
  expect(text).toContain("return items.length - 1;");
  expect(text).toContain("Logic bug");
  expect(text).toContain("Undercounts every basket by one.");
  expect(text).toContain("Return the full length.");
  expect(text).toContain("Compare the count with the number of items.");
  expect(action("Back to challenges").getAttribute("href")).toBe(listHref);
});

it("AUT-05.3 SYS-02.2 SEC-02.2 renders hostile hint, answer and code text inert", async () => {
  const hostile = {
    ...revision,
    answerKey: [{ ...revision.answerKey[0],
      explanation: '<img src="https://example.test/x.png" onerror="alert(2)"> [click](https://example.test/run)',
      fix: '<a href="javascript:alert(3)" onclick="alert(4)">fix</a>' }],
    hints: [{ ...revision.hints[0], text: '<script>alert(1)</script> ![x](https://example.test/y.png)' }],
  };
  const { PublishedRevision } = await load(revisions, revisionPath);
  const { container } = render(<PublishedRevision revision={hostile} />);
  const text = container.textContent ?? "";
  expect(text).toContain(hostile.answerKey[0].explanation);
  expect(text).toContain(hostile.answerKey[0].fix);
  expect(text).toContain(hostile.hints[0].text);
  expect(container.querySelector("script, img, iframe")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"], a[href^="https://example.test"], [onerror], [onclick]')).toBeNull();
});
