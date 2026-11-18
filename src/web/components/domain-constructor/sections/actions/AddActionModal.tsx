import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import {
    ACTION_TYPES, ActionType, TYPES_WITH_ENTITY,
    addAction, validateActionId, getActionTypeLabel,
} from './actions-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddActionModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [type, setType] = useState<ActionType>('open_modal');
    const [entity, setEntity] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setId(''); setName(''); setType('open_modal'); setEntity(null);
        }
    }, [open]);

    const idErr = id ? validateActionId(id) : null;
    const dup = schema.actions.some((a) => a.id === id);
    const needsEntity = TYPES_WITH_ENTITY.includes(type);
    const canSubmit = !!id && !idErr && !dup && (!needsEntity || !!entity);

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новое действие</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="actions.createIoc, actions.bulkRemove, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Тип <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as ActionType)}
                        >
                            {ACTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    {needsEntity && (
                        <div className="dc-field">
                            <label className="dc-field__label">
                                Сущность <span className="dc-field__required">*</span>
                            </label>
                            <EntitySelect
                                value={entity}
                                onChange={setEntity}
                                placeholder="— выберите —"
                            />
                        </div>
                    )}
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addAction(doc, { id, type, name: name || undefined, entity: entity ?? undefined }),
                            );
                            select(`action:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};