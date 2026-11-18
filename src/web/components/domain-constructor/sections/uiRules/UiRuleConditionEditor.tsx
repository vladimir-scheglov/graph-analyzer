import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { RqlEditor } from '../../rql/RqlEditor';
import type { RqlContext } from '../../rql/context';
import type { UiRuleSchema } from '../../types';
import { updateUiRuleCondition } from './uiRules-handlers';

interface Props {
    rule: UiRuleSchema;
}

export const UiRuleConditionEditor: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const condition = (rule as any).condition as string | null ?? '';

    const ctx: RqlContext = useMemo(() => ({
        placement: {
            kind: 'uiRule.condition',
            viewId: rule.view,
            target: rule.target as any,
        },
        currentDomainId: schema.metadata.id,
        modelIndex,
    }), [rule, schema.metadata.id, modelIndex]);

    return (
        <div>
            <RqlEditor
                value={condition}
                onChange={(v) => commit((doc) => updateUiRuleCondition(doc, rule.id, v))}
                context={ctx}
                height={140}
                placeholder="hasRole('hiddencolums')"
            />
            <div className="dc-field__hint">
                Условие на Domain RQL. Переменная <code>@doc</code> ссылается на объект
                представления; <code>@CurrentUser</code> — текущий пользователь.
            </div>
        </div>
    );
};