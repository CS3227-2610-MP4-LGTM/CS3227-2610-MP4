export type CodeDiffLine = { text: string } & (
  | { kind: "context"; oldLine: number; newLine: number }
  | { kind: "added"; oldLine: null; newLine: number }
  | { kind: "removed"; oldLine: number; newLine: null }
);

export type CodeDiff = {
  path: string;
  before: string;
  after: string;
  hunks: {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: CodeDiffLine[];
  }[];
};
