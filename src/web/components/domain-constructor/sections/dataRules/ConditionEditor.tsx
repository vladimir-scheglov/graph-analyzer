import { useState, useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { RqlEditor } from '../../rql/RqlEditor';
import type { RqlContext } from '../../rql/context';
import type { DataRuleSchema } from '../../types';
import { setDataRuleCondition } from './dataRules-handlers';

interface Props {
    ruleId: string;
    rule: DataRuleSchema;
}

/**
 * Условие правила: либо "применять всегда" (boolean true),
 * либо RQL-выражение.
 *
 * Использует <RqlEditor> с контекстом, зависящим от placement.
 */
export const ConditionEditor: FC<Props> = ({ ruleId, rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const condition = rule.condition as string | null;
    const [mode, setMode] = useState<'always' | 'rql'>(condition ? 'rql' : 'always');

    const rqlContext: RqlContext = useMemo(() => {
        const currentDomainId = schema.metadata.id;

        if (rule.target === 'entity') {
            return {
                placement: {
                    kind: 'dataRule.condition',
                    target: 'entity',
                    entityFqid: `${currentDomainId}/${rule.entity}`.toLowerCase(),
                },
                currentDomainId,
                modelIndex,
            };
        }
        if (rule.target === 'entityAttribute') {
            return {
                placement: {
                    kind: 'dataRule.condition',
                    target: 'entityAttribute',
                    entityFqid: `${currentDomainId}/${rule.entity}`.toLowerCase(),
                    attrId: rule.attribute ?? '',
                    nestedType: 'table', // динамически ниже
                },
                currentDomainId,
                modelIndex,
            };
        }
        // linkage
        return {
            placement: {
                kind: 'dataRule.condition',
                target: 'linkage',
                linkageId: rule.linkage ?? '',
            },
            currentDomainId,
            modelIndex,
        };
    }, [rule, schema.metadata.id, modelIndex]);

    const handleModeChange = (next: 'always' | 'rql') => {
        setMode(next);
        if (next === 'always') {
            commit((doc) => setDataRuleCondition(doc, ruleId, true));
        } else if (!condition) {
            commit((doc) => setDataRuleCondition(doc, ruleId, ''));
        }
    };

    return (
        <div>
            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`cond-${ruleId}`}
                        checked={mode === 'always'}
                        onChange={() => handleModeChange('always')}
                    />{' '}
                    Применять всегда (condition: true)
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`cond-${ruleId}`}
                        checked={mode === 'rql'}
                        onChange={() => handleModeChange('rql')}
                    />{' '}
                    Условие на RQL
                </label>
            </div>

            {mode === 'rql' && (
                <RqlEditor
                    value={condition ?? ''}
                    onChange={(v) => commit((doc) => setDataRuleCondition(doc, ruleId, v))}
                    context={rqlContext}
                    height={160}
                    placeholder="verdict is NULL"
                />
            )}
        </div>
    );
};