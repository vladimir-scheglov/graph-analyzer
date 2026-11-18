import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ViewDetail } from './ViewDetail';
import { AddViewModal } from './AddViewModal';
import { deleteView } from './views-handlers';

export const ViewsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>('');

    const items = useMemo(() => {
        const list = schema.views.filter((v) => !filterType || v.type === filterType);
        return list.map((v) => ({
            key: `view:${v.id}`,
            label: v.label || v.id,
            hint: v.id,
            badge: <span className="dc-badge dc-badge--muted">{v.type}</span>,
        }));
    }, [schema.views, filterType]);

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('view:'.length))}
                title="Представления"
                createLabel="Создать представление"
                emptyText="Нет представлений"
            />

            <ViewDetail />

            <AddViewModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить представление «${pendingDelete}»?`}
                description={
                    <p>
                        Действия, меню, ссылки в схемах — все ссылки на это представление
                        станут битыми.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteView(doc, pendingDelete));
                    if (selectionKey === `view:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};