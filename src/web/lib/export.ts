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
