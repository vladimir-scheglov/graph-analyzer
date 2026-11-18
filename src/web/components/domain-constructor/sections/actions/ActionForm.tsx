import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import { ViewSelect } from '../../ui/ViewSelect';
import type { ActionSchema } from '../../types';
import {
    ACTION_TYPES, ActionType,
    changeActionType, updateActionField,
    getActionRequirements,
} from './actions-handlers';
import { ActionValuesEditor } from './ActionValuesEditor';

interface Props {
    action: ActionSchema;
}

export const ActionForm: FC<Props> = ({ action }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateActionField(doc, action.id, field, value));

    const req = getActionRequirements(action.type as ActionType);

    return (
        <div>
            {/* ============ Общие поля ============ */}
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={action.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={action.name ?? ''}
                        onChange={(e) => set('name', e.target.value)}
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <textarea
                    className="dc-input dc-input--textarea"
                    value={action.description ?? ''}
                    onChange={(e) => set('description', e.target.value)}
                />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Тип</label>
                <select
                    className="dc-input"
                    value={action.type}
                    onChange={(e) => {
                        const newType = e.target.value as ActionType;
                        if (newType === action.type) return;
                        if (!confirm(
                            `Сменить тип на "${newType}"? Специфичные для текущего типа поля будут удалены.`,
                        )) return;
                        commit((doc) => changeActionType(doc, action.id, newType));
                    }}
                    disabled={isPublished}
                >
                    {ACTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
                {isPublished && (
                    <div className="dc-field__hint">
                        Тип заблокирован после публикации.
                    </div>
                )}
            </div>

            {/* ============ Поля по типу ============ */}

            {req.requiresEntity && (
                <div className="dc-field">
                    <label className="dc-field__label">
                        Сущность <span className="dc-field__required">*</span>
                    </label>
                    <EntitySelect
                        value={action.entity ?? null}
                        onChange={(v) => set('entity', v ?? undefined)}
                        disabled={isPublished}
                    />
                </div>
            )}

            {action.type === 'open_modal' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Модальное окно <span className="dc-field__required">*</span></label>
                        <ViewSelect
                            value={action.modal ?? null}
                            onChange={(v) => set('modal', v ?? undefined)}
                            filterType="modal"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Операция</label>
                        <select
                            className="dc-input"
                            value={action.operation ?? 'create'}
                            onChange={(e) => set('operation', e.target.value)}
                        >
                            <option value="create">Создать объект</option>
                            <option value="edit">Изменить объект</option>
                        </select>
                    </div>
                </>
            )}

            {action.type === 'open_panel' && (
                <div className="dc-field">
                    <label className="dc-field__label">Панель <span className="dc-field__required">*</span></label>
                    <ViewSelect
                        value={action.panel ?? null}
                        onChange={(v) => set('panel', v ?? undefined)}
                        filterType="panel"
                    />
                </div>
            )}

            {action.type === 'open_page' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Полноэкранная карточка <span className="dc-field__required">*</span></label>
                        <ViewSelect
                            value={action.pageView ?? null}
                            onChange={(v) => set('pageView', v ?? undefined)}
                            filterType="page"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Операция</label>
                        <select
                            className="dc-input"
                            value={action.operation ?? 'view'}
                            onChange={(e) => set('operation', e.target.value)}
                        >
                            <option value="create">Создать</option>
                            <option value="edit">Изменить</option>
                            <option value="view">Просмотр</option>
                        </select>
                    </div>
                </>
            )}

            {(action.type === 'open_list' || action.type === 'open_tree' || action.type === 'open_view') && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Представление <span className="dc-field__required">*</span></label>
                        <ViewSelect
                            value={action.view ?? null}
                            onChange={(v) => set('view', v ?? undefined)}
                            filterType={
                                action.type === 'open_tree'
                                    ? 'tree'
                                    : action.type === 'open_view'
                                        ? ['list', 'tree', 'tabs_list']
                                        : ['list', 'tabs_list']
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Где открыть</label>
                        <select
                            className="dc-input"
                            value={action.page ?? 'current'}
                            onChange={(e) => set('page', e.target.value)}
                        >
                            <option value="current">В текущем окне</option>
                            <option value="blank">В новом окне</option>
                        </select>
                    </div>
                    {action.type === 'open_list' && (
                        <>
                            <div className="dc-field">
                                <label className="dc-field__label">
                                    <input
                                        type="checkbox"
                                        className="dc-checkbox"
                                        checked={!!action.contextPin}
                                        onChange={(e) => set('contextPin', e.target.checked ? true : undefined)}
                                    />{' '}
                                    Запретить удалять контекст
                                </label>
                            </div>
                            <ActionListViewContext action={action} set={set} />
                        </>
                    )}
                </>
            )}

            {action.type === 'opengraphview' && (
                <div className="dc-field">
                    <label className="dc-field__label">Вид графа</label>
                    <select
                        className="dc-input"
                        value={action.defaultViewMode ?? 'cola'}
                        onChange={(e) => set('defaultViewMode', e.target.value)}
                    >
                        <option value="cola">Ориентированный граф</option>
                        <option value="vertical">Вертикально</option>
                        <option value="horizontal">Горизонтально</option>
                    </select>
                </div>
            )}

            {action.type === 'scenario' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Сценарий / скрипт <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={action.scenario ?? ''}
                            onChange={(e) => set('scenario', e.target.value)}
                            placeholder="название сценария"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Группа воркеров</label>
                        <input
                            className="dc-input"
                            value={action.workerTag ?? ''}
                            onChange={(e) => set('workerTag', e.target.value || undefined)}
                            placeholder="worker tag"
                        />
                    </div>
                </>
            )}

            {action.type === 'automation' && (
                <div className="dc-field">
                    <label className="dc-field__label">ID автоматизации</label>
                    <input
                        className="dc-input"
                        value={action.automationId ?? ''}
                        onChange={(e) => set('automationId', e.target.value || undefined)}
                        placeholder="— (пользователь выберет при запуске) —"
                    />
                    <div className="dc-field__hint">
                        Если пусто — при вызове будет выпадающий список.
                    </div>
                </div>
            )}

            {action.type === 'setattributevalue' && (
                <ActionValuesEditor action={action} />
            )}

            {action.type === 'bulk' && (
                <BulkOperationEditor action={action} set={set} />
            )}

            {action.type === 'open_external_widget_modal' && (
                <div className="dc-field">
                    <label className="dc-field__label">Параметры внешнего виджета</label>
                    <textarea
                        className="dc-input dc-input--textarea"
                        value={JSON.stringify(action.widgetParams ?? {}, null, 2)}
                        onChange={(e) => {
                            try {
                                set('widgetParams', JSON.parse(e.target.value));
                            } catch { }
                        }}
                        placeholder='{ "widget": "external:mitre", "mode": "open_matrix_modal" }'
                    />
                </div>
            )}
        </div>
    );
};

// ============ open_list: контекст ============

const ActionListViewContext: FC<{ action: ActionSchema; set: (f: string, v: unknown) => void }> = ({
    action, set,
}) => (
    <div className="dc-field">
        <label className="dc-field__label">Контекст (что фильтровать)</label>
        <select
            className="dc-input"
            value={action.attribute ? 'attribute' : action.linkage ? 'linkage' : action.join ? 'join' : 'none'}
            onChange={(e) => {
                const v = e.target.value;
                if (v === 'none') {
                    set('attribute', undefined);
                    set('linkage', undefined);
                    set('join', undefined);
                } else if (v === 'attribute') {
                    set('linkage', undefined);
                    set('join', undefined);
                } else if (v === 'linkage') {
                    set('attribute', undefined);
                    set('join', undefined);
                } else if (v === 'join') {
                    set('attribute', undefined);
                    set('linkage', undefined);
                }
            }}
        >
            <option value="none">— без контекста —</option>
            <option value="attribute">Атрибут-ссылка</option>
            <option value="linkage">Связь</option>
            <option value="join">Транзитивная связь</option>
        </select>
    </div>
);

// ============ bulk: operation ============

const BulkOperationEditor: FC<{ action: ActionSchema; set: (f: string, v: unknown) => void }> = ({
    action, set,
}) => (
    <div className="dc-field">
        <label className="dc-field__label">Операция</label>
        <select
            className="dc-input"
            value={action.operation ?? 'remove'}
            onChange={(e) => set('operation', e.target.value)}
        >
            <option value="remove">Удалить объекты</option>
            <option value="edit">Изменить объекты</option>
            <option value="edit_attribute">Изменить атрибут (workflow / bool)</option>
        </select>
    </div>
);