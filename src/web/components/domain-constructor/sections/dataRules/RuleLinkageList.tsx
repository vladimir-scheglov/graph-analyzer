import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { RqlEditor } from '../../rql/RqlEditor';
import type { RqlContext } from '../../rql/context';
import type { DataRuleSchema } from '../../types';
import {
    addRuleLinkage, removeRuleLinkage, updateRuleLinkageField,
    getEffectRequirements,
} from './dataRules-handlers';

interface Props {
    rule: DataRuleSchema;
}

export const RuleLinkageList: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const linkages = rule.linkages ?? [];
    const entityObj = rule.entity
        ? schema.entities.find((e) => e.id === rule.entity)
        : null;

    const availableLinkages = schema.linkages.filter((l) =>
        l.side1 === rule.entity || l.side2 === rule.entity,
    );

    const buildContext = (): RqlContext => ({
        placement: {
            kind: 'dataRule.linkage.constraint',
            linkageId: rule.linkage ?? '',
            effect: rule.effect,
        },
        currentDomainId: schema.metadata.id,
        modelIndex,
    });

    const req = getEffectRequirements(rule.effect as any);

    return (
        <div>
            <div className="dc-constraints__header">
                <span className="dc-muted">Связи сущности {rule.entity}</span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addRuleLinkage(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ добавить связь</option>
                    {availableLinkages.map((l) => (
                        <option key={l.id} value={l.id}>{l.name || l.id}</option>
                    ))}
                </select>
            </div>

            {linkages.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет связей</div>
            )}

            {linkages.map((lk: any, i: number) => {
                const linkageObj = schema.linkages.find((l) => l.id === lk.linkage);
                const isSymmetric =
                    linkageObj && linkageObj.side1 === linkageObj.side2 && linkageObj.type === 'n_n';
                return (
                    <div key={i} className="dc-constraint">
                        <div className="dc-constraint__header">
                            <span className="dc-constraint__kind">
                                <code className="dc-code">{lk.linkage}</code>
                            </span>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeRuleLinkage(doc, rule.id, i))}
                            >×</button>
                        </div>

                        {isSymmetric && (
                            <div className="dc-field">
                                <label className="dc-field__label">Сторона</label>
                                <select
                                    className="dc-input dc-input--compact"
                                    value={lk.side ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateRuleLinkageField(
                                                doc, rule.id, i, 'side',
                                                e.target.value ? Number(e.target.value) : undefined,
                                            ),
                                        )
                                    }
                                >
                                    <option value="">—</option>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                </select>
                            </div>
                        )}

                        {rule.effect === 'allowed' && (
                            <>
                                <div className="dc-field">
                                    <label className="dc-field__label">Ограничение (RQL → bool)</label>
                                    <RqlEditor
                                        value={lk.constraint ?? ''}
                                        onChange={(v) =>
                                            commit((doc) =>
                                                updateRuleLinkageField(doc, rule.id, i, 'constraint', v || undefined),
                                            )
                                        }
                                        context={buildContext()}
                                        height={100}
                                    />
                                </div>
                                <div className="dc-field">
                                    <label className="dc-field__label">Выражение (RQL)</label>
                                    <RqlEditor
                                        value={lk.expression ?? ''}
                                        onChange={(v) =>
                                            commit((doc) =>
                                                updateRuleLinkageField(doc, rule.id, i, 'expression', v || undefined),
                                            )
                                        }
                                        context={buildContext()}
                                        height={100}
                                    />
                                </div>
                            </>
                        )}

                        {req.hasMessage && (
                            <div className="dc-field">
                                <label className="dc-field__label">Сообщение</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={lk.message ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateRuleLinkageField(doc, rule.id, i, 'message', e.target.value || undefined),
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
                                    value={lk.help ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateRuleLinkageField(doc, rule.id, i, 'help', e.target.value || undefined),
                                        )
                                    }
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};