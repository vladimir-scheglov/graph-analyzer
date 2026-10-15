import type {
  RFNode,
  RFEdge,
  CycleInfo,
  HealthResult,
  LearningPath,
  ValidationStats,
  ValidationRecord,
} from "./types";
import { plural, formatDuration } from "./format";

interface GenerateMarkdownReportContext {
  nodes: RFNode[];
  edges: RFEdge[];
  cyclesInfo: CycleInfo;
  healthMap: Map<string, HealthResult | number>;
  namespaceFilter?: string;
  filters?: Record<string, boolean>;
}

export function generateMarkdownReport(
  ctx: GenerateMarkdownReportContext,
): string {
  const { nodes, edges, cyclesInfo, healthMap, namespaceFilter = "" } = ctx;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const domainNodes = nodes.filter((n) => n.data.nodeType === "domain");
  const missingNodes = nodes.filter((n) => n.data.nodeType === "missing");
  const brokenNodes = nodes.filter((n) => n.data.nodeType === "broken");

  const isolated = domainNodes.filter((n) => {
    return !edges.some((e) => e.source === n.id || e.target === n.id);
  });

  const allRefs: Array<{ from: string; ref: any }> = [];
  domainNodes.forEach((n) => {
    (n.data.fqidRefs || []).forEach((r) => {
      const exists = nodes.some(
        (x) =>
          (x.data.domainId || "").toLowerCase() ===
          (r.targetDomainId || "").toLowerCase(),
      );
      if (!exists) allRefs.push({ from: n.data.domainId, ref: r });
    });
  });

  const topConnected = domainNodes
    .map((n) => {
      let d = 0;
      edges.forEach((e) => {
        if (e.source === n.id) d++;
        if (e.target === n.id) d++;
      });
      return { node: n, degree: d };
    })
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10);

  const worstHealth = domainNodes
    .map((n) => {
      const h = healthMap.get(n.id);
      const score =
        h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
      return { node: n, health: score };
    })
    .sort((a, b) => a.health - b.health)
    .slice(0, 10);

  const nsMap = new Map<string, number>();
  domainNodes.forEach((n) => {
    const ns = n.data.domainId.split(".").slice(0, 2).join(".");
    nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
  });
  const nsList = Array.from(nsMap.entries()).sort((a, b) => b[1] - a[1]);

  const lines: string[] = [];
  lines.push("# Domain Graph Report");
  lines.push("");
  lines.push("_Сгенерировано: " + now + "_");
  lines.push("");
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push("| Всего узлов | " + nodes.length + " |");
  lines.push("| Домены | " + domainNodes.length + " |");
  lines.push("| Missing | " + missingNodes.length + " |");
  lines.push("| Broken | " + brokenNodes.length + " |");
  lines.push("| Связей | " + edges.length + " |");
  lines.push("| Циклических групп | " + cyclesInfo.sccs.length + " |");
  lines.push("| Изолированных доменов | " + isolated.length + " |");
  lines.push("| Битых FQID-ссылок | " + allRefs.length + " |");
  lines.push("");

  if (namespaceFilter) {
    lines.push("> Фильтр по namespace: `" + namespaceFilter + "`");
    lines.push("");
  }

  lines.push("## Циклические зависимости");
  lines.push("");
  if (cyclesInfo.sccs.length === 0) {
    lines.push("_Циклов не обнаружено._");
  } else {
    lines.push("Найдено **" + cyclesInfo.sccs.length + "** циклических групп:");
    lines.push("");
    cyclesInfo.sccs.forEach((scc, i) => {
      const names = scc.map((id) => {
        const n = nodes.find((x) => x.id === id);
        return n ? n.data.domainId : id;
      });
      lines.push(i + 1 + ". " + names.join(" → ") + " → " + names[0]);
    });
  }
  lines.push("");

  lines.push("## Топ-10 по связям");
  lines.push("");
  lines.push("| # | Домен | Связей |");
  lines.push("| ---: | --- | ---: |");
  topConnected.forEach((item, i) => {
    lines.push(
      "| " +
        (i + 1) +
        " | `" +
        item.node.data.domainId +
        "` | " +
        item.degree +
        " |",
    );
  });
  lines.push("");

  lines.push("## Низкий health score");
  lines.push("");
  lines.push("| # | Домен | Health |");
  lines.push("| ---: | --- | ---: |");
  worstHealth.forEach((item, i) => {
    lines.push(
      "| " +
        (i + 1) +
        " | `" +
        item.node.data.domainId +
        "` | " +
        item.health +
        "/100 |",
    );
  });
  lines.push("");

  if (isolated.length > 0) {
    lines.push("## Изолированные домены");
    lines.push("");
    isolated.forEach((n) => lines.push("- `" + n.data.domainId + "`"));
    lines.push("");
  }

  if (allRefs.length > 0) {
    lines.push("## Битые FQID-ссылки");
    lines.push("");
    const byFrom = new Map<string, any[]>();
    allRefs.forEach((item) => {
      if (!byFrom.has(item.from)) byFrom.set(item.from, []);
      byFrom.get(item.from)!.push(item.ref);
    });
    byFrom.forEach((refs, from) => {
      lines.push("### " + from);
      lines.push("");
      refs.forEach((r) => {
        lines.push("- `" + r.fullFQID + "` — " + r.propertyPath);
      });
      lines.push("");
    });
  }

  lines.push("## Распределение по неймспейсам");
  lines.push("");
  lines.push("| Неймспейс | Доменов |");
  lines.push("| --- | ---: |");
  nsList.forEach((entry) => {
    lines.push("| `" + entry[0] + "` | " + entry[1] + " |");
  });
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("_Отчёт сгенерирован Domain Graph Analyzer._");

  return lines.join("\n");
}

export function generateLearningPathMarkdown(
  path: LearningPath,
  options?: { scope?: string },
): string {
  const lines: string[] = [];
  lines.push("# Путь изучения архитектуры");
  lines.push("");
  lines.push("_Сгенерировано: " + new Date().toLocaleString("ru-RU") + "_");
  lines.push("");
  if (options && options.scope) {
    lines.push("Область: **" + options.scope + "**");
    lines.push("");
  }
  lines.push(
    "Порядок чтения построен от «фундамента» (домены без входящих зависимостей) к верхним слоям.",
  );
  lines.push("");
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push("| Всего доменов | " + path.totalDomains + " |");
  lines.push("| Этапов | " + path.totalStages + " |");
  lines.push("| Точек входа | " + path.entryPoints.length + " |");
  if (path.unresolved.length > 0) {
    lines.push("| Не разрешено (цикл) | " + path.unresolved.length + " |");
  }
  lines.push("");

  if (path.entryPoints.length > 0) {
    lines.push("## Точки входа");
    lines.push("");
    lines.push(
      "Эти домены — «клиенты» системы: они используют других, но никто не использует их. Хорошие примеры для изучения, потому что показывают функциональность верхнего уровня.",
    );
    lines.push("");
    path.entryPoints.slice(0, 20).forEach((d) => {
      lines.push(
        "- `" +
          d.domainId +
          "`" +
          (d.label && d.label !== d.domainId ? " — " + d.label : ""),
      );
    });
    lines.push("");
  }

  path.stages.forEach((stage) => {
    lines.push(
      "## Этап " +
        (stage.index + 1) +
        " — " +
        stage.domains.length +
        " " +
        plural(stage.domains.length, "домен", "доменов"),
    );
    lines.push("");
    stage.domains.forEach((d) => {
      lines.push("### `" + d.domainId + "`");
      if (d.label && d.label !== d.domainId) lines.push("_ " + d.label + "_");
      lines.push("");
      if (d.description) lines.push(d.description);
      lines.push("");
      const stats: string[] = [];
      if (d.fanIn > 0) stats.push("используется в " + d.fanIn + " местах");
      if (d.fanOut > 0) stats.push("зависит от " + d.fanOut);
      if (d.entitiesCount) stats.push(d.entitiesCount + " entities");
      if (d.tags && d.tags.length > 0) stats.push("теги: " + d.tags.join(", "));
      if (stats.length > 0) lines.push("*" + stats.join(" · ") + "*");
      lines.push("");
    });
  });

  if (path.unresolved.length > 0) {
    lines.push("## Требуют ручного разбора (в цикле)");
    lines.push("");
    path.unresolved.forEach((d) => {
      lines.push("- `" + d.domainId + "`");
    });
    lines.push("");
  }

  return lines.join("\n");
}

export function generateValidationMarkdown(
  stats: ValidationStats,
  cancelled: boolean,
  logs: ValidationRecord[],
): string {
  const lines: string[] = [];
  lines.push("# Отчёт валидации доменов");
  lines.push("");
  lines.push("_Сгенерировано: " + new Date().toLocaleString("ru-RU") + "_");
  if (cancelled) {
    lines.push("");
    lines.push("> ⚠️ Валидация была прервана пользователем");
  }
  lines.push("");
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push("| Всего в области | " + stats.total + " |");
  lines.push("| Обработано | " + stats.processed + " |");
  lines.push("| ✅ Валидных | " + stats.valid + " |");
  lines.push("| ❌ Невалидных | " + stats.invalid + " |");
  lines.push("| ⚠️ Ошибок | " + stats.errors + " |");
  lines.push("| ⏱ Время | " + formatDuration(stats.elapsedMs) + " |");
  lines.push("");

  const invalid = logs.filter((l) => l.status === "invalid");
  if (invalid.length > 0) {
    lines.push("## Невалидные домены (" + invalid.length + ")");
    lines.push("");
    invalid.forEach((l) => {
      lines.push("### `" + l.domainId + "`");
      lines.push("");
      (l.diagnostics || []).forEach((d) => {
        lines.push("- **[" + d.severity + "]** " + d.message);
        (d.labels || []).forEach((lb) => {
          lines.push(
            "  - " +
              lb.message +
              (lb.span
                ? " (позиция " + lb.span.start + "-" + lb.span.end + ")"
                : ""),
          );
        });
      });
      lines.push("");
    });
  }

  const errors = logs.filter((l) => l.status === "error");
  if (errors.length > 0) {
    lines.push("## Ошибки выполнения (" + errors.length + ")");
    lines.push("");
    errors.forEach((l) => {
      lines.push(
        "- `" + l.domainId + "` — " + (l.error || "неизвестная ошибка"),
      );
    });
    lines.push("");
  }

  const valid = logs.filter((l) => l.status === "valid");
  if (valid.length > 0) {
    lines.push("## Валидные домены (" + valid.length + ")");
    lines.push("");
    valid.forEach((l) => lines.push("- `" + l.domainId + "`"));
    lines.push("");
  }

  return lines.join("\n");
}
