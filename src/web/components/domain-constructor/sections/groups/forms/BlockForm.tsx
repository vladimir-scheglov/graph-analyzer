import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateGroupLayoutField } from '../groups-handlers';
import { GroupComponentsEditor } from '../components/GroupComponentsEditor';

interface Props {
    viewId: string;
    group: any;
}

export const BlockForm: FC<Props> = ({ viewId, group }) => {
    const commit = useEditorStore((s) => s.commit);
    const layout = group.layout ?? {};
    const components = group.components ?? [];

    const setLayout = (field: string, value: unknown) =>
        commit((doc) => updateGroupLayoutField(doc, viewId, group.id, field, value));

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Поведение</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!layout.expandable}
                        onChange={(e) => setLayout('expandable', e.target.checked ? true : undefined)}
                    />{' '}
                    Сворачивающийся блок
                </label>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Направление</label>
                <select
                    className="dc-input"
                    value={layout.direction ?? 'column'}
                    onChange={(e) => setLayout('direction', e.target.value)}
                >
                    <option value="column">Вертикально</option>
                </select>
            </div>

            <GroupComponentsEditor
                viewId={viewId}
                groupId={group.id}
                components={components}
                allowedKinds={['widget', 'block']}
            />
        </div>
    );
};