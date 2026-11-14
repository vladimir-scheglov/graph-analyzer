import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Icons } from "../../rui-icons/";

const iconCache = new Map<string, string>();

function getIconSvg(name: string): string | null {
  const key = Object.keys(Icons).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) return null;
  if (iconCache.has(key)) return iconCache.get(key)!;

  try {
    const Icon = Icons[key as keyof typeof Icons];
    const svg = renderToStaticMarkup(
      React.createElement(Icon),
    );
    iconCache.set(key, svg);
    return svg;
  } catch {
    return null;
  }
}

/**
 * Парсит текущий документ YAML, извлекая id → iconName
 * из секции medias. Нужно для резолва `icon: <mediaId>`.
 */
function parseMedias(model: any): Map<string, string> {
  const medias = new Map<string, string>();
  const lines = model.getValue().split("\n");
  let inMedias = false;
  let mediasIndent = -1;
  let currentId: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    if (ind === 0) {
      const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sm) {
        inMedias = sm[1] === "medias";
        mediasIndent = -1;
        currentId = null;
      }
      continue;
    }

    if (!inMedias) continue;

    const dashId = line.match(/^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/);
    if (dashId) {
      if (mediasIndent < 0) mediasIndent = dashId[1].length;
      if (dashId[1].length === mediasIndent) {
        currentId = dashId[2];
        continue;
      }
    }

    if (currentId) {
      const iconNameM = line.match(/^\s*iconName\s*:\s*["']?([^\s"'#]+)["']?/);
      if (iconNameM) {
        medias.set(currentId, iconNameM[1]);
        currentId = null;
      }
    }
  }
  return medias;
}

interface IconWidgetInfo {
  line: number;
  column: number;
  iconName: string;
}

function findIconWidgets(
  model: any,
  getCtx: () => { modelIndex: any },
): IconWidgetInfo[] {
  const result: IconWidgetInfo[] = [];
  const lines = model.getValue().split("\n");
  const medias = parseMedias(model);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Ищем `iconName:` или `icon:`
    const match = line.match(
      /^(\s*)(?:-\s+)?(iconName|icon)\s*:\s*(["']?)([^\s"'#]+)\3/,
    );
    if (!match) continue;

    const field = match[2] as "iconName" | "icon";
    const value = match[4];
    const valueStart = line.indexOf(value, match[1].length);
    // 1-based позиция сразу ПОСЛЕ значения
    const column = valueStart + value.length + 1;

    let resolvedIconName: string | null = null;

    if (field === "iconName") {
      resolvedIconName = value;
    } else if (field === "icon") {
      resolvedIconName = medias.get(value) || null;
      if (!resolvedIconName) {
        const ctx = getCtx();
        const media = ctx.modelIndex?.medias?.find((m: any) => m.id === value);
        if (media && media.iconName) resolvedIconName = media.iconName;
      }
    }

    if (!resolvedIconName) continue;

    result.push({
      line: i + 1,
      column,
      iconName: resolvedIconName,
    });
  }

  return result;
}

export function setupIconWidgets(
  editor: any,
  monaco: any,
  getCtx: () => { modelIndex: any },
) {
  let widgets: any[] = [];
  let timeout: any = null;

  const updateWidgets = () => {
    for (const w of widgets) {
      editor.removeContentWidget(w);
    }
    widgets = [];

    const model = editor.getModel();
    if (!model) return;

    const infos = findIconWidgets(model, getCtx);
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const svg = getIconSvg(info.iconName);
      if (!svg) continue;

      const domNode = document.createElement("span");
      domNode.innerHTML = svg;
      Object.assign(domNode.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px",
        marginLeft: "6px",
        marginTop: "1px",
        pointerEvents: "none",
        color: "var(--text-300, #cbd5e1)",
        opacity: "0.9",
      });

      const widget = {
        getId: () => `dg-icon-${i}-${info.line}`,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: info.line, column: info.column },
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      };
      editor.addContentWidget(widget);
      widgets.push(widget);
    }
  };

  const scheduleUpdate = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(updateWidgets, 500);
  };

  const contentSub = editor.onDidChangeModelContent(scheduleUpdate);
  const modelSub = editor.onDidChangeModel(scheduleUpdate);

  // Первичный рендер
  updateWidgets();

  return () => {
    if (timeout) clearTimeout(timeout);
    contentSub.dispose();
    modelSub.dispose();
    for (const w of widgets) {
      editor.removeContentWidget(w);
    }
  };
}
