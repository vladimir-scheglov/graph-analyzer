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
import { ModelMenu } from '../popovers';
import { ActiveModesBar } from "./ActiveModesBar";

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
    const { back, forward, navStack } = useNavigation();
    const viewMode = useGraphStore((s) => s.viewMode);
    const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
    const nsMode = useGraphStore((s) => s.nsMode);
    const focusNode = useGraphStore((s) => s.focusNode);
    const diffMode = useGraphStore((s) => s.diffMode);
    const rfInstance = useGraphStore((s) => s.rfInstance);
    const theme = useGraphStore((s) => s.theme);
    const setViewMode = useGraphStore((s) => s.setViewMode);

    const cycleActive = !!props.cycleHighlight;
    const analysisActive =
        cycleActive || isolatedOnly || nsMode || !!focusNode;
    const dataActive = !!diffMode;

    return (
        <>
            {/* ============ ROW 1: actions ============ */}
            <div className="toolbar">
                <div className="toolbar__group">
                    {viewMode === "graph" && (
                        <>
                            <button className="btn btn--icon" onClick={() => rfInstance?.fitView({ duration: 500 })} title="Вписать (F)">
                                <MIcon name="fit_screen" />
                            </button>
                            <button className="btn btn--icon" onClick={props.onRelayout} title="Переуложить">
                                <MIcon name="refresh" />
                            </button>
                            <button
                                className="btn btn--icon"
                                onClick={() => {
                                    if (!confirm("Сбросить все фильтры, режимы и выделения?")) return;
                                    props.onResetAll();
                                }}
                                title="Сбросить всё"
                            >
                                <MIcon name="restart_alt" />
                            </button>
                        </>
                    )}
                    <button className="btn btn--icon" onClick={back} disabled={navStack.index <= 0} title="Назад (Alt+←)">
                        <MIcon name="arrow_back" />
                    </button>
                    <button className="btn btn--icon" onClick={forward} disabled={navStack.index >= navStack.items.length - 1} title="Вперёд (Alt+→)">
                        <MIcon name="arrow_forward" />
                    </button>
                </div>

                <button
                    className="btn"
                    onClick={() => useGraphStore.getState().setSearchOpen(true)}
                    title="Поиск (Shift+Tab)"
                >
                    <MIcon name="search" />
                    <kbd className="btn-kbd">⇧ Tab</kbd>
                </button>

                <Popover width={280} trigger={(open) => (
                    <button className={"btn" + (open ? " btn--active" : "")}>
                        <MIcon name="psychology" /> Модель
                    </button>
                )}>
                    {(close) => <ModelMenu close={close} />}
                </Popover>

                {viewMode === "graph" && (
                    <Popover width={320} trigger={(open) => (
                        <button className={"btn" + (open || props.activeFiltersCount > 0 ? " btn--active" : "")}>
                            <MIcon name="tune" />
                            <span style={{ marginLeft: 6 }}>Фильтры</span>
                            {props.activeFiltersCount > 0 && (
                                <span className="btn__badge">{props.activeFiltersCount}</span>
                            )}
                        </button>
                    )}>
                        <FilterMenu counts={props.counts} />
                    </Popover>
                )}

                {viewMode === "graph" && (
                    <Popover width={280} trigger={(open) => (
                        <button className={"btn" + (open || analysisActive ? " btn--active" : "")}>
                            <MIcon name="bar_chart" /> Анализ
                        </button>
                    )}>
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
                )}

                {viewMode === "graph" && (
                    <Popover width={300} trigger={(open) => (
                        <button className={"btn" + (open ? " btn--active" : "")}>
                            <MIcon name="palette" /> Вид
                        </button>
                    )}>
                        {(close) => <ViewMenu close={close} />}
                    </Popover>
                )}

                <Popover width={260} trigger={(open) => (
                    <button className={"btn" + (open || dataActive ? " btn--active" : "")}>
                        <MIcon name="save" /> Данные
                    </button>
                )}>
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

                {props.remoteInfo?.server && props.remoteInfo?.mode === "hybrid" && (
                    <div
                        className="toolbar__cache"
                        title={`Локальный каталог: ${props.remoteInfo.cacheDir}\nСервер: ${props.remoteInfo.server}\nВалидация доступна, сохранение — локальное`}
                        onClick={props.onShowToast}
                    >
                        <MIcon name="folder" />
                        <span>Локально + сервер</span>
                    </div>
                )}
                {props.remoteInfo?.server &&
                    props.remoteInfo?.mode !== "hybrid" &&
                    props.remoteInfo?.fetchedAt && (
                        <div
                            className="toolbar__cache"
                            title={`Источник: ${props.remoteInfo.server}\nОбновлён: ${new Date(props.remoteInfo.fetchedAt).toLocaleString("ru-RU")}\nСохранение = публикация (требует повышения version)`}
                            onClick={props.onShowToast}
                        >
                            <MIcon name="database" />
                            <span>Получено {relativeTime(props.remoteInfo.fetchedAt)}</span>
                        </div>
                    )}

                <button
                    className="btn btn--icon"
                    onClick={() => useGraphStore.getState().setTheme(theme === "dark" ? "light" : "dark")}
                    title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
                >
                    <MIcon name={theme === "dark" ? "light_mode" : "dark_mode"} />
                </button>

                <button
                    className="btn btn--icon"
                    onClick={() => useGraphStore.getState().setHotkeysOpen(true)}
                    title="Горячие клавиши (?)"
                >
                    <MIcon name="keyboard" />
                </button>

                <button
                    className="btn btn--icon"
                    onClick={() => useGraphStore.getState().setHelpOpen(true)}
                    title="Руководство пользователя (F1)"
                >
                    <MIcon name="menu_book" />
                </button>
            </div>

            {/* ============ ROW 2: modes + toggle + stats ============ */}
            <div className="toolbar-row2">
                <div className="toolbar-row2__modes">
                    {viewMode === "graph" && (
                        <ActiveModesBar ruleViolationsCount={props.ruleViolationsCount} />
                    )}
                </div>
                <div className="toolbar-row2__right">
                    <span className="toolbar-row2__stats">
                        {props.visibleNodesCount} / {props.totalNodesCount} узлов ·{" "}
                        {props.visibleEdgesCount} / {props.totalEdgesCount} связей
                    </span>
                    <div className="toolbar__mode-toggle">
                        <button
                            className={"toolbar__mode-btn" + (viewMode === "list" ? " toolbar__mode-btn--active" : "")}
                            onClick={() => setViewMode("list")}
                            title="Список доменов"
                        >
                            <MIcon name="list" size="sm" />
                            <span>Список</span>
                        </button>
                        <button
                            className={"toolbar__mode-btn" + (viewMode === "graph" ? " toolbar__mode-btn--active" : "")}
                            onClick={() => setViewMode("graph")}
                            title="Граф доменов"
                        >
                            <MIcon name="schema" size="sm" />
                            <span>Граф</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}