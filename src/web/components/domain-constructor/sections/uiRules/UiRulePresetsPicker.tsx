import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { UiRuleSchema } from '../../types';
import { updateUiRuleRuleField } from './uiRules-handlers';

interface Props { rule: UiRuleSchema }

/**
 * Общий presets[] на уровне rule (effect: variant).
 * Элементные пресеты задаются в widgets[].presets.
 */
export const UiRulePresetsPicker: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const presets = (rule.presets ?? []) as string[];
    const allPresets = ((schema as any).uiPresets ?? []) as any[];

    if (allPresets.length === 0) {
        return (
            <div className="dc-muted dc-constraints__empty">
                Нет пресетов. Создайте их в разделе «Пресеты UI».
            </div>
        );
    }

    return (
        <div>
            <div className="dc-field__hint">
                Общие пресеты для всех элементов правила (можно уточнить на уровне виджета).
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
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
                                    updateUiRuleRuleField(doc, rule.id, 'presets', next.length ? next : undefined),
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