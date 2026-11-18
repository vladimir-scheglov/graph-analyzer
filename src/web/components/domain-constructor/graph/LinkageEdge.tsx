import { memo } from 'react';
import {
    BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath,
    type EdgeProps,
} from 'reactflow';
import type { LinkageEdgeData } from './types';

export const LinkageEdge = memo(function LinkageEdge(props: EdgeProps<LinkageEdgeData>) {
    const {
        id, sourceX, sourceY, targetX, targetY,
        sourcePosition, targetPosition, data, markerEnd, selected,
    } = props;

    if (!data) return null;

    const isUndirected = !!data.undirected;
    const isNN = data.type === 'n_n';

    const [path, labelX, labelY] = getBezierPath({
        sourceX, sourceY, targetX, targetY,
        sourcePosition, targetPosition,
        curvature: 0.25,
    });

    const color = data.color ? `var(--${data.color})` : 'var(--border-hover)';
    const strokeDash = isUndirected ? '6 4' : undefined;
    const width = selected ? 2.5 : 1.5;

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={isUndirected ? undefined : markerEnd}
                markerStart={isUndirected ? markerEnd : undefined}
                style={{ stroke: color, strokeWidth: width, strokeDasharray: strokeDash }}
            />
            {data.nameFrom?.side1 && (
                <EdgeLabelRenderer>
                    <div
                        className="dc-graph-edge-label"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        title={data.name ?? data.id}
                    >
                        {data.nameFrom.side1}
                        {isNN && <span className="dc-graph-edge-label__hint"> (N–N)</span>}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
});