import type {
  EntityRecord,
  EntityLinkage,
  ModelIndex,
} from "../../../shared/model-types";

export type MatrixCellKind = "reference" | "inheritance" | "linkage";

export interface MatrixCellDetail {
  kind: MatrixCellKind;
  /** 'attr:id' | 'inherits' | 'linkage:id'. */
  via: string;
  /** Отображаемое имя: имя атрибута, имя linkage, 'inherits'. */
  label: string;
  /** Для linkage — тип связи. */
  linkageType?: string;
  /** Для linkage — ненаправленная. */
  undirected?: boolean;
}

export interface MatrixCell {
  /** Преобладающий тип — для цвета ячейки. */
  kind: MatrixCellKind;
  /** Общее число связей в ячейке. */
  count: number;
  /** Полный список — для tooltip и клика. */
  details: MatrixCellDetail[];
}

export interface MatrixRow {
  entity: EntityRecord;
  /** Исходящие связи: row → col. */
  cellsOut: Map<string, MatrixCell>;
  /** Входящие связи: col → row (транспонировано). */
  cellsIn: Map<string, MatrixCell>;
  /** Всего исходящих связей (включая ведущие вне матрицы). */
  totalOutgoingAll: number;
  /** Всего входящих связей (включая ведущие извне). */
  totalIncomingAll: number;
  /** Сколько исходящих попало в матрицу. */
  totalOutgoingInMatrix: number;
  /** Сколько входящих попало в матрицу. */
  totalIncomingInMatrix: number;
}

export interface EntityMatrix {
  rows: MatrixRow[];
  /** FQID сущностей в порядке строк и столбцов. */
  entityFqids: string[];
  /** fqid → индекс столбца. */
  columnIndex: Map<string, number>;
  stats: {
    /** Сущностей в матрице. */
    totalEntities: number;
    /** Сущностей доступно до отсечения по limit. */
    totalAvailableEntities: number;
    /** Сколько не влезло. */
    truncated: number;
    /** Связей внутри матрицы (сумма всех ячеек). */
    totalLinksInMatrix: number;
    /** Исходящих связей, ведущих вне матрицы. */
    totalLinksOutOfScope: number;
    /** Разбивка связей внутри матрицы по типам. */
    byKind: Record<MatrixCellKind, number>;
  };
}

export interface MatrixOptions {
  /** Ограничить доменами (lowercase). Пустое — все. */
  domains?: Set<string>;
  /** Максимум сущностей (топ по связям). По умолчанию — 60. */
  limit?: number;
}

const PRIORITY: Record<MatrixCellKind, number> = {
  reference: 3,
  inheritance: 2,
  linkage: 1,
};

function pickDominantKind(
  current: MatrixCellKind,
  incoming: MatrixCellKind,
): MatrixCellKind {
  return PRIORITY[incoming] > PRIORITY[current] ? incoming : current;
}

/**
 * Строит матрицу связей.
 *
 * Ключевые отличия от «наивной» реализации:
 *   1. Учитываются linkage (не только Reference + inherits).
 *   2. Исходящие/входящие счётчики считаются по ВСЕЙ модели, а не только
 *      внутри выбранного топ-N — сортировка «что показать» корректна.
 *   3. Обе матрицы (исходящая и входящая) строятся сразу; UI переключает.
 *   4. Никаких reverse-ячеек: входящая связь A→B — это ячейка [B][A]
 *      во входящей матрице, а не «reverse» в исходящей.
 */
export function buildEntityMatrix(
  index: ModelIndex,
  options: MatrixOptions = {},
): EntityMatrix {
  const limit = options.limit ?? 60;
  const domainFilter = options.domains;

  // ── 1. Отбор кандидатов ──
  let candidates = index.entities;
  if (domainFilter && domainFilter.size > 0) {
    candidates = candidates.filter((e) =>
      domainFilter.has(e.domainId.toLowerCase()),
    );
  }

  const candidateByFqid = new Map(candidates.map((e) => [e.fqid, e]));

  // ── 2. Счётчики по всей модели ──
  // Для каждой сущности — сколько исходящих и входящих связей вообще
  // (не только между кандидатами). Это влияет на сортировку.
  const outgoingAll = new Map<string, number>();
  const incomingAll = new Map<string, number>();
  candidates.forEach((e) => {
    outgoingAll.set(e.fqid, 0);
    incomingAll.set(e.fqid, 0);
  });

  const bumpOut = (fqid: string) => {
    if (outgoingAll.has(fqid))
      outgoingAll.set(fqid, outgoingAll.get(fqid)! + 1);
  };
  const bumpIn = (fqid: string) => {
    if (incomingAll.has(fqid))
      incomingAll.set(fqid, incomingAll.get(fqid)! + 1);
  };

  // Reference-атрибуты
  for (const e of candidates) {
    for (const a of e.attributes) {
      const target = a.referenceEntity || a.itemReferenceEntity;
      if (!target) continue;
      bumpOut(e.fqid);
      bumpIn(target);
    }
    // Inheritance
    if (e.inherits) {
      bumpOut(e.fqid);
      bumpIn(e.inherits);
    }
  }

  // Linkages — по всем linkages модели (могут быть кросс-доменные)
  for (const l of index.entityLinkages) {
    const side1 = l.side1Fqid;
    const side2 = l.side2Fqid;
    if (side1 === side2) continue; // self-loop пропускаем

    if (l.undirected === true) {
      // Ненаправленная: обе стороны получают и исходящую, и входящую
      bumpOut(side1);
      bumpIn(side1);
      bumpOut(side2);
      bumpIn(side2);
    } else {
      bumpOut(side1);
      bumpIn(side2);
    }
  }

  // ── 3. Топ-N по сумме входящих + исходящих ──
  const sorted = candidates.slice().sort((a, b) => {
    const ta = (outgoingAll.get(a.fqid) || 0) + (incomingAll.get(a.fqid) || 0);
    const tb = (outgoingAll.get(b.fqid) || 0) + (incomingAll.get(b.fqid) || 0);
    if (ta !== tb) return tb - ta;
    return a.fqid.localeCompare(b.fqid);
  });

  const selected = sorted.slice(0, limit);
  const selectedSet = new Set(selected.map((e) => e.fqid));

  // ── 4. Построение ячеек ──
  const rowByFqid = new Map<string, MatrixRow>();
  selected.forEach((e) => {
    rowByFqid.set(e.fqid, {
      entity: e,
      cellsOut: new Map(),
      cellsIn: new Map(),
      totalOutgoingAll: outgoingAll.get(e.fqid) || 0,
      totalIncomingAll: incomingAll.get(e.fqid) || 0,
      totalOutgoingInMatrix: 0,
      totalIncomingInMatrix: 0,
    });
  });

  function addCell(
    direction: "out" | "in",
    rowFqid: string,
    colFqid: string,
    detail: MatrixCellDetail,
  ): void {
    if (!selectedSet.has(rowFqid) || !selectedSet.has(colFqid)) return;
    if (rowFqid === colFqid) return;

    const row = rowByFqid.get(rowFqid)!;
    const cells = direction === "out" ? row.cellsOut : row.cellsIn;
    let cell = cells.get(colFqid);
    if (!cell) {
      cell = { kind: detail.kind, count: 0, details: [] };
      cells.set(colFqid, cell);
    }
    cell.kind = pickDominantKind(cell.kind, detail.kind);
    cell.count++;
    cell.details.push(detail);

    if (direction === "out") row.totalOutgoingInMatrix++;
    else row.totalIncomingInMatrix++;
  }

  // ── 4a. Reference + inheritance внутри выбранных ──
  for (const e of selected) {
    for (const a of e.attributes) {
      const target = a.referenceEntity || a.itemReferenceEntity;
      if (!target) continue;
      const detail: MatrixCellDetail = {
        kind: "reference",
        via: `attr:${a.id}`,
        label: a.name || a.id,
      };
      addCell("out", e.fqid, target, detail);
      addCell("in", target, e.fqid, detail);
    }
    if (e.inherits && selectedSet.has(e.inherits)) {
      const detail: MatrixCellDetail = {
        kind: "inheritance",
        via: "inherits",
        label: "inherits",
      };
      addCell("out", e.fqid, e.inherits, detail);
      addCell("in", e.inherits, e.fqid, detail);
    }
  }

  // ── 4b. Linkages ──
  for (const l of index.entityLinkages) {
    const side1 = l.side1Fqid;
    const side2 = l.side2Fqid;
    if (side1 === side2) continue;

    const detail: MatrixCellDetail = {
      kind: "linkage",
      via: `linkage:${l.id}`,
      label: l.name || l.id,
      linkageType: l.type,
      undirected: l.undirected === true,
    };

    if (l.undirected === true) {
      // Ненаправленная: каждая сторона видит другую как «out» и «in»
      addCell("out", side1, side2, detail);
      addCell("out", side2, side1, detail);
      addCell("in", side1, side2, detail);
      addCell("in", side2, side1, detail);
    } else {
      // Направленная: side1 → side2
      addCell("out", side1, side2, detail);
      addCell("in", side2, side1, detail);
    }
  }

  // ── 5. Порядок строк и столбцов ──
  const rows: MatrixRow[] = selected.map((e) => rowByFqid.get(e.fqid)!);
  const entityFqids = selected.map((e) => e.fqid);

  const columnIndex = new Map<string, number>();
  entityFqids.forEach((fqid, idx) => columnIndex.set(fqid, idx));

  // ── 6. Статистика ──
  const byKind: Record<MatrixCellKind, number> = {
    reference: 0,
    inheritance: 0,
    linkage: 0,
  };
  let totalLinksInMatrix = 0;
  let totalLinksOutOfScope = 0;

  for (const row of rows) {
    totalLinksInMatrix += row.totalOutgoingInMatrix;
    totalLinksOutOfScope += row.totalOutgoingAll - row.totalOutgoingInMatrix;
    row.cellsOut.forEach((cell) => {
      byKind[cell.kind] += cell.count;
    });
  }

  return {
    rows,
    entityFqids,
    columnIndex,
    stats: {
      totalEntities: selected.length,
      totalAvailableEntities: candidates.length,
      truncated: Math.max(0, candidates.length - selected.length),
      totalLinksInMatrix,
      totalLinksOutOfScope,
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
