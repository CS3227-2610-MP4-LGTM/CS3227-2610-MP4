// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), read: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: state.getUser, getSession: state.getSession }, from: state.from,
}) }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => { throw new Error("Forbidden admin client"); } }));
const id = "00000000-0000-4000-8000-000000000011";
const profile = { id, display_name: "Learner A", role: "learner" };
const account = () => import("@/server/auth/account");

describe("verified account boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.getUser.mockResolvedValue({ data: { user: { id, user_metadata: { role: "ta" }, app_metadata: { role: "ta" } } }, error: null });
    state.getSession.mockImplementation(() => { throw new Error("getSession does not verify identity"); });
    state.read.mockResolvedValue({ data: profile, error: null });
    state.from.mockImplementation(() => {
      const query = { select: () => query, eq: () => query, single: state.read, maybeSingle: state.read };
      return query;
    });
  });

  it("SYS-08.1 verifies with getUser then loads the profile and ignores editable role claims", async () => {
    const { getAccount } = await account();
    expect(await getAccount()).toEqual({ status: "ok", account: { id, displayName: "Learner A", role: "learner" } });
    expect(state.getUser).toHaveBeenCalledOnce();
    expect(state.getSession).not.toHaveBeenCalled();
    expect(state.from).toHaveBeenCalledWith("profiles");
  });

  it.each([null, { status: 401, code: "bad_jwt" }, { status: 400, code: "refresh_token_not_found" }])("SYS-11.1 missing, forged and unrefreshable sessions fail closed %#", async (error) => {
    state.getUser.mockResolvedValue({ data: { user: null }, error });
    const { getAccount } = await account();
    expect(await getAccount()).toEqual({ status: "unauthenticated" });
    expect(state.from).not.toHaveBeenCalled();
  });

  it.each([null, { ...profile, role: "admin" }])("SYS-11.2 missing or invalid stored profile produces forbidden %#", async (data) => {
    state.read.mockResolvedValue({ data, error: null });
    const { getAccount } = await account();
    expect(await getAccount()).toEqual({ status: "forbidden" });
  });

  it("SYS-11.3 stored role rejects an operation despite forged metadata", async () => {
    const { getAccount } = await account();
    expect(await getAccount("ta")).toEqual({ status: "forbidden" });
  });

  it.each(["auth", "profile"])("SYS-11.4 %s outage preserves service-unavailable category without identity fallback", async (kind) => {
    if (kind === "auth") state.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "private" } });
    else state.read.mockResolvedValue({ data: null, error: { code: "08006", message: "private" } });
    const { getAccount } = await account();
    expect(await getAccount()).toEqual({ status: "unavailable" });
    expect(state.getSession).not.toHaveBeenCalled();
  });

  it("SYS-11.4 thrown auth transport error is unavailable rather than an unhandled error", async () => {
    state.getUser.mockRejectedValue(new Error("private network failure"));
    const { getAccount } = await account();
    expect(await getAccount()).toEqual({ status: "unavailable" });
  });

  it.each([
    ["SYS-11.1", "unauthenticated", 401, "UNAUTHENTICATED"],
    ["SYS-11.2", "forbidden", 403, "FORBIDDEN"],
    ["SYS-11.4", "unavailable", 503, "SERVICE_UNAVAILABLE"],
  ] as const)("%s preserves %s as HTTP %i without protected data", async (_criterion, status, httpStatus, code) => {
    const { authErrorResponse } = await account();
    const response = authErrorResponse({ status });
    expect(response.status).toBe(httpStatus);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code } });
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain(id);
  });
});
