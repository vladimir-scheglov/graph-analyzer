import type {
  AttributeRecord,
  EntityRecord,
  ModelIndex,
} from "../../../shared/model-types";

// ============ Типы ============

export type AttributeMatchBy = "id" | "name" | "description";

export type PiiSeverity = "critical" | "high" | "medium" | "low";

export interface AttributeHit {
  /** "domain.tld/entityid#attrid". */
  key: string;
  attribute: AttributeRecord;
  entity: EntityRecord;
  matchedBy: AttributeMatchBy;
  score: number;
  isNested: boolean;
  /** Сколько других сущностей имеют атрибут с тем же name (в другом домене). */
  crossDomainUsages: number;
  /** Reference / Array<Reference> target FQID (lowercase). */
  referenceTarget: string | null;
  isPii: boolean;
  piiSeverity?: PiiSeverity;
}

export interface FacetItem {
  value: string;
  count: number;
  active: boolean;
}

export interface AttributeFacets {
  dataTypes: FacetItem[];
  constraints: FacetItem[];
  domains: FacetItem[];
  referenceTargets: FacetItem[];
  flags: {
    total: number;
    required: number;
    readonly: number;
    unused: number;
    pii: number;
    crossDomain: number;
  };
}

export interface AttributeFilterState {
  query: string;
  searchInDescription: boolean;
  dataTypes: Set<string>;
  constraints: Set<string>;
  domains: Set<string>;
  referenceTargets: Set<string>;
  onlyRequired: boolean;
  onlyReadonly: boolean;
  onlyUnused: boolean;
  onlyPii: boolean;
  onlyCrossDomain: boolean;
}

export const EMPTY_ATTRIBUTE_FILTERS: AttributeFilterState = {
  query: "",
  searchInDescription: true,
  dataTypes: new Set(),
  constraints: new Set(),
  domains: new Set(),
  referenceTargets: new Set(),
  onlyRequired: false,
  onlyReadonly: false,
  onlyUnused: false,
  onlyPii: false,
  onlyCrossDomain: false,
};

export type AttributeSortBy =
  | "relevance"
  | "id"
  | "dataType"
  | "domain"
  | "usages";

export type AttributeGroupMode = "flat" | "dataType" | "domain" | "baseName";

export interface AttributeNameSummary {
  name: string;
  count: number;
  domains: string[];
  /** Пример хита — чтобы показать превью. */
  sample: AttributeHit;
}

export interface AttributeSearchResult {
  hits: AttributeHit[];
  facets: AttributeFacets;
  byName: AttributeNameSummary[];
  total: number;
  truncated: boolean;
}

export interface AttributeSearchOptions {
  limit?: number;
  sortBy?: AttributeSortBy;
}

// ============ Helpers ============

export function hasActiveFilters(f: AttributeFilterState): boolean {
  return (
    !!f.query.trim() ||
    f.dataTypes.size > 0 ||
    f.constraints.size > 0 ||
    f.domains.size > 0 ||
    f.referenceTargets.size > 0 ||
    f.onlyRequired ||
    f.onlyReadonly ||
    f.onlyUnused ||
    f.onlyPii ||
    f.onlyCrossDomain
  );
}

function attrMatchesQuery(
  a: AttributeRecord,
  q: string,
  searchDesc: boolean,
): {
  matchedBy: AttributeMatchBy | null;
  score: number;
} {
  if (!q) return { matchedBy: "name", score: 0 };
  const idL = a.id.toLowerCase();
  const nameL = (a.name || "").toLowerCase();
  if (idL === q) return { matchedBy: "id", score: 1000 };
  if (nameL === q) return { matchedBy: "name", score: 900 };
  if (idL.startsWith(q)) return { matchedBy: "id", score: 750 };
  if (nameL.startsWith(q)) return { matchedBy: "name", score: 700 };
  if (idL.includes(q)) return { matchedBy: "id", score: 500 };
  if (nameL.includes(q)) return { matchedBy: "name", score: 400 };
  if (searchDesc && (a.description || "").toLowerCase().includes(q)) {
    return { matchedBy: "description", score: 200 };
  }
  return { matchedBy: null, score: 0 };
}

function sortHits(
  hits: AttributeHit[],
  sortBy: AttributeSortBy,
  q: string,
): void {
  if (sortBy === "relevance" && !q) sortBy = "id";
  hits.sort((a, b) => {
    switch (sortBy) {
      case "id":
        return (
          a.attribute.id.localeCompare(b.attribute.id) ||
          a.key.localeCompare(b.key)
        );
      case "dataType":
        return (
          a.attribute.dataType.localeCompare(b.attribute.dataType) ||
          a.attribute.id.localeCompare(b.attribute.id) ||
          a.key.localeCompare(b.key)
        );
      case "domain":
        return (
          a.entity.domainId.localeCompare(b.entity.domainId) ||
          a.attribute.id.localeCompare(b.attribute.id) ||
          a.key.localeCompare(b.key)
        );
      case "usages": {
        const ua = a.attribute.usedInViews + a.attribute.usedInRules;
        const ub = b.attribute.usedInViews + b.attribute.usedInRules;
        if (ua !== ub) return ub - ua;
        return a.attribute.id.localeCompare(b.attribute.id);
      }
      case "relevance":
      default: {
        if (b.score !== a.score) return b.score - a.score;
        const la = a.attribute.id.length;
        const lb = b.attribute.id.length;
        if (la !== lb) return la - lb;
        return a.key.localeCompare(b.key);
      }
    }
  });
}

// ============ Главный поиск ============

export function searchAttributes(
  index: ModelIndex,
  filters: AttributeFilterState,
  options: AttributeSearchOptions = {},
): AttributeSearchResult {
  const q = filters.query.trim().toLowerCase();
  const limit = options.limit ?? 500;
  const sortBy = options.sortBy ?? "relevance";

  // ---- PII: индекс ключей ----
  const piiByKey = new Map<string, { severity: PiiSeverity }>();
  for (const h of index.pii?.hits || []) {
    piiByKey.set(h.key, { severity: h.severity as PiiSeverity });
  }

  // ---- Cross-domain name lookup ----
  // attributesByNormalizedName: "email" → ["d1/Entity1#email", "d2/Entity2#email"]
  const crossDomainByName = new Map<string, number>();
  const byName = index.attributesByNormalizedName || {};
  for (const [name, keys] of Object.entries(byName)) {
    if (keys.length > 1) crossDomainByName.set(name.toLowerCase(), keys.length);
  }

  const hasDataTypes = filters.dataTypes.size > 0;
  const hasConstraints = filters.constraints.size > 0;
  const hasDomains = filters.domains.size > 0;
  const hasRefs = filters.referenceTargets.size > 0;

  // ---- 1. Сбор всех кандидатов (только query-filter) ----
  const allHits: AttributeHit[] = [];

  for (const entity of index.entities) {
    const visit = (a: AttributeRecord, isNested: boolean) => {
      const { matchedBy, score } = attrMatchesQuery(
        a,
        q,
        filters.searchInDescription,
      );
      if (!matchedBy) return;

      const key = `${entity.fqid}#${a.id}`;
      const pii = piiByKey.get(key);

      const refTarget = a.referenceEntity || a.itemReferenceEntity || null;
      const baseName = (a.name || a.id).toLowerCase();
      const crossDomainUsages = Math.max(
        0,
        (crossDomainByName.get(baseName) || 1) - 1,
      );

      allHits.push({
        key,
        attribute: a,
        entity,
        matchedBy,
        score,
        isNested,
        crossDomainUsages,
        referenceTarget: refTarget,
        isPii: !!pii,
        piiSeverity: pii?.severity,
      });
    };
    for (const a of entity.attributes) {
      visit(a, false);
      if (a.nestedAttributes)
        for (const na of a.nestedAttributes) visit(na, true);
    }
  }

  // ---- 2. Проверка «проходит все фильтры, кроме одной группы» ----
  // disjunctive faceting: для фасета F считаем значения при применённых
  // всех ДРУГИХ фильтрах. Так пользователь видит, что доступно, если
  // снять текущий фильтр F.
  const passes = (h: AttributeHit, except: string): boolean => {
    if (
      except !== "dataTypes" &&
      hasDataTypes &&
      !filters.dataTypes.has(h.attribute.dataType)
    )
      return false;
    if (except !== "constraints" && hasConstraints) {
      for (const c of filters.constraints) {
        if (!h.attribute.constraints.includes(c)) return false;
      }
    }
    if (
      except !== "domains" &&
      hasDomains &&
      !filters.domains.has(h.entity.domainId.toLowerCase())
    )
      return false;
    if (except !== "referenceTargets" && hasRefs) {
      if (
        !h.referenceTarget ||
        !filters.referenceTargets.has(h.referenceTarget.toLowerCase())
      )
        return false;
    }
    if (
      except !== "onlyRequired" &&
      filters.onlyRequired &&
      !h.attribute.constraints.includes("required")
    )
      return false;
    if (
      except !== "onlyReadonly" &&
      filters.onlyReadonly &&
      !h.attribute.readonly
    )
      return false;
    if (
      except !== "onlyUnused" &&
      filters.onlyUnused &&
      !(h.attribute.usedInViews === 0 && h.attribute.usedInRules === 0)
    )
      return false;
    if (except !== "onlyPii" && filters.onlyPii && !h.isPii) return false;
    if (
      except !== "onlyCrossDomain" &&
      filters.onlyCrossDomain &&
      h.crossDomainUsages === 0
    )
      return false;
    return true;
  };

  // ---- 3. Facet-счётчики ----
  const dtCount = new Map<string, number>();
  const cCount = new Map<string, number>();
  const dCount = new Map<string, number>();
  const rCount = new Map<string, number>();

  for (const h of allHits) {
    if (passes(h, "dataTypes")) {
      dtCount.set(
        h.attribute.dataType,
        (dtCount.get(h.attribute.dataType) || 0) + 1,
      );
    }
    if (passes(h, "constraints")) {
      for (const c of h.attribute.constraints) {
        cCount.set(c, (cCount.get(c) || 0) + 1);
      }
    }
    if (passes(h, "domains")) {
      dCount.set(h.entity.domainId, (dCount.get(h.entity.domainId) || 0) + 1);
    }
    if (passes(h, "referenceTargets") && h.referenceTarget) {
      rCount.set(h.referenceTarget, (rCount.get(h.referenceTarget) || 0) + 1);
    }
  }

  const buildFacet = (
    m: Map<string, number>,
    activeSet: Set<string>,
  ): FacetItem[] =>
    Array.from(m.entries())
      .map(([value, count]) => ({
        value,
        count,
        active: activeSet.has(value.toLowerCase()) || activeSet.has(value),
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.value.localeCompare(b.value);
      });

  const facets: AttributeFacets = {
    dataTypes: buildFacet(dtCount, filters.dataTypes),
    constraints: buildFacet(cCount, filters.constraints),
    domains: buildFacet(dCount, filters.domains),
    referenceTargets: buildFacet(rCount, filters.referenceTargets),
    flags: {
      total: allHits.filter((h) => passes(h, "")).length,
      required: allHits.filter(
        (h) =>
          h.attribute.constraints.includes("required") &&
          passes(h, "onlyRequired"),
      ).length,
      readonly: allHits.filter(
        (h) => !!h.attribute.readonly && passes(h, "onlyReadonly"),
      ).length,
      unused: allHits.filter(
        (h) =>
          h.attribute.usedInViews === 0 &&
          h.attribute.usedInRules === 0 &&
          passes(h, "onlyUnused"),
      ).length,
      pii: allHits.filter((h) => h.isPii && passes(h, "onlyPii")).length,
      crossDomain: allHits.filter(
        (h) => h.crossDomainUsages > 0 && passes(h, "onlyCrossDomain"),
      ).length,
    },
  };

  // ---- 4. Финальная фильтрация + сортировка + limit ----
  const filtered = allHits.filter((h) => passes(h, ""));
  sortHits(filtered, sortBy, q);

  // ---- 5. byName summary (по всем отфильтрованным, до limit) ----
  const nameMap = new Map<
    string,
    { count: number; domains: Set<string>; sample: AttributeHit }
  >();
  for (const h of filtered) {
    const base = (h.attribute.name || h.attribute.id).toLowerCase();
    if (!nameMap.has(base)) {
      nameMap.set(base, { count: 0, domains: new Set(), sample: h });
    }
    const e = nameMap.get(base)!;
    e.count++;
    e.domains.add(h.entity.domainId);
  }
  const byNameSummary: AttributeNameSummary[] = Array.from(nameMap.entries())
    .map(([name, { count, domains, sample }]) => ({
      name,
      count,
      domains: Array.from(domains).sort(),
      sample,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    hits: filtered.slice(0, limit),
    facets,
    byName: byNameSummary,
    total: filtered.length,
    truncated: filtered.length > limit,
  };
}

// ============ Legacy helpers (оставлены для совместимости) ============

export function collectDataTypes(
  index: ModelIndex,
): Array<{ type: string; count: number }> {
  const map = new Map<string, number>();
  index.entities.forEach((e) => {
    e.attributes.forEach((a) => {
      map.set(a.dataType, (map.get(a.dataType) || 0) + 1);
      if (a.nestedAttributes) {
        a.nestedAttributes.forEach((na) => {
          map.set(na.dataType, (map.get(na.dataType) || 0) + 1);
        });
      }
    });
  });
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function collectConstraints(
  index: ModelIndex,
): Array<{ kind: string; count: number }> {
  const map = new Map<string, number>();
  const visit = (a: AttributeRecord): void => {
    a.constraints.forEach((c) => map.set(c, (map.get(c) || 0) + 1));
    if (a.nestedAttributes) a.nestedAttributes.forEach(visit);
  };
  index.entities.forEach((e) => e.attributes.forEach(visit));
  return Array.from(map.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}
