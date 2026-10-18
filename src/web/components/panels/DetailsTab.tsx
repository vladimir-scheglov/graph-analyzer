import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { MIcon } from '../common/MIcon';
import { CollapsibleSection } from './CollapsibleSection';
import { formatDate, sourceIcon, sourceLabel, sourceColor } from '../../lib/format';
import { readRemoteInfo } from '../../state/initial';
import { DomainMixinsPanel } from './DomainMixinsPanel';
import { openFileInEditor } from '../../lib/open-file';
import { DomainSonarPanel } from './DomainSonarPanel';


export interface DetailsTabProps {
    node: any;
    allNodes: any[];
    allEdges: any[];
    ruleViolations: any[];
}

export function DetailsTab({ node, allNodes, allEdges, ruleViolations }: DetailsTabProps) {
    const setDomainSchemaDomainId = useGraphStore((s) => s.setDomainSchemaDomainId);
    const setDomainSchemaOpen = useGraphStore((s) => s.setDomainSchemaOpen);
    const { goto } = useNavigation();

    if (!node) {
        return (
            <div className="details">
                <div style={{ color: 'var(--text-500)', textAlign: 'center', padding: 40 }}>
                    Узел не выбран
                </div>
            </div>
        );
    }

    const incoming = allEdges.filter((e) => e.target === node.id);
    const outgoing = allEdges.filter((e) => e.source === node.id);
    const refs = node.data.fqidRefs || [];
    const health = node.data.health;
    const hc =
        health != null ? (health >= 80 ? 'health-good' : health >= 50 ? 'health-mid' : 'health-bad') : null;

    const remoteInfo = readRemoteInfo();

    return (
        <div className="details">
            <div className="details__title">{node.data.label || node.data.domainId}</div>

            <div className="details__id">
                <span className="details__id-text">{node.data.domainId}</span>
                <button
                    className="details__copy"
                    onClick={() => navigator.clipboard.writeText(node.data.domainId)}
                    title="Копировать"
                >
                    <MIcon name="content_copy" size="sm" /> 
                </button>
            </div>

            <div className="details__badges">
                <span className={'details__badge details__badge--' + node.data.nodeType}>
                    {node.data.nodeType}
                </span>
                {health != null && (
                    <span className={'details__badge details__badge--' + hc}>
                        Health: {health}/100
                    </span>
                )}
                {node.data.version && (
                    <span className="details__badge">v{node.data.version}</span>
                )}
            </div>

            {node.data.nodeType === 'domain' && (
                <div className="details__actions details__actions--top">
                    <button
                        className="btn btn--primary"
                        onClick={() => {
                            setDomainSchemaDomainId(node.data.domainId);
                            setDomainSchemaOpen(true);
                        }}
                    >
                        <MIcon name="menu_book" size="sm"/>
                        Схема домена
                    </button>
                    {node.data.filePath && (
                        <button
                            className="btn"
                            onClick={() => openFileInEditor(node.data.filePath, null, node.data.domainId)}
                        >
                            <MIcon name="description" size="sm" /> 
                            Открыть файл
                        </button>
                    )}
                </div>
            )}

            {node.data.updatedAt && (
                <div className="details__field">
                    <div className="details__field-label">Обновлён</div>
                    <div
                        className="details__field-value"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <MIcon
                            name={sourceIcon(node.data.updatedAtSource)}
                            size="sm"
                            title={sourceLabel(node.data.updatedAtSource)}
                        />
                        <span>{formatDate(node.data.updatedAt)}</span>
                        <span
                            style={{
                                fontSize: 10,
                                color: sourceColor(node.data.updatedAtSource),
                                fontFamily: 'JetBrains Mono, monospace',
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'var(--bg-750)',
                                marginLeft: 'auto'
                            }}
                        >
                            {node.data.updatedAtSource === 'graphql'
                                ? 'server'
                                : node.data.updatedAtSource === 'fs'
                                    ? 'local'
                                    : '—'}
                        </span>
                    </div>
                </div>
            )}

            {node.data.createdAt && (
                <div className="details__field">
                    <div className="details__field-label">Создан</div>
                    <div
                        className="details__field-value"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <MIcon
                            name={sourceIcon(node.data.createdAtSource)}
                            size="sm"
                            title={sourceLabel(node.data.createdAtSource)}
                        />
                        <span>{formatDate(node.data.createdAt)}</span>
                        <span
                            style={{
                                fontSize: 10,
                                color: sourceColor(node.data.createdAtSource),
                                fontFamily: 'JetBrains Mono, monospace',
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: 'var(--bg-750)',
                                marginLeft: 'auto'
                            }}
                        >
                            {node.data.createdAtSource === 'graphql'
                                ? 'server'
                                : node.data.createdAtSource === 'fs'
                                    ? 'local'
                                    : '—'}
                        </span>
                    </div>
                </div>
            )}

            {node.data.description && (
                <div className="details__field">
                    <div className="details__field-label">Описание</div>
                    <div className="details__field-value">{node.data.description}</div>
                </div>
            )}

            {node.data.tags && node.data.tags.length > 0 && (
                <div className="details__field">
                    <div className="details__field-label">Теги</div>
                    <div className="details__tags">
                        {node.data.tags.map((t: string, i: number) => (
                            <span key={i} className="tag">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {remoteInfo?.server && (
                <div className="details__field">
                    <div className="details__field-label">Каталог</div>
                    <div
                        className="details__field-value"
                        style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            lineHeight: 1.7,
                            wordBreak: 'break-word'
                        }}
                    >
                        {node.data.folderPath && node.data.folderPath.length > 0
                            ? node.data.folderPath.join(' / ')
                            : '(корень)'}
                    </div>
                </div>
            )}

            {!remoteInfo?.server && node.data.filePath && (
                <div className="details__field">
                    <div className="details__field-label">Файл</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div
                            className="details__field-value"
                            style={{ fontFamily: 'monospace', fontSize: 11, flex: 1, wordBreak: 'break-all' }}
                        >
                            {node.data.filePath}
                        </div>
                        <button
                            className="details__copy"
                            onClick={() => {
                                const path = node.data.filePath;
                                const url = 'vscode://file' + (path.startsWith('/') ? path : '/' + path);
                                window.location.href = url;
                            }}
                            title="Открыть в VS Code"
                        >
                            <MIcon name="code" />
                        </button>
                    </div>
                </div>
            )}

            {node.data.health != null &&
                node.data.healthBreakdown &&
                node.data.healthBreakdown.length > 0 && (
                    <div className="details__field">
                        <div className="details__field-label">Health breakdown</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {node.data.healthBreakdown.map((b: any, i: number) => (
                                <div
                                    key={i}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: 12,
                                        color: 'var(--text-400)'
                                    }}
                                >
                                    <span>{b.reason}</span>
                                    <span
                                        style={{
                                            color: b.delta < 0 ? 'var(--danger)' : 'var(--success)',
                                            fontWeight: 600,
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        {b.delta > 0 ? '+' + b.delta : b.delta}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            <CollapsibleSection id="fqid-out" title="Исходящие FQID-ссылки" count={refs.length}>
                {refs.length === 0 ? (
                    <div className="details__field-value" style={{ color: 'var(--text-500)' }}>
                        —
                    </div>
                ) : (
                    <div className="details__refs">
                        {refs.slice(0, 50).map((r: any, i: number) => {
                            const targetExists = allNodes.some(
                                (n) =>
                                    (n.data.domainId || '').toLowerCase() ===
                                    (r.targetDomainId || '').toLowerCase()
                            );
                            return (
                                <div
                                    key={i}
                                    className={'details__ref' + (targetExists ? '' : ' details__ref--missing')}
                                    onClick={() => targetExists && goto(r.targetDomainId)}
                                >
                                    <div>{r.fullFQID}</div>
                                    <div className="details__ref-path">
                                        {r.propertyPath + (!targetExists ? ' · ⚠️ missing' : '')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CollapsibleSection>

            <CollapsibleSection id="incoming" title="Входящие связи" count={incoming.length}>
                {incoming.length === 0 ? (
                    <div className="details__field-value" style={{ color: 'var(--text-500)' }}>—</div>
                ) : (
                    <div className="details__refs">
                        {incoming.slice(0, 30).map((e: any, i: number) => {
                            const src = allNodes.find((n) => n.id === e.source);
                            return (
                                <div
                                    key={i}
                                    className="details__ref"
                                    onClick={() => src && goto(src.data.domainId)}
                                >
                                    <div>{src ? src.data.domainId : e.source}</div>
                                    <div className="details__ref-path">{(e.data && e.data.kind) || ''}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CollapsibleSection>

            <CollapsibleSection id="outgoing" title="Исходящие связи" count={outgoing.length}>
                {outgoing.length === 0 ? (
                    <div className="details__field-value" style={{ color: 'var(--text-500)' }}>—</div>
                ) : (
                    <div className="details__refs">
                        {outgoing.slice(0, 30).map((e: any, i: number) => {
                            const tgt = allNodes.find((n) => n.id === e.target);
                            return (
                                <div
                                    key={i}
                                    className="details__ref"
                                    onClick={() => tgt && goto(tgt.data.domainId)}
                                >
                                    <div>{tgt ? tgt.data.domainId : e.target}</div>
                                    <div className="details__ref-path">{(e.data && e.data.kind) || ''}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CollapsibleSection>

            {node.data.nodeType === 'domain' && (
                <CollapsibleSection id="mixins" title="Миксины">
                    <DomainMixinsPanel domainId={node.data.domainId} />
                </CollapsibleSection>
            )}

            {node.data.nodeType === 'domain' && (
                <CollapsibleSection id="sonar" title="Sonar-оценка">
                    <DomainSonarPanel domainId={node.data.domainId} />
                </CollapsibleSection>
            )}

            {node.data.__validationStatus === 'invalid' &&
                node.data.__validationDiagnostics &&
                node.data.__validationDiagnostics.length > 0 && (
                    <CollapsibleSection
                        id="validation"
                        title="Ошибки валидации"
                        count={node.data.__validationDiagnostics.length}
                    >
                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                            {node.data.__validationDiagnostics.map((d: any, i: number) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '8px 10px',
                                        background: 'var(--bg-750)',
                                        borderRadius: 6,
                                        marginBottom: 6,
                                        fontSize: 12,
                                        borderLeft:
                                            '2px solid ' +
                                            (d.severity === 'ERROR' ? 'var(--danger)' : 'var(--warning)')
                                    }}
                                >
                                    <div
                                        style={{
                                            fontWeight: 700,
                                            fontSize: 10,
                                            textTransform: 'uppercase',
                                            color: d.severity === 'ERROR' ? 'var(--danger)' : 'var(--warning)',
                                            marginBottom: 4
                                        }}
                                    >
                                        {d.severity}
                                    </div>
                                    <div style={{ color: 'var(--text-200)' }}>{d.message}</div>
                                    {d.labels &&
                                        d.labels.length > 0 &&
                                        d.labels.map((lb: any, li: number) => (
                                            <div
                                                key={li}
                                                style={{
                                                    fontSize: 11,
                                                    color: 'var(--text-500)',
                                                    fontFamily: 'monospace',
                                                    marginTop: 4
                                                }}
                                            >
                                                {lb.message}
                                                {lb.span && ' [' + lb.span.start + '–' + lb.span.end + ']'}
                                            </div>
                                        ))}
                                </div>
                            ))}
                        </div>
                    </CollapsibleSection>
                )}

            <CollapsibleSection id="violations" title="Нарушения правил" count={ruleViolations.length}>
                {ruleViolations.length === 0 ? (
                    <div className="details__field-value" style={{ color: 'var(--text-500)' }}>—</div>
                ) : (
                    <div className="details__refs">
                        {ruleViolations.slice(0, 10).map((v: any, i: number) => (
                            <div
                                key={i}
                                className="rank-item"
                                style={{ cursor: 'pointer' }}
                                onClick={() => goto(v.fromId)}
                            >
                                <span className="rank-item__num">{v.severity === 'forbid' ? <MIcon name="block" size="sm" /> : <MIcon name="warning" size="sm" />}</span>
                                <span className="rank-item__label">
                                    {v.fromId} → {v.toId}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>
        </div>
    );
}