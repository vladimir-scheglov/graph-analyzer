
export interface MarkerWithFix {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  fix?: {
    /** Заголовок фикса — для группировки. */
    kind: string;
    edits: Array<{
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
      text: string;
    }>;
  };
}

/**
 * Собирает все quick-fix'ы из маркеров линтера, применяет их одним
 * `executeEdits`-пакетом (монотонные, без пересечений).
 *
 * Правила:
 *   - два фикса не должны пересекаться по диапазону;
 *   - при пересечении — оставляем более «левый» (позиция в файле);
 *   - порядок применения — сверху вниз.
 *
 * Возвращает { applied, skipped }.
 */
export function applyAllFixes(
  editor: any,
  monaco: any,
  fixes: MarkerWithFix[],
): { applied: number; skipped: number } {
  const valid = fixes.filter((f) => f.fix && f.fix.edits.length > 0);
  if (valid.length === 0) return { applied: 0, skipped: 0 };

  // Сортируем по позиции первого edit'а
  valid.sort((a, b) => {
    const ea = a.fix!.edits[0];
    const eb = b.fix!.edits[0];
    if (ea.startLineNumber !== eb.startLineNumber)
      return ea.startLineNumber - eb.startLineNumber;
    return ea.startColumn - eb.startColumn;
  });

  const edits: any[] = [];
  let lastEndLine = 0;
  let lastEndCol = 0;
  let applied = 0;
  let skipped = 0;

  for (const f of valid) {
    const fix = f.fix!;
    // Проверяем, что все edits из этого фикса не пересекаются с уже добавленными
    const minStart = fix.edits.reduce(
      (min, e) =>
        e.startLineNumber < min.startLineNumber ||
        (e.startLineNumber === min.startLineNumber &&
          e.startColumn < min.startColumn)
          ? e
          : min,
      fix.edits[0],
    );

    const overlaps =
      minStart.startLineNumber < lastEndLine ||
      (minStart.startLineNumber === lastEndLine &&
        minStart.startColumn <= lastEndCol);

    if (overlaps) {
      skipped++;
      continue;
    }

    for (const e of fix.edits) {
      edits.push({
        range: new monaco.Range(
          e.startLineNumber,
          e.startColumn,
          e.endLineNumber,
          e.endColumn,
        ),
        text: e.text,
      });
    }
    const lastEdit = fix.edits[fix.edits.length - 1];
    lastEndLine = lastEdit.endLineNumber;
    lastEndCol = lastEdit.endColumn;
    applied++;
  }

  if (edits.length > 0) {
    editor.pushUndoStop();
    editor.executeEdits("dg-fix-all", edits);
    editor.pushUndoStop();
  }

  return { applied, skipped };
}
