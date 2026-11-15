import type { WidgetContext, WidgetDef, WidgetAction } from "./types";
import { analyzeLineAtCursor } from "./analyze";

export interface WidgetHostOptions {
  getIndex: () => any;
  getLineMap: () => any;
  getDomain: () => string;
}

export function setupWidgetHost(
  editor: any,
  monaco: any,
  defs: WidgetDef[],
  opts: WidgetHostOptions,
) {
  let timeout: any = null;
  let currentActions: WidgetAction[] = [];
  let currentCtx: WidgetContext | null = null;
  let currentLine = -1;
  let dismissedKey: string | null = null;

  const currentKey = () => {
    const pos = editor.getPosition();
    const model = editor.getModel();
    if (!pos || !model) return "";
    return `${pos.lineNumber}:${model.getVersionId()}`;
  };

  // ── Панель ──
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    display: "inline-flex",
    flexWrap: "wrap",
    gap: "2px",
    maxWidth: "min(90vw, 640px)",
    padding: "2px",
    background: "var(--bg-800, #0d1424)",
    border: "1px solid var(--border, #334155)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "11px",
    userSelect: "none",
  });
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  const widget = {
    getId: () => "dg-widget-host",
    getDomNode: () => panel,
    getPosition: () => {
      if (currentActions.length === 0 || currentLine < 1) return null;
      return {
        position: { lineNumber: currentLine, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      };
    },
  };
  editor.addContentWidget(widget);

  const render = () => {
    panel.innerHTML = "";
    if (currentActions.length === 0) {
      editor.layoutContentWidget(widget);
      return;
    }
    for (const a of currentActions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = a.hint || a.label;
      Object.assign(btn.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 8px",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: "4px",
        color: "var(--text-200, #e2e8f0)",
        cursor: "pointer",
        fontSize: "11px",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      });
      if (a.icon) {
        const ic = document.createElement("span");
        ic.className = "material-symbols-outlined";
        ic.style.fontSize = "14px";
        ic.style.lineHeight = "1";
        ic.textContent = a.icon;
        btn.appendChild(ic);
      }
      const txt = document.createElement("span");
      txt.textContent = a.label;
      btn.appendChild(txt);
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "var(--bg-700, #334155)";
        btn.style.borderColor = "var(--border, #334155)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
        btn.style.borderColor = "transparent";
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentCtx) {
          try {
            a.run(currentCtx, editor, monaco);
          } catch (err) {
            console.warn("[widget] action failed", a.id, err);
          }
        }
      });
      panel.appendChild(btn);
    }
    editor.layoutContentWidget(widget);
  };

  const update = () => {
    try {
      if (dismissedKey) {
        if (dismissedKey === currentKey()) {
          if (currentActions.length > 0) {
            currentActions = [];
            currentCtx = null;
            currentLine = -1;
            render();
          }
          return;
        }
        dismissedKey = null;
      }

      const position = editor.getPosition();
      const model = editor.getModel();
      if (!position || !model) {
        currentActions = [];
        currentLine = -1;
        render();
        return;
      }
      const ctx = analyzeLineAtCursor(
        model,
        position,
        opts.getIndex(),
        opts.getLineMap(),
        opts.getDomain(),
      );

      // Собираем actions от всех виджетов, берём самый приоритетный непустой.
      // Остальные присоединяем, если тот же приоритет (группируем).
      const ranked = defs
        .map((d) => ({ def: d, acts: d.getActions(ctx) }))
        .filter((x) => x.acts.length > 0)
        .sort((a, b) => b.def.priority - a.def.priority);

      if (ranked.length === 0) {
        currentActions = [];
        currentCtx = null;
        currentLine = -1;
        render();
        return;
      }

      currentActions = ranked[0].acts;
      currentCtx = ctx;
      currentLine = position.lineNumber;
      render();
    } catch (err) {
      console.warn("[widget-host] update failed", err);
    }
  };

  const schedule = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(update, 120);
  };

  const cursorSub = editor.onDidChangeCursorPosition(schedule);
  const modelSub = editor.onDidChangeModelContent(schedule);

  editor.addCommand(monaco.KeyCode.Escape, () => {
    if (currentActions.length === 0) return;

    // Не трогаем Esc, если открыт suggest или find
    const sw = document.querySelector(".suggest-widget") as HTMLElement | null;
    if (
      sw &&
      sw.classList.contains("visible") &&
      sw.querySelectorAll(".monaco-list-row").length > 0
    )
      return;
    if (document.querySelector(".find-widget.visible")) return;

    dismissedKey = currentKey();
    currentActions = [];
    currentCtx = null;
    currentLine = -1;
    render();
    editor.focus();
  });

  update();

  return () => {
    if (timeout) clearTimeout(timeout);
    cursorSub.dispose();
    modelSub.dispose();
    editor.removeContentWidget(widget);
  };
}
