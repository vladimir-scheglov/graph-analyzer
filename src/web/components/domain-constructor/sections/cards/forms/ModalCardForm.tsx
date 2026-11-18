import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import {
    updateCardField, updateCardNestedField, addToCardArray,
    removeFromCardArray, updateInCardArray,
} from '../cards-handlers';

interface Props {
    viewId: string;
    card: any;
}

export const ModalCardForm: FC<Props> = ({ viewId, card }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const allGroups = ((view as any)?.groups ?? []) as any[];
    // Для form — только группы type: form
    const formGroups = allGroups.filter((g) => g.type === 'form');

    const actionOptions = useMemo(
        () => schema.actions.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.id})` : a.id })),
        [schema.actions],
    );

    const buttons = card.buttons ?? [];
    const footer = card.footer ?? [];

    const setForm = (v: string) =>
        commit((doc) => updateCardField(doc, viewId, card.id, 'form', v));

    const setButtonField = (i: number, field: string, value: unknown) =>
        commit((doc) =>
            updateInCardArray(doc, viewId, card.id, 'buttons', i, field, value),
        );

    const setButtonControlField = (i: number, field: string, value: unknown) =>
        commit((doc) =>
            updateCardNestedField(
                doc, viewId, card.id,
                ['buttons', i, 'control', field],
                value,
            ),
        );

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Форма</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    Группа типа «Форма» <span className="dc-field__required">*</span>
                </label>
                <select
                    className="dc-input"
                    value={card.form ?? ''}
                    onChange={(e) => setForm(e.target.value)}
                >
                    <option value="">— выберите —</option>
                    {formGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.id}</option>
                    ))}
                </select>
                {formGroups.length === 0 && (
                    <div className="dc-field__hint">
                        Нет групп типа «Форма» в этом view. Создайте её во вкладке «Группы».
                    </div>
                )}
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Кнопки формы ({buttons.length})</h4>

            <div className="dc-constraints__header">
                <span className="dc-muted">По умолчанию: Подтверждение + Отмена</span>
                <button
                    className="dc-btn dc-btn--dashed"
                    onClick={() =>
                        commit((doc) =>
                            addToCardArray(doc, viewId, card.id, 'buttons', { type: 'submit', label: '' }),
                        )
                    }
                >+ кнопка</button>
            </div>

            {buttons.map((b: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() =>
                                commit((doc) => removeFromCardArray(doc, viewId, card.id, 'buttons', i))
                            }
                        >×</button>
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Тип</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={b.type ?? 'submit'}
                                onChange={(e) => setButtonField(i, 'type', e.target.value)}
                            >
                                <option value="submit">Подтверждение</option>
                                <option value="close">Отмена</option>
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Лейбл</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={b.label ?? ''}
                                onChange={(e) => setButtonField(i, 'label', e.target.value)}
                                placeholder="Добавить / Отменить"
                            />
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Иконка</label>
                        <input
                            className="dc-input dc-input--compact"
                            value={b.control?.icon ?? ''}
                            onChange={(e) =>
                                setButtonControlField(i, 'icon', e.target.value || undefined)
                            }
                            placeholder="icons@Add"
                        />
                    </div>
                </div>
            ))}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Footer ({footer.length})</h4>

            <div className="dc-constraints__header">
                <span className="dc-muted">Кнопки-действия внизу модалки</span>
                <button
                    className="dc-btn dc-btn--dashed"
                    onClick={() =>
                        commit((doc) =>
                            addToCardArray(doc, viewId, card.id, 'footer', {
                                action: '', behavior: 'run',
                            }),
                        )
                    }
                >+ кнопка</button>
            </div>

            {footer.map((f: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() =>
                                commit((doc) => removeFromCardArray(doc, viewId, card.id, 'footer', i))
                            }
                        >×</button>
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Действие</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={f.action ?? ''}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateInCardArray(doc, viewId, card.id, 'footer', i, 'action', e.target.value),
                                    )
                                }
                            >
                                <option value="">—</option>
                                {actionOptions.map((a) => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Поведение</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={f.behavior ?? 'run'}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateInCardArray(doc, viewId, card.id, 'footer', i, 'behavior', e.target.value),
                                    )
                                }
                            >
                                <option value="run">run</option>
                                <option value="run_close">run_close</option>
                                <option value="run_submit">run_submit</option>
                            </select>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};