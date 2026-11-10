import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GradingResult } from "@/components/learner/grading-result";
import { submissionViewSchema } from "@/lib/learner/submissions";
import { completed, failed, pending, submission, submissionId } from "./grading-fixture";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("LRN-05.2 LRN-05.3 sends initial intent once, observes a competing failure and sends retry intent only on click", async () => {
  const view = { ...submission, grading: failed("AI_UNAVAILABLE") };
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({
      error: { code: "AI_UNAVAILABLE", message: "AI grading is unavailable. Try grading again." },
    }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ data: view }))
    .mockResolvedValueOnce(Response.json({ data: completed }));
  vi.stubGlobal("fetch", fetch);

  render(<GradingResult submissionId={submissionId} initialSubmission={submissionViewSchema.parse({ ...submission, grading: pending })} />);
  const retry = await screen.findByRole("button", { name: "Retry grading" });
  const posts = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts()).toHaveLength(1);
  fireEvent.click(retry);
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(await screen.findByText("Original assessment", { exact: true })).toBeDefined();
  const requests = posts().map(([, init]) => ({ body: init?.body, headers: new Headers(init?.headers) }));
  expect(requests.map(({ headers }) => headers.get("X-LGTM-Grading-Intent"))).toEqual(["initial", "retry"]);
  expect(requests.map(({ body }) => JSON.parse(String(body)))).toEqual([{}, {}]);
  expect(requests[0].headers.get("Idempotency-Key")).toEqual(expect.any(String));
  expect(requests[1].headers.get("Idempotency-Key")).toEqual(expect.any(String));
  expect(requests[0].headers.get("Idempotency-Key")).not.toBe(requests[1].headers.get("Idempotency-Key"));
});
