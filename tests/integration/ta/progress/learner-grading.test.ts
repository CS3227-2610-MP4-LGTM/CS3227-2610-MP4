import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/submissions/[id]/grade/route";
import { GET } from "@/app/api/v1/ta/learners/[id]/progress/route";
import { insert } from "../../domain/fixture";
import { createLearnerBrowseFixture } from "../../domain/learner-browse-fixture";

const clients = vi.hoisted(() => ({
  caller: null as SupabaseClient | null,
  admin: null as SupabaseClient | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/server", () => ({ createClient: async () => clients.caller }));
vi.mock("@/server/supabase/admin", () => ({ createAdminClient: () => clients.admin }));

it("LRN-05.2 TA-05.1 TA-05.2 reads one assessment per pinned revision flaw from learner grading completion", async () => {
  const { h, actors, ids, dispose } = await createLearnerBrowseFixture({ scope: "submission", pageSize: 1 });
  try {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "fake");
    clients.admin = h.admin;
    clients.caller = actors.learnerA.client;
    const learnerId = actors.learnerA.id;
    const submissionId = randomUUID();
    const commentId = randomUUID();
    await insert(h.db, "public.submissions", {
      id: submissionId, learner_id: learnerId, challenge_id: ids.c1, revision_id: ids.revision1, attempt_number: 1,
    });
    await insert(h.db, "public.submission_comments", {
      id: commentId, submission_id: submissionId, ordinal: 0, line: 3,
      body: "This returns the discount rather than the payable amount. Multiply by one minus fraction.",
    });

    const origin = "http://localhost";
    const graded = await POST(new Request(`${origin}/api/v1/submissions/${submissionId}/grade`, {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
        "Origin": origin,
        "X-LGTM-Grading-Intent": "initial",
        "X-LGTM-Workspace-Account-Id": learnerId,
      },
    }), { params: Promise.resolve({ id: submissionId }) });
    expect(graded.status).toBe(200);
    expect(await graded.json()).toMatchObject({ data: { state: "completed" } });

    const { rows: assessments } = await h.db.query(`
      select f.category, a.comment_id
      from public.ai_grades g
      join public.ai_grade_assessments a on a.grade_id = g.id
      join public.revision_flaws f on f.id = a.flaw_id and f.revision_id = $2
      where g.submission_id = $1
      order by f.start_line
    `, [submissionId, ids.revision1]);
    expect(assessments).toEqual([
      { category: "logic_bug", comment_id: commentId },
      { category: "edge_case", comment_id: null },
    ]);

    clients.caller = actors.taA.client;
    clients.admin = null;
    const progress = await GET(new Request(`${origin}/api/v1/ta/learners/${learnerId}/progress`), {
      params: Promise.resolve({ id: learnerId }),
    });
    expect(progress.status).toBe(200);
    expect(await progress.json()).toMatchObject({
      data: {
        learnerId,
        categories: expect.arrayContaining([
          { category: "logic_bug", totalFlaws: 1, identifiedFlaws: 1, identificationRate: 1, completedFirstAttempts: 1 },
          { category: "edge_case", totalFlaws: 1, identifiedFlaws: 0, identificationRate: 0, completedFirstAttempts: 1 },
        ]),
      },
    });
  } finally {
    clients.caller = null;
    clients.admin = null;
    vi.unstubAllEnvs();
    await dispose();
  }
});
