import { useCallback } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { RFNode } from "../lib/types";

/**
 * Навигация между доменами: goto (с историей), back/forward, gotoWithoutNav.
 * Требует доступа к nodes и rfInstance для центрирования.
 */
export function useNavigation() {
  const nodes = useGraphStore((s) => s.nodes);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const compact = useGraphStore((s) => s.compact);
  const pushNav = useGraphStore((s) => s.pushNav);
  const navStack = useGraphStore((s) => s.navStack);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);

  const domainToNodeId = useCallback((): Map<string, string> => {
    const m = new Map<string, string>();
    nodes.forEach((n: RFNode) =>
      m.set((n.data.domainId || "").toLowerCase(), n.id),
    );
    return m;
  }, [nodes]);

  const gotoWithoutNav = useCallback(
    (domainId: string) => {
      if (!domainId) return;
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId || !rfInstance) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const NODE_WIDTH = 300;
      const NODE_HEIGHT = 88;
      const NODE_COMPACT = 42;
      const w = compact ? NODE_COMPACT : NODE_WIDTH;
      const h = compact ? NODE_COMPACT : NODE_HEIGHT;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;
      const z = Math.max(rfInstance.getZoom(), 1.2);
      rfInstance.setCenter(cx, cy, { zoom: z, duration: 500 });
      setSelectedNodeId(nodeId);
    },
    [domainToNodeId, nodes, compact, rfInstance, setSelectedNodeId],
  );

  const goto = useCallback(
    (domainId: string) => {
      if (!domainId) return;
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId) return;
      pushNav(domainId);
      setSelectedNodeId(nodeId);
      useGraphStore.getState().setFocusNode(nodeId);
      gotoWithoutNav(domainId);
    },
    [domainToNodeId, pushNav, setSelectedNodeId, gotoWithoutNav],
  );

  const back = useCallback(() => {
    const cur = useGraphStore.getState().navStack;
    if (cur.index <= 0) return;
    const id = cur.items[cur.index - 1];
    useGraphStore.getState().navBack();
    if (id) setTimeout(() => gotoWithoutNav(id), 0);
  }, [gotoWithoutNav]);

  const forward = useCallback(() => {
    const cur = useGraphStore.getState().navStack;
    if (cur.index >= cur.items.length - 1) return;
    const id = cur.items[cur.index + 1];
    useGraphStore.getState().navForward();
    if (id) setTimeout(() => gotoWithoutNav(id), 0);
  }, [gotoWithoutNav]);

  return { goto, gotoWithoutNav, back, forward, navStack };
}
