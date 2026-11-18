import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    WIDGET_TYPES, WidgetType, changeWidgetType, updateWidgetField,
} from './widgets-handlers';
import { AttributeWidgetForm } from './forms/AttributeWidgetForm';
import { ActionWidgetForm } from './forms/ActionWidgetForm';
import { LinkageWidgetForm } from './forms/LinkageWidgetForm';
import { SimpleWidgetForm } from './forms/SimpleWidgetForm';

interface Props {
    viewId: string;
    widget: any;
}

export const WidgetForm: FC<Props> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, field, value));

    return (
        <div>
            {/* Шапка */}
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={widget.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Тип</label>
                    <select
                        className="dc-input"
                        value={widget.type}
                        onChange={(e) => {
                            const newType = e.target.value as WidgetType;
                            if (newType === widget.type) return;
                            if (!confirm(`Сменить тип на "${newType}"? Специфичные поля будут удалены.`)) return;
                            commit((doc) => changeWidgetType(doc, viewId, widget.id, newType));
                        }}
                        disabled={isPublished}
                    >
                        {WIDGET_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={widget.description ?? ''}
                    onChange={(e) => set('description', e.target.value || undefined)}
                />
            </div>

            {/* Диспетчеризация по типу */}
            {widget.type === 'attribute' && (
                <AttributeWidgetForm viewId={viewId} widget={widget} />
            )}
            {widget.type === 'action' && (
                <ActionWidgetForm viewId={viewId} widget={widget} />
            )}
            {widget.type === 'linkage' && (
                <LinkageWidgetForm viewId={viewId} widget={widget} />
            )}
            {widget.type !== 'attribute' && widget.type !== 'action' && widget.type !== 'linkage' && (
                <SimpleWidgetForm viewId={viewId} widget={widget} />
            )}
        </div>
    );
};