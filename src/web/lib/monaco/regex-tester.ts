interface RegexHit {
  pattern: string;
  blockStart: number;
  blockEnd: number;
  regexpLine: number;
  dashColumn: number;
}

function findConstraintsBlock(
  model: any,
  lineNumber: number,
): { start: number; end: number; lines: number[] } | null {
  const startText = model.getLineContent(lineNumber);
  let boundary = (startText.match(/^(\s*)/) || ["", ""])[1].length + 1;

  let constraintsLine = -1;
  let constraintsIndent = -1;

  for (let i = lineNumber - 1; i >= 1; i--) {
    const txt = model.getLineContent(i);
    if (!txt.trim() || txt.trim().startsWith("#")) continue;
    const ind = (txt.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind >= boundary) continue;

    const isDash = /^\s*-\s/.test(txt);

    if (/^\s*(?:-\s+)?constraints\s*:\s*(?:#.*)?$/.test(txt)) {
      constraintsLine = i;
      constraintsIndent = ind;
      break;
    }
    if (ind === 0) break;

    boundary = isDash ? ind + 1 : ind;
  }
  if (constraintsLine < 0) return null;

  const lineCount = model.getLineCount();
  let itemIndent = -1;
  const itemStarts: number[] = [];
  let blockEnd = -1;

  for (let i = constraintsLine + 1; i <= lineCount; i++) {
    const txt = model.getLineContent(i);
    if (!txt.trim() || txt.trim().startsWith("#")) continue;
    const ind = (txt.match(/^(\s*)/) || ["", ""])[1].length;
    const isDash = /^\s*-\s/.test(txt);

    if (itemIndent < 0) {
      if (isDash && ind >= constraintsIndent) {
        itemIndent = ind;
        itemStarts.push(i);
        blockEnd = i;
        continue;
      }
      break;
    }

    if (ind < itemIndent) break;
    if (ind === itemIndent && !isDash) break;

    if (isDash && ind === itemIndent) itemStarts.push(i);
    blockEnd = i;
  }

  if (itemStarts.length === 0) return null;

  let itemStart = -1;
  let itemEnd = blockEnd;
  for (let k = 0; k < itemStarts.length; k++) {
    const start = itemStarts[k];
    const end = k + 1 < itemStarts.length ? itemStarts[k + 1] - 1 : blockEnd;
    if (lineNumber >= start && lineNumber <= end) {
      itemStart = start;
      itemEnd = end;
      break;
    }
  }
  if (itemStart < 0) return null;

  const lines: number[] = [];
  for (let i = itemStart; i <= itemEnd; i++) {
    const txt = model.getLineContent(i);
    if (!txt.trim() || txt.trim().startsWith("#")) continue;
    lines.push(i);
  }
  return { start: itemStart, end: itemEnd, lines };
}

function parseRegexpValue(lineText: string): string | null {
  const m = lineText.match(/^\s*(?:-\s+)?regexp\s*:\s*(.*)$/);
  if (!m) return null;
  let v = m[1].trim();

  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1);
    return v || null;
  }

  const hashIdx = v.indexOf(" #");
  if (hashIdx > 0) v = v.slice(0, hashIdx).trim();

  return v || null;
}

function findRegexpAtCursor(model: any, lineNumber: number): RegexHit | null {
  const block = findConstraintsBlock(model, lineNumber);
  if (!block) return null;

  const hasKindRegexp = block.lines.some((ln) => {
    const t = model.getLineContent(ln);
    return /^\s*(?:-\s+)?kind\s*:\s*["']?regexp["']?\s*(?:#.*)?$/.test(t);
  });
  if (!hasKindRegexp) return null;

  for (const ln of block.lines) {
    const t = model.getLineContent(ln);
    if (!/^\s*(?:-\s+)?regexp\s*:/.test(t)) continue;
    const pattern = parseRegexpValue(t);
    if (pattern) {
      const startLineText = model.getLineContent(block.start);
      // Находим колонку дефиса
      const dashIndex = startLineText.indexOf("-");
      const dashColumn = dashIndex >= 0 ? dashIndex + 1 : 1;

      return {
        pattern,
        blockStart: block.start,
        blockEnd: block.end,
        regexpLine: ln,
        dashColumn,
      };
    }
  }
  return null;
}

export function setupRegexTester(editor: any, monaco: any): () => void {
  // ── Панель ───────────────────────────────────────────────────────
  const panelNode = document.createElement("div");
  Object.assign(panelNode.style, {
    background: "var(--bg-800, #0d1424)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "6px",
    padding: "8px 10px",
    fontSize: "12px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    minWidth: "340px",
    maxWidth: "520px",
    zIndex: "1000",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "var(--text-200, #e2e8f0)",
    pointerEvents: "auto",
  });
  panelNode.addEventListener("mousedown", (e) => e.stopPropagation());

  const header = document.createElement("div");
  header.innerHTML =
    'Regex-тестер <span style="opacity:0.55;font-weight:400;text-transform:none;letter-spacing:0">(Esc — свернуть)</span>';
  Object.assign(header.style, {
    fontWeight: "600",
    marginBottom: "6px",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    color: "var(--text-400, #94a3b8)",
  });

  const patternRow = document.createElement("div");
  Object.assign(patternRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "6px",
  });

  const patternLabel = document.createElement("span");
  patternLabel.textContent = "pattern:";
  Object.assign(patternLabel.style, {
    fontSize: "11px",
    color: "var(--text-400, #94a3b8)",
    flexShrink: "0",
  });

  const patternCode = document.createElement("code");
  Object.assign(patternCode.style, {
    background: "var(--bg-750, #1e293b)",
    padding: "2px 6px",
    borderRadius: "3px",
    fontSize: "11px",
    fontFamily: "JetBrains Mono, Monaco, monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: "1",
    minWidth: "0",
  });

  patternRow.appendChild(patternLabel);
  patternRow.appendChild(patternCode);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Строка для проверки...";
  Object.assign(input.style, {
    width: "100%",
    boxSizing: "border-box",
    padding: "4px 8px",
    background: "var(--bg-900, #0a0f1a)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "4px",
    color: "var(--text-100, #f1f5f9)",
    fontSize: "12px",
    fontFamily: "JetBrains Mono, Monaco, monospace",
    outline: "none",
  });
  input.addEventListener("focus", () => {
    input.style.borderColor = "var(--accent, #6366f1)";
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = "var(--border, #334155)";
  });

  const result = document.createElement("div");
  Object.assign(result.style, {
    marginTop: "6px",
    fontSize: "11px",
    fontFamily: "JetBrains Mono, Monaco, monospace",
    minHeight: "14px",
    color: "var(--text-400, #94a3b8)",
  });

  panelNode.appendChild(header);
  panelNode.appendChild(patternRow);
  panelNode.appendChild(input);
  panelNode.appendChild(result);

  // ── Кнопка (иконка) ──────────────────────────────────────────────
  const buttonNode = document.createElement("div");
  buttonNode.textContent = ".*";
  buttonNode.title = "Открыть Regex-тестер";

  Object.assign(buttonNode.style, {
    background: "var(--bg-750, #1e293b)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "4px",
    color: "var(--accent, #6366f1)", // Выделяем цветом, чтобы было похоже на иконку
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    width: "24px",
    height: "20px",
    boxSizing: "border-box",
    fontFamily: "JetBrains Mono, Monaco, monospace",
    fontSize: "14px",
    fontWeight: "bold",
    // Смещаем влево на 100% (правый край по дефису) и чуть вверх для красоты
    transform: "translateX(-100%) translateY(-2px)",
    transition: "background 0.15s, color 0.15s",
  });

  buttonNode.addEventListener("mouseenter", () => {
    buttonNode.style.background = "var(--bg-700, #334155)";
    buttonNode.style.color = "var(--text-100, #f1f5f9)";
  });
  buttonNode.addEventListener("mouseleave", () => {
    buttonNode.style.background = "var(--bg-750, #1e293b)";
    buttonNode.style.color = "var(--accent, #6366f1)";
  });
  buttonNode.addEventListener("mousedown", (e) => e.stopPropagation());

  // ── Состояние ────────────────────────────────────────────────────
  let currentPattern = "";
  let currentBlockStart = 0;
  let currentBlockEnd = 0;
  let currentRegexpLine = 0;
  let currentDashColumn = 0;
  let isExpanded = false;
  let lastLayoutKey = "";
  let isUpdating = false;

  const testPattern = () => {
    result.textContent = "";
    result.style.color = "var(--text-400, #94a3b8)";
    if (!currentPattern) return;

    let reCI: RegExp;
    try {
      reCI = new RegExp(currentPattern, "i");
    } catch (e: any) {
      result.textContent = "❌ Ошибка в regex: " + (e?.message || String(e));
      result.style.color = "#ef4444";
      return;
    }

    const value = input.value;
    if (!value) {
      result.textContent = "Введите строку для проверки";
      result.style.color = "var(--text-500, #64748b)";
      return;
    }

    const matchesCI = reCI.test(value);
    let matchesCS: boolean | null = null;
    try {
      matchesCS = new RegExp(currentPattern).test(value);
    } catch {
      matchesCS = null;
    }

    const ciSpan = document.createElement("span");
    ciSpan.textContent = (matchesCI ? "✅" : "❌") + " без регистра";
    ciSpan.style.color = matchesCI ? "#10b981" : "#ef4444";
    result.appendChild(ciSpan);

    if (matchesCS !== null && matchesCS !== matchesCI) {
      const sep = document.createElement("span");
      sep.textContent = "  ·  ";
      sep.style.color = "var(--text-500, #64748b)";
      result.appendChild(sep);

      const csSpan = document.createElement("span");
      csSpan.textContent = (matchesCS ? "✅" : "❌") + " с регистром";
      csSpan.style.color = matchesCS ? "#10b981" : "#ef4444";
      result.appendChild(csSpan);
    }
  };

  input.addEventListener("input", testPattern);

  const panelWidget = {
    getId: () => "dg-regex-tester-panel",
    getDomNode: () => panelNode,
    getPosition: () => {
      if (!isExpanded || !currentPattern || !currentBlockEnd) return null;
      return {
        position: { lineNumber: currentBlockEnd, column: currentDashColumn + 1},
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      };
    },
  };

  const buttonWidget = {
    getId: () => "dg-regex-tester-button",
    getDomNode: () => buttonNode,
    getPosition: () => {
      if (isExpanded || !currentPattern || !currentBlockStart) return null;
      return {
        position: { lineNumber: currentBlockStart, column: currentDashColumn },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      };
    },
  };

  editor.addContentWidget(panelWidget);
  editor.addContentWidget(buttonWidget);

  const relayoutBoth = () => {
    editor.layoutContentWidget(panelWidget);
    editor.layoutContentWidget(buttonWidget);
  };

  const collapseToButton = () => {
    if (!isExpanded) return;
    isExpanded = false;
    lastLayoutKey = "";
    relayoutBoth();
    editor.focus();
  };

  const expandToPanel = () => {
    if (isExpanded || !currentPattern) return;
    isExpanded = true;
    lastLayoutKey = "";
    relayoutBoth();
    setTimeout(() => input.focus(), 0);
  };

  buttonNode.addEventListener("click", expandToPanel);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      collapseToButton();
      return;
    }
    e.stopPropagation();
  });

  const editorKeySub = editor.onKeyDown((e: any) => {
    if (e.keyCode !== monaco.KeyCode.Escape) return;
    if (!isExpanded) return;

    const sw = document.querySelector(".suggest-widget") as HTMLElement | null;
    if (
      sw &&
      sw.classList.contains("visible") &&
      sw.querySelectorAll(".monaco-list-row").length > 0
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    collapseToButton();
  });

  const updateFromCursor = () => {
    if (isUpdating) return;
    isUpdating = true;
    try {
      const position = editor.getPosition();
      const model = editor.getModel();

      if (!position || !model) {
        if (currentPattern) {
          currentPattern = "";
          currentBlockStart = 0;
          currentBlockEnd = 0;
          currentRegexpLine = 0;
          currentDashColumn = 0;
          isExpanded = false;
          lastLayoutKey = "";
          relayoutBoth();
        }
        return;
      }

      const hit = findRegexpAtCursor(model, position.lineNumber);

      if (!hit) {
        if (currentPattern) {
          currentPattern = "";
          currentBlockStart = 0;
          currentBlockEnd = 0;
          currentRegexpLine = 0;
          currentDashColumn = 0;
          isExpanded = false;
          lastLayoutKey = "";
          relayoutBoth();
        }
        return;
      }

      // Перешли в другой constraint — сворачиваем панель до кнопки
      if (currentBlockStart !== 0 && hit.blockStart !== currentBlockStart) {
        isExpanded = false;
      }

      if (hit.pattern !== currentPattern) {
        currentPattern = hit.pattern;
        patternCode.textContent = currentPattern;
        patternCode.title = currentPattern;
        testPattern();
      }

      currentBlockStart = hit.blockStart;
      currentBlockEnd = hit.blockEnd;
      currentRegexpLine = hit.regexpLine;
      currentDashColumn = hit.dashColumn;

      const key = `${currentBlockStart}|${currentBlockEnd}|${currentRegexpLine}|${currentDashColumn}|${isExpanded}|${currentPattern}`;
      if (key !== lastLayoutKey) {
        lastLayoutKey = key;
        relayoutBoth();
      }
    } finally {
      isUpdating = false;
    }
  };

  const cursorSub = editor.onDidChangeCursorPosition(updateFromCursor);
  const contentSub = editor.onDidChangeModelContent(updateFromCursor);

  updateFromCursor();

  return () => {
    try {
      cursorSub?.dispose?.();
    } catch {}
    try {
      contentSub?.dispose?.();
    } catch {}
    try {
      editorKeySub?.dispose?.();
    } catch {}
    try {
      editor.removeContentWidget(panelWidget);
    } catch {}
    try {
      editor.removeContentWidget(buttonWidget);
    } catch {}
  };
}
