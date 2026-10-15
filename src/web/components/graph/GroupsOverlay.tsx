import React, { useEffect, useRef } from 'react';
import { useViewport } from 'reactflow';

export interface ClusterBox {
    id: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    count: number;
}

export interface GroupsOverlayProps {
    boxes: ClusterBox[];
}

/**
 * Рисует рамки-кластеры поверх графа.
 * Позиционируется через CSS transform, синхронно с viewport ReactFlow.
 */
export function GroupsOverlay({ boxes }: GroupsOverlayProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const viewport = useViewport();

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        svg.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`;
    }, [viewport.x, viewport.y, viewport.zoom]);

    if (!boxes || boxes.length === 0) return null;

    return (
        <svg
            ref={svgRef}
            className="groups-overlay"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 1,
                height: 1,
                overflow: 'visible',
                pointerEvents: 'none',
                transformOrigin: '0 0',
                willChange: 'transform'
            }}
        >
            {boxes.map((b) => (
                <g key={b.id} transform={`translate(${b.x},${b.y})`}>
                    <rect
                        width={b.w}
                        height={b.h}
                        rx={12}
                        fill="rgba(99,102,241,0.05)"
                        stroke="rgba(99,102,241,0.4)"
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                    />
                    <text
                        x={14}
                        y={22}
                        fill="var(--accent-hover)"
                        fontSize={13}
                        fontWeight={700}
                        fontFamily="Inter, sans-serif"
                    >
                        {b.label} · {b.count}
                    </text>
                </g>
            ))}
        </svg>
    );
}