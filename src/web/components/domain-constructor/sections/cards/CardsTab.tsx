import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { ViewSchema } from '../../types';
import { deleteCard, CARD_TYPES } from './cards-handlers';
import { AddCardModal } from './AddCardModal';
import { CardForm } from './CardForm';

interface Props {
    view: ViewSchema;
}

export const CardsTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterType, setFilterType] = useState('');

    const cards = ((view as any).views ?? []) as any[];
    const filtered = useMemo(
        () => cards.filter((c) => !filterType || c.type === filterType),
        [cards, filterType],
    );

    const selectedId = selectionKey?.startsWith(`view:${view.id}/card:`)
        ? selectionKey.slice(`view:${view.id}/card:`.length)
        : null;
    const selected = selectedId ? cards.find((c) => c.id === selectedId) : null;

    return (
        <div>
            <div className="dc-attributes-tab__toolbar">
                <button className="dc-btn dc-btn--primary" onClick={() => setAddOpen(true)}>
                    + Карточка
                </button>
                <select
                    className="dc-input dc-input--inline"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="">Все типы</option>
                    {CARD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
            </div>

            {filtered.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет карточек</div>
            )}

            {filtered.length > 0 && (
                <table className="dc-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Лейбл</th>
                            <th>Тип</th>
                            <th style={{ width: 60 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((c) => (
                            <tr
                                key={c.id}
                                className={c.id === selectedId ? 'dc-table__row--selected' : ''}
                                onClick={() => select(`view:${view.id}/card:${c.id}`)}
                            >
                                <td><code className="dc-code">{c.id}</code></td>
                                <td>{c.label || <span className="dc-muted">—</span>}</td>
                                <td><span className="dc-badge dc-badge--muted">{c.type}</span></td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => setPendingDelete(c.id)}
                                    >×</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selected && (
                <div className="dc-attributes-tab__form" style={{ marginTop: 16 }}>
                    <CardForm viewId={view.id} card={selected} />
                </div>
            )}

            <AddCardModal
                open={addOpen}
                viewId={view.id}
                onClose={() => setAddOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить карточку «${pendingDelete}»?`}
                description={
                    <p>
                        Карточка будет удалена. Ссылки на неё из действий (open_panel /
                        open_modal / open_page) станут битыми.
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteCard(doc, view.id, pendingDelete));
                    if (selectionKey === `view:${view.id}/card:${pendingDelete}`) {
                        select(`view:${view.id}`);
                    }
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};