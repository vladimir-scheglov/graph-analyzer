import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ViewSchema } from '../../types';
import { updateViewField } from './views-handlers';

interface Props { view: ViewSchema }

export const TabsListForm: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const tabs = (view as any).tabs ?? [];
    const defaultTab = (view as any).defaultTab;

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={view.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Лейбл</label>
                    <input
                        className="dc-input"
                        value={view.label ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateViewField(doc, view.id, 'label', e.target.value))
                        }
                    />
                </div>
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Вкладки ({tabs.length})
            </h4>

            {tabs.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет вкладок</div>
            )}

            {tabs.map((t: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        {t.view === defaultTab && <span className="dc-badge">по умолчанию</span>}
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">View ID</label>
                            <input
                                className="dc-input"
                                value={t.view ?? ''}
                                onChange={(e) => {
                                    const arr = [...tabs];
                                    arr[i] = { ...arr[i], view: e.target.value };
                                    commit((doc) => updateViewField(doc, view.id, 'tabs', arr));
                                }}
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Лейбл</label>
                            <input
                                className="dc-input"
                                value={t.label ?? ''}
                                onChange={(e) => {
                                    const arr = [...tabs];
                                    arr[i] = { ...arr[i], label: e.target.value };
                                    commit((doc) => updateViewField(doc, view.id, 'tabs', arr));
                                }}
                            />
                        </div>
                    </div>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => updateViewField(doc, view.id, 'defaultTab', t.view))}
                    >
                        Сделать вкладкой по умолчанию
                    </button>
                </div>
            ))}

            <button
                className="dc-btn dc-btn--primary"
                style={{ marginTop: 8 }}
                onClick={() => {
                    const arr = [...tabs, { view: '', label: '' }];
                    commit((doc) => updateViewField(doc, view.id, 'tabs', arr));
                }}
            >+ Вкладка</button>
        </div>
    );
};