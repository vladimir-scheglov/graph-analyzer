import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { buildEntityMatrix, shortLabel } from '../../lib/model/entity-matrix';
import { ModalHelp, HelpSection, HelpText, HelpList, HelpButton } from '../common/ModalHelp';
import { MIcon } from '../common';

const MATRIX_LIMIT = 60;

export function EntityMatrixModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);

    const [domainFilter, setDomainFilter] = useState<string>('');
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [hoveredCol, setHoveredCol] = useState<number | null>(null);

    const open = store.entityMatrixOpen;

    // Список доменов для селекта
    const allDomains = useMemo(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // Матрица
    const matrix = useMemo(() => {
        if (!index) return null;
        const domains = domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined;
        return buildEntityMatrix(index, { domains, limit: MATRIX_LIMIT });
    }, [index, domainFilter]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setEntityMatrixOpen(false)}
        >
            <div
                className="help-modal entity-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="calculate" size="sm" />
                        <span className="icon-label">Матрица связей сущностей</span>
                        {matrix && (<span className="help-modal__badge">{matrix.stats.totalEntities} × {matrix.stats.totalEntities}</span>)}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Как читать?" />
                        <button
                            className="help-modal__close"
                            onClick={() => store.setEntityMatrixOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && matrix && (
                    <div className="entity-matrix-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Как читать матрицу">
                                <HelpText>
                                    Строки и столбцы — сущности. Ячейка на пересечении — есть ли связь
                                    от сущности в строке к сущности в столбце. Плотные блоки — кластеры
                                    сущностей, которые активно общаются между собой.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Цвета">
                                <HelpList>
                                    <li><strong style={{ color: '#a78bfa' }}>Фиолетовый</strong> — наследование (inherits).</li>
                                    <li><strong style={{ color: '#6366f1' }}>Синий</strong> — Reference-атрибут.</li>
                                    <li><strong style={{ color: '#10b981' }}>Зелёный</strong> — linkage.</li>
                                    <li>Число в ячейке — сколько связей этого типа между сущностями.</li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Зачем">
                                <HelpText>
                                    Некоторые связи заметны только в матричном виде, а не на графе.
                                    Хорошо видно «диагональное» поведение — сущность A связана с B, B с C,
                                    но не A с C — кластеры выделяются структурно.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpText>
                                    Матрица показывает топ-60 сущностей по количеству связей. Для больших
                                    графов уточняйте через фильтр по домену.
                                </HelpText>
                            </HelpSection>
                        </ModalHelp>
                        {/* ============ ВЕРХНЯЯ ПАНЕЛЬ ============ */}
                        <div className="entity-matrix-toolbar">
                            <div className="entity-matrix-toolbar__filters">
                                <label className="entity-matrix-filter">
                                    <span>Домен:</span>
                                    <select
                                        value={domainFilter}
                                        onChange={(e) => setDomainFilter(e.target.value)}
                                    >
                                        <option value="">— все —</option>
                                        {allDomains.map(([d, count]) => (
                                            <option key={d} value={d}>
                                                {d} ({count})
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <span className="entity-matrix-hint">
                                    Показано топ-{MATRIX_LIMIT} сущностей по исходящим связям
                                </span>
                            </div>

                            <div className="entity-matrix-toolbar__legend">
                                <span className="entity-matrix-legend-item">
                                    <span className="entity-matrix-legend-cell entity-matrix-legend-cell--reference" />
                                    Reference ({matrix.stats.byKind.reference})
                                </span>
                                <span className="entity-matrix-legend-item">
                                    <span className="entity-matrix-legend-cell entity-matrix-legend-cell--inheritance" />
                                    Наследование ({matrix.stats.byKind.inheritance})
                                </span>
                                <span className="entity-matrix-legend-item">
                                    <span className="entity-matrix-legend-cell entity-matrix-legend-cell--linkage" />
                                    Linkage ({matrix.stats.byKind.linkage})
                                </span>
                                <span className="entity-matrix-toolbar__total">
                                    Всего связей: {matrix.stats.totalLinks}
                                </span>
                            </div>
                        </div>

                        {/* ============ МАТРИЦА ============ */}
                        {matrix.rows.length === 0 ? (
                            <div className="entity-matrix-empty">Нет данных для отображения</div>
                        ) : (
                            <div className="entity-matrix-scroll">
                                <table className="entity-matrix-table">
                                    <thead>
                                        <tr>
                                            <th className="entity-matrix-corner">
                                                <span className="entity-matrix-corner__arrow">↘</span>
                                            </th>
                                            {matrix.entityFqids.map((fqid, idx) => {
                                                const e = matrix.rows[idx].entity;
                                                const isHovered = hoveredCol === idx;
                                                return (
                                                    <th
                                                        key={fqid}
                                                        className={
                                                            'entity-matrix-col-head' + (isHovered ? ' highlighted' : '')
                                                        }
                                                        onMouseEnter={() => setHoveredCol(idx)}
                                                        onMouseLeave={() => setHoveredCol(null)}
                                                        title={fqid}
                                                    >
                                                        <span className="entity-matrix-col-head__text">
                                                            {shortLabel(fqid)}
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matrix.rows.map((row, rowIdx) => {
                                            const isRowHovered = hoveredRow === rowIdx;
                                            return (
                                                <tr key={row.entity.fqid} className={isRowHovered ? 'highlighted' : ''}>
                                                    <th
                                                        className="entity-matrix-row-head"
                                                        onMouseEnter={() => setHoveredRow(rowIdx)}
                                                        onMouseLeave={() => setHoveredRow(null)}
                                                        title={row.entity.fqid}
                                                    >
                                                        <span className="entity-matrix-row-head__text">
                                                            {shortLabel(row.entity.fqid)}
                                                        </span>
                                                        <span className="entity-matrix-row-head__count">
                                                            {row.totalOutgoing}
                                                        </span>
                                                    </th>

                                                    {matrix.entityFqids.map((colFqid, colIdx) => {
                                                        const cell = row.cells.get(colFqid);
                                                        const isHoveredRow = hoveredRow === rowIdx;
                                                        const isHoveredCol = hoveredCol === colIdx;

                                                        if (!cell) {
                                                            return (
                                                                <td
                                                                    key={colFqid}
                                                                    className={
                                                                        'entity-matrix-cell entity-matrix-cell--empty' +
                                                                        (isHoveredRow || isHoveredCol ? ' in-row-col' : '')
                                                                    }
                                                                    onMouseEnter={() => {
                                                                        setHoveredRow(rowIdx);
                                                                        setHoveredCol(colIdx);
                                                                    }}
                                                                    onMouseLeave={() => {
                                                                        setHoveredRow(null);
                                                                        setHoveredCol(null);
                                                                    }}
                                                                />
                                                            );
                                                        }

                                                        const kindClass = 'entity-matrix-cell--' + cell.kind;
                                                        return (
                                                            <td
                                                                key={colFqid}
                                                                className={
                                                                    'entity-matrix-cell ' +
                                                                    kindClass +
                                                                    (isHoveredRow || isHoveredCol ? ' in-row-col' : '')
                                                                }
                                                                onMouseEnter={() => {
                                                                    setHoveredRow(rowIdx);
                                                                    setHoveredCol(colIdx);
                                                                }}
                                                                onMouseLeave={() => {
                                                                    setHoveredRow(null);
                                                                    setHoveredCol(null);
                                                                }}
                                                                title={
                                                                    shortLabel(row.entity.fqid) +
                                                                    ' → ' +
                                                                    shortLabel(colFqid) +
                                                                    '\n' +
                                                                    cell.details
                                                                        .map((d) => d.via + (d.reverse ? ' (reverse)' : ''))
                                                                        .join('\n')
                                                                }
                                                            >
                                                                <span className="entity-matrix-cell__count">
                                                                    {cell.count}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}