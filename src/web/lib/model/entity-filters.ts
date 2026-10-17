import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

export interface EntityFilters {
  query: string;
  /** Домены (нижний регистр). Пустое множество = все. */
  domains: Set<string>;
  /** Теги (нижний регистр). Пустое множество = все. */
  tags: Set<string>;
  /** true — только с родителем. false — не фильтруем. */
  hasInherits: boolean;
  /** true — только с миксинами. */
  hasMixins: boolean;
  /** true — только сироты. */
  onlyOrphans: boolean;
  /** Минимальное количество ссылок (наследники + связи + миксины). */
  minRefs: number;
}

export const EMPTY_FILTERS: EntityFilters = {
  query: "",
  domains: new Set(),
  tags: new Set(),
  hasInherits: false,
  hasMixins: false,
  onlyOrphans: false,
  minRefs: 0,
};

/**
 * Полное число ссылок на сущность: дети по наследованию + linkages + миксины.
 */
export function countRefs(e: EntityRecord, index: ModelIndex): number {
  const children = (index.entityChildrenByFqid[e.fqid] || []).length;
  const linkages = e.linkedViaLinkages.length;
  const mixins = (index.mixinsByEntityFqid[e.fqid] || []).length;
  return children + linkages + mixins;
}

/**
 * Фильтрация сущностей. Результат отсортирован:
 *   1) по количеству ссылок (убывание)
 *   2) по FQID (возрастание)
 */
export function filterEntities(
  index: ModelIndex,
  filters: EntityFilters,
): EntityRecord[] {
  const q = filters.query.trim().toLowerCase();
  const orphanSet = new Set(index.stats.orphanEntities);

  const result = index.entities.filter((e) => {
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

    if (filters.hasInherits && !e.inherits) return false;
    if (filters.hasMixins && e.mixinSources.length === 0) return false;
    if (filters.onlyOrphans && !orphanSet.has(e.fqid)) return false;

    if (filters.minRefs > 0) {
      const refs = countRefs(e, index);
      if (refs < filters.minRefs) return false;
    }

    if (q) {
      const hay =
        e.fqid +
        " " +
        e.name +
        " " +
        e.description +
        " " +
        e.attributes.map((a) => a.name).join(" ");
      if (hay.toLowerCase().indexOf(q) === -1) return false;
    }

    return true;
  });

  return result.sort((a, b) => {
    const ra = countRefs(a, index);
    const rb = countRefs(b, index);
    if (ra !== rb) return rb - ra;
    return a.fqid.localeCompare(b.fqid);
  });
}
