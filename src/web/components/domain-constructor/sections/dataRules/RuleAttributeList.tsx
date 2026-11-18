import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { RqlEditor } from '../../rql/RqlEditor';
import type { RqlContext } from '../../rql/context';
import type { DataRuleSchema } from '../../types';
import {
    addRuleAttribute, removeRuleAttribute, updateRuleAttributeField,
    getEffectRequirements,
} from './dataRules-handlers';
import { isEffectAvailableForAttribute, isSystemAttribute } from '../../model/compat-tables';

interface Props {
    rule: DataRuleSchema;
}

export const RuleAttributeList: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const attributes = rule.attributes ?? [];

    // Сущность для выбора
    const entityObj = rule.entity
        ? schema.entities.find((e) => e.id === rule.entity)
        : null;
    const availableAttrs = (entityObj?.attributes ?? []).filter((a) => {
        // По evo_003: проверка совместимости effect × dataType
        const isSys = isSystemAttribute(a.id);
        return isEffectAvailableForAttribute(rule.effect as any, a.dataType, isSys);
    });

    // RQL-контекст для attribute.constraint / expression
    const buildContext = (attributeId: string): RqlContext => {
        const currentDomainId = schema.metadata.id;
        if (rule.target === 'entity') {
            return {
                placement: {
                    kind: 'dataRule.attribute.constraint', // или expression
                    entityFqid: `${currentDomainId}/${rule.entity}`.toLowerCase(),
                    attrId: attributeId,
                    effect: rule.effect,
                },
                currentDomainId,
                modelIndex,
            };
        }
        // linkage
        return {
            placement: {
                kind: 'dataRule.linkage.constraint',
                linkageId: rule.linkage ?? '',
                effect: rule.effect,
            },
            currentDomainId,
            modelIndex,
        };
    };

    const req = getEffectRequirements(rule.effect as any);

    return (
        <div>
            <div className="dc-constraints__header">
                <span className="dc-muted">Только атрибуты, совместимые с эффектом</span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addRuleAttribute(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ добавить атрибут</option>
                    {availableAttrs.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.name || a.id} ({a.dataType})
                        </option>
                    ))}
                </select>
            </div>

            {attributes.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет атрибутов</div>
            )}

            {attributes.map((attr: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">
                            <code className="dc-code">{attr.attribute}</code>
                        </span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeRuleAttribute(doc, rule.id, i))}
                        >×</button>
                    </div>

                    {/* value / expression — для default */}
                    {rule.effect === 'default' && (
                        <>
                            <div className="dc-field">
                                <label className="dc-field__label">Значение (если статическое)</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={typeof attr.value === 'object' ? JSON.stringify(attr.value) : (attr.value ?? '')}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateRuleAttributeField(doc, rule.id, i, 'value', e.target.value),
                                        )
                                    }
                                    placeholder="notDefined / 42 / true"
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">Выражение (RQL)</label>
                                <RqlEditor
                                    value={attr.expression ?? ''}
                                    onChange={(v) =>
                                        commit((doc) =>
                                            updateRuleAttributeField(doc, rule.id, i, 'expression', v || undefined),
                                        )
                                    }
                                    context={buildContext(attr.attribute)}
                                    height={100}
                                />
                            </div>
                        </>
                    )}

                    {/* constraint / expression — для allowed */}
                    {rule.effect === 'allowed' && (
                        <>
                            <div className="dc-field">
                                <label className="dc-field__label">Ограничение (RQL, возвращает bool)</label>
                                <RqlEditor
                                    value={attr.constraint ?? ''}
                                    onChange={(v) =>
                                        commit((doc) =>
                                            updateRuleAttributeField(doc, rule.id, i, 'constraint', v || undefined),
                                        )
                                    }
                                    context={buildContext(attr.attribute)}
                                    height={100}
                                    placeholder="occurredAt IS NULL OR occurredAt < @CurrentDateTime"
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">Выражение (RQL)</label>
                                <RqlEditor
                                    value={attr.expression ?? ''}
                                    onChange={(v) =>
                                        commit((doc) =>
                                            updateRuleAttributeField(doc, rule.id, i, 'expression', v || undefined),
                                        )
                                    }
                                    context={buildContext(attr.attribute)}
                                    height={100}
                                />
                            </div>
                        </>
                    )}

                    {/* message / help — для не-default */}
                    {req.hasMessage && (
                        <div className="dc-field">
                            <label className="dc-field__label">Сообщение</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={attr.message ?? ''}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateRuleAttributeField(doc, rule.id, i, 'message', e.target.value || undefined),
                                    )
                                }
                            />
                        </div>
                    )}
                    {req.hasHelp && (
                        <div className="dc-field">
                            <label className="dc-field__label">Подсказка</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={attr.help ?? ''}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateRuleAttributeField(doc, rule.id, i, 'help', e.target.value || undefined),
                                    )
                                }
                            />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};