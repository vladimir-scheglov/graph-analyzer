// src/web/components/modals/DomainSchemaHelpers.ts
import type { LintIssue, LintSeverity } from "../../../shared/lint-types";
import type {
  EntityRecord,
  ModelIndex,
  SectionKey,
} from "../../../shared/model-types";
import { SECTION_LABELS } from "../../lib/consts";

const SEVERITY_RANK: Record<LintSeverity, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

export function maxSeverity(issues: LintIssue[]): LintSeverity | null {
  if (issues.length === 0) return null;
  let max: LintSeverity = "info";
  for (const i of issues) {
    if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[max]) max = i.severity;
  }
  return max;
}

export function findAncestorChain(
  fqid: string,
  index: ModelIndex,
  maxDepth = 10,
): EntityRecord[] {
  const chain: EntityRecord[] = [];
  const seen = new Set<string>();
  const start = index.entitiesByFqid[fqid];
  if (!start || !start.inherits) return chain;

  let current: EntityRecord | undefined = index.entitiesByFqid[start.inherits];
  while (current && !seen.has(current.fqid) && chain.length < maxDepth) {
    chain.unshift(current);
    seen.add(current.fqid);
    current = current.inherits
      ? index.entitiesByFqid[current.inherits]
      : undefined;
  }
  return chain;
}

export function pluralAttrs(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "атрибут";
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "атрибута";
  return "атрибутов";
}

export function searchableStringsForEntity(
  item: any,
  index: ModelIndex | null,
  domainId: string,
): string[] {
  const hay: string[] = [];
  if (item.id) hay.push(String(item.id));
  if (item.name) hay.push(String(item.name));
  if (index && domainId && item.id) {
    const fqid = `${domainId}/${item.id}`.toLowerCase();
    const entity = index.entitiesByFqid[fqid];
    if (entity) {
      if (entity.label) hay.push(entity.label);
      if (entity.description) hay.push(entity.description);
      entity.attributes.forEach((a) => {
        hay.push(a.id);
        if (a.name) hay.push(a.name);
      });
    }
  }
  return hay;
}

export function searchableStringsForDataType(
  item: any,
  index: ModelIndex | null,
  domainId: string,
): string[] {
  const hay: string[] = [];
  if (item.id) hay.push(String(item.id));
  if (item.name) hay.push(String(item.name));
  if (index && domainId && item.id) {
    const dt = index.dataTypes.find(
      (d) => d.id === item.id && d.domainId === domainId,
    );
    if (dt) {
      (dt.values || []).forEach((v) => hay.push(v));
      (dt.statuses || []).forEach((s) => hay.push(s));
      (dt.columns || []).forEach((c) => hay.push(c));
      if (dt.description) hay.push(dt.description);
    }
  }
  return hay;
}

export function searchableStringsForGeneric(item: any): string[] {
  const hay: string[] = [];
  [
    "id",
    "name",
    "label",
    "route",
    "side1",
    "side2",
    "entity",
    "view",
    "type",
    "kind",
    "effect",
  ].forEach((k) => {
    if (item[k]) hay.push(String(item[k]));
  });
  return hay;
}

export function matchesQuery(haystack: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((s) => s.toLowerCase().includes(q));
}

// ============ NEW: issues по секциям ============

/** Все issues домена, сгруппированные по sectionKey. */
export function groupIssuesBySection(
  domainId: string,
  index: ModelIndex,
): Map<SectionKey, LintIssue[]> {
  const result = new Map<SectionKey, LintIssue[]>();
  for (const issue of index.lint.lintReport.issues) {
    if (issue.domainId !== domainId) continue;
    if (!issue.propertyPath) continue;
    const m = issue.propertyPath.match(/^([a-zA-Z]+)\[/);
    if (!m) continue;
    const key = m[1] as SectionKey;
    if (!(key in SECTION_LABELS)) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(issue);
  }
  return result;
}

/**
 * Map<itemId, issues[]> для конкретной секции.
 *   - entities → entityId (из propertyPath `entities[X]` или `entityFqid`)
 *   - linkages → linkageId
 *   - views → viewId
 *   - и т.п.
 */
export function buildItemIssuesMap(
  sectionKey: SectionKey,
  domainId: string,
  index: ModelIndex,
): Map<string, LintIssue[]> {
  const m = new Map<string, LintIssue[]>();
  const add = (id: string, issue: LintIssue) => {
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push(issue);
  };

  for (const issue of index.lint.lintReport.issues) {
    if (issue.domainId !== domainId) continue;

    if (sectionKey === "entities" && issue.entityFqid) {
      const eid = issue.entityFqid.split("/")[1];
      if (eid) add(eid, issue);
      continue;
    }

    if (!issue.propertyPath) continue;
    const re = new RegExp(`^${sectionKey}\\[([^\\]]+)\\]`);
    const match = issue.propertyPath.match(re);
    if (!match) continue;
    const id = match[1];
    if (id === ".." || id === "*") continue;
    add(id, issue);
  }
  return m;
}

// ============ NEW: доп. метрика для заголовка секции ============

export function getSectionExtraInfo(
  sectionKey: SectionKey,
  domainId: string,
  index: ModelIndex,
): string | null {
  switch (sectionKey) {
    case "entities": {
      const list = index.entities.filter((e) => e.domainId === domainId);
      if (list.length === 0) return null;
      const withInherits = list.filter((e) => e.inherits).length;
      const withParents = list.filter(
        (e) => (index.entityChildrenByFqid[e.fqid] || []).length > 0,
      ).length;
      const parts: string[] = [];
      if (withInherits > 0) parts.push(`${withInherits} наследуют`);
      if (withParents > 0) parts.push(`${withParents} родители`);
      return parts.join(" · ") || null;
    }
    case "linkages": {
      const list = index.entityLinkages.filter((l) => l.domainId === domainId);
      if (list.length === 0) return null;
      const byType = new Map<string, number>();
      list.forEach((l) => byType.set(l.type, (byType.get(l.type) || 0) + 1));
      return Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t}: ${c}`)
        .join(" · ");
    }
    case "dataTypes": {
      const list = index.dataTypes.filter((d) => d.domainId === domainId);
      if (list.length === 0) return null;
      const byKind = new Map<string, number>();
      list.forEach((d) => byKind.set(d.kind, (byKind.get(d.kind) || 0) + 1));
      return Array.from(byKind.entries())
        .map(([k, c]) => `${k}: ${c}`)
        .join(" · ");
    }
    case "actions": {
      const list = index.actions.filter((a) => a.domainId === domainId);
      if (list.length === 0) return null;
      const byType = new Map<string, number>();
      list.forEach((a) => byType.set(a.type, (byType.get(a.type) || 0) + 1));
      return Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t, c]) => `${t}: ${c}`)
        .join(" · ");
    }
    case "views": {
      const schema = index.schemasByDomain[domainId];
      const items = schema?.sections.views.items || [];
      if (items.length === 0) return null;
      const byType = new Map<string, number>();
      items.forEach((v: any) =>
        byType.set(v.type, (byType.get(v.type) || 0) + 1),
      );
      return Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t}: ${c}`)
        .join(" · ");
    }
    case "menus": {
      const list = index.menus.filter((m) => m.domainId === domainId);
      if (list.length === 0) return null;
      const roots = list.filter((m) => m.type === "root_group").length;
      const items = list.reduce((s, m) => s + (m.items?.length || 0), 0);
      return `${roots} root · ${items} items`;
    }
    case "dataRules": {
      const list = index.dataRules.filter((r) => r.domainId === domainId);
      if (list.length === 0) return null;
      const byEffect = new Map<string, number>();
      list.forEach((r) =>
        byEffect.set(r.effect, (byEffect.get(r.effect) || 0) + 1),
      );
      return Array.from(byEffect.entries())
        .map(([e, c]) => `${e}: ${c}`)
        .join(" · ");
    }
    case "mixins": {
      const list = index.mixins.filter((m) => m.domainId === domainId);
      if (list.length === 0) return null;
      const byType = new Map<string, number>();
      list.forEach((m) => byType.set(m.type, (byType.get(m.type) || 0) + 1));
      return Array.from(byType.entries())
        .map(([t, c]) => `${t}: ${c}`)
        .join(" · ");
    }
    default:
      return null;
  }
}

// ============ NEW: метрики домена для шапки ============

export interface DomainHeaderMetrics {
  sonar: { score: number; grade: string } | null;
  pii: {
    total: number;
    critical: number;
  };
  issues: {
    total: number;
    error: number;
    warning: number;
    info: number;
  };
  orphans: {
    entities: number;
    views: number;
    actions: number;
    dataTypes: number;
    medias: number;
  };
  entityCount: number;
  attributeCount: number;
  linkageCount: number;
  viewCount: number;
}

export function computeDomainHeaderMetrics(
  domainId: string,
  index: ModelIndex,
): DomainHeaderMetrics {
  const domainLower = domainId.toLowerCase();

  const sonar = index.lint.sonar.byDomain[domainId] || null;

  const pii = index.pii.hits.filter((h) =>
    h.entityFqid.toLowerCase().startsWith(domainLower + "/"),
  );
  const piiCritical = pii.filter((h) => h.severity === "critical").length;

  const issues = index.lint.lintReport.issues.filter(
    (i) => i.domainId === domainId,
  );
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const orphans = {
    entities: index.stats.orphanEntities.filter((fqid) =>
      fqid.toLowerCase().startsWith(domainLower + "/"),
    ).length,
    views: index.orphans.views.filter((v) => v.domainId === domainId).length,
    actions: index.orphans.actions.filter((a) => a.domainId === domainId)
      .length,
    dataTypes: index.orphans.dataTypes.filter((d) => d.domainId === domainId)
      .length,
    medias: index.orphans.medias.filter((m) => m.domainId === domainId).length,
  };

  const entities = index.entities.filter((e) => e.domainId === domainId);
  const entityCount = entities.length;
  const attributeCount = entities.reduce((s, e) => {
    let c = e.attributes.length;
    e.attributes.forEach((a) => {
      if (a.nestedAttributes) c += a.nestedAttributes.length;
    });
    return s + c;
  }, 0);

  const schema = index.schemasByDomain[domainId];
  const viewCount = schema?.sections.views.count || 0;
  const linkageCount = index.entityLinkages.filter(
    (l) => l.domainId === domainId,
  ).length;

  return {
    sonar: sonar ? { score: sonar.score, grade: sonar.grade } : null,
    pii: { total: pii.length, critical: piiCritical },
    issues: {
      total: issues.length,
      error: errorCount,
      warning: warningCount,
      info: infoCount,
    },
    orphans,
    entityCount,
    attributeCount,
    linkageCount,
    viewCount,
  };
}
