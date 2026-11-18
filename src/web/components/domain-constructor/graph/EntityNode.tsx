import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { EntityNodeData } from './types';

export const EntityNode = memo(function EntityNode({ data, selected }: NodeProps<EntityNodeData>) {
    const isExternal = data.kind === 'external';
    const hasColor = !!data.color;

    return (
        <div
            className={
                'dc-graph-node' +
                (selected ? ' dc-graph-node--selected' : '') +
                (isExternal ? ' dc-graph-node--external' : '')
            }
            style={hasColor ? { borderColor: `var(--${data.color})` } : undefined}
            title={`${data.name} (${data.fqid})`}
        >
            <Handle type="target" position={Position.Left} className="dc-graph-handle" />
            <Handle type="target" position={Position.Top} className="dc-graph-handle" />

            <div className="dc-graph-node__row">
                <span
                    className="dc-graph-node__dot"
                    style={hasColor ? { background: `var(--${data.color})` } : undefined}
                    aria-hidden="true"
                />
                <span className="dc-graph-node__name">{data.name}</span>
            </div>

            <div className="dc-graph-node__row dc-graph-node__row--meta">
                <code className="dc-graph-node__id">{data.entityId}</code>
                {data.attributeCount > 0 && (
                    <span className="dc-graph-node__badge">{data.attributeCount} атр.</span>
                )}
                {isExternal && (
                    <span className="dc-graph-node__badge dc-graph-node__badge--external">
                        ext
                    </span>
                )}
            </div>

            <Handle type="source" position={Position.Right} className="dc-graph-handle" />
            <Handle type="source" position={Position.Bottom} className="dc-graph-handle" />
        </div>
    );
});