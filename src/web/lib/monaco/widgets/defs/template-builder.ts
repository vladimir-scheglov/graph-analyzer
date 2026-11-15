import { useGraphStore } from "../../../../state/useGraphStore";
import type { WidgetContext, WidgetDef } from "../types";

const PLACEHOLDERS = [
  { id: "prefix", label: "@prefix", hint: "Настраиваемый префикс" },
  { id: "YYYY", label: "@YYYY", hint: "Текущий год, 4 цифры" },
  { id: "YY", label: "@YY", hint: "Текущий год, 2 цифры" },
  { id: "MM", label: "@MM", hint: "Месяц, 01–12" },
  { id: "DD", label: "@DD", hint: "День, 01–31" },
  { id: "inc", label: "@inc", hint: "Инкрементальный счётчик" },
];

interface ValueRange {
  start: number; // 0-based, позиция первого символа значения (без кавычки)
  end: number; // 0-based, позиция закрывающей кавычки (или длина строки)
  quote: string | null;
}

function getTemplateValueRange(lineText: string): ValueRange | null {
  const m = lineText.match(/^\s*(?:-\s+)?template\s*:\s*/);
  if (!m) return null;
  const valueStart = m[0].length;
  const firstChar = lineText.charAt(valueStart);

  // Незакрытая кавычка — особый случай, отдаём весь остаток строки
  if (firstChar === '"' || firstChar === "'") {
    let end = -1;
    for (let i = valueStart + 1; i < lineText.length; i++) {
      if (lineText.charAt(i) === firstChar) {
        end = i;
        break;
      }
    }
    if (end < 0) {
      // Кавычка есть, но не закрыта
      return { start: valueStart + 1, end: lineText.length, quote: firstChar };
    }
    return { start: valueStart + 1, end, quote: firstChar };
  }

  let end = lineText.length;
  const hashIdx = lineText.indexOf(" #", valueStart);
  if (hashIdx > 0) end = hashIdx;
  while (end > valueStart && lineText.charAt(end - 1) === " ") end--;
  return { start: valueStart, end, quote: null };
}

function insertPlaceholder(
  editor: any,
  monaco: any,
  placeholder: string,
): void {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return;

  const lineText = model.getLineContent(pos.lineNumber);
  const range = getTemplateValueRange(lineText);

  // Не распознали template: — вставляем как есть в позицию курсора
  if (!range) {
    editor.executeEdits("template-widget", [
      {
        range: new monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column,
        ),
        text: placeholder,
      },
    ]);
    editor.setPosition({
      lineNumber: pos.lineNumber,
      column: pos.column + placeholder.length,
    });
    editor.focus();
    return;
  }

  const cursor0 = pos.column - 1;

  // ── Нет кавычек ── оборачиваем всё в двойные и вставляем в позицию курсора
  if (!range.quote) {
    const currentValue = lineText.slice(range.start, range.end);
    const cursorInValue = cursor0 >= range.start && cursor0 <= range.end;
    const offset = cursorInValue ? cursor0 - range.start : currentValue.length;
    const newValue =
      currentValue.slice(0, offset) + placeholder + currentValue.slice(offset);

    editor.executeEdits("template-widget", [
      {
        range: new monaco.Range(
          pos.lineNumber,
          range.start + 1,
          pos.lineNumber,
          range.end + 1,
        ),
        text: `"${newValue}"`,
      },
    ]);
    editor.setPosition({
      lineNumber: pos.lineNumber,
      column: range.start + 1 + offset + placeholder.length,
    });
    editor.focus();
    return;
  }

  // ── Кавычки есть ── вставляем в позицию курсора; если курсор вне
  // значения — в конец (перед закрывающей кавычкой).
  const isClosed =
    range.end < lineText.length && lineText.charAt(range.end) === range.quote;
  let insertCol1Based: number;

  if (cursor0 < range.start || cursor0 > range.end) {
    // Курсор вне значения — вставляем в конец
    insertCol1Based = range.end + 1;
  } else {
    // Курсор внутри значения — вставляем туда
    insertCol1Based = pos.column;
  }

  editor.executeEdits("template-widget", [
    {
      range: new monaco.Range(
        pos.lineNumber,
        insertCol1Based,
        pos.lineNumber,
        insertCol1Based,
      ),
      text: placeholder,
    },
  ]);

  // Если кавычка не была закрыта — допишем её и поставим курсор перед ней
  if (!isClosed) {
    // Ничего не делаем — пользователь сам добавит кавычку.
    // (Авто-закрытие кавычки удивит больше, чем поможет.)
  }

  editor.setPosition({
    lineNumber: pos.lineNumber,
    column: insertCol1Based + placeholder.length,
  });
  editor.focus();
}

function generateSample(attr: any): string {
  const now = new Date();
  const prefix = attr.defaultPrefix || "ID";
  const inc = attr.incrementTemplate || "0000";
  let s = attr.template || "{@prefix}-{@inc}";
  s = s
    .replace(/\{@prefix\}/g, prefix)
    .replace(/\{@YYYY\}/g, String(now.getFullYear()))
    .replace(/\{@YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{@MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/\{@DD\}/g, String(now.getDate()).padStart(2, "0"))
    .replace(/\{@inc\}/g, "1".padStart(inc.length || 1, "0"));
  return s;
}

export const templateBuilderWidget: WidgetDef = {
  id: "template-builder",
  title: "Шаблон Identifier",
  priority: 87,
  getActions(ctx) {
    if (!ctx.attribute) return [];
    if (ctx.attribute.dataType !== "Identifier") return [];

    // Показываем на строке template: в любом месте — включая случай
    // незакрытой кавычки, когда fieldName не распознаётся.
    const currentLineText = ctx.model.getLineContent(ctx.currentLine);
    const isTemplateLine = /^\s*(?:-\s+)?template\s*:/.test(currentLineText);
    if (ctx.fieldName !== "template" && !isTemplateLine) return [];

    const actions: any[] = [];

    for (const ph of PLACEHOLDERS) {
      actions.push({
        id: "ph-" + ph.id,
        label: "{" + ph.label + "}",
        icon: "data_object",
        hint: ph.hint + " · вставка в позицию курсора",
        run: (_c: WidgetContext, ed: any, m: any) => {
          insertPlaceholder(ed, m, `{@${ph.id}}`);
        },
      });
    }

    const sample = generateSample(ctx.attribute);
    actions.push({
      id: "preview",
      label: sample,
      icon: "content_copy",
      hint: `Пример: ${sample}. Клик — копировать`,
      run: () => {
        navigator.clipboard
          .writeText(sample)
          .then(() => {
            useGraphStore.getState().showSnackbar(`Скопировано: ${sample}`);
          })
          .catch(() => {
            /* ignore */
          });
      },
    });

    return actions;
  },
};
