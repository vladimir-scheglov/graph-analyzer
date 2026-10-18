import type { RFNode, RFEdge } from "./types";

function downloadFile(
  content: string | Blob,
  filename: string,
  mime: string,
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

export function exportGraphJSON(nodes: RFNode[], edges: RFEdge[]): void {
  const data = {
    exportedAt: new Date().toISOString(),
    scope: "full",
    stats: { nodes: nodes.length, edges: edges.length },
    nodes: nodes.map((n) => ({
      id: n.id,
      domainId: n.data.domainId,
      label: n.data.label,
      nodeType: n.data.nodeType,
      filePath: n.data.filePath,
      description: n.data.description,
      tags: n.data.tags,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      kind: e.data && e.data.kind,
      fullLabel: e.data && e.data.fullLabel,
      refCount: e.data && e.data.refCount,
    })),
  };
  downloadFile(
    JSON.stringify(data, null, 2),
    `domain-graph-${stamp()}.json`,
    "application/json",
  );
}

export function exportMermaid(nodes: RFNode[], edges: RFEdge[]): void {
  const lines: string[] = ["graph LR"];
  const idMap = new Map<string, string>();
  let counter = 1;

  nodes.forEach((n) => {
    if (n.data.nodeType !== "domain") return;
    const id = "D" + counter++;
    idMap.set(n.id, id);
    const safeLabel = (n.data.domainId || "").replace(/"/g, "&quot;");
    lines.push(`  ${id}["${safeLabel}"]`);
  });

  edges.forEach((e) => {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t) return;
    const kind = e.data && e.data.kind;
    const label =
      kind === "linkage" ? "" : `|${(e.data && e.data.refCount) || 1}|`;
    lines.push(`  ${s} -->${label} ${t}`);
  });

  lines.push("");
  lines.push("  classDef domain fill:#4CAF50,color:#fff");
  lines.push("  classDef missing fill:#FF9800,color:#fff");
  lines.push("  classDef broken fill:#F44336,color:#fff");

  downloadFile(
    lines.join("\n"),
    `domain-graph-${stamp()}.mmd`,
    "text/plain;charset=utf-8",
  );
}

export function exportPNG(): Promise<void> {
  const flowEl = document.querySelector(
    ".graph-container",
  ) as HTMLElement | null;
  if (!flowEl) {
    alert("Граф не найден");
    return Promise.resolve();
  }

  return import("https://esm.sh/html-to-image@1.11.11" as any)
    .then((mod: any) => {
      const bg =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--graph-bg")
          .trim() || "#0a0e1a";
      return mod.toPng(flowEl, {
        backgroundColor: bg,
        pixelRatio: 2,
        filter: (node: HTMLElement) => {
          if (!node.classList) return true;
          if (node.classList.contains("react-flow__controls")) return false;
          if (node.classList.contains("react-flow__minimap")) return false;
          if (node.classList.contains("react-flow__panel")) return false;
          if (node.classList.contains("heat-legend")) return false;
          if (node.classList.contains("side-panel")) return false;
          if (node.classList.contains("toolbar")) return false;
          return true;
        },
      });
    })
    .then((dataUrl: string) => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `domain-graph-${stamp()}.png`;
      a.click();
    })
    .catch((err) => {
      alert("Ошибка экспорта: " + err.message);
    });
}

export function exportStatsMarkdown(
  nodes: RFNode[],
  edges: RFEdge[],
  counts: {
    domain: number;
    missing: number;
    broken: number;
    linkage: number;
    fqid: number;
  },
  isolatedCount: number,
  cyclesCount: number,
  topConnected: any[],
  worstHealth: any[],
  namespaces: Array<[string, number]>,
  tagCloud: Array<[string, number]>,
): void {
  const lines: string[] = [];
  lines.push("# Статистика Domain Graph");
  lines.push("");
  lines.push("_Сгенерировано: " + new Date().toLocaleString("ru-RU") + "_");
  lines.push("");
  lines.push("## Обзор");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push("| Всего узлов | " + nodes.length + " |");
  lines.push("| Связей | " + edges.length + " |");
  lines.push("| Missing | " + counts.missing + " |");
  lines.push("| Broken | " + counts.broken + " |");
  lines.push("| Изолированных | " + isolatedCount + " |");
  lines.push("| Циклических групп | " + cyclesCount + " |");
  lines.push("");

  if (topConnected.length > 0) {
    lines.push("## Топ по связям");
    lines.push("");
    lines.push("| # | Домен | Связей |");
    lines.push("| ---: | --- | ---: |");
    topConnected.forEach((item, i) => {
      lines.push(
        `| ${i + 1} | \`${item.node.data.domainId}\` | ${item.degree} |`,
      );
    });
    lines.push("");
  }

  if (worstHealth.length > 0) {
    lines.push("## Низкий health");
    lines.push("");
    lines.push("| # | Домен | Health |");
    lines.push("| ---: | --- | ---: |");
    worstHealth.slice(0, 20).forEach((item, i) => {
      lines.push(
        `| ${i + 1} | \`${item.node.data.domainId}\` | ${item.health}/100 |`,
      );
    });
    lines.push("");
  }

  if (namespaces.length > 0) {
    lines.push("## Неймспейсы");
    lines.push("");
    lines.push("| Неймспейс | Доменов |");
    lines.push("| --- | ---: |");
    namespaces.forEach(([ns, count]) => {
      lines.push(`| \`${ns}\` | ${count} |`);
    });
    lines.push("");
  }

  if (tagCloud.length > 0) {
    lines.push("## Теги");
    lines.push("");
    tagCloud.forEach(([tag, count]) => {
      lines.push(`- \`${tag}\` (${count})`);
    });
    lines.push("");
  }

  downloadFile(
    lines.join("\n"),
    `domain-stats-${stamp()}.md`,
    "text/markdown;charset=utf-8",
  );
}

// ============ Entity Class Diagram (Mermaid) ============

import type { ModelIndex } from "../../shared/model-types";

export interface EntityClassDiagramOptions {
  /** Ограничить доменами (lowercase). Пусто — все. */
  domains?: Set<string>;
  /** Максимум классов. По умолчанию 150. */
  limit?: number;
  /** Максимум атрибутов в одном классе. По умолчанию 30. */
  maxAttributes?: number;
  /** Включать наследование. По умолчанию true. */
  includeInheritance?: boolean;
  /** Включать Reference-связи. По умолчанию true. */
  includeReferences?: boolean;
  /** Включать linkages. По умолчанию true. */
  includeLinkages?: boolean;
  /** Показывать домен как стереотип `<<domain.tld>>`. По умолчанию true. */
  includeStereotype?: boolean;
}

const DEFAULT_LIMIT = 150;
const DEFAULT_MAX_ATTRS = 30;

/** Кратность для связи. */
function cardinality(type: string, side: 1 | 2): string {
  if (type === "1_1") return "1";
  if (type === "1_n") return side === 1 ? "1" : "*";
  return "*";
}

/**
 * Генерирует Mermaid classDiagram для сущностей.
 *
 * Правила:
 *   - каждый класс = сущность, члены класса = атрибуты
 *   - `<<domain.tld>>` — стереотип с доменом (опционально)
 *   - `Parent <|-- Child` — наследование
 *   - `A --> B : attr` — Reference-атрибут
 *   - `A -- B : name` — ненаправленная linkage
 *   - `A --> B : name` — направленная linkage
 */
export function generateEntityClassDiagram(
  index: ModelIndex,
  options: EntityClassDiagramOptions = {},
): string {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const maxAttributes = options.maxAttributes ?? DEFAULT_MAX_ATTRS;
  const includeInheritance = options.includeInheritance !== false;
  const includeReferences = options.includeReferences !== false;
  const includeLinkages = options.includeLinkages !== false;
  const includeStereotype = options.includeStereotype !== false;
  const domainFilter = options.domains;

  // ============ 1. Отбор сущностей ============
  let candidates = index.entities;
  if (domainFilter && domainFilter.size > 0) {
    candidates = candidates.filter((e) =>
      domainFilter.has(e.domainId.toLowerCase()),
    );
  }

  // ============ 2. Сортировка по степени связности ============
  const degreeMap = new Map<string, number>();
  candidates.forEach((e) => {
    let d = 0;
    d += (index.entityChildrenByFqid[e.fqid] || []).length;
    d += e.attributes.filter(
      (a) => a.referenceEntity || a.itemReferenceEntity,
    ).length;
    d += index.entityLinkages.filter(
      (l) => l.side1Fqid === e.fqid || l.side2Fqid === e.fqid,
    ).length;
    degreeMap.set(e.fqid, d);
  });

  const sorted = candidates.slice().sort((a, b) => {
    const da = degreeMap.get(a.fqid) || 0;
    const db = degreeMap.get(b.fqid) || 0;
    if (da !== db) return db - da;
    return a.fqid.localeCompare(b.fqid);
  });

  const selected = sorted.slice(0, limit);
  const selectedSet = new Set(selected.map((e) => e.fqid));

  // ============ 3. Уникализация имён классов ============
  const classIdByFqid = new Map<string, string>();
  const usedIds = new Set<string>();
  selected.forEach((e) => {
    const baseId = safeMermaidId(e.entityId);
    let id = baseId;
    let n = 2;
    while (usedIds.has(id)) {
      id = baseId + "_" + n;
      n++;
    }
    usedIds.add(id);
    classIdByFqid.set(e.fqid, id);
  });

  // ============ 4. Сборка диаграммы ============
  const lines: string[] = [];
  lines.push("classDiagram");

  // ---- Классы + члены ----
  selected.forEach((e) => {
    const classId = classIdByFqid.get(e.fqid)!;
    const attrs = e.attributes.slice(0, maxAttributes);

    if (attrs.length === 0 && !includeStereotype) {
      // Совсем пустой класс — минимальная строка без тела
      lines.push(`    class ${classId}`);
      return;
    }

    lines.push(`    class ${classId} {`);
    if (includeStereotype) {
      lines.push(`        <<${e.domainId}>>`);
    }
    attrs.forEach((a) => {
      const type = a.dataType || "String";
      const name = safeMermaidId(a.id);
      lines.push(`        +${type} ${name}`);
    });
    if (e.attributes.length > maxAttributes) {
      lines.push(
        `        %% ... и ещё ${e.attributes.length - maxAttributes} атрибутов`,
      );
    }
    lines.push("    }");
  });

  // ---- Наследование ----
  if (includeInheritance) {
    selected.forEach((e) => {
      if (!e.inherits) return;
      if (!selectedSet.has(e.inherits)) return;
      const parentId = classIdByFqid.get(e.inherits)!;
      const childId = classIdByFqid.get(e.fqid)!;
      lines.push(`    ${parentId} <|-- ${childId}`);
    });
  }

  // ---- Reference ----
  if (includeReferences) {
    selected.forEach((e) => {
      const sourceId = classIdByFqid.get(e.fqid)!;
      for (const a of e.attributes) {
        const target = a.referenceEntity || a.itemReferenceEntity;
        if (!target) continue;
        if (!selectedSet.has(target)) continue;
        const targetId = classIdByFqid.get(target)!;
        const label = escapeLabel(a.name || a.id);
        lines.push(`    ${sourceId} --> ${targetId} : ${label}`);
      }
    });
  }

  // ---- Linkage ----
  if (includeLinkages) {
    for (const l of index.entityLinkages) {
      if (!selectedSet.has(l.side1Fqid)) continue;
      if (!selectedSet.has(l.side2Fqid)) continue;
      if (l.side1Fqid === l.side2Fqid) continue; // self-loop не показываем

      const side1Id = classIdByFqid.get(l.side1Fqid)!;
      const side2Id = classIdByFqid.get(l.side2Fqid)!;
      const label = escapeLabel(l.name);
      const card1 = cardinality(l.type, 1);
      const card2 = cardinality(l.type, 2);
      const arrow = l.undirected ? "--" : "-->";
      lines.push(
        `    ${side1Id} "${card1}" ${arrow} "${card2}" ${side2Id} : ${label}`,
      );
    }
  }

  // ---- Легенда ----
  lines.push("");
  lines.push("    %% Легенда:");
  lines.push("    %% Parent <|-- Child         — наследование");
  lines.push("    %% A --> B : attrName        — Reference-атрибут");
  lines.push("    %% A -- B : linkageName      — ненаправленная linkage");
  lines.push("    %% A --> B : linkageName     — направленная linkage");

  if (candidates.length > selected.length) {
    lines.push("");
    lines.push(
      `    %% Показано ${selected.length} из ${candidates.length} сущностей (limit: ${limit})`,
    );
  }

  return lines.join("\n");
}

/** Скачивает classDiagram сущностей. */
export function exportEntityClassDiagram(
  index: ModelIndex,
  options: EntityClassDiagramOptions = {},
): void {
  const mermaid = generateEntityClassDiagram(index, options);
  downloadFile(
    mermaid,
    `entity-class-diagram-${stamp()}.mmd`,
    "text/plain;charset=utf-8",
  );
}

// ============ Entity Class Diagram (из EntityGraphResult) ============

import type { EntityGraphResult, EntityGraphEdge } from "./model/entity-graph";

function safeMermaidId(raw: string): string {
  const s = (raw || "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(s) ? "_" + s : s || "_unnamed";
}

function escapeLabel(raw: string): string {
  return String(raw || "").replace(/"/g, '\\"');
}

export interface EntityClassDiagramFromGraphOptions {
  /** Показывать ли домен как стереотип `<<domain.tld>>`. По умолчанию true. */
  includeStereotype?: boolean;
  /** Максимум атрибутов в одном классе. По умолчанию 30. */
  maxAttributes?: number;
}

/**
 * Генерирует Mermaid classDiagram из уже построенного EntityGraphResult.
 *
 * Используется в EntityGraphModal — экспортирует ровно то, что видит пользователь:
 *   - только узлы, прошедшие через domainFilter, showInheritance / showReferences / showLinkages
 *   - только рёбра, которые есть в текущем graph
 *   - учитывается лимит и сортировка buildEntityGraph
 *
 * Формат:
 *   - каждый класс = сущность, члены — атрибуты
 *   - `<<domain.tld>>` — стереотип домена (отключается)
 *   - `Parent <|-- Child` — наследование
 *   - `A --> B : attrName` — Reference
 *   - `A -- B : linkageName` — ненаправленная linkage
 *   - `A --> B : linkageName` — направленная linkage
 */
export function generateEntityClassDiagramFromGraph(
  graph: EntityGraphResult,
  options: EntityClassDiagramFromGraphOptions = {},
): string {
  const maxAttributes = options.maxAttributes ?? 30;
  const includeStereotype = options.includeStereotype !== false;

  // ---- Уникализация имён классов ----
  const classIdByFqid = new Map<string, string>();
  const usedIds = new Set<string>();

  graph.nodes.forEach((n) => {
    const baseId = safeMermaidId(n.entityId);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = baseId + "_" + suffix;
      suffix++;
    }
    usedIds.add(id);
    classIdByFqid.set(n.id, id);
  });

  const lines: string[] = [];
  lines.push("classDiagram");

  // ---- Классы + члены ----
  graph.nodes.forEach((n) => {
    const classId = classIdByFqid.get(n.id)!;
    const e = n.entity;
    const attrs = e.attributes.slice(0, maxAttributes);

    if (attrs.length === 0 && !includeStereotype) {
      lines.push(`    class ${classId}`);
      return;
    }

    lines.push(`    class ${classId} {`);
    if (includeStereotype) {
      lines.push(`        <<${e.domainId}>>`);
    }
    attrs.forEach((a) => {
      const type = a.dataType || "String";
      const name = safeMermaidId(a.id);
      lines.push(`        +${type} ${name}`);
    });
    if (e.attributes.length > maxAttributes) {
      lines.push(
        `        %% ... и ещё ${e.attributes.length - maxAttributes} атрибутов`,
      );
    }
    lines.push("    }");
  });

  // ---- Рёбра ----
  graph.edges.forEach((edge) => {
    const sourceId = classIdByFqid.get(edge.source);
    const targetId = classIdByFqid.get(edge.target);
    if (!sourceId || !targetId) return;

    if (edge.kind === "inheritance") {
      lines.push(`    ${sourceId} <|-- ${targetId}`);
    } else if (edge.kind === "reference") {
      const label = escapeLabel(edge.label || "ref");
      lines.push(`    ${sourceId} --> ${targetId} : ${label}`);
    } else if (edge.kind === "linkage") {
      const arrow = edge.undirected ? "--" : "-->";
      const label = escapeLabel(edge.label || "linkage");
      lines.push(`    ${sourceId} ${arrow} ${targetId} : ${label}`);
    }
  });

  // ---- Легенда ----
  lines.push("");
  lines.push("    %% Легенда:");
  lines.push("    %% Parent <|-- Child         — наследование");
  lines.push("    %% A --> B : attrName        — Reference");
  lines.push("    %% A -- B : linkageName      — ненаправленная linkage");
  lines.push("    %% A --> B : linkageName     — направленная linkage");

  const countsByKind = { inheritance: 0, reference: 0, linkage: 0 };
  graph.edges.forEach((e) => {
    countsByKind[e.kind]++;
  });
  lines.push("");
  lines.push(
    `    %% Классов: ${graph.nodes.length} · наследование: ${countsByKind.inheritance} · reference: ${countsByKind.reference} · linkage: ${countsByKind.linkage}`,
  );

  if (graph.stats.truncated > 0) {
    lines.push(
      `    %% Обрезано по лимиту: ${graph.stats.truncated} сущностей (limit в buildEntityGraph)`,
    );
  }

  return lines.join("\n");
}

/** Скачивает classDiagram, построенный по EntityGraphResult. */
export function downloadEntityClassDiagram(
  graph: EntityGraphResult,
  options: EntityClassDiagramFromGraphOptions = {},
  filenameHint?: string,
): void {
  const mermaid = generateEntityClassDiagramFromGraph(graph, options);
  const safe = (filenameHint || "entities").replace(/[^a-z0-9.-]/gi, "_");
  downloadFile(
    mermaid,
    `class-diagram-${safe}-${stamp()}.mmd`,
    "text/plain;charset=utf-8",
  );
}