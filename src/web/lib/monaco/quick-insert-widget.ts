import { SNIPPETS } from "./monaco-providers";

function countIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  if (!m) return 0;
  let count = 0;
  for (const ch of m[1]) {
    count += ch === "\t" ? 2 : 1;
  }
  return count;
}

function getQuickInsertContext(
  model: any,
  position: any,
): { context: string; indent: string } | null {
  const lineText = model.getLineContent(position.lineNumber);
  if (lineText.trim() !== "") return null;

  let cursorIndent = countIndent(lineText);

  // Если строка пустая (0 отступов), смотрим на соседние строки
  if (cursorIndent === 0) {
    // 1. Ищем следующую непустую строку. Если это элемент списка `- `, берем его отступ.
    let nextLineNum = position.lineNumber + 1;
    while (nextLineNum <= model.getLineCount()) {
      const nextText = model.getLineContent(nextLineNum);
      if (nextText.trim() !== "") {
        if (/^\s*-\s+/.test(nextText)) {
          cursorIndent = countIndent(nextText);
        }
        break;
      }
      nextLineNum++;
    }

    // 2. Если не нашли, смотрим предыдущую непустую строку.
    if (cursorIndent === 0) {
      let prevLineNum = position.lineNumber - 1;
      while (prevLineNum >= 1) {
        const prevText = model.getLineContent(prevLineNum);
        if (prevText.trim() !== "") {
          if (/^\s*-\s+/.test(prevText)) {
            cursorIndent = countIndent(prevText);
          }
          break;
        }
        prevLineNum--;
      }
    }
  }

  if (cursorIndent === 0) return null;

  // Собираем цепочку контейнеров
  const chain: Array<{ key: string; indent: number }> = [];
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = countIndent(line);

    // Нас интересуют только контейнеры, которые строго выше нашего отступа
    if (ind >= cursorIndent) continue;

    const m = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(?:#.*)?$/);
    if (m) {
      chain.unshift({ key: m[1], indent: ind });
      if (ind === 0) break;
    }
  }

  if (chain.length === 0) return null;

  const deepest = chain[chain.length - 1];
  const expectedItemIndent = deepest.indent + 2;

  if (cursorIndent !== expectedItemIndent) return null;

  const path = chain.map((c) => c.key).join(".");

  const map: Record<string, string> = {
    entities: "entityList",
    "entities.attributes": "attribute",
    linkages: "linkageList",
    "linkages.attributes": "linkageAttribute",
    "linkages.attributes.constraints": "attributeConstraint",
    "entities.attributes.constraints": "attributeConstraint",
    views: "viewList",
    "views.widgets": "widget",
    "views.groups": "group",
    "views.views": "viewNested",
    dataTypes: "dataTypeList",
    "dataTypes.values": "enumValue",
    "dataTypes.statuses": "workflowStatus",
    "dataTypes.transitions": "transition",
    actions: "actionList",
    dataRules: "dataRuleList",
    "dataRules.rule.attributes": "dataRuleAttributeAction",
    "dataRules.rule.linkages": "dataRuleLinkageAction",
    menus: "menuRootList",
    "menus.items": "menuItem",
    medias: "mediaList",
    uiRules: "uiRuleList",
    uiPresets: "uiPresetList",
    sequences: "sequenceList",
    mixins: "mixinList",
    trees: "treeList",
    transitiveLinkages: "transitiveLinkageList",
    "transitiveLinkages.joins": "transitiveJoin",
    counterColorPattern: "counterColorPattern",
    counterColorPatterns: "counterColorPattern",
    accessRules: "accessRule",
    permissions: "permission",
    localizations: "localization",
  };

  const ctx = map[path];
  if (!ctx) return null;

  const indentStr = " ".repeat(expectedItemIndent);
  return { context: ctx, indent: indentStr };
}

export function setupQuickInsertWidget(editor: any, monaco: any) {
  let timeout: any = null;
  let isMenuOpen = false;
  let currentSnippets: any[] = [];
  let currentIndent = "";
  let currentLine = -1;

  // Кнопка «+»
  const btnNode = document.createElement("div");
  btnNode.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  btnNode.title = "Добавить...";
  Object.assign(btnNode.style, {
    background: "var(--bg-750, #1e293b)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "4px",
    color: "var(--accent, #6366f1)",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    width: "20px",
    height: "20px",
    boxSizing: "border-box",
    transition: "background 0.15s, color 0.15s",
  });
  btnNode.addEventListener("mouseenter", () => {
    btnNode.style.background = "var(--bg-700, #334155)";
    btnNode.style.color = "var(--text-100, #f1f5f9)";
  });
  btnNode.addEventListener("mouseleave", () => {
    btnNode.style.background = "var(--bg-750, #1e293b)";
    btnNode.style.color = "var(--accent, #6366f1)";
  });
  btnNode.addEventListener("mousedown", (e) => e.stopPropagation());

  // Меню
  const menuNode = document.createElement("div");
  Object.assign(menuNode.style, {
    background: "var(--bg-800, #0d1424)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "6px",
    padding: "4px",
    fontSize: "12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    minWidth: "220px",
    zIndex: "1000",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "var(--text-200, #e2e8f0)",
    pointerEvents: "auto",
    display: "none",
    position: "absolute",
    top: "24px",
    left: "0",
  });
  menuNode.addEventListener("mousedown", (e) => e.stopPropagation());

  const domNode = document.createElement("div");
  Object.assign(domNode.style, { position: "relative", pointerEvents: "none" });
  domNode.appendChild(btnNode);
  domNode.appendChild(menuNode);

  const widget = {
    getId: () => "dg-quick-insert",
    getDomNode: () => domNode,
    getPosition: () => {
      if (currentSnippets.length === 0 || currentLine < 1) return null;
      return {
        position: { lineNumber: currentLine, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      };
    },
  };

  editor.addContentWidget(widget);

  const closeMenu = () => {
    if (!isMenuOpen) return;
    isMenuOpen = false;
    menuNode.style.display = "none";
    editor.layoutContentWidget(widget);
  };

    const insertSnippet = (snippet: any) => {
      closeMenu();
      const model = editor.getModel();
      if (!model) return;

      // Формируем текст сниппета с отступами
      const indented = snippet.body
        .split("\n")
        .map((l: string) => currentIndent + l)
        .join("\n");

      // Выделяем текущую строку целиком, чтобы заменить её
      const lineLen = model.getLineMaxColumn(currentLine);
      editor.setSelection(
        new monaco.Selection(currentLine, 1, currentLine, lineLen),
      );

      // Оборачиваем в пустые строки в начале и в конце
      const textToInsert = "\n" + indented + "\n";

      // Вставляем через snippetController2 (сохраняет табы ${1:...})
      const sc = editor.getContribution?.("snippetController2") as any;
      if (sc && typeof sc.insert === "function") {
        sc.insert(textToInsert);
        return;
      }

      // Fallback (если контроллер недоступен)
      const plain = textToInsert
        .replace(/\$\{\d+:([^}]*)\}/g, "$1")
        .replace(/\$\d+/g, "");
      editor.executeEdits("quick-insert", [
        {
          range: new monaco.Range(currentLine, 1, currentLine, lineLen),
          text: plain,
        },
      ]);
    };

  btnNode.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isMenuOpen) {
      closeMenu();
      return;
    }
    isMenuOpen = true;
    menuNode.style.display = "block";
    editor.layoutContentWidget(widget);
  });

  const onDocMouseDown = (e: MouseEvent) => {
    if (!isMenuOpen) return;
    if (domNode.contains(e.target as Node)) return;
    closeMenu();
  };
  document.addEventListener("mousedown", onDocMouseDown, true);

  const updateWidget = () => {
    if (isMenuOpen) return;

    const position = editor.getPosition();
    const model = editor.getModel();
    if (!position || !model) return;

    const hit = getQuickInsertContext(model, position);
    const available = hit
      ? SNIPPETS.filter((s) => s.contexts.includes(hit.context))
      : [];

    if (available.length === 0) {
      currentSnippets = [];
      currentLine = -1;
      editor.layoutContentWidget(widget);
      return;
    }

    currentSnippets = available;
    currentIndent = hit!.indent;
    currentLine = position.lineNumber;

    menuNode.innerHTML = "";
    available.forEach((sn) => {
      const item = document.createElement("div");
      item.textContent = sn.description;
      Object.assign(item.style, {
        padding: "6px 10px",
        cursor: "pointer",
        borderRadius: "4px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--bg-700, #334155)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        insertSnippet(sn);
      });
      menuNode.appendChild(item);
    });

    editor.layoutContentWidget(widget);
  };

  const scheduleUpdate = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(updateWidget, 100);
  };

  const cursorSub = editor.onDidChangeCursorPosition(scheduleUpdate);
  const contentSub = editor.onDidChangeModelContent(scheduleUpdate);

  updateWidget();

  return () => {
    if (timeout) clearTimeout(timeout);
    cursorSub.dispose();
    contentSub.dispose();
    document.removeEventListener("mousedown", onDocMouseDown, true);
    editor.removeContentWidget(widget);
  };
}
