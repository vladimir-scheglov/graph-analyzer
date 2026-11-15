import { SNIPPETS } from "./monaco-providers";

let registered = false;

const TOP_LEVEL_ARRAYS: Record<string, string> = {
  entities: "entityList",
  linkages: "linkageList",
  dataTypes: "dataTypeList",
  sequences: "sequenceList",
  actions: "actionList",
  views: "viewList",
  trees: "treeList",
  transitiveLinkages: "transitiveLinkageList",
  mixins: "mixinList",
  dataRules: "dataRuleList",
  medias: "mediaList",
  menus: "menuRootList",
  uiRules: "uiRuleList",
  uiPresets: "uiPresetList",
  accessRules: "accessRule",
  localizations: "localization",
  counterColorPatterns: "counterColorPattern",
  counterColorPattern: "counterColorPattern",
  widgets: "widget",
  permissions: "permission",
};

const PATH_TO_CONTEXT: Record<string, string> = {
  entities: "entityList",
  "entities.attributes": "attribute",
  linkages: "linkage",
  "linkages.attributes": "linkageAttribute",
  "linkages.attributes.constraints": "attributeConstraint",
  "entities.attributes.constraints": "attributeConstraint",
  views: "view",
  "views.widgets": "widget",
  "views.groups": "group",
  "views.views": "viewNested",
  dataTypes: "dataType",
  "dataTypes.values": "enumValue",
  "dataTypes.statuses": "workflowStatus",
  "dataTypes.transitions": "transition",
  actions: "action",
  dataRules: "dataRule",
  "dataRules.rule.attributes": "dataRuleAttributeAction",
  "dataRules.rule.linkages": "dataRuleLinkageAction",
  menus: "menuRoot",
  "menus.items": "menuItem",
  medias: "media",
  uiRules: "uiRule",
  uiPresets: "uiPreset",
  sequences: "sequence",
  mixins: "mixin",
  trees: "tree",
  transitiveLinkages: "transitiveLinkage",
  "transitiveLinkages.joins": "transitiveJoin",
  counterColorPattern: "counterColorPattern",
  counterColorPatterns: "counterColorPattern",
  accessRules: "accessRule",
  permissions: "permission",
  localizations: "localization",
};

function isInsideRql(model: any, position: any): boolean {
  const line = position.lineNumber;
  const lineText = model.getLineContent(line);
  const RQL_FIELDS_RE = "(?:condition|expression|constraint|rql|query)";

  // Прямо на строке
  if (/!rql\b/.test(lineText)) return true;
  if (new RegExp(`^\\s*(?:-\\s+)?${RQL_FIELDS_RE}\\s*:\\s*`).test(lineText)) {
    if (/[|>]/.test(lineText)) {
      const fieldIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
      for (let i = line - 1; i >= 1; i--) {
        const prev = model.getLineContent(i);
        if (!prev.trim()) continue;
        const prevIndent = (prev.match(/^(\s*)/) || ["", ""])[1].length;
        if (prevIndent < fieldIndent) break;
        if (
          new RegExp(
            `^\\s*(?:-\\s+)?${RQL_FIELDS_RE}\\s*:\\s*(?:!rql\\b)?\\s*[|>]`,
          ).test(prev)
        ) {
          return true;
        }
      }
    }
    return true;
  }

  // Внутри block scalar — ищем вышестоящий ключ
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
  for (let i = line - 1; i >= 1; i--) {
    const prev = model.getLineContent(i);
    if (!prev.trim()) continue;
    const prevIndent = (prev.match(/^(\s*)/) || ["", ""])[1].length;
    if (prevIndent < currentIndent) {
      if (
        new RegExp(
          `^\\s*(?:-\\s+)?${RQL_FIELDS_RE}\\s*:\\s*(?:!rql\\b)?\\s*[|>]`,
        ).test(prev)
      ) {
        return true;
      }
      if (/!rql\b/.test(prev)) return true;
      return false;
    }
  }
  return false;
}

function countIndent(line: string): number {
  let n = 0;
  for (const ch of line.match(/^(\s*)/)?.[1] || "") {
    n += ch === "\t" ? 2 : 1;
  }
  return n;
}

/**
 * Определяет контекст для quick-insert и сниппетов. Независим от
 * detectContextAtPosition (не трогает его поведение для основного
 * автокомплита).
 *
 * Для пустой строки с нулевым отступом определяет «виртуальный» отступ
 * по ближайшей непустой строке-элементу (`- ...`).
 */
export function detectSnippetContext(
  model: any,
  position: any,
): { context: string; indent: string } | null {
  if (isInsideRql(model, position)) {
    return { context: "rql", indent: "" };
  }

  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);
  const trimmed = beforeCursor.trim();

  if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s+\S/.test(beforeCursor)) return null;
  if (trimmed.startsWith("#")) return null;

  let lineIndent = countIndent(lineText);

  // ── Виртуальный indent для пустой строки ──────────────────────────
  if (lineText.trim() === "") {
    let upIndent = -1;
    for (let n = position.lineNumber - 1; n >= 1; n--) {
      const t = model.getLineContent(n);
      if (t.trim() === "") continue;
      upIndent = countIndent(t);
      break;
    }
    let downIndent = -1;
    for (let n = position.lineNumber + 1; n <= model.getLineCount(); n++) {
      const t = model.getLineContent(n);
      if (t.trim() === "") continue;
      downIndent = countIndent(t);
      break;
    }

    if (upIndent >= 0 && downIndent >= 0) {
      // Одинаковый уровень — «между элементами того же блока»
      // Разный — «на границе», берём минимум (внешний блок)
      lineIndent = Math.min(upIndent, downIndent);
    } else if (upIndent >= 0) {
      lineIndent = upIndent;
    } else if (downIndent >= 0) {
      lineIndent = downIndent;
    } else {
      return null;
    }
  }

  // ── Top-level: контекст = ближайший top-level массив ─────────────
  if (lineIndent === 0) {
    for (let i = position.lineNumber - 1; i >= 1; i--) {
      const pl = model.getLineContent(i);
      if (!pl.trim() || pl.trim().startsWith("#")) continue;
      if (countIndent(pl) !== 0) continue;
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:\s*(#.*)?$/);
      if (m && TOP_LEVEL_ARRAYS[m[1]]) {
        return { context: TOP_LEVEL_ARRAYS[m[1]], indent: "  " };
      }
      break;
    }
    return null;
  }

  // ── Внутри массива: собираем цепочку контейнеров ────────────────
  const chain: Array<{ key: string; indent: number }> = [];
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = countIndent(line);
    if (ind >= lineIndent) continue;
    const m = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(?:#.*)?$/);
    if (m) {
      chain.unshift({ key: m[1], indent: ind });
      if (ind === 0) break;
    }
  }
  if (chain.length === 0) return null;

  // ── Ключевая проверка: indent должен совпадать с уровнем элемента
  //    самого глубокого контейнера. Иначе мы «между полями», а не
  //    «на уровне элемента», и сниппеты массива не нужны.
  const deepest = chain[chain.length - 1];
  const expectedItemIndent = deepest.indent + 2;
  const path = chain.map((c) => c.key).join(".");

  // Уровень элемента списка: `entityList`, `attribute`, `widget`, …
  if (lineIndent === expectedItemIndent) {
    const ctx = PATH_TO_CONTEXT[path];
    if (!ctx) return null;
    return { context: ctx, indent: " ".repeat(lineIndent) };
  }

  // Уровень полей верхнеуровневой сущности (`name`, `description`, `label`, …)
  if (path === "entities" && lineIndent === expectedItemIndent + 2) {
    return { context: "entity", indent: " ".repeat(lineIndent) };
  }

  return null;
}

export function registerSnippetsCompletion(monaco: any) {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider("yaml", {
    triggerCharacters: ["e", "r", "t", "w", "a", "n"],
    provideCompletionItems: (model: any, position: any) => {
      try {
        const hit = detectSnippetContext(model, position);
        if (!hit) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        const suggestions = SNIPPETS.filter(
          (sn) =>
            Array.isArray(sn.contexts) && sn.contexts.includes(hit.context),
        ).map((sn) => ({
          label: `✨ ${sn.prefix}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: prepareSnippetInsert(sn.body, hit.indent),
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          filterText: sn.prefix,
          sortText: "zzzz_" + sn.prefix,
          detail: sn.description,
          documentation: `Snippet: ${sn.description}`,
          range,
        }));

        return { suggestions };
      } catch (err) {
        console.warn("[snippets-completion] failed", err);
        return { suggestions: [] };
      }
    },
  });
}

function prepareSnippetInsert(body: string, indent: string): string {
  return body
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => (l ? indent + l : l))
    .join("\n");
}