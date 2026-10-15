import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { buildEntityIndex } from '../../lib/entities';
import { buildEntityTree } from '../../lib/entities/tree';
import { entityKey } from '../../lib/entities';
import { EntityHierarchyGraph } from './EntityHierarchyGraph';

export interface EntityHierarchyModalProps {
    entities: any[];
}

export function EntityHierarchyModal({ entities }: EntityHierarchyModalProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();

    const [query, setQuery] = useState('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);

    const open = store.entityHierarchyOpen;
    const initialKey = store.entityHierarchyInitialKey;

    const index = useMemo(() => buildEntityIndex(entities), [entities]);

    useEffect(() => {
        if (open && initialKey) {
            setSelectedKey(initialKey);
            setHistory([]);
            setQuery('');
        }
    }, [open, initialKey]);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setSelectedKey(null);
            setHistory([]);
        }
    }, [open]);

    const handleBack = useCallback(() => {
        setHistory((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setSelectedKey(last);
            return prev.slice(0, -1);
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (history.length > 0) handleBack();
                else store.setEntityHierarchyOpen(false);
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open, history, handleBack, store]);

    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const results: any[] = [];
        entities.forEach((e) => {
            const idMatch = e.entityId.toLowerCase().indexOf(q) !== -1;
            const nameMatch = e.name && e.name.toLowerCase().indexOf(q) !== -1;
            if (!idMatch && !nameMatch) return;
            const key = entityKey(e.domainId, e.entityId);
            const hasParents = !!e.inherits;
            const hasChildren = (index.children.get(key) || []).length > 0;
            results.push({
                entity: e,
                key,
                hasParents,
                hasChildren,
                isOrphan: !hasParents && !hasChildren,
                rank: idMatch && e.entityId.toLowerCase().indexOf(q) === 0 ? 0 : idMatch ? 1 : 2
            });
        });
        return results.sort((a, b) => a.rank - b.rank).slice(0, 200);
    }, [query, entities, index]);

    const tree = useMemo(() => {
        if (!selectedKey) return null;
        return buildEntityTree(selectedKey, index);
    }, [selectedKey, index]);

    const handleSelect = useCallback(
        (node: any) => {
            if (!node || node.missing) return;
            if (node.key === selectedKey) return;
            setHistory((prev) => (selectedKey ? prev.concat([selectedKey]) : prev));
            setSelectedKey(node.key);
        },
        [selectedKey]
    );

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setEntityHierarchyOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">🧬 Иерархия наследования сущностей</div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setEntityHierarchyOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="entity-hierarchy-body">
                    <div className="entity-search-panel">
                        <div className="entity-search-input-wrap">
                            <span className="entity-search-icon">🔍</span>
                            <input
                                className="entity-search-input"
                                type="text"
                                placeholder="Поиск по id или названию..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <div className="entity-search-results">
                            {query.trim() === '' ? (
                                <div className="entity-search-hint">
                                    Всего сущностей: {entities.length}
                                    <br />
                                    <span style={{ fontSize: 11 }}>Начните вводить для поиска</span>
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="entity-search-hint">Ничего не найдено</div>
                            ) : (
                                searchResults.map((r) => (
                                    <div
                                        key={r.key}
                                        className={
                                            'entity-search-item' +
                                            (r.key === selectedKey ? ' entity-search-item--active' : '') +
                                            (r.isOrphan ? ' entity-search-item--orphan' : '')
                                        }
                                        onClick={() => {
                                            setHistory((prev) =>
                                                selectedKey ? prev.concat([selectedKey]) : prev
                                            );
                                            setSelectedKey(r.key);
                                        }}
                                    >
                                        <div className="entity-search-item__id">{r.entity.entityId}</div>
                                        {r.entity.name && r.entity.name !== r.entity.entityId && (
                                            <div className="entity-search-item__name">{r.entity.name}</div>
                                        )}
                                        <div className="entity-search-item__meta">
                                            <span className="entity-search-item__domain">
                                                {r.entity.domainId}
                                            </span>
                                            {r.isOrphan ? (
                                                <span className="entity-search-item__badge">без иерархии</span>
                                            ) : (
                                                <span className="entity-search-item__badge entity-search-item__badge--ok">
                                                    {(r.hasParents ? '↑' : '·') + (r.hasChildren ? '↓' : '·')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="entity-graph-panel">
                        {history.length > 0 && (
                            <button
                                className="entity-graph-back"
                                onClick={handleBack}
                                title="Назад"
                            >
                                ← Назад
                            </button>
                        )}

                        {!selectedKey ? (
                            <div className="entity-graph-empty">
                                <div className="entity-graph-empty__icon">🧬</div>
                                <div className="entity-graph-empty__title">Выберите сущность слева</div>
                                <div className="entity-graph-empty__hint">
                                    Родители будут сверху, наследники снизу
                                </div>
                            </div>
                        ) : tree ? (
                            <EntityHierarchyGraph
                                tree={tree}
                                onSelect={handleSelect}
                                onGotoDomain={goto}
                            />
                        ) : null}
                    </div>
                </div>

                {tree && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat">🧬 {tree.nodes.length} в графе</span>
                            <span className="validation-stat validation-stat--ok">
                                ↑ {tree.parentKeys.size} родителей
                            </span>
                            <span className="validation-stat validation-stat--warn">
                                ↓ {tree.childKeys.size} наследников
                            </span>
                            {tree.cycleNodes.size > 0 && (
                                <span className="validation-stat validation-stat--err">⚠️ цикл</span>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            <button
                                className="btn"
                                onClick={() => store.setEntityHierarchyOpen(false)}
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}