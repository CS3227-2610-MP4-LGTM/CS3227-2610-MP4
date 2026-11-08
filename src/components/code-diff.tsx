import type { CodeDiff } from "@/lib/code-diff";

const markers = { context: " ", added: "+", removed: "−" };

export function CodeDiffView({ code }: { code: CodeDiff }) {
  return <section className="code-source" aria-label="Source" tabIndex={0}>
    <h2>{code.path}</h2>
    {code.hunks.map((hunk) => (
      <div className="source-hunk" key={`${hunk.oldStart}:${hunk.newStart}`}>
        {hunk.lines.map((line) => (
          <div className="source-line" data-kind={line.kind} key={`${line.oldLine}:${line.newLine}`}>
            <span className="source-number">{line.oldLine}</span>
            <span className="source-number">{line.newLine}</span>
            <span aria-hidden="true">{markers[line.kind]}</span>
            <code>{line.text}</code>
          </div>
        ))}
      </div>
    ))}
  </section>;
}
