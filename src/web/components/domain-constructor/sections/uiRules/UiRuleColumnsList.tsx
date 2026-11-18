import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { UiRuleSchema } from '../../types';
import {
    addUiRuleColumn, removeUiRuleColumn,
} from './uiRules-handlers';

interface Props { rule: UiRuleSchema }

export const UiRuleColumnsList: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const columns = (rule.columns ?? []) as any[];

    // Колонки list-view берём из viewColumns (ModelIndex) или из schema.views
    const view = schema.views.find((v) => v.id === rule.view);
    const tableCols = ((view as any)?.table?.columns ?? []) as any[];

    return (
        <div>
            <div className="dc-constraints__header">
                <span className="dc-muted">Колонки list-view (target: list_view)</span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addUiRuleColumn(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ колонка</option>
                    {tableCols.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.id}</option>
                    ))}
                </select>
            </div>

            {columns.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет колонок</div>
            )}

            {columns.map((c: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">
                            <code className="dc-code">{c.column}</code>
                        </span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeUiRuleColumn(doc, rule.id, i))}
                        >×</button>
                    </div>
                </div>
            ))}
        </div>
    );
};