import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { UiRuleDetail } from './UiRuleDetail';
import { AddUiRuleModal } from './AddUiRuleModal';
import { deleteUiRule, getEffectLabel } from './uiRules-handlers';

export const UiRulesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(
        () => schema.uiRules.map((r) => ({
            key: `uiRule:${r.id}`,
            label: r.name || r.id,
            hint: `${r.id} · ${r.view} · ${getEffectLabel(r.effect)}`,
            badge: <span className="dc-badge dc-badge--muted">{r.effect}</span>,
        })),
        [schema.uiRules],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('uiRule:'.length))}
                title="UI-правила"
                createLabel="Создать правило"
                emptyText="Нет UI-правил"
            />

            <UiRuleDetail />

            <AddUiRuleModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить UI-правило «${pendingDelete}»?`}
                description={<p>Правило будет удалено из схемы домена.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteUiRule(doc, pendingDelete));
                    if (selectionKey === `uiRule:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};