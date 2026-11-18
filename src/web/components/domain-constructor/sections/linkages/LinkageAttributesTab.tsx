import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { LinkageSchema, AttributeSchema } from '../../types';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { AttributeForm } from '../entities/AttributeForm';
import { deleteAttribute } from '../entities/entity-handlers';
import { AddLinkageAttributeModal } from './AddLinkageAttributeModal';

interface Props {
    linkage: LinkageSchema;
}

export const LinkageAttributesTab: FC<Props> = ({ linkage }) => {
    const commit = useEditorStore((s) => s.commit);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const attrs = linkage.attributes ?? [];
    const selectedId = selectionKey?.startsWith(`linkage:${linkage.id}/attribute:`)
        ? selectionKey.slice(`linkage:${linkage.id}/attribute:`.length)
        : null;
    const selected = selectedId ? attrs.find((a) => a.id === selectedId) : null;

    return (
        <div>
            <div className="dc-attributes-tab__toolbar">
                <button className="dc-btn dc-btn--primary" onClick={() => setAddOpen(true)}>
                    + Атрибут связи
                </button>
            </div>

            {attrs.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет атрибутов связи</div>
            )}

            {attrs.length > 0 && (
                <table className="dc-table">
                    <thead>
                        <tr>
                            <th>Название</th>
                            <th>ID</th>
                            <th>Тип</th>
                            <th style={{ width: 80 }}>Поиск</th>
                            <th style={{ width: 60 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {attrs.map((a) => (
                            <tr
                                key={a.id}
                                className={a.id === selectedId ? 'dc-table__row--selected' : ''}
                                onClick={() => select(`linkage:${linkage.id}/attribute:${a.id}`)}
                            >
                                <td>{a.name || <span className="dc-muted">—</span>}</td>
                                <td><code className="dc-code">{a.id}</code></td>
                                <td>{a.dataType}</td>
                                <td>
                                    <input
                                        type="checkbox"
                                        className="dc-checkbox"
                                        checked={a.searchable !== false}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) =>
                                            commit((doc) => {
                                                const lIdx = findLinkageIdx(doc, linkage.id);
                                                if (lIdx < 0) return;
                                                const attrs = doc.get(['linkages', lIdx, 'attributes']) as any[];
                                                const aIdx = attrs.findIndex((x) => x && x.id === a.id);
                                                if (aIdx < 0) return;
                                                doc.set(
                                                    ['linkages', lIdx, 'attributes', aIdx, 'searchable'],
                                                    e.target.checked,
                                                );
                                            })
                                        }
                                    />
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => setPendingDelete(a.id)}
                                    >×</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selected && (
                <div className="dc-attributes-tab__form">
                    <AttributeForm
                        ownerType="linkage"
                        ownerId={linkage.id}
                        attribute={selected}
                        mode="edit"
                        hideReadonly
                    />
                </div>
            )}

            <AddLinkageAttributeModal
                open={addOpen}
                linkageId={linkage.id}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить атрибут связи «${pendingDelete}»?`}
                description={<p>Ссылки на него в виджетах/колонках станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteAttribute(doc, 'linkage', linkage.id, pendingDelete));
                    if (selectionKey === `linkage:${linkage.id}/attribute:${pendingDelete}`) {
                        select(`linkage:${linkage.id}`);
                    }
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};

function findLinkageIdx(doc: any, id: string): number {
    const arr = doc.get(['linkages']);
    return Array.isArray(arr) ? arr.findIndex((l: any) => l && l.id === id) : -1;
}