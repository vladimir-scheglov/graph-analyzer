import { ModelIndex } from "../../../shared/model-types";
import { type LineMap, type SectionBlock, type NavNode, findAttributeInEntity } from "../yaml/line-map";
import { scanRqlInText } from "./rql-check";

let providersRegistered = false;

interface ProviderContext {
  lineMap: LineMap | null;
  currentFilePath: string | null;
  currentDomainId: string | null;
  onOpenFqid?: (fqid: string) => void;
  modelIndex: ModelIndex | null;
}

const ctx: ProviderContext = {
  lineMap: null,
  currentFilePath: null,
  currentDomainId: null,
  modelIndex: null,
};

export function updateProviderContext(partial: Partial<ProviderContext>): void {
  Object.assign(ctx, partial);
}

export function resetProviderContext(): void {
  ctx.lineMap = null;
  ctx.currentFilePath = null;
  ctx.currentDomainId = null;
  ctx.onOpenFqid = undefined;
}

// ============ Поля, значения которых — ссылки на id/сущности/атрибуты ============

/** Поля, где значение — определение id (свой id). */
const DEF_FIELDS = new Set(["id"]);

/** Поля, где значение — ссылка на элемент в этом же файле (сущность, view, action). */
const REF_FIELDS = new Set([
  "inherits",
  "entity",
  "modal",
  "panel",
  "form",
  "tab",
  "list",
  "view",
  "page",
  "addLinksView",
  "fromView",
  "linkage",
  "key",
  "value",
  "widget",
  "block",
  "action",
  "menu",
  "node",
  "source",
  "join",
]);

/** Поля, где значение может быть `<Entity>.<attr>` или `<Entity>` — составная ссылка. */
const ATTRIBUTE_LIKE_FIELDS = new Set([
  "attribute",
  "attributes",
  "item",
  "by",
  "use",
  "searching",
]);

// ============ Разбор слова под курсором ============

interface WordHit {
  /** Тип: определение id, ссылка на сущность, ссылка на атрибут, простая ссылка. */
  type:
    | "id-def"
    | "ref-entity"
    | "ref-attribute"
    | "ref-item"
    | "ref-fqid-foreign";
  /** Значение — то, что нужно искать. */
  value: string;
  /** Для attr — имя сущности. */
  entityPart?: string;
  /** Для attr — путь к атрибуту (может быть вложенным `attr.subfield`). */
  attributePart?: string;
  /** Домен-префикс FQID (если указан). */
  domainPrefix?: string | null;
  /** Полный FQID. */
  fqid?: string;
  /** Исходное поле. */
  field: string;
}

/**
 * Разбирает строку YAML и возвращает информацию о том, что находится под курсором.
 */
function findWordAtLine(lineText: string, column: number): WordHit | null {
  // Группа 3 — value с любым хвостом. group[3] заканчивается на конце строки.
  const fieldMatch = lineText.match(
    /^(\s*)(?:-\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/,
  );
  if (!fieldMatch) return null;

  const field = fieldMatch[2];
  const valueRaw = fieldMatch[3].trim();
  if (!valueRaw || valueRaw.startsWith("#")) return null;

  // Надёжный расчёт начала value: group[3] идёт до конца строки,
  // значит valueRaw занимает последние (valueRaw.length) символов
  // от lineText.trimEnd().length
  const trimmedLine = lineText.replace(/\s+$/, "");
  const valueStart = trimmedLine.length - valueRaw.length;
  if (valueStart < 0) return null;
  const valueEnd = valueStart + valueRaw.length;

  // Monaco column 1-based
  if (column < valueStart + 1 || column > valueEnd) return null;

  let value = valueRaw;
  let quoteOffset = 0;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
    quoteOffset = 1;
  }

  // relativeCol — 0-based позиция внутри value
  const relativeCol = column - 1 - valueStart - quoteOffset;
  if (relativeCol < 0 || relativeCol > value.length) return null;

  if (field === "id") {
    return { type: "id-def", value, field };
  }

  const isAttributeLike = ATTRIBUTE_LIKE_FIELDS.has(field);
  const isRefField = REF_FIELDS.has(field);
  if (!isAttributeLike && !isRefField) return null;

  const slashIdx = value.indexOf("/");
  let domainPrefix: string | null = null;
  let rest = value;
  let restStart = 0;
  if (slashIdx > 0) {
    domainPrefix = value.slice(0, slashIdx).toLowerCase();
    rest = value.slice(slashIdx + 1);
    restStart = slashIdx + 1;
  }

  const dotIdx = rest.indexOf(".");
  const isForeignDomain =
    !!domainPrefix &&
    domainPrefix !== (ctx.currentDomainId || "").toLowerCase();

  if (isAttributeLike && dotIdx > 0) {
    const entityPart = rest.slice(0, dotIdx);
    const attributePart = rest.slice(dotIdx + 1);

    const entityEndInValue = restStart + entityPart.length;
    const attrStartInValue = entityEndInValue + 1;
    const attrEndInValue = attrStartInValue + attributePart.length;

    if (relativeCol >= restStart && relativeCol <= entityEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: entityPart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart,
          field,
        };
      }
      return {
        type: "ref-entity",
        value: entityPart,
        domainPrefix,
        fqid: (domainPrefix ? domainPrefix + "/" : "") + entityPart,
        field,
      };
    }
    if (relativeCol >= attrStartInValue && relativeCol <= attrEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: attributePart,
          entityPart,
          attributePart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart + "." + attributePart,
          field,
        };
      }
      return {
        type: "ref-attribute",
        value: attributePart,
        entityPart,
        attributePart,
        domainPrefix,
        field,
      };
    }
    return null;
  }

  if (isForeignDomain) {
    return {
      type: "ref-fqid-foreign",
      value: rest,
      domainPrefix,
      fqid: domainPrefix + "/" + rest,
      field,
    };
  }

  return {
    type: "ref-item",
    value: rest,
    domainPrefix,
    fqid: (domainPrefix ? domainPrefix + "/" : "") + rest,
    field,
  };
}

// ============ Поиск определений ============

/** Ищет строку сущности по её id в секции entities. */
function findEntityLine(entityId: string, lineMap: LineMap): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const node = section.nodes.find((n) => n.id === entityId);
  return node ? node.line : null;
}

/**
 * Ищет строку атрибута внутри сущности.
 * attributePart может быть "identifier" или "tableAttr.subField".
 */
function findAttributeLine(
  entityId: string,
  attributePart: string,
  lineMap: LineMap,
): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const entity = section.nodes.find((n) => n.id === entityId);
  if (!entity || !entity.children) return null;

  // Полный путь из сегментов
  const segments = attributePart.split(".");
  const firstSegment = segments[0];

  // Ищем по дереву вглубь
  const stack = [...entity.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === firstSegment) {
      // Нашли первый сегмент. Если один сегмент — это он
      if (segments.length === 1) return node.line;

      // Если больше — ищем следующий сегмент в его children
      let current = node;
      for (let i = 1; i < segments.length; i++) {
        const next = (current.children || []).find((c) => c.id === segments[i]);
        if (!next) {
          // Не нашли вложенный — вернём строку первого сегмента
          return node.line;
        }
        current = next;
      }
      return current.line;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/**
 * Ищет строку элемента в любой секции по его id.
 * Используется для `inherits`, `view`, `action`, `linkage` и т.п.
 */
function findItemLine(itemId: string, lineMap: LineMap): number | null {
  // Сначала — itemLines
  for (const [key, line] of lineMap.itemLines.entries()) {
    if (key.endsWith("#" + itemId)) return line;
  }
  // Потом — обход всех children
  const stack: NavNode[] = [];
  lineMap.sections.forEach((s) => stack.push(...s.nodes));
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === itemId) return node.line;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

// ============ Symbol Provider ============

function flattenSections(sections: SectionBlock[]): Array<{
  node: NavNode;
  sectionKey: string;
  depth: number;
}> {
  const out: Array<{ node: NavNode; sectionKey: string; depth: number }> = [];
  const walk = (node: NavNode, sectionKey: string, depth: number) => {
    out.push({ node, sectionKey, depth });
    if (node.children)
      node.children.forEach((c) => walk(c, sectionKey, depth + 1));
  };
  sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key, 0)));
  return out;
}

function buildSymbols(monaco: any, lineMap: LineMap): any[] {
  const { SymbolKind } = monaco.languages;
  const SECTION_KIND: Record<string, number> = {
    entities: SymbolKind.Class,
    linkages: SymbolKind.Interface,
    dataTypes: SymbolKind.Enum,
    sequences: SymbolKind.Constant,
    actions: SymbolKind.Function,
    views: SymbolKind.Namespace,
    menus: SymbolKind.Module,
    mixins: SymbolKind.Struct,
    dataRules: SymbolKind.Rule,
    medias: SymbolKind.File,
  };

  function toSymbol(node: NavNode, sectionKey: string, depth: number): any {
    const kind =
      depth === 0
        ? SECTION_KIND[sectionKey] || SymbolKind.Object
        : depth === 1
          ? SymbolKind.Object
          : SymbolKind.Field;

    const range = {
      startLineNumber: node.line,
      startColumn: 1,
      endLineNumber: node.line,
      endColumn: 1,
    };

    return {
      name: node.id,
      detail: node.meta || node.label,
      kind,
      tags: [],
      range,
      selectionRange: range,
      children: (node.children || []).map((c) =>
        toSymbol(c, sectionKey, depth + 1),
      ),
    };
  }

  return lineMap.sections.map((section) => ({
    name: section.label,
    detail: `${section.count} items`,
    kind: SymbolKind.Namespace,
    tags: [],
    range: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    selectionRange: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    children: section.nodes.map((n) => toSymbol(n, section.key, 1)),
  }));
}

// ============ Definition Provider ============

function makeLocation(model: any, line: number): any {
  return {
    uri: model.uri,
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    },
  };
}

function provideDefinition(monaco: any, model: any, position: any): any {
  if (!ctx.lineMap) return null;
  const lineText = model.getLineContent(position.lineNumber);
  const hit = findWordAtLine(lineText, position.column);
  if (!hit) return null;

  if (hit.type === "id-def") return null;

  if (hit.type === "ref-entity") {
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    return null;
  }

  if (hit.type === "ref-attribute") {
    // Если entityPart указан явно — используем его
    // Иначе — смотрим lineContexts для контекстной сущности
    let entityId = hit.entityPart;
    if (!entityId) {
      const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
      entityId = lc?.entityId || undefined;
    }
    if (!entityId) return null;

    const attrLine = findAttributeInEntity(
      entityId,
      hit.attributePart || hit.value,
      ctx.lineMap,
    );
    if (attrLine != null) return [makeLocation(model, attrLine)];
    return null;
  }

  if (hit.type === "ref-item") {
    // Сначала — контекстная сущность (attribute: os без префикса)
    const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
    if (lc?.entityId && (hit.field === "attribute" || hit.field === "by")) {
      const attrLine = findAttributeInEntity(
        lc.entityId,
        hit.value,
        ctx.lineMap,
      );
      if (attrLine != null) return [makeLocation(model, attrLine)];
    }
    // Потом — обычный item
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    // Фоллбэк — сущность
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    return null;
  }

  return null;
}

// ============ Регистрация ============

export function registerMonacoProviders(monaco: any): void {
  if (providersRegistered) return;
  providersRegistered = true;

  monaco.languages.registerDocumentSymbolProvider("yaml", {
    provideDocumentSymbols: (model: any) => {
      if (!ctx.lineMap) return [];
      try {
        return buildSymbols(monaco, ctx.lineMap);
      } catch {
        return [];
      }
    },
  });

  monaco.languages.registerDefinitionProvider("yaml", {
    provideDefinition: (model: any, position: any) =>
      provideDefinition(monaco, model, position),
  });

  monaco.languages.registerHoverProvider("yaml", {
    provideHover: (model: any, position: any) => {
      try {
        if (!ctx.lineMap || !ctx.modelIndex) return null;
        const lineText = model.getLineContent(position.lineNumber);
        const hit = findWordAtLine(lineText, position.column);
        if (!hit) return null;

        // Определение id — показываем карточку сущности
        if (hit.type === "id-def" || hit.type === "ref-entity") {
          const entityId = hit.value.toLowerCase();
          let entity: any = null;
          for (const e of ctx.modelIndex.entities) {
            if (e.entityId.toLowerCase() === entityId) {
              entity = e;
              break;
            }
          }
          if (!entity) return null;

          const contents = [
            {
              value: `**${entity.entityId}** ${entity.name && entity.name !== entity.entityId ? `— ${entity.name}` : ""}`,
            },
          ];
          if (entity.description) {
            contents.push({ value: entity.description });
          }
          const stats = [`Атрибутов: **${entity.attributes.length}**`];
          if (entity.inherits) stats.push(`Наследует: \`${entity.inherits}\``);
          if (entity.referencedByInheritance.length > 0) {
            stats.push(`Наследников: ${entity.referencedByInheritance.length}`);
          }
          contents.push({ value: stats.join(" · ") });
          contents.push({ value: `\`${entity.fqid}\`` });

          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: lineText.length + 1,
            },
            contents,
          };
        }

        // Атрибут — показываем карточку атрибута
        if (
          hit.type === "ref-attribute" &&
          hit.entityPart &&
          hit.attributePart
        ) {
          let entity: any = null;
          for (const e of ctx.modelIndex.entities) {
            if (e.entityId.toLowerCase() === hit.entityPart.toLowerCase()) {
              entity = e;
              break;
            }
          }
          if (!entity) return null;
          const attr = entity.attributes.find(
            (a: any) => a.id === hit.attributePart,
          );
          if (!attr) return null;

          const contents = [
            {
              value: `**${attr.id}** ${attr.name && attr.name !== attr.id ? `— ${attr.name}` : ""}`,
            },
          ];
          if (attr.description) contents.push({ value: attr.description });
          const meta = [`Тип: \`${attr.dataType}\``];
          if (attr.constraints.length > 0) {
            meta.push(`Ограничения: ${attr.constraints.join(", ")}`);
          }
          if (attr.referenceEntity) {
            meta.push(`Ссылается на: \`${attr.referenceEntity}\``);
          }
          contents.push({ value: meta.join(" · ") });

          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: lineText.length + 1,
            },
            contents,
          };
        }

        return null;
      } catch {
        return null;
      }
    },
  });

  // Once — глобальный command
  if (!(monaco.editor as any).__dgCommandRegistered) {
    (monaco.editor as any).__dgCommandRegistered = true;
    monaco.editor.registerCommand(
      "dg-issue-action",
      (_accessor: any, payload: any) => {
        document.dispatchEvent(
          new CustomEvent("dg:issue-action", { detail: payload }),
        );
      },
    );
  }

  monaco.languages.registerCodeActionProvider("yaml", {
    provideCodeActions: (model: any, range: any, context: any) => {
      const actions: any[] = [];
      context.markers.forEach((marker: any) => {
        if (marker.source !== "dg-linter" && marker.source !== "rql-check")
          return;

        actions.push({
          title: "📖 Показать справку по правилу",
          kind: "quickfix",
          diagnostics: [marker],
          command: {
            id: "dg-issue-action",
            title: "Show help",
            arguments: [
              {
                action: "help",
                source: marker.source,
                message: marker.message,
                line: marker.startLineNumber,
              },
            ],
          },
        });

        actions.push({
          title: "🔇 Игнорировать это правило в файле",
          kind: "quickfix",
          diagnostics: [marker],
          command: {
            id: "dg-issue-action",
            title: "Ignore rule",
            arguments: [
              {
                action: "ignore",
                source: marker.source,
                message: marker.message,
                line: marker.startLineNumber,
              },
            ],
          },
        });

        actions.push({
          title: "🔬 Открыть линтер схем",
          kind: "quickfix",
          diagnostics: [marker],
          command: {
            id: "dg-issue-action",
            title: "Open lint",
            arguments: [
              {
                action: "open-lint",
                source: marker.source,
                message: marker.message,
              },
            ],
          },
        });
      });
      return { actions, dispose: () => {} };
    },
  });
}

export function applyRqlMarkers(monaco: any, model: any): void {
  try {
    const text = model.getValue();
    const lineContexts = ctx.lineMap?.lineContexts || new Map();
    const issues = scanRqlInText(text, lineContexts, ctx.modelIndex);
    const markers = issues.map((p) => ({
      severity:
        p.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: `RQL: ${p.message}`,
      startLineNumber: p.line,
      startColumn: p.column,
      endLineNumber: p.line,
      endColumn: p.column + p.length,
      source: "rql-check",
    }));
    monaco.editor.setModelMarkers(model, "rql-check", markers);
  } catch {}
}
