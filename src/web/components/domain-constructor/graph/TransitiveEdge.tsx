import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from 'reactflow';
import type { TransitiveEdgeData } from './types';

export const TransitiveEdge = memo(function TransitiveEdge(props: EdgeProps<TransitiveEdgeData>) {
    const {
        id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        data, markerEnd, selected,
    } = props;
    if (!data) return null;

    const [path] = getSmoothStepPath({
        sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
        borderRadius: 20,
    });

    return (
        <BaseEdge
            id={id}
            path={path}
            markerEnd={markerEnd}
            style={{
                stroke: 'var(--text-500)',
                strokeWidth: selected ? 2 : 1,
                strokeDasharray: '2 4',
            }}
        />
    );
});