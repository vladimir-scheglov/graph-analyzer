import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useNavigation } from "../../hooks/useNavigation";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import {
    computeLearningPath,
    EnrichedLearningPath,
    EnrichedLearningPathDomain,
    EnrichedLearningPathStage,
    LearningPathDifficulty,
} from "../../lib/algorithms/learning-path";
import { generateLearningPathMarkdown } from "../../lib/markdown";
import { alertDialog, confirmDialog } from "../../lib/dialogs";

// ============ Types ============

type Scope = "all" | "visible" | "bookmarked";
type DifficultyFilter = LearningPathDifficulty | "all";
type SortBy = "path" | "time" | "size";

interface LearningPathModalProps {
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
    onStartTour: (path: EnrichedLearningPath) => void;
}

// ============ Storage ============

const PROGRESS_KEY = "dg-learning-path-progress-v1";

interface ProgressState {
    /** domainId → timestamp изучения. */
    studied: Record<string, number>;
}

function loadProgress(): ProgressState {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (!raw) return { studied: {} };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { studied: {} };
        const studied = typeof parsed.studied === "object" && parsed.studied ? parsed.studied : {};
        return { studied };
    } catch {
        return { studied: {} };
    }
}

function saveProgress(p: ProgressState): void {
    try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch { /* ignore */ }
}

// ============ Utils ============

function fmtMinutes(m: number): string {
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest === 0 ? `${h} ч` : `${h} ч ${rest} мин`;
}

function downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

const DIFFICULTY_LABELS: Record<LearningPathDifficulty, string> = {
    small: "small",
    medium: "medium",
    large: "large",
};

// ============ Main ============

export function LearningPathModal(props: LearningPathModalProps) {
    const { goto } = useNavigation();
    const { index } = useModelIndex();
    const open = useGraphStore((s) => s.learningPathOpen);
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);
    const setLearningPathOpen = useGraphStore((s) => s.setLearningPathOpen);

    // --- Setup ---
    const [scope, setScope] = useState<Scope>("all");
    const [path, setPath] = useState<EnrichedLearningPath | null>(null);
    const [building, setBuilding] = useState(false);

    // --- Progress ---
    const [progress, setProgress] = useState<ProgressState>(loadProgress);
    useEffect(() => {
        saveProgress(progress);
    }, [progress]);

    const toggleStudied = useCallback((domainId: string) => {
        setProgress((prev) => {
            const next = { ...prev.studied };
            if (next[domainId]) delete next[domainId];
            else next[domainId] = Date.now();
            return { studied: next };
        });
    }, []);

    const clearProgress = useCallback(async () => {
        const ok = await confirmDialog(
            "Сбросить прогресс изучения?",
            { detail: "Все отметки «изучено» будут удалены.", danger: true, confirmLabel: "Сбросить" },
        );
        if (!ok) return;
        setProgress({ studied: {} });
    }, []);

    // --- Filters ---
    const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set([0]));
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
    const [namespaceFilter, setNamespaceFilter] = useState<string>("");
    const [sortBy, setSortBy] = useState<SortBy>("path");
    const [activeIdx, setActiveIdx] = useState(0);

    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setPath(null);
            setExpandedStages(new Set([0]));
            setQuery("");
            setDifficultyFilter("all");
            setNamespaceFilter("");
            setSortBy("path");
        }
    }, [open]);

    const build = useCallback(() => {
        setBuilding(true);
        try {
            let restrictTo: Set<string> | null = null;
            if (scope === "visible") restrictTo = new Set(props.visibleDomains.map((d) => d.id));
            else if (scope === "bookmarked") restrictTo = new Set(props.bookmarkedDomains.map((d) => d.id));

            let pathNodes = nodes;
            let pathEdges = edges;
            if (restrictTo) {
                pathNodes = nodes.filter((n) => restrictTo!.has(n.id) || n.data.nodeType !== "domain");
                pathEdges = edges.filter((e) => restrictTo!.has(e.source) && restrictTo!.has(e.target));
            }

            const result = computeLearningPath(pathNodes, pathEdges, {
                index: index || null,
                scope,
            });
            setPath(result);
            setExpandedStages(new Set([0]));
        } finally {
            setBuilding(false);
        }
    }, [scope, nodes, edges, index, props.visibleDomains, props.bookmarkedDomains]);

    // --- Derived ---
    const allNamespaces = useMemo(() => {
        if (!path) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        path.stages.forEach((st) =>
            st.domains.forEach((d) => {
                map.set(d.namespace, (map.get(d.namespace) || 0) + 1);
            }),
        );
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [path]);

    const allTags = useMemo(() => {
        if (!path) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        path.stages.forEach((st) =>
            st.domains.forEach((d) => {
                d.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1));
            }),
        );
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [path]);

    const filterDomain = useCallback(
        (d: EnrichedLearningPathDomain): boolean => {
            if (difficultyFilter !== "all" && d.difficulty !== difficultyFilter) return false;
            if (namespaceFilter && d.namespace !== namespaceFilter) return false;
            const q = deferredQuery.trim().toLowerCase();
            if (q) {
                const hay = `${d.domainId} ${d.label || ""} ${d.description || ""} ${d.tags.join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        },
        [difficultyFilter, namespaceFilter, deferredQuery],
    );

    const filteredStages = useMemo(() => {
        if (!path) return [] as Array<{ stage: EnrichedLearningPathStage; domains: EnrichedLearningPathDomain[] }>;
        return path.stages
            .map((stage) => ({
                stage,
                domains: stage.domains.filter(filterDomain),
            }))
            .filter((x) => x.domains.length > 0);
    }, [path, filterDomain]);

    // Flat list for keyboard nav
    const flatDomains = useMemo(() => {
        const result: Array<{ stageIndex: number; domain: EnrichedLearningPathDomain }> = [];
        filteredStages.forEach(({ stage, domains }) => {
            domains.forEach((d) => result.push({ stageIndex: stage.index, domain: d }));
        });
        if (sortBy === "time") {
            result.sort((a, b) => b.domain.metrics.estimatedMinutes - a.domain.metrics.estimatedMinutes);
        } else if (sortBy === "size") {
            result.sort((a, b) => b.domain.metrics.entityCount - a.domain.metrics.entityCount);
        }
        return result;
    }, [filteredStages, sortBy]);

    useEffect(() => {
        setActiveIdx(0);
    }, [deferredQuery, difficultyFilter, namespaceFilter, sortBy]);

    // Progress metrics
    const progressStats = useMemo(() => {
        if (!path) return { studied: 0, total: 0, minutesStudied: 0, totalMinutes: 0, pct: 0 };
        let total = 0;
        let studied = 0;
        let totalMinutes = 0;
        let minutesStudied = 0;
        for (const st of path.stages) {
            for (const d of st.domains) {
                total++;
                totalMinutes += d.metrics.estimatedMinutes;
                if (progress.studied[d.domainId]) {
                    studied++;
                    minutesStudied += d.metrics.estimatedMinutes;
                }
            }
        }
        const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
        return { studied, total, minutesStudied, totalMinutes, pct };
    }, [path, progress]);

    // --- Handlers ---
    const toggleStage = useCallback((idx: number) => {
        setExpandedStages((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        if (!path) return;
        setExpandedStages(new Set(filteredStages.map((x) => x.stage.index)));
    }, [path, filteredStages]);

    const collapseAll = useCallback(() => {
        setExpandedStages(new Set());
    }, []);

    const openInGraph = useCallback(
        (domainId: string) => {
            goto(domainId);
            setLearningPathOpen(false);
        },
        [goto, setLearningPathOpen],
    );

    const openSchema = useCallback(
        (domainId: string) => {
            const st = useGraphStore.getState();
            st.setDomainSchemaDomainId(domainId);
            st.setDomainSchemaOpen(true);
            setLearningPathOpen(false);
        },
        [setLearningPathOpen],
    );

    const openEntityCatalog = useCallback(
        (domainId: string) => {
            const st = useGraphStore.getState();
            st.setEntityCatalogInitialFqid(domainId + "/");
            // Не открываем как FQID — открываем просто каталог
            st.setEntityCatalogInitialFqid(null);
            st.setEntityCatalogOpen(true);
            setLearningPathOpen(false);
        },
        [setLearningPathOpen],
    );

    // --- Keyboard ---
    useEffect(() => {
        if (!open || !path) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
                if (e.key === "Escape") {
                    setQuery("");
                    (target as HTMLInputElement).blur();
                }
                return;
            }
            const total = flatDomains.length;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, Math.max(0, total - 1)));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && activeIdx >= 0 && activeIdx < total) {
                e.preventDefault();
                openInGraph(flatDomains[activeIdx].domain.domainId);
            } else if (e.key === " " && activeIdx >= 0 && activeIdx < total) {
                e.preventDefault();
                toggleStudied(flatDomains[activeIdx].domain.domainId);
            } else if (e.key === "/") {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === "Escape") {
                setLearningPathOpen(false);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, path, flatDomains, activeIdx, openInGraph, toggleStudied, setLearningPathOpen]);

    // Auto-scroll active row
    useEffect(() => {
        const el = document.querySelector(".lp-domain-card--active") as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeIdx]);

    // --- Export ---

    const exportMarkdown = useCallback(async () => {
        if (!path) return;
        const md = generateLearningPathMarkdown(path, { scope, studied: progress.studied });
        downloadFile(md, `learning-path-${Date.now()}.md`, "text/markdown;charset=utf-8");
        await alertDialog("Экспорт готов", {
            detail: "Markdown сохранён с учётом отметок «изучено».",
        });
    }, [path, scope]);

    const exportJSON = useCallback(() => {
        if (!path) return;
        const payload = {
            meta: path.meta,
            progress: {
                studiedDomainIds: Object.keys(progress.studied),
            },
            path,
        };
        downloadFile(
            JSON.stringify(payload, null, 2),
            `learning-path-${Date.now()}.json`,
            "application/json",
        );
    }, [path, progress]);

    const copyPlan = useCallback(async () => {
        if (!path) return;
        const lines: string[] = [];
        lines.push(`Путь изучения (${path.totalStages} этапов):`);
        path.stages.forEach((st) => {
            lines.push("");
            lines.push(`— Этап ${st.index + 1} · ${st.domains.length} доменов · ${fmtMinutes(st.totalMinutes)} —`);
            st.domains.forEach((d) => lines.push(`  ${d.domainId}`));
        });
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore.getState().showSnackbar("План скопирован");
        } catch { /* ignore */ }
    }, [path]);

    // --- Render ---

    if (!open) return null;

    const resetFilters = () => {
        setQuery("");
        setDifficultyFilter("all");
        setNamespaceFilter("");
        setSortBy("path");
    };

    const hasFilters = !!deferredQuery.trim() || difficultyFilter !== "all" || !!namespaceFilter;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setLearningPathOpen(false)}
        >
            <div
                className="help-modal learning-path-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* === HEADER === */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="route" size="sm" />
                        <span className="icon-label">Путь изучения</span>
                        {path && (
                            <>
                                <span className="help-modal__badge">
                                    {path.totalStages} этапов · {path.totalDomains} доменов
                                </span>
                                {progressStats.studied > 0 && (
                                    <span
                                        className="help-modal__badge"
                                        style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
                                    >
                                        ✓ {progressStats.studied} / {progressStats.total}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => setLearningPathOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                {/* === BODY === */}
                <div className="lp-body">
                    {!path && (
                        <div className="lp-setup">
                            <div className="lp-setup__intro">
                                <div className="lp-setup__title">Построить путь изучения</div>
                                <div className="lp-setup__desc">
                                    Порядок чтения — от «фундамента» к верхним слоям. Каждый этап можно
                                    читать параллельно, этапы проходятся последовательно. С оценкой
                                    времени и рекомендациями.
                                </div>
                            </div>

                            <div className="lp-setup__scope">
                                <div className="lp-setup__label">Область</div>
                                <label className={`lp-scope-option${scope === "all" ? " active" : ""}`}>
                                    <input
                                        type="radio"
                                        checked={scope === "all"}
                                        onChange={() => setScope("all")}
                                    />
                                    <span className="lp-scope-option__label">Все домены</span>
                                    <span className="lp-scope-option__count">
                                        {nodes.filter((n) => n.data.nodeType === "domain").length}
                                    </span>
                                </label>
                                <label className={`lp-scope-option${scope === "visible" ? " active" : ""}`}>
                                    <input
                                        type="radio"
                                        checked={scope === "visible"}
                                        onChange={() => setScope("visible")}
                                    />
                                    <span className="lp-scope-option__label">Только видимые</span>
                                    <span className="lp-scope-option__count">
                                        {props.visibleDomains.length}
                                    </span>
                                </label>
                                <label className={`lp-scope-option${scope === "bookmarked" ? " active" : ""}`}>
                                    <input
                                        type="radio"
                                        checked={scope === "bookmarked"}
                                        onChange={() => setScope("bookmarked")}
                                    />
                                    <span className="lp-scope-option__label">Только избранные</span>
                                    <span className="lp-scope-option__count">
                                        {props.bookmarkedDomains.length}
                                    </span>
                                </label>
                            </div>

                            <div className="lp-setup__info">
                                <MIcon name="info" size="sm" />
                                <span>
                                    Время чтения — эвристика по количеству сущностей / атрибутов /
                                    views. Критический путь = минимальное количество этапов.
                                </span>
                            </div>

                            <button
                                className="btn btn--primary lp-setup__build"
                                onClick={build}
                                disabled={building}
                            >
                                {building ? (
                                    <>
                                        <MIcon name="hourglass_top" size="sm" />
                                        Построение…
                                    </>
                                ) : (
                                    <>
                                        <MIcon name="play_arrow" size="sm" />
                                        Построить путь изучения
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {path && (
                        <>
                            {/* === KPI === */}
                            <div className="lp-kpi">
                                <div className="lp-kpi-card">
                                    <div className="lp-kpi-card__value">{path.totalStages}</div>
                                    <div className="lp-kpi-card__label">этапов</div>
                                    <div className="lp-kpi-card__sub">
                                        критический путь
                                    </div>
                                </div>
                                <div className="lp-kpi-card">
                                    <div className="lp-kpi-card__value">{path.totalDomains}</div>
                                    <div className="lp-kpi-card__label">доменов</div>
                                    <div className="lp-kpi-card__sub">
                                        {path.foundationsCount} foundations
                                    </div>
                                </div>
                                <div className="lp-kpi-card">
                                    <div className="lp-kpi-card__value">{fmtMinutes(path.totalMinutes)}</div>
                                    <div className="lp-kpi-card__label">≈ времени</div>
                                    <div className="lp-kpi-card__sub">
                                        {progressStats.studied > 0
                                            ? `${fmtMinutes(progressStats.minutesStudied)} изучено`
                                            : `на ${Math.max(1, Math.ceil(path.totalMinutes / 60))} сессий`}
                                    </div>
                                </div>
                                <div className="lp-kpi-card lp-kpi-card--progress">
                                    <div className="lp-kpi-card__value">
                                        {progressStats.pct}<span className="lp-kpi-card__unit">%</span>
                                    </div>
                                    <div className="lp-kpi-card__label">
                                        {progressStats.studied} / {progressStats.total}
                                    </div>
                                    <div className="lp-kpi-progress">
                                        <div
                                            className="lp-kpi-progress__fill"
                                            style={{ width: `${progressStats.pct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* === TOOLBAR === */}
                            <div className="lp-toolbar">
                                <div className="lp-toolbar__search">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Поиск домена… (/)"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {query && (
                                        <button className="lp-toolbar__clear" onClick={() => setQuery("")}>
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="lp-toolbar__chips">
                                    <span className="lp-toolbar__label">Сложность:</span>
                                    {(["all", "small", "medium", "large"] as DifficultyFilter[]).map((d) => (
                                        <button
                                            key={d}
                                            className={"lp-chip" + (difficultyFilter === d ? " active" : "")}
                                            onClick={() => setDifficultyFilter(d)}
                                        >
                                            {d === "all" ? "все" : d}
                                        </button>
                                    ))}
                                </div>

                                {allNamespaces.length > 1 && (
                                    <label className="lp-toolbar__select">
                                        <span>Namespace:</span>
                                        <select
                                            value={namespaceFilter}
                                            onChange={(e) => setNamespaceFilter(e.target.value)}
                                        >
                                            <option value="">все ({allNamespaces.length})</option>
                                            {allNamespaces.map(([ns, count]) => (
                                                <option key={ns} value={ns}>
                                                    {ns} ({count})
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                <label className="lp-toolbar__select">
                                    <span>Сортировка:</span>
                                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                                        <option value="path">по пути (этапы)</option>
                                        <option value="time">по времени (дольше сначала)</option>
                                        <option value="size">по размеру (крупнее сначала)</option>
                                    </select>
                                </label>

                                <div className="lp-toolbar__spacer" />

                                <div className="lp-toolbar__actions">
                                    <button className="btn btn--icon btn--small" onClick={expandAll} title="Развернуть всё">
                                        <MIcon name="unfold_more" size="sm" />
                                    </button>
                                    <button className="btn btn--icon btn--small" onClick={collapseAll} title="Свернуть всё">
                                        <MIcon name="unfold_less" size="sm" />
                                    </button>
                                    {hasFilters && (
                                        <button className="btn btn--small" onClick={resetFilters}>
                                            <MIcon name="filter_alt_off" size="sm" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* === CONTENT === */}
                            <div className="lp-content">
                                {/* Entry points */}
                                {path.entryPoints.length > 0 && (
                                    <div className="lp-entry-points">
                                        <div className="lp-entry-points__head">
                                            <MIcon name="login" size="sm" />
                                            <span className="lp-entry-points__title">
                                                Точки входа ({path.entryPoints.length})
                                            </span>
                                            <span className="lp-entry-points__hint">
                                                никто от них не зависит, они зависят от других — начните с них
                                            </span>
                                        </div>
                                        <div className="lp-entry-points__body">
                                            {path.entryPoints.map((d) => (
                                                <button
                                                    key={d.id}
                                                    className={
                                                        "lp-entry-chip" +
                                                        (progress.studied[d.domainId] ? " lp-entry-chip--studied" : "")
                                                    }
                                                    onClick={() => openInGraph(d.domainId)}
                                                    title={d.description || d.domainId}
                                                >
                                                    <span className="lp-entry-chip__dot" />
                                                    <code>{d.domainId}</code>
                                                    <span className="lp-entry-chip__meta">
                                                        {d.metrics.entityCount} сущ. · {fmtMinutes(d.metrics.estimatedMinutes)}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* No results */}
                                {flatDomains.length === 0 && (
                                    <div className="lp-empty">
                                        <MIcon name="search_off" size="xl" />
                                        <div className="lp-empty__title">
                                            Ничего не найдено по текущим фильтрам
                                        </div>
                                        <button className="btn" onClick={resetFilters} style={{ marginTop: 12 }}>
                                            Сбросить фильтры
                                        </button>
                                    </div>
                                )}

                                {/* Stages */}
                                {sortBy === "path" &&
                                    filteredStages.map(({ stage, domains }) => {
                                        const isOpen = expandedStages.has(stage.index);
                                        const studiedInStage = domains.filter((d) => progress.studied[d.domainId]).length;
                                        return (
                                            <div
                                                key={stage.index}
                                                className={"lp-stage" + (isOpen ? " lp-stage--open" : "")}
                                            >
                                                <button
                                                    className="lp-stage__head"
                                                    onClick={() => toggleStage(stage.index)}
                                                >
                                                    <MIcon
                                                        name={isOpen ? "expand_more" : "chevron_right"}
                                                        size="sm"
                                                    />
                                                    <span className="lp-stage__badge">{stage.index + 1}</span>
                                                    <span className="lp-stage__title">Этап {stage.index + 1}</span>
                                                    <span className="lp-stage__count">
                                                        {domains.length}
                                                        {domains.length < stage.domains.length && (
                                                            <span className="lp-stage__count-filtered">
                                                                /{stage.domains.length}
                                                            </span>
                                                        )}{" "}
                                                        доменов
                                                    </span>
                                                    <span className="lp-stage__meta">
                                                        {stage.totalEntities} сущ. ·{" "}
                                                        {fmtMinutes(stage.totalMinutes)}
                                                    </span>
                                                    {stage.totalLintIssues > 0 && (
                                                        <span className="lp-stage__issue-badge" title="Lint проблем">
                                                            <MIcon name="warning" size="sm" /> {stage.totalLintIssues}
                                                        </span>
                                                    )}
                                                    {studiedInStage > 0 && (
                                                        <span className="lp-stage__studied-badge">
                                                            ✓ {studiedInStage}/{domains.length}
                                                        </span>
                                                    )}
                                                </button>

                                                {isOpen && (
                                                    <div className="lp-stage__body">
                                                        {domains.map((d) => {
                                                            const isStudied = !!progress.studied[d.domainId];
                                                            const globalIdx = flatDomains.findIndex(
                                                                (x) => x.domain.id === d.id,
                                                            );
                                                            const isActive = globalIdx === activeIdx;
                                                            return (
                                                                <DomainCard
                                                                    key={d.id}
                                                                    domain={d}
                                                                    isStudied={isStudied}
                                                                    isActive={isActive}
                                                                    onToggleStudied={() => toggleStudied(d.domainId)}
                                                                    onOpenGraph={() => openInGraph(d.domainId)}
                                                                    onOpenSchema={() => openSchema(d.domainId)}
                                                                    onOpenCatalog={() => openEntityCatalog(d.domainId)}
                                                                    onNavigate={() => setActiveIdx(globalIdx)}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                {/* Flat sort (time/size) */}
                                {sortBy !== "path" && flatDomains.length > 0 && (
                                    <div className="lp-flat">
                                        <div className="lp-flat__title">
                                            {sortBy === "time" ? "По времени чтения (дольше — сначала)" : "По размеру (крупнее — сначала)"}
                                        </div>
                                        {flatDomains.map(({ domain: d, stageIndex }, i) => {
                                            const isStudied = !!progress.studied[d.domainId];
                                            const isActive = i === activeIdx;
                                            return (
                                                <div key={d.id} className="lp-flat__row">
                                                    <span className="lp-flat__stage">L{stageIndex + 1}</span>
                                                    <DomainCard
                                                        domain={d}
                                                        isStudied={isStudied}
                                                        isActive={isActive}
                                                        onToggleStudied={() => toggleStudied(d.domainId)}
                                                        onOpenGraph={() => openInGraph(d.domainId)}
                                                        onOpenSchema={() => openSchema(d.domainId)}
                                                        onOpenCatalog={() => openEntityCatalog(d.domainId)}
                                                        onNavigate={() => setActiveIdx(i)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Unresolved */}
                                {path.unresolved.length > 0 && (
                                    <div className="lp-unresolved">
                                        <div className="lp-unresolved__head">
                                            <MIcon name="warning" size="sm" />
                                            <span>Циклы — требуют ручного разбора ({path.unresolved.length})</span>
                                        </div>
                                        <div className="lp-unresolved__body">
                                            {path.unresolved.map((d) => (
                                                <button
                                                    key={d.id}
                                                    className="lp-unresolved__item"
                                                    onClick={() => openInGraph(d.domainId)}
                                                >
                                                    <code>{d.domainId}</code>
                                                    <span>{d.metrics.entityCount} сущ.</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Recommendations */}
                                {path.recommendations.length > 0 && (
                                    <div className="lp-recommendations">
                                        <div className="lp-recommendations__head">
                                            <MIcon name="lightbulb" size="sm" />
                                            <span>Рекомендации ({path.recommendations.length})</span>
                                        </div>
                                        <div className="lp-recommendations__body">
                                            {path.recommendations.map((r, i) => (
                                                <div key={i} className={`lp-recommendation lp-recommendation--${r.kind}`}>
                                                    <MIcon
                                                        name={
                                                            r.kind === "lint"
                                                                ? "error"
                                                                : r.kind === "pii"
                                                                    ? "shield_lock"
                                                                    : r.kind === "size"
                                                                        ? "straighten"
                                                                        : "hub"
                                                        }
                                                        size="sm"
                                                    />
                                                    <span>{r.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* === FOOTER === */}
                            <div className="lp-footer">
                                <div className="lp-footer__stats">
                                    <span>
                                        ✓ {progressStats.studied} / {progressStats.total} изучено
                                    </span>
                                    <span>·</span>
                                    <span>
                                        {fmtMinutes(progressStats.minutesStudied)} / {fmtMinutes(path.totalMinutes)}
                                    </span>
                                </div>
                                <div className="lp-footer__actions">
                                    <button className="btn" onClick={() => setPath(null)}>
                                        ← Настройки
                                    </button>
                                    <button
                                        className="btn btn--primary"
                                        onClick={() => {
                                            props.onStartTour(path);
                                            setLearningPathOpen(false);
                                        }}
                                    >
                                        <MIcon name="play_arrow" size="sm" />
                                        Экскурсия
                                    </button>
                                    <button className="btn" onClick={copyPlan}>
                                        <MIcon name="content_copy" size="sm" />
                                        Копировать
                                    </button>
                                    <button className="btn" onClick={exportJSON}>
                                        <MIcon name="data_object" size="sm" />
                                        JSON
                                    </button>
                                    <button className="btn" onClick={exportMarkdown}>
                                        <MIcon name="description" size="sm" />
                                        MD
                                    </button>
                                    {progressStats.studied > 0 && (
                                        <button className="btn btn--danger" onClick={clearProgress} title="Сбросить прогресс">
                                            <MIcon name="restart_alt" size="sm" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============ DomainCard ============

interface DomainCardProps {
    domain: EnrichedLearningPathDomain;
    isStudied: boolean;
    isActive: boolean;
    onToggleStudied: () => void;
    onOpenGraph: () => void;
    onOpenSchema: () => void;
    onOpenCatalog: () => void;
    onNavigate: () => void;
}

const DomainCard = React.memo(function DomainCard({
    domain: d,
    isStudied,
    isActive,
    onToggleStudied,
    onOpenGraph,
    onOpenSchema,
    onOpenCatalog,
    onNavigate,
}: DomainCardProps) {
    const cls = [
        "lp-domain-card",
        isStudied && "lp-domain-card--studied",
        isActive && "lp-domain-card--active",
        `lp-domain-card--${d.difficulty}`,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={cls} onMouseEnter={onNavigate}>
            <button
                type="button"
                className={"lp-domain-card__check" + (isStudied ? " checked" : "")}
                onClick={onToggleStudied}
                title={isStudied ? "Снять отметку" : "Отметить как изученное"}
            >
                {isStudied ? <MIcon name="check" size="sm" /> : null}
            </button>

            <div className="lp-domain-card__main">
                <div className="lp-domain-card__head">
                    <button
                        type="button"
                        className="lp-domain-card__id"
                        onClick={onOpenGraph}
                        title="Открыть на графе"
                    >
                        {d.domainId}
                    </button>
                    {d.label && d.label !== d.domainId && (
                        <span className="lp-domain-card__label">{d.label}</span>
                    )}
                    <span className={`lp-difficulty-badge lp-difficulty-badge--${d.difficulty}`}>
                        {DIFFICULTY_LABELS[d.difficulty]}
                    </span>
                </div>

                {d.description && (
                    <div className="lp-domain-card__desc">{d.description}</div>
                )}

                <div className="lp-domain-card__stats">
                    <span className="lp-domain-card__stat" title="Сущностей">
                        <MIcon name="data_object" size="sm" /> {d.metrics.entityCount}
                    </span>
                    <span className="lp-domain-card__stat" title="Атрибутов">
                        <MIcon name="edit_note" size="sm" /> {d.metrics.attributeCount}
                    </span>
                    <span className="lp-domain-card__stat" title="Views">
                        <MIcon name="view_quilt" size="sm" /> {d.metrics.viewCount}
                    </span>
                    <span className="lp-domain-card__stat" title="≈ минут чтения">
                        <MIcon name="schedule" size="sm" /> {d.metrics.estimatedMinutes} мин
                    </span>

                    {d.fanIn > 0 && (
                        <span className="lp-domain-card__stat" title="Зависят от него">
                            <MIcon name="call_received" size="sm" /> {d.fanIn}
                        </span>
                    )}
                    {d.fanOut > 0 && (
                        <span className="lp-domain-card__stat" title="Зависит от">
                            <MIcon name="call_made" size="sm" /> {d.fanOut}
                        </span>
                    )}

                    {d.metrics.lintIssueCount > 0 && (
                        <span className="lp-domain-card__badge lp-domain-card__badge--warn" title="Lint проблемы">
                            <MIcon name="warning" size="sm" /> {d.metrics.lintIssueCount}
                        </span>
                    )}
                    {d.metrics.piiCriticalCount > 0 && (
                        <span className="lp-domain-card__badge lp-domain-card__badge--err" title="PII critical">
                            <MIcon name="shield_lock" size="sm" /> {d.metrics.piiCriticalCount}
                        </span>
                    )}
                </div>

                {d.tags.length > 0 && (
                    <div className="lp-domain-card__tags">
                        {d.tags.slice(0, 6).map((t) => (
                            <span key={t} className="lp-domain-card__tag">
                                {t}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="lp-domain-card__actions">
                <button className="lp-domain-card__action" onClick={onOpenGraph} title="На графе">
                    <MIcon name="hub" size="sm" />
                </button>
                <button className="lp-domain-card__action" onClick={onOpenSchema} title="Схема">
                    <MIcon name="menu_book" size="sm" />
                </button>
                <button className="lp-domain-card__action" onClick={onOpenCatalog} title="Каталог сущностей">
                    <MIcon name="category" size="sm" />
                </button>
            </div>
        </div>
    );
});