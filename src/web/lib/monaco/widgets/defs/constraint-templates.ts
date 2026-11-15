import { insertBlock } from "../insert";
import type { WidgetDef } from "../types";

const TEMPLATES: Record<string, string> = {
  required: '- kind: required\n  message: "${1:Обязательное поле}"',
  length:
    '- kind: length\n  min: ${1:1}\n  max: ${2:255}\n  message: "${3:Недопустимая длина}"',
  range:
    '- kind: range\n  min: ${1:0}\n  max: ${2:100}\n  message: "${3:Вне диапазона}"',
  regexp:
    '- kind: regexp\n  regexp: "${1:^[a-z]+$}"\n  message: "${2:Неверный формат}"',
  unique: '- kind: unique\n  message: "${1:Должно быть уникально}"',
  size: '- kind: size\n  min: ${1:1}\n  max: ${2:1024}\n  message: "${3:Неверный размер}"',
  mime_types:
    "- kind: mime_types\n  mimeTypes:\n    - ${1:image/png}\n    - ${2:application/pdf}",
};

export const constraintTemplatesWidget: WidgetDef = {
  id: "constraint-templates",
  title: "Constraint",
  priority: 80,
  getActions(ctx) {
    const lineCtx = ctx.lineMap?.lineContexts.get(ctx.currentLine);
    const inConstraints = lineCtx?.breadcrumbs.some(
      (b: any) => b.id === "constraints",
    );
    if (!inConstraints) return [];

    const hasKind = ctx.blockLines.some((ln) =>
      /^\s*(?:-\s+)?kind\s*:/.test(ctx.model.getLineContent(ln)),
    );
    if (hasKind) return [];

    const dt = ctx.attribute?.dataType;
    const list = ["required", "length", "range", "regexp", "unique"];
    if (dt === "Attachment") list.push("size", "mime_types");

    return list.map((k) => ({
      id: "cons-" + k,
      label: k,
      icon: "rule",
      run: (c, ed, m) => insertBlock(ed, m, c, TEMPLATES[k]),
    }));
  },
};
