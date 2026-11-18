import { useEffect, useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { ViewSelect } from '../../ui/ViewSelect';
import {
    TARGET_OPTIONS, UiRuleTarget, addUiRule, validateUiRuleId,
} from './uiRules-handlers';

interface Props { open: boolean; onClose: () => void }

export const AddUiRuleModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [target, setTarget] = useState<UiRuleTarget>('entity_view');
    const [view, setView] = useState<string | null>(null);

    useEffect(() => {
        if (open) { setId(''); setName(''); setTarget('entity_view'); setView(null); }
    }, [open]);

    const idErr = id ? validateUiRuleId(id) : null;
    const dup = schema.uiRules.some((r) => r.id === id);
    const canSubmit = !!id && !!view && !idErr && !dup;

    const viewTypeFilter = target === 'list_view'
        ? ['list', 'tabs_list']
        : ['entity'];

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новое UI-правило</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Объект правила</label>
                        <select
                            className="dc-input"
                            value={target}
                            onChange={(e) => { setTarget(e.target.value as UiRuleTarget); setView(null); }}
                        >
                            {TARGET_OPTIONS.map((t) => (
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
                            placeholder="hideBlockOnClosed, readonlyWhenAdmin, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input className="dc-input" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">View <span className="dc-field__required">*</span></label>
                        <ViewSelect
                            value={view}
                            onChange={setView}
                            filterType={viewTypeFilter}
                            placeholder="— выберите представление —"
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
                                addUiRule(doc, { id, target, view: view!, name: name || undefined }),
                            );
                            select(`uiRule:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};