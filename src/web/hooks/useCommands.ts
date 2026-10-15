import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { buildCommands, Command } from "../lib/commands";
import { EVT_FIND_CYCLES } from "../lib/events";
import { findPath } from "../lib/algorithms/path";
import type { RFEdge } from "../lib/types";

export interface UseCommandsParams {
  filteredEdges: RFEdge[];
  navBack: () => void;
  navForward: () => void;
  onExportJSON: () => void;
  onExportMarkdown: () => void;
  onExportPNG: () => void;
}

/**
 * Собирает команды для Command Palette.
 * Действия, требующие глобальной логики (findCycles, runPath), пробрасываются
 * через CustomEvent — их подхватывает App.
 */
export function useCommands({
  filteredEdges,
  navBack,
  navForward,
  onExportJSON,
  onExportMarkdown,
  onExportPNG,
}: UseCommandsParams): Command[] {
  const theme = useGraphStore((s) => s.theme);
  const setTheme = useGraphStore((s) => s.setTheme);
  const compact = useGraphStore((s) => s.compact);
  const setCompact = useGraphStore((s) => s.setCompact);
  const showGroups = useGraphStore((s) => s.showGroups);
  const setShowGroups = useGraphStore((s) => s.setShowGroups);
  const bidirectional = useGraphStore((s) => s.bidirectional);
  const setBidirectional = useGraphStore((s) => s.setBidirectional);
  const showEdgeLabels = useGraphStore((s) => s.showEdgeLabels);
  const setShowEdgeLabels = useGraphStore((s) => s.setShowEdgeLabels);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
  const setTooltipsEnabled = useGraphStore((s) => s.setTooltipsEnabled);
  const heatmap = useGraphStore((s) => s.heatmap);
  const setHeatmap = useGraphStore((s) => s.setHeatmap);
  const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
  const setIsolatedOnly = useGraphStore((s) => s.setIsolatedOnly);
  const nsMode = useGraphStore((s) => s.nsMode);
  const setNsMode = useGraphStore((s) => s.setNsMode);
  const focusNode = useGraphStore((s) => s.focusNode);
  const setFocusNode = useGraphStore((s) => s.setFocusNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
  const setBookmarksOnly = useGraphStore((s) => s.setBookmarksOnly);
  const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
  const setOnlyInvalid = useGraphStore((s) => s.setOnlyInvalid);
  const validationAvailable = useGraphStore((s) => s.validationAvailable);
  const setLayoutType = useGraphStore((s) => s.setLayoutType);
  const setTopoOpen = useGraphStore((s) => s.setTopoOpen);
  const setLearningPathOpen = useGraphStore((s) => s.setLearningPathOpen);
  const setEntityHierarchyOpen = useGraphStore((s) => s.setEntityHierarchyOpen);
  const setEntityHierarchyInitialKey = useGraphStore(
    (s) => s.setEntityHierarchyInitialKey,
  );
  const setHelpOpen = useGraphStore((s) => s.setHelpOpen);
  const setHotkeysOpen = useGraphStore((s) => s.setHotkeysOpen);
  const setValidationOpen = useGraphStore((s) => s.setValidationOpen);
  const setPathMode = useGraphStore((s) => s.setPathMode);
  const setPathSel = useGraphStore((s) => s.setPathSel);
  const setPathResult = useGraphStore((s) => s.setPathResult);
  const pathSel = useGraphStore((s) => s.pathSel);
  const tour = useGraphStore((s) => s.tour);
  const setTour = useGraphStore((s) => s.setTour);
  const rfInstance = useGraphStore((s) => s.rfInstance);

  // Экшены из store, не требующие args
  const resetAll = useGraphStore((s) => s.resetAll);
  const setFilters = useGraphStore((s) => s.setFilters);
  const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
  const setTagFilters = useGraphStore((s) => s.setTagFilters);
  const resetHiddenNodes = useGraphStore((s) => s.resetHiddenNodes);

  return useMemo(
    () =>
      buildCommands({
        theme,
        setTheme,
        compact,
        setCompact,
        showGroups,
        setShowGroups,
        bidirectional,
        setBidirectional,
        showEdgeLabels,
        setShowEdgeLabels,
        tooltipsEnabled,
        setTooltipsEnabled,
        heatmap,
        setHeatmap,
        isolatedOnly,
        setIsolatedOnly,
        nsMode,
        setNsMode,
        focusNode,
        setFocusNode,
        selectedNodeId,
        bookmarksOnly,
        setBookmarksOnly,
        onlyInvalid,
        setOnlyInvalid,
        validationAvailable,
        setLayoutType,
        setTopoOpen,
        setLearningPathOpen,
        setEntityHierarchyOpen,
        setHelpOpen,
        setHotkeysOpen,
        setValidationOpen,
        setEntityHierarchyInitialKey,
        tour,
        tourStop: () => setTour(null),
        rfInstance,
        navBack,
        navForward,
        handleFindCycles: () =>
          document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES)),
        handleRunPath: () => {
          if (pathSel.length === 2) {
            const res = findPath(pathSel[0], pathSel[1], filteredEdges);
            if (res) setPathResult(res);
            else alert("Путь не найден");
          } else {
            setPathMode({ anchorId: null });
            setPathSel([]);
            setPathResult(null);
          }
        },
        handleExportJSON: onExportJSON,
        handleExportMarkdown: onExportMarkdown,
        handleExportPNG: onExportPNG,
        resetAll,
        setFilters,
        setNamespaceFilter,
        setTagFilters,
        resetHiddenNodes,
      }),
    [
      theme,
      compact,
      showGroups,
      bidirectional,
      showEdgeLabels,
      tooltipsEnabled,
      heatmap,
      isolatedOnly,
      nsMode,
      focusNode,
      selectedNodeId,
      bookmarksOnly,
      onlyInvalid,
      validationAvailable,
      tour,
      rfInstance,
      pathSel,
      filteredEdges,
      navBack,
      navForward,
      onExportJSON,
      onExportMarkdown,
      onExportPNG,
    ],
  );
}
