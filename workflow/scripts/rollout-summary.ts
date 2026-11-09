import { readRolloutResponses, summarizeRollouts, type Selection } from "./rollout-files";
import { parseRollout, responseColumns } from "./rollout-parser";

// Usage: bun workflow/scripts/rollout-summary.ts [--id ID | --path FILE | --list [N]]
// Add --token-source token_count to inspect the fallback's final recorded totals.
// Add --per-turn [--format csv] with --id, --path, or the default latest selection.
async function main() {
  const args = process.argv.slice(2);
  const selection: Selection = {};
  let modes = 0;
  let perTurn = false;
  let csv = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === "--id" || arg === "--path") {
      const value = args.shift();
      if (!value || value.startsWith("--")) throw new Error();
      selection[arg === "--id" ? "id" : "path"] = value;
      modes++;
    } else if (arg === "--list") {
      selection.list = args[0] && !args[0].startsWith("--") ? Number(args.shift()) : 10;
      if (!Number.isSafeInteger(selection.list) || selection.list < 1) throw new Error();
      modes++;
    } else if (arg === "--token-source" && args.shift() === "token_count") {
      selection.tokenSource = "token_count";
    } else if (arg === "--per-turn" && !perTurn) {
      perTurn = true;
    } else if (arg === "--format" && !csv && args.shift() === "csv") {
      csv = true;
    } else throw new Error();
  }
  if (modes > 1 || (csv && !perTurn) || (perTurn && (selection.list !== undefined || selection.tokenSource))) {
    throw new Error();
  }
  if (perTurn) {
    const responses = await readRolloutResponses(selection).catch(() => undefined);
    if (csv) {
      console.log(responseColumns.join(","));
      for (const response of responses ?? []) {
        console.log(responseColumns.map(column => response[column]).join(","));
      }
    } else {
      console.log(JSON.stringify(responses ?? [], null, 2));
    }
    if (responses === undefined) process.exitCode = 1;
    return;
  }
  const summaries = await summarizeRollouts(selection);
  console.log(JSON.stringify(selection.list !== undefined ? summaries : summaries[0] ?? parseRollout([]), null, 2));
  if (selection.list === undefined && !summaries.length) process.exitCode = 1;
}

// Errors intentionally contain only unknown summary fields, never exception text or paths.
main().catch(() => {
  console.log(JSON.stringify(parseRollout([]), null, 2));
  process.exitCode = 1;
});
