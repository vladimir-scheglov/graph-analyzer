var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/web/state/useGraphStore.ts
import { create } from "zustand";
function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}
function readString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function readNumber(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) : fallback;
  } catch {
    return fallback;
  }
}
function readSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function applyUpdater(prev, updater) {
  return typeof updater === "function" ? updater(prev) : updater;
}
var useGraphStore;
var init_useGraphStore = __esm({
  "src/web/state/useGraphStore.ts"() {
    "use strict";
    useGraphStore = create((set, get) => ({
      // Данные
      nodes: [],
      edges: [],
      setNodes: (updater) => set((s) => ({ nodes: applyUpdater(s.nodes, updater) })),
      setEdges: (updater) => set((s) => ({ edges: applyUpdater(s.edges, updater) })),
      // Тема
      theme: readString("dg-theme", "dark"),
      setTheme: (t) => {
        try {
          localStorage.setItem("dg-theme", t);
        } catch {
        }
        document.documentElement.setAttribute("data-theme", t);
        set({ theme: t });
      },
      // Фильтры
      filters: {
        domain: true,
        broken: true,
        missing: true,
        linkage: true,
        fqid: true
      },
      setFilters: (updater) => set((s) => ({ filters: applyUpdater(s.filters, updater) })),
      namespaceFilter: "",
      setNamespaceFilter: (s) => set({ namespaceFilter: s }),
      isolatedOnly: false,
      setIsolatedOnly: (v) => set((s) => ({ isolatedOnly: applyUpdater(s.isolatedOnly, v) })),
      onlyInvalid: false,
      setOnlyInvalid: (v) => set({ onlyInvalid: v }),
      bookmarksOnly: false,
      setBookmarksOnly: (v) => set({ bookmarksOnly: v }),
      tagFilters: /* @__PURE__ */ new Set(),
      toggleTagFilter: (tag) => set((s) => {
        const next = new Set(s.tagFilters);
        if (next.has(tag))
          next.delete(tag);
        else
          next.add(tag);
        return { tagFilters: next };
      }),
      setTagFilters: (s) => set({ tagFilters: s }),
      hiddenNodeIds: /* @__PURE__ */ new Set(),
      hideNode: (id) => set((s) => {
        const next = new Set(s.hiddenNodeIds);
        next.add(id);
        return { hiddenNodeIds: next };
      }),
      resetHiddenNodes: () => set({ hiddenNodeIds: /* @__PURE__ */ new Set() }),
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
      collapsedSections: /* @__PURE__ */ new Set([
        "fqid-out",
        "incoming",
        "outgoing",
        "violations",
        "validation"
      ]),
      toggleCollapsedSection: (id, isCollapsed) => set((s) => {
        const next = new Set(s.collapsedSections);
        if (isCollapsed)
          next.delete(id);
        else
          next.add(id);
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
        } catch {
        }
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
        } catch {
        }
        set({ tooltipsEnabled: next });
      },
      tooltip: null,
      setTooltip: (t) => set((s) => ({ tooltip: typeof t === "function" ? t(s.tooltip) : t })),
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
      pushNav: (domainId) => set((s) => {
        if (!domainId)
          return s;
        const trimmed = s.navStack.items.slice(0, s.navStack.index + 1);
        if (trimmed.length > 0 && trimmed[trimmed.length - 1] === domainId)
          return s;
        let next = trimmed.concat([domainId]);
        if (next.length > 50)
          next = next.slice(next.length - 50);
        return { navStack: { items: next, index: next.length - 1 } };
      }),
      navBack: () => set((s) => {
        if (s.navStack.index <= 0)
          return s;
        return {
          navStack: { items: s.navStack.items, index: s.navStack.index - 1 }
        };
      }),
      navForward: () => set((s) => {
        if (s.navStack.index >= s.navStack.items.length - 1)
          return s;
        return {
          navStack: { items: s.navStack.items, index: s.navStack.index + 1 }
        };
      }),
      // Закладки
      bookmarks: readSet("dg-bookmarks"),
      toggleBookmark: (nodeId) => set((s) => {
        const next = new Set(s.bookmarks);
        if (next.has(nodeId))
          next.delete(nodeId);
        else
          next.add(nodeId);
        try {
          localStorage.setItem("dg-bookmarks", JSON.stringify(Array.from(next)));
        } catch {
        }
        return { bookmarks: next };
      }),
      // Правила
      rules: readJSON("dg-rules", []),
      setRules: (r) => set((s) => {
        const next = applyUpdater(s.rules, r);
        try {
          localStorage.setItem("dg-rules", JSON.stringify(next));
        } catch {
        }
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
      setTour: (t) => set((s) => ({ tour: typeof t === "function" ? t(s.tour) : t })),
      // Активность
      activityPeriod: readNumber("dg-activity-period", 30),
      setActivityPeriod: (n) => {
        try {
          localStorage.setItem("dg-activity-period", String(n));
        } catch {
        }
        set({ activityPeriod: n });
      },
      // Снимки
      snapshotA: readJSON("dg-snapshot-a", null),
      snapshotB: readJSON("dg-snapshot-b", null),
      setSnapshotA: (s) => {
        try {
          if (s)
            localStorage.setItem("dg-snapshot-a", JSON.stringify(s));
          else
            localStorage.removeItem("dg-snapshot-a");
        } catch {
        }
        set({ snapshotA: s });
      },
      setSnapshotB: (s) => {
        try {
          if (s)
            localStorage.setItem("dg-snapshot-b", JSON.stringify(s));
          else
            localStorage.removeItem("dg-snapshot-b");
        } catch {
        }
        set({ snapshotB: s });
      },
      // Уведомления
      snackbar: null,
      showSnackbar: (message) => {
        const ts = Date.now();
        set({ snackbar: { message, ts } });
        setTimeout(() => {
          const cur = get().snackbar;
          if (cur && Date.now() - cur.ts >= 2e3)
            set({ snackbar: null });
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
      resetAll: () => set({
        filters: {
          domain: true,
          broken: true,
          missing: true,
          linkage: true,
          fqid: true
        },
        namespaceFilter: "",
        tagFilters: /* @__PURE__ */ new Set(),
        isolatedOnly: false,
        bookmarksOnly: false,
        onlyInvalid: false,
        hiddenNodeIds: /* @__PURE__ */ new Set(),
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
        topoLevelMap: null
      })
    }));
  }
});

// src/web/lib/layout.ts
import dagre from "dagre";
function dagreLayout(nodes, edges, rankdir = "LR") {
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir,
    nodesep: 18,
    ranksep: 60,
    edgesep: 10,
    marginx: 40,
    marginy: 40
  });
  const validNodes = nodes.filter(
    (n) => n && typeof n.id === "string" && n.id.length > 0
  );
  validNodes.forEach((n) => {
    const isCompact = n.data && n.data.__compact;
    g.setNode(n.id, {
      width: isCompact ? CW : W,
      height: isCompact ? CW : H
    });
  });
  const validIds = new Set(validNodes.map((n) => n.id));
  edges.forEach((e) => {
    if (!e || !e.source || !e.target)
      return;
    if (!validIds.has(e.source) || !validIds.has(e.target))
      return;
    g.setEdge(e.source, e.target);
  });
  dagre.layout(g);
  return validNodes.map((n) => {
    const pos = g.node(n.id);
    const isCompact = n.data && n.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;
    const x = pos && typeof pos.x === "number" && isFinite(pos.x) ? pos.x - w / 2 : 0;
    const y = pos && typeof pos.y === "number" && isFinite(pos.y) ? pos.y - h / 2 : 0;
    return Object.assign({}, n, {
      position: { x, y },
      width: w,
      height: h,
      targetPosition: rankdir === "LR" ? "left" : "top",
      sourcePosition: rankdir === "LR" ? "right" : "bottom"
    });
  });
}
function circularLayout(nodes) {
  const n = nodes.length;
  const R = Math.max(350, n * 40);
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;
  return nodes.map((node, i) => {
    const angle = i / n * 2 * Math.PI - Math.PI / 2;
    const px = Math.cos(angle) * R;
    const py = Math.sin(angle) * R;
    const isCompact = node.data && node.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;
    return Object.assign({}, node, {
      position: {
        x: isFinite(px) ? px : i * 250,
        y: isFinite(py) ? py : 0
      },
      width: w,
      height: h,
      targetPosition: "left",
      sourcePosition: "right"
    });
  });
}
function forceLayout(nodes, edges) {
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    const a = i / n * 2 * Math.PI;
    return { x: Math.cos(a) * 400, y: Math.sin(a) * 400 };
  });
  const idx = /* @__PURE__ */ new Map();
  nodes.forEach((node, i) => idx.set(node.id, i));
  const links = edges.map(
    (e) => [idx.get(e.source), idx.get(e.target)]
  ).filter((l) => l[0] != null && l[1] != null);
  for (let iter = 0; iter < 250; iter++) {
    const fx = new Array(n).fill(0);
    const fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const f = 8e3 / d2;
        fx[i] -= dx / d * f;
        fy[i] -= dy / d * f;
        fx[j] += dx / d * f;
        fy[j] += dy / d * f;
      }
    }
    for (const [a, b] of links) {
      const ddx = pos[b].x - pos[a].x;
      const ddy = pos[b].y - pos[a].y;
      const dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
      const ff = (dd - 200) * 0.02;
      fx[a] += ddx / dd * ff;
      fy[a] += ddy / dd * ff;
      fx[b] -= ddx / dd * ff;
      fy[b] -= ddy / dd * ff;
    }
    const alpha = 1 - iter / 250;
    for (let m = 0; m < n; m++) {
      pos[m].x += fx[m] * alpha * 0.5;
      pos[m].y += fy[m] * alpha * 0.5;
    }
  }
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;
  return nodes.map((node, i) => {
    const isCompact = node.data && node.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;
    return Object.assign({}, node, {
      position: {
        x: isFinite(pos[i].x) ? pos[i].x : i * 250,
        y: isFinite(pos[i].y) ? pos[i].y : 0
      },
      targetPosition: "left",
      sourcePosition: "right",
      width: w,
      height: h
    });
  });
}
function clusterLayout(nodes, edges, getKeyForDepth) {
  const NODE_W = NODE_WIDTH;
  const NODE_H = NODE_HEIGHT;
  const CLUSTER_PAD = 36;
  const HEADER_H = 30;
  const MAX_GROUPS = 50;
  let effectiveDepth = 2;
  for (let d = 1; d <= 5; d++) {
    const cnt = /* @__PURE__ */ new Set();
    nodes.forEach((n) => {
      if (n.data && n.data.nodeType === "domain") {
        const key = getKeyForDepth(n, d);
        if (key)
          cnt.add(key);
      }
    });
    effectiveDepth = d;
    if (cnt.size <= MAX_GROUPS)
      break;
  }
  const groups = /* @__PURE__ */ new Map();
  const nodeToNs = /* @__PURE__ */ new Map();
  nodes.forEach((n) => {
    if (!n.data || n.data.nodeType !== "domain") {
      const key = "__other__";
      if (!groups.has(key))
        groups.set(key, []);
      groups.get(key).push(n);
      nodeToNs.set(n.id, key);
      return;
    }
    const ns = getKeyForDepth(n, effectiveDepth);
    if (!groups.has(ns))
      groups.set(ns, []);
    groups.get(ns).push(n);
    nodeToNs.set(n.id, ns);
  });
  const groupLayouts = /* @__PURE__ */ new Map();
  groups.forEach((groupNodes, ns) => {
    if (ns === "__other__") {
      const laidOther = groupNodes.map(
        (n, i) => Object.assign({}, n, { __x: i * (NODE_W + 20), __y: 0 })
      );
      groupLayouts.set(ns, {
        nodes: laidOther,
        width: laidOther.length * (NODE_W + 20) - 20,
        height: NODE_H,
        label: null
      });
      return;
    }
    if (groupNodes.length === 1) {
      groupLayouts.set(ns, {
        nodes: groupNodes.map(
          (n) => Object.assign({}, n, { __x: 0, __y: 0 })
        ),
        width: NODE_W,
        height: NODE_H,
        label: ns
      });
      return;
    }
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: "LR",
      nodesep: 18,
      ranksep: 60,
      marginx: 10,
      marginy: 10
    });
    const ids = new Set(groupNodes.map((n) => n.id));
    groupNodes.forEach(
      (n) => g.setNode(n.id, { width: NODE_W, height: NODE_H })
    );
    edges.forEach((e) => {
      if (ids.has(e.source) && ids.has(e.target))
        g.setEdge(e.source, e.target);
    });
    dagre.layout(g);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const raw = groupNodes.map((n) => {
      const pos = g.node(n.id);
      const x = pos.x - NODE_W / 2;
      const y = pos.y - NODE_H / 2;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
      return { node: n, x, y };
    });
    const laid = raw.map(
      (item) => Object.assign({}, item.node, {
        __x: item.x - minX,
        __y: item.y - minY
      })
    );
    groupLayouts.set(ns, {
      nodes: laid,
      width: maxX - minX,
      height: maxY - minY,
      label: ns
    });
  });
  const metaEdgesMap = /* @__PURE__ */ new Map();
  edges.forEach((e) => {
    const sNs = nodeToNs.get(e.source);
    const tNs = nodeToNs.get(e.target);
    if (!sNs || !tNs || sNs === tNs)
      return;
    metaEdgesMap.set(sNs + "\u2192" + tNs, 1);
  });
  const meta = new dagre.graphlib.Graph();
  meta.setDefaultEdgeLabel(() => ({}));
  meta.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40
  });
  groupLayouts.forEach((layout, ns) => {
    const w = layout.width + (layout.label ? CLUSTER_PAD * 2 : 0);
    const h = layout.height + (layout.label ? CLUSTER_PAD * 2 + HEADER_H : 0);
    meta.setNode(ns, { width: w, height: h });
  });
  metaEdgesMap.forEach((_, key) => {
    const p = key.split("\u2192");
    meta.setEdge(p[0], p[1]);
  });
  dagre.layout(meta);
  const finalNodes = [];
  const boxes = [];
  groupLayouts.forEach((layout, ns) => {
    const metaPos = meta.node(ns);
    const hasLabel = !!layout.label;
    const padX = hasLabel ? CLUSTER_PAD : 0;
    const padY = hasLabel ? CLUSTER_PAD + HEADER_H : 0;
    const groupW = layout.width + padX * 2;
    const groupH = layout.height + padY + (hasLabel ? CLUSTER_PAD : 0);
    const groupX = metaPos ? metaPos.x - groupW / 2 : 0;
    const groupY = metaPos ? metaPos.y - groupH / 2 : 0;
    if (hasLabel) {
      boxes.push({
        id: ns,
        label: ns,
        x: groupX,
        y: groupY,
        w: groupW,
        h: groupH,
        count: layout.nodes.length
      });
    }
    layout.nodes.forEach((n) => {
      const copy = Object.assign({}, n);
      delete copy.__x;
      delete copy.__y;
      finalNodes.push(
        Object.assign(copy, {
          position: {
            x: groupX + padX + n.__x,
            y: groupY + padY + n.__y
          },
          width: NODE_W,
          height: NODE_H,
          targetPosition: "left",
          sourcePosition: "right"
        })
      );
    });
  });
  return { nodes: finalNodes, boxes, effectiveDepth };
}
function getNsByDomainId(node, depth) {
  const parts = (node.data.domainId || "").split(".");
  return parts.slice(0, depth).join(".") || "__empty__";
}
function getFolderKey(node, depth) {
  const fp = node.data && node.data.folderPath || [];
  if (fp.length === 0)
    return "__root__";
  return fp.slice(0, depth).join("/") || "__root__";
}
function runLayout(nodes, edges, type, opts) {
  if (type === "TB") {
    return {
      nodes: dagreLayout(nodes, edges, "TB"),
      boxes: [],
      effectiveDepth: null
    };
  }
  if (type === "force") {
    return {
      nodes: forceLayout(nodes, edges),
      boxes: [],
      effectiveDepth: null
    };
  }
  if (type === "circular") {
    return { nodes: circularLayout(nodes), boxes: [], effectiveDepth: null };
  }
  if (type === "cluster") {
    const result = clusterLayout(nodes, edges, getNsByDomainId);
    return {
      nodes: result.nodes,
      boxes: result.boxes,
      effectiveDepth: result.effectiveDepth
    };
  }
  if (type === "folder") {
    const result = clusterLayout(nodes, edges, getFolderKey);
    return {
      nodes: result.nodes,
      boxes: result.boxes,
      effectiveDepth: result.effectiveDepth
    };
  }
  return {
    nodes: dagreLayout(nodes, edges, "LR"),
    boxes: [],
    effectiveDepth: null
  };
}
var NODE_WIDTH, NODE_HEIGHT, NODE_COMPACT;
var init_layout = __esm({
  "src/web/lib/layout.ts"() {
    "use strict";
    NODE_WIDTH = 300;
    NODE_HEIGHT = 88;
    NODE_COMPACT = 42;
  }
});

// src/web/state/initial.ts
function readGraphData() {
  const el = document.getElementById("graph-data");
  if (!el)
    throw new Error("#graph-data not found");
  return JSON.parse(el.textContent || "{}");
}
function readRemoteInfo() {
  const el = document.getElementById("remote-info");
  if (!el)
    return null;
  try {
    return JSON.parse(el.textContent || "null");
  } catch {
    return null;
  }
}
function readRefreshCommand() {
  const el = document.getElementById("refresh-command");
  if (!el)
    return null;
  try {
    return JSON.parse(el.textContent || "null");
  } catch {
    return null;
  }
}
function buildInitialNodes(data) {
  const raw = data.nodes.filter((n) => n && n.id && typeof n.id === "string").map((n) => {
    const domainId = n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, "");
    return {
      id: n.id,
      type: "domainNode",
      data: {
        domainId,
        label: n.label,
        nodeType: n.group,
        filePath: n.filePath || null,
        folderPath: n.folderPath || [],
        fqidRefs: n.fqidRefs || [],
        version: n.version,
        entitiesCount: n.entitiesCount,
        name: n.name || n.label || "",
        description: n.description || "",
        author: n.author || "",
        tags: Array.isArray(n.tags) ? n.tags : [],
        updatedAt: n.updatedAt || null,
        updatedAtSource: n.updatedAtSource || null,
        createdAt: n.createdAt || null,
        createdAtSource: n.createdAtSource || null
      },
      position: { x: 0, y: 0 }
    };
  });
  const edges = buildInitialEdges(data);
  return dagreLayout(raw, edges, "LR");
}
function buildInitialEdges(data) {
  return data.edges.filter((e) => e && e.id && e.from && e.to).map((e) => {
    const isLinkage = e.kind === "linkage";
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      label: e.label,
      data: {
        fqidRefs: e.fqidRefs || [],
        linkData: e.linkData || null,
        fullLabel: e.fullLabel || e.label || e.id,
        kind: e.kind,
        refCount: e.refCount,
        side1Domain: e.side1Domain || null,
        side2Domain: e.side2Domain || null
      },
      markerEnd: {
        type: "arrowclosed",
        color: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
        width: 14,
        height: 14
      },
      style: {
        stroke: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
        strokeWidth: 1,
        opacity: 0.5
      }
    };
  });
}
var LINKAGE_COLOR, FQID_COLOR;
var init_initial = __esm({
  "src/web/state/initial.ts"() {
    "use strict";
    init_layout();
    LINKAGE_COLOR = "#6366a1";
    FQID_COLOR = "#4b7c6c";
  }
});

// src/web/lib/namespace-filter.ts
function matchesNamespace(domainId, filterPattern) {
  if (!filterPattern || filterPattern.trim() === "")
    return true;
  const tokens = filterPattern.replace(/[,;]/g, " ").split(" ").filter((p) => p.length > 0).map((p) => p.toLowerCase());
  if (tokens.length === 0)
    return true;
  const id = domainId.toLowerCase();
  const include = tokens.filter((t) => t.charAt(0) !== "!");
  const exclude = tokens.filter((t) => t.charAt(0) === "!").map((t) => t.slice(1)).filter((t) => t.length > 0);
  for (const ex of exclude) {
    if (simplePatternMatch(id, ex))
      return false;
  }
  if (include.length === 0)
    return true;
  for (const inc of include) {
    if (simplePatternMatch(id, inc))
      return true;
  }
  return false;
}
function simplePatternMatch(domainId, pattern) {
  if (pattern.indexOf("*") !== -1) {
    const parts = pattern.split("*");
    if (parts[0]) {
      const prefix = parts[0];
      const prefixNoDot = prefix.charAt(prefix.length - 1) === "." ? prefix.slice(0, -1) : prefix;
      if (domainId.indexOf(prefix) !== 0 && domainId !== prefixNoDot)
        return false;
    }
    if (parts[parts.length - 1]) {
      const last = parts[parts.length - 1];
      if (domainId.lastIndexOf(last) !== domainId.length - last.length)
        return false;
    }
    let pos = parts[0] ? parts[0].length : 0;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!parts[i])
        continue;
      const found = domainId.indexOf(parts[i], pos);
      if (found === -1)
        return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  return domainId === pattern || domainId.indexOf(pattern + ".") === 0;
}
var init_namespace_filter = __esm({
  "src/web/lib/namespace-filter.ts"() {
    "use strict";
  }
});

// src/web/lib/graph-transforms.ts
function aggregateByNamespace(nodes, edges) {
  const getNs = (domainId) => {
    const parts = (domainId || "").split(".");
    return parts.slice(0, 2).join(".") || domainId;
  };
  const nodeToNs = /* @__PURE__ */ new Map();
  const nsCount = /* @__PURE__ */ new Map();
  nodes.forEach((n) => {
    const ns = getNs(n.data.domainId);
    nodeToNs.set(n.id, ns);
    nsCount.set(ns, (nsCount.get(ns) || 0) + 1);
  });
  const newNodes = Array.from(nsCount.entries()).map(
    ([ns, count]) => ({
      id: "ns_" + ns,
      type: "domainNode",
      data: {
        domainId: ns,
        label: ns,
        nodeType: "domain",
        isNamespace: true,
        childCount: count
      },
      position: { x: 0, y: 0 }
    })
  );
  const edgeAgg = /* @__PURE__ */ new Map();
  edges.forEach((e) => {
    const fromNs = nodeToNs.get(e.source);
    const toNs = nodeToNs.get(e.target);
    if (!fromNs || !toNs || fromNs === toNs)
      return;
    const key = fromNs + "__" + toNs;
    if (!edgeAgg.has(key)) {
      edgeAgg.set(key, {
        id: "ns_edge_" + fromNs + "__" + toNs,
        source: "ns_" + fromNs,
        target: "ns_" + toNs,
        count: 0,
        kinds: /* @__PURE__ */ new Set()
      });
    }
    const a = edgeAgg.get(key);
    a.count++;
    if (e.data && e.data.kind)
      a.kinds.add(e.data.kind);
  });
  const newEdges = Array.from(edgeAgg.values()).map((a) => ({
    id: a.id,
    source: a.source,
    target: a.target,
    type: "smoothstep",
    label: String(a.count),
    data: {
      isAggregated: true,
      count: a.count,
      kinds: Array.from(a.kinds),
      kind: "aggregated"
    },
    markerEnd: {
      type: "arrowclosed",
      color: LINKAGE_COLOR2,
      width: 14,
      height: 14
    },
    style: {
      stroke: LINKAGE_COLOR2,
      strokeWidth: Math.min(1 + a.count / 6, 4),
      opacity: 0.85
    }
  }));
  return { nodes: newNodes, edges: newEdges };
}
function mergeBidirectional(edges) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const processed = /* @__PURE__ */ new Set();
  const pairMap = /* @__PURE__ */ new Map();
  edges.forEach((e) => {
    if (!e || !e.source || !e.target)
      return;
    const key = [e.source, e.target].sort().join("__");
    if (!pairMap.has(key))
      pairMap.set(key, []);
    pairMap.get(key).push(e);
  });
  edges.forEach((e) => {
    if (processed.has(e.id))
      return;
    const key = [e.source, e.target].sort().join("__");
    const group = pairMap.get(key) || [];
    let forward = null;
    let backward = null;
    for (const g of group) {
      if (processed.has(g.id))
        continue;
      if (g.source === e.source && g.target === e.target && !forward)
        forward = g;
      else if (g.source === e.target && g.target === e.source && !backward)
        backward = g;
    }
    if (forward && backward) {
      const stableId = "bi__" + [forward.id, backward.id].sort().join("__");
      if (!seen.has(stableId)) {
        seen.add(stableId);
        result.push(
          Object.assign({}, forward, {
            id: stableId,
            source: forward.source,
            target: forward.target,
            markerStart: {
              type: "arrowclosed",
              color: forward.markerEnd ? forward.markerEnd.color : LINKAGE_COLOR2,
              width: 12,
              height: 12
            },
            data: Object.assign({}, forward.data, {
              isBidirectional: true,
              reverseEdgeId: backward.id,
              refCount: (forward.data && forward.data.refCount || 0) + (backward.data && backward.data.refCount || 0)
            })
          })
        );
      }
      processed.add(forward.id);
      processed.add(backward.id);
    } else {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e);
      }
      processed.add(e.id);
    }
  });
  return result;
}
var LINKAGE_COLOR2, FQID_COLOR2;
var init_graph_transforms = __esm({
  "src/web/lib/graph-transforms.ts"() {
    "use strict";
    LINKAGE_COLOR2 = "#6366a1";
    FQID_COLOR2 = "#4b7c6c";
  }
});

// src/web/lib/rules.ts
function evaluateRules(edges, nodes, rules) {
  if (!Array.isArray(edges) || !Array.isArray(nodes) || !Array.isArray(rules)) {
    return [];
  }
  const violations = [];
  const nodeById = /* @__PURE__ */ new Map();
  nodes.forEach((n) => nodeById.set(n.id, n));
  edges.forEach((e) => {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt)
      return;
    const fromId = (src.data.domainId || "").toLowerCase();
    const toId = (tgt.data.domainId || "").toLowerCase();
    rules.forEach((rule) => {
      if (!rule.from || !rule.to)
        return;
      if (simplePatternMatch(fromId, rule.from.toLowerCase()) && simplePatternMatch(toId, rule.to.toLowerCase())) {
        violations.push({
          ruleId: rule.id,
          rule,
          edgeId: e.id,
          fromId: src.data.domainId,
          toId: tgt.data.domainId,
          severity: rule.action || "warn"
        });
      }
    });
  });
  return violations;
}
var init_rules = __esm({
  "src/web/lib/rules.ts"() {
    "use strict";
    init_namespace_filter();
  }
});

// src/web/hooks/useGraphFilters.ts
import { useMemo } from "react";
function useGraphFilters() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const filters = useGraphStore((s) => s.filters);
  const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
  const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
  const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
  const bookmarks = useGraphStore((s) => s.bookmarks);
  const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
  const validationResults = useGraphStore((s) => s.validationResults);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const tagFilters = useGraphStore((s) => s.tagFilters);
  const nsMode = useGraphStore((s) => s.nsMode);
  const bidirectional = useGraphStore((s) => s.bidirectional);
  const showViolationsOnly = useGraphStore((s) => s.showViolationsOnly);
  const display = useMemo(() => {
    if (!nsMode)
      return { nodes, edges };
    const agg = aggregateByNamespace(nodes, edges);
    return { nodes: dagreLayout(agg.nodes, agg.edges, "LR"), edges: agg.edges };
  }, [nodes, edges, nsMode]);
  const displayNodes = display.nodes;
  const displayEdges = display.edges;
  const connected = useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    displayEdges.forEach((e) => {
      s.add(e.source);
      s.add(e.target);
    });
    return s;
  }, [displayEdges]);
  const bidirectionalEdges = useMemo(() => {
    if (!bidirectional)
      return displayEdges;
    return mergeBidirectional(displayEdges);
  }, [displayEdges, bidirectional]);
  const filteredNodes = useMemo(() => {
    return displayNodes.filter((n) => {
      if (n.type === "clusterNode")
        return true;
      if (hiddenNodeIds.has(n.id))
        return false;
      if (bookmarksOnly && !bookmarks.has(n.id))
        return false;
      if (tagFilters.size > 0) {
        const nodeTags = (n.data.tags || []).map(
          (t2) => String(t2).toLowerCase()
        );
        let matchesAny = false;
        tagFilters.forEach((tag) => {
          if (nodeTags.indexOf(tag.toLowerCase()) !== -1)
            matchesAny = true;
        });
        if (!matchesAny)
          return false;
      }
      if (onlyInvalid) {
        const v = validationResults ? validationResults.get(n.data.domainId) : null;
        if (!v || v.status !== "invalid")
          return false;
      }
      const t = n.data.nodeType;
      if (t === "domain" && !filters.domain)
        return false;
      if (t === "broken" && !filters.broken)
        return false;
      if (t === "missing" && !filters.missing)
        return false;
      if (namespaceFilter && !matchesNamespace(n.data.domainId, namespaceFilter))
        return false;
      if (isolatedOnly && (t !== "domain" || connected.has(n.id)))
        return false;
      return true;
    });
  }, [
    displayNodes,
    filters,
    namespaceFilter,
    isolatedOnly,
    connected,
    hiddenNodeIds,
    bookmarks,
    bookmarksOnly,
    onlyInvalid,
    validationResults,
    tagFilters
  ]);
  const rules = useGraphStore((s) => s.rules);
  const ruleViolationsByEdge = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    if (!Array.isArray(rules) || rules.length === 0)
      return m;
    const violations = evaluateRules(displayEdges, displayNodes, rules);
    violations.forEach((v) => {
      if (!m.has(v.edgeId))
        m.set(v.edgeId, []);
      m.get(v.edgeId).push(v);
    });
    return m;
  }, [displayEdges, displayNodes, rules]);
  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map((n) => n.id));
    return bidirectionalEdges.filter((e) => {
      if (!ids.has(e.source) || !ids.has(e.target))
        return false;
      if (showViolationsOnly && !ruleViolationsByEdge.has(e.id))
        return false;
      const kind = e.data && e.data.kind;
      if (kind === "linkage" && !filters.linkage)
        return false;
      if (kind === "fqid" && !filters.fqid)
        return false;
      return true;
    });
  }, [
    bidirectionalEdges,
    filteredNodes,
    filters.linkage,
    filters.fqid,
    showViolationsOnly,
    ruleViolationsByEdge
  ]);
  const counts = useMemo(
    () => ({
      domain: nodes.filter((n) => n.data.nodeType === "domain").length,
      missing: nodes.filter((n) => n.data.nodeType === "missing").length,
      broken: nodes.filter((n) => n.data.nodeType === "broken").length,
      linkage: edges.filter((e) => e.data && e.data.kind === "linkage").length,
      fqid: edges.filter((e) => e.data && e.data.kind === "fqid").length
    }),
    [nodes, edges]
  );
  const isolatedCount = useMemo(() => {
    const conn = /* @__PURE__ */ new Set();
    edges.forEach((e) => {
      conn.add(e.source);
      conn.add(e.target);
    });
    return nodes.filter((n) => n.data.nodeType === "domain" && !conn.has(n.id)).length;
  }, [nodes, edges]);
  const filteredIdsHash = useMemo(
    () => filteredNodes.map((n) => n.id).sort().join(","),
    [filteredNodes]
  );
  return {
    displayNodes,
    displayEdges,
    filteredNodes,
    filteredEdges,
    bidirectionalEdges,
    counts,
    isolatedCount,
    connected,
    filteredIdsHash
  };
}
var init_useGraphFilters = __esm({
  "src/web/hooks/useGraphFilters.ts"() {
    "use strict";
    init_useGraphStore();
    init_namespace_filter();
    init_graph_transforms();
    init_graph_transforms();
    init_layout();
    init_rules();
  }
});

// src/web/lib/algorithms/reachable.ts
function findReachable(startId, depth, edges) {
  const inAdj = /* @__PURE__ */ new Map();
  const outAdj = /* @__PURE__ */ new Map();
  edges.forEach((e) => {
    if (!outAdj.has(e.source))
      outAdj.set(e.source, []);
    outAdj.get(e.source).push(e.target);
    if (!inAdj.has(e.target))
      inAdj.set(e.target, []);
    inAdj.get(e.target).push(e.source);
  });
  const visited = /* @__PURE__ */ new Set([startId]);
  const queue = [{ id: startId, d: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.d >= depth)
      continue;
    const neighbors = (outAdj.get(cur.id) || []).concat(
      inAdj.get(cur.id) || []
    );
    for (const n of neighbors) {
      if (visited.has(n))
        continue;
      visited.add(n);
      queue.push({ id: n, d: cur.d + 1 });
    }
  }
  return visited;
}
var init_reachable = __esm({
  "src/web/lib/algorithms/reachable.ts"() {
    "use strict";
  }
});

// src/web/hooks/useGraphHighlight.ts
import { useMemo as useMemo2 } from "react";
function useGraphHighlight(filteredEdges, edgesForFocus) {
  const pathResult = useGraphStore((s) => s.pathResult);
  const cycleHighlight = useGraphStore((s) => s.cycleHighlight);
  const focusNode = useGraphStore((s) => s.focusNode);
  const focusDepth = useGraphStore((s) => s.focusDepth);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  return useMemo2(() => {
    if (pathResult) {
      return {
        nodes: new Set(pathResult.nodes),
        edges: new Set(pathResult.edges),
        color: PATH_COLOR,
        type: "path"
      };
    }
    if (cycleHighlight) {
      return {
        nodes: cycleHighlight.nodeIds,
        edges: cycleHighlight.edgeIds,
        color: CYCLE_COLOR,
        type: "cycle"
      };
    }
    if (focusNode) {
      const reachable = findReachable(focusNode, focusDepth, edgesForFocus);
      const focusEdges = /* @__PURE__ */ new Set();
      edgesForFocus.forEach((e) => {
        if (reachable.has(e.source) && reachable.has(e.target))
          focusEdges.add(e.id);
      });
      return {
        nodes: reachable,
        edges: focusEdges,
        color: FOCUS_COLOR,
        type: "focus"
      };
    }
    if (selectedNodeId) {
      const nodeIds = /* @__PURE__ */ new Set([selectedNodeId]);
      const edgeIds = /* @__PURE__ */ new Set();
      filteredEdges.forEach((e) => {
        if (e.source === selectedNodeId || e.target === selectedNodeId) {
          edgeIds.add(e.id);
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        }
      });
      return {
        nodes: nodeIds,
        edges: edgeIds,
        color: SELECTED_COLOR,
        type: "selected",
        soft: true
      };
    }
    return null;
  }, [
    focusNode,
    selectedNodeId,
    focusDepth,
    cycleHighlight,
    pathResult,
    filteredEdges,
    edgesForFocus
  ]);
}
var PATH_COLOR, CYCLE_COLOR, FOCUS_COLOR, SELECTED_COLOR;
var init_useGraphHighlight = __esm({
  "src/web/hooks/useGraphHighlight.ts"() {
    "use strict";
    init_useGraphStore();
    init_reachable();
    PATH_COLOR = "#fbbf24";
    CYCLE_COLOR = "#f97316";
    FOCUS_COLOR = "#22d3ee";
    SELECTED_COLOR = "#818cf8";
  }
});

// src/web/lib/heatmap.ts
function hexToRgb(h) {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return [r, g, b];
}
function lerp(a, b, k) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k)
  ];
}
function heatColor(value, min, max, scheme) {
  if (max === min)
    return scheme.mid;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  let from;
  let to;
  let k;
  if (t < 0.5) {
    from = hexToRgb(scheme.low);
    to = hexToRgb(scheme.mid);
    k = t * 2;
  } else {
    from = hexToRgb(scheme.mid);
    to = hexToRgb(scheme.high);
    k = (t - 0.5) * 2;
  }
  const rgb = lerp(from, to, k);
  return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
}
var HEATMAPS;
var init_heatmap = __esm({
  "src/web/lib/heatmap.ts"() {
    "use strict";
    HEATMAPS = {
      health: { label: "Health", low: "#dc2626", mid: "#f59e0b", high: "#10b981" },
      degree: { label: "\u0421\u0432\u044F\u0437\u0435\u0439", low: "#334155", mid: "#3b82f6", high: "#10b981" },
      entities: {
        label: "Entities",
        low: "#334155",
        mid: "#8b5cf6",
        high: "#ec4899"
      },
      fqid: {
        label: "FQID-\u0441\u0441\u044B\u043B\u043E\u043A",
        low: "#334155",
        mid: "#0891b2",
        high: "#22d3ee"
      }
    };
  }
});

// src/web/hooks/useHeatmapValues.ts
import { useMemo as useMemo3 } from "react";
function useHeatmapValues(displayNodes, displayEdges, healthMap) {
  const heatmap = useGraphStore((s) => s.heatmap);
  return useMemo3(() => {
    if (heatmap === "none")
      return null;
    const map = /* @__PURE__ */ new Map();
    const values = [];
    displayNodes.forEach((n) => {
      let v = 0;
      if (heatmap === "health") {
        const h = healthMap.get(n.id);
        v = h && typeof h === "object" ? h.score || 0 : typeof h === "number" ? h : 0;
      } else if (heatmap === "degree") {
        let d = 0;
        displayEdges.forEach((e) => {
          if (e.source === n.id)
            d++;
          if (e.target === n.id)
            d++;
        });
        v = d;
      } else if (heatmap === "entities") {
        v = n.data.entitiesCount || 0;
      } else if (heatmap === "fqid") {
        v = (n.data.fqidRefs || []).length;
      }
      map.set(n.id, v);
      values.push(v);
    });
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return { map, min, max, scheme: HEATMAPS[heatmap] };
  }, [heatmap, displayNodes, displayEdges, healthMap]);
}
var init_useHeatmapValues = __esm({
  "src/web/hooks/useHeatmapValues.ts"() {
    "use strict";
    init_useGraphStore();
    init_heatmap();
  }
});

// src/web/hooks/useVisibleNodes.ts
import { useMemo as useMemo4 } from "react";
function useVisibleNodes(filteredNodes, highlight, healthMap, heatmapValues) {
  const compact = useGraphStore((s) => s.compact);
  const pathResult = useGraphStore((s) => s.pathResult);
  const diffMode = useGraphStore((s) => s.diffMode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const topoLevelMap = useGraphStore((s) => s.topoLevelMap);
  const validationResults = useGraphStore((s) => s.validationResults);
  const bookmarks = useGraphStore((s) => s.bookmarks);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
  return useMemo4(() => {
    const pathEndpoints = pathResult ? /* @__PURE__ */ new Set([
      pathResult.nodes[0],
      pathResult.nodes[pathResult.nodes.length - 1]
    ]) : null;
    const hasHighlight = !!(highlight || diffMode || topoLevelMap || validationResults || heatmapValues);
    return filteredNodes.map((n) => {
      const h = healthMap.get(n.id);
      const healthScore = h && typeof h === "object" ? h.score : typeof h === "number" ? h : null;
      const healthBreakdown = h && typeof h === "object" ? h.breakdown || [] : [];
      const topoLvl = topoLevelMap ? topoLevelMap.get(n.data.domainId) : null;
      const validation = validationResults ? validationResults.get(n.data.domainId) : null;
      const isInvalid = validation && validation.status === "invalid";
      const isBookmarked = bookmarks.has(n.id);
      let heatColorValue;
      if (heatmapValues) {
        const v = heatmapValues.map.get(n.id) || 0;
        heatColorValue = heatColor(
          v,
          heatmapValues.min,
          heatmapValues.max,
          heatmapValues.scheme
        );
      }
      const baseData = {
        ...n.data,
        health: healthScore,
        healthBreakdown,
        __compact: compact,
        __topoLevel: topoLvl,
        __invalid: isInvalid,
        __validationStatus: validation ? validation.status : null,
        __validationDiagnostics: validation && validation.diagnostics ? validation.diagnostics : [],
        __validationCount: validation && validation.diagnostics ? validation.diagnostics.length : 0,
        __bookmarked: isBookmarked,
        __tooltipsEnabled: tooltipsEnabled,
        __heatColor: heatColorValue
      };
      if (!hasHighlight && !selectedNodeId && hiddenNodeIds.size === 0) {
        return { ...n, data: baseData, selected: false };
      }
      const dimmed = highlight && !highlight.soft ? !highlight.nodes.has(n.id) : false;
      const inPath = !!(highlight && highlight.type === "path" && highlight.nodes.has(n.id));
      const isPathEndpoint = !!(pathEndpoints && pathEndpoints.has(n.id));
      const isAdded = !!(diffMode && diffMode.addedNodes.has(n.id));
      return {
        ...n,
        style: { opacity: dimmed ? 0.12 : 1, transition: "opacity 0.2s" },
        data: {
          ...baseData,
          dimmed,
          __inPath: inPath,
          __isPathEndpoint: isPathEndpoint,
          __isAdded: isAdded,
          __selectedHighlight: !!(highlight && highlight.soft && highlight.nodes.has(n.id) && n.id === selectedNodeId)
        },
        selected: n.id === selectedNodeId
      };
    });
  }, [
    filteredNodes,
    highlight,
    compact,
    pathResult,
    diffMode,
    healthMap,
    selectedNodeId,
    topoLevelMap,
    validationResults,
    bookmarks,
    hiddenNodeIds,
    heatmapValues,
    tooltipsEnabled
  ]);
}
var init_useVisibleNodes = __esm({
  "src/web/hooks/useVisibleNodes.ts"() {
    "use strict";
    init_useGraphStore();
    init_heatmap();
  }
});

// src/web/hooks/useVisibleEdges.ts
import { useMemo as useMemo5 } from "react";
function useVisibleEdges(edgesForRender, highlight, violationsByEdge) {
  const diffMode = useGraphStore((s) => s.diffMode);
  const rulesHighlighted = useGraphStore((s) => s.rulesHighlighted);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  return useMemo5(() => {
    const isStrictHighlight = highlight && (highlight.type === "path" || highlight.type === "cycle" || highlight.type === "focus");
    let baseEdges = edgesForRender;
    if (isStrictHighlight) {
      baseEdges = edgesForRender.filter((e) => {
        const eid = e.data && e.data.originalId || e.id;
        return highlight.edges.has(e.id) || highlight.edges.has(eid);
      });
    }
    const hasHighlight = highlight || diffMode || selectedEdgeId || rulesHighlighted && violationsByEdge.size > 0;
    if (!hasHighlight)
      return baseEdges;
    return baseEdges.map((e) => {
      const isSelected = e.id === selectedEdgeId;
      const hl = highlight && (highlight.edges.has(e.id) || e.data && e.data.originalId && highlight.edges.has(e.data.originalId));
      const baseColor = e.data && e.data.kind === "linkage" ? LINKAGE_COLOR3 : e.data && e.data.kind === "fqid" ? FQID_COLOR3 : LINKAGE_COLOR3;
      let stroke = baseColor;
      let opacity = 0.5;
      let strokeWidth = e.style && e.style.strokeWidth || 1;
      let animated = false;
      if (highlight) {
        if (highlight.soft) {
          if (hl) {
            opacity = 0.9;
            strokeWidth = e.data && e.data.kind === "linkage" ? 2.2 : 1.8;
          }
        } else {
          opacity = hl ? 1 : 0.06;
          strokeWidth = hl ? e.data && e.data.kind === "linkage" ? 3 : 2 : strokeWidth;
          animated = !!hl && highlight.type === "path";
        }
      }
      if (diffMode) {
        if (diffMode.addedEdges.has(e.id)) {
          stroke = DIFF_ADDED;
          opacity = 1;
          strokeWidth = 3;
          animated = true;
        } else if (diffMode.removedEdges.has(e.id)) {
          stroke = DIFF_REMOVED;
          opacity = 1;
          strokeWidth = 3;
        }
      }
      if (rulesHighlighted && violationsByEdge.has(e.id)) {
        const v = violationsByEdge.get(e.id);
        const hasForbid = v.some((x) => x.severity === "forbid");
        stroke = hasForbid ? "#dc2626" : "#f59e0b";
        opacity = 1;
        strokeWidth = 3.5;
        animated = true;
      }
      if (isSelected) {
        stroke = "#fbbf24";
        opacity = 1;
        strokeWidth = 4;
        animated = true;
      }
      return {
        ...e,
        animated,
        style: { ...e.style, stroke, opacity, strokeWidth },
        markerEnd: { ...e.markerEnd, color: stroke },
        markerStart: e.markerStart ? { ...e.markerStart, color: stroke } : void 0
      };
    });
  }, [
    edgesForRender,
    highlight,
    diffMode,
    rulesHighlighted,
    violationsByEdge,
    selectedEdgeId
  ]);
}
var DIFF_ADDED, DIFF_REMOVED, LINKAGE_COLOR3, FQID_COLOR3;
var init_useVisibleEdges = __esm({
  "src/web/hooks/useVisibleEdges.ts"() {
    "use strict";
    init_useGraphStore();
    DIFF_ADDED = "#22c55e";
    DIFF_REMOVED = "#ef4444";
    LINKAGE_COLOR3 = "#6366a1";
    FQID_COLOR3 = "#4b7c6c";
  }
});

// src/web/hooks/useTooltip.ts
import { useCallback, useEffect, useRef } from "react";
function useTooltip() {
  const tooltip = useGraphStore((s) => s.tooltip);
  const setTooltip = useGraphStore((s) => s.setTooltip);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
  const hideTimer = useRef(null);
  const cache = useRef(/* @__PURE__ */ new Map());
  useEffect(() => {
    const onMove = (e) => {
      window.__lastMouse = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => {
    const onShow = () => {
      if (!window.__healthTooltip)
        return;
      const ht = window.__healthTooltip;
      setTooltip({
        html: ht.html,
        x: ht.x + 12,
        y: ht.y + 12,
        anchorX: ht.x,
        anchorY: ht.y
      });
    };
    const onHide = () => setTooltip(null);
    document.addEventListener("show-health-tooltip", onShow);
    document.addEventListener("hide-health-tooltip", onHide);
    return () => {
      document.removeEventListener("show-health-tooltip", onShow);
      document.removeEventListener("hide-health-tooltip", onHide);
    };
  }, [setTooltip]);
  useEffect(() => {
    if (!tooltipsEnabled) {
      if (hideTimer.current)
        clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    }
  }, [tooltipsEnabled, setTooltip]);
  useEffect(() => {
    if (!tooltip)
      return;
    const el = document.querySelector(".tooltip");
    if (!el)
      return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const gap = 16;
    const ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
    const ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;
    let x = ax + gap;
    let y = ay + gap;
    if (x + rect.width > window.innerWidth - margin)
      x = ax - rect.width - gap;
    if (y + rect.height > window.innerHeight - margin)
      y = ay - rect.height - gap;
    if (x < margin)
      x = margin;
    if (y < margin)
      y = margin;
    if (x === tooltip.x && y === tooltip.y)
      return;
    setTooltip((t) => t ? { ...t, x, y } : null);
  }, [tooltip, setTooltip]);
  const show = useCallback(
    (html, event) => {
      if (hideTimer.current)
        clearTimeout(hideTimer.current);
      setTooltip({
        html,
        x: event.clientX + 16,
        y: event.clientY + 16,
        anchorX: event.clientX,
        anchorY: event.clientY
      });
    },
    [setTooltip]
  );
  const scheduleHide = useCallback(() => {
    if (hideTimer.current)
      clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (window.__tooltipHovered)
        return;
      const el = document.querySelector(".tooltip");
      const m = window.__lastMouse;
      if (el && m) {
        const rect = el.getBoundingClientRect();
        const pad = 40;
        if (m.x >= rect.left - pad && m.x <= rect.right + pad && m.y >= rect.top - pad && m.y <= rect.bottom + pad) {
          scheduleHide();
          return;
        }
      }
      setTooltip(null);
    }, HIDE_DELAY);
  }, [setTooltip]);
  const hide = useCallback(() => {
    if (hideTimer.current)
      clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  }, [setTooltip]);
  const showForNode = useCallback(
    (nodeId, htmlBuilder, event) => {
      if (hideTimer.current)
        clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        let html = cache.current.get(nodeId);
        if (!html) {
          html = htmlBuilder();
          cache.current.set(nodeId, html);
        }
        show(html, event);
      }, SHOW_DELAY);
    },
    [show]
  );
  const clearCache = useCallback(() => {
    cache.current.clear();
  }, []);
  return {
    tooltip,
    show,
    scheduleHide,
    hide,
    showForNode,
    clearCache
  };
}
var HIDE_DELAY, SHOW_DELAY;
var init_useTooltip = __esm({
  "src/web/hooks/useTooltip.ts"() {
    "use strict";
    init_useGraphStore();
    HIDE_DELAY = 250;
    SHOW_DELAY = 120;
  }
});

// src/web/hooks/useHotkeys.ts
import { useEffect as useEffect2 } from "react";
function useHotkeys() {
  const pushNav = useGraphStore((s) => s.pushNav);
  const navBack = useGraphStore((s) => s.navBack);
  const navForward = useGraphStore((s) => s.navForward);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const toggleBookmark = useGraphStore((s) => s.toggleBookmark);
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setHelpOpen = useGraphStore((s) => s.setHelpOpen);
  const setHotkeysOpen = useGraphStore((s) => s.setHotkeysOpen);
  const setRulesOpen = useGraphStore((s) => s.setRulesOpen);
  const setIsolatedOnly = useGraphStore((s) => s.setIsolatedOnly);
  const setNsMode = useGraphStore((s) => s.setNsMode);
  const setFilters = useGraphStore((s) => s.setFilters);
  const setTooltipsEnabled = useGraphStore((s) => s.setTooltipsEnabled);
  const setSidePanelEnabled = useGraphStore((s) => s.setSidePanelEnabled);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const setFocusNode = useGraphStore((s) => s.setFocusNode);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setSelectedEdgeId = useGraphStore((s) => s.setSelectedEdgeId);
  const setCycleHighlight = useGraphStore((s) => s.setCycleHighlight);
  const setPathResult = useGraphStore((s) => s.setPathResult);
  const setPathSel = useGraphStore((s) => s.setPathSel);
  const setPathMode = useGraphStore((s) => s.setPathMode);
  const setContextMenu = useGraphStore((s) => s.setContextMenu);
  useEffect2(() => {
    const handler = (e) => {
      try {
        const target = e.target;
        if (target) {
          const tag = target.tagName || "";
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
            return;
          if (target.isContentEditable)
            return;
        }
        const ctrl = e.ctrlKey || e.metaKey;
        const alt = e.altKey;
        const shift = e.shiftKey;
        const code = e.code;
        const k = e.key;
        if (ctrl && !shift && !alt && code === "KeyK") {
          e.preventDefault();
          setSearchOpen(true);
          return;
        }
        if (shift && k === "Tab") {
          e.preventDefault();
          setSearchOpen(!searchOpen);
          return;
        }
        if (alt && k === "ArrowLeft") {
          e.preventDefault();
          navBack();
          return;
        }
        if (alt && k === "ArrowRight") {
          e.preventDefault();
          navForward();
          return;
        }
        if (ctrl || alt)
          return;
        if (code === "KeyF") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 500 });
            } catch {
            }
          }
          return;
        }
        if (code === "KeyI") {
          e.preventDefault();
          setIsolatedOnly((v) => !v);
          return;
        }
        if (code === "KeyS") {
          e.preventDefault();
          setNsMode((v) => !v);
          return;
        }
        if (code === "KeyT") {
          e.preventDefault();
          setTooltipsEnabled((v) => !v);
          return;
        }
        if (code === "KeyD") {
          e.preventDefault();
          setSidePanelEnabled((v) => !v);
          return;
        }
        if (code === "KeyE") {
          e.preventDefault();
          setFilters((f) => {
            const bothOn = f.linkage && f.fqid;
            if (bothOn)
              return { ...f, linkage: false, fqid: false };
            return { ...f, linkage: true, fqid: true };
          });
          return;
        }
        if (code === "KeyR") {
          e.preventDefault();
          setRulesOpen(true);
          return;
        }
        if (code === "KeyB" && selectedNodeId) {
          e.preventDefault();
          toggleBookmark(selectedNodeId);
          return;
        }
        if (k === "Escape") {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setFocusNode(null);
          setPathResult(null);
          setPathSel([]);
          setCycleHighlight(null);
          setContextMenu(null);
          setPathMode(null);
          return;
        }
        if (k === "+" || k === "=") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.zoomTo(rfInstance.getZoom() * 1.3, { duration: 200 });
            } catch {
            }
          }
          return;
        }
        if (k === "-" || k === "_") {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.zoomTo(rfInstance.getZoom() / 1.3, { duration: 200 });
            } catch {
            }
          }
          return;
        }
        if (code === "Digit0" && !ctrl && !alt) {
          e.preventDefault();
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 300, padding: 0.15 });
            } catch {
            }
          }
          return;
        }
        if (k === "F1") {
          e.preventDefault();
          setHelpOpen(true);
          return;
        }
        if (k === "?") {
          e.preventDefault();
          setHotkeysOpen(true);
          return;
        }
      } catch (err) {
        console.error("[hotkey error]", err);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [
    searchOpen,
    setSearchOpen,
    navBack,
    navForward,
    selectedNodeId,
    toggleBookmark,
    rfInstance,
    setHelpOpen,
    setHotkeysOpen,
    setRulesOpen,
    setIsolatedOnly,
    setNsMode,
    setFilters,
    setTooltipsEnabled,
    setSidePanelEnabled,
    setFocusNode,
    setSelectedNodeId,
    setSelectedEdgeId,
    setCycleHighlight,
    setPathResult,
    setPathSel,
    setPathMode,
    setContextMenu
  ]);
}
var init_useHotkeys = __esm({
  "src/web/hooks/useHotkeys.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/useSearch.ts
import { useMemo as useMemo6 } from "react";
function useSearch() {
  const nodes = useGraphStore((s) => s.nodes);
  const query = useGraphStore((s) => s.searchQuery);
  return useMemo6(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return [];
    return nodes.map((n) => {
      const d = n.data || {};
      const id = (d.domainId || "").toLowerCase();
      const nm = (d.name || "").toLowerCase();
      const desc = (d.description || "").toLowerCase();
      const tags = Array.isArray(d.tags) ? d.tags.map((t) => String(t).toLowerCase()) : [];
      const matches = [];
      if (id.indexOf(q) !== -1)
        matches.push({ field: "id", value: d.domainId });
      if (nm.indexOf(q) !== -1)
        matches.push({ field: "name", value: d.name });
      if (desc.indexOf(q) !== -1)
        matches.push({ field: "description", value: d.description });
      tags.forEach((t) => {
        if (t.indexOf(q) !== -1)
          matches.push({ field: "tags", value: t });
      });
      const fqidRefs = d.fqidRefs || [];
      const fqidHits = [];
      fqidRefs.forEach((r) => {
        if (r.fullFQID && r.fullFQID.toLowerCase().indexOf(q) !== -1) {
          fqidHits.push({
            fullFQID: r.fullFQID,
            targetDomainId: r.targetDomainId,
            propertyPath: r.propertyPath
          });
        }
      });
      if (fqidHits.length > 0)
        matches.push({ field: "fqid", value: fqidHits });
      return matches.length > 0 ? { node: n, matches } : null;
    }).filter((x) => x !== null).sort((a, b) => {
      const rank = (r) => {
        const f = r.matches.map((m) => m.field);
        if (f.indexOf("id") !== -1)
          return 0;
        if (f.indexOf("name") !== -1)
          return 1;
        if (f.indexOf("fqid") !== -1)
          return 2;
        if (f.indexOf("tags") !== -1)
          return 3;
        return 4;
      };
      return rank(a) - rank(b);
    }).slice(0, 100);
  }, [query, nodes]);
}
var init_useSearch = __esm({
  "src/web/hooks/useSearch.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/useValidation.ts
import { useCallback as useCallback2, useEffect as useEffect3, useRef as useRef2, useState } from "react";
function useValidation() {
  const setValidationResults = useGraphStore((s) => s.setValidationResults);
  const available = useGraphStore((s) => s.validationAvailable);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef2(null);
  useEffect3(() => {
    fetch("/api/validation-available").then((r) => r.json()).then(
      (d) => useGraphStore.getState().setValidationAvailable(!!d.available)
    ).catch(() => {
    });
  }, []);
  useEffect3(() => {
    fetch("/api/validation-results").then((r) => r.status === 204 ? null : r.json()).then((data) => {
      if (!data || !data.results)
        return;
      const map = /* @__PURE__ */ new Map();
      data.results.forEach((r) => map.set(r.domainId, r));
      setValidationResults(map);
    }).catch(() => {
    });
  }, [setValidationResults]);
  const stop = useCallback2(() => {
    fetch("/api/validate-cancel", { method: "POST" }).catch(() => {
    });
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
      }
    }
    setRunning(false);
  }, []);
  const reset = useCallback2(() => {
    setStarted(false);
    setRunning(false);
    setLogs([]);
    setProgress({ current: 0, total: 0 });
    setStats(null);
    setCancelled(false);
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
      }
      abortRef.current = null;
    }
  }, []);
  const start = useCallback2(
    (scope, domainIds) => {
      if (domainIds.length === 0) {
        alert("\u041D\u0435\u0442 \u0434\u043E\u043C\u0435\u043D\u043E\u0432 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438");
        return;
      }
      setRunning(true);
      setStarted(true);
      setLogs([]);
      setStats(null);
      setCancelled(false);
      setProgress({ current: 0, total: domainIds.length });
      const controller = new AbortController();
      abortRef.current = controller;
      fetch("/api/validate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainIds }),
        signal: controller.signal
      }).then((response) => {
        if (!response.ok)
          throw new Error("HTTP " + response.status);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handleEvent = (evt) => {
          if (evt.type === "start") {
            setProgress({ current: 0, total: evt.total });
          } else if (evt.type === "progress") {
            setProgress({ current: evt.current, total: evt.total });
            setLogs((prev) => prev.concat([evt]));
          } else if (evt.type === "done") {
            setStats(evt.stats);
            setCancelled(evt.cancelled);
            setRunning(false);
            const map = /* @__PURE__ */ new Map();
            (evt.results || []).forEach(
              (r) => map.set(r.domainId, r)
            );
            setValidationResults(map);
          } else if (evt.type === "error") {
            setRunning(false);
            alert("\u041E\u0448\u0438\u0431\u043A\u0430: " + evt.message);
          }
        };
        const read = () => reader.read().then((r) => {
          if (r.done)
            return;
          buffer += decoder.decode(r.value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          parts.forEach((part) => {
            const line = part.trim();
            if (!line.startsWith("data:"))
              return;
            const json = line.slice(5).trim();
            try {
              handleEvent(JSON.parse(json));
            } catch {
            }
          });
          return read();
        });
        return read();
      }).catch((err) => {
        if (err.name === "AbortError")
          return;
        setRunning(false);
        alert("\u041E\u0448\u0438\u0431\u043A\u0430: " + err.message);
      });
    },
    [setValidationResults]
  );
  return {
    open,
    setOpen,
    running,
    started,
    progress,
    logs,
    stats,
    cancelled,
    available,
    start,
    stop,
    reset
  };
}
var init_useValidation = __esm({
  "src/web/hooks/useValidation.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/useNavigation.ts
import { useCallback as useCallback3 } from "react";
function useNavigation() {
  const nodes = useGraphStore((s) => s.nodes);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const compact = useGraphStore((s) => s.compact);
  const pushNav = useGraphStore((s) => s.pushNav);
  const navStack = useGraphStore((s) => s.navStack);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const domainToNodeId = useCallback3(() => {
    const m = /* @__PURE__ */ new Map();
    nodes.forEach(
      (n) => m.set((n.data.domainId || "").toLowerCase(), n.id)
    );
    return m;
  }, [nodes]);
  const gotoWithoutNav = useCallback3(
    (domainId) => {
      if (!domainId)
        return;
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId || !rfInstance)
        return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node)
        return;
      const NODE_WIDTH3 = 300;
      const NODE_HEIGHT3 = 88;
      const NODE_COMPACT2 = 42;
      const w = compact ? NODE_COMPACT2 : NODE_WIDTH3;
      const h = compact ? NODE_COMPACT2 : NODE_HEIGHT3;
      const cx = node.position.x + w / 2;
      const cy = node.position.y + h / 2;
      const z = Math.max(rfInstance.getZoom(), 1.2);
      rfInstance.setCenter(cx, cy, { zoom: z, duration: 500 });
      setSelectedNodeId(nodeId);
    },
    [domainToNodeId, nodes, compact, rfInstance, setSelectedNodeId]
  );
  const goto = useCallback3(
    (domainId) => {
      if (!domainId)
        return;
      const map = domainToNodeId();
      const nodeId = map.get(domainId.toLowerCase());
      if (!nodeId)
        return;
      pushNav(domainId);
      setSelectedNodeId(nodeId);
      useGraphStore.getState().setFocusNode(nodeId);
      gotoWithoutNav(domainId);
    },
    [domainToNodeId, pushNav, setSelectedNodeId, gotoWithoutNav]
  );
  const back = useCallback3(() => {
    const cur = useGraphStore.getState().navStack;
    if (cur.index <= 0)
      return;
    const id = cur.items[cur.index - 1];
    useGraphStore.getState().navBack();
    if (id)
      setTimeout(() => gotoWithoutNav(id), 0);
  }, [gotoWithoutNav]);
  const forward = useCallback3(() => {
    const cur = useGraphStore.getState().navStack;
    if (cur.index >= cur.items.length - 1)
      return;
    const id = cur.items[cur.index + 1];
    useGraphStore.getState().navForward();
    if (id)
      setTimeout(() => gotoWithoutNav(id), 0);
  }, [gotoWithoutNav]);
  return { goto, gotoWithoutNav, back, forward, navStack };
}
var init_useNavigation = __esm({
  "src/web/hooks/useNavigation.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/useMonaco.ts
import { useEffect as useEffect4, useRef as useRef3, useState as useState2 } from "react";
function useMonaco(panelOpen, panelTab, pendingFile) {
  const editorRef = useRef3(null);
  const [ready, setReady] = useState2(false);
  const [created, setCreated] = useState2(false);
  const loadingRef = useRef3(false);
  useEffect4(() => {
    if (!panelOpen)
      return;
    if (ready)
      return;
    if (window.monaco && window.monaco.editor) {
      setReady(true);
      return;
    }
    if (loadingRef.current)
      return;
    if (typeof window.require === "undefined") {
      const retry = setTimeout(() => {
        loadingRef.current = false;
        setReady((v) => v);
      }, 300);
      return () => clearTimeout(retry);
    }
    loadingRef.current = true;
    window.require.config({
      paths: {
        vs: `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs`
      }
    });
    window.require(
      ["vs/editor/editor.main"],
      () => {
        if (window.monaco && window.monaco.editor)
          setReady(true);
        else
          loadingRef.current = false;
      },
      (err) => {
        console.error("[monaco] load error:", err);
        loadingRef.current = false;
      }
    );
  }, [panelOpen, ready]);
  useEffect4(() => {
    if (!panelOpen)
      return;
    if (!ready)
      return;
    if (editorRef.current)
      return;
    if (!window.monaco || !window.monaco.editor)
      return;
    const el = document.getElementById("monaco-container");
    if (!el)
      return;
    try {
      editorRef.current = window.monaco.editor.create(el, {
        value: "",
        language: "yaml",
        theme: "vs-dark",
        readOnly: true,
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: "JetBrains Mono, SF Mono, Monaco, monospace"
      });
      setCreated(true);
    } catch (e) {
      console.error("[monaco] create failed:", e);
    }
  }, [panelOpen, ready]);
  useEffect4(() => {
    if (!panelOpen)
      return;
    if (panelTab !== "file")
      return;
    if (!editorRef.current)
      return;
    const t = setTimeout(() => {
      if (editorRef.current) {
        try {
          editorRef.current.layout();
        } catch {
        }
      }
    }, 60);
    return () => clearTimeout(t);
  }, [panelOpen, panelTab, created]);
  useEffect4(() => {
    if (!pendingFile)
      return;
    if (!created)
      return;
    if (!editorRef.current)
      return;
    editorRef.current.setValue(pendingFile.content);
    if (pendingFile.fqid) {
      setTimeout(() => {
        const ed = editorRef.current;
        if (!ed)
          return;
        const lines = pendingFile.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].indexOf(pendingFile.fqid) !== -1) {
            ed.revealLineInCenter(i + 1);
            ed.setSelection({
              startLineNumber: i + 1,
              startColumn: 1,
              endLineNumber: i + 1,
              endColumn: lines[i].length + 1
            });
            break;
          }
        }
      }, 150);
    }
  }, [pendingFile, created]);
  useEffect4(() => {
    if (panelOpen)
      return;
    if (editorRef.current) {
      try {
        editorRef.current.dispose();
      } catch {
      }
      editorRef.current = null;
      setCreated(false);
    }
  }, [panelOpen]);
  return { editorRef, ready, created };
}
var MONACO_VERSION;
var init_useMonaco = __esm({
  "src/web/hooks/useMonaco.ts"() {
    "use strict";
    MONACO_VERSION = "0.34.0";
  }
});

// src/web/hooks/useMarked.ts
import { useEffect as useEffect5, useState as useState3 } from "react";
function useMarked() {
  const [parse, setParse] = useState3(null);
  useEffect5(() => {
    if (parse)
      return;
    if (!markedPromise) {
      markedPromise = import("https://esm.sh/marked@12.0.2");
    }
    markedPromise.then((mod) => {
      const fn = mod.marked ? mod.marked.parse : mod.parse;
      if (typeof fn === "function")
        setParse(() => fn);
    }).catch(() => setParse(null));
  }, [parse]);
  return { parse, ready: !!parse };
}
var markedPromise;
var init_useMarked = __esm({
  "src/web/hooks/useMarked.ts"() {
    "use strict";
    markedPromise = null;
  }
});

// src/web/lib/commands.ts
function buildCommands(ctx) {
  const commands = [
    // Навигация
    {
      section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
      icon: "\u26F6",
      label: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u044D\u043A\u0440\u0430\u043D",
      hotkey: "F",
      keywords: "fit zoom",
      run: () => ctx.rfInstance?.fitView({ duration: 500 })
    },
    {
      section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
      icon: "\u2190",
      label: "\u041D\u0430\u0437\u0430\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
      hotkey: "Alt+\u2190",
      keywords: "back",
      run: ctx.navBack
    },
    {
      section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
      icon: "\u2192",
      label: "\u0412\u043F\u0435\u0440\u0451\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
      hotkey: "Alt+\u2192",
      keywords: "forward",
      run: ctx.navForward
    },
    // Раскладка
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F4D0}",
      label: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F (LR)",
      keywords: "layout",
      run: () => ctx.setLayoutType("LR")
    },
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F4D0}",
      label: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F (TB)",
      keywords: "layout vertical",
      run: () => ctx.setLayoutType("TB")
    },
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F4D0}",
      label: "Force-directed",
      keywords: "layout force physics",
      run: () => ctx.setLayoutType("force")
    },
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F4D0}",
      label: "\u041A\u0440\u0443\u0433\u043E\u0432\u0430\u044F",
      keywords: "layout circular",
      run: () => ctx.setLayoutType("circular")
    },
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F5C2}",
      label: "\u041F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
      keywords: "cluster namespace",
      run: () => ctx.setLayoutType("cluster")
    },
    {
      section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
      icon: "\u{1F4C1}",
      label: "\u041F\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430\u043C",
      keywords: "folder directory",
      run: () => ctx.setLayoutType("folder")
    },
    // Вид
    {
      section: "\u0412\u0438\u0434",
      icon: ctx.theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}",
      label: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0442\u0435\u043C\u0443",
      keywords: "theme dark light",
      run: () => ctx.setTheme(ctx.theme === "dark" ? "light" : "dark")
    },
    {
      section: "\u0412\u0438\u0434",
      icon: "\u26AB",
      label: ctx.compact ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C",
      keywords: "compact small",
      run: () => ctx.setCompact((v) => !v)
    },
    {
      section: "\u0412\u0438\u0434",
      icon: "\u{1F5C2}",
      label: ctx.showGroups ? "\u0421\u043A\u0440\u044B\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0443" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0443",
      keywords: "groups boxes",
      run: () => ctx.setShowGroups(!ctx.showGroups)
    },
    {
      section: "\u0412\u0438\u0434",
      icon: "\u21C4",
      label: ctx.bidirectional ? "\u0420\u0430\u0437\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u044C A\u2194B" : "\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u0442\u044C A\u2194B",
      keywords: "bidirectional",
      run: () => ctx.setBidirectional(!ctx.bidirectional)
    },
    {
      section: "\u0412\u0438\u0434",
      icon: "\u{1F3F7}",
      label: ctx.showEdgeLabels ? "\u0421\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439",
      keywords: "labels edges",
      run: () => ctx.setShowEdgeLabels(!ctx.showEdgeLabels)
    },
    {
      section: "\u0412\u0438\u0434",
      icon: ctx.tooltipsEnabled ? "\u{1F6AB}" : "\u{1F4AC}",
      label: ctx.tooltipsEnabled ? "\u0421\u043A\u0440\u044B\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B",
      hotkey: "T",
      keywords: "tooltip",
      run: () => ctx.setTooltipsEnabled((v) => !v)
    },
    // Heatmap
    {
      section: "Heatmap",
      icon: "\u{1F525}",
      label: ctx.heatmap === "health" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: Health score",
      keywords: "heatmap",
      run: () => ctx.setHeatmap(ctx.heatmap === "health" ? "none" : "health")
    },
    {
      section: "Heatmap",
      icon: "\u{1F525}",
      label: ctx.heatmap === "degree" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: \u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u0432\u044F\u0437\u0435\u0439",
      keywords: "heatmap degree",
      run: () => ctx.setHeatmap(ctx.heatmap === "degree" ? "none" : "degree")
    },
    {
      section: "Heatmap",
      icon: "\u{1F525}",
      label: ctx.heatmap === "entities" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: Entities",
      keywords: "heatmap entities",
      run: () => ctx.setHeatmap(ctx.heatmap === "entities" ? "none" : "entities")
    },
    {
      section: "Heatmap",
      icon: "\u{1F525}",
      label: ctx.heatmap === "fqid" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: FQID-\u0441\u0441\u044B\u043B\u043A\u0438",
      keywords: "heatmap fqid",
      run: () => ctx.setHeatmap(ctx.heatmap === "fqid" ? "none" : "fqid")
    },
    // Анализ
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F501}",
      label: "\u041D\u0430\u0439\u0442\u0438 \u0446\u0438\u043A\u043B\u044B",
      hotkey: "C",
      keywords: "cycles scc",
      run: ctx.handleFindCycles
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u25EF",
      label: ctx.isolatedOnly ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435",
      hotkey: "I",
      keywords: "isolated",
      run: () => ctx.setIsolatedOnly((v) => !v)
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F5C2}",
      label: ctx.nsMode ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044E" : "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
      hotkey: "S",
      keywords: "namespace aggregate",
      run: () => ctx.setNsMode((v) => !v)
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F4E6}",
      label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 (\u0442\u043E\u043F\u043E\u0441\u043E\u0440\u0442)",
      keywords: "topo install order",
      run: () => ctx.setTopoOpen(true)
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F3AF}",
      label: ctx.focusNode ? "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u043E\u043A\u0443\u0441" : "\u0424\u043E\u043A\u0443\u0441 \u043D\u0430 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u043C",
      keywords: "focus",
      run: () => {
        if (ctx.focusNode)
          ctx.setFocusNode(null);
        else if (ctx.selectedNodeId)
          ctx.setFocusNode(ctx.selectedNodeId);
      }
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F6E4}\uFE0F",
      label: "\u041D\u0430\u0439\u0442\u0438 \u043F\u0443\u0442\u044C \u043C\u0435\u0436\u0434\u0443 \u0434\u0432\u0443\u043C\u044F \u0443\u0437\u043B\u0430\u043C\u0438",
      hotkey: "P",
      keywords: "path",
      run: ctx.handleRunPath
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F4D6}",
      label: ctx.tour ? "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u044E" : "\u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B",
      keywords: "learning path tour",
      run: () => {
        if (ctx.tour)
          ctx.tourStop();
        else
          ctx.setLearningPathOpen(true);
      }
    },
    {
      section: "\u0410\u043D\u0430\u043B\u0438\u0437",
      icon: "\u{1F9EC}",
      label: "\u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439",
      keywords: "entity hierarchy inherits",
      run: () => {
        ctx.setEntityHierarchyInitialKey(null);
        ctx.setEntityHierarchyOpen(true);
      }
    },
    // Фильтры
    {
      section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
      icon: "\u2605",
      label: ctx.bookmarksOnly ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
      keywords: "bookmarks",
      run: () => ctx.setBookmarksOnly(!ctx.bookmarksOnly)
    },
    {
      section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
      icon: "\u274C",
      label: ctx.onlyInvalid ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435",
      keywords: "invalid validation",
      run: () => ctx.setOnlyInvalid(!ctx.onlyInvalid)
    },
    {
      section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
      icon: "\u{1F5D1}",
      label: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B",
      keywords: "reset clear filters",
      run: ctx.resetAll
    },
    // Данные
    {
      section: "\u0414\u0430\u043D\u043D\u044B\u0435",
      icon: "\u{1F4BE}",
      label: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0433\u0440\u0430\u0444\u0430 \u0432 JSON",
      keywords: "export json",
      run: ctx.handleExportJSON
    },
    {
      section: "\u0414\u0430\u043D\u043D\u044B\u0435",
      icon: "\u{1F4DD}",
      label: "\u041E\u0442\u0447\u0451\u0442 \u0432 Markdown",
      keywords: "export markdown report",
      run: ctx.handleExportMarkdown
    },
    {
      section: "\u0414\u0430\u043D\u043D\u044B\u0435",
      icon: "\u{1F5BC}\uFE0F",
      label: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0433\u0440\u0430\u0444\u0430 \u0432 PNG",
      keywords: "export png",
      run: ctx.handleExportPNG
    },
    ctx.validationAvailable ? {
      section: "\u0414\u0430\u043D\u043D\u044B\u0435",
      icon: "\u{1F50D}",
      label: "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432",
      keywords: "validate check",
      run: () => ctx.setValidationOpen(true)
    } : null,
    // Справка
    {
      section: "\u0421\u043F\u0440\u0430\u0432\u043A\u0430",
      icon: "\u{1F4D6}",
      label: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
      hotkey: "F1",
      keywords: "guide help",
      run: () => ctx.setHelpOpen(true)
    },
    {
      section: "\u0421\u043F\u0440\u0430\u0432\u043A\u0430",
      icon: "\u2328\uFE0F",
      label: "\u0421\u043F\u0438\u0441\u043E\u043A \u0433\u043E\u0440\u044F\u0447\u0438\u0445 \u043A\u043B\u0430\u0432\u0438\u0448",
      keywords: "hotkeys",
      run: () => ctx.setHotkeysOpen(true)
    }
  ];
  return commands.filter((c) => c !== null);
}
var init_commands = __esm({
  "src/web/lib/commands.ts"() {
    "use strict";
  }
});

// src/web/lib/events.ts
var EVT_FIND_CYCLES;
var init_events = __esm({
  "src/web/lib/events.ts"() {
    "use strict";
    EVT_FIND_CYCLES = "dg:find-cycles";
  }
});

// src/web/lib/algorithms/path.ts
function findPath(startId, endId, edges) {
  if (!startId || !endId || startId === endId)
    return null;
  const adjacency = /* @__PURE__ */ new Map();
  edges.forEach((e) => {
    if (!adjacency.has(e.source))
      adjacency.set(e.source, []);
    adjacency.get(e.source).push({ node: e.target, edge: e.id });
  });
  const visited = /* @__PURE__ */ new Set([startId]);
  const queue = [
    { id: startId, path: [startId], edges: [] }
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.id === endId)
      return { nodes: cur.path, edges: cur.edges };
    const neighbors = adjacency.get(cur.id) || [];
    for (const n of neighbors) {
      if (visited.has(n.node))
        continue;
      visited.add(n.node);
      queue.push({
        id: n.node,
        path: cur.path.concat([n.node]),
        edges: cur.edges.concat([n.edge])
      });
    }
  }
  return null;
}
var init_path = __esm({
  "src/web/lib/algorithms/path.ts"() {
    "use strict";
  }
});

// src/web/hooks/useCommands.ts
import { useMemo as useMemo7 } from "react";
function useCommands({
  filteredEdges,
  navBack,
  navForward,
  onExportJSON,
  onExportMarkdown,
  onExportPNG
}) {
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
    (s) => s.setEntityHierarchyInitialKey
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
  const resetAll = useGraphStore((s) => s.resetAll);
  const setFilters = useGraphStore((s) => s.setFilters);
  const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
  const setTagFilters = useGraphStore((s) => s.setTagFilters);
  const resetHiddenNodes = useGraphStore((s) => s.resetHiddenNodes);
  return useMemo7(
    () => buildCommands({
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
      handleFindCycles: () => document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES)),
      handleRunPath: () => {
        if (pathSel.length === 2) {
          const res = findPath(pathSel[0], pathSel[1], filteredEdges);
          if (res)
            setPathResult(res);
          else
            alert("\u041F\u0443\u0442\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
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
      resetHiddenNodes
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
      onExportPNG
    ]
  );
}
var init_useCommands = __esm({
  "src/web/hooks/useCommands.ts"() {
    "use strict";
    init_useGraphStore();
    init_commands();
    init_events();
    init_path();
  }
});

// src/web/lib/diff.ts
function createSnapshot(nodes, edges, server) {
  return {
    savedAt: (/* @__PURE__ */ new Date()).toISOString(),
    server,
    stats: { nodes: nodes.length, edges: edges.length },
    nodes: nodes.map((n) => ({
      id: n.id,
      domainId: n.data.domainId,
      nodeType: n.data.nodeType
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      kind: e.data && e.data.kind,
      fullLabel: e.data && e.data.fullLabel,
      refCount: e.data && e.data.refCount
    }))
  };
}
function computeDiff(nodes, edges, snap) {
  if (!snap || !Array.isArray(snap.nodes) || !Array.isArray(snap.edges))
    return null;
  const snapEdgeIds = new Set(snap.edges.map((x) => x.id));
  const snapNodeIds = new Set(snap.nodes.map((x) => x.id));
  const curEdgeIds = new Set(edges.map((x) => x.id));
  const curNodeIds = new Set(nodes.map((x) => x.id));
  const addedEdges = /* @__PURE__ */ new Set();
  const removedEdges = /* @__PURE__ */ new Set();
  const addedNodes = /* @__PURE__ */ new Set();
  const removedNodes = /* @__PURE__ */ new Set();
  curEdgeIds.forEach((id) => {
    if (!snapEdgeIds.has(id))
      addedEdges.add(id);
  });
  snapEdgeIds.forEach((id) => {
    if (!curEdgeIds.has(id))
      removedEdges.add(id);
  });
  curNodeIds.forEach((id) => {
    if (!snapNodeIds.has(id))
      addedNodes.add(id);
  });
  snapNodeIds.forEach((id) => {
    if (!curNodeIds.has(id))
      removedNodes.add(id);
  });
  return { addedNodes, removedNodes, addedEdges, removedEdges };
}
var init_diff = __esm({
  "src/web/lib/diff.ts"() {
    "use strict";
  }
});

// src/web/hooks/useSnapshots.ts
import { useCallback as useCallback4 } from "react";
function useSnapshots(serverName) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const snapshotA = useGraphStore((s) => s.snapshotA);
  const snapshotB = useGraphStore((s) => s.snapshotB);
  const setSnapshotA = useGraphStore((s) => s.setSnapshotA);
  const setSnapshotB = useGraphStore((s) => s.setSnapshotB);
  const setDiffMode = useGraphStore((s) => s.setDiffMode);
  const showSnackbar = useGraphStore((s) => s.showSnackbar);
  const applyDiff = useCallback4(
    (snap) => {
      const diff = computeDiff(nodes, edges, snap);
      if (!diff) {
        alert("\u0421\u043D\u0438\u043C\u043E\u043A \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0435\u043D");
        return;
      }
      setDiffMode({ ...diff, snapshot: snap });
    },
    [nodes, edges, setDiffMode]
  );
  const save = useCallback4(
    (slot) => {
      const snap = createSnapshot(nodes, edges, serverName);
      if (slot === "A")
        setSnapshotA(snap);
      else
        setSnapshotB(snap);
      showSnackbar(
        `\u0421\u043D\u0438\u043C\u043E\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0432 ${slot} (${snap.stats.nodes} \u0443\u0437\u043B\u043E\u0432, ${snap.stats.edges} \u0441\u0432\u044F\u0437\u0435\u0439)`
      );
    },
    [nodes, edges, serverName, setSnapshotA, setSnapshotB, showSnackbar]
  );
  const load = useCallback4(
    (slot) => {
      const snap = slot === "A" ? snapshotA : snapshotB;
      if (!snap)
        return;
      applyDiff(snap);
      showSnackbar(
        `\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441\u043E \u0441\u043D\u0438\u043C\u043A\u043E\u043C ${slot} \u043E\u0442 ` + new Date(snap.savedAt).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
      );
    },
    [snapshotA, snapshotB, applyDiff, showSnackbar]
  );
  const clear = useCallback4(
    (slot) => {
      if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A " + slot + "?"))
        return;
      if (slot === "A")
        setSnapshotA(null);
      else
        setSnapshotB(null);
    },
    [setSnapshotA, setSnapshotB]
  );
  const upload = useCallback4(
    (e) => {
      const file = e.target.files?.[0];
      if (!file)
        return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const snap = JSON.parse(ev.target?.result);
          applyDiff(snap);
          showSnackbar("\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u043C \u0444\u0430\u0439\u043B\u043E\u043C");
        } catch (err) {
          alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u0447\u0442\u0435\u043D\u0438\u044F \u0441\u043D\u0438\u043C\u043A\u0430: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [applyDiff, showSnackbar]
  );
  return { save, load, clear, upload };
}
var init_useSnapshots = __esm({
  "src/web/hooks/useSnapshots.ts"() {
    "use strict";
    init_useGraphStore();
    init_diff();
  }
});

// src/web/lib/export.ts
function downloadFile(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-");
}
function exportGraphJSON(nodes, edges) {
  const data = {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    scope: "full",
    stats: { nodes: nodes.length, edges: edges.length },
    nodes: nodes.map((n) => ({
      id: n.id,
      domainId: n.data.domainId,
      label: n.data.label,
      nodeType: n.data.nodeType,
      filePath: n.data.filePath,
      description: n.data.description,
      tags: n.data.tags
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      kind: e.data && e.data.kind,
      fullLabel: e.data && e.data.fullLabel,
      refCount: e.data && e.data.refCount
    }))
  };
  downloadFile(
    JSON.stringify(data, null, 2),
    `domain-graph-${stamp()}.json`,
    "application/json"
  );
}
function exportMermaid(nodes, edges) {
  const lines = ["graph LR"];
  const idMap = /* @__PURE__ */ new Map();
  let counter = 1;
  nodes.forEach((n) => {
    if (n.data.nodeType !== "domain")
      return;
    const id = "D" + counter++;
    idMap.set(n.id, id);
    const safeLabel = (n.data.domainId || "").replace(/"/g, "&quot;");
    lines.push(`  ${id}["${safeLabel}"]`);
  });
  edges.forEach((e) => {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t)
      return;
    const kind = e.data && e.data.kind;
    const label = kind === "linkage" ? "" : `|${e.data && e.data.refCount || 1}|`;
    lines.push(`  ${s} -->${label} ${t}`);
  });
  lines.push("");
  lines.push("  classDef domain fill:#4CAF50,color:#fff");
  lines.push("  classDef missing fill:#FF9800,color:#fff");
  lines.push("  classDef broken fill:#F44336,color:#fff");
  downloadFile(
    lines.join("\n"),
    `domain-graph-${stamp()}.mmd`,
    "text/plain;charset=utf-8"
  );
}
function exportPNG() {
  const flowEl = document.querySelector(
    ".graph-container"
  );
  if (!flowEl) {
    alert("\u0413\u0440\u0430\u0444 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
    return Promise.resolve();
  }
  return import("https://esm.sh/html-to-image@1.11.11").then((mod) => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--graph-bg").trim() || "#0a0e1a";
    return mod.toPng(flowEl, {
      backgroundColor: bg,
      pixelRatio: 2,
      filter: (node) => {
        if (!node.classList)
          return true;
        if (node.classList.contains("react-flow__controls"))
          return false;
        if (node.classList.contains("react-flow__minimap"))
          return false;
        if (node.classList.contains("react-flow__panel"))
          return false;
        if (node.classList.contains("heat-legend"))
          return false;
        if (node.classList.contains("side-panel"))
          return false;
        if (node.classList.contains("toolbar"))
          return false;
        return true;
      }
    });
  }).then((dataUrl) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `domain-graph-${stamp()}.png`;
    a.click();
  }).catch((err) => {
    alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430: " + err.message);
  });
}
function exportStatsMarkdown(nodes, edges, counts, isolatedCount, cyclesCount, topConnected, worstHealth, namespaces, tagCloud) {
  const lines = [];
  lines.push("# \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 Domain Graph");
  lines.push("");
  lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
  lines.push("");
  lines.push("## \u041E\u0431\u0437\u043E\u0440");
  lines.push("");
  lines.push("| \u041C\u0435\u0442\u0440\u0438\u043A\u0430 | \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 |");
  lines.push("| --- | ---: |");
  lines.push("| \u0412\u0441\u0435\u0433\u043E \u0443\u0437\u043B\u043E\u0432 | " + nodes.length + " |");
  lines.push("| \u0421\u0432\u044F\u0437\u0435\u0439 | " + edges.length + " |");
  lines.push("| Missing | " + counts.missing + " |");
  lines.push("| Broken | " + counts.broken + " |");
  lines.push("| \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 | " + isolatedCount + " |");
  lines.push("| \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0433\u0440\u0443\u043F\u043F | " + cyclesCount + " |");
  lines.push("");
  if (topConnected.length > 0) {
    lines.push("## \u0422\u043E\u043F \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C");
    lines.push("");
    lines.push("| # | \u0414\u043E\u043C\u0435\u043D | \u0421\u0432\u044F\u0437\u0435\u0439 |");
    lines.push("| ---: | --- | ---: |");
    topConnected.forEach((item, i) => {
      lines.push(
        `| ${i + 1} | \`${item.node.data.domainId}\` | ${item.degree} |`
      );
    });
    lines.push("");
  }
  if (worstHealth.length > 0) {
    lines.push("## \u041D\u0438\u0437\u043A\u0438\u0439 health");
    lines.push("");
    lines.push("| # | \u0414\u043E\u043C\u0435\u043D | Health |");
    lines.push("| ---: | --- | ---: |");
    worstHealth.slice(0, 20).forEach((item, i) => {
      lines.push(
        `| ${i + 1} | \`${item.node.data.domainId}\` | ${item.health}/100 |`
      );
    });
    lines.push("");
  }
  if (namespaces.length > 0) {
    lines.push("## \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u044B");
    lines.push("");
    lines.push("| \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441 | \u0414\u043E\u043C\u0435\u043D\u043E\u0432 |");
    lines.push("| --- | ---: |");
    namespaces.forEach(([ns, count]) => {
      lines.push(`| \`${ns}\` | ${count} |`);
    });
    lines.push("");
  }
  if (tagCloud.length > 0) {
    lines.push("## \u0422\u0435\u0433\u0438");
    lines.push("");
    tagCloud.forEach(([tag, count]) => {
      lines.push(`- \`${tag}\` (${count})`);
    });
    lines.push("");
  }
  downloadFile(
    lines.join("\n"),
    `domain-stats-${stamp()}.md`,
    "text/markdown;charset=utf-8"
  );
}
var init_export = __esm({
  "src/web/lib/export.ts"() {
    "use strict";
  }
});

// src/web/lib/format.ts
function plural(n, one, many) {
  return n === 1 ? one : many;
}
function formatDuration(ms) {
  if (ms < 1e3)
    return ms + "ms";
  const s = Math.floor(ms / 1e3);
  if (s < 60)
    return s + "\u0441";
  const m = Math.floor(s / 60);
  return m + "\u043C " + s % 60 + "\u0441";
}
function formatDate(iso) {
  if (!iso)
    return "\u2014";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}
function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 6e4);
  if (min < 1)
    return "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E";
  if (min < 60)
    return min + " \u043C\u0438\u043D \u043D\u0430\u0437\u0430\u0434";
  const h = Math.floor(min / 60);
  if (h < 24)
    return h + " \u0447 \u043D\u0430\u0437\u0430\u0434";
  const d = Math.floor(h / 24);
  return d + " \u0434\u043D \u043D\u0430\u0437\u0430\u0434";
}
function formatSavedAt(iso) {
  if (!iso)
    return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 6e4);
  if (diffMin < 1)
    return "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E";
  if (diffMin < 60)
    return diffMin + " \u043C\u0438\u043D \u043D\u0430\u0437\u0430\u0434";
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)
    return diffH + " \u0447 \u043D\u0430\u0437\u0430\u0434";
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)
    return diffD + " \u0434\u043D \u043D\u0430\u0437\u0430\u0434";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
function sourceIcon(source) {
  if (source === "graphql")
    return "cloud_done";
  if (source === "fs")
    return "hard_drive";
  return "help";
}
function sourceLabel(source) {
  if (source === "graphql")
    return "\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435";
  if (source === "fs")
    return "\u0438\u0437\u043C\u0435\u043D\u0451\u043D \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E";
  return "\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D";
}
function sourceColor(source) {
  if (source === "graphql")
    return "var(--accent-hover)";
  if (source === "fs")
    return "var(--warning)";
  return "var(--text-500)";
}
var init_format = __esm({
  "src/web/lib/format.ts"() {
    "use strict";
  }
});

// src/web/lib/markdown.ts
function generateMarkdownReport(ctx) {
  const { nodes, edges, cyclesInfo, healthMap, namespaceFilter = "" } = ctx;
  const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  const domainNodes = nodes.filter((n) => n.data.nodeType === "domain");
  const missingNodes = nodes.filter((n) => n.data.nodeType === "missing");
  const brokenNodes = nodes.filter((n) => n.data.nodeType === "broken");
  const isolated = domainNodes.filter((n) => {
    return !edges.some((e) => e.source === n.id || e.target === n.id);
  });
  const allRefs = [];
  domainNodes.forEach((n) => {
    (n.data.fqidRefs || []).forEach((r) => {
      const exists = nodes.some(
        (x) => (x.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase()
      );
      if (!exists)
        allRefs.push({ from: n.data.domainId, ref: r });
    });
  });
  const topConnected = domainNodes.map((n) => {
    let d = 0;
    edges.forEach((e) => {
      if (e.source === n.id)
        d++;
      if (e.target === n.id)
        d++;
    });
    return { node: n, degree: d };
  }).sort((a, b) => b.degree - a.degree).slice(0, 10);
  const worstHealth = domainNodes.map((n) => {
    const h = healthMap.get(n.id);
    const score = h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
    return { node: n, health: score };
  }).sort((a, b) => a.health - b.health).slice(0, 10);
  const nsMap = /* @__PURE__ */ new Map();
  domainNodes.forEach((n) => {
    const ns = n.data.domainId.split(".").slice(0, 2).join(".");
    nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
  });
  const nsList = Array.from(nsMap.entries()).sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push("# Domain Graph Report");
  lines.push("");
  lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + now + "_");
  lines.push("");
  lines.push("## \u0421\u0432\u043E\u0434\u043A\u0430");
  lines.push("");
  lines.push("| \u041C\u0435\u0442\u0440\u0438\u043A\u0430 | \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 |");
  lines.push("| --- | ---: |");
  lines.push("| \u0412\u0441\u0435\u0433\u043E \u0443\u0437\u043B\u043E\u0432 | " + nodes.length + " |");
  lines.push("| \u0414\u043E\u043C\u0435\u043D\u044B | " + domainNodes.length + " |");
  lines.push("| Missing | " + missingNodes.length + " |");
  lines.push("| Broken | " + brokenNodes.length + " |");
  lines.push("| \u0421\u0432\u044F\u0437\u0435\u0439 | " + edges.length + " |");
  lines.push("| \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0433\u0440\u0443\u043F\u043F | " + cyclesInfo.sccs.length + " |");
  lines.push("| \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0434\u043E\u043C\u0435\u043D\u043E\u0432 | " + isolated.length + " |");
  lines.push("| \u0411\u0438\u0442\u044B\u0445 FQID-\u0441\u0441\u044B\u043B\u043E\u043A | " + allRefs.length + " |");
  lines.push("");
  if (namespaceFilter) {
    lines.push("> \u0424\u0438\u043B\u044C\u0442\u0440 \u043F\u043E namespace: `" + namespaceFilter + "`");
    lines.push("");
  }
  lines.push("## \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438");
  lines.push("");
  if (cyclesInfo.sccs.length === 0) {
    lines.push("_\u0426\u0438\u043A\u043B\u043E\u0432 \u043D\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043E._");
  } else {
    lines.push("\u041D\u0430\u0439\u0434\u0435\u043D\u043E **" + cyclesInfo.sccs.length + "** \u0446\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0433\u0440\u0443\u043F\u043F:");
    lines.push("");
    cyclesInfo.sccs.forEach((scc, i) => {
      const names = scc.map((id) => {
        const n = nodes.find((x) => x.id === id);
        return n ? n.data.domainId : id;
      });
      lines.push(i + 1 + ". " + names.join(" \u2192 ") + " \u2192 " + names[0]);
    });
  }
  lines.push("");
  lines.push("## \u0422\u043E\u043F-10 \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C");
  lines.push("");
  lines.push("| # | \u0414\u043E\u043C\u0435\u043D | \u0421\u0432\u044F\u0437\u0435\u0439 |");
  lines.push("| ---: | --- | ---: |");
  topConnected.forEach((item, i) => {
    lines.push(
      "| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.degree + " |"
    );
  });
  lines.push("");
  lines.push("## \u041D\u0438\u0437\u043A\u0438\u0439 health score");
  lines.push("");
  lines.push("| # | \u0414\u043E\u043C\u0435\u043D | Health |");
  lines.push("| ---: | --- | ---: |");
  worstHealth.forEach((item, i) => {
    lines.push(
      "| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.health + "/100 |"
    );
  });
  lines.push("");
  if (isolated.length > 0) {
    lines.push("## \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B");
    lines.push("");
    isolated.forEach((n) => lines.push("- `" + n.data.domainId + "`"));
    lines.push("");
  }
  if (allRefs.length > 0) {
    lines.push("## \u0411\u0438\u0442\u044B\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438");
    lines.push("");
    const byFrom = /* @__PURE__ */ new Map();
    allRefs.forEach((item) => {
      if (!byFrom.has(item.from))
        byFrom.set(item.from, []);
      byFrom.get(item.from).push(item.ref);
    });
    byFrom.forEach((refs, from) => {
      lines.push("### " + from);
      lines.push("");
      refs.forEach((r) => {
        lines.push("- `" + r.fullFQID + "` \u2014 " + r.propertyPath);
      });
      lines.push("");
    });
  }
  lines.push("## \u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u043D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u0430\u043C");
  lines.push("");
  lines.push("| \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441 | \u0414\u043E\u043C\u0435\u043D\u043E\u0432 |");
  lines.push("| --- | ---: |");
  nsList.forEach((entry) => {
    lines.push("| `" + entry[0] + "` | " + entry[1] + " |");
  });
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_\u041E\u0442\u0447\u0451\u0442 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D Domain Graph Analyzer._");
  return lines.join("\n");
}
function generateLearningPathMarkdown(path, options) {
  const lines = [];
  lines.push("# \u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B");
  lines.push("");
  lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
  lines.push("");
  if (options && options.scope) {
    lines.push("\u041E\u0431\u043B\u0430\u0441\u0442\u044C: **" + options.scope + "**");
    lines.push("");
  }
  lines.push(
    "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0447\u0442\u0435\u043D\u0438\u044F \u043F\u043E\u0441\u0442\u0440\u043E\u0435\u043D \u043E\u0442 \xAB\u0444\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442\u0430\xBB (\u0434\u043E\u043C\u0435\u043D\u044B \u0431\u0435\u0437 \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439) \u043A \u0432\u0435\u0440\u0445\u043D\u0438\u043C \u0441\u043B\u043E\u044F\u043C."
  );
  lines.push("");
  lines.push("## \u0421\u0432\u043E\u0434\u043A\u0430");
  lines.push("");
  lines.push("| \u041C\u0435\u0442\u0440\u0438\u043A\u0430 | \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 |");
  lines.push("| --- | ---: |");
  lines.push("| \u0412\u0441\u0435\u0433\u043E \u0434\u043E\u043C\u0435\u043D\u043E\u0432 | " + path.totalDomains + " |");
  lines.push("| \u042D\u0442\u0430\u043F\u043E\u0432 | " + path.totalStages + " |");
  lines.push("| \u0422\u043E\u0447\u0435\u043A \u0432\u0445\u043E\u0434\u0430 | " + path.entryPoints.length + " |");
  if (path.unresolved.length > 0) {
    lines.push("| \u041D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043E (\u0446\u0438\u043A\u043B) | " + path.unresolved.length + " |");
  }
  lines.push("");
  if (path.entryPoints.length > 0) {
    lines.push("## \u0422\u043E\u0447\u043A\u0438 \u0432\u0445\u043E\u0434\u0430");
    lines.push("");
    lines.push(
      "\u042D\u0442\u0438 \u0434\u043E\u043C\u0435\u043D\u044B \u2014 \xAB\u043A\u043B\u0438\u0435\u043D\u0442\u044B\xBB \u0441\u0438\u0441\u0442\u0435\u043C\u044B: \u043E\u043D\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442 \u0434\u0440\u0443\u0433\u0438\u0445, \u043D\u043E \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0438\u0445. \u0425\u043E\u0440\u043E\u0448\u0438\u0435 \u043F\u0440\u0438\u043C\u0435\u0440\u044B \u0434\u043B\u044F \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F, \u043F\u043E\u0442\u043E\u043C\u0443 \u0447\u0442\u043E \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0432\u0435\u0440\u0445\u043D\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F."
    );
    lines.push("");
    path.entryPoints.slice(0, 20).forEach((d) => {
      lines.push(
        "- `" + d.domainId + "`" + (d.label && d.label !== d.domainId ? " \u2014 " + d.label : "")
      );
    });
    lines.push("");
  }
  path.stages.forEach((stage) => {
    lines.push(
      "## \u042D\u0442\u0430\u043F " + (stage.index + 1) + " \u2014 " + stage.domains.length + " " + plural(stage.domains.length, "\u0434\u043E\u043C\u0435\u043D", "\u0434\u043E\u043C\u0435\u043D\u043E\u0432")
    );
    lines.push("");
    stage.domains.forEach((d) => {
      lines.push("### `" + d.domainId + "`");
      if (d.label && d.label !== d.domainId)
        lines.push("_ " + d.label + "_");
      lines.push("");
      if (d.description)
        lines.push(d.description);
      lines.push("");
      const stats = [];
      if (d.fanIn > 0)
        stats.push("\u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0432 " + d.fanIn + " \u043C\u0435\u0441\u0442\u0430\u0445");
      if (d.fanOut > 0)
        stats.push("\u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 " + d.fanOut);
      if (d.entitiesCount)
        stats.push(d.entitiesCount + " entities");
      if (d.tags && d.tags.length > 0)
        stats.push("\u0442\u0435\u0433\u0438: " + d.tags.join(", "));
      if (stats.length > 0)
        lines.push("*" + stats.join(" \xB7 ") + "*");
      lines.push("");
    });
  });
  if (path.unresolved.length > 0) {
    lines.push("## \u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u0431\u043E\u0440\u0430 (\u0432 \u0446\u0438\u043A\u043B\u0435)");
    lines.push("");
    path.unresolved.forEach((d) => {
      lines.push("- `" + d.domainId + "`");
    });
    lines.push("");
  }
  return lines.join("\n");
}
function generateValidationMarkdown(stats, cancelled, logs) {
  const lines = [];
  lines.push("# \u041E\u0442\u0447\u0451\u0442 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432");
  lines.push("");
  lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
  if (cancelled) {
    lines.push("");
    lines.push("> \u26A0\uFE0F \u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0431\u044B\u043B\u0430 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C");
  }
  lines.push("");
  lines.push("## \u0421\u0432\u043E\u0434\u043A\u0430");
  lines.push("");
  lines.push("| \u041C\u0435\u0442\u0440\u0438\u043A\u0430 | \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 |");
  lines.push("| --- | ---: |");
  lines.push("| \u0412\u0441\u0435\u0433\u043E \u0432 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 | " + stats.total + " |");
  lines.push("| \u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E | " + stats.processed + " |");
  lines.push("| \u2705 \u0412\u0430\u043B\u0438\u0434\u043D\u044B\u0445 | " + stats.valid + " |");
  lines.push("| \u274C \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0445 | " + stats.invalid + " |");
  lines.push("| \u26A0\uFE0F \u041E\u0448\u0438\u0431\u043E\u043A | " + stats.errors + " |");
  lines.push("| \u23F1 \u0412\u0440\u0435\u043C\u044F | " + formatDuration(stats.elapsedMs) + " |");
  lines.push("");
  const invalid = logs.filter((l) => l.status === "invalid");
  if (invalid.length > 0) {
    lines.push("## \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B (" + invalid.length + ")");
    lines.push("");
    invalid.forEach((l) => {
      lines.push("### `" + l.domainId + "`");
      lines.push("");
      (l.diagnostics || []).forEach((d) => {
        lines.push("- **[" + d.severity + "]** " + d.message);
        (d.labels || []).forEach((lb) => {
          lines.push(
            "  - " + lb.message + (lb.span ? " (\u043F\u043E\u0437\u0438\u0446\u0438\u044F " + lb.span.start + "-" + lb.span.end + ")" : "")
          );
        });
      });
      lines.push("");
    });
  }
  const errors = logs.filter((l) => l.status === "error");
  if (errors.length > 0) {
    lines.push("## \u041E\u0448\u0438\u0431\u043A\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F (" + errors.length + ")");
    lines.push("");
    errors.forEach((l) => {
      lines.push(
        "- `" + l.domainId + "` \u2014 " + (l.error || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430")
      );
    });
    lines.push("");
  }
  const valid = logs.filter((l) => l.status === "valid");
  if (valid.length > 0) {
    lines.push("## \u0412\u0430\u043B\u0438\u0434\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B (" + valid.length + ")");
    lines.push("");
    valid.forEach((l) => lines.push("- `" + l.domainId + "`"));
    lines.push("");
  }
  return lines.join("\n");
}
var init_markdown = __esm({
  "src/web/lib/markdown.ts"() {
    "use strict";
    init_format();
  }
});

// src/web/hooks/useExports.ts
import { useCallback as useCallback5 } from "react";
function useExports({
  visibleNodes,
  visibleEdges,
  counts,
  isolatedCount,
  cyclesCount,
  healthMap,
  cyclesInfo
}) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
  const filters = useGraphStore((s) => s.filters);
  const exportJSON = useCallback5(() => {
    exportGraphJSON(nodes, edges);
  }, [nodes, edges]);
  const exportMarkdown = useCallback5(() => {
    const md = generateMarkdownReport({
      nodes,
      edges,
      cyclesInfo,
      healthMap,
      namespaceFilter,
      filters
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "domain-report-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md";
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, cyclesInfo, healthMap, namespaceFilter, filters]);
  const exportPNGFile = useCallback5(() => {
    exportPNG();
  }, []);
  const exportMermaidFile = useCallback5(() => {
    exportMermaid(visibleNodes, visibleEdges);
  }, [visibleNodes, visibleEdges]);
  const exportStats = useCallback5(() => {
    const deg = /* @__PURE__ */ new Map();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      if (deg.has(e.source))
        deg.set(e.source, deg.get(e.source) + 1);
      if (deg.has(e.target))
        deg.set(e.target, deg.get(e.target) + 1);
    });
    const topConnected = nodes.map((n) => ({ node: n, degree: deg.get(n.id) || 0 })).filter((x) => x.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 5);
    const worstHealth = nodes.filter((n) => n.data.nodeType === "domain").map((n) => {
      const h = healthMap.get(n.id);
      const score = h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
      return { node: n, health: score };
    }).sort((a, b) => a.health - b.health).slice(0, 5);
    const nsMap = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain")
        return;
      const ns = n.data.domainId.split(".").slice(0, 2).join(".");
      nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
    });
    const namespaces = Array.from(nsMap.entries()).sort((a, b) => b[1] - a[1]);
    const tagMap = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      (n.data.tags || []).forEach(
        (t) => tagMap.set(String(t), (tagMap.get(String(t)) || 0) + 1)
      );
    });
    const tagCloud = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
    exportStatsMarkdown(
      nodes,
      edges,
      counts,
      isolatedCount,
      cyclesCount,
      topConnected,
      worstHealth,
      namespaces,
      tagCloud
    );
  }, [nodes, edges, counts, isolatedCount, cyclesCount, healthMap]);
  return {
    exportJSON,
    exportMarkdown,
    exportPNGFile,
    exportMermaidFile,
    exportStats
  };
}
var init_useExports = __esm({
  "src/web/hooks/useExports.ts"() {
    "use strict";
    init_useGraphStore();
    init_export();
    init_markdown();
  }
});

// src/web/hooks/useInitialFit.ts
import { useEffect as useEffect6 } from "react";
function useInitialFit(visibleNodesCount) {
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const didInitialFit = useGraphStore((s) => s.didInitialFit);
  const setDidInitialFit = useGraphStore((s) => s.setDidInitialFit);
  useEffect6(() => {
    if (didInitialFit)
      return;
    if (visibleNodesCount === 0)
      return;
    if (!rfInstance)
      return;
    const t = setTimeout(() => {
      if (!rfInstance)
        return;
      try {
        rfInstance.fitView({ duration: 0, padding: 0.2 });
        setDidInitialFit(true);
      } catch {
      }
    }, 250);
    return () => clearTimeout(t);
  }, [visibleNodesCount, rfInstance, didInitialFit, setDidInitialFit]);
}
var init_useInitialFit = __esm({
  "src/web/hooks/useInitialFit.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/usePanelNode.ts
import { useMemo as useMemo8 } from "react";
var init_usePanelNode = __esm({
  "src/web/hooks/usePanelNode.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/lib/algorithms/cycles.ts
function findCycles(nodes, edges) {
  const adjacency = /* @__PURE__ */ new Map();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    if (adjacency.has(e.source))
      adjacency.get(e.source).push(e.target);
  });
  let index = 0;
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const indices = /* @__PURE__ */ new Map();
  const lowlinks = /* @__PURE__ */ new Map();
  const sccs = [];
  function strongconnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const neighbors = adjacency.get(v) || [];
    for (const to of neighbors) {
      if (!adjacency.has(to))
        continue;
      if (!indices.has(to)) {
        strongconnect(to);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(to)));
      } else if (onStack.has(to)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(to)));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1)
        sccs.push(scc);
    }
  }
  for (const n of nodes) {
    if (!indices.has(n.id))
      strongconnect(n.id);
  }
  const nodeToScc = /* @__PURE__ */ new Map();
  sccs.forEach((scc, i) => {
    scc.forEach((n) => nodeToScc.set(n, i));
  });
  const cycleNodes = /* @__PURE__ */ new Set();
  sccs.forEach((scc) => scc.forEach((n) => cycleNodes.add(n)));
  const cycleEdges = /* @__PURE__ */ new Set();
  edges.forEach((e) => {
    const s = nodeToScc.get(e.source);
    const t = nodeToScc.get(e.target);
    if (s !== void 0 && s === t)
      cycleEdges.add(e.id);
  });
  return { sccs, cycleNodes, cycleEdges };
}
var init_cycles = __esm({
  "src/web/lib/algorithms/cycles.ts"() {
    "use strict";
  }
});

// src/web/hooks/useGraphEvents.ts
import { useEffect as useEffect7 } from "react";
function useGraphEvents({
  displayNodes,
  displayEdges
}) {
  const setCycleHighlight = useGraphStore((s) => s.setCycleHighlight);
  const cycleHighlight = useGraphStore((s) => s.cycleHighlight);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setFocusNode = useGraphStore((s) => s.setFocusNode);
  const setPathResult = useGraphStore((s) => s.setPathResult);
  const setPathSel = useGraphStore((s) => s.setPathSel);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  useEffect7(() => {
    const onFindCycles = () => {
      if (cycleHighlight) {
        setCycleHighlight(null);
        return;
      }
      const info = findCycles(displayNodes, displayEdges);
      if (info.cycleNodes.size === 0) {
        alert("\u0426\u0438\u043A\u043B\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B");
        return;
      }
      setCycleHighlight({
        nodeIds: info.cycleNodes,
        edgeIds: info.cycleEdges,
        sccCount: info.sccs.length
      });
      setSelectedNodeId(null);
      setFocusNode(null);
      setPathResult(null);
      setPathSel([]);
      setTimeout(() => {
        if (rfInstance) {
          try {
            rfInstance.fitView({ duration: 500, padding: 0.25 });
          } catch {
          }
        }
      }, 50);
    };
    document.addEventListener(EVT_FIND_CYCLES, onFindCycles);
    return () => {
      document.removeEventListener(EVT_FIND_CYCLES, onFindCycles);
    };
  }, [
    displayNodes,
    displayEdges,
    cycleHighlight,
    setCycleHighlight,
    setSelectedNodeId,
    setFocusNode,
    setPathResult,
    setPathSel,
    rfInstance
  ]);
}
var init_useGraphEvents = __esm({
  "src/web/hooks/useGraphEvents.ts"() {
    "use strict";
    init_useGraphStore();
    init_cycles();
    init_events();
  }
});

// src/web/lib/tooltip-builders.ts
function escapeHtml(s) {
  if (s === null || s === void 0)
    return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[c];
  });
}
function buildNodeTooltip(node) {
  const d = node.data;
  const typeLabel = d.nodeType === "domain" ? "\u041A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0434\u043E\u043C\u0435\u043D" : d.nodeType === "missing" ? "\u041D\u0435\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0434\u043E\u043C\u0435\u043D" : "\u0411\u0438\u0442\u044B\u0439 YAML";
  const typeColor = d.nodeType === "domain" ? "#10b981" : d.nodeType === "missing" ? "#f59e0b" : "#ef4444";
  let html = `<div class="tooltip__header" style="color:${typeColor}">${escapeHtml(
    typeLabel
  )}</div>`;
  html += '<div class="tooltip__body">';
  html += `<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">${escapeHtml(
    d.domainId
  )}</span></div>`;
  if (d.label && d.label !== d.domainId) {
    html += `<div class="tooltip__row"><span class="tooltip__label">\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:</span><span class="tooltip__value">${escapeHtml(
      d.label
    )}</span></div>`;
  }
  if (d.version) {
    html += `<div class="tooltip__row"><span class="tooltip__label">\u0412\u0435\u0440\u0441\u0438\u044F:</span><span class="tooltip__value">${escapeHtml(
      d.version
    )}</span></div>`;
  }
  if (d.entitiesCount != null) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">${d.entitiesCount}</span></div>`;
  }
  if (d.description) {
    html += `<div class="tooltip__row"><span class="tooltip__label">\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:</span><span class="tooltip__value">${escapeHtml(
      d.description
    )}</span></div>`;
  }
  if (d.tags && d.tags.length > 0) {
    html += `<div class="tooltip__row"><span class="tooltip__label">\u0422\u0435\u0433\u0438:</span><span class="tooltip__value">${d.tags.map(escapeHtml).join(", ")}</span></div>`;
  }
  if (d.filePath) {
    html += `<div class="tooltip__row"><span class="tooltip__label">\u0424\u0430\u0439\u043B:</span><span class="tooltip__value" style="font-size:11px">${escapeHtml(
      d.filePath
    )}</span></div>`;
    html += `<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="${escapeHtml(
      d.filePath
    )}">\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B</button></div>`;
  }
  const refs = d.fqidRefs || [];
  if (refs.length > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += `<div class="tooltip__label" style="margin-bottom:8px">FQID \u0441\u0441\u044B\u043B\u043A\u0438 (${refs.length}):</div>`;
    html += '<div class="tooltip__fqid-list">';
    refs.forEach((ref) => {
      html += '<div class="tooltip__ref">';
      html += `<div class="tooltip__fqid js-goto-domain" data-domain="${escapeHtml(
        ref.targetDomainId || ""
      )}" style="cursor:pointer">${escapeHtml(ref.fullFQID)}</div>`;
      html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
      html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(
        ref.filePath || ""
      )}" data-fqid="${escapeHtml(ref.fullFQID || "")}">\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0442\u044C</button>`;
      html += "</div>";
    });
    html += "</div></div>";
  }
  html += "</div>";
  return html;
}
function buildEdgeTooltip(edge, refs) {
  const fullLabel = edge.data && edge.data.fullLabel || edge.label || edge.id;
  const link = edge.data && edge.data.linkData || {};
  const nameFrom = link.nameFrom || {};
  const side1Text = nameFrom.side1 || link.sourceEntity || null;
  const side2Text = nameFrom.side2 || link.targetEntity || null;
  const side1Domain = edge.data && edge.data.side1Domain;
  const side2Domain = edge.data && edge.data.side2Domain;
  function renderSide(labelText, text, domain) {
    if (!text)
      return "";
    const clickable = !!domain;
    let h = `<div class="tooltip__row"><span class="tooltip__label">${labelText}</span>`;
    if (clickable) {
      h += `<span class="tooltip__value js-goto-domain" data-domain="${escapeHtml(
        domain
      )}" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">${escapeHtml(
        text
      )}</span>`;
    } else {
      h += `<span class="tooltip__value" style="color:var(--text-400)">${escapeHtml(
        text
      )}</span>`;
    }
    return h + "</div>";
  }
  let html = `<div class="tooltip__header">\u0421\u0432\u044F\u0437\u044C: ${escapeHtml(fullLabel)}</div>`;
  html += '<div class="tooltip__body">';
  html += renderSide("\u0421\u0442\u043E\u0440\u043E\u043D\u0430 1:", side1Text, side1Domain);
  html += renderSide("\u0421\u0442\u043E\u0440\u043E\u043D\u0430 2:", side2Text, side2Domain);
  if (refs.length > 0) {
    html += `<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID \u0441\u0441\u044B\u043B\u043A\u0438 (${refs.length}):</div>`;
    html += '<div class="tooltip__fqid-list">';
    refs.forEach((ref) => {
      html += '<div class="tooltip__ref">';
      html += `<div class="tooltip__fqid">${escapeHtml(ref.fullFQID)}</div>`;
      if (ref.propertyPath) {
        html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
      }
      html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(
        ref.filePath || ""
      )}" data-fqid="${escapeHtml(ref.fullFQID || "")}">\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0442\u044C</button>`;
      html += "</div>";
    });
    html += "</div>";
  }
  html += "</div>";
  return html;
}
var init_tooltip_builders = __esm({
  "src/web/lib/tooltip-builders.ts"() {
    "use strict";
  }
});

// src/web/hooks/useNodeInteractions.ts
import { useCallback as useCallback6 } from "react";
function useNodeInteractions({
  filteredEdges,
  openFileInEditor: openFileInEditor2
}) {
  const tooltip = useTooltip();
  const { goto } = useNavigation();
  const store = useGraphStore;
  const handleNodeClick = useCallback6(
    (_e, node) => {
      tooltip.hide();
      const s = store.getState();
      if (s.pathMode) {
        if (!s.pathMode.anchorId) {
          s.setPathMode({
            anchorId: node.id,
            anchorDomainId: node.data.domainId
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
          alert("\u041F\u0443\u0442\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
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
    [tooltip, filteredEdges, store]
  );
  const handleNodeDoubleClick = useCallback6(
    (_e, node) => {
      const s = store.getState();
      if (s.focusNode === node.id) {
        s.setFocusNode(null);
      } else {
        s.setFocusNode(node.id);
        s.setSelectedNodeId(node.id);
      }
    },
    [store]
  );
  const handleNodeContextMenu = useCallback6(
    (e, node) => {
      e.preventDefault();
      tooltip.hide();
      store.getState().setContextMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id
      });
    },
    [tooltip, store]
  );
  const handleNodeMouseEnter = useCallback6(
    (e, node) => {
      const s = store.getState();
      if (!s.tooltipsEnabled)
        return;
      if (s.pathSel.length > 0 || s.pathMode)
        return;
      const curZoom = s.rfInstance ? s.rfInstance.getZoom() : 1;
      if (curZoom < 0.15)
        return;
      tooltip.showForNode(node.id, () => buildNodeTooltip(node), e);
    },
    [tooltip, store]
  );
  const handleEdgeMouseEnter = useCallback6(
    (e, edge) => {
      const s = store.getState();
      if (!s.tooltipsEnabled)
        return;
      if (s.pathSel.length > 0 || s.pathMode)
        return;
      const refs = edge.data && edge.data.fqidRefs || [];
      tooltip.showForNode(
        "edge:" + edge.id,
        () => buildEdgeTooltip(edge, refs),
        e
      );
    },
    [tooltip, store]
  );
  const handleEdgeClick = useCallback6(
    (_e, edge) => {
      const s = store.getState();
      const realId = edge.data && edge.data.originalId || edge.id;
      s.setSelectedEdgeId(realId);
      if (s.sidePanelEnabled) {
        s.setPanelTab("edge");
        s.setPanelOpen(true);
      }
      tooltip.hide();
    },
    [tooltip, store]
  );
  const handlePaneClick = useCallback6(() => {
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
  const handlePaneContextMenu = useCallback6((e) => {
    e.preventDefault();
  }, []);
  const handleContextAction = useCallback6(
    (action, nodeId) => {
      const s = store.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node)
        return;
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
          if (node.data.filePath)
            openFileInEditor2(node.data.filePath, null);
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
    [store, openFileInEditor2]
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
    handleContextAction
  };
}
var init_useNodeInteractions = __esm({
  "src/web/hooks/useNodeInteractions.ts"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_useTooltip();
    init_path();
    init_tooltip_builders();
  }
});

// src/web/hooks/useGraphLayout.ts
import { useCallback as useCallback7, useEffect as useEffect8, useRef as useRef4 } from "react";
function useGraphLayout({
  filteredNodes,
  filteredEdges,
  filteredIdsHash
}) {
  const layoutType = useGraphStore((s) => s.layoutType);
  const clusterDepth = useGraphStore((s) => s.clusterDepth);
  const compact = useGraphStore((s) => s.compact);
  const setNodes = useGraphStore((s) => s.setNodes);
  const setClusterBoxes = useGraphStore((s) => s.setClusterBoxes);
  const setClusterGroupCount = useGraphStore((s) => s.setClusterGroupCount);
  const rfInstance = useGraphStore((s) => s.rfInstance);
  const appliedRef = useRef4(null);
  const nodesRef = useRef4([]);
  const edgesRef = useRef4([]);
  nodesRef.current = useGraphStore.getState().nodes;
  edgesRef.current = filteredEdges;
  const applyLayout = useCallback7(
    (type, depth) => {
      const visibleIds = new Set(filteredNodes.map((n) => n.id));
      const layoutInput = nodesRef.current.filter((n) => visibleIds.has(n.id)).map((n) => ({ ...n, data: { ...n.data, __compact: compact } }));
      if (layoutInput.length === 0)
        return;
      const result = runLayout(layoutInput, filteredEdges, type, { depth });
      const posMap = /* @__PURE__ */ new Map();
      result.nodes.forEach((n) => posMap.set(n.id, n.position));
      setClusterBoxes(
        type === "cluster" || type === "folder" ? result.boxes : []
      );
      setClusterGroupCount(result.boxes.length);
      setNodes(
        (prev) => prev.map((n) => {
          const visible = visibleIds.has(n.id);
          const newPos = posMap.get(n.id);
          if (visible && newPos) {
            return {
              ...n,
              position: newPos,
              hidden: false,
              width: NODE_WIDTH2,
              height: NODE_HEIGHT2
            };
          }
          return { ...n, hidden: !visible };
        })
      );
    },
    [
      filteredNodes,
      filteredEdges,
      compact,
      setNodes,
      setClusterBoxes,
      setClusterGroupCount
    ]
  );
  useEffect8(() => {
    if (!filteredIdsHash)
      return;
    const key = `${layoutType}:${clusterDepth}:${compact}:${filteredIdsHash}`;
    if (appliedRef.current === key)
      return;
    appliedRef.current = key;
    applyLayout(layoutType, clusterDepth);
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 400, padding: 0.15 });
            } catch {
            }
          }
        });
      });
    }, 80);
  }, [
    filteredIdsHash,
    layoutType,
    clusterDepth,
    compact,
    applyLayout,
    rfInstance
  ]);
  const relayout = useCallback7(() => {
    appliedRef.current = null;
    applyLayout(layoutType, clusterDepth);
    setTimeout(() => {
      if (rfInstance) {
        try {
          rfInstance.fitView({ duration: 500 });
        } catch {
        }
      }
    }, 100);
  }, [applyLayout, layoutType, clusterDepth, rfInstance]);
  const invalidate = useCallback7(() => {
    appliedRef.current = null;
  }, []);
  return { relayout, invalidate };
}
var NODE_WIDTH2, NODE_HEIGHT2;
var init_useGraphLayout = __esm({
  "src/web/hooks/useGraphLayout.ts"() {
    "use strict";
    init_useGraphStore();
    init_layout();
    NODE_WIDTH2 = 300;
    NODE_HEIGHT2 = 88;
  }
});

// src/web/lib/open-file.ts
function openFileInEditor(filePath, fqid = null) {
  if (!filePath)
    return;
  const store = useGraphStore.getState();
  store.setEditorFilePath(filePath);
  store.setPanelTab("file");
  store.setPanelOpen(true);
  fetch("/file?path=" + encodeURIComponent(filePath)).then((r) => {
    if (!r.ok)
      throw new Error("HTTP " + r.status);
    return r.text();
  }).then((content) => {
    useGraphStore.getState().setPendingFile({
      content,
      fqid: fqid || null,
      ts: Date.now()
    });
  }).catch((err) => {
    useGraphStore.getState().setPendingFile({
      content: "// \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B: " + err.message,
      fqid: null,
      ts: Date.now()
    });
  });
}
var init_open_file = __esm({
  "src/web/lib/open-file.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/hooks/useGlobalClickDelegation.ts
import { useEffect as useEffect9 } from "react";
function useGlobalClickDelegation(goto, hideTooltip) {
  useEffect9(() => {
    const handler = (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== "function")
        return;
      const openBtn = target.closest(".js-open-file");
      if (openBtn) {
        e.stopPropagation();
        e.preventDefault();
        const file = openBtn.getAttribute("data-file");
        const fqid = openBtn.getAttribute("data-fqid");
        if (file)
          openFileInEditor(file, fqid);
        return;
      }
      const gotoBtn = target.closest(".js-goto-domain");
      if (gotoBtn) {
        e.stopPropagation();
        e.preventDefault();
        const domain = gotoBtn.getAttribute("data-domain");
        if (!domain)
          return;
        goto(domain);
        hideTooltip();
        return;
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [goto, hideTooltip]);
}
var init_useGlobalClickDelegation = __esm({
  "src/web/hooks/useGlobalClickDelegation.ts"() {
    "use strict";
    init_open_file();
  }
});

// src/web/hooks/index.ts
var init_hooks = __esm({
  "src/web/hooks/index.ts"() {
    "use strict";
    init_useGraphFilters();
    init_useGraphHighlight();
    init_useHeatmapValues();
    init_useVisibleNodes();
    init_useVisibleEdges();
    init_useTooltip();
    init_useHotkeys();
    init_useSearch();
    init_useValidation();
    init_useNavigation();
    init_useMonaco();
    init_useMarked();
    init_useCommands();
    init_useSnapshots();
    init_useExports();
    init_useInitialFit();
    init_usePanelNode();
    init_useGraphEvents();
    init_useNodeInteractions();
    init_useGraphLayout();
    init_useGlobalClickDelegation();
  }
});

// src/web/lib/health.ts
function computeHealth(node, edges, allNodes, cycleNodes, missingSet) {
  if (node.data.nodeType === "broken" || node.data.nodeType === "missing") {
    return {
      score: 0,
      breakdown: [{ reason: "\u0423\u0437\u0435\u043B \u0431\u0438\u0442\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442", delta: -100 }]
    };
  }
  const breakdown = [];
  let score = 100;
  let connected = false;
  let inEdges = 0;
  let outEdges = 0;
  edges.forEach((e) => {
    if (e.source === node.id) {
      connected = true;
      outEdges++;
    }
    if (e.target === node.id) {
      connected = true;
      inEdges++;
    }
  });
  if (!connected) {
    score -= 40;
    breakdown.push({ reason: "\u0414\u043E\u043C\u0435\u043D \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D (\u043D\u0435\u0442 \u0441\u0432\u044F\u0437\u0435\u0439)", delta: -40 });
  }
  if (cycleNodes && cycleNodes.has(node.id)) {
    score -= 30;
    breakdown.push({ reason: "\u0423\u0447\u0430\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u0446\u0438\u043A\u043B\u0435", delta: -30 });
  }
  const refs = node.data.fqidRefs || [];
  let missingRefs = 0;
  refs.forEach((r) => {
    const exists = allNodes.some(
      (n) => (n.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase()
    );
    if (!exists)
      missingRefs++;
  });
  if (missingRefs > 0) {
    const delta = -Math.min(missingRefs * 3, 20);
    score -= Math.abs(delta);
    breakdown.push({ reason: "\u0411\u0438\u0442\u044B\u0445 FQID-\u0441\u0441\u044B\u043B\u043E\u043A: " + missingRefs, delta });
  }
  return { score: Math.max(0, Math.round(score)), breakdown };
}
var init_health = __esm({
  "src/web/lib/health.ts"() {
    "use strict";
  }
});

// src/web/lib/entities/index.ts
function entityKey(domainId, entityId) {
  return domainId.toLowerCase() + "/" + entityId.toLowerCase();
}
function resolveEntityRef(ref, currentDomainId) {
  if (!ref || typeof ref !== "string")
    return null;
  const slash = ref.indexOf("/");
  if (slash > 0) {
    return { domainId: ref.slice(0, slash), entityId: ref.slice(slash + 1) };
  }
  return { domainId: currentDomainId, entityId: ref };
}
function buildEntityIndex(entities) {
  const byKey = /* @__PURE__ */ new Map();
  entities.forEach((e) => {
    byKey.set(entityKey(e.domainId, e.entityId), e);
  });
  const children = /* @__PURE__ */ new Map();
  entities.forEach((e) => {
    if (!e.inherits)
      return;
    const ref = resolveEntityRef(e.inherits, e.domainId);
    if (!ref)
      return;
    const parentKey = entityKey(ref.domainId, ref.entityId);
    if (!children.has(parentKey))
      children.set(parentKey, []);
    children.get(parentKey).push(e);
  });
  return { byKey, children };
}
var init_entities = __esm({
  "src/web/lib/entities/index.ts"() {
    "use strict";
  }
});

// src/web/components/common/Popover.tsx
import { useEffect as useEffect10, useRef as useRef5, useState as useState4 } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function Popover({ trigger, children, align = "left", width = 320 }) {
  const [open, setOpen] = useState4(false);
  const wrapRef = useRef5(null);
  useEffect10(() => {
    if (!open)
      return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape")
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc, true);
    };
  }, [open]);
  useEffect10(() => {
    const handler = () => setOpen(false);
    document.addEventListener("close-all-popovers", handler);
    return () => document.removeEventListener("close-all-popovers", handler);
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "popover-wrap", ref: wrapRef, children: [
    /* @__PURE__ */ jsx("div", { className: "popover-trigger", onClick: () => setOpen(!open), children: trigger(open) }),
    open && /* @__PURE__ */ jsx("div", { className: `popover popover--${align}`, style: { width }, children: typeof children === "function" ? children(() => setOpen(false)) : children })
  ] });
}
var init_Popover = __esm({
  "src/web/components/common/Popover.tsx"() {
    "use strict";
  }
});

// src/web/components/common/MIcon.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function MIcon({ name, size = "md", fill, className, title, style }) {
  const cls = ["material-symbols-outlined"];
  cls.push(size === "sm" ? "mi-sm" : size === "lg" ? "mi-lg" : size === "xl" ? "mi-xl" : "mi-md");
  if (fill)
    cls.push("mi-fill");
  if (className)
    cls.push(className);
  return /* @__PURE__ */ jsx2("span", { className: cls.join(" "), "aria-hidden": "true", title, style, children: name });
}
var init_MIcon = __esm({
  "src/web/components/common/MIcon.tsx"() {
    "use strict";
  }
});

// src/web/components/popovers/FilterMenu.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function FilterMenu({ counts }) {
  const filters = useGraphStore((s) => s.filters);
  const setFilters = useGraphStore((s) => s.setFilters);
  const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
  const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
  const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
  const setBookmarksOnly = useGraphStore((s) => s.setBookmarksOnly);
  const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
  const setOnlyInvalid = useGraphStore((s) => s.setOnlyInvalid);
  const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
  const setIsolatedOnly = useGraphStore((s) => s.setIsolatedOnly);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
  const setTooltipsEnabled = useGraphStore((s) => s.setTooltipsEnabled);
  const sidePanelEnabled = useGraphStore((s) => s.sidePanelEnabled);
  const setSidePanelEnabled = useGraphStore((s) => s.setSidePanelEnabled);
  const setAll = (val) => setFilters((f) => ({ ...f, domain: val, missing: val, broken: val, linkage: val, fqid: val }));
  const resetAll = () => {
    setAll(true);
    setNamespaceFilter("");
    setBookmarksOnly(false);
    setOnlyInvalid(false);
    setIsolatedOnly(false);
  };
  const nodeRows = [
    { key: "domain", label: "Domain", color: "var(--success)" },
    { key: "missing", label: "Missing", color: "var(--warning)" },
    { key: "broken", label: "Broken", color: "var(--danger)" }
  ];
  const edgeRows = [
    { key: "linkage", label: "Linkage", color: LINKAGE_COLOR2 },
    { key: "fqid", label: "FQID", color: FQID_COLOR2 }
  ];
  return /* @__PURE__ */ jsxs2("div", { className: "menu", children: [
    /* @__PURE__ */ jsxs2("div", { className: "menu__header", children: [
      /* @__PURE__ */ jsx3("span", { children: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B" }),
      /* @__PURE__ */ jsx3("button", { className: "menu__action", onClick: resetAll, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C" })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "menu__section", children: [
      /* @__PURE__ */ jsx3("div", { className: "menu__label", children: "\u0422\u0438\u043F \u0443\u0437\u043B\u043E\u0432" }),
      nodeRows.map((it) => /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "checkbox",
            checked: !!filters[it.key],
            onChange: () => setFilters((f) => ({ ...f, [it.key]: !f[it.key] }))
          }
        ),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__dot", style: { background: it.color } }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: it.label }),
        /* @__PURE__ */ jsx3("span", { className: "menu__count", children: counts[it.key] })
      ] }, it.key))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "menu__section", children: [
      /* @__PURE__ */ jsx3("div", { className: "menu__label", children: "\u0422\u0438\u043F \u0441\u0432\u044F\u0437\u0435\u0439" }),
      edgeRows.map((it) => /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "checkbox",
            checked: !!filters[it.key],
            onChange: () => setFilters((f) => ({ ...f, [it.key]: !f[it.key] }))
          }
        ),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__dot", style: { background: it.color } }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: it.label }),
        /* @__PURE__ */ jsx3("span", { className: "menu__count", children: counts[it.key] })
      ] }, it.key))
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "menu__section", children: [
      /* @__PURE__ */ jsx3("div", { className: "menu__label", children: "Namespace" }),
      /* @__PURE__ */ jsx3(
        "input",
        {
          className: "menu__input",
          type: "text",
          placeholder: "sgrc.risk.*, !test.*",
          value: namespaceFilter,
          onChange: (e) => setNamespaceFilter(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              document.dispatchEvent(new CustomEvent("close-all-popovers"));
            }
          }
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "menu__hint", children: [
        "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0441\u043E\u043A \u0447\u0435\u0440\u0435\u0437 , ; \u0438\u043B\u0438 \u043F\u0440\u043E\u0431\u0435\u043B. ",
        /* @__PURE__ */ jsx3("b", { children: "!" }),
        " \u2014 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C. ",
        /* @__PURE__ */ jsx3("b", { children: "*" }),
        " \u2014 \u043B\u044E\u0431\u043E\u0439 \u0441\u0438\u043C\u0432\u043E\u043B."
      ] })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsxs2("div", { className: "menu__section", children: [
      /* @__PURE__ */ jsx3("div", { className: "menu__label", children: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E" }),
      /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: bookmarksOnly, onChange: () => setBookmarksOnly(!bookmarksOnly) }),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435 (\u2605)" })
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: onlyInvalid, onChange: () => setOnlyInvalid(!onlyInvalid) }),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 (\u274C)" })
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3("input", { type: "checkbox", checked: isolatedOnly, onChange: () => setIsolatedOnly((v) => !v) }),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 (\u25EF)" })
      ] }),
      /* @__PURE__ */ jsx3("div", { className: "menu__divider" }),
      /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "checkbox",
            checked: !sidePanelEnabled,
            onChange: () => setSidePanelEnabled((v) => !v)
          }
        ),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: "\u041D\u0435 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043F\u0440\u0430\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C (D)" })
      ] }),
      /* @__PURE__ */ jsxs2("label", { className: "menu__checkbox", children: [
        /* @__PURE__ */ jsx3(
          "input",
          {
            type: "checkbox",
            checked: !tooltipsEnabled,
            onChange: () => setTooltipsEnabled((v) => !v)
          }
        ),
        /* @__PURE__ */ jsx3("span", { className: "menu__check" }),
        /* @__PURE__ */ jsx3("span", { className: "menu__text", children: "\u0421\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B" })
      ] })
    ] })
  ] });
}
var init_FilterMenu = __esm({
  "src/web/components/popovers/FilterMenu.tsx"() {
    "use strict";
    init_useGraphStore();
    init_graph_transforms();
  }
});

// src/web/components/popovers/AnalysisMenu.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function AnalysisMenu(props) {
  const store = useGraphStore();
  return /* @__PURE__ */ jsxs3("div", { className: "menu", children: [
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item" + (props.cycleHighlight ? " menu__item--active" : ""),
        onClick: () => {
          props.onFindCycles();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u{1F501}" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u041D\u0430\u0439\u0442\u0438 \u0446\u0438\u043A\u043B\u044B" }),
          props.cycleHighlight && /* @__PURE__ */ jsx4("span", { className: "menu__count", children: props.cycleHighlight.sccCount })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item" + (store.pathMode ? " menu__item--active" : ""),
        onClick: () => {
          props.onStartPathFinder();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: /* @__PURE__ */ jsx4(MIcon, { name: "route", size: "sm" }) }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u041D\u0430\u0439\u0442\u0438 \u043F\u0443\u0442\u044C \u043C\u0435\u0436\u0434\u0443 \u0443\u0437\u043B\u0430\u043C\u0438" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item" + (store.isolatedOnly ? " menu__item--active" : ""),
        onClick: () => {
          store.setIsolatedOnly((v) => !v);
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u25EF" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item" + (store.nsMode ? " menu__item--active" : ""),
        onClick: () => {
          store.setNsMode((v) => !v);
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u{1F5C2}" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C" })
        ]
      }
    ),
    /* @__PURE__ */ jsx4("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onOpenTopo();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u{1F4E6}" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onOpenLearningPath();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u{1F4D6}" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F" })
        ]
      }
    ),
    /* @__PURE__ */ jsx4("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item" + (props.ruleViolationsCount > 0 ? " menu__item--active" : ""),
        onClick: () => {
          props.onOpenRules();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: /* @__PURE__ */ jsx4(MIcon, { name: "block", size: "sm" }) }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439" }),
          props.ruleViolationsCount > 0 && /* @__PURE__ */ jsx4("span", { className: "menu__count", children: props.ruleViolationsCount })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onOpenEntityHierarchy();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u{1F9EC}" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439" })
        ]
      }
    ),
    /* @__PURE__ */ jsx4("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsxs3("div", { className: "menu__row", children: [
      /* @__PURE__ */ jsx4("span", { style: { fontSize: 12, color: "var(--text-400)", minWidth: 100 }, children: "\u0413\u043B\u0443\u0431\u0438\u043D\u0430 \u0444\u043E\u043A\u0443\u0441\u0430:" }),
      /* @__PURE__ */ jsx4(
        "input",
        {
          className: "menu__slider",
          type: "range",
          min: 1,
          max: 4,
          value: store.focusDepth,
          onChange: (e) => store.setFocusDepth(parseInt(e.target.value, 10))
        }
      ),
      /* @__PURE__ */ jsx4(
        "span",
        {
          style: {
            fontSize: 12,
            fontWeight: 700,
            color: "var(--accent-hover)",
            minWidth: 12,
            textAlign: "center"
          },
          children: store.focusDepth
        }
      )
    ] }),
    store.focusNode && /* @__PURE__ */ jsxs3(
      "button",
      {
        className: "menu__item menu__item--danger",
        onClick: () => {
          store.setFocusNode(null);
          store.setSelectedNodeId(null);
          store.setSelectedEdgeId(null);
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "menu__icon", children: "\u2715" }),
          /* @__PURE__ */ jsx4("span", { className: "menu__text", children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u043E\u043A\u0443\u0441" })
        ]
      }
    )
  ] });
}
var init_AnalysisMenu = __esm({
  "src/web/components/popovers/AnalysisMenu.tsx"() {
    "use strict";
    init_useGraphStore();
    init_MIcon();
  }
});

// src/web/components/popovers/ViewMenu.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function ViewMenu({ close }) {
  const store = useGraphStore();
  return /* @__PURE__ */ jsxs4("div", { className: "menu", children: [
    /* @__PURE__ */ jsx5("div", { className: "menu__label", children: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430" }),
    LAYOUTS.map((l) => /* @__PURE__ */ jsxs4(
      "button",
      {
        className: "menu__item" + (store.layoutType === l.key ? " menu__item--active" : ""),
        onClick: () => store.setLayoutType(l.key),
        children: [
          /* @__PURE__ */ jsx5("span", { className: "menu__icon", children: store.layoutType === l.key ? "\u25CF" : "\u25CB" }),
          /* @__PURE__ */ jsx5("span", { className: "menu__text", children: l.label })
        ]
      },
      l.key
    )),
    /* @__PURE__ */ jsx5("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsx5("div", { className: "menu__label", children: "Heatmap" }),
    HEATMAPS2.map((h) => /* @__PURE__ */ jsxs4(
      "button",
      {
        className: "menu__item" + (store.heatmap === h.key ? " menu__item--active" : ""),
        onClick: () => {
          store.setHeatmap(h.key);
          close();
        },
        children: [
          /* @__PURE__ */ jsx5("span", { className: "menu__icon", children: store.heatmap === h.key ? "\u25CF" : "\u25CB" }),
          /* @__PURE__ */ jsx5("span", { className: "menu__text", children: h.label })
        ]
      },
      h.key
    )),
    /* @__PURE__ */ jsx5("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsx5("div", { className: "menu__label", children: "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435" }),
    /* @__PURE__ */ jsxs4("label", { className: "menu__checkbox", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          type: "checkbox",
          checked: store.compact,
          onChange: () => store.setCompact((v) => !v)
        }
      ),
      /* @__PURE__ */ jsx5("span", { className: "menu__check" }),
      /* @__PURE__ */ jsx5("span", { className: "menu__text", children: "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" })
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "menu__checkbox", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          type: "checkbox",
          checked: store.showGroups,
          onChange: () => store.setShowGroups(!store.showGroups)
        }
      ),
      /* @__PURE__ */ jsx5("span", { className: "menu__check" }),
      /* @__PURE__ */ jsx5("span", { className: "menu__text", children: "\u0413\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u0432 \u0440\u0430\u043C\u043A\u0438" })
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "menu__checkbox", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          type: "checkbox",
          checked: store.bidirectional,
          onChange: () => store.setBidirectional(!store.bidirectional)
        }
      ),
      /* @__PURE__ */ jsx5("span", { className: "menu__check" }),
      /* @__PURE__ */ jsx5("span", { className: "menu__text", children: "\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u0442\u044C A\u2194B" })
    ] }),
    /* @__PURE__ */ jsxs4("label", { className: "menu__checkbox", children: [
      /* @__PURE__ */ jsx5(
        "input",
        {
          type: "checkbox",
          checked: store.showEdgeLabels,
          onChange: () => store.setShowEdgeLabels(!store.showEdgeLabels)
        }
      ),
      /* @__PURE__ */ jsx5("span", { className: "menu__check" }),
      /* @__PURE__ */ jsx5("span", { className: "menu__text", children: "\u041F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439" })
    ] }),
    /* @__PURE__ */ jsx5("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsxs4(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          store.setTheme(store.theme === "dark" ? "light" : "dark");
          close();
        },
        children: [
          /* @__PURE__ */ jsx5("span", { className: "menu__icon", children: store.theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}" }),
          /* @__PURE__ */ jsx5("span", { className: "menu__text", children: store.theme === "dark" ? "\u0421\u0432\u0435\u0442\u043B\u0430\u044F \u0442\u0435\u043C\u0430" : "\u0422\u0451\u043C\u043D\u0430\u044F \u0442\u0435\u043C\u0430" })
        ]
      }
    )
  ] });
}
var LAYOUTS, HEATMAPS2;
var init_ViewMenu = __esm({
  "src/web/components/popovers/ViewMenu.tsx"() {
    "use strict";
    init_useGraphStore();
    LAYOUTS = [
      { key: "LR", label: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F (LR)" },
      { key: "TB", label: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F (TB)" },
      { key: "force", label: "Force-directed" },
      { key: "circular", label: "\u041A\u0440\u0443\u0433\u043E\u0432\u043E\u0439" },
      { key: "cluster", label: "\u041F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C" },
      { key: "folder", label: "\u041F\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430\u043C" }
    ];
    HEATMAPS2 = [
      { key: "none", label: "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D" },
      { key: "health", label: "Health score" },
      { key: "degree", label: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u0432\u044F\u0437\u0435\u0439" },
      { key: "entities", label: "Entities" },
      { key: "fqid", label: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 FQID" }
    ];
  }
});

// src/web/components/popovers/diff-colors.ts
var DIFF_ADDED2, DIFF_REMOVED2;
var init_diff_colors = __esm({
  "src/web/components/popovers/diff-colors.ts"() {
    "use strict";
    DIFF_ADDED2 = "#22c55e";
    DIFF_REMOVED2 = "#ef4444";
  }
});

// src/web/components/popovers/DataMenu.tsx
import { useRef as useRef6 } from "react";
import { Fragment, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function DataMenu(props) {
  const store = useGraphStore();
  const fileInputRef = useRef6(null);
  const diffMode = store.diffMode;
  return /* @__PURE__ */ jsxs5("div", { className: "menu", children: [
    /* @__PURE__ */ jsx6("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 }, children: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442" }),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onExportJSON();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: "\u{1F4BE}" }),
          /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u0413\u0440\u0430\u0444 \u0432 JSON" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onExportMarkdown();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: "\u{1F4DD}" }),
          /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u041E\u0442\u0447\u0451\u0442 \u0432 Markdown" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onExportPNG();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: "\u{1F5BC}\uFE0F" }),
          /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u0413\u0440\u0430\u0444 \u0432 PNG" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "menu__item",
        onClick: () => {
          props.onExportMermaid();
          props.close();
        },
        children: [
          /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: /* @__PURE__ */ jsx6(MIcon, { name: "schema", size: "sm" }) }),
          /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u0414\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430 Mermaid" })
        ]
      }
    ),
    /* @__PURE__ */ jsx6("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsx6("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 }, children: "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435" }),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "menu__item",
        onClick: () => fileInputRef.current?.click(),
        children: [
          /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: "\u21C4" }),
          /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A" })
        ]
      }
    ),
    /* @__PURE__ */ jsx6(
      "input",
      {
        ref: fileInputRef,
        type: "file",
        accept: "application/json",
        style: { display: "none" },
        onChange: (e) => {
          props.onSnapshotUpload(e);
          props.close();
        }
      }
    ),
    /* @__PURE__ */ jsx6("div", { className: "menu__divider" }),
    /* @__PURE__ */ jsx6("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 }, children: "\u0421\u043D\u0438\u043C\u043A\u0438 (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E)" }),
    /* @__PURE__ */ jsxs5("div", { className: "snap-slot", children: [
      /* @__PURE__ */ jsxs5("div", { className: "snap-slot__info", children: [
        /* @__PURE__ */ jsx6("span", { className: "snap-slot__badge snap-slot__badge--a", children: "A" }),
        store.snapshotA ? /* @__PURE__ */ jsxs5("div", { className: "snap-slot__meta", children: [
          /* @__PURE__ */ jsx6("div", { className: "snap-slot__time", children: formatSavedAt(store.snapshotA.savedAt) }),
          /* @__PURE__ */ jsxs5("div", { className: "snap-slot__stats", children: [
            store.snapshotA.stats.nodes,
            " \u0443\u0437\u043B\u043E\u0432 \xB7 ",
            store.snapshotA.stats.edges,
            " \u0441\u0432\u044F\u0437\u0435\u0439"
          ] })
        ] }) : /* @__PURE__ */ jsx6("div", { className: "snap-slot__empty", children: "\u043F\u0443\u0441\u0442\u043E" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "snap-slot__actions", children: [
        /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn",
            onClick: () => props.onSaveSnapshot("A"),
            title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 A",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "save", size: "sm" })
          }
        ),
        store.snapshotA && /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn snap-btn--primary",
            onClick: () => {
              props.onLoadSnapshot("A");
              props.close();
            },
            title: "\u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441 A",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "compare_arrows", size: "sm" })
          }
        ),
        store.snapshotA && /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn snap-btn--danger",
            onClick: () => props.onClearSnapshot("A"),
            title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A A",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "close", size: "sm" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "snap-slot", children: [
      /* @__PURE__ */ jsxs5("div", { className: "snap-slot__info", children: [
        /* @__PURE__ */ jsx6("span", { className: "snap-slot__badge snap-slot__badge--b", children: "B" }),
        store.snapshotB ? /* @__PURE__ */ jsxs5("div", { className: "snap-slot__meta", children: [
          /* @__PURE__ */ jsx6("div", { className: "snap-slot__time", children: formatSavedAt(store.snapshotB.savedAt) }),
          /* @__PURE__ */ jsxs5("div", { className: "snap-slot__stats", children: [
            store.snapshotB.stats.nodes,
            " \u0443\u0437\u043B\u043E\u0432 \xB7 ",
            store.snapshotB.stats.edges,
            " \u0441\u0432\u044F\u0437\u0435\u0439"
          ] })
        ] }) : /* @__PURE__ */ jsx6("div", { className: "snap-slot__empty", children: "\u043F\u0443\u0441\u0442\u043E" })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "snap-slot__actions", children: [
        /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn",
            onClick: () => props.onSaveSnapshot("B"),
            title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 B",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "save", size: "sm" })
          }
        ),
        store.snapshotB && /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn snap-btn--primary",
            onClick: () => {
              props.onLoadSnapshot("B");
              props.close();
            },
            title: "\u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441 B",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "compare_arrows", size: "sm" })
          }
        ),
        store.snapshotB && /* @__PURE__ */ jsx6(
          "button",
          {
            className: "snap-btn snap-btn--danger",
            onClick: () => props.onClearSnapshot("B"),
            title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A B",
            children: /* @__PURE__ */ jsx6(MIcon, { name: "close", size: "sm" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "menu__hint", style: { paddingLeft: 12, paddingRight: 12 }, children: [
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \xAB\u0434\u043E\xBB, \u0441\u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 ",
      /* @__PURE__ */ jsx6(MIcon, { name: "compare_arrows", size: "sm" }),
      " \u2014 \u0443\u0432\u0438\u0434\u0438\u0442\u0435 \u0440\u0430\u0437\u043D\u0438\u0446\u0443 \u043D\u0430 \u0433\u0440\u0430\u0444\u0435."
    ] }),
    diffMode && /* @__PURE__ */ jsxs5("div", { className: "diff-legend", children: [
      /* @__PURE__ */ jsxs5("span", { className: "diff-legend__item", children: [
        /* @__PURE__ */ jsx6("span", { className: "diff-legend__dot", style: { background: DIFF_ADDED2 } }),
        "+",
        diffMode.addedNodes.size,
        "n / +",
        diffMode.addedEdges.size,
        "e"
      ] }),
      /* @__PURE__ */ jsxs5("span", { className: "diff-legend__item", children: [
        /* @__PURE__ */ jsx6("span", { className: "diff-legend__dot", style: { background: DIFF_REMOVED2 } }),
        "\u2212",
        diffMode.removedNodes.size,
        "n / \u2212",
        diffMode.removedEdges.size,
        "e"
      ] }),
      diffMode.snapshot && diffMode.snapshot.savedAt && /* @__PURE__ */ jsxs5("span", { className: "diff-legend__scope", title: "\u0421 \u0447\u0435\u043C \u0441\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0435\u043C", children: [
        "vs",
        " ",
        new Date(diffMode.snapshot.savedAt).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
      ] }),
      /* @__PURE__ */ jsx6(
        "button",
        {
          className: "diff-legend__close",
          onClick: () => store.setDiffMode(null),
          title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C diff",
          children: /* @__PURE__ */ jsx6(MIcon, { name: "close", size: "sm" })
        }
      )
    ] }),
    store.validationAvailable && /* @__PURE__ */ jsxs5(Fragment, { children: [
      /* @__PURE__ */ jsx6("div", { className: "menu__divider" }),
      /* @__PURE__ */ jsx6("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 }, children: "\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F" }),
      /* @__PURE__ */ jsxs5(
        "button",
        {
          className: "menu__item",
          onClick: () => {
            props.onOpenValidation();
            props.close();
          },
          children: [
            /* @__PURE__ */ jsx6("span", { className: "menu__icon", children: "\u{1F50D}" }),
            /* @__PURE__ */ jsx6("span", { className: "menu__text", children: "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432" })
          ]
        }
      )
    ] })
  ] });
}
var init_DataMenu = __esm({
  "src/web/components/popovers/DataMenu.tsx"() {
    "use strict";
    init_useGraphStore();
    init_MIcon();
    init_format();
    init_diff_colors();
  }
});

// src/web/components/layout/Toolbar.tsx
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function Toolbar(props) {
  const store = useGraphStore();
  const { back, forward, navStack } = useNavigation();
  const cycleActive = !!props.cycleHighlight;
  const analysisActive = cycleActive || store.isolatedOnly || store.nsMode || !!store.focusNode;
  const dataActive = !!store.diffMode;
  return /* @__PURE__ */ jsxs6("div", { className: "toolbar", children: [
    /* @__PURE__ */ jsxs6("div", { className: "toolbar__group", children: [
      /* @__PURE__ */ jsx7(
        "button",
        {
          className: "btn btn--icon",
          onClick: () => store.rfInstance?.fitView({ duration: 500 }),
          title: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C (F)",
          children: "\u26F6"
        }
      ),
      /* @__PURE__ */ jsx7("button", { className: "btn btn--icon", onClick: props.onRelayout, title: "\u041F\u0435\u0440\u0435\u0443\u043B\u043E\u0436\u0438\u0442\u044C", children: "\u27F3" }),
      /* @__PURE__ */ jsx7(
        "button",
        {
          className: "btn btn--icon",
          onClick: () => {
            if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0443 \u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F?"))
              return;
            store.setLayoutType("LR");
            store.setCompact(false);
            store.setSelectedNodeId(null);
            store.setFocusNode(null);
            store.setCycleHighlight(null);
            store.setPathResult(null);
            store.setPathSel([]);
            setTimeout(() => store.rfInstance?.fitView({ duration: 500 }), 200);
          },
          title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0443",
          children: "\u21BA"
        }
      ),
      /* @__PURE__ */ jsx7(
        "button",
        {
          className: "btn btn--icon",
          onClick: () => {
            if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B, \u0440\u0435\u0436\u0438\u043C\u044B \u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F?"))
              return;
            props.onResetAll();
          },
          title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0451",
          children: /* @__PURE__ */ jsx7(MIcon, { name: "restart_alt" })
        }
      ),
      /* @__PURE__ */ jsx7(
        "button",
        {
          className: "btn btn--icon",
          onClick: back,
          disabled: navStack.index <= 0,
          style: { opacity: navStack.index <= 0 ? 0.4 : 1 },
          title: "\u041D\u0430\u0437\u0430\u0434 (Alt+\u2190)",
          children: "\u2190"
        }
      ),
      /* @__PURE__ */ jsx7(
        "button",
        {
          className: "btn btn--icon",
          onClick: forward,
          disabled: navStack.index >= navStack.items.length - 1,
          style: { opacity: navStack.index >= navStack.items.length - 1 ? 0.4 : 1 },
          title: "\u0412\u043F\u0435\u0440\u0451\u0434 (Alt+\u2192)",
          children: "\u2192"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs6(
      "button",
      {
        className: "btn",
        onClick: () => store.setSearchOpen(true),
        title: "\u041F\u043E\u0438\u0441\u043A (Shift+Tab)",
        children: [
          /* @__PURE__ */ jsx7("span", { className: "btn__icon", children: "\u{1F50D}" }),
          "\u041F\u043E\u0438\u0441\u043A",
          /* @__PURE__ */ jsx7("kbd", { className: "btn-kbd", children: "\u21E7 Tab" })
        ]
      }
    ),
    /* @__PURE__ */ jsx7(
      Popover,
      {
        width: 320,
        trigger: (open) => /* @__PURE__ */ jsxs6("button", { className: "btn" + (open || props.activeFiltersCount > 0 ? " btn--active" : ""), children: [
          /* @__PURE__ */ jsx7(MIcon, { name: "tune" }),
          /* @__PURE__ */ jsx7("span", { style: { marginLeft: 6 }, children: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B" }),
          props.activeFiltersCount > 0 && /* @__PURE__ */ jsx7("span", { className: "btn__badge", children: props.activeFiltersCount })
        ] }),
        children: /* @__PURE__ */ jsx7(FilterMenu, { counts: props.counts })
      }
    ),
    /* @__PURE__ */ jsx7(
      Popover,
      {
        width: 280,
        trigger: (open) => /* @__PURE__ */ jsxs6("button", { className: "btn" + (open || analysisActive ? " btn--active" : ""), children: [
          /* @__PURE__ */ jsx7("span", { className: "btn__icon", children: "\u{1F4CA}" }),
          "\u0410\u043D\u0430\u043B\u0438\u0437"
        ] }),
        children: (close) => /* @__PURE__ */ jsx7(
          AnalysisMenu,
          {
            cycleHighlight: props.cycleHighlight,
            onFindCycles: props.onFindCycles,
            onStartPathFinder: props.onStartPathFinder,
            onOpenTopo: props.onOpenTopo,
            onOpenLearningPath: props.onOpenLearningPath,
            onOpenRules: props.onOpenRules,
            onOpenEntityHierarchy: props.onOpenEntityHierarchy,
            ruleViolationsCount: props.ruleViolationsCount,
            close
          }
        )
      }
    ),
    /* @__PURE__ */ jsx7(
      Popover,
      {
        width: 300,
        trigger: (open) => /* @__PURE__ */ jsxs6("button", { className: "btn" + (open ? " btn--active" : ""), children: [
          /* @__PURE__ */ jsx7("span", { className: "btn__icon", children: "\u{1F3A8}" }),
          "\u0412\u0438\u0434"
        ] }),
        children: (close) => /* @__PURE__ */ jsx7(ViewMenu, { close })
      }
    ),
    /* @__PURE__ */ jsx7(
      Popover,
      {
        width: 260,
        trigger: (open) => /* @__PURE__ */ jsxs6("button", { className: "btn" + (open || dataActive ? " btn--active" : ""), children: [
          /* @__PURE__ */ jsx7("span", { className: "btn__icon", children: "\u{1F4BE}" }),
          "\u0414\u0430\u043D\u043D\u044B\u0435"
        ] }),
        children: (close) => /* @__PURE__ */ jsx7(
          DataMenu,
          {
            close,
            onExportJSON: props.onExportJSON,
            onExportMarkdown: props.onExportMarkdown,
            onExportPNG: props.onExportPNG,
            onExportMermaid: props.onExportMermaid,
            onSaveSnapshot: props.onSaveSnapshot,
            onLoadSnapshot: props.onLoadSnapshot,
            onClearSnapshot: props.onClearSnapshot,
            onSnapshotUpload: props.onSnapshotUpload,
            onOpenValidation: props.onOpenValidation
          }
        )
      }
    ),
    /* @__PURE__ */ jsx7("div", { className: "toolbar__spacer" }),
    props.remoteInfo?.server && props.remoteInfo?.fetchedAt && /* @__PURE__ */ jsxs6(
      "div",
      {
        className: "toolbar__cache",
        title: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: " + props.remoteInfo.server + "\n\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D: " + new Date(props.remoteInfo.fetchedAt).toLocaleString("ru-RU"),
        onClick: props.onShowToast,
        children: [
          /* @__PURE__ */ jsx7(MIcon, { name: "database", size: "sm" }),
          /* @__PURE__ */ jsxs6("span", { children: [
            "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E ",
            relativeTime(props.remoteInfo.fetchedAt)
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx7(
      "button",
      {
        className: "btn btn--icon",
        onClick: () => store.setHotkeysOpen(true),
        title: "\u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 (?)",
        children: "\u2328\uFE0F"
      }
    ),
    /* @__PURE__ */ jsx7(
      "button",
      {
        className: "btn btn--icon",
        onClick: () => store.setHelpOpen(true),
        title: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F (F1)",
        children: "\u{1F4D6}"
      }
    ),
    /* @__PURE__ */ jsxs6("div", { className: "toolbar__stats", children: [
      props.visibleNodesCount,
      " / ",
      props.totalNodesCount,
      " \u0443\u0437\u043B\u043E\u0432 \xB7 ",
      props.visibleEdgesCount,
      " /",
      " ",
      props.totalEdgesCount,
      " \u0441\u0432\u044F\u0437\u0435\u0439"
    ] })
  ] });
}
var init_Toolbar = __esm({
  "src/web/components/layout/Toolbar.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_Popover();
    init_MIcon();
    init_FilterMenu();
    init_AnalysisMenu();
    init_ViewMenu();
    init_DataMenu();
    init_format();
  }
});

// src/web/components/layout/ActiveModesBar.tsx
import { useMemo as useMemo9 } from "react";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function ActiveModesBar({ ruleViolationsCount }) {
  const store = useGraphStore();
  const modes = useMemo9(() => {
    const result = [];
    const nodes = store.nodes;
    if (store.cycleHighlight) {
      result.push({
        iconName: "cycle",
        label: "\u0426\u0438\u043A\u043B\u044B (" + store.cycleHighlight.sccCount + ")",
        color: "orange",
        onClear: () => {
          store.setCycleHighlight(null);
          store.setSelectedNodeId(null);
          store.setSelectedEdgeId(null);
        }
      });
    }
    if (store.focusNode) {
      const fn = nodes.find((n) => n.id === store.focusNode);
      result.push({
        iconName: "my_location",
        label: "\u0424\u043E\u043A\u0443\u0441 N=" + store.focusDepth + (fn ? ": " + fn.data.domainId : ""),
        color: "cyan",
        onClear: () => {
          store.setFocusNode(null);
          store.setSelectedNodeId(null);
          store.setSelectedEdgeId(null);
        }
      });
    } else if (store.selectedNodeId) {
      const sn = nodes.find((n) => n.id === store.selectedNodeId);
      result.push({
        iconName: "visibility",
        label: sn ? sn.data.domainId : "\u0443\u0437\u0435\u043B",
        color: "accent",
        onClear: () => {
          store.setSelectedNodeId(null);
          store.setSelectedEdgeId(null);
        }
      });
    }
    if (store.pathResult || store.pathSel.length > 0) {
      result.push({
        iconName: "route",
        label: store.pathResult ? "\u041F\u0443\u0442\u044C \u043D\u0430\u0439\u0434\u0435\u043D" : "\u0412\u044B\u0431\u043E\u0440 \u043F\u0443\u0442\u0438 (" + store.pathSel.length + "/2)",
        color: "yellow",
        onClear: () => {
          store.setPathResult(null);
          store.setPathSel([]);
          store.setPathMode(null);
          store.setSelectedNodeId(null);
          store.setSelectedEdgeId(null);
        }
      });
    }
    if (store.hiddenNodeIds.size > 0) {
      result.push({
        iconName: "visibility_off",
        label: "\u0421\u043A\u0440\u044B\u0442\u043E: " + store.hiddenNodeIds.size,
        color: "gray",
        onClear: () => store.resetHiddenNodes()
      });
    }
    if (store.onlyInvalid) {
      result.push({
        iconName: "cancel",
        label: "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435",
        color: "red",
        onClear: () => store.setOnlyInvalid(false)
      });
    }
    if (store.bookmarksOnly) {
      result.push({
        iconName: "star",
        label: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
        color: "yellow",
        onClear: () => store.setBookmarksOnly(false)
      });
    }
    if (store.nsMode) {
      result.push({
        iconName: "category",
        label: "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
        color: "purple",
        onClear: () => store.setNsMode(false)
      });
    }
    if (store.diffMode) {
      const added = store.diffMode.addedEdges.size + store.diffMode.addedNodes.size;
      const removed = store.diffMode.removedEdges.size + store.diffMode.removedNodes.size;
      result.push({
        iconName: "swap_horiz",
        label: "Diff +" + added + "/\u2212" + removed,
        color: "blue",
        onClear: () => store.setDiffMode(null)
      });
    }
    if (ruleViolationsCount > 0 && store.rulesHighlighted) {
      result.push({
        iconName: "block",
        label: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F: " + ruleViolationsCount,
        color: "red",
        onClear: () => store.setRulesHighlighted(false)
      });
    }
    if (!store.tooltipsEnabled) {
      result.push({
        iconName: "block",
        label: "\u0422\u0443\u043B\u0442\u0438\u043F\u044B \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B",
        color: "gray",
        onClear: () => store.setTooltipsEnabled(true)
      });
    }
    if (store.topoLevelMap) {
      result.push({
        iconName: "inventory_2",
        label: "\u0423\u0440\u043E\u0432\u043D\u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438",
        color: "green",
        onClear: () => store.setTopoLevelMap(null)
      });
    }
    if (!store.sidePanelEnabled) {
      result.push({
        iconName: "block",
        label: "\u041F\u0430\u043D\u0435\u043B\u044C \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
        color: "gray",
        onClear: () => store.setSidePanelEnabled(true)
      });
    }
    if (!store.filters.linkage && !store.filters.fqid) {
      result.push({
        iconName: "power_off",
        label: "\u0421\u0432\u044F\u0437\u0438 \u0441\u043A\u0440\u044B\u0442\u044B",
        color: "gray",
        onClear: () => store.setFilters((f) => ({ ...f, linkage: true, fqid: true }))
      });
    }
    if (store.namespaceFilter && store.namespaceFilter.trim()) {
      result.push({
        iconName: "filter_alt",
        label: "\u0424\u0438\u043B\u044C\u0442\u0440: " + (store.namespaceFilter.length > 30 ? store.namespaceFilter.slice(0, 30) + "\u2026" : store.namespaceFilter),
        color: "cyan",
        onClear: () => store.setNamespaceFilter("")
      });
    }
    if (store.isolatedOnly) {
      result.push({
        iconName: "radio_button_unchecked",
        label: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435",
        color: "orange",
        onClear: () => store.setIsolatedOnly(false)
      });
    }
    if (store.pathMode) {
      result.push({
        iconName: "route",
        label: store.pathMode.anchorId ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0442\u043E\u0440\u043E\u0439 \u0443\u0437\u0435\u043B" : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0443\u0437\u0435\u043B",
        color: "yellow",
        onClear: () => {
          store.setPathMode(null);
          store.setPathSel([]);
        }
      });
    }
    if (store.tagFilters.size > 0) {
      result.push({
        iconName: "label",
        label: "\u0422\u0435\u0433\u0438: " + Array.from(store.tagFilters).join(", "),
        color: "purple",
        onClear: () => store.setTagFilters(/* @__PURE__ */ new Set())
      });
    }
    return result;
  }, [
    store.cycleHighlight,
    store.focusNode,
    store.focusDepth,
    store.selectedNodeId,
    store.pathResult,
    store.pathSel,
    store.pathMode,
    store.hiddenNodeIds,
    store.onlyInvalid,
    store.bookmarksOnly,
    store.isolatedOnly,
    store.nsMode,
    store.diffMode,
    store.rulesHighlighted,
    store.tooltipsEnabled,
    store.sidePanelEnabled,
    store.namespaceFilter,
    store.filters.linkage,
    store.filters.fqid,
    store.topoLevelMap,
    store.tagFilters,
    ruleViolationsCount,
    store.nodes
  ]);
  if (modes.length === 0)
    return null;
  return /* @__PURE__ */ jsx8("div", { className: "active-modes", children: modes.map((m, i) => /* @__PURE__ */ jsxs7("div", { className: "active-mode active-mode--" + (m.color || "accent"), children: [
    /* @__PURE__ */ jsx8("span", { className: "active-mode__icon", children: m.iconName ? /* @__PURE__ */ jsx8(MIcon, { name: m.iconName, size: "sm" }) : m.icon }),
    /* @__PURE__ */ jsx8("span", { className: "active-mode__label", children: m.label }),
    /* @__PURE__ */ jsx8("button", { className: "active-mode__close", onClick: m.onClear, title: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C", children: "\u2715" })
  ] }, i)) });
}
var init_ActiveModesBar = __esm({
  "src/web/components/layout/ActiveModesBar.tsx"() {
    "use strict";
    init_useGraphStore();
    init_MIcon();
  }
});

// src/web/hooks/useSidebarStats.ts
import { useMemo as useMemo10 } from "react";
function useSidebarStats(healthMap) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const topConnected = useMemo10(() => {
    const deg = /* @__PURE__ */ new Map();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      if (deg.has(e.source))
        deg.set(e.source, deg.get(e.source) + 1);
      if (deg.has(e.target))
        deg.set(e.target, deg.get(e.target) + 1);
    });
    return nodes.map((n) => ({ node: n, degree: deg.get(n.id) || 0 })).filter((x) => x.degree > 0).sort((a, b) => b.degree - a.degree).slice(0, 5);
  }, [nodes, edges]);
  const worstHealth = useMemo10(() => {
    return nodes.filter((n) => n.data.nodeType === "domain").map((n) => {
      const h = healthMap.get(n.id);
      const score = h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
      return { node: n, health: score };
    }).sort((a, b) => a.health - b.health).slice(0, 5);
  }, [nodes, healthMap]);
  const namespaces = useMemo10(() => {
    const map = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain")
        return;
      const ns = n.data.domainId.split(".").slice(0, 2).join(".");
      map.set(ns, (map.get(ns) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);
  const tagCloud = useMemo10(() => {
    const m = /* @__PURE__ */ new Map();
    nodes.forEach((n) => {
      (n.data.tags || []).forEach(
        (t) => m.set(String(t), (m.get(String(t)) || 0) + 1)
      );
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [nodes]);
  const isolatedCount = useMemo10(() => {
    const conn = /* @__PURE__ */ new Set();
    edges.forEach((e) => {
      conn.add(e.source);
      conn.add(e.target);
    });
    return nodes.filter((n) => n.data.nodeType === "domain" && !conn.has(n.id)).length;
  }, [nodes, edges]);
  const topMissingRefs = useMemo10(() => {
    const result = [];
    const domainIds = /* @__PURE__ */ new Set();
    nodes.forEach((n) => {
      if (n.data.nodeType === "domain")
        domainIds.add(n.data.domainId.toLowerCase());
    });
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain")
        return;
      const refs = n.data.fqidRefs || [];
      const missing = refs.filter(
        (r) => !domainIds.has((r.targetDomainId || "").toLowerCase())
      );
      if (missing.length === 0)
        return;
      const targets = /* @__PURE__ */ new Set();
      missing.forEach((r) => targets.add(r.targetDomainId));
      result.push({
        node: n,
        count: missing.length,
        uniqueTargets: Array.from(targets)
      });
    });
    return result.sort((a, b) => b.count - a.count).slice(0, 10);
  }, [nodes]);
  const counts = useMemo10(
    () => ({
      domain: nodes.filter((n) => n.data.nodeType === "domain").length,
      missing: nodes.filter((n) => n.data.nodeType === "missing").length,
      broken: nodes.filter((n) => n.data.nodeType === "broken").length,
      linkage: edges.filter((e) => e.data && e.data.kind === "linkage").length,
      fqid: edges.filter((e) => e.data && e.data.kind === "fqid").length
    }),
    [nodes, edges]
  );
  return {
    topConnected,
    worstHealth,
    namespaces,
    tagCloud,
    isolatedCount,
    topMissingRefs,
    counts
  };
}
var init_useSidebarStats = __esm({
  "src/web/hooks/useSidebarStats.ts"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/components/layout/Section.tsx
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function Section({ id, title, icon, badge, children }) {
  const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
  const toggle = useGraphStore((s) => s.toggleCollapsedSection);
  return /* @__PURE__ */ jsxs8("div", { className: "section" + (collapsed ? " section--collapsed" : ""), children: [
    /* @__PURE__ */ jsxs8(
      "button",
      {
        className: "section__header",
        onClick: () => toggle(id, collapsed),
        children: [
          /* @__PURE__ */ jsx9(MIcon, { name: collapsed ? "chevron_right" : "expand_more", size: "sm" }),
          /* @__PURE__ */ jsx9("span", { className: "section__icon", children: /* @__PURE__ */ jsx9(MIcon, { name: icon, size: "sm" }) }),
          /* @__PURE__ */ jsx9("span", { className: "section__title", children: title }),
          badge != null && badge > 0 && /* @__PURE__ */ jsx9("span", { className: "section__badge", children: badge })
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsx9("div", { className: "section__body", children })
  ] });
}
var init_Section = __esm({
  "src/web/components/layout/Section.tsx"() {
    "use strict";
    init_useGraphStore();
    init_MIcon();
  }
});

// src/web/components/layout/sections/OverviewSection.tsx
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
function OverviewSection(props) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  return /* @__PURE__ */ jsxs9(Section, { id: "overview", title: "\u041E\u0431\u0437\u043E\u0440", icon: "insights", children: [
    /* @__PURE__ */ jsxs9("div", { className: "stats-grid", children: [
      /* @__PURE__ */ jsxs9("div", { className: "stat-card stat-card--accent stat-card--clickable", onClick: props.onFitView, children: [
        /* @__PURE__ */ jsx10("div", { className: "stat-card__value", children: store.nodes.length }),
        /* @__PURE__ */ jsx10("div", { className: "stat-card__label", children: "\u0412\u0441\u0435\u0433\u043E \u0443\u0437\u043B\u043E\u0432" })
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "stat-card stat-card--success stat-card--clickable", onClick: props.onFitView, children: [
        /* @__PURE__ */ jsx10("div", { className: "stat-card__value", children: store.edges.length }),
        /* @__PURE__ */ jsx10("div", { className: "stat-card__label", children: "\u0421\u0432\u044F\u0437\u0435\u0439" })
      ] }),
      /* @__PURE__ */ jsxs9(
        "div",
        {
          className: "stat-card stat-card--warning stat-card--clickable" + (props.counts.missing === 0 ? " stat-card--empty" : ""),
          onClick: () => props.counts.missing > 0 && props.onFilterMissing(),
          children: [
            /* @__PURE__ */ jsx10("div", { className: "stat-card__value", children: props.counts.missing }),
            /* @__PURE__ */ jsx10("div", { className: "stat-card__label", children: "Missing" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs9(
        "div",
        {
          className: "stat-card stat-card--danger stat-card--clickable" + (props.counts.broken === 0 ? " stat-card--empty" : ""),
          onClick: () => props.counts.broken > 0 && props.onFilterBroken(),
          children: [
            /* @__PURE__ */ jsx10("div", { className: "stat-card__value", children: props.counts.broken }),
            /* @__PURE__ */ jsx10("div", { className: "stat-card__label", children: "Broken" })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs9("div", { className: "quick-actions", children: [
      /* @__PURE__ */ jsxs9(
        "button",
        {
          className: "quick-action",
          onClick: () => store.setIsolatedOnly(true),
          disabled: props.isolatedCount === 0,
          children: [
            /* @__PURE__ */ jsx10(MIcon, { name: "radio_button_unchecked", size: "sm" }),
            /* @__PURE__ */ jsx10("span", { children: "\u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435" }),
            /* @__PURE__ */ jsx10("span", { className: "quick-action__count", children: props.isolatedCount })
          ]
        }
      ),
      /* @__PURE__ */ jsxs9(
        "button",
        {
          className: "quick-action",
          onClick: () => store.setOnlyInvalid(true),
          disabled: props.problemDomainsCount === 0,
          children: [
            /* @__PURE__ */ jsx10(MIcon, { name: "cancel", size: "sm" }),
            /* @__PURE__ */ jsx10("span", { children: "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435" }),
            /* @__PURE__ */ jsx10("span", { className: "quick-action__count", children: props.problemDomainsCount })
          ]
        }
      ),
      /* @__PURE__ */ jsxs9(
        "button",
        {
          className: "quick-action",
          onClick: () => {
            if (props.cyclesCount > 0) {
              document.dispatchEvent(new CustomEvent("dg:find-cycles"));
            }
          },
          disabled: props.cyclesCount === 0,
          children: [
            /* @__PURE__ */ jsx10(MIcon, { name: "cycle", size: "sm" }),
            /* @__PURE__ */ jsx10("span", { children: "\u0426\u0438\u043A\u043B\u044B" }),
            /* @__PURE__ */ jsx10("span", { className: "quick-action__count", children: props.cyclesCount })
          ]
        }
      ),
      store.bookmarks.size > 0 && /* @__PURE__ */ jsxs9("button", { className: "quick-action", onClick: () => store.setBookmarksOnly(true), children: [
        /* @__PURE__ */ jsx10(MIcon, { name: "star", size: "sm", fill: true }),
        /* @__PURE__ */ jsx10("span", { children: "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435" }),
        /* @__PURE__ */ jsx10("span", { className: "quick-action__count", children: store.bookmarks.size })
      ] })
    ] })
  ] });
}
var init_OverviewSection = __esm({
  "src/web/components/layout/sections/OverviewSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_MIcon();
    init_Section();
  }
});

// src/web/lib/activity.ts
function buildActivityBuckets(nodes, days) {
  const now = /* @__PURE__ */ new Date();
  now.setHours(23, 59, 59, 999);
  const startMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1e3;
  const arr = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1e3);
    arr.push({ date: d, day: d.getDate(), month: d.getMonth(), count: 0 });
  }
  nodes.forEach((n) => {
    if (!n.data || n.data.nodeType !== "domain")
      return;
    if (!n.data.updatedAt)
      return;
    let t;
    try {
      t = new Date(n.data.updatedAt).getTime();
    } catch {
      return;
    }
    if (isNaN(t) || t < startMs)
      return;
    const idx = Math.floor((t - startMs) / (24 * 60 * 60 * 1e3));
    if (idx >= 0 && idx < days)
      arr[idx].count++;
  });
  return arr;
}
var init_activity = __esm({
  "src/web/lib/activity.ts"() {
    "use strict";
  }
});

// src/web/components/layout/ActivityChart.tsx
import { useMemo as useMemo11 } from "react";
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
function ActivityChart({ nodes, days }) {
  const buckets = useMemo11(() => buildActivityBuckets(nodes, days), [nodes, days]);
  const max = useMemo11(() => {
    const m = Math.max(...buckets.map((b) => b.count));
    return m === 0 ? 1 : m;
  }, [buckets]);
  return /* @__PURE__ */ jsxs10("div", { className: "activity-chart", children: [
    /* @__PURE__ */ jsx11("div", { className: "activity-chart__bars", children: buckets.map((b, i) => {
      const height = b.count / max * 100;
      const isToday = i === buckets.length - 1;
      return /* @__PURE__ */ jsx11(
        "div",
        {
          className: "activity-chart__bar" + (isToday ? " activity-chart__bar--today" : ""),
          style: { height: Math.max(height, b.count > 0 ? 8 : 0) + "%" },
          title: b.date.toLocaleDateString("ru-RU") + ": " + b.count + " \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439"
        },
        i
      );
    }) }),
    /* @__PURE__ */ jsxs10("div", { className: "activity-chart__legend", children: [
      /* @__PURE__ */ jsxs10("span", { children: [
        days,
        " \u0434\u043D\u0435\u0439 \u043D\u0430\u0437\u0430\u0434"
      ] }),
      /* @__PURE__ */ jsx11("span", { style: { color: "var(--text-200)" }, children: "\u0441\u0435\u0433\u043E\u0434\u043D\u044F" }),
      /* @__PURE__ */ jsxs10("span", { children: [
        "\u043C\u0430\u043A\u0441: ",
        max
      ] })
    ] })
  ] });
}
var init_ActivityChart = __esm({
  "src/web/components/layout/ActivityChart.tsx"() {
    "use strict";
    init_activity();
  }
});

// src/web/components/layout/sections/ActivitySection.tsx
import { jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
function ActivitySection() {
  const nodes = useGraphStore((s) => s.nodes);
  const period = useGraphStore((s) => s.activityPeriod);
  const setPeriod = useGraphStore((s) => s.setActivityPeriod);
  return /* @__PURE__ */ jsxs11(Section, { id: "activity", title: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C", icon: "trending_up", children: [
    /* @__PURE__ */ jsx12("div", { className: "activity-periods", children: [7, 30, 90].map((d) => /* @__PURE__ */ jsxs11(
      "button",
      {
        className: "period-btn" + (period === d ? " period-btn--active" : ""),
        onClick: () => setPeriod(d),
        children: [
          d,
          "\u0434"
        ]
      },
      d
    )) }),
    /* @__PURE__ */ jsx12(ActivityChart, { nodes, days: period })
  ] });
}
var init_ActivitySection = __esm({
  "src/web/components/layout/sections/ActivitySection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_Section();
    init_ActivityChart();
  }
});

// src/web/components/layout/sections/ProblemsSection.tsx
import { jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
function ProblemsSection(props) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  return /* @__PURE__ */ jsxs12(Section, { id: "problems", title: "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u044B", icon: "warning", badge: props.totalProblems, children: [
    props.problemDomains.length > 0 && /* @__PURE__ */ jsxs12("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs12("div", { className: "problems-group__title", children: [
        /* @__PURE__ */ jsx13(MIcon, { name: "cancel", size: "sm" }),
        " \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 (",
        props.problemDomains.length,
        ")"
      ] }),
      props.problemDomains.map((item) => /* @__PURE__ */ jsxs12(
        "button",
        {
          className: "rank-item",
          onClick: () => goto(item.node.data.domainId),
          children: [
            /* @__PURE__ */ jsx13("span", { className: "rank-item__label", children: item.node.data.domainId }),
            /* @__PURE__ */ jsx13("span", { className: "rank-item__value", style: { color: "var(--danger)" }, children: item.count })
          ]
        },
        item.node.id
      ))
    ] }),
    props.brokenRefsDomains.length > 0 && /* @__PURE__ */ jsxs12("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs12("div", { className: "problems-group__title", children: [
        /* @__PURE__ */ jsx13(MIcon, { name: "link_off", size: "sm" }),
        " \u0411\u0438\u0442\u044B\u0435 FQID (",
        props.brokenRefsDomains.length,
        ")"
      ] }),
      props.brokenRefsDomains.map((item) => /* @__PURE__ */ jsxs12(
        "button",
        {
          className: "rank-item",
          onClick: () => goto(item.node.data.domainId),
          children: [
            /* @__PURE__ */ jsx13("span", { className: "rank-item__label", children: item.node.data.domainId }),
            /* @__PURE__ */ jsx13("span", { className: "rank-item__value", style: { color: "var(--warning)" }, children: item.count })
          ]
        },
        item.node.id
      ))
    ] }),
    props.isolatedCount > 0 && /* @__PURE__ */ jsxs12("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs12("div", { className: "problems-group__title", children: [
        /* @__PURE__ */ jsx13(MIcon, { name: "radio_button_unchecked", size: "sm" }),
        " \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 (",
        props.isolatedCount,
        ")"
      ] }),
      /* @__PURE__ */ jsx13(
        "button",
        {
          className: "problems-group__action",
          onClick: () => store.setIsolatedOnly(true),
          children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C"
        }
      )
    ] }),
    props.cyclesCount > 0 && /* @__PURE__ */ jsxs12("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs12("div", { className: "problems-group__title", children: [
        /* @__PURE__ */ jsx13(MIcon, { name: "cycle", size: "sm" }),
        " \u0426\u0438\u043A\u043B\u044B (",
        props.cyclesCount,
        ")"
      ] }),
      /* @__PURE__ */ jsx13(
        "button",
        {
          className: "problems-group__action",
          onClick: () => document.dispatchEvent(new CustomEvent("dg:find-cycles")),
          children: "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u0438\u0442\u044C"
        }
      )
    ] })
  ] });
}
var init_ProblemsSection = __esm({
  "src/web/components/layout/sections/ProblemsSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_MIcon();
    init_Section();
  }
});

// src/web/components/layout/sections/NewsSection.tsx
import { jsx as jsx14, jsxs as jsxs13 } from "react/jsx-runtime";
function NewsSection({ cacheDiff }) {
  const { goto } = useNavigation();
  if (!cacheDiff)
    return null;
  const newsCount = cacheDiff.added.length + cacheDiff.changed.length + cacheDiff.removed.length;
  return /* @__PURE__ */ jsxs13(Section, { id: "news", title: "\u0427\u0442\u043E \u043D\u043E\u0432\u043E\u0433\u043E", icon: "new_releases", badge: newsCount, children: [
    newsCount === 0 && /* @__PURE__ */ jsxs13("div", { className: "news-empty", children: [
      /* @__PURE__ */ jsx14(MIcon, { name: "history_toggle_off", size: "sm" }),
      /* @__PURE__ */ jsxs13("div", { children: [
        /* @__PURE__ */ jsx14("div", { children: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442" }),
        cacheDiff.previousFetchedAt && /* @__PURE__ */ jsxs13("div", { style: { fontSize: 11, color: "var(--text-500)", marginTop: 4 }, children: [
          "\u0441",
          " ",
          new Date(cacheDiff.previousFetchedAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          })
        ] })
      ] })
    ] }),
    newsCount > 0 && cacheDiff.previousFetchedAt && /* @__PURE__ */ jsxs13("div", { className: "news-since", children: [
      "\u0441",
      " ",
      new Date(cacheDiff.previousFetchedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })
    ] }),
    cacheDiff.added.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs13("div", { className: "problems-group__title", style: { color: "var(--success)" }, children: [
        /* @__PURE__ */ jsx14(MIcon, { name: "add_circle", size: "sm" }),
        " \u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E (",
        cacheDiff.added.length,
        ")"
      ] }),
      cacheDiff.added.slice(0, 5).map((d) => /* @__PURE__ */ jsxs13("button", { className: "rank-item", onClick: () => goto(d.sourceId), children: [
        /* @__PURE__ */ jsx14("span", { className: "rank-item__label", children: d.sourceId }),
        d.version && /* @__PURE__ */ jsx14("span", { className: "rank-item__value", children: d.version })
      ] }, d.sourceId)),
      cacheDiff.added.length > 5 && /* @__PURE__ */ jsxs13("div", { className: "news-more", children: [
        "...\u0438 \u0435\u0449\u0451 ",
        cacheDiff.added.length - 5
      ] })
    ] }),
    cacheDiff.changed.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs13("div", { className: "problems-group__title", style: { color: "var(--accent-hover)" }, children: [
        /* @__PURE__ */ jsx14(MIcon, { name: "update", size: "sm" }),
        " \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E (",
        cacheDiff.changed.length,
        ")"
      ] }),
      cacheDiff.changed.slice(0, 5).map((d) => /* @__PURE__ */ jsxs13("button", { className: "rank-item", onClick: () => goto(d.sourceId), children: [
        /* @__PURE__ */ jsx14("span", { className: "rank-item__label", children: d.sourceId }),
        d.version && /* @__PURE__ */ jsx14(
          "span",
          {
            className: "rank-item__value",
            style: { fontSize: 10, fontFamily: "monospace" },
            children: d.oldVersion && d.newVersion ? d.oldVersion + " \u2192 " + d.newVersion : d.version
          }
        )
      ] }, d.sourceId)),
      cacheDiff.changed.length > 5 && /* @__PURE__ */ jsxs13("div", { className: "news-more", children: [
        "...\u0438 \u0435\u0449\u0451 ",
        cacheDiff.changed.length - 5
      ] })
    ] }),
    cacheDiff.removed.length > 0 && /* @__PURE__ */ jsxs13("div", { className: "problems-group", children: [
      /* @__PURE__ */ jsxs13("div", { className: "problems-group__title", style: { color: "var(--danger)" }, children: [
        /* @__PURE__ */ jsx14(MIcon, { name: "remove_circle", size: "sm" }),
        " \u0423\u0434\u0430\u043B\u0435\u043D\u043E (",
        cacheDiff.removed.length,
        ")"
      ] }),
      cacheDiff.removed.slice(0, 5).map((d) => /* @__PURE__ */ jsx14("div", { className: "rank-item", style: { cursor: "default" }, children: /* @__PURE__ */ jsx14(
        "span",
        {
          className: "rank-item__label",
          style: { textDecoration: "line-through", opacity: 0.6 },
          children: d.sourceId
        }
      ) }, d.sourceId)),
      cacheDiff.removed.length > 5 && /* @__PURE__ */ jsxs13("div", { className: "news-more", children: [
        "...\u0438 \u0435\u0449\u0451 ",
        cacheDiff.removed.length - 5
      ] })
    ] })
  ] });
}
var init_NewsSection = __esm({
  "src/web/components/layout/sections/NewsSection.tsx"() {
    "use strict";
    init_useNavigation();
    init_MIcon();
    init_Section();
  }
});

// src/web/components/layout/sections/TopConnectedSection.tsx
import { jsx as jsx15, jsxs as jsxs14 } from "react/jsx-runtime";
function TopConnectedSection({ items }) {
  const { goto } = useNavigation();
  if (items.length === 0)
    return null;
  return /* @__PURE__ */ jsx15(Section, { id: "top", title: "\u0422\u043E\u043F \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C", icon: "bar_chart", children: /* @__PURE__ */ jsx15("div", { className: "rank-list", children: items.map((item, i) => /* @__PURE__ */ jsxs14(
    "button",
    {
      className: "rank-item",
      onClick: () => goto(item.node.data.domainId),
      children: [
        /* @__PURE__ */ jsx15("span", { className: "rank-item__num", children: i + 1 }),
        /* @__PURE__ */ jsx15("span", { className: "rank-item__label", children: item.node.data.domainId }),
        /* @__PURE__ */ jsx15("span", { className: "rank-item__value", children: item.degree })
      ]
    },
    item.node.id
  )) }) });
}
var init_TopConnectedSection = __esm({
  "src/web/components/layout/sections/TopConnectedSection.tsx"() {
    "use strict";
    init_useNavigation();
    init_Section();
  }
});

// src/web/components/layout/sections/WorstHealthSection.tsx
import { jsx as jsx16, jsxs as jsxs15 } from "react/jsx-runtime";
function WorstHealthSection({ items }) {
  const { goto } = useNavigation();
  const compact = useGraphStore((s) => s.sidebarCompact);
  if (items.length === 0)
    return null;
  return /* @__PURE__ */ jsx16(Section, { id: "worst", title: "\u0421\u0442\u0435\u043D\u0430 \u043F\u043E\u0437\u043E\u0440\u0430", icon: "trending_down", children: /* @__PURE__ */ jsx16("div", { className: "rank-list", children: items.slice(0, compact ? 5 : 20).map((item, i) => {
    const hc = item.health >= 80 ? "good" : item.health >= 50 ? "mid" : "bad";
    return /* @__PURE__ */ jsxs15(
      "button",
      {
        className: "rank-item",
        onClick: () => goto(item.node.data.domainId),
        children: [
          /* @__PURE__ */ jsx16("span", { className: "rank-item__num", children: i + 1 }),
          /* @__PURE__ */ jsx16("span", { className: "rank-item__label", children: item.node.data.domainId }),
          /* @__PURE__ */ jsx16(
            "span",
            {
              className: "rf-node__health rf-node__health--" + hc,
              style: { fontSize: 10, padding: "1px 6px" },
              children: item.health
            }
          )
        ]
      },
      item.node.id
    );
  }) }) });
}
var init_WorstHealthSection = __esm({
  "src/web/components/layout/sections/WorstHealthSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_Section();
  }
});

// src/web/components/layout/sections/MissingRefsSection.tsx
import { jsx as jsx17, jsxs as jsxs16 } from "react/jsx-runtime";
function MissingRefsSection({ items }) {
  const { goto } = useNavigation();
  if (items.length === 0)
    return null;
  return /* @__PURE__ */ jsx17(Section, { id: "missing-refs", title: "\u0411\u0438\u0442\u044B\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438", icon: "link_off", badge: items.length, children: /* @__PURE__ */ jsx17("div", { className: "rank-list", children: items.map((item, i) => /* @__PURE__ */ jsxs16("div", { className: "missing-ref-item", children: [
    /* @__PURE__ */ jsxs16(
      "div",
      {
        className: "rank-item",
        onClick: () => goto(item.node.data.domainId),
        style: { cursor: "pointer", padding: "4px 6px" },
        children: [
          /* @__PURE__ */ jsx17("span", { className: "rank-item__num", children: i + 1 }),
          /* @__PURE__ */ jsx17("span", { className: "rank-item__label", children: item.node.data.domainId }),
          /* @__PURE__ */ jsx17("span", { className: "rank-item__value", style: { color: "var(--warning)" }, children: item.count })
        ]
      }
    ),
    item.uniqueTargets.length > 0 && /* @__PURE__ */ jsxs16("div", { className: "missing-ref-targets", children: [
      item.uniqueTargets.slice(0, 3).map((t, ti) => /* @__PURE__ */ jsxs16("div", { className: "missing-ref-target", children: [
        /* @__PURE__ */ jsx17(MIcon, { name: "warning", size: "sm" }),
        /* @__PURE__ */ jsx17("span", { children: t })
      ] }, ti)),
      item.uniqueTargets.length > 3 && /* @__PURE__ */ jsxs16("div", { className: "missing-ref-target missing-ref-target--more", children: [
        "...\u0438 \u0435\u0449\u0451 ",
        item.uniqueTargets.length - 3
      ] })
    ] })
  ] }, item.node.id)) }) });
}
var init_MissingRefsSection = __esm({
  "src/web/components/layout/sections/MissingRefsSection.tsx"() {
    "use strict";
    init_useNavigation();
    init_MIcon();
    init_Section();
  }
});

// src/web/components/layout/sections/NamespacesSection.tsx
import { jsx as jsx18, jsxs as jsxs17 } from "react/jsx-runtime";
function NamespacesSection({ items }) {
  const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
  if (items.length === 0)
    return null;
  const max = items[0][1];
  return /* @__PURE__ */ jsx18(Section, { id: "namespaces", title: "\u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u044B", icon: "category", children: /* @__PURE__ */ jsx18("div", { className: "bar-list", children: items.map((entry) => {
    const [ns, count] = entry;
    return /* @__PURE__ */ jsxs17(
      "button",
      {
        className: "bar-item",
        onClick: () => setNamespaceFilter(ns),
        children: [
          /* @__PURE__ */ jsx18("span", { className: "bar-item__label", children: ns }),
          /* @__PURE__ */ jsx18("span", { className: "bar-item__value", children: count }),
          /* @__PURE__ */ jsx18("span", { className: "bar-item__track", children: /* @__PURE__ */ jsx18(
            "span",
            {
              className: "bar-item__fill",
              style: { width: count / max * 100 + "%" }
            }
          ) })
        ]
      },
      ns
    );
  }) }) });
}
var init_NamespacesSection = __esm({
  "src/web/components/layout/sections/NamespacesSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_Section();
  }
});

// src/web/components/layout/sections/TagsSection.tsx
import { jsx as jsx19, jsxs as jsxs18 } from "react/jsx-runtime";
function TagsSection({ items }) {
  const store = useGraphStore();
  if (items.length === 0)
    return null;
  return /* @__PURE__ */ jsx19(
    Section,
    {
      id: "tags",
      title: "\u0422\u0435\u0433\u0438",
      icon: "label",
      badge: store.tagFilters.size > 0 ? store.tagFilters.size : null,
      children: /* @__PURE__ */ jsx19("div", { className: "tag-cloud", children: items.map((entry) => {
        const [tag, count] = entry;
        const active = store.tagFilters.has(tag);
        return /* @__PURE__ */ jsxs18(
          "button",
          {
            className: "tag" + (active ? " tag--active" : ""),
            onClick: () => store.toggleTagFilter(tag),
            children: [
              tag,
              /* @__PURE__ */ jsx19("span", { className: "tag__count", children: count })
            ]
          },
          tag
        );
      }) })
    }
  );
}
var init_TagsSection = __esm({
  "src/web/components/layout/sections/TagsSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_Section();
  }
});

// src/web/components/layout/sections/BookmarksSection.tsx
import { jsx as jsx20, jsxs as jsxs19 } from "react/jsx-runtime";
function BookmarksSection() {
  const store = useGraphStore();
  const { goto } = useNavigation();
  if (store.bookmarks.size === 0)
    return null;
  return /* @__PURE__ */ jsx20(Section, { id: "bookmarks", title: "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435", icon: "star", badge: store.bookmarks.size, children: /* @__PURE__ */ jsx20("div", { className: "rank-list", children: Array.from(store.bookmarks).slice(0, store.sidebarCompact ? 5 : 15).map((id) => {
    const n = store.nodes.find((x) => x.id === id);
    if (!n)
      return null;
    return /* @__PURE__ */ jsxs19(
      "div",
      {
        className: "rank-item",
        style: { cursor: "pointer" },
        onClick: () => goto(n.data.domainId),
        children: [
          /* @__PURE__ */ jsx20("span", { className: "rank-item__num", children: /* @__PURE__ */ jsx20(MIcon, { name: "star", size: "sm", fill: true }) }),
          /* @__PURE__ */ jsx20("span", { className: "rank-item__label", children: n.data.domainId }),
          /* @__PURE__ */ jsx20(
            "button",
            {
              className: "rank-item__remove",
              onClick: (ev) => {
                ev.stopPropagation();
                store.toggleBookmark(id);
              },
              title: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E",
              children: /* @__PURE__ */ jsx20(MIcon, { name: "close", size: "sm" })
            }
          )
        ]
      },
      id
    );
  }) }) });
}
var init_BookmarksSection = __esm({
  "src/web/components/layout/sections/BookmarksSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_MIcon();
    init_Section();
  }
});

// src/web/components/layout/sections/LegendSection.tsx
import { jsx as jsx21, jsxs as jsxs20 } from "react/jsx-runtime";
function LegendSection() {
  return /* @__PURE__ */ jsx21(Section, { id: "legend", title: "\u041B\u0435\u0433\u0435\u043D\u0434\u0430", icon: "palette", children: /* @__PURE__ */ jsxs20("div", { className: "legend-list", children: [
    /* @__PURE__ */ jsxs20("div", { className: "legend-row", children: [
      /* @__PURE__ */ jsx21("span", { className: "legend-dot", style: { background: "var(--success)" } }),
      " Domain"
    ] }),
    /* @__PURE__ */ jsxs20("div", { className: "legend-row", children: [
      /* @__PURE__ */ jsx21("span", { className: "legend-dot", style: { background: "var(--warning)" } }),
      " Missing"
    ] }),
    /* @__PURE__ */ jsxs20("div", { className: "legend-row", children: [
      /* @__PURE__ */ jsx21("span", { className: "legend-dot", style: { background: "var(--danger)" } }),
      " Broken"
    ] }),
    /* @__PURE__ */ jsxs20("div", { className: "legend-row", children: [
      /* @__PURE__ */ jsx21("span", { className: "legend-line", style: { background: LINKAGE_COLOR2 } }),
      " Linkage"
    ] }),
    /* @__PURE__ */ jsxs20("div", { className: "legend-row", children: [
      /* @__PURE__ */ jsx21("span", { className: "legend-line", style: { background: FQID_COLOR2 } }),
      " FQID"
    ] })
  ] }) });
}
var init_LegendSection = __esm({
  "src/web/components/layout/sections/LegendSection.tsx"() {
    "use strict";
    init_Section();
    init_graph_transforms();
  }
});

// src/web/components/layout/sections/index.ts
var init_sections = __esm({
  "src/web/components/layout/sections/index.ts"() {
    "use strict";
    init_OverviewSection();
    init_ActivitySection();
    init_ProblemsSection();
    init_NewsSection();
    init_TopConnectedSection();
    init_WorstHealthSection();
    init_MissingRefsSection();
    init_NamespacesSection();
    init_TagsSection();
    init_BookmarksSection();
    init_LegendSection();
  }
});

// src/web/components/layout/Sidebar.tsx
import { useMemo as useMemo12 } from "react";
import { jsx as jsx22, jsxs as jsxs21 } from "react/jsx-runtime";
function Sidebar(props) {
  const store = useGraphStore();
  const stats = useSidebarStats(props.healthMap);
  const problemDomains = useMemo12(() => {
    if (!store.validationResults)
      return [];
    const result = [];
    store.nodes.forEach((n) => {
      const v = store.validationResults.get(n.data.domainId);
      if (v && v.status === "invalid") {
        result.push({ node: n, count: (v.diagnostics || []).length });
      }
    });
    return result.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [store.nodes, store.validationResults]);
  const brokenRefsDomains = useMemo12(() => {
    const result = [];
    const domainIds = /* @__PURE__ */ new Set();
    store.nodes.forEach((n) => {
      if (n.data.nodeType === "domain")
        domainIds.add(n.data.domainId.toLowerCase());
    });
    store.nodes.forEach((n) => {
      if (n.data.nodeType !== "domain")
        return;
      const refs = n.data.fqidRefs || [];
      const broken = refs.filter(
        (r) => !domainIds.has((r.targetDomainId || "").toLowerCase())
      );
      if (broken.length > 0)
        result.push({ node: n, count: broken.length });
    });
    return result.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [store.nodes]);
  const hasNews = !!props.cacheDiff;
  const hasProblems = problemDomains.length > 0 || brokenRefsDomains.length > 0 || stats.isolatedCount > 0 || stats.counts.broken > 0 || props.cyclesCount > 0;
  const totalProblems = stats.counts.missing + stats.counts.broken + problemDomains.length + props.cyclesCount;
  if (store.sidebarCollapsed) {
    return /* @__PURE__ */ jsx22("aside", { className: "sidebar sidebar--collapsed", children: /* @__PURE__ */ jsx22(
      "button",
      {
        className: "sidebar__expand",
        onClick: () => store.setSidebarCollapsed(false),
        title: "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C",
        children: /* @__PURE__ */ jsx22(MIcon, { name: "chevron_right" })
      }
    ) });
  }
  return /* @__PURE__ */ jsxs21("aside", { className: "sidebar" + (store.sidebarCompact ? " sidebar--compact" : ""), children: [
    /* @__PURE__ */ jsxs21("div", { className: "sidebar__header", children: [
      /* @__PURE__ */ jsx22("div", { className: "sidebar__logo", children: /* @__PURE__ */ jsx22(MIcon, { name: "hub" }) }),
      /* @__PURE__ */ jsxs21("div", { style: { flex: 1, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx22("div", { className: "sidebar__title", children: "Domain Graph" }),
        /* @__PURE__ */ jsx22("div", { className: "sidebar__subtitle", children: "Analyzer" })
      ] }),
      /* @__PURE__ */ jsx22(
        "button",
        {
          className: "sidebar__icon-btn",
          onClick: () => store.setSidebarCompact(!store.sidebarCompact),
          title: store.sidebarCompact ? "\u041F\u043E\u043B\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" : "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C",
          children: /* @__PURE__ */ jsx22(MIcon, { name: store.sidebarCompact ? "view_sidebar" : "view_compact", size: "sm" })
        }
      ),
      /* @__PURE__ */ jsx22(
        "button",
        {
          className: "sidebar__icon-btn",
          onClick: props.onExportStats,
          title: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438 \u0432 Markdown",
          children: /* @__PURE__ */ jsx22(MIcon, { name: "download", size: "sm" })
        }
      ),
      /* @__PURE__ */ jsx22(
        "button",
        {
          className: "sidebar__icon-btn",
          onClick: () => store.setSidebarCollapsed(true),
          title: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C",
          children: /* @__PURE__ */ jsx22(MIcon, { name: "chevron_left", size: "sm" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs21("div", { className: "sidebar__body", children: [
      /* @__PURE__ */ jsx22(
        OverviewSection,
        {
          counts: stats.counts,
          isolatedCount: stats.isolatedCount,
          problemDomainsCount: problemDomains.length,
          cyclesCount: props.cyclesCount,
          onFitView: props.onFitView,
          onFilterMissing: () => store.setFilters((f) => ({ ...f, domain: false, broken: false, missing: true })),
          onFilterBroken: () => store.setFilters((f) => ({ ...f, domain: false, missing: false, broken: true }))
        }
      ),
      /* @__PURE__ */ jsx22(ActivitySection, {}),
      hasProblems && /* @__PURE__ */ jsx22(
        ProblemsSection,
        {
          isolatedCount: stats.isolatedCount,
          cyclesCount: props.cyclesCount,
          problemDomains,
          brokenRefsDomains,
          totalProblems
        }
      ),
      hasNews && /* @__PURE__ */ jsx22(NewsSection, { cacheDiff: props.cacheDiff }),
      /* @__PURE__ */ jsx22(TopConnectedSection, { items: stats.topConnected }),
      /* @__PURE__ */ jsx22(WorstHealthSection, { items: stats.worstHealth }),
      /* @__PURE__ */ jsx22(MissingRefsSection, { items: stats.topMissingRefs }),
      /* @__PURE__ */ jsx22(NamespacesSection, { items: stats.namespaces }),
      /* @__PURE__ */ jsx22(TagsSection, { items: stats.tagCloud }),
      /* @__PURE__ */ jsx22(BookmarksSection, {}),
      /* @__PURE__ */ jsx22(LegendSection, {})
    ] })
  ] });
}
var init_Sidebar = __esm({
  "src/web/components/layout/Sidebar.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useSidebarStats();
    init_MIcon();
    init_sections();
  }
});

// src/web/components/graph/DomainNode.tsx
import { Handle, Position } from "reactflow";
import { Fragment as Fragment2, jsx as jsx23, jsxs as jsxs22 } from "react/jsx-runtime";
function DomainNode({ data, selected }) {
  if (data.__compact) {
    const cls2 = "rf-compact rf-compact--" + data.nodeType + (selected ? " rf-compact--selected" : "");
    const initial = (data.domainId || "?").charAt(0).toUpperCase();
    const style = {};
    if (data.__heatColor) {
      style.background = data.__heatColor;
      style.borderColor = data.__heatColor;
      style.color = "#ffffff";
    }
    return /* @__PURE__ */ jsxs22(Fragment2, { children: [
      /* @__PURE__ */ jsx23(Handle, { type: "target", position: Position.Left, className: "rf-handle" }),
      /* @__PURE__ */ jsx23("div", { className: cls2, style, title: data.domainId, children: initial }),
      /* @__PURE__ */ jsx23(Handle, { type: "source", position: Position.Right, className: "rf-handle" })
    ] });
  }
  const cls = ["rf-node", "rf-node--" + data.nodeType];
  if (selected)
    cls.push("rf-node--selected");
  if (data.dimmed)
    cls.push("rf-node--dimmed");
  if (data.__inPath)
    cls.push("rf-node--path");
  if (data.__isPathEndpoint)
    cls.push("rf-node--path-endpoint");
  if (data.__failed)
    cls.push("rf-node--failed");
  if (data.__pendingFail)
    cls.push("rf-node--pending-fail");
  if (data.__failureRoot)
    cls.push("rf-node--failure-root");
  if (data.__selectedHighlight)
    cls.push("rf-node--selected-soft");
  const icon = data.nodeType === "domain" ? "\u25CF" : data.nodeType === "missing" ? "\u25B2" : "\u2715";
  const nodeStyle = {};
  if (data.__heatColor) {
    nodeStyle.background = data.__heatColor;
    nodeStyle.borderColor = data.__heatColor;
    nodeStyle.color = "#ffffff";
  }
  const onHealthEnter = (e) => {
    if (!data.__tooltipsEnabled)
      return;
    e.stopPropagation();
    const items = (data.healthBreakdown || []).map(
      (b) => `<div style="margin:3px 0;display:flex;justify-content:space-between;gap:12px;"><span>${escapeHtml2(b.reason)}</span><span style="color:${b.delta < 0 ? "#ef4444" : "#10b981"};font-weight:700;">${b.delta > 0 ? "+" + b.delta : b.delta}</span></div>`
    ).join("");
    const html = `<div style="padding:8px 10px;"><div style="font-weight:700;margin-bottom:6px;">Health score: ${data.health}/100</div>` + (items || `<div style="color:#64748b;">\u0412\u0441\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0432 \u043D\u043E\u0440\u043C\u0435</div>`) + `</div>`;
    window.__healthTooltip = { html, x: e.clientX, y: e.clientY };
    document.dispatchEvent(new CustomEvent("show-health-tooltip"));
  };
  const onHealthLeave = () => {
    document.dispatchEvent(new CustomEvent("hide-health-tooltip"));
  };
  let healthBadge = null;
  if (data.health != null && data.nodeType === "domain" && !data.__heatColor) {
    const healthScore = typeof data.health === "object" ? data.health.score : data.health;
    if (healthScore != null) {
      const hc = healthScore >= 80 ? "good" : healthScore >= 50 ? "mid" : "bad";
      healthBadge = /* @__PURE__ */ jsx23(
        "span",
        {
          className: "rf-node__health rf-node__health--" + hc,
          title: "Health score: " + healthScore + "/100",
          onMouseEnter: onHealthEnter,
          onMouseLeave: onHealthLeave,
          style: { cursor: "help" },
          children: healthScore
        }
      );
    }
  }
  let validationBadge = null;
  if (data.__validationStatus === "invalid" && data.__validationCount > 0) {
    validationBadge = /* @__PURE__ */ jsxs22(
      "span",
      {
        className: "rf-node__issues",
        title: "\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F: " + data.__validationCount + " \u043F\u0440\u043E\u0431\u043B\u0435\u043C",
        children: [
          "\u26A0",
          data.__validationCount
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs22(Fragment2, { children: [
    /* @__PURE__ */ jsx23(Handle, { type: "target", position: Position.Left, className: "rf-handle" }),
    /* @__PURE__ */ jsxs22("div", { className: cls.join(" "), style: nodeStyle, children: [
      /* @__PURE__ */ jsx23("div", { className: "rf-node__icon", children: icon }),
      /* @__PURE__ */ jsxs22("div", { className: "rf-node__content", children: [
        /* @__PURE__ */ jsxs22("div", { className: "rf-node__id-row", children: [
          /* @__PURE__ */ jsx23(
            "span",
            {
              className: "rf-node__id" + (data.__invalid ? " rf-node__id--invalid" : ""),
              title: data.domainId + (data.__invalid ? " \u2014 \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D" : ""),
              children: data.domainId
            }
          ),
          healthBadge,
          validationBadge,
          data.__topoLevel != null && /* @__PURE__ */ jsxs22("span", { className: "topo-badge", title: "\u0423\u0440\u043E\u0432\u0435\u043D\u044C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438: " + data.__topoLevel, children: [
            "L",
            data.__topoLevel
          ] })
        ] }),
        data.label && data.label !== data.domainId && /* @__PURE__ */ jsx23("div", { className: "rf-node__name", title: data.label, children: data.label })
      ] })
    ] }),
    /* @__PURE__ */ jsx23(Handle, { type: "source", position: Position.Right, className: "rf-handle" })
  ] });
}
function escapeHtml2(s) {
  if (s === null || s === void 0)
    return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[c];
  });
}
var init_DomainNode = __esm({
  "src/web/components/graph/DomainNode.tsx"() {
    "use strict";
  }
});

// src/web/components/graph/GroupsOverlay.tsx
import { useEffect as useEffect11, useRef as useRef7 } from "react";
import { useViewport } from "reactflow";
import { jsx as jsx24, jsxs as jsxs23 } from "react/jsx-runtime";
function GroupsOverlay({ boxes }) {
  const svgRef = useRef7(null);
  const viewport = useViewport();
  useEffect11(() => {
    const svg = svgRef.current;
    if (!svg)
      return;
    svg.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`;
  }, [viewport.x, viewport.y, viewport.zoom]);
  if (!boxes || boxes.length === 0)
    return null;
  return /* @__PURE__ */ jsx24(
    "svg",
    {
      ref: svgRef,
      className: "groups-overlay",
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        overflow: "visible",
        pointerEvents: "none",
        transformOrigin: "0 0",
        willChange: "transform"
      },
      children: boxes.map((b) => /* @__PURE__ */ jsxs23("g", { transform: `translate(${b.x},${b.y})`, children: [
        /* @__PURE__ */ jsx24(
          "rect",
          {
            width: b.w,
            height: b.h,
            rx: 12,
            fill: "rgba(99,102,241,0.05)",
            stroke: "rgba(99,102,241,0.4)",
            strokeDasharray: "6 4",
            strokeWidth: 1.5
          }
        ),
        /* @__PURE__ */ jsxs23(
          "text",
          {
            x: 14,
            y: 22,
            fill: "var(--accent-hover)",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "Inter, sans-serif",
            children: [
              b.label,
              " \xB7 ",
              b.count
            ]
          }
        )
      ] }, b.id))
    }
  );
}
var init_GroupsOverlay = __esm({
  "src/web/components/graph/GroupsOverlay.tsx"() {
    "use strict";
  }
});

// src/web/components/graph/GraphView.tsx
import { useEffect as useEffect12, useMemo as useMemo13 } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useStore
} from "reactflow";
import { jsx as jsx25, jsxs as jsxs24 } from "react/jsx-runtime";
function GraphViewInner(props) {
  const rf = useReactFlow();
  const setRfInstance = useGraphStore((s) => s.setRfInstance);
  useEffect12(() => {
    setRfInstance(rf);
  }, [rf, setRfInstance]);
  const zoomClass = useStore((s) => s.transform[2] < 0.5 ? "hide" : "show");
  useEffect12(() => {
    const el = document.querySelector(".graph-container");
    if (!el)
      return;
    el.classList.toggle("hide-labels", zoomClass === "hide");
  }, [zoomClass]);
  useEffect12(() => {
    const el = document.querySelector(".graph-container");
    if (!el)
      return;
    el.classList.toggle("perf-mode", !!props.perfMode);
  }, [props.perfMode]);
  const defaultEdgeOptions = useMemo13(
    () => ({
      type: props.perfMode ? "default" : "smoothstep",
      animated: false
    }),
    [props.perfMode]
  );
  return /* @__PURE__ */ jsxs24(
    ReactFlow,
    {
      nodes: props.nodes,
      edges: props.edges,
      onNodesChange: props.onNodesChange,
      onEdgesChange: props.onEdgesChange,
      onEdgeClick: props.onEdgeClick,
      nodeTypes,
      onNodeClick: props.onNodeClick,
      onNodeDoubleClick: props.onNodeDoubleClick,
      onNodeContextMenu: props.onNodeContextMenu,
      onNodeMouseEnter: props.onNodeMouseEnter,
      onNodeMouseLeave: props.onNodeMouseLeave,
      onEdgeMouseEnter: props.onEdgeMouseEnter,
      onEdgeMouseLeave: props.onEdgeMouseLeave,
      onPaneClick: props.onPaneClick,
      onPaneContextMenu: props.onPaneContextMenu,
      fitView: true,
      fitViewOptions: { padding: 0.2 },
      minZoom: 0.05,
      maxZoom: 4,
      proOptions: { hideAttribution: true },
      nodesDraggable: true,
      nodesConnectable: false,
      elementsSelectable: true,
      onlyRenderVisibleElements: false,
      defaultEdgeOptions,
      children: [
        /* @__PURE__ */ jsx25(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1, color: "var(--graph-dots)" }),
        /* @__PURE__ */ jsx25(Controls, { position: "bottom-left" }),
        /* @__PURE__ */ jsx25(
          MiniMap,
          {
            position: "bottom-right",
            nodeColor: (n) => {
              const t = n.data && n.data.nodeType;
              if (t === "missing")
                return "#f59e0b";
              if (t === "broken")
                return "#ef4444";
              return "#10b981";
            },
            maskColor: "rgba(10,14,26,0.7)",
            style: { width: 180, height: 130 }
          }
        ),
        props.showGroups && props.clusterBoxes.length > 0 && /* @__PURE__ */ jsx25(GroupsOverlay, { boxes: props.clusterBoxes })
      ]
    }
  );
}
function GraphView(props) {
  return /* @__PURE__ */ jsx25(ReactFlowProvider, { children: /* @__PURE__ */ jsx25(GraphViewInner, { ...props }) });
}
var nodeTypes;
var init_GraphView = __esm({
  "src/web/components/graph/GraphView.tsx"() {
    "use strict";
    init_useGraphStore();
    init_DomainNode();
    init_GroupsOverlay();
    nodeTypes = { domainNode: DomainNode };
  }
});

// src/web/components/panels/CollapsibleSection.tsx
import { jsx as jsx26, jsxs as jsxs25 } from "react/jsx-runtime";
function CollapsibleSection({ id, title, count, children }) {
  const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
  const toggle = useGraphStore((s) => s.toggleCollapsedSection);
  const isOpen = !collapsed;
  return /* @__PURE__ */ jsxs25("div", { className: "details__field", children: [
    /* @__PURE__ */ jsxs25(
      "button",
      {
        className: "details__field-label details__field-label--btn",
        onClick: () => toggle(id, !isOpen),
        children: [
          /* @__PURE__ */ jsx26(MIcon, { name: isOpen ? "expand_more" : "chevron_right", size: "sm" }),
          /* @__PURE__ */ jsx26("span", { style: { marginLeft: 6 }, children: title }),
          count != null && /* @__PURE__ */ jsx26("span", { className: "details__field-count", children: count })
        ]
      }
    ),
    isOpen && children
  ] });
}
var init_CollapsibleSection = __esm({
  "src/web/components/panels/CollapsibleSection.tsx"() {
    "use strict";
    init_useGraphStore();
    init_MIcon();
  }
});

// src/web/components/panels/DetailsTab.tsx
import { jsx as jsx27, jsxs as jsxs26 } from "react/jsx-runtime";
function DetailsTab({ node, allNodes, allEdges, ruleViolations }) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  if (!node) {
    return /* @__PURE__ */ jsx27("div", { className: "details", children: /* @__PURE__ */ jsx27("div", { style: { color: "var(--text-500)", textAlign: "center", padding: 40 }, children: "\u0423\u0437\u0435\u043B \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D" }) });
  }
  const incoming = allEdges.filter((e) => e.target === node.id);
  const outgoing = allEdges.filter((e) => e.source === node.id);
  const refs = node.data.fqidRefs || [];
  const health = node.data.health;
  const hc = health != null ? health >= 80 ? "health-good" : health >= 50 ? "health-mid" : "health-bad" : null;
  const remoteInfo = readRemoteInfo();
  return /* @__PURE__ */ jsxs26("div", { className: "details", children: [
    /* @__PURE__ */ jsx27("div", { className: "details__title", children: node.data.label || node.data.domainId }),
    /* @__PURE__ */ jsxs26("div", { className: "details__id", children: [
      /* @__PURE__ */ jsx27("span", { className: "details__id-text", children: node.data.domainId }),
      /* @__PURE__ */ jsx27(
        "button",
        {
          className: "details__copy",
          onClick: () => navigator.clipboard.writeText(node.data.domainId),
          title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
          children: "\u{1F4CB}"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs26("div", { className: "details__badges", children: [
      /* @__PURE__ */ jsx27("span", { className: "details__badge details__badge--" + node.data.nodeType, children: node.data.nodeType }),
      health != null && /* @__PURE__ */ jsxs26("span", { className: "details__badge details__badge--" + hc, children: [
        "Health: ",
        health,
        "/100"
      ] }),
      node.data.version && /* @__PURE__ */ jsxs26("span", { className: "details__badge", children: [
        "v",
        node.data.version
      ] })
    ] }),
    node.data.updatedAt && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D" }),
      /* @__PURE__ */ jsxs26(
        "div",
        {
          className: "details__field-value",
          style: { display: "flex", alignItems: "center", gap: 8 },
          children: [
            /* @__PURE__ */ jsx27(
              MIcon,
              {
                name: sourceIcon(node.data.updatedAtSource),
                size: "sm",
                title: sourceLabel(node.data.updatedAtSource)
              }
            ),
            /* @__PURE__ */ jsx27("span", { children: formatDate(node.data.updatedAt) }),
            /* @__PURE__ */ jsx27(
              "span",
              {
                style: {
                  fontSize: 10,
                  color: sourceColor(node.data.updatedAtSource),
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-750)",
                  marginLeft: "auto"
                },
                children: node.data.updatedAtSource === "graphql" ? "server" : node.data.updatedAtSource === "fs" ? "local" : "\u2014"
              }
            )
          ]
        }
      )
    ] }),
    node.data.createdAt && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u0421\u043E\u0437\u0434\u0430\u043D" }),
      /* @__PURE__ */ jsxs26(
        "div",
        {
          className: "details__field-value",
          style: { display: "flex", alignItems: "center", gap: 8 },
          children: [
            /* @__PURE__ */ jsx27(
              MIcon,
              {
                name: sourceIcon(node.data.createdAtSource),
                size: "sm",
                title: sourceLabel(node.data.createdAtSource)
              }
            ),
            /* @__PURE__ */ jsx27("span", { children: formatDate(node.data.createdAt) }),
            /* @__PURE__ */ jsx27(
              "span",
              {
                style: {
                  fontSize: 10,
                  color: sourceColor(node.data.createdAtSource),
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-750)",
                  marginLeft: "auto"
                },
                children: node.data.createdAtSource === "graphql" ? "server" : node.data.createdAtSource === "fs" ? "local" : "\u2014"
              }
            )
          ]
        }
      )
    ] }),
    node.data.description && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }),
      /* @__PURE__ */ jsx27("div", { className: "details__field-value", children: node.data.description })
    ] }),
    node.data.tags && node.data.tags.length > 0 && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u0422\u0435\u0433\u0438" }),
      /* @__PURE__ */ jsx27("div", { className: "details__tags", children: node.data.tags.map((t, i) => /* @__PURE__ */ jsx27("span", { className: "tag", children: t }, i)) })
    ] }),
    remoteInfo?.server && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433" }),
      /* @__PURE__ */ jsx27(
        "div",
        {
          className: "details__field-value",
          style: {
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.7,
            wordBreak: "break-word"
          },
          children: node.data.folderPath && node.data.folderPath.length > 0 ? node.data.folderPath.join(" / ") : "(\u043A\u043E\u0440\u0435\u043D\u044C)"
        }
      )
    ] }),
    !remoteInfo?.server && node.data.filePath && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "\u0424\u0430\u0439\u043B" }),
      /* @__PURE__ */ jsxs26("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 }, children: [
        /* @__PURE__ */ jsx27(
          "div",
          {
            className: "details__field-value",
            style: { fontFamily: "monospace", fontSize: 11, flex: 1, wordBreak: "break-all" },
            children: node.data.filePath
          }
        ),
        /* @__PURE__ */ jsx27(
          "button",
          {
            className: "details__copy",
            onClick: () => {
              const path = node.data.filePath;
              const url = "vscode://file" + (path.startsWith("/") ? path : "/" + path);
              window.location.href = url;
            },
            title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 VS Code",
            children: /* @__PURE__ */ jsx27(MIcon, { name: "code" })
          }
        )
      ] })
    ] }),
    node.data.health != null && node.data.healthBreakdown && node.data.healthBreakdown.length > 0 && /* @__PURE__ */ jsxs26("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx27("div", { className: "details__field-label", children: "Health breakdown" }),
      /* @__PURE__ */ jsx27("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: node.data.healthBreakdown.map((b, i) => /* @__PURE__ */ jsxs26(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--text-400)"
          },
          children: [
            /* @__PURE__ */ jsx27("span", { children: b.reason }),
            /* @__PURE__ */ jsx27(
              "span",
              {
                style: {
                  color: b.delta < 0 ? "var(--danger)" : "var(--success)",
                  fontWeight: 600,
                  fontFamily: "monospace"
                },
                children: b.delta > 0 ? "+" + b.delta : b.delta
              }
            )
          ]
        },
        i
      )) })
    ] }),
    /* @__PURE__ */ jsx27(CollapsibleSection, { id: "fqid-out", title: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438", count: refs.length, children: refs.length === 0 ? /* @__PURE__ */ jsx27("div", { className: "details__field-value", style: { color: "var(--text-500)" }, children: "\u2014" }) : /* @__PURE__ */ jsx27("div", { className: "details__refs", children: refs.slice(0, 50).map((r, i) => {
      const targetExists = allNodes.some(
        (n) => (n.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase()
      );
      return /* @__PURE__ */ jsxs26(
        "div",
        {
          className: "details__ref" + (targetExists ? "" : " details__ref--missing"),
          onClick: () => targetExists && goto(r.targetDomainId),
          children: [
            /* @__PURE__ */ jsx27("div", { children: r.fullFQID }),
            /* @__PURE__ */ jsx27("div", { className: "details__ref-path", children: r.propertyPath + (!targetExists ? " \xB7 \u26A0\uFE0F missing" : "") })
          ]
        },
        i
      );
    }) }) }),
    /* @__PURE__ */ jsx27(CollapsibleSection, { id: "incoming", title: "\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0441\u0432\u044F\u0437\u0438", count: incoming.length, children: incoming.length === 0 ? /* @__PURE__ */ jsx27("div", { className: "details__field-value", style: { color: "var(--text-500)" }, children: "\u2014" }) : /* @__PURE__ */ jsx27("div", { className: "details__refs", children: incoming.slice(0, 30).map((e, i) => {
      const src = allNodes.find((n) => n.id === e.source);
      return /* @__PURE__ */ jsxs26(
        "div",
        {
          className: "details__ref",
          onClick: () => src && goto(src.data.domainId),
          children: [
            /* @__PURE__ */ jsx27("div", { children: src ? src.data.domainId : e.source }),
            /* @__PURE__ */ jsx27("div", { className: "details__ref-path", children: e.data && e.data.kind || "" })
          ]
        },
        i
      );
    }) }) }),
    /* @__PURE__ */ jsx27(CollapsibleSection, { id: "outgoing", title: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0441\u0432\u044F\u0437\u0438", count: outgoing.length, children: outgoing.length === 0 ? /* @__PURE__ */ jsx27("div", { className: "details__field-value", style: { color: "var(--text-500)" }, children: "\u2014" }) : /* @__PURE__ */ jsx27("div", { className: "details__refs", children: outgoing.slice(0, 30).map((e, i) => {
      const tgt = allNodes.find((n) => n.id === e.target);
      return /* @__PURE__ */ jsxs26(
        "div",
        {
          className: "details__ref",
          onClick: () => tgt && goto(tgt.data.domainId),
          children: [
            /* @__PURE__ */ jsx27("div", { children: tgt ? tgt.data.domainId : e.target }),
            /* @__PURE__ */ jsx27("div", { className: "details__ref-path", children: e.data && e.data.kind || "" })
          ]
        },
        i
      );
    }) }) }),
    node.data.__validationStatus === "invalid" && node.data.__validationDiagnostics && node.data.__validationDiagnostics.length > 0 && /* @__PURE__ */ jsx27(
      CollapsibleSection,
      {
        id: "validation",
        title: "\u041E\u0448\u0438\u0431\u043A\u0438 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438",
        count: node.data.__validationDiagnostics.length,
        children: /* @__PURE__ */ jsx27("div", { style: { maxHeight: 320, overflowY: "auto" }, children: node.data.__validationDiagnostics.map((d, i) => /* @__PURE__ */ jsxs26(
          "div",
          {
            style: {
              padding: "8px 10px",
              background: "var(--bg-750)",
              borderRadius: 6,
              marginBottom: 6,
              fontSize: 12,
              borderLeft: "2px solid " + (d.severity === "ERROR" ? "var(--danger)" : "var(--warning)")
            },
            children: [
              /* @__PURE__ */ jsx27(
                "div",
                {
                  style: {
                    fontWeight: 700,
                    fontSize: 10,
                    textTransform: "uppercase",
                    color: d.severity === "ERROR" ? "var(--danger)" : "var(--warning)",
                    marginBottom: 4
                  },
                  children: d.severity
                }
              ),
              /* @__PURE__ */ jsx27("div", { style: { color: "var(--text-200)" }, children: d.message }),
              d.labels && d.labels.length > 0 && d.labels.map((lb, li) => /* @__PURE__ */ jsxs26(
                "div",
                {
                  style: {
                    fontSize: 11,
                    color: "var(--text-500)",
                    fontFamily: "monospace",
                    marginTop: 4
                  },
                  children: [
                    lb.message,
                    lb.span && " [" + lb.span.start + "\u2013" + lb.span.end + "]"
                  ]
                },
                li
              ))
            ]
          },
          i
        )) })
      }
    ),
    /* @__PURE__ */ jsx27(CollapsibleSection, { id: "violations", title: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u0430\u0432\u0438\u043B", count: ruleViolations.length, children: ruleViolations.length === 0 ? /* @__PURE__ */ jsx27("div", { className: "details__field-value", style: { color: "var(--text-500)" }, children: "\u2014" }) : /* @__PURE__ */ jsx27("div", { className: "details__refs", children: ruleViolations.slice(0, 10).map((v, i) => /* @__PURE__ */ jsxs26(
      "div",
      {
        className: "rank-item",
        style: { cursor: "pointer" },
        onClick: () => goto(v.fromId),
        children: [
          /* @__PURE__ */ jsx27("span", { className: "rank-item__num", children: v.severity === "forbid" ? "\u26D4" : "\u26A0\uFE0F" }),
          /* @__PURE__ */ jsxs26("span", { className: "rank-item__label", children: [
            v.fromId,
            " \u2192 ",
            v.toId
          ] })
        ]
      },
      i
    )) }) })
  ] });
}
var init_DetailsTab = __esm({
  "src/web/components/panels/DetailsTab.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_MIcon();
    init_CollapsibleSection();
    init_format();
    init_initial();
  }
});

// src/web/components/panels/EdgeTab.tsx
import { jsx as jsx28, jsxs as jsxs27 } from "react/jsx-runtime";
function EdgeTab({ edge, allNodes }) {
  const { goto } = useNavigation();
  if (!edge) {
    return /* @__PURE__ */ jsx28("div", { className: "details", children: /* @__PURE__ */ jsx28("div", { style: { color: "var(--text-500)", textAlign: "center", padding: 40 }, children: "\u0421\u0432\u044F\u0437\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430" }) });
  }
  const link = edge.data && edge.data.linkData || {};
  const refs = edge.data && edge.data.fqidRefs || [];
  const srcNode = allNodes.find((n) => n.id === edge.source);
  const tgtNode = allNodes.find((n) => n.id === edge.target);
  return /* @__PURE__ */ jsxs27("div", { className: "details", children: [
    /* @__PURE__ */ jsx28("div", { className: "details__title", children: edge.data && edge.data.fullLabel || edge.label || edge.id }),
    /* @__PURE__ */ jsxs27("div", { className: "details__id", children: [
      /* @__PURE__ */ jsx28("span", { className: "details__id-text", children: (link.originalId && srcNode ? `${srcNode.data.domainId}/${link.originalId}` : null) || edge.data && edge.data.fullLabel || edge.label || (srcNode ? `${srcNode.data.domainId}/${edge.id}` : edge.id) }),
      /* @__PURE__ */ jsx28(
        "button",
        {
          className: "details__copy",
          onClick: () => {
            const copyId = edge.data && edge.data.linkData && edge.data.linkData.originalId || edge.id;
            navigator.clipboard.writeText(copyId);
          },
          title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ID \u0441\u0432\u044F\u0437\u0438",
          children: /* @__PURE__ */ jsx28(MIcon, { name: "content_copy", size: "sm" })
        }
      )
    ] }),
    edge.data?.fullLabel && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx28("div", { className: "details__field-label", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }),
      /* @__PURE__ */ jsx28("div", { className: "details__field-value", children: edge.data.fullLabel })
    ] }),
    edge.data?.kind && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx28("div", { className: "details__field-label", children: "\u0422\u0438\u043F \u0441\u0432\u044F\u0437\u0438" }),
      /* @__PURE__ */ jsxs27("div", { className: "details__field-value", children: [
        /* @__PURE__ */ jsx28("span", { className: "details__badge", children: edge.data.kind === "linkage" ? "Linkage" : "FQID" }),
        edge.data.isBidirectional && /* @__PURE__ */ jsx28("span", { className: "details__badge", children: "\u21C4 \u0434\u0432\u0443\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u0430\u044F" }),
        link.type && /* @__PURE__ */ jsx28("span", { className: "details__badge", style: { marginLeft: 8 }, children: link.type }),
        edge.data.refCount && /* @__PURE__ */ jsxs27("span", { className: "details__badge", children: [
          edge.data.refCount,
          " refs"
        ] })
      ] })
    ] }),
    srcNode && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx28("div", { className: "details__field-label", children: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A" }),
      /* @__PURE__ */ jsxs27("div", { className: "details__ref", onClick: () => goto(srcNode.data.domainId), children: [
        /* @__PURE__ */ jsx28("div", { children: srcNode.data.domainId }),
        link.sourceEntity && /* @__PURE__ */ jsx28("div", { className: "details__ref-path", children: link.sourceEntity })
      ] })
    ] }),
    tgtNode && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx28("div", { className: "details__field-label", children: "\u0426\u0435\u043B\u044C" }),
      /* @__PURE__ */ jsxs27("div", { className: "details__ref", onClick: () => goto(tgtNode.data.domainId), children: [
        /* @__PURE__ */ jsx28("div", { children: tgtNode.data.domainId }),
        link.targetEntity && /* @__PURE__ */ jsx28("div", { className: "details__ref-path", children: link.targetEntity })
      ] })
    ] }),
    link.nameFrom && (link.nameFrom.side1 || link.nameFrom.side2) && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsx28("div", { className: "details__field-label", children: "\u0421\u0442\u043E\u0440\u043E\u043D\u044B" }),
      link.nameFrom.side1 && /* @__PURE__ */ jsxs27("div", { className: "details__field-value", children: [
        "\u0421\u0442\u043E\u0440\u043E\u043D\u0430 1: ",
        link.nameFrom.side1
      ] }),
      link.nameFrom.side2 && /* @__PURE__ */ jsxs27("div", { className: "details__field-value", children: [
        "\u0421\u0442\u043E\u0440\u043E\u043D\u0430 2: ",
        link.nameFrom.side2
      ] })
    ] }),
    refs.length > 0 && /* @__PURE__ */ jsxs27("div", { className: "details__field", children: [
      /* @__PURE__ */ jsxs27("div", { className: "details__field-label", children: [
        "FQID-\u0441\u0441\u044B\u043B\u043A\u0438 (",
        refs.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx28("div", { className: "details__refs", children: refs.map((r, i) => /* @__PURE__ */ jsxs27(
        "div",
        {
          className: "details__ref",
          onClick: () => r.targetDomainId && goto(r.targetDomainId),
          children: [
            /* @__PURE__ */ jsx28("div", { children: r.fullFQID }),
            /* @__PURE__ */ jsx28("div", { className: "details__ref-path", children: r.propertyPath })
          ]
        },
        i
      )) })
    ] }),
    /* @__PURE__ */ jsxs27("div", { className: "details__actions", children: [
      srcNode && /* @__PURE__ */ jsx28("button", { className: "btn", onClick: () => goto(srcNode.data.domainId), children: "\u{1F3AF} \u041A \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0443" }),
      tgtNode && /* @__PURE__ */ jsx28("button", { className: "btn", onClick: () => goto(tgtNode.data.domainId), children: "\u{1F3AF} \u041A \u0446\u0435\u043B\u0438" })
    ] })
  ] });
}
var init_EdgeTab = __esm({
  "src/web/components/panels/EdgeTab.tsx"() {
    "use strict";
    init_useNavigation();
    init_MIcon();
  }
});

// src/web/components/panels/EntitiesTab.tsx
import { jsx as jsx29, jsxs as jsxs28 } from "react/jsx-runtime";
function EntitiesTab({ node, entities, entityIndex, onOpenEntityHierarchy }) {
  const domainEntities = entities.filter(
    (e) => e.domainId === (node && node.data && node.data.domainId)
  );
  return /* @__PURE__ */ jsxs28("div", { className: "details", children: [
    /* @__PURE__ */ jsxs28("div", { className: "details__field-label", children: [
      "\u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438 \u0434\u043E\u043C\u0435\u043D\u0430 (",
      domainEntities.length,
      ")"
    ] }),
    domainEntities.length === 0 ? /* @__PURE__ */ jsx29("div", { className: "details__field-value", style: { color: "var(--text-500)" }, children: "\u041D\u0435\u0442 \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439" }) : /* @__PURE__ */ jsx29("div", { className: "entity-tab-list", children: domainEntities.map((e) => {
      const key = (e.domainId + "/" + e.entityId).toLowerCase();
      const hasParents = !!e.inherits;
      const hasChildren = entityIndex && (entityIndex.children.get(key) || []).length > 0;
      return /* @__PURE__ */ jsxs28(
        "div",
        {
          className: "entity-tab-item",
          onClick: () => onOpenEntityHierarchy(key),
          children: [
            /* @__PURE__ */ jsxs28("div", { className: "entity-tab-item__head", children: [
              /* @__PURE__ */ jsx29("span", { className: "entity-tab-item__id", children: e.entityId }),
              (hasParents || hasChildren) && /* @__PURE__ */ jsx29("span", { className: "entity-tab-item__arrows", children: (hasParents ? "\u2191" : "") + (hasChildren ? "\u2193" : "") })
            ] }),
            e.name && e.name !== e.entityId && /* @__PURE__ */ jsx29("div", { className: "entity-tab-item__name", children: e.name }),
            e.inherits && /* @__PURE__ */ jsxs28("div", { className: "entity-tab-item__inherits", children: [
              "\u21B3 ",
              e.inherits
            ] })
          ]
        },
        key
      );
    }) })
  ] });
}
var init_EntitiesTab = __esm({
  "src/web/components/panels/EntitiesTab.tsx"() {
    "use strict";
  }
});

// src/web/components/panels/FileTab.tsx
import { jsx as jsx30 } from "react/jsx-runtime";
function FileTab() {
  return /* @__PURE__ */ jsx30("div", { id: "monaco-container", style: { width: "100%", height: "100%" } });
}
var init_FileTab = __esm({
  "src/web/components/panels/FileTab.tsx"() {
    "use strict";
  }
});

// src/web/components/panels/SidePanel.tsx
import React8, { useMemo as useMemo14 } from "react";
import { jsx as jsx31, jsxs as jsxs29 } from "react/jsx-runtime";
function SidePanel(props) {
  const store = useGraphStore();
  const panelNode = useMemo14(() => {
    if (!store.panelNodeId)
      return null;
    return props.visibleNodes.find((n) => n.id === store.panelNodeId) || props.allNodes.find((n) => n.id === store.panelNodeId) || null;
  }, [store.panelNodeId, props.visibleNodes, props.allNodes]);
  const panelEdge = useMemo14(() => {
    if (!store.selectedEdgeId)
      return null;
    return props.visibleEdges.find((e) => e.id === store.selectedEdgeId) || props.allEdges.find((e) => e.id === store.selectedEdgeId) || null;
  }, [store.selectedEdgeId, props.visibleEdges, props.allEdges]);
  useMonaco(store.panelOpen, store.panelTab, store.pendingFile);
  React8.useEffect(() => {
    if (!store.panelOpen || store.panelTab !== "file")
      return;
    if (!panelNode)
      return;
    if (!panelNode.data.filePath)
      return;
    if (store.editorFilePath === panelNode.data.filePath && store.pendingFile)
      return;
    openFileInEditor(panelNode.data.filePath);
  }, [
    store.panelOpen,
    store.panelTab,
    store.panelNodeId,
    panelNode,
    store.editorFilePath,
    store.pendingFile
  ]);
  const ruleViolationsFiltered = useMemo14(() => {
    if (!panelNode)
      return [];
    return props.ruleViolations.filter(
      (v) => v.fromId === panelNode.data.domainId || v.toId === panelNode.data.domainId
    );
  }, [props.ruleViolations, panelNode]);
  if (!store.panelOpen)
    return null;
  return /* @__PURE__ */ jsxs29("div", { className: "side-panel open", children: [
    /* @__PURE__ */ jsxs29("div", { className: "side-panel__header", children: [
      /* @__PURE__ */ jsxs29("div", { className: "side-panel__tabs", children: [
        /* @__PURE__ */ jsx31(
          "button",
          {
            className: "side-panel__tab" + (store.panelTab === "details" ? " active" : ""),
            onClick: () => store.setPanelTab("details"),
            children: "\u{1F4CB} \u0414\u0435\u0442\u0430\u043B\u0438"
          }
        ),
        /* @__PURE__ */ jsx31(
          "button",
          {
            className: "side-panel__tab" + (store.panelTab === "file" ? " active" : ""),
            onClick: () => store.setPanelTab("file"),
            children: "\u{1F4C4} \u0424\u0430\u0439\u043B"
          }
        ),
        /* @__PURE__ */ jsx31(
          "button",
          {
            className: "side-panel__tab" + (store.panelTab === "edge" ? " active" : ""),
            onClick: () => store.setPanelTab("edge"),
            children: "\u{1F517} \u0421\u0432\u044F\u0437\u044C"
          }
        ),
        /* @__PURE__ */ jsx31(
          "button",
          {
            className: "side-panel__tab" + (store.panelTab === "entities" ? " active" : ""),
            onClick: () => store.setPanelTab("entities"),
            children: "\u{1F9EC} \u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438"
          }
        )
      ] }),
      /* @__PURE__ */ jsx31(
        "button",
        {
          className: "btn btn--icon",
          onClick: () => store.setPanelOpen(false),
          title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
          children: "\u2715"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs29("div", { className: "side-panel__body", style: { position: "relative" }, children: [
      /* @__PURE__ */ jsx31(
        "div",
        {
          className: "side-panel__pane",
          style: { display: store.panelTab === "details" ? "block" : "none" },
          children: /* @__PURE__ */ jsx31(
            DetailsTab,
            {
              node: panelNode,
              allNodes: props.allNodes,
              allEdges: props.allEdges,
              ruleViolations: ruleViolationsFiltered
            }
          )
        }
      ),
      /* @__PURE__ */ jsx31(
        "div",
        {
          className: "side-panel__pane",
          style: { display: store.panelTab === "edge" ? "block" : "none" },
          children: /* @__PURE__ */ jsx31(EdgeTab, { edge: panelEdge, allNodes: props.allNodes })
        }
      ),
      /* @__PURE__ */ jsx31(
        "div",
        {
          className: "side-panel__pane",
          style: { display: store.panelTab === "entities" ? "block" : "none" },
          children: /* @__PURE__ */ jsx31(
            EntitiesTab,
            {
              node: panelNode,
              entities: props.entities,
              entityIndex: props.entityIndex,
              onOpenEntityHierarchy: props.onOpenEntityHierarchy
            }
          )
        }
      ),
      /* @__PURE__ */ jsx31(
        "div",
        {
          className: "side-panel__pane",
          style: { display: store.panelTab === "file" ? "block" : "none" },
          children: /* @__PURE__ */ jsx31(FileTab, {})
        }
      )
    ] })
  ] });
}
var init_SidePanel = __esm({
  "src/web/components/panels/SidePanel.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useMonaco();
    init_DetailsTab();
    init_EdgeTab();
    init_EntitiesTab();
    init_FileTab();
    init_open_file();
  }
});

// src/web/components/layout/GraphArea.tsx
import { applyEdgeChanges, applyNodeChanges } from "reactflow";
import { jsx as jsx32, jsxs as jsxs30 } from "react/jsx-runtime";
function GraphArea(props) {
  const store = useGraphStore();
  return /* @__PURE__ */ jsxs30(
    "div",
    {
      className: "graph-container" + (store.showEdgeLabels ? " show-labels" : ""),
      children: [
        /* @__PURE__ */ jsx32(
          GraphView,
          {
            nodes: props.visibleNodes,
            edges: props.displayEdgesForRender,
            onNodesChange: (changes) => store.setNodes(
              (prev) => applyNodeChanges(changes, prev)
            ),
            onEdgesChange: (changes) => store.setEdges(
              (prev) => applyEdgeChanges(changes, prev)
            ),
            onNodeClick: props.interactions.handleNodeClick,
            onNodeDoubleClick: props.interactions.handleNodeDoubleClick,
            onNodeContextMenu: props.interactions.handleNodeContextMenu,
            onNodeMouseEnter: props.interactions.handleNodeMouseEnter,
            onNodeMouseLeave: props.interactions.handleNodeMouseLeave,
            onEdgeClick: props.interactions.handleEdgeClick,
            onEdgeMouseEnter: props.interactions.handleEdgeMouseEnter,
            onEdgeMouseLeave: props.interactions.handleEdgeMouseLeave,
            onPaneClick: props.interactions.handlePaneClick,
            onPaneContextMenu: props.interactions.handlePaneContextMenu,
            showGroups: store.showGroups,
            clusterBoxes: store.clusterBoxes,
            perfMode: props.perfMode
          }
        ),
        props.visibleNodes.length === 0 && /* @__PURE__ */ jsxs30("div", { className: "empty-state", children: [
          /* @__PURE__ */ jsx32("div", { className: "empty-state__icon", children: /* @__PURE__ */ jsx32("span", { className: "material-symbols-outlined mi-xl", children: "search_off" }) }),
          /* @__PURE__ */ jsx32("div", { className: "empty-state__title", children: "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }),
          /* @__PURE__ */ jsx32("div", { className: "empty-state__text", children: "\u041F\u043E\u0434 \u0442\u0435\u043A\u0443\u0449\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043D\u0438 \u043E\u0434\u0438\u043D \u0434\u043E\u043C\u0435\u043D." }),
          /* @__PURE__ */ jsxs30("div", { className: "empty-state__actions", children: [
            store.namespaceFilter && /* @__PURE__ */ jsx32(
              "button",
              {
                className: "btn",
                onClick: () => store.setNamespaceFilter(""),
                children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C namespace"
              }
            ),
            store.tagFilters.size > 0 && /* @__PURE__ */ jsx32(
              "button",
              {
                className: "btn",
                onClick: () => store.setTagFilters(/* @__PURE__ */ new Set()),
                children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0442\u0435\u0433\u0438"
              }
            ),
            /* @__PURE__ */ jsx32("button", { className: "btn btn--primary", onClick: props.onResetAll, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0451" })
          ] })
        ] }),
        store.heatmap !== "none" && props.heatmapValues && /* @__PURE__ */ jsxs30("div", { className: "heat-legend", children: [
          /* @__PURE__ */ jsxs30("div", { className: "heat-legend__title", children: [
            "Heatmap: ",
            props.heatmapValues.scheme.label
          ] }),
          /* @__PURE__ */ jsx32("div", { className: "heat-legend__bar" }),
          /* @__PURE__ */ jsxs30("div", { className: "heat-legend__labels", children: [
            /* @__PURE__ */ jsx32("span", { children: props.heatmapValues.min }),
            /* @__PURE__ */ jsx32("span", { children: props.heatmapValues.max })
          ] }),
          /* @__PURE__ */ jsx32(
            "button",
            {
              className: "heat-legend__close",
              onClick: () => store.setHeatmap("none"),
              children: "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ jsx32(
          SidePanel,
          {
            allNodes: store.nodes,
            allEdges: store.edges,
            visibleNodes: props.visibleNodes,
            visibleEdges: props.visibleEdges,
            entities: props.entities,
            entityIndex: props.entityIndex,
            ruleViolations: props.ruleViolations,
            onOpenEntityHierarchy: props.onOpenEntityHierarchy
          }
        )
      ]
    }
  );
}
var init_GraphArea = __esm({
  "src/web/components/layout/GraphArea.tsx"() {
    "use strict";
    init_useGraphStore();
    init_GraphView();
    init_SidePanel();
  }
});

// src/web/components/common/HoverTooltip.tsx
import { jsx as jsx33 } from "react/jsx-runtime";
function HoverTooltip() {
  const tooltip = useGraphStore((s) => s.tooltip);
  const setTooltip = useGraphStore((s) => s.setTooltip);
  if (!tooltip)
    return null;
  return /* @__PURE__ */ jsx33(
    "div",
    {
      className: "tooltip",
      style: { left: tooltip.x, top: tooltip.y },
      onMouseEnter: () => {
        window.__tooltipHovered = true;
      },
      onMouseLeave: () => {
        window.__tooltipHovered = false;
      },
      onMouseDown: (e) => e.stopPropagation(),
      onClick: (e) => e.stopPropagation(),
      children: /* @__PURE__ */ jsx33("div", { dangerouslySetInnerHTML: { __html: tooltip.html } })
    }
  );
}
var init_HoverTooltip = __esm({
  "src/web/components/common/HoverTooltip.tsx"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/components/common/ContextMenu.tsx
import { useEffect as useEffect13, useRef as useRef8 } from "react";
import { jsx as jsx34, jsxs as jsxs31 } from "react/jsx-runtime";
function ContextMenu({ menu, onClose, onAction }) {
  const ref = useRef8(null);
  useEffect13(() => {
    if (!menu)
      return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target))
        onClose();
    };
    const onEsc = (e) => {
      if (e.key === "Escape")
        onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc, true);
    };
  }, [menu, onClose]);
  if (!menu)
    return null;
  return /* @__PURE__ */ jsx34("div", { className: "ctx-menu", ref, style: { left: menu.x, top: menu.y }, children: ITEMS.map((it, i) => {
    if (it.type === "divider")
      return /* @__PURE__ */ jsx34("div", { className: "ctx-menu__divider" }, i);
    return /* @__PURE__ */ jsxs31(
      "button",
      {
        className: "ctx-menu__item" + (it.danger ? " ctx-menu__item--danger" : ""),
        onClick: () => {
          if (it.action)
            onAction(it.action, menu.nodeId);
          onClose();
        },
        children: [
          /* @__PURE__ */ jsx34("span", { className: "ctx-menu__icon", children: it.icon }),
          /* @__PURE__ */ jsx34("span", { children: it.label })
        ]
      },
      i
    );
  }) });
}
var ITEMS;
var init_ContextMenu = __esm({
  "src/web/components/common/ContextMenu.tsx"() {
    "use strict";
    ITEMS = [
      { icon: "\u{1F3AF}", label: "\u0424\u043E\u043A\u0443\u0441 (N \u0448\u0430\u0433\u043E\u0432)", action: "focus" },
      { icon: "\u{1F4CA}", label: "\u0427\u0442\u043E \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u043D\u0435\u0433\u043E", action: "dependents" },
      { icon: "\u{1F6E4}\uFE0F", label: "\u041F\u0443\u0442\u044C \u043E\u0442...", action: "path-from" },
      { icon: "\u21AA\uFE0F", label: "\u041F\u0443\u0442\u044C \u0434\u043E...", action: "path-to" },
      { type: "divider" },
      { icon: "\u{1F4C2}", label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B", action: "open-file" },
      { icon: "\u{1F4CB}", label: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ID", action: "copy-id" },
      { icon: "\u2605", label: "\u0412 \u0437\u0430\u043A\u043B\u0430\u0434\u043A\u0438", action: "bookmark" },
      { icon: "\u{1F441}\uFE0F", label: "\u0421\u043A\u0440\u044B\u0442\u044C", action: "hide", danger: true }
    ];
  }
});

// src/web/components/common/Toast.tsx
import { useEffect as useEffect14, useRef as useRef9, useState as useState5 } from "react";
import { jsx as jsx35, jsxs as jsxs32 } from "react/jsx-runtime";
function Toast({ message, actions = [], onClose, duration = 2e4 }) {
  const [visible, setVisible] = useState5(true);
  const [copied, setCopied] = useState5(false);
  const onCloseRef = useRef9(onClose);
  useEffect14(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect14(() => {
    if (!duration)
      return;
    const t = setTimeout(() => {
      setVisible(false);
      onCloseRef.current?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration]);
  if (!visible)
    return null;
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return /* @__PURE__ */ jsxs32("div", { className: "toast", children: [
    /* @__PURE__ */ jsxs32("div", { className: "toast__body", children: [
      /* @__PURE__ */ jsx35("div", { className: "toast__message", dangerouslySetInnerHTML: { __html: message } }),
      actions.map((a, i) => /* @__PURE__ */ jsxs32("div", { className: "toast__action", children: [
        a.command && /* @__PURE__ */ jsx35("code", { className: "toast__command", children: a.command }),
        a.command && /* @__PURE__ */ jsx35("button", { className: "toast__btn", onClick: () => copyToClipboard(a.command), children: copied ? "\u2713 \u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E" : "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })
      ] }, i))
    ] }),
    /* @__PURE__ */ jsx35(
      "button",
      {
        className: "toast__close",
        onClick: () => {
          setVisible(false);
          onCloseRef.current?.();
        },
        children: "\u2715"
      }
    )
  ] });
}
var init_Toast = __esm({
  "src/web/components/common/Toast.tsx"() {
    "use strict";
  }
});

// src/web/components/common/Snackbar.tsx
import { jsx as jsx36, jsxs as jsxs33 } from "react/jsx-runtime";
function Snackbar({ snackbar }) {
  if (!snackbar)
    return null;
  return /* @__PURE__ */ jsxs33("div", { className: "snackbar", children: [
    /* @__PURE__ */ jsx36(MIcon, { name: "check_circle", size: "sm" }),
    /* @__PURE__ */ jsx36("span", { children: snackbar.message })
  ] });
}
var init_Snackbar = __esm({
  "src/web/components/common/Snackbar.tsx"() {
    "use strict";
    init_MIcon();
  }
});

// src/web/components/modals/HelpModal.tsx
import { useEffect as useEffect15, useState as useState6 } from "react";
import { jsx as jsx37, jsxs as jsxs34 } from "react/jsx-runtime";
function HelpModal({ open, onClose }) {
  const [content, setContent] = useState6("");
  const [loading, setLoading] = useState6(false);
  const { parse, ready } = useMarked();
  useEffect15(() => {
    if (!open || content)
      return;
    setLoading(true);
    fetch("/user-guide").then((r) => {
      if (!r.ok)
        throw new Error("HTTP " + r.status);
      return r.text();
    }).then((md) => setContent(md)).catch((err) => setContent("# \u041E\u0448\u0438\u0431\u043A\u0430\n\n" + err.message)).finally(() => setLoading(false));
  }, [open, content]);
  useEffect15(() => {
    if (!open || !content || !ready || !parse)
      return;
    if (loading)
      setLoading(false);
  }, [open, content, ready, parse, loading]);
  useEffect15(() => {
    if (!open)
      return;
    const onEsc = (e) => {
      if (e.key === "Escape")
        onClose();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [open, onClose]);
  if (!open)
    return null;
  const html = ready && parse && content ? parse(content) : "";
  return /* @__PURE__ */ jsx37("div", { className: "help-overlay", onMouseDown: onClose, children: /* @__PURE__ */ jsxs34("div", { className: "help-modal", onMouseDown: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs34("div", { className: "help-modal__header", children: [
      /* @__PURE__ */ jsx37("div", { className: "help-modal__title", children: "\u{1F4D6} \u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" }),
      /* @__PURE__ */ jsx37("button", { className: "help-modal__close", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C (Esc)", children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsx37("div", { className: "help-modal__body", children: loading || !html ? /* @__PURE__ */ jsx37("div", { className: "help-modal__loading", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : /* @__PURE__ */ jsx37("div", { className: "help-content", dangerouslySetInnerHTML: { __html: html } }) })
  ] }) });
}
var init_HelpModal = __esm({
  "src/web/components/modals/HelpModal.tsx"() {
    "use strict";
    init_useMarked();
  }
});

// src/web/components/modals/HotkeysModal.tsx
import React12, { useEffect as useEffect16 } from "react";
import { jsx as jsx38, jsxs as jsxs35 } from "react/jsx-runtime";
function HotkeysModal({ open, onClose }) {
  useEffect16(() => {
    if (!open)
      return;
    const onEsc = (e) => {
      if (e.key === "Escape")
        onClose();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => document.removeEventListener("keydown", onEsc, true);
  }, [open, onClose]);
  if (!open)
    return null;
  return /* @__PURE__ */ jsx38("div", { className: "help-overlay", onMouseDown: onClose, children: /* @__PURE__ */ jsxs35("div", { className: "help-modal hotkeys-modal", onMouseDown: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs35("div", { className: "help-modal__header", children: [
      /* @__PURE__ */ jsx38("div", { className: "help-modal__title", children: "\u2328\uFE0F \u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438" }),
      /* @__PURE__ */ jsx38("button", { className: "help-modal__close", onClick: onClose, children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsx38("div", { className: "hotkeys-body", children: GROUPS.map((g) => /* @__PURE__ */ jsxs35("div", { className: "hotkeys-group", children: [
      /* @__PURE__ */ jsx38("div", { className: "hotkeys-group__title", children: g.title }),
      /* @__PURE__ */ jsx38("div", { className: "hotkeys-group__items", children: g.items.map((item, i) => /* @__PURE__ */ jsxs35("div", { className: "hotkey-row", children: [
        /* @__PURE__ */ jsx38("div", { className: "hotkey-row__keys", children: item.keys.map((k, ki) => /* @__PURE__ */ jsxs35(React12.Fragment, { children: [
          ki > 0 && /* @__PURE__ */ jsx38("span", { className: "hotkey-plus", children: "+" }),
          /* @__PURE__ */ jsx38("kbd", { className: "hotkey-key", children: k })
        ] }, ki)) }),
        /* @__PURE__ */ jsx38("div", { className: "hotkey-row__label", children: item.label })
      ] }, i)) })
    ] }, g.title)) }),
    /* @__PURE__ */ jsx38("div", { className: "hotkeys-footer", children: "\u0412\u0441\u0435 \u0433\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442, \u043A\u043E\u0433\u0434\u0430 \u0444\u043E\u043A\u0443\u0441 \u043D\u0435 \u0432 \u043F\u043E\u043B\u0435 \u0432\u0432\u043E\u0434\u0430." })
  ] }) });
}
var GROUPS;
var init_HotkeysModal = __esm({
  "src/web/components/modals/HotkeysModal.tsx"() {
    "use strict";
    GROUPS = [
      {
        title: "\u041E\u0431\u0449\u0435\u0435",
        items: [
          { keys: ["Shift", "Tab"], label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u0443\u044E \u043F\u0430\u043B\u0438\u0442\u0440\u0443" },
          { keys: ["Ctrl", "K"], label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u0443\u044E \u043F\u0430\u043B\u0438\u0442\u0440\u0443 (\u0430\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u0430)" },
          { keys: ["F1"], label: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F" },
          { keys: ["?"], label: "\u042D\u0442\u043E \u043E\u043A\u043D\u043E \u0441 \u0445\u043E\u0442\u043A\u0435\u044F\u043C\u0438" },
          { keys: ["Esc"], label: "\u0421\u043D\u044F\u0442\u044C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435 / \u0437\u0430\u043A\u0440\u044B\u0442\u044C" }
        ]
      },
      {
        title: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
        items: [
          { keys: ["F"], label: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C \u0433\u0440\u0430\u0444 \u0432 \u044D\u043A\u0440\u0430\u043D" },
          { keys: ["Alt", "\u2190"], label: "\u041D\u0430\u0437\u0430\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438" },
          { keys: ["Alt", "\u2192"], label: "\u0412\u043F\u0435\u0440\u0451\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438" },
          { keys: ["Ctrl", "\u043A\u043B\u0438\u043A"], label: "\u041C\u0443\u043B\u044C\u0442\u0438\u0432\u044B\u0431\u043E\u0440 \u0443\u0437\u043B\u043E\u0432" },
          { keys: ["+"], label: "\u041F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u044C" },
          { keys: ["\u2212"], label: "\u041E\u0442\u0434\u0430\u043B\u0438\u0442\u044C" },
          { keys: ["0"], label: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u044D\u043A\u0440\u0430\u043D" }
        ]
      },
      {
        title: "\u0410\u043D\u0430\u043B\u0438\u0437",
        items: [
          { keys: ["C"], label: "\u041D\u0430\u0439\u0442\u0438 \u0446\u0438\u043A\u043B\u044B" },
          { keys: ["I"], label: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435" },
          { keys: ["S"], label: "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C" },
          { keys: ["P"], label: "\u041D\u0430\u0439\u0442\u0438 \u043F\u0443\u0442\u044C \u043C\u0435\u0436\u0434\u0443 \u0434\u0432\u0443\u043C\u044F \u0443\u0437\u043B\u0430\u043C\u0438" },
          { keys: ["B"], label: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0437\u0430\u043A\u043B\u0430\u0434\u043A\u0438" }
        ]
      },
      {
        title: "\u0412\u0438\u0434",
        items: [
          { keys: ["T"], label: "\u0421\u043A\u0440\u044B\u0442\u044C/\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B" },
          { keys: ["D"], label: "\u0421\u043A\u0440\u044B\u0442\u044C/\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u0430\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C" },
          { keys: ["E"], label: "\u0421\u043A\u0440\u044B\u0442\u044C/\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0441\u0432\u044F\u0437\u0438" }
        ]
      },
      {
        title: "\u041C\u044B\u0448\u044C\u044E",
        items: [
          { keys: ["\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A"], label: "\u0424\u043E\u043A\u0443\u0441 \u043D\u0430 \u0443\u0437\u043B\u0435" },
          { keys: ["\u041F\u0440\u0430\u0432\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430"], label: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0435 \u043C\u0435\u043D\u044E \u0443\u0437\u043B\u0430" },
          { keys: ["\u041A\u043B\u0438\u043A \u043F\u043E \u0441\u0432\u044F\u0437\u0438"], label: "\u0414\u0435\u0442\u0430\u043B\u0438 \u0441\u0432\u044F\u0437\u0438 \u0432 \u043F\u0430\u043D\u0435\u043B\u0438" },
          { keys: ["\u041A\u043B\u0438\u043A \u043F\u043E \u043F\u0443\u0441\u0442\u043E\u043C\u0443 \u043C\u0435\u0441\u0442\u0443"], label: "\u0421\u043D\u044F\u0442\u044C \u0432\u0441\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F" }
        ]
      }
    ];
  }
});

// src/web/components/common/HighlightedText.tsx
import { Fragment as Fragment3, jsx as jsx39 } from "react/jsx-runtime";
function HighlightedText({ text, query }) {
  if (text === null || text === void 0)
    return null;
  const str = String(text);
  const q = (query || "").trim();
  if (!q)
    return /* @__PURE__ */ jsx39(Fragment3, { children: str });
  const lower = str.toLowerCase();
  const qLower = q.toLowerCase();
  const parts = [];
  let pos = 0;
  let idx = lower.indexOf(qLower, pos);
  let key = 0;
  while (idx !== -1) {
    if (idx > pos)
      parts.push(str.slice(pos, idx));
    parts.push(
      /* @__PURE__ */ jsx39("mark", { className: "search-hl", children: str.slice(idx, idx + q.length) }, "m" + key++)
    );
    pos = idx + q.length;
    idx = lower.indexOf(qLower, pos);
  }
  if (pos < str.length)
    parts.push(str.slice(pos));
  return /* @__PURE__ */ jsx39(Fragment3, { children: parts });
}
var init_HighlightedText = __esm({
  "src/web/components/common/HighlightedText.tsx"() {
    "use strict";
  }
});

// src/web/components/modals/CommandPalette.tsx
import { useMemo as useMemo15, useRef as useRef10, useEffect as useEffect17 } from "react";
import { jsx as jsx40, jsxs as jsxs36 } from "react/jsx-runtime";
function CommandPalette({ commands, onOpenFile }) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const results = useSearch();
  const inputRef = useRef10(null);
  const open = store.searchOpen;
  const query = store.searchQuery;
  const index = store.searchIndex;
  useEffect17(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);
  const filteredCommands = useMemo15(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return commands;
    return commands.filter((c) => {
      const hay = ((c.label || "") + " " + (c.keywords || "") + " " + (c.section || "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }, [query, commands]);
  const commandsBySection = useMemo15(() => {
    const map = /* @__PURE__ */ new Map();
    filteredCommands.forEach((c) => {
      const s = c.section || "\u041F\u0440\u043E\u0447\u0435\u0435";
      if (!map.has(s))
        map.set(s, []);
      map.get(s).push(c);
    });
    return Array.from(map.entries());
  }, [filteredCommands]);
  const totalItems = filteredCommands.length + results.length;
  const safeIndex = Math.min(index, Math.max(totalItems - 1, 0));
  const close = () => store.setSearchOpen(false);
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      store.setSearchIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      store.setSearchIndex(Math.max(safeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (totalItems === 0)
        return;
      if (safeIndex < filteredCommands.length) {
        const cmd = filteredCommands[safeIndex];
        close();
        setTimeout(() => cmd.run && cmd.run(), 50);
      } else {
        const domainItem = results[safeIndex - filteredCommands.length];
        if (domainItem && domainItem.node) {
          goto(domainItem.node.data.domainId);
          close();
        }
      }
    }
  };
  if (!open)
    return null;
  let cmdIdx = 0;
  const domainStartIdx = filteredCommands.length;
  return /* @__PURE__ */ jsx40("div", { className: "search-overlay", onMouseDown: close, children: /* @__PURE__ */ jsxs36("div", { className: "search-modal search-modal--palette", onMouseDown: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs36("div", { className: "search-modal__input-wrap", children: [
      /* @__PURE__ */ jsx40("span", { className: "search-modal__icon", children: /* @__PURE__ */ jsx40(MIcon, { name: "search" }) }),
      /* @__PURE__ */ jsx40(
        "input",
        {
          ref: inputRef,
          className: "search-modal__input",
          type: "text",
          placeholder: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430, \u0434\u043E\u043C\u0435\u043D \u0438\u043B\u0438 FQID...",
          value: query,
          onChange: (e) => store.setSearchQuery(e.target.value),
          onKeyDown: onKey,
          autoComplete: "off",
          spellCheck: false
        }
      ),
      /* @__PURE__ */ jsx40("kbd", { className: "search-modal__kbd", children: "Esc" })
    ] }),
    /* @__PURE__ */ jsxs36("div", { className: "search-modal__results", children: [
      query.trim() === "" && filteredCommands.length === 0 && results.length === 0 && /* @__PURE__ */ jsx40("div", { className: "search-modal__hint", children: "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0438\u043C\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u0434\u043E\u043C\u0435\u043D \u0438\u043B\u0438 FQID" }),
      query.trim() !== "" && filteredCommands.length === 0 && results.length === 0 && /* @__PURE__ */ jsxs36("div", { className: "search-modal__hint", children: [
        "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB",
        query,
        "\xBB"
      ] }),
      filteredCommands.length > 0 && commandsBySection.map(([section, cmds]) => /* @__PURE__ */ jsxs36("div", { className: "palette-section", children: [
        /* @__PURE__ */ jsx40("div", { className: "palette-section__title", children: section }),
        cmds.map((cmd) => {
          const itemIdx = cmdIdx++;
          const isActive = itemIdx === safeIndex;
          return /* @__PURE__ */ jsxs36(
            "div",
            {
              className: "palette-item palette-item--command" + (isActive ? " active" : ""),
              onMouseEnter: () => store.setSearchIndex(itemIdx),
              onClick: () => {
                close();
                setTimeout(() => cmd.run && cmd.run(), 50);
              },
              children: [
                /* @__PURE__ */ jsx40("span", { className: "palette-item__icon", children: cmd.iconName ? /* @__PURE__ */ jsx40(MIcon, { name: cmd.iconName, size: "sm" }) : cmd.icon }),
                /* @__PURE__ */ jsx40("span", { className: "palette-item__label", children: cmd.label }),
                cmd.hotkey && /* @__PURE__ */ jsx40("kbd", { className: "palette-item__hotkey", children: cmd.hotkey })
              ]
            },
            "cmd-" + itemIdx
          );
        })
      ] }, "sec-" + section)),
      results.length > 0 && /* @__PURE__ */ jsxs36("div", { className: "palette-section", children: [
        /* @__PURE__ */ jsxs36("div", { className: "palette-section__title", children: [
          "\u0414\u043E\u043C\u0435\u043D\u044B (",
          results.length,
          ")"
        ] }),
        results.map((item, i) => {
          const itemIdx = domainStartIdx + i;
          const isActive = itemIdx === safeIndex;
          const n = item.node;
          const matched = new Set(item.matches.map((m) => m.field));
          return /* @__PURE__ */ jsxs36(
            "div",
            {
              className: "palette-item" + (isActive ? " active" : ""),
              onMouseEnter: () => store.setSearchIndex(itemIdx),
              onClick: () => {
                goto(n.data.domainId);
                close();
              },
              children: [
                /* @__PURE__ */ jsx40("span", { className: "palette-item__icon", children: /* @__PURE__ */ jsx40(
                  "span",
                  {
                    className: "search-result__dot search-result__dot--" + n.data.nodeType
                  }
                ) }),
                /* @__PURE__ */ jsxs36("div", { className: "palette-item__content", children: [
                  /* @__PURE__ */ jsxs36("div", { className: "search-result__id", children: [
                    /* @__PURE__ */ jsx40(HighlightedText, { text: n.data.domainId, query }),
                    matched.has("id") && /* @__PURE__ */ jsx40("span", { className: "search-result__badge", children: "id" })
                  ] }),
                  n.data.name && n.data.name !== n.data.domainId && /* @__PURE__ */ jsxs36("div", { className: "search-result__label", children: [
                    /* @__PURE__ */ jsx40(HighlightedText, { text: n.data.name, query }),
                    matched.has("name") && /* @__PURE__ */ jsx40("span", { className: "search-result__badge", children: "name" })
                  ] }),
                  n.data.description && /* @__PURE__ */ jsxs36("div", { className: "search-result__desc", children: [
                    /* @__PURE__ */ jsx40(HighlightedText, { text: n.data.description, query }),
                    matched.has("description") && /* @__PURE__ */ jsx40("span", { className: "search-result__badge", children: "description" })
                  ] }),
                  Array.isArray(n.data.tags) && n.data.tags.length > 0 && /* @__PURE__ */ jsxs36("div", { className: "search-result__tags", children: [
                    n.data.tags.slice(0, 5).map((tag, ti) => /* @__PURE__ */ jsx40("span", { className: "search-result__tag", children: /* @__PURE__ */ jsx40(HighlightedText, { text: tag, query }) }, ti)),
                    matched.has("tags") && /* @__PURE__ */ jsx40("span", { className: "search-result__badge", children: "tags" })
                  ] }),
                  (() => {
                    const fqidMatch = item.matches.find((m) => m.field === "fqid");
                    if (!fqidMatch || !Array.isArray(fqidMatch.value) || !fqidMatch.value.length) {
                      return null;
                    }
                    return /* @__PURE__ */ jsxs36("div", { className: "search-result__fqid-block", children: [
                      /* @__PURE__ */ jsxs36("div", { className: "search-result__fqid-head", children: [
                        /* @__PURE__ */ jsx40(MIcon, { name: "link", size: "sm" }),
                        /* @__PURE__ */ jsxs36("span", { children: [
                          "FQID-\u0441\u0441\u044B\u043B\u043A\u0438 (",
                          fqidMatch.value.length,
                          ")"
                        ] }),
                        /* @__PURE__ */ jsx40("span", { className: "search-result__badge", children: "fqid" })
                      ] }),
                      fqidMatch.value.slice(0, 3).map((f, fi) => /* @__PURE__ */ jsxs36(
                        "div",
                        {
                          className: "search-result__fqid-item",
                          onClick: (e) => {
                            e.stopPropagation();
                            if (onOpenFile && f.filePath) {
                              onOpenFile(f.filePath, f.fullFQID);
                              close();
                            } else {
                              goto(n.data.domainId);
                              close();
                            }
                          },
                          title: onOpenFile ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0435 \u0441 FQID" : "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0434\u043E\u043C\u0435\u043D\u0443",
                          children: [
                            /* @__PURE__ */ jsx40(HighlightedText, { text: f.fullFQID, query }),
                            f.propertyPath && /* @__PURE__ */ jsx40("span", { className: "search-result__fqid-path", children: f.propertyPath })
                          ]
                        },
                        fi
                      )),
                      fqidMatch.value.length > 3 && /* @__PURE__ */ jsxs36("div", { className: "search-result__fqid-more", children: [
                        "...\u0438 \u0435\u0449\u0451 ",
                        fqidMatch.value.length - 3
                      ] })
                    ] });
                  })()
                ] })
              ]
            },
            "dom-" + i
          );
        })
      ] })
    ] }),
    /* @__PURE__ */ jsxs36("div", { className: "search-modal__footer", children: [
      /* @__PURE__ */ jsxs36("span", { children: [
        /* @__PURE__ */ jsx40("kbd", { children: "\u2191" }),
        /* @__PURE__ */ jsx40("kbd", { children: "\u2193" }),
        " \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F"
      ] }),
      /* @__PURE__ */ jsxs36("span", { children: [
        /* @__PURE__ */ jsx40("kbd", { children: "Enter" }),
        " \u0432\u044B\u0431\u0440\u0430\u0442\u044C"
      ] }),
      /* @__PURE__ */ jsxs36("span", { children: [
        /* @__PURE__ */ jsx40("kbd", { children: "Esc" }),
        " \u0437\u0430\u043A\u0440\u044B\u0442\u044C"
      ] })
    ] })
  ] }) });
}
var init_CommandPalette = __esm({
  "src/web/components/modals/CommandPalette.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_useSearch();
    init_MIcon();
    init_HighlightedText();
  }
});

// src/web/components/modals/ValidationModal.tsx
import { useMemo as useMemo16, useState as useState7 } from "react";
import { jsx as jsx41, jsxs as jsxs37 } from "react/jsx-runtime";
function downloadFile2(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function ValidationModal(props) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const v = useValidation();
  const [scope, setScope] = useState7("all");
  const [filter, setFilter] = useState7("problems");
  const [expanded, setExpanded] = useState7(/* @__PURE__ */ new Set());
  const open = store.validationOpen;
  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id))
        s.delete(id);
      else
        s.add(id);
      return s;
    });
  };
  const filteredLogs = useMemo16(() => {
    if (filter === "all")
      return v.logs;
    if (filter === "valid")
      return v.logs.filter((l) => l.status === "valid");
    if (filter === "invalid")
      return v.logs.filter((l) => l.status === "invalid");
    if (filter === "errors")
      return v.logs.filter((l) => l.status === "error");
    return v.logs.filter((l) => l.status !== "valid" && l.status !== "skip");
  }, [v.logs, filter]);
  const startValidation = () => {
    let domains;
    if (scope === "visible")
      domains = props.visibleDomains;
    else if (scope === "bookmarked")
      domains = props.bookmarkedDomains;
    else
      domains = props.allDomains;
    setExpanded(/* @__PURE__ */ new Set());
    v.start(scope, domains.map((d) => d.domainId));
  };
  const exportJSON = () => {
    if (!v.stats)
      return;
    const data = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      stats: v.stats,
      cancelled: v.cancelled,
      results: v.logs.map((l) => ({
        domainId: l.domainId,
        status: l.status,
        diagnostics: l.diagnostics,
        error: l.error
      }))
    };
    downloadFile2(
      JSON.stringify(data, null, 2),
      "validation-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json",
      "application/json"
    );
  };
  const exportMD = () => {
    if (!v.stats)
      return;
    const md = generateValidationMarkdown(v.stats, v.cancelled, v.logs);
    downloadFile2(
      md,
      "validation-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md",
      "text/markdown;charset=utf-8"
    );
  };
  if (!open)
    return null;
  const pct = v.progress.total > 0 ? Math.round(v.progress.current / v.progress.total * 100) : 0;
  const scopeOption = (value, label, count) => /* @__PURE__ */ jsxs37("label", { className: "validation-scope__option" + (scope === value ? " active" : ""), children: [
    /* @__PURE__ */ jsx41("input", { type: "radio", checked: scope === value, onChange: () => setScope(value) }),
    /* @__PURE__ */ jsx41("span", { className: "validation-scope__radio" }),
    /* @__PURE__ */ jsx41("span", { className: "validation-scope__text", children: label }),
    /* @__PURE__ */ jsx41("span", { className: "validation-scope__count", children: count })
  ] });
  return /* @__PURE__ */ jsx41(
    "div",
    {
      className: "help-overlay",
      onMouseDown: () => {
        if (!v.running) {
          store.setValidationOpen(false);
          v.reset();
        }
      },
      children: /* @__PURE__ */ jsxs37("div", { className: "help-modal validation-modal", onMouseDown: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs37("div", { className: "help-modal__header", children: [
          /* @__PURE__ */ jsx41("div", { className: "help-modal__title", children: "\u{1F50D} \u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432" }),
          /* @__PURE__ */ jsx41(
            "button",
            {
              className: "help-modal__close",
              onClick: () => {
                if (v.running)
                  v.stop();
                else {
                  store.setValidationOpen(false);
                  v.reset();
                }
              },
              children: v.running ? "\u25A0 \u0421\u0442\u043E\u043F" : "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs37("div", { className: "validation-modal__body", children: [
          !v.started && /* @__PURE__ */ jsxs37("div", { className: "validation-scope", children: [
            /* @__PURE__ */ jsx41("div", { className: "validation-scope__label", children: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438" }),
            scopeOption("all", "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B \u0432 \u043A\u044D\u0448\u0435", props.allDomains.length),
            scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435 (\u043F\u043E\u0441\u043B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432)", props.visibleDomains.length),
            scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", props.bookmarkedDomains.length),
            /* @__PURE__ */ jsx41(
              "button",
              {
                className: "btn btn--primary",
                onClick: startValidation,
                style: { marginTop: 16, width: "100%", justifyContent: "center" },
                children: "\u25B6 \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044E"
              }
            )
          ] }),
          v.started && /* @__PURE__ */ jsxs37("div", { className: "validation-progress", children: [
            /* @__PURE__ */ jsx41("div", { className: "validation-progress__bar", children: /* @__PURE__ */ jsx41(
              "div",
              {
                className: "validation-progress__fill",
                style: { width: pct + "%" }
              }
            ) }),
            /* @__PURE__ */ jsxs37("div", { className: "validation-progress__text", children: [
              v.progress.current,
              " / ",
              v.progress.total,
              " (",
              pct,
              "%)",
              v.running ? " \u2014 \u0438\u0434\u0451\u0442 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F..." : v.cancelled ? " \u2014 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E" : " \u2014 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"
            ] })
          ] }),
          v.started && /* @__PURE__ */ jsx41("div", { className: "validation-filters", children: ["problems", "all", "invalid", "errors", "valid"].map((f) => {
            const labels = {
              problems: "\u0422\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u044B\u0435",
              all: "\u0412\u0441\u0435",
              invalid: "\u274C \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435",
              errors: "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0438",
              valid: "\u2705 \u0412\u0430\u043B\u0438\u0434\u043D\u044B\u0435"
            };
            return /* @__PURE__ */ jsx41(
              "button",
              {
                className: "validation-filter" + (filter === f ? " validation-filter--active" : ""),
                onClick: () => setFilter(f),
                children: labels[f]
              },
              f
            );
          }) }),
          v.started && /* @__PURE__ */ jsx41("div", { className: "validation-logs", children: filteredLogs.length === 0 ? /* @__PURE__ */ jsx41("div", { className: "validation-logs__empty", children: "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E \u0444\u0438\u043B\u044C\u0442\u0440\u0443" }) : filteredLogs.map((log, i) => {
            const icon = log.status === "valid" ? "\u2705" : log.status === "invalid" ? "\u274C" : "\u26A0\uFE0F";
            const isInvalid = log.status === "invalid";
            const hasDiag = isInvalid && log.diagnostics && log.diagnostics.length > 0;
            const isOpen = expanded.has(log.domainId);
            return /* @__PURE__ */ jsxs37(
              "div",
              {
                className: "validation-log validation-log--" + log.status + (isOpen ? " validation-log--open" : ""),
                children: [
                  /* @__PURE__ */ jsxs37(
                    "div",
                    {
                      className: "validation-log__head" + (hasDiag ? " validation-log__head--clickable" : ""),
                      onClick: hasDiag ? () => toggleExpanded(log.domainId) : void 0,
                      children: [
                        hasDiag && /* @__PURE__ */ jsx41("span", { className: "validation-log__chevron", children: isOpen ? "\u25BE" : "\u25B8" }),
                        /* @__PURE__ */ jsx41("span", { className: "validation-log__icon", children: icon }),
                        /* @__PURE__ */ jsx41(
                          "a",
                          {
                            className: "validation-log__domain",
                            onClick: (e) => {
                              e.stopPropagation();
                              goto(log.domainId);
                              store.setValidationOpen(false);
                            },
                            children: log.domainId
                          }
                        ),
                        isInvalid && log.diagnostics && /* @__PURE__ */ jsxs37("span", { className: "validation-log__count", children: [
                          log.diagnostics.length,
                          " ",
                          plural(log.diagnostics.length, "issue", "issues")
                        ] }),
                        log.error && /* @__PURE__ */ jsx41("span", { className: "validation-log__error", children: log.error }),
                        hasDiag && !isOpen && /* @__PURE__ */ jsx41("span", { className: "validation-log__hint", children: "\u043D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0440\u0430\u0441\u043A\u0440\u044B\u0442\u044C" })
                      ]
                    }
                  ),
                  isOpen && hasDiag && /* @__PURE__ */ jsx41("div", { className: "validation-log__diag", children: log.diagnostics.map((d, di) => /* @__PURE__ */ jsxs37("div", { className: "validation-diag", children: [
                    /* @__PURE__ */ jsx41("div", { className: "validation-diag__severity", children: d.severity }),
                    /* @__PURE__ */ jsx41("div", { className: "validation-diag__message", children: d.message }),
                    d.labels && d.labels.map((lb, li) => /* @__PURE__ */ jsxs37("div", { className: "validation-diag__label", children: [
                      lb.message,
                      lb.span && /* @__PURE__ */ jsx41("span", { className: "validation-diag__span", children: " [" + lb.span.start + "-" + lb.span.end + "]" })
                    ] }, li))
                  ] }, di)) })
                ]
              },
              i
            );
          }) })
        ] }),
        v.stats && /* @__PURE__ */ jsxs37("div", { className: "validation-footer", children: [
          /* @__PURE__ */ jsxs37("div", { className: "validation-stats", children: [
            /* @__PURE__ */ jsxs37("span", { className: "validation-stat validation-stat--ok", children: [
              "\u2705 ",
              v.stats.valid
            ] }),
            /* @__PURE__ */ jsxs37("span", { className: "validation-stat validation-stat--err", children: [
              "\u274C ",
              v.stats.invalid
            ] }),
            /* @__PURE__ */ jsxs37("span", { className: "validation-stat validation-stat--warn", children: [
              "\u26A0\uFE0F ",
              v.stats.errors
            ] }),
            /* @__PURE__ */ jsxs37("span", { className: "validation-stat", children: [
              "\u23F1 ",
              formatDuration(v.stats.elapsedMs)
            ] })
          ] }),
          /* @__PURE__ */ jsxs37("div", { className: "validation-footer__actions", children: [
            /* @__PURE__ */ jsx41("button", { className: "btn", onClick: exportJSON, children: "\u{1F4BE} JSON" }),
            /* @__PURE__ */ jsx41("button", { className: "btn", onClick: exportMD, children: "\u{1F4DD} Markdown" }),
            /* @__PURE__ */ jsx41(
              "button",
              {
                className: "btn",
                onClick: () => {
                  store.setValidationOpen(false);
                  v.reset();
                },
                children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"
              }
            )
          ] })
        ] })
      ] })
    }
  );
}
var init_ValidationModal = __esm({
  "src/web/components/modals/ValidationModal.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useValidation();
    init_useNavigation();
    init_markdown();
    init_format();
  }
});

// src/web/lib/algorithms/topological.ts
function buildDependencyGraph(nodes, edges, options = {}) {
  const includeFqid = options.includeFqid !== false;
  const includeLinkage = options.includeLinkage !== false;
  const excludedIds = options.excludedIds || /* @__PURE__ */ new Set();
  const restrictTo = options.restrictTo || null;
  const nodeById = /* @__PURE__ */ new Map();
  nodes.forEach((n) => nodeById.set(n.id, n));
  const deps = /* @__PURE__ */ new Map();
  const domainIds = /* @__PURE__ */ new Set();
  nodes.forEach((n) => {
    if (n.data.nodeType !== "domain")
      return;
    const did = n.data.domainId;
    if (excludedIds.has(did.toLowerCase()))
      return;
    if (restrictTo && !restrictTo.has(did))
      return;
    domainIds.add(did);
    deps.set(did, /* @__PURE__ */ new Set());
  });
  edges.forEach((e) => {
    const kind = e.data && e.data.kind;
    if (kind === "linkage" && !includeLinkage)
      return;
    if (kind === "fqid" && !includeFqid)
      return;
    if (kind === "aggregated")
      return;
    const srcNode = nodeById.get(e.source);
    const tgtNode = nodeById.get(e.target);
    if (!srcNode || !tgtNode)
      return;
    if (srcNode.data.nodeType !== "domain")
      return;
    const srcId = srcNode.data.domainId;
    if (!domainIds.has(srcId))
      return;
    const tgtType = tgtNode.data.nodeType;
    if (tgtType === "broken" || tgtType === "missing")
      return;
    const tgtId = tgtNode.data.domainId;
    if (!domainIds.has(tgtId))
      return;
    if (srcId === tgtId)
      return;
    deps.get(srcId).add(tgtId);
  });
  return { deps, domainIds, nodeById };
}
function topologicalSort(depGraph, options = {}) {
  const autoBreak = !!options.autoBreakCycles;
  const deps = depGraph.deps;
  const remaining = new Set(depGraph.domainIds);
  const levels = [];
  const broken = [];
  while (remaining.size > 0) {
    const ready = [];
    remaining.forEach((id) => {
      let ok = true;
      const set = deps.get(id);
      if (set) {
        set.forEach((dep) => {
          if (remaining.has(dep))
            ok = false;
        });
      }
      if (ok)
        ready.push(id);
    });
    if (ready.length === 0) {
      if (!autoBreak)
        break;
      let best = null;
      let bestCount = Infinity;
      remaining.forEach((id) => {
        let cnt = 0;
        const s2 = deps.get(id);
        if (s2)
          s2.forEach((dep) => {
            if (remaining.has(dep))
              cnt++;
          });
        if (cnt < bestCount) {
          bestCount = cnt;
          best = id;
        }
      });
      if (best == null)
        break;
      const brokenDeps = [];
      const s = deps.get(best);
      if (s) {
        s.forEach((dep) => {
          if (remaining.has(dep))
            brokenDeps.push(dep);
        });
        brokenDeps.forEach((dep) => s.delete(dep));
      }
      broken.push({ id: best, level: levels.length + 1, brokenDeps });
      remaining.delete(best);
      levels.push([best]);
      continue;
    }
    ready.forEach((id) => remaining.delete(id));
    levels.push(ready.sort());
  }
  const cyclic = Array.from(remaining).sort();
  return {
    levels,
    cyclic,
    criticalPath: levels.length,
    broken
  };
}
function findDeps(domainId, levelMap, edges, nodes) {
  const nodeById = /* @__PURE__ */ new Map();
  nodes.forEach((n) => nodeById.set(n.id, n));
  const set = /* @__PURE__ */ new Set();
  edges.forEach((e) => {
    const s = nodeById.get(e.source);
    if (!s || s.data.nodeType !== "domain")
      return;
    if (s.data.domainId !== domainId)
      return;
    const t = nodeById.get(e.target);
    if (!t || t.data.nodeType !== "domain")
      return;
    if (!levelMap.has(t.data.domainId))
      return;
    set.add(t.data.domainId);
  });
  return Array.from(set).sort();
}
var init_topological = __esm({
  "src/web/lib/algorithms/topological.ts"() {
    "use strict";
  }
});

// src/web/components/modals/TopoSortModal.tsx
import { useCallback as useCallback8, useEffect as useEffect18, useState as useState8 } from "react";
import { Fragment as Fragment4, jsx as jsx42, jsxs as jsxs38 } from "react/jsx-runtime";
function downloadFile3(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function TopoSortModal(props) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const [scope, setScope] = useState8("all");
  const [includeFqid, setIncludeFqid] = useState8(true);
  const [includeLinkage, setIncludeLinkage] = useState8(true);
  const [missingAsSatisfied, setMissingAsSatisfied] = useState8(true);
  const [excludePattern, setExcludePattern] = useState8("");
  const [autoBreak, setAutoBreak] = useState8(false);
  const [result, setResult] = useState8(null);
  const [expandedLevels, setExpandedLevels] = useState8(/* @__PURE__ */ new Set());
  const [expandedDeps, setExpandedDeps] = useState8(/* @__PURE__ */ new Set());
  const open = store.topoOpen;
  useEffect18(() => {
    if (!open) {
      setResult(null);
      setExpandedLevels(/* @__PURE__ */ new Set());
      setExpandedDeps(/* @__PURE__ */ new Set());
    }
  }, [open]);
  const build = useCallback8(() => {
    const nodeSet = scope === "visible" ? props.visibleDomains : scope === "bookmarked" ? props.bookmarkedDomains : props.allDomains;
    const restrictTo = new Set(nodeSet.map((d) => d.domainId));
    const excludedIds = /* @__PURE__ */ new Set();
    const tokens = excludePattern.replace(/[,;]/g, " ").split(" ").filter((t) => t.length > 0);
    if (tokens.length > 0) {
      store.nodes.forEach((n) => {
        if (n.data.nodeType !== "domain")
          return;
        for (const t of tokens) {
          if (simplePatternMatch(n.data.domainId.toLowerCase(), t.toLowerCase())) {
            excludedIds.add(n.data.domainId.toLowerCase());
            return;
          }
        }
      });
    }
    const depGraph = buildDependencyGraph(store.nodes, store.edges, {
      includeFqid,
      includeLinkage,
      missingAsSatisfied,
      excludedIds,
      restrictTo
    });
    const sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });
    const levelMap = /* @__PURE__ */ new Map();
    sorted.levels.forEach((level, idx) => {
      level.forEach((id) => levelMap.set(id, idx + 1));
    });
    setResult({
      levels: sorted.levels,
      cyclic: sorted.cyclic,
      broken: sorted.broken,
      criticalPath: sorted.criticalPath,
      levelMap,
      stats: {
        total: depGraph.domainIds.size,
        levels: sorted.levels.length,
        cyclic: sorted.cyclic.length,
        criticalPath: sorted.criticalPath,
        excluded: excludedIds.size,
        brokenCount: sorted.broken.length
      }
    });
  }, [
    autoBreak,
    scope,
    includeFqid,
    includeLinkage,
    missingAsSatisfied,
    excludePattern,
    store.nodes,
    store.edges,
    props
  ]);
  const exportJSON = () => {
    if (!result)
      return;
    downloadFile3(
      JSON.stringify(
        {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          scope,
          options: { includeFqid, includeLinkage, missingAsSatisfied, excludePattern },
          criticalPath: result.criticalPath,
          stats: result.stats,
          levels: result.levels,
          cyclic: result.cyclic,
          broken: result.broken
        },
        null,
        2
      ),
      "topo-sort-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json",
      "application/json"
    );
  };
  const exportMD = () => {
    if (!result)
      return;
    const lines = [];
    lines.push("# \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432");
    lines.push("");
    lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
    lines.push("");
    lines.push("## \u0421\u0432\u043E\u0434\u043A\u0430");
    lines.push("");
    lines.push("| \u041C\u0435\u0442\u0440\u0438\u043A\u0430 | \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 |");
    lines.push("| --- | ---: |");
    lines.push("| \u0412\u0441\u0435\u0433\u043E \u0434\u043E\u043C\u0435\u043D\u043E\u0432 | " + result.stats.total + " |");
    lines.push("| \u0423\u0440\u043E\u0432\u043D\u0435\u0439 | " + result.stats.levels + " |");
    lines.push("| \u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u0443\u0442\u044C | " + result.stats.criticalPath + " |");
    lines.push("| \u0412 \u0446\u0438\u043A\u043B\u0430\u0445 | " + result.stats.cyclic + " |");
    lines.push("");
    result.levels.forEach((level, idx) => {
      lines.push("## \u0423\u0440\u043E\u0432\u0435\u043D\u044C " + (idx + 1) + " (" + level.length + ")");
      lines.push("");
      level.forEach((id) => lines.push("- `" + id + "`"));
      lines.push("");
    });
    if (result.broken.length > 0) {
      lines.push("## \u0420\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043D\u044B\u0435 \u0446\u0438\u043A\u043B\u044B");
      lines.push("");
      result.broken.forEach((b) => {
        lines.push("- `" + b.id + "` (\u0443\u0440\u043E\u0432\u0435\u043D\u044C " + b.level + ")");
        b.brokenDeps.forEach((d) => lines.push("  - `" + d + "`"));
      });
      lines.push("");
    }
    if (result.cyclic.length > 0) {
      lines.push("## \u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430");
      lines.push("");
      result.cyclic.forEach((id) => lines.push("- `" + id + "`"));
      lines.push("");
    }
    downloadFile3(
      lines.join("\n"),
      "topo-sort-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md",
      "text/markdown;charset=utf-8"
    );
  };
  const copyAsText = () => {
    if (!result)
      return;
    const lines = [];
    result.levels.forEach((level, idx) => {
      lines.push("# \u0423\u0440\u043E\u0432\u0435\u043D\u044C " + (idx + 1));
      level.forEach((id) => lines.push(id));
      lines.push("");
    });
    if (result.cyclic.length > 0) {
      lines.push("# \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435");
      result.cyclic.forEach((id) => lines.push(id));
    }
    navigator.clipboard.writeText(lines.join("\n"));
  };
  const toggleLevel = (idx) => {
    setExpandedLevels((prev) => {
      const s = new Set(prev);
      if (s.has(idx))
        s.delete(idx);
      else
        s.add(idx);
      return s;
    });
  };
  const toggleDeps = (id) => {
    setExpandedDeps((prev) => {
      const s = new Set(prev);
      if (s.has(id))
        s.delete(id);
      else
        s.add(id);
      return s;
    });
  };
  const scopeOption = (value, label, count) => /* @__PURE__ */ jsxs38("label", { className: "validation-scope__option" + (scope === value ? " active" : ""), children: [
    /* @__PURE__ */ jsx42("input", { type: "radio", checked: scope === value, onChange: () => setScope(value) }),
    /* @__PURE__ */ jsx42("span", { className: "validation-scope__radio" }),
    /* @__PURE__ */ jsx42("span", { className: "validation-scope__text", children: label }),
    /* @__PURE__ */ jsx42("span", { className: "validation-scope__count", children: count })
  ] });
  if (!open)
    return null;
  return /* @__PURE__ */ jsx42("div", { className: "help-overlay", onMouseDown: () => store.setTopoOpen(false), children: /* @__PURE__ */ jsxs38("div", { className: "help-modal topo-modal", onMouseDown: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs38("div", { className: "help-modal__header", children: [
      /* @__PURE__ */ jsx42("div", { className: "help-modal__title", children: "\u{1F4E6} \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432" }),
      /* @__PURE__ */ jsx42("button", { className: "help-modal__close", onClick: () => store.setTopoOpen(false), children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsxs38("div", { className: "validation-modal__body", children: [
      !result && /* @__PURE__ */ jsxs38("div", { className: "validation-scope", children: [
        /* @__PURE__ */ jsx42("div", { className: "validation-scope__label", children: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C" }),
        scopeOption("all", "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B", props.allDomains.length),
        scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435", props.visibleDomains.length),
        scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", props.bookmarkedDomains.length),
        /* @__PURE__ */ jsx42("div", { className: "validation-scope__label", style: { marginTop: 16 }, children: "\u0423\u0447\u0438\u0442\u044B\u0432\u0430\u0442\u044C \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438" }),
        /* @__PURE__ */ jsxs38("label", { className: "menu__checkbox", children: [
          /* @__PURE__ */ jsx42(
            "input",
            {
              type: "checkbox",
              checked: includeFqid,
              onChange: () => setIncludeFqid(!includeFqid)
            }
          ),
          /* @__PURE__ */ jsx42("span", { className: "menu__check" }),
          /* @__PURE__ */ jsx42("span", { className: "menu__text", children: "FQID-\u0441\u0441\u044B\u043B\u043A\u0438" })
        ] }),
        /* @__PURE__ */ jsxs38("label", { className: "menu__checkbox", children: [
          /* @__PURE__ */ jsx42(
            "input",
            {
              type: "checkbox",
              checked: includeLinkage,
              onChange: () => setIncludeLinkage(!includeLinkage)
            }
          ),
          /* @__PURE__ */ jsx42("span", { className: "menu__check" }),
          /* @__PURE__ */ jsx42("span", { className: "menu__text", children: "Linkage-\u0441\u0432\u044F\u0437\u0438" })
        ] }),
        /* @__PURE__ */ jsxs38("label", { className: "menu__checkbox", children: [
          /* @__PURE__ */ jsx42(
            "input",
            {
              type: "checkbox",
              checked: missingAsSatisfied,
              onChange: () => setMissingAsSatisfied(!missingAsSatisfied)
            }
          ),
          /* @__PURE__ */ jsx42("span", { className: "menu__check" }),
          /* @__PURE__ */ jsx42("span", { className: "menu__text", children: "Missing-\u0434\u043E\u043C\u0435\u043D\u044B \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u043C\u0438" })
        ] }),
        /* @__PURE__ */ jsxs38("label", { className: "menu__checkbox", children: [
          /* @__PURE__ */ jsx42(
            "input",
            {
              type: "checkbox",
              checked: autoBreak,
              onChange: () => setAutoBreak(!autoBreak)
            }
          ),
          /* @__PURE__ */ jsx42("span", { className: "menu__check" }),
          /* @__PURE__ */ jsx42("span", { className: "menu__text", children: "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0440\u0430\u0437\u0440\u044B\u0432\u0430\u0442\u044C \u0446\u0438\u043A\u043B\u044B" })
        ] }),
        /* @__PURE__ */ jsx42("div", { className: "menu__hint", children: autoBreak ? "\u0414\u043E\u043C\u0435\u043D\u044B \u0441 \u0446\u0438\u043A\u043B\u043E\u043C \u0431\u0443\u0434\u0443\u0442 \u0440\u0430\u0437\u043C\u0435\u0449\u0435\u043D\u044B \u0432 \u043F\u043E\u0440\u044F\u0434\u043A\u0435, \u0430 \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u0432\u044F\u0437\u0438 \u2014 \u043F\u043E\u043C\u0435\u0447\u0435\u043D\u044B." : "\u0414\u043E\u043C\u0435\u043D\u044B \u0441 \u0446\u0438\u043A\u043B\u043E\u043C \u043F\u043E\u043F\u0430\u0434\u0443\u0442 \u0432 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0431\u043B\u043E\u043A \xAB\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430\xBB." }),
        /* @__PURE__ */ jsx42("div", { className: "validation-scope__label", style: { marginTop: 16 }, children: "\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043E\u043C\u0435\u043D\u044B \u043F\u043E \u043C\u0430\u0441\u043A\u0435" }),
        /* @__PURE__ */ jsx42(
          "input",
          {
            className: "menu__input",
            type: "text",
            placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: *.settings.*",
            value: excludePattern,
            onChange: (e) => setExcludePattern(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx42(
          "button",
          {
            className: "btn btn--primary",
            onClick: build,
            style: { marginTop: 20, width: "100%", justifyContent: "center" },
            children: "\u25B6 \u041F\u043E\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u043E\u0440\u044F\u0434\u043E\u043A"
          }
        )
      ] }),
      result && /* @__PURE__ */ jsxs38("div", { className: "topo-result", children: [
        (result.cyclic.length > 0 || result.broken.length > 0) && /* @__PURE__ */ jsxs38("div", { className: "topo-cyclic", children: [
          result.cyclic.length > 0 && /* @__PURE__ */ jsxs38(Fragment4, { children: [
            /* @__PURE__ */ jsxs38("div", { className: "topo-cyclic__header", children: [
              /* @__PURE__ */ jsx42("span", { className: "topo-cyclic__icon", children: "\u26A0\uFE0F" }),
              /* @__PURE__ */ jsxs38("span", { children: [
                "\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u2014 \u0446\u0438\u043A\u043B (",
                result.cyclic.length,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ jsx42("div", { className: "topo-cyclic__body", children: result.cyclic.map((id) => /* @__PURE__ */ jsx42(
              "a",
              {
                className: "validation-log__domain",
                onClick: () => {
                  goto(id);
                  store.setTopoOpen(false);
                },
                children: id
              },
              id
            )) })
          ] }),
          result.cyclic.length === 0 && result.broken.length > 0 && /* @__PURE__ */ jsxs38(Fragment4, { children: [
            /* @__PURE__ */ jsxs38("div", { className: "topo-cyclic__header topo-cyclic__header--broken", children: [
              /* @__PURE__ */ jsx42("span", { className: "topo-cyclic__icon", children: "\u{1F517}" }),
              /* @__PURE__ */ jsxs38("span", { children: [
                "\u0426\u0438\u043A\u043B\u044B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 (",
                result.broken.length,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ jsx42("div", { className: "topo-cyclic__body", children: result.broken.map((b) => /* @__PURE__ */ jsxs38("div", { className: "topo-broken-item", children: [
              /* @__PURE__ */ jsx42(
                "a",
                {
                  className: "validation-log__domain",
                  onClick: () => {
                    goto(b.id);
                    store.setTopoOpen(false);
                  },
                  children: b.id
                }
              ),
              /* @__PURE__ */ jsxs38("span", { className: "topo-broken-item__meta", children: [
                "L",
                b.level
              ] }),
              b.brokenDeps.length > 0 && /* @__PURE__ */ jsxs38(
                "span",
                {
                  className: "topo-broken-item__deps",
                  title: "\u0420\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u044B \u0441\u0432\u044F\u0437\u0438 \u0441: " + b.brokenDeps.join(", "),
                  children: [
                    "\u21AF",
                    b.brokenDeps.length
                  ]
                }
              )
            ] }, b.id)) })
          ] })
        ] }),
        result.levels.map((level, idx) => {
          const isOpen = expandedLevels.has(idx);
          return /* @__PURE__ */ jsxs38(
            "div",
            {
              className: "topo-level" + (isOpen ? " topo-level--open" : ""),
              children: [
                /* @__PURE__ */ jsxs38("div", { className: "topo-level__header", onClick: () => toggleLevel(idx), children: [
                  /* @__PURE__ */ jsx42("span", { className: "validation-log__chevron", children: isOpen ? "\u25BE" : "\u25B8" }),
                  /* @__PURE__ */ jsx42("span", { className: "topo-level__badge", children: idx + 1 }),
                  /* @__PURE__ */ jsxs38("span", { className: "topo-level__title", children: [
                    "\u0423\u0440\u043E\u0432\u0435\u043D\u044C ",
                    idx + 1
                  ] }),
                  /* @__PURE__ */ jsxs38("span", { className: "topo-level__count", children: [
                    level.length,
                    " ",
                    level.length === 1 ? "\u0434\u043E\u043C\u0435\u043D" : level.length < 5 ? "\u0434\u043E\u043C\u0435\u043D\u0430" : "\u0434\u043E\u043C\u0435\u043D\u043E\u0432"
                  ] })
                ] }),
                isOpen && /* @__PURE__ */ jsx42("div", { className: "topo-level__body", children: level.map((id) => {
                  const isDepsOpen = expandedDeps.has(id);
                  const deps = findDeps(id, result.levelMap, store.edges, store.nodes);
                  const brokenInfo = result.broken.find((b) => b.id === id);
                  return /* @__PURE__ */ jsxs38(
                    "div",
                    {
                      className: "topo-domain" + (brokenInfo ? " topo-domain--broken" : ""),
                      children: [
                        /* @__PURE__ */ jsxs38("div", { className: "topo-domain__head", children: [
                          deps.length > 0 ? /* @__PURE__ */ jsx42(
                            "span",
                            {
                              className: "validation-log__chevron",
                              style: { cursor: "pointer" },
                              onClick: () => toggleDeps(id),
                              children: isDepsOpen ? "\u25BE" : "\u25B8"
                            }
                          ) : /* @__PURE__ */ jsx42("span", { className: "validation-log__chevron", children: " " }),
                          /* @__PURE__ */ jsx42(
                            "a",
                            {
                              className: "validation-log__domain",
                              onClick: () => {
                                goto(id);
                                store.setTopoOpen(false);
                              },
                              children: id
                            }
                          ),
                          brokenInfo && /* @__PURE__ */ jsx42(
                            "span",
                            {
                              className: "topo-broken-badge",
                              title: "\u0426\u0438\u043A\u043B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D. \u041E\u0442\u0440\u0435\u0437\u0430\u043D\u044B: " + brokenInfo.brokenDeps.join(", "),
                              children: "\u26A0\uFE0F \u0446\u0438\u043A\u043B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D"
                            }
                          )
                        ] }),
                        isDepsOpen && deps.length > 0 && /* @__PURE__ */ jsx42("div", { className: "topo-domain__deps", children: deps.map((dep) => /* @__PURE__ */ jsxs38("div", { className: "topo-dep", children: [
                          /* @__PURE__ */ jsxs38("span", { className: "topo-dep__level", children: [
                            "L",
                            result.levelMap.get(dep)
                          ] }),
                          /* @__PURE__ */ jsx42(
                            "a",
                            {
                              className: "validation-log__domain",
                              onClick: () => {
                                goto(dep);
                                store.setTopoOpen(false);
                              },
                              children: dep
                            }
                          )
                        ] }, dep)) })
                      ]
                    },
                    id
                  );
                }) })
              ]
            },
            idx
          );
        })
      ] })
    ] }),
    result && /* @__PURE__ */ jsxs38("div", { className: "validation-footer", children: [
      /* @__PURE__ */ jsxs38("div", { className: "validation-stats", children: [
        /* @__PURE__ */ jsxs38("span", { className: "validation-stat", children: [
          "\u{1F4E6} ",
          result.stats.total
        ] }),
        /* @__PURE__ */ jsxs38("span", { className: "validation-stat validation-stat--ok", children: [
          "\u{1F4CA} ",
          result.stats.levels,
          " \u0443\u0440\u043E\u0432\u043D\u0435\u0439"
        ] }),
        /* @__PURE__ */ jsxs38("span", { className: "validation-stat validation-stat--warn", children: [
          "\u23F1 ",
          result.stats.criticalPath,
          " \u0448\u0430\u0433\u043E\u0432"
        ] }),
        result.stats.brokenCount > 0 && /* @__PURE__ */ jsxs38("span", { className: "validation-stat validation-stat--warn", children: [
          "\u{1F517} ",
          result.stats.brokenCount,
          " \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043E"
        ] }),
        result.stats.cyclic > 0 && /* @__PURE__ */ jsxs38("span", { className: "validation-stat validation-stat--err", children: [
          "\u26A0\uFE0F ",
          result.stats.cyclic,
          " \u0446\u0438\u043A\u043B."
        ] })
      ] }),
      /* @__PURE__ */ jsxs38("div", { className: "validation-footer__actions", children: [
        /* @__PURE__ */ jsx42(
          "button",
          {
            className: "btn",
            onClick: () => {
              store.setTopoLevelMap(result.levelMap);
              store.setTopoOpen(false);
            },
            children: "\u{1F3A8} \u041D\u0430 \u0433\u0440\u0430\u0444\u0435"
          }
        ),
        /* @__PURE__ */ jsx42("button", { className: "btn", onClick: copyAsText, children: "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }),
        /* @__PURE__ */ jsx42("button", { className: "btn", onClick: exportJSON, children: "\u{1F4BE} JSON" }),
        /* @__PURE__ */ jsx42("button", { className: "btn", onClick: exportMD, children: "\u{1F4DD} MD" }),
        /* @__PURE__ */ jsx42("button", { className: "btn", onClick: () => setResult(null), children: "\u2190 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" })
      ] })
    ] })
  ] }) });
}
var init_TopoSortModal = __esm({
  "src/web/components/modals/TopoSortModal.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_topological();
    init_namespace_filter();
  }
});

// src/web/lib/algorithms/learning-path.ts
function computeLearningPath(nodes, edges) {
  const nodeById = /* @__PURE__ */ new Map();
  nodes.forEach((n) => nodeById.set(n.id, n));
  const domainNodes = nodes.filter((n) => n.data.nodeType === "domain");
  const fanIn = /* @__PURE__ */ new Map();
  const fanOut = /* @__PURE__ */ new Map();
  domainNodes.forEach((n) => {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  });
  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target))
      return;
    if (fanOut.has(e.source))
      fanOut.set(e.source, fanOut.get(e.source) + 1);
    if (fanIn.has(e.target))
      fanIn.set(e.target, fanIn.get(e.target) + 1);
  });
  const entryPoints = domainNodes.filter((n) => {
    const fi = fanIn.get(n.id) || 0;
    const fo = fanOut.get(n.id) || 0;
    return fi === 0 && fo > 0;
  });
  const deps = /* @__PURE__ */ new Map();
  domainNodes.forEach((n) => deps.set(n.id, /* @__PURE__ */ new Set()));
  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target))
      return;
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (src.data.nodeType !== "domain" || tgt.data.nodeType !== "domain")
      return;
    if (src.id === tgt.id)
      return;
    deps.get(src.id).add(tgt.id);
  });
  const remaining = new Set(domainNodes.map((n) => n.id));
  const stages = [];
  while (remaining.size > 0) {
    const stage = [];
    remaining.forEach((id) => {
      let ready = true;
      deps.get(id).forEach((dep) => {
        if (remaining.has(dep))
          ready = false;
      });
      if (ready)
        stage.push(id);
    });
    if (stage.length === 0)
      break;
    stage.forEach((id) => remaining.delete(id));
    stage.sort((a, b) => (fanIn.get(b) || 0) - (fanIn.get(a) || 0));
    stages.push(stage);
  }
  const unresolved = Array.from(remaining);
  function enrich(id) {
    const n = nodeById.get(id);
    if (!n)
      return null;
    return {
      id,
      domainId: n.data.domainId,
      label: n.data.label,
      description: n.data.description,
      tags: n.data.tags || [],
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOut.get(id) || 0,
      entitiesCount: n.data.entitiesCount,
      fqidRefsCount: (n.data.fqidRefs || []).length
    };
  }
  const enrichedStages = stages.map((stage, idx) => ({
    index: idx,
    domains: stage.map(enrich).filter((x) => x !== null)
  }));
  return {
    entryPoints: entryPoints.map((n) => enrich(n.id)).filter((x) => x !== null),
    stages: enrichedStages,
    totalStages: stages.length,
    totalDomains: domainNodes.length,
    unresolved: unresolved.map(enrich).filter((x) => x !== null)
  };
}
var init_learning_path = __esm({
  "src/web/lib/algorithms/learning-path.ts"() {
    "use strict";
  }
});

// src/web/components/modals/LearningPathModal.tsx
import { useCallback as useCallback9, useEffect as useEffect19, useState as useState9 } from "react";
import { jsx as jsx43, jsxs as jsxs39 } from "react/jsx-runtime";
function downloadFile4(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function LearningPathModal(props) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const [scope, setScope] = useState9("all");
  const [path, setPath] = useState9(null);
  const [expandedStages, setExpandedStages] = useState9(/* @__PURE__ */ new Set([0]));
  const open = store.learningPathOpen;
  useEffect19(() => {
    if (!open) {
      setPath(null);
      setExpandedStages(/* @__PURE__ */ new Set([0]));
    }
  }, [open]);
  const build = useCallback9(() => {
    let restrictTo = null;
    if (scope === "visible") {
      restrictTo = new Set(props.visibleDomains.map((d) => d.id));
    } else if (scope === "bookmarked") {
      restrictTo = new Set(props.bookmarkedDomains.map((d) => d.id));
    }
    let nodes = store.nodes;
    let edges = store.edges;
    if (restrictTo) {
      nodes = store.nodes.filter(
        (n) => restrictTo.has(n.id) || n.data.nodeType !== "domain"
      );
      edges = store.edges.filter(
        (e) => restrictTo.has(e.source) && restrictTo.has(e.target)
      );
    }
    setPath(computeLearningPath(nodes, edges));
  }, [scope, store.nodes, store.edges, props]);
  const exportMD = () => {
    if (!path)
      return;
    const md = generateLearningPathMarkdown(path, {
      scope: scope === "all" ? "\u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : scope === "visible" ? "\u0432\u0438\u0434\u0438\u043C\u044B\u0435" : "\u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435"
    });
    downloadFile4(
      md,
      "learning-path-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md",
      "text/markdown;charset=utf-8"
    );
  };
  const exportJSON = () => {
    if (!path)
      return;
    downloadFile4(
      JSON.stringify(path, null, 2),
      "learning-path-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json",
      "application/json"
    );
  };
  const copyAsText = () => {
    if (!path)
      return;
    const lines = [];
    lines.push("\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F (" + path.totalStages + " \u044D\u0442\u0430\u043F\u043E\u0432):");
    path.stages.forEach((stage) => {
      lines.push("");
      lines.push("\u2014 \u042D\u0442\u0430\u043F " + (stage.index + 1) + " \u2014");
      stage.domains.forEach((d) => lines.push("  " + d.domainId));
    });
    navigator.clipboard.writeText(lines.join("\n"));
  };
  const toggleStage = (idx) => {
    setExpandedStages((prev) => {
      const s = new Set(prev);
      if (s.has(idx))
        s.delete(idx);
      else
        s.add(idx);
      return s;
    });
  };
  const scopeOption = (value, label, count) => /* @__PURE__ */ jsxs39("label", { className: "validation-scope__option" + (scope === value ? " active" : ""), children: [
    /* @__PURE__ */ jsx43("input", { type: "radio", checked: scope === value, onChange: () => setScope(value) }),
    /* @__PURE__ */ jsx43("span", { className: "validation-scope__radio" }),
    /* @__PURE__ */ jsx43("span", { className: "validation-scope__text", children: label }),
    /* @__PURE__ */ jsx43("span", { className: "validation-scope__count", children: count })
  ] });
  if (!open)
    return null;
  return /* @__PURE__ */ jsx43("div", { className: "help-overlay", onMouseDown: () => store.setLearningPathOpen(false), children: /* @__PURE__ */ jsxs39(
    "div",
    {
      className: "help-modal learning-path-modal",
      onMouseDown: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxs39("div", { className: "help-modal__header", children: [
          /* @__PURE__ */ jsx43("div", { className: "help-modal__title", children: "\u{1F4D6} \u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B" }),
          /* @__PURE__ */ jsx43(
            "button",
            {
              className: "help-modal__close",
              onClick: () => store.setLearningPathOpen(false),
              children: "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs39("div", { className: "validation-modal__body", children: [
          !path && /* @__PURE__ */ jsxs39("div", { className: "validation-scope", children: [
            /* @__PURE__ */ jsx43("div", { className: "validation-scope__label", children: "\u041E\u0431\u043B\u0430\u0441\u0442\u044C" }),
            scopeOption(
              "all",
              "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B",
              store.nodes.filter((n) => n.data.nodeType === "domain").length
            ),
            scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435", props.visibleDomains.length),
            scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", props.bookmarkedDomains.length),
            /* @__PURE__ */ jsxs39("div", { className: "learning-path-hint", style: { marginTop: 20 }, children: [
              /* @__PURE__ */ jsx43("div", { className: "learning-path-hint__title", children: "\u0427\u0442\u043E \u044D\u0442\u043E \u0434\u0430\u0451\u0442" }),
              /* @__PURE__ */ jsxs39("ul", { className: "learning-path-hint__list", children: [
                /* @__PURE__ */ jsx43("li", { children: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0447\u0442\u0435\u043D\u0438\u044F \u2014 \u043E\u0442 \xAB\u0444\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442\u0430\xBB \u043A \u0432\u0435\u0440\u0445\u043D\u0438\u043C \u0441\u043B\u043E\u044F\u043C, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438 \u0431\u044B\u043B\u0438 \u043F\u043E\u043D\u044F\u0442\u043D\u044B \u0441 \u0441\u0430\u043C\u043E\u0433\u043E \u043D\u0430\u0447\u0430\u043B\u0430." }),
                /* @__PURE__ */ jsx43("li", { children: "\u0422\u043E\u0447\u043A\u0438 \u0432\u0445\u043E\u0434\u0430 \u2014 \u0434\u043E\u043C\u0435\u043D\u044B, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442: \u043E\u043D\u0438 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0432\u0435\u0440\u0445\u043D\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F." }),
                /* @__PURE__ */ jsx43("li", { children: "\u041A\u0430\u043C\u0435\u0440\u0430 \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u0438 \u0432\u0435\u0434\u0451\u0442 \u043F\u043E \u044D\u0442\u0430\u043F\u0430\u043C, \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0434\u043E\u043C\u0435\u043D\u0443." })
              ] })
            ] }),
            /* @__PURE__ */ jsx43(
              "button",
              {
                className: "btn btn--primary",
                onClick: build,
                style: { marginTop: 20, width: "100%", justifyContent: "center" },
                children: "\u25B6 \u041F\u043E\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F"
              }
            )
          ] }),
          path && /* @__PURE__ */ jsxs39("div", { className: "topo-result", children: [
            path.entryPoints.length > 0 && /* @__PURE__ */ jsxs39("div", { className: "learning-entry-points", children: [
              /* @__PURE__ */ jsxs39("div", { className: "learning-entry-points__header", children: [
                /* @__PURE__ */ jsx43("span", { className: "learning-entry-points__icon", children: "\u{1F6AA}" }),
                /* @__PURE__ */ jsxs39("span", { children: [
                  "\u0422\u043E\u0447\u043A\u0438 \u0432\u0445\u043E\u0434\u0430 (",
                  path.entryPoints.length,
                  ")"
                ] }),
                /* @__PURE__ */ jsx43("span", { className: "learning-entry-points__hint", children: "\u2014 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u043D\u0438\u0445, \u043D\u043E \u043E\u043D\u0438 \u0437\u0430\u0432\u0438\u0441\u044F\u0442 \u043E\u0442 \u0434\u0440\u0443\u0433\u0438\u0445" })
              ] }),
              /* @__PURE__ */ jsxs39("div", { className: "learning-entry-points__body", children: [
                path.entryPoints.slice(0, 12).map((d) => /* @__PURE__ */ jsx43(
                  "a",
                  {
                    className: "validation-log__domain",
                    onClick: () => {
                      goto(d.domainId);
                      store.setLearningPathOpen(false);
                    },
                    children: d.domainId
                  },
                  d.id
                )),
                path.entryPoints.length > 12 && /* @__PURE__ */ jsxs39("span", { style: { fontSize: 11, color: "var(--text-500)" }, children: [
                  "...\u0438 \u0435\u0449\u0451 ",
                  path.entryPoints.length - 12
                ] })
              ] })
            ] }),
            path.stages.map((stage) => {
              const isOpen = expandedStages.has(stage.index);
              return /* @__PURE__ */ jsxs39(
                "div",
                {
                  className: "topo-level" + (isOpen ? " topo-level--open" : ""),
                  children: [
                    /* @__PURE__ */ jsxs39(
                      "div",
                      {
                        className: "topo-level__header",
                        onClick: () => toggleStage(stage.index),
                        children: [
                          /* @__PURE__ */ jsx43("span", { className: "validation-log__chevron", children: isOpen ? "\u25BE" : "\u25B8" }),
                          /* @__PURE__ */ jsx43("span", { className: "topo-level__badge learning-path-stage-badge", children: stage.index + 1 }),
                          /* @__PURE__ */ jsxs39("span", { className: "topo-level__title", children: [
                            "\u042D\u0442\u0430\u043F ",
                            stage.index + 1
                          ] }),
                          /* @__PURE__ */ jsxs39("span", { className: "topo-level__count", children: [
                            stage.domains.length,
                            " ",
                            plural(stage.domains.length, "\u0434\u043E\u043C\u0435\u043D", "\u0434\u043E\u043C\u0435\u043D\u043E\u0432")
                          ] })
                        ]
                      }
                    ),
                    isOpen && /* @__PURE__ */ jsx43("div", { className: "topo-level__body learning-stage-body", children: stage.domains.map((d) => /* @__PURE__ */ jsxs39("div", { className: "learning-domain-card", children: [
                      /* @__PURE__ */ jsxs39("div", { className: "learning-domain-card__head", children: [
                        /* @__PURE__ */ jsx43(
                          "a",
                          {
                            className: "validation-log__domain",
                            onClick: () => {
                              goto(d.domainId);
                              store.setLearningPathOpen(false);
                            },
                            children: d.domainId
                          }
                        ),
                        d.label && d.label !== d.domainId && /* @__PURE__ */ jsx43("span", { className: "learning-domain-card__label", children: d.label })
                      ] }),
                      d.description && /* @__PURE__ */ jsx43("div", { className: "learning-domain-card__desc", children: d.description }),
                      /* @__PURE__ */ jsxs39("div", { className: "learning-domain-card__stats", children: [
                        d.fanIn > 0 && /* @__PURE__ */ jsxs39("span", { className: "learning-domain-stat", children: [
                          /* @__PURE__ */ jsx43("span", { className: "learning-domain-stat__icon", children: "\u2191" }),
                          d.fanIn,
                          " \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
                        ] }),
                        d.fanOut > 0 && /* @__PURE__ */ jsxs39("span", { className: "learning-domain-stat", children: [
                          /* @__PURE__ */ jsx43("span", { className: "learning-domain-stat__icon", children: "\u2193" }),
                          d.fanOut,
                          " \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
                        ] }),
                        d.entitiesCount != null && /* @__PURE__ */ jsxs39("span", { className: "learning-domain-stat", children: [
                          d.entitiesCount,
                          " entities"
                        ] }),
                        d.tags && d.tags.length > 0 && /* @__PURE__ */ jsx43("span", { className: "learning-domain-stat learning-domain-stat--tags", children: d.tags.slice(0, 4).join(", ") })
                      ] })
                    ] }, d.id)) })
                  ]
                },
                stage.index
              );
            }),
            path.unresolved.length > 0 && /* @__PURE__ */ jsxs39("div", { className: "topo-cyclic", children: [
              /* @__PURE__ */ jsxs39("div", { className: "topo-cyclic__header", children: [
                /* @__PURE__ */ jsx43("span", { className: "topo-cyclic__icon", children: "\u26A0\uFE0F" }),
                /* @__PURE__ */ jsxs39("span", { children: [
                  "\u0412 \u0446\u0438\u043A\u043B\u0435 \u2014 \u0447\u0438\u0442\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u0432\u0441\u0435\u0445 (",
                  path.unresolved.length,
                  ")"
                ] })
              ] }),
              /* @__PURE__ */ jsx43("div", { className: "topo-cyclic__body", children: path.unresolved.map((d) => /* @__PURE__ */ jsx43(
                "a",
                {
                  className: "validation-log__domain",
                  onClick: () => {
                    goto(d.domainId);
                    store.setLearningPathOpen(false);
                  },
                  children: d.domainId
                },
                d.id
              )) })
            ] })
          ] })
        ] }),
        path && /* @__PURE__ */ jsxs39("div", { className: "validation-footer", children: [
          /* @__PURE__ */ jsxs39("div", { className: "validation-stats", children: [
            /* @__PURE__ */ jsxs39("span", { className: "validation-stat", children: [
              "\u{1F4D6} ",
              path.totalDomains,
              " \u0434\u043E\u043C\u0435\u043D\u043E\u0432"
            ] }),
            /* @__PURE__ */ jsxs39("span", { className: "validation-stat validation-stat--ok", children: [
              "\u{1F4CA} ",
              path.totalStages,
              " \u044D\u0442\u0430\u043F\u043E\u0432"
            ] }),
            path.entryPoints.length > 0 && /* @__PURE__ */ jsxs39("span", { className: "validation-stat", children: [
              "\u{1F6AA} ",
              path.entryPoints.length,
              " \u0432\u0445\u043E\u0434\u043E\u0432"
            ] })
          ] }),
          /* @__PURE__ */ jsxs39("div", { className: "validation-footer__actions", children: [
            /* @__PURE__ */ jsx43(
              "button",
              {
                className: "btn btn--primary",
                onClick: () => {
                  store.setLearningPathOpen(false);
                  setTimeout(() => props.onStartTour(path), 50);
                },
                children: "\u25B6 \u041D\u0430\u0447\u0430\u0442\u044C \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u044E"
              }
            ),
            /* @__PURE__ */ jsx43("button", { className: "btn", onClick: copyAsText, children: "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }),
            /* @__PURE__ */ jsx43("button", { className: "btn", onClick: exportJSON, children: "\u{1F4BE} JSON" }),
            /* @__PURE__ */ jsx43("button", { className: "btn", onClick: exportMD, children: "\u{1F4DD} MD" }),
            /* @__PURE__ */ jsx43("button", { className: "btn", onClick: () => setPath(null), children: "\u2190 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438" })
          ] })
        ] })
      ]
    }
  ) });
}
var init_LearningPathModal = __esm({
  "src/web/components/modals/LearningPathModal.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_learning_path();
    init_markdown();
    init_format();
  }
});

// src/web/components/modals/TourOverlay.tsx
import { useEffect as useEffect20, useMemo as useMemo18 } from "react";
import { jsx as jsx44, jsxs as jsxs40 } from "react/jsx-runtime";
function TourOverlay() {
  const store = useGraphStore();
  const tour = store.tour;
  const allItems = useMemo18(() => {
    if (!tour)
      return [];
    const items = [];
    tour.stages.forEach((stage) => {
      stage.domains.forEach((d2) => {
        items.push({
          domainId: d2.domainId,
          nodeId: d2.id,
          stageNumber: stage.index + 1,
          domainData: d2
        });
      });
    });
    return items;
  }, [tour]);
  useEffect20(() => {
    if (!tour)
      return;
    const current2 = allItems[tour.index];
    if (!current2 || !store.rfInstance)
      return;
    const node = store.nodes.find((n) => n.id === current2.nodeId);
    if (!node)
      return;
    const NODE_WIDTH3 = 300;
    const NODE_HEIGHT3 = 88;
    const NODE_COMPACT2 = 42;
    const w = store.compact ? NODE_COMPACT2 : NODE_WIDTH3;
    const h = store.compact ? NODE_COMPACT2 : NODE_HEIGHT3;
    const cx = node.position.x + w / 2;
    const cy = node.position.y + h / 2;
    store.rfInstance.setCenter(cx, cy, { zoom: 1.5, duration: 700 });
    store.setSelectedNodeId(current2.nodeId);
  }, [tour, tour?.index, allItems, store]);
  useEffect20(() => {
    if (!tour || !tour.playing)
      return;
    if (tour.index >= allItems.length - 1) {
      store.setTour((prev2) => prev2 ? { ...prev2, playing: false } : null);
      return;
    }
    const t = setTimeout(() => {
      store.setTour(
        (prev2) => prev2 ? { ...prev2, index: prev2.index + 1, playing: false } : null
      );
    }, 2500);
    return () => clearTimeout(t);
  }, [tour, tour?.playing, tour?.index, allItems.length, store]);
  if (!tour)
    return null;
  const current = allItems[tour.index];
  if (!current)
    return null;
  const d = current.domainData;
  const pct = Math.round((tour.index + 1) / allItems.length * 100);
  const next = () => store.setTour(
    (prev2) => prev2 && prev2.index < allItems.length - 1 ? { ...prev2, index: prev2.index + 1, playing: false } : prev2
  );
  const prev = () => store.setTour((p) => p && p.index > 0 ? { ...p, index: p.index - 1, playing: false } : p);
  const togglePlay = () => store.setTour((p) => p ? { ...p, playing: !p.playing } : null);
  const stop = () => store.setTour(null);
  return /* @__PURE__ */ jsx44("div", { className: "tour-overlay", children: /* @__PURE__ */ jsxs40("div", { className: "tour-overlay__card", children: [
    /* @__PURE__ */ jsxs40("div", { className: "tour-overlay__header", children: [
      /* @__PURE__ */ jsxs40("span", { className: "tour-overlay__stage-badge", children: [
        "\u042D\u0442\u0430\u043F ",
        current.stageNumber
      ] }),
      /* @__PURE__ */ jsxs40("span", { className: "tour-overlay__counter", children: [
        tour.index + 1,
        " / ",
        allItems.length
      ] }),
      /* @__PURE__ */ jsx44("button", { className: "tour-overlay__close", onClick: stop, title: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C", children: "\u2715" })
    ] }),
    /* @__PURE__ */ jsx44("div", { className: "tour-overlay__title", children: current.domainId }),
    d.label && d.label !== current.domainId && /* @__PURE__ */ jsx44("div", { className: "tour-overlay__subtitle", children: d.label }),
    d.description && /* @__PURE__ */ jsx44("div", { className: "tour-overlay__desc", children: d.description }),
    /* @__PURE__ */ jsxs40("div", { className: "tour-overlay__stats", children: [
      d.fanIn > 0 && /* @__PURE__ */ jsxs40("span", { className: "tour-stat", children: [
        "\u2191 ",
        d.fanIn,
        " \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
      ] }),
      d.fanOut > 0 && /* @__PURE__ */ jsxs40("span", { className: "tour-stat", children: [
        "\u2193 ",
        d.fanOut,
        " \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
      ] }),
      d.entitiesCount != null && /* @__PURE__ */ jsxs40("span", { className: "tour-stat", children: [
        d.entitiesCount,
        " entities"
      ] })
    ] }),
    d.tags && d.tags.length > 0 && /* @__PURE__ */ jsx44("div", { className: "tour-overlay__tags", children: d.tags.slice(0, 6).map((t, i) => /* @__PURE__ */ jsx44("span", { className: "tag", style: { fontSize: 10 }, children: t }, i)) }),
    /* @__PURE__ */ jsx44("div", { className: "tour-overlay__progress", children: /* @__PURE__ */ jsx44("div", { className: "tour-overlay__progress-bar", children: /* @__PURE__ */ jsx44("div", { className: "tour-overlay__progress-fill", style: { width: pct + "%" } }) }) }),
    /* @__PURE__ */ jsxs40("div", { className: "tour-overlay__controls", children: [
      /* @__PURE__ */ jsx44(
        "button",
        {
          className: "tour-btn",
          onClick: prev,
          disabled: tour.index === 0,
          title: "\u041D\u0430\u0437\u0430\u0434",
          children: "\u25C0"
        }
      ),
      /* @__PURE__ */ jsx44(
        "button",
        {
          className: "tour-btn tour-btn--primary",
          onClick: togglePlay,
          title: tour.playing ? "\u041F\u0430\u0443\u0437\u0430" : "\u0418\u0433\u0440\u0430\u0442\u044C",
          children: tour.playing ? "\u275A\u275A" : "\u25B6"
        }
      ),
      /* @__PURE__ */ jsx44(
        "button",
        {
          className: "tour-btn",
          onClick: next,
          disabled: tour.index >= allItems.length - 1,
          title: "\u0414\u0430\u043B\u044C\u0448\u0435",
          children: "\u25B6"
        }
      )
    ] })
  ] }) });
}
var init_TourOverlay = __esm({
  "src/web/components/modals/TourOverlay.tsx"() {
    "use strict";
    init_useGraphStore();
  }
});

// src/web/lib/entities/tree.ts
import dagre2 from "dagre";
function buildEntityTree(rootKey, index) {
  const byKey = index.byKey;
  const childMap = index.children;
  const nodesMap = /* @__PURE__ */ new Map();
  const edgesMap = /* @__PURE__ */ new Map();
  function addNode(key) {
    if (nodesMap.has(key))
      return nodesMap.get(key);
    const e = byKey.get(key);
    const parts = key.split("/");
    const node = {
      key,
      domainId: e ? e.domainId : parts[0],
      entityId: e ? e.entityId : parts.slice(1).join("/"),
      name: e ? e.name : null,
      inherits: e ? e.inherits : null,
      missing: !e
    };
    nodesMap.set(key, node);
    return node;
  }
  function traverseParents(startKey) {
    const visited = /* @__PURE__ */ new Set();
    const stack = [startKey];
    while (stack.length > 0) {
      const key = stack.pop();
      if (visited.has(key))
        continue;
      visited.add(key);
      const e = byKey.get(key);
      if (!e || !e.inherits)
        continue;
      const ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref)
        continue;
      const parentKey = entityKey(ref.domainId, ref.entityId);
      addNode(parentKey);
      const edgeId = parentKey + "->" + key;
      if (!edgesMap.has(edgeId)) {
        edgesMap.set(edgeId, { id: edgeId, source: parentKey, target: key });
      }
      if (!visited.has(parentKey))
        stack.push(parentKey);
    }
  }
  function traverseChildren(startKey) {
    const visited = /* @__PURE__ */ new Set();
    const stack = [startKey];
    while (stack.length > 0) {
      const key = stack.pop();
      if (visited.has(key))
        continue;
      visited.add(key);
      const kids = childMap.get(key) || [];
      kids.forEach((child) => {
        const childKey = entityKey(child.domainId, child.entityId);
        addNode(childKey);
        const edgeId = key + "->" + childKey;
        if (!edgesMap.has(edgeId)) {
          edgesMap.set(edgeId, { id: edgeId, source: key, target: childKey });
        }
        if (!visited.has(childKey))
          stack.push(childKey);
      });
    }
  }
  addNode(rootKey);
  traverseParents(rootKey);
  traverseChildren(rootKey);
  const nodes = Array.from(nodesMap.values());
  const edges = Array.from(edgesMap.values());
  const cycleNodes = detectEntityCycles(nodes, edges);
  const parents = /* @__PURE__ */ new Set();
  const children = /* @__PURE__ */ new Set();
  (() => {
    const stack = [rootKey];
    const visited = /* @__PURE__ */ new Set([rootKey]);
    while (stack.length > 0) {
      const k = stack.pop();
      const e = byKey.get(k);
      if (!e || !e.inherits)
        continue;
      const ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref)
        continue;
      const pk = entityKey(ref.domainId, ref.entityId);
      if (!parents.has(pk))
        parents.add(pk);
      if (!visited.has(pk)) {
        visited.add(pk);
        stack.push(pk);
      }
    }
  })();
  (() => {
    const stack = [rootKey];
    const visited = /* @__PURE__ */ new Set([rootKey]);
    while (stack.length > 0) {
      const k = stack.pop();
      const kids = childMap.get(k) || [];
      kids.forEach((child) => {
        const ck = entityKey(child.domainId, child.entityId);
        if (!children.has(ck))
          children.add(ck);
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
    cycleNodes
  };
}
function detectEntityCycles(nodes, edges) {
  const adj = /* @__PURE__ */ new Map();
  nodes.forEach((n) => adj.set(n.key, []));
  edges.forEach((e) => {
    if (adj.has(e.source))
      adj.get(e.source).push(e.target);
  });
  let index = 0;
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const indices = /* @__PURE__ */ new Map();
  const lowlinks = /* @__PURE__ */ new Map();
  const sccs = [];
  function strongconnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const neighbors = adj.get(v) || [];
    for (const to of neighbors) {
      if (!adj.has(to))
        continue;
      if (!indices.has(to)) {
        strongconnect(to);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(to)));
      } else if (onStack.has(to)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(to)));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1)
        sccs.push(scc);
    }
  }
  nodes.forEach((n) => {
    if (!indices.has(n.key))
      strongconnect(n.key);
  });
  const result = /* @__PURE__ */ new Set();
  sccs.forEach((scc) => scc.forEach((k) => result.add(k)));
  return result;
}
function layoutEntityGraph(nodes, edges, rootKey) {
  const g = new dagre2.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 25,
    ranksep: 55,
    marginx: 30,
    marginy: 30
  });
  nodes.forEach((n) => {
    const w = n.key === rootKey ? ROOT_W : ENTITY_W;
    const h = n.key === rootKey ? ROOT_H : ENTITY_H;
    g.setNode(n.key, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre2.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.key);
    const w = n.key === rootKey ? ROOT_W : ENTITY_W;
    const h = n.key === rootKey ? ROOT_H : ENTITY_H;
    return Object.assign({}, n, {
      x: pos.x - w / 2,
      y: pos.y - h / 2,
      width: w,
      height: h
    });
  });
}
var ENTITY_W, ENTITY_H, ROOT_W, ROOT_H;
var init_tree = __esm({
  "src/web/lib/entities/tree.ts"() {
    "use strict";
    init_entities();
    ENTITY_W = 180;
    ENTITY_H = 60;
    ROOT_W = ENTITY_W * 1.35;
    ROOT_H = ENTITY_H * 1.2;
  }
});

// src/web/components/modals/EntityHierarchyGraph.tsx
import { useCallback as useCallback10, useEffect as useEffect21, useMemo as useMemo19, useRef as useRef11, useState as useState10 } from "react";
import { Fragment as Fragment5, jsx as jsx45, jsxs as jsxs41 } from "react/jsx-runtime";
function EntityHierarchyGraph({ tree, onSelect, onGotoDomain }) {
  const svgRef = useRef11(null);
  const containerRef = useRef11(null);
  const [viewport, setViewport] = useState10({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef11(null);
  const [isDragging, setIsDragging] = useState10(false);
  const laid = useMemo19(
    () => layoutEntityGraph(tree.nodes, tree.edges, tree.rootKey),
    [tree]
  );
  useEffect21(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, [tree.rootKey]);
  const fitView = useCallback10(() => {
    if (!laid || !containerRef.current)
      return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0)
      return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    laid.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });
    const pad = 60;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const scale = Math.min(rect.width / w, rect.height / h, 1.5);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const treeCx = (minX + maxX) / 2;
    const treeCy = (minY + maxY) / 2;
    setViewport({ x: cx - treeCx * scale, y: cy - treeCy * scale, scale });
  }, [laid]);
  useEffect21(() => {
    if (!laid)
      return;
    const t = setTimeout(fitView, 50);
    return () => clearTimeout(t);
  }, [laid, fitView]);
  useEffect21(() => {
    const el = containerRef.current;
    if (!el)
      return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = -e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setViewport((vp) => {
        const newScale = Math.max(0.1, Math.min(5, vp.scale * factor));
        return {
          x: mx - (mx - vp.x) * (newScale / vp.scale),
          y: my - (my - vp.y) * (newScale / vp.scale),
          scale: newScale
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const onMouseDown = useCallback10(
    (e) => {
      if (e.button !== 0)
        return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startVpX: viewport.x,
        startVpY: viewport.y,
        moved: false
      };
      setIsDragging(true);
    },
    [viewport.x, viewport.y]
  );
  useEffect21(() => {
    if (!isDragging)
      return;
    const onMove = (e) => {
      if (!dragRef.current)
        return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3)
        dragRef.current.moved = true;
      setViewport((vp) => ({
        x: dragRef.current.startVpX + dx,
        y: dragRef.current.startVpY + dy,
        scale: vp.scale
      }));
    };
    const onUp = () => {
      setIsDragging(false);
      setTimeout(() => {
        if (dragRef.current)
          dragRef.current.moved = false;
      }, 0);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);
  const zoomBy = useCallback10((factor) => {
    const el = containerRef.current;
    if (!el)
      return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setViewport((vp) => {
      const newScale = Math.max(0.1, Math.min(5, vp.scale * factor));
      return {
        x: cx - (cx - vp.x) * (newScale / vp.scale),
        y: cy - (cy - vp.y) * (newScale / vp.scale),
        scale: newScale
      };
    });
  }, []);
  if (!laid)
    return null;
  const byKey = /* @__PURE__ */ new Map();
  laid.forEach((n) => byKey.set(n.key, n));
  const rootDomainId = (tree.rootKey.split("/")[0] || "").toLowerCase();
  const handleNodeClick = (n) => {
    if (dragRef.current && dragRef.current.moved)
      return;
    if (n.missing)
      return;
    if (onSelect)
      onSelect(n);
  };
  const truncate = (s, max) => !s ? "" : s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
  return /* @__PURE__ */ jsxs41(Fragment5, { children: [
    /* @__PURE__ */ jsxs41("div", { className: "entity-graph-controls", children: [
      /* @__PURE__ */ jsx45(
        "button",
        {
          className: "entity-ctrl-btn",
          onClick: () => zoomBy(1.3),
          title: "\u041F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u044C",
          children: "+"
        }
      ),
      /* @__PURE__ */ jsx45(
        "button",
        {
          className: "entity-ctrl-btn",
          onClick: () => zoomBy(1 / 1.3),
          title: "\u041E\u0442\u0434\u0430\u043B\u0438\u0442\u044C",
          children: "\u2212"
        }
      ),
      /* @__PURE__ */ jsx45("button", { className: "entity-ctrl-btn", onClick: fitView, title: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C", children: "\u26F6" }),
      /* @__PURE__ */ jsxs41("span", { className: "entity-zoom-level", children: [
        Math.round(viewport.scale * 100),
        "%"
      ] })
    ] }),
    /* @__PURE__ */ jsx45(
      "div",
      {
        className: "entity-graph-container" + (isDragging ? " entity-graph-container--dragging" : ""),
        ref: containerRef,
        onMouseDown,
        children: /* @__PURE__ */ jsxs41(
          "svg",
          {
            ref: svgRef,
            className: "entity-graph-svg",
            style: { width: "100%", height: "100%" },
            children: [
              /* @__PURE__ */ jsx45("defs", { children: /* @__PURE__ */ jsx45(
                "marker",
                {
                  id: "entity-arrow",
                  viewBox: "0 0 10 10",
                  refX: 9,
                  refY: 5,
                  markerWidth: 6,
                  markerHeight: 6,
                  orient: "auto-start-reverse",
                  children: /* @__PURE__ */ jsx45("path", { d: "M 0 0 L 10 5 L 0 10 z", className: "entity-arrow-marker" })
                }
              ) }),
              /* @__PURE__ */ jsxs41(
                "g",
                {
                  transform: "translate(" + viewport.x + "," + viewport.y + ") scale(" + viewport.scale + ")",
                  children: [
                    /* @__PURE__ */ jsx45("g", { className: "entity-graph-edges", children: tree.edges.map((e, i) => {
                      const src = byKey.get(e.source);
                      const tgt = byKey.get(e.target);
                      if (!src || !tgt)
                        return null;
                      const sx = src.x + src.width / 2;
                      const sy = src.y + src.height;
                      const tx = tgt.x + tgt.width / 2;
                      const ty = tgt.y;
                      const my = (sy + ty) / 2;
                      const path = "M " + sx + "," + sy + " C " + sx + "," + my + " " + tx + "," + my + " " + tx + "," + ty;
                      const isCycle = tree.cycleNodes.has(e.source) && tree.cycleNodes.has(e.target);
                      return /* @__PURE__ */ jsx45(
                        "path",
                        {
                          d: path,
                          className: "entity-edge" + (isCycle ? " entity-edge--cycle" : ""),
                          markerEnd: "url(#entity-arrow)"
                        },
                        i
                      );
                    }) }),
                    /* @__PURE__ */ jsx45("g", { className: "entity-graph-nodes", children: laid.map((n) => {
                      const isRoot = n.key === tree.rootKey;
                      const isCycle = tree.cycleNodes.has(n.key);
                      const isForeign = !isRoot && n.domainId.toLowerCase() !== rootDomainId;
                      let nodeCls = "entity-graph-node";
                      if (isRoot)
                        nodeCls += " entity-graph-node--root";
                      if (isCycle)
                        nodeCls += " entity-graph-node--cycle";
                      if (n.missing)
                        nodeCls += " entity-graph-node--missing";
                      const idMax = isRoot ? 24 : 22;
                      const shortId = truncate(n.missing ? "\u26A0\uFE0F " + n.entityId : n.entityId, idMax);
                      const shortName = truncate(n.name || "", 26);
                      const shortDomain = truncate(n.domainId, 24);
                      return /* @__PURE__ */ jsxs41(
                        "g",
                        {
                          transform: "translate(" + n.x + "," + n.y + ")",
                          className: nodeCls,
                          onClick: () => handleNodeClick(n),
                          style: { cursor: n.missing ? "default" : "pointer" },
                          children: [
                            /* @__PURE__ */ jsx45("title", { children: n.entityId + (n.name ? " \u2014 " + n.name : "") + " (" + n.domainId + ")" }),
                            /* @__PURE__ */ jsx45(
                              "rect",
                              {
                                width: n.width,
                                height: n.height,
                                rx: 8,
                                className: "entity-node-rect" + (isRoot ? " entity-node-rect--root" : "") + (isForeign ? " entity-node-rect--foreign" : "") + (isCycle ? " entity-node-rect--cycle" : "") + (n.missing ? " entity-node-rect--missing" : "")
                              }
                            ),
                            /* @__PURE__ */ jsx45(
                              "text",
                              {
                                x: n.width / 2,
                                y: isRoot ? 24 : 22,
                                textAnchor: "middle",
                                className: "entity-node-id" + (isRoot ? " entity-node-id--root" : ""),
                                pointerEvents: "none",
                                children: shortId
                              }
                            ),
                            !isRoot && !n.missing && shortName && /* @__PURE__ */ jsx45(
                              "text",
                              {
                                x: n.width / 2,
                                y: 38,
                                textAnchor: "middle",
                                className: "entity-node-name",
                                pointerEvents: "none",
                                children: shortName
                              }
                            ),
                            !n.missing && /* @__PURE__ */ jsx45(
                              "text",
                              {
                                x: n.width / 2,
                                y: n.height - 8,
                                textAnchor: "middle",
                                className: "entity-node-domain" + (isForeign ? " entity-node-domain--foreign" : ""),
                                onClick: (ev) => {
                                  ev.stopPropagation();
                                  if (onGotoDomain)
                                    onGotoDomain(n.domainId);
                                },
                                children: shortDomain
                              }
                            ),
                            n.missing && /* @__PURE__ */ jsx45(
                              "text",
                              {
                                x: n.width / 2,
                                y: n.height - 8,
                                textAnchor: "middle",
                                className: "entity-node-domain entity-node-domain--missing",
                                children: "\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E"
                              }
                            )
                          ]
                        },
                        n.key
                      );
                    }) })
                  ]
                }
              )
            ]
          }
        )
      }
    )
  ] });
}
var init_EntityHierarchyGraph = __esm({
  "src/web/components/modals/EntityHierarchyGraph.tsx"() {
    "use strict";
    init_tree();
  }
});

// src/web/components/modals/EntityHierarchyModal.tsx
import { useCallback as useCallback11, useEffect as useEffect22, useMemo as useMemo20, useState as useState11 } from "react";
import { jsx as jsx46, jsxs as jsxs42 } from "react/jsx-runtime";
function EntityHierarchyModal({ entities }) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const [query, setQuery] = useState11("");
  const [selectedKey, setSelectedKey] = useState11(null);
  const [history, setHistory] = useState11([]);
  const open = store.entityHierarchyOpen;
  const initialKey = store.entityHierarchyInitialKey;
  const index = useMemo20(() => buildEntityIndex(entities), [entities]);
  useEffect22(() => {
    if (open && initialKey) {
      setSelectedKey(initialKey);
      setHistory([]);
      setQuery("");
    }
  }, [open, initialKey]);
  useEffect22(() => {
    if (!open) {
      setQuery("");
      setSelectedKey(null);
      setHistory([]);
    }
  }, [open]);
  const handleBack = useCallback11(() => {
    setHistory((prev) => {
      if (prev.length === 0)
        return prev;
      const last = prev[prev.length - 1];
      setSelectedKey(last);
      return prev.slice(0, -1);
    });
  }, []);
  useEffect22(() => {
    if (!open)
      return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (history.length > 0)
          handleBack();
        else
          store.setEntityHierarchyOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, history, handleBack, store]);
  const searchResults = useMemo20(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return [];
    const results = [];
    entities.forEach((e) => {
      const idMatch = e.entityId.toLowerCase().indexOf(q) !== -1;
      const nameMatch = e.name && e.name.toLowerCase().indexOf(q) !== -1;
      if (!idMatch && !nameMatch)
        return;
      const key = entityKey(e.domainId, e.entityId);
      const hasParents = !!e.inherits;
      const hasChildren = (index.children.get(key) || []).length > 0;
      results.push({
        entity: e,
        key,
        hasParents,
        hasChildren,
        isOrphan: !hasParents && !hasChildren,
        rank: idMatch && e.entityId.toLowerCase().indexOf(q) === 0 ? 0 : idMatch ? 1 : 2
      });
    });
    return results.sort((a, b) => a.rank - b.rank).slice(0, 200);
  }, [query, entities, index]);
  const tree = useMemo20(() => {
    if (!selectedKey)
      return null;
    return buildEntityTree(selectedKey, index);
  }, [selectedKey, index]);
  const handleSelect = useCallback11(
    (node) => {
      if (!node || node.missing)
        return;
      if (node.key === selectedKey)
        return;
      setHistory((prev) => selectedKey ? prev.concat([selectedKey]) : prev);
      setSelectedKey(node.key);
    },
    [selectedKey]
  );
  if (!open)
    return null;
  return /* @__PURE__ */ jsx46(
    "div",
    {
      className: "help-overlay help-overlay--fullscreen",
      onMouseDown: () => store.setEntityHierarchyOpen(false),
      children: /* @__PURE__ */ jsxs42(
        "div",
        {
          className: "help-modal entity-hierarchy-modal",
          onMouseDown: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxs42("div", { className: "help-modal__header", children: [
              /* @__PURE__ */ jsx46("div", { className: "help-modal__title", children: "\u{1F9EC} \u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439" }),
              /* @__PURE__ */ jsx46(
                "button",
                {
                  className: "help-modal__close",
                  onClick: () => store.setEntityHierarchyOpen(false),
                  children: "\u2715"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs42("div", { className: "entity-hierarchy-body", children: [
              /* @__PURE__ */ jsxs42("div", { className: "entity-search-panel", children: [
                /* @__PURE__ */ jsxs42("div", { className: "entity-search-input-wrap", children: [
                  /* @__PURE__ */ jsx46("span", { className: "entity-search-icon", children: "\u{1F50D}" }),
                  /* @__PURE__ */ jsx46(
                    "input",
                    {
                      className: "entity-search-input",
                      type: "text",
                      placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E id \u0438\u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E...",
                      value: query,
                      onChange: (e) => setQuery(e.target.value)
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx46("div", { className: "entity-search-results", children: query.trim() === "" ? /* @__PURE__ */ jsxs42("div", { className: "entity-search-hint", children: [
                  "\u0412\u0441\u0435\u0433\u043E \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439: ",
                  entities.length,
                  /* @__PURE__ */ jsx46("br", {}),
                  /* @__PURE__ */ jsx46("span", { style: { fontSize: 11 }, children: "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430" })
                ] }) : searchResults.length === 0 ? /* @__PURE__ */ jsx46("div", { className: "entity-search-hint", children: "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }) : searchResults.map((r) => /* @__PURE__ */ jsxs42(
                  "div",
                  {
                    className: "entity-search-item" + (r.key === selectedKey ? " entity-search-item--active" : "") + (r.isOrphan ? " entity-search-item--orphan" : ""),
                    onClick: () => {
                      setHistory(
                        (prev) => selectedKey ? prev.concat([selectedKey]) : prev
                      );
                      setSelectedKey(r.key);
                    },
                    children: [
                      /* @__PURE__ */ jsx46("div", { className: "entity-search-item__id", children: r.entity.entityId }),
                      r.entity.name && r.entity.name !== r.entity.entityId && /* @__PURE__ */ jsx46("div", { className: "entity-search-item__name", children: r.entity.name }),
                      /* @__PURE__ */ jsxs42("div", { className: "entity-search-item__meta", children: [
                        /* @__PURE__ */ jsx46("span", { className: "entity-search-item__domain", children: r.entity.domainId }),
                        r.isOrphan ? /* @__PURE__ */ jsx46("span", { className: "entity-search-item__badge", children: "\u0431\u0435\u0437 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438" }) : /* @__PURE__ */ jsx46("span", { className: "entity-search-item__badge entity-search-item__badge--ok", children: (r.hasParents ? "\u2191" : "\xB7") + (r.hasChildren ? "\u2193" : "\xB7") })
                      ] })
                    ]
                  },
                  r.key
                )) })
              ] }),
              /* @__PURE__ */ jsxs42("div", { className: "entity-graph-panel", children: [
                history.length > 0 && /* @__PURE__ */ jsx46(
                  "button",
                  {
                    className: "entity-graph-back",
                    onClick: handleBack,
                    title: "\u041D\u0430\u0437\u0430\u0434",
                    children: "\u2190 \u041D\u0430\u0437\u0430\u0434"
                  }
                ),
                !selectedKey ? /* @__PURE__ */ jsxs42("div", { className: "entity-graph-empty", children: [
                  /* @__PURE__ */ jsx46("div", { className: "entity-graph-empty__icon", children: "\u{1F9EC}" }),
                  /* @__PURE__ */ jsx46("div", { className: "entity-graph-empty__title", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u044C \u0441\u043B\u0435\u0432\u0430" }),
                  /* @__PURE__ */ jsx46("div", { className: "entity-graph-empty__hint", children: "\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u0438 \u0431\u0443\u0434\u0443\u0442 \u0441\u0432\u0435\u0440\u0445\u0443, \u043D\u0430\u0441\u043B\u0435\u0434\u043D\u0438\u043A\u0438 \u0441\u043D\u0438\u0437\u0443" })
                ] }) : tree ? /* @__PURE__ */ jsx46(
                  EntityHierarchyGraph,
                  {
                    tree,
                    onSelect: handleSelect,
                    onGotoDomain: goto
                  }
                ) : null
              ] })
            ] }),
            tree && /* @__PURE__ */ jsxs42("div", { className: "validation-footer", children: [
              /* @__PURE__ */ jsxs42("div", { className: "validation-stats", children: [
                /* @__PURE__ */ jsxs42("span", { className: "validation-stat", children: [
                  "\u{1F9EC} ",
                  tree.nodes.length,
                  " \u0432 \u0433\u0440\u0430\u0444\u0435"
                ] }),
                /* @__PURE__ */ jsxs42("span", { className: "validation-stat validation-stat--ok", children: [
                  "\u2191 ",
                  tree.parentKeys.size,
                  " \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u0435\u0439"
                ] }),
                /* @__PURE__ */ jsxs42("span", { className: "validation-stat validation-stat--warn", children: [
                  "\u2193 ",
                  tree.childKeys.size,
                  " \u043D\u0430\u0441\u043B\u0435\u0434\u043D\u0438\u043A\u043E\u0432"
                ] }),
                tree.cycleNodes.size > 0 && /* @__PURE__ */ jsx46("span", { className: "validation-stat validation-stat--err", children: "\u26A0\uFE0F \u0446\u0438\u043A\u043B" })
              ] }),
              /* @__PURE__ */ jsx46("div", { className: "validation-footer__actions", children: /* @__PURE__ */ jsx46(
                "button",
                {
                  className: "btn",
                  onClick: () => store.setEntityHierarchyOpen(false),
                  children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"
                }
              ) })
            ] })
          ]
        }
      )
    }
  );
}
var init_EntityHierarchyModal = __esm({
  "src/web/components/modals/EntityHierarchyModal.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_entities();
    init_tree();
    init_entities();
    init_EntityHierarchyGraph();
  }
});

// src/web/components/modals/RulesModal.tsx
import { useEffect as useEffect23, useState as useState12 } from "react";
import { jsx as jsx47, jsxs as jsxs43 } from "react/jsx-runtime";
function RulesModal({ violations }) {
  const store = useGraphStore();
  const { goto } = useNavigation();
  const [draft, setDraft] = useState12({
    from: "",
    to: "",
    action: "warn",
    message: ""
  });
  const open = store.rulesOpen;
  useEffect23(() => {
    if (!open)
      setDraft({ from: "", to: "", action: "warn", message: "" });
  }, [open]);
  useEffect23(() => {
    if (!open)
      return;
    const onKey = (e) => {
      if (e.key === "Escape")
        store.setRulesOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, store]);
  if (!open)
    return null;
  const addRule = () => {
    if (!draft.from.trim() || !draft.to.trim())
      return;
    const newRule = {
      id: "r" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      from: draft.from.trim(),
      to: draft.to.trim(),
      action: draft.action,
      message: draft.message.trim()
    };
    store.setRules((prev) => prev.concat([newRule]));
    setDraft({ from: "", to: "", action: "warn", message: "" });
  };
  const removeRule = (id) => {
    store.setRules((prev) => prev.filter((r) => r.id !== id));
  };
  const toggleAction = (id) => {
    store.setRules(
      (prev) => prev.map(
        (r) => r.id === id ? { ...r, action: r.action === "forbid" ? "warn" : "forbid" } : r
      )
    );
  };
  const clearAllRules = () => {
    if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430?"))
      return;
    store.setRules([]);
  };
  const onFormKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addRule();
    }
  };
  return /* @__PURE__ */ jsx47("div", { className: "help-overlay", onMouseDown: () => store.setRulesOpen(false), children: /* @__PURE__ */ jsxs43("div", { className: "help-modal rules-modal", onMouseDown: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs43("div", { className: "help-modal__header", children: [
      /* @__PURE__ */ jsxs43("div", { className: "help-modal__title", children: [
        /* @__PURE__ */ jsx47(MIcon, { name: "block" }),
        /* @__PURE__ */ jsx47("span", { style: { marginLeft: 8 }, children: "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439" }),
        violations.length > 0 && /* @__PURE__ */ jsx47("span", { className: "help-modal__badge", children: violations.length })
      ] }),
      /* @__PURE__ */ jsx47(
        "button",
        {
          className: "help-modal__close",
          onClick: () => store.setRulesOpen(false),
          title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C (Esc)",
          children: /* @__PURE__ */ jsx47(MIcon, { name: "close" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs43("div", { className: "help-modal__body rules-modal__body", children: [
      /* @__PURE__ */ jsxs43("div", { className: "rules-form", children: [
        /* @__PURE__ */ jsx47("div", { className: "rules-form__label", children: "\u041D\u043E\u0432\u043E\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043E" }),
        /* @__PURE__ */ jsxs43("div", { className: "rules-form__row", children: [
          /* @__PURE__ */ jsx47(
            "input",
            {
              className: "rules-form__input",
              type: "text",
              placeholder: "from (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: ui.*)",
              value: draft.from,
              onChange: (e) => setDraft({ ...draft, from: e.target.value }),
              onKeyDown: onFormKeyDown
            }
          ),
          /* @__PURE__ */ jsx47("span", { className: "rules-form__arrow", children: /* @__PURE__ */ jsx47(MIcon, { name: "arrow_forward", size: "sm" }) }),
          /* @__PURE__ */ jsx47(
            "input",
            {
              className: "rules-form__input",
              type: "text",
              placeholder: "to (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: db.*)",
              value: draft.to,
              onChange: (e) => setDraft({ ...draft, to: e.target.value }),
              onKeyDown: onFormKeyDown
            }
          )
        ] }),
        /* @__PURE__ */ jsxs43("div", { className: "rules-form__row", children: [
          /* @__PURE__ */ jsxs43(
            "select",
            {
              className: "rules-form__select",
              value: draft.action,
              onChange: (e) => setDraft({ ...draft, action: e.target.value }),
              children: [
                /* @__PURE__ */ jsx47("option", { value: "warn", children: "\u26A0\uFE0F Warning" }),
                /* @__PURE__ */ jsx47("option", { value: "forbid", children: "\u26D4 Forbid" })
              ]
            }
          ),
          /* @__PURE__ */ jsx47(
            "input",
            {
              className: "rules-form__input",
              type: "text",
              placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
              value: draft.message,
              onChange: (e) => setDraft({ ...draft, message: e.target.value }),
              onKeyDown: onFormKeyDown
            }
          ),
          /* @__PURE__ */ jsxs43(
            "button",
            {
              className: "btn btn--primary",
              onClick: addRule,
              disabled: !draft.from.trim() || !draft.to.trim(),
              children: [
                /* @__PURE__ */ jsx47(MIcon, { name: "add", size: "sm" }),
                " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs43("div", { className: "rules-form__hint", children: [
          "\u041C\u0430\u0441\u043A\u0438: ",
          /* @__PURE__ */ jsx47("code", { children: "sgrc.evo.*" }),
          ", ",
          /* @__PURE__ */ jsx47("code", { children: "ui.*" }),
          ", ",
          /* @__PURE__ */ jsx47("code", { children: "!test.*" }),
          ". \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F ",
          /* @__PURE__ */ jsx47("b", { children: "*" }),
          " \u0438 ",
          /* @__PURE__ */ jsx47("b", { children: "!" }),
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsxs43("div", { className: "rules-list", children: [
        /* @__PURE__ */ jsxs43("div", { className: "rules-list__header", children: [
          /* @__PURE__ */ jsxs43("span", { className: "rules-form__label", children: [
            "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 (",
            store.rules.length,
            ")"
          ] }),
          store.rules.length > 0 && /* @__PURE__ */ jsx47("button", { className: "rules-list__clear", onClick: clearAllRules, children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435" })
        ] }),
        store.rules.length === 0 ? /* @__PURE__ */ jsx47("div", { className: "rules-list__empty", children: "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B" }) : store.rules.map((rule) => /* @__PURE__ */ jsxs43(
          "div",
          {
            className: "rules-item rules-item--" + (rule.action || "warn"),
            children: [
              /* @__PURE__ */ jsx47(
                "button",
                {
                  className: "rules-item__action rules-item__action--" + (rule.action || "warn"),
                  onClick: () => toggleAction(rule.id),
                  title: rule.action === "forbid" ? "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u0434\u0435\u043B\u0430\u0442\u044C Warning" : "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u0434\u0435\u043B\u0430\u0442\u044C Forbid",
                  children: /* @__PURE__ */ jsx47(
                    MIcon,
                    {
                      name: rule.action === "forbid" ? "block" : "warning",
                      size: "sm"
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsxs43("div", { className: "rules-item__body", children: [
                /* @__PURE__ */ jsxs43("div", { className: "rules-item__pattern", children: [
                  /* @__PURE__ */ jsx47("code", { children: rule.from }),
                  /* @__PURE__ */ jsx47("span", { className: "rules-item__arrow", children: " \u2192 " }),
                  /* @__PURE__ */ jsx47("code", { children: rule.to })
                ] }),
                rule.message && /* @__PURE__ */ jsx47("div", { className: "rules-item__message", children: rule.message })
              ] }),
              /* @__PURE__ */ jsx47(
                "button",
                {
                  className: "rules-item__remove",
                  onClick: () => removeRule(rule.id),
                  title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
                  children: /* @__PURE__ */ jsx47(MIcon, { name: "close", size: "sm" })
                }
              )
            ]
          },
          rule.id
        ))
      ] }),
      /* @__PURE__ */ jsxs43("div", { className: "rules-toggles", children: [
        /* @__PURE__ */ jsxs43("label", { className: "rules-toggle", children: [
          /* @__PURE__ */ jsx47(
            "input",
            {
              type: "checkbox",
              checked: store.rulesHighlighted,
              onChange: () => store.setRulesHighlighted(!store.rulesHighlighted)
            }
          ),
          /* @__PURE__ */ jsx47("span", { className: "rules-toggle__check" }),
          /* @__PURE__ */ jsx47("span", { children: "\u041F\u043E\u0434\u0441\u0432\u0435\u0447\u0438\u0432\u0430\u0442\u044C \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043D\u0430 \u0433\u0440\u0430\u0444\u0435" })
        ] }),
        /* @__PURE__ */ jsxs43("label", { className: "rules-toggle", children: [
          /* @__PURE__ */ jsx47(
            "input",
            {
              type: "checkbox",
              checked: store.showViolationsOnly,
              onChange: () => store.setShowViolationsOnly(!store.showViolationsOnly)
            }
          ),
          /* @__PURE__ */ jsx47("span", { className: "rules-toggle__check" }),
          /* @__PURE__ */ jsx47("span", { children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F" })
        ] })
      ] }),
      violations.length > 0 && /* @__PURE__ */ jsxs43("div", { className: "rules-violations", children: [
        /* @__PURE__ */ jsxs43("div", { className: "rules-form__label", children: [
          "\u041D\u0430\u0439\u0434\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F (",
          violations.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs43("div", { className: "rules-violations__list", children: [
          violations.slice(0, 50).map((v, idx) => /* @__PURE__ */ jsxs43(
            "div",
            {
              className: "rules-violation rules-violation--" + (v.severity || "warn"),
              children: [
                /* @__PURE__ */ jsx47(
                  MIcon,
                  {
                    name: v.severity === "forbid" ? "block" : "warning",
                    size: "sm"
                  }
                ),
                /* @__PURE__ */ jsx47(
                  "span",
                  {
                    className: "rules-violation__from",
                    onClick: () => {
                      goto(v.fromId);
                      store.setRulesOpen(false);
                    },
                    children: v.fromId
                  }
                ),
                /* @__PURE__ */ jsx47("span", { className: "rules-violation__arrow", children: " \u2192 " }),
                /* @__PURE__ */ jsx47(
                  "span",
                  {
                    className: "rules-violation__to",
                    onClick: () => {
                      goto(v.toId);
                      store.setRulesOpen(false);
                    },
                    children: v.toId
                  }
                ),
                v.rule && v.rule.message && /* @__PURE__ */ jsx47("span", { className: "rules-violation__message", children: v.rule.message })
              ]
            },
            idx
          )),
          violations.length > 50 && /* @__PURE__ */ jsxs43("div", { className: "rules-violations__more", children: [
            "...\u0438 \u0435\u0449\u0451 ",
            violations.length - 50
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs43("div", { className: "rules-modal__footer", children: [
      /* @__PURE__ */ jsxs43("div", { className: "rules-modal__stats", children: [
        "\u041F\u0440\u0430\u0432\u0438\u043B: ",
        store.rules.length,
        violations.length > 0 && /* @__PURE__ */ jsx47("span", { className: "rules-modal__stats--err", children: " \xB7 \u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439: " + violations.length })
      ] }),
      /* @__PURE__ */ jsx47("button", { className: "btn", onClick: () => store.setRulesOpen(false), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })
    ] })
  ] }) });
}
var init_RulesModal = __esm({
  "src/web/components/modals/RulesModal.tsx"() {
    "use strict";
    init_useGraphStore();
    init_useNavigation();
    init_MIcon();
  }
});

// src/web/components/modals/index.ts
var init_modals = __esm({
  "src/web/components/modals/index.ts"() {
    "use strict";
    init_HelpModal();
    init_HotkeysModal();
    init_CommandPalette();
    init_ValidationModal();
    init_TopoSortModal();
    init_LearningPathModal();
    init_TourOverlay();
    init_EntityHierarchyModal();
    init_EntityHierarchyGraph();
    init_RulesModal();
  }
});

// src/web/components/layout/AppModals.tsx
import { Fragment as Fragment6, jsx as jsx48, jsxs as jsxs44 } from "react/jsx-runtime";
function AppModals(props) {
  const store = useGraphStore();
  return /* @__PURE__ */ jsxs44(Fragment6, { children: [
    /* @__PURE__ */ jsx48(HoverTooltip, {}),
    /* @__PURE__ */ jsx48(
      CommandPalette,
      {
        commands: props.commands,
        onOpenFile: (filePath, fqid) => openFileInEditor(filePath, fqid)
      }
    ),
    /* @__PURE__ */ jsx48(
      HelpModal,
      {
        open: store.helpOpen,
        onClose: () => store.setHelpOpen(false)
      }
    ),
    /* @__PURE__ */ jsx48(
      HotkeysModal,
      {
        open: store.hotkeysOpen,
        onClose: () => store.setHotkeysOpen(false)
      }
    ),
    /* @__PURE__ */ jsx48(
      ValidationModal,
      {
        allDomains: props.allDomains,
        visibleDomains: props.visibleDomains,
        bookmarkedDomains: props.bookmarkedDomains
      }
    ),
    /* @__PURE__ */ jsx48(
      TopoSortModal,
      {
        allDomains: props.allDomains,
        visibleDomains: props.visibleDomains,
        bookmarkedDomains: props.bookmarkedDomains
      }
    ),
    /* @__PURE__ */ jsx48(
      LearningPathModal,
      {
        visibleDomains: props.visibleDomains,
        bookmarkedDomains: props.bookmarkedDomains,
        onStartTour: props.onStartTour
      }
    ),
    /* @__PURE__ */ jsx48(TourOverlay, {}),
    /* @__PURE__ */ jsx48(EntityHierarchyModal, { entities: props.entities }),
    /* @__PURE__ */ jsx48(RulesModal, { violations: props.ruleViolations }),
    /* @__PURE__ */ jsx48(
      ContextMenu,
      {
        menu: store.contextMenu,
        onClose: () => store.setContextMenu(null),
        onAction: props.onContextAction
      }
    ),
    props.toastVisible && props.remoteInfo?.fromCache && /* @__PURE__ */ jsx48(
      Toast,
      {
        message: "\u{1F4E6} \u0413\u0440\u0430\u0444 \u043F\u043E\u0441\u0442\u0440\u043E\u0435\u043D \u0438\u0437 <b>\u043A\u044D\u0448\u0430</b>" + (props.remoteInfo.fetchedAt ? " (\u043E\u0442 " + new Date(props.remoteInfo.fetchedAt).toLocaleString("ru-RU") + ")" : "") + ". \u0414\u0430\u043D\u043D\u044B\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u043C\u0438.",
        actions: props.refreshCommand ? [{ command: props.refreshCommand }] : [],
        duration: 15e3,
        onClose: props.onToastClose
      }
    ),
    /* @__PURE__ */ jsx48(Snackbar, { snackbar: store.snackbar })
  ] });
}
var init_AppModals = __esm({
  "src/web/components/layout/AppModals.tsx"() {
    "use strict";
    init_useGraphStore();
    init_open_file();
    init_HoverTooltip();
    init_ContextMenu();
    init_Toast();
    init_Snackbar();
    init_modals();
  }
});

// src/web/App.tsx
import React21, { useCallback as useCallback12, useEffect as useEffect24, useMemo as useMemo21, useRef as useRef12 } from "react";
import { jsx as jsx49, jsxs as jsxs45 } from "react/jsx-runtime";
function App() {
  const store = useGraphStore();
  const didInit = useRef12(false);
  useEffect24(() => {
    if (didInit.current)
      return;
    didInit.current = true;
    store.setNodes(buildInitialNodes(GRAPH_DATA));
    store.setEdges(buildInitialEdges(GRAPH_DATA));
    document.documentElement.setAttribute("data-theme", store.theme);
  }, []);
  const [toastVisible, setToastVisible] = React21.useState(
    !!REMOTE_INFO?.fromCache
  );
  const {
    displayNodes,
    displayEdges,
    filteredNodes,
    filteredEdges,
    counts,
    isolatedCount,
    filteredIdsHash
  } = useGraphFilters();
  const edgesForFocus = useMemo21(() => {
    const ids = new Set(filteredNodes.map((n) => n.id));
    return displayEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [displayEdges, filteredNodes]);
  const highlight = useGraphHighlight(filteredEdges, edgesForFocus);
  const cyclesInfo = useMemo21(
    () => findCycles(displayNodes, displayEdges),
    [displayNodes, displayEdges]
  );
  const healthMap = useMemo21(() => {
    const map = /* @__PURE__ */ new Map();
    displayNodes.forEach((n) => {
      map.set(
        n.id,
        computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null)
      );
    });
    return map;
  }, [displayNodes, displayEdges, cyclesInfo]);
  const ruleViolations = useMemo21(
    () => evaluateRules(displayEdges, displayNodes, store.rules),
    [displayEdges, displayNodes, store.rules]
  );
  const violationsByEdge = useMemo21(() => {
    const m = /* @__PURE__ */ new Map();
    ruleViolations.forEach((v) => {
      if (!m.has(v.edgeId))
        m.set(v.edgeId, []);
      m.get(v.edgeId).push(v);
    });
    return m;
  }, [ruleViolations]);
  const edgesForRender = useMemo21(() => {
    if (highlight && (highlight.type === "focus" || highlight.type === "cycle" || highlight.type === "path")) {
      return edgesForFocus;
    }
    return filteredEdges;
  }, [filteredEdges, edgesForFocus, highlight]);
  const heatmapValues = useHeatmapValues(displayNodes, displayEdges, healthMap);
  const visibleNodes = useVisibleNodes(
    filteredNodes,
    highlight,
    healthMap,
    heatmapValues
  );
  const visibleEdges = useVisibleEdges(
    edgesForRender,
    highlight,
    violationsByEdge
  );
  const perfMode = useMemo21(
    () => filteredEdges.length > PERF_THRESHOLD,
    [filteredEdges.length]
  );
  const displayEdgesForRender = useMemo21(() => {
    const hideLabels = perfMode && !store.showEdgeLabels;
    if (!hideLabels)
      return visibleEdges;
    return visibleEdges.map((e) => e.label ? { ...e } : e);
  }, [visibleEdges, perfMode, store.showEdgeLabels]);
  useHotkeys();
  const tooltip = useTooltip();
  const { goto, back, forward } = useNavigation();
  const snapshots = useSnapshots(REMOTE_INFO?.server || null);
  const exportsApi = useExports({
    visibleNodes,
    visibleEdges,
    counts,
    isolatedCount,
    cyclesCount: cyclesInfo.sccs.length,
    healthMap,
    cyclesInfo
  });
  const commands = useCommands({
    filteredEdges,
    navBack: back,
    navForward: forward,
    onExportJSON: exportsApi.exportJSON,
    onExportMarkdown: exportsApi.exportMarkdown,
    onExportPNG: exportsApi.exportPNGFile
  });
  const { relayout, invalidate: invalidateLayout } = useGraphLayout({
    filteredNodes,
    filteredEdges,
    filteredIdsHash
  });
  useInitialFit(visibleNodes.length);
  const interactions = useNodeInteractions({ filteredEdges });
  useGraphEvents({ displayNodes, displayEdges });
  useGlobalClickDelegation(goto, tooltip.hide);
  const handleResetAll = useCallback12(() => {
    store.resetAll();
    invalidateLayout();
    setTimeout(() => {
      if (store.rfInstance) {
        try {
          store.rfInstance.fitView({ duration: 500, padding: 0.15 });
        } catch {
        }
      }
    }, 200);
  }, [store, invalidateLayout]);
  const startTour = useCallback12(
    (path) => {
      store.setTour({
        stages: path.stages,
        index: 0,
        playing: false,
        startedAt: Date.now()
      });
      store.setSelectedNodeId(null);
      store.setFocusNode(null);
      store.setCycleHighlight(null);
      store.setPathResult(null);
      store.setPathSel([]);
    },
    [store]
  );
  const allDomainsList = useMemo21(
    () => store.nodes.filter((n) => n.data.nodeType === "domain").map((n) => ({ id: n.id, domainId: n.data.domainId })),
    [store.nodes]
  );
  const visibleDomainsList = useMemo21(
    () => visibleNodes.filter((n) => n.data.nodeType === "domain").map((n) => ({ id: n.id, domainId: n.data.domainId })),
    [visibleNodes]
  );
  const bookmarkedDomainsList = useMemo21(
    () => store.nodes.filter(
      (n) => store.bookmarks.has(n.id) && n.data.nodeType === "domain"
    ).map((n) => ({ id: n.id, domainId: n.data.domainId })),
    [store.nodes, store.bookmarks]
  );
  const entityIndex = useMemo21(
    () => buildEntityIndex(GRAPH_DATA.entities || []),
    []
  );
  const activeFiltersCount = useMemo21(() => {
    let c = 0;
    const f = store.filters;
    if (!f.domain)
      c++;
    if (!f.missing)
      c++;
    if (!f.broken)
      c++;
    if (!f.linkage)
      c++;
    if (!f.fqid)
      c++;
    if (store.namespaceFilter.trim())
      c++;
    if (store.tagFilters.size > 0)
      c++;
    if (store.isolatedOnly)
      c++;
    if (store.bookmarksOnly)
      c++;
    if (store.onlyInvalid)
      c++;
    if (store.hiddenNodeIds.size > 0)
      c++;
    return c;
  }, [
    store.filters,
    store.namespaceFilter,
    store.tagFilters,
    store.isolatedOnly,
    store.bookmarksOnly,
    store.onlyInvalid,
    store.hiddenNodeIds
  ]);
  const closeToast = useCallback12(() => setToastVisible(false), []);
  return /* @__PURE__ */ jsxs45("div", { className: "app", children: [
    /* @__PURE__ */ jsx49(
      Sidebar,
      {
        healthMap,
        cyclesCount: cyclesInfo.sccs.length,
        cacheDiff: GRAPH_DATA.cacheDiff || null,
        onFitView: () => {
          if (store.rfInstance) {
            try {
              store.rfInstance.fitView({ duration: 500, padding: 0.15 });
            } catch {
            }
          }
        },
        onExportStats: exportsApi.exportStats
      }
    ),
    /* @__PURE__ */ jsxs45("main", { className: "main", children: [
      /* @__PURE__ */ jsx49(
        Toolbar,
        {
          counts,
          visibleNodesCount: visibleNodes.length,
          visibleEdgesCount: visibleEdges.length,
          totalNodesCount: store.nodes.length,
          totalEdgesCount: store.edges.length,
          activeFiltersCount,
          remoteInfo: REMOTE_INFO,
          cycleHighlight: store.cycleHighlight,
          ruleViolationsCount: ruleViolations.length,
          onFindCycles: () => document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES)),
          onStartPathFinder: () => {
            store.setPathMode({ anchorId: null });
            store.setPathSel([]);
            store.setPathResult(null);
          },
          onOpenTopo: () => store.setTopoOpen(true),
          onOpenLearningPath: () => store.setLearningPathOpen(true),
          onOpenRules: () => store.setRulesOpen(true),
          onOpenEntityHierarchy: () => {
            store.setEntityHierarchyInitialKey(null);
            store.setEntityHierarchyOpen(true);
          },
          onOpenValidation: () => store.setValidationOpen(true),
          onExportJSON: exportsApi.exportJSON,
          onExportMarkdown: exportsApi.exportMarkdown,
          onExportPNG: exportsApi.exportPNGFile,
          onExportMermaid: exportsApi.exportMermaidFile,
          onSaveSnapshot: snapshots.save,
          onLoadSnapshot: snapshots.load,
          onClearSnapshot: snapshots.clear,
          onSnapshotUpload: snapshots.upload,
          onApplyLayout: relayout,
          onResetAll: handleResetAll,
          onRelayout: relayout,
          onShowToast: () => setToastVisible(true)
        }
      ),
      /* @__PURE__ */ jsx49(ActiveModesBar, { ruleViolationsCount: ruleViolations.length }),
      /* @__PURE__ */ jsx49(
        GraphArea,
        {
          visibleNodes,
          visibleEdges,
          displayEdgesForRender,
          perfMode,
          heatmapValues,
          interactions,
          entities: GRAPH_DATA.entities || [],
          entityIndex,
          ruleViolations,
          onOpenEntityHierarchy: (key) => {
            store.setEntityHierarchyInitialKey(key);
            store.setEntityHierarchyOpen(true);
          },
          onResetAll: handleResetAll
        }
      )
    ] }),
    /* @__PURE__ */ jsx49(
      AppModals,
      {
        commands,
        entities: GRAPH_DATA.entities || [],
        allDomains: allDomainsList,
        visibleDomains: visibleDomainsList,
        bookmarkedDomains: bookmarkedDomainsList,
        ruleViolations,
        onStartTour: startTour,
        onContextAction: interactions.handleContextAction,
        remoteInfo: REMOTE_INFO,
        refreshCommand: REFRESH_COMMAND,
        toastVisible,
        onToastClose: closeToast
      }
    )
  ] });
}
var GRAPH_DATA, REMOTE_INFO, REFRESH_COMMAND, PERF_THRESHOLD;
var init_App = __esm({
  "src/web/App.tsx"() {
    "use strict";
    init_useGraphStore();
    init_initial();
    init_hooks();
    init_cycles();
    init_health();
    init_rules();
    init_entities();
    init_events();
    init_Toolbar();
    init_ActiveModesBar();
    init_Sidebar();
    init_GraphArea();
    init_AppModals();
    GRAPH_DATA = readGraphData();
    REMOTE_INFO = readRemoteInfo();
    REFRESH_COMMAND = readRefreshCommand();
    PERF_THRESHOLD = 250;
  }
});

// src/web/entry.tsx
import { createRoot } from "react-dom/client";
import { jsx as jsx50 } from "react/jsx-runtime";
var require_entry = __commonJS({
  "src/web/entry.tsx"() {
    init_App();
    var container = document.getElementById("root");
    if (!container)
      throw new Error("#root not found");
    createRoot(container).render(/* @__PURE__ */ jsx50(App, {}));
  }
});
export default require_entry();
//# sourceMappingURL=web.bundle.js.map
