import type { ParsedArgs, CliFlags } from "../shared/types";

/**
 * `1d`, `10h`, `30m`, `5s` — TTL для --refresh.
 * Проверяем только «цифры + буквы», чтобы отличить значение
 * от позиционного аргумента. Валидация формата — в serve-remote.
 */
const DURATION_LIKE = /^\d+[a-zA-Z]+$/;

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [], flags: {} };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      result.positional.push(a);
      continue;
    }

    // --key=value
    const eqIdx = a.indexOf("=");
    if (eqIdx > 2) {
      const key = a.slice(2, eqIdx);
      const value = a.slice(eqIdx + 1);
      (result.flags as any)[key] = value;
      continue;
    }

    const key = a.slice(2);
    const next = argv[i + 1];

    // --refresh принимает и boolean, и TTL-значение:
    //   --refresh           → true
    //   --refresh 1d        → "1d"
    //   --refresh ./domains → true, ./domains остаётся позиционным
    if (key === "refresh" && next !== undefined && DURATION_LIKE.test(next)) {
      (result.flags as any)[key] = next;
      i++;
      continue;
    }

    if (next !== undefined && !next.startsWith("--")) {
      (result.flags as any)[key] = next;
      i++;
    } else {
      (result.flags as any)[key] = true;
    }
  }

  return result;
}
