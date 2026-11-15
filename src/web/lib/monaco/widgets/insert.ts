import type { WidgetContext } from "./types";

export function insertAtCursor(editor: any, monaco: any, text: string): void {
  const sc = editor.getContribution?.("snippetController2") as any;
  if (sc && typeof sc.insert === "function") {
    sc.insert(text);
    return;
  }
  const pos = editor.getPosition();
  if (!pos) return;
  const plain = text.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "");
  editor.executeEdits("dg-widget-insert", [
    {
      range: new monaco.Range(
        pos.lineNumber,
        pos.column,
        pos.lineNumber,
        pos.column,
      ),
      text: plain,
    },
  ]);
}

/**
 * Вставляет многострочный блок:
 *  - если строка пустая — заменяет её,
 *  - иначе — добавляет после неё, с переносом,
 *  - применяет текущий отступ к каждой строке.
 */
export function insertBlock(
  editor: any,
  monaco: any,
  ctx: WidgetContext,
  snippet: string,
): void {
  const model = ctx.model;
  const line = ctx.currentLine;
  const lineText = model.getLineContent(line);
  const indented = snippet
    .split("\n")
    .map((l) => ctx.currentIndent + l)
    .join("\n");

  if (lineText.trim() === "") {
    const lineLen = model.getLineMaxColumn(line);
    editor.setSelection(new monaco.Selection(line, 1, line, lineLen));
    insertAtCursor(editor, monaco, indented);
  } else {
    const lineLen = model.getLineMaxColumn(line);
    editor.setSelection(new monaco.Selection(line, lineLen, line, lineLen));
    insertAtCursor(editor, monaco, "\n" + indented);
  }
}

/** Вставка после указанной строки с заданным отступом. */
export function insertRawAt(
  editor: any,
  monaco: any,
  insertLine: number,
  indent: string,
  text: string,
): void {
  const model = editor.getModel();
  if (!model) return;
  const lineLen = model.getLineMaxColumn(insertLine);
  const indented = text
    .split("\n")
    .map((l) => indent + l)
    .join("\n");
  editor.executeEdits("widget-raw-insert", [{
    range: new monaco.Range(insertLine, lineLen, insertLine, lineLen),
    text: "\n" + indented,
  }]);
  try { editor.revealLineInCenter(insertLine + 1); } catch { /* ignore */ }
}

/** Заменить `oldValue` в строке `line` (последнее вхождение). */
export function replaceValueInLine(
  editor: any,
  monaco: any,
  line: number,
  oldValue: string,
  newValue: string,
): void {
  const model = editor.getModel();
  if (!model) return;
  const lineText = model.getLineContent(line);
  const idx = lineText.lastIndexOf(oldValue);
  if (idx < 0) return;
  editor.executeEdits("widget-replace", [{
    range: new monaco.Range(line, idx + 1, line, idx + 1 + oldValue.length),
    text: newValue,
  }]);
}