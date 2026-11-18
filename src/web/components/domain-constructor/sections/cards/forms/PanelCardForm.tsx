import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { SimpleRefList } from '../components/SimpleRefList';

interface Props {
    viewId: string;
    card: any;
}

export const PanelCardForm: FC<Props> = ({ viewId, card }) => {
    const schema = useEditorStore((s) => s.schema);
    const view = schema.views.find((v) => v.id === viewId);
    const allGroups = ((view as any)?.groups ?? []) as any[];

    // Для tabs[] — только группы типа tab
    const tabGroups = allGroups.filter((g) => g.type === 'tab');

    // Действия для menu/footer/onView
    const actionOptions = useMemo(
        () => schema.actions.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.id})` : a.id })),
        [schema.actions],
    );

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Меню панели</h4>
            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="menu"
                refField="action"
                title="Действия"
                options={actionOptions}
                addLabel="действие"
                emptyText="Нет действий"
            />

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Вкладки</h4>
            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="tabs"
                refField="tab"
                title="Вкладки"
                options={tabGroups.map((g) => ({ value: g.id, label: g.label || g.id }))}
                addLabel="вкладку"
                emptyText="Нет вкладок"
            />

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Нижняя секция (footer)</h4>
            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="footer"
                refField="action"
                title="Кнопки нижней секции"
                options={actionOptions}
                addLabel="кнопку"
                emptyText="Нет кнопок"
                extraFields={[
                    {
                        name: 'behavior',
                        label: 'Поведение',
                        kind: 'select',
                        options: [
                            { value: 'run', label: 'run (выполнить, окно остаётся)' },
                            { value: 'run_close', label: 'run_close (выполнить, закрыть)' },
                            { value: 'run_submit', label: 'run_submit (submit + выполнить)' },
                        ],
                    },
                ]}
            />

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Действия при открытии (onView)</h4>
            <SimpleRefList
                viewId={viewId}
                cardId={card.id}
                arrayField="onView"
                refField="action"
                title="onView"
                options={actionOptions}
                addLabel="действие"
                emptyText="Нет действий"
            />
        </div>
    );
};