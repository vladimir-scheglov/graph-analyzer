import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { ViewSelect } from '../../ui/ViewSelect';
import {
    updateMenuField, addMenuItem, updateMenuItemField, removeMenuItem,
} from './menus-handlers';
import type { MenuSchema } from '../../types';

export const MenuDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const commit = useEditorStore((s) => s.commit);

    if (!selectionKey?.startsWith('menu:')) {
        return <DetailCard title="" empty emptyText="Выберите раздел слева" children={null} />;
    }

    const id = selectionKey.slice('menu:'.length);
    const menu = schema.menus.find((m) => m.id === id);

    if (!menu) {
        return <DetailCard title="" empty emptyText="Раздел не найден" children={null} />;
    }

    const isGroup = menu.type === 'root_group';

    return (
        <DetailCard
            title={menu.label || menu.id}
            subtitle={`${menu.type} · route ${menu.route} · ${menu.placement}`}
            tabs={
                isGroup
                    ? [{ key: 'main', label: 'Основное' }, { key: 'items', label: `Подразделы (${menu.items?.length ?? 0})` }]
                    : undefined
            }
        >
            <MenuBody menu={menu} />
        </DetailCard>
    );
};

const MenuBody: FC<{ menu: MenuSchema }> = ({ menu }) => {
    const commit = useEditorStore((s) => s.commit);
    const set = (field: string, value: unknown) =>
        commit((doc) => updateMenuField(doc, menu.id, field, value));

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={menu.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Лейбл</label>
                    <input
                        className="dc-input"
                        value={menu.label}
                        onChange={(e) => set('label', e.target.value)}
                    />
                </div>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Route</label>
                    <input
                        className="dc-input"
                        value={menu.route}
                        onChange={(e) => set('route', e.target.value)}
                        placeholder="/iocs"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Иконка</label>
                    <input
                        className="dc-input"
                        value={menu.icon ?? ''}
                        onChange={(e) => set('icon', e.target.value || undefined)}
                        placeholder="icons@Icon"
                    />
                </div>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Расположение</label>
                    <select
                        className="dc-input"
                        value={menu.placement}
                        onChange={(e) => set('placement', e.target.value)}
                    >
                        <option value="top">Главное меню</option>
                        <option value="settings">Настройки</option>
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Приоритет (≥ 1001)</label>
                    <input
                        className="dc-input"
                        type="number"
                        value={menu.priority ?? ''}
                        onChange={(e) =>
                            set('priority', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                    />
                </div>
            </div>

            {menu.type === 'root_menu' && (
                <div className="dc-field">
                    <label className="dc-field__label">Представление</label>
                    <ViewSelect
                        value={menu.view ?? null}
                        onChange={(v) => set('view', v ?? undefined)}
                        filterType={['list', 'tabs_list']}
                    />
                </div>
            )}

            {menu.type === 'root_group' && (
                <MenuItemList menu={menu} />
            )}
        </div>
    );
};

const MenuItemList: FC<{ menu: MenuSchema }> = ({ menu }) => {
    const commit = useEditorStore((s) => s.commit);
    const items = menu.items ?? [];

    return (
        <div style={{ marginTop: 20 }}>
            <div className="dc-constraints__header">
                <h4 className="dc-constraints__title">Подразделы ({items.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addMenuItem(doc, menu.id))}
                >+ Подраздел</button>
            </div>

            {items.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет подразделов</div>
            )}

            {items.map((it, i) => (
                <div key={i} className="dc-menu-item">
                    <div className="dc-menu-item__header">
                        <span className="dc-badge">{it.id}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeMenuItem(doc, menu.id, i))}
                        >×</button>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">ID</label>
                            <input
                                className="dc-input"
                                value={it.id}
                                onChange={(e) =>
                                    commit((doc) => updateMenuItemField(doc, menu.id, i, 'id', e.target.value))
                                }
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Лейбл</label>
                            <input
                                className="dc-input"
                                value={it.label}
                                onChange={(e) =>
                                    commit((doc) => updateMenuItemField(doc, menu.id, i, 'label', e.target.value))
                                }
                            />
                        </div>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Route</label>
                            <input
                                className="dc-input"
                                value={it.route}
                                onChange={(e) =>
                                    commit((doc) => updateMenuItemField(doc, menu.id, i, 'route', e.target.value))
                                }
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Представление</label>
                            <ViewSelect
                                value={it.view || null}
                                onChange={(v) =>
                                    commit((doc) => updateMenuItemField(doc, menu.id, i, 'view', v ?? ''))
                                }
                                filterType={['list', 'tabs_list']}
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};