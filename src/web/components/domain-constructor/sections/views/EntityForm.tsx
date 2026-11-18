import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ViewSchema } from '../../types';
import { updateViewField } from './views-handlers';
import { WidgetsTab } from '../widgets/WidgetsTab';
import { GroupsTab } from '../groups/GroupsTab';
import { CardsTab } from '../cards/CardsTab';

interface Props {
    view: ViewSchema;
}

type Tab = 'widgets' | 'groups' | 'views';

export const EntityForm: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const [tab, setTab] = useState<Tab>('widgets');

    const widgets = (view as any).widgets ?? [];
    const groups = (view as any).groups ?? [];
    const nested = (view as any).views ?? [];

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

            <div className="dc-field">
                <label className="dc-field__label">Сущность</label>
                <input className="dc-input" value={view.entity ?? ''} disabled />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Наследовать настройки из</label>
                <input
                    className="dc-input"
                    value={view.inherits ?? ''}
                    onChange={(e) =>
                        commit((doc) => updateViewField(doc, view.id, 'inherits', e.target.value || undefined))
                    }
                />
            </div>

            <div className="dc-detail__tabs" role="tablist" style={{ marginTop: 16 }}>
                {[
                    { key: 'widgets', label: `Виджеты (${widgets.length})` },
                    { key: 'groups', label: `Группы (${groups.length})` },
                    { key: 'views', label: `Карточки (${nested.length})` },
                ].map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={'dc-detail__tab' + (tab === t.key ? ' dc-detail__tab--active' : '')}
                        onClick={() => setTab(t.key as Tab)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ paddingTop: 16 }}>
                {tab === 'widgets' && <WidgetsTab view={view} />}
                {tab === 'groups' && <GroupsTab view={view} />}
                {tab === 'views' && <CardsTab view={view} />}
            </div>
        </div>
    );
};