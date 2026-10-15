import dagre from "dagre";
import type {
  EntityIndex,
  EntityTree,
  EntityTreeNode,
  EntityRecord,
} from "../types";
import { entityKey, resolveEntityRef } from "./index";

export function buildEntityTree(
  rootKey: string,
  index: EntityIndex,
): EntityTree {
  const byKey = index.byKey;
  const childMap = index.children;

  const nodesMap = new Map<string, EntityTreeNode>();
  const edgesMap = new Map<
    string,
    { id: string; source: string; target: string }
  >();

  function addNode(key: string): EntityTreeNode {
    if (nodesMap.has(key)) return nodesMap.get(key)!;
    const e = byKey.get(key);
    const parts = key.split("/");
    const node: EntityTreeNode = {
      key,
      domainId: e ? e.domainId : parts[0],
      entityId: e ? e.entityId : parts.slice(1).join("/"),
      name: e ? e.name : null,
      inherits: e ? e.inherits : null,
      missing: !e,
    };
    nodesMap.set(key, node);
    return node;
  }

  function traverseParents(startKey: string): void {
    const visited = new Set<string>();
    const stack = [startKey];
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const e = byKey.get(key);
      if (!e || !e.inherits) continue;
      const ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref) continue;
      const parentKey = entityKey(ref.domainId, ref.entityId);
      addNode(parentKey);
      const edgeId = parentKey + "->" + key;
      if (!edgesMap.has(edgeId)) {
        edgesMap.set(edgeId, { id: edgeId, source: parentKey, target: key });
      }
      if (!visited.has(parentKey)) stack.push(parentKey);
    }
  }

  function traverseChildren(startKey: string): void {
    const visited = new Set<string>();
    const stack = [startKey];
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const kids = childMap.get(key) || [];
      kids.forEach((child) => {
        const childKey = entityKey(child.domainId, child.entityId);
        addNode(childKey);
        const edgeId = key + "->" + childKey;
        if (!edgesMap.has(edgeId)) {
          edgesMap.set(edgeId, { id: edgeId, source: key, target: childKey });
        }
        if (!visited.has(childKey)) stack.push(childKey);
      });
    }
  }

  addNode(rootKey);
  traverseParents(rootKey);
  traverseChildren(rootKey);

  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());

  const cycleNodes = detectEntityCycles(nodes, edges);

  const parents = new Set<string>();
  const children = new Set<string>();

  // Обход от root вверх
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

  // Обход от root вниз
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

export function layoutEntityGraph(
  nodes: EntityTreeNode[],
  edges: Array<{ source: string; target: string }>,
  rootKey: string,
): LaidEntityNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 25,
    ranksep: 55,
    marginx: 30,
    marginy: 30,
  });

  nodes.forEach((n) => {
    const w = n.key === rootKey ? ROOT_W : ENTITY_W;
    const h = n.key === rootKey ? ROOT_H : ENTITY_H;
    g.setNode(n.key, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.key);
    const w = n.key === rootKey ? ROOT_W : ENTITY_W;
    const h = n.key === rootKey ? ROOT_H : ENTITY_H;
    return Object.assign({}, n, {
      x: pos.x - w / 2,
      y: pos.y - h / 2,
      width: w,
      height: h,
    });
  });
}
