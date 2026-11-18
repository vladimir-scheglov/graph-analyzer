import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ActionDetail } from './ActionDetail';
import { AddActionModal } from './AddActionModal';
import { deleteAction, getActionTypeLabel } from './actions-handlers';

export const ActionsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>('');

    const items = useMemo(() => {
        const list = schema.actions.filter(
            (a) => !filterType || a.type === filterType,
        );
        return list.map((a) => ({
            key: `action:${a.id}`,
            label: a.name || a.id,
            hint: `${a.id} · ${getActionTypeLabel(a.type)}`,
            badge: <span className="dc-badge dc-badge--muted">{a.type}</span>,
        }));
    }, [schema.actions, filterType]);

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('action:'.length))}
                title="Действия"
                createLabel="Создать действие"
                emptyText="Нет действий"
            />

            <ActionDetail />

            <AddActionModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить действие «${pendingDelete}»?`}
                description={
                    <p>
                        Виджеты, ссылающиеся на это действие, станут битыми. Ссылки в
                        меню/панелях/колонках не будут работать.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteAction(doc, pendingDelete));
                    if (selectionKey === `action:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};