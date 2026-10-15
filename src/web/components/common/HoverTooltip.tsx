import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';

/**
 * Отображает текущий тултип из store.
 * Позиционирование корректируется в useTooltip.
 */
export function HoverTooltip() {
    const tooltip = useGraphStore((s) => s.tooltip);
    const setTooltip = useGraphStore((s) => s.setTooltip);

    if (!tooltip) return null;

    return (
        <div
            className="tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            onMouseEnter={() => { window.__tooltipHovered = true; }}
            onMouseLeave={() => { window.__tooltipHovered = false; }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div dangerouslySetInnerHTML={{ __html: tooltip.html }} />
        </div>
    );
}