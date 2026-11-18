import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateWidgetField } from '../widgets-handlers';

interface Props {
    viewId: string;
    widget: any;
}

/**
 * Для типов: history, runs_history, comments, join, card, conversation,
 * linkage_list, linkedobjectsgroups, visualization.
 *
 * Минимальный набор полей + подсказка «расширенные настройки — в следующем релизе».
 */
export const SimpleWidgetForm: FC<Props> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, field, value));

    switch (widget.type) {
        case 'history':
            return (
                <div className="dc-field">
                    <label className="dc-field__label">eventStorageId</label>
                    <input
                        className="dc-input"
                        value={widget.eventStorageId ?? ''}
                        onChange={(e) => set('eventStorageId', e.target.value)}
                    />
                </div>
            );

        case 'runs_history':
            return (
                <div className="dc-muted dc-constraints__empty">
                    Настройки playbooks (include/exclude) — в следующем релизе.
                </div>
            );

        case 'comments':
            return (
                <div className="dc-muted dc-constraints__empty">
                    Виджет комментариев не требует настройки.
                </div>
            );

        case 'join':
            return (
                <div>
                    <div className="dc-field">
                        <label className="dc-field__label">joinId</label>
                        <input
                            className="dc-input"
                            value={widget.joinId ?? ''}
                            onChange={(e) => set('joinId', e.target.value)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Атрибут (если не aggregate)</label>
                        <input
                            className="dc-input"
                            value={widget.attribute ?? ''}
                            onChange={(e) => set('attribute', e.target.value || undefined)}
                        />
                    </div>
                </div>
            );

        case 'card':
            return (
                <div>
                    <div className="dc-field">
                        <label className="dc-field__label">icon</label>
                        <input
                            className="dc-input"
                            value={widget.icon ?? ''}
                            onChange={(e) => set('icon', e.target.value || undefined)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">action</label>
                        <input
                            className="dc-input"
                            value={widget.action ?? ''}
                            onChange={(e) => set('action', e.target.value)}
                        />
                    </div>
                </div>
            );

        case 'conversation':
            return (
                <div className="dc-field">
                    <label className="dc-field__label">linkage</label>
                    <input
                        className="dc-input"
                        value={widget.linkage ?? ''}
                        onChange={(e) => set('linkage', e.target.value)}
                    />
                </div>
            );

        case 'linkage_list':
            return (
                <div className="dc-muted dc-constraints__empty">
                    Настройки linkage_list (entity_lists, rules) — в следующем релизе.
                </div>
            );

        case 'linkedobjectsgroups':
            return (
                <div className="dc-muted dc-constraints__empty">
                    Настройки linkedobjectsgroups — в следующем релизе.
                </div>
            );

        case 'visualization':
            return (
                <div className="dc-muted dc-constraints__empty">
                    Настройки visualization (chartType, RQL, nameMapping) — в следующем релизе.
                </div>
            );

        default:
            return (
                <div className="dc-muted dc-constraints__empty">
                    Тип {widget.type} — расширенные настройки в следующем релизе.
                </div>
            );
    }
};