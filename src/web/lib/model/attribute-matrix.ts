import type { ModelIndex } from "../../../shared/model-types";

export interface AttributeMatrixColumn {
  /** Нормализованное имя (lowercase). */
  key: string;
  /** Отображаемое имя — самое частое написание. */
  label: string;
  /** Сколько сущностей содержат атрибут с таким именем. */
  count: number;
  /** Типы, в которых встречается (String, Reference, ...). */
  dataTypes: string[];
  /** Если все типы одинаковые — true. */
  consistentType: boolean;
}

export interface AttributeMatrixRow {
  entityFqid: string;
  entityId: string;
  domainId: string;
  /** Какие ключи-атрибуты есть у этой сущности. */
  present: Set<string>;
  /** Общее количество атрибутов. */
  attributesCount: number;
}

export interface AttributeMatrix {
  columns: AttributeMatrixColumn[];
  rows: AttributeMatrixRow[];
  stats: {
    totalColumns: number;
    totalRows: number;
    /** Атрибуты с разными типами в разных сущностях. */
    inconsistentTypes: AttributeMatrixColumn[];
    /** Атрибуты, встречающиеся только один раз. */
    singletons: AttributeMatrixColumn[];
  };
}

export interface AttributeMatrixOptions {
  /** Ограничить доменами (lowercase). */
  domains?: Set<string>;
  /** Минимальное количество сущностей с этим атрибутом (default: 2). */
  minOccurrences?: number;
  /** Максимум колонок (default: 40). */
  maxColumns?: number;
  /** Максимум строк (default: 100). */
  maxRows?: number;
}

/**
 * Строит матрицу «сущность × имя атрибута».
 *
 * Идея: показать, какие имена атрибутов повторяются, где типы разные,
 * где атрибуты-одиночки.
 */
export function buildAttributeMatrix(
  index: ModelIndex,
  options: AttributeMatrixOptions = {},
): AttributeMatrix {
  const minOccurrences = options.minOccurrences ?? 2;
  const maxColumns = options.maxColumns ?? 40;
  const maxRows = options.maxRows ?? 100;
  const domainFilter = options.domains;

  // ============ Сбор атрибутов ============
  interface AttrStat {
    key: string;
    /** Сколько раз встречается именно такое написание. */
    spellings: Map<string, number>;
    dataTypes: Set<string>;
    entities: Set<string>;
  }
  const attrMap = new Map<string, AttrStat>();

  const candidates =
    domainFilter && domainFilter.size > 0
      ? index.entities.filter((e) => domainFilter.has(e.domainId.toLowerCase()))
      : index.entities;

  for (const e of candidates) {
    for (const a of e.attributes) {
      const key = (a.name || a.id).toLowerCase();
      let stat = attrMap.get(key);
      if (!stat) {
        stat = {
          key,
          spellings: new Map(),
          dataTypes: new Set(),
          entities: new Set(),
        };
        attrMap.set(key, stat);
      }
      const displayName = a.name || a.id;
      stat.spellings.set(
        displayName,
        (stat.spellings.get(displayName) || 0) + 1,
      );
      stat.dataTypes.add(a.dataType);
      stat.entities.add(e.fqid);
    }
  }

  // Фильтр по minOccurrences
  const filtered = Array.from(attrMap.values()).filter(
    (s) => s.entities.size >= minOccurrences,
  );

  // Сортируем по количеству вхождений
  filtered.sort((a, b) => b.entities.size - a.entities.size);

  // Топ-N
  const selected = filtered.slice(0, maxColumns);

  // Колонки
  const columns: AttributeMatrixColumn[] = selected.map((s) => {
    // Самое частое написание
    const label = Array.from(s.spellings.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    const dataTypes = Array.from(s.dataTypes).sort();
    return {
      key: s.key,
      label,
      count: s.entities.size,
      dataTypes,
      consistentType: dataTypes.length === 1,
    };
  });

  const columnKeys = new Set(columns.map((c) => c.key));

  // ============ Строки ============
  const rowCandidates = candidates.slice().sort((a, b) => {
    if (b.attributes.length !== a.attributes.length) {
      return b.attributes.length - a.attributes.length;
    }
    return a.fqid.localeCompare(b.fqid);
  });

  const rows: AttributeMatrixRow[] = rowCandidates
    .slice(0, maxRows)
    .map((e) => {
      const present = new Set<string>();
      for (const a of e.attributes) {
        const key = (a.name || a.id).toLowerCase();
        if (columnKeys.has(key)) present.add(key);
      }
      return {
        entityFqid: e.fqid,
        entityId: e.entityId,
        domainId: e.domainId,
        present,
        attributesCount: e.attributes.length,
      };
    });

  // ============ Статистика ============
  const inconsistentTypes = columns.filter((c) => !c.consistentType);
  const singletons: AttributeMatrixColumn[] = [];
  attrMap.forEach((s) => {
    if (s.entities.size === 1) {
      const label = Array.from(s.spellings.keys())[0];
      singletons.push({
        key: s.key,
        label,
        count: 1,
        dataTypes: Array.from(s.dataTypes),
        consistentType: s.dataTypes.size === 1,
      });
    }
  });

  return {
    columns,
    rows,
    stats: {
      totalColumns: columns.length,
      totalRows: rows.length,
      inconsistentTypes,
      singletons,
    },
  };
}
