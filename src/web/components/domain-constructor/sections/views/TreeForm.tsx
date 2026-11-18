import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ViewSelect } from '../../ui/ViewSelect';
import { EntitySelect } from '../../ui/EntitySelect';
import type { ViewSchema } from '../../types';
import { updateViewField } from './views-handlers';
import { TableColumnRow } from './TableColumnRow';
import {
    addTreeColumn, addTreeFilterEntity, removeTreeFilterEntity,
    updateTreeFilterAttributesType, addTreeFilterAttribute, removeTreeFilterAttribute,
    updateTreeFilterAttribute, updateTreeFilterLinkagesType,
    addTreeFilterLinkage, removeTreeFilterLinkage, updateTreeFilterLinkage,
    addTreeSortingColumn, removeTreeSortingColumn, updateTreeSortingColumn,
    updateTreeDefaultSorting,
    removeTreeColumn,
} from './treeView-handlers';
import { LinkageSelect } from '../../ui/LinkageSelect';

interface Props { view: ViewSchema }
type Tab = 'main' | 'table' | 'filter' | 'sorting';

export const TreeForm: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const [tab, setTab] = useState<Tab>('main');

    const v = view as any;
    const variant = v.variant ?? 'merged';

    return (
        <div>
            <div className="dc-detail__tabs" role="tablist">
                {[
                    { key: 'main', label: 'Основное' },
                    { key: 'table', label: `Таблица (${(v.table?.columns ?? []).length})` },
                    { key: 'filter', label: `Фильтр (${(v.table?.filter ?? []).length})` },
                    { key: 'sorting', label: `Сортировка (${(v.table?.sortingBy?.columns ?? []).length})` },
                ].map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={'dc-detail__tab' + (tab === t.key ? ' dc-detail__tab--active' : '')}
                        onClick={() => setTab(t.key as Tab)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ paddingTop: 16 }}>
                {tab === 'main' && <MainTab view={view} />}
                {tab === 'table' && <TableTab view={view} />}
                {tab === 'filter' && <FilterTab view={view} />}
                {tab === 'sorting' && <SortingTab view={view} />}
            </div>
        </div>
    );
};

// ============ Main ============

const MainTab: FC<{ view: ViewSchema }> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const v = view as any;
    const variant = v.variant ?? 'merged';

    return (
        <>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={view.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Лейбл</label>
                    <input
                        className="dc-input"
                        value={view.label ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateViewField(doc, view.id, 'label', e.target.value || undefined))
                        }
                    />
                </div>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Дерево</label>
                    <input
                        className="dc-input"
                        value={v.tree ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateViewField(doc, view.id, 'tree', e.target.value))
                        }
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">variant</label>
                    <select
                        className="dc-input"
                        value={variant}
                        onChange={(e) =>
                            commit((doc) => updateViewField(doc, view.id, 'variant', e.target.value))
                        }
                    >
                        <option value="merged">merged (дерево + список)</option>
                        <option value="splitted">splitted (каталог)</option>
                    </select>
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">nodeChunkSize (≤ 100)</label>
                <input
                    className="dc-input"
                    type="number"
                    value={v.nodeChunkSize ?? ''}
                    onChange={(e) =>
                        commit((doc) =>
                            updateViewField(doc, view.id, 'nodeChunkSize',
                                e.target.value === '' ? undefined : Number(e.target.value)),
                        )
                    }
                />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!v.ordering}
                        onChange={(e) =>
                            commit((doc) => updateViewField(doc, view.id, 'ordering', e.target.checked))
                        }
                    />{' '}
                    Разрешить менять расположение узлов (только для type: orderable)
                </label>
            </div>

            {variant === 'splitted' && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Каталог (splitted)</h4>
                    <div className="dc-field">
                        <label className="dc-field__label">list (View ID Ref)</label>
                        <ViewSelect
                            value={v.list ?? null}
                            onChange={(val) =>
                                commit((doc) => updateViewField(doc, view.id, 'list', val || undefined))
                            }
                            filterType="list"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">catalogTitle</label>
                        <input
                            className="dc-input"
                            value={v.catalogTitle ?? ''}
                            onChange={(e) =>
                                commit((doc) => updateViewField(doc, view.id, 'catalogTitle', e.target.value || undefined))
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">rootText</label>
                        <input
                            className="dc-input"
                            value={v.rootText ?? ''}
                            onChange={(e) =>
                                commit((doc) => updateViewField(doc, view.id, 'rootText', e.target.value || undefined))
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">
                            <input
                                type="checkbox"
                                className="dc-checkbox"
                                checked={!!v.showLeaf}
                                onChange={(e) =>
                                    commit((doc) => updateViewField(doc, view.id, 'showLeaf', e.target.checked))
                                }
                            />{' '}
                            Показывать листовые объекты
                        </label>
                    </div>
                </>
            )}
        </>
    );
};

// ============ Table ============

const TableTab: FC<{ view: ViewSchema }> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const columns = ((view as any).table?.columns ?? []) as any[];

    return (
        <>
            <div className="dc-constraints__header">
                <span className="dc-muted">Колонки таблицы ({columns.length})</span>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addTreeColumn(doc, view.id))}
                >+ Столбец</button>
            </div>

            {columns.map((c: any, i: number) => (
                <TableColumnRow
                    key={i}
                    viewId={view.id}
                    column={c}
                    index={i}
                    onRemove={() => commit((doc) => removeTreeColumn(doc, view.id, i))}
                />
            ))}
        </>
    );
};

// ============ Filter ============

const FilterTab: FC<{ view: ViewSchema }> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const tree = schema.trees.find((t) => t.id === (view as any).tree);
    const rootEntity = tree?.hierarchy?.entity;

    const filters = ((view as any).table?.filter ?? []) as any[];

    return (
        <>
            <div className="dc-field__hint">
                Фильтр задаётся отдельно для каждой сущности дерева. Если для сущности фильтр не задан — используются все атрибуты/связи.
            </div>

            <div className="dc-constraints__header" style={{ marginTop: 8 }}>
                <span className="dc-muted">Сущности ({filters.length})</span>
                <EntitySelectForFilter onAdd={(fqid) => commit((doc) => addTreeFilterEntity(doc, view.id, fqid))} />
            </div>

            {filters.map((f: any, i: number) => (
                <TreeEntityFilter
                    key={i}
                    viewId={view.id}
                    entityFqid={f.entity}
                    filter={f}
                    index={i}
                    onRemove={() => commit((doc) => removeTreeFilterEntity(doc, view.id, i))}
                />
            ))}
        </>
    );
};

const EntitySelectForFilter: FC<{ onAdd: (entityRef: string) => void }> = ({ onAdd }) => {
    const [val, setVal] = useState<string | null>(null);

    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', minWidth: 280 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
                <EntitySelect
                    value={val}
                    onChange={setVal}
                    placeholder="+ сущность"
                />
            </div>
            <button
                className="dc-btn dc-btn--primary"
                disabled={!val}
                onClick={() => {
                    onAdd(val!);
                    setVal(null);
                }}
                title="Добавить фильтр для сущности"
            >+</button>
        </div>
    );
};

const TreeEntityFilter: FC<{
    viewId: string; entityFqid: string; filter: any; index: number; onRemove: () => void;
}> = ({ viewId, entityFqid, filter, index, onRemove }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const attrs = filter.attributes ?? {};
    const linkages = filter.linkages ?? {};

    const slash = entityFqid.lastIndexOf('/');
    const localId = slash < 0 ? entityFqid : entityFqid.slice(slash + 1);
    const entityObj = schema.entities.find((e) => e.id === localId);

    return (
        <div className="dc-constraint">
            <div className="dc-constraint__header">
                <code className="dc-code">{entityFqid}</code>
                <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={onRemove}>×</button>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`tf-attr-${viewId}-${index}`}
                        checked={(attrs.type ?? 'all') === 'all'}
                        onChange={() =>
                            commit((doc) => updateTreeFilterAttributesType(doc, viewId, index, 'all'))
                        }
                    />{' '}
                    Все атрибуты
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`tf-attr-${viewId}-${index}`}
                        checked={attrs.type === 'specific'}
                        onChange={() =>
                            commit((doc) => updateTreeFilterAttributesType(doc, viewId, index, 'specific'))
                        }
                    />{' '}
                    Только указанные
                </label>
            </div>

            {attrs.type === 'specific' && (
                <>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addTreeFilterAttribute(doc, viewId, index))}
                    >+ атрибут</button>
                    {(attrs.use ?? []).map((u: any, j: number) => (
                        <div key={j} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <select
                                className="dc-input dc-input--compact"
                                value={u.attribute ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateTreeFilterAttribute(doc, viewId, index, j, e.target.value))
                                }
                            >
                                <option value="">—</option>
                                {entityObj?.attributes?.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                ))}
                            </select>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeTreeFilterAttribute(doc, viewId, index, j))}
                            >×</button>
                        </div>
                    ))}
                </>
            )}

            <div className="dc-field" style={{ marginTop: 8 }}>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`tf-link-${viewId}-${index}`}
                        checked={(linkages.type ?? 'all') === 'all'}
                        onChange={() => commit((doc) => updateTreeFilterLinkagesType(doc, viewId, index, 'all'))}
                    />{' '}
                    Все связи
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`tf-link-${viewId}-${index}`}
                        checked={linkages.type === 'specific'}
                        onChange={() => commit((doc) => updateTreeFilterLinkagesType(doc, viewId, index, 'specific'))}
                    />{' '}
                    Только указанные
                </label>
            </div>

            {linkages.type === 'specific' && (
                <>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addTreeFilterLinkage(doc, viewId, index))}
                    >+ связь</button>
                    {(linkages.use ?? []).map((u: any, j: number) => (
                        <div key={j} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <LinkageSelect
                                value={u.linkage || null}
                                onChange={(val) =>
                                    commit((doc) => updateTreeFilterLinkage(doc, viewId, index, j, val ?? ''))
                                }
                            />
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeTreeFilterLinkage(doc, viewId, index, j))}
                            >×</button>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};

// ============ Sorting ============

const SortingTab: FC<{ view: ViewSchema }> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const tree = schema.trees.find((t) => t.id === (view as any).tree);
    const treeSortings = ((tree as any)?.sorting ?? []) as any[];

    const sortingBy = ((view as any).table?.sortingBy ?? {}) as any;
    const columns = sortingBy.columns ?? [];
    const defaults = sortingBy.defaults ?? {};
    const tableColumns = ((view as any).table?.columns ?? []) as any[];

    return (
        <>
            <div className="dc-constraints__header">
                <span className="dc-muted">Колонка → правило сортировки дерева</span>
                <button
                    className="dc-btn dc-btn--dashed"
                    onClick={() => commit((doc) => addTreeSortingColumn(doc, view.id))}
                >+ правило</button>
            </div>

            {columns.length === 0 && <div className="dc-muted dc-constraints__empty">Нет правил</div>}

            {columns.map((c: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeTreeSortingColumn(doc, view.id, i))}
                        >×</button>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Колонка</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={c.column ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateTreeSortingColumn(doc, view.id, i, 'column', e.target.value))
                                }
                            >
                                <option value="">—</option>
                                {tableColumns.map((col: any) => (
                                    <option key={col.id} value={col.id}>{col.id}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">sorting (из trees[].sorting)</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={c.sorting ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateTreeSortingColumn(doc, view.id, i, 'sorting', e.target.value))
                                }
                            >
                                <option value="">—</option>
                                {treeSortings.map((s) => (
                                    <option key={s.id} value={s.id}>{s.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            ))}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>По умолчанию</h4>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Колонка</label>
                    <select
                        className="dc-input"
                        value={defaults.column ?? ''}
                        onChange={(e) =>
                            commit((doc) =>
                                updateTreeDefaultSorting(doc, view.id, e.target.value || undefined, defaults.direction),
                            )
                        }
                    >
                        <option value="">—</option>
                        {tableColumns.map((col: any) => (
                            <option key={col.id} value={col.id}>{col.id}</option>
                        ))}
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Направление</label>
                    <select
                        className="dc-input"
                        value={defaults.direction ?? 'asc'}
                        disabled={!defaults.column}
                        onChange={(e) =>
                            commit((doc) =>
                                updateTreeDefaultSorting(doc, view.id, defaults.column, e.target.value as any),
                            )
                        }
                    >
                        <option value="asc">По возрастанию</option>
                        <option value="desc">По убыванию</option>
                    </select>
                </div>
            </div>
        </>
    );
};