import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { UiRuleSchema } from '../../types';
import {
    addUiRuleGroup, removeUiRuleGroup,
} from './uiRules-handlers';

interface Props { rule: UiRuleSchema }

export const UiRuleGroupsList: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const groups = (rule.groups ?? []) as any[];
    const view = schema.views.find((v) => v.id === rule.view);
    const viewGroups = ((view as any)?.groups ?? []) as any[];

    return (
        <div>
            <div className="dc-constraints__header">
                <span className="dc-muted">Группы view (target: entity_view)</span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addUiRuleGroup(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ группа</option>
                    {viewGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                    ))}
                </select>
            </div>

            {groups.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет групп</div>
            )}

            {groups.map((g: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">
                            <code className="dc-code">{g.group}</code>
                        </span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeUiRuleGroup(doc, rule.id, i))}
                        >×</button>
                    </div>
                </div>
            ))}
        </div>
    );
};