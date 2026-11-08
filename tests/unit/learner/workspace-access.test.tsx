import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as getChallenge } from "@/app/api/v1/challenges/[id]/route";
import { readFirstAttemptAction } from "@/app/learner/challenges/[id]/actions";
import { WorkspacePage } from "@/components/account/workspace-page";
import { CataloguePage } from "@/components/learner/catalogue-page";
import { WorkspaceRoute } from "@/components/learner/workspace-route";
import { learnerErrorResponse } from "@/server/learner/responses";

const mocks = vi.hoisted(() => ({ getAccount: vi.fn(), rpc: vi.fn(), searchParams: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/server/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/learner/challenges",
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: mocks.searchParams,
}));

const challengeId = "00000000-0000-4000-8000-000000000101";
const learner = { status: "ok", account: { id: challengeId, displayName: "Learner A", role: "learner" } };
const noAttempt = { status: "ok", submissionId: null } as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccount.mockResolvedValueOnce(learner);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function expectAccountRecovery() {
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByRole("region", { name: "Source" })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
}

it.each([
  ["forbidden", "Account unavailable"],
  ["unavailable", "Service unavailable"],
])("uses account recovery when the detail request reports a post-entry %s account", async (status, heading) => {
  mocks.getAccount.mockResolvedValue({ status });
  vi.stubGlobal("fetch", vi.fn((path: string) =>
    getChallenge(new Request(new URL(path, "https://app.example.test")), { params: Promise.resolve({ id: challengeId }) }),
  ));

  render(await WorkspacePage({ role: "learner", children: <WorkspaceRoute challengeId={challengeId}
    readFirstAttemptAction={async () => noAttempt} /> }));
  expect(screen.getByRole("navigation")).toBeTruthy();
  await screen.findByRole("heading", { name: heading });
  expectAccountRecovery();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("prefers an attempt account failure over a material record denial", async () => {
  mocks.getAccount.mockResolvedValue({ status: "unavailable" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(learnerErrorResponse({ status: "forbidden" })));

  render(await WorkspacePage({ role: "learner", children: <WorkspaceRoute challengeId={challengeId}
    readFirstAttemptAction={readFirstAttemptAction} /> }));
  await screen.findByRole("heading", { name: "Service unavailable" });
  expectAccountRecovery();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  ["forbidden", "This item isn't available to your account."],
  ["unavailable", "We couldn't load this challenge. Try again."],
] as const)("retains role navigation for a generic material %s response", async (status, message) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(learnerErrorResponse({ status })));
  render(await WorkspacePage({ role: "learner", children: <WorkspaceRoute challengeId={challengeId}
    readFirstAttemptAction={async () => noAttempt} /> }));

  await screen.findByText(message);
  expect(screen.getByRole("navigation")).toBeTruthy();
});

it("uses the catalogue default page size with a browser limit override", async () => {
  mocks.searchParams.mockReturnValue(new URLSearchParams("limit=1&language=javascript&cursor=anchor"));
  const fetch = vi.fn().mockResolvedValue(Response.json({ data: { items: [], nextCursor: null } }));
  vi.stubGlobal("fetch", fetch);
  render(await WorkspacePage({ role: "learner", children: <CataloguePage /> }));

  await screen.findByText("No challenges match these filters.");
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/v1/challenges?language=javascript&cursor=anchor", { cache: "no-store" },
  );
});
