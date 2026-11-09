// src/web/lib/monaco/inline-diff.ts

export interface LineDiffMarks {
  added: number[];
  modified: number[];
  unchanged: number[];
}

export function buildLineDiffMarks(
  savedContent: string,
  currentContent: string,
): LineDiffMarks {
  const a = savedContent.split("\n");
  const b = currentContent.split("\n");

  if (a.length > 2000 || b.length > 2000) {
    return approximateDiff(a, b);
  }

  const dp = lcsMatrix(a, b);

  type Step =
    | { kind: "same"; bIdx: number }
    | { kind: "del" }
    | { kind: "ins"; bIdx: number };

  const reversed: Step[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      reversed.push({ kind: "same", bIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      reversed.push({ kind: "del" });
      i--;
    } else {
      reversed.push({ kind: "ins", bIdx: j - 1 });
      j--;
    }
  }
  while (i > 0) {
    reversed.push({ kind: "del" });
    i--;
  }
  while (j > 0) {
    reversed.push({ kind: "ins", bIdx: j - 1 });
    j--;
  }
  const steps = reversed.reverse();

  const added: number[] = [];
  const modified: number[] = [];
  const unchanged: number[] = [];

  let pendingDel = 0;
  const pendingIns: number[] = [];

  const flush = () => {
    const pairs = Math.min(pendingDel, pendingIns.length);
    for (let k = 0; k < pairs; k++) modified.push(pendingIns[k] + 1);
    for (let k = pairs; k < pendingIns.length; k++)
      added.push(pendingIns[k] + 1);
    pendingDel = 0;
    pendingIns.length = 0;
  };

  for (const s of steps) {
    if (s.kind === "same") {
      flush();
      unchanged.push(s.bIdx + 1);
    } else if (s.kind === "del") {
      pendingDel++;
    } else {
      pendingIns.push(s.bIdx);
    }
  }
  flush();

  return { added, modified, unchanged };
}

function approximateDiff(a: string[], b: string[]): LineDiffMarks {
  const aCount = new Map<string, number>();
  for (const s of a) aCount.set(s, (aCount.get(s) || 0) + 1);

  const unchanged: number[] = [];
  const modified: number[] = [];
  for (let i = 0; i < b.length; i++) {
    const c = aCount.get(b[i]) || 0;
    if (c > 0) {
      unchanged.push(i + 1);
      aCount.set(b[i], c - 1);
    } else {
      modified.push(i + 1);
    }
  }
  return { added: [], modified, unchanged };
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

export function applyInlineDiffDecorations(
  editor: any,
  monaco: any,
  marks: LineDiffMarks,
): () => void {
  const decorations: any[] = [];
  const model = editor.getModel();
  if (!model) return () => {};

  for (const line of marks.modified) {
    if (line < 1 || line > model.getLineCount()) continue;
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "dg-inline-diff-modified",
        linesDecorationsClassName: "dg-inline-diff-gutter-modified",
        glyphMarginClassName: "dg-inline-diff-glyph-modified",
        glyphMarginHoverMessage: { value: "Изменено с последнего сохранения" },
        overviewRuler: {
          color: "#f59e0b",
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    });
  }

  for (const line of marks.added) {
    if (line < 1 || line > model.getLineCount()) continue;
    decorations.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: "dg-inline-diff-added",
        linesDecorationsClassName: "dg-inline-diff-gutter-added",
        glyphMarginClassName: "dg-inline-diff-glyph-added",
        glyphMarginHoverMessage: { value: "Добавлено с последнего сохранения" },
        overviewRuler: {
          color: "#10b981",
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    });
  }

  const collection = editor.createDecorationsCollection(decorations);
  return () => collection.clear();
}
