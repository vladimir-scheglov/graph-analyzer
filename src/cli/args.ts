import type { ParsedArgs, CliFlags } from "../shared/types";

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        (result.flags as any)[key] = next;
        i++;
      } else {
        (result.flags as any)[key] = true;
      }
    } else {
      result.positional.push(a);
    }
  }

  return result;
}
