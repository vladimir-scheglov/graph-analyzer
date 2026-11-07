import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

/**
 * Компактный возраст: "3d", "5h", "2mo". Локально — единственный потребитель.
 * В тултип уходит полная дата через buildNodeTooltip.
 */
function formatAge(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const diffMs = Date.now() - new Date(iso).getTime();
    if (isNaN(diffMs) || diffMs < 0) return null;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'now';
    if (min < 60) return min + 'm';
    const h = Math.floor(min / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd';
    if (d < 365) return Math.floor(d / 30) + 'mo';
    return Math.floor(d / 365) + 'y';
}

function healthClass(score: number): 'good' | 'mid' | 'bad' {
    return score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad';
}

export function DomainNode({ data, selected }: NodeProps) {
    const isDisabled = data.status === 'DISABLED';
    const isInvalid = data.__invalid === true;
    const hasDraft = data.hasDraft === true;

    const healthScore =
        data.health && typeof data.health === 'object' ? data.health.score : data.health;
    const hc = healthScore != null ? healthClass(healthScore) : null;

    // ============ COMPACT ============
    if (data.__compact) {
        const cls = [
            'rf-compact',
            'rf-compact--' + data.nodeType,
            selected ? 'rf-compact--selected' : '',
            isDisabled ? 'rf-compact--disabled' : '',
            isInvalid ? 'rf-compact--invalid' : '',
        ]
            .filter(Boolean)
            .join(' ');

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
                <div className={cls} style={style}>
                    {initial}
                    {isInvalid && <span className="rf-compact__dot rf-compact__dot--err" />}
                    {isDisabled && <span className="rf-compact__dot rf-compact__dot--off" />}
                    {hasDraft && !isInvalid && !isDisabled && (
                        <span className="rf-compact__dot rf-compact__dot--draft" />
                    )}
                </div>
                <Handle type="source" position={Position.Right} className="rf-handle" />
            </>
        );
    }

    // ============ NORMAL ============
    const cls = ['rf-node', 'rf-node--' + data.nodeType];
    if (selected) cls.push('rf-node--selected');
    if (data.dimmed) cls.push('rf-node--dimmed');
    if (data.__inPath) cls.push('rf-node--path');
    if (data.__isPathEndpoint) cls.push('rf-node--path-endpoint');
    if (data.__failed) cls.push('rf-node--failed');
    if (data.__pendingFail) cls.push('rf-node--pending-fail');
    if (data.__failureRoot) cls.push('rf-node--failure-root');
    if (data.__selectedHighlight) cls.push('rf-node--selected-soft');
    if (isDisabled) cls.push('rf-node--disabled');

    const icon =
        data.nodeType === 'domain' ? '●' : data.nodeType === 'missing' ? '▲' : '✕';

    const nodeStyle: React.CSSProperties = {};
    if (data.__heatColor) {
        nodeStyle.background = data.__heatColor;
        nodeStyle.borderColor = data.__heatColor;
        nodeStyle.color = '#ffffff';
    }

    // ===== Health badge: фокусированный popover с breakdown =====
    // (существующий механизм, отдельный от главного тултипа узла)
    const onHealthEnter = (e: React.MouseEvent) => {
        if (!data.__tooltipsEnabled) return;
        e.stopPropagation();
        const items = (data.healthBreakdown || [])
            .map(
                (b: any) =>
                    `<div style="margin:3px 0;display:flex;justify-content:space-between;gap:12px;">` +
                    `<span>${escapeHtml(b.reason)}</span>` +
                    `<span style="color:${b.delta < 0 ? '#ef4444' : '#10b981'};font-weight:700;">${b.delta > 0 ? '+' + b.delta : b.delta}</span></div>`,
            )
            .join('');
        const html =
            `<div style="padding:8px 10px;">` +
            `<div style="font-weight:700;margin-bottom:6px;">Health score: ${healthScore}/100</div>` +
            (items || `<div style="color:#64748b;">Все показатели в норме</div>`) +
            `</div>`;
        (window as any).__healthTooltip = { html, x: e.clientX, y: e.clientY };
        document.dispatchEvent(new CustomEvent('show-health-tooltip'));
    };

    const onHealthLeave = () => {
        document.dispatchEvent(new CustomEvent('hide-health-tooltip'));
    };

    // ===== Badges =====
    const entitiesBadge =
        data.entitiesCount > 0 ? (
            <span className="rf-node__badge rf-node__badge--count">
                {data.entitiesCount}
            </span>
        ) : null;

    let healthBadge: React.ReactNode = null;
    if (healthScore != null && data.nodeType === 'domain' && !data.__heatColor) {
        healthBadge = (
            <span
                className={'rf-node__health rf-node__health--' + hc}
                onMouseEnter={onHealthEnter}
                onMouseLeave={onHealthLeave}
                style={{ cursor: 'help' }}
            >
                {healthScore}
            </span>
        );
    }

    const validationBadge =
        data.__validationStatus === 'invalid' && data.__validationCount > 0 ? (
            <span className="rf-node__issues">⚠{data.__validationCount}</span>
        ) : null;

    // ===== Meta row — без title=, вся инфа в главном поповере =====
    const metaItems: React.ReactNode[] = [];
    if (data.version) {
        metaItems.push(
            <span key="v" className="rf-node__meta-item rf-node__meta-item--version">
                v{data.version}
            </span>,
        );
    }
    if (hasDraft) {
        metaItems.push(
            <span key="draft" className="rf-node__meta-item rf-node__meta-item--draft">
                ✎ черновик
            </span>,
        );
    }
    if (isDisabled) {
        metaItems.push(
            <span key="off" className="rf-node__meta-item rf-node__meta-item--off">
                OFF
            </span>,
        );
    }
    const age = formatAge(data.updatedAt);
    if (age) {
        metaItems.push(
            <span key="age" className="rf-node__meta-item rf-node__meta-item--age">
                🕒 {age}
            </span>,
        );
    }
    if (data.tags && data.tags.length > 0) {
        metaItems.push(
            <span key="tags" className="rf-node__meta-item rf-node__meta-item--tags">
                {data.tags.slice(0, 3).map((_: string, i: number) => (
                    <span key={i} className="rf-node__tag-dot" />
                ))}
                {data.tags.length > 3 && (
                    <span className="rf-node__tag-more">+{data.tags.length - 3}</span>
                )}
            </span>,
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
                            className={
                                'rf-node__id' + (isInvalid ? ' rf-node__id--invalid' : '')
                            }
                        >
                            {data.domainId}
                        </span>
                        {entitiesBadge}
                        {healthBadge}
                        {validationBadge}
                        {data.__topoLevel != null && (
                            <span className="topo-badge">L{data.__topoLevel}</span>
                        )}
                    </div>
                    {data.label && data.label !== data.domainId && (
                        <div className="rf-node__name">{data.label}</div>
                    )}
                    {metaItems.length > 0 && (
                        <div className="rf-node__meta-row">{metaItems}</div>
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
            "'": '&#39;',
        };
        return map[c];
    });
}