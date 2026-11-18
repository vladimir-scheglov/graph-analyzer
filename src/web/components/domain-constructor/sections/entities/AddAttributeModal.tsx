import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addAttribute, validateDataId } from './entity-handlers';

interface Props {
    open: boolean;
    entityId: string;
    onClose: () => void;
}

const DATA_TYPES = [
    'Timestamp', 'Date', 'Time', 'TimestampRange',
    'MAC', 'IpAddress', 'CIDR', 'Bool',
    'Uuid', 'String', 'Text',
    'Integer', 'Decimal', 'Float',
    'Attachment', 'Reference', 'Array', 'Counter', 'Identifier',
    'Table', 'Enum', 'Workflow',
];

export const AddAttributeModal: FC<Props> = ({ open, entityId, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [dataType, setDataType] = useState('String');

    useEffect(() => {
        if (open) { setId(''); setName(''); setDataType('String'); }
    }, [open]);

    const entity = schema.entities.find((e) => e.id === entityId);
    const idError = id ? validateDataId(id) : null;
    const duplicate = entity?.attributes.some((a) => a.id === id);
    const canSubmit = !!id && !idError && !duplicate && !!entity;

    if (!open) return null;

    const handleSubmit = () => {
        if (!canSubmit) return;
        commit((doc) => addAttribute(doc, "entity", entityId, { id, dataType, name: name || undefined }));
        select(`entity:${entityId}/attribute:${id}`);
        onClose();
    };

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый атрибут — {entityId}</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="deviceName, updatedAt, …"
                            autoFocus
                        />
                        {idError && <div className="dc-field__error">{idError}</div>}
                        {duplicate && <div className="dc-field__error">Атрибут с таким ID уже есть</div>}
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
                        <label className="dc-field__label">Тип данных <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={dataType}
                            onChange={(e) => setDataType(e.target.value)}
                        >
                            {DATA_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
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