import type {
  EntityRecord,
  ModelIndex,
  EntityLinkage,
} from "../../../shared/model-types";

export type EntityEdgeKind = "inheritance" | "reference" | "linkage";

export interface EntityGraphNode {
  id: string;
  entity: EntityRecord;
  domainId: string;
  entityId: string;
  label: string;
}

export interface EntityGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EntityEdgeKind;
  /** Для отображения и тултипа. */
  label?: string;
  /** Доп. данные для тултипа. */
  viaAttribute?: string;
  linkageId?: string;
  title?: string;
  /** Только для kind: "linkage". true — связь ненаправленная. */
  undirected?: boolean;
}

export interface EntityGraphResult {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  stats: {
    totalNodes: number;
    byKind: Record<EntityEdgeKind, number>;
    /** Сколько сущностей осталось за пределами лимита. */
    truncated: number;
  };
}

export interface EntityGraphOptions {
  /** Домены (lowercase). Пусто — все. */
  domains?: Set<string>;
  /** Показывать наследование. */
  showInheritance?: boolean;
  /** Показывать Reference-атрибуты. */
  showReferences?: boolean;
  /** Показывать linkages. */
  showLinkages?: boolean;
  /** Максимум сущностей (топ по связям). По умолчанию — 200. */
  limit?: number;
}

/**
 * Строит граф сущностей: узлы + рёбра.
 *
 * Логика:
 *  1. Отбор сущностей по домену.
 *  2. Сортировка по сумме входящих/исходящих связей — берём топ-N.
 *  3. Рёбра: только между сущностями, вошедшими в выборку.
 */
export function buildEntityGraph(
  index: ModelIndex,
  options: EntityGraphOptions = {},
): EntityGraphResult {
  const limit = options.limit ?? 200;
  const showInheritance = options.showInheritance !== false;
  const showReferences = options.showReferences !== false;
  const showLinkages = options.showLinkages !== false;
  const domainFilter = options.domains;

  // ============ 1. Отбор сущностей ============
  let candidates = index.entities;
  if (domainFilter && domainFilter.size > 0) {
    candidates = candidates.filter((e) =>
      domainFilter.has(e.domainId.toLowerCase()),
    );
  }

  // ============ 2. Счёт связей для сортировки ============
  const degreeMap = new Map<string, number>();
  candidates.forEach((e) => degreeMap.set(e.fqid, 0));

  const bump = (fqid: string) => {
    if (degreeMap.has(fqid))
      degreeMap.set(fqid, (degreeMap.get(fqid) || 0) + 1);
  };

  candidates.forEach((e) => {
    if (showInheritance && e.inherits) {
      bump(e.fqid);
      bump(e.inherits);
    }
    if (showReferences) {
      for (const a of e.attributes) {
        const t = a.referenceEntity || a.itemReferenceEntity;
        if (t) {
          bump(e.fqid);
          bump(t);
        }
      }
    }
  });

  if (showLinkages) {
    for (const l of index.entityLinkages) {
      bump(l.side1Fqid);
      bump(l.side2Fqid);
    }
  }

  // ============ 3. Топ-N ============
  const sorted = candidates.slice().sort((a, b) => {
    const da = degreeMap.get(a.fqid) || 0;
    const db = degreeMap.get(b.fqid) || 0;
    if (da !== db) return db - da;
    return a.fqid.localeCompare(b.fqid);
  });

  const selected = sorted.slice(0, limit);
  const selectedSet = new Set(selected.map((e) => e.fqid));

  const nodes: EntityGraphNode[] = selected.map((e) => ({
    id: e.fqid,
    entity: e,
    domainId: e.domainId,
    entityId: e.entityId,
    label: e.name || e.entityId,
  }));

  // ============ 4. Рёбра ============
  const edges: EntityGraphEdge[] = [];
  const addedEdges = new Set<string>();

  const addEdge = (edge: EntityGraphEdge) => {
    if (addedEdges.has(edge.id)) return;
    // Пропускаем self-loops
    if (edge.source === edge.target) return;
    addedEdges.add(edge.id);
    edges.push(edge);
  };

  if (showInheritance) {
    selected.forEach((e) => {
      if (!e.inherits) return;
      if (!selectedSet.has(e.inherits)) return;
      const parentFqid = e.inherits;
      const childFqid = e.fqid;
      const parentShort = shortEntityId(parentFqid);
      const childShort = shortEntityId(childFqid);
      addEdge({
        id: `inh:${parentFqid}→${childFqid}`,
        source: parentFqid,
        target: childFqid,
        kind: "inheritance",
        label: "inherits",
        title:
          `${childShort} наследуется от ${parentShort}`
          /*`${childFqid}\n` +
          `↳ ${parentFqid}`,*/
      });
    });
  }

  if (showReferences) {
    selected.forEach((e) => {
      for (const a of e.attributes) {
        const target = a.referenceEntity || a.itemReferenceEntity;
        if (!target) continue;
        if (!selectedSet.has(target)) continue;
        const isArray = !!a.itemReferenceEntity;
        addEdge({
          id: `ref:${e.fqid}#${a.id}→${target}`,
          source: e.fqid,
          target,
          kind: "reference",
          label: a.name || a.id,
          viaAttribute: a.id,
          title:
            `${e.entityId}.${a.id} → ${shortEntityId(target)}\n` +
            `${isArray ? "Атрибут: Array<" : "атрибут: "}${a.dataType}${isArray ? ">" : ""}`
            /*`${e.fqid}\n` +
            `↳ ${target}`,*/
        });
      }
    });
  }

    if (showLinkages) {
      for (const l of index.entityLinkages) {
        if (!selectedSet.has(l.side1Fqid) || !selectedSet.has(l.side2Fqid))
          continue;
        const arrow = l.symmetric ? "↔" : l.undirected ? "—" : "→";
        addEdge({
          id: `lnk:${l.domainId}#${l.id}`,
          source: l.side1Fqid,
          target: l.side2Fqid,
          kind: "linkage",
          label: l.name,
          linkageId: l.id,
          undirected: l.undirected === true,
          title:
            `${l.name}\n` +
            `Тип: ${l.type}${l.symmetric ? " (симметричная)" : l.undirected ? " (ненаправленная)" : ""}\n` +
            `${shortEntityId(l.side1Fqid)} ${arrow} ${shortEntityId(l.side2Fqid)}`,
        });
      }
    }

  // ============ 5. Статистика ============
  const byKind: Record<EntityEdgeKind, number> = {
    inheritance: 0,
    reference: 0,
    linkage: 0,
  };
  edges.forEach((e) => byKind[e.kind]++);

  return {
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      byKind,
      truncated: Math.max(0, candidates.length - nodes.length),
    },
  };
}

/**
 * Короткое имя сущности из FQID.
 */
export function shortEntityId(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}
