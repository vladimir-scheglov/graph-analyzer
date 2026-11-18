import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySchema, AttributeSchema } from '../../types';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { AddAttributeModal } from './AddAttributeModal';
import { AttributeForm } from './AttributeForm';
import { deleteAttribute } from './entity-handlers';
import { useInheritedAttributes } from './use-inherited-attributes';
import { toast } from '../../ui/toast';

interface Props {
    entity: EntitySchema;
}

export const AttributesTab: FC<Props> = ({ entity }) => {
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const inherited = useInheritedAttributes(entity, modelIndex);

    // Выделенный атрибут (собственный или унаследованный)
    const selectedAttrId = selectionKey?.startsWith(`entity:${entity.id}/attribute:`)
        ? selectionKey.slice(`entity:${entity.id}/attribute:`.length)
        : null;

    const ownAttr = selectedAttrId
        ? entity.attributes.find((a) => a.id === selectedAttrId) ?? null
        : null;
    const inheritedAttr = selectedAttrId
        ? inherited.find((a) => a.attr.id === selectedAttrId) ?? null
        : null;

    const openForm = (attrId: string) => {
        select(`entity:${entity.id}/attribute:${attrId}`);
    };

    return (
        <div className="dc-attributes-tab">
            <div className="dc-attributes-tab__table-block">
                <div className="dc-attributes-tab__toolbar">
                    <button className="dc-btn dc-btn--primary" onClick={() => setAddOpen(true)}>
                        + Атрибут
                    </button>
                </div>

                <table className="dc-table">
                    <thead>
                        <tr>
                            <th>Название</th>
                            <th>ID</th>
                            <th>Тип</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Собственные */}
                        {entity.attributes.map((attr) => (
                            <tr
                                key={attr.id}
                                className={attr.id === selectedAttrId ? 'dc-table__row--selected' : ''}
                                onClick={() => openForm(attr.id)}
                            >
                                <td>{attr.name || <span className="dc-muted">—</span>}</td>
                                <td><code className="dc-code">{attr.id}</code></td>
                                <td>{attr.dataType}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => setPendingDelete(attr.id)}
                                        title="Удалить"
                                    >×</button>
                                </td>
                            </tr>
                        ))}

                        {/* Унаследованные */}
                        {inherited.length > 0 && (
                            <>
                                <tr className="dc-table__group-row">
                                    <td colSpan={4}>
                                        <span className="dc-badge dc-badge--inherited">
                                            Унаследовано ({inherited.length}) — read-only
                                        </span>
                                    </td>
                                </tr>
                                {inherited.map(({ attr, from }) => (
                                    <tr
                                        key={attr.id}
                                        className={
                                            'dc-table__row--inherited' +
                                            (attr.id === selectedAttrId ? ' dc-table__row--selected' : '')
                                        }
                                        onClick={() => openForm(attr.id)}
                                    >
                                        <td>{attr.name || <span className="dc-muted">—</span>}</td>
                                        <td><code className="dc-code">{attr.id}</code></td>
                                        <td>{attr.dataType}</td>
                                        <td>
                                            <span className="dc-muted" title={`От: ${from}`}>🔒</span>
                                        </td>
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Форма выбранного атрибута */}
            {ownAttr && (
                <div className="dc-attributes-tab__form">
                    <AttributeForm
                        ownerType="entity"
                        ownerId={entity.id}
                        attribute={ownAttr}
                        mode="edit"
                    />
                </div>
            )}
            {inheritedAttr && (
                <div className="dc-attributes-tab__form">
                    <AttributeForm
                        ownerType="entity"
                        ownerId={entity.id}
                        attribute={inheritedAttr.attr}
                        mode="inherited"
                        inheritedFrom={inheritedAttr.from}
                    />
                </div>
            )}

            <AddAttributeModal
                open={addOpen}
                entityId={entity.id}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить атрибут «${pendingDelete}»?`}
                description={
                    <p>
                        Атрибут будет удалён из сущности. Ссылки на него в виджетах,
                        правилах и фильтрах останутся и станут битыми.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    const attrId = pendingDelete;
                    commit((doc) => deleteAttribute(doc, "entity", entity.id, attrId));
                    if (selectionKey === `entity:${entity.id}/attribute:${attrId}`) {
                        select(`entity:${entity.id}`);
                    }
                    setPendingDelete(null);
                    toast.success(`Атрибут «${attrId}» удалён`);
                }}
            />
        </div>
    );
};