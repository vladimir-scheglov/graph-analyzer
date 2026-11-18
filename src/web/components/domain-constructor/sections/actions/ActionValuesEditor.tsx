import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ActionSchema } from '../../types';
import {
    addActionValue, removeActionValue, updateActionValueField,
} from './actions-handlers';

interface Props {
    action: ActionSchema;
}

export const ActionValuesEditor: FC<Props> = ({ action }) => {
    const commit = useEditorStore((s) => s.commit);
    const values = action.values ?? [];

    return (
        <div className="dc-constraints" style={{ marginTop: 16 }}>
            <div className="dc-constraints__header">
                <h4 className="dc-constraints__title">Устанавливаемые значения ({values.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addActionValue(doc, action.id))}
                >+ Значение</button>
            </div>

            {values.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет значений</div>
            )}

            {values.map((v, i) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() =>
                                commit((doc) => removeActionValue(doc, action.id, i))
                            }
                        >×</button>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Атрибут</label>
                            <input
                                className="dc-input"
                                value={v.attribute}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateActionValueField(doc, action.id, i, 'attribute', e.target.value),
                                    )
                                }
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Значение</label>
                            <input
                                className="dc-input"
                                value={String(v.value ?? '')}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateActionValueField(doc, action.id, i, 'value', e.target.value),
                                    )
                                }
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};