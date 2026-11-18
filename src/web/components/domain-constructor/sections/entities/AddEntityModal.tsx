import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { EntitySelect } from '../../ui/EntitySelect';
import { addEntity, validateEntityId } from './entity-handlers';
import { toast } from '../../ui/toast';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddEntityModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [inherits, setInherits] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setId(''); setName(''); setInherits(null); }
    }, [open]);

    const idError = id ? validateEntityId(id) : null;
    const duplicate = schema.entities.some((e) => e.id === id);
    const canSubmit = !!id && !idError && !duplicate;

    if (!open) return null;

    const handleSubmit = () => {
        if (!canSubmit) return;
        commit((doc) => addEntity(doc, { id, name: name || undefined, inherits }));
        select(`entity:${id}`);
        toast.success(`Сущность «${id}» создана`);
        onClose();
    };

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая сущность</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="Asset, DeviceConfiguration, …"
                            autoFocus
                        />
                        {idError && <div className="dc-field__error">{idError}</div>}
                        {duplicate && <div className="dc-field__error">Сущность с таким ID уже есть</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Отображаемое имя"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Родитель</label>
                        <EntitySelect value={inherits} onChange={setInherits} placeholder="— нет —" />
                        <div className="dc-field__hint">
                            При наследовании атрибуты и интерфейсы родителя станут read-only.
                        </div>
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        Создать
                    </button>
                </div>
            </div>
        </div>
    );
};