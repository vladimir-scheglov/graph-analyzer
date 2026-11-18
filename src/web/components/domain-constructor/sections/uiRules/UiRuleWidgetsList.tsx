import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { UiRuleSchema } from '../../types';
import {
    addUiRuleWidget, removeUiRuleWidget, updateUiRuleWidgetField,
} from './uiRules-handlers';

interface Props {
    rule: UiRuleSchema;
    /** action-only: только виджеты типа action (list_view);
     *  all: все виджеты view (entity_view);
     *  nested: с nested-настройками (entity_attribute). */
    mode: 'all' | 'action-only' | 'nested';
}

export const UiRuleWidgetsList: FC<Props> = ({ rule, mode }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const widgets = (rule.widgets ?? []) as any[];

    // Виджеты выбранного view
    const view = schema.views.find((v) => v.id === rule.view);
    const viewWidgets = ((view as any)?.widgets ?? []) as any[];

    const availableWidgets = useMemo(
        () => viewWidgets.filter((w) => mode !== 'action-only' || w.type === 'action'),
        [viewWidgets, mode],
    );

    return (
        <div>
            <div className="dc-constraints__header">
                <span className="dc-muted">
                    {mode === 'action-only'
                        ? 'Только виджеты действия (target: list_view)'
                        : 'Виджеты выбранного view'}
                </span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addUiRuleWidget(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ виджет</option>
                    {availableWidgets.map((w) => (
                        <option key={w.id} value={w.id}>{w.id} ({w.type})</option>
                    ))}
                </select>
            </div>

            {widgets.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет виджетов</div>
            )}

            {widgets.map((w: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">
                            <code className="dc-code">{w.widget}</code>
                        </span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeUiRuleWidget(doc, rule.id, i))}
                        >×</button>
                    </div>

                    {mode === 'nested' && (
                        <NestedEditor rule={rule} index={i} nested={w.nested} />
                    )}

                    {rule.effect === 'variant' && (
                        <PresetsPerItem
                            rule={rule}
                            index={i}
                            presets={w.presets ?? []}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

// ============ nested ============

const NestedEditor: FC<{ rule: UiRuleSchema; index: number; nested: any }> = ({
    rule, index, nested,
}) => {
    const commit = useEditorStore((s) => s.commit);

    const type = nested?.type as 'table' | 'array' | undefined;

    const setNestedType = (t: 'table' | 'array' | undefined) => {
        if (!t) {
            commit((doc) => updateUiRuleWidgetField(doc, rule.id, index, 'nested', undefined));
            return;
        }
        const next: any = { type: t };
        if (t === 'table') next.attributes = [];
        else next.items = [];
        commit((doc) => updateUiRuleWidgetField(doc, rule.id, index, 'nested', next));
    };

    const addNestedAttr = (attr: string) => {
        const curr = nested?.attributes ?? [];
        commit((doc) =>
            updateUiRuleWidgetField(doc, rule.id, index, 'nested', {
                type: 'table', attributes: [...curr, { attribute: attr }],
            }),
        );
    };

    const addNestedItem = (item: number | '*') => {
        const curr = nested?.items ?? [];
        commit((doc) =>
            updateUiRuleWidgetField(doc, rule.id, index, 'nested', {
                type: 'array', items: [...curr, { item }],
            }),
        );
    };

    return (
        <div style={{ marginTop: 8 }}>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">nested.type</label>
                    <select
                        className="dc-input dc-input--compact"
                        value={type ?? ''}
                        onChange={(e) =>
                            setNestedType((e.target.value || undefined) as any)
                        }
                    >
                        <option value="">— не задано —</option>
                        <option value="table">table</option>
                        <option value="array">array</option>
                    </select>
                </div>
            </div>

            {type === 'table' && (
                <div className="dc-field">
                    <label className="dc-field__label">Колонки таблицы (attributes[])</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input
                            className="dc-input dc-input--compact"
                            placeholder="id колонки + Enter"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const v = (e.target as HTMLInputElement).value.trim();
                                    if (v) { addNestedAttr(v); (e.target as HTMLInputElement).value = ''; }
                                }
                            }}
                        />
                    </div>
                    <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
                        {(nested.attributes ?? []).map((a: any, ai: number) => (
                            <li key={ai}>
                                <code>{a.attribute}</code>{' '}
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() =>
                                        commit((doc) =>
                                            updateUiRuleWidgetField(doc, rule.id, index, 'nested', {
                                                type: 'table',
                                                attributes: (nested.attributes ?? []).filter((_: any, j: number) => j !== ai),
                                            }),
                                        )
                                    }
                                >×</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {type === 'array' && (
                <div className="dc-field">
                    <label className="dc-field__label">Элементы массива (items[])</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => addNestedItem('*')}
                        >+ все (*)</button>
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => addNestedItem(0)}
                        >+ конкретный</button>
                    </div>
                    <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
                        {(nested.items ?? []).map((it: any, ii: number) => (
                            <li key={ii}>
                                item: <code>{String(it.item)}</code>{' '}
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() =>
                                        commit((doc) =>
                                            updateUiRuleWidgetField(doc, rule.id, index, 'nested', {
                                                type: 'array',
                                                items: (nested.items ?? []).filter((_: any, j: number) => j !== ii),
                                            }),
                                        )
                                    }
                                >×</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// ============ presets per-item ============

const PresetsPerItem: FC<{ rule: UiRuleSchema; index: number; presets: string[] }> = ({
    rule, index, presets,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const allPresets = ((schema as any).uiPresets ?? []) as any[];

    if (allPresets.length === 0) return null;

    return (
        <div className="dc-field" style={{ marginTop: 6 }}>
            <label className="dc-field__label">Пресеты для элемента</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {allPresets.map((p) => (
                    <label key={p.id} className="dc-field__label" style={{ margin: 0 }}>
                        <input
                            type="checkbox"
                            className="dc-checkbox"
                            checked={presets.includes(p.id)}
                            onChange={(e) => {
                                const next = e.target.checked
                                    ? [...presets, p.id]
                                    : presets.filter((x) => x !== p.id);
                                commit((doc) =>
                                    updateUiRuleWidgetField(doc, rule.id, index, 'presets',
                                        next.length ? next : undefined),
                                );
                            }}
                        />{' '}
                        {p.name || p.id}
                    </label>
                ))}
            </div>
        </div>
    );
};