import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, useNodesState, useEdgesState,
  useReactFlow, useViewport, useStore
} from 'reactflow';
import dagre from 'dagre';

const GRAPH_DATA = JSON.parse(document.getElementById('graph-data').textContent);
const REMOTE_INFO = (function() {
  try { return JSON.parse(document.getElementById('remote-info').textContent); } catch (e) { return null; }
})();
const REFRESH_COMMAND = (function() {
  try { return JSON.parse(document.getElementById('refresh-command').textContent); } catch (e) { return null; }
})();
var NODE_WIDTH = 300;      // было 220/260
var NODE_HEIGHT = 88;      // было 60/76
var NODE_COMPACT = 42;     // было 28/36
const EDGE_COLOR = '#10b981';
const LINKAGE_COLOR = '#6366a1';
const FQID_COLOR = '#4b7c6c';
const PATH_COLOR = '#fbbf24';
const DIFF_ADDED = '#22c55e';
const DIFF_REMOVED = '#ef4444';

function MIcon(props) {
  var cls = 'material-symbols-outlined';
  if (props.size === 'sm') cls += ' mi-sm';
  else if (props.size === 'lg') cls += ' mi-lg';
  else if (props.size === 'xl') cls += ' mi-xl';
  else cls += ' mi-md';
  if (props.fill) cls += ' mi-fill';
  if (props.className) cls += ' ' + props.className;
  return React.createElement('span', {
    className: cls,
    'aria-hidden': 'true',
    title: props.title || undefined
  }, props.name);
}

// ============ LAYOUTS ============
function clusterLayout(nodes, edges, getKeyForDepth) {
  var NODE_W = NODE_WIDTH;
  var NODE_H = NODE_HEIGHT;
  var CLUSTER_PAD = 36;
  var HEADER_H = 30;
  var MAX_GROUPS = 50;

  // Пробуем разные глубины 1..5, чтобы групп было не больше MAX_GROUPS
  var effectiveDepth = 2;
  for (var d = 1; d <= 5; d++) {
    var cnt = new Set();
    nodes.forEach(function(n) {
      if (n.data && n.data.nodeType === 'domain') {
        var key = getKeyForDepth(n, d);
        if (key) cnt.add(key);
      }
    });
    effectiveDepth = d;
    if (cnt.size <= MAX_GROUPS) break;
  }

  var groups = new Map();
  var nodeToNs = new Map();
  nodes.forEach(function(n) {
    if (!n.data || n.data.nodeType !== 'domain') {
      var key = '__other__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
      nodeToNs.set(n.id, key);
      return;
    }
    var ns = getKeyForDepth(n, effectiveDepth);
    if (!groups.has(ns)) groups.set(ns, []);
    groups.get(ns).push(n);
    nodeToNs.set(n.id, ns);
  });

  // Внутренний layout каждой группы
  var groupLayouts = new Map();
  groups.forEach(function(groupNodes, ns) {
    if (ns === '__other__') {
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
        nodes: groupNodes.map(function(n) { return Object.assign({}, n, { __x: 0, __y: 0 }); }),
        width: NODE_W,
        height: NODE_H,
        label: ns
      });
      return;
    }

    var g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(function() { return {}; });
    g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 60, marginx: 10, marginy: 10 });

    var ids = new Set(groupNodes.map(function(n) { return n.id; }));
    groupNodes.forEach(function(n) { g.setNode(n.id, { width: NODE_W, height: NODE_H }); });
    edges.forEach(function(e) {
      if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
    });

    dagre.layout(g);

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var raw = groupNodes.map(function(n) {
      var pos = g.node(n.id);
      var x = pos.x - NODE_W / 2;
      var y = pos.y - NODE_H / 2;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_W); maxY = Math.max(maxY, y + NODE_H);
      return { node: n, x: x, y: y };
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

  // Мета-граф
  var metaEdgesMap = new Map();
  edges.forEach(function(e) {
    var sNs = nodeToNs.get(e.source);
    var tNs = nodeToNs.get(e.target);
    if (!sNs || !tNs || sNs === tNs) return;
    metaEdgesMap.set(sNs + '→' + tNs, 1);
  });

  var meta = new dagre.graphlib.Graph();
  meta.setDefaultEdgeLabel(function() { return {}; });
  meta.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  groupLayouts.forEach(function(layout, ns) {
    var w = layout.width + (layout.label ? CLUSTER_PAD * 2 : 0);
    var h = layout.height + (layout.label ? CLUSTER_PAD * 2 + HEADER_H : 0);
    meta.setNode(ns, { width: w, height: h });
  });
  metaEdgesMap.forEach(function(_, key) {
    var p = key.split(React.createElement(MIcon, { name: 'arrow_forward' }));
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
        targetPosition: 'left',
        sourcePosition: 'right'
      }));
    });
  });

  return { nodes: finalNodes, boxes: boxes, effectiveDepth: effectiveDepth };
}
function dagreLayout(nodes, edges, rankdir) {
  rankdir = rankdir || 'LR';
  var W = (typeof NODE_WIDTH === 'number' && isFinite(NODE_WIDTH)) ? NODE_WIDTH : 220;
  var H = (typeof NODE_HEIGHT === 'number' && isFinite(NODE_HEIGHT)) ? NODE_HEIGHT : 60;
  var CW = (typeof NODE_COMPACT === 'number' && isFinite(NODE_COMPACT)) ? NODE_COMPACT : 28;

  var g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(function() { return {}; });
  g.setGraph({ rankdir: rankdir, nodesep: 18, ranksep: 60, edgesep: 10, marginx: 40, marginy: 40 });

  var validNodes = nodes.filter(function(n) {
    return n && typeof n.id === 'string' && n.id.length > 0;
  });

  validNodes.forEach(function(n) {
    var isCompact = n.data && n.data.__compact;
    g.setNode(n.id, {
      width: isCompact ? CW : W,
      height: isCompact ? CW : H
    });
  });

  var validIds = new Set(validNodes.map(function(n) { return n.id; }));
  edges.forEach(function(e) {
    if (!e || !e.source || !e.target) return;
    if (!validIds.has(e.source) || !validIds.has(e.target)) return;
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return validNodes.map(function(n) {
    var pos = g.node(n.id);
    var isCompact = n.data && n.data.__compact;
    var w = isCompact ? CW : W;
    var h = isCompact ? CW : H;

    var x = (pos && typeof pos.x === 'number' && isFinite(pos.x)) ? pos.x - w / 2 : 0;
    var y = (pos && typeof pos.y === 'number' && isFinite(pos.y)) ? pos.y - h / 2 : 0;

    return Object.assign({}, n, {
      position: { x: x, y: y },
      width: w,        // ← добавили
      height: h,       // ← добавили
      targetPosition: rankdir === 'LR' ? 'left' : 'top',
      sourcePosition: rankdir === 'LR' ? 'right' : 'bottom'
    });
  });
}

function circularLayout(nodes) {
  var n = nodes.length;
  var R = Math.max(350, n * 40);
    var W = (typeof NODE_WIDTH === 'number' && isFinite(NODE_WIDTH)) ? NODE_WIDTH : 220;
  var H = (typeof NODE_HEIGHT === 'number' && isFinite(NODE_HEIGHT)) ? NODE_HEIGHT : 60;
  var CW = (typeof NODE_COMPACT === 'number' && isFinite(NODE_COMPACT)) ? NODE_COMPACT : 28;
  return nodes.map(function(node, i) {
    var angle = (i / n) * 2 * Math.PI - Math.PI / 2;
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
        width: w,        // ← добавили
        height: h,       // ← добавили
        targetPosition: 'left',
        sourcePosition: 'right'
      });
    }
  );
}

function forceLayout(nodes, edges) {
  var n = nodes.length;
  var pos = nodes.map(function(_, i) {
    var a = (i / n) * 2 * Math.PI;
    return { x: Math.cos(a) * 400, y: Math.sin(a) * 400 };
  });
  var idx = new Map();
  nodes.forEach(function(node, i) { idx.set(node.id, i); });
  var links = edges.map(function(e) { return [idx.get(e.source), idx.get(e.target)]; })
                    .filter(function(l) { return l[0] != null && l[1] != null; });
  for (var iter = 0; iter < 250; iter++) {
    var fx = new Array(n).fill(0);
    var fy = new Array(n).fill(0);
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var dx = pos[j].x - pos[i].x;
        var dy = pos[j].y - pos[i].y;
        var d2 = dx * dx + dy * dy + 0.01;
        var d = Math.sqrt(d2);
        var f = 8000 / d2;
        fx[i] -= (dx / d) * f; fy[i] -= (dy / d) * f;
        fx[j] += (dx / d) * f; fy[j] += (dy / d) * f;
      }
    }
    for (var k = 0; k < links.length; k++) {
      var a = links[k][0], b = links[k][1];
      var ddx = pos[b].x - pos[a].x;
      var ddy = pos[b].y - pos[a].y;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
      var ff = (dd - 200) * 0.02;
      fx[a] += (ddx / dd) * ff; fy[a] += (ddy / dd) * ff;
      fx[b] -= (ddx / dd) * ff; fy[b] -= (ddy / dd) * ff;
    }
    var alpha = 1 - iter / 250;
    for (var m = 0; m < n; m++) {
      pos[m].x += fx[m] * alpha * 0.5;
      pos[m].y += fy[m] * alpha * 0.5;
    }
  }
    var W = (typeof NODE_WIDTH === 'number' && isFinite(NODE_WIDTH)) ? NODE_WIDTH : 220;
  var H = (typeof NODE_HEIGHT === 'number' && isFinite(NODE_HEIGHT)) ? NODE_HEIGHT : 60;
  var CW = (typeof NODE_COMPACT === 'number' && isFinite(NODE_COMPACT)) ? NODE_COMPACT : 28;

  return nodes.map(function(node, i) {
     var isCompact = n.data && n.data.__compact;
      var w = isCompact ? CW : W;
    var h = isCompact ? CW : H;
    return Object.assign({}, node, {
      position: { x: isFinite(pos[i].x) ? pos[i].x : i * 250, y: isFinite(pos[i].y) ? pos[i].y : 0 },
      targetPosition: 'left',
      sourcePosition: 'right',
      width: w,        // ← добавили
      height: h,       // ← добавили
    });
  });
}

function getFolderKey(n, depth) {
  var fp = (n.data && n.data.folderPath) || [];
  if (fp.length === 0) return '__root__';
  return fp.slice(0, depth).join('/') || '__root__';
}

function runLayout(nodes, edges, type, opts) {
  if (type === 'TB') return { nodes: dagreLayout(nodes, edges, 'TB'), boxes: [], effectiveDepth: null };
  if (type === 'force') return { nodes: forceLayout(nodes, edges), boxes: [], effectiveDepth: null };
  if (type === 'circular') return { nodes: circularLayout(nodes), boxes: [], effectiveDepth: null };
  if (type === 'cluster') {
    var result = clusterLayout(nodes, edges, getNsByDomainId);
    return { nodes: result.nodes, boxes: result.boxes, effectiveDepth: result.effectiveDepth };
  }
  if (type === 'folder') {
    var result2 = clusterLayout(nodes, edges, getFolderKey);
    return { nodes: result2.nodes, boxes: result2.boxes, effectiveDepth: result2.effectiveDepth };
  }
  return { nodes: dagreLayout(nodes, edges, 'LR'), boxes: [], effectiveDepth: null };
}

// ============ UTILS ============
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function HighlightedText(props) {
  var text = props.text;
  var query = props.query;
  if (text === null || text === undefined) return null;
  var str = String(text);
  var q = (query || '').trim();
  if (!q) return str;
  var lower = str.toLowerCase();
  var qLower = q.toLowerCase();
  var parts = [];
  var pos = 0;
  var idx = lower.indexOf(qLower, pos);
  var key = 0;
  while (idx !== -1) {
    if (idx > pos) parts.push(str.slice(pos, idx));
    parts.push(React.createElement('mark', { key: 'm' + key++, className: 'search-hl' }, str.slice(idx, idx + q.length)));
    pos = idx + q.length;
    idx = lower.indexOf(qLower, pos);
  }
  if (pos < str.length) parts.push(str.slice(pos));
  return React.createElement(React.Fragment, null, ...parts);
}

function matchesNamespace(domainId, filterPattern) {
  if (!filterPattern || filterPattern.trim() === '') return true;
  var tokens = filterPattern.replace(/[,;]/g, ' ').split(' ').filter(function(p) { return p.length > 0; }).map(function(p) { return p.toLowerCase(); });
  if (tokens.length === 0) return true;
  var id = domainId.toLowerCase();
  var include = tokens.filter(function(t) { return t.charAt(0) !== '!'; });
  var exclude = tokens.filter(function(t) { return t.charAt(0) === '!'; }).map(function(t) { return t.slice(1); }).filter(function(t) { return t.length > 0; });
  for (var i = 0; i < exclude.length; i++) {
    if (simplePatternMatch(id, exclude[i])) return false;
  }
  if (include.length === 0) return true;
  for (var j = 0; j < include.length; j++) {
    if (simplePatternMatch(id, include[j])) return true;
  }
  return false;
}

function simplePatternMatch(domainId, pattern) {
  if (pattern.indexOf('*') !== -1) {
    var parts = pattern.split('*');
    if (parts[0]) {
      var prefix = parts[0];
      var prefixNoDot = prefix.charAt(prefix.length - 1) === '.' ? prefix.slice(0, -1) : prefix;
      if (domainId.indexOf(prefix) !== 0 && domainId !== prefixNoDot) return false;
    }
    if (parts[parts.length - 1]) {
      var last = parts[parts.length - 1];
      if (domainId.lastIndexOf(last) !== domainId.length - last.length) return false;
    }
    var pos = parts[0] ? parts[0].length : 0;
    for (var i = 1; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      var found = domainId.indexOf(parts[i], pos);
      if (found === -1) return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  return domainId === pattern || domainId.indexOf(pattern + '.') === 0;
}

// ============ GRAPH ANALYSIS ============
function buildDependencyGraph(nodes, edges, options) {
  var opts = options || {};
  var includeFqid = opts.includeFqid !== false;
  var includeLinkage = opts.includeLinkage !== false;
  var missingAsSatisfied = opts.missingAsSatisfied !== false;
  var excludedIds = opts.excludedIds || new Set();
  var restrictTo = opts.restrictTo || null;

  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });

  var deps = new Map();
  var domainIds = new Set();

  nodes.forEach(function(n) {
    if (n.data.nodeType !== 'domain') return;
    var did = n.data.domainId;
    if (excludedIds.has(did.toLowerCase())) return;
    if (restrictTo && !restrictTo.has(did)) return;
    domainIds.add(did);
    deps.set(did, new Set());
  });

  edges.forEach(function(e) {
    var kind = e.data && e.data.kind;
    if (kind === 'linkage' && !includeLinkage) return;
    if (kind === 'fqid' && !includeFqid) return;
    if (kind === 'aggregated') return;

    var srcNode = nodeById.get(e.source);
    var tgtNode = nodeById.get(e.target);
    if (!srcNode || !tgtNode) return;
    if (srcNode.data.nodeType !== 'domain') return;

    var srcId = srcNode.data.domainId;
    if (!domainIds.has(srcId)) return;

    var tgtType = tgtNode.data.nodeType;
    if (tgtType === 'broken') return;
    if (tgtType === 'missing') return;

    var tgtId = tgtNode.data.domainId;
    if (!domainIds.has(tgtId)) return;
    if (srcId === tgtId) return;

    deps.get(srcId).add(tgtId);
  });

  return { deps: deps, domainIds: domainIds, nodeById: nodeById };
}

function topologicalSort(depGraph, options) {
  var opts = options || {};
  var autoBreak = !!opts.autoBreakCycles;

  var deps = depGraph.deps;
  var remaining = new Set(depGraph.domainIds);
  var levels = [];
  var broken = [];  // { id, level, reason }

  while (remaining.size > 0) {
    var level = [];
    var ready = [];

    remaining.forEach(function(id) {
      var ready_flag = true;
      var depsSet = deps.get(id);
      if (depsSet) {
        depsSet.forEach(function(dep) {
          if (remaining.has(dep)) ready_flag = false;
        });
      }
      if (ready_flag) ready.push(id);
    });

    if (ready.length === 0) {
      if (!autoBreak) break;

      // Автоматический разрыв цикла:
      // выбираем узел с наименьшим количеством зависимостей внутри remaining
      var best = null;
      var bestCount = Infinity;
      remaining.forEach(function(id) {
        var cnt = 0;
        var s = deps.get(id);
        if (s) s.forEach(function(dep) { if (remaining.has(dep)) cnt++; });
        if (cnt < bestCount) { bestCount = cnt; best = id; }
      });

      if (best == null) break;

      // Разрываем все его внутренние зависимости
      var brokenDeps = [];
      var s = deps.get(best);
      if (s) {
        s.forEach(function(dep) {
          if (remaining.has(dep)) brokenDeps.push(dep);
        });
        brokenDeps.forEach(function(dep) { s.delete(dep); });
      }

      broken.push({ id: best, level: levels.length + 1, brokenDeps: brokenDeps });
      remaining.delete(best);
      level.push(best);

      // Продолжаем — после разрыва может освободиться ещё кто-то в этом же уровне
      continue;
    }

    ready.forEach(function(id) { remaining.delete(id); });
    levels.push(ready.sort());
  }

  var cyclic = Array.from(remaining).sort();
  return {
    levels: levels,
    cyclic: cyclic,
    criticalPath: levels.length,
    broken: broken
  };
}

function computeLearningPath(nodes, edges, options) {
  var opts = options || {};
  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });

  var domainNodes = nodes.filter(function(n) { return n.data.nodeType === 'domain'; });
  var fanIn = new Map();
  var fanOut = new Map();
  domainNodes.forEach(function(n) { fanIn.set(n.id, 0); fanOut.set(n.id, 0); });

  edges.forEach(function(e) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source) + 1);
    if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target) + 1);
  });

  // Точки входа — домены с низким fan-in и ненулевым fan-out.
  // "Фундамент" — низкий fan-out, высокий fan-in. Читать начинают с фундамента.
  var entryPoints = domainNodes.filter(function(n) {
    var fi = fanIn.get(n.id) || 0;
    var fo = fanOut.get(n.id) || 0;
    return fi === 0 && fo > 0;
  });

  // Топосорт: сначала слои, в которых нет зависимостей от других
  var deps = new Map();
  domainNodes.forEach(function(n) { deps.set(n.id, new Set()); });
  edges.forEach(function(e) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    var src = nodeById.get(e.source);
    var tgt = nodeById.get(e.target);
    if (src.data.nodeType !== 'domain' || tgt.data.nodeType !== 'domain') return;
    if (src.id === tgt.id) return;
    deps.get(src.id).add(tgt.id);
  });

  var remaining = new Set(domainNodes.map(function(n) { return n.id; }));
  var stages = [];

  while (remaining.size > 0) {
    var stage = [];
    remaining.forEach(function(id) {
      var ready = true;
      deps.get(id).forEach(function(dep) {
        if (remaining.has(dep)) ready = false;
      });
      if (ready) stage.push(id);
    });
    if (stage.length === 0) break;
    stage.forEach(function(id) { remaining.delete(id); });
    // Сортируем внутри стадии: сначала с большим fan-in (более фундаментальные)
    stage.sort(function(a, b) {
      return (fanIn.get(b) || 0) - (fanIn.get(a) || 0);
    });
    stages.push(stage);
  }

  var unresolved = Array.from(remaining);

  // Обогащаем данными
  function enrich(id) {
    var n = nodeById.get(id);
    if (!n) return null;
    return {
      id: id,
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

  var enrichedStages = stages.map(function(stage, idx) {
    return {
      index: idx,
      domains: stage.map(enrich).filter(Boolean)
    };
  });

  return {
    entryPoints: entryPoints.map(function(n) { return enrich(n.id); }).filter(Boolean),
    stages: enrichedStages,
    totalStages: stages.length,
    totalDomains: domainNodes.length,
    unresolved: unresolved.map(enrich).filter(Boolean)
  };
}

function generateLearningPathMarkdown(path, options) {
  var lines = [];
  lines.push('# Путь изучения архитектуры');
  lines.push('');
  lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
  lines.push('');
  if (options && options.scope) {
    lines.push('Область: **' + options.scope + '**');
    lines.push('');
  }
  lines.push('Порядок чтения построен от «фундамента» (домены без входящих зависимостей) к верхним слоям.');
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push('| Всего доменов | ' + path.totalDomains + ' |');
  lines.push('| Этапов | ' + path.totalStages + ' |');
  lines.push('| Точек входа | ' + path.entryPoints.length + ' |');
  if (path.unresolved.length > 0) {
    lines.push('| Не разрешено (цикл) | ' + path.unresolved.length + ' |');
  }
  lines.push('');

  if (path.entryPoints.length > 0) {
    lines.push('## Точки входа');
    lines.push('');
    lines.push('Эти домены — «клиенты» системы: они используют других, но никто не использует их. Хорошие примеры для изучения, потому что показывают функциональность верхнего уровня.');
    lines.push('');
    path.entryPoints.slice(0, 20).forEach(function(d) {
      lines.push('- `' + d.domainId + '`' + (d.label && d.label !== d.domainId ? ' — ' + d.label : ''));
    });
    lines.push('');
  }

  path.stages.forEach(function(stage) {
    lines.push('## Этап ' + (stage.index + 1) + ' — ' + stage.domains.length + ' ' + plural(stage.domains.length, 'домен', 'доменов'));
    lines.push('');
    stage.domains.forEach(function(d) {
      lines.push('### `' + d.domainId + '`');
      if (d.label && d.label !== d.domainId) lines.push('_ ' + d.label + '_');
      lines.push('');
      if (d.description) lines.push(d.description);
      lines.push('');
      var stats = [];
      if (d.fanIn > 0) stats.push('используется в ' + d.fanIn + ' местах');
      if (d.fanOut > 0) stats.push('зависит от ' + d.fanOut);
      if (d.entitiesCount) stats.push(d.entitiesCount + ' entities');
      if (d.tags && d.tags.length > 0) stats.push('теги: ' + d.tags.join(', '));
      if (stats.length > 0) lines.push('*' + stats.join(' · ') + '*');
      lines.push('');
    });
  });

  if (path.unresolved.length > 0) {
    lines.push('## Требуют ручного разбора (в цикле)');
    lines.push('');
    path.unresolved.forEach(function(d) {
      lines.push('- `' + d.domainId + '`');
    });
    lines.push('');
  }

  return lines.join('\n');
}

function resolveEntityRef(ref, currentDomainId) {
  if (!ref || typeof ref !== 'string') return null;
  var slash = ref.indexOf('/');
  if (slash > 0) {
    return { domainId: ref.slice(0, slash), entityId: ref.slice(slash + 1) };
  }
  return { domainId: currentDomainId, entityId: ref };
}

function entityKey(domainId, entityId) {
  return domainId.toLowerCase() + '/' + entityId.toLowerCase();
}

function buildEntityIndex(entities) {
  var byKey = new Map();
  entities.forEach(function(e) {
    var key = entityKey(e.domainId, e.entityId);
    byKey.set(key, e);
  });

  var children = new Map();  // parentKey → [childEntity]
  entities.forEach(function(e) {
    if (!e.inherits) return;
    var ref = resolveEntityRef(e.inherits, e.domainId);
    if (!ref) return;
    var parentKey = entityKey(ref.domainId, ref.entityId);
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey).push(e);
  });

  return { byKey: byKey, children: children };
}

function buildEntityTree(rootKey, index) {
  var byKey = index.byKey;
  var childMap = index.children;

  var nodesMap = new Map();
  var edgesMap = new Map();

  function addNode(key) {
    if (nodesMap.has(key)) return nodesMap.get(key);
    var e = byKey.get(key);
    var parts = key.split('/');
    var node = {
      key: key,
      domainId: e ? e.domainId : parts[0],
      entityId: e ? e.entityId : parts.slice(1).join('/'),
      name: e ? e.name : null,
      inherits: e ? e.inherits : null,
      missing: !e
    };
    nodesMap.set(key, node);
    return node;
  }

  function traverseParents(startKey) {
    var visited = new Set();
    var stack = [startKey];
    while (stack.length > 0) {
      var key = stack.pop();
      if (visited.has(key)) continue;
      visited.add(key);
      var e = byKey.get(key);
      if (!e || !e.inherits) continue;
      var ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref) continue;
      var parentKey = entityKey(ref.domainId, ref.entityId);
      addNode(parentKey);
      var edgeId = parentKey + '->' + key;
      if (!edgesMap.has(edgeId)) {
        edgesMap.set(edgeId, { id: edgeId, source: parentKey, target: key });
      }
      if (!visited.has(parentKey)) stack.push(parentKey);
    }
  }

  function traverseChildren(startKey) {
    var visited = new Set();
    var stack = [startKey];
    while (stack.length > 0) {
      var key = stack.pop();
      if (visited.has(key)) continue;
      visited.add(key);
      var kids = childMap.get(key) || [];
      kids.forEach(function(child) {
        var childKey = entityKey(child.domainId, child.entityId);
        addNode(childKey);
        var edgeId = key + '->' + childKey;
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

  var nodes = Array.from(nodesMap.values());
  var edges = Array.from(edgesMap.values());

  // Ищем циклы (SCC размера > 1)
  var cycleNodes = detectEntityCycles(nodes, edges);

  // Помечаем "родитель" / "наследник" относительно root
  var isRoot = function(k) { return k === rootKey; };
  var parents = new Set();
  var children = new Set();

  // Обход от root вверх — всё в parents
  (function() {
    var stack = [rootKey];
    var visited = new Set([rootKey]);
    while (stack.length > 0) {
      var k = stack.pop();
      var e = byKey.get(k);
      if (!e || !e.inherits) continue;
      var ref = resolveEntityRef(e.inherits, e.domainId);
      if (!ref) continue;
      var pk = entityKey(ref.domainId, ref.entityId);
      if (!parents.has(pk)) parents.add(pk);
      if (!visited.has(pk)) { visited.add(pk); stack.push(pk); }
    }
  })();

  // Обход от root вниз — всё в children
  (function() {
    var stack = [rootKey];
    var visited = new Set([rootKey]);
    while (stack.length > 0) {
      var k = stack.pop();
      var kids = childMap.get(k) || [];
      kids.forEach(function(child) {
        var ck = entityKey(child.domainId, child.entityId);
        if (!children.has(ck)) children.add(ck);
        if (!visited.has(ck)) { visited.add(ck); stack.push(ck); }
      });
    }
  })();

  return {
    nodes: nodes,
    edges: edges,
    rootKey: rootKey,
    parentKeys: parents,
    childKeys: children,
    cycleNodes: cycleNodes
  };
}

function detectEntityCycles(nodes, edges) {
  var adj = new Map();
  nodes.forEach(function(n) { adj.set(n.key, []); });
  edges.forEach(function(e) {
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
  });

  var index = 0;
  var stack = [];
  var onStack = new Set();
  var indices = new Map();
  var lowlinks = new Map();
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
      if (!adj.has(to)) continue;
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
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }
  nodes.forEach(function(n) { if (!indices.has(n.key)) strongconnect(n.key); });

  var result = new Set();
  sccs.forEach(function(scc) { scc.forEach(function(k) { result.add(k); }); });
  return result;
}

function layoutEntityGraph(nodes, edges, rootKey) {
  var ENTITY_W = 180;
  var ENTITY_H = 60;
  var ROOT_W = ENTITY_W * 1.35;
  var ROOT_H = ENTITY_H * 1.2;

  var g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(function() { return {}; });
  g.setGraph({ rankdir: 'TB', nodesep: 25, ranksep: 55, marginx: 30, marginy: 30 });

  nodes.forEach(function(n) {
    var w = n.key === rootKey ? ROOT_W : ENTITY_W;
    var h = n.key === rootKey ? ROOT_H : ENTITY_H;
    g.setNode(n.key, { width: w, height: h });
  });
  edges.forEach(function(e) { g.setEdge(e.source, e.target); });

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
    if (!tree) return null;
    return layoutEntityGraph(tree.nodes, tree.edges, tree.rootKey);
  }, [tree]);

  useEffect(function() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, [tree && tree.rootKey]);

  var fitView = useCallback(function() {
    if (!laid || !containerRef.current) return;
    var containerRect = containerRef.current.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return;

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
      scale: scale
    });
  }, [laid]);

  // Автоfit после первого рендера (с небольшой задержкой для раскладки DOM)
  useEffect(function() {
    if (!laid) return;
    var t = setTimeout(fitView, 50);
    return function() { clearTimeout(t); };
  }, [laid, fitView]);

  // Колесо мыши
  useEffect(function() {
    var el = containerRef.current;
    if (!el) return;
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
    el.addEventListener('wheel', onWheel, { passive: false });
    return function() { el.removeEventListener('wheel', onWheel); };
  }, []);

  var onMouseDown = useCallback(function(e) {
    if (e.button !== 0) return;
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
    if (!isDragging) return;
    var onMove = function(e) {
      if (!dragRef.current) return;
      var dx = e.clientX - dragRef.current.startX;
      var dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
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
      setTimeout(function() { if (dragRef.current) dragRef.current.moved = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return function() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  var zoomBy = useCallback(function(factor) {
    var el = containerRef.current;
    if (!el) return;
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

  if (!laid || !tree) return null;

  var byKey = new Map();
  laid.forEach(function(n) { byKey.set(n.key, n); });

  var rootDomainId = (tree.rootKey.split('/')[0] || '').toLowerCase();

  var handleNodeClick = function(n) {
    if (dragRef.current && dragRef.current.moved) return;
    if (n.missing) return;
    if (onSelect) onSelect(n);
  };

  function truncate(s, max) {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'entity-graph-controls' },
      React.createElement('button', { className: 'entity-ctrl-btn', onClick: function() { zoomBy(1.3); }, title: 'Приблизить' }, '+'),
      React.createElement('button', { className: 'entity-ctrl-btn', onClick: function() { zoomBy(1 / 1.3); }, title: 'Отдалить' }, '−'),
      React.createElement('button', { className: 'entity-ctrl-btn', onClick: fitView, title: 'Вписать' }, React.createElement(MIcon, { name: 'fit_screen' })),
      React.createElement('span', { className: 'entity-zoom-level' }, Math.round(viewport.scale * 100) + '%')
    ),

    React.createElement('div', {
      className: 'entity-graph-container' + (isDragging ? ' entity-graph-container--dragging' : ''),
      ref: containerRef,
      onMouseDown: onMouseDown
    },
      React.createElement('svg', {
        ref: svgRef,
        className: 'entity-graph-svg',
        style: { width: '100%', height: '100%' }
      },
        React.createElement('defs', null,
          React.createElement('marker', {
            id: 'entity-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
            markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'
          },
            React.createElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', className: 'entity-arrow-marker' })
          )
        ),
        React.createElement('g', {
          transform: 'translate(' + viewport.x + ',' + viewport.y + ') scale(' + viewport.scale + ')'
        },
          React.createElement('g', { className: 'entity-graph-edges' },
            tree.edges.map(function(e, i) {
              var src = byKey.get(e.source);
              var tgt = byKey.get(e.target);
              if (!src || !tgt) return null;
              var sx = src.x + src.width / 2;
              var sy = src.y + src.height;
              var tx = tgt.x + tgt.width / 2;
              var ty = tgt.y;
              var my = (sy + ty) / 2;
              var path = 'M ' + sx + ',' + sy + ' C ' + sx + ',' + my + ' ' + tx + ',' + my + ' ' + tx + ',' + ty;
              var isCycle = tree.cycleNodes.has(e.source) && tree.cycleNodes.has(e.target);
              return React.createElement('path', {
                key: i,
                d: path,
                className: 'entity-edge' + (isCycle ? ' entity-edge--cycle' : ''),
                markerEnd: 'url(#entity-arrow)'
              });
            })
          ),
          React.createElement('g', { className: 'entity-graph-nodes' },
            laid.map(function(n) {
              var isRoot = n.key === tree.rootKey;
              var isCycle = tree.cycleNodes.has(n.key);
              var isForeign = !isRoot && n.domainId.toLowerCase() !== rootDomainId;
              var nodeCls = 'entity-graph-node';
              if (isRoot) nodeCls += ' entity-graph-node--root';
              if (isCycle) nodeCls += ' entity-graph-node--cycle';
              if (n.missing) nodeCls += ' entity-graph-node--missing';

              var idMax = isRoot ? 24 : 22;
              var shortId = truncate(n.missing ? '⚠️ ' + n.entityId : n.entityId, idMax);
              var shortName = truncate(n.name || '', 26);
              var shortDomain = truncate(n.domainId, 24);

              return React.createElement('g', {
                key: n.key,
                transform: 'translate(' + n.x + ',' + n.y + ')',
                className: nodeCls,
                onClick: function() { handleNodeClick(n); },
                style: { cursor: n.missing ? 'default' : 'pointer' }
              },
                React.createElement('title', null,
                  n.entityId + (n.name ? ' — ' + n.name : '') + ' (' + n.domainId + ')'
                ),
                React.createElement('rect', {
                  width: n.width, height: n.height, rx: 8,
                  className: 'entity-node-rect'
                    + (isRoot ? ' entity-node-rect--root' : '')
                    + (isForeign ? ' entity-node-rect--foreign' : '')
                    + (isCycle ? ' entity-node-rect--cycle' : '')
                    + (n.missing ? ' entity-node-rect--missing' : '')
                }),
                React.createElement('text', {
                  x: n.width / 2, y: isRoot ? 24 : 22, textAnchor: 'middle',
                  className: 'entity-node-id' + (isRoot ? ' entity-node-id--root' : ''),
                  pointerEvents: 'none'
                }, shortId),
                !isRoot && !n.missing && shortName && React.createElement('text', {
                  x: n.width / 2, y: 38, textAnchor: 'middle',
                  className: 'entity-node-name',
                  pointerEvents: 'none'
                }, shortName),
                !n.missing && React.createElement('text', {
                  x: n.width / 2, y: n.height - 8, textAnchor: 'middle',
                  className: 'entity-node-domain' + (isForeign ? ' entity-node-domain--foreign' : ''),
                  onClick: function(ev) {
                    ev.stopPropagation();
                    if (onGotoDomain) onGotoDomain(n.domainId);
                  }
                }, shortDomain),
                n.missing && React.createElement('text', {
                  x: n.width / 2, y: n.height - 8, textAnchor: 'middle',
                  className: 'entity-node-domain entity-node-domain--missing'
                }, 'не найдено')
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

  var [query, setQuery] = useState('');
  var [selectedKey, setSelectedKey] = useState(null);
  var [history, setHistory] = useState([]);

  var index = useMemo(function() {
    return buildEntityIndex(entities);
  }, [entities]);
  
  useEffect(function() {
  if (!open) return;
  var onKey = function(e) {
    if (e.key === 'Escape') {
      if (history.length > 0) {
        e.preventDefault();
        handleBack();
      } else {
        e.preventDefault();
        onClose();
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  return function() { document.removeEventListener('keydown', onKey, true); };
}, [open, history, handleBack, onClose]);

  useEffect(function() {
    if (open && initialEntityKey) {
      setSelectedKey(initialEntityKey);
      setHistory([]);
      setQuery('');
    }
  }, [open, initialEntityKey]);

  useEffect(function() {
    if (!open) {
      setQuery('');
      setSelectedKey(null);
      setHistory([]);
    }
  }, [open]);

  var searchResults = useMemo(function() {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var results = [];
    entities.forEach(function(e) {
      var idMatch = e.entityId.toLowerCase().indexOf(q) !== -1;
      var nameMatch = e.name && e.name.toLowerCase().indexOf(q) !== -1;
      if (!idMatch && !nameMatch) return;
      var key = entityKey(e.domainId, e.entityId);
      var hasParents = !!e.inherits;
      var hasChildren = (index.children.get(key) || []).length > 0;
      results.push({
        entity: e,
        key: key,
        hasParents: hasParents,
        hasChildren: hasChildren,
        isOrphan: !hasParents && !hasChildren,
        rank: idMatch && e.entityId.toLowerCase().indexOf(q) === 0 ? 0 : idMatch ? 1 : 2
      });
    });
    results.sort(function(a, b) { return a.rank - b.rank; });
    return results.slice(0, 200);
  }, [query, entities, index]);

  var tree = useMemo(function() {
    if (!selectedKey) return null;
    return buildEntityTree(selectedKey, index);
  }, [selectedKey, index]);

  var handleSelect = useCallback(function(node) {
    if (!node || node.missing) return;
    if (node.key === selectedKey) return;
    setHistory(function(prev) { return selectedKey ? prev.concat([selectedKey]) : prev; });
    setSelectedKey(node.key);
  }, [selectedKey]);

  var handleBack = useCallback(function() {
    setHistory(function(prev) {
      if (prev.length === 0) return prev;
      var last = prev[prev.length - 1];
      setSelectedKey(last);
      return prev.slice(0, -1);
    });
  }, []);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay help-overlay--fullscreen', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal entity-hierarchy-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '🧬 Иерархия наследования сущностей'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, React.createElement(MIcon, { name: 'close' }))
      ),

      React.createElement('div', { className: 'entity-hierarchy-body' },
        React.createElement('div', { className: 'entity-search-panel' },
          React.createElement('div', { className: 'entity-search-input-wrap' },
            React.createElement('span', { className: 'entity-search-icon' }, React.createElement(MIcon, { name: 'search' })),
            React.createElement('input', {
              className: 'entity-search-input',
              type: 'text',
              placeholder: 'Поиск по id или названию...',
              value: query,
              onChange: function(e) { setQuery(e.target.value); }
            })
          ),
          React.createElement('div', { className: 'entity-search-results' },
            query.trim() === '' ?
              React.createElement('div', { className: 'entity-search-hint' },
                'Всего сущностей: ' + entities.length,
                React.createElement('br'),
                React.createElement('span', { style: { fontSize: 11 } }, 'Начните вводить для поиска')
              ) :
              searchResults.length === 0 ?
                React.createElement('div', { className: 'entity-search-hint' }, 'Ничего не найдено') :
                searchResults.map(function(r) {
                  return React.createElement('div', {
                    key: r.key,
                    className: 'entity-search-item'
                      + (r.key === selectedKey ? ' entity-search-item--active' : '')
                      + (r.isOrphan ? ' entity-search-item--orphan' : ''),
                    onClick: function() {
                      setHistory(function(prev) { return selectedKey ? prev.concat([selectedKey]) : prev; });
                      setSelectedKey(r.key);
                    }
                  },
                    React.createElement('div', { className: 'entity-search-item__id' }, r.entity.entityId),
                    r.entity.name && r.entity.name !== r.entity.entityId &&
                      React.createElement('div', { className: 'entity-search-item__name' }, r.entity.name),
                    React.createElement('div', { className: 'entity-search-item__meta' },
                      React.createElement('span', { className: 'entity-search-item__domain' }, r.entity.domainId),
                      r.isOrphan
                        ? React.createElement('span', { className: 'entity-search-item__badge' }, 'без иерархии')
                        : React.createElement('span', { className: 'entity-search-item__badge entity-search-item__badge--ok' },
                            (r.hasParents ? '↑' : '·') + (r.hasChildren ? '↓' : '·')
                          )
                    )
                  );
                })
          )
        ),

        React.createElement('div', { className: 'entity-graph-panel' },
  history.length > 0 && React.createElement('button', {
    className: 'entity-graph-back',
    onClick: handleBack,
    title: 'Назад'
  }, '← Назад'),

  !selectedKey ?
    React.createElement('div', { className: 'entity-graph-empty' },
      React.createElement('div', { className: 'entity-graph-empty__icon' }, React.createElement(MIcon, { name: 'account_tree' })),
      React.createElement('div', { className: 'entity-graph-empty__title' }, 'Выберите сущность слева'),
      React.createElement('div', { className: 'entity-graph-empty__hint' }, 'Родители будут сверху, наследники снизу')
    ) :
    React.createElement(EntityHierarchyGraph, {
      tree: tree,
      onSelect: handleSelect,
      onGotoDomain: onGotoDomain
    })
)
      ),

      tree && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat' },
            '🧬 ' + tree.nodes.length + ' в графе'
          ),
          React.createElement('span', { className: 'validation-stat validation-stat--ok' },
            '↑ ' + tree.parentKeys.size + ' родителей'
          ),
          React.createElement('span', { className: 'validation-stat validation-stat--warn' },
            '↓ ' + tree.childKeys.size + ' наследников'
          ),
          tree.cycleNodes.size > 0 && React.createElement('span', { className: 'validation-stat validation-stat--err' },
            '⚠️ цикл'
          )
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn', onClick: onClose }, 'Закрыть')
        )
      )
    )
  );
}
function findCycles(nodes, edges) {
  var adjacency = new Map();
  nodes.forEach(function(n) { adjacency.set(n.id, []); });
  edges.forEach(function(e) { if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target); });
  var index = 0;
  var stack = [];
  var onStack = new Set();
  var indices = new Map();
  var lowlinks = new Map();
  var sccs = [];
  function strongconnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    var neighbors = adjacency.get(v) || [];
    for (var i = 0; i < neighbors.length; i++) {
      var to = neighbors[i];
      if (!adjacency.has(to)) continue;
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
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }
  for (var i = 0; i < nodes.length; i++) {
    if (!indices.has(nodes[i].id)) strongconnect(nodes[i].id);
  }
  var nodeToScc = new Map();
  sccs.forEach(function(scc, i) { scc.forEach(function(n) { nodeToScc.set(n, i); }); });
  var cycleNodes = new Set();
  sccs.forEach(function(scc) { scc.forEach(function(n) { cycleNodes.add(n); }); });
  var cycleEdges = new Set();
  edges.forEach(function(e) {
    var s = nodeToScc.get(e.source);
    var t = nodeToScc.get(e.target);
    if (s !== undefined && s === t) cycleEdges.add(e.id);
  });
  return { sccs: sccs, cycleNodes: cycleNodes, cycleEdges: cycleEdges };
}

function findPath(startId, endId, edges) {
  if (!startId || !endId || startId === endId) return null;
  var adjacency = new Map();
  edges.forEach(function(e) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source).push({ node: e.target, edge: e.id });
  });
  var visited = new Set([startId]);
  var queue = [{ id: startId, path: [startId], edges: [] }];
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.id === endId) return { nodes: cur.path, edges: cur.edges };
    var neighbors = adjacency.get(cur.id) || [];
    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (visited.has(n.node)) continue;
      visited.add(n.node);
      queue.push({ id: n.node, path: cur.path.concat([n.node]), edges: cur.edges.concat([n.edge]) });
    }
  }
  return null;
}

function findReachable(startId, depth, edges) {
  var inAdj = new Map();
  var outAdj = new Map();
  edges.forEach(function(e) {
    if (!outAdj.has(e.source)) outAdj.set(e.source, []);
    outAdj.get(e.source).push(e.target);
    if (!inAdj.has(e.target)) inAdj.set(e.target, []);
    inAdj.get(e.target).push(e.source);
  });
  var visited = new Set([startId]);
  var queue = [{ id: startId, d: 0 }];
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.d >= depth) continue;
    var neighbors = (outAdj.get(cur.id) || []).concat(inAdj.get(cur.id) || []);
    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (visited.has(n)) continue;
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
  var namespaceFilter = ctx.namespaceFilter || '';
  var filters = ctx.filters || {};

  var now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  var domainNodes = nodes.filter(function(n) { return n.data.nodeType === 'domain'; });
  var missingNodes = nodes.filter(function(n) { return n.data.nodeType === 'missing'; });
  var brokenNodes = nodes.filter(function(n) { return n.data.nodeType === 'broken'; });

  var isolated = domainNodes.filter(function(n) {
    return !edges.some(function(e) { return e.source === n.id || e.target === n.id; });
  });

  var allRefs = [];
  domainNodes.forEach(function(n) {
    (n.data.fqidRefs || []).forEach(function(r) {
      var exists = nodes.some(function(x) {
        return (x.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase();
      });
      if (!exists) allRefs.push({ from: n.data.domainId, ref: r });
    });
  });

  var topConnected = domainNodes.map(function(n) {
    var d = 0;
    edges.forEach(function(e) { if (e.source === n.id) d++; if (e.target === n.id) d++; });
    return { node: n, degree: d };
  }).sort(function(a, b) { return b.degree - a.degree; }).slice(0, 10);

  var worstHealth = domainNodes.map(function(n) {
    return { node: n, health: healthMap.get(n.id) || 0 };
  }).sort(function(a, b) { return a.health - b.health; }).slice(0, 10);

  var nsMap = new Map();
  domainNodes.forEach(function(n) {
    var ns = n.data.domainId.split('.').slice(0, 2).join('.');
    nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
  });
  var nsList = Array.from(nsMap.entries()).sort(function(a, b) { return b[1] - a[1]; });

  var lines = [];
  lines.push('# Domain Graph Report');
  lines.push('');
  lines.push('_Сгенерировано: ' + now + '_');
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push('| Всего узлов | ' + nodes.length + ' |');
  lines.push('| Домены | ' + domainNodes.length + ' |');
  lines.push('| Missing | ' + missingNodes.length + ' |');
  lines.push('| Broken | ' + brokenNodes.length + ' |');
  lines.push('| Связей | ' + edges.length + ' |');
  lines.push('| Циклических групп | ' + cyclesInfo.sccs.length + ' |');
  lines.push('| Изолированных доменов | ' + isolated.length + ' |');
  lines.push('| Битых FQID-ссылок | ' + allRefs.length + ' |');
  lines.push('');

  if (namespaceFilter) {
    lines.push('> Фильтр по namespace: `' + namespaceFilter + '`');
    lines.push('');
  }

  // Циклы
  lines.push('## Циклические зависимости');
  lines.push('');
  if (cyclesInfo.sccs.length === 0) {
    lines.push('_Циклов не обнаружено._');
  } else {
    lines.push('Найдено **' + cyclesInfo.sccs.length + '** циклических групп:');
    lines.push('');
    cyclesInfo.sccs.forEach(function(scc, i) {
      var names = scc.map(function(id) {
        var n = nodes.find(function(x) { return x.id === id; });
        return n ? n.data.domainId : id;
      });
      lines.push((i + 1) + '. ' + names.join(' → ') + ' → ' + names[0]);
    });
  }
  lines.push('');

  // Топ по связям
  lines.push('## Топ-10 по связям');
  lines.push('');
  lines.push('| # | Домен | Связей |');
  lines.push('| ---: | --- | ---: |');
  topConnected.forEach(function(item, i) {
    lines.push('| ' + (i + 1) + ' | `' + item.node.data.domainId + '` | ' + item.degree + ' |');
  });
  lines.push('');

  // Стена позора
  lines.push('## Низкий health score');
  lines.push('');
  lines.push('| # | Домен | Health |');
  lines.push('| ---: | --- | ---: |');
  worstHealth.forEach(function(item, i) {
    lines.push('| ' + (i + 1) + ' | `' + item.node.data.domainId + '` | ' + item.health + '/100 |');
  });
  lines.push('');

  // Изолированные
  if (isolated.length > 0) {
    lines.push('## Изолированные домены');
    lines.push('');
    isolated.forEach(function(n) { lines.push('- `' + n.data.domainId + '`'); });
    lines.push('');
  }

  // Битые FQID-ссылки
  if (allRefs.length > 0) {
    lines.push('## Битые FQID-ссылки');
    lines.push('');
    var byFrom = new Map();
    allRefs.forEach(function(item) {
      if (!byFrom.has(item.from)) byFrom.set(item.from, []);
      byFrom.get(item.from).push(item.ref);
    });
    byFrom.forEach(function(refs, from) {
      lines.push('### ' + from);
      lines.push('');
      refs.forEach(function(r) {
        lines.push('- `' + r.fullFQID + '` — ' + r.propertyPath);
      });
      lines.push('');
    });
  }

  // Неймспейсы
  lines.push('## Распределение по неймспейсам');
  lines.push('');
  lines.push('| Неймспейс | Доменов |');
  lines.push('| --- | ---: |');
  nsList.forEach(function(entry) {
    lines.push('| `' + entry[0] + '` | ' + entry[1] + ' |');
  });
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('_Отчёт сгенерирован Domain Graph Analyzer._');

  return lines.join('\n');
}

function heatColor(value, min, max, scheme) {
  if (max === min) return scheme.mid;
  var t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Интерполяция между тремя цветами: low → mid → high
  var c1 = scheme.low, c2 = scheme.mid, c3 = scheme.high;
  function hexToRgb(h) {
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return [r, g, b];
  }
  function lerp(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k)
    ];
  }
  var from, to, k;
  if (t < 0.5) { from = hexToRgb(c1); to = hexToRgb(c2); k = t * 2; }
  else { from = hexToRgb(c2); to = hexToRgb(c3); k = (t - 0.5) * 2; }
  var rgb = lerp(from, to, k);
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

var HEATMAPS = {
  health:   { label: 'Health',     low: '#dc2626', mid: '#f59e0b', high: '#10b981' },
  degree:   { label: 'Связей',     low: '#334155', mid: '#3b82f6', high: '#10b981' },
  entities: { label: 'Entities',   low: '#334155', mid: '#8b5cf6', high: '#ec4899' },
  fqid:     { label: 'FQID-ссылок', low: '#334155', mid: '#0891b2', high: '#22d3ee' }
};

function computeHealth(node, edges, allNodes, cycleNodes, missingSet) {
  if (node.data.nodeType === 'broken' || node.data.nodeType === 'missing') return 0;
  var score = 100;
  var connected = false;
  var inEdges = 0, outEdges = 0;
  edges.forEach(function(e) {
    if (e.source === node.id) { connected = true; outEdges++; }
    if (e.target === node.id) { connected = true; inEdges++; }
  });
  if (!connected) score -= 40;
  if (cycleNodes && cycleNodes.has(node.id)) score -= 30;
  var refs = node.data.fqidRefs || [];
  var missingRefs = 0;
  refs.forEach(function(r) {
    if (!allNodes.some(function(n) { return (n.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase(); })) {
      missingRefs++;
    }
  });
  score -= Math.min(missingRefs * 3, 20);
  return Math.max(0, Math.round(score));
}

function healthClass(score) {
  if (score >= 80) return 'health-good';
  if (score >= 50) return 'health-mid';
  return 'health-bad';
}

// ============ AGGREGATE ============
function aggregateByNamespace(nodes, edges) {
  var getNs = function(domainId) {
    var parts = (domainId || '').split('.');
    return parts.slice(0, 2).join('.') || domainId;
  };
  var nodeToNs = new Map();
  var nsCount = new Map();
  nodes.forEach(function(n) {
    var ns = getNs(n.data.domainId);
    nodeToNs.set(n.id, ns);
    nsCount.set(ns, (nsCount.get(ns) || 0) + 1);
  });
  var newNodes = Array.from(nsCount.entries()).map(function(entry) {
    var ns = entry[0], count = entry[1];
    return {
      id: 'ns_' + ns,
      type: 'domainNode',
      data: { domainId: ns, label: ns, nodeType: 'domain', isNamespace: true, childCount: count },
      position: { x: 0, y: 0 }
    };
  });
  var edgeAgg = new Map();
  edges.forEach(function(e) {
    var fromNs = nodeToNs.get(e.source);
    var toNs = nodeToNs.get(e.target);
    if (!fromNs || !toNs || fromNs === toNs) return;
    var key = fromNs + '__' + toNs;
    if (!edgeAgg.has(key)) {
      edgeAgg.set(key, { id: 'ns_edge_' + fromNs + '__' + toNs, source: 'ns_' + fromNs, target: 'ns_' + toNs, count: 0, kinds: new Set() });
    }
    var a = edgeAgg.get(key);
    a.count++;
    if (e.data && e.data.kind) a.kinds.add(e.data.kind);
  });
  var newEdges = Array.from(edgeAgg.values()).map(function(a) {
    return {
      id: a.id, source: a.source, target: a.target, type: 'smoothstep', label: String(a.count),
      data: { isAggregated: true, count: a.count, kinds: Array.from(a.kinds), kind: 'aggregated' },
      markerEnd: { type: MarkerType.ArrowClosed, color: LINKAGE_COLOR, width: 14, height: 14 },
      style: { stroke: LINKAGE_COLOR, strokeWidth: Math.min(1 + a.count / 6, 4), opacity: 0.85 }
    };
  });
  return { nodes: dagreLayout(newNodes, newEdges, 'LR'), edges: newEdges };
}

// ============ BIDIRECTIONAL MERGE ============
function mergeBidirectional(edges) {
  var result = [];
  var seen = new Set();
  var processed = new Set();

  // Группируем по паре доменов
  var pairMap = new Map();
  edges.forEach(function(e) {
    if (!e || !e.source || !e.target) return;
    var key = [e.source, e.target].sort().join('__');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(e);
  });

  edges.forEach(function(e) {
    if (processed.has(e.id)) return;

    var key = [e.source, e.target].sort().join('__');
    var group = pairMap.get(key) || [];
    var forward = null, backward = null;

    for (var i = 0; i < group.length; i++) {
      var g = group[i];
      if (processed.has(g.id)) continue;
      if (g.source === e.source && g.target === e.target && !forward) forward = g;
      else if (g.source === e.target && g.target === e.source && !backward) backward = g;
    }

    if (forward && backward) {
      // Стабильный id из обоих исходных id (сортированных), чтобы не было дублей
      var stableId = 'bi__' + [forward.id, backward.id].sort().join('__');
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
      // Обрабатываем эту одну как обычную
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e);
      }
      processed.add(e.id);
    }
  });

  return result;
}

// ============ TOOLTIP BUILDERS ============
function buildTooltipHtml(domainId, label, nodeType, filePath, version, entitiesCount, fqidRefs, health, description, tags, validation) {
  var typeLabel = nodeType === 'domain' ? 'Корректный домен' : nodeType === 'missing' ? 'Несуществующий домен' : 'Битый YAML';
  var typeColor = nodeType === 'domain' ? '#10b981' : nodeType === 'missing' ? '#f59e0b' : '#ef4444';
  var html = '<div class="tooltip__header" style="color:' + typeColor + '">' + escapeHtml(typeLabel) + '</div>';
  html += '<div class="tooltip__body">';
  html += '<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">' + escapeHtml(domainId) + '</span></div>';
  if (label && label !== domainId) html += '<div class="tooltip__row"><span class="tooltip__label">Название:</span><span class="tooltip__value">' + escapeHtml(label) + '</span></div>';
  if (version) html += '<div class="tooltip__row"><span class="tooltip__label">Версия:</span><span class="tooltip__value">' + escapeHtml(version) + '</span></div>';
  if (entitiesCount != null) html += '<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">' + entitiesCount + '</span></div>';
  if (health != null) html += '<div class="tooltip__row"><span class="tooltip__label">Health:</span><span class="tooltip__value">' + health + '/100</span></div>';
  if (description) html += '<div class="tooltip__row"><span class="tooltip__label">Описание:</span><span class="tooltip__value">' + escapeHtml(description) + '</span></div>';
  if (tags && tags.length > 0) html += '<div class="tooltip__row"><span class="tooltip__label">Теги:</span><span class="tooltip__value">' + tags.map(escapeHtml).join(', ') + '</span></div>';
  if (filePath) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Файл:</span><span class="tooltip__value" style="font-size:11px">' + escapeHtml(filePath) + '</span></div>';
    html += '<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="' + escapeHtml(filePath) + '"><span class="material-symbols-outlined mi-sm">folder_open</span> Открыть файл</button></div>';
  }
  // --- Валидация ---
  if (validation) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
  
    if (validation.status === 'invalid') {
      var diagCount = validation.diagnostics ? validation.diagnostics.length : 0;
      html += '<button class="tooltip__validation-toggle js-toggle-validation" type="button">'
        + '<span class="tooltip__validation-arrow"><span class="material-symbols-outlined mi-sm">chevron_right</span></span>'
        + '<span class="tooltip__validation-title" style="color:var(--danger)"><span class="material-symbols-outlined mi-sm">cancel</span> Невалиден</span>'
        + '<span class="tooltip__validation-count">' + diagCount + '</span>'
        + '</button>';
  
      if (diagCount > 0) {
        html += '<div class="tooltip__validation-list" style="display:none">';
        validation.diagnostics.forEach(function(d, i) {
          var sev = (d.severity || '').toString().toUpperCase();
          var sevClass = sev === 'ERROR' ? 'error' : sev === 'WARNING' ? 'warning' : 'info';
          html += '<div class="tooltip__validation-item">';
          html += '<div class="tooltip__validation-severity tooltip__validation-severity--' + sevClass + '">' + escapeHtml(sev) + '</div>';
          html += '<div class="tooltip__validation-message">' + escapeHtml(d.message || '') + '</div>';
          if (d.labels && d.labels.length > 0) {
            d.labels.forEach(function(lb) {
              html += '<div class="tooltip__validation-label">'
                + escapeHtml(lb.message || '')
                + (lb.span ? '<span class="tooltip__validation-span"> [' + lb.span.start + '–' + lb.span.end + ']</span>' : '')
                + '</div>';
            });
          }
          html += '</div>';
        });
        html += '</div>';
      }
    } else if (validation.status === 'error') {
      html += '<div class="tooltip__label" style="margin-bottom:6px;color:var(--warning)"><span class="material-symbols-outlined mi-sm">warning</span> Ошибка валидации</div>';
      html += '<div class="tooltip__validation-message">' + escapeHtml(validation.error || '') + '</div>';
    }
  
    html += '</div>';
  }
  if (fqidRefs && fqidRefs.length > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<div class="tooltip__label" style="margin-bottom:8px">FQID ссылки (' + fqidRefs.length + '):</div>';
    html += '<div class="tooltip__fqid-list">';
    fqidRefs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" data-domain="' + escapeHtml(ref.targetDomainId || '') + '" style="cursor:pointer">' + escapeHtml(ref.fullFQID) + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '"><span class="material-symbols-outlined mi-sm">folder_open</span> Открыть</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function buildEdgeTooltipHtml(edge, refs) {
  var fullLabel = (edge.data && edge.data.fullLabel) || edge.label || edge.id;
  var link = (edge.data && edge.data.linkData) || {};
  var nameFrom = link.nameFrom || {};
  var side1Text = nameFrom.side1 || link.sourceEntity || null;
  var side2Text = nameFrom.side2 || link.targetEntity || null;
  var side1Domain = edge.data && edge.data.side1Domain;
  var side2Domain = edge.data && edge.data.side2Domain;
  function renderSide(labelText, text, domain) {
    if (!text) return '';
    var clickable = !!domain;
    var h = '<div class="tooltip__row"><span class="tooltip__label">' + labelText + '</span>';
    if (clickable) {
      h += '<span class="tooltip__value js-goto-domain" data-domain="' + escapeHtml(domain) + '" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">' + escapeHtml(text) + ' <span style="font-size:10px;color:var(--text-500)"><span class="material-symbols-outlined mi-sm">arrow_forward</span> ' + escapeHtml(domain) + '</span></span>';
    } else {
      h += '<span class="tooltip__value" style="color:var(--text-400)">' + escapeHtml(text) + '</span>';
    }
    return h + '</div>';
  }
  var html = '<div class="tooltip__header">Связь: ' + escapeHtml(fullLabel) + '</div>';
  html += '<div class="tooltip__body">';
  if (edge.data && edge.data.isBidirectional) html += '<div style="font-size:11px;color:var(--accent-hover);margin-bottom:8px"><span class="material-symbols-outlined mi-sm">swap_horiz</span> двунаправленная связь</div>';
  html += renderSide('Сторона 1:', side1Text, side1Domain);
  html += renderSide('Сторона 2:', side2Text, side2Domain);
  if (side1Text || side2Text) html += '<div style="height:1px;background:var(--border);margin:10px 0"></div>';
  if (link.type) html += '<div class="tooltip__row"><span class="tooltip__label">Тип:</span><span class="tooltip__value">' + escapeHtml(link.type) + '</span></div>';
  if (refs && refs.length > 0) {
    html += '<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID ссылки (' + refs.length + '):</div>';
    html += '<div class="tooltip__fqid-list">';
    refs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" data-domain="' + escapeHtml(ref.targetDomainId || '') + '" style="cursor:pointer">' + escapeHtml(ref.fullFQID) + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '"><span class="material-symbols-outlined mi-sm">folder_open</span> Открыть</button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ============ NODES ============

function DomainNode(props) {
  var data = props.data;
  var selected = props.selected;

  if (data.__compact) {
    var compactCls = 'rf-compact rf-compact--' + data.nodeType + (selected ? ' rf-compact--selected' : '');
    var initial = (data.domainId || '?').charAt(0).toUpperCase();
    var compactStyle = {};
    if (data.__heatColor) {
      compactStyle.background = data.__heatColor;
      compactStyle.borderColor = data.__heatColor;
      compactStyle.color = '#ffffff';
    }
    return React.createElement(React.Fragment, null,
      React.createElement(Handle, { type: 'target', position: Position.Left, className: 'rf-handle' }),
      React.createElement('div', { className: compactCls, style: compactStyle, title: data.domainId }, initial),
      React.createElement(Handle, { type: 'source', position: Position.Right, className: 'rf-handle' })
    );
  }

  var cls = 'rf-node rf-node--' + data.nodeType;
  if (selected) cls += ' rf-node--selected';
  if (data.dimmed) cls += ' rf-node--dimmed';
  if (data.__inPath) cls += ' rf-node--path';
  if (data.__isPathEndpoint) cls += ' rf-node--path-endpoint';
  if (data.__failed) cls += ' rf-node--failed';
  if (data.__pendingFail) cls += ' rf-node--pending-fail';
  if (data.__failureRoot) cls += ' rf-node--failure-root';

  var icon = data.nodeType === 'domain' ? '●' : data.nodeType === 'missing' ? '▲' : React.createElement(MIcon, { name: 'close' });

  // Применяем heatmap-цвет, если есть
  var nodeStyle = {};
  if (data.__heatColor) {
    nodeStyle.background = data.__heatColor;
    nodeStyle.borderColor = data.__heatColor;
    nodeStyle.color = '#ffffff';
  }

  var healthBadge = null;
  if (data.health != null && data.nodeType === 'domain' && !data.__heatColor) {
    var hc = data.health >= 80 ? 'good' : data.health >= 50 ? 'mid' : 'bad';
    healthBadge = React.createElement('span', {
      className: 'rf-node__health rf-node__health--' + hc,
      title: 'Health score: ' + data.health + '/100'
    }, data.health);
  }

  var validationBadge = null;
  if (data.__validationStatus === 'invalid' && data.__validationCount > 0) {
    validationBadge = React.createElement('span', {
      className: 'rf-node__issues',
      title: 'Валидация: ' + data.__validationCount + ' проблем'
    }, '⚠' + data.__validationCount);
  }

  return React.createElement(React.Fragment, null,
    React.createElement(Handle, { type: 'target', position: Position.Left, className: 'rf-handle' }),
    React.createElement('div', { className: cls, style: nodeStyle },
      React.createElement('div', { className: 'rf-node__icon' }, icon),
      React.createElement('div', { className: 'rf-node__content' },
        React.createElement('div', { className: 'rf-node__id-row' },
          React.createElement('span', {
            className: 'rf-node__id' + (data.__invalid ? ' rf-node__id--invalid' : ''),
            title: data.domainId + (data.__invalid ? ' — невалиден' : '')
          }, data.domainId),
          healthBadge,
          validationBadge
        ),
        data.label && data.label !== data.domainId && React.createElement('div', {
          className: 'rf-node__name',
          title: data.label
        }, data.label)
      )
    ),
    React.createElement(Handle, { type: 'source', position: Position.Right, className: 'rf-handle' })
  );
}

var nodeTypes = { domainNode: DomainNode };

// ============ POPOVER ============
function Popover(props) {
  var trigger = props.trigger;
  var children = props.children;
  var align = props.align || 'left';
  var width = props.width || 320;
  var state = useState(false);
  var open = state[0], setOpen = state[1];
  var wrapRef = useRef(null);
  useEffect(function() {
    if (!open) return;
    var onDoc = function(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    var onEsc = function(e) { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc, true); };
  }, [open]);
  useEffect(function() {
    var handler = function() { setOpen(false); };
    document.addEventListener('close-all-popovers', handler);
    return function() { document.removeEventListener('close-all-popovers', handler); };
  }, []);
  return React.createElement('div', { className: 'popover-wrap', ref: wrapRef },
    React.createElement('div', { className: 'popover-trigger', onClick: function() { setOpen(!open); } }, trigger(open)),
    open && React.createElement('div', { className: 'popover popover--' + align, style: { width: width } },
      typeof children === 'function' ? children(function() { setOpen(false); }) : children
    )
  );
}

// ============ CONTEXT MENU ============
function ContextMenu(props) {
  var menu = props.menu;
  var onClose = props.onClose;
  var onAction = props.onAction;
  var ref = useRef(null);
  useEffect(function() {
    if (!menu) return;
    var onDoc = function(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc, true); };
  }, [menu]);
  if (!menu) return null;
  var items = [
    { icon: React.createElement(MIcon, { name: 'my_location' }), label: 'Фокус (N шагов)', action: 'focus' },
    { icon: React.createElement(MIcon, { name: 'bar_chart' }), label: 'Что зависит от него', action: 'dependents' },
    { icon: React.createElement(MIcon, { name: 'route' }), label: 'Путь от...', action: 'path-from' },
    { icon: '↪️', label: 'Путь до...', action: 'path-to' },
    { type: 'divider' },
    { icon: React.createElement(MIcon, { name: 'folder_open' }), label: 'Открыть файл', action: 'open-file' },
    { icon: React.createElement(MIcon, { name: 'content_copy' }), label: 'Копировать ID', action: 'copy-id' },
    { icon: React.createElement(MIcon, { name: 'star' }), label: 'В закладки', action: 'bookmark' },
    { icon: '👁️', label: 'Скрыть', action: 'hide', danger: true }
  ];
  return React.createElement('div', { className: 'ctx-menu', ref: ref, style: { left: menu.x, top: menu.y } },
    items.map(function(it, i) {
      if (it.type === 'divider') return React.createElement('div', { key: i, className: 'ctx-menu__divider' });
      return React.createElement('button', {
        key: i,
        className: 'ctx-menu__item' + (it.danger ? ' ctx-menu__item--danger' : ''),
        onClick: function() { onAction(it.action, menu.nodeId); onClose(); }
      },
        React.createElement('span', { className: 'ctx-menu__icon' }, it.icon),
        React.createElement('span', null, it.label)
      );
    })
  );
}

// ============ GROUPS OVERLAY ============
function GroupsOverlay(props) {
  var boxes = props.boxes || [];
  var svgRef = useRef(null);
  var viewport = useViewport();
  var vpRef = useRef(viewport);
  vpRef.current = viewport;

  // Обновляем CSS transform напрямую, минуя React-рендер
  useEffect(function() {
    var svg = svgRef.current;
    if (!svg) return;
    svg.style.transform = 'translate(' + viewport.x + 'px,' + viewport.y + 'px) scale(' + viewport.zoom + ')';
  }, [viewport.x, viewport.y, viewport.zoom]);

  if (!boxes || boxes.length === 0) return null;

  return React.createElement('svg', {
    ref: svgRef,
    className: 'groups-overlay',
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      overflow: 'visible',
      pointerEvents: 'none',
      transformOrigin: '0 0',
      willChange: 'transform'
    }
  },
    boxes.map(function(b) {
      return React.createElement('g', {
        key: b.id,
        transform: 'translate(' + b.x + ',' + b.y + ')'
      },
        React.createElement('rect', {
          width: b.w,
          height: b.h,
          rx: 12,
          fill: 'rgba(99,102,241,0.05)',
          stroke: 'rgba(99,102,241,0.4)',
          strokeDasharray: '6 4',
          strokeWidth: 1.5
        }),
        React.createElement('text', {
          x: 14,
          y: 22,
          fill: 'var(--accent-hover)',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif'
        }, b.label + ' · ' + b.count)
      );
    })
  );
}

// ============ SIDE PANEL (details + editor) ============
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

  // Инициализация Monaco — при первом открытии панели, а не только на вкладке «Файл»
  useEffect(function() {
    if (!open) return;
    if (monacoInitedRef.current) return;
    if (typeof window.require === 'undefined') return;
    monacoInitedRef.current = true;
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs' } });
    window.require(['vs/editor/editor.main'], function() {
      setMonacoReady(true);
    });
  }, [open]);

  // Создание редактора, когда вкладка «Файл» активна и Monaco загружен
  useEffect(function() {
    if (!open || tab !== 'file' || !monacoReady) return;
    if (editorRef.current) return;
    var el = document.getElementById('monaco-container');
    if (!el) return;
    editorRef.current = window.monaco.editor.create(el, {
      value: '',
      language: 'yaml',
      theme: 'vs-dark',
      readOnly: true,
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: 'JetBrains Mono, SF Mono, Monaco, monospace'
    });
  }, [open, tab, monacoReady, pendingFile]);

  // Применение контента при появлении нового pendingFile или когда редактор готов
  useEffect(function() {
    if (!open || tab !== 'file') return;
    if (!editorRef.current) return;
    if (!pendingFile) return;
    editorRef.current.setValue(pendingFile.content);
    if (pendingFile.fqid) {
      setTimeout(function() {
        var ed = editorRef.current;
        if (!ed) return;
        var NEWLINE = String.fromCharCode(10);
        var lines = pendingFile.content.split(NEWLINE);
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf(pendingFile.fqid) !== -1) {
            ed.revealLineInCenter(i + 1);
            ed.setSelection({
              startLineNumber: i + 1, startColumn: 1,
              endLineNumber: i + 1, endColumn: lines[i].length + 1
            });
            break;
          }
        }
      }, 100);
    }
  }, [open, tab, pendingFile, monacoReady]);

  if (!open) return null;

  var detailsContent = null;
  if (node) {
    var incoming = allEdges.filter(function(e) { return e.target === node.id; });
    var outgoing = allEdges.filter(function(e) { return e.source === node.id; });
    var refs = node.data.fqidRefs || [];
    var health = node.data.health;
    var hc = health != null ? (health >= 80 ? 'health-good' : health >= 50 ? 'health-mid' : 'health-bad') : null;

    detailsContent = React.createElement('div', { className: 'details' },
      React.createElement('div', { className: 'details__title' }, node.data.label || node.data.domainId),
      React.createElement('div', { className: 'details__id' },
        React.createElement('span', { className: 'details__id-text' }, node.data.domainId),
        React.createElement('button', { className: 'details__copy', onClick: function() { navigator.clipboard.writeText(node.data.domainId); }, title: 'Копировать' }, React.createElement(MIcon, { name: 'content_copy' }))
      ),
      React.createElement('div', { className: 'details__badges' },
        React.createElement('span', { className: 'details__badge details__badge--' + node.data.nodeType }, node.data.nodeType),
        health != null && React.createElement('span', { className: 'details__badge details__badge--' + hc }, 'Health: ' + health + '/100'),
        node.data.version && React.createElement('span', { className: 'details__badge' }, 'v' + node.data.version)
      ),
      node.data.description && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Описание'),
        React.createElement('div', { className: 'details__field-value' }, node.data.description)
      ),
      node.data.tags && node.data.tags.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Теги'),
        React.createElement('div', { className: 'details__tags' }, node.data.tags.map(function(t, i) { return React.createElement('span', { key: i, className: 'tag' }, t); }))
      ),
      REMOTE_INFO && REMOTE_INFO.server && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Каталог'),
        React.createElement('div', {
          className: 'details__field-value',
          style: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, wordBreak: 'break-word' }
        }, (node.data.folderPath && node.data.folderPath.length > 0)
          ? node.data.folderPath.join(' / ')
          : '(корень)')
      ),
      !(REMOTE_INFO && REMOTE_INFO.server) && node.data.filePath && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Файл'),
        React.createElement('div', {
          className: 'details__field-value',
          style: { fontSize: 11, fontFamily: 'monospace' }
        }, node.data.filePath)
      ),
      React.createElement('div', { className: 'details__actions' },
        node.data.filePath && React.createElement('button', { className: 'btn', onClick: function() { onOpenFile(node.data.filePath); } }, '📂 Открыть файл'),
        node.data.nodeType === 'domain' && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(node.data.domainId); } }, '🎯 Центрировать')
      ),
      ruleViolations.length > 0 && React.createElement('div', { className: 'section' },
        React.createElement('div', { className: 'section__title' }, 'Нарушения правил (' + ruleViolations.length + ')'),
        React.createElement('div', { className: 'rank-list' },
          ruleViolations.slice(0, 10).map(function(v, i) {
            return React.createElement('div', {
              key: i,
              className: 'rank-item',
              style: { cursor: 'pointer' },
              onClick: function() { gotoDomainByDomainId(v.fromId); }
            },
              React.createElement('span', { className: 'rank-item__num' }, v.severity === 'forbid' ? React.createElement(MIcon, { name: 'block' }) : React.createElement(MIcon, { name: 'warning' })),
              React.createElement('span', { className: 'rank-item__label' }, v.fromId + ' → ' + v.toId)
            );
          })
        )
      ),
      React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Исходящие FQID-ссылки (' + refs.length + ')'),
        refs.length === 0 ? React.createElement('div', { className: 'details__field-value', style: { color: 'var(--text-500)' } }, '—') :
          React.createElement('div', { className: 'details__refs' },
            refs.slice(0, 50).map(function(r, i) {
              var targetExists = allNodes.some(function(n) { return (n.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase(); });
              return React.createElement('div', {
                key: i,
                className: 'details__ref' + (targetExists ? '' : ' details__ref--missing'),
                onClick: function() { if (targetExists) onGotoDomain(r.targetDomainId); }
              },
                React.createElement('div', null, r.fullFQID),
                React.createElement('div', { className: 'details__ref-path' }, r.propertyPath + (!targetExists ? ' · ⚠️ missing' : ''))
              );
            })
          )
      ),
      incoming.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Входящие связи (' + incoming.length + ')'),
        React.createElement('div', { className: 'details__refs' },
          incoming.slice(0, 30).map(function(e, i) {
            var src = allNodes.find(function(n) { return n.id === e.source; });
            return React.createElement('div', { key: i, className: 'details__ref', onClick: function() { if (src) onGotoDomain(src.data.domainId); } },
              React.createElement('div', null, src ? src.data.domainId : e.source),
              React.createElement('div', { className: 'details__ref-path' }, (e.data && e.data.kind) || '')
            );
          })
        )
      ),
      outgoing.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Исходящие связи (' + outgoing.length + ')'),
        React.createElement('div', { className: 'details__refs' },
          outgoing.slice(0, 30).map(function(e, i) {
            var tgt = allNodes.find(function(n) { return n.id === e.target; });
            return React.createElement('div', { key: i, className: 'details__ref', onClick: function() { if (tgt) onGotoDomain(tgt.data.domainId); } },
              React.createElement('div', null, tgt ? tgt.data.domainId : e.target),
              React.createElement('div', { className: 'details__ref-path' }, (e.data && e.data.kind) || '')
            );
          })
        )
      ),
    );
  } else {
    detailsContent = React.createElement('div', { className: 'details' }, React.createElement('div', { style: { color: 'var(--text-500)', textAlign: 'center', padding: 40 } }, 'Узел не выбран'));
  }

  var fileContent = null;
  if (tab === 'file') {
    fileContent = React.createElement('div', { style: { flex: 1, minHeight: 0, position: 'relative' } },
      React.createElement('div', { id: 'monaco-container', style: { width: '100%', height: '100%' } }),
      !pendingFile && React.createElement('div', {
        style: {
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-500)', background: 'var(--bg-850)', fontSize: 13
        }
      }, 'Загрузка файла...')
    );
  }
  
  var edgeContent = null;
  if (tab === 'edge') {
    if (!edge) {
      edgeContent = React.createElement('div', { className: 'details' }, React.createElement('div', { style: { color: 'var(--text-500)', textAlign: 'center', padding: 40 } }, 'Связь не выбрана'));
    } else {
      var link = (edge.data && edge.data.linkData) || {};
      var refs = (edge.data && edge.data.fqidRefs) || [];
      var srcNode = allNodes.find(function(n) { return n.id === edge.source; });
      var tgtNode = allNodes.find(function(n) { return n.id === edge.target; });
      edgeContent = React.createElement('div', { className: 'details' },
        React.createElement('div', { className: 'details__title' }, (edge.data && edge.data.fullLabel) || edge.label || edge.id),
        React.createElement('div', { className: 'details__id' },
          React.createElement('span', { className: 'details__id-text' }, edge.id),
          React.createElement('button', { className: 'details__copy', onClick: function() { navigator.clipboard.writeText(edge.id); }, title: 'Копировать ID' }, React.createElement(MIcon, { name: 'content_copy' }))
        ),
        React.createElement('div', { className: 'details__badges' },
          edge.data && edge.data.kind && React.createElement('span', { className: 'details__badge' }, edge.data.kind),
          edge.data && edge.data.isBidirectional && React.createElement('span', { className: 'details__badge' }, '⇄ двунаправленная'),
          link.type && React.createElement('span', { className: 'details__badge' }, link.type),
          edge.data && edge.data.refCount && React.createElement('span', { className: 'details__badge' }, edge.data.refCount + ' refs')
        ),
        srcNode && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Источник'),
          React.createElement('div', { className: 'details__ref', onClick: function() { onGotoDomain(srcNode.data.domainId); } },
            React.createElement('div', null, srcNode.data.domainId),
            link.sourceEntity && React.createElement('div', { className: 'details__ref-path' }, link.sourceEntity)
          )
        ),
        tgtNode && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Цель'),
          React.createElement('div', { className: 'details__ref', onClick: function() { onGotoDomain(tgtNode.data.domainId); } },
            React.createElement('div', null, tgtNode.data.domainId),
            link.targetEntity && React.createElement('div', { className: 'details__ref-path' }, link.targetEntity)
          )
        ),
        link.nameFrom && (link.nameFrom.side1 || link.nameFrom.side2) && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Стороны'),
          link.nameFrom.side1 && React.createElement('div', { className: 'details__field-value' }, 'Сторона 1: ' + link.nameFrom.side1),
          link.nameFrom.side2 && React.createElement('div', { className: 'details__field-value' }, 'Сторона 2: ' + link.nameFrom.side2)
        ),
        refs.length > 0 && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'FQID-ссылки (' + refs.length + ')'),
          React.createElement('div', { className: 'details__refs' },
            refs.map(function(r, i) {
              return React.createElement('div', {
                key: i,
                className: 'details__ref',
                onClick: function() { if (r.targetDomainId) onGotoDomain(r.targetDomainId); }
              },
                React.createElement('div', null, r.fullFQID),
                React.createElement('div', { className: 'details__ref-path' }, r.propertyPath)
              );
            })
          )
        ),
        React.createElement('div', { className: 'details__actions' },
          srcNode && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(srcNode.data.domainId); } }, '🎯 К источнику'),
          tgtNode && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(tgtNode.data.domainId); } }, '🎯 К цели')
        )
      );
    }
  }
  
  var entitiesContent = null;
if (tab === 'entities') {
  var domainEntities = (props.entities || []).filter(function(e) {
    return e.domainId === (node && node.data && node.data.domainId);
  });

  var childIndex = props.entityIndex;
  entitiesContent = React.createElement('div', { className: 'details' },
    React.createElement('div', { className: 'details__field-label' }, 'Сущности домена (' + domainEntities.length + ')'),
    domainEntities.length === 0 ?
      React.createElement('div', { className: 'details__field-value', style: { color: 'var(--text-500)' } }, 'Нет сущностей') :
      React.createElement('div', { className: 'entity-tab-list' },
        domainEntities.map(function(e) {
          var key = (e.domainId + '/' + e.entityId).toLowerCase();
          var hasParents = !!e.inherits;
          var hasChildren = childIndex && (childIndex.children.get(key) || []).length > 0;
          return React.createElement('div', {
            key: key,
            className: 'entity-tab-item',
            onClick: function() { props.onOpenEntityHierarchy(key); }
          },
            React.createElement('div', { className: 'entity-tab-item__head' },
              React.createElement('span', { className: 'entity-tab-item__id' }, e.entityId),
              (hasParents || hasChildren) && React.createElement('span', { className: 'entity-tab-item__arrows' },
                (hasParents ? '↑' : '') + (hasChildren ? '↓' : '')
              )
            ),
            e.name && e.name !== e.entityId && React.createElement('div', { className: 'entity-tab-item__name' }, e.name),
            e.inherits && React.createElement('div', { className: 'entity-tab-item__inherits' }, '↳ ' + e.inherits)
          );
        })
      )
  );
}

  return React.createElement('div', { className: 'side-panel open' },
    React.createElement('div', { className: 'side-panel__header' },
      React.createElement('div', { className: 'side-panel__tabs' },
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'details' ? ' active' : ''), onClick: function() { setTab('details'); } }, '📋 Детали'),
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'file' ? ' active' : ''), onClick: function() { setTab('file'); } }, '📄 Файл'),
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'edge' ? ' active' : ''), onClick: function() { setTab('edge'); } }, '🔗 Связь'),
        React.createElement('button', {
  className: 'side-panel__tab' + (tab === 'entities' ? ' active' : ''),
  onClick: function() { setTab('entities'); }
}, '🧬 Сущности')
      ),
      React.createElement('button', { className: 'btn btn--icon', onClick: onClose, title: 'Закрыть' }, React.createElement(MIcon, { name: 'close' }))
    ),
    filePath && React.createElement('div', { className: 'editor-panel__path', style: { padding: '6px 16px', fontSize: 11, color: 'var(--text-500)', borderBottom: '1px solid var(--border)', background: 'var(--bg-800)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, filePath),
    React.createElement('div', { className: 'side-panel__body' },
      tab === 'details' ? detailsContent :
tab === 'edge' ? edgeContent :
tab === 'entities' ? entitiesContent :
fileContent
    )
  );
}

// ============ MENUS ============
function FilterMenu(props) {
  var filters = props.filters, setFilters = props.setFilters, counts = props.counts;
  var namespaceFilter = props.namespaceFilter, setNamespaceFilter = props.setNamespaceFilter;
  var bookmarksOnly = props.bookmarksOnly, setBookmarksOnly = props.setBookmarksOnly;
  var onlyInvalid = props.onlyInvalid, setOnlyInvalid = props.setOnlyInvalid;
  var isolatedOnly = props.isolatedOnly, setIsolatedOnly = props.setIsolatedOnly;
  var tooltipsEnabled = props.tooltipsEnabled, setTooltipsEnabled = props.setTooltipsEnabled;

  var setAll = function(val) { setFilters(function(f) { return Object.assign({}, f, { domain: val, missing: val, broken: val, linkage: val, fqid: val }); }); };
  var resetAll = function() {
    setAll(true);
    setNamespaceFilter('');
    setBookmarksOnly(false);
    setOnlyInvalid(false);
    setIsolatedOnly(false);
  };

  var rows = [
    { key: 'domain', label: 'Domain', color: 'var(--success)' },
    { key: 'missing', label: 'Missing', color: 'var(--warning)' },
    { key: 'broken', label: 'Broken', color: 'var(--danger)' }
  ];
  var edgesRows = [
    { key: 'linkage', label: 'Linkage', color: LINKAGE_COLOR },
    { key: 'fqid', label: 'FQID', color: FQID_COLOR }
  ];

  return React.createElement('div', { className: 'menu' },
    React.createElement('div', { className: 'menu__header' },
      React.createElement('span', null, 'Фильтры'),
      React.createElement('button', { className: 'menu__action', onClick: resetAll }, 'Сбросить')
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Тип узлов'),
      rows.map(function(it) {
        return React.createElement('label', { key: it.key, className: 'menu__checkbox' },
          React.createElement('input', { type: 'checkbox', checked: !!filters[it.key], onChange: function() { setFilters(function(f) { return Object.assign({}, f, { [it.key]: !f[it.key] }); }); } }),
          React.createElement('span', { className: 'menu__check' }),
          React.createElement('span', { className: 'menu__dot', style: { background: it.color } }),
          React.createElement('span', { className: 'menu__text' }, it.label),
          React.createElement('span', { className: 'menu__count' }, counts[it.key])
        );
      })
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Тип связей'),
      edgesRows.map(function(it) {
        return React.createElement('label', { key: it.key, className: 'menu__checkbox' },
          React.createElement('input', { type: 'checkbox', checked: !!filters[it.key], onChange: function() { setFilters(function(f) { return Object.assign({}, f, { [it.key]: !f[it.key] }); }); } }),
          React.createElement('span', { className: 'menu__check' }),
          React.createElement('span', { className: 'menu__dot', style: { background: it.color } }),
          React.createElement('span', { className: 'menu__text' }, it.label),
          React.createElement('span', { className: 'menu__count' }, counts[it.key])
        );
      })
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Namespace'),
      React.createElement('input', { className: 'menu__input', type: 'text', placeholder: 'sgrc.risk.*, !test.*', value: namespaceFilter, onChange: function(e) { setNamespaceFilter(e.target.value); }, onKeyDown: function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          document.dispatchEvent(new CustomEvent('close-all-popovers'));
        }
      } }),
      React.createElement('div', { className: 'menu__hint' }, 'Несколько масок через , ; или пробел. ', React.createElement('b', null, '!'), ' — исключить. ', React.createElement('b', null, '*'), ' — любой символ.')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Дополнительно'),

      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: bookmarksOnly, onChange: function() { setBookmarksOnly(!bookmarksOnly); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только избранные (★)')
      ),
      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: onlyInvalid, onChange: function() { setOnlyInvalid(!onlyInvalid); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только невалидные (❌)')
      ),
      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: isolatedOnly, onChange: function() { setIsolatedOnly(!isolatedOnly); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только изолированные (◯)')
      ),

      React.createElement('div', { className: 'menu__divider' }),

      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', {
          type: 'checkbox',
          checked: !props.sidePanelEnabled,
          onChange: function() { props.setSidePanelEnabled(!props.sidePanelEnabled); }
        }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Не показывать правую панель (D)')
      ),

      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: !tooltipsEnabled, onChange: function() { setTooltipsEnabled(!tooltipsEnabled); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Скрывать тултипы')
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
  var close = props.close;

  return React.createElement('div', { className: 'menu' },

    // --- Циклы ---
    React.createElement('button', {
      className: 'menu__item' + (cycleHighlight ? ' menu__item--active' : ''),
      onClick: function() { handleFindCycles(); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'cycle' })),
      React.createElement('span', { className: 'menu__text' }, 'Найти циклы'),
      cycleHighlight && React.createElement('span', { className: 'menu__count' }, cycleHighlight.sccCount)
    ),

    // --- Изолированные ---
    React.createElement('button', {
      className: 'menu__item' + (isolatedOnly ? ' menu__item--active' : ''),
      onClick: function() { setIsolatedOnly(function(v) { return !v; }); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'radio_button_unchecked' })),
      React.createElement('span', { className: 'menu__text' }, 'Только изолированные')
    ),

    // --- Агрегация по семействам ---
    React.createElement('button', {
      className: 'menu__item' + (nsMode ? ' menu__item--active' : ''),
      onClick: function() { setNsMode(function(v) { return !v; }); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'category' })),
      React.createElement('span', { className: 'menu__text' }, 'Агрегация по семействам')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    // --- Порядок установки ---
    React.createElement('button', {
      className: 'menu__item',
      onClick: function() { onOpenTopo(); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'inventory_2' })),
      React.createElement('span', { className: 'menu__text' }, 'Порядок установки')
    ),

    // --- Путь изучения ---
    React.createElement('button', {
      className: 'menu__item',
      onClick: function() { onOpenLearningPath(); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'menu_book' })),
      React.createElement('span', { className: 'menu__text' }, 'Путь изучения')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    // --- Правила зависимостей ---
    React.createElement('button', {
      className: 'menu__item' + (ruleViolations.length > 0 ? ' menu__item--active' : ''),
      onClick: function() { onOpenRules(); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'block' })),
      React.createElement('span', { className: 'menu__text' }, 'Правила зависимостей'),
      ruleViolations.length > 0 && React.createElement('span', { className: 'menu__count' }, ruleViolations.length)
    ),
    
    React.createElement('button', {
  className: 'menu__item',
  onClick: function() { props.onOpenEntityHierarchy(); close(); }
},
  React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'account_tree' })),
  React.createElement('span', { className: 'menu__text' }, 'Иерархия сущностей')
),

    React.createElement('div', { className: 'menu__divider' }),

    // --- Фокус: слайдер глубины ---
    React.createElement('div', { className: 'menu__row' },
      React.createElement('span', { style: { fontSize: 12, color: 'var(--text-400)', minWidth: 100 } }, 'Глубина фокуса:'),
      React.createElement('input', {
        className: 'menu__slider',
        type: 'range',
        min: 1,
        max: 4,
        value: focusDepth,
        onChange: function(e) { setFocusDepth(parseInt(e.target.value)); }
      }),
      React.createElement('span', {
        style: { fontSize: 12, fontWeight: 700, color: 'var(--accent-hover)', minWidth: 12, textAlign: 'center' }
      }, focusDepth)
    ),

    // --- Кнопка сброса фокуса (если активен) ---
    focusNode && React.createElement('button', {
      className: 'menu__item menu__item--danger',
      onClick: function() { clearFocus(); close(); }
    },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'close' })),
      React.createElement('span', { className: 'menu__text' }, 'Сбросить фокус')
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
  var close = props.close;
  var layouts = [
    { key: 'LR', label: 'Горизонтально (LR)' },
    { key: 'TB', label: 'Вертикально (TB)' },
    { key: 'force', label: 'Force-directed' },
    { key: 'circular', label: 'Круговой' }
  ];
  return React.createElement('div', { className: 'menu' },
      React.createElement('div', { className: 'menu__label' }, 'Раскладка'),
      React.createElement('button', {
            className: 'menu__item' + (props.layoutType === 'LR' ? ' menu__item--active' : ''),
            onClick: function() { props.setLayoutType('LR'); }
          },
          React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'LR' ? '●' : '○'),
          React.createElement('span', { className: 'menu__text' }, 'Горизонтальная (LR)')
      ),
      React.createElement('button', {
            className: 'menu__item' + (props.layoutType === 'TB' ? ' menu__item--active' : ''),
            onClick: function() { props.setLayoutType('TB'); }
          },
          React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'TB' ? '●' : '○'),
          React.createElement('span', { className: 'menu__text' }, 'Вертикальная (TB)')
      ),
      React.createElement('button', {
            className: 'menu__item' + (props.layoutType === 'force' ? ' menu__item--active' : ''),
            onClick: function() { props.setLayoutType('force'); }
          },
          React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'force' ? '●' : '○'),
          React.createElement('span', { className: 'menu__text' }, 'Force-directed')
      ),
      React.createElement('button', {
            className: 'menu__item' + (props.layoutType === 'circular' ? ' menu__item--active' : ''),
            onClick: function() { props.setLayoutType('circular'); }
          },
          React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'circular' ? '●' : '○'),
          React.createElement('span', { className: 'menu__text' }, 'Круговой')
      ),
      React.createElement('button', {
            className: 'menu__item' + (props.layoutType === 'cluster' ? ' menu__item--active' : ''),
            onClick: function() { props.setLayoutType('cluster'); }
          },
          React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'cluster' ? '●' : '○'),
          React.createElement('span', { className: 'menu__text' }, 'По семействам')
      ),
      React.createElement('button', {
        className: 'menu__item' + (props.layoutType === 'folder' ? ' menu__item--active' : ''),
        onClick: function() { props.setLayoutType('folder'); }
      },
        React.createElement('span', { className: 'menu__icon' }, props.layoutType === 'folder' ? '●' : '○'),
        React.createElement('span', { className: 'menu__text' }, 'По каталогам')
      ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('div', { className: 'menu__label' }, 'Heatmap'),
    [
      { key: 'none', label: 'Выключен' },
      { key: 'health', label: 'Health score' },
      { key: 'degree', label: 'Количество связей' },
      { key: 'entities', label: 'Entities' },
      { key: 'fqid', label: 'Исходящие FQID' }
    ].map(function(h) {
      return React.createElement('button', {
        key: h.key,
        className: 'menu__item' + (props.heatmap === h.key ? ' menu__item--active' : ''),
        onClick: function() { props.setHeatmap(h.key); close(); }
      },
        React.createElement('span', { className: 'menu__icon' }, props.heatmap === h.key ? '●' : '○'),
        React.createElement('span', { className: 'menu__text' }, h.label)
      );
    }),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('div', { className: 'menu__label' }, 'Отображение'),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: compact, onChange: function() { setCompact(!compact); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Компактный режим')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showGroups, onChange: function() { setShowGroups(!showGroups); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Группировка в рамки')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: bidirectional, onChange: function() { setBidirectional(!bidirectional); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Объединять A↔B')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showEdgeLabels, onChange: function() { setShowEdgeLabels(!showEdgeLabels); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Подписи связей')
    ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('button', { className: 'menu__item', onClick: function() { setTheme(theme === 'dark' ? 'light' : 'dark'); close(); } },
      React.createElement('span', { className: 'menu__icon' }, theme === 'dark' ? React.createElement(MIcon, { name: 'light_mode' }) : React.createElement(MIcon, { name: 'dark_mode' })),
      React.createElement('span', { className: 'menu__text' }, theme === 'dark' ? 'Светлая тема' : 'Тёмная тема')
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
  var close = props.close;

  return React.createElement('div', { className: 'menu' },
    React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Экспорт'),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportJSON(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'save' })),
      React.createElement('span', { className: 'menu__text' }, 'Граф в JSON')
    ),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportMarkdown(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'description' })),
      React.createElement('span', { className: 'menu__text' }, 'Отчёт в Markdown')
    ),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportPNG(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'image' })),
      React.createElement('span', { className: 'menu__text' }, 'Граф в PNG')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Сравнение'),
    React.createElement('label', { className: 'menu__item' },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'swap_horiz' })),
      React.createElement('span', { className: 'menu__text' }, 'Загрузить снимок'),
      React.createElement('input', { ref: snapshotInputRef, type: 'file', accept: 'application/json', style: { display: 'none' }, onChange: function(e) { handleSnapshotUpload(e); close(); } })
    ),
    diffMode && React.createElement('button', { className: 'menu__item menu__item--danger', onClick: function() { setDiffMode(null); close(); } },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'close' })),
      React.createElement('span', { className: 'menu__text' }, 'Сбросить diff')
    ),

    validationAvailable && React.createElement('div', { className: 'menu__divider' }),
    validationAvailable && React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Валидация'),
    validationAvailable && React.createElement('button', { className: 'menu__item', onClick: function() { onOpenValidation(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, React.createElement(MIcon, { name: 'search' })),
      React.createElement('span', { className: 'menu__text' }, 'Массовая валидация доменов')
    )
  );
}

// ============ SEARCH MODAL ============
function ActiveModesBar(props) {
  var modes = props.modes;
  if (!modes || modes.length === 0) return null;

  return React.createElement('div', { className: 'active-modes' },
    modes.map(function(m, i) {
      return React.createElement('div', {
        key: i,
        className: 'active-mode active-mode--' + (m.color || 'accent')
      },
        React.createElement('span', { className: 'active-mode__icon' }, m.icon),
        React.createElement('span', { className: 'active-mode__label' }, m.label),
        m.onClear && React.createElement('button', {
          className: 'active-mode__close',
          onClick: m.onClear,
          title: 'Отключить'
        }, React.createElement(MIcon, { name: 'close' }))
      );
    })
  );
}

function SearchModal(props) {
  var open = props.open;
  var query = props.query, setQuery = props.setQuery;
  var results = props.results, index = props.index, setIndex = props.setIndex;
  var commands = props.commands || [];
  var onSelect = props.onSelect, onClose = props.onClose;
  var inputRef = props.inputRef;

  var filteredCommands = useMemo(function() {
    var q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(function(c) {
      var hay = (c.label + ' ' + (c.keywords || '') + ' ' + (c.section || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }, [query, commands]);

  // Единый индекс: сначала команды, потом домены
  var totalItems = filteredCommands.length + results.length;
  var safeIndex = Math.min(index, Math.max(totalItems - 1, 0));

  // Сгруппировать команды по секциям для отображения
  var commandsBySection = useMemo(function() {
    var map = new Map();
    filteredCommands.forEach(function(c) {
      var s = c.section || 'Прочее';
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(c);
    });
    return Array.from(map.entries());
  }, [filteredCommands]);

  if (!open) return null;

  var onKey = function(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(safeIndex - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (totalItems === 0) return;
      if (safeIndex < filteredCommands.length) {
        // Команда
        var cmd = filteredCommands[safeIndex];
        onClose();
        setTimeout(function() { cmd.run(); }, 50);
      } else {
        // Домен
        var domainItem = results[safeIndex - filteredCommands.length];
        if (domainItem) onSelect(domainItem.node.data.domainId);
      }
    }
  };

  var cmdIdx = 0;
  var domainStartIdx = filteredCommands.length;

  return React.createElement('div', { className: 'search-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'search-modal search-modal--palette', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'search-modal__input-wrap' },
        React.createElement('span', { className: 'search-modal__icon' }, '⌘'),
        React.createElement('input', {
          ref: inputRef,
          className: 'search-modal__input',
          type: 'text',
          placeholder: 'Команда или домен...',
          value: query,
          onChange: function(e) { setQuery(e.target.value); },
          onKeyDown: onKey
        }),
        React.createElement('kbd', { className: 'search-modal__kbd' }, 'Esc')
      ),

      React.createElement('div', { className: 'search-modal__results' },

        // Команды
        filteredCommands.length > 0 && commandsBySection.map(function(entry) {
          var section = entry[0];
          var cmds = entry[1];
          return React.createElement('div', { key: 'sec-' + section, className: 'palette-section' },
            React.createElement('div', { className: 'palette-section__title' }, section),
            cmds.map(function(cmd) {
              var itemIdx = cmdIdx++;
              var isActive = itemIdx === safeIndex;
              return React.createElement('div', {
                key: 'cmd-' + itemIdx,
                className: 'palette-item palette-item--command' + (isActive ? ' active' : ''),
                onMouseEnter: function() { setIndex(itemIdx); },
                onClick: function() { onClose(); setTimeout(function() { cmd.run(); }, 50); }
              },
                React.createElement('span', { className: 'palette-item__icon' }, cmd.icon || '•'),
                React.createElement('span', { className: 'palette-item__label' }, cmd.label),
                cmd.hotkey && React.createElement('kbd', { className: 'palette-item__hotkey' }, cmd.hotkey)
              );
            })
          );
        }),

        // Домены
        results.length > 0 && React.createElement('div', { className: 'palette-section' },
          React.createElement('div', { className: 'palette-section__title' }, 'Домены (' + results.length + ')'),
          results.slice(0, 50).map(function(item, i) {
            var itemIdx = domainStartIdx + i;
            var isActive = itemIdx === safeIndex;
            var n = item.node;
            var matched = new Set(item.matches.map(function(m) { return m.field; }));
            return React.createElement('div', {
              key: 'dom-' + i,
              className: 'palette-item' + (isActive ? ' active' : ''),
              onMouseEnter: function() { setIndex(itemIdx); },
              onClick: function() { onSelect(n.data.domainId); }
            },
              React.createElement('span', { className: 'palette-item__icon' },
                React.createElement('span', { className: 'search-result__dot search-result__dot--' + n.data.nodeType })
              ),
              React.createElement('div', { className: 'palette-item__content' },
                React.createElement('div', { className: 'search-result__id' },
                  React.createElement(HighlightedText, { text: n.data.domainId, query: query }),
                  matched.has('id') && React.createElement('span', { className: 'search-result__badge' }, 'id')
                ),
                n.data.name && n.data.name !== n.data.domainId && React.createElement('div', { className: 'search-result__label' },
                  React.createElement(HighlightedText, { text: n.data.name, query: query }),
                  matched.has('name') && React.createElement('span', { className: 'search-result__badge' }, 'name')
                )
              )
            );
          })
        ),

        // Пусто
        query.trim() === '' && filteredCommands.length === 0 && results.length === 0 &&
          React.createElement('div', { className: 'search-modal__hint' }, 'Начните вводить команду или имя домена'),
        query.trim() !== '' && filteredCommands.length === 0 && results.length === 0 &&
          React.createElement('div', { className: 'search-modal__hint' }, 'Ничего не найдено')
      ),

      React.createElement('div', { className: 'search-modal__footer' },
        React.createElement('span', null, React.createElement('kbd', null, '↑'), React.createElement('kbd', null, '↓'), ' навигация'),
        React.createElement('span', null, React.createElement('kbd', null, 'Enter'), ' выбрать'),
        React.createElement('span', null, React.createElement('kbd', null, 'Esc'), ' закрыть')
      )
    )
  );
}

// ============ TOOLTIP ============
function Toast(props) {
  var message = props.message;
  var actions = props.actions || [];
  var onClose = props.onClose;
  var duration = props.duration || 20000;
  var [visible, setVisible] = useState(true);
  var [copied, setCopied] = useState(false);

  useEffect(function() {
    if (!duration) return;
    var t = setTimeout(function() { setVisible(false); if (onClose) onClose(); }, duration);
    return function() { clearTimeout(t); };
  }, []);

  if (!visible) return null;

  var copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 1500);
    });
  };

  return React.createElement('div', { className: 'toast' },
    React.createElement('div', { className: 'toast__body' },
      React.createElement('div', { className: 'toast__message', dangerouslySetInnerHTML: { __html: message } }),
      actions.map(function(a, i) {
        return React.createElement('div', { key: i, className: 'toast__action' },
          a.command && React.createElement('code', { className: 'toast__command' }, a.command),
          a.command && React.createElement('button', {
            className: 'toast__btn',
            onClick: function() { copyToClipboard(a.command); }
          }, copied ? '✓ Скопировано' : '📋 Копировать')
        );
      })
    ),
    React.createElement('button', { className: 'toast__close', onClick: function() { setVisible(false); if (onClose) onClose(); } }, React.createElement(MIcon, { name: 'close' }))
  );
}

function HoverTooltip(props) {
  var tooltip = props.tooltip;
  var onHide = props.onHide;
  if (!tooltip) return null;
  var style = { left: tooltip.x, top: tooltip.y };
  return React.createElement('div', {
    className: 'tooltip',
    style: style,
    onMouseEnter: function() { window.__tooltipHovered = true; },
    onMouseLeave: function() { window.__tooltipHovered = false; if (onHide) onHide(); }
  },
    React.createElement('div', { dangerouslySetInnerHTML: { __html: tooltip.html } })
  );
}

// ============ INNER (ReactFlow wrapper) ============
var ReactFlowInner = React.memo(function(props) {
  var rf = useReactFlow();
  useEffect(function() { props.setRfInstance(rf); }, [rf]);
  var zoomClass = useStore(function(s) {
  return s.transform[2] < 0.5 ? 'hide' : 'show';
});

useEffect(function() {
  var el = document.querySelector('.graph-container');
  if (!el) return;
  el.classList.toggle('hide-labels', zoomClass === 'hide');
}, [zoomClass]);

useEffect(function() {
  var el = document.querySelector('.graph-container');
  if (!el) return;
  el.classList.toggle('perf-mode', !!props.perfMode);
}, [props.perfMode]);
var defaultEdgeOptions = useMemo(function() {
  return {
    type: props.perfMode ? 'default' : 'smoothstep',
    animated: false,
    labelStyle: { fill: '#e2e8f0', fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: '#0d1424', fillOpacity: 0.95 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4
  };
}, [props.perfMode]);
  return React.createElement(ReactFlow, {
    nodes: props.nodes,
    edges: props.edges,
    onNodesChange: props.readOnly ? function() {} : props.onNodesChange,
    onEdgesChange: props.readOnly ? function() {} : props.onEdgesChange,
    onEdgeClick: props.onEdgeClick,
    nodeTypes: nodeTypes,
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
    defaultEdgeOptions: defaultEdgeOptions
  },
    React.createElement(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1, color: 'var(--graph-dots)' }),
    React.createElement(Controls, { position: 'bottom-left' }),
    React.createElement(MiniMap, { position: 'bottom-right', nodeColor: function(n) { var t = n.data && n.data.nodeType; if (t === 'missing') return '#f59e0b'; if (t === 'broken') return '#ef4444'; return '#10b981'; }, maskColor: 'rgba(10,14,26,0.7)', style: { width: 180, height: 130 } })
  );
});

function evaluateRules(edges, nodes, rules) {
  if (!Array.isArray(edges) || !Array.isArray(nodes) || !Array.isArray(rules)) {
    return [];
  }
  var violations = [];
  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });
  edges.forEach(function(e) {
    var src = nodeById.get(e.source);
    var tgt = nodeById.get(e.target);
    if (!src || !tgt) return;
    var fromId = (src.data.domainId || '').toLowerCase();
    var toId = (tgt.data.domainId || '').toLowerCase();
    rules.forEach(function(rule) {
      if (!rule.from || !rule.to) return;
      if (simplePatternMatch(fromId, rule.from.toLowerCase()) &&
          simplePatternMatch(toId, rule.to.toLowerCase())) {
        violations.push({
          ruleId: rule.id,
          rule: rule,
          edgeId: e.id,
          fromId: src.data.domainId,
          toId: tgt.data.domainId,
          severity: rule.action || 'warn'
        });
      }
    });
  });
  return violations;
}

function RulesMenu(props) {
  var rules = props.rules, setRules = props.setRules;
  var violations = props.violations;
  var rulesHighlighted = props.rulesHighlighted, setRulesHighlighted = props.setRulesHighlighted;
  var showViolationsOnly = props.showViolationsOnly, setShowViolationsOnly = props.setShowViolationsOnly;
  var close = props.close;
  var [draft, setDraft] = useState({ from: '', to: '', action: 'warn', message: '' });

  var addRule = function() {
    if (!draft.from || !draft.to) return;
    setRules(function(prev) {
      var arr = Array.isArray(prev) ? prev : [];
      return arr.concat([Object.assign({ id: 'r' + Date.now() }, draft)]);
    });
    setDraft({ from: '', to: '', action: 'warn', message: '' });
  };
  var removeRule = function(id) {
    setRules(function(prev) {
      return (Array.isArray(prev) ? prev : []).filter(function(r) { return r.id !== id; });
    });
  };
  var toggleAction = function(id) {
    setRules(function(prev) {
      return (Array.isArray(prev) ? prev : []).map(function(r) {
        if (r.id !== id) return r;
        return Object.assign({}, r, { action: r.action === 'forbid' ? 'warn' : 'forbid' });
      });
    });
  };

  return React.createElement('div', { className: 'menu', style: { width: 380, padding: 12 } },
    React.createElement('div', { className: 'menu__label' }, 'Правила зависимостей'),
    rules.length === 0 && React.createElement('div', { style: { fontSize: 11, color: 'var(--text-500)', padding: '8px 10px' } }, 'Правила не заданы'),
    rules.map(function(r) {
      return React.createElement('div', { key: r.id, className: 'rule-item' },
        React.createElement('button', {
          className: 'rule-item__action rule-item__action--' + r.action,
          onClick: function() { toggleAction(r.id); },
          title: r.action === 'forbid' ? 'Запрещено' : 'Предупреждение'
        }, r.action === 'forbid' ? React.createElement(MIcon, { name: 'block' }) : React.createElement(MIcon, { name: 'warning' })),
        React.createElement('div', { className: 'rule-item__body' },
          React.createElement('div', { className: 'rule-item__pattern' }, r.from + ' → ' + r.to),
          r.message && React.createElement('div', { className: 'rule-item__message' }, r.message)
        ),
        React.createElement('button', { className: 'rule-item__remove', onClick: function() { removeRule(r.id); } }, React.createElement(MIcon, { name: 'close' }))
      );
    }),
    React.createElement('div', { className: 'rule-form' },
      React.createElement('input', { className: 'menu__input', placeholder: 'from (ui.*)', value: draft.from, onChange: function(e) { setDraft(Object.assign({}, draft, { from: e.target.value })); } }),
      React.createElement('input', { className: 'menu__input', placeholder: 'to (db.*)', value: draft.to, onChange: function(e) { setDraft(Object.assign({}, draft, { to: e.target.value })); } }),
      React.createElement('input', { className: 'menu__input', placeholder: 'комментарий', value: draft.message, onChange: function(e) { setDraft(Object.assign({}, draft, { message: e.target.value })); } }),
      React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        React.createElement('select', { className: 'menu__input', style: { flex: 1 }, value: draft.action, onChange: function(e) { setDraft(Object.assign({}, draft, { action: e.target.value })); } },
          React.createElement('option', { value: 'warn' }, '⚠️ Warn'),
          React.createElement('option', { value: 'forbid' }, '⛔ Forbid')
        ),
        React.createElement('button', { className: 'btn btn--primary', onClick: addRule }, 'Добавить')
      )
    ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: rulesHighlighted, onChange: function() { setRulesHighlighted(!rulesHighlighted); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Подсвечивать нарушения')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showViolationsOnly, onChange: function() { setShowViolationsOnly(!showViolationsOnly); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Показать только нарушения')
    ),
    React.createElement('div', { style: { padding: '6px 10px', fontSize: 11, color: 'var(--text-500)' } },
      violations.length === 0 ? 'Нарушений нет ✅' : 'Найдено: ' + violations.length
    ),
    React.createElement('div', { style: { padding: '4px 10px' } },
      React.createElement('button', { className: 'menu__action', onClick: close }, 'Закрыть')
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

  var [scope, setScope] = useState('all');
  var [path, setPath] = useState(null);
  var [expandedStages, setExpandedStages] = useState(function() { return new Set([0]); });

  useEffect(function() {
    if (!open) {
      setPath(null);
      setExpandedStages(new Set([0]));
    }
  }, [open]);

  var build = useCallback(function() {
    var restrictTo = null;
    if (scope === 'visible') {
      restrictTo = new Set();
      visibleDomains.forEach(function(d) { restrictTo.add(d.id); });
    } else if (scope === 'bookmarked') {
      restrictTo = new Set();
      bookmarkedDomains.forEach(function(d) { restrictTo.add(d.id); });
    }

    var nodes = allNodes;
    var edges = allEdges;
    if (restrictTo) {
      nodes = allNodes.filter(function(n) { return restrictTo.has(n.id) || n.data.nodeType !== 'domain'; });
      edges = allEdges.filter(function(e) { return restrictTo.has(e.source) && restrictTo.has(e.target); });
    }

    var result = computeLearningPath(nodes, edges);
    setPath(result);
  }, [scope, allNodes, allEdges, visibleDomains, bookmarkedDomains]);

  var exportMD = useCallback(function() {
    if (!path) return;
    var md = generateLearningPathMarkdown(path, {
      scope: scope === 'all' ? 'все домены' : scope === 'visible' ? 'видимые' : 'избранные'
    });
    downloadFile(md, 'learning-path-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.md', 'text/markdown;charset=utf-8');
  }, [path, scope]);

  var exportJSON = useCallback(function() {
    if (!path) return;
    downloadFile(JSON.stringify(path, null, 2), 'learning-path-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.json', 'application/json');
  }, [path]);

  var copyAsText = useCallback(function() {
    if (!path) return;
    var lines = [];
    lines.push('Порядок изучения (' + path.totalStages + ' этапов):');
    path.stages.forEach(function(stage) {
      lines.push('');
      lines.push('— Этап ' + (stage.index + 1) + ' —');
      stage.domains.forEach(function(d) { lines.push('  ' + d.domainId); });
    });
    navigator.clipboard.writeText(lines.join('\n'));
  }, [path]);

  var toggleStage = useCallback(function(idx) {
    setExpandedStages(function(prev) {
      var s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  }, []);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal learning-path-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '📖 Путь изучения архитектуры'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, React.createElement(MIcon, { name: 'close' }))
      ),

      React.createElement('div', { className: 'validation-modal__body' },

        !path && React.createElement('div', { className: 'validation-scope' },
          React.createElement('div', { className: 'validation-scope__label' }, 'Область'),
          scopeOption('all', 'Все домены', allNodes.filter(function(n) { return n.data.nodeType === 'domain'; }).length, scope, setScope),
          scopeOption('visible', 'Только видимые', visibleDomains.length, scope, setScope),
          scopeOption('bookmarked', 'Только избранные', bookmarkedDomains.length, scope, setScope),

          React.createElement('div', { className: 'learning-path-hint', style: { marginTop: 20 } },
            React.createElement('div', { className: 'learning-path-hint__title' }, 'Что это даёт'),
            React.createElement('ul', { className: 'learning-path-hint__list' },
              React.createElement('li', null, 'Порядок чтения — от «фундамента» к верхним слоям, чтобы зависимости были понятны с самого начала.'),
              React.createElement('li', null, 'Точки входа — домены, которые никто не использует: они показывают функциональность верхнего уровня.'),
              React.createElement('li', null, 'Камера экскурсии ведёт по этапам, показывая подсказки по каждому домену.')
            )
          ),

          React.createElement('button', {
            className: 'btn btn--primary',
            onClick: build,
            style: { marginTop: 20, width: '100%', justifyContent: 'center' }
          }, '▶ Построить путь изучения')
        ),

        path && React.createElement('div', { className: 'topo-result' },

          path.entryPoints.length > 0 && React.createElement('div', { className: 'learning-entry-points' },
            React.createElement('div', { className: 'learning-entry-points__header' },
              React.createElement('span', { className: 'learning-entry-points__icon' }, React.createElement(MIcon, { name: 'login' })),
              React.createElement('span', null, 'Точки входа (' + path.entryPoints.length + ')'),
              React.createElement('span', { className: 'learning-entry-points__hint' }, '— никто не зависит от них, но они зависят от других')
            ),
            React.createElement('div', { className: 'learning-entry-points__body' },
              path.entryPoints.slice(0, 12).map(function(d) {
                return React.createElement('a', {
                  key: d.id,
                  className: 'validation-log__domain',
                  onClick: function() { onGotoDomain(d.domainId); onClose(); }
                }, d.domainId);
              }),
              path.entryPoints.length > 12 && React.createElement('span', { style: { fontSize: 11, color: 'var(--text-500)' } },
                '...и ещё ' + (path.entryPoints.length - 12)
              )
            )
          ),

          path.stages.map(function(stage) {
            var isOpen = expandedStages.has(stage.index);
            return React.createElement('div', { key: stage.index, className: 'topo-level' + (isOpen ? ' topo-level--open' : '') },
              React.createElement('div', { className: 'topo-level__header', onClick: function() { toggleStage(stage.index); } },
                React.createElement('span', { className: 'validation-log__chevron' }, isOpen ? React.createElement(MIcon, { name: 'expand_more' }) : React.createElement(MIcon, { name: 'chevron_right' })),
                React.createElement('span', { className: 'topo-level__badge learning-path-stage-badge' }, stage.index + 1),
                React.createElement('span', { className: 'topo-level__title' }, 'Этап ' + (stage.index + 1)),
                React.createElement('span', { className: 'topo-level__count' },
                  stage.domains.length + ' ' + plural(stage.domains.length, 'домен', 'доменов')
                )
              ),
              isOpen && React.createElement('div', { className: 'topo-level__body learning-stage-body' },
                stage.domains.map(function(d) {
                  return React.createElement('div', { key: d.id, className: 'learning-domain-card' },
                    React.createElement('div', { className: 'learning-domain-card__head' },
                      React.createElement('a', {
                        className: 'validation-log__domain',
                        onClick: function() { onGotoDomain(d.domainId); onClose(); }
                      }, d.domainId),
                      d.label && d.label !== d.domainId && React.createElement('span', { className: 'learning-domain-card__label' }, d.label)
                    ),
                    d.description && React.createElement('div', { className: 'learning-domain-card__desc' }, d.description),
                    React.createElement('div', { className: 'learning-domain-card__stats' },
                      d.fanIn > 0 && React.createElement('span', { className: 'learning-domain-stat' },
                        React.createElement('span', { className: 'learning-domain-stat__icon' }, '↑'), d.fanIn, ' входящих'
                      ),
                      d.fanOut > 0 && React.createElement('span', { className: 'learning-domain-stat' },
                        React.createElement('span', { className: 'learning-domain-stat__icon' }, '↓'), d.fanOut, ' исходящих'
                      ),
                      d.entitiesCount != null && React.createElement('span', { className: 'learning-domain-stat' },
                        d.entitiesCount + ' entities'
                      ),
                      d.tags && d.tags.length > 0 && React.createElement('span', { className: 'learning-domain-stat learning-domain-stat--tags' },
                        d.tags.slice(0, 4).join(', ')
                      )
                    )
                  );
                })
              )
            );
          }),

          path.unresolved.length > 0 && React.createElement('div', { className: 'topo-cyclic' },
            React.createElement('div', { className: 'topo-cyclic__header' },
              React.createElement('span', { className: 'topo-cyclic__icon' }, React.createElement(MIcon, { name: 'warning' })),
              React.createElement('span', null, 'В цикле — читать после всех (' + path.unresolved.length + ')')
            ),
            React.createElement('div', { className: 'topo-cyclic__body' },
              path.unresolved.map(function(d) {
                return React.createElement('a', {
                  key: d.id,
                  className: 'validation-log__domain',
                  onClick: function() { onGotoDomain(d.domainId); onClose(); }
                }, d.domainId);
              })
            )
          )
        )
      ),

      path && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat' }, '📖 ' + path.totalDomains + ' доменов'),
          React.createElement('span', { className: 'validation-stat validation-stat--ok' }, '📊 ' + path.totalStages + ' этапов'),
          path.entryPoints.length > 0 && React.createElement('span', { className: 'validation-stat' }, '🚪 ' + path.entryPoints.length + ' входов')
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn btn--primary', onClick: function() { onStartTour(path); onClose(); } }, '▶ Начать экскурсию'),
          React.createElement('button', { className: 'btn', onClick: copyAsText }, '📋 Копировать'),
          React.createElement('button', { className: 'btn', onClick: exportJSON }, '💾 JSON'),
          React.createElement('button', { className: 'btn', onClick: exportMD }, '📝 MD'),
          React.createElement('button', { className: 'btn', onClick: function() { setPath(null); } }, '← Настройки')
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

  if (!tour) return null;

  var allItems = useMemo(function() {
    var items = [];
    tour.stages.forEach(function(stage) {
      stage.domains.forEach(function(d) {
        items.push({
          domainId: d.domainId,
          nodeId: d.id,
          stageIndex: stage.index,
          stageNumber: stage.index + 1,
          domainData: d
        });
      });
    });
    return items;
  }, [tour]);

  var current = allItems[tour.index];
  if (!current) return null;

  var d = current.domainData;
  var pct = Math.round((tour.index + 1) / allItems.length * 100);

  return React.createElement('div', { className: 'tour-overlay' },
    React.createElement('div', { className: 'tour-overlay__card' },
      React.createElement('div', { className: 'tour-overlay__header' },
        React.createElement('span', { className: 'tour-overlay__stage-badge' }, 'Этап ' + current.stageNumber),
        React.createElement('span', { className: 'tour-overlay__counter' }, (tour.index + 1) + ' / ' + allItems.length),
        React.createElement('button', { className: 'tour-overlay__close', onClick: onStop, title: 'Завершить' }, React.createElement(MIcon, { name: 'close' }))
      ),
      React.createElement('div', { className: 'tour-overlay__title' }, current.domainId),
      d.label && d.label !== current.domainId && React.createElement('div', { className: 'tour-overlay__subtitle' }, d.label),
      d.description && React.createElement('div', { className: 'tour-overlay__desc' }, d.description),
      React.createElement('div', { className: 'tour-overlay__stats' },
        d.fanIn > 0 && React.createElement('span', { className: 'tour-stat' }, '↑ ' + d.fanIn + ' входящих'),
        d.fanOut > 0 && React.createElement('span', { className: 'tour-stat' }, '↓ ' + d.fanOut + ' исходящих'),
        d.entitiesCount != null && React.createElement('span', { className: 'tour-stat' }, d.entitiesCount + ' entities')
      ),
      d.tags && d.tags.length > 0 && React.createElement('div', { className: 'tour-overlay__tags' },
        d.tags.slice(0, 6).map(function(t, i) {
          return React.createElement('span', { key: i, className: 'tag', style: { fontSize: 10 } }, t);
        })
      ),
      React.createElement('div', { className: 'tour-overlay__progress' },
        React.createElement('div', { className: 'tour-overlay__progress-bar' },
          React.createElement('div', { className: 'tour-overlay__progress-fill', style: { width: pct + '%' } })
        )
      ),
      React.createElement('div', { className: 'tour-overlay__controls' },
        React.createElement('button', {
          className: 'tour-btn',
          onClick: onPrev,
          disabled: tour.index === 0,
          title: 'Назад'
        }, React.createElement(MIcon, { name: 'chevron_left' })),
        React.createElement('button', {
          className: 'tour-btn tour-btn--primary',
          onClick: onTogglePlay,
          title: tour.playing ? 'Пауза' : 'Играть'
        }, tour.playing ? React.createElement(MIcon, { name: 'pause' }) : React.createElement(MIcon, { name: 'play_arrow' })),
        React.createElement('button', {
          className: 'tour-btn',
          onClick: onNext,
          disabled: tour.index >= allItems.length - 1,
          title: 'Дальше'
        }, React.createElement(MIcon, { name: 'play_arrow' }))
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

  var [scope, setScope] = useState('all');
  var [includeFqid, setIncludeFqid] = useState(true);
  var [includeLinkage, setIncludeLinkage] = useState(true);
  var [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
  var [excludePattern, setExcludePattern] = useState('');
  var [result, setResult] = useState(null);
  var [expandedLevels, setExpandedLevels] = useState(function() { return new Set(); });
  var [expandedDeps, setExpandedDeps] = useState(function() { return new Set(); });
  var [autoBreak, setAutoBreak] = useState(false);

  useEffect(function() {
    if (!open) {
      setResult(null);
      setExpandedLevels(new Set());
      setExpandedDeps(new Set());
    }
  }, [open]);

  var build = useCallback(function() {
    var nodeSet;
    if (scope === 'visible') nodeSet = visibleDomains;
    else if (scope === 'bookmarked') nodeSet = bookmarkedDomains;
    else nodeSet = allDomains;

    var restrictTo = new Set();
    nodeSet.forEach(function(d) { restrictTo.add(d.domainId); });

    var excludedIds = new Set();
    var tokens = excludePattern.replace(/[,;]/g, ' ').split(' ').filter(function(t) { return t.length > 0; });
    if (tokens.length > 0) {
      allNodes.forEach(function(n) {
        if (n.data.nodeType !== 'domain') return;
        for (var i = 0; i < tokens.length; i++) {
          if (simplePatternMatch(n.data.domainId.toLowerCase(), tokens[i].toLowerCase())) {
            excludedIds.add(n.data.domainId.toLowerCase());
            return;
          }
        }
      });
    }

    var depGraph = buildDependencyGraph(allNodes, allEdges, {
      includeFqid: includeFqid,
      includeLinkage: includeLinkage,
      missingAsSatisfied: missingAsSatisfied,
      excludedIds: excludedIds,
      restrictTo: restrictTo
    });

    var sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });

    // Карта уровней
    var levelMap = new Map();
    sorted.levels.forEach(function(level, idx) {
      level.forEach(function(id) { levelMap.set(id, idx + 1); });
    });

    setResult({
      levels: sorted.levels,
      cyclic: sorted.cyclic,
      broken: sorted.broken || [],
      criticalPath: sorted.criticalPath,
      levelMap: levelMap,
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
    if (!result) return;
    var data = {
      generatedAt: new Date().toISOString(),
      scope: scope,
      options: { includeFqid: includeFqid, includeLinkage: includeLinkage, missingAsSatisfied: missingAsSatisfied, excludePattern: excludePattern },
      criticalPath: result.criticalPath,
      stats: result.stats,
      levels: result.levels,
      cyclic: result.cyclic,
      broken: result.broken,
    };
    downloadFile(JSON.stringify(data, null, 2), 'topo-sort-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.json', 'application/json');
  }, [result, scope, includeFqid, includeLinkage, missingAsSatisfied, excludePattern]);

  var exportMD = useCallback(function() {
    if (!result) return;
    var lines = [];
    lines.push('# Порядок установки доменов');
    lines.push('');
    lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
    lines.push('');
    lines.push('Уровни можно устанавливать параллельно. Домены внутри уровня — одновременно.');
    lines.push('');
    lines.push('## Сводка');
    lines.push('');
    lines.push('| Метрика | Значение |');
    lines.push('| --- | ---: |');
    lines.push('| Всего доменов | ' + result.stats.total + ' |');
    lines.push('| Уровней | ' + result.stats.levels + ' |');
    lines.push('| Критический путь | ' + result.stats.criticalPath + ' |');
    lines.push('| В циклах | ' + result.stats.cyclic + ' |');
    lines.push('');
    result.levels.forEach(function(level, idx) {
      lines.push('## Уровень ' + (idx + 1) + ' (' + level.length + ')');
      lines.push('');
      level.forEach(function(id) { lines.push('- `' + id + '`'); });
      lines.push('');
    });
    if (result.broken && result.broken.length > 0) {
      lines.push('## 🔗 Разорванные циклы (' + result.broken.length + ')');
      lines.push('');
      lines.push('Эти домены были размещены автоматически, но зависимости внутри цикла пришлось разорвать:');
      lines.push('');
      result.broken.forEach(function(b) {
        lines.push('- `' + b.id + '` (уровень ' + b.level + ')' + (b.brokenDeps.length > 0 ? ' — разорвано связей: ' + b.brokenDeps.length : ''));
        b.brokenDeps.forEach(function(d) { lines.push('  - `' + d + '`'); });
      });
      lines.push('');
    }
    if (result.cyclic.length > 0) {
      lines.push('## ⚠️ Требуют ручного вмешательства — циклические (' + result.cyclic.length + ')');
      lines.push('');
      result.cyclic.forEach(function(id) { lines.push('- `' + id + '`'); });
      lines.push('');
    }
    downloadFile(lines.join('\n'), 'topo-sort-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.md', 'text/markdown;charset=utf-8');
  }, [result]);

  var copyAsText = useCallback(function() {
    if (!result) return;
    var lines = [];
    result.levels.forEach(function(level, idx) {
      lines.push('# Уровень ' + (idx + 1));
      level.forEach(function(id) { lines.push(id); });
      lines.push('');
    });
    if (result.cyclic.length > 0) {
      lines.push('# Циклические (ручное вмешательство)');
      result.cyclic.forEach(function(id) { lines.push(id); });
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }, [result]);

  var toggleLevel = useCallback(function(idx) {
    setExpandedLevels(function(prev) {
      var s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  }, []);

  var toggleDeps = useCallback(function(domainId) {
    setExpandedDeps(function(prev) {
      var s = new Set(prev);
      if (s.has(domainId)) s.delete(domainId); else s.add(domainId);
      return s;
    });
  }, []);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal topo-modal', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '📦 Порядок установки доменов'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, React.createElement(MIcon, { name: 'close' }))
      ),

      React.createElement('div', { className: 'validation-modal__body' },

        !result && React.createElement('div', { className: 'validation-scope' },
          React.createElement('div', { className: 'validation-scope__label' }, 'Область'),
          scopeOption('all', 'Все домены', allDomains.length, scope, setScope),
          scopeOption('visible', 'Только видимые', visibleDomains.length, scope, setScope),
          scopeOption('bookmarked', 'Только избранные', bookmarkedDomains.length, scope, setScope),

          React.createElement('div', { className: 'validation-scope__label', style: { marginTop: 16 } }, 'Учитывать зависимости'),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: includeFqid, onChange: function() { setIncludeFqid(!includeFqid); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'FQID-ссылки')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: includeLinkage, onChange: function() { setIncludeLinkage(!includeLinkage); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Linkage-связи')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: missingAsSatisfied, onChange: function() { setMissingAsSatisfied(!missingAsSatisfied); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Missing-домены считать установленными')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: autoBreak, onChange: function() { setAutoBreak(!autoBreak); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Автоматически разрывать циклы')
          ),
          React.createElement('div', { className: 'menu__hint' }, autoBreak
            ? 'Домены с циклом будут размещены в порядке, а разорванные связи — помечены.'
            : 'Домены с циклом попадут в отдельный блок «Требуют ручного вмешательства».'
          ),

          React.createElement('div', { className: 'validation-scope__label', style: { marginTop: 16 } }, 'Исключить домены по маске'),
          React.createElement('input', {
            className: 'menu__input',
            type: 'text',
            placeholder: 'например: *.settings.* , custom.*',
            value: excludePattern,
            onChange: function(e) { setExcludePattern(e.target.value); }
          }),
          React.createElement('div', { className: 'menu__hint' }, 'Маски через запятую или пробел. Исключённые домены считаются уже установленными.'),

          React.createElement('button', {
            className: 'btn btn--primary',
            onClick: build,
            style: { marginTop: 20, width: '100%', justifyContent: 'center' }
          }, '▶ Построить порядок')
        ),

        result && React.createElement('div', { className: 'topo-result' },

          // Циклические блоки в начале
          (result.cyclic.length > 0 || result.broken.length > 0) && React.createElement('div', { className: 'topo-cyclic' },

            result.cyclic.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'topo-cyclic__header' },
                React.createElement('span', { className: 'topo-cyclic__icon' }, React.createElement(MIcon, { name: 'warning' })),
                React.createElement('span', null, 'Требуют ручного вмешательства — цикл (' + result.cyclic.length + ')')
              ),
              React.createElement('div', { className: 'topo-cyclic__body' },
                result.cyclic.map(function(id) {
                  return React.createElement('a', {
                    key: id,
                    className: 'validation-log__domain',
                    onClick: function() { onGotoDomain(id); onClose(); }
                  }, id);
                })
              )
            ),
          
            result.cyclic.length === 0 && result.broken.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'topo-cyclic__header topo-cyclic__header--broken' },
                React.createElement('span', { className: 'topo-cyclic__icon' }, React.createElement(MIcon, { name: 'link' })),
                React.createElement('span', null, 'Циклы разорваны автоматически (' + result.broken.length + ')')
              ),
              React.createElement('div', { className: 'topo-cyclic__body' },
                result.broken.map(function(b) {
                  return React.createElement('div', { key: b.id, className: 'topo-broken-item' },
                    React.createElement('a', {
                      className: 'validation-log__domain',
                      onClick: function() { onGotoDomain(b.id); onClose(); }
                    }, b.id),
                    React.createElement('span', { className: 'topo-broken-item__meta' }, 'L' + b.level),
                    b.brokenDeps.length > 0 && React.createElement('span', {
                      className: 'topo-broken-item__deps',
                      title: 'Разорваны связи с: ' + b.brokenDeps.join(', ')
                    }, '↯' + b.brokenDeps.length)
                  );
                })
              )
            )
          ),
          // Уровни
          result.levels.map(function(level, idx) {
            var isOpen = expandedLevels.has(idx);
            return React.createElement('div', { key: idx, className: 'topo-level' + (isOpen ? ' topo-level--open' : '') },
              React.createElement('div', { className: 'topo-level__header', onClick: function() { toggleLevel(idx); } },
                React.createElement('span', { className: 'validation-log__chevron' }, isOpen ? React.createElement(MIcon, { name: 'expand_more' }) : React.createElement(MIcon, { name: 'chevron_right' })),
                React.createElement('span', { className: 'topo-level__badge' }, idx + 1),
                React.createElement('span', { className: 'topo-level__title' }, 'Уровень ' + (idx + 1)),
                React.createElement('span', { className: 'topo-level__count' }, level.length + ' домен' + (level.length === 1 ? '' : (level.length < 5 ? 'а' : 'ов')))
              ),
              isOpen && React.createElement('div', { className: 'topo-level__body'  },
                level.map(function(id) {
                  var isDepsOpen = expandedDeps.has(id);
                  var deps = result.levelMap ? findDeps(id, result, allEdges, allNodes) : [];
                  var brokenInfo = result.broken.find(function(b) { return b.id === id; });
                  return React.createElement('div', { key: id, className: 'topo-domain' + (brokenInfo ? ' topo-domain--broken' : '') },
                    React.createElement('div', { className: 'topo-domain__head' },
                      deps.length > 0 && React.createElement('span', {
                        className: 'validation-log__chevron',
                        style: { cursor: 'pointer' },
                        onClick: function() { toggleDeps(id); }
                      }, isDepsOpen ? React.createElement(MIcon, { name: 'expand_more' }) : React.createElement(MIcon, { name: 'chevron_right' })),
                      !deps.length && React.createElement('span', { className: 'validation-log__chevron' }, ' '),
                      React.createElement('a', {
                        className: 'validation-log__domain',
                        onClick: function() { onGotoDomain(id); onClose(); }
                      }, id),
                      brokenInfo && React.createElement('span', {
                        className: 'topo-broken-badge',
                        title: 'Цикл разорван автоматически. Отрезаны связи: ' + brokenInfo.brokenDeps.join(', ')
                      }, '⚠️ цикл разорван')
                    ),
                    isDepsOpen && React.createElement('div', { className: 'topo-domain__deps' },
                      deps.map(function(dep) {
                        var depLevel = result.levelMap.get(dep);
                        return React.createElement('div', { key: dep, className: 'topo-dep' },
                          React.createElement('span', { className: 'topo-dep__level' }, 'L' + depLevel),
                          React.createElement('a', {
                            className: 'validation-log__domain',
                            onClick: function() { onGotoDomain(dep); onClose(); }
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

      result && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat' }, '📦 ' + result.stats.total),
          React.createElement('span', { className: 'validation-stat validation-stat--ok' }, '📊 ' + result.stats.levels + ' уровней'),
          React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '⏱ ' + result.stats.criticalPath + ' шагов'),
          result.stats.brokenCount > 0 && React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '🔗 ' + result.stats.brokenCount + ' разорвано'),
          result.stats.cyclic > 0 && React.createElement('span', { className: 'validation-stat validation-stat--err' }, '⚠️ ' + result.stats.cyclic + ' цикл.')
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn', onClick: function() { onApplyLevels(result.levelMap); onClose(); } }, '🎨 На графе'),
          React.createElement('button', { className: 'btn', onClick: copyAsText }, '📋 Копировать'),
          React.createElement('button', { className: 'btn', onClick: exportJSON }, '💾 JSON'),
          React.createElement('button', { className: 'btn', onClick: exportMD }, '📝 MD'),
          React.createElement('button', { className: 'btn', onClick: function() { setResult(null); } }, '← Настройки')
        )
      )
    )
  );
}

// Вспомогательная функция — прямые зависимости домена с учётом фильтров
function findDeps(domainId, result, edges, nodes) {
  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });
  var set = new Set();
  edges.forEach(function(e) {
    var s = nodeById.get(e.source);
    if (!s || s.data.nodeType !== 'domain') return;
    if (s.data.domainId !== domainId) return;
    var t = nodeById.get(e.target);
    if (!t || t.data.nodeType !== 'domain') return;
    if (!result.levelMap.has(t.data.domainId)) return;
    set.add(t.data.domainId);
  });
  return Array.from(set).sort();
}

function ValidationModal(props) {
  var open = props.open;
  var onClose = props.onClose;
  var allDomains = props.allDomains;       // [{id, domainId}]
  var visibleDomains = props.visibleDomains;
  var bookmarkedDomains = props.bookmarkedDomains;
  var onGotoDomain = props.onGotoDomain;
  var onResults = props.onResults;         // callback(resultsMap)

  var [scope, setScope] = useState('all'); // all | visible | bookmarked
  var [running, setRunning] = useState(false);
  var [started, setStarted] = useState(false);
  var [progress, setProgress] = useState({ current: 0, total: 0 });
  var [logs, setLogs] = useState([]);       // {domainId, status, diagnostics, error, current, total}
  var [filter, setFilter] = useState('problems'); // all | problems | invalid | errors | valid
  var [stats, setStats] = useState(null);
  var [cancelled, setCancelled] = useState(false);
  var abortRef = useRef(null);
  var logsRef = useRef(null);
  var [expanded, setExpanded] = useState(function() { return new Set(); });
  
  var toggleExpanded = useCallback(function(domainId) {
    setExpanded(function(prev) {
      var s = new Set(prev);
      if (s.has(domainId)) s.delete(domainId); else s.add(domainId);
      return s;
    });
  }, []);

  useEffect(function() {
    if (!open) {
      setStarted(false); setRunning(false); setLogs([]); setProgress({current:0,total:0});
      setStats(null); setCancelled(false);
      if (abortRef.current) { try { abortRef.current.abort(); } catch(e){} abortRef.current = null; }
    }
  }, [open]);

  useEffect(function() {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  var startValidation = useCallback(function() {
    var domains;
    if (scope === 'visible') domains = visibleDomains;
    else if (scope === 'bookmarked') domains = bookmarkedDomains;
    else domains = allDomains;

    if (domains.length === 0) { alert('Нет доменов в выбранной области'); return; }

    setRunning(true);
    setStarted(true);
    setLogs([]);
    setStats(null);
    setCancelled(false);
    setProgress({ current: 0, total: domains.length });
    setExpanded(new Set());

    var controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/validate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainIds: domains.map(function(d) { return d.domainId; }) }),
      signal: controller.signal
    }).then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function read() {
        return reader.read().then(function(r) {
          if (r.done) return;
          buffer += decoder.decode(r.value, { stream: true });
          var parts = buffer.split('\n\n');
          buffer = parts.pop();
          parts.forEach(function(part) {
            var line = part.trim();
            if (!line.startsWith('data:')) return;
            var json = line.slice(5).trim();
            var evt;
            try { evt = JSON.parse(json); } catch (e) { return; }
            handleEvent(evt);
          });
          return read();
        });
      }
      function handleEvent(evt) {
        if (evt.type === 'start') {
          setProgress({ current: 0, total: evt.total });
        } else if (evt.type === 'progress') {
          setProgress({ current: evt.current, total: evt.total });
          setLogs(function(prev) { return prev.concat([evt]); });
        } else if (evt.type === 'done') {
          setStats(evt.stats);
          setCancelled(evt.cancelled);
          setRunning(false);
          if (onResults) {
            var map = new Map();
            (evt.results || []).forEach(function(r) { map.set(r.domainId, r); });
            onResults(map);
          }
        } else if (evt.type === 'error') {
          setRunning(false);
          alert('Ошибка: ' + evt.message);
        }
      }
      return read();
    }).catch(function(err) {
      if (err.name === 'AbortError') return;
      setRunning(false);
      alert('Ошибка: ' + err.message);
    });
  }, [scope, allDomains, visibleDomains, bookmarkedDomains, onResults]);

  var stopValidation = useCallback(function() {
    fetch('/api/validate-cancel', { method: 'POST' }).catch(function(){});
    if (abortRef.current) { try { abortRef.current.abort(); } catch(e){} }
    setRunning(false);
  }, []);

  var filteredLogs = useMemo(function() {
    if (filter === 'all') return logs;
    if (filter === 'valid') return logs.filter(function(l) { return l.status === 'valid'; });
    if (filter === 'invalid') return logs.filter(function(l) { return l.status === 'invalid'; });
    if (filter === 'errors') return logs.filter(function(l) { return l.status === 'error'; });
    if (filter === 'problems') return logs.filter(function(l) { return l.status !== 'valid' && l.status !== 'skip'; });
    return logs;
  }, [logs, filter]);

  var exportJSON = useCallback(function() {
    if (!stats) return;
    var data = {
      generatedAt: new Date().toISOString(),
      stats: stats,
      cancelled: cancelled,
      results: logs.map(function(l) {
        return { domainId: l.domainId, status: l.status, diagnostics: l.diagnostics, error: l.error };
      })
    };
    downloadFile(JSON.stringify(data, null, 2), 'validation-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.json', 'application/json');
  }, [stats, cancelled, logs]);

  var exportMD = useCallback(function() {
    if (!stats) return;
    var md = generateValidationMarkdown(stats, cancelled, logs);
    downloadFile(md, 'validation-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.md', 'text/markdown;charset=utf-8');
  }, [stats, cancelled, logs]);

  if (!open) return null;

  var pct = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: function() { if (!running) onClose(); } },
    React.createElement('div', { className: 'help-modal validation-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '🔍 Массовая валидация доменов'),
        React.createElement('button', { className: 'help-modal__close', onClick: running ? stopValidation : onClose }, running ? '■ Стоп' : React.createElement(MIcon, { name: 'close' }))
      ),

      React.createElement('div', { className: 'validation-modal__body' },

        // Область валидации
        !started && React.createElement('div', { className: 'validation-scope' },
          React.createElement('div', { className: 'validation-scope__label' }, 'Область валидации'),
          scopeOption('all', 'Все домены в кэше', allDomains.length, scope, setScope),
          scopeOption('visible', 'Только видимые (после фильтров)', visibleDomains.length, scope, setScope),
          scopeOption('bookmarked', 'Только избранные', bookmarkedDomains.length, scope, setScope),
          React.createElement('button', { className: 'btn btn--primary', onClick: startValidation, style: { marginTop: 16, width: '100%', justifyContent: 'center' } }, '▶ Запустить валидацию')
        ),

        // Прогресс
        started && React.createElement('div', { className: 'validation-progress' },
          React.createElement('div', { className: 'validation-progress__bar' },
            React.createElement('div', { className: 'validation-progress__fill', style: { width: pct + '%' } })
          ),
          React.createElement('div', { className: 'validation-progress__text' }, progress.current + ' / ' + progress.total + ' (' + pct + '%)' + (running ? ' — идёт валидация...' : cancelled ? ' — остановлено' : ' — завершено'))
        ),

        // Фильтры логов
        started && React.createElement('div', { className: 'validation-filters' },
          ['problems', 'all', 'invalid', 'errors', 'valid'].map(function(f) {
            var labels = { problems: 'Только проблемные', all: 'Все', invalid: '❌ Невалидные', errors: '⚠️ Ошибки', valid: '✅ Валидные' };
            return React.createElement('button', {
              key: f,
              className: 'validation-filter' + (filter === f ? ' validation-filter--active' : ''),
              onClick: function() { setFilter(f); }
            }, labels[f]);
          })
        ),

        // Логи
        started && React.createElement('div', { className: 'validation-logs', ref: logsRef },
          filteredLogs.length === 0 ? React.createElement('div', { className: 'validation-logs__empty' }, 'Нет записей по фильтру') :
          filteredLogs.map(function(log, i) {
            var icon = log.status === 'valid' ? React.createElement(MIcon, { name: 'check_circle' }) : log.status === 'invalid' ? React.createElement(MIcon, { name: 'cancel' }) : React.createElement(MIcon, { name: 'warning' });
            var isInvalid = log.status === 'invalid';
            var hasDiag = isInvalid && log.diagnostics && log.diagnostics.length > 0;
            var isOpen = expanded.has(log.domainId);
          
            return React.createElement('div', { key: i, className: 'validation-log validation-log--' + log.status + (isOpen ? ' validation-log--open' : '') },
              React.createElement('div', {
                className: 'validation-log__head' + (hasDiag ? ' validation-log__head--clickable' : ''),
                onClick: hasDiag ? function() { toggleExpanded(log.domainId); } : undefined
              },
                hasDiag && React.createElement('span', { className: 'validation-log__chevron' }, isOpen ? React.createElement(MIcon, { name: 'expand_more' }) : React.createElement(MIcon, { name: 'chevron_right' })),
                React.createElement('span', { className: 'validation-log__icon' }, icon),
                React.createElement('a', {
                  className: 'validation-log__domain',
                  onClick: function(e) { e.stopPropagation(); onGotoDomain(log.domainId); onClose(); }
                }, log.domainId),
                isInvalid && log.diagnostics && React.createElement('span', { className: 'validation-log__count' }, log.diagnostics.length + ' ' + plural(log.diagnostics.length, 'issue', 'issues')),
                log.error && React.createElement('span', { className: 'validation-log__error' }, log.error),
                hasDiag && !isOpen && React.createElement('span', { className: 'validation-log__hint' }, 'нажмите, чтобы раскрыть')
              ),
          
              isOpen && hasDiag && React.createElement('div', { className: 'validation-log__diag' },
                log.diagnostics.map(function(d, di) {
                  return React.createElement('div', { key: di, className: 'validation-diag' },
                    React.createElement('div', { className: 'validation-diag__severity' }, d.severity),
                    React.createElement('div', { className: 'validation-diag__message' }, d.message),
                    d.labels && d.labels.length > 0 && d.labels.map(function(lb, li) {
                      return React.createElement('div', { key: li, className: 'validation-diag__label' },
                        lb.message,
                        lb.span && React.createElement('span', { className: 'validation-diag__span' }, ' [' + lb.span.start + '-' + lb.span.end + ']')
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
      stats && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat validation-stat--ok' }, '✅ ' + stats.valid),
          React.createElement('span', { className: 'validation-stat validation-stat--err' }, '❌ ' + stats.invalid),
          React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '⚠️ ' + stats.errors),
          React.createElement('span', { className: 'validation-stat' }, '⏱ ' + formatDuration(stats.elapsedMs))
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn', onClick: exportJSON }, '💾 JSON'),
          React.createElement('button', { className: 'btn', onClick: exportMD }, '📝 Markdown'),
          React.createElement('button', { className: 'btn', onClick: onClose }, 'Закрыть')
        )
      )
    )
  );
}

function scopeOption(value, label, count, current, setCurrent) {
  return React.createElement('label', { className: 'validation-scope__option' + (current === value ? ' active' : '') },
    React.createElement('input', {
      type: 'radio',
      checked: current === value,
      onChange: function() { setCurrent(value); }
    }),
    React.createElement('span', { className: 'validation-scope__radio' }),
    React.createElement('span', { className: 'validation-scope__text' }, label),
    React.createElement('span', { className: 'validation-scope__count' }, count)
  );
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 'с';
  var m = Math.floor(s / 60);
  return m + 'м ' + (s % 60) + 'с';
}

function downloadFile(content, filename, mime) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function generateValidationMarkdown(stats, cancelled, logs) {
  var lines = [];
  lines.push('# Отчёт валидации доменов');
  lines.push('');
  lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
  if (cancelled) lines.push('');
  if (cancelled) lines.push('> ⚠️ Валидация была прервана пользователем');
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push('| Всего в области | ' + stats.total + ' |');
  lines.push('| Обработано | ' + stats.processed + ' |');
  lines.push('| ✅ Валидных | ' + stats.valid + ' |');
  lines.push('| ❌ Невалидных | ' + stats.invalid + ' |');
  lines.push('| ⚠️ Ошибок | ' + stats.errors + ' |');
  lines.push('| ⏱ Время | ' + formatDuration(stats.elapsedMs) + ' |');
  lines.push('');

  var invalid = logs.filter(function(l) { return l.status === 'invalid'; });
  if (invalid.length > 0) {
    lines.push('## Невалидные домены (' + invalid.length + ')');
    lines.push('');
    invalid.forEach(function(l) {
      lines.push('### `' + l.domainId + '`');
      lines.push('');
      (l.diagnostics || []).forEach(function(d) {
        lines.push('- **[' + d.severity + ']** ' + d.message);
        (d.labels || []).forEach(function(lb) {
          lines.push('  - ' + lb.message + (lb.span ? ' (позиция ' + lb.span.start + '-' + lb.span.end + ')' : ''));
        });
      });
      lines.push('');
    });
  }

  var errors = logs.filter(function(l) { return l.status === 'error'; });
  if (errors.length > 0) {
    lines.push('## Ошибки выполнения (' + errors.length + ')');
    lines.push('');
    errors.forEach(function(l) {
      lines.push('- `' + l.domainId + '` — ' + (l.error || 'неизвестная ошибка'));
    });
    lines.push('');
  }

  var valid = logs.filter(function(l) { return l.status === 'valid'; });
  if (valid.length > 0) {
    lines.push('## Валидные домены (' + valid.length + ')');
    lines.push('');
    valid.forEach(function(l) { lines.push('- `' + l.domainId + '`'); });
    lines.push('');
  }

  return lines.join('\n');
}


function HotkeysModal(props) {
  var open = props.open;
  var onClose = props.onClose;

  useEffect(function() {
    if (!open) return;
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('keydown', onEsc, true); };
  }, [open, onClose]);

  if (!open) return null;

  var groups = [
    {
      title: 'Общее',
      items: [
        { keys: ['Shift', 'Tab'], label: 'Открыть командную палитру' },
        { keys: ['Ctrl', 'K'], label: 'Открыть командную палитру (альтернатива)', alt: true },
        { keys: ['F1'], label: 'Руководство пользователя' },
        { keys: ['?'], label: 'Это окно с хоткеями' },
        { keys: ['Esc'], label: 'Снять выделение / закрыть' }
      ]
    },
    {
      title: 'Навигация',
      items: [
        { keys: ['F'], label: 'Вписать граф в экран' },
        { keys: ['Alt', React.createElement(MIcon, { name: 'arrow_back' })], label: 'Назад по истории' },
        { keys: ['Alt', React.createElement(MIcon, { name: 'arrow_forward' })], label: 'Вперёд по истории' },
        { keys: ['Ctrl', 'клик'], label: 'Мультивыбор узлов' }
      ]
    },
    {
      title: 'Анализ',
      items: [
        { keys: ['C'], label: 'Найти циклы' },
        { keys: ['I'], label: 'Только изолированные' },
        { keys: ['S'], label: 'Агрегация по семействам' },
        { keys: ['P'], label: 'Найти путь между двумя узлами' },
        { keys: ['B'], label: 'Добавить в закладки' }
      ]
    },
    {
      title: 'Вид',
      items: [
        { keys: ['T'], label: 'Скрыть/показать тултипы' },
        { keys: ['D'], label: 'Скрыть/показать правую панель' },
        { keys: ['E'], label: 'Скрыть/показать все связи' }
      ]
    },
    {
      title: 'Мышью',
      items: [
        { keys: ['Двойной клик'], label: 'Включить/выключить фокус на узле' },
        { keys: ['Правая кнопка'], label: 'Контекстное меню узла' },
        { keys: ['Клик по связи'], label: 'Детали связи в панели' },
        { keys: ['Клик по пустому месту'], label: 'Снять все выделения' }
      ]
    },
  ];

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal hotkeys-modal', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '⌨️ Горячие клавиши'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, React.createElement(MIcon, { name: 'close' }))
      ),

      React.createElement('div', { className: 'hotkeys-body' },
        groups.map(function(g) {
          return React.createElement('div', { key: g.title, className: 'hotkeys-group' },
            React.createElement('div', { className: 'hotkeys-group__title' }, g.title),
            React.createElement('div', { className: 'hotkeys-group__items' },
              g.items.map(function(item, i) {
                return React.createElement('div', { key: i, className: 'hotkey-row' },
                  React.createElement('div', { className: 'hotkey-row__keys' },
                    item.keys.map(function(k, ki) {
                      return React.createElement(React.Fragment, { key: ki },
                        ki > 0 && React.createElement('span', { className: 'hotkey-plus' }, '+'),
                        React.createElement('kbd', { className: 'hotkey-key' }, k)
                      );
                    })
                  ),
                  React.createElement('div', { className: 'hotkey-row__label' }, item.label)
                );
              })
            )
          );
        })
      ),

      React.createElement('div', { className: 'hotkeys-footer' },
        'Все горячие клавиши работают, когда фокус не в поле ввода.'
      )
    )
  );
}

function HelpModal(props) {
  var open = props.open;
  var onClose = props.onClose;
  var [content, setContent] = useState('');
  var [loading, setLoading] = useState(false);
  var bodyRef = useRef(null);

  useEffect(function() {
    if (!open || content) return;
    setLoading(true);
    Promise.all([
      fetch('/user-guide').then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }),
      import('https://esm.sh/marked@12.0.2')
    ])
      .then(function(results) {
        var md = results[0];
        var markedMod = results[1];
        var parse = markedMod.marked ? markedMod.marked.parse : (markedMod.parse || null);
        if (!parse) throw new Error('marked.parse не найден');
        var html = parse(md);
        setContent(html);
        setLoading(false);
      })
      .catch(function(err) {
        setContent('<p style="color:var(--danger)">Ошибка загрузки справки: ' + err.message + '</p>');
        setLoading(false);
      });
  }, [open, content]);

  useEffect(function() {
    if (!open) return;
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('keydown', onEsc, true); };
  }, [open, onClose]);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '📖 Руководство пользователя'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose, title: 'Закрыть (Esc)' }, React.createElement(MIcon, { name: 'close' }))
      ),
      React.createElement('div', { className: 'help-modal__body', ref: bodyRef },
        loading ? React.createElement('div', { className: 'help-modal__loading' }, 'Загрузка...') :
        React.createElement('div', { className: 'help-content', dangerouslySetInnerHTML: { __html: content } })
      )
    )
  );
}

function getNsByDomainId(n, depth) {
  var parts = (n.data.domainId || '').split('.');
  return parts.slice(0, depth).join('.') || '__empty__';
}

// ============ APP ============
function App() {
  // Theme
  var themeState = useState(function() { return localStorage.getItem('dg-theme') || 'dark'; });
  var theme = themeState[0], setTheme = themeState[1];
  useEffect(function() { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('dg-theme', theme); }, [theme]);

  // Filters
  var [filters, setFilters] = useState({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
  var [namespaceFilter, setNamespaceFilter] = useState('');
  var [isolatedOnly, setIsolatedOnly] = useState(false);
  var [nsMode, setNsMode] = useState(false);

  // View
  var [layoutType, setLayoutType] = useState('LR');
  var [compact, setCompact] = useState(false);
  var [showGroups, setShowGroups] = useState(false);
  var [bidirectional, setBidirectional] = useState(true);
  var [showEdgeLabels, setShowEdgeLabels] = useState(false);
  var [clusterDepth, setClusterDepth] = useState(2);

  // Interaction
  var [selectedNodeId, setSelectedNodeId] = useState(null);
  var [focusNode, setFocusNode] = useState(null);
  var [focusDepth, setFocusDepth] = useState(2);
  var [pathSel, setPathSel] = useState([]);
  var [pathResult, setPathResult] = useState(null);
  var [contextMenu, setContextMenu] = useState(null);
  var [cycleHighlight, setCycleHighlight] = useState(null);
  var [diffMode, setDiffMode] = useState(null);

  // Side panel
  var [panelOpen, setPanelOpen] = useState(false);
  var [panelTab, setPanelTab] = useState('details');
  var [panelNodeId, setPanelNodeId] = useState(null);
  var editorRef = useRef(null);

  // Search
  var [searchOpen, setSearchOpen] = useState(false);
  var [searchQuery, setSearchQuery] = useState('');
  var [searchIndex, setSearchIndex] = useState(0);
  var searchInputRef = useRef(null);

  // UI
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [tooltip, setTooltip] = useState(null);
  var hideTimer = useRef(null);
  var tooltipCache = useRef(new Map());
  var rfInstance = useRef(null);
  var snapshotInputRef = useRef(null);
  
  var [editorFilePath, setEditorFilePath] = useState('');
  var [pendingFile, setPendingFile] = useState(null); // { content, fqid, ts }
  var [hiddenNodeIds, setHiddenNodeIds] = useState(function() { return new Set(); });
  
  var [pathMode, setPathMode] = useState(null); // { kind: 'from' | 'to', anchorId }
  var [tooltipsEnabled, setTooltipsEnabled] = useState(true);
  var [selectedEdgeId, setSelectedEdgeId] = useState(null);
  var [heatmap, setHeatmap] = useState('none'); // none | health | degree | entities | fqid
  
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

  var [sidePanelEnabled, setSidePanelEnabled] = useState(function() {
    try {
      var saved = localStorage.getItem('dg-side-panel-enabled');
      return saved === null ? true : saved === 'true';
    } catch (e) { return true; }
  });

  useEffect(function() {
    try { localStorage.setItem('dg-side-panel-enabled', String(sidePanelEnabled)); } catch (e) {}
  }, [sidePanelEnabled]);


  useEffect(function() {
    setEdges(displayEdges);
  }, [displayEdges, setEdges]);

  var getLayoutCacheKey = function(type, depth) {
    return type + ':' + depth + ':' + compact + ':' + edges.length + ':' + nodes.length;
  };

  var [validationAvailable, setValidationAvailable] = useState(false);
  useEffect(function() {
    fetch('/api/validation-available').then(function(r) { return r.json(); })
      .then(function(d) { setValidationAvailable(!!d.available); })
      .catch(function(){});
  }, []);
  
  var [rules, setRules] = useState(function() {
    try {
      var raw = localStorage.getItem('dg-rules');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });
  
  var [showViolationsOnly, setShowViolationsOnly] = useState(false);
  var [rulesHighlighted, setRulesHighlighted] = useState(true);
  var [helpOpen, setHelpOpen] = useState(false);
  
  var [validationOpen, setValidationOpen] = useState(false);
  var [validationResults, setValidationResults] = useState(function() {
    // Загрузить сохранённые результаты
    return null; // загрузим через useEffect ниже
  });
  var [onlyInvalid, setOnlyInvalid] = useState(false);
  
  var [learningPathOpen, setLearningPathOpen] = useState(false);
var [tour, setTour] = useState(null);
  
  useEffect(function() {
    tooltipCache.current.clear();
  }, [nodes, validationResults]);
  
  
  var startTour = useCallback(function(path) {
    setTour({
      stages: path.stages,
      index: 0,
      playing: false,
      startedAt: Date.now()
    });
    // Уберём другие активные режимы, чтобы не мешали
    setSelectedNodeId(null);
    setFocusNode(null);
    setCycleHighlight(null);
    setPathResult(null);
    setPathSel([]);
    setFailureSim(null);
  }, []);
  
  
  var tourNext = useCallback(function() {
  setTour(function(prev) {
    if (!prev) return null;
    var items = [];
    prev.stages.forEach(function(s) { s.domains.forEach(function(d) { items.push(d); }); });
    if (prev.index >= items.length - 1) return prev;
    return Object.assign({}, prev, { index: prev.index + 1, playing: false });
  });
}, []);

var tourPrev = useCallback(function() {
  setTour(function(prev) {
    if (!prev) return null;
    if (prev.index <= 0) return prev;
    return Object.assign({}, prev, { index: prev.index - 1, playing: false });
  });
}, []);

var tourTogglePlay = useCallback(function() {
  setTour(function(prev) { return prev ? Object.assign({}, prev, { playing: !prev.playing }) : null; });
}, []);

var tourStop = useCallback(function() { setTour(null); }, []);

var entityIndex = useMemo(function() {
  return buildEntityIndex(GRAPH_DATA.entities || []);
}, []);

useEffect(function() {
  if (!tour) return;
  var items = [];
  tour.stages.forEach(function(s) { s.domains.forEach(function(d) { items.push(d); }); });
  var current = items[tour.index];
  if (!current || !rfInstance.current) return;

  var nodeId = current.id;
  var node = nodes.find(function(n) { return n.id === nodeId; });
  if (!node) return;

  var w = compact ? NODE_COMPACT : NODE_WIDTH;
  var h = compact ? NODE_COMPACT : NODE_HEIGHT;
  var cx = node.position.x + w / 2;
  var cy = node.position.y + h / 2;
  rfInstance.current.setCenter(cx, cy, { zoom: 1.5, duration: 700 });

  setSelectedNodeId(nodeId);
}, [tour && tour.index]);

useEffect(function() {
  if (!tour || !tour.playing) return;
  var items = [];
  tour.stages.forEach(function(s) { s.domains.forEach(function(d) { items.push(d); }); });
  if (tour.index >= items.length - 1) {
    setTour(function(prev) { return prev ? Object.assign({}, prev, { playing: false }) : null; });
    return;
  }
  var t = setTimeout(function() { tourNext(); }, 2500);
  return function() { clearTimeout(t); };
}, [tour && tour.playing, tour && tour.index]);
  
  
  useEffect(function() {
    fetch('/api/validation-results').then(function(r) {
      if (r.status === 204) return null;
      return r.json();
    }).then(function(data) {
      if (!data || !data.results) return;
      var map = new Map();
      data.results.forEach(function(r) { map.set(r.domainId, r); });
      setValidationResults(map);
    }).catch(function(){});
  }, []);
  
  var handleValidationResults = useCallback(function(map) {
    setValidationResults(map);
  }, []);
  
  useEffect(function() {
    try {
      var arr = Array.isArray(rules) ? rules : [];
      localStorage.setItem('dg-rules', JSON.stringify(arr));
    } catch (e) {}
  }, [rules]);
  
  // Initial dat
  useEffect(function() {
    setSelectedNodeId(null); setFocusNode(null);
    setPathResult(null); setPathSel([]);
    setCycleHighlight(null); setHiddenNodeIds(new Set());
    setPathMode(null);
    setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.2 }); }, 150);
  }, [nsMode]);
  
  
  var [bookmarks, setBookmarks] = useState(function() {
    try {
      var raw = localStorage.getItem('dg-bookmarks');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  });
  
  var [bookmarksOnly, setBookmarksOnly] = useState(false);
  
  useEffect(function() {
    try { localStorage.setItem('dg-bookmarks', JSON.stringify(Array.from(bookmarks))); } catch (e) {}
  }, [bookmarks]);
  
  var toggleBookmark = useCallback(function(nodeId) {
    setBookmarks(function(prev) {
      var s = new Set(prev);
      if (s.has(nodeId)) s.delete(nodeId);
      else s.add(nodeId);
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
    var nodes = GRAPH_DATA.nodes
    .filter(function(n) { return n && n.id && typeof n.id === 'string'; })
    .map(function(n) {
      var domainId = n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, '');
      return {
        id: n.id,
        type: 'domainNode',
        data: {
          domainId: domainId,
          label: n.label,
          nodeType: n.group,
          filePath: n.filePath,
          folderPath: n.folderPath || [],
          tooltipHtml: n.title,
          fqidRefs: n.fqidRefs || [],
          version: n.version,
          entitiesCount: n.entitiesCount,
          name: n.name || n.label || '',
          description: n.description || '',
          author: n.author || '',
          tags: Array.isArray(n.tags) ? n.tags : []
        },
        position: { x: 0, y: 0 }
      };
    });
    var edges = GRAPH_DATA.edges
    .filter(function(e) {
      if (!e || !e.id || !e.from || !e.to) return false;
      return true;
    })
    .map(function(e) {
      var isLinkage = e.kind === 'linkage';
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'smoothstep',
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
          width: 14, height: 14
        },
        style: {
          stroke: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
          strokeWidth: isLinkage ? 1.0 : 0.8,
          opacity: isLinkage ? 0.35 : 0.22
        }
      };
    });
    return { nodes: dagreLayout(nodes, edges, 'LR'), edges: edges };
  }, []);

    var [allNodes, setAllNodes] = useState(initial.nodes);
  var [allEdges, setAllEdges] = useState(initial.edges);

  var [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  var [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  var [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  var [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // ---- Derived: namespace aggregation ----
  var display = useMemo(function() {
    if (!nsMode) return { nodes: nodes, edges: edges };
    return aggregateByNamespace(nodes, edges);
  }, [nodes, edges, nsMode]);

  var displayNodes = display.nodes;
  var displayEdges = display.edges;
  
    var ruleViolations = useMemo(function() {
    if (rules.length === 0) return [];
    return evaluateRules(displayEdges, displayNodes, rules);
  }, [displayEdges, displayNodes, rules]);
  
  var violationsByEdge = useMemo(function() {
    var m = new Map();
    ruleViolations.forEach(function(v) {
      if (!m.has(v.edgeId)) m.set(v.edgeId, []);
      m.get(v.edgeId).push(v);
    });
    return m;
  }, [ruleViolations]);

  // ---- Derived: cycle detection ----
  var cyclesInfo = useMemo(function() { return findCycles(displayNodes, displayEdges); }, [displayNodes, displayEdges]);

  // ---- Derived: health score ----
  var healthMap = useMemo(function() {
    var allNs = new Set();
    displayNodes.forEach(function(n) { allNs.add(n.id); });
    var map = new Map();
    displayNodes.forEach(function(n) {
      var h = computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null);
      map.set(n.id, h);
    });
    return map;
  }, [displayNodes, displayEdges, cyclesInfo]);

  // ---- Derived: bidirectional merge ----
  var bidirectionalEdges = useMemo(function() {
    if (!bidirectional) return displayEdges;
    return mergeBidirectional(displayEdges);
  }, [displayEdges, bidirectional]);

  // ---- Filters ----
  var connected = useMemo(function() {
    var s = new Set();
    displayEdges.forEach(function(e) { s.add(e.source); s.add(e.target); });
    return s;
  }, [displayEdges]);

  var filteredNodes = useMemo(function() {
    return displayNodes.filter(function(n) {
      if (n.type === 'clusterNode') return true; 
      if (hiddenNodeIds.has(n.id)) return false;
      if (bookmarksOnly && !bookmarks.has(n.id)) return false;
      if (onlyInvalid) {
        var v = validationResults ? validationResults.get(n.data.domainId) : null;
        if (!v || v.status !== 'invalid') return false;
      }
      var t = n.data.nodeType;
      if (t === 'domain' && !filters.domain) return false;
      if (t === 'broken' && !filters.broken) return false;
      if (t === 'missing' && !filters.missing) return false;
      if (namespaceFilter && !matchesNamespace(n.data.domainId, namespaceFilter)) return false;
      if (isolatedOnly && (t !== 'domain' || connected.has(n.id))) return false;
      return true;
    });
  }, [displayNodes, filters, namespaceFilter, isolatedOnly, connected, hiddenNodeIds, bookmarks, bookmarksOnly, onlyInvalid, validationResults]);

  var filteredEdges = useMemo(function() {
    var ids = new Set(filteredNodes.map(function(n) { return n.id; }));
    return bidirectionalEdges.filter(function(e) {
      if (!ids.has(e.source) || !ids.has(e.target)) return false;
      if (showViolationsOnly && !violationsByEdge.has(e.id)) return false;
      var kind = e.data && e.data.kind;
      if (kind === 'linkage' && !filters.linkage) return false;
      if (kind === 'fqid' && !filters.fqid) return false;
      return true;
    });
  }, [bidirectionalEdges, filteredNodes, filters.linkage, filters.fqid, showViolationsOnly, violationsByEdge]);

  useEffect(function() {
    filteredNodesRef.current = filteredNodes;
  }, [filteredNodes]);

  var filteredIdsHash = useMemo(function() {
    return filteredNodes.map(function(n) { return n.id; }).sort().join(',');
  }, [filteredNodes]);

  // ---- Highlights ----
  var highlight = useMemo(function() {
    // Priority: path > cycle > focus > selected
    if (pathResult) {
      return { nodes: new Set(pathResult.nodes), edges: new Set(pathResult.edges), color: PATH_COLOR, type: 'path' };
    }
    if (cycleHighlight) {
      return { nodes: cycleHighlight.nodeIds, edges: cycleHighlight.edgeIds, color: '#f97316', type: 'cycle' };
    }
    if (focusNode) {
      var reachable = findReachable(focusNode, focusDepth, filteredEdges);
      var focusEdges = new Set();
      filteredEdges.forEach(function(e) {
        if (reachable.has(e.source) && reachable.has(e.target)) focusEdges.add(e.id);
      });
      return { nodes: reachable, edges: focusEdges, color: '#22d3ee', type: 'focus' };
    }
    if (selectedNodeId) {
      var nodeIds = new Set([selectedNodeId]);
      var edgeIds = new Set();
      filteredEdges.forEach(function(e) {
        if (e.source === selectedNodeId || e.target === selectedNodeId) {
          edgeIds.add(e.id);
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        }
      });
      return { nodes: nodeIds, edges: edgeIds, color: '#fbbf24', type: 'selected' };
    }
    return null;
  }, [selectedNodeId, focusNode, focusDepth, cycleHighlight, pathResult, filteredEdges]);
  
  var heatmapValues = useMemo(function() {
    if (heatmap === 'none') return null;
    var map = new Map();
    var values = [];
    displayNodes.forEach(function(n) {
      var v = 0;
      if (heatmap === 'health') v = healthMap.get(n.id) != null ? healthMap.get(n.id) : 0;
      else if (heatmap === 'degree') {
        var d = 0;
        displayEdges.forEach(function(e) { if (e.source === n.id) d++; if (e.target === n.id) d++; });
        v = d;
      }
      else if (heatmap === 'entities') v = n.data.entitiesCount || 0;
      else if (heatmap === 'fqid') v = (n.data.fqidRefs || []).length;
      map.set(n.id, v);
      values.push(v);
    });
    var min = Math.min.apply(null, values.length ? values : [0]);
    var max = Math.max.apply(null, values.length ? values : [1]);
    return { map: map, min: min, max: max, scheme: HEATMAPS[heatmap] };
  }, [heatmap, displayNodes, displayEdges, healthMap]);

  var visibleNodes = useMemo(function() {
    var pathEndpoints = pathResult ? new Set([pathResult.nodes[0], pathResult.nodes[pathResult.nodes.length - 1]]) : null;
    var hasChanges = highlight || compact || topoLevelMap || heatmapValues ||
      (validationResults && validationResults.size > 0) ||
      (bookmarks && bookmarks.size > 0) ||
      (hiddenNodeIds && hiddenNodeIds.size > 0) ||
      diffMode || selectedNodeId || focusNode || cycleHighlight || pathResult;
  
    // Быстрый путь: без активных режимов возвращаем filteredNodes как есть
    if (!hasChanges) return filteredNodes;
  
    return filteredNodes.map(function(n) {
      if (n.hidden) return n;
      var dimmed = highlight ? !highlight.nodes.has(n.id) : false;
      var inPath = highlight && highlight.type === 'path' && highlight.nodes.has(n.id);
      var isPathEndpoint = pathEndpoints && pathEndpoints.has(n.id);
      var isAdded = diffMode && diffMode.addedNodes && diffMode.addedNodes.has(n.id);
      var health = healthMap.get(n.id);
      var topoLvl = topoLevelMap ? topoLevelMap.get(n.data.domainId) : null;
      var validation = validationResults ? validationResults.get(n.data.domainId) : null;
      var isInvalid = validation && validation.status === 'invalid';
      var isBookmarked = bookmarks ? bookmarks.has(n.id) : false;
      
      var hm = null;
      if (heatmapValues) {
        var val = heatmapValues.map.get(n.id) || 0;
        var scheme = heatmapValues.scheme;
        hm = heatColor(val, heatmapValues.min, heatmapValues.max, scheme);
      }
  
      return Object.assign({}, n, {
        style: { opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.2s' },
        data: Object.assign({}, n.data, {
          dimmed: dimmed,
          health: health,
          __compact: compact,
          __inPath: inPath,
          __isPathEndpoint: isPathEndpoint,
          __topoLevel: topoLvl,
          __invalid: isInvalid,
          __bookmarked: isBookmarked,
          __validationStatus: validation ? validation.status : null,
          __validationCount: validation && validation.diagnostics ? validation.diagnostics.length : 0,
          __heatColor: hm
        }),
        selected: n.id === selectedNodeId
      });
    });
  }, [filteredNodes, highlight, compact, pathResult, diffMode, healthMap, selectedNodeId, topoLevelMap, validationResults, bookmarks, hiddenNodeIds, heatmapValues, focusNode, cycleHighlight]);

 var visibleEdges = useMemo(function() {
  var hasHighlight = highlight || diffMode || selectedEdgeId ||
  focusNode || cycleHighlight || pathResult ||   // ← добавили
  (rulesHighlighted && violationsByEdge && violationsByEdge.size > 0);

  // Быстрый путь: если нет активных подсветок — возвращаем исходный массив
  if (!hasHighlight) return filteredEdges;

  return filteredEdges.map(function(e) {
    const isLinkage = e.data && e.data.kind === 'linkage';
    var isSelected = e.id === selectedEdgeId;
    var hl = highlight && highlight.edges.has(e.id);
    var baseColor = isLinkage ? LINKAGE_COLOR
      : (e.data && e.data.kind === 'fqid') ? FQID_COLOR : LINKAGE_COLOR;
    
    var stroke = baseColor;
    var opacity = isLinkage ? 0.35 : 0.22;
    var strokeWidth = (e.style && e.style.strokeWidth) || (isLinkage ? 1.0 : 0.8);
    var animated = false;

    if (highlight) {
      opacity = hl ? 1 : 0.06;
      strokeWidth = hl ? ((e.data && e.data.kind === 'linkage') ? 3 : 2) : strokeWidth;
      animated = hl && highlight.type === 'path';
    }

    if (diffMode) {
      if (diffMode.addedEdges && diffMode.addedEdges.has(e.id)) { stroke = DIFF_ADDED; opacity = 1; strokeWidth = 3; animated = true; }
      else if (diffMode.removedEdges && diffMode.removedEdges.has(e.id)) { stroke = DIFF_REMOVED; opacity = 1; strokeWidth = 3; }
    }

    if (rulesHighlighted && violationsByEdge && violationsByEdge.has(e.id)) {
      var v = violationsByEdge.get(e.id);
      var hasForbid = v.some(function(x) { return x.severity === 'forbid'; });
      stroke = hasForbid ? '#dc2626' : '#f59e0b';
      opacity = 1;
      strokeWidth = 3.5;
      animated = true;
    }

    if (isSelected) {
      stroke = '#fbbf24';
      opacity = 1;
      strokeWidth = 4;
      animated = true;
    }

    return Object.assign({}, e, {
      animated: animated,
      style: Object.assign({}, e.style, {
        stroke: stroke,
        opacity: opacity,
        strokeWidth: strokeWidth
      }),
      markerEnd: Object.assign({}, e.markerEnd, { color: stroke }),
      markerStart: e.markerStart ? Object.assign({}, e.markerStart, { color: stroke }) : undefined
    });
  });
}, [filteredEdges, highlight, diffMode, rulesHighlighted, violationsByEdge, selectedEdgeId, cycleHighlight, focusNode, pathResult]);
 
 var perfMode = useMemo(function() {
  return filteredEdges.length > 250;
}, [filteredEdges.length]);

var displayEdges = useMemo(function() {
  var hideLabels = perfMode || !showEdgeLabels;
  if (!hideLabels) return visibleEdges;
  return visibleEdges.map(function(e) {
    if (!e.label) return e;
    var copy = Object.assign({}, e);
    delete copy.label;
    return copy;
  });
}, [visibleEdges, perfMode, showEdgeLabels]);

useEffect(function() {
  var nodeIds = new Set(visibleNodes.map(function(n) { return n.id; }));
  var orphanEdges = visibleEdges.filter(function(e) {
    return !nodeIds.has(e.source) || !nodeIds.has(e.target);
  });
  if (orphanEdges.length > 0) {
    console.warn('[orphan edges]', orphanEdges.length, orphanEdges.slice(0, 5));
  }
}, [visibleNodes, visibleEdges]);
 
 var allDomainsList = useMemo(function() {
  return nodes.filter(function(n) { return n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [nodes]);

var visibleDomainsList = useMemo(function() {
  return visibleNodes.filter(function(n) { return n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [visibleNodes]);

var bookmarkedDomainsList = useMemo(function() {
  return nodes.filter(function(n) { return bookmarks.has(n.id) && n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [nodes, bookmarks]);
  
  var panelEdge = selectedEdgeId
    ? visibleEdges.find(function(e) { return e.id === selectedEdgeId; }) || edges.find(function(e) { return e.id === selectedEdgeId; })
    : null;

  // ---- Helpers ----
  var domainToNodeId = useMemo(function() {
    var m = new Map();
    nodes.forEach(function(n) { m.set((n.data.domainId || '').toLowerCase(), n.id); });
    return m;
  }, [nodes]);

  var counts = useMemo(function() { return {
    domain: nodes.filter(function(n) { return n.data.nodeType === 'domain'; }).length,
    missing: nodes.filter(function(n) { return n.data.nodeType === 'missing'; }).length,
    broken: nodes.filter(function(n) { return n.data.nodeType === 'broken'; }).length,
    linkage: edges.filter(function(e) { return e.data && e.data.kind === 'linkage'; }).length,
    fqid: edges.filter(function(e) { return e.data && e.data.kind === 'fqid'; }).length
  }; }, [nodes, edges]);

  var topConnected = useMemo(function() {
    var deg = new Map();
    nodes.forEach(function(n) { deg.set(n.id, 0); });
    edges.forEach(function(e) {
      if (deg.has(e.source)) deg.set(e.source, deg.get(e.source) + 1);
      if (deg.has(e.target)) deg.set(e.target, deg.get(e.target) + 1);
    });
    return nodes.map(function(n) { return { node: n, degree: deg.get(n.id) || 0 }; })
      .filter(function(x) { return x.degree > 0; })
      .sort(function(a, b) { return b.degree - a.degree; }).slice(0, 5);
  }, [nodes, edges]);

  var worstHealth = useMemo(function() {
    return nodes
      .filter(function(n) { return n.data.nodeType === 'domain'; })
      .map(function(n) { return { node: n, health: healthMap.get(n.id) || 0 }; })
      .sort(function(a, b) { return a.health - b.health; })
      .slice(0, 5);
  }, [nodes, healthMap]);

  var namespaces = useMemo(function() {
    var map = new Map();
    nodes.forEach(function(n) {
      if (n.data.nodeType !== 'domain') return;
      var ns = n.data.domainId.split('.').slice(0, 2).join('.');
      map.set(ns, (map.get(ns) || 0) + 1);
    });
    return Array.from(map.entries()).sort(function(a, b) { return b[1] - a[1]; });
  }, [nodes]);

  var tagCloud = useMemo(function() {
    var m = new Map();
    nodes.forEach(function(n) { (n.data.tags || []).forEach(function(t) { m.set(String(t), (m.get(String(t)) || 0) + 1); }); });
    return Array.from(m.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 14);
  }, [nodes]);

  var isolatedCount = useMemo(function() {
    var conn = new Set();
    edges.forEach(function(e) { conn.add(e.source); conn.add(e.target); });
    return nodes.filter(function(n) { return n.data.nodeType === 'domain' && !conn.has(n.id); }).length;
  }, [nodes, edges]);

  var activeFiltersCount = useMemo(function() {
    var c = 0;
    if (!filters.domain) c++; if (!filters.missing) c++; if (!filters.broken) c++;
    if (!filters.linkage) c++; if (!filters.fqid) c++;
    if (namespaceFilter.trim()) c++;
    if (isolatedOnly) c++;
    return c;
  }, [filters, namespaceFilter, isolatedOnly]);

  // ---- Search ----
  var searchResults = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return nodes.map(function(n) {
      var d = n.data || {};
      var id = (d.domainId || '').toLowerCase();
      var nm = (d.name || '').toLowerCase();
      var desc = (d.description || '').toLowerCase();
      var tags = Array.isArray(d.tags) ? d.tags.map(function(t) { return String(t).toLowerCase(); }) : [];
      var matches = [];
      if (id.indexOf(q) !== -1) matches.push({ field: 'id' });
      if (nm.indexOf(q) !== -1) matches.push({ field: 'name' });
      if (desc.indexOf(q) !== -1) matches.push({ field: 'description' });
      tags.forEach(function(t) { if (t.indexOf(q) !== -1) matches.push({ field: 'tags' }); });
      return matches.length > 0 ? { node: n, matches: matches } : null;
    }).filter(Boolean).sort(function(a, b) {
      var rank = function(r) {
        var f = r.matches.map(function(m) { return m.field; });
        if (f.indexOf('id') !== -1) return 0;
        if (f.indexOf('name') !== -1) return 1;
        if (f.indexOf('tags') !== -1) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    }).slice(0, 100);
  }, [searchQuery, nodes]);

  useEffect(function() { setSearchIndex(0); }, [searchQuery]);

  // Отслеживаем последнюю позицию мыши глобально
  useEffect(function() {
    var onMove = function(e) {
      window.__lastMouse = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', onMove);
    return function() { document.removeEventListener('mousemove', onMove); };
  }, []);
  // ---- Actions ----
  var navigatingFromHistory = useRef(false);
  
 var pushNav = useCallback(function(domainId) {
    if (!domainId) return;
    setNavStack(function(prev) {
      var trimmed = prev.items.slice(0, prev.index + 1);
      if (trimmed.length > 0 && trimmed[trimmed.length - 1] === domainId) return prev;
      var next = trimmed.concat([domainId]);
      if (next.length > 50) next = next.slice(next.length - 50);
      return { items: next, index: next.length - 1 };
    });
  }, []);
 
  var gotoWithoutNav = useCallback(function(domainId) {
    // как gotoDomainByDomainId, но без pushNav
    if (!domainId) return;
    var nodeId = domainToNodeId.get(domainId.toLowerCase());
    if (!nodeId) return;
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !rfInstance.current) return;
    var w = compact ? NODE_COMPACT : NODE_WIDTH;
    var h = compact ? NODE_COMPACT : NODE_HEIGHT;
    var cx = node.position.x + w / 2;
    var cy = node.position.y + h / 2;
    var z = Math.max(rfInstance.current.getZoom(), 1.2);
    rfInstance.current.setCenter(cx, cy, { zoom: z, duration: 500 });
    setSelectedNodeId(nodeId);
  }, [domainToNodeId, nodes, compact]);
  
  var gotoDomainByDomainId = useCallback(function(domainId) {
    if (!domainId) return;
    pushNav(domainId);
    gotoWithoutNav(domainId);
  }, [pushNav, gotoWithoutNav]);
  
  var navBack = useCallback(function() {
    setNavStack(function(prev) {
      if (prev.index <= 0) return prev;
      var newIdx = prev.index - 1;
      var id = prev.items[newIdx];
      if (id) setTimeout(function() { gotoWithoutNav(id); }, 0);
      return { items: prev.items, index: newIdx };
    });
  }, [gotoWithoutNav]);
  
  var navForward = useCallback(function() {
    setNavStack(function(prev) {
      if (prev.index >= prev.items.length - 1) return prev;
      var newIdx = prev.index + 1;
      var id = prev.items[newIdx];
      if (id) setTimeout(function() { gotoWithoutNav(id); }, 0);
      return { items: prev.items, index: newIdx };
    });
  }, [gotoWithoutNav]);

  var openSearch = useCallback(function() {
    setSearchQuery(''); setSearchIndex(0); setSearchOpen(true);
    setTimeout(function() { searchInputRef.current && searchInputRef.current.focus(); }, 50);
  }, []);
  var closeSearch = useCallback(function() { setSearchOpen(false); }, []);

  var openDetails = useCallback(function(nodeId) {
    setPanelNodeId(nodeId);
    setPanelTab('details');
    setPanelOpen(true);
  }, []);

  var closePanel = useCallback(function() { setPanelOpen(false); }, []);

  var openFileInEditor = useCallback(function(filePath, fqid) {
    if (!filePath) return;
    setEditorFilePath(filePath);
    setPanelTab('file');
    setPanelOpen(true);
    fetch('/file?path=' + encodeURIComponent(filePath))
      .then(function(r) { return r.ok ? r.text() : Promise.reject('File not found'); })
      .then(function(content) {
        setPendingFile({ content: content, fqid: fqid || null, ts: Date.now() });
      })
      .catch(function(err) {
        setPendingFile({ content: '// Не удалось загрузить файл: ' + err, fqid: null, ts: Date.now() });
      });
  }, []);

  var handleFindCycles = useCallback(function() {
    if (cycleHighlight) { setCycleHighlight(null); return; }
    var info = findCycles(displayNodes, displayEdges);
    if (info.cycleNodes.size === 0) { alert('Циклы не найдены'); return; }
    setCycleHighlight({ nodeIds: info.cycleNodes, edgeIds: info.cycleEdges, sccCount: info.sccs.length });
    setSelectedNodeId(null); setFocusNode(null); setPathResult(null); setPathSel([]);
    setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.25 }); }, 50);
  }, [displayNodes, displayEdges, cycleHighlight]);

  var handleExportMarkdown = useCallback(function() {
    var md = generateMarkdownReport({
      nodes: nodes,
      edges: edges,
      cyclesInfo: cyclesInfo,
      healthMap: healthMap,
      namespaceFilter: namespaceFilter,
      filters: filters
    });
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'domain-report-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, cyclesInfo, healthMap, namespaceFilter, filters]);
  
  var handleExportJSON = useCallback(function() {
    var data = {
      exportedAt: new Date().toISOString(),
      scope: 'full',
      stats: { nodes: nodes.length, edges: edges.length },
      nodes: nodes.map(function(n) { return {
        id: n.id, domainId: n.data.domainId, label: n.data.label, nodeType: n.data.nodeType,
        filePath: n.data.filePath, description: n.data.description, tags: n.data.tags
      }; }),
      edges: edges.map(function(e) { return {
        id: e.id, source: e.source, target: e.target, label: e.label,
        kind: e.data && e.data.kind, fullLabel: e.data && e.data.fullLabel, refCount: e.data && e.data.refCount
      }; })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'domain-graph-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  var handleSnapshotUpload = useCallback(function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var snap = JSON.parse(ev.target.result);
        if (!snap.scope) {
          if (!confirm('Снапшот создан старой версией без поля "scope". Продолжить?')) { e.target.value = ''; return; }
        }
        var snapEdgeIds = new Set(snap.edges.map(function(x) { return x.id; }));
        var snapNodeIds = new Set(snap.nodes.map(function(x) { return x.id; }));
        var curEdgeIds = new Set(edges.map(function(x) { return x.id; }));
        var curNodeIds = new Set(nodes.map(function(x) { return x.id; }));
        var addedEdges = new Set(), removedEdges = new Set(), addedNodes = new Set(), removedNodes = new Set();
        curEdgeIds.forEach(function(id) { if (!snapEdgeIds.has(id)) addedEdges.add(id); });
        snapEdgeIds.forEach(function(id) { if (!curEdgeIds.has(id)) removedEdges.add(id); });
        curNodeIds.forEach(function(id) { if (!snapNodeIds.has(id)) addedNodes.add(id); });
        snapNodeIds.forEach(function(id) { if (!curNodeIds.has(id)) removedNodes.add(id); });
        setDiffMode({ addedEdges: addedEdges, removedEdges: removedEdges, addedNodes: addedNodes, removedNodes: removedNodes, snapshot: snap });
      } catch (err) { alert('Ошибка чтения снимка: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [nodes, edges]);

  // ---- Node interactions ----
  var handleNodeClick = useCallback(function(event, node) {
    if (node.type === 'clusterNode') return;
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  
    if (pathMode) {
      var startId = pathMode.kind === 'from' ? pathMode.anchorId : node.id;
      var endId = pathMode.kind === 'from' ? node.id : pathMode.anchorId;
      if (startId === endId) { setPathMode(null); return; }
      var res = findPath(startId, endId, filteredEdges);
      if (res) setPathResult(res); else alert('Путь не найден');
      setPathMode(null);
      return;
    }
  
    if (event.ctrlKey || event.metaKey) {
      setPathSel(function(prev) {
        if (prev.length === 0) return [node.id];
        if (prev.length === 1 && prev[0] !== node.id) return [prev[0], node.id];
        return [node.id];
      });
      return;
    }
  
    setSelectedNodeId(node.id);
    setFocusNode(node.id);
    setPathResult(null);
    setPathSel([]);
    pushNav(node.data.domainId);
    if (sidePanelEnabled) {
      openDetails(node.id);
    }
  }, [openDetails, pathMode, filteredEdges, pushNav]);

  var handleNodeDoubleClick = useCallback(function(event, node) {
    if (node.type === 'clusterNode') return;
    if (focusNode === node.id) setFocusNode(null);
    else { setFocusNode(node.id); setSelectedNodeId(null); }
  }, [focusNode]);

  var handleNodeContextMenu = useCallback(function(event, node) {
    event.preventDefault();
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  var handlePaneContextMenu = useCallback(function(event) { event.preventDefault(); }, []);

  var handlePaneClick = useCallback(function() {
      // Закрываем все поповеры тулбара
      document.dispatchEvent(new CustomEvent('close-all-popovers'));
    
      // Скрываем тултип
      clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    
      // Сбрасываем выделения и режимы
      setSelectedNodeId(null);
      setFocusNode(null);
      setPathResult(null);
      setPathSel([]);
      setCycleHighlight(null);
      setPathMode(null);
    
      // Закрываем контекстное меню
      setContextMenu(null);
  }, []);

  var handleContextAction = useCallback(function(action, nodeId) {
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    if (action === 'focus') { setFocusNode(nodeId); setSelectedNodeId(null); }
    else if (action === 'dependents') {
      // Show only nodes that depend on this
      setFocusNode(nodeId); setFocusDepth(3);
    }
    else if (action === 'path-from') {
      setPathMode({ kind: 'from', anchorId: nodeId });
      setPathSel([]);
      setPathResult(null);
    }
    else if (action === 'path-to') {
      setPathMode({ kind: 'to', anchorId: nodeId });
      setPathSel([]);
      setPathResult(null);
    }
    else if (action === 'open-file') { if (node.data.filePath) openFileInEditor(node.data.filePath); }
    else if (action === 'copy-id') { navigator.clipboard.writeText(node.data.domainId); }
    else if (action === 'hide') {
      setHiddenNodeIds(function(prev) {
        var s = new Set(prev);
        s.add(nodeId);
        return s;
      });
    }
    else if (action === 'bookmark') { toggleBookmark(nodeId); }
  }, [nodes, filteredEdges, pathSel, openFileInEditor, setNodes]);

  var handleRunPath = useCallback(function() {
    if (pathSel.length !== 2) { alert('Выберите два узла через Ctrl+клик'); return; }
    var res = findPath(pathSel[0], pathSel[1], filteredEdges);
    if (res) setPathResult(res);
    else alert('Путь не найден');
  }, [pathSel, filteredEdges]);

  // ---- Tooltip ----
  var showTooltipFor = useCallback(function(html, event) {
    clearTimeout(hideTimer.current);
    var x = event.clientX + 16, y = event.clientY + 16;
    setTooltip({
      html: html,
      x: x,
      y: y,
      anchorX: event.clientX,
      anchorY: event.clientY
    });
  }, []);

 var scheduleHideRef = useRef(null);

var scheduleHide = useCallback(function() {
  clearTimeout(hideTimer.current);
  hideTimer.current = setTimeout(function() {
    if (window.__tooltipHovered) return;

    var el = document.querySelector('.tooltip');
    var m = window.__lastMouse;
    if (el && m) {
      var rect = el.getBoundingClientRect();
      var pad = 40;
      if (m.x >= rect.left - pad && m.x <= rect.right + pad &&
          m.y >= rect.top - pad && m.y <= rect.bottom + pad) {
        // Мышь рядом с тултипом — не скрываем, повторим проверку позже
        if (scheduleHideRef.current) scheduleHideRef.current();
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
    if (!tooltip) return;
    var el = document.querySelector('.tooltip');
    if (!el) return;
  
    var rect = el.getBoundingClientRect();
    var margin = 12;
    var gap = 16;
    var ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
    var ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;
  
    // Начинаем справа-снизу от курсора
    var x = ax + gap;
    var y = ay + gap;
  
    // Не влезает справа — перебрасываем влево от курсора (не clamp!)
    if (x + rect.width > window.innerWidth - margin) {
      x = ax - rect.width - gap;
    }
    // Не влезает снизу — перебрасываем вверх от курсора
    if (y + rect.height > window.innerHeight - margin) {
      y = ay - rect.height - gap;
    }
  
    // Финальная прижатие к краям — если и с другой стороны не влезает
    if (x < margin) x = margin;
    if (y < margin) y = margin;
  
    // Уже правильная позиция — не трогаем (это гасит цикл пересчёта)
    if (x === tooltip.x && y === tooltip.y) return;
  
    setTooltip(function(t) { return t ? Object.assign({}, t, { x: x, y: y }) : null; });
  }, [tooltip]);

  var handleNodeMouseEnter = useCallback(function(event, node) {
    if (node.type === 'clusterNode') return;
    if (!tooltipsEnabled) return;
    if (pathSel.length > 0 || pathMode) return;
    var curZoom = rfInstance.current ? rfInstance.current.getZoom() : 1;
    if (curZoom < 0.5) return;

    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function() {
      var key = node.id;
      var html = tooltipCache.current.get(key);
      if (!html) {
        var validation = validationResults ? validationResults.get(node.data.domainId) : null;
        html = buildTooltipHtml(
          node.data.domainId, node.data.label, node.data.nodeType, node.data.filePath,
          node.data.version, node.data.entitiesCount, node.data.fqidRefs,
          healthMap.get(node.id), node.data.description, node.data.tags,
          validation                              
        );
        tooltipCache.current.set(key, html);
      }
      showTooltipFor(html, event);
    }, 120);
  }, [showTooltipFor, healthMap, pathSel.length, pathMode, tooltipsEnabled, validationResults]);
  
  var handleEdgeMouseEnter = useCallback(function(event, edge) {
    if (!tooltipsEnabled) return;
    if (pathSel.length > 0 || pathMode) return;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function() {
      var refs = (edge.data && edge.data.fqidRefs) || [];
      showTooltipFor(buildEdgeTooltipHtml(edge, refs), event);
    }, 120);
  }, [showTooltipFor, pathSel.length, pathMode, tooltipsEnabled]);

  // ---- Global click delegation (tooltip buttons, goto-domain) ----
useEffect(function() {
  var handler = function(e) {
    try {
      var target = e.target;
      if (target) {
        var tag = target.tagName || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable === true) return;
      }

      var ctrl = e.ctrlKey || e.metaKey;
      var alt = e.altKey;
      var shift = e.shiftKey;
      var code = e.code;   // физическая клавиша, не зависит от раскладки
      var k = e.key;       // символ

      if (ctrl && !shift && !alt && code === 'KeyK') {
        e.preventDefault();
        openSearch();
        return;
      }

      if (alt && k === 'ArrowLeft') { e.preventDefault(); navBack(); return; }
      if (alt && k === 'ArrowRight') { e.preventDefault(); navForward(); return; }

      if (shift && k === 'Tab') {
        e.preventDefault();
        if (searchOpen) closeSearch(); else openSearch();
        return;
      }

      if (ctrl || alt) return;

      if (code === 'KeyF') { e.preventDefault(); if (rfInstance.current) { try { rfInstance.current.fitView({ duration: 500 }); } catch (err) {} } return; }
      if (code === 'KeyC') { e.preventDefault(); handleFindCycles(); return; }
      if (code === 'KeyI') { e.preventDefault(); setIsolatedOnly(function(v) { return !v; }); return; }
      if (code === 'KeyS') { e.preventDefault(); setNsMode(function(v) { return !v; }); return; }
      if (code === 'KeyP') { e.preventDefault(); handleRunPath(); return; }
      if (code === 'KeyT') { e.preventDefault(); setTooltipsEnabled(function(v) { return !v; }); return; }
      if (code === 'KeyD') { e.preventDefault(); setSidePanelEnabled(function(v) { return !v; }); return; }

      if (code === 'KeyE') {
        e.preventDefault();
        setFilters(function(f) {
          var bothOn = f.linkage && f.fqid;
          if (bothOn) return Object.assign({}, f, { linkage: false, fqid: false });
          return Object.assign({}, f, { linkage: true, fqid: true });
        });
        return;
      }

      if (code === 'KeyB' && selectedNodeId) {
        e.preventDefault();
        toggleBookmark(selectedNodeId);
        return;
      }

      if (k === 'Escape') {
        setSelectedNodeId(null);
        setFocusNode(null);
        setPathResult(null);
        setPathSel([]);
        setCycleHighlight(null);
        setContextMenu(null);
        setPathMode(null);
        return;
      }

      if (k === 'F1') { e.preventDefault(); setHelpOpen(true); return; }
      if (k === '?') { e.preventDefault(); setHotkeysOpen(true); return; }
    } catch (err) {
      console.error('[hotkey error]', err);
    }
  };

  document.addEventListener('keydown', handler, true);
  return function() { document.removeEventListener('keydown', handler, true); };
}, [
  searchOpen, openSearch, closeSearch,
  navBack, navForward,
  handleFindCycles, handleRunPath,
  selectedNodeId, toggleBookmark
]);

useEffect(function() {
  var handler = function(e) {
    var target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    // 1. Разворачивание/сворачивание секции валидации
    var toggleBtn = target.closest('.js-toggle-validation');
    if (toggleBtn) {
      e.stopPropagation();
      e.preventDefault();
      var list = toggleBtn.nextElementSibling;
      if (list && list.classList.contains('tooltip__validation-list')) {
        var isOpen = list.style.display !== 'none';
        list.style.display = isOpen ? 'none' : 'block';
        var arrow = toggleBtn.querySelector('.tooltip__validation-arrow');
        if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
      }
      return;
    }

    // 2. Открытие файла
    var openBtn = target.closest('.js-open-file');
    if (openBtn) {
      e.stopPropagation();
      e.preventDefault();
      var file = openBtn.getAttribute('data-file');
      var fqid = openBtn.getAttribute('data-fqid');
      if (file) openFileInEditor(file, fqid);
      return;
    }

    // 3. Переход к домену
    var gotoBtn = target.closest('.js-goto-domain');
    if (gotoBtn) {
      e.stopPropagation();
      e.preventDefault();
      var d = gotoBtn.getAttribute('data-domain');
      if (!d) return;
      gotoDomainByDomainId(d);
      setTooltip(null);
      window.__tooltipHovered = false;
      return;
    }
  };

  document.addEventListener('click', handler, true);
  return function() { document.removeEventListener('click', handler, true); };
}, [openFileInEditor, gotoDomainByDomainId]);

  // ---- Layout on change ----
var applyLayout = useCallback(function(type, depth) {
  setNodes(function(prevNodes) {
    if (prevNodes.length === 0) return prevNodes;

    var visibleIds = new Set(filteredNodes.map(function(n) { return n.id; }));

    var layoutInput = prevNodes
      .filter(function(n) { return visibleIds.has(n.id); })
      .map(function(n) {
        return Object.assign({}, n, {
          data: Object.assign({}, n.data, { __compact: compact })
        });
      });

    if (layoutInput.length === 0) {
      return prevNodes.map(function(n) {
        return Object.assign({}, n, { hidden: true });
      });
    }

    var result = runLayout(layoutInput, filteredEdges, type, { depth: depth });
    var posMap = new Map();
    result.nodes.forEach(function(n) { posMap.set(n.id, n.position); });

    setClusterBoxes((type === 'cluster' || type === 'folder') ? (result.boxes || []) : []);
    setClusterGroupCount((type === 'cluster' || type === 'folder') ? (result.boxes || []).length : 0);

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
            rfInstance.current.fitView({ duration: duration, padding: 0.15 });
          } catch (e) {}
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
    if (!rfInstance.current) return;
    try {
      rfInstance.current.fitView({
        duration: isFirstFit ? 0 : 500,
        padding: 0.2
      });
      didInitialFitRef.current = true;
    } catch (e) {}
  };

  var cleanup = null;
  if (isFirstFit) {
    var t = setTimeout(function() {
      requestAnimationFrame(doFit);
    }, 250);
    cleanup = function() { clearTimeout(t); };
  } else {
    var raf1 = requestAnimationFrame(function() {
      var raf2 = requestAnimationFrame(doFit);
      cleanup = function() { cancelAnimationFrame(raf2); };
    });
    cleanup = function() { cancelAnimationFrame(raf1); };
  }

  return cleanup;
}, [layoutType, clusterDepth, compact, filteredIdsHash]);

  // ---- Render ----
  var panelNode = panelNodeId ? visibleNodes.find(function(n) { return n.id === panelNodeId; }) || nodes.find(function(n) { return n.id === panelNodeId; }) : null;
  
  useEffect(function() {
    if (!panelOpen || panelTab !== 'file') return;
    if (!panelNode) return;
    if (!panelNode.data.filePath) return;
    if (editorFilePath === panelNode.data.filePath && pendingFile) return;
    // Загружаем файл узла, если ещё не загружен
    openFileInEditor(panelNode.data.filePath);
  }, [panelOpen, panelTab, panelNodeId]);
  
  var handleEdgeClick = useCallback(function(event, edge) {
    var realId = (edge.data && edge.data.originalId) || edge.id;
    setSelectedEdgeId(realId);
    if (sidePanelEnabled) {
      setPanelTab('edge');
      setPanelOpen(true);
    }
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  }, [sidePanelEnabled]);
  
 var handleExportPNG = useCallback(function() {
    var flowEl = document.querySelector('.graph-container');
    if (!flowEl) { alert('Граф не найден'); return; }
  
    import('https://esm.sh/html-to-image@1.11.11')
      .then(function(mod) {
        var bg = getComputedStyle(document.documentElement).getPropertyValue('--graph-bg').trim() || '#0a0e1a';
        return mod.toPng(flowEl, {
          backgroundColor: bg,
          pixelRatio: 2,
          filter: function(node) {
            if (!node.classList) return true;
            if (node.classList.contains('react-flow__controls')) return false;
            if (node.classList.contains('react-flow__minimap')) return false;
            if (node.classList.contains('react-flow__panel')) return false;
            if (node.classList.contains('heat-legend')) return false;
            if (node.classList.contains('side-panel')) return false;
            if (node.classList.contains('toolbar')) return false;
            return true;
          }
        });
      })
      .then(function(dataUrl) {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'domain-graph-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.png';
        a.click();
      })
      .catch(function(err) { alert('Ошибка экспорта: ' + err.message); });
  }, []);
 
 var activeModes = useMemo(function() {
  var modes = [];

  if (cycleHighlight) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'cycle' }),
      label: 'Циклы (' + cycleHighlight.sccCount + ')',
      color: 'orange',
      onClear: function() { setCycleHighlight(null); setSelectedNodeId(null); }
    });
  }
  if (focusNode) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'my_location' }),
      label: 'Фокус N=' + focusDepth,
      color: 'cyan',
      onClear: function() { setFocusNode(null); setSelectedNodeId(null); }
    });
  }
  if (pathResult || pathSel.length > 0) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'route' }),
      label: pathResult ? 'Путь найден' : 'Выбор пути (' + pathSel.length + '/2)',
      color: 'yellow',
      onClear: function() { setPathResult(null); setPathSel([]); setPathMode(null); setSelectedNodeId(null); }
    });
  }
  if (hiddenNodeIds.size > 0) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'visibility_off' }),
      label: 'Скрыто: ' + hiddenNodeIds.size,
      color: 'gray',
      onClear: function() { setHiddenNodeIds(new Set()); }
    });
  }
  if (onlyInvalid) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'cancel' }),
      label: 'Только невалидные',
      color: 'red',
      onClear: function() { setOnlyInvalid(false); }
    });
  }
  if (bookmarksOnly) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'star' }),
      label: 'Только избранные',
      color: 'yellow',
      onClear: function() { setBookmarksOnly(false); }
    });
  }
  if (nsMode) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'category' }),
      label: 'Агрегация по семействам',
      color: 'purple',
      onClear: function() { setNsMode(false); }
    });
  }
  if (diffMode) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'swap_horiz' }),
      label: 'Diff +' + (diffMode.addedEdges.size + diffMode.addedNodes.size) + '/−' + (diffMode.removedEdges.size + diffMode.removedNodes.size),
      color: 'blue',
      onClear: function() { setDiffMode(null); }
    });
  }
  if (ruleViolations && ruleViolations.length > 0 && rulesHighlighted) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'block' }),
      label: 'Нарушения: ' + ruleViolations.length,
      color: 'red',
      onClear: function() { setRulesHighlighted(false); }
    });
  }
  if (!tooltipsEnabled) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'block' }),
      label: 'Тултипы выключены',
      color: 'gray',
      onClear: function() { setTooltipsEnabled(true); }
    });
  }
  if (topoLevelMap) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'inventory_2' }),
      label: 'Уровни установки',
      color: 'green',
      onClear: function() { setTopoLevelMap(null); }
    });
  }
  if (!sidePanelEnabled) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'block' }),
      label: 'Панель выключена',
      color: 'gray',
      onClear: function() { setSidePanelEnabled(true); }
    });
  }

  if (!filters.linkage && !filters.fqid) {
      modes.push({
      icon: React.createElement(MIcon, { name: 'power_off' }),
      label: 'Связи скрыты',
      color: 'gray',
      onClear: function() {
        setFilters(function(f) { return Object.assign({}, f, { linkage: true, fqid: true }); });
      }
    });
  }

  if (namespaceFilter && namespaceFilter.trim()) {
    modes.push({
      icon: React.createElement(MIcon, { name: 'filter_alt' }),
      label: 'Фильтр: ' + (namespaceFilter.length > 30 ? namespaceFilter.slice(0, 30) + '…' : namespaceFilter),
      color: 'cyan',
      onClear: function() { setNamespaceFilter(''); }
    });
  }

    return modes;
  }, [cycleHighlight, focusNode, focusDepth,
  pathResult, pathSel, pathMode,
  hiddenNodeIds,
  onlyInvalid, bookmarksOnly, isolatedOnly,
  nsMode, diffMode,
  ruleViolations, rulesHighlighted, tooltipsEnabled,
  sidePanelEnabled, 
  namespaceFilter,
  filters.linkage, 
  filters.fqid,
  filters.domain, filters.missing, filters.broken,
  topoLevelMap]);
 
 
 var commands = useMemo(function() {
    return [
      // Навигация
      { section: 'Навигация', icon: React.createElement(MIcon, { name: 'fit_screen' }), label: 'Вписать в экран', hotkey: 'F', keywords: 'fit zoom',
        run: function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); } },
      { section: 'Навигация', icon: React.createElement(MIcon, { name: 'refresh' }), label: 'Переуложить граф', keywords: 'relayout',
        run: function() { setNodes(runLayout(nodes, edges, layoutType)); setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, 100); } },
      { section: 'Навигация', icon: React.createElement(MIcon, { name: 'arrow_back' }), label: 'Назад по истории', hotkey: 'Alt+←', keywords: 'back',
        run: navBack },
      { section: 'Навигация', icon: React.createElement(MIcon, { name: 'arrow_forward' }), label: 'Вперёд по истории', hotkey: 'Alt+→', keywords: 'forward',
        run: navForward },
  
      // Раскладка
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'straighten' }), label: 'Горизонтальная (LR)', keywords: 'layout dagre horizontal',
        run: function() { setLayoutType('LR'); } },
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'straighten' }), label: 'Вертикальная (TB)', keywords: 'layout vertical',
        run: function() { setLayoutType('TB'); } },
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'straighten' }), label: 'Force-directed', keywords: 'layout force physics',
        run: function() { setLayoutType('force'); } },
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'straighten' }), label: 'Круговая', keywords: 'layout circular circle',
        run: function() { setLayoutType('circular'); } },
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'category' }), label: 'По семействам', keywords: 'cluster namespace family layout group',
        run: function() { setLayoutType('cluster'); } },
      { section: 'Раскладка', icon: React.createElement(MIcon, { name: 'folder' }), label: 'По каталогам', keywords: 'folder directory path layout',
        run: function() { setLayoutType('folder'); } },  
  
      // Вид
      { section: 'Вид', icon: theme === 'dark' ? React.createElement(MIcon, { name: 'light_mode' }) : React.createElement(MIcon, { name: 'dark_mode' }), label: 'Переключить тему', keywords: 'theme dark light',
        run: function() { setTheme(theme === 'dark' ? 'light' : 'dark'); } },
      { section: 'Вид', icon: React.createElement(MIcon, { name: 'circle' }), label: compact ? 'Выключить компактный режим' : 'Включить компактный режим', keywords: 'compact small',
        run: function() { setCompact(!compact); } },
      { section: 'Вид', icon: React.createElement(MIcon, { name: 'category' }), label: showGroups ? 'Скрыть группировку' : 'Показать группировку', keywords: 'groups boxes',
        run: function() { setShowGroups(!showGroups); } },
      { section: 'Вид', icon: React.createElement(MIcon, { name: 'swap_horiz' }), label: bidirectional ? 'Разъединить A↔B' : 'Объединять A↔B', keywords: 'bidirectional merge',
        run: function() { setBidirectional(!bidirectional); } },
      { section: 'Вид', icon: React.createElement(MIcon, { name: 'label' }), label: showEdgeLabels ? 'Скрыть подписи связей' : 'Показать подписи связей', keywords: 'labels edges',
        run: function() { setShowEdgeLabels(!showEdgeLabels); } },
      { section: 'Вид', icon: tooltipsEnabled ? React.createElement(MIcon, { name: 'block' }) : React.createElement(MIcon, { name: 'chat_bubble' }), label: tooltipsEnabled ? 'Скрыть тултипы' : 'Показать тултипы', hotkey: 'T', keywords: 'tooltip hover',
        run: function() { setTooltipsEnabled(!tooltipsEnabled); } },
  
      // Heatmap
      { section: 'Heatmap', icon: React.createElement(MIcon, { name: 'local_fire_department' }), label: heatmap === 'health' ? 'Выключить heatmap' : 'Heatmap: Health score', keywords: 'heatmap health',
        run: function() { setHeatmap(heatmap === 'health' ? 'none' : 'health'); } },
      { section: 'Heatmap', icon: React.createElement(MIcon, { name: 'local_fire_department' }), label: heatmap === 'degree' ? 'Выключить heatmap' : 'Heatmap: Количество связей', keywords: 'heatmap degree',
        run: function() { setHeatmap(heatmap === 'degree' ? 'none' : 'degree'); } },
      { section: 'Heatmap', icon: React.createElement(MIcon, { name: 'local_fire_department' }), label: heatmap === 'entities' ? 'Выключить heatmap' : 'Heatmap: Entities', keywords: 'heatmap entities',
        run: function() { setHeatmap(heatmap === 'entities' ? 'none' : 'entities'); } },
      { section: 'Heatmap', icon: React.createElement(MIcon, { name: 'local_fire_department' }), label: heatmap === 'fqid' ? 'Выключить heatmap' : 'Heatmap: FQID-ссылки', keywords: 'heatmap fqid refs',
        run: function() { setHeatmap(heatmap === 'fqid' ? 'none' : 'fqid'); } },
  
      // Анализ
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'cycle' }), label: 'Найти циклы', hotkey: 'C', keywords: 'cycles scc loop',
        run: handleFindCycles },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'radio_button_unchecked' }), label: isolatedOnly ? 'Показать все домены' : 'Только изолированные', hotkey: 'I', keywords: 'isolated orphans',
        run: function() { setIsolatedOnly(!isolatedOnly); } },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'category' }), label: nsMode ? 'Выключить агрегацию' : 'Агрегация по семействам', hotkey: 'S', keywords: 'namespace aggregate family',
        run: function() { setNsMode(!nsMode); } },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'inventory_2' }), label: 'Порядок установки (топосорт)', keywords: 'topo install order',
        run: function() { setTopoOpen(true); } },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'my_location' }), label: focusNode ? 'Сбросить фокус' : 'Фокус на выделенном', keywords: 'focus',
        run: function() { if (focusNode) setFocusNode(null); else if (selectedNodeId) setFocusNode(selectedNodeId); } },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'route' }), label: 'Найти путь между двумя узлами', hotkey: 'P', keywords: 'path find',
        run: handleRunPath },
      { section: 'Анализ', icon: React.createElement(MIcon, { name: 'menu_book' }), label: tour ? 'Остановить экскурсию' : 'Путь изучения архитектуры', keywords: 'learning path onboarding tour',
  run: function() { if (tour) tourStop(); else setLearningPathOpen(true); } },  
  { section: 'Анализ', icon: React.createElement(MIcon, { name: 'account_tree' }), label: 'Иерархия сущностей', keywords: 'entity hierarchy inheritance inherits',
  run: function() { setEntityHierarchyInitialKey(null); setEntityHierarchyOpen(true); } },
  
      // Фильтры
      { section: 'Фильтры', icon: React.createElement(MIcon, { name: 'star' }), label: bookmarksOnly ? 'Показать все домены' : 'Только избранные', keywords: 'bookmarks favorites',
        run: function() { setBookmarksOnly(!bookmarksOnly); } },
      { section: 'Фильтры', icon: React.createElement(MIcon, { name: 'cancel' }), label: onlyInvalid ? 'Показать все домены' : 'Только невалидные', keywords: 'invalid errors validation',
        run: function() { setOnlyInvalid(!onlyInvalid); } },
      { section: 'Фильтры', icon: React.createElement(MIcon, { name: 'delete_sweep' }), label: 'Сбросить все фильтры', keywords: 'reset filters clear',
        run: function() {
          setFilters({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
          setNamespaceFilter('');
          setBookmarksOnly(false);
          setOnlyInvalid(false);
          setIsolatedOnly(false);
          setHiddenNodeIds(new Set());
        } },
  
      // Данные
      { section: 'Данные', icon: React.createElement(MIcon, { name: 'save' }), label: 'Экспорт графа в JSON', keywords: 'export json download',
        run: handleExportJSON },
      { section: 'Данные', icon: React.createElement(MIcon, { name: 'description' }), label: 'Отчёт в Markdown', keywords: 'export markdown report',
        run: handleExportMarkdown },
      { section: 'Данные', icon: React.createElement(MIcon, { name: 'image' }), label: 'Экспорт графа в PNG', keywords: 'export png image',
        run: handleExportPNG },
      validationAvailable && { section: 'Данные', icon: React.createElement(MIcon, { name: 'search' }), label: 'Массовая валидация доменов', keywords: 'validate check',
        run: function() { setValidationOpen(true); } },
  
      // Справка
      { section: 'Справка', icon: React.createElement(MIcon, { name: 'menu_book' }), label: 'Руководство пользователя', hotkey: 'F1', keywords: 'guide help docs',
        run: function() { setHelpOpen(true); } },
      { section: 'Справка', icon: React.createElement(MIcon, { name: 'keyboard' }), label: 'Список горячих клавиш', keywords: 'hotkeys shortcuts',
        run: function() { setHotkeysOpen(true); } }
    ].filter(Boolean);
  }, [
    theme, compact, showGroups, bidirectional, showEdgeLabels, tooltipsEnabled, heatmap,
    isolatedOnly, nsMode, focusNode, selectedNodeId, bookmarksOnly, onlyInvalid, validationAvailable,
    nodes, edges, layoutType, navBack, navForward,
    handleFindCycles, handleRunPath, handleExportJSON, handleExportMarkdown, handleExportPNG
  ]);

  return React.createElement('div', { className: 'app' },
    React.createElement('aside', { className: 'sidebar' + (sidebarCollapsed ? ' sidebar--collapsed' : '') },
      sidebarCollapsed ?
        React.createElement('button', { className: 'sidebar__expand', onClick: function() { setSidebarCollapsed(false); }, title: 'Развернуть' }, '›') :
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'sidebar__header' },
            React.createElement('div', { className: 'sidebar__logo' }, React.createElement(MIcon, { name: 'language' })),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { className: 'sidebar__title' }, 'Domain Graph'),
              React.createElement('div', { className: 'sidebar__subtitle' }, 'Analyzer')
            ),
            React.createElement('button', { className: 'sidebar__collapse', onClick: function() { setSidebarCollapsed(true); }, title: 'Свернуть' }, '‹')
          ),
          React.createElement('div', { className: 'sidebar__body' },
            // Overview
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Обзор'),
              React.createElement('div', { className: 'stats-grid' },
                React.createElement('div', { className: 'stat-card stat-card--accent' }, React.createElement('div', { className: 'stat-card__value' }, nodes.length), React.createElement('div', { className: 'stat-card__label' }, 'Всего узлов')),
                React.createElement('div', { className: 'stat-card stat-card--success' }, React.createElement('div', { className: 'stat-card__value' }, edges.length), React.createElement('div', { className: 'stat-card__label' }, 'Связей')),
                React.createElement('div', { className: 'stat-card stat-card--warning' }, React.createElement('div', { className: 'stat-card__value' }, counts.missing), React.createElement('div', { className: 'stat-card__label' }, 'Missing')),
                React.createElement('div', { className: 'stat-card stat-card--danger' }, React.createElement('div', { className: 'stat-card__value' }, counts.broken), React.createElement('div', { className: 'stat-card__label' }, 'Broken'))
              )
            ),
            // Connectivity
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Связность'),
              React.createElement('div', { className: 'mini-stats' },
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Домены'), React.createElement('span', { className: 'mini-stat__value' }, counts.domain)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Изолированы'), React.createElement('span', { className: 'mini-stat__value' }, isolatedCount)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Linkage'), React.createElement('span', { className: 'mini-stat__value' }, counts.linkage)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'FQID'), React.createElement('span', { className: 'mini-stat__value' }, counts.fqid)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Циклы'), React.createElement('span', { className: 'mini-stat__value' }, cyclesInfo.sccs.length))
              )
            ),
            // Top connected
            topConnected.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Топ по связям'),
              React.createElement('div', { className: 'rank-list' },
                topConnected.map(function(item, i) {
                  return React.createElement('button', { key: item.node.id, className: 'rank-item', onClick: function() { gotoDomainByDomainId(item.node.data.domainId); }, title: item.node.data.domainId },
                    React.createElement('span', { className: 'rank-item__num' }, i + 1),
                    React.createElement('span', { className: 'rank-item__label' }, item.node.data.domainId),
                    React.createElement('span', { className: 'rank-item__value' }, item.degree)
                  );
                })
              )
            ),
            bookmarks.size > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Избранное (' + bookmarks.size + ')'),
              React.createElement('div', { className: 'rank-list' },
                Array.from(bookmarks).slice(0, 15).map(function(id) {
                  var n = nodes.find(function(x) { return x.id === id; });
                  if (!n) return null;
                  return React.createElement('button', {
                    key: id,
                    className: 'rank-item',
                    onClick: function() { gotoDomainByDomainId(n.data.domainId); },
                    title: n.data.domainId
                  },
                    React.createElement('span', { className: 'rank-item__num' }, React.createElement(MIcon, { name: 'star' })),
                    React.createElement('span', { className: 'rank-item__label' }, n.data.domainId),
                    React.createElement('button', {
                      className: 'rank-item__value',
                      style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-500)' },
                      onClick: function(ev) { ev.stopPropagation(); toggleBookmark(id); },
                      title: 'Убрать из избранного'
                    }, React.createElement(MIcon, { name: 'close' }))
                  );
                })
              )
            ),
            // Worst health
            worstHealth.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Стена позора (health)'),
              React.createElement('div', { className: 'rank-list' },
                worstHealth.map(function(item, i) {
                  var hc = item.health >= 80 ? 'health-good' : item.health >= 50 ? 'health-mid' : 'health-bad';
                  return React.createElement('button', { key: item.node.id, className: 'rank-item', onClick: function() { gotoDomainByDomainId(item.node.data.domainId); }, title: item.node.data.domainId },
                    React.createElement('span', { className: 'rank-item__num' }, i + 1),
                    React.createElement('span', { className: 'rank-item__label' }, item.node.data.domainId),
                    React.createElement('span', { className: 'details__badge details__badge--' + hc, style: { fontSize: 10, padding: '1px 6px' } }, item.health)
                  );
                })
              )
            ),
            // Namespaces
            namespaces.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Неймспейсы'),
              React.createElement('div', { className: 'bar-list', style: { maxHeight: 240, overflowY: 'auto' } },
                namespaces.map(function(entry) {
                  var ns = entry[0], count = entry[1];
                  var max = namespaces[0][1];
                  return React.createElement('button', { key: ns, className: 'bar-item', onClick: function() { setNamespaceFilter(ns); }, title: 'Показать ' + ns },
                    React.createElement('span', { className: 'bar-item__label' }, ns),
                    React.createElement('span', { className: 'bar-item__value' }, count),
                    React.createElement('span', { className: 'bar-item__track' }, React.createElement('span', { className: 'bar-item__fill', style: { width: (count / max * 100) + '%' } }))
                  );
                })
              )
            ),
            // Tags
            tagCloud.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Теги'),
              React.createElement('div', { className: 'tag-cloud' },
                tagCloud.map(function(entry) {
                  var tag = entry[0], count = entry[1];
                  return React.createElement('button', { key: tag, className: 'tag', onClick: function() { setSearchQuery(tag); openSearch(); }, title: tag + ' (' + count + ')' },
                    tag, React.createElement('span', { className: 'tag__count' }, count)
                  );
                })
              )
            ),
            // Legend
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Легенда'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--success)' } }), 'Domain'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--warning)' } }), 'Missing'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--danger)' } }), 'Broken'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-line', style: { background: LINKAGE_COLOR } }), 'Linkage'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-line', style: { background: FQID_COLOR } }), 'FQID')
            )
          )
        )
    ),
    React.createElement('main', { className: 'main' },
      React.createElement('div', { className: 'toolbar' },
      
        React.createElement('div', { className: 'toolbar__group' },
          React.createElement('button', { className: 'btn btn--icon', onClick: function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, title: 'Вписать (F)' }, React.createElement(MIcon, { name: 'fit_screen' })),
            React.createElement('button', {
              className: 'btn btn--icon',
              onClick: function() {
                var result = runLayout(nodes, edges, layoutType, { depth: clusterDepth });
                setNodes(result.nodes);
                setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, 100);
              },
              title: 'Переуложить'
            }, React.createElement(MIcon, { name: 'refresh' })),
            React.createElement('button', {
              className: 'btn btn--icon',
              onClick: function() {
                if (!confirm('Сбросить раскладку и выделения?')) return;
                setLayoutType('LR');
                setCompact(false);
                setSelectedNodeId(null);
                setFocusNode(null);
                setCycleHighlight(null);
                setPathResult(null);
                setPathSel([]);
                setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, 200);
              },
              title: 'Сбросить раскладку'
            }, React.createElement(MIcon, { name: 'restart_alt' })),
          React.createElement('button', { className: 'btn btn--icon', onClick: navBack, disabled: navStack.index <= 0, style: { opacity: navStack.index <= 0 ? 0.4 : 1 }, title: 'Назад (Alt+<span class="material-symbols-outlined mi-sm">arrow_back</span>)' }, React.createElement(MIcon, { name: 'arrow_back' })),
          React.createElement('button', { className: 'btn btn--icon', onClick: navForward, disabled: navStack.index >= navStack.items.length - 1, style: { opacity: navStack.index >= navStack.items.length - 1 ? 0.4 : 1 }, title: 'Вперёд (Alt+→)' }, React.createElement(MIcon, { name: 'arrow_forward' }))
        ),
      
        React.createElement('button', { className: 'btn', onClick: openSearch, title: 'Поиск (Shift+Tab)' },
          React.createElement('span', { className: 'btn__icon' }, React.createElement(MIcon, { name: 'search' })),
          'Поиск',
          React.createElement('kbd', { className: 'btn-kbd' }, '⇧ Tab')
        ),
      
        React.createElement(Popover, {
          width: 320,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, React.createElement(MIcon, { name: 'tune' })),
              'Фильтры',
              activeFiltersCount > 0 && React.createElement('span', { className: 'btn__badge' }, activeFiltersCount)
            );
          }
        }, function() {
          return React.createElement(FilterMenu, {
            filters: filters, setFilters: setFilters, counts: counts,
            namespaceFilter: namespaceFilter, setNamespaceFilter: setNamespaceFilter,
            bookmarksOnly: bookmarksOnly, setBookmarksOnly: setBookmarksOnly,
            onlyInvalid: onlyInvalid, setOnlyInvalid: setOnlyInvalid,
            isolatedOnly: isolatedOnly, setIsolatedOnly: setIsolatedOnly,
            tooltipsEnabled: tooltipsEnabled, setTooltipsEnabled: setTooltipsEnabled,
            sidePanelEnabled: sidePanelEnabled,
            setSidePanelEnabled: setSidePanelEnabled,
            close: close,
          });
        }),
      
        React.createElement(Popover, {
          width: 280,
          trigger: function(open) {
            var active = open || cycleHighlight || isolatedOnly || nsMode || focusNode;
            return React.createElement('button', { className: 'btn' + (active ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, React.createElement(MIcon, { name: 'bar_chart' })),
              'Анализ'
            );
          }
        }, function(close) {
          return React.createElement(AnalysisMenu, {
            cycleHighlight: cycleHighlight, handleFindCycles: handleFindCycles,
            isolatedOnly: isolatedOnly, setIsolatedOnly: setIsolatedOnly,
            nsMode: nsMode, setNsMode: setNsMode,
            focusDepth: focusDepth, setFocusDepth: setFocusDepth,
            focusNode: focusNode, clearFocus: function() { setFocusNode(null);  },
            onOpenTopo: function() { setTopoOpen(true); },
            onOpenLearningPath: function() { setLearningPathOpen(true); },
            onOpenEntityHierarchy: function() {
  setEntityHierarchyInitialKey(null);
  setEntityHierarchyOpen(true);
},
            close: close
          });
        }),
      
        React.createElement(Popover, {
          width: 300,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, React.createElement(MIcon, { name: 'palette' })),
              'Вид'
            );
          }
        }, function(close) {
          return React.createElement(ViewMenu, {
            layoutType: layoutType, setLayoutType: setLayoutType,
            compact: compact, setCompact: setCompact,
            showGroups: showGroups, setShowGroups: setShowGroups,
            bidirectional: bidirectional, setBidirectional: setBidirectional,
            showEdgeLabels: showEdgeLabels, setShowEdgeLabels: setShowEdgeLabels,
            heatmap: heatmap, setHeatmap: setHeatmap,
            theme: theme, setTheme: setTheme,
            clusterDepth: clusterDepth,
            setClusterDepth: setClusterDepth,
            clusterGroupCount: clusterGroupCount,
            close: close
          });
        }),
      
        React.createElement(Popover, {
          width: 260,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open || diffMode ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, React.createElement(MIcon, { name: 'save' })),
              'Данные'
            );
          }
        }, function(close) {
          return React.createElement(DataMenu, {
            handleExportJSON: handleExportJSON,
            handleExportMarkdown: handleExportMarkdown,
            handleExportPNG: handleExportPNG,
            snapshotInputRef: snapshotInputRef,
            handleSnapshotUpload: handleSnapshotUpload,
            diffMode: diffMode, setDiffMode: setDiffMode,
            validationAvailable: validationAvailable,
            onOpenValidation: function() { setValidationOpen(true); },
            close: close
          });
        }),
      
        React.createElement('div', { className: 'toolbar__spacer' }),
      
        React.createElement('button', {
          className: 'btn btn--icon',
          onClick: function() { setHotkeysOpen(true); },
          title: 'Горячие клавиши (?)'
        }, React.createElement(MIcon, { name: 'keyboard' })),

        React.createElement('button', {
          className: 'btn btn--icon',
          onClick: function() { setHelpOpen(true); },
          title: 'Руководство пользователя (F1)'
        }, React.createElement(MIcon, { name: 'menu_book' })),
      
        React.createElement('div', { className: 'toolbar__stats' },
          visibleNodes.length + ' / ' + nodes.length + ' узлов · ' + visibleEdges.length + ' / ' + edges.length + ' связей'
        )
      ),
      React.createElement(ActiveModesBar, { modes: activeModes }),
      React.createElement('div', { className: 'graph-container' + (showEdgeLabels ? ' show-labels' : '') },
        React.createElement(ReactFlowProvider, null,
          React.createElement(ReactFlowInner, {
            nodes: visibleNodes,
            edges: displayEdges,
            onNodesChange: onNodesChange,
            onEdgesChange: onEdgesChange,
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
            setRfInstance: function(rf) { rfInstance.current = rf; },
            readOnly: nsMode,
            perfMode: perfMode,
          }),
          (layoutType === 'cluster' || layoutType === 'folder') && clusterBoxes.length > 0 && React.createElement(GroupsOverlay, {
            boxes: clusterBoxes
          })
        ),
        visibleNodes.length === 0 && React.createElement('div', { className: 'empty-state' },
          React.createElement('div', { className: 'empty-state__title' }, 'Ничего не найдено'),
          React.createElement('div', { className: 'empty-state__text' }, 'Измените фильтры')
        ),
        React.createElement(SidePanel, {
          open: panelOpen, tab: panelTab, setTab: setPanelTab,
          node: panelNode,
          edge: panelEdge,
          filePath: editorFilePath,
          pendingFile: pendingFile,
          editorRef: editorRef,
          onClose: closePanel,
          allNodes: nodes, allEdges: edges,
          onGotoDomain: gotoDomainByDomainId,
          onOpenFile: function(p) { openFileInEditor(p); },
           entities: GRAPH_DATA.entities || [],
  entityIndex: entityIndex,
  onOpenEntityHierarchy: function(key) {
    setEntityHierarchyInitialKey(key);
    setEntityHierarchyOpen(true);
  },
          ruleViolations: ruleViolations
        }),
        heatmap !== 'none' && heatmapValues && React.createElement('div', { className: 'heat-legend' },
          React.createElement('div', { className: 'heat-legend__title' }, 'Heatmap: ' + heatmapValues.scheme.label),
          React.createElement('div', { className: 'heat-legend__bar' }),
          React.createElement('div', { className: 'heat-legend__labels' },
            React.createElement('span', null, heatmapValues.min),
            React.createElement('span', null, heatmapValues.max)
          ),
          React.createElement('button', { className: 'heat-legend__close', onClick: function() { setHeatmap('none'); } }, React.createElement(MIcon, { name: 'close' }))
        )
      )
    ),
    React.createElement(HoverTooltip, { tooltip: tooltip, onHide: scheduleHide }),
    React.createElement(SearchModal, {
      open: searchOpen, query: searchQuery, setQuery: setSearchQuery,
      results: searchResults,  commands: commands, index: searchIndex, setIndex: setSearchIndex,
      onSelect: function(domainId) { gotoDomainByDomainId(domainId); closeSearch(); },
      onClose: closeSearch, inputRef: searchInputRef
    }),
    React.createElement(HelpModal, {
      open: helpOpen,
      onClose: function() { setHelpOpen(false); }
    }),
    React.createElement(HotkeysModal, {
      open: hotkeysOpen,
      onClose: function() { setHotkeysOpen(false); }
    }),
    React.createElement(ValidationModal, {
      open: validationOpen,
      onClose: function() { setValidationOpen(false); },
      allDomains: allDomainsList,
      visibleDomains: visibleDomainsList,
      bookmarkedDomains: bookmarkedDomainsList,
      onGotoDomain: gotoDomainByDomainId,
      onResults: handleValidationResults
    }),
    React.createElement(TopoSortModal, {
      open: topoOpen,
      onClose: function() { setTopoOpen(false); },
      allNodes: nodes,
      allEdges: edges,
      allDomains: allDomainsList,
      visibleDomains: visibleDomainsList,
      bookmarkedDomains: bookmarkedDomainsList,
      onGotoDomain: gotoDomainByDomainId,
      onApplyLevels: function(levelMap) { setTopoLevelMap(levelMap); }
    }),
    React.createElement(EntityHierarchyModal, {
  open: entityHierarchyOpen,
  onClose: function() {
    setEntityHierarchyOpen(false);
    setEntityHierarchyInitialKey(null);
  },
  entities: GRAPH_DATA.entities || [],
  initialEntityKey: entityHierarchyInitialKey,
  onGotoDomain: gotoDomainByDomainId
}),
    React.createElement(LearningPathModal, {
  open: learningPathOpen,
  onClose: function() { setLearningPathOpen(false); },
  allNodes: nodes,
  allEdges: edges,
  visibleDomains: visibleDomainsList,
  bookmarkedDomains: bookmarkedDomainsList,
  onGotoDomain: gotoDomainByDomainId,
  onStartTour: startTour
}),
React.createElement(TourOverlay, {
  tour: tour,
  onPrev: tourPrev,
  onNext: tourNext,
  onTogglePlay: tourTogglePlay,
  onStop: tourStop
}),
    React.createElement(ContextMenu, { menu: contextMenu, onClose: function() { setContextMenu(null); }, onAction: handleContextAction }),
    toastVisible && REMOTE_INFO && REMOTE_INFO.fromCache && React.createElement(Toast, {
      message: '<span class="material-symbols-outlined mi-sm">inventory_2</span> Граф построен из <b>кэша</b>'
        + (REMOTE_INFO.fetchedAt ? ' (от ' + new Date(REMOTE_INFO.fetchedAt).toLocaleString('ru-RU') + ')' : '')
        + '. Данные могут быть устаревшими.',
      actions: REFRESH_COMMAND ? [{ command: REFRESH_COMMAND }] : [],
      duration: 30000,
      onClose: function() { setToastVisible(false); }
    })
  );
}

var root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));