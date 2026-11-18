import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ViewSelect } from '../../ui/ViewSelect';
import { EntitySelect } from '../../ui/EntitySelect';
import type { ViewSchema } from '../../types';
import { updateViewField } from './views-handlers';
import { WidgetsTab } from '../widgets/WidgetsTab';
import {
    addTreeItem, removeTreeItem, updateTreeItemField,
} from './dashboardTree-handlers';

interface Props { view: ViewSchema }

export const DashboardForm: FC<Props> = ({ view }) => {
    if (view.type === 'dashboard') return <DashboardBasic view={view} />;
    if (view.type === 'dashboard_tree') return <DashboardTree view={view} />;
    return null;
};

// ============ Dashboard ============

type DTab = 'main' | 'widgets';
const DashboardBasic: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const [tab, setTab] = useState<DTab>('main');

    const v = view as any;
    const layout = v.layout ?? {};
    const widgets = v.widgets ?? [];

    return (
        <div>
            <div className="dc-detail__tabs" role="tablist">
                {[
                    { key: 'main', label: 'Основное' },
                    { key: 'widgets', label: `Виджеты (${widgets.length})` },
                ].map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={'dc-detail__tab' + (tab === t.key ? ' dc-detail__tab--active' : '')}
                        onClick={() => setTab(t.key as DTab)}
                    >{t.label}</button>
                ))}
            </div>

            <div style={{ paddingTop: 16 }}>
                {tab === 'main' && (
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
                                <label className="dc-field__label">layout.type</label>
                                <select
                                    className="dc-input"
                                    value={layout.type ?? 'grid'}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateViewField(doc, view.id, 'layout', { ...layout, type: e.target.value }),
                                        )
                                    }
                                >
                                    <option value="grid">grid</option>
                                </select>
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">layout.columns</label>
                                <input
                                    className="dc-input"
                                    type="number"
                                    value={layout.columns ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateViewField(doc, view.id, 'layout', {
                                                ...layout,
                                                columns: e.target.value === '' ? undefined : Number(e.target.value),
                                            }),
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </>
                )}
                {tab === 'widgets' && (
                    <div style={{ marginTop: 8 }}>
                        <WidgetsTab view={view} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ============ Dashboard-tree ============

type TTab = 'main' | 'tree';
const DashboardTree: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const [tab, setTab] = useState<TTab>('main');

    const v = view as any;
    const tree = v.tree ?? [];

    return (
        <div>
            <div className="dc-detail__tabs" role="tablist">
                {[
                    { key: 'main', label: 'Основное' },
                    { key: 'tree', label: `Структура (${tree.length})` },
                ].map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={'dc-detail__tab' + (tab === t.key ? ' dc-detail__tab--active' : '')}
                        onClick={() => setTab(t.key as TTab)}
                    >{t.label}</button>
                ))}
            </div>

            <div style={{ paddingTop: 16 }}>
                {tab === 'main' && (
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
                        <div className="dc-field">
                            <label className="dc-field__label">defaultItem (dashboard-view)</label>
                            <ViewSelect
                                value={v.defaultItem ?? null}
                                onChange={(val) =>
                                    commit((doc) => updateViewField(doc, view.id, 'defaultItem', val || undefined))
                                }
                                filterType="dashboard"
                            />
                        </div>
                    </>
                )}

                {tab === 'tree' && (
                    <>
                        <div className="dc-field__hint">
                            Дерево навигации. Каждый узел ссылается на dashboard или list-view; можно
                            указать autoTree.entity для автоматического построения дерева наследников.
                        </div>
                        <div className="dc-constraints__header" style={{ marginTop: 8 }}>
                            <span className="dc-muted">Корневые элементы ({tree.length})</span>
                            <button
                                className="dc-btn dc-btn--primary"
                                onClick={() => commit((doc) => addTreeItem(doc, view.id, null))}
                            >+ корневой</button>
                        </div>

                        <TreeNodeList
                            viewId={view.id}
                            nodes={tree}
                            basePath={['tree']}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

const TreeNodeList: FC<{
    viewId: string;
    nodes: any[];
    basePath: readonly (string | number)[];
}> = ({ viewId, nodes, basePath }) => {
    const commit = useEditorStore((s) => s.commit);

    return (
        <>
            {nodes.map((node: any, i: number) => {
                const path = [...basePath, i];
                return (
                    <div key={i} className="dc-join-node" style={{ marginBottom: 8 }}>
                        <div className="dc-join-node__header">
                            <span className="dc-constraint__kind">#{i + 1}</span>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeTreeItem(doc, viewId, path))}
                            >×</button>
                        </div>

                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">view (dashboard / list)</label>
                                <ViewSelect
                                    value={node.view ?? null}
                                    onChange={(val) =>
                                        commit((doc) =>
                                            updateTreeItemField(doc, viewId, path, 'view', val || undefined),
                                        )
                                    }
                                    filterType={['dashboard', 'list']}
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">label</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={node.label ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateTreeItemField(doc, viewId, path, 'label', e.target.value || undefined),
                                        )
                                    }
                                />
                            </div>
                        </div>

                        <div className="dc-field">
                            <label className="dc-field__label">autoTree.entity (авто-наследники)</label>
                            <EntitySelect
                                value={node.autoTree?.entity ?? null}
                                onChange={(val) =>
                                    commit((doc) =>
                                        updateTreeItemField(doc, viewId, path, 'autoTree',
                                            val ? { entity: val } : undefined),
                                    )
                                }
                            />
                        </div>

                        {node.children && node.children.length > 0 && (
                            <TreeNodeList
                                viewId={viewId}
                                nodes={node.children}
                                basePath={[...path, 'children']}
                            />
                        )}

                        <button
                            className="dc-btn dc-btn--dashed"
                            style={{ marginTop: 6, fontSize: '0.85em' }}
                            onClick={() => commit((doc) => addTreeItem(doc, viewId, path))}
                        >+ дочерний</button>
                    </div>
                );
            })}
        </>
    );
};