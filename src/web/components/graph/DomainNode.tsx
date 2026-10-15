import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

/**
 * Кастомный узел. Работает как с обычным, так и с компактным режимом.
 * Все данные приходят через node.data (прокинуто из store через visibleNodes).
 */
export function DomainNode({ data, selected }: NodeProps) {
    // Компактный режим — кружок с инициалом
    if (data.__compact) {
        const cls = 'rf-compact rf-compact--' + data.nodeType + (selected ? ' rf-compact--selected' : '');
        const initial = (data.domainId || '?').charAt(0).toUpperCase();
        const style: React.CSSProperties = {};
        if (data.__heatColor) {
            style.background = data.__heatColor;
            style.borderColor = data.__heatColor;
            style.color = '#ffffff';
        }
        return (
            <>
                <Handle type="target" position={Position.Left} className="rf-handle" />
                <div className={cls} style={style} title={data.domainId}>
                    {initial}
                </div>
                <Handle type="source" position={Position.Right} className="rf-handle" />
            </>
        );
    }

    const cls = ['rf-node', 'rf-node--' + data.nodeType];
    if (selected) cls.push('rf-node--selected');
    if (data.dimmed) cls.push('rf-node--dimmed');
    if (data.__inPath) cls.push('rf-node--path');
    if (data.__isPathEndpoint) cls.push('rf-node--path-endpoint');
    if (data.__failed) cls.push('rf-node--failed');
    if (data.__pendingFail) cls.push('rf-node--pending-fail');
    if (data.__failureRoot) cls.push('rf-node--failure-root');
    if (data.__selectedHighlight) cls.push('rf-node--selected-soft');

    const icon = data.nodeType === 'domain' ? '●' : data.nodeType === 'missing' ? '▲' : '✕';

    const nodeStyle: React.CSSProperties = {};
    if (data.__heatColor) {
        nodeStyle.background = data.__heatColor;
        nodeStyle.borderColor = data.__heatColor;
        nodeStyle.color = '#ffffff';
    }

    const onHealthEnter = (e: React.MouseEvent) => {
        if (!data.__tooltipsEnabled) return;
        e.stopPropagation();
        const items = (data.healthBreakdown || [])
            .map(
                (b: any) =>
                    `<div style="margin:3px 0;display:flex;justify-content:space-between;gap:12px;">` +
                    `<span>${escapeHtml(b.reason)}</span>` +
                    `<span style="color:${b.delta < 0 ? '#ef4444' : '#10b981'};font-weight:700;">${b.delta > 0 ? '+' + b.delta : b.delta
                    }</span></div>`
            )
            .join('');
        const html =
            `<div style="padding:8px 10px;">` +
            `<div style="font-weight:700;margin-bottom:6px;">Health score: ${data.health}/100</div>` +
            (items || `<div style="color:#64748b;">Все показатели в норме</div>`) +
            `</div>`;
        window.__healthTooltip = { html, x: e.clientX, y: e.clientY };
        document.dispatchEvent(new CustomEvent('show-health-tooltip'));
    };

    const onHealthLeave = () => {
        document.dispatchEvent(new CustomEvent('hide-health-tooltip'));
    };

    let healthBadge: React.ReactNode = null;
    if (data.health != null && data.nodeType === 'domain' && !data.__heatColor) {
        const healthScore = typeof data.health === 'object' ? data.health.score : data.health;
        if (healthScore != null) {
            const hc = healthScore >= 80 ? 'good' : healthScore >= 50 ? 'mid' : 'bad';
            healthBadge = (
                <span
                    className={'rf-node__health rf-node__health--' + hc}
                    title={'Health score: ' + healthScore + '/100'}
                    onMouseEnter={onHealthEnter}
                    onMouseLeave={onHealthLeave}
                    style={{ cursor: 'help' }}
                >
                    {healthScore}
                </span>
            );
        }
    }

    let validationBadge: React.ReactNode = null;
    if (data.__validationStatus === 'invalid' && data.__validationCount > 0) {
        validationBadge = (
            <span
                className="rf-node__issues"
                title={'Валидация: ' + data.__validationCount + ' проблем'}
            >
                ⚠{data.__validationCount}
            </span>
        );
    }

    return (
        <>
            <Handle type="target" position={Position.Left} className="rf-handle" />
            <div className={cls.join(' ')} style={nodeStyle}>
                <div className="rf-node__icon">{icon}</div>
                <div className="rf-node__content">
                    <div className="rf-node__id-row">
                        <span
                            className={'rf-node__id' + (data.__invalid ? ' rf-node__id--invalid' : '')}
                            title={data.domainId + (data.__invalid ? ' — невалиден' : '')}
                        >
                            {data.domainId}
                        </span>
                        {healthBadge}
                        {validationBadge}
                        {data.__topoLevel != null && (
                            <span className="topo-badge" title={'Уровень установки: ' + data.__topoLevel}>
                                L{data.__topoLevel}
                            </span>
                        )}
                    </div>
                    {data.label && data.label !== data.domainId && (
                        <div className="rf-node__name" title={data.label}>
                            {data.label}
                        </div>
                    )}
                </div>
            </div>
            <Handle type="source" position={Position.Right} className="rf-handle" />
        </>
    );
}

function escapeHtml(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return map[c];
    });
}