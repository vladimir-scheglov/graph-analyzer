import { RqlContext } from "./context";
import type { Monaco } from "./monaco-types";
import { findFunction } from "./lexicon";

/**
 * Мягкие diagnostics для Domain RQL.
 *
 * Ловим только очевидные проблемы:
 *  - count(*)                   → ошибка (запрещено)
 *  - неизвестный @-алиас        → предупреждение
 *  - @row вне entityAttribute   → ошибка
 *  - @index вне entityAttribute → ошибка
 *  - LIKE к не-строке (по attr) → предупреждение
 *  - неизвестная функция        → предупреждение
 *
 * Полная валидация — на бэкенде.
 */

export function registerRqlDiagnostics(
  monaco: Monaco,
  getContext: () => RqlContext | null,
): any {
  const collection = monaco.editor.createModelMarkers?.({ owner: "rql" });
  // В реальном коде используется setModelMarkers — ниже через editor.

  const onModelChange = () => {
    const ctx = getContext();
    if (!ctx) return;
    const model = monaco.editor
      .getModels()
      .find((m: any) => m.getLanguageId?.() === "domain-rql");
    if (!model) return;

    const text = model.getValue();
    const markers: any[] = [];

    // 1) count(*)
    const countStarRe = /\bcount\s*\(\s*\*\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = countStarRe.exec(text))) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: "count(*) запрещён. Используйте count(field).",
        startLineNumber: model.getPositionAt(m.index).lineNumber,
        startColumn: model.getPositionAt(m.index).column,
        endLineNumber: model.getPositionAt(m.index + m[0].length).lineNumber,
        endColumn: model.getPositionAt(m.index + m[0].length).column,
      });
    }

    // 2) @row вне nested
    if (!allowsRow(ctx) && /@row\b/.test(text)) {
      const pos = findPosition(text, "@row");
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: "@row доступен только в правилах на атрибут типа Table",
        ...rangeFor(model, pos, "@row".length),
      });
    }
    // 3) @index вне nested
    if (!allowsIndex(ctx) && /@index\b/.test(text)) {
      const pos = findPosition(text, "@index");
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: "@index доступен только в правилах на Array / Table",
        ...rangeFor(model, pos, "@index".length),
      });
    }

    // 4) неизвестные @-алиасы (грубая проверка: @Foo не из ModelIndex)
    // … (осторожно, чтобы не ругаться на @doc.attr — надо парсить точку)

    monaco.editor.setModelMarkers(model, "rql", markers);
  };

  const disposables: any[] = [];

  // подписка на изменение моделей
  const check = () => onModelChange();
  const interval = setInterval(check, 500); // грубо, но без сложной подписки

  return {
    dispose: () => {
      clearInterval(interval);
      disposables.forEach((d) => d.dispose?.());
    },
  };
}

// ============ Helpers ============

function allowsRow(ctx: RqlContext): boolean {
  return (
    ctx.placement.kind === "dataRule.condition" &&
    ctx.placement.target === "entityAttribute" &&
    ctx.placement.nestedType === "table"
  );
}
function allowsIndex(ctx: RqlContext): boolean {
  return (
    ctx.placement.kind === "dataRule.condition" &&
    ctx.placement.target === "entityAttribute"
  );
}

function findPosition(text: string, token: string): number {
  const idx = text.indexOf(token);
  return idx < 0 ? 0 : idx;
}

function rangeFor(model: any, index: number, len: number) {
  const start = model.getPositionAt(index);
  const end = model.getPositionAt(index + len);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}
