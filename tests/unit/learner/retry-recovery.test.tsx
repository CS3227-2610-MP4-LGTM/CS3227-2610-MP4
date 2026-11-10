import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GradingResultRoute } from "@/components/learner/grading-result";
import { submissionViewSchema } from "@/lib/learner/submissions";
import { completed, failed, submission, submissionId } from "./grading-fixture";

const refresh = vi.hoisted(() => vi.fn());
const resultPath = `/learner/history/${submissionId}`;
let pathname = resultPath;
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: submissionId }),
  usePathname: () => pathname,
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  pathname = resultPath;
  refresh.mockReset();
  vi.unstubAllGlobals();
});

it("mounts the result only at its own route when navigating between the result and retry", () => {
  const initialSubmission = submissionViewSchema.parse({ ...submission, grading: completed });
  const props = { submissionId, initialSubmission, published: true };
  const result = render(<GradingResultRoute {...props} />);
  expect(screen.getByRole("heading", { name: "Review result" })).toBeDefined();
  expect(screen.getByRole("link", { name: "Retry challenge" }).getAttribute("href")).toBe(`${resultPath}/retry`);

  pathname = `${resultPath}/retry`;
  result.rerender(<GradingResultRoute {...props} />);
  expect(result.container.textContent).toBe("");

  pathname = resultPath;
  result.rerender(<GradingResultRoute {...props} />);
  expect(screen.getByRole("heading", { name: "Review result" })).toBeDefined();
});

it("rechecks page eligibility when the initial result recovers through the strict status response", async () => {
  const initialSubmission = submissionViewSchema.parse({ ...submission, grading: completed });
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: initialSubmission }));
  vi.stubGlobal("fetch", fetch);
  const result = render(<GradingResultRoute submissionId={submissionId} initialReadFailed />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/submissions/${submissionId}`,
    expect.objectContaining({ cache: "no-store" }));
  result.rerender(<GradingResultRoute submissionId={submissionId} initialSubmission={initialSubmission}
    published secondSubmissionId={null} />);
  expect(screen.getByRole("link", { name: "Retry challenge" })).toBeDefined();
});

it("rechecks page eligibility after a grading acknowledgement and uses updated publication status", async () => {
  const initialSubmission = submissionViewSchema.parse({ ...submission, grading: failed("AI_UNAVAILABLE") });
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: completed }));
  vi.stubGlobal("fetch", fetch);
  const result = render(<GradingResultRoute submissionId={submissionId} initialSubmission={initialSubmission}
    published secondSubmissionId={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry grading" }));

  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/v1/submissions/${submissionId}/grade`,
    expect.objectContaining({ method: "POST" }));
  result.rerender(<GradingResultRoute submissionId={submissionId} initialSubmission={initialSubmission}
    published={false} secondSubmissionId={null} />);
  expect(screen.getByText("Retry is unavailable while this challenge is not published.")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Retry challenge" })).toBeNull();
});
