import React from 'react';
import { useNavigation } from '../../hooks/useNavigation';
import { MIcon } from '../common/MIcon';

export interface EdgeTabProps {
    edge: any;
    allNodes: any[];
}

export function EdgeTab({ edge, allNodes }: EdgeTabProps) {
    const { goto } = useNavigation();

    if (!edge) {
        return (
            <div className="details">
                <div style={{ color: 'var(--text-500)', textAlign: 'center', padding: 40 }}>
                    Связь не выбрана
                </div>
            </div>
        );
    }

    const link = (edge.data && edge.data.linkData) || {};
    const refs = (edge.data && edge.data.fqidRefs) || [];
    const srcNode = allNodes.find((n) => n.id === edge.source);
    const tgtNode = allNodes.find((n) => n.id === edge.target);

    return (
        <div className="details">
            <div className="details__title">
                {(edge.data && edge.data.fullLabel) || edge.label || edge.id}
            </div>

            <div className="details__id">
                <span className="details__id-text">
                    {(link.originalId && srcNode
                        ? `${srcNode.data.domainId}/${link.originalId}`
                        : null) ||
                        (edge.data && edge.data.fullLabel) ||
                        edge.label ||
                        (srcNode ? `${srcNode.data.domainId}/${edge.id}` : edge.id)}
                </span>
                <button
                    className="details__copy"
                    onClick={() => {
                        const copyId = (edge.data && edge.data.linkData && edge.data.linkData.originalId) || edge.id;
                        navigator.clipboard.writeText(copyId);
                    }}
                    title="Копировать ID связи"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>

            {edge.data?.fullLabel && (
                <div className="details__field">
                    <div className="details__field-label">Название</div>
                    <div className="details__field-value">{edge.data.fullLabel}</div>
                </div>
            )}

            {edge.data?.kind && (
                <div className="details__field">
                    <div className="details__field-label">Тип связи</div>
                    <div className="details__field-value">
                        <span className="details__badge">
                            {edge.data.kind === 'linkage' ? 'Linkage' : 'FQID'}
                        </span>
                        {edge.data.isBidirectional && (
                            <span className="details__badge">⇄ двунаправленная</span>
                        )}
                        {link.type && (
                            <span className="details__badge" style={{ marginLeft: 8 }}>
                                {link.type}
                            </span>
                        )}
                        {edge.data.refCount && (
                            <span className="details__badge">{edge.data.refCount} refs</span>
                        )}
                    </div>
                </div>
            )}

            {srcNode && (
                <div className="details__field">
                    <div className="details__field-label">Источник</div>
                    <div className="details__ref" onClick={() => goto(srcNode.data.domainId)}>
                        <div>{srcNode.data.domainId}</div>
                        {link.sourceEntity && <div className="details__ref-path">{link.sourceEntity}</div>}
                    </div>
                </div>
            )}

            {tgtNode && (
                <div className="details__field">
                    <div className="details__field-label">Цель</div>
                    <div className="details__ref" onClick={() => goto(tgtNode.data.domainId)}>
                        <div>{tgtNode.data.domainId}</div>
                        {link.targetEntity && <div className="details__ref-path">{link.targetEntity}</div>}
                    </div>
                </div>
            )}

            {link.nameFrom && (link.nameFrom.side1 || link.nameFrom.side2) && (
                <div className="details__field">
                    <div className="details__field-label">Стороны</div>
                    {link.nameFrom.side1 && (
                        <div className="details__field-value">Сторона 1: {link.nameFrom.side1}</div>
                    )}
                    {link.nameFrom.side2 && (
                        <div className="details__field-value">Сторона 2: {link.nameFrom.side2}</div>
                    )}
                </div>
            )}

            {refs.length > 0 && (
                <div className="details__field">
                    <div className="details__field-label">FQID-ссылки ({refs.length})</div>
                    <div className="details__refs">
                        {refs.map((r: any, i: number) => (
                            <div
                                key={i}
                                className="details__ref"
                                onClick={() => r.targetDomainId && goto(r.targetDomainId)}
                            >
                                <div>{r.fullFQID}</div>
                                <div className="details__ref-path">{r.propertyPath}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="details__actions">
                {srcNode && (
                    <button className="btn" onClick={() => goto(srcNode.data.domainId)}>
                        🎯 К источнику
                    </button>
                )}
                {tgtNode && (
                    <button className="btn" onClick={() => goto(tgtNode.data.domainId)}>
                        🎯 К цели
                    </button>
                )}
            </div>
        </div>
    );
}