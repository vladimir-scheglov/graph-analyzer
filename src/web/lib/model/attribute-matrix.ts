import type { AttributeRecord, ModelIndex } from "../../../shared/model-types";

export type AttributeCategory =
  | "string"
  | "numeric"
  | "boolean"
  | "date"
  | "reference"
  | "array"
  | "uuid"
  | "custom"
  | "other";

const BASE_CATEGORIES: Record<string, AttributeCategory> = {
  String: "string",
  Text: "string",
  URL: "string",
  MAC: "string",
  IpAddress: "string",
  CIDR: "string",
  Attachment: "string",
  Integer: "numeric",
  Decimal: "numeric",
  Float: "numeric",
  Counter: "numeric",
  Calculation: "numeric",
  Bool: "boolean",
  Date: "date",
  Time: "date",
  Timestamp: "date",
  TimestampRange: "date",
  Reference: "reference",
  Array: "array",
  Table: "array",
  Uuid: "uuid",
  Identifier: "uuid",
  Enum: "custom",
  Workflow: "custom",
};

export function categoryOf(dataType: string): AttributeCategory {
  return BASE_CATEGORIES[dataType] || "custom";
}

// ============ Типы данных ============

export interface AttributeTypeDistribution {
  dataType: string;
  count: number;
}

export interface AttributeConstraintDistribution {
  kind: string;
  count: number;
}

export interface AttributeExample {
  entityFqid: string;
  attributeId: string;
  dataType: string;
}

export interface AttributeMatrixColumn {
  /** lowercase ключ (name || id). */
  key: string;
  /** Человекочитаемое имя (самое частое написание). */
  label: string;
  /** Сколько сущностей содержат атрибут. */
  count: number;
  /** Уникальные dataType (отсортированы по частоте). */
  dataTypes: string[];
  /** Все сущности имеют один dataType. */
  consistentType: boolean;

  // ── Расширения ──
  /** Самый частый dataType. */
  dominantType: string | null;
  /** Распределение типов. */
  typeDistribution: AttributeTypeDistribution[];
  /** Распределение constraints. */
  constraintDistribution: AttributeConstraintDistribution[];
  /** Сколько сущностей имеют readonly: true. */
  readonlyCount: number;
  /** Сколько сущностей используют атрибут в views (usedInViews > 0). */
  usedInViewsCount: number;
  /** Уникальные домены. */
  domains: string[];
  /** Есть хотя бы один вложенный (из Table). */
  hasNested: boolean;
  /** 2–3 примера. */
  examples: AttributeExample[];
}

export interface AttributeMatrixCell {
  /** Оригинальный id атрибута (как в YAML). */
  attributeId: string;
  dataType: string;
  /** Классификация базовый / кастомный. */
  dataTypeKind: "base" | "custom" | "unknown";
  constraints: string[];
  readonly: boolean;
  usedInViews: number;
  isNested: boolean;
}

export interface AttributeMatrixRow {
  entityFqid: string;
  entityId: string;
  domainId: string;
  /** lowercase keys, которые есть у сущности. */
  present: Set<string>;
  attributesCount: number;
  /** key → cell. */
  cells: Map<string, AttributeMatrixCell>;
}

export interface AttributeMatrixStats {
  totalColumns: number;
  totalRows: number;
  inconsistentTypes: AttributeMatrixColumn[];
  singletons: AttributeMatrixColumn[];
  requiredEverywhere: number;
  readonlyEverywhere: number;
  unusedInViews: number;
  nestedColumns: number;
}

export interface AttributeMatrix {
  columns: AttributeMatrixColumn[];
  rows: AttributeMatrixRow[];
  stats: AttributeMatrixStats;
}

export interface AttributeMatrixOptions {
  domains?: Set<string>;
  minOccurrences?: number;
  maxColumns?: number;
  maxRows?: number;
  includeNested?: boolean;
}

// ============ Построение ============

interface CollectedAttr {
  key: string;
  spellings: Map<string, number>;
  typeCounts: Map<string, number>;
  constraintCounts: Map<string, number>;
  readonlyCount: number;
  usedInViewsCount: number;
  domains: Set<string>;
  hasNested: boolean;
  cells: Map<string, AttributeMatrixCell>;
}

function emptyCollected(key: string): CollectedAttr {
  return {
    key,
    spellings: new Map(),
    typeCounts: new Map(),
    constraintCounts: new Map(),
    readonlyCount: 0,
    usedInViewsCount: 0,
    domains: new Set(),
    hasNested: false,
    cells: new Map(),
  };
}

export function buildAttributeMatrix(
  index: ModelIndex,
  options: AttributeMatrixOptions = {},
): AttributeMatrix {
  const minOccurrences = options.minOccurrences ?? 2;
  const maxColumns = options.maxColumns ?? 40;
  const maxRows = options.maxRows ?? 100;
  const domainFilter = options.domains;
  const includeNested = options.includeNested !== false;

  const attrMap = new Map<string, CollectedAttr>();

  const candidates =
    domainFilter && domainFilter.size > 0
      ? index.entities.filter((e) => domainFilter.has(e.domainId.toLowerCase()))
      : index.entities;

  for (const e of candidates) {
    const visit = (a: AttributeRecord, isNested: boolean) => {
      const key = (a.name || a.id).toLowerCase();
      let entry = attrMap.get(key);
      if (!entry) {
        entry = emptyCollected(key);
        attrMap.set(key, entry);
      }

      const spelling = a.name || a.id;
      entry.spellings.set(spelling, (entry.spellings.get(spelling) || 0) + 1);

      entry.typeCounts.set(
        a.dataType,
        (entry.typeCounts.get(a.dataType) || 0) + 1,
      );

      for (const c of a.constraints) {
        entry.constraintCounts.set(c, (entry.constraintCounts.get(c) || 0) + 1);
      }

      if (a.readonly) entry.readonlyCount++;
      if (a.usedInViews > 0) entry.usedInViewsCount++;
      entry.domains.add(e.domainId);
      if (isNested) entry.hasNested = true;

      // Ячейка — на уровне сущности. Первый побеждает (редкий дубль name
      // внутри Table — берём верхнеуровневый).
      if (!entry.cells.has(e.fqid)) {
        entry.cells.set(e.fqid, {
          attributeId: a.id,
          dataType: a.dataType,
          dataTypeKind: a.dataTypeKind,
          constraints: [...a.constraints],
          readonly: !!a.readonly,
          usedInViews: a.usedInViews,
          isNested,
        });
      }
    };

    for (const a of e.attributes) {
      visit(a, false);
      if (includeNested && a.nestedAttributes) {
        for (const na of a.nestedAttributes) visit(na, true);
      }
    }
  }

  // Фильтр minOccurrences
  const filtered = Array.from(attrMap.values()).filter(
    (e) => e.cells.size >= minOccurrences,
  );

  filtered.sort((a, b) => b.cells.size - a.cells.size);

  const selected = filtered.slice(0, maxColumns);

  const columns: AttributeMatrixColumn[] = selected.map((e) => {
    const typeDistribution = Array.from(e.typeCounts.entries())
      .map(([dataType, count]) => ({ dataType, count }))
      .sort((a, b) => b.count - a.count);

    const constraintDistribution = Array.from(e.constraintCounts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);

    const dominantType = typeDistribution[0]?.dataType || null;

    const label = Array.from(e.spellings.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0][0];

    const examples: AttributeExample[] = Array.from(e.cells.entries())
      .slice(0, 3)
      .map(([fqid, cell]) => ({
        entityFqid: fqid,
        attributeId: cell.attributeId,
        dataType: cell.dataType,
      }));

    return {
      key: e.key,
      label,
      count: e.cells.size,
      dataTypes: typeDistribution.map((t) => t.dataType),
      consistentType: typeDistribution.length === 1,
      dominantType,
      typeDistribution,
      constraintDistribution,
      readonlyCount: e.readonlyCount,
      usedInViewsCount: e.usedInViewsCount,
      domains: Array.from(e.domains).sort(),
      hasNested: e.hasNested,
      examples,
    };
  });

  const columnKeys = new Set(columns.map((c) => c.key));

  // Rows
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
      const cells = new Map<string, AttributeMatrixCell>();

      const collect = (a: AttributeRecord, isNested: boolean) => {
        const key = (a.name || a.id).toLowerCase();
        if (!columnKeys.has(key)) return;
        if (present.has(key)) return;
        present.add(key);
        cells.set(key, {
          attributeId: a.id,
          dataType: a.dataType,
          dataTypeKind: a.dataTypeKind,
          constraints: [...a.constraints],
          readonly: !!a.readonly,
          usedInViews: a.usedInViews,
          isNested,
        });
      };

      for (const a of e.attributes) {
        collect(a, false);
        if (includeNested && a.nestedAttributes) {
          for (const na of a.nestedAttributes) collect(na, true);
        }
      }

      return {
        entityFqid: e.fqid,
        entityId: e.entityId,
        domainId: e.domainId,
        present,
        attributesCount: e.attributes.length,
        cells,
      };
    });

  // Stats
  const inconsistentTypes = columns.filter((c) => !c.consistentType);

  const singletons: AttributeMatrixColumn[] = [];
  attrMap.forEach((e) => {
    if (e.cells.size !== 1) return;
    const typeDistribution = Array.from(e.typeCounts.entries())
      .map(([dataType, count]) => ({ dataType, count }))
      .sort((a, b) => b.count - a.count);
    singletons.push({
      key: e.key,
      label: Array.from(e.spellings.keys())[0],
      count: 1,
      dataTypes: typeDistribution.map((t) => t.dataType),
      consistentType: typeDistribution.length === 1,
      dominantType: typeDistribution[0]?.dataType || null,
      typeDistribution,
      constraintDistribution: [],
      readonlyCount: e.readonlyCount,
      usedInViewsCount: e.usedInViewsCount,
      domains: Array.from(e.domains),
      hasNested: e.hasNested,
      examples: [],
    });
  });

  const requiredEverywhere = columns.filter((c) => {
    const req = c.constraintDistribution.find((x) => x.kind === "required");
    return req && req.count === c.count;
  }).length;

  const readonlyEverywhere = columns.filter(
    (c) => c.readonlyCount === c.count && c.count > 0,
  ).length;

  const unusedInViews = columns.filter((c) => c.usedInViewsCount === 0).length;
  const nestedColumns = columns.filter((c) => c.hasNested).length;

  return {
    columns,
    rows,
    stats: {
      totalColumns: columns.length,
      totalRows: rows.length,
      inconsistentTypes,
      singletons,
      requiredEverywhere,
      readonlyEverywhere,
      unusedInViews,
      nestedColumns,
    },
  };
}

export function shortLabel(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}
