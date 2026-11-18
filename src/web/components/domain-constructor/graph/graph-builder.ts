import type { DomainSchema } from "../types";
import type { ModelIndexLike } from "../resolver/ref-resolver";
import { makeFqid, normalizeFqid } from "../resolver/ref-resolver";
import type {
  EntityNodeData,
  LinkageEdgeData,
  InheritanceEdgeData,
  MixinEdgeData,
  TransitiveEdgeData,
  GraphFilterOptions,
  GraphLayer,
} from "./types";

export interface BuiltNode {
  id: string;
  data: EntityNodeData;
}

export interface BuiltEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphLayer;
  data:
    | LinkageEdgeData
    | InheritanceEdgeData
    | MixinEdgeData
    | TransitiveEdgeData;
}

export interface BuildResult {
  nodes: BuiltNode[];
  edges: BuiltEdge[];
}

export function buildGraph(
  schema: DomainSchema,
  modelIndex: ModelIndexLike,
  filter: GraphFilterOptions,
): BuildResult {
  const currentDomainId = schema.metadata.id.toLowerCase();
  const q = filter.search.trim().toLowerCase();

  // ============ 1. Узлы ============
  const nodeMap = new Map<string, BuiltNode>();

  const entityMatches = (
    fqid: string,
    name: string,
    entityId: string,
  ): boolean => {
    if (!q) return true;
    return (
      name.toLowerCase().includes(q) ||
      entityId.toLowerCase().includes(q) ||
      fqid.toLowerCase().includes(q)
    );
  };

  // 1a. Сущности из YAML (own)
  for (const e of schema.entities) {
    const fqid = makeFqid(currentDomainId, e.id);
    if (!entityMatches(fqid, e.name ?? "", e.id)) continue;
    nodeMap.set(fqid, {
      id: fqid,
      data: {
        fqid,
        entityId: e.id,
        name: e.name ?? e.id,
        color: e.graphView?.iconColor,
        kind: "own",
        attributeCount: e.attributes.length,
        inherits: e.inherits ?? null,
      },
    });
  }

  // 1b. Сущности из ModelIndex (external) — только если они фигурируют
  //     в linkages / inherits / mixins, чтобы не рисовать всю индустрию
  const externalFqids = new Set<string>();

  for (const l of schema.linkages) {
    addExternalIfNotLocal(l.side1);
    addExternalIfNotLocal(l.side2);
  }
  for (const e of schema.entities) {
    if (e.inherits) addExternalIfNotLocal(e.inherits);
  }
  for (const m of schema.mixins) {
    const src = (m as any).entity?.from;
    const tgt = (m as any).entity?.to ?? (m as any).entity;
    if (src) addExternalIfNotLocal(src);
    if (tgt) addExternalIfNotLocal(tgt);
  }

  function addExternalIfNotLocal(ref: string | null | undefined): void {
    if (!ref) return;
    const fqid = ref.includes("/")
      ? normalizeFqid(ref)
      : makeFqid(currentDomainId, ref);
    if (nodeMap.has(fqid)) return;
    if (externalFqids.has(fqid)) return;
    externalFqids.add(fqid);

    const fromModel = (modelIndex.entitiesByFqid ?? {})[fqid] as any;
    const name = fromModel?.name ?? fqid.split("/").pop() ?? fqid;
    const entityId = fqid.split("/").pop() ?? fqid;

    if (!entityMatches(fqid, name, entityId)) return;

    nodeMap.set(fqid, {
      id: fqid,
      data: {
        fqid,
        entityId,
        name,
        color: fromModel?.graphView?.iconColor,
        kind: "external",
        attributeCount: fromModel?.attributes?.length ?? 0,
        inherits: fromModel?.inherits ?? null,
      },
    });
  }

  const nodes = [...nodeMap.values()];

  // ============ 2. Рёбра ============
  const edges: BuiltEdge[] = [];
  const seenEdgeKeys = new Set<string>();

  const pushEdge = (e: BuiltEdge) => {
    // отбрасываем дубликаты (по source+target+kind)
    const key = `${e.kind}::${e.source}::${e.target}::${e.id}`;
    if (seenEdgeKeys.has(key)) return;
    seenEdgeKeys.add(key);
    edges.push(e);
  };

  const hasNode = (fqid: string) => nodeMap.has(fqid);

  // 2a. Связи
  if (filter.layers.has("linkages")) {
    for (const l of schema.linkages) {
      if (l.excludeOnGraph === "off") continue;
      if (!filter.linkageTypes.has(l.type)) continue;

      const s1 = l.side1.includes("/")
        ? normalizeFqid(l.side1)
        : makeFqid(currentDomainId, l.side1);
      const s2 = l.side2.includes("/")
        ? normalizeFqid(l.side2)
        : makeFqid(currentDomainId, l.side2);

      if (!hasNode(s1) || !hasNode(s2)) continue;

      const label = l.nameFrom?.side1 ? l.nameFrom.side1 : (l.name ?? l.id);

      pushEdge({
        id: `linkage:${l.id}`,
        source: s1,
        target: s2,
        kind: "linkages",
        data: {
          kind: "linkage",
          id: l.id,
          name: l.name,
          type: l.type,
          undirected: l.undirected,
          nameFrom: l.nameFrom,
          color: l.view?.iconColor,
          source: "own",
        } satisfies LinkageEdgeData,
      });
    }
  }

  // 2b. Наследование
  if (filter.layers.has("inheritance")) {
    for (const e of schema.entities) {
      if (!e.inherits) continue;
      const childFqid = makeFqid(currentDomainId, e.id);
      const parentFqid = e.inherits.includes("/")
        ? normalizeFqid(e.inherits)
        : makeFqid(currentDomainId, e.inherits);
      if (!hasNode(childFqid) || !hasNode(parentFqid)) continue;

      const childDomain = childFqid.split("/")[0];
      const parentDomain = parentFqid.split("/")[0];

      pushEdge({
        id: `inherit:${childFqid}->${parentFqid}`,
        source: parentFqid,
        target: childFqid,
        kind: "inheritance",
        data: {
          kind: "inheritance",
          parentFqid,
          childFqid,
          crossDomain: childDomain !== parentDomain,
        } satisfies InheritanceEdgeData,
      });
    }
  }

  // 2c. Mixins
  if (filter.layers.has("mixins")) {
    const mixins = (schema.mixins ?? []) as any[];
    for (const m of mixins) {
      const src = m.entity?.from;
      const tgt =
        m.entity?.to ?? (typeof m.entity === "string" ? m.entity : null);
      if (!src || !tgt) continue;

      const srcFqid = src.includes("/")
        ? normalizeFqid(src)
        : makeFqid(currentDomainId, src);
      const tgtFqid = tgt.includes("/")
        ? normalizeFqid(tgt)
        : makeFqid(currentDomainId, tgt);

      if (!hasNode(srcFqid) || !hasNode(tgtFqid)) continue;

      pushEdge({
        id: `mixin:${m.id}`,
        source: srcFqid,
        target: tgtFqid,
        kind: "mixins",
        data: {
          kind: "mixin",
          sourceFqid: srcFqid,
          targetFqid: tgtFqid,
          mixinType: m.type,
        } satisfies MixinEdgeData,
      });
    }
  }

  // 2d. Транзитивные связи (рисуем как рёбра от корня к конечной сущности)
  if (filter.layers.has("transitive")) {
    for (const t of schema.transitiveLinkages) {
      const rootFqid = t.entity.includes("/")
        ? normalizeFqid(t.entity)
        : makeFqid(currentDomainId, t.entity);

      const walkJoin = (
        join: any,
        currentFqid: string,
        depth: number,
      ): void => {
        const linkage = schema.linkages.find((l) => l.id === join.linkage);
        if (!linkage) return;

        // определить, куда ведёт linkage от currentFqid
        const s1 = linkage.side1.includes("/")
          ? normalizeFqid(linkage.side1)
          : makeFqid(currentDomainId, linkage.side1);
        const s2 = linkage.side2.includes("/")
          ? normalizeFqid(linkage.side2)
          : makeFqid(currentDomainId, linkage.side2);

        const nextFqid = currentFqid === s1 ? s2 : s1;
        if (!hasNode(currentFqid) || !hasNode(nextFqid)) return;

        pushEdge({
          id: `trans:${t.id}:${join.id}:${nextFqid}`,
          source: rootFqid,
          target: nextFqid,
          kind: "transitive",
          data: {
            kind: "transitive",
            fromFqid: rootFqid,
            toFqid: nextFqid,
            transitiveId: t.id,
            depth,
          } satisfies TransitiveEdgeData,
        });

        for (const child of join.joins ?? []) {
          walkJoin(child, nextFqid, depth + 1);
        }
      };

      for (const join of t.joins) {
        walkJoin(join, rootFqid, 1);
      }
    }
  }

  return { nodes, edges };
}
