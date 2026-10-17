import { useCallback } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { useNavigation } from "./useNavigation";
import { useTooltip } from "./useTooltip";
import { findPath } from "../lib/algorithms/path";
import { buildNodeTooltip, buildEdgeTooltip } from "../lib/tooltip-builders";
import type { RFEdge, FQIDRef } from "../lib/types";
import type { ContextAction } from "../components/common/ContextMenu";
import { openFileInEditor } from "../lib/open-file";

export interface UseNodeInteractionsParams {
  filteredEdges: RFEdge[];
}

export interface UseNodeInteractionsResult {
  handleNodeClick: (e: React.MouseEvent, node: any) => void;
  handleNodeDoubleClick: (e: React.MouseEvent, node: any) => void;
  handleNodeContextMenu: (e: React.MouseEvent, node: any) => void;
  handleNodeMouseEnter: (e: React.MouseEvent, node: any) => void;
  handleNodeMouseLeave: () => void;
  handleEdgeClick: (e: React.MouseEvent, edge: any) => void;
  handleEdgeMouseEnter: (e: React.MouseEvent, edge: any) => void;
  handleEdgeMouseLeave: () => void;
  handlePaneClick: () => void;
  handlePaneContextMenu: (e: React.MouseEvent) => void;
  handleContextAction: (action: ContextAction, nodeId: string) => void;
}

/**
 * Все обработчики кликов/наведения на узлах и рёбрах.
 * Читает состояние из store, использует navigation и tooltip.
 */
export function useNodeInteractions({
  filteredEdges,
}: UseNodeInteractionsParams): UseNodeInteractionsResult {
  const tooltip = useTooltip();
  const { goto } = useNavigation();

  // Store — читаем селективно
  const store = useGraphStore;

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: any) => {
      tooltip.hide();
      const s = store.getState();

      if (s.pathMode) {
        if (!s.pathMode.anchorId) {
          s.setPathMode({
            anchorId: node.id,
            anchorDomainId: node.data.domainId,
          });
          s.setPathSel([node.id]);
          return;
        }
        const startId = s.pathMode.anchorId;
        const endId = node.id;
        if (startId === endId) {
          s.setPathMode(null);
          s.setPathSel([]);
          return;
        }
        const res = findPath(startId, endId, filteredEdges);
        if (res) {
          s.setPathResult(res);
          s.setPathMode(null);
          s.setPathSel([]);
        } else {
          alert("Путь не найден");
          s.setPathMode(null);
          s.setPathSel([]);
        }
        return;
      }

      s.setSelectedEdgeId(null);
      s.setPathResult(null);
      s.setPathSel([]);
      s.setSelectedNodeId(node.id);
      s.setFocusNode(null);
      s.pushNav(node.data.domainId);

      if (s.sidePanelEnabled) {
        s.setPanelNodeId(node.id);
        s.setPanelTab("details");
        s.setPanelOpen(true);
      }
    },
    [tooltip, filteredEdges, store],
  );

  const handleNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: any) => {
      const s = store.getState();
      if (s.focusNode === node.id) {
        s.setFocusNode(null);
      } else {
        s.setFocusNode(node.id);
        s.setSelectedNodeId(node.id);
      }
    },
    [store],
  );

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: any) => {
      e.preventDefault();
      tooltip.hide();
      store.getState().setContextMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id,
      });
    },
    [tooltip, store],
  );

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: any) => {
      const s = store.getState();
      if (!s.tooltipsEnabled) return;
      if (s.pathSel.length > 0 || s.pathMode) return;
      const curZoom = s.rfInstance ? s.rfInstance.getZoom() : 1;
      if (curZoom < 0.15) return;
      tooltip.showForNode(node.id, () => buildNodeTooltip(node), e);
    },
    [tooltip, store],
  );

  const handleEdgeMouseEnter = useCallback(
    (e: React.MouseEvent, edge: any) => {
      const s = store.getState();
      if (!s.tooltipsEnabled) return;
      if (s.pathSel.length > 0 || s.pathMode) return;
      const refs = ((edge.data && edge.data.fqidRefs) || []) as FQIDRef[];
      tooltip.showForNode(
        "edge:" + edge.id,
        () => buildEdgeTooltip(edge, refs),
        e,
      );
    },
    [tooltip, store],
  );

  const handleEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: any) => {
      const s = store.getState();
      const realId = (edge.data && edge.data.originalId) || edge.id;
      s.setSelectedEdgeId(realId);
      if (s.sidePanelEnabled) {
        s.setPanelTab("edge");
        s.setPanelOpen(true);
      }
      tooltip.hide();
    },
    [tooltip, store],
  );

  const handlePaneClick = useCallback(() => {
    document.dispatchEvent(new CustomEvent("close-all-popovers"));
    tooltip.hide();
    const s = store.getState();
    s.setSelectedNodeId(null);
    s.setSelectedEdgeId(null);
    s.setFocusNode(null);
    s.setPathResult(null);
    s.setPathSel([]);
    s.setPathMode(null);
    s.setContextMenu(null);
  }, [tooltip, store]);

  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleContextAction = useCallback(
    (action: ContextAction, nodeId: string) => {
      const s = store.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      switch (action) {
        case "focus":
          s.setFocusNode(nodeId);
          s.setSelectedNodeId(null);
          break;
        case "dependents":
          s.setFocusNode(nodeId);
          s.setFocusDepth(3);
          break;
        case "path-from":
          s.setPathMode({ kind: "from", anchorId: nodeId });
          s.setPathSel([]);
          s.setPathResult(null);
          break;
        case "path-to":
          s.setPathMode({ kind: "to", anchorId: nodeId });
          s.setPathSel([]);
          s.setPathResult(null);
          break;
        case "open-file":
          if (node.data.filePath) openFileInEditor(node.data.filePath, null);
          break;
        case "copy-id":
          navigator.clipboard.writeText(node.data.domainId);
          break;
        case "hide":
          s.hideNode(nodeId);
          break;
        case "bookmark":
          s.toggleBookmark(nodeId);
          break;
      }
    },
    [store, openFileInEditor],
  );

  return {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeContextMenu,
    handleNodeMouseEnter,
    handleNodeMouseLeave: tooltip.scheduleHide,
    handleEdgeClick,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave: tooltip.scheduleHide,
    handlePaneClick,
    handlePaneContextMenu,
    handleContextAction,
  };
}
