import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface AnalysisMenuProps {
    cycleHighlight: any;
    onFindCycles: () => void;
    onStartPathFinder: () => void;
    onOpenTopo: () => void;
    onOpenLearningPath: () => void;
    onOpenRules: () => void;
    onOpenEntityHierarchy: () => void;
    ruleViolationsCount: number;
    close: () => void;
}

export function AnalysisMenu(props: AnalysisMenuProps) {
    const store = useGraphStore();

    return (
        <div className="menu">
            <button
                className={'menu__item' + (props.cycleHighlight ? ' menu__item--active' : '')}
                onClick={() => {
                    props.onFindCycles();
                    props.close();
                }}
            >
                <span className="menu__icon">🔁</span>
                <span className="menu__text">Найти циклы</span>
                {props.cycleHighlight && (
                    <span className="menu__count">{props.cycleHighlight.sccCount}</span>
                )}
            </button>

            <button
                className={'menu__item' + (store.pathMode ? ' menu__item--active' : '')}
                onClick={() => {
                    props.onStartPathFinder();
                    props.close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="route" size="sm" />
                </span>
                <span className="menu__text">Найти путь между узлами</span>
            </button>

            <button
                className={'menu__item' + (store.isolatedOnly ? ' menu__item--active' : '')}
                onClick={() => {
                    store.setIsolatedOnly((v) => !v);
                    props.close();
                }}
            >
                <span className="menu__icon">◯</span>
                <span className="menu__text">Только изолированные</span>
            </button>

            <button
                className={'menu__item' + (store.nsMode ? ' menu__item--active' : '')}
                onClick={() => {
                    store.setNsMode((v) => !v);
                    props.close();
                }}
            >
                <span className="menu__icon">🗂</span>
                <span className="menu__text">Агрегация по семействам</span>
            </button>

            <div className="menu__divider" />

            <button
                className="menu__item"
                onClick={() => {
                    props.onOpenTopo();
                    props.close();
                }}
            >
                <span className="menu__icon">📦</span>
                <span className="menu__text">Порядок установки</span>
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    props.onOpenLearningPath();
                    props.close();
                }}
            >
                <span className="menu__icon">📖</span>
                <span className="menu__text">Путь изучения</span>
            </button>

            <div className="menu__divider" />

            <button
                className={'menu__item' + (props.ruleViolationsCount > 0 ? ' menu__item--active' : '')}
                onClick={() => {
                    props.onOpenRules();
                    props.close();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="block" size="sm" />
                </span>
                <span className="menu__text">Правила зависимостей</span>
                {props.ruleViolationsCount > 0 && (
                    <span className="menu__count">{props.ruleViolationsCount}</span>
                )}
            </button>

            <button
                className="menu__item"
                onClick={() => {
                    props.onOpenEntityHierarchy();
                    props.close();
                }}
            >
                <span className="menu__icon">🧬</span>
                <span className="menu__text">Иерархия сущностей</span>
            </button>

            <div className="menu__divider" />

            <div className="menu__row">
                <span style={{ fontSize: 12, color: 'var(--text-400)', minWidth: 100 }}>
                    Глубина фокуса:
                </span>
                <input
                    className="menu__slider"
                    type="range"
                    min={1}
                    max={4}
                    value={store.focusDepth}
                    onChange={(e) => store.setFocusDepth(parseInt(e.target.value, 10))}
                />
                <span
                    style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--accent-hover)',
                        minWidth: 12,
                        textAlign: 'center'
                    }}
                >
                    {store.focusDepth}
                </span>
            </div>

            {store.focusNode && (
                <button
                    className="menu__item menu__item--danger"
                    onClick={() => {
                        store.setFocusNode(null);
                        store.setSelectedNodeId(null);
                        store.setSelectedEdgeId(null);
                        props.close();
                    }}
                >
                    <span className="menu__icon">✕</span>
                    <span className="menu__text">Сбросить фокус</span>
                </button>
            )}
        </div>
    );
}