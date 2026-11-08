import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModerationPanel } from "@/components/ta/moderation-panel";
import { submissionSchema, type DetailResult, type TaSubmissionView } from "@/lib/ta/submissions";
import type { OverrideResult, ResolutionResult } from "@/lib/ta/moderation";
import { id, submission } from "./inspection/evidence";

afterEach(cleanup);
type Kind = "override" | "resolution";
const initial = () => submissionSchema.parse(submission());
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
function open(kind: Kind) {
 click(kind === "override" ? "Override grade" : "Add correction");
 if (kind === "override") fireEvent.change(screen.getByLabelText("Replacement score"), {target: {value: "59"}});
 else fireEvent.change(screen.getByLabelText("Disposition"), {target: {value: "upheld"}});
 fireEvent.change(screen.getByLabelText("Reason"), {target: {value: "Original uncertain action"}});
}
function appended(s: TaSubmissionView, kind: Kind, auditOrder: number, reason: string): TaSubmissionView {
 const row = {id: id(950 + auditOrder), actorId: id(21), createdAt: "2026-01-01T00:00:09Z", auditOrder, reason};
 if (kind === "override") return {...s,grading: {...s.grading,effective: {score: auditOrder === 3 ? 59 : 100,passed: auditOrder !== 3,source: "ta"},overrides: [...s.grading.overrides,{...row,score: auditOrder === 3 ? 59 : 100}]}};
 return {...s,flags: s.flags.map((flag,i) => i ? flag : {...flag,status: "resolved",resolutions: [...flag.resolutions,{...row,disposition: auditOrder === 3 ? "upheld" : "dismissed"}]})};
}
function outcome(s: TaSubmissionView, kind: Kind): OverrideResult | ResolutionResult {
 return kind === "override" ? {status: "ok",override: s.grading.overrides.at(-1)!,grading: s.grading} : {status: "ok",flag: s.flags[0]};
}
function props(s: TaSubmissionView, kind: Kind, save: (...args: unknown[]) => unknown, refresh: () => Promise<DetailResult>): ComponentProps<typeof ModerationPanel> {
 return {submission: s,
 saveOverride: (...args) => kind === "override" ? save(...args) as Promise<OverrideResult> : Promise.resolve({status: "unavailable"}),
 saveResolution: (...args) => kind === "resolution" ? save(...args) as Promise<ResolutionResult> : Promise.resolve({status: "unavailable"}),
 refresh};
}
it.each(["override", "resolution"] as const)("preserves an uncertain %s key through refresh and ignores an older replay after newer audit data", async kind => {
 const base=initial(), committed=appended(base,kind,3,"Original uncertain action"), newer=appended(committed,kind,4,"Newer committed decision");
 const save=vi.fn().mockResolvedValueOnce({status: "unavailable"}).mockResolvedValue(outcome(committed,kind));
 const refresh=vi.fn().mockResolvedValue({status: "ok",submission: newer});
 render(<ModerationPanel {...props(base,kind,save,refresh)}/>);
 open(kind); click(`Save ${kind}`);
 await screen.findByText(`We couldn't save this ${kind}. Try again.`);
 const originalKey=save.mock.calls[0][2]; click("Refresh submission");
 await screen.findByText("Newer committed decision");
 expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("Original uncertain action");
 expect(save).toHaveBeenCalledTimes(1); click("Try again");
 await screen.findByText(kind === "override" ? "Grade override saved." : "Resolution saved.");
 expect(save.mock.calls[1]).toEqual(save.mock.calls[0]); expect(save.mock.calls[1][2]).toBe(originalKey);
 expect(screen.getByText("Newer committed decision")).toBeTruthy();
 expect(screen.getAllByText("Original uncertain action",{exact: true})).toHaveLength(1);
 if (kind === "override") { expect(screen.getByText("100 / 100")).toBeTruthy(); expect(screen.queryByText("59 / 100")).toBeNull(); }
});
it.each(["override", "resolution"] as const)("disables refresh during pending %s and preserves the key across incoming newer audit data", async kind => {
 const base=initial(), committed=appended(base,kind,3,"Original uncertain action"), newer=appended(committed,kind,4,"Newer incoming decision");
 let finish!: (value: {status: "unavailable"}) => void;
 const save=vi.fn().mockImplementationOnce(() => new Promise(resolve => {finish=resolve;})).mockResolvedValue(outcome(committed,kind));
 const refresh=vi.fn().mockResolvedValue({status: "ok",submission: newer});
 const {rerender}=render(<ModerationPanel {...props(base,kind,save,refresh)}/>);
 open(kind); click(`Save ${kind}`);
 const refreshButton=screen.getByRole("button",{name: "Refresh submission"});
 expect(refreshButton.matches(":disabled")).toBe(true); fireEvent.click(refreshButton); expect(refresh).not.toHaveBeenCalled();
 rerender(<ModerationPanel {...props(newer,kind,save,refresh)}/>);
 await act(async () => finish({status: "unavailable"}));
 await screen.findByText(`We couldn't save this ${kind}. Try again.`); click("Refresh submission");
 await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1)); click("Try again");
 await screen.findByText(kind === "override" ? "Grade override saved." : "Resolution saved.");
 expect(save.mock.calls[1]).toEqual(save.mock.calls[0]); expect(screen.getByText("Newer incoming decision")).toBeTruthy();
});
it.each(["override", "resolution"] as const)("does not let a previously started read clear an uncertain %s identity", async kind => {
 const base=initial(); let finishRead!: (value: DetailResult) => void;
 const refresh=vi.fn().mockImplementation(() => new Promise(resolve => {finishRead=resolve;}));
 const save=vi.fn().mockResolvedValue({status: "unavailable"});
 render(<ModerationPanel {...props(base,kind,save,refresh)}/>);
 open(kind); click("Refresh submission"); click(`Save ${kind}`);
 await screen.findByText(`We couldn't save this ${kind}. Try again.`);
 await act(async () => finishRead({status: "ok",submission: base}));
 click("Try again"); await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
 expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
});
it.each(["override", "resolution"] as const)("starts a fresh explicit %s after confirmed rejection and refresh, retaining the draft", async kind => {
 const base=initial(), save=vi.fn().mockResolvedValue({status: kind === "override" ? "invalid_state" : "conflict"});
 const refresh=vi.fn().mockResolvedValue({status: "ok",submission: base});
 render(<ModerationPanel {...props(base,kind,save,refresh)}/>);
 open(kind); click(`Save ${kind}`);
 await screen.findByText(kind === "override" ? "A completed assessment is required before overriding a grade." : "This flag changed. Refresh before saving.");
 const firstKey=save.mock.calls[0][2]; click("Refresh submission");
 await waitFor(() => expect((screen.getByRole("button",{name: `Save ${kind}`}) as HTMLButtonElement).disabled).toBe(false));
 expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("Original uncertain action");
 click(`Save ${kind}`); await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
 expect(save.mock.calls[1].slice(0,2)).toEqual(save.mock.calls[0].slice(0,2)); expect(save.mock.calls[1][2]).not.toBe(firstKey);
});
