import { Fragment, type ReactNode } from "react";
import type { CodeDiff, CodeDiffLine } from "@/lib/code-diff";

const markers = { context: " ", added: "+", removed: "−" };

export function CodeDiffView({ code, afterLine }: { code: CodeDiff; afterLine?: (line: CodeDiffLine) => ReactNode }) {
  return <section className="code-source" aria-label="Source" tabIndex={0}>
    <h2>{code.path}</h2>
    {code.hunks.map((hunk) => (
      <div className="source-hunk" data-line-details={afterLine ? "" : undefined} key={`${hunk.oldStart}:${hunk.newStart}`}>
        {hunk.lines.map((line) => (
          <Fragment key={`${line.oldLine}:${line.newLine}`}>
            <div className="source-line" data-kind={line.kind}>
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
