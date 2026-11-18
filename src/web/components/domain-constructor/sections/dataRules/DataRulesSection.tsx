import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { DataRuleDetail } from './DataRuleDetail';
import { AddDataRuleModal } from './AddDataRuleModal';
import { deleteDataRule, getEffectLabel } from './dataRules-handlers';

export const DataRulesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterEffect, setFilterEffect] = useState('');

    const rules = useMemo(() => {
        return schema.dataRules.filter((r) => !filterEffect || (r as any).effect === filterEffect);
    }, [schema.dataRules, filterEffect]);

    const items = useMemo(
        () => rules.map((r) => ({
            key: `dataRule:${r.id}`,
            label: r.name || r.id,
            hint: r.id,
            badge: <span className="dc-badge dc-badge--muted">{r.effect ?? '—'}</span>,
        })),
        [rules],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('dataRule:'.length))}
                title="Правила данных"
                createLabel="Создать правило"
                emptyText="Нет правил"
            />

            <DataRuleDetail />

            <AddDataRuleModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить правило «${pendingDelete}»?`}
                description={<p>Правило будет удалено из схемы домена.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteDataRule(doc, pendingDelete));
                    if (selectionKey === `dataRule:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};