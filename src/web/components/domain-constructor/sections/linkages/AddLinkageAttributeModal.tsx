import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addAttribute, validateDataId } from '../entities/entity-handlers';

interface Props {
    open: boolean;
    linkageId: string;
    onClose: () => void;
}

const LINKAGE_TYPES = [
    'Timestamp', 'Date', 'Time', 'TimestampRange',
    'MAC', 'IpAddress', 'CIDR', 'Bool',
    'Uuid', 'String', 'Text',
    'Integer', 'Decimal', 'Float',
    'Attachment', 'Reference', 'Enum', 'Workflow',
];

export const AddLinkageAttributeModal: FC<Props> = ({ open, linkageId, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [dataType, setDataType] = useState('String');

    useEffect(() => {
        if (open) { setId(''); setDataType('String'); }
    }, [open]);

    const linkage = schema.linkages.find((l) => l.id === linkageId);
    const idErr = id ? validateDataId(id) : null;
    const dup = linkage?.attributes?.some((a) => a.id === id);
    const canSubmit = !!id && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый атрибут связи</h3>
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
                        <label className="dc-field__label">Тип</label>
                        <select
                            className="dc-input"
                            value={dataType}
                            onChange={(e) => setDataType(e.target.value)}
                        >
                            {LINKAGE_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addAttribute(doc, 'linkage', linkageId, { id, dataType }),
                            );
                            select(`linkage:${linkageId}/attribute:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};