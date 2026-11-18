import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateGroupLayoutField, removeGroupComponent, addGroupComponent, updateGroupComponentField } from '../groups-handlers';

interface Props {
    viewId: string;
    group: any;
}

export const TabsForm: FC<Props> = ({ viewId, group }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const allGroups = ((view as any)?.groups ?? []) as any[];
    const tabGroups = allGroups.filter((g) => g.type === 'tab');

    const components = group.components ?? [];
    const layout = group.layout ?? {};

    const setLayout = (field: string, value: unknown) =>
        commit((doc) => updateGroupLayoutField(doc, viewId, group.id, field, value));

    const add = () =>
        commit((doc) => addGroupComponent(doc, viewId, group.id, 'block'));

    const remove = (i: number) =>
        commit((doc) => removeGroupComponent(doc, viewId, group.id, i));

    const setRef = (i: number, id: string) =>
        commit((doc) => updateGroupComponentField(doc, viewId, group.id, i, 'block', id));

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Вкладки ({components.length})</h4>

            <div className="dc-constraints__header">
                <span className="dc-muted">Только группы типа «Вкладка»</span>
                <button className="dc-btn dc-btn--dashed" onClick={add}>+ вкладка</button>
            </div>

            {components.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет вкладок</div>
            )}

            {components.map((c: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={() => remove(i)}>×</button>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Вкладка (group id)</label>
                        <select
                            className="dc-input dc-input--compact"
                            value={c.block ?? ''}
                            onChange={(e) => setRef(i, e.target.value)}
                        >
                            <option value="">— выберите —</option>
                            {tabGroups.map((g) => (
                                <option key={g.id} value={g.id}>{g.label || g.id}</option>
                            ))}
                        </select>
                    </div>
                </div>
            ))}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Высота</h4>

            <div className="dc-field-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="dc-field">
                    <label className="dc-field__label">height</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={layout.height ?? ''}
                        onChange={(e) => setLayout('height', e.target.value || undefined)}
                        placeholder="50% или 200px"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">minHeight</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={layout.minHeight ?? ''}
                        onChange={(e) => setLayout('minHeight', e.target.value || undefined)}
                        placeholder="200px"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">maxHeight</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={layout.maxHeight ?? ''}
                        onChange={(e) => setLayout('maxHeight', e.target.value || undefined)}
                        placeholder="800px"
                    />
                </div>
            </div>
        </div>
    );
};