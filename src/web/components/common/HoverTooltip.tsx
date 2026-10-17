import React, { useEffect } from 'react';
import { useGraphStore } from '../../state/useGraphStore';

/**
 * Отображает текущий тултип и корректирует его позицию у границ viewport.
 * Единственное место, подписанное на store.tooltip.
 */
export function HoverTooltip() {
    const tooltip = useGraphStore((s) => s.tooltip);
    const setTooltip = useGraphStore((s) => s.setTooltip);

    // Позиционирование — не влезает справа/снизу → перебрасываем
    useEffect(() => {
        if (!tooltip) return;
        const el = document.querySelector('.tooltip') as HTMLElement | null;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const margin = 12;
        const gap = 16;
        const ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
        const ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;

        let x = ax + gap;
        let y = ay + gap;

        if (x + rect.width > window.innerWidth - margin) x = ax - rect.width - gap;
        if (y + rect.height > window.innerHeight - margin) y = ay - rect.height - gap;
        if (x < margin) x = margin;
        if (y < margin) y = margin;

        if (x === tooltip.x && y === tooltip.y) return;

        setTooltip((t) => (t ? { ...t, x, y } : null));
    }, [tooltip, setTooltip]);

    if (!tooltip) return null;

    return (
        <div
            className="tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            onMouseEnter={() => {
                window.__tooltipHovered = true;
            }}
            onMouseLeave={() => {
                window.__tooltipHovered = false;
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div dangerouslySetInnerHTML={{ __html: tooltip.html }} />
        </div>
    );
}