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
      const st = useGraphStore.getState();
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId) return;

      // Всегда выделяем в панели (и в списке, и в графе)
      st.setSelectedNodeId(nodeId);
      st.setPanelNodeId(nodeId);
      st.setPanelTab("details");
      st.setPanelOpen(true);

      // Центрируем только в графе
      if (st.viewMode === "graph" && st.rfInstance) {
        const node = st.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const w = st.compact ? 42 : 300;
        const h = st.compact ? 42 : 88;
        try {
          st.rfInstance.setCenter(
            node.position.x + w / 2,
            node.position.y + h / 2,
            { zoom: Math.max(st.rfInstance.getZoom(), 1.2), duration: 500 },
          );
        } catch {}
      }
    },
    [domainToNodeId],
  );

  const goto = useCallback(
    (domainId: string) => {
      if (!domainId) return;
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId) return;

      pushNav(domainId);
      setSelectedNodeId(nodeId);

      // focusNode — граф-специфичное состояние. В list-режиме
      // его выставлять не нужно, иначе при переключении в граф
      // пользователь увидит фокус, который не запрашивал.
      const st = useGraphStore.getState();
      if (st.viewMode === "graph") {
        st.setFocusNode(nodeId);
      }

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
