import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CodeDiffView } from "@/components/code-diff";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("LRN-02.3 SYS-02.2 SYS-04.2 displays executable-looking source as inert text with a path and line numbers", () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Unexpected source request"));
  vi.stubGlobal("fetch", fetch);
  const lines = [
    '<script src="https://example.test/payload.js"></script>',
    '<img src="https://example.test/probe.png" onerror="alert(1)">',
    'import("https://example.test/module.js");',
    "https://example.test/document",
  ];
  render(<CodeDiffView code={{
    path: "challenge.js",
    before: "",
    after: lines.join("\n"),
    hunks: [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: lines.length,
      lines: lines.map((text, index) => ({ kind: "added", text, oldLine: null, newLine: index + 1 })),
    }],
  }} />);

  const region = screen.getByRole("region", { name: "Source" });
  expect(screen.getAllByRole("region", { name: "Source" })).toHaveLength(1);
  expect(within(region).getByText("challenge.js")).toBeTruthy();
  for (const [index, line] of lines.entries()) {
    expect(region.textContent).toContain(line);
    expect(within(region).getByText(String(index + 1), { exact: true })).toBeTruthy();
  }
  expect(region.querySelector("script, [src*='example.test'], [href*='example.test']")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(within(region).queryByRole("button", { name: /run|build|execute/i })).toBeNull();
});
