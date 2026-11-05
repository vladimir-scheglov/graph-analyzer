// src/web/lib/model/entity-filters.ts
import type { EntityRecord, ModelIndex } from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import type { PiiHit } from "../../../shared/pii-types";

export type EntityKindFilter = "regular" | "abstract" | "static";

export type PiiFilter = "any" | "critical" | "high" | "clean";
export type IssuesFilter = "any" | "errors" | "warnings" | "clean";

export interface EntityFilters {
  query: string;
  /** Домены (lowercase). Пустое = все. */
  domains: Set<string>;
  /** Теги (lowercase). Пустое = все. */
  tags: Set<string>;
  /** Тип сущности. Пустое = все. */
  kinds: Set<EntityKindFilter>;
  hasInherits: boolean;
  hasMixins: boolean;
  onlyOrphans: boolean;
  minRefs: number;
  /** PII-риск. */
  piiFilter: PiiFilter;
  /** Наличие проблем линтера. */
  issuesFilter: IssuesFilter;
  /** Типы атрибутов (String, Reference, Table, Workflow, Enum…). Пустое = все. */
  attributeTypes: Set<string>;
}

export type EntitySortBy =
  | "refs"
  | "name"
  | "domain"
  | "attributes"
  | "issues"
  | "pii"
  | "mixins";

export type SortDir = "asc" | "desc";

export const EMPTY_FILTERS: EntityFilters = {
  query: "",
  domains: new Set(),
  tags: new Set(),
  kinds: new Set(),
  hasInherits: false,
  hasMixins: false,
  onlyOrphans: false,
  minRefs: 0,
  piiFilter: "any",
  issuesFilter: "any",
  attributeTypes: new Set(),
};

/** Полное число ссылок: дети + linkages + миксины. */
export function countRefs(e: EntityRecord, index: ModelIndex): number {
  const children = (index.entityChildrenByFqid[e.fqid] || []).length;
  const linkages = e.linkedViaLinkages.length;
  const mixins = (index.mixinsByEntityFqid[e.fqid] || []).length;
  return children + linkages + mixins;
}

/** Число миксинов на сущности (правильное, а не уникальные домены). */
export function countMixins(e: EntityRecord, index: ModelIndex): number {
  return (index.mixinsByEntityFqid[e.fqid] || []).length;
}

/** Набор базовых dataType-ов, встречающихся в атрибутах сущности. */
function collectAttributeTypes(
  e: EntityRecord,
  index: ModelIndex,
): Set<string> {
  const out = new Set<string>();
  for (const a of e.attributes) {
    out.add(a.dataType);
    if (a.itemDataType) out.add(a.itemDataType);
    // custom Enum/Workflow/Table — добавим kind для удобства
    if (a.dataTypeKind === "custom") {
      const dt = index.dataTypes.find(
        (d) => d.domainId === e.domainId && d.id === a.dataType,
      );
      if (dt) out.add(dt.kind); // "Enum" | "Workflow" | "Table"
    }
  }
  return out;
}

function entityHasPii(
  fqid: string,
  piiByFqid: Map<string, PiiHit[]>,
  mode: PiiFilter,
): boolean {
  if (mode === "any") return true;
  const hits = piiByFqid.get(fqid.toLowerCase());
  if (mode === "clean") return !hits || hits.length === 0;
  if (!hits || hits.length === 0) return false;
  if (mode === "critical") {
    return hits.some((h) => h.severity === "critical");
  }
  if (mode === "high") {
    return hits.some((h) => h.severity === "critical" || h.severity === "high");
  }
  return false;
}

function entityHasIssues(
  fqid: string,
  issuesByFqid: Map<string, LintIssue[]>,
  mode: IssuesFilter,
): boolean {
  if (mode === "any") return true;
  const issues = issuesByFqid.get(fqid.toLowerCase());
  if (mode === "clean") return !issues || issues.length === 0;
  if (!issues || issues.length === 0) return false;
  if (mode === "errors") {
    return issues.some((i) => i.severity === "error");
  }
  if (mode === "warnings") {
    return issues.some(
      (i) => i.severity === "error" || i.severity === "warning",
    );
  }
  return false;
}

/**
 * Фильтрация + сортировка одной функцией.
 * Порядок при равных значениях — по fqid (детерминированно).
 */
export function filterAndSortEntities(
  index: ModelIndex,
  filters: EntityFilters,
  sortBy: EntitySortBy,
  sortDir: SortDir,
  piiByFqid: Map<string, PiiHit[]>,
  issuesByFqid: Map<string, LintIssue[]>,
): EntityRecord[] {
  const q = filters.query.trim().toLowerCase();
  const orphanSet = new Set(index.stats.orphanEntities);

  const filtered = index.entities.filter((e) => {
    if (
      filters.domains.size > 0 &&
      !filters.domains.has(e.domainId.toLowerCase())
    )
      return false;

    if (filters.tags.size > 0) {
      const hasTag = e.domainTags.some((t) =>
        filters.tags.has(String(t).toLowerCase()),
      );
      if (!hasTag) return false;
    }

    if (filters.kinds.size > 0) {
      const kind = (e.kind || "regular") as EntityKindFilter;
      if (!filters.kinds.has(kind)) return false;
    }

    if (filters.hasInherits && !e.inherits) return false;
    if (filters.hasMixins && countMixins(e, index) === 0) return false;
    if (filters.onlyOrphans && !orphanSet.has(e.fqid)) return false;

    if (filters.minRefs > 0) {
      const refs = countRefs(e, index);
      if (refs < filters.minRefs) return false;
    }

    if (!entityHasPii(e.fqid, piiByFqid, filters.piiFilter)) return false;
    if (!entityHasIssues(e.fqid, issuesByFqid, filters.issuesFilter))
      return false;

    if (filters.attributeTypes.size > 0) {
      const types = collectAttributeTypes(e, index);
      let hasAny = false;
      for (const t of filters.attributeTypes) {
        if (types.has(t)) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny) return false;
    }

    if (q) {
      const hay = [
        e.fqid,
        e.name,
        e.description,
        ...e.attributes.map((a) => `${a.id} ${a.name}`),
      ]
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }

    return true;
  });

  const dir = sortDir === "asc" ? 1 : -1;

  const getValue = (e: EntityRecord): number | string => {
    switch (sortBy) {
      case "name":
        return (e.name || e.entityId).toLowerCase();
      case "domain":
        return e.domainId.toLowerCase();
      case "attributes":
        return e.attributes.length;
      case "mixins":
        return countMixins(e, index);
      case "issues":
        return issuesByFqid.get(e.fqid.toLowerCase())?.length ?? 0;
      case "pii":
        return piiByFqid.get(e.fqid.toLowerCase())?.length ?? 0;
      case "refs":
      default:
        return countRefs(e, index);
    }
  };

  filtered.sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.fqid.localeCompare(b.fqid);
  });

  return filtered;
}

// Обратная совместимость — старая сигнатура.
export function filterEntities(
  index: ModelIndex,
  filters: EntityFilters,
): EntityRecord[] {
  const piiByFqid = new Map<string, PiiHit[]>();
  for (const h of index.pii.hits) {
    const k = h.entityFqid.toLowerCase();
    if (!piiByFqid.has(k)) piiByFqid.set(k, []);
    piiByFqid.get(k)!.push(h);
  }
  const issuesByFqid = new Map<string, LintIssue[]>();
  for (const i of index.lint.lintReport.issues) {
    if (!i.entityFqid) continue;
    const k = i.entityFqid.toLowerCase();
    if (!issuesByFqid.has(k)) issuesByFqid.set(k, []);
    issuesByFqid.get(k)!.push(i);
  }
  return filterAndSortEntities(
    index,
    filters,
    "refs",
    "desc",
    piiByFqid,
    issuesByFqid,
  );
}
