import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { EntityDetail } from './EntityDetail';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { deleteEntity } from './entity-handlers';
import { AddEntityModal } from './AddEntityModal';
import { useState } from 'react';
import { toast } from '../../ui/toast';

export const EntitiesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = useMemo(() => {
        // Собственные сущности
        const own = schema.entities.map((e) => ({
            key: `entity:${e.id}`,
            label: e.name || e.id,
            hint: e.id,
            badge: e.inherits ? <span className="dc-badge dc-badge--muted">наследует</span> : undefined,
        }));

        // Дочерние из ModelIndex (read-only)
        const ownIds = new Set(schema.entities.map((e) => e.id));
        const children = (Object.values(modelIndex.entityChildrenByFqid) as string[][])
            .flat()
            .map((fqid) => fqid.toLowerCase())
            .filter((fqid) => fqid.startsWith(`${schema.metadata.id.toLowerCase()}/`))
            .map((fqid) => fqid.split('/')[1])
            .filter((id) => !ownIds.has(id))
            .map((id) => {
                const entity = modelIndex.entitiesByFqid[
                    `${schema.metadata.id.toLowerCase()}/${id}`
                ] as any;
                return {
                    key: `entity:${id}`,
                    label: entity?.name ?? id,
                    hint: id,
                    badge: <span className="dc-badge dc-badge--muted">из ModelIndex</span>,
                    disabled: true,
                };
            });

        return [...own, ...children];
    }, [schema, modelIndex]);

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(key) => setPendingDelete(key.slice('entity:'.length))}
                title="Сущности"
                createLabel="Создать сущность"
                emptyText="Нет сущностей"
            />

            <EntityDetail />

            <AddEntityModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить сущность «${pendingDelete}»?`}
                description={
                    <div>
                        <p>Все атрибуты и правила сортировки сущности будут удалены.</p>
                        <p className="dc-muted">
                            Ссылки на эту сущность из других элементов (связи, виджеты, правила)
                            останутся в схеме и станут битыми.
                        </p>
                    </div>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteEntity(doc, pendingDelete));
                    if (selectionKey === `entity:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                    toast.success(`Сущность «${pendingDelete}» удалена`);
                }}
            />
        </div>
    );
};