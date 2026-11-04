import type {
  ModelIndex,
  ModelOrphans,
  ModelStats,
} from "../../../shared/model-types";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCategory =
  | "references" // битые ссылки
  | "structure" // циклы, дубликаты
  | "content" // атрибуты, миксины
  | "orphans" // сироты
  | "domains"; // пустые домены

export type IssueActionKind = "lint" | "catalog" | "schema" | "health" | "pii";

export interface IssueAction {
  kind: IssueActionKind;
  label: string;
  icon: string;
}

export interface ValidationIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  count: number;
  title: string;
  description: string;
  hint: string;
  samples: string[];

  /** FQDN доменов, затронутых проблемой (для клика). */
  affectedDomains: string[];
  /** FQID сущностей, затронутых проблемой (для клика). */
  affectedEntities: string[];
  /** Быстрые действия — переход к связанным инструментам. */
  actions: IssueAction[];
  /** Числовая важность для приоритизации (0..10). */
  impact: number;
}

export interface ValidationSummary {
  issues: ValidationIssue[];
  counts: {
    error: number;
    warning: number;
    info: number;
  };
  totalIssues: number;
  health: number;
  grade: "A" | "B" | "C" | "D" | "E";
  categoryCounts: Record<IssueCategory, number>;
}

// ============ Helpers ============

const FQID_RE = /^([a-z0-9][\w.-]*\.[a-z0-9][\w.-]*)\/(.+)$/i;

interface SampleInfo {
  isFqid: boolean;
  isDomain: boolean;
  domain: string | null;
  entityFqid: string | null;
}

function parseSample(sample: string): SampleInfo {
  const t = sample.trim();
  const m = t.match(FQID_RE);
  if (m) {
    return {
      isFqid: true,
      isDomain: false,
      domain: m[1].toLowerCase(),
      entityFqid: `${m[1]}/${m[2]}`.toLowerCase(),
    };
  }
  if (/^[a-z0-9][\w.-]*\.[a-z0-9][\w.-]*$/i.test(t)) {
    return {
      isFqid: false,
      isDomain: true,
      domain: t.toLowerCase(),
      entityFqid: null,
    };
  }
  return { isFqid: false, isDomain: false, domain: null, entityFqid: null };
}

function extractAffected(samples: string[]): {
  affectedDomains: string[];
  affectedEntities: string[];
} {
  const ds = new Set<string>();
  const es = new Set<string>();
  for (const s of samples) {
    const info = parseSample(s);
    if (info.domain) ds.add(info.domain);
    if (info.entityFqid) es.add(info.entityFqid);
  }
  return {
    affectedDomains: Array.from(ds).sort(),
    affectedEntities: Array.from(es).sort(),
  };
}

const ACTIONS: Record<IssueActionKind, IssueAction> = {
  lint: { kind: "lint", label: "Открыть линтер", icon: "rule" },
  catalog: { kind: "catalog", label: "Открыть каталог", icon: "menu_book" },
  schema: { kind: "schema", label: "Схема домена", icon: "menu_book" },
  health: { kind: "health", label: "Health Dashboard", icon: "dashboard" },
  pii: { kind: "pii", label: "PII-атрибуты", icon: "shield_lock" },
};

function computeHealth(counts: {
  error: number;
  warning: number;
  info: number;
}): number {
  let score = 100;
  score -= Math.min(counts.error * 8, 60);
  score -= Math.min(counts.warning * 2, 25);
  score -= Math.min(counts.info * 0.3, 10);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeGrade(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "E";
}

// ============ Главная функция ============

export function summarizeValidation(
  stats: ModelStats,
  orphans: ModelOrphans,
  _index?: ModelIndex | null,
): ValidationSummary {
  const issues: ValidationIssue[] = [];

  const push = (
    partial: Omit<
      ValidationIssue,
      "affectedDomains" | "affectedEntities" | "actions"
    > & { actionKinds: IssueActionKind[] },
  ): void => {
    const { actionKinds, ...rest } = partial;
    const affected = extractAffected(rest.samples);
    issues.push({
      ...rest,
      affectedDomains: affected.affectedDomains,
      affectedEntities: affected.affectedEntities,
      actions: actionKinds.map((k) => ACTIONS[k]),
    });
  };

  // ═══ ERRORS ═══

  if (stats.circularInheritance.length > 0) {
    push({
      severity: "error",
      category: "structure",
      count: stats.circularInheritance.length,
      title: "Циклы в наследовании",
      description:
        "Сущности наследуют друг друга по кругу — это ломает логику наследования и блокирует публикацию.",
      hint: "Разорвите цепочку — уберите один из inherits.",
      samples: stats.circularInheritance.slice(0, 30),
      impact: 10,
      actionKinds: ["lint", "catalog"],
    });
  }

  if (stats.unknownReferences.length > 0) {
    const byKind: Record<string, number> = {};
    stats.unknownReferences.forEach((r) => {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    });
    push({
      severity: "error",
      category: "references",
      count: stats.unknownReferences.length,
      title: "Битые FQID-ссылки",
      description:
        "Ссылки на несуществующие сущности: " +
        Object.entries(byKind)
          .map(([k, n]) => `${k} (${n})`)
          .join(", "),
      hint: "Проверьте FQID и опечатки в id сущностей.",
      samples: stats.unknownReferences
        .map((r) => `${r.from} → ${r.ref}`)
        .slice(0, 30),
      impact: 9,
      actionKinds: ["lint"],
    });
  }

  if (stats.duplicateEntityIds.length > 0) {
    push({
      severity: "error",
      category: "structure",
      count: stats.duplicateEntityIds.length,
      title: "Дубликаты entityId между доменами",
      description:
        "Одинаковый id сущности используется в нескольких доменах — путает FQID-ссылки.",
      hint: "Переименуйте одну из сущностей или вынесите в общий домен.",
      samples: stats.duplicateEntityIds.map(
        (d) => `${d.entityId}: ${d.domains.join(", ")}`,
      ),
      impact: 8,
      actionKinds: ["catalog"],
    });
  }

  // ═══ WARNINGS ═══

  if (stats.mixinConflicts.length > 0) {
    push({
      severity: "warning",
      category: "content",
      count: stats.mixinConflicts.length,
      title: "Конфликты миксинов",
      description:
        "Разные миксины добавляют одинаковые вкладки к одной сущности. Порядок применения непредсказуем.",
      hint: "Проверьте порядок миксинов — какой победит. Возможно, стоит удалить дублирующую вкладку из одного.",
      samples: stats.mixinConflicts.map(
        (c) =>
          `${c.targetFqid}: ${c.addedTabs.join(", ")} (${c.source} ↔ ${c.conflictsWith.join(", ")})`,
      ),
      impact: 6,
      actionKinds: ["catalog"],
    });
  }

  if (stats.orphanEntities.length > 0) {
    push({
      severity: "warning",
      category: "orphans",
      count: stats.orphanEntities.length,
      title: "Сущности-сироты",
      description:
        "Ни на кого не ссылаются и никто не ссылается — вероятно, мёртвый код или незаконченная фича.",
      hint: "Проверьте: может, сущность реально не нужна или просто не подключена к views.",
      samples: stats.orphanEntities.slice(0, 30),
      impact: 5,
      actionKinds: ["catalog", "schema"],
    });
  }

  if (stats.attributesWithoutViews.length > 0) {
    push({
      severity: "warning",
      category: "content",
      count: stats.attributesWithoutViews.length,
      title: "Атрибуты без представления",
      description:
        "Определены, но не упомянуты ни в views, ни в dataRules — потенциально мёртвый код.",
      hint: "Если атрибут реально нужен — добавьте виджет или правило данных; иначе удалите его.",
      samples: stats.attributesWithoutViews.slice(0, 30).map((a) => a.key),
      impact: 4,
      actionKinds: ["catalog", "lint"],
    });
  }

  // ═══ INFO ═══

  if (stats.emptyDomains.length > 0) {
    push({
      severity: "info",
      category: "domains",
      count: stats.emptyDomains.length,
      title: "Домены без сущностей",
      description:
        "Содержат только миксины / типы данных / последовательности — нормально для mixin-доменов.",
      hint: "Не требует действий, если домен задуман как миксин-библиотека.",
      samples: stats.emptyDomains,
      impact: 2,
      actionKinds: ["schema"],
    });
  }

  if (stats.entitiesWithoutAttributes.length > 0) {
    push({
      severity: "info",
      category: "content",
      count: stats.entitiesWithoutAttributes.length,
      title: "Сущности без атрибутов",
      description: "Все атрибуты унаследованы от родителя — собственных нет.",
      hint: "Нормально, если сущность чисто маркерная.",
      samples: stats.entitiesWithoutAttributes.slice(0, 20),
      impact: 2,
      actionKinds: ["catalog"],
    });
  }

  // ═══ ORPHANS ═══

  if (orphans) {
    if (orphans.views.length > 0) {
      push({
        severity: "info",
        category: "orphans",
        count: orphans.views.length,
        title: "Осиротевшие views",
        description:
          "Определены, но нигде не вызываются — ни в меню, ни в действиях.",
        hint: "Кандидаты на удаление или на подключение к интерфейсу.",
        samples: orphans.views
          .map((v) => `${v.domainId}/${v.id} (${v.type})`)
          .slice(0, 30),
        impact: 3,
        actionKinds: ["schema"],
      });
    }

    if (orphans.actions.length > 0) {
      push({
        severity: "info",
        category: "orphans",
        count: orphans.actions.length,
        title: "Осиротевшие actions",
        description: "Определены, но нет виджета, который бы их вызывал.",
        hint: "Возможно, не добавлены кнопки в интерфейс.",
        samples: orphans.actions
          .map((a) => `${a.domainId}/${a.id}`)
          .slice(0, 30),
        impact: 3,
        actionKinds: ["schema"],
      });
    }

    if (orphans.dataTypes.length > 0) {
      push({
        severity: "info",
        category: "orphans",
        count: orphans.dataTypes.length,
        title: "Осиротевшие типы данных",
        description: "Enum/Table/Workflow не используются ни одним атрибутом.",
        hint: "Мёртвый код — можно удалить.",
        samples: orphans.dataTypes
          .map((d) => `${d.domainId}/${d.id} (${d.kind})`)
          .slice(0, 30),
        impact: 2,
        actionKinds: ["schema"],
      });
    }

    if (orphans.sequences.length > 0) {
      push({
        severity: "info",
        category: "orphans",
        count: orphans.sequences.length,
        title: "Осиротевшие последовательности",
        description: "Не используются ни одним Identifier-атрибутом.",
        hint: "Можно удалить без последствий.",
        samples: orphans.sequences
          .map((s) => `${s.domainId}/${s.id}`)
          .slice(0, 30),
        impact: 2,
        actionKinds: ["schema"],
      });
    }

    if (orphans.medias.length > 0) {
      push({
        severity: "info",
        category: "orphans",
        count: orphans.medias.length,
        title: "Осиротевшие иконки",
        description: "Не упомянуты ни в одном виджете или меню.",
        hint: "Можно удалить из medias[].",
        samples: orphans.medias
          .map((m) => `${m.domainId}/${m.id}`)
          .slice(0, 30),
        impact: 1,
        actionKinds: ["schema"],
      });
    }
  }

  const counts = {
    error: issues
      .filter((i) => i.severity === "error")
      .reduce((s, i) => s + i.count, 0),
    warning: issues
      .filter((i) => i.severity === "warning")
      .reduce((s, i) => s + i.count, 0),
    info: issues
      .filter((i) => i.severity === "info")
      .reduce((s, i) => s + i.count, 0),
  };

  const categoryCounts: Record<IssueCategory, number> = {
    references: 0,
    structure: 0,
    content: 0,
    orphans: 0,
    domains: 0,
  };
  issues.forEach((i) => {
    categoryCounts[i.category] += i.count;
  });

  const health = computeHealth(counts);

  return {
    issues,
    counts,
    totalIssues: counts.error + counts.warning + counts.info,
    health,
    grade: computeGrade(health),
    categoryCounts,
  };
}
