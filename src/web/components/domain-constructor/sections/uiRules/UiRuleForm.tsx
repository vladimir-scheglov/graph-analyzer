import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ViewSelect } from '../../ui/ViewSelect';
import type { UiRuleSchema } from '../../types';
import {
    EFFECT_OPTIONS, UiRuleEffect,
    updateUiRuleTop, updateUiRuleRuleField,
    getEffectLabel,
} from './uiRules-handlers';
import { UiRuleConditionEditor } from './UiRuleConditionEditor';
import { UiRuleWidgetsList } from './UiRuleWidgetsList';
import { UiRuleGroupsList } from './UiRuleGroupsList';
import { UiRuleColumnsList } from './UiRuleColumnsList';
import { UiRuleContextViews } from './UiRuleContextViews';
import { UiRulePresetsPicker } from './UiRulePresetsPicker';

interface Props {
    rule: UiRuleSchema;
}

export const UiRuleForm: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);

    const setTop = (field: 'name' | 'description' | 'view', value: unknown) =>
        commit((doc) => updateUiRuleTop(doc, rule.id, field, value));

    const setRule = (field: any, value: unknown) =>
        commit((doc) => updateUiRuleRuleField(doc, rule.id, field, value));

    const isVariant = rule.effect === 'variant';
    const supportsOperations = rule.target === 'entity_view';

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={rule.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={rule.name ?? ''}
                        onChange={(e) => setTop('name', e.target.value || undefined)}
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={rule.description ?? ''}
                    onChange={(e) => setTop('description', e.target.value || undefined)}
                />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">View</label>
                <ViewSelect
                    value={rule.view}
                    onChange={(v) => setTop('view', v ?? '')}
                    filterType={rule.target === 'list_view' ? ['list', 'tabs_list'] : 'entity'}
                />
            </div>

            {/* context.views — для entity_view */}
            {supportsOperations && (
                <UiRuleContextViews rule={rule} />
            )}

            {/* operations */}
            {supportsOperations && (
                <div className="dc-field">
                    <label className="dc-field__label">Операции (для modal/page)</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        {(['view', 'edit', 'create'] as const).map((op) => (
                            <label key={op} className="dc-field__label" style={{ margin: 0 }}>
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={(rule.operations ?? []).includes(op)}
                                    onChange={(e) => {
                                        const curr = rule.operations ?? [];
                                        const next = e.target.checked
                                            ? [...curr, op]
                                            : curr.filter((x) => x !== op);
                                        setRule('operations', next.length ? next : undefined);
                                    }}
                                />{' '}
                                {op}
                            </label>
                        ))}
                    </div>
                    <div className="dc-field__hint">
                        Если пусто — применяется во всех операциях.
                    </div>
                </div>
            )}

            {/* effect */}
            <div className="dc-field">
                <label className="dc-field__label">Эффект</label>
                <select
                    className="dc-input"
                    value={rule.effect}
                    onChange={(e) => setRule('effect', e.target.value as UiRuleEffect)}
                >
                    {EFFECT_OPTIONS
                        .filter((o) => {
                            if ((o.value === 'readonly' || o.value === 'editable') && rule.target !== 'entity_view') {
                                return false;
                            }
                            return true;
                        })
                        .map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                </select>
            </div>

            {/* condition */}
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Условие</h4>
            <UiRuleConditionEditor rule={rule} />

            {/* Объекты правила — по target */}
            {rule.target === 'entity_view' && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Виджеты ({(rule.widgets ?? []).length})
                    </h4>
                    <UiRuleWidgetsList rule={rule} mode="all" />

                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Группы ({(rule.groups ?? []).length})
                    </h4>
                    <UiRuleGroupsList rule={rule} />
                </>
            )}

            {rule.target === 'list_view' && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Виджеты-действия ({(rule.widgets ?? []).length})
                    </h4>
                    <UiRuleWidgetsList rule={rule} mode="action-only" />

                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Колонки ({(rule.columns ?? []).length})
                    </h4>
                    <UiRuleColumnsList rule={rule} />
                </>
            )}

            {rule.target === 'entity_attribute' && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Виджеты ({rule.widgets?.length ?? 0})
                    </h4>
                    <UiRuleWidgetsList rule={rule} mode="nested" />
                </>
            )}

            {/* presets — для variant */}
            {isVariant && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Пресеты
                    </h4>
                    <UiRulePresetsPicker rule={rule} />
                </>
            )}

            {/* message / help */}
            {rule.effect !== 'hidden' && (
                <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Сообщения</h4>
            )}
            {rule.effect !== 'hidden' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Сообщение</label>
                        <input
                            className="dc-input"
                            value={(rule as any).message ?? ''}
                            onChange={(e) => setRule('message', e.target.value || undefined)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Подсказка (help)</label>
                        <input
                            className="dc-input"
                            value={(rule as any).help ?? ''}
                            onChange={(e) => setRule('help', e.target.value || undefined)}
                        />
                    </div>
                </>
            )}
        </div>
    );
};