import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import {
    addToCardArray, removeFromCardArray, updateInCardArray,
} from '../cards-handlers';

export interface RefOption {
    value: string;
    label: string;
}

interface Props {
    viewId: string;
    cardId: string;
    arrayField: string;
    /** Поле внутри элемента, в котором лежит id (action / tab / widget). */
    refField: string;
    /** Заголовок. */
    title: string;
    /** Доступные опции. */
    options: RefOption[];
    /** Кнопка «+» — label. */
    addLabel?: string;
    /** Подпись пустого состояния. */
    emptyText?: string;
    /** Дополнительные поля элемента, которые надо показать. */
    extraFields?: Array<{
        name: string;
        label: string;
        kind?: 'text' | 'select';
        options?: RefOption[];
    }>;
    /** Скрыть кнопку добавления. */
    disableAdd?: boolean;
}

export const SimpleRefList: FC<Props> = ({
    viewId, cardId, arrayField, refField, title, options, addLabel = 'Добавить',
    emptyText = 'Нет элементов', extraFields = [], disableAdd = false,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const card = ((view as any)?.views ?? []).find((c: any) => c.id === cardId);
    const items = (card?.[arrayField] ?? []) as any[];

    return (
        <div className="dc-constraints" style={{ marginTop: 16 }}>
            <div className="dc-constraints__header">
                <h4 className="dc-constraints__title">{title} ({items.length})</h4>
                {!disableAdd && (
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() =>
                            commit((doc) =>
                                addToCardArray(doc, viewId, cardId, arrayField, { [refField]: '' }),
                            )
                        }
                    >+ {addLabel}</button>
                )}
            </div>

            {items.length === 0 && (
                <div className="dc-muted dc-constraints__empty">{emptyText}</div>
            )}

            {items.map((it: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() =>
                                commit((doc) => removeFromCardArray(doc, viewId, cardId, arrayField, i))
                            }
                        >×</button>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">{refField}</label>
                        <select
                            className="dc-input dc-input--compact"
                            value={it[refField] ?? ''}
                            onChange={(e) =>
                                commit((doc) =>
                                    updateInCardArray(doc, viewId, cardId, arrayField, i, refField, e.target.value),
                                )
                            }
                        >
                            <option value="">— выберите —</option>
                            {options.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {extraFields.map((f) => (
                        <div key={f.name} className="dc-field">
                            <label className="dc-field__label">{f.label}</label>
                            {f.kind === 'select' ? (
                                <select
                                    className="dc-input dc-input--compact"
                                    value={it[f.name] ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateInCardArray(
                                                doc, viewId, cardId, arrayField, i, f.name, e.target.value,
                                            ),
                                        )
                                    }
                                >
                                    <option value="">—</option>
                                    {f.options?.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    className="dc-input dc-input--compact"
                                    value={it[f.name] ?? ''}
                                    onChange={(e) =>
                                        commit((doc) =>
                                            updateInCardArray(
                                                doc, viewId, cardId, arrayField, i, f.name, e.target.value,
                                            ),
                                        )
                                    }
                                />
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};