import type {
  AttributeRecord,
  EntityRecord,
  ModelIndex,
} from "../../../shared/model-types";

export interface AttributeHit {
  /** Полный ключ: "domain.tld/entityid#attrid". */
  key: string;
  attribute: AttributeRecord;
  entity: EntityRecord;
  /** Почему сработало: по id, по name, по описанию. */
  matchedBy: "id" | "name" | "description";
}

export interface AttributeSearchOptions {
  /** Ограничение по доменам. Пустое — все. */
  domains?: Set<string>;
  /** Ограничение по типу данных (String, Reference, ...). Пустое — все. */
  dataTypes?: Set<string>;
  /** Искать только в атрибутах с указанным constraint. */
  constraint?: string;
  /** Максимум результатов. */
  limit?: number;
}

export interface AttributeSearchResult {
  hits: AttributeHit[];
  /** Группировка по базовому имени (lowercase) для сводки. */
  byName: Array<{ name: string; count: number; domains: string[] }>;
  totalHits: number;
}

/**
 * Поиск атрибутов по имени/id/описанию с учётом фильтров.
 * Возвращает плоский список + сводку по базовым именам.
 */
export function searchAttributes(
  index: ModelIndex,
  query: string,
  options: AttributeSearchOptions = {},
): AttributeSearchResult {
  const q = query.trim().toLowerCase();
  const limit = options.limit ?? 500;
  const domainFilter = options.domains;
  const typeFilter = options.dataTypes;
  const constraintFilter = options.constraint;

  const hits: AttributeHit[] = [];

  // Проходим по всем сущностям и атрибутам. Включая вложенные Table/Array.
  for (const entity of index.entities) {
    if (
      domainFilter &&
      domainFilter.size > 0 &&
      !domainFilter.has(entity.domainId.toLowerCase())
    ) {
      continue;
    }

    const visit = (a: AttributeRecord): void => {
      if (typeFilter && typeFilter.size > 0 && !typeFilter.has(a.dataType))
        return;
      if (constraintFilter && !a.constraints.includes(constraintFilter)) return;

      let matchedBy: AttributeHit["matchedBy"] | null = null;

      if (q) {
        if (a.id.toLowerCase().indexOf(q) !== -1) matchedBy = "id";
        else if (a.name.toLowerCase().indexOf(q) !== -1) matchedBy = "name";
        else if (a.description.toLowerCase().indexOf(q) !== -1)
          matchedBy = "description";
      } else {
        // Без query — возвращаем всё (режим «обзор»)
        matchedBy = "name";
      }

      if (matchedBy) {
        hits.push({
          key: `${entity.fqid}#${a.id}`,
          attribute: a,
          entity,
          matchedBy,
        });
      }

      if (a.nestedAttributes) a.nestedAttributes.forEach(visit);
    };

    entity.attributes.forEach(visit);
  }

  // Сводка по базовому имени
  const byNameMap = new Map<string, { count: number; domains: Set<string> }>();
  hits.forEach((h) => {
    const key = h.attribute.name.toLowerCase();
    if (!byNameMap.has(key))
      byNameMap.set(key, { count: 0, domains: new Set() });
    const entry = byNameMap.get(key)!;
    entry.count++;
    entry.domains.add(h.entity.domainId);
  });

  const byName = Array.from(byNameMap.entries())
    .map(([name, { count, domains }]) => ({
      name,
      count,
      domains: Array.from(domains).sort(),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    hits: hits.slice(0, limit),
    byName: byName.slice(0, 100),
    totalHits: hits.length,
  };
}

/** Список всех базовых типов данных, встречающихся в индексе. */
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

/** Список всех constraints, встречающихся в индексе. */
export function collectConstraints(
  index: ModelIndex,
): Array<{ kind: string; count: number }> {
  const map = new Map<string, number>();
  const visit = (a: AttributeRecord): void => {
    a.constraints.forEach((c) => {
      map.set(c, (map.get(c) || 0) + 1);
    });
    if (a.nestedAttributes) a.nestedAttributes.forEach(visit);
  };
  index.entities.forEach((e) => e.attributes.forEach(visit));
  return Array.from(map.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}
