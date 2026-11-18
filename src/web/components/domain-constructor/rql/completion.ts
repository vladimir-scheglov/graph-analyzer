import { ALIASES, FUNCTIONS, findFunction, CAST_TYPES } from "./lexicon";
import {
  RqlContext,
  allowsRowAlias,
  allowsIndexAlias,
  allowsLinkAlias,
} from "./context";
import type { CompletionItem, Monaco } from "./monaco-types";

/**
 * Completion для Domain RQL.
 *
 * Триггеры: @, ., (, '
 * Позиция:
 *   - после @     → системные алиасы + сущности/связи/перечисления/воркфлоу
 *   - после @doc. → атрибуты текущей сущности
 *   - после @row. → атрибуты таблицы (в entityAttribute)
 *   - после from( / join( (в кавычке) → FQDN доменов + 'current'
 *   - после from('domain', → @entity / @linkage
 *   - в идентификаторе → функции (в зависимости от наличия '(')
 */

export interface CompletionDeps {
  monaco: Monaco;
}

export function registerRqlCompletion(
  monaco: Monaco,
  getContext: () => RqlContext | null,
): any {
  return monaco.languages.registerCompletionItemProvider("domain-rql", {
    triggerCharacters: ["@", ".", "(", "'"],

    provideCompletionItems: (model, position) => {
      const ctx = getContext();
      if (!ctx) return { suggestions: [] };

      const line = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // 1) @<something>  → алиасы / @doc.attr / @row.attr
      if (/@[A-Za-z_]*$/.test(before)) {
        return { suggestions: buildAtSuggestions(ctx, range) };
      }

      // 2) @doc.<attr>
      if (/@doc\.\w*$/.test(before)) {
        return { suggestions: buildAttrSuggestions(ctx, "doc", range) };
      }
      if (/@row\.\w*$/.test(before)) {
        return { suggestions: buildRowSuggestions(ctx, range) };
      }

      // 3) from('current', @…  — сущности и связи текущего домена
      if (/from\(\s*['"](?:current|[^'"]+)['"]\s*,\s*@\w*$/.test(before)) {
        return { suggestions: buildEntityAndLinkageSuggestions(ctx, range) };
      }
      // 4) from('  — FQDN доменов
      if (/from\(\s*['"][^'"]*$/.test(before)) {
        return { suggestions: buildDomainSuggestions(ctx, range) };
      }
      // 5) join('  / join(  — домены или @cte
      if (/join\(\s*['"][^'"]*$/.test(before)) {
        return { suggestions: buildDomainSuggestions(ctx, range) };
      }

      // 6) CAST(x, '  — типы
      if (/CAST\s*\([^,]+,\s*['"][^'"]*$/.test(before)) {
        return { suggestions: buildCastTypeSuggestions(range) };
      }

      // 7) Идентификатор — функции
      return { suggestions: buildFunctionSuggestions(range) };
    },
  });
}

// ============ Builders ============

function buildAtSuggestions(ctx: RqlContext, range: any): CompletionItem[] {
  const items: CompletionItem[] = [];
  const mi = ctx.modelIndex;

  // Системные алиасы
  for (const alias of ALIASES) {
    if (alias.name === "@row" && !allowsRowAlias(ctx)) continue;
    if (alias.name === "@index" && !allowsIndexAlias(ctx)) continue;
    items.push({
      label: alias.name,
      kind: 14 /* Keyword */,
      detail: alias.detail,
      insertText: alias.name,
      range,
    });
  }

  // Текущий домен: @<Entity>, @<linkage>
  const entities = entitiesInDomain(ctx);
  for (const e of entities) {
    items.push({
      label: `@${e.id}`,
      kind: 5 /* Class */,
      detail: `Сущность (${ctx.currentDomainId})`,
      insertText: `@${e.id}`,
      range,
    });
  }
  for (const l of linkagesInDomain(ctx)) {
    items.push({
      label: `@${l.id}`,
      kind: 5,
      detail: "Связь (linkage)",
      insertText: `@${l.id}`,
      range,
    });
  }

  // Перечисления: @<enumId>.<value>
  const dataTypes = ctx.modelIndex.dataTypes.filter(
    (d) => d.domainId.toLowerCase() === ctx.currentDomainId.toLowerCase(),
  );
  for (const dt of dataTypes) {
    items.push({
      label: `@${dt.id}`,
      kind: 8 /* Enum */,
      detail: `${dt.kind === "Enum" ? "Перечисление" : dt.kind === "Workflow" ? "Workflow" : "Таблица"}`,
      insertText: `@${dt.id}`,
      range,
    });
  }

  return items;
}

function buildAttrSuggestions(
  ctx: RqlContext,
  source: "doc",
  range: any,
): CompletionItem[] {
  const entityFqid = placementEntityFqid(ctx);
  if (!entityFqid) return [];
  return attributeSuggestionsFor(ctx, entityFqid, source, range);
}

function buildRowSuggestions(ctx: RqlContext, range: any): CompletionItem[] {
  if (!allowsRowAlias(ctx)) return [];
  const p = ctx.placement;
  if (p.kind !== "dataRule.condition" || p.target !== "entityAttribute")
    return [];
  if (p.nestedType !== "table") return [];

  // Найти атрибут таблицы в сущности
  const entity = ctx.modelIndex.entitiesByFqid[
    p.entityFqid.toLowerCase()
  ] as any;
  if (!entity) return [];
  const attr = (entity.attributes ?? []).find((a: any) => a.id === p.attrId);
  const tableDt = attr?.dataType;
  if (!tableDt) return [];

  // Это пользовательский тип Table — найти его в dataTypes
  const dt = ctx.modelIndex.dataTypes.find(
    (d) =>
      d.id === tableDt &&
      d.domainId.toLowerCase() === ctx.currentDomainId.toLowerCase(),
  ) as any;
  if (!dt || dt.kind !== "Table") return [];

  const nested = dt.attributes ?? [];
  return nested.map((a: any) => ({
    label: a.id,
    kind: 5 /* Field */,
    detail: `Колонка (${a.dataType ?? "String"})`,
    insertText: a.id,
    range,
  }));
}

function buildDomainSuggestions(ctx: RqlContext, range: any): CompletionItem[] {
  const items: CompletionItem[] = [
    {
      label: "'current'",
      kind: 12 /* Value */,
      detail: "Текущий домен",
      insertText: "'current'",
      range,
    },
  ];
  for (const d of ctx.modelIndex.domains) {
    items.push({
      label: `'${d.id}'`,
      kind: 12,
      detail: d.name,
      insertText: `'${d.id}'`,
      range,
    });
  }
  return items;
}

function buildEntityAndLinkageSuggestions(
  ctx: RqlContext,
  range: any,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const e of entitiesInDomain(ctx)) {
    items.push({
      label: `@${e.id}`,
      kind: 5,
      detail: "Сущность",
      insertText: `@${e.id}`,
      range,
    });
  }
  for (const l of linkagesInDomain(ctx)) {
    items.push({
      label: `@${l.id}`,
      kind: 5,
      detail: "Связь",
      insertText: `@${l.id}`,
      range,
    });
  }
  return items;
}

function buildCastTypeSuggestions(range: any): CompletionItem[] {
  return CAST_TYPES.map((t) => ({
    label: `'${t}'`,
    kind: 12,
    detail: "Тип CAST",
    insertText: `'${t}'`,
    range,
  }));
}

function buildFunctionSuggestions(range: any): CompletionItem[] {
  return FUNCTIONS.map((fn) => ({
    label: fn.name,
    kind: 3 /* Function */,
    detail: fn.signature,
    documentation: fn.detail,
    insertText: fn.signature.includes("(") ? `${fn.name}($0)` : fn.name,
    insertTextRules: 4 /* InsertAsSnippet */,
    range,
  }));
}

// ============ Helpers ============

function entitiesInDomain(
  ctx: RqlContext,
): Array<{ id: string; name?: string }> {
  const domain = ctx.currentDomainId.toLowerCase();
  const out: Array<{ id: string; name?: string }> = [];
  for (const [fqid, entity] of Object.entries(ctx.modelIndex.entitiesByFqid)) {
    const slash = fqid.indexOf("/");
    if (slash < 0) continue;
    if (fqid.slice(0, slash) !== domain) continue;
    out.push({ id: fqid.slice(slash + 1), name: (entity as any)?.name });
  }
  return out;
}

function linkagesInDomain(ctx: RqlContext): Array<{ id: string }> {
  const domain = ctx.currentDomainId.toLowerCase();
  return ctx.modelIndex.entityLinkages
    .filter((l) => l.domainId.toLowerCase() === domain)
    .map((l) => ({ id: l.id }));
}

function placementEntityFqid(ctx: RqlContext): string | null {
  const p = ctx.placement;
  if ("entityFqid" in p) return p.entityFqid;
  return null;
}

function attributeSuggestionsFor(
  ctx: RqlContext,
  entityFqid: string,
  source: "doc" | "alias",
  range: any,
): CompletionItem[] {
  const entity = ctx.modelIndex.entitiesByFqid[entityFqid.toLowerCase()] as any;
  if (!entity) return [];
  const attrs = entity.attributes ?? [];
  return attrs.map((a: any) => ({
    label: a.id,
    kind: 5,
    detail: `${a.name ?? a.id} (${a.dataType ?? "String"})`,
    insertText: a.id,
    range,
  }));
}
