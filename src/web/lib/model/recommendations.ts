// src/web/lib/model/recommendations.ts
import type { ModelIndex } from "../../../shared/model-types";

export type RecommendationKind =
  | "cycle"
  | "broken-ref"
  | "pii"
  | "lint"
  | "unused-attribute"
  | "missing-description"
  | "empty-domain"
  | "orphan"
  | "mixin-conflict";

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  severity: "error" | "warning" | "info";
  /** «Влияние» — на сколько мест в модели это влияет. */
  impact: number;
  title: string;
  description: string;
  /** Конкретные FQID / domanIds, на которые можно перейти. */
  targets: string[];
  /** Быстрое действие, если есть. */
  action?: {
    label: string;
    /** Специальные значения, которые UI обрабатывает. */
    kind: "open-lint" | "open-pii" | "open-entity" | "open-domain";
    payload?: string;
  };
}

/**
 * Сводит все сигналы (циклы, PII, lint, unused) в приоритизированный
 * список «что улучшить в первую очередь». Impact = downstream usage.
 */
export function computeRecommendations(index: ModelIndex): Recommendation[] {
  const out: Recommendation[] = [];

  // ── 1. Циклы ──
  if (index.stats.circularInheritance.length > 0) {
    out.push({
      id: "rec:cycle",
      kind: "cycle",
      severity: "error",
      impact: index.stats.circularInheritance.length * 3,
      title: "Циклы в наследовании",
      description: `${index.stats.circularInheritance.length} сущностей в цикле — блокирует публикацию`,
      targets: index.stats.circularInheritance.slice(0, 10),
      action: { kind: "open-lint", label: "Открыть линтер" },
    });
  }

  // ── 2. Битые ссылки ──
  if (index.stats.unknownReferences.length > 0) {
    out.push({
      id: "rec:broken-refs",
      kind: "broken-ref",
      severity: "error",
      impact: index.stats.unknownReferences.length * 2,
      title: "Битые FQID-ссылки",
      description: `${index.stats.unknownReferences.length} ссылок на несуществующие сущности`,
      targets: index.stats.unknownReferences.slice(0, 10).map((r) => r.from),
      action: { kind: "open-lint", label: "Открыть линтер" },
    });
  }

  // ── 3. PII critical ──
  const piiCritical = index.pii.stats.bySeverity.critical;
  if (piiCritical > 0) {
    const top = index.pii.hits
      .filter((h) => h.severity === "critical")
      .slice(0, 10)
      .map((h) => h.entityFqid);
    out.push({
      id: "rec:pii-critical",
      kind: "pii",
      severity: "error",
      impact: piiCritical * 2,
      title: "PII спецкатегорий",
      description: `${piiCritical} атрибутов требуют особой защиты (GDPR Art. 9 / 152-ФЗ)`,
      targets: Array.from(new Set(top)),
      action: { kind: "open-pii", label: "Открыть PII" },
    });
  }

  // ── 4. Ошибки линтера ──
  const lintErrors = index.lint.lintReport.stats.bySeverity.error;
  if (lintErrors > 0) {
    // Группируем по правилу — самые частые вперёд
    const byRule = index.lint.lintReport.stats.byRule
      .filter((r) => r.severity === "error")
      .sort((a, b) => b.count - a.count);
    const topRule = byRule[0];
    out.push({
      id: "rec:lint-errors",
      kind: "lint",
      severity: "error",
      impact: lintErrors,
      title: "Ошибки линтера",
      description: topRule
        ? `${lintErrors} ошибок. Чаще всего: «${topRule.rule}» (${topRule.count})`
        : `${lintErrors} ошибок`,
      targets: [],
      action: { kind: "open-lint", label: "Открыть линтер" },
    });
  }

  // ── 5. Неиспользуемые атрибуты ──
  if (index.stats.attributesWithoutViews.length > 0) {
    out.push({
      id: "rec:unused-attrs",
      kind: "unused-attribute",
      severity: "warning",
      impact: index.stats.attributesWithoutViews.length,
      title: "Неиспользуемые атрибуты",
      description: `${index.stats.attributesWithoutViews.length} атрибутов не упомянуты ни в views, ни в dataRules`,
      targets: index.stats.attributesWithoutViews
        .slice(0, 10)
        .map((a) => a.entityFqid),
      action: { kind: "open-lint", label: "Открыть линтер" },
    });
  }

  // ── 6. Пустые description у сущностей ──
  const noDescription = index.entities.filter(
    (e) => !e.description || !e.description.trim(),
  );
  if (noDescription.length > 0) {
    out.push({
      id: "rec:no-description",
      kind: "missing-description",
      severity: "info",
      impact: noDescription.length,
      title: "Сущности без описания",
      description: `${noDescription.length} сущностей — добавьте description для онбординга`,
      targets: noDescription.slice(0, 10).map((e) => e.fqid),
    });
  }

  // ── 7. Миксин-конфликты ──
  if (index.stats.mixinConflicts.length > 0) {
    out.push({
      id: "rec:mixin-conflicts",
      kind: "mixin-conflict",
      severity: "warning",
      impact: index.stats.mixinConflicts.length * 2,
      title: "Конфликты миксинов",
      description: `${index.stats.mixinConflicts.length} сущностей получают одинаковые табы из разных миксинов`,
      targets: index.stats.mixinConflicts.slice(0, 10).map((c) => c.targetFqid),
    });
  }

  // ── 8. Сироты ──
  if (index.stats.orphanEntities.length > 0) {
    out.push({
      id: "rec:orphans",
      kind: "orphan",
      severity: "info",
      impact: index.stats.orphanEntities.length,
      title: "Сущности-сироты",
      description: `${index.stats.orphanEntities.length} сущностей без входящих и исходящих связей`,
      targets: index.stats.orphanEntities.slice(0, 10),
    });
  }

  // Сортировка: severity → impact desc
  const severityRank: Record<Recommendation["severity"], number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return out.sort((a, b) => {
    if (a.severity !== b.severity)
      return severityRank[a.severity] - severityRank[b.severity];
    return b.impact - a.impact;
  });
}
