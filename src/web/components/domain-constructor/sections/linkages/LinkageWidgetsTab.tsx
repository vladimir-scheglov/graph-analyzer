import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { LinkageSchema } from '../../types';

interface Props {
    linkage: LinkageSchema;
}

/**
 * Виджеты связи создаются в разделе «Формы» — здесь только read-only список.
 * Источник: ModelIndex.viewWidgets, где type=linkage и linkage===linkage.id.
 * Если ModelIndex ещё не содержит только что созданных — их не показываем.
 */
export const LinkageWidgetsTab: FC<Props> = ({ linkage }) => {
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const widgets = (modelIndex.viewWidgets ?? []).filter(
        (w: any) => w.type === 'linkage' && w.linkage === linkage.id,
    );

    if (widgets.length === 0) {
        return (
            <div className="dc-muted dc-constraints__empty">
                Нет виджетов, использующих эту связь.
                <br />
                Создать виджет можно в разделе «Формы → Виджеты».
            </div>
        );
    }

    return (
        <table className="dc-table">
            <thead>
                <tr>
                    <th>ID виджета</th>
                    <th>View</th>
                    <th>Сторона</th>
                </tr>
            </thead>
            <tbody>
                {widgets.map((w: any) => (
                    <tr key={w.id}>
                        <td><code className="dc-code">{w.id}</code></td>
                        <td>{w.parentViewId}</td>
                        <td>{w.side ?? '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};