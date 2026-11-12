import { Fragment, type ReactNode } from "react";
import type { CodeDiff, CodeDiffLine } from "@/lib/code-diff";

const markers = { context: " ", added: "+", removed: "−" };

/**
 * Shared read-only diff view (SYS-04.2). `label` names the focusable scroll
 * region; `showPath` hides the file heading where the caller already titles it.
 * `gutterControl` optionally adds a control column before the line numbers.
 */
export function CodeDiffView({ code, afterLine, gutterControl, label = "Source", showPath = true }: {
  code: CodeDiff;
  afterLine?: (line: CodeDiffLine) => ReactNode;
  gutterControl?: (line: CodeDiffLine) => ReactNode;
  label?: string;
  showPath?: boolean;
}) {
  return <section className="code-source" aria-label={label} tabIndex={0}>
    {showPath && <h2>{code.path}</h2>}
    {code.hunks.map((hunk) => (
      <div className="source-hunk" data-line-details={afterLine ? "" : undefined} key={`${hunk.oldStart}:${hunk.newStart}`}>
        {hunk.lines.map((line) => (
          <Fragment key={`${line.oldLine}:${line.newLine}`}>
            <div className="source-line" data-kind={line.kind} data-gutter-control={gutterControl ? "" : undefined}>
              {gutterControl && <span className="source-gutter-control">{gutterControl(line)}</span>}
              <span className="source-number">{line.oldLine}</span>
              <span className="source-number">{line.newLine}</span>
              <span aria-hidden="true">{markers[line.kind]}</span>
              <code>{line.text}</code>
            </div>
            {afterLine?.(line)}
          </Fragment>
        ))}
      </div>
    ))}
  </section>;
}
