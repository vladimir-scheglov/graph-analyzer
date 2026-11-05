import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface ModelMenuProps {
    close: () => void;
}

interface MenuItemDef {
    icon: string;
    label: string;
    hotkey?: string;
    onClick: () => void;
}

interface MenuSectionDef {
    id: string;
    label: string;
    items: MenuItemDef[];
}

export function ModelMenu({ close }: ModelMenuProps) {
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const setAttributeFinderOpen = useGraphStore((s) => s.setAttributeFinderOpen);
    const setEntityMatrixOpen = useGraphStore((s) => s.setEntityMatrixOpen);
    const validationAvailable = useGraphStore((s) => s.validationAvailable);

    const run = (fn: () => void) => () => {
        fn();
        close();
    };

    // ═══════════════════════════════════════════════════════════════
    // Левая колонка: обзор модели + графы
    // ═══════════════════════════════════════════════════════════════
    const leftColumn: MenuSectionDef[] = [
        {
            id: 'overview',
            label: 'Обзор модели',
            items: [
                {
                    icon: 'dashboard',
                    label: 'Health Dashboard',
                    hotkey: '⇧⌘H',
                    onClick: run(() =>
                        useGraphStore.getState().setHealthDashboardOpen(true),
                    ),
                },
                {
                    icon: 'menu_book',
                    label: 'Каталог сущностей',
                    hotkey: '⇧⌘E',
                    onClick: run(() => {
                        useGraphStore
                            .getState()
                            .setEntityCatalogInitialFqid(null);
                        setEntityCatalogOpen(true);
                    }),
                },
                {
                    icon: 'search',
                    label: 'Поиск атрибутов',
                    hotkey: '⇧⌘A',
                    onClick: run(() => setAttributeFinderOpen(true)),
                },
                {
                    icon: 'grid_on',
                    label: 'Матрица связей',
                    hotkey: '⇧⌘M',
                    onClick: run(() => setEntityMatrixOpen(true)),
                },
                {
                    icon: 'grid_view',
                    label: 'Матрица атрибутов',
                    hotkey: '⇧⌘B',
                    onClick: run(() =>
                        useGraphStore
                            .getState()
                            .setAttributeMatrixOpen(true),
                    ),
                },
                {
                    icon: 'account_tree',
                    label: 'Граф сущностей',
                    hotkey: '⇧⌘K',
                    onClick: run(() =>
                        useGraphStore.getState().setEntityGraphOpen(true),
                    ),
                },
            ],
        },
        {
            id: 'graphs-search',
            label: 'Графы и поиск',
            items: [
                {
                    icon: 'schema',
                    label: 'Граф зависимостей views',
                    hotkey: '⇧⌘R',
                    onClick: run(() =>
                        useGraphStore.getState().setViewGraphOpen(true),
                    ),
                },
                {
                    icon: 'search',
                    label: 'Полнотекстовый поиск',
                    hotkey: '⇧⌘U',
                    onClick: run(() =>
                        useGraphStore
                            .getState()
                            .setYamlFulltextSearchOpen(true),
                    ),
                },
                {
                    icon: 'history_edu',
                    label: 'CHANGELOG и версии',
                    hotkey: '⇧⌘O',
                    onClick: run(() =>
                        useGraphStore.getState().setChangelogOpen(true),
                    ),
                },
            ],
        },
    ];

    // ═══════════════════════════════════════════════════════════════
    // Правая колонка: анализ + качество + инструменты
    // ═══════════════════════════════════════════════════════════════
    const qualityItems: MenuItemDef[] = [
        {
            icon: 'rule',
            label: 'Линтер схем',
            hotkey: '⇧⌘L',
            onClick: run(() =>
                useGraphStore.getState().setLintOpen(true),
            ),
        },
        {
            icon: 'verified',
            label: 'Валидация модели',
            hotkey: '⇧⌘V',
            onClick: run(() =>
                useGraphStore.getState().setModelValidationOpen(true),
            ),
        },
        ...(validationAvailable
            ? [
                {
                    icon: 'cloud_upload',
                    label: 'Массовая валидация',
                    onClick: run(() =>
                        useGraphStore
                            .getState()
                            .setValidationOpen(true),
                    ),
                } as MenuItemDef,
            ]
            : []),
        {
            icon: 'shield_lock',
            label: 'PII-атрибуты',
            hotkey: '⇧⌘P',
            onClick: run(() =>
                useGraphStore.getState().setPiiOpen(true),
            ),
        },
        {
            icon: 'scatter_plot',
            label: 'Архитектурные метрики',
            hotkey: '⇧⌘Y',
            onClick: run(() =>
                useGraphStore.getState().setMartinOpen(true),
            ),
        },
    ];

    const rightColumn: MenuSectionDef[] = [
        {
            id: 'analysis',
            label: 'Анализ',
            items: [
                {
                    icon: 'inventory_2',
                    label: 'Порядок установки',
                    onClick: run(() =>
                        useGraphStore.getState().setTopoOpen(true),
                    ),
                },
                {
                    icon: 'menu_book',
                    label: 'Путь изучения',
                    onClick: run(() =>
                        useGraphStore.getState().setLearningPathOpen(true),
                    ),
                },
                {
                    icon: 'account_tree',
                    label: 'Иерархия сущностей',
                    onClick: run(() => {
                        const st = useGraphStore.getState();
                        st.setEntityHierarchyInitialKey(null);
                        st.setEntityHierarchyOpen(true);
                    }),
                },
            ],
        },
        {
            id: 'quality',
            label: 'Качество',
            items: qualityItems,
        },
        {
            id: 'tools',
            label: 'Инструменты',
            items: [
                {
                    icon: 'compare_arrows',
                    label: 'Сравнить домены',
                    onClick: run(() =>
                        useGraphStore.getState().setDomainCompareOpen(true),
                    ),
                },
                {
                    icon: 'menu_book',
                    label: 'Шпаргалка по схеме',
                    onClick: run(() =>
                        useGraphStore.getState().setCheatsheetOpen(true),
                    ),
                },
                {
                    icon: 'menu_book',
                    label: 'Глоссарий',
                    hotkey: '⇧⌘G',
                    onClick: run(() =>
                        useGraphStore.getState().setGlossaryOpen(true),
                    ),
                },
            ],
        },
    ];

    const renderColumn = (sections: MenuSectionDef[]) =>
        sections.map((section) => (
            <div key={section.id} className="menu__section">
                <div className="menu__label">{section.label}</div>
                {section.items.map((item) => (
                    <button
                        key={item.label}
                        className="menu__item"
                        onClick={item.onClick}
                        title={item.label}
                    >
                        <span className="menu__icon">
                            <MIcon name={item.icon} size="sm" />
                        </span>
                        <span className="menu__text">{item.label}</span>
                        {item.hotkey && (
                            <kbd className="menu__hotkey">{item.hotkey}</kbd>
                        )}
                    </button>
                ))}
            </div>
        ));

    return (
        <div className="menu menu--two-col">
            <div className="menu__col">{renderColumn(leftColumn)}</div>
            <div className="menu__col">{renderColumn(rightColumn)}</div>
            <div className="menu__hint menu__hint--footer">
                Все сущности, атрибуты и связи всех доменов — как единая
                модель данных.
            </div>
        </div>
    );
}