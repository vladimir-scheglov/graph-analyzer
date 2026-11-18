import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { MenuDetail } from './MenuDetail';
import { AddMenuModal } from './AddMenuModal';
import { deleteMenu } from './menus-handlers';

export const MenusSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () => schema.menus.map((m) => ({
            key: `menu:${m.id}`,
            label: m.label || m.id,
            hint: `${m.type} · ${m.placement} · ${m.route}`,
            badge: m.type === 'root_group'
                ? <span className="dc-badge">{m.items?.length ?? 0} пунктов</span>
                : undefined,
        })),
        [schema.menus],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('menu:'.length))}
                title="Разделы меню"
                createLabel="Создать раздел"
                emptyText="Нет разделов меню"
            />

            <MenuDetail />

            <AddMenuModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить раздел «${pendingDelete}»?`}
                description={<p>Все подразделы также будут удалены.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteMenu(doc, pendingDelete));
                    if (selectionKey === `menu:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};