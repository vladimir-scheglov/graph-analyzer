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
    const viewMode = useGraphStore((s) => s.viewMode);
    const pathMode = useGraphStore((s) => s.pathMode);
    const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
    const nsMode = useGraphStore((s) => s.isolatedOnly);
    const focusDepth = useGraphStore((s) => s.focusDepth);
    const focusNode = useGraphStore((s) => s.focusNode);

    return (
        <div className="menu">
            {viewMode === "graph" && (
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
            )}

            {viewMode === "graph" && (
                <button
                    className={'menu__item' + (pathMode ? ' menu__item--active' : '')}
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
            )}

            {viewMode === "graph" && (
                <button
                    className={'menu__item' + (isolatedOnly ? ' menu__item--active' : '')}
                    onClick={() => {
                        useGraphStore.getState().setIsolatedOnly((v) => !v);
                        props.close();
                    }}
                >
                    <span className="menu__icon">◯</span>
                    <span className="menu__text">Только изолированные</span>
                </button>
            )}

            {viewMode === "graph" && (
                <button
                    className={'menu__item' + (nsMode ? ' menu__item--active' : '')}
                    onClick={() => {
                        useGraphStore.getState().setNsMode((v) => !v);
                        props.close();
                    }}
                >
                    <span className="menu__icon">🗂</span>
                    <span className="menu__text">Агрегация по семействам</span>
                </button>
            )}

            <div className="menu__divider" />

            {viewMode === "graph" && (
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
            )}

            {viewMode === "graph" && (
                <>
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
                            value={focusDepth}
                            onChange={(e) => useGraphStore.getState().setFocusDepth(parseInt(e.target.value, 10))}
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
                            {focusDepth}
                        </span>
                    </div>
                </>
            )}

            {viewMode === "graph" && focusNode && (
                <button
                    className="menu__item menu__item--danger"
                    onClick={() => {
                        useGraphStore.getState().setFocusNode(null);
                        useGraphStore.getState().setSelectedNodeId(null);
                        useGraphStore.getState().setSelectedEdgeId(null);
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