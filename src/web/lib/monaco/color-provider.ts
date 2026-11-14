import type { ModelIndex } from "../../../shared/model-types";
import type { LineMap } from "../yaml/line-map";

interface ProviderContext {
  lineMap: LineMap | null;
  modelIndex: ModelIndex | null;
}

let colorCtx: CanvasRenderingContext2D | null = null;
function getColorContext() {
  if (colorCtx) return colorCtx;
  const canvas = document.createElement("canvas");
  colorCtx = canvas.getContext("2d");
  return colorCtx;
}

const colorCache = new Map<
  string,
  { red: number; green: number; blue: number; alpha: number } | null
>();

function parseColorToRGBA(
  str: string,
): { red: number; green: number; blue: number; alpha: number } | null {
  const s = str.trim();
  if (!s) return null;

  // Быстрый путь для HEX
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    if (hex.length === 4)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return { red: r, green: g, blue: b, alpha: 1 };
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return { red: r, green: g, blue: b, alpha: a };
    }
    return null;
  }

  // Остальное (rgb, rgba, hsl, named colors) через браузерный парсер
  const ctx = getColorContext();
  if (!ctx) return null;

  ctx.fillStyle = "#010101";
  ctx.fillStyle = s;
  const normalized = ctx.fillStyle;

  if (normalized === "#010101") return null; // невалидный цвет

  if (normalized.startsWith("#")) {
    return parseColorToRGBA(normalized);
  }

  if (normalized.startsWith("rgb")) {
    const m = normalized.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
    );
    if (m) {
      return {
        red: parseInt(m[1], 10) / 255,
        green: parseInt(m[2], 10) / 255,
        blue: parseInt(m[3], 10) / 255,
        alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }
  }

  return null;
}

function getCachedColor(str: string) {
  if (colorCache.has(str)) return colorCache.get(str)!;
  const result = parseColorToRGBA(str);
  colorCache.set(str, result);
  return result;
}

export function registerColorProvider(
  monaco: any,
  getCtx: () => ProviderContext,
) {
  monaco.languages.registerColorProvider("yaml", {
    provideDocumentColors: (model: any) => {
      const colors: any[] = [];
      const lineCount = model.getLineCount();

      const ctx = getCtx();
      const lineMap = ctx.lineMap;

      // Ищем "color:" в начале значения
      const colorRegex =
        /^(\s*)(?:-\s+)?color\s*:\s*(?:(['"])(.*?)\2|([^\s#]+))/;

      for (let i = 1; i <= lineCount; i++) {
        const lineText = model.getLineContent(i);
        const m = lineText.match(colorRegex);
        if (!m) continue;

        // Проверяем секцию
        const lineCtx = lineMap?.lineContexts.get(i);
        if (lineCtx && lineCtx.section !== "dataTypes") continue;

        // Проверяем, что мы находимся внутри view (enumView/workflowView/view)
        let isView = false;
        const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
        for (let j = i - 1; j >= 1; j--) {
          const txt = model.getLineContent(j);
          if (!txt.trim() || txt.trim().startsWith("#")) continue;
          const ind = (txt.match(/^(\s*)/) || ["", ""])[1].length;

          if (ind === 0) break;
          if (
            ind < currentIndent &&
            /^\s*(?:-\s+)?(?:enumView|workflowView|view)\s*:\s*$/.test(txt)
          ) {
            isView = true;
            break;
          }
        }
        if (!isView) continue;

        const quote = m[2];
        const value = quote ? m[3] : m[4];
        if (!value) continue;

        const color = getCachedColor(value);
        if (!color) continue;

        const valueStartInLine = lineText.indexOf(value);
        if (valueStartInLine < 0) continue;

        let startCol = valueStartInLine + 1;
        let endCol = startCol + value.length;

        if (quote) {
          startCol -= 1;
          endCol += 1;
        }

        colors.push({
          range: new monaco.Range(i, startCol, i, endCol),
          color: {
            red: color.red,
            green: color.green,
            blue: color.blue,
            alpha: color.alpha,
          },
        });
      }

      return colors;
    },

    provideColorPresentations: (model: any, colorInfo: any) => {
      const { red, green, blue, alpha } = colorInfo.color;

      const toHex = (c: number) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, "0");
      let hex = `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
      if (alpha < 1) {
        hex += toHex(alpha);
      }

      // Всегда оборачиваем в кавычки, чтобы YAML не воспринял # как комментарий
      return [
        {
          label: hex,
          textEdit: {
            range: colorInfo.range,
            text: `"${hex}"`,
          },
        },
      ];
    },
  });
}
