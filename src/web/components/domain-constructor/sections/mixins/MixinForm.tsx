import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import { LinkageSelect } from '../../ui/LinkageSelect';
import type { MixinSchema } from '../../types';
import {
    updateMixinField, updateMixinEntity,
    addMixinView, removeMixinView,
    updateMixinViewField,
} from './mixins-handlers';

import {
    setMixinViewType, setFromView,
    addChangeAddArrayItem, removeChangeAddArrayItem, updateChangeAddArrayItem,
    setChangeAddScalar, setChangeAddPosition,
    addChangeDeleteItem, removeChangeDeleteItem, updateChangeDeleteItem,
    setReplaceScalar,
} from './mixins-handlers';

const MixinViewEditor: FC<{
    mixinId: string;
    viewIdx: number;
    view: any;
    onRemove: () => void;
}> = ({ mixinId, viewIdx, view, onRemove }) => {
    const commit = useEditorStore((s) => s.commit);
    const type = view.type as 'panel' | 'tab' | 'form' | 'list' | 'page';
    const add = view.change?.add ?? {};
    const del = view.change?.delete ?? {};
    const replace = view.replace ?? {};

    return (
        <div className="dc-constraint">
            <div className="dc-constraint__header">
                <code className="dc-code">{view.id}</code>
                <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={onRemove}>×</button>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">type</label>
                    <select
                        className="dc-input dc-input--compact"
                        value={type}
                        onChange={(e) =>
                            commit((doc) =>
                                setMixinViewType(doc, mixinId, viewIdx, e.target.value as any),
                            )
                        }
                    >
                        <option value="panel">panel</option>
                        <option value="tab">tab</option>
                        <option value="form">form</option>
                        <option value="list">list</option>
                        <option value="page">page</option>
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">to.{type}</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={view.to?.[type] ?? ''}
                        onChange={(e) =>
                            commit((doc) =>
                                updateMixinViewField(doc, mixinId, viewIdx, ['to', type], e.target.value),
                            )
                        }
                    />
                </div>
            </div>

            {/* fromView — для type: view */}
            <div className="dc-field">
                <label className="dc-field__label">fromView (для type: view)</label>
                <input
                    className="dc-input dc-input--compact"
                    value={view.fromView ?? ''}
                    onChange={(e) =>
                        commit((doc) => setFromView(doc, mixinId, viewIdx, e.target.value))
                    }
                    placeholder="id исходного view"
                />
            </div>

            {/* ============ change.add ============ */}
            <h5 style={{ margin: '12px 0 8px', color: 'var(--text-300)' }}>change.add</h5>

            {type === 'panel' && (
                <>
                    <RefsEditor
                        title="tabs"
                        items={add.tabs ?? []}
                        refField="tab"
                        onAdd={() =>
                            commit((doc) =>
                                addChangeAddArrayItem(doc, mixinId, viewIdx, 'tabs', { tab: '' }),
                            )
                        }
                        onRemove={(i) =>
                            commit((doc) => removeChangeAddArrayItem(doc, mixinId, viewIdx, 'tabs', i))
                        }
                        onChange={(i, field, value) =>
                            commit((doc) =>
                                updateChangeAddArrayItem(doc, mixinId, viewIdx, 'tabs', i, field, value),
                            )
                        }
                        extraFields={[{ name: 'label', label: 'label' }]}
                    />
                    <RefsEditor
                        title="menu"
                        items={add.menu ?? []}
                        refField="action"
                        onAdd={() =>
                            commit((doc) =>
                                addChangeAddArrayItem(doc, mixinId, viewIdx, 'menu', { action: '' }),
                            )
                        }
                        onRemove={(i) =>
                            commit((doc) => removeChangeAddArrayItem(doc, mixinId, viewIdx, 'menu', i))
                        }
                        onChange={(i, field, value) =>
                            commit((doc) =>
                                updateChangeAddArrayItem(doc, mixinId, viewIdx, 'menu', i, field, value),
                            )
                        }
                        extraFields={[{ name: 'label', label: 'label' }]}
                    />
                </>
            )}

            {type === 'tab' && (
                <RefsEditor
                    title="components"
                    items={add.components ?? []}
                    refField="widget"
                    onAdd={() =>
                        commit((doc) =>
                            addChangeAddArrayItem(doc, mixinId, viewIdx, 'components', { widget: '' }),
                        )
                    }
                    onRemove={(i) =>
                        commit((doc) => removeChangeAddArrayItem(doc, mixinId, viewIdx, 'components', i))
                    }
                    onChange={(i, field, value) =>
                        commit((doc) =>
                            updateChangeAddArrayItem(doc, mixinId, viewIdx, 'components', i, field, value),
                        )
                    }
                />
            )}

            {type === 'form' && (
                <div className="dc-field">
                    <label className="dc-field__label">form (блок для добавления)</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={add.form ?? ''}
                        onChange={(e) =>
                            commit((doc) => setChangeAddScalar(doc, mixinId, viewIdx, 'form', e.target.value))
                        }
                    />
                </div>
            )}

            {type === 'list' && (
                <div className="dc-field">
                    <label className="dc-field__label">list (список-источник для add)</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={add.list ?? ''}
                        onChange={(e) =>
                            commit((doc) => setChangeAddScalar(doc, mixinId, viewIdx, 'list', e.target.value))
                        }
                    />
                </div>
            )}

            {type === 'page' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">block (для add)</label>
                        <input
                            className="dc-input dc-input--compact"
                            value={add.block ?? ''}
                            onChange={(e) =>
                                commit((doc) => setChangeAddScalar(doc, mixinId, viewIdx, 'block', e.target.value))
                            }
                        />
                    </div>
                    <RefsEditor
                        title="actionPanel"
                        items={add.actionPanel ?? []}
                        refField="widget"
                        onAdd={() =>
                            commit((doc) =>
                                addChangeAddArrayItem(doc, mixinId, viewIdx, 'actionPanel', { widget: '' }),
                            )
                        }
                        onRemove={(i) =>
                            commit((doc) => removeChangeAddArrayItem(doc, mixinId, viewIdx, 'actionPanel', i))
                        }
                        onChange={(i, field, value) =>
                            commit((doc) =>
                                updateChangeAddArrayItem(doc, mixinId, viewIdx, 'actionPanel', i, field, value),
                            )
                        }
                        extraFields={[{ name: 'label', label: 'label' }]}
                    />
                </>
            )}

            <div className="dc-field">
                <label className="dc-field__label">position</label>
                <select
                    className="dc-input dc-input--compact"
                    value={add.position?.type ?? ''}
                    onChange={(e) => {
                        const type2 = e.target.value;
                        if (!type2) {
                            commit((doc) => setChangeAddPosition(doc, mixinId, viewIdx, undefined));
                        } else {
                            commit((doc) =>
                                setChangeAddPosition(doc, mixinId, viewIdx, { type: type2 }),
                            );
                        }
                    }}
                >
                    <option value="">— не задано —</option>
                    <option value="begin">begin</option>
                    <option value="after">after</option>
                    <option value="end">end</option>
                </select>
            </div>

            {/* ============ change.delete ============ */}
            <h5 style={{ margin: '12px 0 8px', color: 'var(--text-300)' }}>change.delete</h5>

            {type === 'panel' && (
                <>
                    <RefsEditor
                        title="delete.tabs"
                        items={del.tabs ?? []}
                        refField="tab"
                        onAdd={() =>
                            commit((doc) =>
                                addChangeDeleteItem(doc, mixinId, viewIdx, 'tabs', { tab: '' }),
                            )
                        }
                        onRemove={(i) =>
                            commit((doc) => removeChangeDeleteItem(doc, mixinId, viewIdx, 'tabs', i))
                        }
                        onChange={(i, field, value) =>
                            commit((doc) =>
                                updateChangeDeleteItem(doc, mixinId, viewIdx, 'tabs', i, field, value),
                            )
                        }
                    />
                </>
            )}

            {type === 'list' && (
                <RefsEditor
                    title="delete.columns"
                    items={del.columns ?? []}
                    refField="column"
                    onAdd={() =>
                        commit((doc) =>
                            addChangeDeleteItem(doc, mixinId, viewIdx, 'columns', { column: '' }),
                        )
                    }
                    onRemove={(i) =>
                        commit((doc) => removeChangeDeleteItem(doc, mixinId, viewIdx, 'columns', i))
                    }
                    onChange={(i, field, value) =>
                        commit((doc) =>
                            updateChangeDeleteItem(doc, mixinId, viewIdx, 'columns', i, field, value),
                        )
                    }
                />
            )}

            {/* ============ replace ============ */}
            <h5 style={{ margin: '12px 0 8px', color: 'var(--text-300)' }}>replace</h5>

            {(type === 'form' || type === 'list' || type === 'page') && (
                <div className="dc-field">
                    <label className="dc-field__label">replace.{type}</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={replace[type] ?? ''}
                        onChange={(e) =>
                            commit((doc) =>
                                setReplaceScalar(doc, mixinId, viewIdx, type as any, e.target.value),
                            )
                        }
                    />
                </div>
            )}

            <div className="dc-field__hint" style={{ marginTop: 8 }}>
                Полная структура (включая recursive add/delete для вложенных групп) доступна
                только в режиме «Код».
            </div>
        </div>
    );
};

const RefsEditor: FC<{
    title: string;
    items: any[];
    refField: string;
    onAdd: () => void;
    onRemove: (i: number) => void;
    onChange: (i: number, field: string, value: string) => void;
    extraFields?: Array<{ name: string; label: string }>;
}> = ({ title, items, refField, onAdd, onRemove, onChange, extraFields = [] }) => (
    <div style={{ marginBottom: 8 }}>
        <div className="dc-constraints__header">
            <span className="dc-muted">{title} ({items.length})</span>
            <button className="dc-btn dc-btn--dashed" onClick={onAdd}>+ элемент</button>
        </div>
        {items.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <input
                    className="dc-input dc-input--compact"
                    value={item[refField] ?? ''}
                    onChange={(e) => onChange(i, refField, e.target.value)}
                    placeholder={refField}
                />
                {extraFields.map((f) => (
                    <input
                        key={f.name}
                        className="dc-input dc-input--compact"
                        value={item[f.name] ?? ''}
                        onChange={(e) => onChange(i, f.name, e.target.value)}
                        placeholder={f.label}
                    />
                ))}
                <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={() => onRemove(i)}>×</button>
            </div>
        ))}
    </div>
);

interface Props { mixin: MixinSchema }

export const MixinForm: FC<Props> = ({ mixin }) => {
    const commit = useEditorStore((s) => s.commit);
    const views = (mixin as any).views ?? [];

    const set = (field: string, value: unknown) =>
        commit((doc) => updateMixinField(doc, mixin.id, field, value));

    const entity = (mixin as any).entity;

    return (
        <div className="dc-detail">
            <div className="dc-detail__header">
                <div className="dc-detail__title-block">
                    <h2 className="dc-detail__title">{mixin.name || mixin.id}</h2>
                    <div className="dc-detail__subtitle">
                        ID: {mixin.id} · {mixin.type}
                    </div>
                </div>
            </div>

            <div className="dc-detail__body">
                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">ID</label>
                        <input className="dc-input" value={mixin.id} disabled />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={mixin.name ?? ''}
                            onChange={(e) => set('name', e.target.value || undefined)}
                        />
                    </div>
                </div>

                <div className="dc-field">
                    <label className="dc-field__label">Описание</label>
                    <input
                        className="dc-input"
                        value={mixin.description ?? ''}
                        onChange={(e) => set('description', e.target.value || undefined)}
                    />
                </div>

                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">Приоритет (weight)</label>
                        <input
                            className="dc-input"
                            type="number"
                            value={mixin.weight ?? ''}
                            onChange={(e) =>
                                set('weight', e.target.value === '' ? undefined : Number(e.target.value))
                            }
                            placeholder="чем меньше — тем выше"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">
                            <input
                                type="checkbox"
                                className="dc-checkbox"
                                checked={(mixin as any).useForChild !== false}
                                onChange={(e) => set('useForChild', e.target.checked)}
                            />{' '}
                            useForChild (наследуется дочерними)
                        </label>
                    </div>
                </div>

                {mixin.type === 'linkage' && (
                    <>
                        <div className="dc-field">
                            <label className="dc-field__label">Связь</label>
                            <LinkageSelect
                                value={(mixin as any).linkage ?? null}
                                onChange={(v) => set('linkage', v ?? undefined)}
                            />
                        </div>
                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">entity.from</label>
                                <EntitySelect
                                    value={entity?.from ?? null}
                                    onChange={(v) =>
                                        commit((doc) => updateMixinEntity(doc, mixin.id, 'from', v ?? ''))
                                    }
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">entity.to</label>
                                <EntitySelect
                                    value={entity?.to ?? null}
                                    onChange={(v) =>
                                        commit((doc) => updateMixinEntity(doc, mixin.id, 'to', v ?? ''))
                                    }
                                />
                            </div>
                        </div>
                    </>
                )}

                {mixin.type === 'view' && (
                    <div className="dc-field">
                        <label className="dc-field__label">entity (целевая сущность)</label>
                        <EntitySelect
                            value={entity || null}
                            onChange={(v) => set('entity', v ?? undefined)}
                        />
                    </div>
                )}

                <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                    Встраиваемые представления ({views.length})
                </h4>

                <div className="dc-constraints__header">
                    <span className="dc-muted">
                        change.add — единственный режим в L1. Полные правила change/replace — в следующем релизе.
                    </span>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addMixinView(doc, mixin.id))}
                    >+ представление</button>
                </div>

                {views.map((v: any, i: number) => (
                    <MixinViewEditor
                        key={i}
                        mixinId={mixin.id}
                        viewIdx={i}
                        view={v}
                        onRemove={() => commit((doc) => removeMixinView(doc, mixin.id, i))}
                    />
                ))}
            </div>
        </div>
    );
};