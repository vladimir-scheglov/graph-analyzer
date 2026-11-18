import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { TreeForm } from './TreeForm';
import { AddTreeModal } from './AddTreeModal';
import { deleteTree } from './trees-handlers';

export const TreesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () => schema.trees.map((t) => ({
            key: `tree:${t.id}`,
            label: t.name || t.id,
            hint: `${t.id} · ${t.type} · root: ${short(t.hierarchy?.entity ?? '')}`,
        })),
        [schema.trees],
    );

    const selectedId = selectionKey?.startsWith('tree:') ? selectionKey.slice('tree:'.length) : null;
    const selected = selectedId ? schema.trees.find((t) => t.id === selectedId) : null;

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('tree:'.length))}
                title="Деревья связей"
                createLabel="Создать дерево"
                emptyText="Нет деревьев"
            />

            {selected ? (
                <TreeForm tree={selected} />
            ) : (
                <div className="dc-detail dc-detail--empty">
                    <p>Выберите дерево слева</p>
                </div>
            )}

            <AddTreeModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить дерево «${pendingDelete}»?`}
                description={<p>View-деревья, ссылающиеся на него, станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteTree(doc, pendingDelete));
                    if (selectionKey === `tree:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};

function short(fqid: string): string {
    const slash = fqid.lastIndexOf('/');
    return slash < 0 ? fqid : fqid.slice(slash + 1);
}