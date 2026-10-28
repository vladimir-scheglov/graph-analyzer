import type { LineMap, NavNode } from "./line-map";
import { SYSTEM_ATTRIBUTE_IDS } from "../../../core/analyzer/linter";

export interface UnusedNestedView {
  id: string;
  startLine: number; // 1-based
  endLine: number; // 1-based, inclusive
}

export interface UnusedAnalysis {
  entities: Set<string>;
  attributes: Set<string>;
  dataTypes: Set<string>;
  actions: Set<string>;
  sequences: Set<string>;
  medias: Set<string>;
  trees: Set<string>;
  counterColorPatterns: Set<string>;
  uiPresets: Set<string>;
  permissions: Set<string>;
  transitiveLinkages: Set<string>;
  nestedViews: UnusedNestedView[];
}

const WORD_RE = /[a-zA-Z_][a-zA-Z0-9_.@:$/#-]*/g;
const DEF_ID_RE = /^\s*-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;

function normalizeToken(raw: string): string {
  return raw.replace(/[.,;:?!]+$/, "");
}

function emptyAnalysis(): UnusedAnalysis {
  return {
    entities: new Set(),
    attributes: new Set(),
    dataTypes: new Set(),
    actions: new Set(),
    sequences: new Set(),
    medias: new Set(),
    trees: new Set(),
    counterColorPatterns: new Set(),
    uiPresets: new Set(),
    permissions: new Set(),
    transitiveLinkages: new Set(),
    nestedViews: [],
  };
}

/**
 * Плоский section-level аналайзер: id, у которого `total ≤ defs` → unused.
 * Работает для любой секции, где id — токен (dataTypes, actions, sequences, …).
 */
function unusedIdsInSection(
  lineMap: LineMap,
  sectionKey: string,
  wordCounts: Map<string, number>,
  defCounts: Map<string, number>,
): Set<string> {
  const result = new Set<string>();
  const section = lineMap.sections.find((s) => s.key === sectionKey);
  if (!section) return result;

  for (const node of section.nodes) {
    const id = node.id;
    if (!id) continue;
    const total = wordCounts.get(id) || 0;
    const defs = defCounts.get(id) || 0;
    if (total <= defs) result.add(id);
  }
  return result;
}

function unusedTransitiveLinkages(
  lineMap: LineMap,
  wordCounts: Map<string, number>,
  defCounts: Map<string, number>,
): Set<string> {
  const result = new Set<string>();
  const section = lineMap.sections.find((s) => s.key === "transitiveLinkages");
  if (!section) return result;

  const collectAllIds = (node: NavNode): string[] => {
    const acc: string[] = [];
    const walk = (n: NavNode) => {
      if (n.id) acc.push(n.id);
      if (n.children) for (const c of n.children) walk(c);
    };
    walk(node);
    return acc;
  };

  for (const treeNode of section.nodes) {
    const treeId = treeNode.id;
    if (!treeId) continue;

    const allIds = collectAllIds(treeNode);
    const used = allIds.some((id) => {
      const total = wordCounts.get(id) || 0;
      const defs = defCounts.get(id) || 0;
      return total > defs;
    });
    if (!used) result.add(treeId);
  }
  return result;
}

export function computeUnusedInYaml(
  content: string,
  lineMap: LineMap,
): UnusedAnalysis {
  const result = emptyAnalysis();
  if (!content) return result;

  const text = content.replace(/#[^\n]*/g, "");

  const wordCounts = new Map<string, number>();
  for (const m of text.matchAll(WORD_RE)) {
    const w = normalizeToken(m[0]);
    if (!w) continue;
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);

    // FQID-ссылки: <domain>/<localId> или <domain>/<Entity>.<attr>
    // Учитываем локальный суффикс отдельным счётчиком, чтобы элементы,
    // на которые ссылаются через FQID, не попадали в unused.
    const slash = w.lastIndexOf("/");
    if (slash > 0 && slash < w.length - 1) {
      const localId = w.slice(slash + 1);
      if (localId) {
        wordCounts.set(localId, (wordCounts.get(localId) || 0) + 1);

        // <domain>/<Entity>.<attr> — добавляем и последний сегмент после точки.
        // Порог >= 2, чтобы не считать одиночные буквы.
        const dot = localId.lastIndexOf(".");
        if (dot > 0 && dot < localId.length - 1) {
          const attrPart = localId.slice(dot + 1);
          if (attrPart.length >= 2) {
            wordCounts.set(attrPart, (wordCounts.get(attrPart) || 0) + 1);
          }
        }
      }
    }
  }
  
  const defCounts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = line.match(DEF_ID_RE);
    if (!m) continue;
    defCounts.set(m[1], (defCounts.get(m[1]) || 0) + 1);
  }

  // ── entities + attributes (existing logic) ──
  const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
  if (entitiesSection) {
    // ── 1. Initial pass (existing) ──
    const initialUnusedOriginal = new Set<string>();
    for (const entityNode of entitiesSection.nodes) {
      const id = entityNode.id;
      const total = wordCounts.get(id) || 0;
      const defs = defCounts.get(id) || 0;
      if (total <= defs) initialUnusedOriginal.add(id);

      // Атрибуты — как было
      for (const attrNode of entityNode.children || []) {
        if (attrNode.type !== "attribute") continue;
        if (SYSTEM_ATTRIBUTE_IDS.has(attrNode.id)) continue;
        const aTotal = wordCounts.get(attrNode.id) || 0;
        const aDefs = defCounts.get(attrNode.id) || 0;
        if (aTotal <= aDefs) {
          result.attributes.add(
            `${id.toLowerCase()}:${attrNode.id.toLowerCase()}`,
          );
        }
      }
    }

    // ── 2. Fixpoint по inherits ──
    const expanded = fixpointUnusedByInherits(
      content,
      entitiesSection,
      initialUnusedOriginal,
      wordCounts,
      defCounts,
    );
    result.entities = new Set(Array.from(expanded).map((s) => s.toLowerCase()));
  }

  // ── block-level ──
  result.dataTypes = unusedIdsInSection(
    lineMap,
    "dataTypes",
    wordCounts,
    defCounts,
  );
  result.actions = unusedIdsInSection(
    lineMap,
    "actions",
    wordCounts,
    defCounts,
  );
  result.sequences = unusedIdsInSection(
    lineMap,
    "sequences",
    wordCounts,
    defCounts,
  );
  result.medias = unusedIdsInSection(lineMap, "medias", wordCounts, defCounts);
  result.trees = unusedIdsInSection(lineMap, "trees", wordCounts, defCounts);
  result.counterColorPatterns = unusedIdsInSection(
    lineMap,
    "counterColorPattern",
    wordCounts,
    defCounts,
  );
  result.uiPresets = unusedIdsInSection(
    lineMap,
    "uiPresets",
    wordCounts,
    defCounts,
  );
  result.permissions = unusedIdsInSection(
    lineMap,
    "permissions",
    wordCounts,
    defCounts,
  );
  result.transitiveLinkages = unusedTransitiveLinkages(
    lineMap,
    wordCounts,
    defCounts,
  );
  result.nestedViews = unusedNestedViews(content, wordCounts, defCounts);

  return result;
}

function unusedNestedViews(
  content: string,
  wordCounts: Map<string, number>,
  defCounts: Map<string, number>,
): UnusedNestedView[] {
  const result: UnusedNestedView[] = [];
  const lines = content.split("\n");
  const idRe = /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;

  let inViews = false;
  let topIndent = -1;

  // Открытые nested-элементы — закрываем, когда встречаем `- id:`
  // с indent ≤ их indent, либо конец секции.
  let open: Array<{
    id: string;
    startLine: number;
    indent: number;
    type: string | null;
  }> = [];

  const finalize = (upToLine: number) => {
    for (const o of open) {
      const isTargetType =
        o.type === "panel" || o.type === "modal" || o.type === "page";
      if (!isTargetType) continue;
      const total = wordCounts.get(o.id) || 0;
      const defs = defCounts.get(o.id) || 0;
      if (total <= defs) {
        result.push({
          id: o.id,
          startLine: o.startLine,
          endLine: upToLine,
        });
      }
    }
    open = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Top-level section switch
    if (ind === 0) {
      finalize(i); // закрываем то, что было
      inViews = /^views\s*:\s*$/.test(line);
      topIndent = -1;
      continue;
    }
    if (!inViews) continue;

    const idM = line.match(idRe);
    if (idM) {
      const thisIndent = idM[1].length;
      if (topIndent === -1) topIndent = thisIndent;

      // Закрываем open-nested, у которых indent ≥ текущего
      // (новый элемент на том же/меньшем уровне)
      const stillOpen: typeof open = [];
      for (const o of open) {
        if (o.indent >= thisIndent) {
          // финализируем этот open индивидуально
          const isTarget =
            o.type === "panel" || o.type === "modal" || o.type === "page";
          if (isTarget) {
            const total = wordCounts.get(o.id) || 0;
            const defs = defCounts.get(o.id) || 0;
            if (total <= defs) {
              result.push({
                id: o.id,
                startLine: o.startLine,
                endLine: i, // предыдущая строка (1-based: i соответствует lines[i-1])
              });
            }
          }
        } else {
          stillOpen.push(o);
        }
      }
      open = stillOpen;

      if (thisIndent > topIndent) {
        // Определяем type (следующая непустая строка с type: на indent > thisIndent)
        let type: string | null = null;
        for (let j = i + 1; j < lines.length; j++) {
          const nl = lines[j];
          if (!nl.trim()) continue;
          const nlInd = (nl.match(/^(\s*)/) || ["", ""])[1].length;
          if (nlInd <= thisIndent) break;
          const tm = nl.match(/^\s*type\s*:\s*["']?([a-zA-Z_]+)["']?/);
          if (tm) {
            type = tm[1];
            break;
          }
        }
        open.push({
          id: idM[2],
          startLine: i + 1,
          indent: thisIndent,
          type,
        });
      }
      continue;
    }
  }
  finalize(lines.length);

  return result;
}

function fixpointUnusedByInherits(
  content: string,
  entitiesSection: {
    nodes: Array<{ id: string; line: number }>;
    line: number;
    linesCount: number;
  },
  initialUnused: Set<string>, // original case
  wordCounts: Map<string, number>,
  defCounts: Map<string, number>,
): Set<string> {
  const result = new Set(initialUnused);
  const lines = content.split("\n");

  // Build inherits map: childId → parentId (original case, local name)
  const inheritsMap = new Map<string, string>();
  entitiesSection.nodes.forEach((node, idx) => {
    const start = node.line - 1;
    const end =
      idx + 1 < entitiesSection.nodes.length
        ? entitiesSection.nodes[idx + 1].line - 1
        : entitiesSection.line + entitiesSection.linesCount - 1;
    for (let i = start; i < end && i < lines.length; i++) {
      const m = lines[i].match(/^\s*inherits\s*:\s*["']?([^\s"'#]+)["']?/);
      if (!m) continue;
      const raw = m[1];
      const local = raw.includes("/") ? raw.split("/").pop()! : raw;
      inheritsMap.set(node.id, local);
      break;
    }
  });

  // Fixpoint
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10) {
    changed = false;

    // Сколько unused-сущностей наследуют каждого parent
    const inheritsFromUnused = new Map<string, number>();
    for (const [childId, parentId] of inheritsMap) {
      if (!result.has(childId)) continue;
      inheritsFromUnused.set(
        parentId,
        (inheritsFromUnused.get(parentId) || 0) + 1,
      );
    }

    for (const node of entitiesSection.nodes) {
      const id = node.id;
      if (result.has(id)) continue;
      const ext = (wordCounts.get(id) || 0) - (defCounts.get(id) || 0);
      if (ext <= 0) continue;
      const fromUnused = inheritsFromUnused.get(id) || 0;
      // Все внешние ссылки пришли от unused-наследников → тоже unused
      if (ext === fromUnused) {
        result.add(id);
        changed = true;
      }
    }
  }

  return result;
}