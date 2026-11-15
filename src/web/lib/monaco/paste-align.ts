export function alignPastedText(
  editor: any,
  insertedText: string,
  startLine: number,
  startColumn: number,
): string {
  const model = editor.getModel();
  if (!model) return insertedText;

  const lines = insertedText.split("\n");
  if (lines.length < 2) return insertedText;

  const lineText = model.getLineContent(startLine);
  let lineIndentStr = lineText.match(/^(\s*)/)?.[1] || "";
  const beforeCursor = lineText.slice(0, startColumn - 1);
  const isInsertInsideLine = startColumn > 1 && beforeCursor.trim() !== "";

  // Если строка пустая (только пробелы) и auto-indent не сработал —
  // берём отступ по предыдущей непустой.
  if (!isInsertInsideLine && !lineText.trim() && lineIndentStr === "") {
    for (let i = startLine - 1; i >= 1; i--) {
      const pt = model.getLineContent(i);
      if (!pt.trim() || pt.trim().startsWith("#")) continue;
      const pi = pt.match(/^(\s*)/)?.[1] || "";
      if (/^\s*-\s/.test(pt) || /:\s*(?:#.*)?$/.test(pt.trim())) {
        lineIndentStr = pi + "  ";
      } else {
        lineIndentStr = pi;
      }
      break;
    }
  }

  let baseIndent = lineIndentStr;
  if (isInsertInsideLine) {
    baseIndent = lineIndentStr + "  ";
  }

  const stack: Array<{
    rawIndent: number;
    level: number;
    canHaveChildren: boolean;
  }> = [];

  return lines
    .map((line, i) => {
      if (!line.trim()) return line;

      const rawIndentStr = line.match(/^(\s*)/)?.[1] || "";
      const rawIndent = rawIndentStr.length;
      const trimmed = line.trim();

      // YAML-правило: контейнер — `- xxx` (элемент списка) или `key:`
      // (с детьми), либо block scalar `key: |`.
      let canHaveChildren = false;
      if (trimmed.startsWith("-")) canHaveChildren = true;
      else if (trimmed.endsWith(":")) canHaveChildren = true;
      else if (/:\s*[|>][+\-]?\s*$/.test(trimmed)) canHaveChildren = true;

      while (
        stack.length > 0 &&
        (stack[stack.length - 1].rawIndent >= rawIndent ||
          !stack[stack.length - 1].canHaveChildren)
      ) {
        stack.pop();
      }

      const level = stack.length;

      // Для первой строки не добавляем baseIndent, если startColumn > 1:
      // эти пробелы уже есть в модели до курсора.
      let prefix = "";
      if (i > 0 || startColumn === 1) {
        prefix = baseIndent + " ".repeat(level * 2);
      }

      stack.push({ rawIndent, level, canHaveChildren });

      return prefix + line.slice(rawIndentStr.length);
    })
    .join("\n");
}
