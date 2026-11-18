import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { updateDataRuleField, updateDataRuleNested, EFFECT_OPTIONS } from './dataRules-handlers';
import { ConditionEditor } from './ConditionEditor';
import { RuleAttributeList } from './RuleAttributeList';
import { RuleLinkageList } from './RuleLinkageList';
import { NestedEditor } from './NestedEditor';
import type { DataRuleSchema } from '../../types';

interface Props {
    rule: DataRuleSchema;
}

export const DataRuleForm: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateDataRuleField(doc, rule.id, field, value));

    const setRule = (field: string, value: unknown) =>
        commit((doc) => updateDataRuleNested(doc, rule.id, ['rule', field], value));

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
                        onChange={(e) => set('name', e.target.value || undefined)}
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <textarea
                    className="dc-input dc-input--textarea"
                    value={rule.description ?? ''}
                    onChange={(e) => set('description', e.target.value || undefined)}
                />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Эффект</label>
                <select
                    className="dc-input"
                    value={rule.effect}
                    onChange={(e) => {
                        setRule('effect', e.target.value);
                    }}
                >
                    {EFFECT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            </div>

            {/* ============ Condition ============ */}
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Условие</h4>

            <ConditionEditor
                ruleId={rule.id}
                rule={rule}
            />

            {/* ============ Атрибуты ============ */}
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Атрибуты ({(rule.attributes ?? []).length})
            </h4>

            <RuleAttributeList rule={rule} />

            {/* ============ Связи (для target: entity) ============ */}
            {rule.target === 'entity' && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                        Связи ({(rule.linkages ?? []).length})
                    </h4>
                    <RuleLinkageList rule={rule} />
                </>
            )}

            {/* ============ nested (для target: entityAttribute) ============ */}
            {rule.target === 'entityAttribute' && (
                <NestedEditor rule={rule} />
            )}

            {/* ============ message / help ============ */}
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Сообщения
            </h4>

            {rule.effect !== 'default' && rule.effect !== 'hidden' && (
                <div className="dc-field">
                    <label className="dc-field__label">Сообщение валидации</label>
                    <input
                        className="dc-input"
                        value={rule.message ?? ''}
                        onChange={(e) => set('message', e.target.value || undefined)}
                        placeholder="Текст, отображаемый при ошибке"
                    />
                </div>
            )}

            {rule.effect !== 'hidden' && rule.target !== 'entityAttribute' && (
                <div className="dc-field">
                    <label className="dc-field__label">Подсказка (help)</label>
                    <input
                        className="dc-input"
                        value={rule.help ?? ''}
                        onChange={(e) => set('help', e.target.value || undefined)}
                        placeholder="Текст при наведении на иконку справки"
                    />
                </div>
            )}
        </div>
    );
};