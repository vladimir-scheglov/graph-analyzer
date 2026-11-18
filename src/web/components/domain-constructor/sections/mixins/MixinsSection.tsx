import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { MixinForm } from './MixinForm';
import { AddMixinModal } from './AddMixinModal';
import { deleteMixin } from './mixins-handlers';

export const MixinsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () => schema.mixins.map((m) => ({
            key: `mixin:${m.id}`,
            label: m.name || m.id,
            hint: `${m.id} · ${m.type}`,
            badge: <span className="dc-badge dc-badge--muted">{m.type}</span>,
        })),
        [schema.mixins],
    );

    const selectedId = selectionKey?.startsWith('mixin:') ? selectionKey.slice('mixin:'.length) : null;
    const selected = selectedId ? schema.mixins.find((m) => m.id === selectedId) : null;

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('mixin:'.length))}
                title="Примеси"
                createLabel="Создать примесь"
                emptyText="Нет примесей"
            />

            {selected ? (
                <MixinForm mixin={selected} />
            ) : (
                <div className="dc-detail dc-detail--empty">
                    <p>Выберите примесь слева</p>
                </div>
            )}

            <AddMixinModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить примесь «${pendingDelete}»?`}
                description={<p>Все расширения этой примеси будут удалены.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteMixin(doc, pendingDelete));
                    if (selectionKey === `mixin:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};