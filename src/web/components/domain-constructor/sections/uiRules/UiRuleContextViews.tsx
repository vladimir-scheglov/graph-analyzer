import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ViewSelect } from '../../ui/ViewSelect';
import type { UiRuleSchema } from '../../types';
import { updateUiRuleContext } from './uiRules-handlers';

interface Props { rule: UiRuleSchema }

/**
 * context.views — для target: entity_view.
 * Указывает, в каких модальных/полноэкранных представлениях применяется правило.
 */
export const UiRuleContextViews: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const views = rule.contextViews ?? [];

    const add = () =>
        commit((doc) => updateUiRuleContext(doc, rule.id, [...views, '']));

    const remove = (i: number) =>
        commit((doc) =>
            updateUiRuleContext(doc, rule.id, views.filter((_, j) => j !== i)),
        );

    const update = (i: number, v: string) => {
        const next = [...views];
        next[i] = v;
        commit((doc) => updateUiRuleContext(doc, rule.id, next));
    };

    return (
        <div className="dc-field">
            <label className="dc-field__label">Контекст (context.views)</label>
            <div className="dc-field__hint">
                Если не задано — правило применяется во всех представлениях.
            </div>

            {views.map((v, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <ViewSelect
                        value={v || null}
                        onChange={(nv) => update(i, nv ?? '')}
                        filterType={['panel', 'modal', 'page']}
                    />
                    <button
                        className="dc-btn dc-btn--danger dc-btn--icon"
                        onClick={() => remove(i)}
                    >×</button>
                </div>
            ))}

            <button className="dc-btn dc-btn--dashed" onClick={add} style={{ marginTop: 6 }}>
                + контекст
            </button>
        </div>
    );
};