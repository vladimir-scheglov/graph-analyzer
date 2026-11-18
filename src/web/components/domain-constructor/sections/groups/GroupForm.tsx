import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    GROUP_TYPES, GroupType, changeGroupType, updateGroupField,
} from './groups-handlers';
import { BlockForm } from './forms/BlockForm';
import { TabForm } from './forms/TabForm';
import { FormForm } from './forms/FormForm';
import { TabsForm } from './forms/TabsForm';
import { ResizableBlockPairForm } from './forms/ResizableBlockPairForm';

interface Props {
    viewId: string;
    group: any;
}

export const GroupForm: FC<Props> = ({ viewId, group }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateGroupField(doc, viewId, group.id, field, value));

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={group.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Тип</label>
                    <select
                        className="dc-input"
                        value={group.type}
                        onChange={(e) => {
                            const newType = e.target.value as GroupType;
                            if (newType === group.type) return;
                            if (!confirm(`Сменить тип на "${newType}"? Компоненты будут очищены.`)) return;
                            commit((doc) => changeGroupType(doc, viewId, group.id, newType));
                        }}
                        disabled={isPublished}
                    >
                        {GROUP_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={group.description ?? ''}
                    onChange={(e) => set('description', e.target.value || undefined)}
                />
            </div>

            {(group.type === 'block' || group.type === 'tab') && (
                <div className="dc-field">
                    <label className="dc-field__label">Лейбл</label>
                    <input
                        className="dc-input"
                        value={group.label ?? ''}
                        onChange={(e) => set('label', e.target.value || undefined)}
                    />
                </div>
            )}

            {/* inherits — для block/tab/form */}
            {(group.type === 'block' || group.type === 'tab' || group.type === 'form') && (
                <div className="dc-field">
                    <label className="dc-field__label">Наследовать настройки из</label>
                    <input
                        className="dc-input"
                        value={group.inherits ?? ''}
                        onChange={(e) => set('inherits', e.target.value || undefined)}
                        placeholder="id группы в родительском view"
                    />
                </div>
            )}

            {/* Диспетчеризация по типу */}
            {group.type === 'block' && <BlockForm viewId={viewId} group={group} />}
            {group.type === 'tab' && <TabForm viewId={viewId} group={group} />}
            {group.type === 'form' && <FormForm viewId={viewId} group={group} />}
            {group.type === 'tabs' && <TabsForm viewId={viewId} group={group} />}
            {group.type === 'resizableblockpair' && (
                <ResizableBlockPairForm viewId={viewId} group={group} />
            )}
        </div>
    );
};