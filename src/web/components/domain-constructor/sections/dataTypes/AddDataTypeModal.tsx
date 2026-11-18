import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addDataType, validateDataTypeId } from './dataType-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddDataTypeModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [kind, setKind] = useState<'Enum' | 'Workflow' | 'Table'>('Enum');

    useEffect(() => {
        if (open) { setId(''); setName(''); setKind('Enum'); }
    }, [open]);

    const idError = id ? validateDataTypeId(id, kind) : null;
    const duplicate = schema.dataTypes.some((d) => d.id === id);
    const canSubmit = !!id && !idError && !duplicate;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый пользовательский тип</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Вид</label>
                        <select
                            className="dc-input"
                            value={kind}
                            onChange={(e) => setKind(e.target.value as any)}
                        >
                            <option value="Enum">Перечисление (Enum)</option>
                            <option value="Workflow">Рабочий процесс (Workflow)</option>
                            <option value="Table">Таблица (Table)</option>
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="enumIocTypes, Priority, …"
                            autoFocus
                        />
                        {idError && <div className="dc-field__error">{idError}</div>}
                        {duplicate && <div className="dc-field__error">Тип с таким ID уже есть</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) => addDataType(doc, { id, kind, name: name || undefined }));
                            select(`dataType:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};