import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { TransitiveDetail } from './TransitiveDetail';
import { AddTransitiveModal } from './AddTransitiveModal';
import { deleteTransitive } from './transitiveLinkages-handlers';

export const TransitiveLinkagesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () =>
            schema.transitiveLinkages.map((t) => ({
                key: `transitive:${t.id}`,
                label: t.id,
                hint: `${short(t.entity)} · ${t.joins.length} связей`,
            })),
        [schema.transitiveLinkages],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('transitive:'.length))}
                title="Транзитивные связи"
                createLabel="Создать дерево"
                emptyText="Нет транзитивных связей"
            />

            <TransitiveDetail />

            <AddTransitiveModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить транзитивную связь «${pendingDelete}»?`}
                description={<p>Все узлы дерева будут удалены.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteTransitive(doc, pendingDelete));
                    if (selectionKey === `transitive:${pendingDelete}`) select(null);
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