import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { buildAttributeMatrix, AttributeMatrixColumn } from '../../lib/model/attribute-matrix';
import { DomainCombobox } from '../common/DomainCombobox';

export function AttributeMatrixModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();

    const open = store.attributeMatrixOpen;

    const [domainFilter, setDomainFilter] = useState('');
    const [minOccurrences, setMinOccurrences] = useState(2);
    const [onlyInconsistent, setOnlyInconsistent] = useState(false);

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const matrix = useMemo(() => {
        if (!index) return null;
        return buildAttributeMatrix(index, {
            domains: domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined,
            minOccurrences,
            maxColumns: 40,
            maxRows: 100
        });
    }, [index, domainFilter, minOccurrences]);

    const visibleColumns = useMemo(() => {
        if (!matrix) return [];
        if (!onlyInconsistent) return matrix.columns;
        return matrix.columns.filter((c) => !c.consistentType);
    }, [matrix, onlyInconsistent]);

    const openEntity = (fqid: string) => {
        store.setAttributeMatrixOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setAttributeMatrixOpen(false)}
        >
            <div
                className="help-modal entity-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📊 Матрица атрибутов
                        {matrix && (
                            <span className="help-modal__badge">
                                {matrix.rows.length} × {visibleColumns.length}
                            </span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setAttributeMatrixOpen(false)}
                    >
                        ✕
                    </button>
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
                    <div className="attribute-matrix-body">
                        <div className="attribute-matrix-toolbar">
                            <div className="attribute-matrix-toolbar__filters">
                                <DomainCombobox
                                    value={domainFilter}
                                    onChange={setDomainFilter}
                                    domains={allDomains}
                                    placeholder="Все домены"
                                />

                                <label className="entity-matrix-filter">
                                    <span>Минимум упоминаний:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={minOccurrences}
                                        onChange={(e) =>
                                            setMinOccurrences(Math.max(1, parseInt(e.target.value, 10) || 1))
                                        }
                                        style={{ width: 60 }}
                                    />
                                </label>

                                <label className="entity-graph-toggle">
                                    <input
                                        type="checkbox"
                                        checked={onlyInconsistent}
                                        onChange={() => setOnlyInconsistent(!onlyInconsistent)}
                                    />
                                    Только с разными типами
                                    {matrix.stats.inconsistentTypes.length > 0 && (
                                        <span className="attribute-matrix-badge">
                                            {matrix.stats.inconsistentTypes.length}
                                        </span>
                                    )}
                                </label>
                            </div>

                            <div className="attribute-matrix-toolbar__stats">
                                {matrix.stats.singletons.length > 0 && (
                                    <span className="attribute-matrix-hint">
                                        Одиночных атрибутов: {matrix.stats.singletons.length}
                                    </span>
                                )}
                            </div>
                        </div>

                        {visibleColumns.length === 0 ? (
                            <div className="entity-matrix-empty">
                                Нет атрибутов, удовлетворяющих фильтрам
                            </div>
                        ) : (
                            <div className="attribute-matrix-scroll">
                                <table className="attribute-matrix-table">
                                    <thead>
                                        <tr>
                                            <th className="attribute-matrix-corner">Сущность</th>
                                            {visibleColumns.map((col) => (
                                                <th
                                                    key={col.key}
                                                    className={
                                                        'attribute-matrix-col-head' +
                                                        (!col.consistentType ? ' inconsistent' : '')
                                                    }
                                                    title={
                                                        col.dataTypes.join(', ') +
                                                        '\nвстречается у ' + col.count + ' сущностей'
                                                    }
                                                >
                                                    <span className="attribute-matrix-col-head__text">
                                                        {col.label}
                                                    </span>
                                                    {!col.consistentType && (
                                                        <span className="attribute-matrix-col-head__warn">⚠</span>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matrix.rows.map((row) => (
                                            <tr key={row.entityFqid}>
                                                <th
                                                    className="attribute-matrix-row-head"
                                                    title={row.entityFqid}
                                                    onClick={() => openEntity(row.entityFqid)}
                                                >
                                                    <span className="attribute-matrix-row-head__id">
                                                        {row.entityId}
                                                    </span>
                                                    <span className="attribute-matrix-row-head__domain">
                                                        {row.domainId}
                                                    </span>
                                                </th>
                                                {visibleColumns.map((col) => {
                                                    const has = row.present.has(col.key);
                                                    return (
                                                        <td
                                                            key={col.key}
                                                            className={
                                                                'attribute-matrix-cell' +
                                                                (has ? ' present' : '')
                                                            }
                                                            title={has ? `есть ${col.label}` : ''}
                                                        >
                                                            {has && <span className="attribute-matrix-cell__dot" />}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
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