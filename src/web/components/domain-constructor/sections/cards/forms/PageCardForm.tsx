import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import {
    updateCardField, updateCardNestedField,
} from '../cards-handlers';
import { SimpleRefList } from '../components/SimpleRefList';

interface Props {
    viewId: string;
    card: any;
}

type FillMode = 'block' | 'tabs';

export const PageCardForm: FC<Props> = ({ viewId, card }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const allGroups = ((view as any)?.groups ?? []) as any[];
    const allWidgets = ((view as any)?.widgets ?? []) as any[];

    const blocks = allGroups.filter((g) => g.type === 'block' || g.type === 'tabs');
    const tabs = allGroups.filter((g) => g.type === 'tab');
    const actionWidgets = allWidgets.filter((w) => w.type === 'action');

    const actionOptions = useMemo(
        () => schema.actions.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.id})` : a.id })),
        [schema.actions],
    );

    const fillMode: FillMode = card.block ? 'block' : 'tabs';

    const setFillMode = (mode: FillMode) => {
        if (mode === 'block') {
            commit((doc) => updateCardField(doc, viewId, card.id, 'block', ''));
            commit((doc) => updateCardField(doc, viewId, card.id, 'tabs', undefined));
        } else {
            commit((doc) => updateCardField(doc, viewId, card.id, 'tabs', []));
            commit((doc) => updateCardField(doc, viewId, card.id, 'block', undefined));
        }
    };

    const setPinnedField = (field: string, value: unknown) =>
        commit((doc) =>
            updateCardNestedField(
                doc, viewId, card.id,
                ['pinnedView', field],
                value,
            ),
        );

    const pinned = card.pinnedView;

    return (
        <div>
            <div className="dc-field">
                <label className="dc-field__label">Пункт меню (menuItem)</label>
                <input
                    className="dc-input"
                    value={card.menuItem ?? ''}
                    onChange={(e) =>
                        commit((doc) => updateCardField(doc, viewId, card.id, 'menuItem', e.target.value || undefined))
                    }
                    placeholder="id из menus[].items[]"
                />
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Наполнение</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`fill-${card.id}`}
                        checked={fillMode === 'block'}
                        onChange={() => setFillMode('block')}
                    />{' '}
                    Один блок
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`fill-${card.id}`}
                        checked={fillMode === 'tabs'}
                        onChange={() => setFillMode('tabs')}
                    />{' '}
                    Вкладки
                </label>
            </div>

            {fillMode === 'block' && (
                <div className="dc-field">
                    <label className="dc-field__label">Блок</label>
                    <select
                        className="dc-input"
                        value={card.block ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateCardField(doc, viewId, card.id, 'block', e.target.value || undefined))
                        }
                    >
                        <option value="">— выберите —</option>
                        {blocks.map((g) => (
                            <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                        ))}
                    </select>
                </div>
            )}

            {fillMode === 'tabs' && (
                <SimpleRefList
                    viewId={viewId}
                    cardId={card.id}
                    arrayField="tabs"
                    refField="tab"
                    title="Вкладки"
                    options={tabs.map((g) => ({ value: g.id, label: g.label || g.id }))}
                    addLabel="вкладку"
                    emptyText="Нет вкладок"
                />
            )}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Панель действий</h4>

            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="actionPanel"
                refField="widget"
                title="Виджеты действий"
                options={actionWidgets.map((w) => ({ value: w.id, label: w.id }))}
                addLabel="виджет"
                emptyText="Нет виджетов"
            />

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Действия при открытии (onView)</h4>

            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="onView"
                refField="action"
                title="onView"
                options={actionOptions}
                addLabel="действие"
                emptyText="Нет действий"
            />

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Закреплённый блок</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!pinned}
                        onChange={(e) => {
                            if (e.target.checked) {
                                commit((doc) =>
                                    updateCardNestedField(doc, viewId, card.id, ['pinnedView'], {
                                        block: '',
                                        position: 'top',
                                    }),
                                );
                            } else {
                                commit((doc) => {
                                    const vIdx = findViewIdx(doc, viewId);
                                    if (vIdx < 0) return;
                                    const cIdx = findCardIdx(doc, viewId, card.id);
                                    if (cIdx < 0) return;
                                    doc.doc.deleteIn(['views', vIdx, 'views', cIdx, 'pinnedView'] as any);
                                });
                            }
                        }}
                    />{' '}
                    Закрепить блок
                </label>
            </div>

            {pinned && (
                <>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Блок</label>
                            <select
                                className="dc-input"
                                value={pinned.block ?? ''}
                                onChange={(e) => setPinnedField('block', e.target.value)}
                            >
                                <option value="">—</option>
                                {blocks.map((g) => (
                                    <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                                ))}
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Позиция</label>
                            <select
                                className="dc-input"
                                value={pinned.position ?? 'top'}
                                onChange={(e) => setPinnedField('position', e.target.value)}
                            >
                                <option value="top">Сверху</option>
                                <option value="bottom">Снизу</option>
                            </select>
                        </div>
                    </div>

                    <div className="dc-field-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <div className="dc-field">
                            <label className="dc-field__label">height</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={pinned.height ?? ''}
                                onChange={(e) => setPinnedField('height', e.target.value || undefined)}
                                placeholder="30% или 200px"
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">minHeight</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={pinned.minHeight ?? ''}
                                onChange={(e) => setPinnedField('minHeight', e.target.value || undefined)}
                                placeholder="25%"
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">maxHeight</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={pinned.maxHeight ?? ''}
                                onChange={(e) => setPinnedField('maxHeight', e.target.value || undefined)}
                                placeholder="50%"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// helpers
function findViewIdx(doc: any, viewId: string): number {
    const arr = doc.get(['views']);
    return Array.isArray(arr) ? arr.findIndex((v: any) => v && v.id === viewId) : -1;
}
function findCardIdx(doc: any, viewId: string, cardId: string): number {
    const vIdx = findViewIdx(doc, viewId);
    if (vIdx < 0) return -1;
    const cards = doc.get(['views', vIdx, 'views']);
    return Array.isArray(cards) ? cards.findIndex((c: any) => c && c.id === cardId) : -1;
}