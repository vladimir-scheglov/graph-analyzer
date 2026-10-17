import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

export type MatrixCellKind = "reference" | "inheritance" | "linkage";

export interface MatrixCell {
  kind: MatrixCellKind;
  /** Сколько связей этого типа. */
  count: number;
  /** Детали: атрибуты/связи, через которые соединены. */
  details: Array<{
    /** 'attr:xxx' для reference, 'inherits' для наследования, 'linkage:xxx' для linkage. */
    via: string;
    /** Обратная ссылка — для двухсторонних связей. */
    reverse?: boolean;
  }>;
}

export interface MatrixRow {
  entity: EntityRecord;
  /** Ключи — FQID целевых сущностей. */
  cells: Map<string, MatrixCell>;
  /** Сумма всех связей в строке — для сортировки. */
  totalOutgoing: number;
}

export interface EntityMatrix {
  rows: MatrixRow[];
  /** FQID сущностей, вошедших в матрицу (столбцы те же). */
  entityFqids: string[];
  /** Для быстрого поиска: fqid → индекс столбца. */
  columnIndex: Map<string, number>;
  stats: {
    totalEntities: number;
    totalLinks: number;
    byKind: Record<MatrixCellKind, number>;
  };
}

export interface MatrixOptions {
  /** Ограничить доменами (lowercase). Пустое — все. */
  domains?: Set<string>;
  /** Максимум сущностей (топ по связям). По умолчанию — 60. */
  limit?: number;
}

/**
 * Строит матрицу связей.
 *
 * Логика:
 *   1) Отбираем сущности (по фильтру).
 *   2) Сортируем по количеству исходящих связей, берём топ-N.
 *   3) Для каждой пары (source, target) собираем ячейку.
 */
export function buildEntityMatrix(
  index: ModelIndex,
  options: MatrixOptions = {},
): EntityMatrix {
  const limit = options.limit ?? 60;
  const domainFilter = options.domains;

  // 1. Отбор сущностей
  let candidates = index.entities;
  if (domainFilter && domainFilter.size > 0) {
    candidates = candidates.filter((e) =>
      domainFilter.has(e.domainId.toLowerCase()),
    );
  }

  // 2. Считаем исходящие ссылки на сущность (для сортировки)
  const outgoingCount = new Map<string, number>();
  candidates.forEach((e) => outgoingCount.set(e.fqid, 0));

  const addOutgoing = (fromFqid: string, toFqid: string): void => {
    if (!outgoingCount.has(fromFqid)) return;
    if (!outgoingCount.has(toFqid)) return;
    outgoingCount.set(fromFqid, (outgoingCount.get(fromFqid) || 0) + 1);
  };

  candidates.forEach((e) => {
    // Reference-атрибуты
    for (const a of e.attributes) {
      const target = a.referenceEntity || a.itemReferenceEntity;
      if (target) addOutgoing(e.fqid, target);
    }
    // Inheritance
    if (e.inherits) addOutgoing(e.fqid, e.inherits);
  });

  // Linkages — через linkedViaLinkages в обе стороны
  // (linkedViaLinkages пока не содержит peer — используем rawData)
  // Для простоты: пока не учитываем linkage в сортировке.

  // 3. Топ-N
  const sorted = candidates.slice().sort((a, b) => {
    const ca = outgoingCount.get(a.fqid) || 0;
    const cb = outgoingCount.get(b.fqid) || 0;
    if (ca !== cb) return cb - ca;
    return a.fqid.localeCompare(b.fqid);
  });

  const selected = sorted.slice(0, limit);
  const selectedSet = new Set(selected.map((e) => e.fqid));

  // 4. Строим rows
  const rowsMap = new Map<string, MatrixRow>();
  selected.forEach((e) => {
    rowsMap.set(e.fqid, {
      entity: e,
      cells: new Map(),
      totalOutgoing: 0,
    });
  });

  function addCell(
    sourceFqid: string,
    targetFqid: string,
    kind: MatrixCellKind,
    via: string,
  ): void {
    if (!selectedSet.has(sourceFqid) || !selectedSet.has(targetFqid)) return;
    if (sourceFqid === targetFqid) return;

    const row = rowsMap.get(sourceFqid)!;
    let cell = row.cells.get(targetFqid);
    if (!cell) {
      cell = { kind, count: 0, details: [] };
      row.cells.set(targetFqid, cell);
    }
    // Если в ячейке уже другой тип — оставляем первый (приоритет reference > inherits > linkage)
    // но count увеличиваем и детали добавляем.
    if (cell.kind !== kind && priority(kind) > priority(cell.kind)) {
      cell.kind = kind;
    }
    cell.count++;
    cell.details.push({ via });
    row.totalOutgoing++;
  }

  function priority(k: MatrixCellKind): number {
    if (k === "reference") return 3;
    if (k === "inheritance") return 2;
    return 1;
  }

  // Заполняем ячейки
  selected.forEach((e) => {
    // Reference
    for (const a of e.attributes) {
      const target = a.referenceEntity || a.itemReferenceEntity;
      if (target) {
        addCell(e.fqid, target, "reference", `attr:${a.id}`);
      }
    }
    // Inheritance
    if (e.inherits) {
      addCell(e.fqid, e.inherits, "inheritance", "inherits");
      // Обратная ячейка — тоже подсветим как наследование
      // (родитель ← потомок). Показываем как reverse-ячейку.
      if (selectedSet.has(e.inherits)) {
        const parentRow = rowsMap.get(e.inherits);
        if (parentRow) {
          let cell = parentRow.cells.get(e.fqid);
          if (!cell) {
            cell = { kind: "inheritance", count: 0, details: [] };
            parentRow.cells.set(e.fqid, cell);
          }
          cell.count++;
          cell.details.push({ via: e.fqid, reverse: true });
          parentRow.totalOutgoing++;
        }
      }
    }
    // Linkages — не реализованы (нужен peer, см. комментарий в impact-analysis)
  });

  // 5. Формируем результат
  const rows: MatrixRow[] = selected.map((e) => rowsMap.get(e.fqid)!);
  const entityFqids = selected.map((e) => e.fqid);

  const columnIndex = new Map<string, number>();
  entityFqids.forEach((fqid, idx) => columnIndex.set(fqid, idx));

  // Статистика
  let totalLinks = 0;
  const byKind: Record<MatrixCellKind, number> = {
    reference: 0,
    inheritance: 0,
    linkage: 0,
  };
  rows.forEach((r) => {
    r.cells.forEach((cell) => {
      totalLinks += cell.count;
      byKind[cell.kind] += cell.count;
    });
  });

  return {
    rows,
    entityFqids,
    columnIndex,
    stats: {
      totalEntities: selected.length,
      totalLinks,
      byKind,
    },
  };
}

/**
 * Возвращает короткое имя для отображения в столбце — entityId.
 */
export function shortLabel(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}
