import { create } from "zustand";
import type {
  RFNode,
  RFEdge,
  RuleDefinition,
  LearningPath,
} from "../lib/types";
import type { LayoutType } from "../lib/layout";

// ============ Типы состояния ============

export type PanelTab = "details" | "file" | "edge" | "entities";
export type HeatmapKey = "none" | "health" | "degree" | "entities" | "fqid";
export type ThemeName = "dark" | "light";

export interface Filters {
  domain: boolean;
  broken: boolean;
  missing: boolean;
  linkage: boolean;
  fqid: boolean;
}

export interface PathMode {
  kind?: "from" | "to";
  anchorId?: string | null;
  anchorDomainId?: string;
}

export interface CycleHighlight {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  sccCount: number;
}

export interface PathResult {
  nodes: string[];
  edges: string[];
}

export interface DiffMode {
  addedNodes: Set<string>;
  removedNodes: Set<string>;
  addedEdges: Set<string>;
  removedEdges: Set<string>;
  snapshot: any;
}

export interface NavStack {
  items: string[];
  index: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

export interface TooltipState {
  html: string;
  x: number;
  y: number;
  anchorX?: number;
  anchorY?: number;
}

export interface PendingFile {
  content: string;
  fqid: string | null;
  ts: number;
}

export interface TourState {
  stages: LearningPathStage[];
  index: number;
  playing: boolean;
  startedAt: number;
}

interface LearningPathStage {
  index: number;
  domains: any[];
}

export interface SnackbarState {
  message: string;
  ts: number;
}

export interface ClusterBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
}

// ============ Основной тип состояния ============

export interface GraphState {
  // Данные
  nodes: RFNode[];
  edges: RFEdge[];
  setNodes: (updater: RFNode[] | ((prev: RFNode[]) => RFNode[])) => void;
  setEdges: (updater: RFEdge[] | ((prev: RFEdge[]) => RFEdge[])) => void;

  // Тема
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;

  // Фильтры
  filters: Filters;
  setFilters: (updater: Filters | ((f: Filters) => Filters)) => void;
  namespaceFilter: string;
  setNamespaceFilter: (s: string) => void;
  isolatedOnly: boolean;
  setIsolatedOnly: (v: boolean | ((p: boolean) => boolean)) => void;
  onlyInvalid: boolean;
  setOnlyInvalid: (v: boolean) => void;
  bookmarksOnly: boolean;
  setBookmarksOnly: (v: boolean) => void;
  tagFilters: Set<string>;
  toggleTagFilter: (tag: string) => void;
  setTagFilters: (s: Set<string>) => void;
  hiddenNodeIds: Set<string>;
  hideNode: (id: string) => void;
  resetHiddenNodes: () => void;

  // Вид
  layoutType: LayoutType;
  setLayoutType: (t: LayoutType) => void;
  compact: boolean;
  setCompact: (v: boolean | ((p: boolean) => boolean)) => void;
  showGroups: boolean;
  setShowGroups: (v: boolean) => void;
  bidirectional: boolean;
  setBidirectional: (v: boolean) => void;
  showEdgeLabels: boolean;
  setShowEdgeLabels: (v: boolean) => void;
  clusterDepth: number;
  setClusterDepth: (n: number) => void;
  heatmap: HeatmapKey;
  setHeatmap: (h: HeatmapKey) => void;

  // Выделение и режимы
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  focusNode: string | null;
  setFocusNode: (id: string | null) => void;
  focusDepth: number;
  setFocusDepth: (n: number) => void;
  cycleHighlight: CycleHighlight | null;
  setCycleHighlight: (v: CycleHighlight | null) => void;
  pathResult: PathResult | null;
  setPathResult: (v: PathResult | null) => void;
  pathSel: string[];
  setPathSel: (v: string[]) => void;
  pathMode: PathMode | null;
  setPathMode: (v: PathMode | null) => void;
  diffMode: DiffMode | null;
  setDiffMode: (v: DiffMode | null) => void;
  nsMode: boolean;
  setNsMode: (v: boolean | ((p: boolean) => boolean)) => void;
  topoLevelMap: Map<string, number> | null;
  setTopoLevelMap: (m: Map<string, number> | null) => void;

  // UI панели
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  sidebarCompact: boolean;
  setSidebarCompact: (v: boolean) => void;
  collapsedSections: Set<string>;
  toggleCollapsedSection: (id: string, isCollapsed: boolean) => void;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  panelTab: PanelTab;
  setPanelTab: (t: PanelTab) => void;
  panelNodeId: string | null;
  setPanelNodeId: (id: string | null) => void;
  sidePanelEnabled: boolean;
  setSidePanelEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  editorFilePath: string;
  setEditorFilePath: (s: string) => void;
  pendingFile: PendingFile | null;
  setPendingFile: (f: PendingFile | null) => void;

  // Тултипы
  tooltipsEnabled: boolean;
  setTooltipsEnabled: (v: boolean | ((p: boolean) => boolean)) => void;
  tooltip: TooltipState | null;
  setTooltip: (
    t:
      | TooltipState
      | null
      | ((prev: TooltipState | null) => TooltipState | null),
  ) => void;

  // Поиск
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (s: string) => void;
  searchIndex: number;
  setSearchIndex: (n: number) => void;

  // Модалки
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  hotkeysOpen: boolean;
  setHotkeysOpen: (v: boolean) => void;
  rulesOpen: boolean;
  setRulesOpen: (v: boolean) => void;
  validationOpen: boolean;
  setValidationOpen: (v: boolean) => void;
  topoOpen: boolean;
  setTopoOpen: (v: boolean) => void;
  learningPathOpen: boolean;
  setLearningPathOpen: (v: boolean) => void;
  entityHierarchyOpen: boolean;
  setEntityHierarchyOpen: (v: boolean) => void;
  entityHierarchyInitialKey: string | null;
  setEntityHierarchyInitialKey: (k: string | null) => void;

  // Навигация
  navStack: NavStack;
  pushNav: (domainId: string) => void;
  navBack: () => void;
  navForward: () => void;

  // Закладки
  bookmarks: Set<string>;
  toggleBookmark: (nodeId: string) => void;

  // Правила
  rules: RuleDefinition[];
  setRules: (
    r: RuleDefinition[] | ((p: RuleDefinition[]) => RuleDefinition[]),
  ) => void;
  rulesHighlighted: boolean;
  setRulesHighlighted: (v: boolean) => void;
  showViolationsOnly: boolean;
  setShowViolationsOnly: (v: boolean) => void;

  // Валидация
  validationResults: Map<string, any> | null;
  setValidationResults: (m: Map<string, any> | null) => void;
  validationAvailable: boolean;
  setValidationAvailable: (v: boolean) => void;

  // Tour
  tour: TourState | null;
  setTour: (
    t: TourState | null | ((prev: TourState | null) => TourState | null),
  ) => void;

  // Активность
  activityPeriod: number;
  setActivityPeriod: (n: number) => void;

  // Снимки
  snapshotA: any;
  snapshotB: any;
  setSnapshotA: (s: any) => void;
  setSnapshotB: (s: any) => void;

  // Уведомления
  snackbar: SnackbarState | null;
  showSnackbar: (message: string) => void;

  // Контекстное меню
  contextMenu: ContextMenuState | null;
  setContextMenu: (m: ContextMenuState | null) => void;

  // Кластеры
  clusterBoxes: ClusterBox[];
  setClusterBoxes: (b: ClusterBox[]) => void;
  clusterGroupCount: number;
  setClusterGroupCount: (n: number) => void;

  // Служебное
  rfInstance: any | null;
  setRfInstance: (r: any) => void;
  didInitialFit: boolean;
  setDidInitialFit: (v: boolean) => void;

  // Сброс всего
  resetAll: () => void;
}

// ============ Хелперы для чтения localStorage ============

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) : fallback;
  } catch {
    return fallback;
  }
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ============ Updater helper ============

function applyUpdater<T>(prev: T, updater: T | ((p: T) => T)): T {
  return typeof updater === "function"
    ? (updater as (p: T) => T)(prev)
    : updater;
}

// ============ Store ============

export const useGraphStore = create<GraphState>((set, get) => ({
  // Данные
  nodes: [],
  edges: [],
  setNodes: (updater) =>
    set((s) => ({ nodes: applyUpdater(s.nodes, updater) })),
  setEdges: (updater) =>
    set((s) => ({ edges: applyUpdater(s.edges, updater) })),

  // Тема
  theme: readString("dg-theme", "dark") as ThemeName,
  setTheme: (t) => {
    try {
      localStorage.setItem("dg-theme", t);
    } catch {}
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },

  // Фильтры
  filters: {
    domain: true,
    broken: true,
    missing: true,
    linkage: true,
    fqid: true,
  },
  setFilters: (updater) =>
    set((s) => ({ filters: applyUpdater(s.filters, updater) })),
  namespaceFilter: "",
  setNamespaceFilter: (s) => set({ namespaceFilter: s }),
  isolatedOnly: false,
  setIsolatedOnly: (v) =>
    set((s) => ({ isolatedOnly: applyUpdater(s.isolatedOnly, v) })),
  onlyInvalid: false,
  setOnlyInvalid: (v) => set({ onlyInvalid: v }),
  bookmarksOnly: false,
  setBookmarksOnly: (v) => set({ bookmarksOnly: v }),
  tagFilters: new Set<string>(),
  toggleTagFilter: (tag) =>
    set((s) => {
      const next = new Set(s.tagFilters);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return { tagFilters: next };
    }),
  setTagFilters: (s) => set({ tagFilters: s }),
  hiddenNodeIds: new Set<string>(),
  hideNode: (id) =>
    set((s) => {
      const next = new Set(s.hiddenNodeIds);
      next.add(id);
      return { hiddenNodeIds: next };
    }),
  resetHiddenNodes: () => set({ hiddenNodeIds: new Set() }),

  // Вид
  layoutType: "LR",
  setLayoutType: (t) => set({ layoutType: t }),
  compact: false,
  setCompact: (v) => set((s) => ({ compact: applyUpdater(s.compact, v) })),
  showGroups: false,
  setShowGroups: (v) => set({ showGroups: v }),
  bidirectional: true,
  setBidirectional: (v) => set({ bidirectional: v }),
  showEdgeLabels: false,
  setShowEdgeLabels: (v) => set({ showEdgeLabels: v }),
  clusterDepth: 2,
  setClusterDepth: (n) => set({ clusterDepth: n }),
  heatmap: "none",
  setHeatmap: (h) => set({ heatmap: h }),

  // Выделение и режимы
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  selectedEdgeId: null,
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),
  focusNode: null,
  setFocusNode: (id) => set({ focusNode: id }),
  focusDepth: 2,
  setFocusDepth: (n) => set({ focusDepth: n }),
  cycleHighlight: null,
  setCycleHighlight: (v) => set({ cycleHighlight: v }),
  pathResult: null,
  setPathResult: (v) => set({ pathResult: v }),
  pathSel: [],
  setPathSel: (v) => set({ pathSel: v }),
  pathMode: null,
  setPathMode: (v) => set({ pathMode: v }),
  diffMode: null,
  setDiffMode: (v) => set({ diffMode: v }),
  nsMode: false,
  setNsMode: (v) => set((s) => ({ nsMode: applyUpdater(s.nsMode, v) })),
  topoLevelMap: null,
  setTopoLevelMap: (m) => set({ topoLevelMap: m }),

  // UI панели
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  sidebarCompact: false,
  setSidebarCompact: (v) => set({ sidebarCompact: v }),
  collapsedSections: new Set<string>([
    "fqid-out",
    "incoming",
    "outgoing",
    "violations",
    "validation",
  ]),
  toggleCollapsedSection: (id, isCollapsed) =>
    set((s) => {
      const next = new Set(s.collapsedSections);
      if (isCollapsed) next.delete(id);
      else next.add(id);
      return { collapsedSections: next };
    }),
  panelOpen: false,
  setPanelOpen: (v) => set({ panelOpen: v }),
  panelTab: "details",
  setPanelTab: (t) => set({ panelTab: t }),
  panelNodeId: null,
  setPanelNodeId: (id) => set({ panelNodeId: id }),
  sidePanelEnabled: readBool("dg-side-panel-enabled", true),
  setSidePanelEnabled: (v) => {
    const next = applyUpdater(get().sidePanelEnabled, v);
    try {
      localStorage.setItem("dg-side-panel-enabled", String(next));
    } catch {}
    set({ sidePanelEnabled: next });
  },
  editorFilePath: "",
  setEditorFilePath: (s) => set({ editorFilePath: s }),
  pendingFile: null,
  setPendingFile: (f) => set({ pendingFile: f }),

  // Тултипы
  tooltipsEnabled: readBool("dg-tooltip-enabled", true),
  setTooltipsEnabled: (v) => {
    const next = applyUpdater(get().tooltipsEnabled, v);
    try {
      localStorage.setItem("dg-tooltip-enabled", String(next));
    } catch {}
    set({ tooltipsEnabled: next });
  },
  tooltip: null,
  setTooltip: (t) =>
    set((s) => ({ tooltip: typeof t === "function" ? t(s.tooltip) : t })),

  // Поиск
  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  searchQuery: "",
  setSearchQuery: (s) => set({ searchQuery: s }),
  searchIndex: 0,
  setSearchIndex: (n) => set({ searchIndex: n }),

  // Модалки
  helpOpen: false,
  setHelpOpen: (v) => set({ helpOpen: v }),
  hotkeysOpen: false,
  setHotkeysOpen: (v) => set({ hotkeysOpen: v }),
  rulesOpen: false,
  setRulesOpen: (v) => set({ rulesOpen: v }),
  validationOpen: false,
  setValidationOpen: (v) => set({ validationOpen: v }),
  topoOpen: false,
  setTopoOpen: (v) => set({ topoOpen: v }),
  learningPathOpen: false,
  setLearningPathOpen: (v) => set({ learningPathOpen: v }),
  entityHierarchyOpen: false,
  setEntityHierarchyOpen: (v) => set({ entityHierarchyOpen: v }),
  entityHierarchyInitialKey: null,
  setEntityHierarchyInitialKey: (k) => set({ entityHierarchyInitialKey: k }),

  // Навигация
  navStack: { items: [], index: -1 },
  pushNav: (domainId) =>
    set((s) => {
      if (!domainId) return s;
      const trimmed = s.navStack.items.slice(0, s.navStack.index + 1);
      if (trimmed.length > 0 && trimmed[trimmed.length - 1] === domainId)
        return s;
      let next = trimmed.concat([domainId]);
      if (next.length > 50) next = next.slice(next.length - 50);
      return { navStack: { items: next, index: next.length - 1 } };
    }),
  navBack: () =>
    set((s) => {
      if (s.navStack.index <= 0) return s;
      return {
        navStack: { items: s.navStack.items, index: s.navStack.index - 1 },
      };
    }),
  navForward: () =>
    set((s) => {
      if (s.navStack.index >= s.navStack.items.length - 1) return s;
      return {
        navStack: { items: s.navStack.items, index: s.navStack.index + 1 },
      };
    }),

  // Закладки
  bookmarks: readSet("dg-bookmarks"),
  toggleBookmark: (nodeId) =>
    set((s) => {
      const next = new Set(s.bookmarks);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      try {
        localStorage.setItem("dg-bookmarks", JSON.stringify(Array.from(next)));
      } catch {}
      return { bookmarks: next };
    }),

  // Правила
  rules: readJSON<RuleDefinition[]>("dg-rules", []),
  setRules: (r) =>
    set((s) => {
      const next = applyUpdater(s.rules, r);
      try {
        localStorage.setItem("dg-rules", JSON.stringify(next));
      } catch {}
      return { rules: next };
    }),
  rulesHighlighted: true,
  setRulesHighlighted: (v) => set({ rulesHighlighted: v }),
  showViolationsOnly: false,
  setShowViolationsOnly: (v) => set({ showViolationsOnly: v }),

  // Валидация
  validationResults: null,
  setValidationResults: (m) => set({ validationResults: m }),
  validationAvailable: false,
  setValidationAvailable: (v) => set({ validationAvailable: v }),

  // Tour
  tour: null,
  setTour: (t) =>
    set((s) => ({ tour: typeof t === "function" ? t(s.tour) : t })),

  // Активность
  activityPeriod: readNumber("dg-activity-period", 30),
  setActivityPeriod: (n) => {
    try {
      localStorage.setItem("dg-activity-period", String(n));
    } catch {}
    set({ activityPeriod: n });
  },

  // Снимки
  snapshotA: readJSON<any>("dg-snapshot-a", null),
  snapshotB: readJSON<any>("dg-snapshot-b", null),
  setSnapshotA: (s) => {
    try {
      if (s) localStorage.setItem("dg-snapshot-a", JSON.stringify(s));
      else localStorage.removeItem("dg-snapshot-a");
    } catch {}
    set({ snapshotA: s });
  },
  setSnapshotB: (s) => {
    try {
      if (s) localStorage.setItem("dg-snapshot-b", JSON.stringify(s));
      else localStorage.removeItem("dg-snapshot-b");
    } catch {}
    set({ snapshotB: s });
  },

  // Уведомления
  snackbar: null,
  showSnackbar: (message) => {
    const ts = Date.now();
    set({ snackbar: { message, ts } });
    setTimeout(() => {
      const cur = get().snackbar;
      if (cur && Date.now() - cur.ts >= 2000) set({ snackbar: null });
    }, 2100);
  },

  // Контекстное меню
  contextMenu: null,
  setContextMenu: (m) => set({ contextMenu: m }),

  // Кластеры
  clusterBoxes: [],
  setClusterBoxes: (b) => set({ clusterBoxes: b }),
  clusterGroupCount: 0,
  setClusterGroupCount: (n) => set({ clusterGroupCount: n }),

  // Служебное
  rfInstance: null,
  setRfInstance: (r) => set({ rfInstance: r }),
  didInitialFit: false,
  setDidInitialFit: (v) => set({ didInitialFit: v }),

  // Сброс всего
  resetAll: () =>
    set({
      filters: {
        domain: true,
        broken: true,
        missing: true,
        linkage: true,
        fqid: true,
      },
      namespaceFilter: "",
      tagFilters: new Set(),
      isolatedOnly: false,
      bookmarksOnly: false,
      onlyInvalid: false,
      hiddenNodeIds: new Set(),
      cycleHighlight: null,
      focusNode: null,
      pathMode: null,
      pathSel: [],
      pathResult: null,
      selectedNodeId: null,
      selectedEdgeId: null,
      diffMode: null,
      rulesHighlighted: true,
      showViolationsOnly: false,
      layoutType: "LR",
      topoLevelMap: null,
    }),
}));

// ============ Селекторы для наиболее частых выборок ============

export const selectSelectedNodeId = (s: GraphState): string | null =>
  s.selectedNodeId;
export const selectFocusNode = (s: GraphState): string | null => s.focusNode;
export const selectFilters = (s: GraphState): Filters => s.filters;
export const selectNamespaceFilter = (s: GraphState): string =>
  s.namespaceFilter;
export const selectTooltipsEnabled = (s: GraphState): boolean =>
  s.tooltipsEnabled;
