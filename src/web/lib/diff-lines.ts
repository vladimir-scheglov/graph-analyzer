const LCS_LIMIT = 1500;

export function getLineDiff(oldStr: string, newStr: string) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Защита от O(N×M) на больших файлах: при 5000×5000 = 25M ячеек
  // это уже ~200-400 мс и большой мусор в памяти. Ограничиваем
  // точный LCS — выше лимита используем приближение по хешам строк.
  if (oldLines.length > LCS_LIMIT || newLines.length > LCS_LIMIT) {
    return approximateLineDiff(oldLines, newLines);
  }

  const dp = Array(oldLines.length + 1)
    .fill(0)
    .map(() => Array(newLines.length + 1).fill(0));
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const common = dp[oldLines.length][newLines.length];
  return {
    added: newLines.length - common,
    removed: oldLines.length - common,
  };
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
