import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addMenu, validateMenuId } from './menus-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddMenuModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [label, setLabel] = useState('');
    const [type, setType] = useState<'root_group' | 'root_menu'>('root_group');
    const [placement, setPlacement] = useState<'top' | 'settings'>('top');

    useEffect(() => {
        if (open) { setId(''); setLabel(''); setType('root_group'); setPlacement('top'); }
    }, [open]);

    const idErr = id ? validateMenuId(id) : null;
    const dup = schema.menus.some((m) => m.id === id);
    const canSubmit = !!id && !!label && !idErr && !dup;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый раздел меню</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="assets, Incidents.root, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Лейбл <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Тип</label>
                            <select
                                className="dc-input"
                                value={type}
                                onChange={(e) => setType(e.target.value as any)}
                            >
                                <option value="root_group">С подразделами</option>
                                <option value="root_menu">Без подразделов</option>
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Расположение</label>
                            <select
                                className="dc-input"
                                value={placement}
                                onChange={(e) => setPlacement(e.target.value as any)}
                            >
                                <option value="top">Главное меню</option>
                                <option value="settings">Настройки</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) => addMenu(doc, { id, label, type, placement }));
                            select(`menu:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};