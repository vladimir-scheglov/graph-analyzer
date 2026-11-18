import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import {
    GroupComponentKind,
    addGroupComponent, removeGroupComponent, updateGroupComponentField,
} from '../groups-handlers';

interface Props {
    viewId: string;
    groupId: string;
    components: any[];
    /** Какие kind разрешены. */
    allowedKinds: GroupComponentKind[];
    /** Только для resizableblockpair — ровно 2. */
    fixedCount?: number;
}

export const GroupComponentsEditor: FC<Props> = ({
    viewId, groupId, components, allowedKinds, fixedCount,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const allWidgets = ((view as any)?.widgets ?? []) as any[];
    const allGroups = ((view as any)?.groups ?? []) as any[];

    const canAdd = !fixedCount || components.length < fixedCount;

    const detectKind = (c: any): GroupComponentKind | null => {
        if (c?.widget) return 'widget';
        if (c?.block) return 'block';
        return null;
    };

    const handleKindChange = (i: number, newKind: GroupComponentKind) => {
        commit((doc) => updateGroupComponentField(doc, viewId, groupId, i, newKind, ''));
    };

    const handleItemChange = (i: number, kind: GroupComponentKind, id: string) => {
        commit((doc) => updateGroupComponentField(doc, viewId, groupId, i, kind, id));
    };

    return (
        <div className="dc-constraints" style={{ marginTop: 16 }}>
            <div className="dc-constraints__header">
                <h4 className="dc-constraints__title">Компоненты ({components.length})</h4>
                {canAdd && (
                    <div className="dc-toolbar__group">
                        {allowedKinds.map((k) => (
                            <button
                                key={k}
                                className="dc-btn dc-btn--dashed"
                                onClick={() => commit((doc) => addGroupComponent(doc, viewId, groupId, k))}
                            >
                                + {k === 'widget' ? 'виджет' : 'блок'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {components.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет компонентов</div>
            )}

            {components.map((c: any, i: number) => {
                const kind = detectKind(c);
                return (
                    <div key={i} className="dc-constraint">
                        <div className="dc-constraint__header">
                            <span className="dc-constraint__kind">#{i + 1}</span>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((doc) => removeGroupComponent(doc, viewId, groupId, i))}
                            >
                                ×
                            </button>
                        </div>
                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">Тип</label>
                                <select
                                    className="dc-input dc-input--compact"
                                    value={kind ?? ''}
                                    onChange={(e) =>
                                        handleKindChange(i, e.target.value as GroupComponentKind)
                                    }
                                >
                                    <option value="">—</option>
                                    {allowedKinds.map((k) => (
                                        <option key={k} value={k}>
                                            {k === 'widget' ? 'Виджет' : 'Блок'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">
                                    {kind === 'widget' ? 'Виджет' : 'Блок'}
                                </label>
                                <select
                                    className="dc-input dc-input--compact"
                                    value={(kind === 'widget' ? c.widget : c.block) ?? ''}
                                    onChange={(e) => handleItemChange(i, kind ?? 'widget', e.target.value)}
                                    disabled={!kind}
                                >
                                    <option value="">— выберите —</option>
                                    {kind === 'widget' && allWidgets.map((w) => (
                                        <option key={w.id} value={w.id}>{w.id} ({w.type})</option>
                                    ))}
                                    {kind === 'block' && allGroups
                                        .filter((g) => g.id !== groupId) // не ссылаться на себя
                                        .map((g) => (
                                            <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                                        ))}
                                </select>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};