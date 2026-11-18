import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    GROUP_TYPES, GroupType, addGroup, validateGroupId,
} from './groups-handlers';

interface Props {
    open: boolean;
    viewId: string;
    onClose: () => void;
}

export const AddGroupModal: FC<Props> = ({ open, viewId, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [type, setType] = useState<GroupType>('block');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) { setId(''); setType('block'); setDescription(''); }
    }, [open]);

    const view = schema.views.find((v) => v.id === viewId);
    const groups = ((view as any)?.groups ?? []) as any[];
    const idErr = id ? validateGroupId(id) : null;
    const dup = groups.some((g) => g.id === id);
    const canSubmit = !!id && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая группа</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as GroupType)}
                        >
                            {GROUP_TYPES.map((t) => (
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
                            placeholder="blocks.info, tabs.main, forms.new, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
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
                                addGroup(doc, viewId, { id, type, description: description || undefined }),
                            );
                            select(`view:${viewId}/group:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};