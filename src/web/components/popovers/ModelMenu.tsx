import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface ModelMenuProps {
    close: () => void;
}

export function ModelMenu({ close }: ModelMenuProps) {
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const setAttributeFinderOpen = useGraphStore((s) => s.setAttributeFinderOpen);
    const setEntityMatrixOpen = useGraphStore((s) => s.setEntityMatrixOpen);

    const openCatalog = () => {
        useGraphStore.getState().setEntityCatalogInitialFqid(null);
        setEntityCatalogOpen(true);
        close();
    };

    return (
        <div className="menu">
            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Обзор модели
            </div>

            <button className="menu__item" onClick={openCatalog}>
                <span className="menu__icon">
                    <MIcon name="menu_book" size="sm" />
                </span>
                <span className="menu__text">Каталог сущностей</span>
                <kbd className="menu__hotkey">⇧⌘E</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    setAttributeFinderOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="search" size="sm" />
                </span>
                <span className="menu__text">Поиск атрибутов</span>
                <kbd className="menu__hotkey">⇧⌘A</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    setEntityMatrixOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="grid_on" size="sm" />
                </span>
                <span className="menu__text">Матрица связей</span>
                <kbd className="menu__hotkey">⇧⌘M</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setAttributeMatrixOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="grid_view" size="sm" />
                </span>
                <span className="menu__text">Матрица атрибутов</span>
                <kbd className="menu__hotkey">⇧⌘B</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setEntityGraphOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="account_tree" size="sm" />
                </span>
                <span className="menu__text">Граф сущностей</span>
                <kbd className="menu__hotkey">⇧⌘K</kbd>
            </button>

            <div className="menu__divider" />

            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Анализ
            </div>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setTopoOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="inventory_2" size="sm" />
                </span>
                <span className="menu__text">Порядок установки</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setLearningPathOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="menu_book" size="sm" />
                </span>
                <span className="menu__text">Путь изучения</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setEntityHierarchyInitialKey(null);
                    st.setEntityHierarchyOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="account_tree" size="sm" />
                </span>
                <span className="menu__text">Иерархия сущностей</span>
            </button>

            {useGraphStore.getState().validationAvailable && (
                <button
                    className="menu__item"
                    onClick={() => {
                        useGraphStore.getState().setValidationOpen(true);
                        close();
                    }}
                >
                    <span className="menu__icon">
                        <MIcon name="cloud_upload" size="sm" />
                    </span>
                    <span className="menu__text">Массовая валидация</span>
                </button>
            )}

            <div className="menu__divider" />

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setModelValidationOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="verified" size="sm" />
                </span>
                <span className="menu__text">Валидация модели</span>
                <kbd className="menu__hotkey">⇧⌘V</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setPiiOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="shield_lock" size="sm" />
                </span>
                <span className="menu__text">PII-атрибуты</span>
                <kbd className="menu__hotkey">⇧⌘P</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setLintOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="rule" size="sm" />
                </span>
                <span className="menu__text">Линтер схем</span>
                <kbd className="menu__hotkey">⇧⌘L</kbd>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setMartinOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="scatter_plot" size="sm" />
                </span>
                <span className="menu__text">Архитектурные метрики</span>
                <kbd className="menu__hotkey">⇧⌘Y</kbd>
            </button>

            <div className="menu__divider" />

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setDomainCompareOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="compare_arrows" size="sm" />
                </span>
                <span className="menu__text">Сравнить домены</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setGlossaryOpen(true);
                    close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="menu_book" size="sm" />
                </span>
                <span className="menu__text">Глоссарий</span>
                <kbd className="menu__hotkey">⇧⌘G</kbd>
            </button>

            <div className="menu__divider" />

            <div className="menu__hint" style={{ paddingLeft: 12, paddingRight: 12 }}>
                Все сущности, атрибуты и связи всех доменов — как единая модель данных.
            </div>
        </div>
    );
}