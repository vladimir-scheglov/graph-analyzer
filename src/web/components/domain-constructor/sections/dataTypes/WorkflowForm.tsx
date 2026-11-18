import { type FC, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { DataTypeSchema } from '../../types';
import {
    addStatus,
    removeStatus,
    updateStatusField,
    setInitialStatus,
    toggleTransition,
    setWorkflowColor,
    updateDataTypeField,
} from './dataType-handlers';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

interface Props {
    dataType: DataTypeSchema;
}

export const WorkflowForm: FC<Props> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);

    const statuses = dataType.statuses ?? [];
    const transitions = dataType.transitions ?? [];
    const initial = dataType.initial;
    const view = (dataType as any).view as Array<{ status: string; color?: string }> | undefined;
    const colorByStatus = new Map((view ?? []).map((v) => [v.status, v.color]));

    const transitionSet = new Set(transitions.map((t) => `${t.from}->${t.to}`));

    const isTransitionAllowed = (from: string, to: string) =>
        transitionSet.has(`${from}->${to}`);

    return (
        <div className="dc-workflow-form">
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={dataType.name ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateDataTypeField(doc, dataType.id, 'name', e.target.value))
                        }
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Начальный статус</label>
                    <select
                        className="dc-input"
                        value={initial ?? ''}
                        onChange={(e) =>
                            commit((doc) => setInitialStatus(doc, dataType.id, e.target.value))
                        }
                    >
                        <option value="">— не выбран —</option>
                        {statuses.map((s) => (
                            <option key={s.id} value={s.id}>{s.name || s.id}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-enum-form__toolbar">
                <h4 className="dc-constraints__title">Статусы ({statuses.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addStatus(doc, dataType.id))}
                    disabled={isPublished}
                >+ Статус</button>
            </div>

            {statuses.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет статусов</div>
            )}

            <table className="dc-table">
                <thead>
                    <tr>
                        <th style={{ width: 60 }}>Цвет</th>
                        <th>ID</th>
                        <th>Название</th>
                        <th style={{ width: 80 }}>Скрытый</th>
                        <th style={{ width: 80 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {statuses.map((s, i) => (
                        <tr key={i}>
                            <td>
                                <input
                                    type="color"
                                    className="dc-color-input"
                                    value={colorByStatus.get(s.id) || '#64748b'}
                                    onChange={(e) =>
                                        commit((doc) => setWorkflowColor(doc, dataType.id, s.id, e.target.value))
                                    }
                                    disabled={isPublished}
                                />
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={s.id}
                                    onChange={(e) =>
                                        commit((doc) => updateStatusField(doc, dataType.id, i, 'id', e.target.value))
                                    }
                                    disabled={isPublished}
                                />
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={s.name ?? ''}
                                    onChange={(e) =>
                                        commit((doc) => updateStatusField(doc, dataType.id, i, 'name', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={!!s.hidden}
                                    onChange={(e) =>
                                        commit((doc) => updateStatusField(doc, dataType.id, i, 'hidden', e.target.checked))
                                    }
                                />
                            </td>
                            <td>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => setPendingDelete(i)}
                                    disabled={isPublished}
                                    title="Удалить"
                                >×</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {statuses.length >= 2 && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 20 }}>
                        Матрица переходов
                    </h4>
                    <div className="dc-workflow-matrix-wrap">
                        <table className="dc-workflow-matrix">
                            <thead>
                                <tr>
                                    <th></th>
                                    {statuses.map((s) => (
                                        <th key={s.id} title={s.name || s.id}>{s.id}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {statuses.map((from) => (
                                    <tr key={from.id}>
                                        <th title={from.name || from.id}>{from.id}</th>
                                        {statuses.map((to) => {
                                            const isSelf = from.id === to.id;
                                            const checked = isSelf || isTransitionAllowed(from.id, to.id);
                                            return (
                                                <td key={to.id} className="dc-workflow-matrix__cell">
                                                    <input
                                                        type="checkbox"
                                                        className="dc-checkbox"
                                                        checked={checked}
                                                        disabled={isSelf}
                                                        onChange={() =>
                                                            commit((doc) =>
                                                                toggleTransition(doc, dataType.id, from.id, to.id),
                                                            )
                                                        }
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="dc-field__hint">
                        Переходы в тот же статус разрешены всегда (disabled).
                    </p>
                </>
            )}

            <ConfirmDialog
                open={pendingDelete !== null}
                title="Удалить статус?"
                description={
                    <p>
                        Все переходы с этим статусом (from или to) также будут удалены.
                        {isPublished && <><br /><strong>После публикации удаление запрещено.</strong></>}
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (pendingDelete === null) return;
                    commit((doc) => removeStatus(doc, dataType.id, pendingDelete));
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};