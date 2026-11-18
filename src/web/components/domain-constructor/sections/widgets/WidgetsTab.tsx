import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { ViewSchema } from '../../types';
import {
    deleteWidget, getWidgetTypeLabel,
} from './widgets-handlers';
import { AddWidgetModal } from './AddWidgetModal';
import { WidgetForm } from './WidgetForm';

interface Props {
    view: ViewSchema;
}

export const WidgetsTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterType, setFilterType] = useState('');

    const widgets = ((view as any).widgets ?? []) as any[];

    const filtered = useMemo(
        () => widgets.filter((w) => !filterType || w.type === filterType),
        [widgets, filterType],
    );

    const selectedId = selectionKey?.startsWith(`view:${view.id}/widget:`)
        ? selectionKey.slice(`view:${view.id}/widget:`.length)
        : null;
    const selected = selectedId ? widgets.find((w) => w.id === selectedId) : null;

    return (
        <div>
            <div className="dc-attributes-tab__toolbar">
                <button className="dc-btn dc-btn--primary" onClick={() => setAddOpen(true)}>
                    + Виджет
                </button>
                <select
                    className="dc-input dc-input--inline"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Все типы</option>
                    {[...new Set(widgets.map((w) => w.type))].map((t) => (
                        <option key={t} value={t}>{getWidgetTypeLabel(t)}</option>
                    ))}
                </select>
            </div>

            {filtered.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет виджетов</div>
            )}

            {filtered.length > 0 && (
                <table className="dc-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Тип</th>
                            <th>Описание</th>
                            <th style={{ width: 60 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((w) => (
                            <tr
                                key={w.id}
                                className={w.id === selectedId ? 'dc-table__row--selected' : ''}
                                onClick={() => select(`view:${view.id}/widget:${w.id}`)}
                            >
                                <td><code className="dc-code">{w.id}</code></td>
                                <td>
                                    <span className="dc-badge dc-badge--muted">{w.type}</span>
                                </td>
                                <td>{w.description || <span className="dc-muted">—</span>}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => setPendingDelete(w.id)}
                                    >×</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selected && (
                <div className="dc-attributes-tab__form" style={{ marginTop: 16 }}>
                    <WidgetForm viewId={view.id} widget={selected} />
                </div>
            )}

            <AddWidgetModal
                open={addOpen}
                viewId={view.id}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить виджет «${pendingDelete}»?`}
                description={
                    <p>
                        Виджет будет удалён. Если он используется в группах или карточках —
                        эти ссылки станут битыми.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteWidget(doc, view.id, pendingDelete));
                    if (selectionKey === `view:${view.id}/widget:${pendingDelete}`) {
                        select(`view:${view.id}`);
                    }
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};