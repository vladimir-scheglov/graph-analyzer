import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import { addTransitive, findTransitiveIndex } from './transitiveLinkages-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddTransitiveModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [entity, setEntity] = useState<string | null>(null);
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) { setId(''); setEntity(null); setDescription(''); }
    }, [open]);

    const idErr = id && !/^[A-Za-z][A-Za-z0-9_]*$/.test(id)
        ? 'Только латинские буквы, цифры и _'
        : null;
    const dup = schema.transitiveLinkages.some((t) => t.id === id);
    const canSubmit = !!id && !!entity && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая транзитивная связь</h3>
                <div className="dc-modal__body">
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
                    <div className="dc-field">
                        <label className="dc-field__label">Корневая сущность <span className="dc-field__required">*</span></label>
                        <EntitySelect value={entity} onChange={setEntity} />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <input
                            className="dc-input"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
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
                                addTransitive(doc, { id, entity: entity!, description: description || undefined }),
                            );
                            select(`transitive:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};