import React, { useRef } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';
import { formatSavedAt } from '../../lib/format';
import { DIFF_ADDED, DIFF_REMOVED } from './diff-colors';
import { useModelIndex } from '../../hooks/useModelIndex';
import { exportEntityClassDiagram } from '../../lib/export';

export interface DataMenuProps {
    close: () => void;
    onExportJSON: () => void;
    onExportMarkdown: () => void;
    onExportPNG: () => void;
    onExportMermaid: () => void;
    onSaveSnapshot: (slot: 'A' | 'B') => void;
    onLoadSnapshot: (slot: 'A' | 'B') => void;
    onClearSnapshot: (slot: 'A' | 'B') => void;
    onSnapshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onOpenValidation: () => void;
}

export function DataMenu(props: DataMenuProps) {
    const store = useGraphStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const diffMode = store.diffMode;

    return (
        <div className="menu">
            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Экспорт
            </div>

            <button
                className="menu__item"
                onClick={() => {
                    props.onExportJSON();
                    props.close();
                }}
            >
                <span className="menu__icon">💾</span>
                <span className="menu__text">Граф в JSON</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    props.onExportMarkdown();
                    props.close();
                }}
            >
                <span className="menu__icon">📝</span>
                <span className="menu__text">Отчёт в Markdown</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    props.onExportPNG();
                    props.close();
                }}
            >
                <span className="menu__icon">🖼️</span>
                <span className="menu__text">Граф в PNG</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    props.onExportMermaid();
                    props.close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="schema" size="sm" />
                </span>
                <span className="menu__text">Диаграмма Mermaid</span>
            </button>

            <div className="menu__divider" />

            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Модель
            </div>

            <button
                className="menu__item"
                onClick={() => {
                    useGraphStore.getState().setModelDiffOpen(true);
                    props.close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="history" size="sm" />
                </span>
                <span className="menu__text">Что изменилось в модели</span>
            </button>

            <div className="menu__divider" />

            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Сравнение
            </div>

            <button
                className="menu__item"
                onClick={() => fileInputRef.current?.click()}
            >
                <span className="menu__icon">⇄</span>
                <span className="menu__text">Загрузить снимок</span>
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                    props.onSnapshotUpload(e);
                    props.close();
                }}
            />

            <div className="menu__divider" />

            <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                Снимки (локально)
            </div>

            {/* Слот A */}
            <div className="snap-slot">
                <div className="snap-slot__info">
                    <span className="snap-slot__badge snap-slot__badge--a">A</span>
                    {store.snapshotA ? (
                        <div className="snap-slot__meta">
                            <div className="snap-slot__time">{formatSavedAt(store.snapshotA.savedAt)}</div>
                            <div className="snap-slot__stats">
                                {store.snapshotA.stats.nodes} узлов · {store.snapshotA.stats.edges} связей
                            </div>
                        </div>
                    ) : (
                        <div className="snap-slot__empty">пусто</div>
                    )}
                </div>
                <div className="snap-slot__actions">
                    <button
                        className="snap-btn"
                        onClick={() => props.onSaveSnapshot('A')}
                        title="Сохранить текущее состояние в A"
                    >
                        <MIcon name="save" size="sm" />
                    </button>
                    {store.snapshotA && (
                        <button
                            className="snap-btn snap-btn--primary"
                            onClick={() => {
                                props.onLoadSnapshot('A');
                                props.close();
                            }}
                            title="Сравнить текущее с A"
                        >
                            <MIcon name="compare_arrows" size="sm" />
                        </button>
                    )}
                    {store.snapshotA && (
                        <button
                            className="snap-btn snap-btn--danger"
                            onClick={() => props.onClearSnapshot('A')}
                            title="Удалить снимок A"
                        >
                            <MIcon name="close" size="sm" />
                        </button>
                    )}
                </div>
            </div>

            {/* Слот B */}
            <div className="snap-slot">
                <div className="snap-slot__info">
                    <span className="snap-slot__badge snap-slot__badge--b">B</span>
                    {store.snapshotB ? (
                        <div className="snap-slot__meta">
                            <div className="snap-slot__time">{formatSavedAt(store.snapshotB.savedAt)}</div>
                            <div className="snap-slot__stats">
                                {store.snapshotB.stats.nodes} узлов · {store.snapshotB.stats.edges} связей
                            </div>
                        </div>
                    ) : (
                        <div className="snap-slot__empty">пусто</div>
                    )}
                </div>
                <div className="snap-slot__actions">
                    <button
                        className="snap-btn"
                        onClick={() => props.onSaveSnapshot('B')}
                        title="Сохранить текущее состояние в B"
                    >
                        <MIcon name="save" size="sm" />
                    </button>
                    {store.snapshotB && (
                        <button
                            className="snap-btn snap-btn--primary"
                            onClick={() => {
                                props.onLoadSnapshot('B');
                                props.close();
                            }}
                            title="Сравнить текущее с B"
                        >
                            <MIcon name="compare_arrows" size="sm" />
                        </button>
                    )}
                    {store.snapshotB && (
                        <button
                            className="snap-btn snap-btn--danger"
                            onClick={() => props.onClearSnapshot('B')}
                            title="Удалить снимок B"
                        >
                            <MIcon name="close" size="sm" />
                        </button>
                    )}
                </div>
            </div>

            <div className="menu__hint" style={{ paddingLeft: 12, paddingRight: 12 }}>
                Сохраните «до», сделайте изменения, нажмите <MIcon name="compare_arrows" size="sm" /> —
                увидите разницу на графе.
            </div>

            {diffMode && (
                <div className="diff-legend">
                    <span className="diff-legend__item">
                        <span className="diff-legend__dot" style={{ background: DIFF_ADDED }} />
                        +{diffMode.addedNodes.size}n / +{diffMode.addedEdges.size}e
                    </span>
                    <span className="diff-legend__item">
                        <span className="diff-legend__dot" style={{ background: DIFF_REMOVED }} />
                        −{diffMode.removedNodes.size}n / −{diffMode.removedEdges.size}e
                    </span>
                    {diffMode.snapshot && diffMode.snapshot.savedAt && (
                        <span className="diff-legend__scope" title="С чем сравниваем">
                            vs{' '}
                            {new Date(diffMode.snapshot.savedAt).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    )}
                    <button
                        className="diff-legend__close"
                        onClick={() => store.setDiffMode(null)}
                        title="Сбросить diff"
                    >
                        <MIcon name="close" size="sm" />
                    </button>
                </div>
            )}

            {store.validationAvailable && (
                <>
                    <div className="menu__divider" />
                    <div className="menu__label" style={{ paddingLeft: 12, paddingTop: 6 }}>
                        Валидация
                    </div>
                    <button
                        className="menu__item"
                        onClick={() => {
                            props.onOpenValidation();
                            props.close();
                        }}
                    >
                        <span className="menu__icon">🔍</span>
                        <span className="menu__text">Массовая валидация доменов</span>
                    </button>
                </>
            )}
        </div>
    );
}