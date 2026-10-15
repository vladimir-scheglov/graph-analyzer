import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { Popover } from '../common/Popover';
import { MIcon } from '../common/MIcon';
import { FilterMenu } from '../popovers/FilterMenu';
import { AnalysisMenu } from '../popovers/AnalysisMenu';
import { ViewMenu } from '../popovers/ViewMenu';
import { DataMenu } from '../popovers/DataMenu';
import { relativeTime } from '../../lib/format';

export interface ToolbarProps {
    counts: { domain: number; missing: number; broken: number; linkage: number; fqid: number };
    visibleNodesCount: number;
    visibleEdgesCount: number;
    totalNodesCount: number;
    totalEdgesCount: number;
    activeFiltersCount: number;
    remoteInfo: any;
    onFindCycles: () => void;
    onStartPathFinder: () => void;
    onOpenTopo: () => void;
    onOpenLearningPath: () => void;
    onOpenRules: () => void;
    onOpenEntityHierarchy: () => void;
    onOpenValidation: () => void;
    ruleViolationsCount: number;
    cycleHighlight: any;
    onExportJSON: () => void;
    onExportMarkdown: () => void;
    onExportPNG: () => void;
    onExportMermaid: () => void;
    onSaveSnapshot: (slot: 'A' | 'B') => void;
    onLoadSnapshot: (slot: 'A' | 'B') => void;
    onClearSnapshot: (slot: 'A' | 'B') => void;
    onSnapshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onApplyLayout: () => void;
    onResetAll: () => void;
    onRelayout: () => void;
    onShowToast: () => void;
}

export function Toolbar(props: ToolbarProps) {
    const store = useGraphStore();
    const { back, forward, navStack } = useNavigation();

    const cycleActive = !!props.cycleHighlight;
    const analysisActive =
        cycleActive || store.isolatedOnly || store.nsMode || !!store.focusNode;
    const dataActive = !!store.diffMode;

    return (
        <div className="toolbar">
            <div className="toolbar__group">
                <button
                    className="btn btn--icon"
                    onClick={() => store.rfInstance?.fitView({ duration: 500 })}
                    title="Вписать (F)"
                >
                    ⛶
                </button>
                <button className="btn btn--icon" onClick={props.onRelayout} title="Переуложить">
                    ⟳
                </button>
                <button
                    className="btn btn--icon"
                    onClick={() => {
                        if (!confirm('Сбросить раскладку и выделения?')) return;
                        store.setLayoutType('LR');
                        store.setCompact(false);
                        store.setSelectedNodeId(null);
                        store.setFocusNode(null);
                        store.setCycleHighlight(null);
                        store.setPathResult(null);
                        store.setPathSel([]);
                        setTimeout(() => store.rfInstance?.fitView({ duration: 500 }), 200);
                    }}
                    title="Сбросить раскладку"
                >
                    ↺
                </button>
                <button
                    className="btn btn--icon"
                    onClick={() => {
                        if (!confirm('Сбросить все фильтры, режимы и выделения?')) return;
                        props.onResetAll();
                    }}
                    title="Сбросить всё"
                >
                    <MIcon name="restart_alt" />
                </button>
                <button
                    className="btn btn--icon"
                    onClick={back}
                    disabled={navStack.index <= 0}
                    style={{ opacity: navStack.index <= 0 ? 0.4 : 1 }}
                    title="Назад (Alt+←)"
                >
                    ←
                </button>
                <button
                    className="btn btn--icon"
                    onClick={forward}
                    disabled={navStack.index >= navStack.items.length - 1}
                    style={{ opacity: navStack.index >= navStack.items.length - 1 ? 0.4 : 1 }}
                    title="Вперёд (Alt+→)"
                >
                    →
                </button>
            </div>

            <button
                className="btn"
                onClick={() => store.setSearchOpen(true)}
                title="Поиск (Shift+Tab)"
            >
                <span className="btn__icon">🔍</span>
                Поиск
                <kbd className="btn-kbd">⇧ Tab</kbd>
            </button>

            <Popover
                width={320}
                trigger={(open) => (
                    <button className={'btn' + (open || props.activeFiltersCount > 0 ? ' btn--active' : '')}>
                        <MIcon name="tune" />
                        <span style={{ marginLeft: 6 }}>Фильтры</span>
                        {props.activeFiltersCount > 0 && (
                            <span className="btn__badge">{props.activeFiltersCount}</span>
                        )}
                    </button>
                )}
            >
                <FilterMenu counts={props.counts} />
            </Popover>

            <Popover
                width={280}
                trigger={(open) => (
                    <button className={'btn' + (open || analysisActive ? ' btn--active' : '')}>
                        <span className="btn__icon">📊</span>
                        Анализ
                    </button>
                )}
            >
                {(close) => (
                    <AnalysisMenu
                        cycleHighlight={props.cycleHighlight}
                        onFindCycles={props.onFindCycles}
                        onStartPathFinder={props.onStartPathFinder}
                        onOpenTopo={props.onOpenTopo}
                        onOpenLearningPath={props.onOpenLearningPath}
                        onOpenRules={props.onOpenRules}
                        onOpenEntityHierarchy={props.onOpenEntityHierarchy}
                        ruleViolationsCount={props.ruleViolationsCount}
                        close={close}
                    />
                )}
            </Popover>

            <Popover
                width={300}
                trigger={(open) => (
                    <button className={'btn' + (open ? ' btn--active' : '')}>
                        <span className="btn__icon">🎨</span>
                        Вид
                    </button>
                )}
            >
                {(close) => <ViewMenu close={close} />}
            </Popover>

            <Popover
                width={260}
                trigger={(open) => (
                    <button className={'btn' + (open || dataActive ? ' btn--active' : '')}>
                        <span className="btn__icon">💾</span>
                        Данные
                    </button>
                )}
            >
                {(close) => (
                    <DataMenu
                        close={close}
                        onExportJSON={props.onExportJSON}
                        onExportMarkdown={props.onExportMarkdown}
                        onExportPNG={props.onExportPNG}
                        onExportMermaid={props.onExportMermaid}
                        onSaveSnapshot={props.onSaveSnapshot}
                        onLoadSnapshot={props.onLoadSnapshot}
                        onClearSnapshot={props.onClearSnapshot}
                        onSnapshotUpload={props.onSnapshotUpload}
                        onOpenValidation={props.onOpenValidation}
                    />
                )}
            </Popover>

            <div className="toolbar__spacer" />

            {props.remoteInfo?.server && props.remoteInfo?.fetchedAt && (
                <div
                    className="toolbar__cache"
                    title={
                        'Источник: ' +
                        props.remoteInfo.server +
                        '\nОбновлён: ' +
                        new Date(props.remoteInfo.fetchedAt).toLocaleString('ru-RU')
                    }
                    onClick={props.onShowToast}
                >
                    <MIcon name="database" size="sm" />
                    <span>Получено {relativeTime(props.remoteInfo.fetchedAt)}</span>
                </div>
            )}

            <button
                className="btn btn--icon"
                onClick={() => store.setHotkeysOpen(true)}
                title="Горячие клавиши (?)"
            >
                ⌨️
            </button>

            <button
                className="btn btn--icon"
                onClick={() => store.setHelpOpen(true)}
                title="Руководство пользователя (F1)"
            >
                📖
            </button>

            <div className="toolbar__stats">
                {props.visibleNodesCount} / {props.totalNodesCount} узлов · {props.visibleEdgesCount} /{' '}
                {props.totalEdgesCount} связей
            </div>
        </div>
    );
}