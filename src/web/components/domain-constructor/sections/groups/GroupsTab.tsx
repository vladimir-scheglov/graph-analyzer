import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { ViewSchema } from '../../types';
import { deleteGroup, getGroupTypeLabel } from './groups-handlers';
import { AddGroupModal } from './AddGroupModal';
import { GroupForm } from './GroupForm';

interface Props {
    view: ViewSchema;
}

export const GroupsTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterType, setFilterType] = useState('');

    const groups = ((view as any).groups ?? []) as any[];

    const filtered = useMemo(
        () => groups.filter((g) => !filterType || g.type === filterType),
        [groups, filterType],
    );

    const selectedId = selectionKey?.startsWith(`view:${view.id}/group:`)
        ? selectionKey.slice(`view:${view.id}/group:`.length)
        : null;
    const selected = selectedId ? groups.find((g) => g.id === selectedId) : null;

    return (
        <div>
            <div className="dc-attributes-tab__toolbar">
                <button className="dc-btn dc-btn--primary" onClick={() => setAddOpen(true)}>
                    + Группа
                </button>
                <select
                    className="dc-input dc-input--inline"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Все типы</option>
                    {[...new Set(groups.map((g) => g.type))].map((t) => (
                        <option key={t} value={t}>{getGroupTypeLabel(t)}</option>
                    ))}
                </select>
            </div>

            {filtered.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет групп</div>
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
                        {filtered.map((g) => (
                            <tr
                                key={g.id}
                                className={g.id === selectedId ? 'dc-table__row--selected' : ''}
                                onClick={() => select(`view:${view.id}/group:${g.id}`)}
                            >
                                <td><code className="dc-code">{g.id}</code></td>
                                <td>
                                    <span className="dc-badge dc-badge--muted">{g.type}</span>
                                </td>
                                <td>{g.description || <span className="dc-muted">—</span>}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => setPendingDelete(g.id)}
                                    >×</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selected && (
                <div className="dc-attributes-tab__form" style={{ marginTop: 16 }}>
                    <GroupForm viewId={view.id} group={selected} />
                </div>
            )}

            <AddGroupModal
                open={addOpen}
                viewId={view.id}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить группу «${pendingDelete}»?`}
                description={
                    <p>
                        Группа будет удалена. Ссылки из карточек (panel/modal/page) и из
                        других групп на неё станут битыми.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteGroup(doc, view.id, pendingDelete));
                    if (selectionKey === `view:${view.id}/group:${pendingDelete}`) {
                        select(`view:${view.id}`);
                    }
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};