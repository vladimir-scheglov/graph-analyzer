import type { LintIssue, LintSeverity } from "../../../shared/lint-types";
import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

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

/**
 * Возвращает цепочку предков сущности в порядке от корня.
 * Например, для Server → Device → Asset вернёт [Asset, Device].
 * Сам fqid в цепочку не включён.
 * Защита от циклов — visited + maxDepth.
 */
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
