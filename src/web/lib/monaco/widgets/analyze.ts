import { detectContextAtPosition } from "../monaco-providers";
import type { LineMap } from "../../yaml/line-map";
import type { WidgetContext } from "./types";

function getSectionAt(model: any, line: number): string {
  for (let i = line; i >= 1; i--) {
    const t = model.getLineContent(i);
    if (!t.trim() || t.trim().startsWith("#")) continue;
    const m = t.match(/^([a-zA-Z_][\w]*)\s*:/);
    if (m && !t.startsWith(" ")) return m[1];
  }
  return "";
}

function getBlockBounds(model: any, line: number, indent: number): number[] {
  const lineText = model.getLineContent(line);
  const isDash = /^\s*-\s+\S/.test(lineText);

  const isSibling = (t: string): boolean => {
    if (!t.trim()) return false;
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind !== indent) return false;
    if (isDash) return /^\s*-\s+\S/.test(t);
    return true;
  };

  let start = line;
  for (let i = line - 1; i >= 1; i--) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    if (isSibling(t)) {
      start = i + 1;
      break;
    }
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < indent) {
      start = i + 1;
      break;
    }
  }

  let end = line;
  for (let i = line + 1; i <= model.getLineCount(); i++) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    if (isSibling(t)) {
      end = i - 1;
      break;
    }
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < indent) {
      end = i - 1;
      break;
    }
    end = i;
  }

  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export function analyzeLineAtCursor(
  model: any,
  position: any,
  index: any,
  lineMap: LineMap | null,
  currentDomain: string,
): WidgetContext {
  const line = position.lineNumber;
  const lineText = model.getLineContent(line);
  const currentIndent = lineText.match(/^(\s*)/)?.[1] || "";
  const section = getSectionAt(model, line);

  let ctx: string | null = null;
  try {
    ctx = detectContextAtPosition(
      model,
      position,
      lineMap?.lineContexts || new Map(),
    );
  } catch {
    /* ignore */
  }

  const lineCtx = lineMap?.lineContexts.get(line);
  const entityCrumb = lineCtx?.breadcrumbs?.find(
    (b: any) => b.type === "entity",
  );
  const attrCrumb = lineCtx?.breadcrumbs?.find(
    (b: any) => b.type === "attribute",
  );

  let entity: any = null;
  let attribute: any = null;
  if (index && entityCrumb) {
    entity =
      index.entitiesByFqid[`${currentDomain}/${entityCrumb.id}`.toLowerCase()];
  }
  if (entity && attrCrumb) {
    let e: any = entity;
    const seen = new Set<string>();
    while (e && !seen.has(e.fqid)) {
      seen.add(e.fqid);
      const a = e.attributes.find((x: any) => x.id === attrCrumb.id);
      if (a) {
        attribute = a;
        break;
      }
      e = e.inherits ? index.entitiesByFqid[e.inherits] : undefined;
    }
  }

  const fm = lineText.match(
    /^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*?)\s*(?:#.*)?$/,
  );

  return {
    model,
    position,
    lineMap,
    index,
    currentDomain,
    section,
    context: ctx,
    currentIndent,
    currentLine: line,
    blockLines: getBlockBounds(model, line, currentIndent.length),
    fieldName: fm ? fm[1] : null,
    fieldValue: fm ? fm[2] : null,
    entity,
    attribute,
  };
}
