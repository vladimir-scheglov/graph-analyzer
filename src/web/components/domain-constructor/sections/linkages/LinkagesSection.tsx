import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { LinkageDetail } from './LinkageDetail';
import { AddLinkageModal } from './AddLinkageModal';
import { deleteLinkage } from './linkages-handlers';

export const LinkagesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () =>
            schema.linkages.map((l) => ({
                key: `linkage:${l.id}`,
                label: l.name || l.id,
                hint: `${short(l.side1)} → ${short(l.side2)} · ${l.type}${l.undirected ? ' ⇄' : ''}`,
            })),
        [schema.linkages],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('linkage:'.length))}
                title="Связи"
                createLabel="Создать связь"
                emptyText="Нет связей"
            />

            <LinkageDetail />

            <AddLinkageModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить связь «${pendingDelete}»?`}
                description={
                    <p>
                        Связь будет удалена. Все виджеты, ссылающиеся на неё, станут битыми.
                        Если связь используется в дереве — дерево будет некорректным.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteLinkage(doc, pendingDelete));
                    if (selectionKey === `linkage:${pendingDelete}`) select(null);
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