import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addMixin, validateMixinId } from './mixins-handlers';

interface Props { open: boolean; onClose: () => void }

export const AddMixinModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [type, setType] = useState<'linkage' | 'view'>('view');

    useEffect(() => {
        if (open) { setId(''); setType('view'); }
    }, [open]);

    const idErr = id ? validateMixinId(id) : null;
    const dup = schema.mixins.some((m) => m.id === id);
    const canSubmit = !!id && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая примесь</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип</label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as 'linkage' | 'view')}
                        >
                            <option value="view">view (компоненты интерфейса)</option>
                            <option value="linkage">linkage (на основе связи)</option>
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) => addMixin(doc, { id, type }));
                            select(`mixin:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};