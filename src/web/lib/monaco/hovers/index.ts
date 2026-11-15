import { SECTION_HINTS } from "./section-hints";
import {
  FIELD_HINTS,
  NESTED_VIEW_TYPE_HINT,
  GROUP_TYPE_HINT,
} from "./field-hints";
import {
  buildMimeHover,
  buildRegexpHover,
  buildTemplatePlaceholderHover,
  buildLabelPlaceholderHover,
  buildColorHover,
  buildConditionTrueHover,
} from "./literal-hints";
import {
  buildDataTypeHover,
  buildIdentifierHover,
  buildSequenceHover,
  buildCounterPatternHover,
  buildIconNameHover,
  buildRouteHover,
  buildActionHover,
  buildWidgetHover,
} from "./value-hints";

interface Ctx {
  lineMap: any;
  modelIndex: any;
  currentDomain: string;
}

function getSectionAt(model: any, line: number): string {
  for (let i = line; i >= 1; i--) {
    const t = model.getLineContent(i);
    if (!t.trim() || t.trim().startsWith("#")) continue;
    const m = t.match(/^([a-zA-Z_][\w]*)\s*:/);
    if (m && !t.startsWith(" ")) return m[1];
  }
  return "";
}

function trySectionHover(
  model: any,
  pos: any,
): { range: any; contents: any[] } | null {
  const line = pos.lineNumber;
  const text = model.getLineContent(line);
  const m = text.match(/^([a-zA-Z_][\w]*)\s*:/);
  if (!m) return null;
  const key = m[1];
  if (pos.column < 1 || pos.column > m[0].length) return null;
  const hint = SECTION_HINTS[key];
  if (!hint) return null;
  return {
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: m[0].length + 1,
    },
    contents: [{ value: hint }],
  };
}

function tryFieldHover(
  model: any,
  pos: any,
  ctx: Ctx,
): { range: any; contents: any[] } | null {
  const line = pos.lineNumber;
  const text = model.getLineContent(line);
  const m = text.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
  if (!m) return null;
  const fieldName = m[2];
  const section = getSectionAt(model, line);
  if (!section) return null;
  if (pos.column < 1 || pos.column > m[0].length) return null;

  // Специальные случаи по контексту
  const lineCtx = ctx.lineMap?.lineContexts?.get(line);
  const inNestedView = lineCtx?.breadcrumbs?.some(
    (b: any) => b.type === "view",
  );
  const inGroup = lineCtx?.breadcrumbs?.some((b: any) => b.type === "group");

  let hint: string | null = null;

  if (fieldName === "type") {
    if (section === "views" && inNestedView) hint = NESTED_VIEW_TYPE_HINT;
    else if (section === "views" && inGroup) hint = GROUP_TYPE_HINT;
  }

  if (!hint) {
    const sectionMap = FIELD_HINTS[fieldName];
    if (sectionMap) hint = sectionMap[section] || sectionMap["*"] || null;
  }
  if (!hint) return null;

  return {
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: m[0].length + 1,
    },
    contents: [{ value: hint }],
  };
}

function tryValueHover(
  model: any,
  pos: any,
  ctx: Ctx,
): { range: any; contents: any[] } | null {
  const line = pos.lineNumber;
  const text = model.getLineContent(line);
  const m = text.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*([^\s#]+)/);
  if (!m) return null;
  const fieldName = m[2];
  let value = m[3];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  const valueStart = text.indexOf(value, m[1].length + fieldName.length + 2);
  if (valueStart < 0) return null;
  if (pos.column < valueStart + 1 || pos.column > valueStart + value.length + 1)
    return null;

  const range = {
    startLineNumber: line,
    startColumn: valueStart + 1,
    endLineNumber: line,
    endColumn: valueStart + value.length + 1,
  };

  let hint: string | null = null;

  if (fieldName === "dataType") {
    hint = buildDataTypeHover(value, ctx.modelIndex, ctx.currentDomain);
  } else if (fieldName === "sequence") {
    hint = buildSequenceHover(value, ctx.modelIndex, ctx.currentDomain);
  } else if (fieldName === "counterColorPattern") {
    hint = buildCounterPatternHover(value, ctx.modelIndex, ctx.currentDomain);
  } else if (fieldName === "iconName") {
    hint = buildIconNameHover(value);
  } else if (fieldName === "route") {
    hint = buildRouteHover(value, model, line);
  } else if (fieldName === "mimeTypes" || fieldName === "mime_types") {
    hint = buildMimeHover(value);
  } else if (fieldName === "regexp") {
    hint = buildRegexpHover(value);
  } else if (fieldName === "color") {
    hint = buildColorHover(value);
  } else if (fieldName === "action") {
    hint = buildActionHover(value, ctx.modelIndex, ctx.currentDomain);
  } else if (fieldName === "widget") {
    hint = buildWidgetHover(value, ctx.modelIndex, ctx.currentDomain);
  }

  if (!hint) return null;
  return { range, contents: [{ value: hint }] };
}

function tryLiteralHover(
  model: any,
  pos: any,
  ctx: Ctx,
): { range: any; contents: any[] } | null {
  const line = pos.lineNumber;
  const text = model.getLineContent(line);

  // condition: true
  if (/^\s*(?:-\s+)?condition\s*:\s*true\b/.test(text)) {
    const start = text.indexOf("true");
    if (start >= 0 && pos.column >= start + 1 && pos.column <= start + 5) {
      return {
        range: {
          startLineNumber: line,
          startColumn: start + 1,
          endLineNumber: line,
          endColumn: start + 5,
        },
        contents: [{ value: buildConditionTrueHover() }],
      };
    }
  }

  // Плейсхолдеры в template
  const tmplM = text.match(/^\s*(?:-\s+)?template\s*:\s*(.+)$/);
  if (tmplM) {
    const value = tmplM[1];
    const phRe = /\{@\w+\}/g;
    let m: RegExpExecArray | null;
    while ((m = phRe.exec(value)) !== null) {
      const col = tmplM[0].indexOf(value) + m.index + 1;
      if (pos.column >= col && pos.column <= col + m[0].length) {
        const hint = buildTemplatePlaceholderHover(m[0]);
        if (hint) {
          return {
            range: {
              startLineNumber: line,
              startColumn: col,
              endLineNumber: line,
              endColumn: col + m[0].length,
            },
            contents: [{ value: hint }],
          };
        }
      }
    }
  }

  // {attr} в label
  const labelM = text.match(/^\s*(?:-\s+)?label\s*:\s*(.+)$/);
  if (labelM) {
    const value = labelM[1];
    const re = /\{([a-zA-Z_][\w]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      const col = labelM[0].indexOf(value) + m.index + 1;
      if (pos.column >= col && pos.column <= col + m[0].length) {
        return {
          range: {
            startLineNumber: line,
            startColumn: col,
            endLineNumber: line,
            endColumn: col + m[0].length,
          },
          contents: [{ value: buildLabelPlaceholderHover(m[1]) }],
        };
      }
    }
  }

  // Плейсхолдеры {{attrId}} в RQL (variables.rql)
  const rqlM = text.match(/^\s*(?:-\s+)?rql\s*:\s*(.+)$/);
  if (rqlM) {
    const value = rqlM[1];
    const phRe = /\{\{([a-zA-Z_][\w]*)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = phRe.exec(value)) !== null) {
      const col = rqlM[0].indexOf(value) + m.index + 1;
      if (pos.column >= col && pos.column <= col + m[0].length) {
        return {
          range: {
            startLineNumber: line,
            startColumn: col,
            endLineNumber: line,
            endColumn: col + m[0].length,
          },
          contents: [
            {
              value: `**{{${m[1]}}}** — подстановка значения атрибута \`${m[1]}\` из контекста объекта.`,
            },
          ],
        };
      }
    }
  }

  return null;
}

function tryIdentifierConflict(
  model: any,
  pos: any,
): { range: any; contents: any[] } | null {
  const line = pos.lineNumber;
  const text = model.getLineContent(line);
  if (!/^\s*(?:-\s+)?(?:sequence|template)\s*:/.test(text)) return null;

  const hint = buildIdentifierHover(model, line);
  if (!hint) return null;

  const m = text.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
  if (!m) return null;

  return {
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: m[0].length + 1,
    },
    contents: [{ value: hint }],
  };
}

export function registerYamlHovers(monaco: any, getCtx: () => Ctx): void {
  monaco.languages.registerHoverProvider("yaml", {
    provideHover: (model: any, position: any) => {
      try {
        const ctx = getCtx();
        const tryOne = (fn: () => any) => {
          try {
            return fn();
          } catch {
            return null;
          }
        };

        const result =
          tryOne(() => tryIdentifierConflict(model, position)) ||
          tryOne(() => trySectionHover(model, position)) ||
          tryOne(() => tryLiteralHover(model, position, ctx)) ||
          tryOne(() => tryValueHover(model, position, ctx)) ||
          tryOne(() => tryFieldHover(model, position, ctx));

        return result;
      } catch (err) {
        console.warn("[yaml-hovers]", err);
        return null;
      }
    },
  });
}
