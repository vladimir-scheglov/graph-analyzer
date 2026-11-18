import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from 'reactflow';
import type { InheritanceEdgeData } from './types';

export const InheritanceEdge = memo(function InheritanceEdge(
    props: EdgeProps<InheritanceEdgeData>,
) {
    const {
        id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        data, markerEnd, selected,
    } = props;

    if (!data) return null;

    const [path] = getSmoothStepPath({
        sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        borderRadius: 12,
    });

    const color = data.crossDomain ? 'var(--warning)' : 'var(--accent)';

    return (
        <BaseEdge
            id={id}
            path={path}
            markerEnd={markerEnd}
            style={{
                stroke: color,
                strokeWidth: selected ? 2.5 : 1.5,
                strokeDasharray: '3 3',
            }}
        />
    );
});