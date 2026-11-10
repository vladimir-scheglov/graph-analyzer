import { diffLines } from "diff";

const LCS_LIMIT = 1500;

export function getLineDiff(oldStr: string, newStr: string) {
  let added = 0;
  let removed = 0;
  const chunks = diffLines(oldStr, newStr, { newlineIsToken: false });
  for (const c of chunks) {
    if (c.added) {
      const lines = c.value.split("\n");
      added += lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    } else if (c.removed) {
      const lines = c.value.split("\n");
      removed +=
        lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    }
  }
  return { added, removed };
}

/**
 * Приближённый diff для больших файлов: O(N + M) через Map<line, count>.
 * Не даёт точных +N/-M, но сохраняет порядок величины и не вводит
 * пользователя в заблуждение на огромных схемах.
 */
function approximateLineDiff(oldLines: string[], newLines: string[]) {
  const countOld = new Map<string, number>();
  for (const l of oldLines) countOld.set(l, (countOld.get(l) || 0) + 1);

  let common = 0;
  for (const l of newLines) {
    const c = countOld.get(l) || 0;
    if (c > 0) {
      common++;
      countOld.set(l, c - 1);
    }
  }
  return {
    added: newLines.length - common,
    removed: oldLines.length - common,
  };
}
