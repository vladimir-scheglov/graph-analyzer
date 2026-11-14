import { SNIPPETS } from "./monaco-providers";

let registered = false;

export function registerSnippetsCompletion(monaco: any) {
  if (registered) return;
  registered = true;

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

  function countIndent(line: string): number {
    let n = 0;
    for (const ch of line.match(/^(\s*)/)?.[1] || "") {
      n += ch === "\t" ? 2 : 1;
    }
    return n;
  }

  function detectSnippetContext(
    model: any,
    position: any,
  ): { context: string; indent: string } | null {
    const lineText = model.getLineContent(position.lineNumber);
    const beforeCursor = lineText.slice(0, position.column - 1);
    const trimmed = beforeCursor.trim();
    if (!/^[a-zA-Z_][\w]*$/.test(trimmed)) return null;

    let lineIndent = countIndent(lineText);

    // Виртуальный indent: если lineIndent = 0, смотрим на соседние строки —
    // если ближайший непустой сосед начинается с `- `, значит мы внутри массива
    if (lineIndent === 0) {
      for (let d = -1; d <= 1; d += 2) {
        let n = position.lineNumber + d;
        while (n >= 1 && n <= model.getLineCount()) {
          const t = model.getLineContent(n);
          if (t.trim() !== "") {
            if (/^\s*-\s+/.test(t)) lineIndent = countIndent(t);
            break;
          }
          n += d;
        }
        if (lineIndent > 0) break;
      }
    }

    if (lineIndent === 0) {
      // Top-level: находим вышестоящий `key:`
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

    // Внутри массива: собираем цепочку контейнеров
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

    const path = chain.map((c) => c.key).join(".");
    const map: Record<string, string> = {
      entities: "entity",
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
    const ctx = map[path];
    if (!ctx) return null;
    return {
      context: ctx,
      indent: " ".repeat(countIndent(lineText)),
    };
  }

  monaco.languages.registerCompletionItemProvider("yaml", {
    triggerCharacters: ["e", "r", "t", "w", "a", "n"],
    provideCompletionItems: (model: any, position: any) => {
      try {
        const hit = detectSnippetContext(model, position);
        if (!hit) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };

        const suggestions = SNIPPETS.filter(
          (sn) =>
            Array.isArray(sn.contexts) && sn.contexts.includes(hit.context),
        ).map((sn) => ({
          label: `✨ ${sn.prefix}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            "\n" +
            sn.body
              .split("\n")
              .map((l: string) => hit.indent + l)
              .join("\n") +
            "\n",
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
