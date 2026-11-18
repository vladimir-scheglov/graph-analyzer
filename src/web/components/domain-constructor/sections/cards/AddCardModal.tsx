import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    CARD_TYPES, CardType, addCard, validateCardId,
} from './cards-handlers';

interface Props {
    open: boolean;
    viewId: string;
    onClose: () => void;
}

export const AddCardModal: FC<Props> = ({ open, viewId, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [type, setType] = useState<CardType>('panel');
    const [label, setLabel] = useState('');

    useEffect(() => {
        if (open) { setId(''); setType('panel'); setLabel(''); }
    }, [open]);

    const view = schema.views.find((v) => v.id === viewId);
    const cards = ((view as any)?.views ?? []) as any[];
    const idErr = id ? validateCardId(id) : null;
    const dup = cards.some((c) => c.id === id);
    const canSubmit = !!id && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая карточка</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as CardType)}
                        >
                            {CARD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="panels.info, forms.new, pages.full, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Лейбл</label>
                        <input
                            className="dc-input"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addCard(doc, viewId, { id, type, label: label || undefined }),
                            );
                            select(`view:${viewId}/card:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};