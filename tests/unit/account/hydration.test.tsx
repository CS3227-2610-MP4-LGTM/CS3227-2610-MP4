// @vitest-environment node
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AccountForm } from "@/components/account/account-form";

it("keeps controls out of the streamed form until client event handlers are ready", () => {
  const html = renderToString(<AccountForm mode="sign-in" action={vi.fn()} />);
  expect(html).toContain("Preparing account form…");
  expect(html).toContain('role="status"');
  expect(html).not.toContain("<input");
  expect(html).not.toContain("<button");
});
