import type { ModelIndex, ModelOrphans, ModelStats } from "../../../shared/model-types";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  count: number;
  /** Короткое название для карточки. */
  title: string;
  /** Одно предложение — что это значит. */
  description: string;
  /** Рекомендация — что делать. */
  hint: string;
  /** Опционально — список для раскрытия. */
  samples: string[];
}

export interface ValidationSummary {
  issues: ValidationIssue[];
  counts: {
    error: number;
    warning: number;
    info: number;
  };
  totalIssues: number;
}

export function summarizeValidation(
  stats: ModelStats,
  orphans: ModelOrphans,
): ValidationSummary {
  const issues: ValidationIssue[] = [];

  // ============ ERRORS ============

  if (stats.circularInheritance.length > 0) {
    issues.push({
      severity: "error",
      count: stats.circularInheritance.length,
      title: "Циклы в наследовании",
      description:
        "Сущности наследуют друг друга по кругу — это ломает логику наследования.",
      hint: "Разорвите цепочку — уберите один из inherits.",
      samples: stats.circularInheritance.slice(0, 20),
    });
  }

  if (stats.unknownReferences.length > 0) {
    const byKind: Record<string, number> = {};
    stats.unknownReferences.forEach((r) => {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    });
    issues.push({
      severity: "error",
      count: stats.unknownReferences.length,
      title: "Битые ссылки",
      description:
        "Есть ссылки на несуществующие сущности: " +
        Object.entries(byKind)
          .map(([k, n]) => `${k} (${n})`)
          .join(", "),
      hint: "Проверьте FQID и опечатки в id.",
      samples: stats.unknownReferences
        .map((r) => `${r.from} → ${r.ref}`)
        .slice(0, 20),
    });
  }

  if (stats.duplicateEntityIds.length > 0) {
    issues.push({
      severity: "error",
      count: stats.duplicateEntityIds.length,
      title: "Дубликаты entityId между доменами",
      description:
        "Одинаковый id сущности используется в нескольких доменах — это путает FQID-ссылки.",
      hint: "Переименуйте одну из сущностей или вынесите в общий домен.",
      samples: stats.duplicateEntityIds.map(
        (d) => `${d.entityId}: ${d.domains.join(", ")}`,
      ),
    });
  }

  // ============ WARNINGS ============

  if (stats.mixinConflicts.length > 0) {
    issues.push({
      severity: "warning",
      count: stats.mixinConflicts.length,
      title: "Конфликты миксинов",
      description:
        "Разные миксины добавляют одинаковые вкладки к одной сущности.",
      hint: "Проверьте порядок применения миксинов — какой победит.",
      samples: stats.mixinConflicts.map(
        (c) =>
          `${c.targetFqid}: ${c.addedTabs.join(", ")} (${c.source} ↔ ${c.conflictsWith.join(", ")})`,
      ),
    });
  }

  if (stats.orphanEntities.length > 0) {
    issues.push({
      severity: "warning",
      count: stats.orphanEntities.length,
      title: "Сущности-сироты",
      description:
        "Ни на кого не ссылаются и никто не ссылается — возможно, мёртвый код.",
      hint: "Проверьте: может, сущность реально не нужна или не подключена.",
      samples: stats.orphanEntities.slice(0, 30),
    });
  }

  if (stats.attributesWithoutViews.length > 0) {
    issues.push({
      severity: "warning",
      count: stats.attributesWithoutViews.length,
      title: "Атрибуты без представления",
      description:
        "Определены, но не упомянуты ни в одном views[].widgets[] — не показываются пользователю.",
      hint: "Если атрибут реально используется — добавьте виджет.",
      samples: stats.attributesWithoutViews.slice(0, 30).map((a) => a.key),
    });
  }

  // ============ INFO ============

  if (stats.emptyDomains.length > 0) {
    issues.push({
      severity: "info",
      count: stats.emptyDomains.length,
      title: "Домены без сущностей",
      description:
        "Содержат только миксины / типы данных / последовательности — это нормально для mixin-доменов.",
      hint: "Не требует действий, если домен задуман как миксин-библиотека.",
      samples: stats.emptyDomains,
    });
  }

  if (stats.entitiesWithoutAttributes.length > 0) {
    issues.push({
      severity: "info",
      count: stats.entitiesWithoutAttributes.length,
      title: "Сущности без атрибутов",
      description: "Все атрибуты унаследованы от родителя — собственных нет.",
      hint: "Нормально, если сущность чисто маркерная.",
      samples: stats.entitiesWithoutAttributes.slice(0, 20),
    });
  }

  // ============ ORPHANS ============
  if (orphans) {
    if (orphans.views.length > 0) {
      issues.push({
        severity: "info",
        count: orphans.views.length,
        title: "Осиротевшие views",
        description:
          "Определены, но нигде не вызываются — ни в меню, ни в действиях.",
        hint: "Кандидаты на удаление или на подключение к интерфейсу.",
        samples: orphans.views
          .map((v) => `${v.domainId}/${v.id} (${v.type})`)
          .slice(0, 30),
      });
    }
    if (orphans.actions.length > 0) {
      issues.push({
        severity: "info",
        count: orphans.actions.length,
        title: "Осиротевшие actions",
        description: "Определены, но нет виджета, который бы их вызывал.",
        hint: "Возможно, не добавлены кнопки в интерфейс.",
        samples: orphans.actions
          .map((a) => `${a.domainId}/${a.id}`)
          .slice(0, 30),
      });
    }
    if (orphans.dataTypes.length > 0) {
      issues.push({
        severity: "info",
        count: orphans.dataTypes.length,
        title: "Осиротевшие типы данных",
        description: "Enum/Table/Workflow не используются ни одним атрибутом.",
        hint: "Мёртвый код — можно удалить.",
        samples: orphans.dataTypes
          .map((d) => `${d.domainId}/${d.id} (${d.kind})`)
          .slice(0, 30),
      });
    }
    if (orphans.sequences.length > 0) {
      issues.push({
        severity: "info",
        count: orphans.sequences.length,
        title: "Осиротевшие последовательности",
        description: "Не используются ни одним Identifier-атрибутом.",
        hint: "Можно удалить без последствий.",
        samples: orphans.sequences
          .map((s) => `${s.domainId}/${s.id}`)
          .slice(0, 30),
      });
    }
    if (orphans.medias.length > 0) {
      issues.push({
        severity: "info",
        count: orphans.medias.length,
        title: "Осиротевшие иконки",
        description: "Не упомянуты ни в одном виджете.",
        hint: "Можно удалить из medias[].",
        samples: orphans.medias
          .map((m) => `${m.domainId}/${m.id}`)
          .slice(0, 30),
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

  return {
    issues,
    counts,
    totalIssues: counts.error + counts.warning + counts.info,
  };
}
