import type { ModelIndex, EntityRecord } from "../../shared/model-types";

export interface RqlIssue {
  line: number;
  column: number;
  length: number;
  message: string;
  severity: "error" | "warning";
}

export interface CheckContext {
  entityId: string | null;
  modelIndex: ModelIndex | null;
}

const RQL_FIELDS = new Set(["expression", "constraint", "condition"]);
const BOOLEAN_LITERALS = new Set(["true", "false", "yes", "no"]);

const SYSTEM_ATTRS = new Set([
  "id",
  "label",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "tenantId",
  "domainId",
  "entityId",
  "entityName",
  "organizationId",
  "version",
]);

interface DataTypeInfo {
  kind: string;
  domainId: string;
  members: Set<string>;
}

function extractFromJoinAliases(expr: string): Set<string> {
  const aliases = new Set<string>();
  const re = /(?:FROM|FROM_EXT|join|JOIN|JOIN_EXT|join_ext)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < expr.length && depth > 0) {
      const ch = expr[i];
      if (ch === "'" || ch === '"') {
        const q = ch;
        i++;
        while (i < expr.length && expr[i] !== q) {
          if (expr[i] === "\\") i++;
          i++;
        }
        i++;
        continue;
      }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const inner = expr.slice(start, i - 1);
    const innerRe = /@([a-zA-Z][a-zA-Z0-9_]*)/g;
    let im: RegExpExecArray | null;
    while ((im = innerRe.exec(inner)) !== null) {
      aliases.add(im[1]);
    }
  }
  return aliases;
}

export function checkRqlExpression(
  expr: string,
  startLine: number,
  ctx: CheckContext,
): RqlIssue[] {
  const issues: RqlIssue[] = [];
  const trimmed = expr.trim();
  if (!trimmed) {
    issues.push({
      line: startLine,
      column: 1,
      length: 1,
      message: "Пустое RQL-выражение",
      severity: "error",
    });
    return issues;
  }

  // ============ Синтаксис ============
  let parenDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let escapeNext = false;
  let quoteStart = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      quoteStart = i;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      quoteStart = i;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth--;
    if (parenDepth < 0 || bracketDepth < 0) {
      issues.push({
        line: startLine,
        column: i + 1,
        length: 1,
        message: `Лишняя закрывающая ${ch === ")" ? "скобка" : "квадратная скобка"}`,
        severity: "error",
      });
      return issues;
    }
  }
  if (inSingle || inDouble) {
    issues.push({
      line: startLine,
      column: quoteStart + 1,
      length: 1,
      message: "Незакрытая кавычка",
      severity: "error",
    });
  }
  if (parenDepth > 0) {
    issues.push({
      line: startLine,
      column: 1,
      length: trimmed.length,
      message: `Незакрытых скобок: ${parenDepth}`,
      severity: "error",
    });
  }
  if (bracketDepth > 0) {
    issues.push({
      line: startLine,
      column: 1,
      length: trimmed.length,
      message: `Незакрытых квадратных скобок: ${bracketDepth}`,
      severity: "error",
    });
  }
  if (/[\s(,+\-*\/=<>&|]$/.test(trimmed)) {
    issues.push({
      line: startLine,
      column: trimmed.length,
      length: 1,
      message: "Выражение оканчивается оператором — вероятно, обрезано",
      severity: "warning",
    });
  }

  const hasOperator =
    /[=<>!+\-*\/%]|\b(IS|IN|LIKE|AND|OR|NOT|BETWEEN|SELECT|FROM|WHERE|CAST|COUNT|SUM|AVG|MIN|MAX|JOIN|ON|EQ|FROM_EXT|ARRAY_AGG|JOIN_EXT)\b|\(|\)/i.test(
      trimmed,
    );
  const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 0).length;
  if (!hasOperator && wordCount >= 2) {
    issues.push({
      line: startLine,
      column: 1,
      length: trimmed.length,
      message: "Выражение не содержит операторов RQL — вероятно некорректно",
      severity: "warning",
    });
  }

  // ============ Контекстные проверки ============
  if (!ctx.modelIndex || !ctx.entityId) return issues;

  let entity: EntityRecord | undefined;
  for (const e of ctx.modelIndex.entities) {
    if (e.entityId.toLowerCase() === ctx.entityId.toLowerCase()) {
      entity = e;
      break;
    }
  }
  if (!entity) return issues;

  const knownAttrs = new Set<string>();
  const numericAttrs = new Set<string>();
  const stringAttrs = new Set<string>();

  let current: EntityRecord | undefined = entity;
  const visited = new Set<string>();
  while (current && !visited.has(current.fqid)) {
    visited.add(current.fqid);
    current.attributes.forEach((a) => {
      knownAttrs.add(a.id);
      const dt = a.dataType;
      if (
        dt === "Integer" ||
        dt === "Decimal" ||
        dt === "Float" ||
        dt === "Calculation" ||
        dt === "Counter"
      ) {
        numericAttrs.add(a.id);
      } else if (
        dt === "String" ||
        dt === "Text" ||
        dt === "URL" ||
        dt === "Attachment"
      ) {
        stringAttrs.add(a.id);
      }
    });
    current = current.inherits
      ? ctx.modelIndex.entitiesByFqid[current.inherits]
      : undefined;
  }

  const dataTypes = buildDataTypeIndex(ctx.modelIndex);
  const aliases = extractFromJoinAliases(trimmed);
  const reportedRefs = new Set<string>();

  // @field
  const attrRegex = /@([a-zA-Z][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(trimmed)) !== null) {
    const field = m[1];
    if (/^Current/i.test(field)) continue;
    if (SYSTEM_ATTRS.has(field)) continue;
    if (
      /^(row|link|linkages|doc|user|documents|attributes|item|value)$/i.test(
        field,
      )
    )
      continue;
    if (aliases.has(field)) continue;
    if (knownAttrs.has(field)) continue;
    if (dataTypes.has(field.toLowerCase())) continue;

    if (reportedRefs.has(field)) continue;
    reportedRefs.add(field);
    issues.push({
      line: startLine,
      column: trimmed.indexOf("@" + field) + 1,
      length: field.length + 1,
      message: `Поле @${field} не найдено в сущности ${ctx.entityId} и не является известным типом данных`,
      severity: "warning",
    });
  }

  // @doc.attr
  const docAttrRegex = /@doc\.([a-zA-Z][a-zA-Z0-9_]*)/gi;
  while ((m = docAttrRegex.exec(trimmed)) !== null) {
    const attr = m[1];
    if (SYSTEM_ATTRS.has(attr)) continue;
    if (knownAttrs.has(attr)) continue;
    issues.push({
      line: startLine,
      column: trimmed.indexOf(m[0]) + 1,
      length: m[0].length,
      message: `Поле @doc.${attr} не найдено в сущности ${ctx.entityId}`,
      severity: "warning",
    });
  }

  // @X.Y
  const xDotYRegex = /@([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z][a-zA-Z0-9_]*)/g;
  while ((m = xDotYRegex.exec(trimmed)) !== null) {
    const base = m[1];
    const field = m[2];
    if (base.toLowerCase() === "doc") continue;
    if (/^Current/i.test(base)) continue;
    if (/^(link|row|linkages|user|item|value|documents)$/i.test(base)) continue;

    const dtInfo = dataTypes.get(base.toLowerCase());
    if (dtInfo) {
      if (!dtInfo.members.has(field.toLowerCase())) {
        issues.push({
          line: startLine,
          column: trimmed.indexOf(m[0]) + 1,
          length: m[0].length,
          message: `Значение «${field}» не найдено в типе ${base} (${dtInfo.kind})`,
          severity: "warning",
        });
      }
      continue;
    }
    if (aliases.has(base)) continue;
    if (knownAttrs.has(base)) continue;
    if (reportedRefs.has("." + base)) continue;
    reportedRefs.add("." + base);
    issues.push({
      line: startLine,
      column: trimmed.indexOf(m[0]) + 1,
      length: m[0].length,
      message: `База @${base} не найдена в контексте ${ctx.entityId}`,
      severity: "warning",
    });
  }

  // Присваивание с проверкой типа
  const assignRegex =
    /@([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|(\d+(?:\.\d+)?))/g;
  while ((m = assignRegex.exec(trimmed)) !== null) {
    const field = m[1];
    if (aliases.has(field)) continue;
    if (/^Current/i.test(field)) continue;
    if (dataTypes.has(field.toLowerCase())) continue;
    const strLit = m[2] !== undefined || m[3] !== undefined;
    const numLit = m[4] !== undefined;
    if (strLit && numericAttrs.has(field)) {
      issues.push({
        line: startLine,
        column: trimmed.indexOf("@" + field) + 1,
        length: field.length + 1,
        message: `@${field} имеет числовой тип, но сравнивается со строкой`,
        severity: "warning",
      });
    }
    if (numLit && stringAttrs.has(field)) {
      issues.push({
        line: startLine,
        column: trimmed.indexOf("@" + field) + 1,
        length: field.length + 1,
        message: `@${field} имеет строковый тип, но сравнивается с числом`,
        severity: "warning",
      });
    }
  }

  return issues;
}

function buildDataTypeIndex(modelIndex: ModelIndex): Map<string, DataTypeInfo> {
  const idx = new Map<string, DataTypeInfo>();
  for (const dt of modelIndex.dataTypes) {
    const members = new Set<string>();
    if (Array.isArray(dt.values)) {
      dt.values.forEach((v) => members.add(String(v).toLowerCase()));
    }
    if (Array.isArray(dt.statuses)) {
      dt.statuses.forEach((v) => members.add(String(v).toLowerCase()));
    }
    if (Array.isArray(dt.columns)) {
      dt.columns.forEach((v) => members.add(String(v).toLowerCase()));
    }
    const info: DataTypeInfo = {
      kind: dt.kind,
      domainId: dt.domainId,
      members,
    };
    if (dt.id) idx.set(dt.id.toLowerCase(), info);
    if (dt.name && dt.name !== dt.id) idx.set(dt.name.toLowerCase(), info);
  }
  return idx;
}

// Экспорт на будущее (для переиспользования в web-версии при желании)
export { RQL_FIELDS, BOOLEAN_LITERALS };
