var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// web/app.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  useStore
} from "reactflow";
import dagre from "dagre";
var require_app = __commonJS({
  "web/app.jsx"() {
    var GRAPH_DATA = JSON.parse(document.getElementById("graph-data").textContent);
    var REMOTE_INFO = function() {
      try {
        return JSON.parse(document.getElementById("remote-info").textContent);
      } catch (e) {
        return null;
      }
    }();
    var REFRESH_COMMAND = function() {
      try {
        return JSON.parse(document.getElementById("refresh-command").textContent);
      } catch (e) {
        return null;
      }
    }();
    var NODE_WIDTH = 300;
    var NODE_HEIGHT = 88;
    var NODE_COMPACT = 42;
    var LINKAGE_COLOR = "#6366a1";
    var FQID_COLOR = "#4b7c6c";
    var PATH_COLOR = "#fbbf24";
    var DIFF_ADDED = "#22c55e";
    var DIFF_REMOVED = "#ef4444";
    function MIcon(props) {
      var cls = "material-symbols-outlined";
      if (props.size === "sm")
        cls += " mi-sm";
      else if (props.size === "lg")
        cls += " mi-lg";
      else if (props.size === "xl")
        cls += " mi-xl";
      else
        cls += " mi-md";
      if (props.fill)
        cls += " mi-fill";
      if (props.className)
        cls += " " + props.className;
      return React.createElement("span", {
        className: cls,
        "aria-hidden": "true",
        title: props.title || void 0
      }, props.name);
    }
    function clusterLayout(nodes, edges, getKeyForDepth) {
      var NODE_W = NODE_WIDTH;
      var NODE_H = NODE_HEIGHT;
      var CLUSTER_PAD = 36;
      var HEADER_H = 30;
      var MAX_GROUPS = 50;
      var effectiveDepth = 2;
      for (var d = 1; d <= 5; d++) {
        var cnt = /* @__PURE__ */ new Set();
        nodes.forEach(function(n) {
          if (n.data && n.data.nodeType === "domain") {
            var key = getKeyForDepth(n, d);
            if (key)
              cnt.add(key);
          }
        });
        effectiveDepth = d;
        if (cnt.size <= MAX_GROUPS)
          break;
      }
      var groups = /* @__PURE__ */ new Map();
      var nodeToNs = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        if (!n.data || n.data.nodeType !== "domain") {
          var key = "__other__";
          if (!groups.has(key))
            groups.set(key, []);
          groups.get(key).push(n);
          nodeToNs.set(n.id, key);
          return;
        }
        var ns = getKeyForDepth(n, effectiveDepth);
        if (!groups.has(ns))
          groups.set(ns, []);
        groups.get(ns).push(n);
        nodeToNs.set(n.id, ns);
      });
      var groupLayouts = /* @__PURE__ */ new Map();
      groups.forEach(function(groupNodes, ns) {
        if (ns === "__other__") {
          var laidOther = groupNodes.map(function(n, i) {
            return Object.assign({}, n, { __x: i * (NODE_W + 20), __y: 0 });
          });
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
            nodes: groupNodes.map(function(n) {
              return Object.assign({}, n, { __x: 0, __y: 0 });
            }),
            width: NODE_W,
            height: NODE_H,
            label: ns
          });
          return;
        }
        var g = new dagre.graphlib.Graph();
        g.setDefaultEdgeLabel(function() {
          return {};
        });
        g.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 60, marginx: 10, marginy: 10 });
        var ids = new Set(groupNodes.map(function(n) {
          return n.id;
        }));
        groupNodes.forEach(function(n) {
          g.setNode(n.id, { width: NODE_W, height: NODE_H });
        });
        edges.forEach(function(e) {
          if (ids.has(e.source) && ids.has(e.target))
            g.setEdge(e.source, e.target);
        });
        dagre.layout(g);
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var raw = groupNodes.map(function(n) {
          var pos = g.node(n.id);
          var x = pos.x - NODE_W / 2;
          var y = pos.y - NODE_H / 2;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + NODE_W);
          maxY = Math.max(maxY, y + NODE_H);
          return { node: n, x, y };
        });
        var laid = raw.map(function(item) {
          return Object.assign({}, item.node, {
            __x: item.x - minX,
            __y: item.y - minY
          });
        });
        groupLayouts.set(ns, {
          nodes: laid,
          width: maxX - minX,
          height: maxY - minY,
          label: ns
        });
      });
      var metaEdgesMap = /* @__PURE__ */ new Map();
      edges.forEach(function(e) {
        var sNs = nodeToNs.get(e.source);
        var tNs = nodeToNs.get(e.target);
        if (!sNs || !tNs || sNs === tNs)
          return;
        metaEdgesMap.set(sNs + "\u2192" + tNs, 1);
      });
      var meta = new dagre.graphlib.Graph();
      meta.setDefaultEdgeLabel(function() {
        return {};
      });
      meta.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });
      groupLayouts.forEach(function(layout, ns) {
        var w = layout.width + (layout.label ? CLUSTER_PAD * 2 : 0);
        var h = layout.height + (layout.label ? CLUSTER_PAD * 2 + HEADER_H : 0);
        meta.setNode(ns, { width: w, height: h });
      });
      metaEdgesMap.forEach(function(_, key) {
        var p = key.split("\u2192");
        meta.setEdge(p[0], p[1]);
      });
      dagre.layout(meta);
      var finalNodes = [];
      var boxes = [];
      groupLayouts.forEach(function(layout, ns) {
        var metaPos = meta.node(ns);
        var hasLabel = !!layout.label;
        var padX = hasLabel ? CLUSTER_PAD : 0;
        var padY = hasLabel ? CLUSTER_PAD + HEADER_H : 0;
        var groupW = layout.width + padX * 2;
        var groupH = layout.height + padY + (hasLabel ? CLUSTER_PAD : 0);
        var groupX = metaPos ? metaPos.x - groupW / 2 : 0;
        var groupY = metaPos ? metaPos.y - groupH / 2 : 0;
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
        layout.nodes.forEach(function(n) {
          var copy = Object.assign({}, n);
          delete copy.__x;
          delete copy.__y;
          finalNodes.push(Object.assign(copy, {
            position: {
              x: groupX + padX + n.__x,
              y: groupY + padY + n.__y
            },
            width: NODE_W,
            height: NODE_H,
            targetPosition: "left",
            sourcePosition: "right"
          }));
        });
      });
      return { nodes: finalNodes, boxes, effectiveDepth };
    }
    function dagreLayout(nodes, edges, rankdir) {
      rankdir = rankdir || "LR";
      var W = typeof NODE_WIDTH === "number" && isFinite(NODE_WIDTH) ? NODE_WIDTH : 220;
      var H = typeof NODE_HEIGHT === "number" && isFinite(NODE_HEIGHT) ? NODE_HEIGHT : 60;
      var CW = typeof NODE_COMPACT === "number" && isFinite(NODE_COMPACT) ? NODE_COMPACT : 28;
      var g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(function() {
        return {};
      });
      g.setGraph({ rankdir, nodesep: 18, ranksep: 60, edgesep: 10, marginx: 40, marginy: 40 });
      var validNodes = nodes.filter(function(n) {
        return n && typeof n.id === "string" && n.id.length > 0;
      });
      validNodes.forEach(function(n) {
        var isCompact = n.data && n.data.__compact;
        g.setNode(n.id, {
          width: isCompact ? CW : W,
          height: isCompact ? CW : H
        });
      });
      var validIds = new Set(validNodes.map(function(n) {
        return n.id;
      }));
      edges.forEach(function(e) {
        if (!e || !e.source || !e.target)
          return;
        if (!validIds.has(e.source) || !validIds.has(e.target))
          return;
        g.setEdge(e.source, e.target);
      });
      dagre.layout(g);
      return validNodes.map(function(n) {
        var pos = g.node(n.id);
        var isCompact = n.data && n.data.__compact;
        var w = isCompact ? CW : W;
        var h = isCompact ? CW : H;
        var x = pos && typeof pos.x === "number" && isFinite(pos.x) ? pos.x - w / 2 : 0;
        var y = pos && typeof pos.y === "number" && isFinite(pos.y) ? pos.y - h / 2 : 0;
        return Object.assign({}, n, {
          position: { x, y },
          width: w,
          // ← добавили
          height: h,
          // ← добавили
          targetPosition: rankdir === "LR" ? "left" : "top",
          sourcePosition: rankdir === "LR" ? "right" : "bottom"
        });
      });
    }
    function circularLayout(nodes) {
      var n = nodes.length;
      var R = Math.max(350, n * 40);
      var W = typeof NODE_WIDTH === "number" && isFinite(NODE_WIDTH) ? NODE_WIDTH : 220;
      var H = typeof NODE_HEIGHT === "number" && isFinite(NODE_HEIGHT) ? NODE_HEIGHT : 60;
      var CW = typeof NODE_COMPACT === "number" && isFinite(NODE_COMPACT) ? NODE_COMPACT : 28;
      return nodes.map(
        function(node, i) {
          var angle = i / n * 2 * Math.PI - Math.PI / 2;
          var px = Math.cos(angle) * R;
          var py = Math.sin(angle) * R;
          var isCompact = n.data && n.data.__compact;
          var w = isCompact ? CW : W;
          var h = isCompact ? CW : H;
          return Object.assign({}, node, {
            position: {
              x: isFinite(px) ? px : i * 250,
              y: isFinite(py) ? py : 0
            },
            width: w,
            // ← добавили
            height: h,
            // ← добавили
            targetPosition: "left",
            sourcePosition: "right"
          });
        }
      );
    }
    function forceLayout(nodes, edges) {
      var n = nodes.length;
      var pos = nodes.map(function(_, i2) {
        var a2 = i2 / n * 2 * Math.PI;
        return { x: Math.cos(a2) * 400, y: Math.sin(a2) * 400 };
      });
      var idx = /* @__PURE__ */ new Map();
      nodes.forEach(function(node, i2) {
        idx.set(node.id, i2);
      });
      var links = edges.map(function(e) {
        return [idx.get(e.source), idx.get(e.target)];
      }).filter(function(l) {
        return l[0] != null && l[1] != null;
      });
      for (var iter = 0; iter < 250; iter++) {
        var fx = new Array(n).fill(0);
        var fy = new Array(n).fill(0);
        for (var i = 0; i < n; i++) {
          for (var j = i + 1; j < n; j++) {
            var dx = pos[j].x - pos[i].x;
            var dy = pos[j].y - pos[i].y;
            var d2 = dx * dx + dy * dy + 0.01;
            var d = Math.sqrt(d2);
            var f = 8e3 / d2;
            fx[i] -= dx / d * f;
            fy[i] -= dy / d * f;
            fx[j] += dx / d * f;
            fy[j] += dy / d * f;
          }
        }
        for (var k = 0; k < links.length; k++) {
          var a = links[k][0], b = links[k][1];
          var ddx = pos[b].x - pos[a].x;
          var ddy = pos[b].y - pos[a].y;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
          var ff = (dd - 200) * 0.02;
          fx[a] += ddx / dd * ff;
          fy[a] += ddy / dd * ff;
          fx[b] -= ddx / dd * ff;
          fy[b] -= ddy / dd * ff;
        }
        var alpha = 1 - iter / 250;
        for (var m = 0; m < n; m++) {
          pos[m].x += fx[m] * alpha * 0.5;
          pos[m].y += fy[m] * alpha * 0.5;
        }
      }
      var W = typeof NODE_WIDTH === "number" && isFinite(NODE_WIDTH) ? NODE_WIDTH : 220;
      var H = typeof NODE_HEIGHT === "number" && isFinite(NODE_HEIGHT) ? NODE_HEIGHT : 60;
      var CW = typeof NODE_COMPACT === "number" && isFinite(NODE_COMPACT) ? NODE_COMPACT : 28;
      return nodes.map(function(node, i2) {
        var isCompact = n.data && n.data.__compact;
        var w = isCompact ? CW : W;
        var h = isCompact ? CW : H;
        return Object.assign({}, node, {
          position: { x: isFinite(pos[i2].x) ? pos[i2].x : i2 * 250, y: isFinite(pos[i2].y) ? pos[i2].y : 0 },
          targetPosition: "left",
          sourcePosition: "right",
          width: w,
          // ← добавили
          height: h
          // ← добавили
        });
      });
    }
    function getFolderKey(n, depth) {
      var fp = n.data && n.data.folderPath || [];
      if (fp.length === 0)
        return "__root__";
      return fp.slice(0, depth).join("/") || "__root__";
    }
    function runLayout(nodes, edges, type, opts) {
      if (type === "TB")
        return { nodes: dagreLayout(nodes, edges, "TB"), boxes: [], effectiveDepth: null };
      if (type === "force")
        return { nodes: forceLayout(nodes, edges), boxes: [], effectiveDepth: null };
      if (type === "circular")
        return { nodes: circularLayout(nodes), boxes: [], effectiveDepth: null };
      if (type === "cluster") {
        var result = clusterLayout(nodes, edges, getNsByDomainId);
        return { nodes: result.nodes, boxes: result.boxes, effectiveDepth: result.effectiveDepth };
      }
      if (type === "folder") {
        var result2 = clusterLayout(nodes, edges, getFolderKey);
        return { nodes: result2.nodes, boxes: result2.boxes, effectiveDepth: result2.effectiveDepth };
      }
      return { nodes: dagreLayout(nodes, edges, "LR"), boxes: [], effectiveDepth: null };
    }
    function escapeHtml(s) {
      if (s === null || s === void 0)
        return "";
      return String(s).replace(/[&<>"']/g, function(c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function HighlightedText(props) {
      var text = props.text;
      var query = props.query;
      if (text === null || text === void 0)
        return null;
      var str = String(text);
      var q = (query || "").trim();
      if (!q)
        return str;
      var lower = str.toLowerCase();
      var qLower = q.toLowerCase();
      var parts = [];
      var pos = 0;
      var idx = lower.indexOf(qLower, pos);
      var key = 0;
      while (idx !== -1) {
        if (idx > pos)
          parts.push(str.slice(pos, idx));
        parts.push(React.createElement("mark", { key: "m" + key++, className: "search-hl" }, str.slice(idx, idx + q.length)));
        pos = idx + q.length;
        idx = lower.indexOf(qLower, pos);
      }
      if (pos < str.length)
        parts.push(str.slice(pos));
      return React.createElement(React.Fragment, null, ...parts);
    }
    function matchesNamespace(domainId, filterPattern) {
      if (!filterPattern || filterPattern.trim() === "")
        return true;
      var tokens = filterPattern.replace(/[,;]/g, " ").split(" ").filter(function(p) {
        return p.length > 0;
      }).map(function(p) {
        return p.toLowerCase();
      });
      if (tokens.length === 0)
        return true;
      var id = domainId.toLowerCase();
      var include = tokens.filter(function(t) {
        return t.charAt(0) !== "!";
      });
      var exclude = tokens.filter(function(t) {
        return t.charAt(0) === "!";
      }).map(function(t) {
        return t.slice(1);
      }).filter(function(t) {
        return t.length > 0;
      });
      for (var i = 0; i < exclude.length; i++) {
        if (simplePatternMatch(id, exclude[i]))
          return false;
      }
      if (include.length === 0)
        return true;
      for (var j = 0; j < include.length; j++) {
        if (simplePatternMatch(id, include[j]))
          return true;
      }
      return false;
    }
    function simplePatternMatch(domainId, pattern) {
      if (pattern.indexOf("*") !== -1) {
        var parts = pattern.split("*");
        if (parts[0]) {
          var prefix = parts[0];
          var prefixNoDot = prefix.charAt(prefix.length - 1) === "." ? prefix.slice(0, -1) : prefix;
          if (domainId.indexOf(prefix) !== 0 && domainId !== prefixNoDot)
            return false;
        }
        if (parts[parts.length - 1]) {
          var last = parts[parts.length - 1];
          if (domainId.lastIndexOf(last) !== domainId.length - last.length)
            return false;
        }
        var pos = parts[0] ? parts[0].length : 0;
        for (var i = 1; i < parts.length - 1; i++) {
          if (!parts[i])
            continue;
          var found = domainId.indexOf(parts[i], pos);
          if (found === -1)
            return false;
          pos = found + parts[i].length;
        }
        return true;
      }
      return domainId === pattern || domainId.indexOf(pattern + ".") === 0;
    }
    function buildDependencyGraph(nodes, edges, options) {
      var opts = options || {};
      var includeFqid = opts.includeFqid !== false;
      var includeLinkage = opts.includeLinkage !== false;
      var missingAsSatisfied = opts.missingAsSatisfied !== false;
      var excludedIds = opts.excludedIds || /* @__PURE__ */ new Set();
      var restrictTo = opts.restrictTo || null;
      var nodeById = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        nodeById.set(n.id, n);
      });
      var deps = /* @__PURE__ */ new Map();
      var domainIds = /* @__PURE__ */ new Set();
      nodes.forEach(function(n) {
        if (n.data.nodeType !== "domain")
          return;
        var did = n.data.domainId;
        if (excludedIds.has(did.toLowerCase()))
          return;
        if (restrictTo && !restrictTo.has(did))
          return;
        domainIds.add(did);
        deps.set(did, /* @__PURE__ */ new Set());
      });
      edges.forEach(function(e) {
        var kind = e.data && e.data.kind;
        if (kind === "linkage" && !includeLinkage)
          return;
        if (kind === "fqid" && !includeFqid)
          return;
        if (kind === "aggregated")
          return;
        var srcNode = nodeById.get(e.source);
        var tgtNode = nodeById.get(e.target);
        if (!srcNode || !tgtNode)
          return;
        if (srcNode.data.nodeType !== "domain")
          return;
        var srcId = srcNode.data.domainId;
        if (!domainIds.has(srcId))
          return;
        var tgtType = tgtNode.data.nodeType;
        if (tgtType === "broken")
          return;
        if (tgtType === "missing")
          return;
        var tgtId = tgtNode.data.domainId;
        if (!domainIds.has(tgtId))
          return;
        if (srcId === tgtId)
          return;
        deps.get(srcId).add(tgtId);
      });
      return { deps, domainIds, nodeById };
    }
    function topologicalSort(depGraph, options) {
      var opts = options || {};
      var autoBreak = !!opts.autoBreakCycles;
      var deps = depGraph.deps;
      var remaining = new Set(depGraph.domainIds);
      var levels = [];
      var broken = [];
      while (remaining.size > 0) {
        var level = [];
        var ready = [];
        remaining.forEach(function(id) {
          var ready_flag = true;
          var depsSet = deps.get(id);
          if (depsSet) {
            depsSet.forEach(function(dep) {
              if (remaining.has(dep))
                ready_flag = false;
            });
          }
          if (ready_flag)
            ready.push(id);
        });
        if (ready.length === 0) {
          if (!autoBreak)
            break;
          var best = null;
          var bestCount = Infinity;
          remaining.forEach(function(id) {
            var cnt = 0;
            var s2 = deps.get(id);
            if (s2)
              s2.forEach(function(dep) {
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
          var brokenDeps = [];
          var s = deps.get(best);
          if (s) {
            s.forEach(function(dep) {
              if (remaining.has(dep))
                brokenDeps.push(dep);
            });
            brokenDeps.forEach(function(dep) {
              s.delete(dep);
            });
          }
          broken.push({ id: best, level: levels.length + 1, brokenDeps });
          remaining.delete(best);
          level.push(best);
          continue;
        }
        ready.forEach(function(id) {
          remaining.delete(id);
        });
        levels.push(ready.sort());
      }
      var cyclic = Array.from(remaining).sort();
      return {
        levels,
        cyclic,
        criticalPath: levels.length,
        broken
      };
    }
    function computeLearningPath(nodes, edges, options) {
      var opts = options || {};
      var nodeById = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        nodeById.set(n.id, n);
      });
      var domainNodes = nodes.filter(function(n) {
        return n.data.nodeType === "domain";
      });
      var fanIn = /* @__PURE__ */ new Map();
      var fanOut = /* @__PURE__ */ new Map();
      domainNodes.forEach(function(n) {
        fanIn.set(n.id, 0);
        fanOut.set(n.id, 0);
      });
      edges.forEach(function(e) {
        if (!nodeById.has(e.source) || !nodeById.has(e.target))
          return;
        if (fanOut.has(e.source))
          fanOut.set(e.source, fanOut.get(e.source) + 1);
        if (fanIn.has(e.target))
          fanIn.set(e.target, fanIn.get(e.target) + 1);
      });
      var entryPoints = domainNodes.filter(function(n) {
        var fi = fanIn.get(n.id) || 0;
        var fo = fanOut.get(n.id) || 0;
        return fi === 0 && fo > 0;
      });
      var deps = /* @__PURE__ */ new Map();
      domainNodes.forEach(function(n) {
        deps.set(n.id, /* @__PURE__ */ new Set());
      });
      edges.forEach(function(e) {
        if (!nodeById.has(e.source) || !nodeById.has(e.target))
          return;
        var src = nodeById.get(e.source);
        var tgt = nodeById.get(e.target);
        if (src.data.nodeType !== "domain" || tgt.data.nodeType !== "domain")
          return;
        if (src.id === tgt.id)
          return;
        deps.get(src.id).add(tgt.id);
      });
      var remaining = new Set(domainNodes.map(function(n) {
        return n.id;
      }));
      var stages = [];
      while (remaining.size > 0) {
        var stage = [];
        remaining.forEach(function(id) {
          var ready = true;
          deps.get(id).forEach(function(dep) {
            if (remaining.has(dep))
              ready = false;
          });
          if (ready)
            stage.push(id);
        });
        if (stage.length === 0)
          break;
        stage.forEach(function(id) {
          remaining.delete(id);
        });
        stage.sort(function(a, b) {
          return (fanIn.get(b) || 0) - (fanIn.get(a) || 0);
        });
        stages.push(stage);
      }
      var unresolved = Array.from(remaining);
      function enrich(id) {
        var n = nodeById.get(id);
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
      var enrichedStages = stages.map(function(stage2, idx) {
        return {
          index: idx,
          domains: stage2.map(enrich).filter(Boolean)
        };
      });
      return {
        entryPoints: entryPoints.map(function(n) {
          return enrich(n.id);
        }).filter(Boolean),
        stages: enrichedStages,
        totalStages: stages.length,
        totalDomains: domainNodes.length,
        unresolved: unresolved.map(enrich).filter(Boolean)
      };
    }
    function generateLearningPathMarkdown(path, options) {
      var lines = [];
      lines.push("# \u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B");
      lines.push("");
      lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
      lines.push("");
      if (options && options.scope) {
        lines.push("\u041E\u0431\u043B\u0430\u0441\u0442\u044C: **" + options.scope + "**");
        lines.push("");
      }
      lines.push("\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0447\u0442\u0435\u043D\u0438\u044F \u043F\u043E\u0441\u0442\u0440\u043E\u0435\u043D \u043E\u0442 \xAB\u0444\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442\u0430\xBB (\u0434\u043E\u043C\u0435\u043D\u044B \u0431\u0435\u0437 \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439) \u043A \u0432\u0435\u0440\u0445\u043D\u0438\u043C \u0441\u043B\u043E\u044F\u043C.");
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
        lines.push("\u042D\u0442\u0438 \u0434\u043E\u043C\u0435\u043D\u044B \u2014 \xAB\u043A\u043B\u0438\u0435\u043D\u0442\u044B\xBB \u0441\u0438\u0441\u0442\u0435\u043C\u044B: \u043E\u043D\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442 \u0434\u0440\u0443\u0433\u0438\u0445, \u043D\u043E \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0438\u0445. \u0425\u043E\u0440\u043E\u0448\u0438\u0435 \u043F\u0440\u0438\u043C\u0435\u0440\u044B \u0434\u043B\u044F \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F, \u043F\u043E\u0442\u043E\u043C\u0443 \u0447\u0442\u043E \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0432\u0435\u0440\u0445\u043D\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F.");
        lines.push("");
        path.entryPoints.slice(0, 20).forEach(function(d) {
          lines.push("- `" + d.domainId + "`" + (d.label && d.label !== d.domainId ? " \u2014 " + d.label : ""));
        });
        lines.push("");
      }
      path.stages.forEach(function(stage) {
        lines.push("## \u042D\u0442\u0430\u043F " + (stage.index + 1) + " \u2014 " + stage.domains.length + " " + plural(stage.domains.length, "\u0434\u043E\u043C\u0435\u043D", "\u0434\u043E\u043C\u0435\u043D\u043E\u0432"));
        lines.push("");
        stage.domains.forEach(function(d) {
          lines.push("### `" + d.domainId + "`");
          if (d.label && d.label !== d.domainId)
            lines.push("_ " + d.label + "_");
          lines.push("");
          if (d.description)
            lines.push(d.description);
          lines.push("");
          var stats = [];
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
        path.unresolved.forEach(function(d) {
          lines.push("- `" + d.domainId + "`");
        });
        lines.push("");
      }
      return lines.join("\n");
    }
    function resolveEntityRef(ref, currentDomainId) {
      if (!ref || typeof ref !== "string")
        return null;
      var slash = ref.indexOf("/");
      if (slash > 0) {
        return { domainId: ref.slice(0, slash), entityId: ref.slice(slash + 1) };
      }
      return { domainId: currentDomainId, entityId: ref };
    }
    function entityKey(domainId, entityId) {
      return domainId.toLowerCase() + "/" + entityId.toLowerCase();
    }
    function buildEntityIndex(entities) {
      var byKey = /* @__PURE__ */ new Map();
      entities.forEach(function(e) {
        var key = entityKey(e.domainId, e.entityId);
        byKey.set(key, e);
      });
      var children = /* @__PURE__ */ new Map();
      entities.forEach(function(e) {
        if (!e.inherits)
          return;
        var ref = resolveEntityRef(e.inherits, e.domainId);
        if (!ref)
          return;
        var parentKey = entityKey(ref.domainId, ref.entityId);
        if (!children.has(parentKey))
          children.set(parentKey, []);
        children.get(parentKey).push(e);
      });
      return { byKey, children };
    }
    function buildEntityTree(rootKey, index) {
      var byKey = index.byKey;
      var childMap = index.children;
      var nodesMap = /* @__PURE__ */ new Map();
      var edgesMap = /* @__PURE__ */ new Map();
      function addNode(key) {
        if (nodesMap.has(key))
          return nodesMap.get(key);
        var e = byKey.get(key);
        var parts = key.split("/");
        var node = {
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
        var visited = /* @__PURE__ */ new Set();
        var stack = [startKey];
        while (stack.length > 0) {
          var key = stack.pop();
          if (visited.has(key))
            continue;
          visited.add(key);
          var e = byKey.get(key);
          if (!e || !e.inherits)
            continue;
          var ref = resolveEntityRef(e.inherits, e.domainId);
          if (!ref)
            continue;
          var parentKey = entityKey(ref.domainId, ref.entityId);
          addNode(parentKey);
          var edgeId = parentKey + "->" + key;
          if (!edgesMap.has(edgeId)) {
            edgesMap.set(edgeId, { id: edgeId, source: parentKey, target: key });
          }
          if (!visited.has(parentKey))
            stack.push(parentKey);
        }
      }
      function traverseChildren(startKey) {
        var visited = /* @__PURE__ */ new Set();
        var stack = [startKey];
        while (stack.length > 0) {
          var key = stack.pop();
          if (visited.has(key))
            continue;
          visited.add(key);
          var kids = childMap.get(key) || [];
          kids.forEach(function(child) {
            var childKey = entityKey(child.domainId, child.entityId);
            addNode(childKey);
            var edgeId = key + "->" + childKey;
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
      var nodes = Array.from(nodesMap.values());
      var edges = Array.from(edgesMap.values());
      var cycleNodes = detectEntityCycles(nodes, edges);
      var isRoot = function(k) {
        return k === rootKey;
      };
      var parents = /* @__PURE__ */ new Set();
      var children = /* @__PURE__ */ new Set();
      (function() {
        var stack = [rootKey];
        var visited = /* @__PURE__ */ new Set([rootKey]);
        while (stack.length > 0) {
          var k = stack.pop();
          var e = byKey.get(k);
          if (!e || !e.inherits)
            continue;
          var ref = resolveEntityRef(e.inherits, e.domainId);
          if (!ref)
            continue;
          var pk = entityKey(ref.domainId, ref.entityId);
          if (!parents.has(pk))
            parents.add(pk);
          if (!visited.has(pk)) {
            visited.add(pk);
            stack.push(pk);
          }
        }
      })();
      (function() {
        var stack = [rootKey];
        var visited = /* @__PURE__ */ new Set([rootKey]);
        while (stack.length > 0) {
          var k = stack.pop();
          var kids = childMap.get(k) || [];
          kids.forEach(function(child) {
            var ck = entityKey(child.domainId, child.entityId);
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
      var adj = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        adj.set(n.key, []);
      });
      edges.forEach(function(e) {
        if (adj.has(e.source))
          adj.get(e.source).push(e.target);
      });
      var index = 0;
      var stack = [];
      var onStack = /* @__PURE__ */ new Set();
      var indices = /* @__PURE__ */ new Map();
      var lowlinks = /* @__PURE__ */ new Map();
      var sccs = [];
      function strongconnect(v) {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        var neighbors = adj.get(v) || [];
        for (var i = 0; i < neighbors.length; i++) {
          var to = neighbors[i];
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
          var scc = [];
          var w;
          do {
            w = stack.pop();
            onStack.delete(w);
            scc.push(w);
          } while (w !== v);
          if (scc.length > 1)
            sccs.push(scc);
        }
      }
      nodes.forEach(function(n) {
        if (!indices.has(n.key))
          strongconnect(n.key);
      });
      var result = /* @__PURE__ */ new Set();
      sccs.forEach(function(scc) {
        scc.forEach(function(k) {
          result.add(k);
        });
      });
      return result;
    }
    function layoutEntityGraph(nodes, edges, rootKey) {
      var ENTITY_W = 180;
      var ENTITY_H = 60;
      var ROOT_W = ENTITY_W * 1.35;
      var ROOT_H = ENTITY_H * 1.2;
      var g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(function() {
        return {};
      });
      g.setGraph({ rankdir: "TB", nodesep: 25, ranksep: 55, marginx: 30, marginy: 30 });
      nodes.forEach(function(n) {
        var w = n.key === rootKey ? ROOT_W : ENTITY_W;
        var h = n.key === rootKey ? ROOT_H : ENTITY_H;
        g.setNode(n.key, { width: w, height: h });
      });
      edges.forEach(function(e) {
        g.setEdge(e.source, e.target);
      });
      dagre.layout(g);
      return nodes.map(function(n) {
        var pos = g.node(n.key);
        var w = n.key === rootKey ? ROOT_W : ENTITY_W;
        var h = n.key === rootKey ? ROOT_H : ENTITY_H;
        return Object.assign({}, n, {
          x: pos.x - w / 2,
          y: pos.y - h / 2,
          width: w,
          height: h
        });
      });
    }
    function EntityHierarchyGraph(props) {
      var tree = props.tree;
      var onSelect = props.onSelect;
      var onGotoDomain = props.onGotoDomain;
      var svgRef = useRef(null);
      var containerRef = useRef(null);
      var [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
      var dragRef = useRef(null);
      var [isDragging, setIsDragging] = useState(false);
      var laid = useMemo(function() {
        if (!tree)
          return null;
        return layoutEntityGraph(tree.nodes, tree.edges, tree.rootKey);
      }, [tree]);
      useEffect(function() {
        setViewport({ x: 0, y: 0, scale: 1 });
      }, [tree && tree.rootKey]);
      var fitView = useCallback(function() {
        if (!laid || !containerRef.current)
          return;
        var containerRect = containerRef.current.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0)
          return;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        laid.forEach(function(n) {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + n.width);
          maxY = Math.max(maxY, n.y + n.height);
        });
        var pad = 60;
        var w = maxX - minX + pad * 2;
        var h = maxY - minY + pad * 2;
        var scale = Math.min(containerRect.width / w, containerRect.height / h, 1.5);
        var cx = containerRect.width / 2;
        var cy = containerRect.height / 2;
        var treeCx = (minX + maxX) / 2;
        var treeCy = (minY + maxY) / 2;
        setViewport({
          x: cx - treeCx * scale,
          y: cy - treeCy * scale,
          scale
        });
      }, [laid]);
      useEffect(function() {
        if (!laid)
          return;
        var t = setTimeout(fitView, 50);
        return function() {
          clearTimeout(t);
        };
      }, [laid, fitView]);
      useEffect(function() {
        var el = containerRef.current;
        if (!el)
          return;
        var onWheel = function(e) {
          e.preventDefault();
          var rect = el.getBoundingClientRect();
          var mx = e.clientX - rect.left;
          var my = e.clientY - rect.top;
          var delta = -e.deltaY;
          var factor = delta > 0 ? 1.15 : 1 / 1.15;
          setViewport(function(vp) {
            var newScale = Math.max(0.1, Math.min(5, vp.scale * factor));
            var newX = mx - (mx - vp.x) * (newScale / vp.scale);
            var newY = my - (my - vp.y) * (newScale / vp.scale);
            return { x: newX, y: newY, scale: newScale };
          });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return function() {
          el.removeEventListener("wheel", onWheel);
        };
      }, []);
      var onMouseDown = useCallback(function(e) {
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
      }, [viewport.x, viewport.y]);
      useEffect(function() {
        if (!isDragging)
          return;
        var onMove = function(e) {
          if (!dragRef.current)
            return;
          var dx = e.clientX - dragRef.current.startX;
          var dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3)
            dragRef.current.moved = true;
          setViewport(function(vp) {
            return {
              x: dragRef.current.startVpX + dx,
              y: dragRef.current.startVpY + dy,
              scale: vp.scale
            };
          });
        };
        var onUp = function() {
          setIsDragging(false);
          setTimeout(function() {
            if (dragRef.current)
              dragRef.current.moved = false;
          }, 0);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        return function() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
      }, [isDragging]);
      var zoomBy = useCallback(function(factor) {
        var el = containerRef.current;
        if (!el)
          return;
        var rect = el.getBoundingClientRect();
        var cx = rect.width / 2;
        var cy = rect.height / 2;
        setViewport(function(vp) {
          var newScale = Math.max(0.1, Math.min(5, vp.scale * factor));
          var newX = cx - (cx - vp.x) * (newScale / vp.scale);
          var newY = cy - (cy - vp.y) * (newScale / vp.scale);
          return { x: newX, y: newY, scale: newScale };
        });
      }, []);
      if (!laid || !tree)
        return null;
      var byKey = /* @__PURE__ */ new Map();
      laid.forEach(function(n) {
        byKey.set(n.key, n);
      });
      var rootDomainId = (tree.rootKey.split("/")[0] || "").toLowerCase();
      var handleNodeClick = function(n) {
        if (dragRef.current && dragRef.current.moved)
          return;
        if (n.missing)
          return;
        if (onSelect)
          onSelect(n);
      };
      function truncate(s, max) {
        if (!s)
          return "";
        return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
      }
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "div",
          { className: "entity-graph-controls" },
          React.createElement("button", { className: "entity-ctrl-btn", onClick: function() {
            zoomBy(1.3);
          }, title: "\u041F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u044C" }, "+"),
          React.createElement("button", { className: "entity-ctrl-btn", onClick: function() {
            zoomBy(1 / 1.3);
          }, title: "\u041E\u0442\u0434\u0430\u043B\u0438\u0442\u044C" }, "\u2212"),
          React.createElement("button", { className: "entity-ctrl-btn", onClick: fitView, title: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C" }, "\u26F6"),
          React.createElement("span", { className: "entity-zoom-level" }, Math.round(viewport.scale * 100) + "%")
        ),
        React.createElement(
          "div",
          {
            className: "entity-graph-container" + (isDragging ? " entity-graph-container--dragging" : ""),
            ref: containerRef,
            onMouseDown
          },
          React.createElement(
            "svg",
            {
              ref: svgRef,
              className: "entity-graph-svg",
              style: { width: "100%", height: "100%" }
            },
            React.createElement(
              "defs",
              null,
              React.createElement(
                "marker",
                {
                  id: "entity-arrow",
                  viewBox: "0 0 10 10",
                  refX: 9,
                  refY: 5,
                  markerWidth: 6,
                  markerHeight: 6,
                  orient: "auto-start-reverse"
                },
                React.createElement("path", { d: "M 0 0 L 10 5 L 0 10 z", className: "entity-arrow-marker" })
              )
            ),
            React.createElement(
              "g",
              {
                transform: "translate(" + viewport.x + "," + viewport.y + ") scale(" + viewport.scale + ")"
              },
              React.createElement(
                "g",
                { className: "entity-graph-edges" },
                tree.edges.map(function(e, i) {
                  var src = byKey.get(e.source);
                  var tgt = byKey.get(e.target);
                  if (!src || !tgt)
                    return null;
                  var sx = src.x + src.width / 2;
                  var sy = src.y + src.height;
                  var tx = tgt.x + tgt.width / 2;
                  var ty = tgt.y;
                  var my = (sy + ty) / 2;
                  var path = "M " + sx + "," + sy + " C " + sx + "," + my + " " + tx + "," + my + " " + tx + "," + ty;
                  var isCycle = tree.cycleNodes.has(e.source) && tree.cycleNodes.has(e.target);
                  return React.createElement("path", {
                    key: i,
                    d: path,
                    className: "entity-edge" + (isCycle ? " entity-edge--cycle" : ""),
                    markerEnd: "url(#entity-arrow)"
                  });
                })
              ),
              React.createElement(
                "g",
                { className: "entity-graph-nodes" },
                laid.map(function(n) {
                  var isRoot = n.key === tree.rootKey;
                  var isCycle = tree.cycleNodes.has(n.key);
                  var isForeign = !isRoot && n.domainId.toLowerCase() !== rootDomainId;
                  var nodeCls = "entity-graph-node";
                  if (isRoot)
                    nodeCls += " entity-graph-node--root";
                  if (isCycle)
                    nodeCls += " entity-graph-node--cycle";
                  if (n.missing)
                    nodeCls += " entity-graph-node--missing";
                  var idMax = isRoot ? 24 : 22;
                  var shortId = truncate(n.missing ? "\u26A0\uFE0F " + n.entityId : n.entityId, idMax);
                  var shortName = truncate(n.name || "", 26);
                  var shortDomain = truncate(n.domainId, 24);
                  return React.createElement(
                    "g",
                    {
                      key: n.key,
                      transform: "translate(" + n.x + "," + n.y + ")",
                      className: nodeCls,
                      onClick: function() {
                        handleNodeClick(n);
                      },
                      style: { cursor: n.missing ? "default" : "pointer" }
                    },
                    React.createElement(
                      "title",
                      null,
                      n.entityId + (n.name ? " \u2014 " + n.name : "") + " (" + n.domainId + ")"
                    ),
                    React.createElement("rect", {
                      width: n.width,
                      height: n.height,
                      rx: 8,
                      className: "entity-node-rect" + (isRoot ? " entity-node-rect--root" : "") + (isForeign ? " entity-node-rect--foreign" : "") + (isCycle ? " entity-node-rect--cycle" : "") + (n.missing ? " entity-node-rect--missing" : "")
                    }),
                    React.createElement("text", {
                      x: n.width / 2,
                      y: isRoot ? 24 : 22,
                      textAnchor: "middle",
                      className: "entity-node-id" + (isRoot ? " entity-node-id--root" : ""),
                      pointerEvents: "none"
                    }, shortId),
                    !isRoot && !n.missing && shortName && React.createElement("text", {
                      x: n.width / 2,
                      y: 38,
                      textAnchor: "middle",
                      className: "entity-node-name",
                      pointerEvents: "none"
                    }, shortName),
                    !n.missing && React.createElement("text", {
                      x: n.width / 2,
                      y: n.height - 8,
                      textAnchor: "middle",
                      className: "entity-node-domain" + (isForeign ? " entity-node-domain--foreign" : ""),
                      onClick: function(ev) {
                        ev.stopPropagation();
                        if (onGotoDomain)
                          onGotoDomain(n.domainId);
                      }
                    }, shortDomain),
                    n.missing && React.createElement("text", {
                      x: n.width / 2,
                      y: n.height - 8,
                      textAnchor: "middle",
                      className: "entity-node-domain entity-node-domain--missing"
                    }, "\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E")
                  );
                })
              )
            )
          )
        )
      );
    }
    function EntityHierarchyModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var entities = props.entities || [];
      var initialEntityKey = props.initialEntityKey;
      var onGotoDomain = props.onGotoDomain;
      var [query, setQuery] = useState("");
      var [selectedKey, setSelectedKey] = useState(null);
      var [history, setHistory] = useState([]);
      var index = useMemo(function() {
        return buildEntityIndex(entities);
      }, [entities]);
      useEffect(function() {
        if (!open)
          return;
        var onKey = function(e) {
          if (e.key === "Escape") {
            if (history.length > 0) {
              e.preventDefault();
              handleBack();
            } else {
              e.preventDefault();
              onClose();
            }
          }
        };
        document.addEventListener("keydown", onKey, true);
        return function() {
          document.removeEventListener("keydown", onKey, true);
        };
      }, [open, history, handleBack, onClose]);
      useEffect(function() {
        if (open && initialEntityKey) {
          setSelectedKey(initialEntityKey);
          setHistory([]);
          setQuery("");
        }
      }, [open, initialEntityKey]);
      useEffect(function() {
        if (!open) {
          setQuery("");
          setSelectedKey(null);
          setHistory([]);
        }
      }, [open]);
      var searchResults = useMemo(function() {
        var q = query.trim().toLowerCase();
        if (!q)
          return [];
        var results = [];
        entities.forEach(function(e) {
          var idMatch = e.entityId.toLowerCase().indexOf(q) !== -1;
          var nameMatch = e.name && e.name.toLowerCase().indexOf(q) !== -1;
          if (!idMatch && !nameMatch)
            return;
          var key = entityKey(e.domainId, e.entityId);
          var hasParents = !!e.inherits;
          var hasChildren = (index.children.get(key) || []).length > 0;
          results.push({
            entity: e,
            key,
            hasParents,
            hasChildren,
            isOrphan: !hasParents && !hasChildren,
            rank: idMatch && e.entityId.toLowerCase().indexOf(q) === 0 ? 0 : idMatch ? 1 : 2
          });
        });
        results.sort(function(a, b) {
          return a.rank - b.rank;
        });
        return results.slice(0, 200);
      }, [query, entities, index]);
      var tree = useMemo(function() {
        if (!selectedKey)
          return null;
        return buildEntityTree(selectedKey, index);
      }, [selectedKey, index]);
      var handleSelect = useCallback(function(node) {
        if (!node || node.missing)
          return;
        if (node.key === selectedKey)
          return;
        setHistory(function(prev) {
          return selectedKey ? prev.concat([selectedKey]) : prev;
        });
        setSelectedKey(node.key);
      }, [selectedKey]);
      var handleBack = useCallback(function() {
        setHistory(function(prev) {
          if (prev.length === 0)
            return prev;
          var last = prev[prev.length - 1];
          setSelectedKey(last);
          return prev.slice(0, -1);
        });
      }, []);
      if (!open)
        return null;
      return React.createElement(
        "div",
        { className: "help-overlay help-overlay--fullscreen", onMouseDown: onClose },
        React.createElement(
          "div",
          { className: "help-modal entity-hierarchy-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u{1F9EC} \u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439"),
            React.createElement("button", { className: "help-modal__close", onClick: onClose }, "\u2715")
          ),
          React.createElement(
            "div",
            { className: "entity-hierarchy-body" },
            React.createElement(
              "div",
              { className: "entity-search-panel" },
              React.createElement(
                "div",
                { className: "entity-search-input-wrap" },
                React.createElement("span", { className: "entity-search-icon" }, "\u{1F50D}"),
                React.createElement("input", {
                  className: "entity-search-input",
                  type: "text",
                  placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E id \u0438\u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E...",
                  value: query,
                  onChange: function(e) {
                    setQuery(e.target.value);
                  }
                })
              ),
              React.createElement(
                "div",
                { className: "entity-search-results" },
                query.trim() === "" ? React.createElement(
                  "div",
                  { className: "entity-search-hint" },
                  "\u0412\u0441\u0435\u0433\u043E \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439: " + entities.length,
                  React.createElement("br"),
                  React.createElement("span", { style: { fontSize: 11 } }, "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430")
                ) : searchResults.length === 0 ? React.createElement("div", { className: "entity-search-hint" }, "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E") : searchResults.map(function(r) {
                  return React.createElement(
                    "div",
                    {
                      key: r.key,
                      className: "entity-search-item" + (r.key === selectedKey ? " entity-search-item--active" : "") + (r.isOrphan ? " entity-search-item--orphan" : ""),
                      onClick: function() {
                        setHistory(function(prev) {
                          return selectedKey ? prev.concat([selectedKey]) : prev;
                        });
                        setSelectedKey(r.key);
                      }
                    },
                    React.createElement("div", { className: "entity-search-item__id" }, r.entity.entityId),
                    r.entity.name && r.entity.name !== r.entity.entityId && React.createElement("div", { className: "entity-search-item__name" }, r.entity.name),
                    React.createElement(
                      "div",
                      { className: "entity-search-item__meta" },
                      React.createElement("span", { className: "entity-search-item__domain" }, r.entity.domainId),
                      r.isOrphan ? React.createElement("span", { className: "entity-search-item__badge" }, "\u0431\u0435\u0437 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438") : React.createElement(
                        "span",
                        { className: "entity-search-item__badge entity-search-item__badge--ok" },
                        (r.hasParents ? "\u2191" : "\xB7") + (r.hasChildren ? "\u2193" : "\xB7")
                      )
                    )
                  );
                })
              )
            ),
            React.createElement(
              "div",
              { className: "entity-graph-panel" },
              history.length > 0 && React.createElement("button", {
                className: "entity-graph-back",
                onClick: handleBack,
                title: "\u041D\u0430\u0437\u0430\u0434"
              }, "\u2190 \u041D\u0430\u0437\u0430\u0434"),
              !selectedKey ? React.createElement(
                "div",
                { className: "entity-graph-empty" },
                React.createElement("div", { className: "entity-graph-empty__icon" }, "\u{1F9EC}"),
                React.createElement("div", { className: "entity-graph-empty__title" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u044C \u0441\u043B\u0435\u0432\u0430"),
                React.createElement("div", { className: "entity-graph-empty__hint" }, "\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u0438 \u0431\u0443\u0434\u0443\u0442 \u0441\u0432\u0435\u0440\u0445\u0443, \u043D\u0430\u0441\u043B\u0435\u0434\u043D\u0438\u043A\u0438 \u0441\u043D\u0438\u0437\u0443")
              ) : React.createElement(EntityHierarchyGraph, {
                tree,
                onSelect: handleSelect,
                onGotoDomain
              })
            )
          ),
          tree && React.createElement(
            "div",
            { className: "validation-footer" },
            React.createElement(
              "div",
              { className: "validation-stats" },
              React.createElement(
                "span",
                { className: "validation-stat" },
                "\u{1F9EC} " + tree.nodes.length + " \u0432 \u0433\u0440\u0430\u0444\u0435"
              ),
              React.createElement(
                "span",
                { className: "validation-stat validation-stat--ok" },
                "\u2191 " + tree.parentKeys.size + " \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u0435\u0439"
              ),
              React.createElement(
                "span",
                { className: "validation-stat validation-stat--warn" },
                "\u2193 " + tree.childKeys.size + " \u043D\u0430\u0441\u043B\u0435\u0434\u043D\u0438\u043A\u043E\u0432"
              ),
              tree.cycleNodes.size > 0 && React.createElement(
                "span",
                { className: "validation-stat validation-stat--err" },
                "\u26A0\uFE0F \u0446\u0438\u043A\u043B"
              )
            ),
            React.createElement(
              "div",
              { className: "validation-footer__actions" },
              React.createElement("button", { className: "btn", onClick: onClose }, "\u0417\u0430\u043A\u0440\u044B\u0442\u044C")
            )
          )
        )
      );
    }
    function findCycles(nodes, edges) {
      var adjacency = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        adjacency.set(n.id, []);
      });
      edges.forEach(function(e) {
        if (adjacency.has(e.source))
          adjacency.get(e.source).push(e.target);
      });
      var index = 0;
      var stack = [];
      var onStack = /* @__PURE__ */ new Set();
      var indices = /* @__PURE__ */ new Map();
      var lowlinks = /* @__PURE__ */ new Map();
      var sccs = [];
      function strongconnect(v) {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
        var neighbors = adjacency.get(v) || [];
        for (var i2 = 0; i2 < neighbors.length; i2++) {
          var to = neighbors[i2];
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
          var scc = [];
          var w;
          do {
            w = stack.pop();
            onStack.delete(w);
            scc.push(w);
          } while (w !== v);
          if (scc.length > 1)
            sccs.push(scc);
        }
      }
      for (var i = 0; i < nodes.length; i++) {
        if (!indices.has(nodes[i].id))
          strongconnect(nodes[i].id);
      }
      var nodeToScc = /* @__PURE__ */ new Map();
      sccs.forEach(function(scc, i2) {
        scc.forEach(function(n) {
          nodeToScc.set(n, i2);
        });
      });
      var cycleNodes = /* @__PURE__ */ new Set();
      sccs.forEach(function(scc) {
        scc.forEach(function(n) {
          cycleNodes.add(n);
        });
      });
      var cycleEdges = /* @__PURE__ */ new Set();
      edges.forEach(function(e) {
        var s = nodeToScc.get(e.source);
        var t = nodeToScc.get(e.target);
        if (s !== void 0 && s === t)
          cycleEdges.add(e.id);
      });
      return { sccs, cycleNodes, cycleEdges };
    }
    function findPath(startId, endId, edges) {
      if (!startId || !endId || startId === endId)
        return null;
      var adjacency = /* @__PURE__ */ new Map();
      edges.forEach(function(e) {
        if (!adjacency.has(e.source))
          adjacency.set(e.source, []);
        adjacency.get(e.source).push({ node: e.target, edge: e.id });
      });
      var visited = /* @__PURE__ */ new Set([startId]);
      var queue = [{ id: startId, path: [startId], edges: [] }];
      while (queue.length > 0) {
        var cur = queue.shift();
        if (cur.id === endId)
          return { nodes: cur.path, edges: cur.edges };
        var neighbors = adjacency.get(cur.id) || [];
        for (var i = 0; i < neighbors.length; i++) {
          var n = neighbors[i];
          if (visited.has(n.node))
            continue;
          visited.add(n.node);
          queue.push({ id: n.node, path: cur.path.concat([n.node]), edges: cur.edges.concat([n.edge]) });
        }
      }
      return null;
    }
    function findReachable(startId, depth, edges) {
      var inAdj = /* @__PURE__ */ new Map();
      var outAdj = /* @__PURE__ */ new Map();
      edges.forEach(function(e) {
        if (!outAdj.has(e.source))
          outAdj.set(e.source, []);
        outAdj.get(e.source).push(e.target);
        if (!inAdj.has(e.target))
          inAdj.set(e.target, []);
        inAdj.get(e.target).push(e.source);
      });
      var visited = /* @__PURE__ */ new Set([startId]);
      var queue = [{ id: startId, d: 0 }];
      while (queue.length > 0) {
        var cur = queue.shift();
        if (cur.d >= depth)
          continue;
        var neighbors = (outAdj.get(cur.id) || []).concat(inAdj.get(cur.id) || []);
        for (var i = 0; i < neighbors.length; i++) {
          var n = neighbors[i];
          if (visited.has(n))
            continue;
          visited.add(n);
          queue.push({ id: n, d: cur.d + 1 });
        }
      }
      return visited;
    }
    function generateMarkdownReport(ctx) {
      var nodes = ctx.nodes;
      var edges = ctx.edges;
      var cyclesInfo = ctx.cyclesInfo;
      var healthMap = ctx.healthMap;
      var namespaceFilter = ctx.namespaceFilter || "";
      var filters = ctx.filters || {};
      var now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
      var domainNodes = nodes.filter(function(n) {
        return n.data.nodeType === "domain";
      });
      var missingNodes = nodes.filter(function(n) {
        return n.data.nodeType === "missing";
      });
      var brokenNodes = nodes.filter(function(n) {
        return n.data.nodeType === "broken";
      });
      var isolated = domainNodes.filter(function(n) {
        return !edges.some(function(e) {
          return e.source === n.id || e.target === n.id;
        });
      });
      var allRefs = [];
      domainNodes.forEach(function(n) {
        (n.data.fqidRefs || []).forEach(function(r) {
          var exists = nodes.some(function(x) {
            return (x.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase();
          });
          if (!exists)
            allRefs.push({ from: n.data.domainId, ref: r });
        });
      });
      var topConnected = domainNodes.map(function(n) {
        var d = 0;
        edges.forEach(function(e) {
          if (e.source === n.id)
            d++;
          if (e.target === n.id)
            d++;
        });
        return { node: n, degree: d };
      }).sort(function(a, b) {
        return b.degree - a.degree;
      }).slice(0, 10);
      var worstHealth = domainNodes.map(function(n) {
        return { node: n, health: healthMap.get(n.id) || 0 };
      }).sort(function(a, b) {
        return a.health - b.health;
      }).slice(0, 10);
      var nsMap = /* @__PURE__ */ new Map();
      domainNodes.forEach(function(n) {
        var ns = n.data.domainId.split(".").slice(0, 2).join(".");
        nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
      });
      var nsList = Array.from(nsMap.entries()).sort(function(a, b) {
        return b[1] - a[1];
      });
      var lines = [];
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
        cyclesInfo.sccs.forEach(function(scc, i) {
          var names = scc.map(function(id) {
            var n = nodes.find(function(x) {
              return x.id === id;
            });
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
      topConnected.forEach(function(item, i) {
        lines.push("| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.degree + " |");
      });
      lines.push("");
      lines.push("## \u041D\u0438\u0437\u043A\u0438\u0439 health score");
      lines.push("");
      lines.push("| # | \u0414\u043E\u043C\u0435\u043D | Health |");
      lines.push("| ---: | --- | ---: |");
      worstHealth.forEach(function(item, i) {
        lines.push("| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.health + "/100 |");
      });
      lines.push("");
      if (isolated.length > 0) {
        lines.push("## \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B");
        lines.push("");
        isolated.forEach(function(n) {
          lines.push("- `" + n.data.domainId + "`");
        });
        lines.push("");
      }
      if (allRefs.length > 0) {
        lines.push("## \u0411\u0438\u0442\u044B\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438");
        lines.push("");
        var byFrom = /* @__PURE__ */ new Map();
        allRefs.forEach(function(item) {
          if (!byFrom.has(item.from))
            byFrom.set(item.from, []);
          byFrom.get(item.from).push(item.ref);
        });
        byFrom.forEach(function(refs, from) {
          lines.push("### " + from);
          lines.push("");
          refs.forEach(function(r) {
            lines.push("- `" + r.fullFQID + "` \u2014 " + r.propertyPath);
          });
          lines.push("");
        });
      }
      lines.push("## \u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u043D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u0430\u043C");
      lines.push("");
      lines.push("| \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441 | \u0414\u043E\u043C\u0435\u043D\u043E\u0432 |");
      lines.push("| --- | ---: |");
      nsList.forEach(function(entry) {
        lines.push("| `" + entry[0] + "` | " + entry[1] + " |");
      });
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("_\u041E\u0442\u0447\u0451\u0442 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D Domain Graph Analyzer._");
      return lines.join("\n");
    }
    var HEATMAPS = {
      health: { label: "Health", low: "#dc2626", mid: "#f59e0b", high: "#10b981" },
      degree: { label: "\u0421\u0432\u044F\u0437\u0435\u0439", low: "#334155", mid: "#3b82f6", high: "#10b981" },
      entities: { label: "Entities", low: "#334155", mid: "#8b5cf6", high: "#ec4899" },
      fqid: { label: "FQID-\u0441\u0441\u044B\u043B\u043E\u043A", low: "#334155", mid: "#0891b2", high: "#22d3ee" }
    };
    function computeHealth(node, edges, allNodes, cycleNodes, missingSet) {
      if (node.data.nodeType === "broken" || node.data.nodeType === "missing") {
        return { score: 0, breakdown: [{ reason: "\u0423\u0437\u0435\u043B \u0431\u0438\u0442\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442", delta: -100 }] };
      }
      var breakdown = [];
      var score = 100;
      var connected = false;
      var inEdges = 0, outEdges = 0;
      edges.forEach(function(e) {
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
      var refs = node.data.fqidRefs || [];
      var missingRefs = 0;
      refs.forEach(function(r) {
        var exists = allNodes.some(function(n) {
          return (n.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase();
        });
        if (!exists)
          missingRefs++;
      });
      if (missingRefs > 0) {
        var delta = -Math.min(missingRefs * 3, 20);
        score -= Math.abs(delta);
        breakdown.push({ reason: "\u0411\u0438\u0442\u044B\u0445 FQID-\u0441\u0441\u044B\u043B\u043E\u043A: " + missingRefs, delta });
      }
      return { score: Math.max(0, Math.round(score)), breakdown };
    }
    function aggregateByNamespace(nodes, edges) {
      var getNs = function(domainId) {
        var parts = (domainId || "").split(".");
        return parts.slice(0, 2).join(".") || domainId;
      };
      var nodeToNs = /* @__PURE__ */ new Map();
      var nsCount = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        var ns = getNs(n.data.domainId);
        nodeToNs.set(n.id, ns);
        nsCount.set(ns, (nsCount.get(ns) || 0) + 1);
      });
      var newNodes = Array.from(nsCount.entries()).map(function(entry) {
        var ns = entry[0], count = entry[1];
        return {
          id: "ns_" + ns,
          type: "domainNode",
          data: { domainId: ns, label: ns, nodeType: "domain", isNamespace: true, childCount: count },
          position: { x: 0, y: 0 }
        };
      });
      var edgeAgg = /* @__PURE__ */ new Map();
      edges.forEach(function(e) {
        var fromNs = nodeToNs.get(e.source);
        var toNs = nodeToNs.get(e.target);
        if (!fromNs || !toNs || fromNs === toNs)
          return;
        var key = fromNs + "__" + toNs;
        if (!edgeAgg.has(key)) {
          edgeAgg.set(key, { id: "ns_edge_" + fromNs + "__" + toNs, source: "ns_" + fromNs, target: "ns_" + toNs, count: 0, kinds: /* @__PURE__ */ new Set() });
        }
        var a = edgeAgg.get(key);
        a.count++;
        if (e.data && e.data.kind)
          a.kinds.add(e.data.kind);
      });
      var newEdges = Array.from(edgeAgg.values()).map(function(a) {
        return {
          id: a.id,
          source: a.source,
          target: a.target,
          type: "smoothstep",
          label: String(a.count),
          data: { isAggregated: true, count: a.count, kinds: Array.from(a.kinds), kind: "aggregated" },
          markerEnd: { type: MarkerType.ArrowClosed, color: LINKAGE_COLOR, width: 14, height: 14 },
          style: { stroke: LINKAGE_COLOR, strokeWidth: Math.min(1 + a.count / 6, 4), opacity: 0.85 }
        };
      });
      return { nodes: dagreLayout(newNodes, newEdges, "LR"), edges: newEdges };
    }
    function mergeBidirectional(edges) {
      var result = [];
      var seen = /* @__PURE__ */ new Set();
      var processed = /* @__PURE__ */ new Set();
      var pairMap = /* @__PURE__ */ new Map();
      edges.forEach(function(e) {
        if (!e || !e.source || !e.target)
          return;
        var key = [e.source, e.target].sort().join("__");
        if (!pairMap.has(key))
          pairMap.set(key, []);
        pairMap.get(key).push(e);
      });
      edges.forEach(function(e) {
        if (processed.has(e.id))
          return;
        var key = [e.source, e.target].sort().join("__");
        var group = pairMap.get(key) || [];
        var forward = null, backward = null;
        for (var i = 0; i < group.length; i++) {
          var g = group[i];
          if (processed.has(g.id))
            continue;
          if (g.source === e.source && g.target === e.target && !forward)
            forward = g;
          else if (g.source === e.target && g.target === e.source && !backward)
            backward = g;
        }
        if (forward && backward) {
          var stableId = "bi__" + [forward.id, backward.id].sort().join("__");
          if (!seen.has(stableId)) {
            seen.add(stableId);
            result.push(Object.assign({}, forward, {
              id: stableId,
              source: forward.source,
              target: forward.target,
              markerStart: {
                type: MarkerType.ArrowClosed,
                color: forward.markerEnd ? forward.markerEnd.color : LINKAGE_COLOR,
                width: 12,
                height: 12
              },
              data: Object.assign({}, forward.data, {
                isBidirectional: true,
                reverseEdgeId: backward.id,
                refCount: (forward.data && forward.data.refCount || 0) + (backward.data && backward.data.refCount || 0)
              })
            }));
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
    function buildTooltipHtml(domainId, label, nodeType, filePath, version, entitiesCount, fqidRefs, health, description, tags, validation, updatedAt, updatedAtSource) {
      var typeLabel = nodeType === "domain" ? "\u041A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0434\u043E\u043C\u0435\u043D" : nodeType === "missing" ? "\u041D\u0435\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 \u0434\u043E\u043C\u0435\u043D" : "\u0411\u0438\u0442\u044B\u0439 YAML";
      var typeColor = nodeType === "domain" ? "#10b981" : nodeType === "missing" ? "#f59e0b" : "#ef4444";
      var html = '<div class="tooltip__header" style="color:' + typeColor + '">' + escapeHtml(typeLabel) + "</div>";
      html += '<div class="tooltip__body">';
      html += '<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">' + escapeHtml(domainId) + "</span></div>";
      if (label && label !== domainId)
        html += '<div class="tooltip__row"><span class="tooltip__label">\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:</span><span class="tooltip__value">' + escapeHtml(label) + "</span></div>";
      if (version)
        html += '<div class="tooltip__row"><span class="tooltip__label">\u0412\u0435\u0440\u0441\u0438\u044F:</span><span class="tooltip__value">' + escapeHtml(version) + "</span></div>";
      if (entitiesCount != null)
        html += '<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">' + entitiesCount + "</span></div>";
      if (updatedAt) {
        var srcIcon = updatedAtSource === "graphql" ? "cloud_done" : updatedAtSource === "fs" ? "hard_drive" : "help";
        var srcColor = updatedAtSource === "graphql" ? "var(--accent-hover)" : updatedAtSource === "fs" ? "var(--warning)" : "var(--text-500)";
        var srcLabel = updatedAtSource === "graphql" ? "\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435" : updatedAtSource === "fs" ? "\u0438\u0437\u043C\u0435\u043D\u0451\u043D \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E" : "";
        html += '<div class="tooltip__row"><span class="tooltip__label">\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D:</span><span class="tooltip__value">' + escapeHtml(formatDate(updatedAt)) + (srcIcon ? ' <span class="material-symbols-outlined mi-sm" style="color:' + srcColor + '" title="' + escapeHtml(srcLabel) + '">' + srcIcon + "</span>" : "") + "</span></div>";
      }
      if (health != null)
        html += '<div class="tooltip__row"><span class="tooltip__label">Health:</span><span class="tooltip__value">' + health + "/100</span></div>";
      if (description)
        html += '<div class="tooltip__row"><span class="tooltip__label">\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:</span><span class="tooltip__value">' + escapeHtml(description) + "</span></div>";
      if (tags && tags.length > 0)
        html += '<div class="tooltip__row"><span class="tooltip__label">\u0422\u0435\u0433\u0438:</span><span class="tooltip__value">' + tags.map(escapeHtml).join(", ") + "</span></div>";
      if (filePath) {
        html += '<div class="tooltip__row"><span class="tooltip__label">\u0424\u0430\u0439\u043B:</span><span class="tooltip__value" style="font-size:11px">' + escapeHtml(filePath) + "</span></div>";
        html += '<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="' + escapeHtml(filePath) + '">\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B</button></div>';
      }
      if (validation) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
        if (validation.status === "invalid") {
          var diagCount = validation.diagnostics ? validation.diagnostics.length : 0;
          html += '<button class="tooltip__validation-toggle js-toggle-validation" type="button"><span class="tooltip__validation-arrow">\u25B8</span><span class="tooltip__validation-title" style="color:var(--danger)">\u274C \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D</span><span class="tooltip__validation-count">' + diagCount + "</span></button>";
          if (diagCount > 0) {
            html += '<div class="tooltip__validation-list" style="display:none">';
            validation.diagnostics.forEach(function(d, i) {
              var sev = (d.severity || "").toString().toUpperCase();
              var sevClass = sev === "ERROR" ? "error" : sev === "WARNING" ? "warning" : "info";
              html += '<div class="tooltip__validation-item">';
              html += '<div class="tooltip__validation-severity tooltip__validation-severity--' + sevClass + '">' + escapeHtml(sev) + "</div>";
              html += '<div class="tooltip__validation-message">' + escapeHtml(d.message || "") + "</div>";
              if (d.labels && d.labels.length > 0) {
                d.labels.forEach(function(lb) {
                  html += '<div class="tooltip__validation-label">' + escapeHtml(lb.message || "") + (lb.span ? '<span class="tooltip__validation-span"> [' + lb.span.start + "\u2013" + lb.span.end + "]</span>" : "") + "</div>";
                });
              }
              html += "</div>";
            });
            html += "</div>";
          }
        } else if (validation.status === "error") {
          html += '<div class="tooltip__label" style="margin-bottom:6px;color:var(--warning)">\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0430 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438</div>';
          html += '<div class="tooltip__validation-message">' + escapeHtml(validation.error || "") + "</div>";
        }
        html += "</div>";
      }
      if (fqidRefs && fqidRefs.length > 0) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
        html += '<div class="tooltip__label" style="margin-bottom:8px">FQID \u0441\u0441\u044B\u043B\u043A\u0438 (' + fqidRefs.length + "):</div>";
        html += '<div class="tooltip__fqid-list">';
        fqidRefs.forEach(function(ref) {
          html += '<div class="tooltip__ref">';
          html += '<div class="tooltip__fqid js-goto-domain" data-domain="' + escapeHtml(ref.targetDomainId || "") + '" style="cursor:pointer">' + escapeHtml(ref.fullFQID) + "</div>";
          html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + "</div>";
          html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || "") + '" data-fqid="' + escapeHtml(ref.fullFQID || "") + '">\u{1F4C2} \u041E\u0442\u043A\u0440\u044B\u0442\u044C</button>';
          html += "</div>";
        });
        html += "</div>";
        html += "</div>";
      }
      html += "</div>";
      return html;
    }
    function buildEdgeTooltipHtml(edge, refs) {
      var fullLabel = edge.data && edge.data.fullLabel || edge.label || edge.id;
      var link = edge.data && edge.data.linkData || {};
      var nameFrom = link.nameFrom || {};
      var side1Text = nameFrom.side1 || link.sourceEntity || null;
      var side2Text = nameFrom.side2 || link.targetEntity || null;
      var side1Domain = edge.data && edge.data.side1Domain;
      var side2Domain = edge.data && edge.data.side2Domain;
      function renderSide(labelText, text, domain) {
        if (!text)
          return "";
        var clickable = !!domain;
        var h = '<div class="tooltip__row"><span class="tooltip__label">' + labelText + "</span>";
        if (clickable) {
          h += '<span class="tooltip__value js-goto-domain" data-domain="' + escapeHtml(domain) + '" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">' + escapeHtml(text) + ' <span style="font-size:10px;color:var(--text-500)">\u2192 ' + escapeHtml(domain) + "</span></span>";
        } else {
          h += '<span class="tooltip__value" style="color:var(--text-400)">' + escapeHtml(text) + "</span>";
        }
        return h + "</div>";
      }
      var html = '<div class="tooltip__header">\u0421\u0432\u044F\u0437\u044C: ' + escapeHtml(fullLabel) + "</div>";
      html += '<div class="tooltip__body">';
      if (edge.data && edge.data.isBidirectional) {
        html += '<div style="font-size:11px;color:var(--accent-hover);margin-bottom:8px">\u21C4 \u0434\u0432\u0443\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C</div>';
      }
      html += renderSide("\u0421\u0442\u043E\u0440\u043E\u043D\u0430 1:", side1Text, side1Domain);
      html += renderSide("\u0421\u0442\u043E\u0440\u043E\u043D\u0430 2:", side2Text, side2Domain);
      if (side1Text || side2Text) {
        html += '<div style="height:1px;background:var(--border);margin:10px 0"></div>';
      }
      if (link.type) {
        html += '<div class="tooltip__row"><span class="tooltip__label">\u0422\u0438\u043F:</span><span class="tooltip__value">' + escapeHtml(link.type) + "</span></div>";
      }
      if (refs && refs.length > 0) {
        html += '<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID \u0441\u0441\u044B\u043B\u043A\u0438 (' + refs.length + "):</div>";
        html += '<div class="tooltip__fqid-list">';
        refs.forEach(function(ref) {
          var srcDom = ref.sourceDomainId || "\u2014";
          var tgtDom = ref.targetDomainId || "\u2014";
          html += '<div class="tooltip__ref">';
          html += '<div class="tooltip__fqid">' + escapeHtml(ref.fullFQID) + "</div>";
          html += '<div class="tooltip__ref-context">';
          html += '<button class="tooltip__ref-node js-goto-domain" data-domain="' + escapeHtml(srcDom) + '" title="\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0443"><span class="material-symbols-outlined mi-sm">arrow_outward</span><span class="tooltip__ref-node-label">' + escapeHtml(srcDom) + "</span></button>";
          html += '<span class="tooltip__ref-arrow"><span class="material-symbols-outlined mi-sm">arrow_forward</span></span>';
          html += '<button class="tooltip__ref-node js-goto-domain" data-domain="' + escapeHtml(tgtDom) + '" title="\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0446\u0435\u043B\u0438"><span class="material-symbols-outlined mi-sm">call_received</span><span class="tooltip__ref-node-label">' + escapeHtml(tgtDom) + "</span></button>";
          html += "</div>";
          if (ref.propertyPath) {
            html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + "</div>";
          }
          html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || "") + '" data-fqid="' + escapeHtml(ref.fullFQID || "") + '"><span class="material-symbols-outlined mi-sm">folder_open</span> \u041E\u0442\u043A\u0440\u044B\u0442\u044C</button>';
          html += "</div>";
        });
        html += "</div>";
      }
      html += "</div>";
      return html;
    }
    function DomainNode(props) {
      var data = props.data;
      var selected = props.selected;
      if (data.__compact) {
        var compactCls = "rf-compact rf-compact--" + data.nodeType + (selected ? " rf-compact--selected" : "");
        var initial = (data.domainId || "?").charAt(0).toUpperCase();
        var compactStyle = {};
        if (data.__heatColor) {
          compactStyle.background = data.__heatColor;
          compactStyle.borderColor = data.__heatColor;
          compactStyle.color = "#ffffff";
        }
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(Handle, { type: "target", position: Position.Left, className: "rf-handle" }),
          React.createElement("div", { className: compactCls, style: compactStyle, title: data.domainId }, initial),
          React.createElement(Handle, { type: "source", position: Position.Right, className: "rf-handle" })
        );
      }
      var cls = "rf-node rf-node--" + data.nodeType;
      if (selected)
        cls += " rf-node--selected";
      if (data.dimmed)
        cls += " rf-node--dimmed";
      if (data.__inPath)
        cls += " rf-node--path";
      if (data.__isPathEndpoint)
        cls += " rf-node--path-endpoint";
      if (data.__failed)
        cls += " rf-node--failed";
      if (data.__pendingFail)
        cls += " rf-node--pending-fail";
      if (data.__failureRoot)
        cls += " rf-node--failure-root";
      if (data.__selectedHighlight)
        cls += " rf-node--selected-soft";
      var icon = data.nodeType === "domain" ? "\u25CF" : data.nodeType === "missing" ? "\u25B2" : "\u2715";
      var nodeStyle = {};
      if (data.__heatColor) {
        nodeStyle.background = data.__heatColor;
        nodeStyle.borderColor = data.__heatColor;
        nodeStyle.color = "#ffffff";
      }
      var onHealthEnter = function(e) {
        if (!data.__tooltipsEnabled)
          return;
        e.stopPropagation();
        var items = (data.healthBreakdown || []).map(function(b) {
          return '<div style="margin:3px 0;display:flex;justify-content:space-between;gap:12px;"><span>' + escapeHtml(b.reason) + '</span><span style="color:' + (b.delta < 0 ? "#ef4444" : "#10b981") + ';font-weight:700;">' + (b.delta > 0 ? "+" + b.delta : b.delta) + "</span></div>";
        }).join("");
        var html = '<div style="padding:8px 10px;"><div style="font-weight:700;margin-bottom:6px;">Health score: ' + data.health + "/100</div>" + (items || '<div style="color:#64748b;">\u0412\u0441\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0432 \u043D\u043E\u0440\u043C\u0435</div>') + "</div>";
        window.__healthTooltip = { html, x: e.clientX, y: e.clientY };
        document.dispatchEvent(new CustomEvent("show-health-tooltip"));
      };
      var onHealthLeave = function() {
        document.dispatchEvent(new CustomEvent("hide-health-tooltip"));
      };
      var healthBadge = null;
      if (data.health != null && data.nodeType === "domain" && !data.__heatColor) {
        var healthScore = data.health && typeof data.health === "object" ? data.health.score : data.health;
        if (healthScore != null) {
          var hc = healthScore >= 80 ? "good" : healthScore >= 50 ? "mid" : "bad";
          healthBadge = React.createElement("span", {
            className: "rf-node__health rf-node__health--" + hc,
            title: "Health score: " + healthScore + "/100",
            onMouseEnter: onHealthEnter,
            onMouseLeave: onHealthLeave,
            style: { cursor: "help" }
          }, healthScore);
        }
      }
      var validationBadge = null;
      if (data.__validationStatus === "invalid" && data.__validationCount > 0) {
        validationBadge = React.createElement("span", {
          className: "rf-node__issues",
          title: "\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F: " + data.__validationCount + " \u043F\u0440\u043E\u0431\u043B\u0435\u043C"
        }, "\u26A0" + data.__validationCount);
      }
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(Handle, { type: "target", position: Position.Left, className: "rf-handle" }),
        React.createElement(
          "div",
          { className: cls, style: nodeStyle },
          React.createElement("div", { className: "rf-node__icon" }, icon),
          React.createElement(
            "div",
            { className: "rf-node__content" },
            React.createElement(
              "div",
              { className: "rf-node__id-row" },
              React.createElement("span", {
                className: "rf-node__id" + (data.__invalid ? " rf-node__id--invalid" : ""),
                title: data.domainId + (data.__invalid ? " \u2014 \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u0435\u043D" : "")
              }, data.domainId),
              healthBadge,
              validationBadge,
              data.__topoLevel != null && React.createElement("span", {
                className: "topo-badge",
                title: "\u0423\u0440\u043E\u0432\u0435\u043D\u044C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438: " + data.__topoLevel
              }, "L" + data.__topoLevel)
            ),
            data.label && data.label !== data.domainId && React.createElement("div", {
              className: "rf-node__name",
              title: data.label
            }, data.label)
          )
        ),
        React.createElement(Handle, { type: "source", position: Position.Right, className: "rf-handle" })
      );
    }
    var nodeTypes = { domainNode: DomainNode };
    function Popover(props) {
      var trigger = props.trigger;
      var children = props.children;
      var align = props.align || "left";
      var width = props.width || 320;
      var state = useState(false);
      var open = state[0], setOpen = state[1];
      var wrapRef = useRef(null);
      useEffect(function() {
        if (!open)
          return;
        var onDoc = function(e) {
          if (wrapRef.current && !wrapRef.current.contains(e.target))
            setOpen(false);
        };
        var onEsc = function(e) {
          if (e.key === "Escape")
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);
        return function() {
          document.removeEventListener("mousedown", onDoc);
          document.removeEventListener("keydown", onEsc, true);
        };
      }, [open]);
      useEffect(function() {
        var handler = function() {
          setOpen(false);
        };
        document.addEventListener("close-all-popovers", handler);
        return function() {
          document.removeEventListener("close-all-popovers", handler);
        };
      }, []);
      return React.createElement(
        "div",
        { className: "popover-wrap", ref: wrapRef },
        React.createElement("div", { className: "popover-trigger", onClick: function() {
          setOpen(!open);
        } }, trigger(open)),
        open && React.createElement(
          "div",
          { className: "popover popover--" + align, style: { width } },
          typeof children === "function" ? children(function() {
            setOpen(false);
          }) : children
        )
      );
    }
    function ContextMenu(props) {
      var menu = props.menu;
      var onClose = props.onClose;
      var onAction = props.onAction;
      var ref = useRef(null);
      useEffect(function() {
        if (!menu)
          return;
        var onDoc = function(e) {
          if (ref.current && !ref.current.contains(e.target))
            onClose();
        };
        var onEsc = function(e) {
          if (e.key === "Escape")
            onClose();
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);
        return function() {
          document.removeEventListener("mousedown", onDoc);
          document.removeEventListener("keydown", onEsc, true);
        };
      }, [menu]);
      if (!menu)
        return null;
      var items = [
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
      return React.createElement(
        "div",
        { className: "ctx-menu", ref, style: { left: menu.x, top: menu.y } },
        items.map(function(it, i) {
          if (it.type === "divider")
            return React.createElement("div", { key: i, className: "ctx-menu__divider" });
          return React.createElement(
            "button",
            {
              key: i,
              className: "ctx-menu__item" + (it.danger ? " ctx-menu__item--danger" : ""),
              onClick: function() {
                onAction(it.action, menu.nodeId);
                onClose();
              }
            },
            React.createElement("span", { className: "ctx-menu__icon" }, it.icon),
            React.createElement("span", null, it.label)
          );
        })
      );
    }
    function GroupsOverlay(props) {
      var boxes = props.boxes || [];
      var svgRef = useRef(null);
      var viewport = useViewport();
      var vpRef = useRef(viewport);
      vpRef.current = viewport;
      useEffect(function() {
        var svg = svgRef.current;
        if (!svg)
          return;
        svg.style.transform = "translate(" + viewport.x + "px," + viewport.y + "px) scale(" + viewport.zoom + ")";
      }, [viewport.x, viewport.y, viewport.zoom]);
      if (!boxes || boxes.length === 0)
        return null;
      return React.createElement(
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
          }
        },
        boxes.map(function(b) {
          return React.createElement(
            "g",
            {
              key: b.id,
              transform: "translate(" + b.x + "," + b.y + ")"
            },
            React.createElement("rect", {
              width: b.w,
              height: b.h,
              rx: 12,
              fill: "rgba(99,102,241,0.05)",
              stroke: "rgba(99,102,241,0.4)",
              strokeDasharray: "6 4",
              strokeWidth: 1.5
            }),
            React.createElement("text", {
              x: 14,
              y: 22,
              fill: "var(--accent-hover)",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "Inter, sans-serif"
            }, b.label + " \xB7 " + b.count)
          );
        })
      );
    }
    function CollapsibleSection(props) {
      var id = props.id;
      var title = props.title;
      var count = props.count;
      var defaultOpen = props.defaultOpen !== false;
      var collapsed = props.collapsed;
      var onToggle = props.onToggle;
      var isOpen = !collapsed.has(id);
      var children = props.children;
      return React.createElement(
        "div",
        { className: "details__field" },
        React.createElement(
          "button",
          {
            className: "details__field-label details__field-label--btn",
            onClick: function() {
              onToggle(id, !isOpen);
            }
          },
          React.createElement(MIcon, {
            name: isOpen ? "expand_more" : "chevron_right",
            size: "sm"
          }),
          React.createElement("span", { style: { marginLeft: 6 } }, title),
          count != null && React.createElement("span", { className: "details__field-count" }, count)
        ),
        isOpen && children
      );
    }
    function Sidebar(props) {
      var collapsed = props.collapsed;
      var setCollapsed = props.setCollapsed;
      var compact = props.compact;
      var setCompact = props.setCompact;
      var nodes = props.nodes || [];
      var edges = props.edges || [];
      var counts = props.counts || {};
      var isolatedCount = props.isolatedCount || 0;
      var cyclesInfo = props.cyclesInfo || { sccs: [], cycleNodes: /* @__PURE__ */ new Set(), cycleEdges: /* @__PURE__ */ new Set() };
      var healthMap = props.healthMap;
      var validationResults = props.validationResults;
      var topConnected = props.topConnected || [];
      var worstHealth = props.worstHealth || [];
      var namespaces = props.namespaces || [];
      var tagCloud = props.tagCloud || [];
      var bookmarks = props.bookmarks || /* @__PURE__ */ new Set();
      var cacheDiff = props.cacheDiff || null;
      var topMissingRefs = props.topMissingRefs || [];
      var tagFilters = props.tagFilters || /* @__PURE__ */ new Set();
      var activityPeriod = props.activityPeriod || 30;
      var setActivityPeriod = props.setActivityPeriod;
      var collapsedSections = props.collapsedSections || /* @__PURE__ */ new Set();
      var toggleSection = props.toggleSection;
      var onGotoDomain = props.onGotoDomain;
      var onSetNamespace = props.onSetNamespace;
      var onToggleTag = props.onToggleTag;
      var onToggleBookmark = props.onToggleBookmark;
      var setIsolatedOnly = props.setIsolatedOnly;
      var setOnlyInvalid = props.setOnlyInvalid;
      var setBookmarksOnly = props.setBookmarksOnly;
      var setCycleHighlight = props.setCycleHighlight;
      var setSelectedNodeId = props.setSelectedNodeId;
      var onFilterMissing = props.onFilterMissing;
      var onFilterBroken = props.onFilterBroken;
      var onExportStats = props.onExportStats;
      var onFitView = props.onFitView;
      var problemDomains = useMemo(function() {
        if (!validationResults)
          return [];
        var result = [];
        nodes.forEach(function(n) {
          var v = validationResults.get(n.data.domainId);
          if (v && v.status === "invalid") {
            result.push({ node: n, count: (v.diagnostics || []).length });
          }
        });
        return result.sort(function(a, b) {
          return b.count - a.count;
        }).slice(0, 5);
      }, [nodes, validationResults]);
      var brokenRefsDomains = useMemo(function() {
        var result = [];
        var domainIds = /* @__PURE__ */ new Set();
        nodes.forEach(function(n) {
          if (n.data.nodeType === "domain")
            domainIds.add(n.data.domainId.toLowerCase());
        });
        nodes.forEach(function(n) {
          if (n.data.nodeType !== "domain")
            return;
          var refs = n.data.fqidRefs || [];
          var broken = refs.filter(function(r) {
            return !domainIds.has((r.targetDomainId || "").toLowerCase());
          });
          if (broken.length > 0)
            result.push({ node: n, count: broken.length });
        });
        return result.sort(function(a, b) {
          return b.count - a.count;
        }).slice(0, 5);
      }, [nodes]);
      if (collapsed) {
        return React.createElement(
          "aside",
          { className: "sidebar sidebar--collapsed" },
          React.createElement("button", {
            className: "sidebar__expand",
            onClick: function() {
              setCollapsed(false);
            },
            title: "\u0420\u0430\u0437\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C"
          }, React.createElement(MIcon, { name: "chevron_right" }))
        );
      }
      var hasNews = !!cacheDiff;
      var hasProblems = problemDomains.length > 0 || brokenRefsDomains.length > 0 || isolatedCount > 0 || counts.broken > 0 || cyclesInfo.sccs.length > 0;
      var totalProblems = (counts.missing || 0) + (counts.broken || 0) + problemDomains.length + (cyclesInfo.sccs.length > 0 ? cyclesInfo.sccs.length : 0);
      var newsCount = cacheDiff ? cacheDiff.added.length + cacheDiff.changed.length + cacheDiff.removed.length : 0;
      function renderSection(id, title, iconName, content, badge) {
        var isCollapsed = collapsedSections.has(id);
        return React.createElement(
          "div",
          {
            key: id,
            className: "section" + (isCollapsed ? " section--collapsed" : "")
          },
          React.createElement(
            "button",
            {
              className: "section__header",
              onClick: function() {
                toggleSection(id, isCollapsed);
              }
            },
            React.createElement(MIcon, {
              name: isCollapsed ? "chevron_right" : "expand_more",
              size: "sm"
            }),
            React.createElement(
              "span",
              { className: "section__icon" },
              React.createElement(MIcon, { name: iconName, size: "sm" })
            ),
            React.createElement("span", { className: "section__title" }, title),
            badge != null && badge > 0 && React.createElement("span", {
              className: "section__badge"
            }, badge)
          ),
          !isCollapsed && React.createElement("div", { className: "section__body" }, content)
        );
      }
      return React.createElement(
        "aside",
        {
          className: "sidebar" + (compact ? " sidebar--compact" : "")
        },
        // ===== Шапка =====
        React.createElement(
          "div",
          { className: "sidebar__header" },
          React.createElement(
            "div",
            { className: "sidebar__logo" },
            React.createElement(MIcon, { name: "hub" })
          ),
          React.createElement(
            "div",
            { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { className: "sidebar__title" }, "Domain Graph"),
            React.createElement("div", { className: "sidebar__subtitle" }, "Analyzer")
          ),
          React.createElement("button", {
            className: "sidebar__icon-btn",
            onClick: function() {
              setCompact(!compact);
            },
            title: compact ? "\u041F\u043E\u043B\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" : "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C"
          }, React.createElement(MIcon, { name: compact ? "view_sidebar" : "view_compact", size: "sm" })),
          React.createElement("button", {
            className: "sidebar__icon-btn",
            onClick: onExportStats,
            title: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0438 \u0432 Markdown"
          }, React.createElement(MIcon, { name: "download", size: "sm" })),
          React.createElement("button", {
            className: "sidebar__icon-btn",
            onClick: function() {
              setCollapsed(true);
            },
            title: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C"
          }, React.createElement(MIcon, { name: "chevron_left", size: "sm" }))
        ),
        // ===== Тело =====
        React.createElement(
          "div",
          { className: "sidebar__body" },
          // ----- ОБЗОР + БЫСТРЫЕ ДЕЙСТВИЯ -----
          renderSection(
            "overview",
            "\u041E\u0431\u0437\u043E\u0440",
            "insights",
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "stats-grid" },
                React.createElement(
                  "div",
                  {
                    className: "stat-card stat-card--accent stat-card--clickable",
                    onClick: function() {
                      if (onFitView)
                        onFitView();
                    }
                  },
                  React.createElement("div", { className: "stat-card__value" }, nodes.length),
                  React.createElement("div", { className: "stat-card__label" }, "\u0412\u0441\u0435\u0433\u043E \u0443\u0437\u043B\u043E\u0432")
                ),
                React.createElement(
                  "div",
                  {
                    className: "stat-card stat-card--success stat-card--clickable",
                    onClick: function() {
                      if (onFitView)
                        onFitView();
                    }
                  },
                  React.createElement("div", { className: "stat-card__value" }, edges.length),
                  React.createElement("div", { className: "stat-card__label" }, "\u0421\u0432\u044F\u0437\u0435\u0439")
                ),
                React.createElement(
                  "div",
                  {
                    className: "stat-card stat-card--warning stat-card--clickable" + ((counts.missing || 0) === 0 ? " stat-card--empty" : ""),
                    onClick: function() {
                      if ((counts.missing || 0) > 0 && onFilterMissing)
                        onFilterMissing();
                    }
                  },
                  React.createElement("div", { className: "stat-card__value" }, counts.missing || 0),
                  React.createElement("div", { className: "stat-card__label" }, "Missing")
                ),
                React.createElement(
                  "div",
                  {
                    className: "stat-card stat-card--danger stat-card--clickable" + ((counts.broken || 0) === 0 ? " stat-card--empty" : ""),
                    onClick: function() {
                      if ((counts.broken || 0) > 0 && onFilterBroken)
                        onFilterBroken();
                    }
                  },
                  React.createElement("div", { className: "stat-card__value" }, counts.broken || 0),
                  React.createElement("div", { className: "stat-card__label" }, "Broken")
                )
              ),
              React.createElement(
                "div",
                { className: "quick-actions" },
                React.createElement(
                  "button",
                  {
                    className: "quick-action",
                    onClick: function() {
                      setIsolatedOnly(true);
                    },
                    disabled: isolatedCount === 0
                  },
                  React.createElement(MIcon, { name: "radio_button_unchecked", size: "sm" }),
                  React.createElement("span", null, "\u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435"),
                  React.createElement("span", { className: "quick-action__count" }, isolatedCount)
                ),
                validationResults && React.createElement(
                  "button",
                  {
                    className: "quick-action",
                    onClick: function() {
                      setOnlyInvalid(true);
                    },
                    disabled: problemDomains.length === 0
                  },
                  React.createElement(MIcon, { name: "cancel", size: "sm" }),
                  React.createElement("span", null, "\u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435"),
                  React.createElement("span", { className: "quick-action__count" }, problemDomains.length)
                ),
                React.createElement(
                  "button",
                  {
                    className: "quick-action",
                    onClick: function() {
                      if (cyclesInfo.sccs.length > 0) {
                        setCycleHighlight({
                          nodeIds: cyclesInfo.cycleNodes,
                          edgeIds: cyclesInfo.cycleEdges,
                          sccCount: cyclesInfo.sccs.length
                        });
                      }
                    },
                    disabled: cyclesInfo.sccs.length === 0
                  },
                  React.createElement(MIcon, { name: "cycle", size: "sm" }),
                  React.createElement("span", null, "\u0426\u0438\u043A\u043B\u044B"),
                  React.createElement("span", { className: "quick-action__count" }, cyclesInfo.sccs.length)
                ),
                bookmarks.size > 0 && React.createElement(
                  "button",
                  {
                    className: "quick-action",
                    onClick: function() {
                      setBookmarksOnly(true);
                    }
                  },
                  React.createElement(MIcon, { name: "star", size: "sm", fill: true }),
                  React.createElement("span", null, "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435"),
                  React.createElement("span", { className: "quick-action__count" }, bookmarks.size)
                )
              )
            ),
            null
          ),
          // ----- АКТИВНОСТЬ -----
          renderSection(
            "activity",
            "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C",
            "trending_up",
            React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "activity-periods" },
                [7, 30, 90].map(function(d) {
                  return React.createElement("button", {
                    key: d,
                    className: "period-btn" + (activityPeriod === d ? " period-btn--active" : ""),
                    onClick: function() {
                      if (setActivityPeriod)
                        setActivityPeriod(d);
                    }
                  }, d + "\u0434");
                })
              ),
              React.createElement(ActivityChart, { nodes, days: activityPeriod })
            ),
            null
          ),
          // ----- ПРОБЛЕМЫ -----
          hasProblems && renderSection(
            "problems",
            "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u044B",
            "warning",
            React.createElement(
              React.Fragment,
              null,
              problemDomains.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title" },
                  React.createElement(MIcon, { name: "cancel", size: "sm" }),
                  " \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 (" + problemDomains.length + ")"
                ),
                problemDomains.map(function(item) {
                  return React.createElement(
                    "button",
                    {
                      key: item.node.id,
                      className: "rank-item",
                      onClick: function() {
                        onGotoDomain(item.node.data.domainId);
                      }
                    },
                    React.createElement("span", { className: "rank-item__label" }, item.node.data.domainId),
                    React.createElement("span", { className: "rank-item__value", style: { color: "var(--danger)" } }, item.count)
                  );
                })
              ),
              brokenRefsDomains.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title" },
                  React.createElement(MIcon, { name: "link_off", size: "sm" }),
                  " \u0411\u0438\u0442\u044B\u0435 FQID (" + brokenRefsDomains.length + ")"
                ),
                brokenRefsDomains.map(function(item) {
                  return React.createElement(
                    "button",
                    {
                      key: item.node.id,
                      className: "rank-item",
                      onClick: function() {
                        onGotoDomain(item.node.data.domainId);
                      }
                    },
                    React.createElement("span", { className: "rank-item__label" }, item.node.data.domainId),
                    React.createElement("span", { className: "rank-item__value", style: { color: "var(--warning)" } }, item.count)
                  );
                })
              ),
              isolatedCount > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title" },
                  React.createElement(MIcon, { name: "radio_button_unchecked", size: "sm" }),
                  " \u0418\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 (" + isolatedCount + ")"
                ),
                React.createElement("button", {
                  className: "problems-group__action",
                  onClick: function() {
                    setIsolatedOnly(true);
                  }
                }, "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C")
              ),
              cyclesInfo.sccs.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title" },
                  React.createElement(MIcon, { name: "cycle", size: "sm" }),
                  " \u0426\u0438\u043A\u043B\u044B (" + cyclesInfo.sccs.length + ")"
                ),
                React.createElement("button", {
                  className: "problems-group__action",
                  onClick: function() {
                    setCycleHighlight({
                      nodeIds: cyclesInfo.cycleNodes,
                      edgeIds: cyclesInfo.cycleEdges,
                      sccCount: cyclesInfo.sccs.length
                    });
                  }
                }, "\u041F\u043E\u0434\u0441\u0432\u0435\u0442\u0438\u0442\u044C")
              )
            ),
            totalProblems
          ),
          // ----- ЧТО НОВОГО -----
          hasNews && renderSection(
            "news",
            "\u0427\u0442\u043E \u043D\u043E\u0432\u043E\u0433\u043E",
            "new_releases",
            React.createElement(
              React.Fragment,
              null,
              cacheDiff.added.length === 0 && cacheDiff.changed.length === 0 && cacheDiff.removed.length === 0 && React.createElement(
                "div",
                { className: "news-empty" },
                React.createElement(MIcon, { name: "history_toggle_off", size: "sm" }),
                React.createElement(
                  "div",
                  null,
                  React.createElement("div", null, "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442"),
                  cacheDiff.previousFetchedAt && React.createElement("div", {
                    style: { fontSize: 11, color: "var(--text-500)", marginTop: 4 }
                  }, "\u0441 " + new Date(cacheDiff.previousFetchedAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  }))
                )
              ),
              newsCount > 0 && cacheDiff.previousFetchedAt && React.createElement(
                "div",
                { className: "news-since" },
                "\u0441 " + new Date(cacheDiff.previousFetchedAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit"
                })
              ),
              cacheDiff.added.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title", style: { color: "var(--success)" } },
                  React.createElement(MIcon, { name: "add_circle", size: "sm" }),
                  " \u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E (" + cacheDiff.added.length + ")"
                ),
                cacheDiff.added.slice(0, 5).map(function(d) {
                  return React.createElement(
                    "button",
                    {
                      key: d.sourceId,
                      className: "rank-item",
                      onClick: function() {
                        onGotoDomain(d.sourceId);
                      }
                    },
                    React.createElement("span", { className: "rank-item__label" }, d.sourceId),
                    d.version && React.createElement("span", { className: "rank-item__value" }, d.version)
                  );
                }),
                cacheDiff.added.length > 5 && React.createElement("div", {
                  className: "news-more"
                }, "...\u0438 \u0435\u0449\u0451 " + (cacheDiff.added.length - 5))
              ),
              cacheDiff.changed.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title", style: { color: "var(--accent-hover)" } },
                  React.createElement(MIcon, { name: "update", size: "sm" }),
                  " \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E (" + cacheDiff.changed.length + ")"
                ),
                cacheDiff.changed.slice(0, 5).map(function(d) {
                  return React.createElement(
                    "button",
                    {
                      key: d.sourceId,
                      className: "rank-item",
                      onClick: function() {
                        onGotoDomain(d.sourceId);
                      }
                    },
                    React.createElement("span", { className: "rank-item__label" }, d.sourceId),
                    d.version && React.createElement("span", {
                      className: "rank-item__value",
                      style: { fontSize: 10, fontFamily: "monospace" }
                    }, d.oldVersion && d.newVersion ? d.oldVersion + " \u2192 " + d.newVersion : d.version)
                  );
                }),
                cacheDiff.changed.length > 5 && React.createElement("div", {
                  className: "news-more"
                }, "...\u0438 \u0435\u0449\u0451 " + (cacheDiff.changed.length - 5))
              ),
              cacheDiff.removed.length > 0 && React.createElement(
                "div",
                { className: "problems-group" },
                React.createElement(
                  "div",
                  { className: "problems-group__title", style: { color: "var(--danger)" } },
                  React.createElement(MIcon, { name: "remove_circle", size: "sm" }),
                  " \u0423\u0434\u0430\u043B\u0435\u043D\u043E (" + cacheDiff.removed.length + ")"
                ),
                cacheDiff.removed.slice(0, 5).map(function(d) {
                  return React.createElement(
                    "div",
                    {
                      key: d.sourceId,
                      className: "rank-item",
                      style: { cursor: "default" }
                    },
                    React.createElement("span", {
                      className: "rank-item__label",
                      style: { textDecoration: "line-through", opacity: 0.6 }
                    }, d.sourceId)
                  );
                }),
                cacheDiff.removed.length > 5 && React.createElement("div", {
                  className: "news-more"
                }, "...\u0438 \u0435\u0449\u0451 " + (cacheDiff.removed.length - 5))
              )
            ),
            newsCount
          ),
          // ----- ТОП ПО СВЯЗЯМ -----
          topConnected.length > 0 && renderSection(
            "top",
            "\u0422\u043E\u043F \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C",
            "bar_chart",
            React.createElement(
              "div",
              { className: "rank-list" },
              topConnected.map(function(item, i) {
                return React.createElement(
                  "button",
                  {
                    key: item.node.id,
                    className: "rank-item",
                    onClick: function() {
                      onGotoDomain(item.node.data.domainId);
                    }
                  },
                  React.createElement("span", { className: "rank-item__num" }, i + 1),
                  React.createElement("span", { className: "rank-item__label" }, item.node.data.domainId),
                  React.createElement("span", { className: "rank-item__value" }, item.degree)
                );
              })
            ),
            null
          ),
          // ----- СТЕНА ПОЗОРА -----
          worstHealth.length > 0 && renderSection(
            "worst",
            "\u0421\u0442\u0435\u043D\u0430 \u043F\u043E\u0437\u043E\u0440\u0430",
            "trending_down",
            React.createElement(
              "div",
              { className: "rank-list" },
              worstHealth.slice(0, compact ? 5 : 20).map(function(item, i) {
                var score = item.health && typeof item.health === "object" ? item.health.score : item.health;
                var hc = score >= 80 ? "good" : score >= 50 ? "mid" : "bad";
                return React.createElement(
                  "button",
                  {
                    key: item.node.id,
                    className: "rank-item",
                    onClick: function() {
                      onGotoDomain(item.node.data.domainId);
                    }
                  },
                  React.createElement("span", { className: "rank-item__num" }, i + 1),
                  React.createElement("span", { className: "rank-item__label" }, item.node.data.domainId),
                  React.createElement("span", {
                    className: "rf-node__health rf-node__health--" + hc,
                    style: { fontSize: 10, padding: "1px 6px" }
                  }, score)
                );
              })
            ),
            null
          ),
          // ----- БИТЫЕ FQID (расширенный список) -----
          topMissingRefs.length > 0 && renderSection(
            "missing-refs",
            "\u0411\u0438\u0442\u044B\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438",
            "link_off",
            React.createElement(
              "div",
              { className: "rank-list" },
              topMissingRefs.map(function(item, i) {
                return React.createElement(
                  "div",
                  {
                    key: item.node.id,
                    className: "missing-ref-item"
                  },
                  React.createElement(
                    "div",
                    {
                      className: "rank-item",
                      onClick: function() {
                        onGotoDomain(item.node.data.domainId);
                      },
                      style: { cursor: "pointer", padding: "4px 6px" }
                    },
                    React.createElement("span", { className: "rank-item__num" }, i + 1),
                    React.createElement("span", { className: "rank-item__label" }, item.node.data.domainId),
                    React.createElement("span", {
                      className: "rank-item__value",
                      style: { color: "var(--warning)" }
                    }, item.count)
                  ),
                  item.uniqueTargets && item.uniqueTargets.length > 0 && React.createElement(
                    "div",
                    { className: "missing-ref-targets" },
                    item.uniqueTargets.slice(0, 3).map(function(t, ti) {
                      return React.createElement(
                        "div",
                        {
                          key: ti,
                          className: "missing-ref-target"
                        },
                        React.createElement(MIcon, { name: "warning", size: "sm" }),
                        React.createElement("span", null, t)
                      );
                    }),
                    item.uniqueTargets.length > 3 && React.createElement("div", {
                      className: "missing-ref-target missing-ref-target--more"
                    }, "...\u0438 \u0435\u0449\u0451 " + (item.uniqueTargets.length - 3))
                  )
                );
              })
            ),
            topMissingRefs.length
          ),
          // ----- НЕЙМСПЕЙСЫ -----
          namespaces.length > 0 && renderSection(
            "namespaces",
            "\u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u044B",
            "category",
            React.createElement(
              "div",
              { className: "bar-list" },
              namespaces.map(function(entry) {
                var ns = entry[0];
                var count = entry[1];
                var max = namespaces[0][1];
                return React.createElement(
                  "button",
                  {
                    key: ns,
                    className: "bar-item",
                    onClick: function() {
                      onSetNamespace(ns);
                    }
                  },
                  React.createElement("span", { className: "bar-item__label" }, ns),
                  React.createElement("span", { className: "bar-item__value" }, count),
                  React.createElement(
                    "span",
                    { className: "bar-item__track" },
                    React.createElement("span", {
                      className: "bar-item__fill",
                      style: { width: count / max * 100 + "%" }
                    })
                  )
                );
              })
            ),
            null
          ),
          // ----- ТЕГИ -----
          tagCloud.length > 0 && renderSection(
            "tags",
            "\u0422\u0435\u0433\u0438",
            "label",
            React.createElement(
              "div",
              { className: "tag-cloud" },
              tagCloud.map(function(entry) {
                var tag = entry[0];
                var count = entry[1];
                var active = tagFilters.has(tag);
                return React.createElement(
                  "button",
                  {
                    key: tag,
                    className: "tag" + (active ? " tag--active" : ""),
                    onClick: function() {
                      onToggleTag(tag);
                    }
                  },
                  tag,
                  React.createElement("span", { className: "tag__count" }, count)
                );
              })
            ),
            tagFilters.size > 0 ? tagFilters.size : null
          ),
          // ----- ИЗБРАННОЕ -----
          bookmarks.size > 0 && renderSection(
            "bookmarks",
            "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435",
            "star",
            React.createElement(
              "div",
              { className: "rank-list" },
              Array.from(bookmarks).slice(0, compact ? 5 : 15).map(function(id) {
                var n = nodes.find(function(x) {
                  return x.id === id;
                });
                if (!n)
                  return null;
                return React.createElement(
                  "div",
                  {
                    key: id,
                    className: "rank-item",
                    style: { cursor: "pointer" },
                    onClick: function() {
                      onGotoDomain(n.data.domainId);
                    }
                  },
                  React.createElement(
                    "span",
                    { className: "rank-item__num" },
                    React.createElement(MIcon, { name: "star", size: "sm", fill: true })
                  ),
                  React.createElement("span", { className: "rank-item__label" }, n.data.domainId),
                  React.createElement("button", {
                    className: "rank-item__remove",
                    onClick: function(ev) {
                      ev.stopPropagation();
                      onToggleBookmark(id);
                    },
                    title: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E"
                  }, React.createElement(MIcon, { name: "close", size: "sm" }))
                );
              })
            ),
            bookmarks.size
          ),
          // ----- ЛЕГЕНДА -----
          renderSection(
            "legend",
            "\u041B\u0435\u0433\u0435\u043D\u0434\u0430",
            "palette",
            React.createElement(
              "div",
              { className: "legend-list" },
              React.createElement(
                "div",
                { className: "legend-row" },
                React.createElement("span", { className: "legend-dot", style: { background: "var(--success)" } }),
                "Domain"
              ),
              React.createElement(
                "div",
                { className: "legend-row" },
                React.createElement("span", { className: "legend-dot", style: { background: "var(--warning)" } }),
                "Missing"
              ),
              React.createElement(
                "div",
                { className: "legend-row" },
                React.createElement("span", { className: "legend-dot", style: { background: "var(--danger)" } }),
                "Broken"
              ),
              React.createElement(
                "div",
                { className: "legend-row" },
                React.createElement("span", { className: "legend-line", style: { background: "#6366a1" } }),
                "Linkage"
              ),
              React.createElement(
                "div",
                { className: "legend-row" },
                React.createElement("span", { className: "legend-line", style: { background: "#4b7c6c" } }),
                "FQID"
              )
            ),
            null
          )
        )
      );
    }
    function SidePanel(props) {
      var open = props.open;
      var tab = props.tab;
      var setTab = props.setTab;
      var node = props.node;
      var filePath = props.filePath;
      var pendingFile = props.pendingFile;
      var editorRef = props.editorRef;
      var onClose = props.onClose;
      var allNodes = props.allNodes;
      var allEdges = props.allEdges;
      var onGotoDomain = props.onGotoDomain;
      var onOpenFile = props.onOpenFile;
      var edge = props.edge;
      var ruleViolations = props.ruleViolations;
      var [monacoReady, setMonacoReady] = useState(false);
      var monacoInitedRef = useRef(false);
      var [monacoReady, setMonacoReady] = useState(false);
      var monacoLoadingRef = useRef(false);
      var [editorCreated, setEditorCreated] = useState(false);
      var [collapsedSections, setCollapsedSections] = useState(function() {
        return /* @__PURE__ */ new Set(["incoming", "outgoing", "violations", "fqid-out", "validation"]);
      });
      var toggleSection = useCallback(function(id, shouldOpen) {
        setCollapsedSections(function(prev) {
          var s = new Set(prev);
          if (shouldOpen)
            s.delete(id);
          else
            s.add(id);
          return s;
        });
      }, []);
      useEffect(function() {
        if (!open)
          return;
        if (monacoReady)
          return;
        if (window.monaco && window.monaco.editor) {
          setMonacoReady(true);
          return;
        }
        if (monacoLoadingRef.current)
          return;
        if (typeof window.require === "undefined") {
          var retry = setTimeout(function() {
            monacoLoadingRef.current = false;
            setMonacoReady(function(v) {
              return v;
            });
          }, 300);
          return function() {
            clearTimeout(retry);
          };
        }
        monacoLoadingRef.current = true;
        window.require.config({
          paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs" }
        });
        window.require(["vs/editor/editor.main"], function() {
          if (window.monaco && window.monaco.editor) {
            setMonacoReady(true);
          } else {
            monacoLoadingRef.current = false;
          }
        }, function(err) {
          console.error("[monaco] load error:", err);
          monacoLoadingRef.current = false;
        });
      }, [open, monacoReady]);
      useEffect(function() {
        if (!open)
          return;
        if (!monacoReady)
          return;
        if (editorRef.current)
          return;
        if (!window.monaco || !window.monaco.editor)
          return;
        var el = document.getElementById("monaco-container");
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
          setEditorCreated(true);
        } catch (e) {
          console.error("[monaco] create failed:", e);
        }
      }, [open, monacoReady]);
      useEffect(function() {
        if (!pendingFile)
          return;
        if (!editorCreated)
          return;
        if (!editorRef.current)
          return;
        editorRef.current.setValue(pendingFile.content);
        if (pendingFile.fqid) {
          setTimeout(function() {
            var ed = editorRef.current;
            if (!ed)
              return;
            var lines = pendingFile.content.split(String.fromCharCode(10));
            for (var i = 0; i < lines.length; i++) {
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
      }, [pendingFile, editorCreated]);
      useEffect(function() {
        if (open)
          return;
        if (editorRef.current) {
          try {
            editorRef.current.dispose();
          } catch (e) {
          }
          editorRef.current = null;
          setEditorCreated(false);
        }
      }, [open]);
      if (!open)
        return null;
      var detailsContent = null;
      if (node) {
        var incoming = allEdges.filter(function(e) {
          return e.target === node.id;
        });
        var outgoing = allEdges.filter(function(e) {
          return e.source === node.id;
        });
        var refs = node.data.fqidRefs || [];
        var health = node.data.health;
        var hc = health != null ? health >= 80 ? "health-good" : health >= 50 ? "health-mid" : "health-bad" : null;
        detailsContent = React.createElement(
          "div",
          { className: "details" },
          React.createElement("div", { className: "details__title" }, node.data.label || node.data.domainId),
          React.createElement(
            "div",
            { className: "details__id" },
            React.createElement("span", { className: "details__id-text" }, node.data.domainId),
            React.createElement("button", { className: "details__copy", onClick: function() {
              navigator.clipboard.writeText(node.data.domainId);
            }, title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }, "\u{1F4CB}")
          ),
          React.createElement(
            "div",
            { className: "details__badges" },
            React.createElement("span", { className: "details__badge details__badge--" + node.data.nodeType }, node.data.nodeType),
            health != null && React.createElement("span", { className: "details__badge details__badge--" + hc }, "Health: " + health + "/100"),
            node.data.version && React.createElement("span", { className: "details__badge" }, "v" + node.data.version)
          ),
          node.data.updatedAt && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D"),
            React.createElement(
              "div",
              { className: "details__field-value", style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement(MIcon, {
                name: sourceIcon(node.data.updatedAtSource),
                size: "sm",
                title: sourceLabel(node.data.updatedAtSource)
              }),
              React.createElement("span", null, formatDate(node.data.updatedAt)),
              React.createElement("span", {
                style: {
                  fontSize: 10,
                  color: sourceColor(node.data.updatedAtSource),
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-750)",
                  marginLeft: "auto"
                }
              }, node.data.updatedAtSource === "graphql" ? "server" : node.data.updatedAtSource === "fs" ? "local" : "\u2014")
            )
          ),
          node.data.createdAt && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u0421\u043E\u0437\u0434\u0430\u043D"),
            React.createElement(
              "div",
              { className: "details__field-value", style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement(MIcon, {
                name: sourceIcon(node.data.createdAtSource),
                size: "sm",
                title: sourceLabel(node.data.createdAtSource)
              }),
              React.createElement("span", null, formatDate(node.data.createdAt)),
              React.createElement("span", {
                style: {
                  fontSize: 10,
                  color: sourceColor(node.data.createdAtSource),
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-750)",
                  marginLeft: "auto"
                }
              }, node.data.createdAtSource === "graphql" ? "server" : node.data.createdAtSource === "fs" ? "local" : "\u2014")
            )
          ),
          node.data.description && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435"),
            React.createElement("div", { className: "details__field-value" }, node.data.description)
          ),
          node.data.tags && node.data.tags.length > 0 && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u0422\u0435\u0433\u0438"),
            React.createElement("div", { className: "details__tags" }, node.data.tags.map(function(t, i) {
              return React.createElement("span", { key: i, className: "tag" }, t);
            }))
          ),
          REMOTE_INFO && REMOTE_INFO.server && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u041A\u0430\u0442\u0430\u043B\u043E\u0433"),
            React.createElement("div", {
              className: "details__field-value",
              style: { fontFamily: "monospace", fontSize: 12, lineHeight: 1.7, wordBreak: "break-word" }
            }, node.data.folderPath && node.data.folderPath.length > 0 ? node.data.folderPath.join(" / ") : "(\u043A\u043E\u0440\u0435\u043D\u044C)")
          ),
          !(REMOTE_INFO && REMOTE_INFO.server) && node.data.filePath && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "\u0424\u0430\u0439\u043B"),
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } },
              React.createElement("div", {
                className: "details__field-value",
                style: { fontFamily: "monospace", fontSize: 11, flex: 1, wordBreak: "break-all" }
              }, node.data.filePath),
              React.createElement("button", {
                className: "details__copy",
                onClick: function() {
                  var path = node.data.filePath;
                  var url = "vscode://file" + (path.startsWith("/") ? path : "/" + path);
                  window.location.href = url;
                },
                title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 VS Code"
              }, React.createElement(MIcon, { name: "code" }))
            )
          ),
          node.data.health != null && node.data.healthBreakdown && node.data.healthBreakdown.length > 0 && React.createElement(
            "div",
            { className: "details__field" },
            React.createElement("div", { className: "details__field-label" }, "Health breakdown"),
            React.createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: 4 } },
              node.data.healthBreakdown.map(function(b, i) {
                return React.createElement(
                  "div",
                  {
                    key: i,
                    style: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-400)" }
                  },
                  React.createElement("span", null, b.reason),
                  React.createElement("span", {
                    style: { color: b.delta < 0 ? "var(--danger)" : "var(--success)", fontWeight: 600, fontFamily: "monospace" }
                  }, b.delta > 0 ? "+" + b.delta : b.delta)
                );
              })
            )
          ),
          React.createElement(
            CollapsibleSection,
            {
              id: "fqid-out",
              title: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 FQID-\u0441\u0441\u044B\u043B\u043A\u0438",
              count: refs.length,
              collapsed: collapsedSections,
              onToggle: toggleSection
            },
            refs.length === 0 ? React.createElement("div", { className: "details__field-value", style: { color: "var(--text-500)" } }, "\u2014") : React.createElement(
              "div",
              { className: "details__refs" },
              refs.slice(0, 50).map(function(r, i) {
                var targetExists = allNodes.some(function(n) {
                  return (n.data.domainId || "").toLowerCase() === (r.targetDomainId || "").toLowerCase();
                });
                return React.createElement(
                  "div",
                  {
                    key: i,
                    className: "details__ref" + (targetExists ? "" : " details__ref--missing"),
                    onClick: function() {
                      if (targetExists)
                        onGotoDomain(r.targetDomainId);
                    }
                  },
                  React.createElement("div", null, r.fullFQID),
                  React.createElement("div", { className: "details__ref-path" }, r.propertyPath + (!targetExists ? " \xB7 \u26A0\uFE0F missing" : ""))
                );
              })
            )
          ),
          React.createElement(
            CollapsibleSection,
            {
              id: "incoming",
              title: "\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0441\u0432\u044F\u0437\u0438",
              count: incoming.length,
              collapsed: collapsedSections,
              onToggle: toggleSection
            },
            incoming.length === 0 ? React.createElement("div", { className: "details__field-value", style: { color: "var(--text-500)" } }, "\u2014") : React.createElement(
              "div",
              { className: "details__refs" },
              incoming.slice(0, 30).map(function(e, i) {
                var src = allNodes.find(function(n) {
                  return n.id === e.source;
                });
                return React.createElement(
                  "div",
                  { key: i, className: "details__ref", onClick: function() {
                    if (src)
                      onGotoDomain(src.data.domainId);
                  } },
                  React.createElement("div", null, src ? src.data.domainId : e.source),
                  React.createElement("div", { className: "details__ref-path" }, e.data && e.data.kind || "")
                );
              })
            )
          ),
          React.createElement(
            CollapsibleSection,
            {
              id: "outgoing",
              title: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0441\u0432\u044F\u0437\u0438",
              count: outgoing.length,
              collapsed: collapsedSections,
              onToggle: toggleSection
            },
            outgoing.length === 0 ? React.createElement("div", { className: "details__field-value", style: { color: "var(--text-500)" } }, "\u2014") : React.createElement(
              "div",
              { className: "details__refs" },
              outgoing.slice(0, 30).map(function(e, i) {
                var tgt = allNodes.find(function(n) {
                  return n.id === e.target;
                });
                return React.createElement(
                  "div",
                  { key: i, className: "details__ref", onClick: function() {
                    if (tgt)
                      onGotoDomain(tgt.data.domainId);
                  } },
                  React.createElement("div", null, tgt ? tgt.data.domainId : e.target),
                  React.createElement("div", { className: "details__ref-path" }, e.data && e.data.kind || "")
                );
              })
            )
          ),
          node.data.__validationStatus === "invalid" && node.data.__validationDiagnostics && node.data.__validationDiagnostics.length > 0 && React.createElement(
            CollapsibleSection,
            {
              id: "validation",
              title: "\u041E\u0448\u0438\u0431\u043A\u0438 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438",
              count: node.data.__validationDiagnostics.length,
              collapsed: collapsedSections,
              onToggle: toggleSection
            },
            React.createElement(
              "div",
              { style: { maxHeight: 320, overflowY: "auto" } },
              node.data.__validationDiagnostics.map(function(d, i) {
                return React.createElement(
                  "div",
                  {
                    key: i,
                    style: {
                      padding: "8px 10px",
                      background: "var(--bg-750)",
                      borderRadius: 6,
                      marginBottom: 6,
                      fontSize: 12,
                      borderLeft: "2px solid " + (d.severity === "ERROR" ? "var(--danger)" : "var(--warning)")
                    }
                  },
                  React.createElement("div", {
                    style: { fontWeight: 700, fontSize: 10, textTransform: "uppercase", color: d.severity === "ERROR" ? "var(--danger)" : "var(--warning)", marginBottom: 4 }
                  }, d.severity),
                  React.createElement("div", { style: { color: "var(--text-200)" } }, d.message),
                  d.labels && d.labels.length > 0 && d.labels.map(function(lb, li) {
                    return React.createElement("div", {
                      key: li,
                      style: { fontSize: 11, color: "var(--text-500)", fontFamily: "monospace", marginTop: 4 }
                    }, lb.message, lb.span && " [" + lb.span.start + "\u2013" + lb.span.end + "]");
                  })
                );
              })
            )
          ),
          React.createElement(
            CollapsibleSection,
            {
              id: "violations",
              title: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043F\u0440\u0430\u0432\u0438\u043B",
              count: ruleViolations.length,
              collapsed: collapsedSections,
              onToggle: toggleSection
            },
            ruleViolations.length === 0 ? React.createElement("div", { className: "details__field-value", style: { color: "var(--text-500)" } }, "\u2014") : React.createElement(
              "div",
              { className: "details__refs" },
              ruleViolations.slice(0, 10).map(function(v, i) {
                return React.createElement(
                  "div",
                  {
                    key: i,
                    className: "rank-item",
                    style: { cursor: "pointer" },
                    onClick: function() {
                      gotoDomainByDomainId(v.fromId);
                    }
                  },
                  React.createElement("span", { className: "rank-item__num" }, v.severity === "forbid" ? "\u26D4" : "\u26A0\uFE0F"),
                  React.createElement("span", { className: "rank-item__label" }, v.fromId + " \u2192 " + v.toId)
                );
              })
            )
          )
        );
      } else {
        detailsContent = React.createElement("div", { className: "details" }, React.createElement("div", { style: { color: "var(--text-500)", textAlign: "center", padding: 40 } }, "\u0423\u0437\u0435\u043B \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D"));
      }
      var fileContent = React.createElement("div", {
        id: "monaco-container",
        style: { width: "100%", height: "100%" }
      });
      var edgeContent = null;
      if (tab === "edge") {
        if (!edge) {
          edgeContent = React.createElement("div", { className: "details" }, React.createElement("div", { style: { color: "var(--text-500)", textAlign: "center", padding: 40 } }, "\u0421\u0432\u044F\u0437\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430"));
        } else {
          var link = edge.data && edge.data.linkData || {};
          var refs = edge.data && edge.data.fqidRefs || [];
          var srcNode = allNodes.find(function(n) {
            return n.id === edge.source;
          });
          var tgtNode = allNodes.find(function(n) {
            return n.id === edge.target;
          });
          edgeContent = React.createElement(
            "div",
            { className: "details" },
            React.createElement("div", { className: "details__title" }, edge.data && edge.data.fullLabel || edge.label || edge.id),
            React.createElement(
              "div",
              { className: "details__id" },
              React.createElement(
                "span",
                { className: "details__id-text" },
                (edge.data && edge.data.linkData && edge.data.linkData.originalId ? `${srcNode.data.domainId}/${edge.data.linkData.originalId}` : null) || edge.data && edge.data.fullLabel || edge.label || `${srcNode.data.domainId}/${edge.id}`
              ),
              React.createElement("button", {
                className: "details__copy",
                onClick: function() {
                  var copyId = edge.data && edge.data.linkData && edge.data.linkData.originalId || edge.id;
                  navigator.clipboard.writeText(copyId);
                },
                title: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C ID \u0441\u0432\u044F\u0437\u0438"
              }, React.createElement(MIcon, { name: "content_copy", size: "sm" }))
            ),
            edge.data && edge.data.fullLabel && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435"),
              React.createElement("div", { className: "details__field-value" }, edge.data.fullLabel)
            ),
            edge.data && edge.data.kind && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "\u0422\u0438\u043F \u0441\u0432\u044F\u0437\u0438"),
              React.createElement(
                "div",
                { className: "details__field-value" },
                React.createElement(
                  "span",
                  { className: "details__badge" },
                  edge.data.kind === "linkage" ? "Linkage" : "FQID"
                ),
                edge.data && edge.data.isBidirectional && React.createElement("span", { className: "details__badge" }, "\u21C4 \u0434\u0432\u0443\u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u0430\u044F"),
                edge.data.linkData && edge.data.linkData.type && React.createElement(
                  "span",
                  { className: "details__badge", style: { marginLeft: 8 } },
                  edge.data.linkData.type
                ),
                edge.data && edge.data.refCount && React.createElement("span", { className: "details__badge" }, edge.data.refCount + " refs")
              )
            ),
            srcNode && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A"),
              React.createElement(
                "div",
                { className: "details__ref", onClick: function() {
                  onGotoDomain(srcNode.data.domainId);
                } },
                React.createElement("div", null, srcNode.data.domainId),
                link.sourceEntity && React.createElement("div", { className: "details__ref-path" }, link.sourceEntity)
              )
            ),
            tgtNode && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "\u0426\u0435\u043B\u044C"),
              React.createElement(
                "div",
                { className: "details__ref", onClick: function() {
                  onGotoDomain(tgtNode.data.domainId);
                } },
                React.createElement("div", null, tgtNode.data.domainId),
                link.targetEntity && React.createElement("div", { className: "details__ref-path" }, link.targetEntity)
              )
            ),
            link.nameFrom && (link.nameFrom.side1 || link.nameFrom.side2) && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "\u0421\u0442\u043E\u0440\u043E\u043D\u044B"),
              link.nameFrom.side1 && React.createElement("div", { className: "details__field-value" }, "\u0421\u0442\u043E\u0440\u043E\u043D\u0430 1: " + link.nameFrom.side1),
              link.nameFrom.side2 && React.createElement("div", { className: "details__field-value" }, "\u0421\u0442\u043E\u0440\u043E\u043D\u0430 2: " + link.nameFrom.side2)
            ),
            refs.length > 0 && React.createElement(
              "div",
              { className: "details__field" },
              React.createElement("div", { className: "details__field-label" }, "FQID-\u0441\u0441\u044B\u043B\u043A\u0438 (" + refs.length + ")"),
              React.createElement(
                "div",
                { className: "details__refs" },
                refs.map(function(r, i) {
                  return React.createElement(
                    "div",
                    {
                      key: i,
                      className: "details__ref",
                      onClick: function() {
                        if (r.targetDomainId)
                          onGotoDomain(r.targetDomainId);
                      }
                    },
                    React.createElement("div", null, r.fullFQID),
                    React.createElement("div", { className: "details__ref-path" }, r.propertyPath)
                  );
                })
              )
            ),
            React.createElement(
              "div",
              { className: "details__actions" },
              srcNode && React.createElement("button", { className: "btn", onClick: function() {
                onGotoDomain(srcNode.data.domainId);
              } }, "\u{1F3AF} \u041A \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0443"),
              tgtNode && React.createElement("button", { className: "btn", onClick: function() {
                onGotoDomain(tgtNode.data.domainId);
              } }, "\u{1F3AF} \u041A \u0446\u0435\u043B\u0438")
            )
          );
        }
      }
      var entitiesContent = null;
      if (tab === "entities") {
        var domainEntities = (props.entities || []).filter(function(e) {
          return e.domainId === (node && node.data && node.data.domainId);
        });
        var childIndex = props.entityIndex;
        entitiesContent = React.createElement(
          "div",
          { className: "details" },
          React.createElement("div", { className: "details__field-label" }, "\u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438 \u0434\u043E\u043C\u0435\u043D\u0430 (" + domainEntities.length + ")"),
          domainEntities.length === 0 ? React.createElement("div", { className: "details__field-value", style: { color: "var(--text-500)" } }, "\u041D\u0435\u0442 \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439") : React.createElement(
            "div",
            { className: "entity-tab-list" },
            domainEntities.map(function(e) {
              var key = (e.domainId + "/" + e.entityId).toLowerCase();
              var hasParents = !!e.inherits;
              var hasChildren = childIndex && (childIndex.children.get(key) || []).length > 0;
              return React.createElement(
                "div",
                {
                  key,
                  className: "entity-tab-item",
                  onClick: function() {
                    props.onOpenEntityHierarchy(key);
                  }
                },
                React.createElement(
                  "div",
                  { className: "entity-tab-item__head" },
                  React.createElement("span", { className: "entity-tab-item__id" }, e.entityId),
                  (hasParents || hasChildren) && React.createElement(
                    "span",
                    { className: "entity-tab-item__arrows" },
                    (hasParents ? "\u2191" : "") + (hasChildren ? "\u2193" : "")
                  )
                ),
                e.name && e.name !== e.entityId && React.createElement("div", { className: "entity-tab-item__name" }, e.name),
                e.inherits && React.createElement("div", { className: "entity-tab-item__inherits" }, "\u21B3 " + e.inherits)
              );
            })
          )
        );
      }
      return React.createElement(
        "div",
        { className: "side-panel open" },
        React.createElement(
          "div",
          { className: "side-panel__header" },
          React.createElement(
            "div",
            { className: "side-panel__tabs" },
            React.createElement("button", { className: "side-panel__tab" + (tab === "details" ? " active" : ""), onClick: function() {
              setTab("details");
            } }, "\u{1F4CB} \u0414\u0435\u0442\u0430\u043B\u0438"),
            React.createElement("button", { className: "side-panel__tab" + (tab === "file" ? " active" : ""), onClick: function() {
              setTab("file");
            } }, "\u{1F4C4} \u0424\u0430\u0439\u043B"),
            React.createElement("button", { className: "side-panel__tab" + (tab === "edge" ? " active" : ""), onClick: function() {
              setTab("edge");
            } }, "\u{1F517} \u0421\u0432\u044F\u0437\u044C"),
            React.createElement("button", {
              className: "side-panel__tab" + (tab === "entities" ? " active" : ""),
              onClick: function() {
                setTab("entities");
              }
            }, "\u{1F9EC} \u0421\u0443\u0449\u043D\u043E\u0441\u0442\u0438")
          ),
          React.createElement("button", { className: "btn btn--icon", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }, "\u2715")
        ),
        //filePath && React.createElement('div', { className: 'editor-panel__path', style: { padding: '6px 16px', fontSize: 11, color: 'var(--text-500)', borderBottom: '1px solid var(--border)', background: 'var(--bg-800)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, filePath),
        React.createElement(
          "div",
          { className: "side-panel__body", style: { position: "relative" } },
          React.createElement("div", {
            className: "side-panel__pane",
            style: { display: tab === "details" ? "block" : "none" }
          }, detailsContent),
          React.createElement("div", {
            className: "side-panel__pane",
            style: { display: tab === "edge" ? "block" : "none" }
          }, edgeContent),
          React.createElement("div", {
            className: "side-panel__pane",
            style: { display: tab === "entities" ? "block" : "none" }
          }, entitiesContent),
          React.createElement("div", {
            className: "side-panel__pane",
            style: { display: tab === "file" ? "block" : "none" }
          }, fileContent)
        )
      );
    }
    function FilterMenu(props) {
      var filters = props.filters, setFilters = props.setFilters, counts = props.counts;
      var namespaceFilter = props.namespaceFilter, setNamespaceFilter = props.setNamespaceFilter;
      var bookmarksOnly = props.bookmarksOnly, setBookmarksOnly = props.setBookmarksOnly;
      var onlyInvalid = props.onlyInvalid, setOnlyInvalid = props.setOnlyInvalid;
      var isolatedOnly = props.isolatedOnly, setIsolatedOnly = props.setIsolatedOnly;
      var tooltipsEnabled = props.tooltipsEnabled, setTooltipsEnabled = props.setTooltipsEnabled;
      var setAll = function(val) {
        setFilters(function(f) {
          return Object.assign({}, f, { domain: val, missing: val, broken: val, linkage: val, fqid: val });
        });
      };
      var resetAll = function() {
        setAll(true);
        setNamespaceFilter("");
        setBookmarksOnly(false);
        setOnlyInvalid(false);
        setIsolatedOnly(false);
      };
      var rows = [
        { key: "domain", label: "Domain", color: "var(--success)" },
        { key: "missing", label: "Missing", color: "var(--warning)" },
        { key: "broken", label: "Broken", color: "var(--danger)" }
      ];
      var edgesRows = [
        { key: "linkage", label: "Linkage", color: LINKAGE_COLOR },
        { key: "fqid", label: "FQID", color: FQID_COLOR }
      ];
      return React.createElement(
        "div",
        { className: "menu" },
        React.createElement(
          "div",
          { className: "menu__header" },
          React.createElement("span", null, "\u0424\u0438\u043B\u044C\u0442\u0440\u044B"),
          React.createElement("button", { className: "menu__action", onClick: resetAll }, "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C")
        ),
        React.createElement(
          "div",
          { className: "menu__section" },
          React.createElement("div", { className: "menu__label" }, "\u0422\u0438\u043F \u0443\u0437\u043B\u043E\u0432"),
          rows.map(function(it) {
            return React.createElement(
              "label",
              { key: it.key, className: "menu__checkbox" },
              React.createElement("input", { type: "checkbox", checked: !!filters[it.key], onChange: function() {
                setFilters(function(f) {
                  return Object.assign({}, f, { [it.key]: !f[it.key] });
                });
              } }),
              React.createElement("span", { className: "menu__check" }),
              React.createElement("span", { className: "menu__dot", style: { background: it.color } }),
              React.createElement("span", { className: "menu__text" }, it.label),
              React.createElement("span", { className: "menu__count" }, counts[it.key])
            );
          })
        ),
        React.createElement(
          "div",
          { className: "menu__section" },
          React.createElement("div", { className: "menu__label" }, "\u0422\u0438\u043F \u0441\u0432\u044F\u0437\u0435\u0439"),
          edgesRows.map(function(it) {
            return React.createElement(
              "label",
              { key: it.key, className: "menu__checkbox" },
              React.createElement("input", { type: "checkbox", checked: !!filters[it.key], onChange: function() {
                setFilters(function(f) {
                  return Object.assign({}, f, { [it.key]: !f[it.key] });
                });
              } }),
              React.createElement("span", { className: "menu__check" }),
              React.createElement("span", { className: "menu__dot", style: { background: it.color } }),
              React.createElement("span", { className: "menu__text" }, it.label),
              React.createElement("span", { className: "menu__count" }, counts[it.key])
            );
          })
        ),
        React.createElement(
          "div",
          { className: "menu__section" },
          React.createElement("div", { className: "menu__label" }, "Namespace"),
          React.createElement("input", { className: "menu__input", type: "text", placeholder: "sgrc.risk.*, !test.*", value: namespaceFilter, onChange: function(e) {
            setNamespaceFilter(e.target.value);
          }, onKeyDown: function(e) {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              document.dispatchEvent(new CustomEvent("close-all-popovers"));
            }
          } }),
          React.createElement("div", { className: "menu__hint" }, "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0441\u043E\u043A \u0447\u0435\u0440\u0435\u0437 , ; \u0438\u043B\u0438 \u043F\u0440\u043E\u0431\u0435\u043B. ", React.createElement("b", null, "!"), " \u2014 \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C. ", React.createElement("b", null, "*"), " \u2014 \u043B\u044E\u0431\u043E\u0439 \u0441\u0438\u043C\u0432\u043E\u043B.")
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement(
          "div",
          { className: "menu__section" },
          React.createElement("div", { className: "menu__label" }, "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E"),
          React.createElement(
            "label",
            { className: "menu__checkbox" },
            React.createElement("input", { type: "checkbox", checked: bookmarksOnly, onChange: function() {
              setBookmarksOnly(!bookmarksOnly);
            } }),
            React.createElement("span", { className: "menu__check" }),
            React.createElement("span", { className: "menu__text" }, "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435 (\u2605)")
          ),
          React.createElement(
            "label",
            { className: "menu__checkbox" },
            React.createElement("input", { type: "checkbox", checked: onlyInvalid, onChange: function() {
              setOnlyInvalid(!onlyInvalid);
            } }),
            React.createElement("span", { className: "menu__check" }),
            React.createElement("span", { className: "menu__text" }, "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 (\u274C)")
          ),
          React.createElement(
            "label",
            { className: "menu__checkbox" },
            React.createElement("input", { type: "checkbox", checked: isolatedOnly, onChange: function() {
              setIsolatedOnly(!isolatedOnly);
            } }),
            React.createElement("span", { className: "menu__check" }),
            React.createElement("span", { className: "menu__text" }, "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 (\u25EF)")
          ),
          React.createElement("div", { className: "menu__divider" }),
          React.createElement(
            "label",
            { className: "menu__checkbox" },
            React.createElement("input", {
              type: "checkbox",
              checked: !props.sidePanelEnabled,
              onChange: function() {
                props.setSidePanelEnabled(!props.sidePanelEnabled);
              }
            }),
            React.createElement("span", { className: "menu__check" }),
            React.createElement("span", { className: "menu__text" }, "\u041D\u0435 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043F\u0440\u0430\u0432\u0443\u044E \u043F\u0430\u043D\u0435\u043B\u044C (D)")
          ),
          React.createElement(
            "label",
            { className: "menu__checkbox" },
            React.createElement("input", { type: "checkbox", checked: !tooltipsEnabled, onChange: function() {
              setTooltipsEnabled(!tooltipsEnabled);
            } }),
            React.createElement("span", { className: "menu__check" }),
            React.createElement("span", { className: "menu__text" }, "\u0421\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B")
          )
        )
      );
    }
    function AnalysisMenu(props) {
      var cycleHighlight = props.cycleHighlight;
      var handleFindCycles = props.handleFindCycles;
      var isolatedOnly = props.isolatedOnly;
      var setIsolatedOnly = props.setIsolatedOnly;
      var nsMode = props.nsMode;
      var setNsMode = props.setNsMode;
      var focusDepth = props.focusDepth;
      var setFocusDepth = props.setFocusDepth;
      var focusNode = props.focusNode;
      var clearFocus = props.clearFocus;
      var onOpenTopo = props.onOpenTopo;
      var onOpenLearningPath = props.onOpenLearningPath;
      var onOpenRules = props.onOpenRules;
      var ruleViolations = props.ruleViolations || [];
      var close2 = props.close;
      return React.createElement(
        "div",
        { className: "menu" },
        // --- Циклы ---
        React.createElement(
          "button",
          {
            className: "menu__item" + (cycleHighlight ? " menu__item--active" : ""),
            onClick: function() {
              handleFindCycles();
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u{1F501}"),
          React.createElement("span", { className: "menu__text" }, "\u041D\u0430\u0439\u0442\u0438 \u0446\u0438\u043A\u043B\u044B"),
          cycleHighlight && React.createElement("span", { className: "menu__count" }, cycleHighlight.sccCount)
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.pathMode ? " menu__item--active" : ""),
            onClick: function() {
              props.onStartPathFinder();
              close2();
            }
          },
          React.createElement(
            "span",
            { className: "menu__icon" },
            React.createElement(MIcon, { name: "route", size: "sm" })
          ),
          React.createElement("span", { className: "menu__text" }, "\u041D\u0430\u0439\u0442\u0438 \u043F\u0443\u0442\u044C \u043C\u0435\u0436\u0434\u0443 \u0443\u0437\u043B\u0430\u043C\u0438")
        ),
        // --- Изолированные ---
        React.createElement(
          "button",
          {
            className: "menu__item" + (isolatedOnly ? " menu__item--active" : ""),
            onClick: function() {
              setIsolatedOnly(function(v) {
                return !v;
              });
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u25EF"),
          React.createElement("span", { className: "menu__text" }, "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435")
        ),
        // --- Агрегация по семействам ---
        React.createElement(
          "button",
          {
            className: "menu__item" + (nsMode ? " menu__item--active" : ""),
            onClick: function() {
              setNsMode(function(v) {
                return !v;
              });
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u{1F5C2}"),
          React.createElement("span", { className: "menu__text" }, "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C")
        ),
        React.createElement("div", { className: "menu__divider" }),
        // --- Порядок установки ---
        React.createElement(
          "button",
          {
            className: "menu__item",
            onClick: function() {
              onOpenTopo();
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u{1F4E6}"),
          React.createElement("span", { className: "menu__text" }, "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438")
        ),
        // --- Путь изучения ---
        React.createElement(
          "button",
          {
            className: "menu__item",
            onClick: function() {
              onOpenLearningPath();
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u{1F4D6}"),
          React.createElement("span", { className: "menu__text" }, "\u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F")
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.ruleViolations && props.ruleViolations.length > 0 ? " menu__item--active" : ""),
            onClick: function() {
              props.onOpenRules();
              close2();
            }
          },
          React.createElement(
            "span",
            { className: "menu__icon" },
            React.createElement(MIcon, { name: "block", size: "sm" })
          ),
          React.createElement("span", { className: "menu__text" }, "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439"),
          props.ruleViolations && props.ruleViolations.length > 0 && React.createElement("span", { className: "menu__count" }, props.ruleViolations.length)
        ),
        React.createElement(
          "button",
          {
            className: "menu__item",
            onClick: function() {
              props.onOpenEntityHierarchy();
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u{1F9EC}"),
          React.createElement("span", { className: "menu__text" }, "\u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439")
        ),
        React.createElement("div", { className: "menu__divider" }),
        // --- Фокус: слайдер глубины ---
        React.createElement(
          "div",
          { className: "menu__row" },
          React.createElement("span", { style: { fontSize: 12, color: "var(--text-400)", minWidth: 100 } }, "\u0413\u043B\u0443\u0431\u0438\u043D\u0430 \u0444\u043E\u043A\u0443\u0441\u0430:"),
          React.createElement("input", {
            className: "menu__slider",
            type: "range",
            min: 1,
            max: 4,
            value: focusDepth,
            onChange: function(e) {
              setFocusDepth(parseInt(e.target.value));
            }
          }),
          React.createElement("span", {
            style: { fontSize: 12, fontWeight: 700, color: "var(--accent-hover)", minWidth: 12, textAlign: "center" }
          }, focusDepth)
        ),
        // --- Кнопка сброса фокуса (если активен) ---
        focusNode && React.createElement(
          "button",
          {
            className: "menu__item menu__item--danger",
            onClick: function() {
              clearFocus();
              close2();
            }
          },
          React.createElement("span", { className: "menu__icon" }, "\u2715"),
          React.createElement("span", { className: "menu__text" }, "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u043E\u043A\u0443\u0441")
        )
      );
    }
    function ViewMenu(props) {
      var layoutType = props.layoutType, setLayoutType = props.setLayoutType;
      var compact = props.compact, setCompact = props.setCompact;
      var showGroups = props.showGroups, setShowGroups = props.setShowGroups;
      var bidirectional = props.bidirectional, setBidirectional = props.setBidirectional;
      var showEdgeLabels = props.showEdgeLabels, setShowEdgeLabels = props.setShowEdgeLabels;
      var theme = props.theme, setTheme = props.setTheme;
      var close2 = props.close;
      var layouts = [
        { key: "LR", label: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u043E (LR)" },
        { key: "TB", label: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u043E (TB)" },
        { key: "force", label: "Force-directed" },
        { key: "circular", label: "\u041A\u0440\u0443\u0433\u043E\u0432\u043E\u0439" }
      ];
      return React.createElement(
        "div",
        { className: "menu" },
        React.createElement("div", { className: "menu__label" }, "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430"),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "LR" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("LR");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "LR" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F (LR)")
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "TB" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("TB");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "TB" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F (TB)")
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "force" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("force");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "force" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "Force-directed")
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "circular" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("circular");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "circular" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "\u041A\u0440\u0443\u0433\u043E\u0432\u043E\u0439")
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "cluster" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("cluster");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "cluster" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "\u041F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C")
        ),
        React.createElement(
          "button",
          {
            className: "menu__item" + (props.layoutType === "folder" ? " menu__item--active" : ""),
            onClick: function() {
              props.setLayoutType("folder");
            }
          },
          React.createElement("span", { className: "menu__icon" }, props.layoutType === "folder" ? "\u25CF" : "\u25CB"),
          React.createElement("span", { className: "menu__text" }, "\u041F\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430\u043C")
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement("div", { className: "menu__label" }, "Heatmap"),
        [
          { key: "none", label: "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D" },
          { key: "health", label: "Health score" },
          { key: "degree", label: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u0432\u044F\u0437\u0435\u0439" },
          { key: "entities", label: "Entities" },
          { key: "fqid", label: "\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 FQID" }
        ].map(function(h) {
          return React.createElement(
            "button",
            {
              key: h.key,
              className: "menu__item" + (props.heatmap === h.key ? " menu__item--active" : ""),
              onClick: function() {
                props.setHeatmap(h.key);
                close2();
              }
            },
            React.createElement("span", { className: "menu__icon" }, props.heatmap === h.key ? "\u25CF" : "\u25CB"),
            React.createElement("span", { className: "menu__text" }, h.label)
          );
        }),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement("div", { className: "menu__label" }, "\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435"),
        React.createElement(
          "label",
          { className: "menu__checkbox" },
          React.createElement("input", { type: "checkbox", checked: compact, onChange: function() {
            setCompact(!compact);
          } }),
          React.createElement("span", { className: "menu__check" }),
          React.createElement("span", { className: "menu__text" }, "\u041A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C")
        ),
        React.createElement(
          "label",
          { className: "menu__checkbox" },
          React.createElement("input", { type: "checkbox", checked: showGroups, onChange: function() {
            setShowGroups(!showGroups);
          } }),
          React.createElement("span", { className: "menu__check" }),
          React.createElement("span", { className: "menu__text" }, "\u0413\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u0432 \u0440\u0430\u043C\u043A\u0438")
        ),
        React.createElement(
          "label",
          { className: "menu__checkbox" },
          React.createElement("input", { type: "checkbox", checked: bidirectional, onChange: function() {
            setBidirectional(!bidirectional);
          } }),
          React.createElement("span", { className: "menu__check" }),
          React.createElement("span", { className: "menu__text" }, "\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u0442\u044C A\u2194B")
        ),
        React.createElement(
          "label",
          { className: "menu__checkbox" },
          React.createElement("input", { type: "checkbox", checked: showEdgeLabels, onChange: function() {
            setShowEdgeLabels(!showEdgeLabels);
          } }),
          React.createElement("span", { className: "menu__check" }),
          React.createElement("span", { className: "menu__text" }, "\u041F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439")
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            setTheme(theme === "dark" ? "light" : "dark");
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"),
          React.createElement("span", { className: "menu__text" }, theme === "dark" ? "\u0421\u0432\u0435\u0442\u043B\u0430\u044F \u0442\u0435\u043C\u0430" : "\u0422\u0451\u043C\u043D\u0430\u044F \u0442\u0435\u043C\u0430")
        )
      );
    }
    function DataMenu(props) {
      var handleExportJSON = props.handleExportJSON;
      var handleExportMarkdown = props.handleExportMarkdown;
      var handleExportPNG = props.handleExportPNG;
      var snapshotInputRef = props.snapshotInputRef, handleSnapshotUpload = props.handleSnapshotUpload;
      var diffMode = props.diffMode, setDiffMode = props.setDiffMode;
      var validationAvailable = props.validationAvailable;
      var onOpenValidation = props.onOpenValidation;
      var handleExportMermaid = props.handleExportMermaid;
      var close2 = props.close;
      return React.createElement(
        "div",
        { className: "menu" },
        React.createElement("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 } }, "\u042D\u043A\u0441\u043F\u043E\u0440\u0442"),
        React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            handleExportJSON();
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, "\u{1F4BE}"),
          React.createElement("span", { className: "menu__text" }, "\u0413\u0440\u0430\u0444 \u0432 JSON")
        ),
        React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            handleExportMarkdown();
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, "\u{1F4DD}"),
          React.createElement("span", { className: "menu__text" }, "\u041E\u0442\u0447\u0451\u0442 \u0432 Markdown")
        ),
        React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            handleExportPNG();
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, "\u{1F5BC}\uFE0F"),
          React.createElement("span", { className: "menu__text" }, "\u0413\u0440\u0430\u0444 \u0432 PNG")
        ),
        React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            handleExportMermaid();
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, React.createElement(MIcon, { name: "schema", size: "sm" })),
          React.createElement("span", { className: "menu__text" }, "\u0414\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430 Mermaid")
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 } }, "\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435"),
        React.createElement(
          "label",
          { className: "menu__item" },
          React.createElement("span", { className: "menu__icon" }, "\u21C4"),
          React.createElement("span", { className: "menu__text" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A"),
          React.createElement("input", { ref: snapshotInputRef, type: "file", accept: "application/json", style: { display: "none" }, onChange: function(e) {
            handleSnapshotUpload(e);
            close2();
          } })
        ),
        React.createElement("div", { className: "menu__divider" }),
        React.createElement("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 } }, "\u0421\u043D\u0438\u043C\u043A\u0438 (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E)"),
        // Слот A
        React.createElement(
          "div",
          { className: "snap-slot" },
          React.createElement(
            "div",
            { className: "snap-slot__info" },
            React.createElement("span", { className: "snap-slot__badge snap-slot__badge--a" }, "A"),
            props.snapshotA ? React.createElement(
              "div",
              { className: "snap-slot__meta" },
              React.createElement("div", { className: "snap-slot__time" }, formatSavedAt(props.snapshotA.savedAt)),
              React.createElement(
                "div",
                { className: "snap-slot__stats" },
                props.snapshotA.stats.nodes + " \u0443\u0437\u043B\u043E\u0432 \xB7 " + props.snapshotA.stats.edges + " \u0441\u0432\u044F\u0437\u0435\u0439"
              )
            ) : React.createElement("div", { className: "snap-slot__empty" }, "\u043F\u0443\u0441\u0442\u043E")
          ),
          React.createElement(
            "div",
            { className: "snap-slot__actions" },
            React.createElement("button", {
              className: "snap-btn",
              onClick: props.onSaveA,
              title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 A"
            }, React.createElement(MIcon, { name: "save", size: "sm" })),
            props.snapshotA && React.createElement("button", {
              className: "snap-btn snap-btn--primary",
              onClick: function() {
                props.onLoadA();
                close2();
              },
              title: "\u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441 A"
            }, React.createElement(MIcon, { name: "compare_arrows", size: "sm" })),
            props.snapshotA && React.createElement("button", {
              className: "snap-btn snap-btn--danger",
              onClick: props.onClearA,
              title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A A"
            }, React.createElement(MIcon, { name: "close", size: "sm" }))
          )
        ),
        // Слот B
        React.createElement(
          "div",
          { className: "snap-slot" },
          React.createElement(
            "div",
            { className: "snap-slot__info" },
            React.createElement("span", { className: "snap-slot__badge snap-slot__badge--b" }, "B"),
            props.snapshotB ? React.createElement(
              "div",
              { className: "snap-slot__meta" },
              React.createElement("div", { className: "snap-slot__time" }, formatSavedAt(props.snapshotB.savedAt)),
              React.createElement(
                "div",
                { className: "snap-slot__stats" },
                props.snapshotB.stats.nodes + " \u0443\u0437\u043B\u043E\u0432 \xB7 " + props.snapshotB.stats.edges + " \u0441\u0432\u044F\u0437\u0435\u0439"
              )
            ) : React.createElement("div", { className: "snap-slot__empty" }, "\u043F\u0443\u0441\u0442\u043E")
          ),
          React.createElement(
            "div",
            { className: "snap-slot__actions" },
            React.createElement("button", {
              className: "snap-btn",
              onClick: props.onSaveB,
              title: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 B"
            }, React.createElement(MIcon, { name: "save", size: "sm" })),
            props.snapshotB && React.createElement("button", {
              className: "snap-btn snap-btn--primary",
              onClick: function() {
                props.onLoadB();
                close2();
              },
              title: "\u0421\u0440\u0430\u0432\u043D\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0435\u0435 \u0441 B"
            }, React.createElement(MIcon, { name: "compare_arrows", size: "sm" })),
            props.snapshotB && React.createElement("button", {
              className: "snap-btn snap-btn--danger",
              onClick: props.onClearB,
              title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A B"
            }, React.createElement(MIcon, { name: "close", size: "sm" }))
          )
        ),
        React.createElement(
          "div",
          { className: "menu__hint", style: { paddingLeft: 12, paddingRight: 12 } },
          "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \xAB\u0434\u043E\xBB, \u0441\u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 ",
          React.createElement(MIcon, { name: "compare_arrows", size: "sm" }),
          " \u2014 \u0443\u0432\u0438\u0434\u0438\u0442\u0435 \u0440\u0430\u0437\u043D\u0438\u0446\u0443 \u043D\u0430 \u0433\u0440\u0430\u0444\u0435."
        ),
        diffMode && React.createElement(
          "div",
          { className: "diff-legend" },
          React.createElement(
            "span",
            { className: "diff-legend__item" },
            React.createElement("span", { className: "diff-legend__dot", style: { background: DIFF_ADDED } }),
            "+" + diffMode.addedNodes.size + "n / +" + diffMode.addedEdges.size + "e"
          ),
          React.createElement(
            "span",
            { className: "diff-legend__item" },
            React.createElement("span", { className: "diff-legend__dot", style: { background: DIFF_REMOVED } }),
            "\u2212" + diffMode.removedNodes.size + "n / \u2212" + diffMode.removedEdges.size + "e"
          ),
          diffMode.snapshot && diffMode.snapshot.savedAt && React.createElement(
            "span",
            { className: "diff-legend__scope", title: "\u0421 \u0447\u0435\u043C \u0441\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0435\u043C" },
            "vs " + new Date(diffMode.snapshot.savedAt).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            })
          ),
          React.createElement("button", {
            className: "diff-legend__close",
            onClick: function() {
              setDiffMode(null);
            },
            title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C diff"
          }, React.createElement(MIcon, { name: "close", size: "sm" }))
        ),
        validationAvailable && React.createElement("div", { className: "menu__divider" }),
        validationAvailable && React.createElement("div", { className: "menu__label", style: { paddingLeft: 12, paddingTop: 6 } }, "\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F"),
        validationAvailable && React.createElement(
          "button",
          { className: "menu__item", onClick: function() {
            onOpenValidation();
            close2();
          } },
          React.createElement("span", { className: "menu__icon" }, "\u{1F50D}"),
          React.createElement("span", { className: "menu__text" }, "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432")
        )
      );
    }
    function ActiveModesBar(props) {
      var modes = props.modes;
      if (!modes || modes.length === 0)
        return null;
      return React.createElement(
        "div",
        { className: "active-modes" },
        modes.map(function(m, i) {
          return React.createElement(
            "div",
            {
              key: i,
              className: "active-mode active-mode--" + (m.color || "accent")
            },
            React.createElement("span", { className: "active-mode__icon" }, m.icon),
            React.createElement("span", { className: "active-mode__label" }, m.label),
            m.onClear && React.createElement("button", {
              className: "active-mode__close",
              onClick: m.onClear,
              title: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C"
            }, "\u2715")
          );
        })
      );
    }
    function SearchModal(props) {
      var open = props.open;
      var query = props.query;
      var setQuery = props.setQuery;
      var results = props.results || [];
      var commands = props.commands || [];
      var index = props.index;
      var setIndex = props.setIndex;
      var onSelect = props.onSelect;
      var onOpenFile = props.onOpenFile;
      var onClose = props.onClose;
      var inputRef = props.inputRef;
      var filteredCommands = useMemo(function() {
        var q = query.trim().toLowerCase();
        if (!q)
          return commands;
        return commands.filter(function(c) {
          var hay = ((c.label || "") + " " + (c.keywords || "") + " " + (c.section || "")).toLowerCase();
          return hay.indexOf(q) !== -1;
        });
      }, [query, commands]);
      var commandsBySection = useMemo(function() {
        var map = /* @__PURE__ */ new Map();
        filteredCommands.forEach(function(c) {
          var s = c.section || "\u041F\u0440\u043E\u0447\u0435\u0435";
          if (!map.has(s))
            map.set(s, []);
          map.get(s).push(c);
        });
        return Array.from(map.entries());
      }, [filteredCommands]);
      var totalItems = filteredCommands.length + results.length;
      var safeIndex = Math.min(index, Math.max(totalItems - 1, 0));
      var onKey = function(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0)));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setIndex(Math.max(safeIndex - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (totalItems === 0)
            return;
          if (safeIndex < filteredCommands.length) {
            var cmd = filteredCommands[safeIndex];
            onClose();
            setTimeout(function() {
              cmd.run && cmd.run();
            }, 50);
          } else {
            var domainItem = results[safeIndex - filteredCommands.length];
            if (domainItem && domainItem.node) {
              onSelect(domainItem.node.data.domainId);
            }
          }
        }
      };
      if (!open)
        return null;
      var cmdIdx = 0;
      var domainStartIdx = filteredCommands.length;
      return React.createElement(
        "div",
        {
          className: "search-overlay",
          onMouseDown: onClose
        },
        React.createElement(
          "div",
          {
            className: "search-modal search-modal--palette",
            onMouseDown: function(e) {
              e.stopPropagation();
            }
          },
          // Поле ввода
          React.createElement(
            "div",
            { className: "search-modal__input-wrap" },
            React.createElement(
              "span",
              { className: "search-modal__icon" },
              React.createElement(MIcon, { name: "search" })
            ),
            React.createElement("input", {
              ref: inputRef,
              className: "search-modal__input",
              type: "text",
              placeholder: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430, \u0434\u043E\u043C\u0435\u043D \u0438\u043B\u0438 FQID...",
              value: query,
              onChange: function(e) {
                setQuery(e.target.value);
              },
              onKeyDown: onKey,
              autoComplete: "off",
              spellCheck: false
            }),
            React.createElement("kbd", { className: "search-modal__kbd" }, "Esc")
          ),
          // Результаты
          React.createElement(
            "div",
            { className: "search-modal__results" },
            // Пустое состояние
            query.trim() === "" && filteredCommands.length === 0 && results.length === 0 && React.createElement(
              "div",
              { className: "search-modal__hint" },
              "\u041D\u0430\u0447\u043D\u0438\u0442\u0435 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0438\u043C\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B, \u0434\u043E\u043C\u0435\u043D \u0438\u043B\u0438 FQID"
            ),
            // Ничего не найдено
            query.trim() !== "" && filteredCommands.length === 0 && results.length === 0 && React.createElement(
              "div",
              { className: "search-modal__hint" },
              "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB" + query + "\xBB"
            ),
            // Секции команд
            filteredCommands.length > 0 && commandsBySection.map(function(entry) {
              var section = entry[0];
              var cmds = entry[1];
              return React.createElement(
                "div",
                {
                  key: "sec-" + section,
                  className: "palette-section"
                },
                React.createElement("div", { className: "palette-section__title" }, section),
                cmds.map(function(cmd) {
                  var itemIdx = cmdIdx++;
                  var isActive = itemIdx === safeIndex;
                  return React.createElement(
                    "div",
                    {
                      key: "cmd-" + itemIdx,
                      className: "palette-item palette-item--command" + (isActive ? " active" : ""),
                      onMouseEnter: function() {
                        setIndex(itemIdx);
                      },
                      onClick: function() {
                        onClose();
                        setTimeout(function() {
                          cmd.run && cmd.run();
                        }, 50);
                      }
                    },
                    React.createElement(
                      "span",
                      { className: "palette-item__icon" },
                      React.createElement(MIcon, { name: cmd.iconName || "chevron_right", size: "sm" })
                    ),
                    React.createElement("span", { className: "palette-item__label" }, cmd.label),
                    cmd.hotkey && React.createElement("kbd", { className: "palette-item__hotkey" }, cmd.hotkey)
                  );
                })
              );
            }),
            // Секция доменов
            results.length > 0 && React.createElement(
              "div",
              { className: "palette-section" },
              React.createElement(
                "div",
                { className: "palette-section__title" },
                "\u0414\u043E\u043C\u0435\u043D\u044B (" + results.length + ")"
              ),
              results.map(function(item, i) {
                var itemIdx = domainStartIdx + i;
                var isActive = itemIdx === safeIndex;
                var n = item.node;
                var matched = new Set(item.matches.map(function(m) {
                  return m.field;
                }));
                return React.createElement(
                  "div",
                  {
                    key: "dom-" + i,
                    className: "palette-item" + (isActive ? " active" : ""),
                    onMouseEnter: function() {
                      setIndex(itemIdx);
                    },
                    onClick: function() {
                      onSelect(n.data.domainId);
                    }
                  },
                  React.createElement(
                    "span",
                    { className: "palette-item__icon" },
                    React.createElement("span", {
                      className: "search-result__dot search-result__dot--" + n.data.nodeType
                    })
                  ),
                  React.createElement(
                    "div",
                    { className: "palette-item__content" },
                    // ID домена
                    React.createElement(
                      "div",
                      { className: "search-result__id" },
                      React.createElement(HighlightedText, { text: n.data.domainId, query }),
                      matched.has("id") && React.createElement("span", { className: "search-result__badge" }, "id")
                    ),
                    // Название
                    n.data.name && n.data.name !== n.data.domainId && React.createElement(
                      "div",
                      { className: "search-result__label" },
                      React.createElement(HighlightedText, { text: n.data.name, query }),
                      matched.has("name") && React.createElement("span", { className: "search-result__badge" }, "name")
                    ),
                    // Описание
                    n.data.description && React.createElement(
                      "div",
                      { className: "search-result__desc" },
                      React.createElement(HighlightedText, { text: n.data.description, query }),
                      matched.has("description") && React.createElement("span", { className: "search-result__badge" }, "description")
                    ),
                    // Теги
                    Array.isArray(n.data.tags) && n.data.tags.length > 0 && React.createElement(
                      "div",
                      { className: "search-result__tags" },
                      n.data.tags.slice(0, 5).map(function(tag, ti) {
                        return React.createElement("span", {
                          key: ti,
                          className: "search-result__tag"
                        }, React.createElement(HighlightedText, { text: tag, query }));
                      }),
                      matched.has("tags") && React.createElement("span", { className: "search-result__badge" }, "tags")
                    ),
                    // FQID-ссылки
                    function() {
                      var fqidMatch = item.matches.find(function(m) {
                        return m.field === "fqid";
                      });
                      if (!fqidMatch || !fqidMatch.value || fqidMatch.value.length === 0)
                        return null;
                      return React.createElement(
                        "div",
                        { className: "search-result__fqid-block" },
                        React.createElement(
                          "div",
                          { className: "search-result__fqid-head" },
                          React.createElement(MIcon, { name: "link", size: "sm" }),
                          React.createElement("span", null, "FQID-\u0441\u0441\u044B\u043B\u043A\u0438 (" + fqidMatch.value.length + ")"),
                          React.createElement("span", { className: "search-result__badge" }, "fqid")
                        ),
                        fqidMatch.value.slice(0, 3).map(function(f, fi) {
                          return React.createElement(
                            "div",
                            {
                              key: fi,
                              className: "search-result__fqid-item",
                              onClick: function(e) {
                                e.stopPropagation();
                                if (onOpenFile && f.filePath) {
                                  onOpenFile(f.filePath, f.fullFQID);
                                  onClose();
                                } else {
                                  onSelect(n.data.domainId);
                                }
                              },
                              title: onOpenFile ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B \u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0435 \u0441 FQID" : "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0434\u043E\u043C\u0435\u043D\u0443"
                            },
                            React.createElement(HighlightedText, { text: f.fullFQID, query }),
                            f.propertyPath && React.createElement("span", { className: "search-result__fqid-path" }, f.propertyPath)
                          );
                        }),
                        fqidMatch.value.length > 3 && React.createElement("div", {
                          className: "search-result__fqid-more"
                        }, "...\u0438 \u0435\u0449\u0451 " + (fqidMatch.value.length - 3))
                      );
                    }()
                  )
                );
              })
            )
          ),
          // Футер с подсказками по навигации
          React.createElement(
            "div",
            { className: "search-modal__footer" },
            React.createElement(
              "span",
              null,
              React.createElement("kbd", null, "\u2191"),
              React.createElement("kbd", null, "\u2193"),
              " \u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F"
            ),
            React.createElement(
              "span",
              null,
              React.createElement("kbd", null, "Enter"),
              " \u0432\u044B\u0431\u0440\u0430\u0442\u044C"
            ),
            React.createElement(
              "span",
              null,
              React.createElement("kbd", null, "Esc"),
              " \u0437\u0430\u043A\u0440\u044B\u0442\u044C"
            )
          )
        )
      );
    }
    function Toast(props) {
      var message = props.message;
      var actions = props.actions || [];
      var onClose = props.onClose;
      var duration = props.duration || 2e4;
      var [visible, setVisible] = useState(true);
      var [copied, setCopied] = useState(false);
      useEffect(function() {
        if (!duration)
          return;
        var t = setTimeout(function() {
          setVisible(false);
          if (onClose)
            onClose();
        }, duration);
        return function() {
          clearTimeout(t);
        };
      }, []);
      if (!visible)
        return null;
      var copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(function() {
          setCopied(true);
          setTimeout(function() {
            setCopied(false);
          }, 1500);
        });
      };
      return React.createElement(
        "div",
        { className: "toast" },
        React.createElement(
          "div",
          { className: "toast__body" },
          React.createElement("div", { className: "toast__message", dangerouslySetInnerHTML: { __html: message } }),
          actions.map(function(a, i) {
            return React.createElement(
              "div",
              { key: i, className: "toast__action" },
              a.command && React.createElement("code", { className: "toast__command" }, a.command),
              a.command && React.createElement("button", {
                className: "toast__btn",
                onClick: function() {
                  copyToClipboard(a.command);
                }
              }, copied ? "\u2713 \u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E" : "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C")
            );
          })
        ),
        React.createElement("button", { className: "toast__close", onClick: function() {
          setVisible(false);
          if (onClose)
            onClose();
        } }, "\u2715")
      );
    }
    function HoverTooltip(props) {
      var tooltip = props.tooltip;
      var onHide = props.onHide;
      if (!tooltip)
        return null;
      var style = { left: tooltip.x, top: tooltip.y };
      return React.createElement(
        "div",
        {
          className: "tooltip",
          style,
          onMouseEnter: function() {
            window.__tooltipHovered = true;
          },
          onMouseLeave: function() {
            window.__tooltipHovered = false;
            if (onHide)
              onHide();
          },
          onMouseDown: function(e) {
            e.stopPropagation();
          },
          onClick: function(e) {
            e.stopPropagation();
          }
        },
        React.createElement("div", { dangerouslySetInnerHTML: { __html: tooltip.html } })
      );
    }
    var ReactFlowInner = React.memo(function(props) {
      var rf = useReactFlow();
      useEffect(function() {
        props.setRfInstance(rf);
      }, [rf]);
      var zoomClass = useStore(function(s) {
        return s.transform[2] < 0.5 ? "hide" : "show";
      }, function(prev, next) {
        return prev.nodes === next.nodes && prev.edges === next.edges && prev.readOnly === next.readOnly && prev.perfMode === next.perfMode && prev.showGroups === next.showGroups && prev.interactive === next.interactive && prev.setRfInstance === next.setRfInstance && prev.onNodeClick === next.onNodeClick && prev.onNodeDoubleClick === next.onNodeDoubleClick && prev.onNodeContextMenu === next.onNodeContextMenu && prev.onNodeMouseEnter === next.onNodeMouseEnter && prev.onNodeMouseLeave === next.onNodeMouseLeave && prev.onEdgeClick === next.onEdgeClick && prev.onEdgeMouseEnter === next.onEdgeMouseEnter && prev.onEdgeMouseLeave === next.onEdgeMouseLeave && prev.onPaneClick === next.onPaneClick && prev.onPaneContextMenu === next.onPaneContextMenu;
      });
      useEffect(function() {
        var el = document.querySelector(".graph-container");
        if (!el)
          return;
        el.classList.toggle("hide-labels", zoomClass === "hide");
      }, [zoomClass]);
      useEffect(function() {
        var el = document.querySelector(".graph-container");
        if (!el)
          return;
        el.classList.toggle("perf-mode", !!props.perfMode);
      }, [props.perfMode]);
      var defaultEdgeOptions = useMemo(function() {
        return {
          type: props.perfMode ? "default" : "smoothstep",
          animated: false
        };
      }, [props.perfMode]);
      return React.createElement(
        ReactFlow,
        {
          nodes: props.nodes,
          edges: props.edges,
          onNodesChange: props.readOnly ? function() {
          } : props.onNodesChange,
          onEdgesChange: props.readOnly ? function() {
          } : props.onEdgesChange,
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
          nodesDraggable: !props.readOnly,
          nodesConnectable: false,
          elementsSelectable: true,
          onlyRenderVisibleElements: false,
          defaultEdgeOptions
        },
        React.createElement(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1, color: "var(--graph-dots)" }),
        React.createElement(Controls, { position: "bottom-left" }),
        React.createElement(MiniMap, { position: "bottom-right", nodeColor: function(n) {
          var t = n.data && n.data.nodeType;
          if (t === "missing")
            return "#f59e0b";
          if (t === "broken")
            return "#ef4444";
          return "#10b981";
        }, maskColor: "rgba(10,14,26,0.7)", style: { width: 180, height: 130 } }),
        props.showGroups && React.createElement(
          Panel,
          {
            position: "top-left",
            style: { pointerEvents: "none", width: "100%", height: "100%", position: "absolute", top: 0, left: 0, margin: 0 }
          },
          React.createElement(GroupsOverlay, { nodes: props.nodes, enabled: true })
        )
      );
    });
    function evaluateRules(edges, nodes, rules) {
      if (!Array.isArray(edges) || !Array.isArray(nodes) || !Array.isArray(rules)) {
        return [];
      }
      var violations = [];
      var nodeById = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        nodeById.set(n.id, n);
      });
      edges.forEach(function(e) {
        var src = nodeById.get(e.source);
        var tgt = nodeById.get(e.target);
        if (!src || !tgt)
          return;
        var fromId = (src.data.domainId || "").toLowerCase();
        var toId = (tgt.data.domainId || "").toLowerCase();
        rules.forEach(function(rule) {
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
    function RulesModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var rules = props.rules || [];
      var setRules = props.setRules;
      var violations = props.violations || [];
      var rulesHighlighted = props.rulesHighlighted;
      var setRulesHighlighted = props.setRulesHighlighted;
      var showViolationsOnly = props.showViolationsOnly;
      var setShowViolationsOnly = props.setShowViolationsOnly;
      var onGotoDomain = props.onGotoDomain;
      var [draft, setDraft] = useState({
        from: "",
        to: "",
        action: "warn",
        message: ""
      });
      useEffect(function() {
        if (!open) {
          setDraft({ from: "", to: "", action: "warn", message: "" });
        }
      }, [open]);
      useEffect(function() {
        if (!open)
          return;
        var onKey = function(e) {
          if (e.key === "Escape")
            onClose();
        };
        document.addEventListener("keydown", onKey, true);
        return function() {
          document.removeEventListener("keydown", onKey, true);
        };
      }, [open, onClose]);
      if (!open)
        return null;
      var addRule = function() {
        if (!draft.from.trim() || !draft.to.trim())
          return;
        var newRule = {
          id: "r" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          from: draft.from.trim(),
          to: draft.to.trim(),
          action: draft.action,
          message: draft.message.trim()
        };
        setRules(function(prev) {
          var arr = Array.isArray(prev) ? prev : [];
          return arr.concat([newRule]);
        });
        setDraft({ from: "", to: "", action: "warn", message: "" });
      };
      var removeRule = function(id) {
        setRules(function(prev) {
          return (Array.isArray(prev) ? prev : []).filter(function(r) {
            return r.id !== id;
          });
        });
      };
      var toggleAction = function(id) {
        setRules(function(prev) {
          return (Array.isArray(prev) ? prev : []).map(function(r) {
            if (r.id !== id)
              return r;
            return Object.assign({}, r, {
              action: r.action === "forbid" ? "warn" : "forbid"
            });
          });
        });
      };
      var clearAllRules = function() {
        if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430?"))
          return;
        setRules([]);
      };
      var onFormKeyDown = function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          addRule();
        }
      };
      return React.createElement(
        "div",
        {
          className: "help-overlay",
          onMouseDown: onClose
        },
        React.createElement(
          "div",
          {
            className: "help-modal rules-modal",
            onMouseDown: function(e) {
              e.stopPropagation();
            }
          },
          // Header
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement(
              "div",
              { className: "help-modal__title" },
              React.createElement(MIcon, { name: "block" }),
              React.createElement("span", { style: { marginLeft: 8 } }, "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439"),
              violations.length > 0 && React.createElement("span", { className: "help-modal__badge" }, violations.length)
            ),
            React.createElement("button", {
              className: "help-modal__close",
              onClick: onClose,
              title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C (Esc)"
            }, React.createElement(MIcon, { name: "close" }))
          ),
          // Body
          React.createElement(
            "div",
            { className: "help-modal__body rules-modal__body" },
            // Форма добавления
            React.createElement(
              "div",
              { className: "rules-form" },
              React.createElement("div", { className: "rules-form__label" }, "\u041D\u043E\u0432\u043E\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043E"),
              React.createElement(
                "div",
                { className: "rules-form__row" },
                React.createElement("input", {
                  className: "rules-form__input",
                  type: "text",
                  placeholder: "from (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: ui.*)",
                  value: draft.from,
                  onChange: function(e) {
                    setDraft(Object.assign({}, draft, { from: e.target.value }));
                  },
                  onKeyDown: onFormKeyDown
                }),
                React.createElement(
                  "span",
                  { className: "rules-form__arrow" },
                  React.createElement(MIcon, { name: "arrow_forward", size: "sm" })
                ),
                React.createElement("input", {
                  className: "rules-form__input",
                  type: "text",
                  placeholder: "to (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: db.*)",
                  value: draft.to,
                  onChange: function(e) {
                    setDraft(Object.assign({}, draft, { to: e.target.value }));
                  },
                  onKeyDown: onFormKeyDown
                })
              ),
              React.createElement(
                "div",
                { className: "rules-form__row" },
                React.createElement(
                  "select",
                  {
                    className: "rules-form__select",
                    value: draft.action,
                    onChange: function(e) {
                      setDraft(Object.assign({}, draft, { action: e.target.value }));
                    }
                  },
                  React.createElement("option", { value: "warn" }, "\u26A0\uFE0F Warning"),
                  React.createElement("option", { value: "forbid" }, "\u26D4 Forbid")
                ),
                React.createElement("input", {
                  className: "rules-form__input",
                  type: "text",
                  placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
                  value: draft.message,
                  onChange: function(e) {
                    setDraft(Object.assign({}, draft, { message: e.target.value }));
                  },
                  onKeyDown: onFormKeyDown
                }),
                React.createElement("button", {
                  className: "btn btn--primary",
                  onClick: addRule,
                  disabled: !draft.from.trim() || !draft.to.trim()
                }, React.createElement(MIcon, { name: "add", size: "sm" }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C")
              ),
              React.createElement(
                "div",
                { className: "rules-form__hint" },
                "\u041C\u0430\u0441\u043A\u0438: ",
                React.createElement("code", null, "sgrc.evo.*"),
                ", ",
                React.createElement("code", null, "ui.*"),
                ", ",
                React.createElement("code", null, "!test.*"),
                ". \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F ",
                React.createElement("b", null, "*"),
                " (\u043B\u044E\u0431\u043E\u0439 \u0441\u0438\u043C\u0432\u043E\u043B) \u0438 ",
                React.createElement("b", null, "!"),
                " (\u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435)."
              )
            ),
            // Список правил
            React.createElement(
              "div",
              { className: "rules-list" },
              React.createElement(
                "div",
                { className: "rules-list__header" },
                React.createElement(
                  "span",
                  { className: "rules-form__label" },
                  "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 (" + rules.length + ")"
                ),
                rules.length > 0 && React.createElement("button", {
                  className: "rules-list__clear",
                  onClick: clearAllRules
                }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435")
              ),
              rules.length === 0 ? React.createElement("div", { className: "rules-list__empty" }, "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B") : rules.map(function(rule) {
                return React.createElement(
                  "div",
                  {
                    key: rule.id,
                    className: "rules-item rules-item--" + (rule.action || "warn")
                  },
                  React.createElement(
                    "button",
                    {
                      className: "rules-item__action rules-item__action--" + (rule.action || "warn"),
                      onClick: function() {
                        toggleAction(rule.id);
                      },
                      title: rule.action === "forbid" ? "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u0434\u0435\u043B\u0430\u0442\u044C Warning" : "\u041D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0441\u0434\u0435\u043B\u0430\u0442\u044C Forbid"
                    },
                    React.createElement(MIcon, {
                      name: rule.action === "forbid" ? "block" : "warning",
                      size: "sm"
                    })
                  ),
                  React.createElement(
                    "div",
                    { className: "rules-item__body" },
                    React.createElement(
                      "div",
                      { className: "rules-item__pattern" },
                      React.createElement("code", null, rule.from),
                      React.createElement("span", { className: "rules-item__arrow" }, " \u2192 "),
                      React.createElement("code", null, rule.to)
                    ),
                    rule.message && React.createElement("div", { className: "rules-item__message" }, rule.message)
                  ),
                  React.createElement("button", {
                    className: "rules-item__remove",
                    onClick: function() {
                      removeRule(rule.id);
                    },
                    title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C"
                  }, React.createElement(MIcon, { name: "close", size: "sm" }))
                );
              })
            ),
            // Переключатели
            React.createElement(
              "div",
              { className: "rules-toggles" },
              React.createElement(
                "label",
                { className: "rules-toggle" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: rulesHighlighted,
                  onChange: function() {
                    setRulesHighlighted(!rulesHighlighted);
                  }
                }),
                React.createElement("span", { className: "rules-toggle__check" }),
                React.createElement("span", null, "\u041F\u043E\u0434\u0441\u0432\u0435\u0447\u0438\u0432\u0430\u0442\u044C \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u043D\u0430 \u0433\u0440\u0430\u0444\u0435")
              ),
              React.createElement(
                "label",
                { className: "rules-toggle" },
                React.createElement("input", {
                  type: "checkbox",
                  checked: showViolationsOnly,
                  onChange: function() {
                    setShowViolationsOnly(!showViolationsOnly);
                  }
                }),
                React.createElement("span", { className: "rules-toggle__check" }),
                React.createElement("span", null, "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F")
              )
            ),
            // Список нарушений
            violations.length > 0 && React.createElement(
              "div",
              { className: "rules-violations" },
              React.createElement(
                "div",
                { className: "rules-form__label" },
                "\u041D\u0430\u0439\u0434\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F (" + violations.length + ")"
              ),
              React.createElement(
                "div",
                { className: "rules-violations__list" },
                violations.slice(0, 50).map(function(v, idx) {
                  return React.createElement(
                    "div",
                    {
                      key: idx,
                      className: "rules-violation rules-violation--" + (v.severity || "warn")
                    },
                    React.createElement(MIcon, {
                      name: v.severity === "forbid" ? "block" : "warning",
                      size: "sm"
                    }),
                    React.createElement("span", { className: "rules-violation__from", onClick: function() {
                      if (onGotoDomain) {
                        onGotoDomain(v.fromId);
                        onClose();
                      }
                    } }, v.fromId),
                    React.createElement("span", { className: "rules-violation__arrow" }, " \u2192 "),
                    React.createElement("span", { className: "rules-violation__to", onClick: function() {
                      if (onGotoDomain) {
                        onGotoDomain(v.toId);
                        onClose();
                      }
                    } }, v.toId),
                    v.rule && v.rule.message && React.createElement("span", { className: "rules-violation__message" }, v.rule.message)
                  );
                }),
                violations.length > 50 && React.createElement(
                  "div",
                  { className: "rules-violations__more" },
                  "...\u0438 \u0435\u0449\u0451 " + (violations.length - 50)
                )
              )
            )
          ),
          // Footer
          React.createElement(
            "div",
            { className: "rules-modal__footer" },
            React.createElement(
              "div",
              { className: "rules-modal__stats" },
              "\u041F\u0440\u0430\u0432\u0438\u043B: " + rules.length,
              violations.length > 0 && React.createElement("span", { className: "rules-modal__stats--err" }, " \xB7 \u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u0439: " + violations.length)
            ),
            React.createElement("button", { className: "btn", onClick: onClose }, "\u0417\u0430\u043A\u0440\u044B\u0442\u044C")
          )
        )
      );
    }
    function LearningPathModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var allNodes = props.allNodes;
      var allEdges = props.allEdges;
      var visibleDomains = props.visibleDomains;
      var bookmarkedDomains = props.bookmarkedDomains;
      var onGotoDomain = props.onGotoDomain;
      var onStartTour = props.onStartTour;
      var [scope, setScope] = useState("all");
      var [path, setPath] = useState(null);
      var [expandedStages, setExpandedStages] = useState(function() {
        return /* @__PURE__ */ new Set([0]);
      });
      useEffect(function() {
        if (!open) {
          setPath(null);
          setExpandedStages(/* @__PURE__ */ new Set([0]));
        }
      }, [open]);
      var build = useCallback(function() {
        var restrictTo = null;
        if (scope === "visible") {
          restrictTo = /* @__PURE__ */ new Set();
          visibleDomains.forEach(function(d) {
            restrictTo.add(d.id);
          });
        } else if (scope === "bookmarked") {
          restrictTo = /* @__PURE__ */ new Set();
          bookmarkedDomains.forEach(function(d) {
            restrictTo.add(d.id);
          });
        }
        var nodes = allNodes;
        var edges = allEdges;
        if (restrictTo) {
          nodes = allNodes.filter(function(n) {
            return restrictTo.has(n.id) || n.data.nodeType !== "domain";
          });
          edges = allEdges.filter(function(e) {
            return restrictTo.has(e.source) && restrictTo.has(e.target);
          });
        }
        var result = computeLearningPath(nodes, edges);
        setPath(result);
      }, [scope, allNodes, allEdges, visibleDomains, bookmarkedDomains]);
      var exportMD = useCallback(function() {
        if (!path)
          return;
        var md = generateLearningPathMarkdown(path, {
          scope: scope === "all" ? "\u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : scope === "visible" ? "\u0432\u0438\u0434\u0438\u043C\u044B\u0435" : "\u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435"
        });
        downloadFile(md, "learning-path-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md", "text/markdown;charset=utf-8");
      }, [path, scope]);
      var exportJSON = useCallback(function() {
        if (!path)
          return;
        downloadFile(JSON.stringify(path, null, 2), "learning-path-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json", "application/json");
      }, [path]);
      var copyAsText = useCallback(function() {
        if (!path)
          return;
        var lines = [];
        lines.push("\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F (" + path.totalStages + " \u044D\u0442\u0430\u043F\u043E\u0432):");
        path.stages.forEach(function(stage) {
          lines.push("");
          lines.push("\u2014 \u042D\u0442\u0430\u043F " + (stage.index + 1) + " \u2014");
          stage.domains.forEach(function(d) {
            lines.push("  " + d.domainId);
          });
        });
        navigator.clipboard.writeText(lines.join("\n"));
      }, [path]);
      var toggleStage = useCallback(function(idx) {
        setExpandedStages(function(prev) {
          var s = new Set(prev);
          if (s.has(idx))
            s.delete(idx);
          else
            s.add(idx);
          return s;
        });
      }, []);
      if (!open)
        return null;
      return React.createElement(
        "div",
        { className: "help-overlay", onMouseDown: onClose },
        React.createElement(
          "div",
          { className: "help-modal learning-path-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u{1F4D6} \u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B"),
            React.createElement("button", { className: "help-modal__close", onClick: onClose }, "\u2715")
          ),
          React.createElement(
            "div",
            { className: "validation-modal__body" },
            !path && React.createElement(
              "div",
              { className: "validation-scope" },
              React.createElement("div", { className: "validation-scope__label" }, "\u041E\u0431\u043B\u0430\u0441\u0442\u044C"),
              scopeOption("all", "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B", allNodes.filter(function(n) {
                return n.data.nodeType === "domain";
              }).length, scope, setScope),
              scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435", visibleDomains.length, scope, setScope),
              scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", bookmarkedDomains.length, scope, setScope),
              React.createElement(
                "div",
                { className: "learning-path-hint", style: { marginTop: 20 } },
                React.createElement("div", { className: "learning-path-hint__title" }, "\u0427\u0442\u043E \u044D\u0442\u043E \u0434\u0430\u0451\u0442"),
                React.createElement(
                  "ul",
                  { className: "learning-path-hint__list" },
                  React.createElement("li", null, "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0447\u0442\u0435\u043D\u0438\u044F \u2014 \u043E\u0442 \xAB\u0444\u0443\u043D\u0434\u0430\u043C\u0435\u043D\u0442\u0430\xBB \u043A \u0432\u0435\u0440\u0445\u043D\u0438\u043C \u0441\u043B\u043E\u044F\u043C, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438 \u0431\u044B\u043B\u0438 \u043F\u043E\u043D\u044F\u0442\u043D\u044B \u0441 \u0441\u0430\u043C\u043E\u0433\u043E \u043D\u0430\u0447\u0430\u043B\u0430."),
                  React.createElement("li", null, "\u0422\u043E\u0447\u043A\u0438 \u0432\u0445\u043E\u0434\u0430 \u2014 \u0434\u043E\u043C\u0435\u043D\u044B, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442: \u043E\u043D\u0438 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0432\u0435\u0440\u0445\u043D\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F."),
                  React.createElement("li", null, "\u041A\u0430\u043C\u0435\u0440\u0430 \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u0438 \u0432\u0435\u0434\u0451\u0442 \u043F\u043E \u044D\u0442\u0430\u043F\u0430\u043C, \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u043C\u0443 \u0434\u043E\u043C\u0435\u043D\u0443.")
                )
              ),
              React.createElement("button", {
                className: "btn btn--primary",
                onClick: build,
                style: { marginTop: 20, width: "100%", justifyContent: "center" }
              }, "\u25B6 \u041F\u043E\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F")
            ),
            path && React.createElement(
              "div",
              { className: "topo-result" },
              path.entryPoints.length > 0 && React.createElement(
                "div",
                { className: "learning-entry-points" },
                React.createElement(
                  "div",
                  { className: "learning-entry-points__header" },
                  React.createElement("span", { className: "learning-entry-points__icon" }, "\u{1F6AA}"),
                  React.createElement("span", null, "\u0422\u043E\u0447\u043A\u0438 \u0432\u0445\u043E\u0434\u0430 (" + path.entryPoints.length + ")"),
                  React.createElement("span", { className: "learning-entry-points__hint" }, "\u2014 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0437\u0430\u0432\u0438\u0441\u0438\u0442 \u043E\u0442 \u043D\u0438\u0445, \u043D\u043E \u043E\u043D\u0438 \u0437\u0430\u0432\u0438\u0441\u044F\u0442 \u043E\u0442 \u0434\u0440\u0443\u0433\u0438\u0445")
                ),
                React.createElement(
                  "div",
                  { className: "learning-entry-points__body" },
                  path.entryPoints.slice(0, 12).map(function(d) {
                    return React.createElement("a", {
                      key: d.id,
                      className: "validation-log__domain",
                      onClick: function() {
                        onGotoDomain(d.domainId);
                        onClose();
                      }
                    }, d.domainId);
                  }),
                  path.entryPoints.length > 12 && React.createElement(
                    "span",
                    { style: { fontSize: 11, color: "var(--text-500)" } },
                    "...\u0438 \u0435\u0449\u0451 " + (path.entryPoints.length - 12)
                  )
                )
              ),
              path.stages.map(function(stage) {
                var isOpen = expandedStages.has(stage.index);
                return React.createElement(
                  "div",
                  { key: stage.index, className: "topo-level" + (isOpen ? " topo-level--open" : "") },
                  React.createElement(
                    "div",
                    { className: "topo-level__header", onClick: function() {
                      toggleStage(stage.index);
                    } },
                    React.createElement("span", { className: "validation-log__chevron" }, isOpen ? "\u25BE" : "\u25B8"),
                    React.createElement("span", { className: "topo-level__badge learning-path-stage-badge" }, stage.index + 1),
                    React.createElement("span", { className: "topo-level__title" }, "\u042D\u0442\u0430\u043F " + (stage.index + 1)),
                    React.createElement(
                      "span",
                      { className: "topo-level__count" },
                      stage.domains.length + " " + plural(stage.domains.length, "\u0434\u043E\u043C\u0435\u043D", "\u0434\u043E\u043C\u0435\u043D\u043E\u0432")
                    )
                  ),
                  isOpen && React.createElement(
                    "div",
                    { className: "topo-level__body learning-stage-body" },
                    stage.domains.map(function(d) {
                      return React.createElement(
                        "div",
                        { key: d.id, className: "learning-domain-card" },
                        React.createElement(
                          "div",
                          { className: "learning-domain-card__head" },
                          React.createElement("a", {
                            className: "validation-log__domain",
                            onClick: function() {
                              onGotoDomain(d.domainId);
                              onClose();
                            }
                          }, d.domainId),
                          d.label && d.label !== d.domainId && React.createElement("span", { className: "learning-domain-card__label" }, d.label)
                        ),
                        d.description && React.createElement("div", { className: "learning-domain-card__desc" }, d.description),
                        React.createElement(
                          "div",
                          { className: "learning-domain-card__stats" },
                          d.fanIn > 0 && React.createElement(
                            "span",
                            { className: "learning-domain-stat" },
                            React.createElement("span", { className: "learning-domain-stat__icon" }, "\u2191"),
                            d.fanIn,
                            " \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
                          ),
                          d.fanOut > 0 && React.createElement(
                            "span",
                            { className: "learning-domain-stat" },
                            React.createElement("span", { className: "learning-domain-stat__icon" }, "\u2193"),
                            d.fanOut,
                            " \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0445"
                          ),
                          d.entitiesCount != null && React.createElement(
                            "span",
                            { className: "learning-domain-stat" },
                            d.entitiesCount + " entities"
                          ),
                          d.tags && d.tags.length > 0 && React.createElement(
                            "span",
                            { className: "learning-domain-stat learning-domain-stat--tags" },
                            d.tags.slice(0, 4).join(", ")
                          )
                        )
                      );
                    })
                  )
                );
              }),
              path.unresolved.length > 0 && React.createElement(
                "div",
                { className: "topo-cyclic" },
                React.createElement(
                  "div",
                  { className: "topo-cyclic__header" },
                  React.createElement("span", { className: "topo-cyclic__icon" }, "\u26A0\uFE0F"),
                  React.createElement("span", null, "\u0412 \u0446\u0438\u043A\u043B\u0435 \u2014 \u0447\u0438\u0442\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435 \u0432\u0441\u0435\u0445 (" + path.unresolved.length + ")")
                ),
                React.createElement(
                  "div",
                  { className: "topo-cyclic__body" },
                  path.unresolved.map(function(d) {
                    return React.createElement("a", {
                      key: d.id,
                      className: "validation-log__domain",
                      onClick: function() {
                        onGotoDomain(d.domainId);
                        onClose();
                      }
                    }, d.domainId);
                  })
                )
              )
            )
          ),
          path && React.createElement(
            "div",
            { className: "validation-footer" },
            React.createElement(
              "div",
              { className: "validation-stats" },
              React.createElement("span", { className: "validation-stat" }, "\u{1F4D6} " + path.totalDomains + " \u0434\u043E\u043C\u0435\u043D\u043E\u0432"),
              React.createElement("span", { className: "validation-stat validation-stat--ok" }, "\u{1F4CA} " + path.totalStages + " \u044D\u0442\u0430\u043F\u043E\u0432"),
              path.entryPoints.length > 0 && React.createElement("span", { className: "validation-stat" }, "\u{1F6AA} " + path.entryPoints.length + " \u0432\u0445\u043E\u0434\u043E\u0432")
            ),
            React.createElement(
              "div",
              { className: "validation-footer__actions" },
              React.createElement("button", { className: "btn btn--primary", onClick: function() {
                onClose();
                setTimeout(function() {
                  onStartTour(path);
                }, 50);
              } }, "\u25B6 \u041D\u0430\u0447\u0430\u0442\u044C \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u044E"),
              React.createElement("button", { className: "btn", onClick: copyAsText }, "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C"),
              React.createElement("button", { className: "btn", onClick: exportJSON }, "\u{1F4BE} JSON"),
              React.createElement("button", { className: "btn", onClick: exportMD }, "\u{1F4DD} MD"),
              React.createElement("button", { className: "btn", onClick: function() {
                setPath(null);
              } }, "\u2190 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438")
            )
          )
        )
      );
    }
    function TourOverlay(props) {
      var tour = props.tour;
      var onPrev = props.onPrev;
      var onNext = props.onNext;
      var onTogglePlay = props.onTogglePlay;
      var onStop = props.onStop;
      if (!tour)
        return null;
      var allItems = useMemo(function() {
        var items = [];
        tour.stages.forEach(function(stage) {
          stage.domains.forEach(function(d2) {
            items.push({
              domainId: d2.domainId,
              nodeId: d2.id,
              stageIndex: stage.index,
              stageNumber: stage.index + 1,
              domainData: d2
            });
          });
        });
        return items;
      }, [tour]);
      var current = allItems[tour.index];
      if (!current)
        return null;
      var d = current.domainData;
      var pct = Math.round((tour.index + 1) / allItems.length * 100);
      return React.createElement(
        "div",
        { className: "tour-overlay" },
        React.createElement(
          "div",
          { className: "tour-overlay__card" },
          React.createElement(
            "div",
            { className: "tour-overlay__header" },
            React.createElement("span", { className: "tour-overlay__stage-badge" }, "\u042D\u0442\u0430\u043F " + current.stageNumber),
            React.createElement("span", { className: "tour-overlay__counter" }, tour.index + 1 + " / " + allItems.length),
            React.createElement("button", { className: "tour-overlay__close", onClick: onStop, title: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C" }, "\u2715")
          ),
          React.createElement("div", { className: "tour-overlay__title" }, current.domainId),
          d.label && d.label !== current.domainId && React.createElement("div", { className: "tour-overlay__subtitle" }, d.label),
          d.description && React.createElement("div", { className: "tour-overlay__desc" }, d.description),
          React.createElement(
            "div",
            { className: "tour-overlay__stats" },
            d.fanIn > 0 && React.createElement("span", { className: "tour-stat" }, "\u2191 " + d.fanIn + " \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0445"),
            d.fanOut > 0 && React.createElement("span", { className: "tour-stat" }, "\u2193 " + d.fanOut + " \u0438\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0445"),
            d.entitiesCount != null && React.createElement("span", { className: "tour-stat" }, d.entitiesCount + " entities")
          ),
          d.tags && d.tags.length > 0 && React.createElement(
            "div",
            { className: "tour-overlay__tags" },
            d.tags.slice(0, 6).map(function(t, i) {
              return React.createElement("span", { key: i, className: "tag", style: { fontSize: 10 } }, t);
            })
          ),
          React.createElement(
            "div",
            { className: "tour-overlay__progress" },
            React.createElement(
              "div",
              { className: "tour-overlay__progress-bar" },
              React.createElement("div", { className: "tour-overlay__progress-fill", style: { width: pct + "%" } })
            )
          ),
          React.createElement(
            "div",
            { className: "tour-overlay__controls" },
            React.createElement("button", {
              className: "tour-btn",
              onClick: onPrev,
              disabled: tour.index === 0,
              title: "\u041D\u0430\u0437\u0430\u0434"
            }, "\u25C0"),
            React.createElement("button", {
              className: "tour-btn tour-btn--primary",
              onClick: onTogglePlay,
              title: tour.playing ? "\u041F\u0430\u0443\u0437\u0430" : "\u0418\u0433\u0440\u0430\u0442\u044C"
            }, tour.playing ? "\u275A\u275A" : "\u25B6"),
            React.createElement("button", {
              className: "tour-btn",
              onClick: onNext,
              disabled: tour.index >= allItems.length - 1,
              title: "\u0414\u0430\u043B\u044C\u0448\u0435"
            }, "\u25B6")
          )
        )
      );
    }
    function TopoSortModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var allNodes = props.allNodes;
      var allEdges = props.allEdges;
      var allDomains = props.allDomains;
      var visibleDomains = props.visibleDomains;
      var bookmarkedDomains = props.bookmarkedDomains;
      var onGotoDomain = props.onGotoDomain;
      var onApplyLevels = props.onApplyLevels;
      var [scope, setScope] = useState("all");
      var [includeFqid, setIncludeFqid] = useState(true);
      var [includeLinkage, setIncludeLinkage] = useState(true);
      var [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
      var [excludePattern, setExcludePattern] = useState("");
      var [result, setResult] = useState(null);
      var [expandedLevels, setExpandedLevels] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var [expandedDeps, setExpandedDeps] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var [autoBreak, setAutoBreak] = useState(false);
      useEffect(function() {
        if (!open) {
          setResult(null);
          setExpandedLevels(/* @__PURE__ */ new Set());
          setExpandedDeps(/* @__PURE__ */ new Set());
        }
      }, [open]);
      var build = useCallback(function() {
        var nodeSet;
        if (scope === "visible")
          nodeSet = visibleDomains;
        else if (scope === "bookmarked")
          nodeSet = bookmarkedDomains;
        else
          nodeSet = allDomains;
        var restrictTo = /* @__PURE__ */ new Set();
        nodeSet.forEach(function(d) {
          restrictTo.add(d.domainId);
        });
        var excludedIds = /* @__PURE__ */ new Set();
        var tokens = excludePattern.replace(/[,;]/g, " ").split(" ").filter(function(t) {
          return t.length > 0;
        });
        if (tokens.length > 0) {
          allNodes.forEach(function(n) {
            if (n.data.nodeType !== "domain")
              return;
            for (var i = 0; i < tokens.length; i++) {
              if (simplePatternMatch(n.data.domainId.toLowerCase(), tokens[i].toLowerCase())) {
                excludedIds.add(n.data.domainId.toLowerCase());
                return;
              }
            }
          });
        }
        var depGraph = buildDependencyGraph(allNodes, allEdges, {
          includeFqid,
          includeLinkage,
          missingAsSatisfied,
          excludedIds,
          restrictTo
        });
        var sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });
        var levelMap = /* @__PURE__ */ new Map();
        sorted.levels.forEach(function(level, idx) {
          level.forEach(function(id) {
            levelMap.set(id, idx + 1);
          });
        });
        setResult({
          levels: sorted.levels,
          cyclic: sorted.cyclic,
          broken: sorted.broken || [],
          criticalPath: sorted.criticalPath,
          levelMap,
          stats: {
            total: depGraph.domainIds.size,
            levels: sorted.levels.length,
            cyclic: sorted.cyclic.length,
            criticalPath: sorted.criticalPath,
            excluded: excludedIds.size
          }
        });
      }, [autoBreak, scope, includeFqid, includeLinkage, missingAsSatisfied, excludePattern, allNodes, allEdges, allDomains, visibleDomains, bookmarkedDomains]);
      var exportJSON = useCallback(function() {
        if (!result)
          return;
        var data = {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          scope,
          options: { includeFqid, includeLinkage, missingAsSatisfied, excludePattern },
          criticalPath: result.criticalPath,
          stats: result.stats,
          levels: result.levels,
          cyclic: result.cyclic,
          broken: result.broken
        };
        downloadFile(JSON.stringify(data, null, 2), "topo-sort-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json", "application/json");
      }, [result, scope, includeFqid, includeLinkage, missingAsSatisfied, excludePattern]);
      var exportMD = useCallback(function() {
        if (!result)
          return;
        var lines = [];
        lines.push("# \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432");
        lines.push("");
        lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
        lines.push("");
        lines.push("\u0423\u0440\u043E\u0432\u043D\u0438 \u043C\u043E\u0436\u043D\u043E \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0442\u044C \u043F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u043E. \u0414\u043E\u043C\u0435\u043D\u044B \u0432\u043D\u0443\u0442\u0440\u0438 \u0443\u0440\u043E\u0432\u043D\u044F \u2014 \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E.");
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
        result.levels.forEach(function(level, idx) {
          lines.push("## \u0423\u0440\u043E\u0432\u0435\u043D\u044C " + (idx + 1) + " (" + level.length + ")");
          lines.push("");
          level.forEach(function(id) {
            lines.push("- `" + id + "`");
          });
          lines.push("");
        });
        if (result.broken && result.broken.length > 0) {
          lines.push("## \u{1F517} \u0420\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043D\u044B\u0435 \u0446\u0438\u043A\u043B\u044B (" + result.broken.length + ")");
          lines.push("");
          lines.push("\u042D\u0442\u0438 \u0434\u043E\u043C\u0435\u043D\u044B \u0431\u044B\u043B\u0438 \u0440\u0430\u0437\u043C\u0435\u0449\u0435\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438, \u043D\u043E \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438 \u0432\u043D\u0443\u0442\u0440\u0438 \u0446\u0438\u043A\u043B\u0430 \u043F\u0440\u0438\u0448\u043B\u043E\u0441\u044C \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u0442\u044C:");
          lines.push("");
          result.broken.forEach(function(b) {
            lines.push("- `" + b.id + "` (\u0443\u0440\u043E\u0432\u0435\u043D\u044C " + b.level + ")" + (b.brokenDeps.length > 0 ? " \u2014 \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043E \u0441\u0432\u044F\u0437\u0435\u0439: " + b.brokenDeps.length : ""));
            b.brokenDeps.forEach(function(d) {
              lines.push("  - `" + d + "`");
            });
          });
          lines.push("");
        }
        if (result.cyclic.length > 0) {
          lines.push("## \u26A0\uFE0F \u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u2014 \u0446\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435 (" + result.cyclic.length + ")");
          lines.push("");
          result.cyclic.forEach(function(id) {
            lines.push("- `" + id + "`");
          });
          lines.push("");
        }
        downloadFile(lines.join("\n"), "topo-sort-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md", "text/markdown;charset=utf-8");
      }, [result]);
      var copyAsText = useCallback(function() {
        if (!result)
          return;
        var lines = [];
        result.levels.forEach(function(level, idx) {
          lines.push("# \u0423\u0440\u043E\u0432\u0435\u043D\u044C " + (idx + 1));
          level.forEach(function(id) {
            lines.push(id);
          });
          lines.push("");
        });
        if (result.cyclic.length > 0) {
          lines.push("# \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0435 (\u0440\u0443\u0447\u043D\u043E\u0435 \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E)");
          result.cyclic.forEach(function(id) {
            lines.push(id);
          });
        }
        navigator.clipboard.writeText(lines.join("\n"));
      }, [result]);
      var toggleLevel = useCallback(function(idx) {
        setExpandedLevels(function(prev) {
          var s = new Set(prev);
          if (s.has(idx))
            s.delete(idx);
          else
            s.add(idx);
          return s;
        });
      }, []);
      var toggleDeps = useCallback(function(domainId) {
        setExpandedDeps(function(prev) {
          var s = new Set(prev);
          if (s.has(domainId))
            s.delete(domainId);
          else
            s.add(domainId);
          return s;
        });
      }, []);
      if (!open)
        return null;
      return React.createElement(
        "div",
        { className: "help-overlay", onMouseDown: onClose },
        React.createElement(
          "div",
          { className: "help-modal topo-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u{1F4E6} \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432"),
            React.createElement("button", { className: "help-modal__close", onClick: onClose }, "\u2715")
          ),
          React.createElement(
            "div",
            { className: "validation-modal__body" },
            !result && React.createElement(
              "div",
              { className: "validation-scope" },
              React.createElement("div", { className: "validation-scope__label" }, "\u041E\u0431\u043B\u0430\u0441\u0442\u044C"),
              scopeOption("all", "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B", allDomains.length, scope, setScope),
              scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435", visibleDomains.length, scope, setScope),
              scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", bookmarkedDomains.length, scope, setScope),
              React.createElement("div", { className: "validation-scope__label", style: { marginTop: 16 } }, "\u0423\u0447\u0438\u0442\u044B\u0432\u0430\u0442\u044C \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438"),
              React.createElement(
                "label",
                { className: "menu__checkbox" },
                React.createElement("input", { type: "checkbox", checked: includeFqid, onChange: function() {
                  setIncludeFqid(!includeFqid);
                } }),
                React.createElement("span", { className: "menu__check" }),
                React.createElement("span", { className: "menu__text" }, "FQID-\u0441\u0441\u044B\u043B\u043A\u0438")
              ),
              React.createElement(
                "label",
                { className: "menu__checkbox" },
                React.createElement("input", { type: "checkbox", checked: includeLinkage, onChange: function() {
                  setIncludeLinkage(!includeLinkage);
                } }),
                React.createElement("span", { className: "menu__check" }),
                React.createElement("span", { className: "menu__text" }, "Linkage-\u0441\u0432\u044F\u0437\u0438")
              ),
              React.createElement(
                "label",
                { className: "menu__checkbox" },
                React.createElement("input", { type: "checkbox", checked: missingAsSatisfied, onChange: function() {
                  setMissingAsSatisfied(!missingAsSatisfied);
                } }),
                React.createElement("span", { className: "menu__check" }),
                React.createElement("span", { className: "menu__text" }, "Missing-\u0434\u043E\u043C\u0435\u043D\u044B \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u043C\u0438")
              ),
              React.createElement(
                "label",
                { className: "menu__checkbox" },
                React.createElement("input", { type: "checkbox", checked: autoBreak, onChange: function() {
                  setAutoBreak(!autoBreak);
                } }),
                React.createElement("span", { className: "menu__check" }),
                React.createElement("span", { className: "menu__text" }, "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0440\u0430\u0437\u0440\u044B\u0432\u0430\u0442\u044C \u0446\u0438\u043A\u043B\u044B")
              ),
              React.createElement(
                "div",
                { className: "menu__hint" },
                autoBreak ? "\u0414\u043E\u043C\u0435\u043D\u044B \u0441 \u0446\u0438\u043A\u043B\u043E\u043C \u0431\u0443\u0434\u0443\u0442 \u0440\u0430\u0437\u043C\u0435\u0449\u0435\u043D\u044B \u0432 \u043F\u043E\u0440\u044F\u0434\u043A\u0435, \u0430 \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u0432\u044F\u0437\u0438 \u2014 \u043F\u043E\u043C\u0435\u0447\u0435\u043D\u044B." : "\u0414\u043E\u043C\u0435\u043D\u044B \u0441 \u0446\u0438\u043A\u043B\u043E\u043C \u043F\u043E\u043F\u0430\u0434\u0443\u0442 \u0432 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0431\u043B\u043E\u043A \xAB\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430\xBB."
              ),
              React.createElement("div", { className: "validation-scope__label", style: { marginTop: 16 } }, "\u0418\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043E\u043C\u0435\u043D\u044B \u043F\u043E \u043C\u0430\u0441\u043A\u0435"),
              React.createElement("input", {
                className: "menu__input",
                type: "text",
                placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: *.settings.* , custom.*",
                value: excludePattern,
                onChange: function(e) {
                  setExcludePattern(e.target.value);
                }
              }),
              React.createElement("div", { className: "menu__hint" }, "\u041C\u0430\u0441\u043A\u0438 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E \u0438\u043B\u0438 \u043F\u0440\u043E\u0431\u0435\u043B. \u0418\u0441\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u0443\u0436\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u043C\u0438."),
              React.createElement("button", {
                className: "btn btn--primary",
                onClick: build,
                style: { marginTop: 20, width: "100%", justifyContent: "center" }
              }, "\u25B6 \u041F\u043E\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u043E\u0440\u044F\u0434\u043E\u043A")
            ),
            result && React.createElement(
              "div",
              { className: "topo-result" },
              // Циклические блоки в начале
              (result.cyclic.length > 0 || result.broken.length > 0) && React.createElement(
                "div",
                { className: "topo-cyclic" },
                result.cyclic.length > 0 && React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    "div",
                    { className: "topo-cyclic__header" },
                    React.createElement("span", { className: "topo-cyclic__icon" }, "\u26A0\uFE0F"),
                    React.createElement("span", null, "\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0432\u043C\u0435\u0448\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430 \u2014 \u0446\u0438\u043A\u043B (" + result.cyclic.length + ")")
                  ),
                  React.createElement(
                    "div",
                    { className: "topo-cyclic__body" },
                    result.cyclic.map(function(id) {
                      return React.createElement("a", {
                        key: id,
                        className: "validation-log__domain",
                        onClick: function() {
                          onGotoDomain(id);
                          onClose();
                        }
                      }, id);
                    })
                  )
                ),
                result.cyclic.length === 0 && result.broken.length > 0 && React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    "div",
                    { className: "topo-cyclic__header topo-cyclic__header--broken" },
                    React.createElement("span", { className: "topo-cyclic__icon" }, "\u{1F517}"),
                    React.createElement("span", null, "\u0426\u0438\u043A\u043B\u044B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 (" + result.broken.length + ")")
                  ),
                  React.createElement(
                    "div",
                    { className: "topo-cyclic__body" },
                    result.broken.map(function(b) {
                      return React.createElement(
                        "div",
                        { key: b.id, className: "topo-broken-item" },
                        React.createElement("a", {
                          className: "validation-log__domain",
                          onClick: function() {
                            onGotoDomain(b.id);
                            onClose();
                          }
                        }, b.id),
                        React.createElement("span", { className: "topo-broken-item__meta" }, "L" + b.level),
                        b.brokenDeps.length > 0 && React.createElement("span", {
                          className: "topo-broken-item__deps",
                          title: "\u0420\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u044B \u0441\u0432\u044F\u0437\u0438 \u0441: " + b.brokenDeps.join(", ")
                        }, "\u21AF" + b.brokenDeps.length)
                      );
                    })
                  )
                )
              ),
              // Уровни
              result.levels.map(function(level, idx) {
                var isOpen = expandedLevels.has(idx);
                return React.createElement(
                  "div",
                  { key: idx, className: "topo-level" + (isOpen ? " topo-level--open" : "") },
                  React.createElement(
                    "div",
                    { className: "topo-level__header", onClick: function() {
                      toggleLevel(idx);
                    } },
                    React.createElement("span", { className: "validation-log__chevron" }, isOpen ? "\u25BE" : "\u25B8"),
                    React.createElement("span", { className: "topo-level__badge" }, idx + 1),
                    React.createElement("span", { className: "topo-level__title" }, "\u0423\u0440\u043E\u0432\u0435\u043D\u044C " + (idx + 1)),
                    React.createElement("span", { className: "topo-level__count" }, level.length + " \u0434\u043E\u043C\u0435\u043D" + (level.length === 1 ? "" : level.length < 5 ? "\u0430" : "\u043E\u0432"))
                  ),
                  isOpen && React.createElement(
                    "div",
                    { className: "topo-level__body" },
                    level.map(function(id) {
                      var isDepsOpen = expandedDeps.has(id);
                      var deps = result.levelMap ? findDeps(id, result, allEdges, allNodes) : [];
                      var brokenInfo = result.broken.find(function(b) {
                        return b.id === id;
                      });
                      return React.createElement(
                        "div",
                        { key: id, className: "topo-domain" + (brokenInfo ? " topo-domain--broken" : "") },
                        React.createElement(
                          "div",
                          { className: "topo-domain__head" },
                          deps.length > 0 && React.createElement("span", {
                            className: "validation-log__chevron",
                            style: { cursor: "pointer" },
                            onClick: function() {
                              toggleDeps(id);
                            }
                          }, isDepsOpen ? "\u25BE" : "\u25B8"),
                          !deps.length && React.createElement("span", { className: "validation-log__chevron" }, " "),
                          React.createElement("a", {
                            className: "validation-log__domain",
                            onClick: function() {
                              onGotoDomain(id);
                              onClose();
                            }
                          }, id),
                          brokenInfo && React.createElement("span", {
                            className: "topo-broken-badge",
                            title: "\u0426\u0438\u043A\u043B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u041E\u0442\u0440\u0435\u0437\u0430\u043D\u044B \u0441\u0432\u044F\u0437\u0438: " + brokenInfo.brokenDeps.join(", ")
                          }, "\u26A0\uFE0F \u0446\u0438\u043A\u043B \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D")
                        ),
                        isDepsOpen && React.createElement(
                          "div",
                          { className: "topo-domain__deps" },
                          deps.map(function(dep) {
                            var depLevel = result.levelMap.get(dep);
                            return React.createElement(
                              "div",
                              { key: dep, className: "topo-dep" },
                              React.createElement("span", { className: "topo-dep__level" }, "L" + depLevel),
                              React.createElement("a", {
                                className: "validation-log__domain",
                                onClick: function() {
                                  onGotoDomain(dep);
                                  onClose();
                                }
                              }, dep)
                            );
                          })
                        )
                      );
                    })
                  )
                );
              })
            )
          ),
          result && React.createElement(
            "div",
            { className: "validation-footer" },
            React.createElement(
              "div",
              { className: "validation-stats" },
              React.createElement("span", { className: "validation-stat" }, "\u{1F4E6} " + result.stats.total),
              React.createElement("span", { className: "validation-stat validation-stat--ok" }, "\u{1F4CA} " + result.stats.levels + " \u0443\u0440\u043E\u0432\u043D\u0435\u0439"),
              React.createElement("span", { className: "validation-stat validation-stat--warn" }, "\u23F1 " + result.stats.criticalPath + " \u0448\u0430\u0433\u043E\u0432"),
              result.stats.brokenCount > 0 && React.createElement("span", { className: "validation-stat validation-stat--warn" }, "\u{1F517} " + result.stats.brokenCount + " \u0440\u0430\u0437\u043E\u0440\u0432\u0430\u043D\u043E"),
              result.stats.cyclic > 0 && React.createElement("span", { className: "validation-stat validation-stat--err" }, "\u26A0\uFE0F " + result.stats.cyclic + " \u0446\u0438\u043A\u043B.")
            ),
            React.createElement(
              "div",
              { className: "validation-footer__actions" },
              React.createElement("button", { className: "btn", onClick: function() {
                onApplyLevels(result.levelMap);
                onClose();
              } }, "\u{1F3A8} \u041D\u0430 \u0433\u0440\u0430\u0444\u0435"),
              React.createElement("button", { className: "btn", onClick: copyAsText }, "\u{1F4CB} \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C"),
              React.createElement("button", { className: "btn", onClick: exportJSON }, "\u{1F4BE} JSON"),
              React.createElement("button", { className: "btn", onClick: exportMD }, "\u{1F4DD} MD"),
              React.createElement("button", { className: "btn", onClick: function() {
                setResult(null);
              } }, "\u2190 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438")
            )
          )
        )
      );
    }
    function findDeps(domainId, result, edges, nodes) {
      var nodeById = /* @__PURE__ */ new Map();
      nodes.forEach(function(n) {
        nodeById.set(n.id, n);
      });
      var set = /* @__PURE__ */ new Set();
      edges.forEach(function(e) {
        var s = nodeById.get(e.source);
        if (!s || s.data.nodeType !== "domain")
          return;
        if (s.data.domainId !== domainId)
          return;
        var t = nodeById.get(e.target);
        if (!t || t.data.nodeType !== "domain")
          return;
        if (!result.levelMap.has(t.data.domainId))
          return;
        set.add(t.data.domainId);
      });
      return Array.from(set).sort();
    }
    function ValidationModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var allDomains = props.allDomains;
      var visibleDomains = props.visibleDomains;
      var bookmarkedDomains = props.bookmarkedDomains;
      var onGotoDomain = props.onGotoDomain;
      var onResults = props.onResults;
      var [scope, setScope] = useState("all");
      var [running, setRunning] = useState(false);
      var [started, setStarted] = useState(false);
      var [progress, setProgress] = useState({ current: 0, total: 0 });
      var [logs, setLogs] = useState([]);
      var [filter, setFilter] = useState("problems");
      var [stats, setStats] = useState(null);
      var [cancelled, setCancelled] = useState(false);
      var abortRef = useRef(null);
      var logsRef = useRef(null);
      var [expanded, setExpanded] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var toggleExpanded = useCallback(function(domainId) {
        setExpanded(function(prev) {
          var s = new Set(prev);
          if (s.has(domainId))
            s.delete(domainId);
          else
            s.add(domainId);
          return s;
        });
      }, []);
      useEffect(function() {
        if (!open) {
          setStarted(false);
          setRunning(false);
          setLogs([]);
          setProgress({ current: 0, total: 0 });
          setStats(null);
          setCancelled(false);
          if (abortRef.current) {
            try {
              abortRef.current.abort();
            } catch (e) {
            }
            abortRef.current = null;
          }
        }
      }, [open]);
      useEffect(function() {
        if (logsRef.current)
          logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }, [logs.length]);
      var startValidation = useCallback(function() {
        var domains;
        if (scope === "visible")
          domains = visibleDomains;
        else if (scope === "bookmarked")
          domains = bookmarkedDomains;
        else
          domains = allDomains;
        if (domains.length === 0) {
          alert("\u041D\u0435\u0442 \u0434\u043E\u043C\u0435\u043D\u043E\u0432 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438");
          return;
        }
        setRunning(true);
        setStarted(true);
        setLogs([]);
        setStats(null);
        setCancelled(false);
        setProgress({ current: 0, total: domains.length });
        setExpanded(/* @__PURE__ */ new Set());
        var controller = new AbortController();
        abortRef.current = controller;
        fetch("/api/validate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainIds: domains.map(function(d) {
            return d.domainId;
          }) }),
          signal: controller.signal
        }).then(function(response) {
          if (!response.ok)
            throw new Error("HTTP " + response.status);
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = "";
          function read() {
            return reader.read().then(function(r) {
              if (r.done)
                return;
              buffer += decoder.decode(r.value, { stream: true });
              var parts = buffer.split("\n\n");
              buffer = parts.pop();
              parts.forEach(function(part) {
                var line = part.trim();
                if (!line.startsWith("data:"))
                  return;
                var json = line.slice(5).trim();
                var evt;
                try {
                  evt = JSON.parse(json);
                } catch (e) {
                  return;
                }
                handleEvent(evt);
              });
              return read();
            });
          }
          function handleEvent(evt) {
            if (evt.type === "start") {
              setProgress({ current: 0, total: evt.total });
            } else if (evt.type === "progress") {
              setProgress({ current: evt.current, total: evt.total });
              setLogs(function(prev) {
                return prev.concat([evt]);
              });
            } else if (evt.type === "done") {
              setStats(evt.stats);
              setCancelled(evt.cancelled);
              setRunning(false);
              if (onResults) {
                var map = /* @__PURE__ */ new Map();
                (evt.results || []).forEach(function(r) {
                  map.set(r.domainId, r);
                });
                onResults(map);
              }
            } else if (evt.type === "error") {
              setRunning(false);
              alert("\u041E\u0448\u0438\u0431\u043A\u0430: " + evt.message);
            }
          }
          return read();
        }).catch(function(err) {
          if (err.name === "AbortError")
            return;
          setRunning(false);
          alert("\u041E\u0448\u0438\u0431\u043A\u0430: " + err.message);
        });
      }, [scope, allDomains, visibleDomains, bookmarkedDomains, onResults]);
      var stopValidation = useCallback(function() {
        fetch("/api/validate-cancel", { method: "POST" }).catch(function() {
        });
        if (abortRef.current) {
          try {
            abortRef.current.abort();
          } catch (e) {
          }
        }
        setRunning(false);
      }, []);
      var filteredLogs = useMemo(function() {
        if (filter === "all")
          return logs;
        if (filter === "valid")
          return logs.filter(function(l) {
            return l.status === "valid";
          });
        if (filter === "invalid")
          return logs.filter(function(l) {
            return l.status === "invalid";
          });
        if (filter === "errors")
          return logs.filter(function(l) {
            return l.status === "error";
          });
        if (filter === "problems")
          return logs.filter(function(l) {
            return l.status !== "valid" && l.status !== "skip";
          });
        return logs;
      }, [logs, filter]);
      var exportJSON = useCallback(function() {
        if (!stats)
          return;
        var data = {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          stats,
          cancelled,
          results: logs.map(function(l) {
            return { domainId: l.domainId, status: l.status, diagnostics: l.diagnostics, error: l.error };
          })
        };
        downloadFile(JSON.stringify(data, null, 2), "validation-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json", "application/json");
      }, [stats, cancelled, logs]);
      var exportMD = useCallback(function() {
        if (!stats)
          return;
        var md = generateValidationMarkdown(stats, cancelled, logs);
        downloadFile(md, "validation-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md", "text/markdown;charset=utf-8");
      }, [stats, cancelled, logs]);
      if (!open)
        return null;
      var pct = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0;
      return React.createElement(
        "div",
        { className: "help-overlay", onMouseDown: function() {
          if (!running)
            onClose();
        } },
        React.createElement(
          "div",
          { className: "help-modal validation-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u{1F50D} \u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432"),
            React.createElement("button", { className: "help-modal__close", onClick: running ? stopValidation : onClose }, running ? "\u25A0 \u0421\u0442\u043E\u043F" : "\u2715")
          ),
          React.createElement(
            "div",
            { className: "validation-modal__body" },
            // Область валидации
            !started && React.createElement(
              "div",
              { className: "validation-scope" },
              React.createElement("div", { className: "validation-scope__label" }, "\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438"),
              scopeOption("all", "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B \u0432 \u043A\u044D\u0448\u0435", allDomains.length, scope, setScope),
              scopeOption("visible", "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0438\u043C\u044B\u0435 (\u043F\u043E\u0441\u043B\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432)", visibleDomains.length, scope, setScope),
              scopeOption("bookmarked", "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435", bookmarkedDomains.length, scope, setScope),
              React.createElement("button", { className: "btn btn--primary", onClick: startValidation, style: { marginTop: 16, width: "100%", justifyContent: "center" } }, "\u25B6 \u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044E")
            ),
            // Прогресс
            started && React.createElement(
              "div",
              { className: "validation-progress" },
              React.createElement(
                "div",
                { className: "validation-progress__bar" },
                React.createElement("div", { className: "validation-progress__fill", style: { width: pct + "%" } })
              ),
              React.createElement("div", { className: "validation-progress__text" }, progress.current + " / " + progress.total + " (" + pct + "%)" + (running ? " \u2014 \u0438\u0434\u0451\u0442 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F..." : cancelled ? " \u2014 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E" : " \u2014 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E"))
            ),
            // Фильтры логов
            started && React.createElement(
              "div",
              { className: "validation-filters" },
              ["problems", "all", "invalid", "errors", "valid"].map(function(f) {
                var labels = { problems: "\u0422\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u043D\u044B\u0435", all: "\u0412\u0441\u0435", invalid: "\u274C \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435", errors: "\u26A0\uFE0F \u041E\u0448\u0438\u0431\u043A\u0438", valid: "\u2705 \u0412\u0430\u043B\u0438\u0434\u043D\u044B\u0435" };
                return React.createElement("button", {
                  key: f,
                  className: "validation-filter" + (filter === f ? " validation-filter--active" : ""),
                  onClick: function() {
                    setFilter(f);
                  }
                }, labels[f]);
              })
            ),
            // Логи
            started && React.createElement(
              "div",
              { className: "validation-logs", ref: logsRef },
              filteredLogs.length === 0 ? React.createElement("div", { className: "validation-logs__empty" }, "\u041D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E \u0444\u0438\u043B\u044C\u0442\u0440\u0443") : filteredLogs.map(function(log, i) {
                var icon = log.status === "valid" ? "\u2705" : log.status === "invalid" ? "\u274C" : "\u26A0\uFE0F";
                var isInvalid = log.status === "invalid";
                var hasDiag = isInvalid && log.diagnostics && log.diagnostics.length > 0;
                var isOpen = expanded.has(log.domainId);
                return React.createElement(
                  "div",
                  { key: i, className: "validation-log validation-log--" + log.status + (isOpen ? " validation-log--open" : "") },
                  React.createElement(
                    "div",
                    {
                      className: "validation-log__head" + (hasDiag ? " validation-log__head--clickable" : ""),
                      onClick: hasDiag ? function() {
                        toggleExpanded(log.domainId);
                      } : void 0
                    },
                    hasDiag && React.createElement("span", { className: "validation-log__chevron" }, isOpen ? "\u25BE" : "\u25B8"),
                    React.createElement("span", { className: "validation-log__icon" }, icon),
                    React.createElement("a", {
                      className: "validation-log__domain",
                      onClick: function(e) {
                        e.stopPropagation();
                        onGotoDomain(log.domainId);
                        onClose();
                      }
                    }, log.domainId),
                    isInvalid && log.diagnostics && React.createElement("span", { className: "validation-log__count" }, log.diagnostics.length + " " + plural(log.diagnostics.length, "issue", "issues")),
                    log.error && React.createElement("span", { className: "validation-log__error" }, log.error),
                    hasDiag && !isOpen && React.createElement("span", { className: "validation-log__hint" }, "\u043D\u0430\u0436\u043C\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0440\u0430\u0441\u043A\u0440\u044B\u0442\u044C")
                  ),
                  isOpen && hasDiag && React.createElement(
                    "div",
                    { className: "validation-log__diag" },
                    log.diagnostics.map(function(d, di) {
                      return React.createElement(
                        "div",
                        { key: di, className: "validation-diag" },
                        React.createElement("div", { className: "validation-diag__severity" }, d.severity),
                        React.createElement("div", { className: "validation-diag__message" }, d.message),
                        d.labels && d.labels.length > 0 && d.labels.map(function(lb, li) {
                          return React.createElement(
                            "div",
                            { key: li, className: "validation-diag__label" },
                            lb.message,
                            lb.span && React.createElement("span", { className: "validation-diag__span" }, " [" + lb.span.start + "-" + lb.span.end + "]")
                          );
                        })
                      );
                    })
                  )
                );
              })
            )
          ),
          // Футер с итогами
          stats && React.createElement(
            "div",
            { className: "validation-footer" },
            React.createElement(
              "div",
              { className: "validation-stats" },
              React.createElement("span", { className: "validation-stat validation-stat--ok" }, "\u2705 " + stats.valid),
              React.createElement("span", { className: "validation-stat validation-stat--err" }, "\u274C " + stats.invalid),
              React.createElement("span", { className: "validation-stat validation-stat--warn" }, "\u26A0\uFE0F " + stats.errors),
              React.createElement("span", { className: "validation-stat" }, "\u23F1 " + formatDuration(stats.elapsedMs))
            ),
            React.createElement(
              "div",
              { className: "validation-footer__actions" },
              React.createElement("button", { className: "btn", onClick: exportJSON }, "\u{1F4BE} JSON"),
              React.createElement("button", { className: "btn", onClick: exportMD }, "\u{1F4DD} Markdown"),
              React.createElement("button", { className: "btn", onClick: onClose }, "\u0417\u0430\u043A\u0440\u044B\u0442\u044C")
            )
          )
        )
      );
    }
    function scopeOption(value, label, count, current, setCurrent) {
      return React.createElement(
        "label",
        { className: "validation-scope__option" + (current === value ? " active" : "") },
        React.createElement("input", {
          type: "radio",
          checked: current === value,
          onChange: function() {
            setCurrent(value);
          }
        }),
        React.createElement("span", { className: "validation-scope__radio" }),
        React.createElement("span", { className: "validation-scope__text" }, label),
        React.createElement("span", { className: "validation-scope__count" }, count)
      );
    }
    function plural(n, one, many) {
      return n === 1 ? one : many;
    }
    function formatDuration(ms) {
      if (ms < 1e3)
        return ms + "ms";
      var s = Math.floor(ms / 1e3);
      if (s < 60)
        return s + "\u0441";
      var m = Math.floor(s / 60);
      return m + "\u043C " + s % 60 + "\u0441";
    }
    function downloadFile(content, filename, mime) {
      var blob = new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    function generateValidationMarkdown(stats, cancelled, logs) {
      var lines = [];
      lines.push("# \u041E\u0442\u0447\u0451\u0442 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438 \u0434\u043E\u043C\u0435\u043D\u043E\u0432");
      lines.push("");
      lines.push("_\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E: " + (/* @__PURE__ */ new Date()).toLocaleString("ru-RU") + "_");
      if (cancelled)
        lines.push("");
      if (cancelled)
        lines.push("> \u26A0\uFE0F \u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0431\u044B\u043B\u0430 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C");
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
      var invalid = logs.filter(function(l) {
        return l.status === "invalid";
      });
      if (invalid.length > 0) {
        lines.push("## \u041D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B (" + invalid.length + ")");
        lines.push("");
        invalid.forEach(function(l) {
          lines.push("### `" + l.domainId + "`");
          lines.push("");
          (l.diagnostics || []).forEach(function(d) {
            lines.push("- **[" + d.severity + "]** " + d.message);
            (d.labels || []).forEach(function(lb) {
              lines.push("  - " + lb.message + (lb.span ? " (\u043F\u043E\u0437\u0438\u0446\u0438\u044F " + lb.span.start + "-" + lb.span.end + ")" : ""));
            });
          });
          lines.push("");
        });
      }
      var errors = logs.filter(function(l) {
        return l.status === "error";
      });
      if (errors.length > 0) {
        lines.push("## \u041E\u0448\u0438\u0431\u043A\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F (" + errors.length + ")");
        lines.push("");
        errors.forEach(function(l) {
          lines.push("- `" + l.domainId + "` \u2014 " + (l.error || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"));
        });
        lines.push("");
      }
      var valid = logs.filter(function(l) {
        return l.status === "valid";
      });
      if (valid.length > 0) {
        lines.push("## \u0412\u0430\u043B\u0438\u0434\u043D\u044B\u0435 \u0434\u043E\u043C\u0435\u043D\u044B (" + valid.length + ")");
        lines.push("");
        valid.forEach(function(l) {
          lines.push("- `" + l.domainId + "`");
        });
        lines.push("");
      }
      return lines.join("\n");
    }
    function HotkeysModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      useEffect(function() {
        if (!open)
          return;
        var onEsc = function(e) {
          if (e.key === "Escape")
            onClose();
        };
        document.addEventListener("keydown", onEsc, true);
        return function() {
          document.removeEventListener("keydown", onEsc, true);
        };
      }, [open, onClose]);
      if (!open)
        return null;
      var groups = [
        {
          title: "\u041E\u0431\u0449\u0435\u0435",
          items: [
            { keys: ["Shift", "Tab"], label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u0443\u044E \u043F\u0430\u043B\u0438\u0442\u0440\u0443" },
            { keys: ["Ctrl", "K"], label: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u043D\u0443\u044E \u043F\u0430\u043B\u0438\u0442\u0440\u0443 (\u0430\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u0430)", alt: true },
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
      return React.createElement(
        "div",
        { className: "help-overlay", onMouseDown: onClose },
        React.createElement(
          "div",
          { className: "help-modal hotkeys-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u2328\uFE0F \u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438"),
            React.createElement("button", { className: "help-modal__close", onClick: onClose }, "\u2715")
          ),
          React.createElement(
            "div",
            { className: "hotkeys-body" },
            groups.map(function(g) {
              return React.createElement(
                "div",
                { key: g.title, className: "hotkeys-group" },
                React.createElement("div", { className: "hotkeys-group__title" }, g.title),
                React.createElement(
                  "div",
                  { className: "hotkeys-group__items" },
                  g.items.map(function(item, i) {
                    return React.createElement(
                      "div",
                      { key: i, className: "hotkey-row" },
                      React.createElement(
                        "div",
                        { className: "hotkey-row__keys" },
                        item.keys.map(function(k, ki) {
                          return React.createElement(
                            React.Fragment,
                            { key: ki },
                            ki > 0 && React.createElement("span", { className: "hotkey-plus" }, "+"),
                            React.createElement("kbd", { className: "hotkey-key" }, k)
                          );
                        })
                      ),
                      React.createElement("div", { className: "hotkey-row__label" }, item.label)
                    );
                  })
                )
              );
            })
          ),
          React.createElement(
            "div",
            { className: "hotkeys-footer" },
            "\u0412\u0441\u0435 \u0433\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442, \u043A\u043E\u0433\u0434\u0430 \u0444\u043E\u043A\u0443\u0441 \u043D\u0435 \u0432 \u043F\u043E\u043B\u0435 \u0432\u0432\u043E\u0434\u0430."
          )
        )
      );
    }
    function HelpModal(props) {
      var open = props.open;
      var onClose = props.onClose;
      var [content, setContent] = useState("");
      var [loading, setLoading] = useState(false);
      var bodyRef = useRef(null);
      useEffect(function() {
        if (!open || content)
          return;
        setLoading(true);
        Promise.all([
          fetch("/user-guide").then(function(r) {
            if (!r.ok)
              throw new Error("HTTP " + r.status);
            return r.text();
          }),
          import("https://esm.sh/marked@12.0.2")
        ]).then(function(results) {
          var md = results[0];
          var markedMod = results[1];
          var parse = markedMod.marked ? markedMod.marked.parse : markedMod.parse || null;
          if (!parse)
            throw new Error("marked.parse \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
          var html = parse(md);
          setContent(html);
          setLoading(false);
        }).catch(function(err) {
          setContent('<p style="color:var(--danger)">\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043F\u0440\u0430\u0432\u043A\u0438: ' + err.message + "</p>");
          setLoading(false);
        });
      }, [open, content]);
      useEffect(function() {
        if (!open)
          return;
        var onEsc = function(e) {
          if (e.key === "Escape")
            onClose();
        };
        document.addEventListener("keydown", onEsc, true);
        return function() {
          document.removeEventListener("keydown", onEsc, true);
        };
      }, [open, onClose]);
      if (!open)
        return null;
      return React.createElement(
        "div",
        { className: "help-overlay", onMouseDown: onClose },
        React.createElement(
          "div",
          { className: "help-modal", onMouseDown: function(e) {
            e.stopPropagation();
          } },
          React.createElement(
            "div",
            { className: "help-modal__header" },
            React.createElement("div", { className: "help-modal__title" }, "\u{1F4D6} \u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F"),
            React.createElement("button", { className: "help-modal__close", onClick: onClose, title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C (Esc)" }, "\u2715")
          ),
          React.createElement(
            "div",
            { className: "help-modal__body", ref: bodyRef },
            loading ? React.createElement("div", { className: "help-modal__loading" }, "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...") : React.createElement("div", { className: "help-content", dangerouslySetInnerHTML: { __html: content } })
          )
        )
      );
    }
    function getNsByDomainId(n, depth) {
      var parts = (n.data.domainId || "").split(".");
      return parts.slice(0, depth).join(".") || "__empty__";
    }
    function relativeTime(iso) {
      var ms = Date.now() - new Date(iso).getTime();
      var min = Math.floor(ms / 6e4);
      if (min < 1)
        return "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E";
      if (min < 60)
        return min + " \u043C\u0438\u043D \u043D\u0430\u0437\u0430\u0434";
      var h = Math.floor(min / 60);
      if (h < 24)
        return h + " \u0447 \u043D\u0430\u0437\u0430\u0434";
      var d = Math.floor(h / 24);
      return d + " \u0434\u043D \u043D\u0430\u0437\u0430\u0434";
    }
    function ActivityChart(props) {
      var nodes = props.nodes;
      var days = props.days || 30;
      var buckets = useMemo(function() {
        var now = /* @__PURE__ */ new Date();
        now.setHours(23, 59, 59, 999);
        var startMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1e3;
        var arr = [];
        for (var i = 0; i < days; i++) {
          var d = new Date(startMs + i * 24 * 60 * 60 * 1e3);
          arr.push({
            date: d,
            day: d.getDate(),
            month: d.getMonth(),
            count: 0
          });
        }
        nodes.forEach(function(n) {
          if (!n.data || n.data.nodeType !== "domain")
            return;
          if (!n.data.updatedAt)
            return;
          var t;
          try {
            t = new Date(n.data.updatedAt).getTime();
          } catch (e) {
            return;
          }
          if (isNaN(t))
            return;
          if (t < startMs)
            return;
          var idx = Math.floor((t - startMs) / (24 * 60 * 60 * 1e3));
          if (idx >= 0 && idx < days) {
            arr[idx].count++;
          }
        });
        return arr;
      }, [nodes, days]);
      var max = Math.max.apply(null, buckets.map(function(b) {
        return b.count;
      }));
      if (max === 0)
        max = 1;
      return React.createElement(
        "div",
        { className: "activity-chart" },
        React.createElement(
          "div",
          { className: "activity-chart__bars" },
          buckets.map(function(b, i) {
            var height = b.count / max * 100;
            var isToday = i === buckets.length - 1;
            return React.createElement("div", {
              key: i,
              className: "activity-chart__bar" + (isToday ? " activity-chart__bar--today" : ""),
              style: { height: Math.max(height, b.count > 0 ? 8 : 0) + "%" },
              title: b.date.toLocaleDateString("ru-RU") + ": " + b.count + " \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439"
            });
          })
        ),
        React.createElement(
          "div",
          { className: "activity-chart__legend" },
          React.createElement("span", null, days + " \u0434\u043D\u0435\u0439 \u043D\u0430\u0437\u0430\u0434"),
          React.createElement("span", { style: { color: "var(--text-200)" } }, "\u0441\u0435\u0433\u043E\u0434\u043D\u044F"),
          React.createElement("span", null, "\u043C\u0430\u043A\u0441: " + max)
        )
      );
    }
    function formatSavedAt(iso) {
      if (!iso)
        return "";
      var d = new Date(iso);
      var diffMs = Date.now() - d.getTime();
      var diffMin = Math.floor(diffMs / 6e4);
      if (diffMin < 1)
        return "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u043E";
      if (diffMin < 60)
        return diffMin + " \u043C\u0438\u043D \u043D\u0430\u0437\u0430\u0434";
      var diffH = Math.floor(diffMin / 60);
      if (diffH < 24)
        return diffH + " \u0447 \u043D\u0430\u0437\u0430\u0434";
      var diffD = Math.floor(diffH / 24);
      if (diffD < 7)
        return diffD + " \u0434\u043D \u043D\u0430\u0437\u0430\u0434";
      return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    }
    function Snackbar(props) {
      var snackbar = props.snackbar;
      if (!snackbar)
        return null;
      return React.createElement(
        "div",
        { className: "snackbar" },
        React.createElement(MIcon, { name: "check_circle", size: "sm" }),
        React.createElement("span", null, snackbar.message)
      );
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
      } catch (e) {
        return iso;
      }
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
    function App() {
      var themeState = useState(function() {
        return localStorage.getItem("dg-theme") || "dark";
      });
      var theme = themeState[0], setTheme = themeState[1];
      useEffect(function() {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("dg-theme", theme);
      }, [theme]);
      var [filters, setFilters] = useState({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
      var [namespaceFilter, setNamespaceFilter] = useState("");
      var [isolatedOnly, setIsolatedOnly] = useState(false);
      var [nsMode, setNsMode] = useState(false);
      var [layoutType, setLayoutType] = useState("LR");
      var [compact, setCompact] = useState(false);
      var [showGroups, setShowGroups] = useState(false);
      var [bidirectional, setBidirectional] = useState(true);
      var [showEdgeLabels, setShowEdgeLabels] = useState(false);
      var [clusterDepth, setClusterDepth] = useState(2);
      var [selectedNodeId, setSelectedNodeId] = useState(null);
      var [focusNode, setFocusNode] = useState(null);
      var [focusDepth, setFocusDepth] = useState(2);
      var [pathSel, setPathSel] = useState([]);
      var [pathResult, setPathResult] = useState(null);
      var [contextMenu, setContextMenu] = useState(null);
      var [cycleHighlight, setCycleHighlight] = useState(null);
      var [diffMode, setDiffMode] = useState(null);
      var [panelOpen, setPanelOpen] = useState(false);
      var [panelTab, setPanelTab] = useState("details");
      var [panelNodeId, setPanelNodeId] = useState(null);
      var editorRef = useRef(null);
      var [searchOpen, setSearchOpen] = useState(false);
      var [searchQuery, setSearchQuery] = useState("");
      var [searchIndex, setSearchIndex] = useState(0);
      var searchInputRef = useRef(null);
      var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      var [tooltip, setTooltip] = useState(null);
      var hideTimer = useRef(null);
      var tooltipCache = useRef(/* @__PURE__ */ new Map());
      var rfInstance = useRef(null);
      var snapshotInputRef = useRef(null);
      var [editorFilePath, setEditorFilePath] = useState("");
      var [pendingFile, setPendingFile] = useState(null);
      var [hiddenNodeIds, setHiddenNodeIds] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var [pathMode, setPathMode] = useState(null);
      var [selectedEdgeId, setSelectedEdgeId] = useState(null);
      var [heatmap, setHeatmap] = useState("none");
      var [navStack, setNavStack] = useState({ items: [], index: -1 });
      var [toastVisible, setToastVisible] = useState(!!(REMOTE_INFO && REMOTE_INFO.fromCache));
      var [topoOpen, setTopoOpen] = useState(false);
      var [topoLevelMap, setTopoLevelMap] = useState(null);
      var [hotkeysOpen, setHotkeysOpen] = useState(false);
      var [entityHierarchyOpen, setEntityHierarchyOpen] = useState(false);
      var [entityHierarchyInitialKey, setEntityHierarchyInitialKey] = useState(null);
      var [clusterBoxes, setClusterBoxes] = useState([]);
      var [clusterGroupCount, setClusterGroupCount] = useState(0);
      var didInitialFitRef = useRef(false);
      var filteredNodesRef = useRef([]);
      var setRfInstance = useCallback(function(rf) {
        rfInstance.current = rf;
      }, []);
      var [snapshotA, setSnapshotA] = useState(function() {
        try {
          var raw = localStorage.getItem("dg-snapshot-a");
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      });
      var [snapshotB, setSnapshotB] = useState(function() {
        try {
          var raw = localStorage.getItem("dg-snapshot-b");
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      });
      var [snackbar, setSnackbar] = useState(null);
      var [sidebarCompact, setSidebarCompact] = useState(false);
      var [collapsedSections, setCollapsedSections] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var toggleSection = useCallback(function(id, isCollapsed) {
        setCollapsedSections(function(prev) {
          var s = new Set(prev);
          if (isCollapsed)
            s.delete(id);
          else
            s.add(id);
          return s;
        });
      }, []);
      var [tagFilters, setTagFilters] = useState(function() {
        return /* @__PURE__ */ new Set();
      });
      var [tooltipsEnabled, setTooltipsEnabled] = useState(function() {
        try {
          var saved = localStorage.getItem("dg-tooltip-enabled");
          return saved === null ? true : saved === "true";
        } catch (e) {
          return true;
        }
      });
      var [sidePanelEnabled, setSidePanelEnabled] = useState(function() {
        try {
          var saved = localStorage.getItem("dg-side-panel-enabled");
          return saved === null ? true : saved === "true";
        } catch (e) {
          return true;
        }
      });
      useEffect(function() {
        try {
          localStorage.setItem("dg-tooltip-enabled", String(tooltipsEnabled));
        } catch (e) {
        }
      }, [tooltipsEnabled]);
      useEffect(function() {
        try {
          localStorage.setItem("dg-side-panel-enabled", String(sidePanelEnabled));
        } catch (e) {
        }
      }, [sidePanelEnabled]);
      var [activityPeriod, setActivityPeriod] = useState(function() {
        try {
          var v = localStorage.getItem("dg-activity-period");
          return v ? parseInt(v, 10) : 30;
        } catch (e) {
          return 30;
        }
      });
      useEffect(function() {
        try {
          localStorage.setItem("dg-activity-period", String(activityPeriod));
        } catch (e) {
        }
      }, [activityPeriod]);
      useEffect(function() {
        var onShow = function() {
          if (!window.__healthTooltip)
            return;
          setTooltip({
            html: window.__healthTooltip.html,
            x: window.__healthTooltip.x + 12,
            y: window.__healthTooltip.y + 12,
            anchorX: window.__healthTooltip.x,
            anchorY: window.__healthTooltip.y
          });
        };
        var onHide = function() {
          setTooltip(null);
        };
        document.addEventListener("show-health-tooltip", onShow);
        document.addEventListener("hide-health-tooltip", onHide);
        return function() {
          document.removeEventListener("show-health-tooltip", onShow);
          document.removeEventListener("hide-health-tooltip", onHide);
        };
      }, []);
      useEffect(function() {
        setEdges(displayEdges);
      }, [displayEdges, setEdges]);
      var getLayoutCacheKey = function(type, depth) {
        return type + ":" + depth + ":" + compact + ":" + edges.length + ":" + nodes.length;
      };
      var [validationAvailable, setValidationAvailable] = useState(false);
      useEffect(function() {
        fetch("/api/validation-available").then(function(r) {
          return r.json();
        }).then(function(d) {
          setValidationAvailable(!!d.available);
        }).catch(function() {
        });
      }, []);
      var [rules, setRules] = useState(function() {
        try {
          var raw = localStorage.getItem("dg-rules");
          var parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return [];
        }
      });
      var [showViolationsOnly, setShowViolationsOnly] = useState(false);
      var [rulesHighlighted, setRulesHighlighted] = useState(true);
      var [rulesOpen, setRulesOpen] = useState(false);
      var [helpOpen, setHelpOpen] = useState(false);
      var [validationOpen, setValidationOpen] = useState(false);
      var [validationResults, setValidationResults] = useState(function() {
        return null;
      });
      var [onlyInvalid, setOnlyInvalid] = useState(false);
      var [learningPathOpen, setLearningPathOpen] = useState(false);
      var [tour, setTour] = useState(null);
      useEffect(function() {
        tooltipCache.current.clear();
      }, [nodes, validationResults]);
      var showSnackbar = useCallback(function(message) {
        setSnackbar({ message, ts: Date.now() });
        setTimeout(function() {
          setSnackbar(function(prev) {
            return prev && Date.now() - prev.ts >= 2e3 ? null : prev;
          });
        }, 2100);
      }, []);
      var createSnapshot = useCallback(function() {
        return {
          savedAt: (/* @__PURE__ */ new Date()).toISOString(),
          server: REMOTE_INFO && REMOTE_INFO.server ? REMOTE_INFO.server : null,
          stats: { nodes: nodes.length, edges: edges.length },
          nodes: nodes.map(function(n) {
            return {
              id: n.id,
              domainId: n.data.domainId,
              nodeType: n.data.nodeType
            };
          }),
          edges: edges.map(function(e) {
            return {
              id: e.id,
              source: e.source,
              target: e.target,
              label: e.label,
              kind: e.data && e.data.kind,
              fullLabel: e.data && e.data.fullLabel,
              refCount: e.data && e.data.refCount
            };
          })
        };
      }, [nodes, edges]);
      var applySnapshotDiff = useCallback(function(snap) {
        if (!snap || !Array.isArray(snap.nodes) || !Array.isArray(snap.edges)) {
          alert("\u0421\u043D\u0438\u043C\u043E\u043A \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0435\u043D");
          return;
        }
        var snapEdgeIds = new Set(snap.edges.map(function(x) {
          return x.id;
        }));
        var snapNodeIds = new Set(snap.nodes.map(function(x) {
          return x.id;
        }));
        var curEdgeIds = new Set(edges.map(function(x) {
          return x.id;
        }));
        var curNodeIds = new Set(nodes.map(function(x) {
          return x.id;
        }));
        var addedEdges = /* @__PURE__ */ new Set();
        var removedEdges = /* @__PURE__ */ new Set();
        var addedNodes = /* @__PURE__ */ new Set();
        var removedNodes = /* @__PURE__ */ new Set();
        curEdgeIds.forEach(function(id) {
          if (!snapEdgeIds.has(id))
            addedEdges.add(id);
        });
        snapEdgeIds.forEach(function(id) {
          if (!curEdgeIds.has(id))
            removedEdges.add(id);
        });
        curNodeIds.forEach(function(id) {
          if (!snapNodeIds.has(id))
            addedNodes.add(id);
        });
        snapNodeIds.forEach(function(id) {
          if (!curNodeIds.has(id))
            removedNodes.add(id);
        });
        setDiffMode({
          addedEdges,
          removedEdges,
          addedNodes,
          removedNodes,
          snapshot: snap
        });
      }, [nodes, edges]);
      var handleSaveSnapshot = useCallback(function(slot) {
        var snap = createSnapshot();
        try {
          localStorage.setItem("dg-snapshot-" + slot.toLowerCase(), JSON.stringify(snap));
        } catch (e) {
          alert("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A: " + e.message);
          return;
        }
        if (slot === "A")
          setSnapshotA(snap);
        else
          setSnapshotB(snap);
        showSnackbar("\u0421\u043D\u0438\u043C\u043E\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0432 " + slot + " (" + snap.stats.nodes + " \u0443\u0437\u043B\u043E\u0432, " + snap.stats.edges + " \u0441\u0432\u044F\u0437\u0435\u0439)");
      }, [createSnapshot, showSnackbar]);
      var handleLoadSnapshot = useCallback(function(slot) {
        var snap = slot === "A" ? snapshotA : snapshotB;
        if (!snap)
          return;
        applySnapshotDiff(snap);
        showSnackbar("\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u0441\u043D\u0438\u043C\u043A\u043E\u043C " + slot + " \u043E\u0442 " + new Date(snap.savedAt).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }));
      }, [snapshotA, snapshotB, applySnapshotDiff, showSnackbar]);
      var handleClearSnapshot = useCallback(function(slot) {
        if (!confirm("\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A " + slot + "?"))
          return;
        try {
          localStorage.removeItem("dg-snapshot-" + slot.toLowerCase());
        } catch (e) {
        }
        if (slot === "A")
          setSnapshotA(null);
        else
          setSnapshotB(null);
      }, []);
      var startTour = useCallback(function(path) {
        setTour({
          stages: path.stages,
          index: 0,
          playing: false,
          startedAt: Date.now()
        });
        setSelectedNodeId(null);
        setFocusNode(null);
        setCycleHighlight(null);
        setPathResult(null);
        setPathSel([]);
        setFailureSim(null);
      }, []);
      var toggleTagFilter = useCallback(function(tag) {
        setTagFilters(function(prev) {
          var s = new Set(prev);
          if (s.has(tag))
            s.delete(tag);
          else
            s.add(tag);
          return s;
        });
      }, []);
      var tourNext = useCallback(function() {
        setTour(function(prev) {
          if (!prev)
            return null;
          var items = [];
          prev.stages.forEach(function(s) {
            s.domains.forEach(function(d) {
              items.push(d);
            });
          });
          if (prev.index >= items.length - 1)
            return prev;
          return Object.assign({}, prev, { index: prev.index + 1, playing: false });
        });
      }, []);
      var tourPrev = useCallback(function() {
        setTour(function(prev) {
          if (!prev)
            return null;
          if (prev.index <= 0)
            return prev;
          return Object.assign({}, prev, { index: prev.index - 1, playing: false });
        });
      }, []);
      var tourTogglePlay = useCallback(function() {
        setTour(function(prev) {
          return prev ? Object.assign({}, prev, { playing: !prev.playing }) : null;
        });
      }, []);
      var tourStop = useCallback(function() {
        setTour(null);
      }, []);
      var entityIndex = useMemo(function() {
        return buildEntityIndex(GRAPH_DATA.entities || []);
      }, []);
      useEffect(function() {
        if (!tour)
          return;
        var items = [];
        tour.stages.forEach(function(s) {
          s.domains.forEach(function(d) {
            items.push(d);
          });
        });
        var current = items[tour.index];
        if (!current || !rfInstance.current)
          return;
        var nodeId = current.id;
        var node = nodes.find(function(n) {
          return n.id === nodeId;
        });
        if (!node)
          return;
        var w = compact ? NODE_COMPACT : NODE_WIDTH;
        var h = compact ? NODE_COMPACT : NODE_HEIGHT;
        var cx = node.position.x + w / 2;
        var cy = node.position.y + h / 2;
        rfInstance.current.setCenter(cx, cy, { zoom: 1.5, duration: 700 });
        setSelectedNodeId(nodeId);
      }, [tour && tour.index]);
      useEffect(function() {
        if (!tour || !tour.playing)
          return;
        var items = [];
        tour.stages.forEach(function(s) {
          s.domains.forEach(function(d) {
            items.push(d);
          });
        });
        if (tour.index >= items.length - 1) {
          setTour(function(prev) {
            return prev ? Object.assign({}, prev, { playing: false }) : null;
          });
          return;
        }
        var t = setTimeout(function() {
          tourNext();
        }, 2500);
        return function() {
          clearTimeout(t);
        };
      }, [tour && tour.playing, tour && tour.index]);
      useEffect(function() {
        fetch("/api/validation-results").then(function(r) {
          if (r.status === 204)
            return null;
          return r.json();
        }).then(function(data) {
          if (!data || !data.results)
            return;
          var map = /* @__PURE__ */ new Map();
          data.results.forEach(function(r) {
            map.set(r.domainId, r);
          });
          setValidationResults(map);
        }).catch(function() {
        });
      }, []);
      var handleValidationResults = useCallback(function(map) {
        setValidationResults(map);
      }, []);
      useEffect(function() {
        try {
          var arr = Array.isArray(rules) ? rules : [];
          localStorage.setItem("dg-rules", JSON.stringify(arr));
        } catch (e) {
        }
      }, [rules]);
      useEffect(function() {
        setSelectedNodeId(null);
        setFocusNode(null);
        setPathResult(null);
        setPathSel([]);
        setCycleHighlight(null);
        setHiddenNodeIds(/* @__PURE__ */ new Set());
        setPathMode(null);
        setTimeout(function() {
          rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.2 });
        }, 150);
      }, [nsMode]);
      var [bookmarks, setBookmarks] = useState(function() {
        try {
          var raw = localStorage.getItem("dg-bookmarks");
          return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
        } catch (e) {
          return /* @__PURE__ */ new Set();
        }
      });
      var [bookmarksOnly, setBookmarksOnly] = useState(false);
      useEffect(function() {
        try {
          localStorage.setItem("dg-bookmarks", JSON.stringify(Array.from(bookmarks)));
        } catch (e) {
        }
      }, [bookmarks]);
      var toggleBookmark = useCallback(function(nodeId) {
        setBookmarks(function(prev) {
          var s = new Set(prev);
          if (s.has(nodeId))
            s.delete(nodeId);
          else
            s.add(nodeId);
          return s;
        });
      }, []);
      useEffect(function() {
        if (pathSel.length > 0 || pathMode) {
          clearTimeout(hideTimer.current);
          setTooltip(null);
          window.__tooltipHovered = false;
        }
      }, [pathSel.length, pathMode]);
      useEffect(function() {
        if (!tooltipsEnabled) {
          clearTimeout(hideTimer.current);
          setTooltip(null);
          window.__tooltipHovered = false;
        }
      }, [tooltipsEnabled]);
      var initial = useMemo(function() {
        var nodes2 = GRAPH_DATA.nodes.filter(function(n) {
          return n && n.id && typeof n.id === "string";
        }).map(function(n) {
          var domainId = n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, "");
          return {
            id: n.id,
            type: "domainNode",
            data: {
              domainId,
              label: n.label,
              nodeType: n.group,
              filePath: n.filePath,
              folderPath: n.folderPath || [],
              tooltipHtml: n.title,
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
        var edges2 = GRAPH_DATA.edges.filter(function(e) {
          if (!e || !e.id || !e.from || !e.to)
            return false;
          return true;
        }).map(function(e) {
          var isLinkage = e.kind === "linkage";
          return {
            id: e.id,
            source: e.from,
            target: e.to,
            type: "smoothstep",
            label: e.label,
            data: {
              tooltipHtml: e.title,
              fqidRefs: e.fqidRefs || [],
              linkData: e.linkData || null,
              fullLabel: e.fullLabel || e.label || e.id,
              kind: e.kind,
              refCount: e.refCount,
              side1Domain: e.side1Domain || null,
              side2Domain: e.side2Domain || null
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
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
        return { nodes: dagreLayout(nodes2, edges2, "LR"), edges: edges2 };
      }, []);
      var [allNodes, setAllNodes] = useState(initial.nodes);
      var [allEdges, setAllEdges] = useState(initial.edges);
      var [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
      var [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
      var topMissingRefs = useMemo(function() {
        var result = [];
        var domainIds = /* @__PURE__ */ new Set();
        nodes.forEach(function(n) {
          if (n.data.nodeType === "domain")
            domainIds.add(n.data.domainId.toLowerCase());
        });
        nodes.forEach(function(n) {
          if (n.data.nodeType !== "domain")
            return;
          var refs = n.data.fqidRefs || [];
          var missing = refs.filter(function(r) {
            return !domainIds.has((r.targetDomainId || "").toLowerCase());
          });
          if (missing.length === 0)
            return;
          var targets = /* @__PURE__ */ new Set();
          missing.forEach(function(r) {
            targets.add(r.targetDomainId);
          });
          result.push({
            node: n,
            count: missing.length,
            uniqueTargets: Array.from(targets)
          });
        });
        return result.sort(function(a, b) {
          return b.count - a.count;
        }).slice(0, 10);
      }, [nodes]);
      var display = useMemo(function() {
        if (!nsMode)
          return { nodes, edges };
        return aggregateByNamespace(nodes, edges);
      }, [nodes, edges, nsMode]);
      var displayNodes = display.nodes;
      var displayEdges = display.edges;
      var ruleViolations = useMemo(function() {
        if (!Array.isArray(rules) || rules.length === 0)
          return [];
        if (!Array.isArray(displayEdges) || !Array.isArray(displayNodes))
          return [];
        return evaluateRules(displayEdges, displayNodes, rules);
      }, [displayEdges, displayNodes, rules]);
      var violationsByEdge = useMemo(function() {
        var m = /* @__PURE__ */ new Map();
        ruleViolations.forEach(function(v) {
          if (!m.has(v.edgeId))
            m.set(v.edgeId, []);
          m.get(v.edgeId).push(v);
        });
        return m;
      }, [ruleViolations]);
      var cyclesInfo = useMemo(function() {
        return findCycles(displayNodes, displayEdges);
      }, [displayNodes, displayEdges]);
      var healthMap = useMemo(function() {
        var map = /* @__PURE__ */ new Map();
        displayNodes.forEach(function(n) {
          var h = computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null);
          if (typeof h === "number")
            h = { score: h, breakdown: [] };
          map.set(n.id, h);
        });
        return map;
      }, [displayNodes, displayEdges, cyclesInfo]);
      var bidirectionalEdges = useMemo(function() {
        if (!bidirectional)
          return displayEdges;
        return mergeBidirectional(displayEdges);
      }, [displayEdges, bidirectional]);
      var connected = useMemo(function() {
        var s = /* @__PURE__ */ new Set();
        displayEdges.forEach(function(e) {
          s.add(e.source);
          s.add(e.target);
        });
        return s;
      }, [displayEdges]);
      var filteredNodes = useMemo(function() {
        return displayNodes.filter(function(n) {
          if (n.type === "clusterNode")
            return true;
          if (hiddenNodeIds.has(n.id))
            return false;
          if (bookmarksOnly && !bookmarks.has(n.id))
            return false;
          if (tagFilters.size > 0) {
            var nodeTags = (n.data.tags || []).map(function(t2) {
              return String(t2).toLowerCase();
            });
            var matchesAny = false;
            tagFilters.forEach(function(tag) {
              if (nodeTags.indexOf(tag.toLowerCase()) !== -1)
                matchesAny = true;
            });
            if (!matchesAny)
              return false;
          }
          if (onlyInvalid) {
            var v = validationResults ? validationResults.get(n.data.domainId) : null;
            if (!v || v.status !== "invalid")
              return false;
          }
          var t = n.data.nodeType;
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
      }, [displayNodes, filters, namespaceFilter, isolatedOnly, connected, hiddenNodeIds, bookmarks, bookmarksOnly, onlyInvalid, validationResults, tagFilters]);
      var filteredEdges = useMemo(function() {
        var ids = new Set(filteredNodes.map(function(n) {
          return n.id;
        }));
        return bidirectionalEdges.filter(function(e) {
          if (!ids.has(e.source) || !ids.has(e.target))
            return false;
          if (showViolationsOnly && !violationsByEdge.has(e.id))
            return false;
          var kind = e.data && e.data.kind;
          if (kind === "linkage" && !filters.linkage)
            return false;
          if (kind === "fqid" && !filters.fqid)
            return false;
          return true;
        });
      }, [bidirectionalEdges, filteredNodes, filters.linkage, filters.fqid, showViolationsOnly, violationsByEdge]);
      var edgesForFocus = useMemo(function() {
        var ids = new Set(filteredNodes.map(function(n) {
          return n.id;
        }));
        return displayEdges.filter(function(e) {
          return ids.has(e.source) && ids.has(e.target);
        });
      }, [displayEdges, filteredNodes]);
      useEffect(function() {
        filteredNodesRef.current = filteredNodes;
      }, [filteredNodes]);
      var filteredIdsHash = useMemo(function() {
        return filteredNodes.map(function(n) {
          return n.id;
        }).sort().join(",");
      }, [filteredNodes]);
      var highlight = useMemo(function() {
        if (pathResult) {
          return { nodes: new Set(pathResult.nodes), edges: new Set(pathResult.edges), color: PATH_COLOR, type: "path" };
        }
        if (cycleHighlight) {
          return { nodes: cycleHighlight.nodeIds, edges: cycleHighlight.edgeIds, color: "#f97316", type: "cycle" };
        }
        if (focusNode) {
          var reachable = findReachable(focusNode, focusDepth, edgesForFocus);
          var focusEdges = /* @__PURE__ */ new Set();
          edgesForFocus.forEach(function(e) {
            if (reachable.has(e.source) && reachable.has(e.target))
              focusEdges.add(e.id);
          });
          return { nodes: reachable, edges: focusEdges, color: "#22d3ee", type: "focus" };
        }
        if (selectedNodeId && !focusNode) {
          var nodeIds = /* @__PURE__ */ new Set([selectedNodeId]);
          var edgeIds = /* @__PURE__ */ new Set();
          filteredEdges.forEach(function(e) {
            if (e.source === selectedNodeId || e.target === selectedNodeId) {
              edgeIds.add(e.id);
              nodeIds.add(e.source);
              nodeIds.add(e.target);
            }
          });
          return {
            nodes: nodeIds,
            edges: edgeIds,
            color: "#818cf8",
            type: "selected",
            soft: true
          };
        }
        return null;
      }, [focusNode, selectedNodeId, focusNode, focusDepth, cycleHighlight, pathResult, filteredEdges, edgesForFocus]);
      var edgesForRender = useMemo(function() {
        if (highlight && (highlight.type === "focus" || highlight.type === "cycle" || highlight.type === "path")) {
          return edgesForFocus;
        }
        return filteredEdges;
      }, [filteredEdges, edgesForFocus, highlight]);
      var heatmapValues = useMemo(function() {
        if (heatmap === "none")
          return null;
        var map = /* @__PURE__ */ new Map();
        var values = [];
        displayNodes.forEach(function(n) {
          var v = 0;
          if (heatmap === "health") {
            var h = healthMap.get(n.id);
            v = h && typeof h === "object" ? h.score || 0 : typeof h === "number" ? h : 0;
          } else if (heatmap === "degree") {
            var d = 0;
            displayEdges.forEach(function(e) {
              if (e.source === n.id)
                d++;
              if (e.target === n.id)
                d++;
            });
            v = d;
          } else if (heatmap === "entities")
            v = n.data.entitiesCount || 0;
          else if (heatmap === "fqid")
            v = (n.data.fqidRefs || []).length;
          map.set(n.id, v);
          values.push(v);
        });
        var min = Math.min.apply(null, values.length ? values : [0]);
        var max = Math.max.apply(null, values.length ? values : [1]);
        return { map, min, max, scheme: HEATMAPS[heatmap] };
      }, [heatmap, displayNodes, displayEdges, healthMap]);
      var visibleNodes = useMemo(function() {
        var pathEndpoints = pathResult ? /* @__PURE__ */ new Set([pathResult.nodes[0], pathResult.nodes[pathResult.nodes.length - 1]]) : null;
        var hasHighlight = !!(highlight || diffMode || topoLevelMap || validationResults || heatmapValues);
        return filteredNodes.map(function(n) {
          var h = healthMap.get(n.id);
          var healthScore = h && typeof h === "object" ? h.score : typeof h === "number" ? h : null;
          var healthBreakdown = h && typeof h === "object" ? h.breakdown || [] : [];
          var topoLvl = topoLevelMap ? topoLevelMap.get(n.data.domainId) : null;
          var validation = validationResults ? validationResults.get(n.data.domainId) : null;
          var isInvalid = validation && validation.status === "invalid";
          var isBookmarked = bookmarks ? bookmarks.has(n.id) : false;
          var baseData = Object.assign({}, n.data, {
            health: healthScore,
            healthBreakdown,
            __compact: compact,
            __topoLevel: topoLvl,
            __invalid: isInvalid,
            __validationStatus: validation ? validation.status : null,
            __validationDiagnostics: validation && validation.diagnostics ? validation.diagnostics : [],
            __validationCount: validation && validation.diagnostics ? validation.diagnostics.length : 0,
            __bookmarked: isBookmarked,
            __tooltipsEnabled: tooltipsEnabled
          });
          if (!hasHighlight && !selectedNodeId && !hiddenNodeIds.size) {
            return Object.assign({}, n, {
              data: baseData,
              selected: false
            });
          }
          var dimmed = highlight && !highlight.soft ? !highlight.nodes.has(n.id) : false;
          var inPath = highlight && highlight.type === "path" && highlight.nodes.has(n.id);
          var isPathEndpoint = pathEndpoints && pathEndpoints.has(n.id);
          var isAdded = diffMode && diffMode.addedNodes && diffMode.addedNodes.has(n.id);
          return Object.assign({}, n, {
            style: { opacity: dimmed ? 0.12 : 1, transition: "opacity 0.2s" },
            data: Object.assign(baseData, {
              dimmed,
              __inPath: inPath,
              __isPathEndpoint: isPathEndpoint,
              __isAdded: isAdded,
              __selectedHighlight: highlight && highlight.soft && highlight.nodes.has(n.id) && n.id === selectedNodeId
            }),
            selected: n.id === selectedNodeId
          });
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
      var visibleEdges = useMemo(function() {
        var isStrictHighlight = highlight && (highlight.type === "path" || highlight.type === "cycle" || highlight.type === "focus");
        var baseEdges = edgesForRender;
        if (isStrictHighlight) {
          baseEdges = edgesForRender.filter(function(e) {
            var eid = e.data && e.data.originalId || e.id;
            return highlight.edges.has(e.id) || highlight.edges.has(eid);
          });
        }
        var hasHighlight = highlight || diffMode || selectedEdgeId || rulesHighlighted && violationsByEdge && violationsByEdge.size > 0;
        if (!hasHighlight)
          return baseEdges;
        return baseEdges.map(function(e) {
          var isSelected = e.id === selectedEdgeId;
          var hl = highlight && (highlight.edges.has(e.id) || e.data && e.data.originalId && highlight.edges.has(e.data.originalId));
          var baseColor = e.data && e.data.kind === "linkage" ? LINKAGE_COLOR : e.data && e.data.kind === "fqid" ? FQID_COLOR : LINKAGE_COLOR;
          var stroke = baseColor;
          var opacity = 0.5;
          var strokeWidth = e.style && e.style.strokeWidth || 1;
          var animated = false;
          if (highlight) {
            if (highlight.soft) {
              if (hl) {
                opacity = 0.9;
                strokeWidth = e.data && e.data.kind === "linkage" ? 2.2 : 1.8;
              }
            } else {
              opacity = hl ? 1 : 0.06;
              strokeWidth = hl ? e.data && e.data.kind === "linkage" ? 3 : 2 : strokeWidth;
              animated = hl && highlight.type === "path";
            }
          }
          if (diffMode) {
            if (diffMode.addedEdges && diffMode.addedEdges.has(e.id)) {
              stroke = DIFF_ADDED;
              opacity = 1;
              strokeWidth = 3;
              animated = true;
            } else if (diffMode.removedEdges && diffMode.removedEdges.has(e.id)) {
              stroke = DIFF_REMOVED;
              opacity = 1;
              strokeWidth = 3;
            }
          }
          if (rulesHighlighted && violationsByEdge && violationsByEdge.has(e.id)) {
            var v = violationsByEdge.get(e.id);
            var hasForbid = v.some(function(x) {
              return x.severity === "forbid";
            });
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
          return Object.assign({}, e, {
            animated,
            style: Object.assign({}, e.style, {
              stroke,
              opacity,
              strokeWidth
            }),
            markerEnd: Object.assign({}, e.markerEnd, { color: stroke }),
            markerStart: e.markerStart ? Object.assign({}, e.markerStart, { color: stroke }) : void 0
          });
        });
      }, [edgesForRender, highlight, diffMode, rulesHighlighted, violationsByEdge, selectedEdgeId]);
      var handleExportMermaid = useCallback(function() {
        var lines = ["graph LR"];
        var idMap = /* @__PURE__ */ new Map();
        var counter = 1;
        visibleNodes.forEach(function(n) {
          if (n.data.nodeType !== "domain")
            return;
          var id = "D" + counter++;
          idMap.set(n.id, id);
          var safeLabel = (n.data.domainId || "").replace(/"/g, "&quot;");
          lines.push("  " + id + '["' + safeLabel + '"]');
        });
        visibleEdges.forEach(function(e) {
          var s = idMap.get(e.source);
          var t = idMap.get(e.target);
          if (!s || !t)
            return;
          var kind = e.data && e.data.kind;
          var label = kind === "linkage" ? "" : "|" + (e.data && e.data.refCount || 1) + "|";
          lines.push("  " + s + " -->" + label + " " + t);
        });
        lines.push("");
        lines.push("  classDef domain fill:#4CAF50,color:#fff");
        lines.push("  classDef missing fill:#FF9800,color:#fff");
        lines.push("  classDef broken fill:#F44336,color:#fff");
        var md = lines.join("\n");
        downloadFile(md, "domain-graph-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".mmd", "text/plain;charset=utf-8");
      }, [visibleNodes, visibleEdges]);
      var perfMode = useMemo(function() {
        return filteredEdges.length > 250;
      }, [filteredEdges.length]);
      var displayEdges = useMemo(function() {
        var hideLabels = perfMode && !showEdgeLabels;
        if (!hideLabels)
          return visibleEdges;
        return visibleEdges.map(function(e) {
          if (!e.label)
            return e;
          var copy = Object.assign({}, e);
          return copy;
        });
      }, [visibleEdges, perfMode, showEdgeLabels]);
      useEffect(function() {
        var nodeIds = new Set(visibleNodes.map(function(n) {
          return n.id;
        }));
        var orphanEdges = visibleEdges.filter(function(e) {
          return !nodeIds.has(e.source) || !nodeIds.has(e.target);
        });
        if (orphanEdges.length > 0) {
          console.warn("[orphan edges]", orphanEdges.length, orphanEdges.slice(0, 5));
        }
      }, [visibleNodes, visibleEdges]);
      var allDomainsList = useMemo(function() {
        return nodes.filter(function(n) {
          return n.data.nodeType === "domain";
        }).map(function(n) {
          return { id: n.id, domainId: n.data.domainId };
        });
      }, [nodes]);
      var visibleDomainsList = useMemo(function() {
        return visibleNodes.filter(function(n) {
          return n.data.nodeType === "domain";
        }).map(function(n) {
          return { id: n.id, domainId: n.data.domainId };
        });
      }, [visibleNodes]);
      var bookmarkedDomainsList = useMemo(function() {
        return nodes.filter(function(n) {
          return bookmarks.has(n.id) && n.data.nodeType === "domain";
        }).map(function(n) {
          return { id: n.id, domainId: n.data.domainId };
        });
      }, [nodes, bookmarks]);
      var panelEdge = selectedEdgeId ? visibleEdges.find(function(e) {
        return e.id === selectedEdgeId;
      }) || edges.find(function(e) {
        return e.id === selectedEdgeId;
      }) : null;
      var domainToNodeId = useMemo(function() {
        var m = /* @__PURE__ */ new Map();
        nodes.forEach(function(n) {
          m.set((n.data.domainId || "").toLowerCase(), n.id);
        });
        return m;
      }, [nodes]);
      var counts = useMemo(function() {
        return {
          domain: nodes.filter(function(n) {
            return n.data.nodeType === "domain";
          }).length,
          missing: nodes.filter(function(n) {
            return n.data.nodeType === "missing";
          }).length,
          broken: nodes.filter(function(n) {
            return n.data.nodeType === "broken";
          }).length,
          linkage: edges.filter(function(e) {
            return e.data && e.data.kind === "linkage";
          }).length,
          fqid: edges.filter(function(e) {
            return e.data && e.data.kind === "fqid";
          }).length
        };
      }, [nodes, edges]);
      var topConnected = useMemo(function() {
        var deg = /* @__PURE__ */ new Map();
        nodes.forEach(function(n) {
          deg.set(n.id, 0);
        });
        edges.forEach(function(e) {
          if (deg.has(e.source))
            deg.set(e.source, deg.get(e.source) + 1);
          if (deg.has(e.target))
            deg.set(e.target, deg.get(e.target) + 1);
        });
        return nodes.map(function(n) {
          return { node: n, degree: deg.get(n.id) || 0 };
        }).filter(function(x) {
          return x.degree > 0;
        }).sort(function(a, b) {
          return b.degree - a.degree;
        }).slice(0, 5);
      }, [nodes, edges]);
      var worstHealth = useMemo(function() {
        return nodes.filter(function(n) {
          return n.data.nodeType === "domain";
        }).map(function(n) {
          var h = healthMap.get(n.id);
          var score = h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
          return { node: n, health: score };
        }).sort(function(a, b) {
          return a.health - b.health;
        }).slice(0, 5);
      }, [nodes, healthMap]);
      var namespaces = useMemo(function() {
        var map = /* @__PURE__ */ new Map();
        nodes.forEach(function(n) {
          if (n.data.nodeType !== "domain")
            return;
          var ns = n.data.domainId.split(".").slice(0, 2).join(".");
          map.set(ns, (map.get(ns) || 0) + 1);
        });
        return Array.from(map.entries()).sort(function(a, b) {
          return b[1] - a[1];
        });
      }, [nodes]);
      var tagCloud = useMemo(function() {
        var m = /* @__PURE__ */ new Map();
        nodes.forEach(function(n) {
          (n.data.tags || []).forEach(function(t) {
            m.set(String(t), (m.get(String(t)) || 0) + 1);
          });
        });
        return Array.from(m.entries()).sort(function(a, b) {
          return b[1] - a[1];
        }).slice(0, 14);
      }, [nodes]);
      var isolatedCount = useMemo(function() {
        var conn = /* @__PURE__ */ new Set();
        edges.forEach(function(e) {
          conn.add(e.source);
          conn.add(e.target);
        });
        return nodes.filter(function(n) {
          return n.data.nodeType === "domain" && !conn.has(n.id);
        }).length;
      }, [nodes, edges]);
      var activeFiltersCount = useMemo(function() {
        var c = 0;
        if (!filters.domain)
          c++;
        if (!filters.missing)
          c++;
        if (!filters.broken)
          c++;
        if (!filters.linkage)
          c++;
        if (!filters.fqid)
          c++;
        if (namespaceFilter && namespaceFilter.trim())
          c++;
        if (tagFilters && tagFilters.size > 0)
          c++;
        if (isolatedOnly)
          c++;
        if (bookmarksOnly)
          c++;
        if (onlyInvalid)
          c++;
        if (hiddenNodeIds && hiddenNodeIds.size > 0)
          c++;
        return c;
      }, [filters, namespaceFilter, tagFilters, isolatedOnly, bookmarksOnly, onlyInvalid, hiddenNodeIds]);
      var searchResults = useMemo(function() {
        var q = searchQuery.trim().toLowerCase();
        if (!q)
          return [];
        return nodes.map(function(n) {
          var d = n.data || {};
          var id = (d.domainId || "").toLowerCase();
          var nm = (d.name || "").toLowerCase();
          var desc = (d.description || "").toLowerCase();
          var tags = Array.isArray(d.tags) ? d.tags.map(function(t) {
            return String(t).toLowerCase();
          }) : [];
          var matches = [];
          if (id.indexOf(q) !== -1)
            matches.push({ field: "id", value: d.domainId });
          if (nm.indexOf(q) !== -1)
            matches.push({ field: "name", value: d.name });
          if (desc.indexOf(q) !== -1)
            matches.push({ field: "description", value: d.description });
          tags.forEach(function(t) {
            if (t.indexOf(q) !== -1)
              matches.push({ field: "tags", value: t });
          });
          var fqidRefs = d.fqidRefs || [];
          var fqidHits = [];
          fqidRefs.forEach(function(r) {
            if (r.fullFQID && r.fullFQID.toLowerCase().indexOf(q) !== -1) {
              fqidHits.push({
                fullFQID: r.fullFQID,
                targetDomainId: r.targetDomainId,
                propertyPath: r.propertyPath
              });
            }
          });
          if (fqidHits.length > 0) {
            matches.push({ field: "fqid", value: fqidHits });
          }
          return matches.length > 0 ? { node: n, matches } : null;
        }).filter(Boolean).sort(function(a, b) {
          var rank = function(r) {
            var f = r.matches.map(function(m) {
              return m.field;
            });
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
      }, [searchQuery, nodes]);
      useEffect(function() {
        setSearchIndex(0);
      }, [searchQuery]);
      useEffect(function() {
        var onMove = function(e) {
          window.__lastMouse = { x: e.clientX, y: e.clientY };
        };
        document.addEventListener("mousemove", onMove);
        return function() {
          document.removeEventListener("mousemove", onMove);
        };
      }, []);
      var navigatingFromHistory = useRef(false);
      var pushNav = useCallback(function(domainId) {
        if (!domainId)
          return;
        setNavStack(function(prev) {
          var trimmed = prev.items.slice(0, prev.index + 1);
          if (trimmed.length > 0 && trimmed[trimmed.length - 1] === domainId)
            return prev;
          var next = trimmed.concat([domainId]);
          if (next.length > 50)
            next = next.slice(next.length - 50);
          return { items: next, index: next.length - 1 };
        });
      }, []);
      var gotoWithoutNav = useCallback(function(domainId) {
        if (!domainId)
          return;
        var nodeId = domainToNodeId.get(domainId.toLowerCase());
        if (!nodeId)
          return;
        var node = nodes.find(function(n) {
          return n.id === nodeId;
        });
        if (!node || !rfInstance.current)
          return;
        var w = compact ? NODE_COMPACT : NODE_WIDTH;
        var h = compact ? NODE_COMPACT : NODE_HEIGHT;
        var cx = node.position.x + w / 2;
        var cy = node.position.y + h / 2;
        var z = Math.max(rfInstance.current.getZoom(), 1.2);
        rfInstance.current.setCenter(cx, cy, { zoom: z, duration: 500 });
        setSelectedNodeId(nodeId);
      }, [domainToNodeId, nodes, compact]);
      var gotoDomainByDomainId2 = useCallback(function(domainId) {
        if (!domainId)
          return;
        var nodeId = domainToNodeId.get(domainId.toLowerCase());
        if (!nodeId)
          return;
        pushNav(domainId);
        setSelectedNodeId(nodeId);
        setFocusNode(nodeId);
        gotoWithoutNav(domainId);
      }, [pushNav, gotoWithoutNav]);
      var navBack = useCallback(function() {
        setNavStack(function(prev) {
          if (prev.index <= 0)
            return prev;
          var newIdx = prev.index - 1;
          var id = prev.items[newIdx];
          if (id)
            setTimeout(function() {
              gotoWithoutNav(id);
            }, 0);
          return { items: prev.items, index: newIdx };
        });
      }, [gotoWithoutNav]);
      var navForward = useCallback(function() {
        setNavStack(function(prev) {
          if (prev.index >= prev.items.length - 1)
            return prev;
          var newIdx = prev.index + 1;
          var id = prev.items[newIdx];
          if (id)
            setTimeout(function() {
              gotoWithoutNav(id);
            }, 0);
          return { items: prev.items, index: newIdx };
        });
      }, [gotoWithoutNav]);
      var openSearch = useCallback(function() {
        setSearchQuery("");
        setSearchIndex(0);
        setSearchOpen(true);
        setTimeout(function() {
          searchInputRef.current && searchInputRef.current.focus();
        }, 50);
      }, []);
      var closeSearch = useCallback(function() {
        setSearchOpen(false);
      }, []);
      var openDetails = useCallback(function(nodeId) {
        setPanelNodeId(nodeId);
        setPanelTab("details");
        setPanelOpen(true);
      }, []);
      var closePanel = useCallback(function() {
        setPanelOpen(false);
      }, []);
      var openFileInEditor = useCallback(function(filePath, fqid) {
        if (!filePath)
          return;
        setEditorFilePath(filePath);
        setPanelTab("file");
        setPanelOpen(true);
        fetch("/file?path=" + encodeURIComponent(filePath)).then(function(r) {
          if (!r.ok)
            throw new Error("HTTP " + r.status);
          return r.text();
        }).then(function(content) {
          setPendingFile({ content, fqid: fqid || null, ts: Date.now() });
        }).catch(function(err) {
          setPendingFile({ content: "// \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B: " + err.message, fqid: null, ts: Date.now() });
        });
      }, []);
      useEffect(function() {
        var handler = function(e) {
          var target = e.target;
          if (!target || typeof target.closest !== "function")
            return;
          var toggleBtn = target.closest(".js-toggle-validation");
          if (toggleBtn) {
            e.stopPropagation();
            e.preventDefault();
            var list = toggleBtn.nextElementSibling;
            if (list && list.classList.contains("tooltip__validation-list")) {
              var isOpen = list.style.display !== "none";
              list.style.display = isOpen ? "none" : "block";
              var arrow = toggleBtn.querySelector(".tooltip__validation-arrow");
              if (arrow)
                arrow.textContent = isOpen ? "\u25B8" : "\u25BE";
            }
            return;
          }
          var openBtn = target.closest(".js-open-file");
          if (openBtn) {
            e.stopPropagation();
            e.preventDefault();
            var file = openBtn.getAttribute("data-file");
            var fqid = openBtn.getAttribute("data-fqid");
            if (file)
              openFileInEditor(file, fqid);
            return;
          }
          var gotoBtn = target.closest(".js-goto-domain");
          if (gotoBtn) {
            e.stopPropagation();
            e.preventDefault();
            var d = gotoBtn.getAttribute("data-domain");
            if (!d)
              return;
            gotoDomainByDomainId2(d);
            setTooltip(null);
            window.__tooltipHovered = false;
            return;
          }
        };
        document.addEventListener("click", handler, true);
        return function() {
          document.removeEventListener("click", handler, true);
        };
      }, [openFileInEditor, gotoDomainByDomainId2]);
      var handleFindCycles = useCallback(function() {
        if (cycleHighlight) {
          setCycleHighlight(null);
          return;
        }
        var info = findCycles(displayNodes, displayEdges);
        if (info.cycleNodes.size === 0) {
          alert("\u0426\u0438\u043A\u043B\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B");
          return;
        }
        setCycleHighlight({ nodeIds: info.cycleNodes, edgeIds: info.cycleEdges, sccCount: info.sccs.length });
        setSelectedNodeId(null);
        setFocusNode(null);
        setPathResult(null);
        setPathSel([]);
        setTimeout(function() {
          rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.25 });
        }, 50);
      }, [displayNodes, displayEdges, cycleHighlight]);
      var handleExportMarkdown = useCallback(function() {
        var md = generateMarkdownReport({
          nodes,
          edges,
          cyclesInfo,
          healthMap,
          namespaceFilter,
          filters
        });
        var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "domain-report-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md";
        a.click();
        URL.revokeObjectURL(url);
      }, [nodes, edges, cyclesInfo, healthMap, namespaceFilter, filters]);
      var handleExportJSON = useCallback(function() {
        var data = {
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          scope: "full",
          stats: { nodes: nodes.length, edges: edges.length },
          nodes: nodes.map(function(n) {
            return {
              id: n.id,
              domainId: n.data.domainId,
              label: n.data.label,
              nodeType: n.data.nodeType,
              filePath: n.data.filePath,
              description: n.data.description,
              tags: n.data.tags
            };
          }),
          edges: edges.map(function(e) {
            return {
              id: e.id,
              source: e.source,
              target: e.target,
              label: e.label,
              kind: e.data && e.data.kind,
              fullLabel: e.data && e.data.fullLabel,
              refCount: e.data && e.data.refCount
            };
          })
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "domain-graph-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".json";
        a.click();
        URL.revokeObjectURL(url);
      }, [nodes, edges]);
      var handleSnapshotUpload = useCallback(function(e) {
        var file = e.target.files[0];
        if (!file)
          return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            var snap = JSON.parse(ev.target.result);
            applySnapshotDiff(snap);
            showSnackbar("\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u043C \u0444\u0430\u0439\u043B\u043E\u043C");
          } catch (err) {
            alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u0447\u0442\u0435\u043D\u0438\u044F \u0441\u043D\u0438\u043C\u043A\u0430: " + err.message);
          }
        };
        reader.readAsText(file);
        e.target.value = "";
      }, [applySnapshotDiff, showSnackbar]);
      var handleNodeClick = useCallback(function(event, node) {
        clearTimeout(hideTimer.current);
        setTooltip(null);
        window.__tooltipHovered = false;
        if (pathMode) {
          if (!pathMode.anchorId) {
            setPathMode({ anchorId: node.id, anchorDomainId: node.data.domainId });
            setPathSel([node.id]);
            return;
          }
          var startId = pathMode.anchorId;
          var endId = node.id;
          if (startId === endId) {
            setPathMode(null);
            setPathSel([]);
            return;
          }
          var res = findPath(startId, endId, filteredEdges);
          if (res) {
            setPathResult(res);
            setPathMode(null);
            setPathSel([]);
          } else {
            alert("\u041F\u0443\u0442\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
            setPathMode(null);
            setPathSel([]);
          }
          return;
        }
        setSelectedEdgeId(null);
        setPathResult(null);
        setPathSel([]);
        setSelectedNodeId(node.id);
        setFocusNode(null);
        pushNav(node.data.domainId);
        if (sidePanelEnabled)
          openDetails(node.id);
      }, [openDetails, pathMode, filteredEdges, pushNav, sidePanelEnabled]);
      var handleNodeDoubleClick = useCallback(function(event, node) {
        if (focusNode === node.id) {
          setFocusNode(null);
        } else {
          setFocusNode(node.id);
          setSelectedNodeId(node.id);
        }
      }, [focusNode]);
      useEffect(function() {
        setSelectedEdgeId(null);
      }, [focusNode, cycleHighlight, pathResult]);
      var handleNodeContextMenu = useCallback(function(event, node) {
        event.preventDefault();
        clearTimeout(hideTimer.current);
        setTooltip(null);
        window.__tooltipHovered = false;
        setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
      }, []);
      var handlePaneContextMenu = useCallback(function(event) {
        event.preventDefault();
      }, []);
      var handlePaneClick = useCallback(function() {
        document.dispatchEvent(new CustomEvent("close-all-popovers"));
        clearTimeout(hideTimer.current);
        setTooltip(null);
        window.__tooltipHovered = false;
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setFocusNode(null);
        setPathResult(null);
        setPathSel([]);
        setPathMode(null);
        setContextMenu(null);
      }, []);
      var handleContextAction = useCallback(function(action, nodeId) {
        var node = nodes.find(function(n) {
          return n.id === nodeId;
        });
        if (!node)
          return;
        if (action === "focus") {
          setFocusNode(nodeId);
          setSelectedNodeId(null);
        } else if (action === "dependents") {
          setFocusNode(nodeId);
          setFocusDepth(3);
        } else if (action === "path-from") {
          setPathMode({ kind: "from", anchorId: nodeId });
          setPathSel([]);
          setPathResult(null);
        } else if (action === "path-to") {
          setPathMode({ kind: "to", anchorId: nodeId });
          setPathSel([]);
          setPathResult(null);
        } else if (action === "open-file") {
          if (node.data.filePath)
            openFileInEditor(node.data.filePath);
        } else if (action === "copy-id") {
          navigator.clipboard.writeText(node.data.domainId);
        } else if (action === "hide") {
          setHiddenNodeIds(function(prev) {
            var s = new Set(prev);
            s.add(nodeId);
            return s;
          });
        } else if (action === "bookmark") {
          toggleBookmark(nodeId);
        }
      }, [nodes, filteredEdges, pathSel, openFileInEditor, setNodes]);
      var handleRunPath = useCallback(function() {
        if (pathSel.length !== 2) {
          alert("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0432\u0430 \u0443\u0437\u043B\u0430 \u0447\u0435\u0440\u0435\u0437 Ctrl+\u043A\u043B\u0438\u043A");
          return;
        }
        var res = findPath(pathSel[0], pathSel[1], filteredEdges);
        if (res)
          setPathResult(res);
        else
          alert("\u041F\u0443\u0442\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      }, [pathSel, filteredEdges]);
      var showTooltipFor = useCallback(function(html, event) {
        clearTimeout(hideTimer.current);
        var x = event.clientX + 16, y = event.clientY + 16;
        setTooltip({
          html,
          x,
          y,
          anchorX: event.clientX,
          anchorY: event.clientY
        });
      }, []);
      var scheduleHideRef = useRef(null);
      var scheduleHide = useCallback(function() {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(function() {
          if (window.__tooltipHovered)
            return;
          var el = document.querySelector(".tooltip");
          var m = window.__lastMouse;
          if (el && m) {
            var rect = el.getBoundingClientRect();
            var pad = 40;
            if (m.x >= rect.left - pad && m.x <= rect.right + pad && m.y >= rect.top - pad && m.y <= rect.bottom + pad) {
              if (scheduleHideRef.current)
                scheduleHideRef.current();
              return;
            }
          }
          setTooltip(null);
        }, 250);
      }, []);
      useEffect(function() {
        scheduleHideRef.current = scheduleHide;
      }, [scheduleHide]);
      useEffect(function() {
        if (!tooltip)
          return;
        var el = document.querySelector(".tooltip");
        if (!el)
          return;
        var rect = el.getBoundingClientRect();
        var margin = 12;
        var gap = 16;
        var ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
        var ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;
        var x = ax + gap;
        var y = ay + gap;
        if (x + rect.width > window.innerWidth - margin) {
          x = ax - rect.width - gap;
        }
        if (y + rect.height > window.innerHeight - margin) {
          y = ay - rect.height - gap;
        }
        if (x < margin)
          x = margin;
        if (y < margin)
          y = margin;
        if (x === tooltip.x && y === tooltip.y)
          return;
        setTooltip(function(t) {
          return t ? Object.assign({}, t, { x, y }) : null;
        });
      }, [tooltip]);
      var handleNodeMouseEnter = useCallback(function(event, node) {
        if (node.type === "clusterNode")
          return;
        if (!tooltipsEnabled)
          return;
        if (pathSel.length > 0 || pathMode)
          return;
        var curZoom = rfInstance.current ? rfInstance.current.getZoom() : 1;
        if (curZoom < 0.15)
          return;
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(function() {
          var key = node.id;
          var html = tooltipCache.current.get(key);
          if (!html) {
            var validation = validationResults ? validationResults.get(node.data.domainId) : null;
            html = buildTooltipHtml(
              node.data.domainId,
              node.data.label,
              node.data.nodeType,
              node.data.filePath,
              node.data.version,
              node.data.entitiesCount,
              node.data.fqidRefs,
              healthMap.get(node.id),
              node.data.description,
              node.data.tags,
              validation,
              node.data.updatedAt,
              node.data.updatedAtSource
            );
            tooltipCache.current.set(key, html);
          }
          showTooltipFor(html, event);
        }, 120);
      }, [showTooltipFor, healthMap, pathSel.length, pathMode, tooltipsEnabled, validationResults]);
      var handleEdgeMouseEnter = useCallback(function(event, edge) {
        if (!tooltipsEnabled)
          return;
        if (pathSel.length > 0 || pathMode)
          return;
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(function() {
          var refs = edge.data && edge.data.fqidRefs || [];
          showTooltipFor(buildEdgeTooltipHtml(edge, refs), event);
        }, 120);
      }, [showTooltipFor, pathSel.length, pathMode, tooltipsEnabled]);
      useEffect(function() {
        var handler = function(e) {
          try {
            var target = e.target;
            if (target) {
              var tag = target.tagName || "";
              if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
                return;
              if (target.isContentEditable === true)
                return;
            }
            var ctrl = e.ctrlKey || e.metaKey;
            var alt = e.altKey;
            var shift = e.shiftKey;
            var code = e.code;
            var k = e.key;
            if (ctrl && !shift && !alt && code === "KeyK") {
              e.preventDefault();
              openSearch();
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
            if (shift && k === "Tab") {
              e.preventDefault();
              if (searchOpen)
                closeSearch();
              else
                openSearch();
              return;
            }
            if (ctrl || alt)
              return;
            if (code === "KeyF") {
              e.preventDefault();
              if (rfInstance.current) {
                try {
                  rfInstance.current.fitView({ duration: 500 });
                } catch (err) {
                }
              }
              return;
            }
            if (code === "KeyC") {
              e.preventDefault();
              handleFindCycles();
              return;
            }
            if (code === "KeyI") {
              e.preventDefault();
              setIsolatedOnly(function(v) {
                return !v;
              });
              return;
            }
            if (code === "KeyS") {
              e.preventDefault();
              setNsMode(function(v) {
                return !v;
              });
              return;
            }
            if (code === "KeyP") {
              e.preventDefault();
              handleRunPath();
              return;
            }
            if (code === "KeyT") {
              e.preventDefault();
              setTooltipsEnabled(function(v) {
                return !v;
              });
              return;
            }
            if (code === "KeyD") {
              e.preventDefault();
              setSidePanelEnabled(function(v) {
                return !v;
              });
              return;
            }
            if (code === "KeyE") {
              e.preventDefault();
              setFilters(function(f) {
                var bothOn = f.linkage && f.fqid;
                if (bothOn)
                  return Object.assign({}, f, { linkage: false, fqid: false });
                return Object.assign({}, f, { linkage: true, fqid: true });
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
              if (focusNode) {
                setFocusNode(null);
              } else {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                setFocusNode(null);
                setPathResult(null);
                setPathSel([]);
                setCycleHighlight(null);
                setContextMenu(null);
                setPathMode(null);
              }
              return;
            }
            if (k === "+" || k === "=") {
              e.preventDefault();
              if (rfInstance.current) {
                try {
                  var currentZoom = rfInstance.current.getZoom();
                  rfInstance.current.zoomTo(currentZoom * 1.3, { duration: 200 });
                } catch (err) {
                }
              }
              return;
            }
            if (k === "-" || k === "_") {
              e.preventDefault();
              if (rfInstance.current) {
                try {
                  var currentZoom2 = rfInstance.current.getZoom();
                  rfInstance.current.zoomTo(currentZoom2 / 1.3, { duration: 200 });
                } catch (err) {
                }
              }
              return;
            }
            if (code === "Digit0" && !ctrl && !alt) {
              e.preventDefault();
              if (rfInstance.current) {
                try {
                  rfInstance.current.fitView({ duration: 300, padding: 0.15 });
                } catch (err) {
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
        return function() {
          document.removeEventListener("keydown", handler, true);
        };
      }, [
        searchOpen,
        openSearch,
        closeSearch,
        navBack,
        navForward,
        handleFindCycles,
        handleRunPath,
        selectedNodeId,
        toggleBookmark
      ]);
      var applyLayout = useCallback(function(type, depth) {
        setNodes(function(prevNodes) {
          if (prevNodes.length === 0)
            return prevNodes;
          var visibleIds = new Set(filteredNodes.map(function(n) {
            return n.id;
          }));
          var layoutInput = prevNodes.filter(function(n) {
            return visibleIds.has(n.id);
          }).map(function(n) {
            return Object.assign({}, n, {
              data: Object.assign({}, n.data, { __compact: compact })
            });
          });
          if (layoutInput.length === 0) {
            return prevNodes.map(function(n) {
              return Object.assign({}, n, { hidden: true });
            });
          }
          var result = runLayout(layoutInput, filteredEdges, type, { depth });
          var posMap = /* @__PURE__ */ new Map();
          result.nodes.forEach(function(n) {
            posMap.set(n.id, n.position);
          });
          setClusterBoxes(type === "cluster" || type === "folder" ? result.boxes || [] : []);
          setClusterGroupCount(type === "cluster" || type === "folder" ? (result.boxes || []).length : 0);
          return prevNodes.map(function(n) {
            var visible = visibleIds.has(n.id);
            var newPos = posMap.get(n.id);
            if (visible && newPos) {
              return Object.assign({}, n, {
                position: newPos,
                hidden: false,
                width: NODE_WIDTH,
                height: NODE_HEIGHT
              });
            }
            return Object.assign({}, n, { hidden: !visible });
          });
        });
        setSelectedEdgeId(null);
      }, [filteredNodes, filteredEdges, compact, setNodes]);
      var scheduleFit = useCallback(function(animate) {
        var delay = 80;
        var duration = animate ? 400 : 0;
        setTimeout(function() {
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              if (rfInstance.current) {
                try {
                  rfInstance.current.fitView({ duration, padding: 0.15 });
                } catch (e) {
                }
              }
            });
          });
        }, delay);
      }, []);
      useEffect(function() {
        applyLayout(layoutType, clusterDepth);
        scheduleFit(!didInitialFitRef.current ? false : true);
        var isFirstFit = !didInitialFitRef.current;
        var doFit = function() {
          if (!rfInstance.current)
            return;
          try {
            rfInstance.current.fitView({
              duration: isFirstFit ? 0 : 500,
              padding: 0.2
            });
            didInitialFitRef.current = true;
          } catch (e) {
          }
        };
        var cleanup = null;
        if (isFirstFit) {
          var t = setTimeout(function() {
            requestAnimationFrame(doFit);
          }, 250);
          cleanup = function() {
            clearTimeout(t);
          };
        } else {
          var raf1 = requestAnimationFrame(function() {
            var raf2 = requestAnimationFrame(doFit);
            cleanup = function() {
              cancelAnimationFrame(raf2);
            };
          });
          cleanup = function() {
            cancelAnimationFrame(raf1);
          };
        }
        return cleanup;
      }, [layoutType, clusterDepth, compact, filteredIdsHash]);
      var panelNode = panelNodeId ? visibleNodes.find(function(n) {
        return n.id === panelNodeId;
      }) || nodes.find(function(n) {
        return n.id === panelNodeId;
      }) : null;
      useEffect(function() {
        if (!panelOpen || panelTab !== "file")
          return;
        if (!panelNode)
          return;
        if (!panelNode.data.filePath)
          return;
        if (editorFilePath === panelNode.data.filePath && pendingFile)
          return;
        openFileInEditor(panelNode.data.filePath);
      }, [panelOpen, panelTab, panelNodeId]);
      var handleEdgeClick = useCallback(function(event, edge) {
        var realId = edge.data && edge.data.originalId || edge.id;
        setSelectedEdgeId(realId);
        if (sidePanelEnabled) {
          setPanelTab("edge");
          setPanelOpen(true);
        }
        clearTimeout(hideTimer.current);
        setTooltip(null);
        window.__tooltipHovered = false;
      }, [sidePanelEnabled]);
      var handleExportPNG = useCallback(function() {
        var flowEl = document.querySelector(".graph-container");
        if (!flowEl) {
          alert("\u0413\u0440\u0430\u0444 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
          return;
        }
        import("https://esm.sh/html-to-image@1.11.11").then(function(mod) {
          var bg = getComputedStyle(document.documentElement).getPropertyValue("--graph-bg").trim() || "#0a0e1a";
          return mod.toPng(flowEl, {
            backgroundColor: bg,
            pixelRatio: 2,
            filter: function(node) {
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
        }).then(function(dataUrl) {
          var a = document.createElement("a");
          a.href = dataUrl;
          a.download = "domain-graph-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".png";
          a.click();
        }).catch(function(err) {
          alert("\u041E\u0448\u0438\u0431\u043A\u0430 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430: " + err.message);
        });
      }, []);
      var activeModes = useMemo(function() {
        var modes = [];
        if (cycleHighlight) {
          modes.push({
            iconName: "cycle",
            label: "\u0426\u0438\u043A\u043B\u044B (" + cycleHighlight.sccCount + ")",
            color: "orange",
            onClear: function() {
              setCycleHighlight(null);
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }
          });
        }
        if (focusNode) {
          var fn = nodes.find(function(n) {
            return n.id === focusNode;
          });
          modes.push({
            iconName: "my_location",
            label: "\u0424\u043E\u043A\u0443\u0441 N=" + focusDepth + (fn ? ": " + fn.data.domainId : ""),
            color: "cyan",
            onClear: function() {
              setFocusNode(null);
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }
          });
        } else if (selectedNodeId) {
          var sn = nodes.find(function(n) {
            return n.id === selectedNodeId;
          });
          modes.push({
            iconName: "visibility",
            label: sn ? sn.data.domainId : "\u0443\u0437\u0435\u043B",
            color: "accent",
            onClear: function() {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }
          });
        }
        if (pathResult || pathSel.length > 0) {
          modes.push({
            iconName: "route",
            label: pathResult ? "\u041F\u0443\u0442\u044C \u043D\u0430\u0439\u0434\u0435\u043D" : "\u0412\u044B\u0431\u043E\u0440 \u043F\u0443\u0442\u0438 (" + pathSel.length + "/2)",
            color: "yellow",
            onClear: function() {
              setPathResult(null);
              setPathSel([]);
              setPathMode(null);
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }
          });
        }
        if (hiddenNodeIds.size > 0) {
          modes.push({
            iconName: "visibility_off",
            label: "\u0421\u043A\u0440\u044B\u0442\u043E: " + hiddenNodeIds.size,
            color: "gray",
            onClear: function() {
              setHiddenNodeIds(/* @__PURE__ */ new Set());
            }
          });
        }
        if (onlyInvalid) {
          modes.push({
            iconName: "cancel",
            label: "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435",
            color: "red",
            onClear: function() {
              setOnlyInvalid(false);
            }
          });
        }
        if (bookmarksOnly) {
          modes.push({
            iconName: "star",
            label: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
            color: "yellow",
            onClear: function() {
              setBookmarksOnly(false);
            }
          });
        }
        if (nsMode) {
          modes.push({
            iconName: "category",
            label: "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
            color: "purple",
            onClear: function() {
              setNsMode(false);
            }
          });
        }
        if (diffMode) {
          modes.push({
            iconName: "swap_horiz",
            label: "Diff +" + (diffMode.addedEdges.size + diffMode.addedNodes.size) + "/\u2212" + (diffMode.removedEdges.size + diffMode.removedNodes.size),
            color: "blue",
            onClear: function() {
              setDiffMode(null);
            }
          });
        }
        if (ruleViolations && ruleViolations.length > 0 && rulesHighlighted) {
          modes.push({
            iconName: "block",
            label: "\u041D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F: " + ruleViolations.length,
            color: "red",
            onClear: function() {
              setRulesHighlighted(false);
            }
          });
        }
        if (!tooltipsEnabled) {
          modes.push({
            iconName: "block",
            label: "\u0422\u0443\u043B\u0442\u0438\u043F\u044B \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u044B",
            color: "gray",
            onClear: function() {
              setTooltipsEnabled(true);
            }
          });
        }
        if (topoLevelMap) {
          modes.push({
            iconName: "inventory_2",
            label: "\u0423\u0440\u043E\u0432\u043D\u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438",
            color: "green",
            onClear: function() {
              setTopoLevelMap(null);
            }
          });
        }
        if (!sidePanelEnabled) {
          modes.push({
            iconName: "block",
            label: "\u041F\u0430\u043D\u0435\u043B\u044C \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
            color: "gray",
            onClear: function() {
              setSidePanelEnabled(true);
            }
          });
        }
        if (!filters.linkage && !filters.fqid) {
          modes.push({
            iconName: "power_off",
            label: "\u0421\u0432\u044F\u0437\u0438 \u0441\u043A\u0440\u044B\u0442\u044B",
            color: "gray",
            onClear: function() {
              setFilters(function(f) {
                return Object.assign({}, f, { linkage: true, fqid: true });
              });
            }
          });
        }
        if (namespaceFilter && namespaceFilter.trim()) {
          modes.push({
            iconName: "filter_alt",
            label: "\u0424\u0438\u043B\u044C\u0442\u0440: " + (namespaceFilter.length > 30 ? namespaceFilter.slice(0, 30) + "\u2026" : namespaceFilter),
            color: "cyan",
            onClear: function() {
              setNamespaceFilter("");
            }
          });
        }
        if (isolatedOnly) {
          modes.push({
            iconName: "radio_button_unchecked",
            label: "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435",
            color: "orange",
            onClear: function() {
              setIsolatedOnly(false);
            }
          });
        }
        if (pathMode) {
          modes.push({
            iconName: "route",
            label: pathMode.anchorId ? "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0442\u043E\u0440\u043E\u0439 \u0443\u0437\u0435\u043B" : "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0443\u0437\u0435\u043B",
            color: "yellow",
            onClear: function() {
              setPathMode(null);
              setPathSel([]);
            }
          });
        }
        if (tagFilters.size > 0) {
          modes.push({
            iconName: "label",
            label: "\u0422\u0435\u0433\u0438: " + Array.from(tagFilters).join(", "),
            color: "purple",
            onClear: function() {
              setTagFilters(/* @__PURE__ */ new Set());
            }
          });
        }
        return modes;
      }, [
        cycleHighlight,
        focusNode,
        focusDepth,
        tagFilters,
        pathResult,
        pathSel,
        pathMode,
        hiddenNodeIds,
        onlyInvalid,
        bookmarksOnly,
        isolatedOnly,
        nsMode,
        diffMode,
        ruleViolations,
        rulesHighlighted,
        tooltipsEnabled,
        showViolationsOnly,
        setRulesHighlighted,
        setShowViolationsOnly,
        sidePanelEnabled,
        namespaceFilter,
        filters.linkage,
        filters.fqid,
        filters.domain,
        filters.missing,
        filters.broken,
        topoLevelMap,
        selectedNodeId,
        nodes
      ]);
      var handleExportStats = useCallback(function() {
        var lines = [];
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
        lines.push("| \u0426\u0438\u043A\u043B\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0433\u0440\u0443\u043F\u043F | " + cyclesInfo.sccs.length + " |");
        lines.push("");
        if (topConnected.length > 0) {
          lines.push("## \u0422\u043E\u043F \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C");
          lines.push("");
          lines.push("| # | \u0414\u043E\u043C\u0435\u043D | \u0421\u0432\u044F\u0437\u0435\u0439 |");
          lines.push("| ---: | --- | ---: |");
          topConnected.forEach(function(item, i) {
            lines.push("| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.degree + " |");
          });
          lines.push("");
        }
        if (worstHealth.length > 0) {
          lines.push("## \u041D\u0438\u0437\u043A\u0438\u0439 health");
          lines.push("");
          lines.push("| # | \u0414\u043E\u043C\u0435\u043D | Health |");
          lines.push("| ---: | --- | ---: |");
          worstHealth.slice(0, 20).forEach(function(item, i) {
            lines.push("| " + (i + 1) + " | `" + item.node.data.domainId + "` | " + item.health + "/100 |");
          });
          lines.push("");
        }
        if (namespaces.length > 0) {
          lines.push("## \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441\u044B");
          lines.push("");
          lines.push("| \u041D\u0435\u0439\u043C\u0441\u043F\u0435\u0439\u0441 | \u0414\u043E\u043C\u0435\u043D\u043E\u0432 |");
          lines.push("| --- | ---: |");
          namespaces.forEach(function(entry) {
            lines.push("| `" + entry[0] + "` | " + entry[1] + " |");
          });
          lines.push("");
        }
        if (tagCloud.length > 0) {
          lines.push("## \u0422\u0435\u0433\u0438");
          lines.push("");
          tagCloud.forEach(function(entry) {
            lines.push("- `" + entry[0] + "` (" + entry[1] + ")");
          });
          lines.push("");
        }
        var md = lines.join("\n");
        var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "domain-stats-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:.]/g, "-") + ".md";
        a.click();
        URL.revokeObjectURL(url);
      }, [nodes, edges, counts, isolatedCount, cyclesInfo, topConnected, worstHealth, namespaces, tagCloud]);
      var commands = useMemo(function() {
        return [
          // Навигация
          {
            section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
            icon: "\u26F6",
            label: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u044D\u043A\u0440\u0430\u043D",
            hotkey: "F",
            keywords: "fit zoom",
            run: function() {
              rfInstance.current && rfInstance.current.fitView({ duration: 500 });
            }
          },
          {
            section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
            icon: "\u27F3",
            label: "\u041F\u0435\u0440\u0435\u0443\u043B\u043E\u0436\u0438\u0442\u044C \u0433\u0440\u0430\u0444",
            keywords: "relayout",
            run: function() {
              setNodes(runLayout(nodes, edges, layoutType));
              setTimeout(function() {
                rfInstance.current && rfInstance.current.fitView({ duration: 500 });
              }, 100);
            }
          },
          {
            section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
            icon: "\u2190",
            label: "\u041D\u0430\u0437\u0430\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
            hotkey: "Alt+\u2190",
            keywords: "back",
            run: navBack
          },
          {
            section: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F",
            icon: "\u2192",
            label: "\u0412\u043F\u0435\u0440\u0451\u0434 \u043F\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
            hotkey: "Alt+\u2192",
            keywords: "forward",
            run: navForward
          },
          // Раскладка
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F4D0}",
            label: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F (LR)",
            keywords: "layout dagre horizontal",
            run: function() {
              setLayoutType("LR");
            }
          },
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F4D0}",
            label: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F (TB)",
            keywords: "layout vertical",
            run: function() {
              setLayoutType("TB");
            }
          },
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F4D0}",
            label: "Force-directed",
            keywords: "layout force physics",
            run: function() {
              setLayoutType("force");
            }
          },
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F4D0}",
            label: "\u041A\u0440\u0443\u0433\u043E\u0432\u0430\u044F",
            keywords: "layout circular circle",
            run: function() {
              setLayoutType("circular");
            }
          },
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F5C2}",
            label: "\u041F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
            keywords: "cluster namespace family layout group",
            run: function() {
              setLayoutType("cluster");
            }
          },
          {
            section: "\u0420\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0430",
            icon: "\u{1F4C1}",
            label: "\u041F\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430\u043C",
            keywords: "folder directory path layout",
            run: function() {
              setLayoutType("folder");
            }
          },
          // Вид
          {
            section: "\u0412\u0438\u0434",
            icon: theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}",
            label: "\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0442\u0435\u043C\u0443",
            keywords: "theme dark light",
            run: function() {
              setTheme(theme === "dark" ? "light" : "dark");
            }
          },
          {
            section: "\u0412\u0438\u0434",
            icon: "\u26AB",
            label: compact ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u043E\u043C\u043F\u0430\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C",
            keywords: "compact small",
            run: function() {
              setCompact(!compact);
            }
          },
          {
            section: "\u0412\u0438\u0434",
            icon: "\u{1F5C2}",
            label: showGroups ? "\u0421\u043A\u0440\u044B\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0443" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0443",
            keywords: "groups boxes",
            run: function() {
              setShowGroups(!showGroups);
            }
          },
          {
            section: "\u0412\u0438\u0434",
            icon: "\u21C4",
            label: bidirectional ? "\u0420\u0430\u0437\u044A\u0435\u0434\u0438\u043D\u0438\u0442\u044C A\u2194B" : "\u041E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u0442\u044C A\u2194B",
            keywords: "bidirectional merge",
            run: function() {
              setBidirectional(!bidirectional);
            }
          },
          {
            section: "\u0412\u0438\u0434",
            icon: "\u{1F3F7}",
            label: showEdgeLabels ? "\u0421\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0441\u0432\u044F\u0437\u0435\u0439",
            keywords: "labels edges",
            run: function() {
              setShowEdgeLabels(!showEdgeLabels);
            }
          },
          {
            section: "\u0412\u0438\u0434",
            icon: tooltipsEnabled ? "\u{1F6AB}" : "\u{1F4AC}",
            label: tooltipsEnabled ? "\u0421\u043A\u0440\u044B\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B" : "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0443\u043B\u0442\u0438\u043F\u044B",
            hotkey: "T",
            keywords: "tooltip hover",
            run: function() {
              setTooltipsEnabled(!tooltipsEnabled);
            }
          },
          // Heatmap
          {
            section: "Heatmap",
            icon: "\u{1F525}",
            label: heatmap === "health" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: Health score",
            keywords: "heatmap health",
            run: function() {
              setHeatmap(heatmap === "health" ? "none" : "health");
            }
          },
          {
            section: "Heatmap",
            icon: "\u{1F525}",
            label: heatmap === "degree" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: \u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0441\u0432\u044F\u0437\u0435\u0439",
            keywords: "heatmap degree",
            run: function() {
              setHeatmap(heatmap === "degree" ? "none" : "degree");
            }
          },
          {
            section: "Heatmap",
            icon: "\u{1F525}",
            label: heatmap === "entities" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: Entities",
            keywords: "heatmap entities",
            run: function() {
              setHeatmap(heatmap === "entities" ? "none" : "entities");
            }
          },
          {
            section: "Heatmap",
            icon: "\u{1F525}",
            label: heatmap === "fqid" ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C heatmap" : "Heatmap: FQID-\u0441\u0441\u044B\u043B\u043A\u0438",
            keywords: "heatmap fqid refs",
            run: function() {
              setHeatmap(heatmap === "fqid" ? "none" : "fqid");
            }
          },
          // Анализ
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F501}",
            label: "\u041D\u0430\u0439\u0442\u0438 \u0446\u0438\u043A\u043B\u044B",
            hotkey: "C",
            keywords: "cycles scc loop",
            run: handleFindCycles
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u25EF",
            label: isolatedOnly ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435",
            hotkey: "I",
            keywords: "isolated orphans",
            run: function() {
              setIsolatedOnly(!isolatedOnly);
            }
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F5C2}",
            label: nsMode ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044E" : "\u0410\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0441\u0435\u043C\u0435\u0439\u0441\u0442\u0432\u0430\u043C",
            hotkey: "S",
            keywords: "namespace aggregate family",
            run: function() {
              setNsMode(!nsMode);
            }
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F4E6}",
            label: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 (\u0442\u043E\u043F\u043E\u0441\u043E\u0440\u0442)",
            keywords: "topo install order",
            run: function() {
              setTopoOpen(true);
            }
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F3AF}",
            label: focusNode ? "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u043E\u043A\u0443\u0441" : "\u0424\u043E\u043A\u0443\u0441 \u043D\u0430 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u043C",
            keywords: "focus",
            run: function() {
              if (focusNode)
                setFocusNode(null);
              else if (selectedNodeId)
                setFocusNode(selectedNodeId);
            }
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F6E4}\uFE0F",
            label: "\u041D\u0430\u0439\u0442\u0438 \u043F\u0443\u0442\u044C \u043C\u0435\u0436\u0434\u0443 \u0434\u0432\u0443\u043C\u044F \u0443\u0437\u043B\u0430\u043C\u0438",
            hotkey: "P",
            keywords: "path find",
            run: handleRunPath
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F4D6}",
            label: tour ? "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u044D\u043A\u0441\u043A\u0443\u0440\u0441\u0438\u044E" : "\u041F\u0443\u0442\u044C \u0438\u0437\u0443\u0447\u0435\u043D\u0438\u044F \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B",
            keywords: "learning path onboarding tour",
            run: function() {
              if (tour)
                tourStop();
              else
                setLearningPathOpen(true);
            }
          },
          {
            section: "\u0410\u043D\u0430\u043B\u0438\u0437",
            icon: "\u{1F9EC}",
            label: "\u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u0441\u0443\u0449\u043D\u043E\u0441\u0442\u0435\u0439",
            keywords: "entity hierarchy inheritance inherits",
            run: function() {
              setEntityHierarchyInitialKey(null);
              setEntityHierarchyOpen(true);
            }
          },
          // Фильтры
          {
            section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
            icon: "\u2605",
            label: bookmarksOnly ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
            keywords: "bookmarks favorites",
            run: function() {
              setBookmarksOnly(!bookmarksOnly);
            }
          },
          {
            section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
            icon: "\u274C",
            label: onlyInvalid ? "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B" : "\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0432\u0430\u043B\u0438\u0434\u043D\u044B\u0435",
            keywords: "invalid errors validation",
            run: function() {
              setOnlyInvalid(!onlyInvalid);
            }
          },
          {
            section: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
            icon: "\u{1F5D1}",
            label: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B",
            keywords: "reset filters clear",
            run: function() {
              setFilters({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
              setNamespaceFilter("");
              setBookmarksOnly(false);
              setOnlyInvalid(false);
              setIsolatedOnly(false);
              setHiddenNodeIds(/* @__PURE__ */ new Set());
            }
          },
          // Данные
          {
            section: "\u0414\u0430\u043D\u043D\u044B\u0435",
            icon: "\u{1F4BE}",
            label: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0433\u0440\u0430\u0444\u0430 \u0432 JSON",
            keywords: "export json download",
            run: handleExportJSON
          },
          {
            section: "\u0414\u0430\u043D\u043D\u044B\u0435",
            icon: "\u{1F4DD}",
            label: "\u041E\u0442\u0447\u0451\u0442 \u0432 Markdown",
            keywords: "export markdown report",
            run: handleExportMarkdown
          },
          {
            section: "\u0414\u0430\u043D\u043D\u044B\u0435",
            icon: "\u{1F5BC}\uFE0F",
            label: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0433\u0440\u0430\u0444\u0430 \u0432 PNG",
            keywords: "export png image",
            run: handleExportPNG
          },
          validationAvailable && {
            section: "\u0414\u0430\u043D\u043D\u044B\u0435",
            icon: "\u{1F50D}",
            label: "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E\u043C\u0435\u043D\u043E\u0432",
            keywords: "validate check",
            run: function() {
              setValidationOpen(true);
            }
          },
          // Справка
          {
            section: "\u0421\u043F\u0440\u0430\u0432\u043A\u0430",
            icon: "\u{1F4D6}",
            label: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
            hotkey: "F1",
            keywords: "guide help docs",
            run: function() {
              setHelpOpen(true);
            }
          },
          {
            section: "\u0421\u043F\u0440\u0430\u0432\u043A\u0430",
            icon: "\u2328\uFE0F",
            label: "\u0421\u043F\u0438\u0441\u043E\u043A \u0433\u043E\u0440\u044F\u0447\u0438\u0445 \u043A\u043B\u0430\u0432\u0438\u0448",
            keywords: "hotkeys shortcuts",
            run: function() {
              setHotkeysOpen(true);
            }
          }
        ].filter(Boolean);
      }, [
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
        nodes,
        edges,
        layoutType,
        navBack,
        navForward,
        handleFindCycles,
        handleRunPath,
        handleExportJSON,
        handleExportMarkdown,
        handleExportPNG
      ]);
      return React.createElement(
        "div",
        { className: "app" },
        React.createElement(Sidebar, {
          collapsed: sidebarCollapsed,
          setCollapsed: setSidebarCollapsed,
          compact: sidebarCompact,
          setCompact: setSidebarCompact,
          nodes,
          edges,
          counts,
          isolatedCount,
          cyclesInfo,
          healthMap,
          validationResults,
          topConnected,
          worstHealth,
          namespaces,
          tagCloud,
          bookmarks,
          cacheDiff: GRAPH_DATA.cacheDiff || null,
          tagFilters,
          collapsedSections,
          toggleSection,
          onGotoDomain: gotoDomainByDomainId2,
          onSetNamespace: function(ns) {
            setNamespaceFilter(ns);
          },
          onToggleTag: toggleTagFilter,
          onToggleBookmark: toggleBookmark,
          setIsolatedOnly,
          setOnlyInvalid,
          setBookmarksOnly,
          setCycleHighlight,
          setSelectedNodeId,
          onFilterMissing: function() {
            setFilters(function(f) {
              return Object.assign({}, f, { domain: false, broken: false, missing: true });
            });
          },
          onFilterBroken: function() {
            setFilters(function(f) {
              return Object.assign({}, f, { domain: false, missing: false, broken: true });
            });
          },
          onFitView: function() {
            rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.15 });
          },
          onExportStats: handleExportStats,
          topMissingRefs,
          activityPeriod,
          setActivityPeriod
        }),
        React.createElement(
          "main",
          { className: "main" },
          React.createElement(
            "div",
            { className: "toolbar" },
            React.createElement(
              "div",
              { className: "toolbar__group" },
              React.createElement("button", { className: "btn btn--icon", onClick: function() {
                rfInstance.current && rfInstance.current.fitView({ duration: 500 });
              }, title: "\u0412\u043F\u0438\u0441\u0430\u0442\u044C (F)" }, "\u26F6"),
              React.createElement("button", {
                className: "btn btn--icon",
                onClick: function() {
                  var result = runLayout(nodes, edges, layoutType, { depth: clusterDepth });
                  setNodes(result.nodes);
                  setTimeout(function() {
                    rfInstance.current && rfInstance.current.fitView({ duration: 500 });
                  }, 100);
                },
                title: "\u041F\u0435\u0440\u0435\u0443\u043B\u043E\u0436\u0438\u0442\u044C"
              }, "\u27F3"),
              React.createElement("button", {
                className: "btn btn--icon",
                onClick: function() {
                  if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0443 \u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F?"))
                    return;
                  setLayoutType("LR");
                  setCompact(false);
                  setSelectedNodeId(null);
                  setFocusNode(null);
                  setCycleHighlight(null);
                  setPathResult(null);
                  setPathSel([]);
                  setTimeout(function() {
                    rfInstance.current && rfInstance.current.fitView({ duration: 500 });
                  }, 200);
                },
                title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0443"
              }, "\u21BA"),
              React.createElement("button", {
                className: "btn btn--icon",
                onClick: function() {
                  if (!confirm("\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B, \u0440\u0435\u0436\u0438\u043C\u044B \u0438 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u044F?"))
                    return;
                  setFilters({ domain: true, missing: true, broken: true, linkage: true, fqid: true });
                  setNamespaceFilter("");
                  setTagFilters(/* @__PURE__ */ new Set());
                  setIsolatedOnly(false);
                  setBookmarksOnly(false);
                  setOnlyInvalid(false);
                  setHiddenNodeIds(/* @__PURE__ */ new Set());
                  setCycleHighlight(null);
                  setFocusNode(null);
                  setPathMode(null);
                  setPathSel([]);
                  setPathResult(null);
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setDiffMode(null);
                  setRulesHighlighted(true);
                  setShowViolationsOnly(false);
                  setLayoutType("LR");
                  applyLayout("LR", 0);
                  setTimeout(function() {
                    rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.15 });
                  }, 200);
                },
                title: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0451"
              }, React.createElement(MIcon, { name: "restart_alt" })),
              React.createElement("button", { className: "btn btn--icon", onClick: navBack, disabled: navStack.index <= 0, style: { opacity: navStack.index <= 0 ? 0.4 : 1 }, title: "\u041D\u0430\u0437\u0430\u0434 (Alt+\u2190)" }, "\u2190"),
              React.createElement("button", { className: "btn btn--icon", onClick: navForward, disabled: navStack.index >= navStack.items.length - 1, style: { opacity: navStack.index >= navStack.items.length - 1 ? 0.4 : 1 }, title: "\u0412\u043F\u0435\u0440\u0451\u0434 (Alt+\u2192)" }, "\u2192")
            ),
            React.createElement(
              "button",
              { className: "btn", onClick: openSearch, title: "\u041F\u043E\u0438\u0441\u043A (Shift+Tab)" },
              React.createElement("span", { className: "btn__icon" }, "\u{1F50D}"),
              "\u041F\u043E\u0438\u0441\u043A",
              React.createElement("kbd", { className: "btn-kbd" }, "\u21E7 Tab")
            ),
            React.createElement(Popover, {
              width: 320,
              trigger: function(open) {
                return React.createElement(
                  "button",
                  {
                    className: "btn" + (open || activeFiltersCount > 0 ? " btn--active" : "")
                  },
                  React.createElement(MIcon, { name: "tune" }),
                  React.createElement("span", { style: { marginLeft: 6 } }, "\u0424\u0438\u043B\u044C\u0442\u0440\u044B"),
                  activeFiltersCount > 0 && React.createElement("span", { className: "btn__badge" }, activeFiltersCount)
                );
              }
            }, function() {
              return React.createElement(FilterMenu, {
                filters,
                setFilters,
                counts,
                namespaceFilter,
                setNamespaceFilter,
                bookmarksOnly,
                setBookmarksOnly,
                onlyInvalid,
                setOnlyInvalid,
                isolatedOnly,
                setIsolatedOnly,
                tooltipsEnabled,
                setTooltipsEnabled,
                sidePanelEnabled,
                setSidePanelEnabled,
                close
              });
            }),
            React.createElement(Popover, {
              width: 280,
              trigger: function(open) {
                var active = open || cycleHighlight || isolatedOnly || nsMode || focusNode;
                return React.createElement(
                  "button",
                  { className: "btn" + (active ? " btn--active" : "") },
                  React.createElement("span", { className: "btn__icon" }, "\u{1F4CA}"),
                  "\u0410\u043D\u0430\u043B\u0438\u0437"
                );
              }
            }, function(close2) {
              return React.createElement(AnalysisMenu, {
                cycleHighlight,
                handleFindCycles,
                isolatedOnly,
                setIsolatedOnly,
                nsMode,
                setNsMode,
                focusDepth,
                setFocusDepth,
                focusNode,
                clearFocus: function() {
                  setFocusNode(null);
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                },
                onOpenTopo: function() {
                  setTopoOpen(true);
                },
                onOpenLearningPath: function() {
                  setLearningPathOpen(true);
                },
                onStartPathFinder: function() {
                  setPathMode({ anchorId: null });
                  setPathSel([]);
                  setPathResult(null);
                },
                onOpenEntityHierarchy: function() {
                  setEntityHierarchyInitialKey(null);
                  setEntityHierarchyOpen(true);
                },
                onOpenRules: function() {
                  setRulesOpen(true);
                },
                // ← добавили
                ruleViolations,
                close: close2
              });
            }),
            React.createElement(Popover, {
              width: 300,
              trigger: function(open) {
                return React.createElement(
                  "button",
                  { className: "btn" + (open ? " btn--active" : "") },
                  React.createElement("span", { className: "btn__icon" }, "\u{1F3A8}"),
                  "\u0412\u0438\u0434"
                );
              }
            }, function(close2) {
              return React.createElement(ViewMenu, {
                layoutType,
                setLayoutType,
                compact,
                setCompact,
                showGroups,
                setShowGroups,
                bidirectional,
                setBidirectional,
                showEdgeLabels,
                setShowEdgeLabels,
                heatmap,
                setHeatmap,
                theme,
                setTheme,
                clusterDepth,
                setClusterDepth,
                clusterGroupCount,
                close: close2
              });
            }),
            React.createElement(Popover, {
              width: 260,
              trigger: function(open) {
                return React.createElement(
                  "button",
                  { className: "btn" + (open || diffMode ? " btn--active" : "") },
                  React.createElement("span", { className: "btn__icon" }, "\u{1F4BE}"),
                  "\u0414\u0430\u043D\u043D\u044B\u0435"
                );
              }
            }, function(close2) {
              return React.createElement(DataMenu, {
                handleExportJSON,
                handleExportMarkdown,
                handleExportPNG,
                snapshotInputRef,
                handleSnapshotUpload,
                diffMode,
                setDiffMode,
                validationAvailable,
                handleExportMermaid,
                onOpenValidation: function() {
                  setValidationOpen(true);
                },
                snapshotA,
                snapshotB,
                onSaveA: function() {
                  handleSaveSnapshot("A");
                },
                onSaveB: function() {
                  handleSaveSnapshot("B");
                },
                onLoadA: function() {
                  handleLoadSnapshot("A");
                },
                onLoadB: function() {
                  handleLoadSnapshot("B");
                },
                onClearA: function() {
                  handleClearSnapshot("A");
                },
                onClearB: function() {
                  handleClearSnapshot("B");
                },
                close: close2
              });
            }),
            React.createElement("div", { className: "toolbar__spacer" }),
            REMOTE_INFO && REMOTE_INFO.server && REMOTE_INFO.fetchedAt && React.createElement(
              "div",
              {
                className: "toolbar__cache",
                title: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A: " + REMOTE_INFO.server + "\n\u041E\u0431\u043D\u043E\u0432\u043B\u0451\u043D: " + new Date(REMOTE_INFO.fetchedAt).toLocaleString("ru-RU"),
                onClick: function() {
                  setToastVisible(true);
                }
              },
              React.createElement(MIcon, { name: "database", size: "sm" }),
              React.createElement("span", null, "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E " + relativeTime(REMOTE_INFO.fetchedAt))
            ),
            React.createElement("button", {
              className: "btn btn--icon",
              onClick: function() {
                setHotkeysOpen(true);
              },
              title: "\u0413\u043E\u0440\u044F\u0447\u0438\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 (?)"
            }, "\u2328\uFE0F"),
            React.createElement("button", {
              className: "btn btn--icon",
              onClick: function() {
                setHelpOpen(true);
              },
              title: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F (F1)"
            }, "\u{1F4D6}"),
            React.createElement(
              "div",
              { className: "toolbar__stats" },
              visibleNodes.length + " / " + nodes.length + " \u0443\u0437\u043B\u043E\u0432 \xB7 " + visibleEdges.length + " / " + edges.length + " \u0441\u0432\u044F\u0437\u0435\u0439"
            )
          ),
          React.createElement(ActiveModesBar, { modes: activeModes }),
          React.createElement(
            "div",
            { className: "graph-container" + (showEdgeLabels ? " show-labels" : "") },
            React.createElement(
              ReactFlowProvider,
              null,
              React.createElement(ReactFlowInner, {
                nodes: visibleNodes,
                edges: displayEdges,
                onNodesChange,
                onEdgesChange,
                onEdgeClick: handleEdgeClick,
                onNodeClick: handleNodeClick,
                onNodeDoubleClick: handleNodeDoubleClick,
                onNodeContextMenu: handleNodeContextMenu,
                onNodeMouseEnter: handleNodeMouseEnter,
                onNodeMouseLeave: scheduleHide,
                onEdgeMouseEnter: handleEdgeMouseEnter,
                onEdgeMouseLeave: scheduleHide,
                onPaneClick: handlePaneClick,
                onPaneContextMenu: handlePaneContextMenu,
                setRfInstance,
                readOnly: nsMode,
                perfMode
              }),
              (layoutType === "cluster" || layoutType === "folder" || topoLevelMap) && clusterBoxes.length > 0 && React.createElement(GroupsOverlay, {
                boxes: clusterBoxes
              })
            ),
            visibleNodes.length === 0 && React.createElement(
              "div",
              { className: "empty-state" },
              React.createElement(
                "div",
                { className: "empty-state__icon" },
                React.createElement(MIcon, { name: "search_off", size: "xl" })
              ),
              React.createElement("div", { className: "empty-state__title" }, "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E"),
              React.createElement(
                "div",
                { className: "empty-state__text" },
                "\u041F\u043E\u0434 \u0442\u0435\u043A\u0443\u0449\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043D\u0438 \u043E\u0434\u0438\u043D \u0434\u043E\u043C\u0435\u043D."
              ),
              React.createElement(
                "div",
                { className: "empty-state__actions" },
                namespaceFilter && React.createElement("button", {
                  className: "btn",
                  onClick: function() {
                    setNamespaceFilter("");
                  }
                }, "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C namespace"),
                tagFilters.size > 0 && React.createElement("button", {
                  className: "btn",
                  onClick: function() {
                    setTagFilters(/* @__PURE__ */ new Set());
                  }
                }, "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0442\u0435\u0433\u0438"),
                React.createElement("button", {
                  className: "btn btn--primary",
                  onClick: function() {
                  }
                }, "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u0451")
              )
            ),
            React.createElement(SidePanel, {
              open: panelOpen,
              tab: panelTab,
              setTab: setPanelTab,
              node: panelNode,
              edge: panelEdge,
              filePath: editorFilePath,
              pendingFile,
              editorRef,
              onClose: closePanel,
              allNodes: nodes,
              allEdges: edges,
              onGotoDomain: gotoDomainByDomainId2,
              onOpenFile: function(p) {
                openFileInEditor(p);
              },
              entities: GRAPH_DATA.entities || [],
              entityIndex,
              onOpenEntityHierarchy: function(key) {
                setEntityHierarchyInitialKey(key);
                setEntityHierarchyOpen(true);
              },
              ruleViolations
            }),
            heatmap !== "none" && heatmapValues && React.createElement(
              "div",
              { className: "heat-legend" },
              React.createElement("div", { className: "heat-legend__title" }, "Heatmap: " + heatmapValues.scheme.label),
              React.createElement("div", { className: "heat-legend__bar" }),
              React.createElement(
                "div",
                { className: "heat-legend__labels" },
                React.createElement("span", null, heatmapValues.min),
                React.createElement("span", null, heatmapValues.max)
              ),
              React.createElement("button", { className: "heat-legend__close", onClick: function() {
                setHeatmap("none");
              } }, "\u2715")
            )
          )
        ),
        React.createElement(HoverTooltip, { tooltip, onHide: scheduleHide }),
        React.createElement(SearchModal, {
          open: searchOpen,
          query: searchQuery,
          setQuery: setSearchQuery,
          results: searchResults,
          commands,
          index: searchIndex,
          setIndex: setSearchIndex,
          onSelect: function(domainId) {
            gotoDomainByDomainId2(domainId);
            closeSearch();
          },
          onClose: closeSearch,
          inputRef: searchInputRef
        }),
        React.createElement(HelpModal, {
          open: helpOpen,
          onClose: function() {
            setHelpOpen(false);
          }
        }),
        React.createElement(HotkeysModal, {
          open: hotkeysOpen,
          onClose: function() {
            setHotkeysOpen(false);
          }
        }),
        React.createElement(ValidationModal, {
          open: validationOpen,
          onClose: function() {
            setValidationOpen(false);
          },
          allDomains: allDomainsList,
          visibleDomains: visibleDomainsList,
          bookmarkedDomains: bookmarkedDomainsList,
          onGotoDomain: gotoDomainByDomainId2,
          onResults: handleValidationResults
        }),
        React.createElement(TopoSortModal, {
          open: topoOpen,
          onClose: function() {
            setTopoOpen(false);
          },
          allNodes: nodes,
          allEdges: edges,
          allDomains: allDomainsList,
          visibleDomains: visibleDomainsList,
          bookmarkedDomains: bookmarkedDomainsList,
          onGotoDomain: gotoDomainByDomainId2,
          onApplyLevels: function(levelMap) {
            setTopoLevelMap(levelMap);
          }
        }),
        React.createElement(EntityHierarchyModal, {
          open: entityHierarchyOpen,
          onClose: function() {
            setEntityHierarchyOpen(false);
            setEntityHierarchyInitialKey(null);
          },
          entities: GRAPH_DATA.entities || [],
          initialEntityKey: entityHierarchyInitialKey,
          onGotoDomain: gotoDomainByDomainId2
        }),
        React.createElement(LearningPathModal, {
          open: learningPathOpen,
          onClose: function() {
            setLearningPathOpen(false);
          },
          allNodes: nodes,
          allEdges: edges,
          visibleDomains: visibleDomainsList,
          bookmarkedDomains: bookmarkedDomainsList,
          onGotoDomain: gotoDomainByDomainId2,
          onStartTour: startTour
        }),
        React.createElement(TourOverlay, {
          tour,
          onPrev: tourPrev,
          onNext: tourNext,
          onTogglePlay: tourTogglePlay,
          onStop: tourStop
        }),
        React.createElement(ContextMenu, { menu: contextMenu, onClose: function() {
          setContextMenu(null);
        }, onAction: handleContextAction }),
        toastVisible && REMOTE_INFO && REMOTE_INFO.fromCache && React.createElement(Toast, {
          message: "\u{1F4E6} \u0413\u0440\u0430\u0444 \u043F\u043E\u0441\u0442\u0440\u043E\u0435\u043D \u0438\u0437 <b>\u043A\u044D\u0448\u0430</b>" + (REMOTE_INFO.fetchedAt ? " (\u043E\u0442 " + new Date(REMOTE_INFO.fetchedAt).toLocaleString("ru-RU") + ")" : "") + ". \u0414\u0430\u043D\u043D\u044B\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u043C\u0438.",
          actions: REFRESH_COMMAND ? [{ command: REFRESH_COMMAND }] : [],
          duration: 15e3,
          onClose: function() {
            setToastVisible(false);
          }
        }),
        rulesOpen && React.createElement(
          "div",
          { className: "help-overlay", onMouseDown: function() {
            setRulesOpen(false);
          } },
          React.createElement(
            "div",
            { className: "help-modal rules-modal", onMouseDown: function(e) {
              e.stopPropagation();
            } },
            React.createElement(
              "div",
              { className: "help-modal__header" },
              React.createElement(
                "div",
                { className: "help-modal__title" },
                "\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0435\u0439",
                ruleViolations.length > 0 && React.createElement("span", { className: "help-modal__badge" }, ruleViolations.length)
              ),
              React.createElement("button", { className: "help-modal__close", onClick: function() {
                setRulesOpen(false);
              } }, "\u2715")
            ),
            rulesOpen && React.createElement(RulesModal, {
              open: rulesOpen,
              onClose: function() {
                setRulesOpen(false);
              },
              rules,
              setRules,
              violations: ruleViolations,
              rulesHighlighted,
              setRulesHighlighted,
              showViolationsOnly,
              setShowViolationsOnly,
              onGotoDomain: gotoDomainByDomainId2
            }),
            React.createElement(Snackbar, { snackbar })
          )
        )
      );
    }
    var root = createRoot(document.getElementById("root"));
    root.render(React.createElement(App));
  }
});

// src/web/entry.tsx
var require_entry = __commonJS({
  "src/web/entry.tsx"() {
    var import_app = __toESM(require_app());
  }
});
export default require_entry();
//# sourceMappingURL=web.bundle.js.map
