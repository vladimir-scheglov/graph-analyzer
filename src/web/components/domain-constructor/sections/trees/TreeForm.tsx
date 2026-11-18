import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import type { TreeSchema } from '../../types';
import {
    updateTreeField, updateHierarchyField,
    addHierarchyChild, removeHierarchyChild, updateHierarchyChildField,
    addTreeSorting, removeTreeSorting,
} from './trees-handlers';
import { LinkageSelect } from '../../ui/LinkageSelect';

interface Props { tree: TreeSchema }

export const TreeForm: FC<Props> = ({ tree }) => {
    const commit = useEditorStore((s) => s.commit);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateTreeField(doc, tree.id, field, value));

    const hierarchy = tree.hierarchy ?? { entity: '', children: [] };
    const sorting = (tree as any).sorting ?? [];

    return (
        <div className="dc-detail">
            <div className="dc-detail__header">
                <div className="dc-detail__title-block">
                    <h2 className="dc-detail__title">{tree.name || tree.id}</h2>
                    <div className="dc-detail__subtitle">ID: {tree.id}</div>
                </div>
            </div>

            <div className="dc-detail__body">
                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">ID</label>
                        <input className="dc-input" value={tree.id} disabled />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={tree.name ?? ''}
                            onChange={(e) => set('name', e.target.value || undefined)}
                        />
                    </div>
                </div>

                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип</label>
                        <select
                            className="dc-input"
                            value={tree.type}
                            onChange={(e) => set('type', e.target.value)}
                        >
                            <option value="ordinary">ordinary</option>
                            <option value="orderable">orderable</option>
                            <option value="multiparent">multiparent</option>
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">maxDepth</label>
                        <input
                            className="dc-input"
                            type="number"
                            value={tree.maxDepth ?? ''}
                            onChange={(e) =>
                                set('maxDepth', e.target.value === '' ? undefined : Number(e.target.value))
                            }
                        />
                    </div>
                </div>

                <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Иерархия</h4>

                <div className="dc-field">
                    <label className="dc-field__label">Корневая сущность</label>
                    <EntitySelect
                        value={hierarchy.entity || null}
                        onChange={(v) =>
                            commit((doc) => updateHierarchyField(doc, tree.id, 'entity', v ?? ''))
                        }
                    />
                </div>

                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">maxInstances</label>
                        <input
                            className="dc-input"
                            type="number"
                            value={(hierarchy as any).maxInstances ?? ''}
                            onChange={(e) =>
                                commit((doc) =>
                                    updateHierarchyField(
                                        doc, tree.id, 'maxInstances',
                                        e.target.value === '' ? undefined : Number(e.target.value),
                                    ),
                                )
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">maxChildren</label>
                        <input
                            className="dc-input"
                            type="number"
                            value={(hierarchy as any).maxChildren ?? ''}
                            onChange={(e) =>
                                commit((doc) =>
                                    updateHierarchyField(
                                        doc, tree.id, 'maxChildren',
                                        e.target.value === '' ? undefined : Number(e.target.value),
                                    ),
                                )
                            }
                        />
                    </div>
                </div>

                <ChildrenTree
                    treeId={tree.id}
                    children={(hierarchy as any).children ?? []}
                    parentPath={['hierarchy', 'children']}
                />

                <button
                    className="dc-btn dc-btn--dashed"
                    style={{ marginTop: 8 }}
                    onClick={() => commit((doc) => addHierarchyChild(doc, tree.id, null))}
                >+ дочерний узел</button>

                <h4 className="dc-constraints__title" style={{ marginTop: 24 }}>
                    Правила сортировки ({sorting.length})
                </h4>

                <div className="dc-constraints__header">
                    <span className="dc-muted">Сортировка по сущностям внутри дерева</span>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addTreeSorting(doc, tree.id))}
                    >+ правило</button>
                </div>

                {sorting.map((s: any, i: number) => (
                    <div key={i} className="dc-constraint">
                        <div className="dc-constraint__header">
                            <code className="dc-code">{s.id}</code>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeTreeSorting(doc, tree.id, i))}
                            >×</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ============ recursive children ============

const ChildrenTree: FC<{
    treeId: string;
    children: any[];
    parentPath: readonly (string | number)[];
}> = ({ treeId, children, parentPath }) => {
    const commit = useEditorStore((s) => s.commit);

    if (children.length === 0) return null;

    return (
        <div style={{ marginLeft: 16, marginTop: 8 }}>
            {children.map((c: any, i: number) => {
                const path = [...parentPath, i];
                return (
                    <div key={i} className="dc-join-node">
                        <div className="dc-join-node__header">
                            <span className="dc-constraint__kind">#{i + 1}</span>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeHierarchyChild(doc, treeId, path))}
                            >×</button>
                        </div>

                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">linkage</label>
                                <LinkageSelect
                                    value={c.linkage ?? null}
                                    onChange={(v) =>
                                        commit((doc) => updateHierarchyChildField(doc, treeId, path, 'linkage', v ?? ''))
                                    }
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">entity</label>
                                <EntitySelect
                                    value={c.entity || null}
                                    onChange={(v) =>
                                        commit((doc) => updateHierarchyChildField(doc, treeId, path, 'entity', v ?? ''))
                                    }
                                />
                            </div>
                        </div>

                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">maxInstances</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    type="number"
                                    value={c.maxInstances ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateHierarchyChildField(doc, treeId, path, 'maxInstances',
                                                e.target.value === '' ? undefined : Number(e.target.value)),
                                        )
                                    }
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">maxChildren</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    type="number"
                                    value={c.maxChildren ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateHierarchyChildField(doc, treeId, path, 'maxChildren',
                                                e.target.value === '' ? undefined : Number(e.target.value)),
                                        )
                                    }
                                />
                            </div>
                        </div>

                        <ChildrenTree
                            treeId={treeId}
                            children={c.children ?? []}
                            parentPath={[...path, 'children']}
                        />

                        <button
                            className="dc-btn dc-btn--dashed"
                            style={{ marginTop: 6, fontSize: '0.85em' }}
                            onClick={() => commit((doc) => addHierarchyChild(doc, treeId, path))}
                        >+ дочерний</button>
                    </div>
                );
            })}
        </div>
    );
};