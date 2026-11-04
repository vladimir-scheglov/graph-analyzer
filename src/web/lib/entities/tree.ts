import dagre from "dagre";
import type {
  EntityIndex,
  EntityTreeNode,
  EntityRecord,
  EntityTreeEdge,
  EntityTree,
  EntityNodeRole,
} from "../types";
import { entityKey, resolveEntityRef } from "./index";

export type EntityTreeMode = "inherits" | "all";

export interface BuildEntityTreeOptions {
  mode?: EntityTreeMode;
  /** Максимальная глубина от корня. 0 = без ограничения. */
  depth?: number;
  /** Показывать наследование. */
  showInheritance?: boolean;
  /** Показывать Reference-ссылки (только mode='all'). */
  showReferences?: boolean;
  /** Показывать linkages (только mode='all'). */
  showLinkages?: boolean;
  /** Скрыть узлы без связей после фильтрации. */
  hideIsolated?: boolean;
  showSiblings?: boolean;
}

export function buildEntityTree(
  rootKey: string,
  index: EntityIndex,
  modelIndex: any,
  options: BuildEntityTreeOptions = {},
): EntityTree {
  const mode = options.mode || "inherits";
  const maxDepth = options.depth || 0;
  const showInheritance = options.showInheritance !== false;
  const showReferences = options.showReferences !== false && mode === "all";
  const showLinkages = options.showLinkages !== false && mode === "all";
  const showSiblings = options.showSiblings === true;
  const hideIsolated = options.hideIsolated !== false;

  const byKey = index.byKey;
  const childMap = index.children;

  const nodesMap = new Map<string, EntityTreeNode>();
  const edgesMap = new Map<string, EntityTreeEdge>();
  const depthMap = new Map<string, number>();

  function addNode(key: string, depth: number): boolean {
    if (maxDepth > 0 && depth > maxDepth) return false;
    if (nodesMap.has(key)) {
      const existing = depthMap.get(key);
      if (existing != null && existing <= depth) return false;
      depthMap.set(key, depth);
      return true;
    }
    const e = byKey.get(key);
    const parts = key.split("/");
    nodesMap.set(key, {
      key,
      domainId: e ? e.domainId : parts[0],
      entityId: e ? e.entityId : parts.slice(1).join("/"),
      name: e ? e.name : null,
      inherits: e ? e.inherits : null,
      missing: !e,
    });
    depthMap.set(key, depth);
    return true;
  }

  function addEdge(
    id: string,
    source: string,
    target: string,
    kind: EntityTreeEdge["kind"],
    label?: string,
  ): void {
    if (!edgesMap.has(id)) {
      edgesMap.set(id, { id, source, target, kind, label });
    }
  }

  // ── Root ──
  addNode(rootKey, 0);

  // ── Кандидаты в siblings (считаем заранее) ──
  const siblingCandidates = new Set<string>();
  let rootParentKey: string | null = null;
  const rootEntity = byKey.get(rootKey);
  if (rootEntity && rootEntity.inherits) {
    const ref = resolveEntityRef(rootEntity.inherits, rootEntity.domainId);
    if (ref) {
      rootParentKey = entityKey(ref.domainId, ref.entityId);
      const siblings = childMap.get(rootParentKey) || [];
      siblings.forEach((s) => {
        const k = entityKey(s.domainId, s.entityId);
        if (k !== rootKey) siblingCandidates.add(k);
      });
    }
  }

  const ancestorsOrdered: string[] = [];
  const parentKeys = new Set<string>();
  const childKeys = new Set<string>();

  // ── 1. Ancestors: подъём от root по inherits, БЕЗ спуска в их других детей ──
  if (showInheritance) {
    let curKey = rootKey;
    let curDepth = 0;
    const seen = new Set<string>([rootKey]);
    while (true) {
      const e = byKey.get(curKey);
      if (!e || !e.inherits) break;
      const ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref) break;
      const pk = entityKey(ref.domainId, ref.entityId);
      if (seen.has(pk)) break;
      seen.add(pk);
      curDepth++;
      if (!addNode(pk, curDepth)) break;
      addEdge(`${pk}->${curKey}`, pk, curKey, "inheritance");
      ancestorsOrdered.push(pk);
      parentKeys.add(pk);
      curKey = pk;
    }
  }

  // ── 2. Descendants: спуск ТОЛЬКО от root ──
  if (showInheritance) {
    const queue: Array<{ key: string; depth: number }> = [
      { key: rootKey, depth: 0 },
    ];
    const seen = new Set<string>([rootKey]);
    while (queue.length > 0) {
      const { key, depth } = queue.shift()!;
      const nextDepth = depth + 1;
      if (maxDepth > 0 && nextDepth > maxDepth) continue;
      const kids = childMap.get(key) || [];
      for (const child of kids) {
        const ck = entityKey(child.domainId, child.entityId);
        if (seen.has(ck)) continue;
        seen.add(ck);
        if (!addNode(ck, nextDepth)) continue;
        addEdge(`${key}->${ck}`, key, ck, "inheritance");
        childKeys.add(ck);
        queue.push({ key: ck, depth: nextDepth });
      }
    }
  }

  // ── 3. Siblings: ТОЛЬКО если включено, leaf-нодами ──
  if (showSiblings && rootParentKey && siblingCandidates.size > 0) {
    const parentDepth = depthMap.get(rootParentKey) ?? 1;
    const sibDepth = parentDepth + 1;
    if (maxDepth === 0 || maxDepth >= sibDepth) {
      for (const sib of siblingCandidates) {
        if (nodesMap.has(sib)) continue;
        if (!addNode(sib, sibDepth)) continue;
        addEdge(`${rootParentKey}->${sib}`, rootParentKey, sib, "inheritance");
      }
    }
  }

  // ── 4. Reference / linkage (mode: all) — на снимке keys, чтобы не взорваться ──
  if (mode === "all" && modelIndex) {
    const keysSnapshot = Array.from(nodesMap.keys());
    for (const key of keysSnapshot) {
      const entity = modelIndex.entitiesByFqid[key];
      if (!entity) continue;
      const currentDepth = depthMap.get(key) ?? 0;
      const nextDepth = currentDepth + 1;

      if (showReferences) {
        for (const a of entity.attributes) {
          const target = a.referenceEntity || a.itemReferenceEntity;
          if (
            !target ||
            !modelIndex.entitiesByFqid[target] ||
            nodesMap.has(target)
          )
            continue;
          if (!addNode(target, nextDepth)) continue;
          addEdge(
            `ref:${key}#${a.id}->${target}`,
            key,
            target,
            "reference",
            a.name || a.id,
          );
        }
        for (const other of modelIndex.entities) {
          if (other.fqid === key) continue;
          if (nodesMap.has(other.fqid)) continue;
          for (const a of other.attributes) {
            const target = a.referenceEntity || a.itemReferenceEntity;
            if (target !== key) continue;
            if (!addNode(other.fqid, nextDepth)) break;
            addEdge(
              `ref:${other.fqid}#${a.id}->${key}`,
              other.fqid,
              key,
              "reference",
              a.name || a.id,
            );
            break;
          }
        }
      }
      if (showLinkages) {
        for (const l of modelIndex.entityLinkages || []) {
          if (l.side1Fqid === key) {
            if (!nodesMap.has(l.side2Fqid) && !addNode(l.side2Fqid, nextDepth))
              continue;
            addEdge(
              `lnk:${l.domainId}#${l.id}`,
              l.side1Fqid,
              l.side2Fqid,
              "linkage",
              l.name,
            );
          } else if (l.side2Fqid === key) {
            if (!nodesMap.has(l.side1Fqid) && !addNode(l.side1Fqid, nextDepth))
              continue;
            addEdge(
              `lnk:${l.domainId}#${l.id}`,
              l.side1Fqid,
              l.side2Fqid,
              "linkage",
              l.name,
            );
          }
        }
      }
    }
  }

  // ── 5. Скрытие изолированных ──
  if (hideIsolated) {
    const connectedKeys = new Set<string>();
    for (const edge of edgesMap.values()) {
      connectedKeys.add(edge.source);
      connectedKeys.add(edge.target);
    }
    connectedKeys.add(rootKey);
    for (const key of Array.from(nodesMap.keys())) {
      if (!connectedKeys.has(key)) nodesMap.delete(key);
    }
    for (const [id, edge] of Array.from(edgesMap.entries())) {
      if (!nodesMap.has(edge.source) || !nodesMap.has(edge.target))
        edgesMap.delete(id);
    }
  }

  // ── 6. Siblings в графе (для ролей и UI-бейджа) ──
  const activeSiblings = new Set(
    Array.from(siblingCandidates).filter((k) => nodesMap.has(k)),
  );

  // ── 7. Роли ──
  const nodeRoles = new Map<string, EntityNodeRole>();
  for (const n of nodesMap.values()) {
    if (n.key === rootKey) nodeRoles.set(n.key, "root");
    else if (parentKeys.has(n.key)) nodeRoles.set(n.key, "ancestor");
    else if (childKeys.has(n.key)) nodeRoles.set(n.key, "descendant");
    else if (activeSiblings.has(n.key)) nodeRoles.set(n.key, "sibling");
    else if (n.missing) nodeRoles.set(n.key, "external");
    else nodeRoles.set(n.key, "linked");
  }

  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());
  const cycles = detectInheritanceCycles(nodes, edges);
  const cycleNodes = new Set<string>();
  cycles.forEach((c) => c.forEach((k) => cycleNodes.add(k)));

  return {
    nodes,
    edges,
    rootKey,
    parentKeys,
    childKeys,
    siblingKeys: activeSiblings,
    siblingCandidates,
    ancestorsOrdered,
    cycles,
    cycleNodes,
    nodeRoles,
  };
}

function detectInheritanceCycles(
  nodes: EntityTreeNode[],
  edges: EntityTreeEdge[],
): string[][] {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.key, []));
  edges.forEach((e) => {
    if (e.kind !== "inheritance") return;
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  });

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adj.get(v) || [];
    for (const w of neighbors) {
      if (!adj.has(w)) continue;
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }

  nodes.forEach((n) => {
    if (!indices.has(n.key)) strongconnect(n.key);
  });

  return sccs;
}

export function detectEntityCycles(
  nodes: EntityTreeNode[],
  edges: Array<{ source: string; target: string }>,
): Set<string> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.key, []));
  edges.forEach((e) => {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  });

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adj.get(v) || [];
    for (const to of neighbors) {
      if (!adj.has(to)) continue;
      if (!indices.has(to)) {
        strongconnect(to);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(to)!));
      } else if (onStack.has(to)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(to)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }

  nodes.forEach((n) => {
    if (!indices.has(n.key)) strongconnect(n.key);
  });

  const result = new Set<string>();
  sccs.forEach((scc) => scc.forEach((k) => result.add(k)));
  return result;
}

const ENTITY_W = 180;
const ENTITY_H = 60;
const ROOT_W = ENTITY_W * 1.35;
const ROOT_H = ENTITY_H * 1.2;

export interface LaidEntityNode extends EntityTreeNode {
  x: number;
  y: number;
  width: number;
  height: number;
}