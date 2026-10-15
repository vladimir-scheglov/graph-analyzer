import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    layoutEntityGraph,
    LaidEntityNode
} from '../../lib/entities/tree';
import type { EntityTree } from '../../lib/types';

export interface EntityHierarchyGraphProps {
    tree: EntityTree;
    onSelect?: (node: any) => void;
    onGotoDomain?: (domainId: string) => void;
}

export function EntityHierarchyGraph({ tree, onSelect, onGotoDomain }: EntityHierarchyGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const dragRef = useRef<any>(null);
    const [isDragging, setIsDragging] = useState(false);

    const laid = useMemo(
        () => layoutEntityGraph(tree.nodes, tree.edges, tree.rootKey),
        [tree]
    );

    useEffect(() => {
        setViewport({ x: 0, y: 0, scale: 1 });
    }, [tree.rootKey]);

    const fitView = useCallback(() => {
        if (!laid || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

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

    useEffect(() => {
        if (!laid) return;
        const t = setTimeout(fitView, 50);
        return () => clearTimeout(t);
    }, [laid, fitView]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
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
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const onMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
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

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
            setViewport((vp) => ({
                x: dragRef.current.startVpX + dx,
                y: dragRef.current.startVpY + dy,
                scale: vp.scale
            }));
        };
        const onUp = () => {
            setIsDragging(false);
            setTimeout(() => {
                if (dragRef.current) dragRef.current.moved = false;
            }, 0);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [isDragging]);

    const zoomBy = useCallback((factor: number) => {
        const el = containerRef.current;
        if (!el) return;
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

    if (!laid) return null;

    const byKey = new Map<string, LaidEntityNode>();
    laid.forEach((n) => byKey.set(n.key, n));

    const rootDomainId = (tree.rootKey.split('/')[0] || '').toLowerCase();

    const handleNodeClick = (n: any) => {
        if (dragRef.current && dragRef.current.moved) return;
        if (n.missing) return;
        if (onSelect) onSelect(n);
    };

    const truncate = (s: string, max: number) =>
        !s ? '' : s.length > max ? s.slice(0, max - 1) + '…' : s;

    return (
        <>
            <div className="entity-graph-controls">
                <button
                    className="entity-ctrl-btn"
                    onClick={() => zoomBy(1.3)}
                    title="Приблизить"
                >
                    +
                </button>
                <button
                    className="entity-ctrl-btn"
                    onClick={() => zoomBy(1 / 1.3)}
                    title="Отдалить"
                >
                    −
                </button>
                <button className="entity-ctrl-btn" onClick={fitView} title="Вписать">
                    ⛶
                </button>
                <span className="entity-zoom-level">{Math.round(viewport.scale * 100)}%</span>
            </div>

            <div
                className={
                    'entity-graph-container' + (isDragging ? ' entity-graph-container--dragging' : '')
                }
                ref={containerRef}
                onMouseDown={onMouseDown}
            >
                <svg
                    ref={svgRef}
                    className="entity-graph-svg"
                    style={{ width: '100%', height: '100%' }}
                >
                    <defs>
                        <marker
                            id="entity-arrow"
                            viewBox="0 0 10 10"
                            refX={9}
                            refY={5}
                            markerWidth={6}
                            markerHeight={6}
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" className="entity-arrow-marker" />
                        </marker>
                    </defs>

                    <g
                        transform={
                            'translate(' + viewport.x + ',' + viewport.y + ') scale(' + viewport.scale + ')'
                        }
                    >
                        <g className="entity-graph-edges">
                            {tree.edges.map((e, i) => {
                                const src = byKey.get(e.source);
                                const tgt = byKey.get(e.target);
                                if (!src || !tgt) return null;
                                const sx = src.x + src.width / 2;
                                const sy = src.y + src.height;
                                const tx = tgt.x + tgt.width / 2;
                                const ty = tgt.y;
                                const my = (sy + ty) / 2;
                                const path = 'M ' + sx + ',' + sy + ' C ' + sx + ',' + my + ' ' + tx + ',' + my + ' ' + tx + ',' + ty;
                                const isCycle =
                                    tree.cycleNodes.has(e.source) && tree.cycleNodes.has(e.target);
                                return (
                                    <path
                                        key={i}
                                        d={path}
                                        className={'entity-edge' + (isCycle ? ' entity-edge--cycle' : '')}
                                        markerEnd="url(#entity-arrow)"
                                    />
                                );
                            })}
                        </g>

                        <g className="entity-graph-nodes">
                            {laid.map((n) => {
                                const isRoot = n.key === tree.rootKey;
                                const isCycle = tree.cycleNodes.has(n.key);
                                const isForeign = !isRoot && n.domainId.toLowerCase() !== rootDomainId;
                                let nodeCls = 'entity-graph-node';
                                if (isRoot) nodeCls += ' entity-graph-node--root';
                                if (isCycle) nodeCls += ' entity-graph-node--cycle';
                                if (n.missing) nodeCls += ' entity-graph-node--missing';

                                const idMax = isRoot ? 24 : 22;
                                const shortId = truncate(n.missing ? '⚠️ ' + n.entityId : n.entityId, idMax);
                                const shortName = truncate(n.name || '', 26);
                                const shortDomain = truncate(n.domainId, 24);

                                return (
                                    <g
                                        key={n.key}
                                        transform={'translate(' + n.x + ',' + n.y + ')'}
                                        className={nodeCls}
                                        onClick={() => handleNodeClick(n)}
                                        style={{ cursor: n.missing ? 'default' : 'pointer' }}
                                    >
                                        <title>
                                            {n.entityId + (n.name ? ' — ' + n.name : '') + ' (' + n.domainId + ')'}
                                        </title>
                                        <rect
                                            width={n.width}
                                            height={n.height}
                                            rx={8}
                                            className={
                                                'entity-node-rect' +
                                                (isRoot ? ' entity-node-rect--root' : '') +
                                                (isForeign ? ' entity-node-rect--foreign' : '') +
                                                (isCycle ? ' entity-node-rect--cycle' : '') +
                                                (n.missing ? ' entity-node-rect--missing' : '')
                                            }
                                        />
                                        <text
                                            x={n.width / 2}
                                            y={isRoot ? 24 : 22}
                                            textAnchor="middle"
                                            className={'entity-node-id' + (isRoot ? ' entity-node-id--root' : '')}
                                            pointerEvents="none"
                                        >
                                            {shortId}
                                        </text>
                                        {!isRoot && !n.missing && shortName && (
                                            <text
                                                x={n.width / 2}
                                                y={38}
                                                textAnchor="middle"
                                                className="entity-node-name"
                                                pointerEvents="none"
                                            >
                                                {shortName}
                                            </text>
                                        )}
                                        {!n.missing && (
                                            <text
                                                x={n.width / 2}
                                                y={n.height - 8}
                                                textAnchor="middle"
                                                className={
                                                    'entity-node-domain' + (isForeign ? ' entity-node-domain--foreign' : '')
                                                }
                                                onClick={(ev) => {
                                                    ev.stopPropagation();
                                                    if (onGotoDomain) onGotoDomain(n.domainId);
                                                }}
                                            >
                                                {shortDomain}
                                            </text>
                                        )}
                                        {n.missing && (
                                            <text
                                                x={n.width / 2}
                                                y={n.height - 8}
                                                textAnchor="middle"
                                                className="entity-node-domain entity-node-domain--missing"
                                            >
                                                не найдено
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    </g>
                </svg>
            </div>
        </>
    );
}