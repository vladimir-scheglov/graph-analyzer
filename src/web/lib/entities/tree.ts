import dagre from "dagre";
import type {
  EntityIndex,
  EntityTreeNode,
  EntityRecord,
  EntityTreeEdge,
  EntityTree,
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
  const hideIsolated = options.hideIsolated !== false;

  const byKey = index.byKey;
  const childMap = index.children;

  const nodesMap = new Map<string, EntityTreeNode>();
  const edgesMap = new Map<string, EntityTreeEdge>();
  const depthMap = new Map<string, number>();

  /** Возвращает true, если узел был добавлен или обновлён (глубина уменьшилась). */
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

  addNode(rootKey, 0);

  // BFS
  const queue: Array<{ key: string; depth: number }> = [
    { key: rootKey, depth: 0 },
  ];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const { key, depth } = queue.shift()!;
    if (processed.has(key)) continue;
    processed.add(key);

    const nextDepth = depth + 1;

    // ============ Наследование ============
    if (showInheritance) {
      // Вверх
      const e = byKey.get(key);
      if (e && e.inherits) {
        const ref = resolveEntityRef(e.inherits, e.domainId);
        if (ref) {
          const parentKey = entityKey(ref.domainId, ref.entityId);
          if (addNode(parentKey, nextDepth)) {
            queue.push({ key: parentKey, depth: nextDepth });
          }
          addEdge(`${parentKey}->${key}`, parentKey, key, "inheritance");
        }
      }

      // Вниз
      const kids = childMap.get(key) || [];
      for (const child of kids) {
        const childKey = entityKey(child.domainId, child.entityId);
        if (addNode(childKey, nextDepth)) {
          queue.push({ key: childKey, depth: nextDepth });
        }
        addEdge(`${key}->${childKey}`, key, childKey, "inheritance");
      }
    }

    // ============ Reference и Linkage ============
    if (mode === "all" && modelIndex) {
      const entity = modelIndex.entitiesByFqid[key];
      if (entity) {
        if (showReferences) {
          // Исходящие
          for (const a of entity.attributes) {
            const target = a.referenceEntity || a.itemReferenceEntity;
            if (!target || !modelIndex.entitiesByFqid[target]) continue;
            if (addNode(target, nextDepth)) {
              queue.push({ key: target, depth: nextDepth });
            }
            addEdge(
              `ref:${key}#${a.id}->${target}`,
              key,
              target,
              "reference",
              a.name || a.id,
            );
          }

          // Входящие
          for (const other of modelIndex.entities) {
            if (other.fqid === key) continue;
            for (const a of other.attributes) {
              const target = a.referenceEntity || a.itemReferenceEntity;
              if (target !== key) continue;
              if (addNode(other.fqid, nextDepth)) {
                queue.push({ key: other.fqid, depth: nextDepth });
              }
              addEdge(
                `ref:${other.fqid}#${a.id}->${key}`,
                other.fqid,
                key,
                "reference",
                a.name || a.id,
              );
            }
          }
        }

        if (showLinkages) {
          for (const l of modelIndex.entityLinkages || []) {
            if (l.side1Fqid === key) {
              if (addNode(l.side2Fqid, nextDepth)) {
                queue.push({ key: l.side2Fqid, depth: nextDepth });
              }
              addEdge(
                `lnk:${l.domainId}#${l.id}`,
                l.side1Fqid,
                l.side2Fqid,
                "linkage",
                l.name,
              );
            } else if (l.side2Fqid === key) {
              if (addNode(l.side1Fqid, nextDepth)) {
                queue.push({ key: l.side1Fqid, depth: nextDepth });
              }
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
  }

  // ============ Скрытие изолированных ============
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

  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());

  const cycleNodes = detectEntityCycles(nodes, edges);

  const parents = new Set<string>();
  const children = new Set<string>();

  (() => {
    const stack = [rootKey];
    const visited = new Set([rootKey]);
    while (stack.length > 0) {
      const k = stack.pop()!;
      const e = byKey.get(k);
      if (!e || !e.inherits) continue;
      const ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref) continue;
      const pk = entityKey(ref.domainId, ref.entityId);
      if (!parents.has(pk)) parents.add(pk);
      if (!visited.has(pk)) {
        visited.add(pk);
        stack.push(pk);
      }
    }
  })();

  (() => {
    const stack = [rootKey];
    const visited = new Set([rootKey]);
    while (stack.length > 0) {
      const k = stack.pop()!;
      const kids = childMap.get(k) || [];
      kids.forEach((child) => {
        const ck = entityKey(child.domainId, child.entityId);
        if (!children.has(ck)) children.add(ck);
        if (!visited.has(ck)) {
          visited.add(ck);
          stack.push(ck);
        }
      });
    }
  })();

  return {
    nodes,
    edges,
    rootKey,
    parentKeys: parents,
    childKeys: children,
    cycleNodes,
  };
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