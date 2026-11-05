import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useNavigation } from "../../hooks/useNavigation";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import { Popover } from "../common/Popover";
import {
    EntityFilters,
    EMPTY_FILTERS,
    EntityKindFilter,
    EntitySortBy,
    IssuesFilter,
    PiiFilter,
    SortDir,
    countMixins,
    countRefs,
    filterAndSortEntities,
} from "../../lib/model/entity-filters";
import {
    exportEntitiesCSV,
    exportEntitiesJSON,
} from "../../lib/model/entity-export";
import { ImpactAnalysisPanel } from "./ImpactAnalysisPanel";
import type {
    EntityRecord,
    ModelIndex,
} from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import type { PiiHit } from "../../../shared/pii-types";

// ============ Константы ============

const PAGE_SIZE = 300;
const FILTERS_STORAGE_KEY = "dg-entity-catalog-filters";
const SORT_STORAGE_KEY = "dg-entity-catalog-sort";
const DENSE_STORAGE_KEY = "dg-entity-catalog-dense";
const GROUP_STORAGE_KEY = "dg-entity-catalog-group";

const ATTRIBUTE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "Reference", label: "Reference" },
    { value: "Array", label: "Array" },
    { value: "Table", label: "Table" },
    { value: "Enum", label: "Enum" },
    { value: "Workflow", label: "Workflow" },
    { value: "String", label: "String" },
    { value: "Text", label: "Text" },
    { value: "Date", label: "Date" },
    { value: "Identifier", label: "Identifier" },
    { value: "Counter", label: "Counter" },
    { value: "Attachment", label: "Attachment" },
    { value: "Calculation", label: "Calculation" },
];

const KIND_OPTIONS: Array<{ value: EntityKindFilter; label: string }> = [
    { value: "regular", label: "Обычные" },
    { value: "abstract", label: "Абстрактные" },
    { value: "static", label: "Статические" },
];

const PII_OPTIONS: Array<{ value: PiiFilter; label: string }> = [
    { value: "any", label: "Все" },
    { value: "critical", label: "С critical" },
    { value: "high", label: "С high" },
    { value: "clean", label: "Без PII" },
];

const ISSUES_OPTIONS: Array<{ value: IssuesFilter; label: string }> = [
    { value: "any", label: "Все" },
    { value: "errors", label: "С ошибками" },
    { value: "warnings", label: "С предупреждениями" },
    { value: "clean", label: "Чистые" },
];

const SORT_LABELS: Record<EntitySortBy, string> = {
    refs: "Ссылок",
    name: "Имя",
    domain: "Домен",
    attributes: "Атрибутов",
    issues: "Проблем",
    pii: "PII",
    mixins: "Миксинов",
};

const FILTER_GROUPS_STORAGE_KEY = "dg-entity-catalog-collapsed-groups";
const DEFAULT_COLLAPSED_GROUPS = ["domains", "tags"];

function loadCollapsedFilterGroups(): Set<string> {
    try {
        const raw = localStorage.getItem(FILTER_GROUPS_STORAGE_KEY);
        if (raw === null) return new Set(DEFAULT_COLLAPSED_GROUPS);
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set(DEFAULT_COLLAPSED_GROUPS);
    }
}

function saveCollapsedFilterGroups(s: Set<string>): void {
    try {
        localStorage.setItem(
            FILTER_GROUPS_STORAGE_KEY,
            JSON.stringify(Array.from(s)),
        );
    } catch { /* ignore */ }
}

// ============ Persistence ============

interface PersistedFilters {
    query: string;
    domains: string[];
    tags: string[];
    kinds: EntityKindFilter[];
    hasInherits: boolean;
    hasMixins: boolean;
    onlyOrphans: boolean;
    minRefs: number;
    piiFilter: PiiFilter;
    issuesFilter: IssuesFilter;
    attributeTypes: string[];
}

function loadFilters(): EntityFilters {
    try {
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!raw) return EMPTY_FILTERS;
        const p: PersistedFilters = JSON.parse(raw);
        return {
            query: typeof p.query === "string" ? p.query : "",
            domains: new Set(Array.isArray(p.domains) ? p.domains : []),
            tags: new Set(Array.isArray(p.tags) ? p.tags : []),
            kinds: new Set(Array.isArray(p.kinds) ? p.kinds : []),
            hasInherits: !!p.hasInherits,
            hasMixins: !!p.hasMixins,
            onlyOrphans: !!p.onlyOrphans,
            minRefs: typeof p.minRefs === "number" ? p.minRefs : 0,
            piiFilter: p.piiFilter || "any",
            issuesFilter: p.issuesFilter || "any",
            attributeTypes: new Set(
                Array.isArray(p.attributeTypes) ? p.attributeTypes : [],
            ),
        };
    } catch {
        return EMPTY_FILTERS;
    }
}

function saveFilters(f: EntityFilters): void {
    try {
        const p: PersistedFilters = {
            query: f.query,
            domains: Array.from(f.domains),
            tags: Array.from(f.tags),
            kinds: Array.from(f.kinds),
            hasInherits: f.hasInherits,
            hasMixins: f.hasMixins,
            onlyOrphans: f.onlyOrphans,
            minRefs: f.minRefs,
            piiFilter: f.piiFilter,
            issuesFilter: f.issuesFilter,
            attributeTypes: Array.from(f.attributeTypes),
        };
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(p));
    } catch {
        /* ignore */
    }
}

function loadSort(): { sortBy: EntitySortBy; sortDir: SortDir } {
    try {
        const raw = localStorage.getItem(SORT_STORAGE_KEY);
        if (!raw) return { sortBy: "refs", sortDir: "desc" };
        const p = JSON.parse(raw);
        return {
            sortBy: p.sortBy || "refs",
            sortDir: p.sortDir === "asc" ? "asc" : "desc",
        };
    } catch {
        return { sortBy: "refs", sortDir: "desc" };
    }
}

function saveSort(sortBy: EntitySortBy, sortDir: SortDir): void {
    try {
        localStorage.setItem(
            SORT_STORAGE_KEY,
            JSON.stringify({ sortBy, sortDir }),
        );
    } catch {
        /* ignore */
    }
}

function loadDense(): boolean {
    try {
        return localStorage.getItem(DENSE_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function loadGroup(): boolean {
    try {
        return localStorage.getItem(GROUP_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function hasActiveFilters(f: EntityFilters): boolean {
    return (
        !!f.query.trim() ||
        f.domains.size > 0 ||
        f.tags.size > 0 ||
        f.kinds.size > 0 ||
        f.hasInherits ||
        f.hasMixins ||
        f.onlyOrphans ||
        f.minRefs > 0 ||
        f.piiFilter !== "any" ||
        f.issuesFilter !== "any" ||
        f.attributeTypes.size > 0
    );
}

// ============ Модалка ============

export function EntitiesCatalogModal() {
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();

    const [filters, setFilters] = useState<EntityFilters>(loadFilters);
    const [sortBy, setSortBy] = useState<EntitySortBy>(loadSort().sortBy);
    const [sortDir, setSortDir] = useState<SortDir>(loadSort().sortDir);
    const [dense, setDense] = useState<boolean>(loadDense);
    const [groupByDomain, setGroupByDomain] = useState<boolean>(loadGroup);
    const [selectedFqid, setSelectedFqid] = useState<string | null>(null);
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [activeRowIdx, setActiveRowIdx] = useState(-1);

    const open = useGraphStore((s) => s.entityCatalogOpen);
    const entityFavorites = useGraphStore((s) => s.entityFavorites);
    const initialFqid = useGraphStore((s) => s.entityCatalogInitialFqid);

    const tableRef = useRef<HTMLDivElement>(null);

    const [collapsedFilterGroups, setCollapsedFilterGroups] =
        useState<Set<string>>(loadCollapsedFilterGroups);

    useEffect(() => {
        saveCollapsedFilterGroups(collapsedFilterGroups);
    }, [collapsedFilterGroups]);

    const toggleFilterGroup = useCallback((id: string) => {
        setCollapsedFilterGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const expandAllFilterGroups = useCallback(() => {
        setCollapsedFilterGroups(new Set());
    }, []);

    const collapseAllFilterGroups = useCallback(() => {
        setCollapsedFilterGroups(
            new Set(["domains", "tags", "kinds", "attributes", "pii", "issues", "properties", "refs"]),
        );
    }, []);

    // ============ Persistence ============

    useEffect(() => {
        saveFilters(filters);
    }, [filters]);

    useEffect(() => {
        saveSort(sortBy, sortDir);
    }, [sortBy, sortDir]);

    useEffect(() => {
        try {
            localStorage.setItem(DENSE_STORAGE_KEY, dense ? "1" : "0");
        } catch { }
    }, [dense]);

    useEffect(() => {
        try {
            localStorage.setItem(GROUP_STORAGE_KEY, groupByDomain ? "1" : "0");
        } catch { }
    }, [groupByDomain]);

    // ============ Prefill ============

    useEffect(() => {
        if (!open) return;
        if (!initialFqid) return;
        if (!index) return;
        setFilters(EMPTY_FILTERS);
        setLimit(PAGE_SIZE);
        setSelectedFqid(initialFqid);
        useGraphStore.getState().setEntityCatalogInitialFqid(null);
    }, [open, initialFqid, index]);

    useEffect(() => {
        if (!selectedFqid) return;
        useGraphStore.getState().pushRecentEntity(selectedFqid);
    }, [selectedFqid]);

    useEffect(() => {
        setLimit(PAGE_SIZE);
        setActiveRowIdx(-1);
    }, [filters, sortBy, sortDir, groupByDomain]);

    // ============ Derived maps ============

    const piiByFqid = useMemo(() => {
        const m = new Map<string, PiiHit[]>();
        if (!index) return m;
        for (const h of index.pii.hits) {
            const k = h.entityFqid.toLowerCase();
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(h);
        }
        return m;
    }, [index]);

    const issuesByFqid = useMemo(() => {
        const m = new Map<string, LintIssue[]>();
        if (!index) return m;
        for (const i of index.lint.lintReport.issues) {
            if (!i.entityFqid) continue;
            const k = i.entityFqid.toLowerCase();
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(i);
        }
        return m;
    }, [index]);

    const orphanSet = useMemo(() => {
        if (!index) return new Set<string>();
        return new Set(index.stats.orphanEntities);
    }, [index]);

    // ============ Filtered/sorted ============

    const filtered = useMemo(() => {
        if (!index) return [];
        return filterAndSortEntities(
            index,
            filters,
            sortBy,
            sortDir,
            piiByFqid,
            issuesByFqid,
        );
    }, [index, filters, sortBy, sortDir, piiByFqid, issuesByFqid]);

    const visibleRows = useMemo(
        () => filtered.slice(0, limit),
        [filtered, limit],
    );

    // ============ Group by domain ============

    const grouped = useMemo(() => {
        if (!groupByDomain) return null;
        const m = new Map<string, EntityRecord[]>();
        for (const e of visibleRows) {
            const k = e.domainId;
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(e);
        }
        return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [visibleRows, groupByDomain]);

    // ============ Общие метрики ============

    const stats = useMemo(() => {
        let withPii = 0;
        let withCriticalPii = 0;
        let withIssues = 0;
        let withErrors = 0;
        for (const e of filtered) {
            const pii = piiByFqid.get(e.fqid.toLowerCase()) || [];
            if (pii.length > 0) withPii++;
            if (pii.some((h) => h.severity === "critical")) withCriticalPii++;
            const iss = issuesByFqid.get(e.fqid.toLowerCase()) || [];
            if (iss.length > 0) withIssues++;
            if (iss.some((i) => i.severity === "error")) withErrors++;
        }
        return {
            total: filtered.length,
            withPii,
            withCriticalPii,
            withIssues,
            withErrors,
        };
    }, [filtered, piiByFqid, issuesByFqid]);

    // ============ Reference-данные для фильтров ============

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const allTags = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            e.domainTags.forEach((t) => {
                const key = String(t).toLowerCase();
                map.set(key, (map.get(key) || 0) + 1);
            });
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // ============ Handlers ============

    const handleSort = useCallback((field: EntitySortBy) => {
        setSortBy((prev) => {
            if (prev === field) {
                setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                return prev;
            }
            setSortDir(field === "name" || field === "domain" ? "asc" : "desc");
            return field;
        });
    }, []);

    const handleSelectRow = useCallback((fqid: string) => {
        setSelectedFqid(fqid);
    }, []);

    const handleToggleFav = useCallback((fqid: string) => {
        useGraphStore.getState().toggleEntityFavorite(fqid);
    }, []);

    const handleBack = useCallback(() => {
        setSelectedFqid(null);
    }, []);

    const handleGotoDomain = useCallback((domainId: string) => {
        useGraphStore.getState().setEntityCatalogOpen(false);
        useGraphStore.getState().setDomainSchemaDomainId(domainId);
        useGraphStore.getState().setDomainSchemaOpen(true);
    }, []);

    const handleSelectFromImpact = useCallback((fqid: string) => {
        setSelectedFqid(fqid);
    }, []);

    const toggleDomainFilter = useCallback((domainId: string) => {
        setFilters((prev) => {
            const next = new Set(prev.domains);
            const key = domainId.toLowerCase();
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return { ...prev, domains: next };
        });
    }, []);

    const toggleTagFilter = useCallback((tag: string) => {
        setFilters((prev) => {
            const next = new Set(prev.tags);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return { ...prev, tags: next };
        });
    }, []);

    const toggleKind = useCallback((k: EntityKindFilter) => {
        setFilters((prev) => {
            const next = new Set(prev.kinds);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return { ...prev, kinds: next };
        });
    }, []);

    const toggleAttributeType = useCallback((t: string) => {
        setFilters((prev) => {
            const next = new Set(prev.attributeTypes);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return { ...prev, attributeTypes: next };
        });
    }, []);

    const resetAllFilters = useCallback(() => {
        setFilters(EMPTY_FILTERS);
    }, []);

    const handleExportCSV = useCallback(() => {
        if (!index) return;
        exportEntitiesCSV(filtered, { index, piiByFqid, issuesByFqid });
        useGraphStore.getState().showSnackbar(`CSV: ${filtered.length} сущностей`);
    }, [filtered, index, piiByFqid, issuesByFqid]);

    const handleExportJSON = useCallback(() => {
        if (!index) return;
        exportEntitiesJSON(filtered, { index, piiByFqid, issuesByFqid });
        useGraphStore.getState().showSnackbar(`JSON: ${filtered.length} сущностей`);
    }, [filtered, index, piiByFqid, issuesByFqid]);

    const handleOpenPii = useCallback((domainId: string) => {
        const st = useGraphStore.getState();
        st.setEntityCatalogOpen(false);
        st.setPiiInitialDomain(domainId);
        st.setPiiInitialSeverity(null);
        st.setPiiOpen(true);
    }, []);

    const handleOpenLint = useCallback(() => {
        const st = useGraphStore.getState();
        st.setEntityCatalogOpen(false);
        st.setLintOpen(true);
    }, []);

    // ============ Keyboard ============

    const flatRowFqids = useMemo(() => {
        if (grouped) {
            const out: string[] = [];
            for (const [, list] of grouped) for (const e of list) out.push(e.fqid);
            return out;
        }
        return visibleRows.map((e) => e.fqid);
    }, [grouped, visibleRows]);

    useEffect(() => {
        if (!open) return;
        if (selectedFqid) return; // в detail-режиме клавиатура не наша

        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable)
            )
                return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const total = flatRowFqids.length;
            if (total === 0) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveRowIdx((i) => Math.min(i + 1, total - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveRowIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && activeRowIdx >= 0) {
                e.preventDefault();
                const fqid = flatRowFqids[activeRowIdx];
                if (fqid) setSelectedFqid(fqid);
            } else if (e.key === " " && activeRowIdx >= 0) {
                e.preventDefault();
                const fqid = flatRowFqids[activeRowIdx];
                if (fqid) useGraphStore.getState().toggleEntityFavorite(fqid);
            } else if (e.key === "Escape") {
                // Esc при отсутствии impact-панели закрывает модалку
                e.preventDefault();
                useGraphStore.getState().setEntityCatalogOpen(false);
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, selectedFqid, flatRowFqids, activeRowIdx]);

    // Скролл к активной строке
    useEffect(() => {
        if (activeRowIdx < 0 || !tableRef.current) return;
        const fqid = flatRowFqids[activeRowIdx];
        if (!fqid) return;
        const el = tableRef.current.querySelector(
            `.entity-catalog-row[data-fqid="${CSS.escape(fqid)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeRowIdx, flatRowFqids]);

    if (!open) return null;

    const hasFilters = hasActiveFilters(filters);
    const noResults = filtered.length === 0;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setEntityCatalogOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal entity-catalog-v2"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span className="icon-label">Каталог сущностей</span>
                        {index && (
                            <span className="help-modal__badge">
                                {filtered.length}
                                {hasFilters && ` / ${index.entities.length}`}
                            </span>
                        )}
                        {stats.withCriticalPii > 0 && (
                            <button
                                type="button"
                                className="help-modal__badge entity-catalog-v2__stat-badge entity-catalog-v2__stat-badge--pii"
                                onClick={() => {
                                    setFilters((f) => ({ ...f, piiFilter: "critical" }));
                                }}
                                title="Сущностей с PII critical"
                            >
                                <MIcon name="shield_lock" size="sm" />
                                {stats.withCriticalPii} PII
                            </button>
                        )}
                        {stats.withErrors > 0 && (
                            <button
                                type="button"
                                className="help-modal__badge entity-catalog-v2__stat-badge entity-catalog-v2__stat-badge--err"
                                onClick={() => {
                                    setFilters((f) => ({ ...f, issuesFilter: "errors" }));
                                }}
                                title="Сущностей с ошибками линтера"
                            >
                                <MIcon name="error" size="sm" />
                                {stats.withErrors}
                            </button>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__icon-btn"
                            onClick={() => setDense(!dense)}
                            title={dense ? "Обычный вид" : "Плотный вид"}
                        >
                            <MIcon name={dense ? "view_agenda" : "view_stream"} />
                        </button>
                        <button
                            className={
                                "help-modal__icon-btn" +
                                (groupByDomain ? " active" : "")
                            }
                            onClick={() => setGroupByDomain(!groupByDomain)}
                            title={
                                groupByDomain ? "Плоский список" : "Группировать по домену"
                            }
                        >
                            <MIcon name="folder" />
                        </button>
                        <Popover
                            width={240}
                            align="right"
                            trigger={(isOpen) => (
                                <button
                                    className={
                                        "help-modal__icon-btn" + (isOpen ? " active" : "")
                                    }
                                    title="Экспорт отфильтрованного списка"
                                >
                                    <MIcon name="download" />
                                </button>
                            )}
                        >
                            {(close) => (
                                <div className="menu">
                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            handleExportCSV();
                                            close();
                                        }}
                                        disabled={filtered.length === 0}
                                    >
                                        <span className="menu__icon">
                                            <MIcon name="table_view" size="sm" />
                                        </span>
                                        <span className="menu__text">
                                            CSV ({filtered.length})
                                        </span>
                                    </button>
                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            handleExportJSON();
                                            close();
                                        }}
                                        disabled={filtered.length === 0}
                                    >
                                        <span className="menu__icon">
                                            <MIcon name="data_object" size="sm" />
                                        </span>
                                        <span className="menu__text">
                                            JSON ({filtered.length})
                                        </span>
                                    </button>
                                </div>
                            )}
                        </Popover>
                        <button
                            className="help-modal__close"
                            onClick={() =>
                                useGraphStore.getState().setEntityCatalogOpen(false)
                            }
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && (
                    <div className="entity-hierarchy-body">
                        {/* ============ ЛЕВАЯ ПАНЕЛЬ ============ */}
                        <div className="entity-catalog-filters">
                            <div className="entity-search-input-wrap">
                                <span className="entity-search-icon">🔍</span>
                                <input
                                    className="entity-search-input"
                                    type="text"
                                    placeholder="Поиск: id, имя, описание, атрибуты, FQID..."
                                    value={filters.query}
                                    onChange={(e) =>
                                        setFilters({ ...filters, query: e.target.value })
                                    }
                                />
                                {filters.query && (
                                    <button
                                        className="entity-search-clear"
                                        onClick={() => setFilters({ ...filters, query: "" })}
                                        title="Очистить"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="entity-catalog-filter-body">
                                {/* === Toolbar «развернуть/свернуть всё» === */}
                                <div className="entity-catalog-filter-actions">
                                    <button
                                        type="button"
                                        onClick={expandAllFilterGroups}
                                        title="Развернуть все фильтры"
                                    >
                                        <MIcon name="unfold_more" size="sm" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={collapseAllFilterGroups}
                                        title="Свернуть все фильтры"
                                    >
                                        <MIcon name="unfold_less" size="sm" />
                                    </button>
                                </div>

                                {/* === Домены === */}
                                <FilterGroup
                                    id="domains"
                                    title="Домены"
                                    icon="folder"
                                    totalCount={allDomains.length}
                                    activeCount={filters.domains.size}
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <ChipsRow
                                        scrollable
                                        items={allDomains.map(([d, c]) => ({
                                            key: d,
                                            label: d,
                                            count: c,
                                            active: filters.domains.has(d.toLowerCase()),
                                            onClick: () => toggleDomainFilter(d),
                                        }))}
                                    />
                                </FilterGroup>

                                {/* === Теги === */}
                                {allTags.length > 0 && (
                                    <FilterGroup
                                        id="tags"
                                        title="Теги"
                                        icon="label"
                                        totalCount={allTags.length}
                                        activeCount={filters.tags.size}
                                        collapsedGroups={collapsedFilterGroups}
                                        onToggleGroup={toggleFilterGroup}
                                    >
                                        <ChipsRow
                                            scrollable
                                            items={allTags.map(([tag, count]) => ({
                                                key: tag,
                                                label: tag,
                                                count,
                                                active: filters.tags.has(tag),
                                                onClick: () => toggleTagFilter(tag),
                                            }))}
                                        />
                                    </FilterGroup>
                                )}

                                {/* === Содержит атрибут типа === */}
                                <FilterGroup
                                    id="attributes"
                                    title="Содержит атрибут типа"
                                    icon="data_object"
                                    activeCount={filters.attributeTypes.size}
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <ChipsRow
                                        items={ATTRIBUTE_TYPE_OPTIONS.map((opt) => ({
                                            key: opt.value,
                                            label: opt.label,
                                            count: null,
                                            active: filters.attributeTypes.has(opt.value),
                                            onClick: () => toggleAttributeType(opt.value),
                                        }))}
                                    />
                                </FilterGroup>

                                {/* === PII === */}
                                <FilterGroup
                                    id="pii"
                                    title="PII"
                                    icon="shield_lock"
                                    activeCount={filters.piiFilter !== "any" ? 1 : 0}
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <ChipsRow
                                        items={PII_OPTIONS.map((opt) => ({
                                            key: opt.value,
                                            label: opt.label,
                                            count: null,
                                            active: filters.piiFilter === opt.value,
                                            onClick: () =>
                                                setFilters({ ...filters, piiFilter: opt.value }),
                                        }))}
                                    />
                                </FilterGroup>

                                {/* === Проблемы линтера === */}
                                <FilterGroup
                                    id="issues"
                                    title="Проблемы линтера"
                                    icon="bug_report"
                                    activeCount={filters.issuesFilter !== "any" ? 1 : 0}
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <ChipsRow
                                        items={ISSUES_OPTIONS.map((opt) => ({
                                            key: opt.value,
                                            label: opt.label,
                                            count: null,
                                            active: filters.issuesFilter === opt.value,
                                            onClick: () =>
                                                setFilters({ ...filters, issuesFilter: opt.value }),
                                        }))}
                                    />
                                </FilterGroup>

                                {/* === Свойства === */}
                                <FilterGroup
                                    id="properties"
                                    title="Свойства"
                                    icon="tune"
                                    activeCount={
                                        [filters.hasInherits, filters.hasMixins, filters.onlyOrphans].filter(
                                            Boolean,
                                        ).length
                                    }
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.hasInherits}
                                            onChange={() =>
                                                setFilters({ ...filters, hasInherits: !filters.hasInherits })
                                            }
                                        />
                                        Только с родителем
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.hasMixins}
                                            onChange={() =>
                                                setFilters({ ...filters, hasMixins: !filters.hasMixins })
                                            }
                                        />
                                        Только с миксинами
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyOrphans}
                                            onChange={() =>
                                                setFilters({ ...filters, onlyOrphans: !filters.onlyOrphans })
                                            }
                                        />
                                        Только сироты ({index.stats.orphanEntities.length})
                                    </label>
                                </FilterGroup>

                                {/* === Минимум ссылок === */}
                                <FilterGroup
                                    id="refs"
                                    title={`Минимум ссылок: ${filters.minRefs}`}
                                    icon="link"
                                    activeCount={filters.minRefs > 0 ? 1 : 0}
                                    collapsedGroups={collapsedFilterGroups}
                                    onToggleGroup={toggleFilterGroup}
                                >
                                    <input
                                        type="range"
                                        min={0}
                                        max={20}
                                        value={filters.minRefs}
                                        onChange={(e) =>
                                            setFilters({ ...filters, minRefs: parseInt(e.target.value, 10) })
                                        }
                                        style={{ width: "100%" }}
                                    />
                                </FilterGroup>

                                <button
                                    className="btn"
                                    style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                                    onClick={resetAllFilters}
                                    disabled={!hasFilters}
                                >
                                    Сбросить фильтры
                                </button>

                                {/* Алерты остаются как были */}
                                {index.stats.circularInheritance.length > 0 && (
                                    <div className="entity-catalog-alert entity-catalog-alert--warn">
                                        ⚠️ Наследование в цикле: {index.stats.circularInheritance.length}
                                    </div>
                                )}
                                {index.stats.unknownReferences.length > 0 && (
                                    <div className="entity-catalog-alert entity-catalog-alert--err">
                                        ❌ Битых ссылок: {index.stats.unknownReferences.length}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ============ ПРАВАЯ ПАНЕЛЬ ============ */}
                        <div className="entity-catalog-panel">
                            {!selectedFqid ? (
                                <>
                                    {/* Чипы активных фильтров */}
                                    {hasFilters && (
                                        <ActiveFiltersBar
                                            filters={filters}
                                            onRemoveDomain={(d) => toggleDomainFilter(d)}
                                            onRemoveTag={(t) => toggleTagFilter(t)}
                                            onRemoveKind={(k) => toggleKind(k)}
                                            onRemoveAttributeType={(t) => toggleAttributeType(t)}
                                            onUpdate={setFilters}
                                            onResetAll={resetAllFilters}
                                        />
                                    )}

                                    <div
                                        className="entity-catalog-table-wrap"
                                        ref={tableRef}
                                    >
                                        <table
                                            className={
                                                "entity-catalog-table" +
                                                (dense ? " entity-catalog-table--dense" : "")
                                            }
                                        >
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 32 }}></th>
                                                    <SortableTh
                                                        field="name"
                                                        label="Сущность"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                    />
                                                    <SortableTh
                                                        field="domain"
                                                        label="Домен"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                    />
                                                    <th>Наследует</th>
                                                    <SortableTh
                                                        field="attributes"
                                                        label="Атрибутов"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                        align="right"
                                                    />
                                                    <SortableTh
                                                        field="refs"
                                                        label="Ссылок"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                        align="right"
                                                    />
                                                    <SortableTh
                                                        field="mixins"
                                                        label="Миксины"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                        align="right"
                                                    />
                                                    <SortableTh
                                                        field="pii"
                                                        label="PII"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                        align="right"
                                                    />
                                                    <SortableTh
                                                        field="issues"
                                                        label="Issues"
                                                        sortBy={sortBy}
                                                        sortDir={sortDir}
                                                        onSort={handleSort}
                                                        align="right"
                                                    />
                                                    {!dense && <th>Теги</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {groupByDomain && grouped
                                                    ? grouped.map(([domain, list]) => (
                                                        <React.Fragment key={domain}>
                                                            <tr className="entity-catalog-group-row">
                                                                <td colSpan={dense ? 10 : 12}>
                                                                    <div className="entity-catalog-group-row__inner">
                                                                        <MIcon name="folder" size="sm" />
                                                                        <strong>{domain}</strong>
                                                                        <span className="entity-catalog-group-row__count">
                                                                            {list.length}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {list.map((e) => (
                                                                <EntityRow
                                                                    key={e.fqid}
                                                                    entity={e}
                                                                    index={index}
                                                                    dense={dense}
                                                                    isOrphan={orphanSet.has(e.fqid)}
                                                                    isFav={entityFavorites.has(e.fqid)}
                                                                    isActive={
                                                                        flatRowFqids[activeRowIdx] === e.fqid
                                                                    }
                                                                    pii={piiByFqid.get(
                                                                        e.fqid.toLowerCase(),
                                                                    )}
                                                                    issues={issuesByFqid.get(
                                                                        e.fqid.toLowerCase(),
                                                                    )}
                                                                    onSelect={handleSelectRow}
                                                                    onToggleFav={handleToggleFav}
                                                                    onOpenPii={handleOpenPii}
                                                                    onOpenLint={handleOpenLint}
                                                                />
                                                            ))}
                                                        </React.Fragment>
                                                    ))
                                                    : visibleRows.map((e) => (
                                                        <EntityRow
                                                            key={e.fqid}
                                                            entity={e}
                                                            index={index}
                                                            dense={dense}
                                                            isOrphan={orphanSet.has(e.fqid)}
                                                            isFav={entityFavorites.has(e.fqid)}
                                                            isActive={
                                                                flatRowFqids[activeRowIdx] === e.fqid
                                                            }
                                                            pii={piiByFqid.get(e.fqid.toLowerCase())}
                                                            issues={issuesByFqid.get(
                                                                e.fqid.toLowerCase(),
                                                            )}
                                                            onSelect={handleSelectRow}
                                                            onToggleFav={handleToggleFav}
                                                            onOpenPii={handleOpenPii}
                                                            onOpenLint={handleOpenLint}
                                                        />
                                                    ))}
                                            </tbody>
                                        </table>

                                        {noResults && (
                                            <div className="entity-catalog-empty">
                                                {hasFilters
                                                    ? "Ничего не найдено по текущим фильтрам"
                                                    : "Нет сущностей"}
                                            </div>
                                        )}

                                        {filtered.length > visibleRows.length && (
                                            <div className="entity-catalog-more">
                                                Показано {visibleRows.length} из {filtered.length}
                                                <button
                                                    className="btn"
                                                    style={{ marginLeft: 12 }}
                                                    onClick={() => setLimit((n) => n + PAGE_SIZE)}
                                                >
                                                    Показать ещё {PAGE_SIZE} (осталось{" "}
                                                    {filtered.length - visibleRows.length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <ImpactAnalysisPanel
                                    fqid={selectedFqid}
                                    index={index}
                                    onBack={handleBack}
                                    onGotoDomain={handleGotoDomain}
                                    onSelectEntity={handleSelectFromImpact}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ SortableTh ============

function SortableTh({
    field,
    label,
    sortBy,
    sortDir,
    onSort,
    align,
}: {
    field: EntitySortBy;
    label: string;
    sortBy: EntitySortBy;
    sortDir: SortDir;
    onSort: (f: EntitySortBy) => void;
    align?: "left" | "right";
}) {
    const active = sortBy === field;
    return (
        <th
            onClick={() => onSort(field)}
            style={{
                cursor: "pointer",
                userSelect: "none",
                textAlign: align || undefined,
            }}
            className={"entity-catalog-th-sortable" + (active ? " active" : "")}
            title={`Сортировать по «${label}»`}
        >
            {label}
            {active && (
                <span className="entity-catalog-th-sortable__arrow">
                    {sortDir === "asc" ? "↑" : "↓"}
                </span>
            )}
        </th>
    );
}

// ============ FilterChipsGroup ============

// ============ ChipsRow — только чипы, без обёртки-заголовка ============

function ChipsRow({
    items,
    scrollable = false,
}: {
    items: Array<{
        key: string;
        label: string;
        count: number | null;
        active: boolean;
        onClick: () => void;
    }>;
    scrollable?: boolean;
}) {
    return (
        <div
            className={
                "entity-catalog-chips" +
                (scrollable ? " entity-catalog-chips--scrollable" : "")
            }
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    className={"entity-catalog-chip" + (item.active ? " active" : "")}
                    onClick={item.onClick}
                >
                    {item.label}
                    {item.count != null && (
                        <span className="entity-catalog-chip__count">{item.count}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

// ============ FilterGroup — сворачиваемая секция ============

interface FilterGroupProps {
    id: string;
    title: React.ReactNode;
    icon: string;
    /** Сколько всего элементов в группе (для бейджа). null — не показывать. */
    totalCount?: number | null;
    /** Сколько фильтров в группе сейчас активно. */
    activeCount: number;
    collapsedGroups: Set<string>;
    onToggleGroup: (id: string) => void;
    children: React.ReactNode;
}

function FilterGroup({
    id,
    title,
    icon,
    totalCount,
    activeCount,
    collapsedGroups,
    onToggleGroup,
    children,
}: FilterGroupProps) {
    const collapsed = collapsedGroups.has(id);
    return (
        <div className="entity-catalog-group entity-catalog-group--collapsible">
            <button
                type="button"
                className="entity-catalog-group__header"
                onClick={() => onToggleGroup(id)}
                aria-expanded={!collapsed}
            >
                <span className="material-symbols-outlined mi-sm entity-catalog-group__chevron">
                    chevron_right
                </span>
                <span className="material-symbols-outlined mi-sm">{icon}</span>
                <span className="entity-catalog-group__title-text">{title}</span>
                {activeCount > 0 ? (
                    <span
                        className="entity-catalog-group__active-badge"
                        title={`${activeCount} активных фильтров`}
                    >
                        {activeCount}
                    </span>
                ) : totalCount != null && totalCount > 0 ? (
                    <span className="entity-catalog-group__count-badge">{totalCount}</span>
                ) : null}
            </button>
            {!collapsed && (
                <div className="entity-catalog-group__body">{children}</div>
            )}
        </div>
    );
}

// ============ ActiveFiltersBar ============

function ActiveFiltersBar({
    filters,
    onRemoveDomain,
    onRemoveTag,
    onRemoveKind,
    onRemoveAttributeType,
    onUpdate,
    onResetAll,
}: {
    filters: EntityFilters;
    onRemoveDomain: (d: string) => void;
    onRemoveTag: (t: string) => void;
    onRemoveKind: (k: EntityKindFilter) => void;
    onRemoveAttributeType: (t: string) => void;
    onUpdate: (f: EntityFilters) => void;
    onResetAll: () => void;
}) {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> =
        [];

    if (filters.query.trim()) {
        chips.push({
            key: "q",
            label: `«${filters.query.trim()}»`,
            onRemove: () => onUpdate({ ...filters, query: "" }),
        });
    }
    filters.domains.forEach((d) => {
        chips.push({
            key: `d:${d}`,
            label: d,
            onRemove: () => onRemoveDomain(d),
        });
    });
    filters.tags.forEach((t) => {
        chips.push({
            key: `t:${t}`,
            label: `#${t}`,
            onRemove: () => onRemoveTag(t),
        });
    });
    filters.kinds.forEach((k) => {
        chips.push({
            key: `k:${k}`,
            label: k,
            onRemove: () => onRemoveKind(k),
        });
    });
    filters.attributeTypes.forEach((t) => {
        chips.push({
            key: `at:${t}`,
            label: `→ ${t}`,
            onRemove: () => onRemoveAttributeType(t),
        });
    });
    if (filters.piiFilter !== "any") {
        chips.push({
            key: "pii",
            label: `PII: ${filters.piiFilter}`,
            onRemove: () => onUpdate({ ...filters, piiFilter: "any" }),
        });
    }
    if (filters.issuesFilter !== "any") {
        chips.push({
            key: "issues",
            label: `Issues: ${filters.issuesFilter}`,
            onRemove: () => onUpdate({ ...filters, issuesFilter: "any" }),
        });
    }
    if (filters.hasInherits) {
        chips.push({
            key: "hi",
            label: "С родителем",
            onRemove: () => onUpdate({ ...filters, hasInherits: false }),
        });
    }
    if (filters.hasMixins) {
        chips.push({
            key: "hm",
            label: "С миксинами",
            onRemove: () => onUpdate({ ...filters, hasMixins: false }),
        });
    }
    if (filters.onlyOrphans) {
        chips.push({
            key: "o",
            label: "Сироты",
            onRemove: () => onUpdate({ ...filters, onlyOrphans: false }),
        });
    }
    if (filters.minRefs > 0) {
        chips.push({
            key: "mr",
            label: `refs ≥ ${filters.minRefs}`,
            onRemove: () => onUpdate({ ...filters, minRefs: 0 }),
        });
    }

    if (chips.length === 0) return null;

    return (
        <div className="entity-catalog-active-filters">
            <span className="entity-catalog-active-filters__label">Фильтры:</span>
            {chips.map((c) => (
                <span key={c.key} className="entity-catalog-active-filter">
                    <span>{c.label}</span>
                    <button
                        className="entity-catalog-active-filter__remove"
                        onClick={c.onRemove}
                        title="Снять"
                    >
                        ✕
                    </button>
                </span>
            ))}
            <button
                className="entity-catalog-active-filters__reset"
                onClick={onResetAll}
            >
                Сбросить всё
            </button>
        </div>
    );
}

// ============ EntityRow ============

interface EntityRowProps {
    entity: EntityRecord;
    index: ModelIndex;
    dense: boolean;
    isOrphan: boolean;
    isFav: boolean;
    isActive: boolean;
    pii?: PiiHit[];
    issues?: LintIssue[];
    onSelect: (fqid: string) => void;
    onToggleFav: (fqid: string) => void;
    onOpenPii: (domainId: string) => void;
    onOpenLint: () => void;
}

const EntityRow = React.memo(function EntityRow({
    entity,
    index,
    dense,
    isOrphan,
    isFav,
    isActive,
    pii,
    issues,
    onSelect,
    onToggleFav,
    onOpenPii,
    onOpenLint,
}: EntityRowProps) {
    const refs = countRefs(entity, index);
    const mixins = countMixins(entity, index);
    const piiCount = pii?.length ?? 0;
    const piiCritical = pii?.filter((h) => h.severity === "critical").length ?? 0;
    const issuesCount = issues?.length ?? 0;
    const issuesErrors = issues?.filter((i) => i.severity === "error").length ?? 0;

    return (
        <tr
            className={
                "entity-catalog-row" +
                (isOrphan ? " orphan" : "") +
                (isActive ? " entity-catalog-row--active" : "")
            }
            data-fqid={entity.fqid}
            onClick={() => onSelect(entity.fqid)}
            title={entity.fqid}
        >
            <td className="entity-catalog-cell-fav">
                <button
                    className={"entity-catalog-fav" + (isFav ? " active" : "")}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFav(entity.fqid);
                    }}
                    title={isFav ? "Убрать из избранного" : "В избранное"}
                >
                    <MIcon name={isFav ? "star" : "star_border"} size="sm" fill={isFav} />
                </button>
            </td>
            <td>
                <div className="entity-catalog-cell-id">{entity.entityId}</div>
                {!dense &&
                    entity.name &&
                    entity.name !== entity.entityId && (
                        <div className="entity-catalog-cell-name">{entity.name}</div>
                    )}
            </td>
            <td className="entity-catalog-cell-mono">{entity.domainId}</td>
            <td className="entity-catalog-cell-mono">
                {entity.inherits ? entity.inherits.split("/")[1] : "—"}
            </td>
            <td className="entity-catalog-cell-num">{entity.attributes.length}</td>
            <td className="entity-catalog-cell-num">
                <span className={refs > 0 ? "ref-badge" : "ref-badge ref-badge--zero"}>
                    {refs}
                </span>
            </td>
            <td className="entity-catalog-cell-num">
                {mixins > 0 ? <span className="mixin-badge">{mixins}</span> : "—"}
            </td>
            <td className="entity-catalog-cell-num">
                {piiCount > 0 ? (
                    <button
                        className={
                            "entity-catalog-pii-badge" +
                            (piiCritical > 0 ? " entity-catalog-pii-badge--critical" : "")
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenPii(entity.domainId);
                        }}
                        title={
                            `PII: ${piiCount} атрибутов` +
                            (piiCritical > 0 ? `, critical: ${piiCritical}` : "")
                        }
                    >
                        {piiCritical > 0 && <MIcon name="lock" size="sm" />}
                        {piiCount}
                    </button>
                ) : (
                    <span className="entity-catalog-dash">—</span>
                )}
            </td>
            <td className="entity-catalog-cell-num">
                {issuesCount > 0 ? (
                    <button
                        className={
                            "entity-catalog-issues-badge" +
                            (issuesErrors > 0
                                ? " entity-catalog-issues-badge--error"
                                : "")
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenLint();
                        }}
                        title={`${issuesCount} проблем, ошибок: ${issuesErrors}`}
                    >
                        {issuesCount}
                    </button>
                ) : (
                    <span className="entity-catalog-dash">—</span>
                )}
            </td>
            {!dense && (
                <td>
                    {entity.domainTags.slice(0, 2).map((t) => (
                        <span key={t} className="entity-catalog-tag">
                            {t}
                        </span>
                    ))}
                    {entity.domainTags.length > 2 && (
                        <span
                            className="entity-catalog-tag"
                            title={entity.domainTags.join(", ")}
                        >
                            +{entity.domainTags.length - 2}
                        </span>
                    )}
                </td>
            )}
        </tr>
    );
});