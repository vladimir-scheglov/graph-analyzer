import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../../state/useGraphStore";
import { useModelIndex } from "../../../hooks/useModelIndex";
import { useNavigation } from "../../../hooks/useNavigation";
import { MIcon } from "../../common/MIcon";
import { Popover } from "../../common/Popover";
import { plural } from "../../../lib/format";
import { DomainListRow } from "./DomainListRow";
import { DomainTableRow } from "./DomainTableRow";
import { DomainFiltersPanel } from "./DomainFiltersPanel";
import type { EntityRecord } from "../../../../shared/model-types";
import {
    DomainListFilters,
    EnrichedDomain,
    HealthLevel,
    EMPTY_DOMAIN_FILTERS,
    DomainGrouping,
    DomainSortKey,
    DomainSortDir,
    DomainViewMode,
    DomainDensity,
    SORT_LABELS,
    GROUPING_LABELS,
    hasActiveFilters,
    countActiveFilters,
    loadFilters,
    saveFilters,
    loadViewPrefs,
    saveViewPrefs,
} from "./types";

// ============ Helpers ============

function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function escapeCsv(v: any): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

function getNamespace(domainId: string): string {
    return domainId.split(".").slice(0, 2).join(".") || domainId;
}

// ============ Props ============

export interface DomainListProps {
    healthMap: Map<string, any>;
}

export function DomainList({ healthMap }: DomainListProps) {
    const nodes = useGraphStore((s) => s.nodes);
    const bookmarks = useGraphStore((s) => s.bookmarks);
    const validationResults = useGraphStore((s) => s.validationResults);
    const panelNodeId = useGraphStore((s) => s.panelNodeId);
    const { index } = useModelIndex();
    const { goto } = useNavigation();

    // Query from store — shared with NamespacesSection/TagsSection
    const storeQuery = useGraphStore((s) => s.listSearchQuery);
    const setStoreQuery = useGraphStore((s) => s.setListSearchQuery);

    // Local state + persist
    const [filters, setFilters] = useState<DomainListFilters>(() => ({
        ...loadFilters(),
        query: storeQuery || "",
    }));
    const [viewPrefs, setViewPrefs] = useState(() => loadViewPrefs());
    const [focusedIdx, setFocusedIdx] = useState(-1);
    const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(
        () => new Set(),
    );
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(
        viewPrefs.filtersOpen,
    );

    const searchInputRef = useRef<HTMLInputElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    const deferredQuery = useDeferredValue(filters.query);

    // Sync query out → store (so tags/namespaces sidebar works)
    useEffect(() => {
        if (filters.query !== storeQuery) {
            setStoreQuery(filters.query);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.query]);

    // Sync query in ← store (when user clicks tag/namespace in sidebar)
    useEffect(() => {
        if (storeQuery !== filters.query) {
            setFilters((f) => ({ ...f, query: storeQuery }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeQuery]);

    // Persist
    useEffect(() => saveFilters(filters), [filters]);
    useEffect(() => {
        saveViewPrefs({ ...viewPrefs, filtersOpen: filtersPanelOpen });
    }, [viewPrefs, filtersPanelOpen]);

    // ============ Aggregates per domain ============
    const aggregates = useMemo(() => {
        const m = new Map<
            string,
            {
                pii: number;
                piiCritical: number;
                lint: number;
                lintErrors: number;
                attrs: number;
                views: number;
            }
        >();
        if (!index) return m;

        const ensure = (key: string) => {
            let e = m.get(key);
            if (!e) {
                e = {
                    pii: 0,
                    piiCritical: 0,
                    lint: 0,
                    lintErrors: 0,
                    attrs: 0,
                    views: 0,
                };
                m.set(key, e);
            }
            return e;
        };

        for (const h of index.pii.hits) {
            const d = h.entityFqid.split("/")[0].toLowerCase();
            const e = ensure(d);
            e.pii++;
            if (h.severity === "critical") e.piiCritical++;
        }
        for (const i of index.lint.lintReport.issues) {
            const d = i.domainId.toLowerCase();
            const e = ensure(d);
            e.lint++;
            if (i.severity === "error") e.lintErrors++;
        }
        for (const ent of index.entities) {
            const d = ent.domainId.toLowerCase();
            const e = ensure(d);
            e.attrs += ent.attributes.length;
        }
        for (const [d, schema] of Object.entries(index.schemasByDomain || {})) {
            const key = d.toLowerCase();
            const e = ensure(key);
            e.views = schema.sections.views.count;
        }

        return m;
    }, [index]);

    // ============ Entity search matches ============
    const entityMatchesByDomain = useMemo(() => {
        const m = new Map<string, EntityRecord[]>();
        const q = deferredQuery.trim().toLowerCase();
        if (!q || !index) return m;
        for (const e of index.entities) {
            const entityId = e.entityId.toLowerCase();
            const fqid = e.fqid.toLowerCase();
            if (entityId.indexOf(q) === -1 && fqid.indexOf(q) === -1) continue;
            const key = e.domainId.toLowerCase();
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(e);
        }
        m.forEach((arr) =>
            arr.sort((a, b) => a.entityId.localeCompare(b.entityId)),
        );
        return m;
    }, [deferredQuery, index]);

    // ============ Enriched domain nodes ============
    const allEnriched = useMemo<EnrichedDomain[]>(() => {
        return nodes
            .filter((n) => n.data.nodeType === "domain")
            .map((n) => {
                const d = n.data;
                const key = d.domainId.toLowerCase();
                const agg =
                    aggregates.get(key) || {
                        pii: 0,
                        piiCritical: 0,
                        lint: 0,
                        lintErrors: 0,
                        attrs: 0,
                        views: 0,
                    };
                const validation = validationResults?.get(d.domainId);
                const isInvalid = validation?.status === "invalid";

                const rawHealth = healthMap.get(n.id);
                const health: number | null =
                    rawHealth && typeof rawHealth === "object"
                        ? (rawHealth.score ?? null)
                        : typeof rawHealth === "number"
                            ? rawHealth
                            : null;

                const healthLevel: HealthLevel =
                    health == null
                        ? "unknown"
                        : health >= 80
                            ? "good"
                            : health >= 50
                                ? "mid"
                                : "bad";

                return {
                    node: n,
                    domainId: d.domainId,
                    name: d.name || d.domainId,
                    version: d.version || "",
                    author: d.author || "",
                    description: d.description || "",
                    tags: d.tags || [],
                    status: d.status || null,
                    statusNormalized:
                        d.status === "DISABLED" ? "disabled" : "enabled",
                    hasDraft: d.hasDraft === true,
                    updatedAt: d.updatedAt || null,
                    entitiesCount: d.entitiesCount || 0,
                    filePath: d.filePath || null,
                    folderPath: d.folderPath || [],
                    isFavorite: bookmarks.has(n.id),
                    entityMatches: entityMatchesByDomain.get(key),
                    health,
                    healthLevel,
                    pii: agg.pii,
                    piiCritical: agg.piiCritical,
                    lint: agg.lint,
                    lintErrors: agg.lintErrors,
                    views: agg.views,
                    attrs: agg.attrs,
                    isInvalid,
                };
            });
    }, [
        nodes,
        aggregates,
        validationResults,
        bookmarks,
        healthMap,
        entityMatchesByDomain,
    ]);

    // ============ Filtered + sorted ============
    const filtered = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();

        let result = allEnriched.filter((d) => {
            if (filters.authors.size > 0 && !filters.authors.has(d.author.toLowerCase()))
                return false;
            if (
                filters.tags.size > 0 &&
                !d.tags.some((t) => filters.tags.has(String(t).toLowerCase()))
            )
                return false;
            if (
                filters.statuses.size > 0 &&
                !filters.statuses.has(d.statusNormalized)
            )
                return false;
            if (
                filters.healthLevels.size > 0 &&
                !filters.healthLevels.has(d.healthLevel)
            )
                return false;
            if (filters.onlyPii && d.piiCritical === 0) return false;
            if (filters.onlyLintErrors && d.lintErrors === 0) return false;
            if (filters.onlyDrafts && !d.hasDraft) return false;
            if (filters.onlyInvalid && !d.isInvalid) return false;
            if (filters.onlyFavorites && !d.isFavorite) return false;

            if (q) {
                const hay = [
                    d.domainId,
                    d.name,
                    d.description,
                    d.author,
                    ...d.tags,
                ]
                    .map(String)
                    .map((s) => s.toLowerCase())
                    .join(" ");
                if (!hay.includes(q) && !d.entityMatches) return false;
            }
            return true;
        });

        // Sort
        const dir = viewPrefs.sortDir === "desc" ? -1 : 1;
        const key = viewPrefs.sortKey;
        result.sort((a, b) => {
            let cmp = 0;
            switch (key) {
                case "name":
                    cmp = (a.name || a.domainId).localeCompare(
                        b.name || b.domainId,
                    );
                    break;
                case "version":
                    cmp = (a.version || "").localeCompare(b.version || "");
                    break;
                case "updated": {
                    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    cmp = at - bt;
                    break;
                }
                case "entities":
                    cmp = a.entitiesCount - b.entitiesCount;
                    break;
                case "health":
                    cmp = (a.health ?? -1) - (b.health ?? -1);
                    break;
                case "views":
                    cmp = a.views - b.views;
                    break;
                case "attributes":
                    cmp = a.attrs - b.attrs;
                    break;
                case "default":
                default:
                    cmp = a.domainId.localeCompare(b.domainId);
                    break;
            }
            if (cmp !== 0) return cmp * dir;
            return a.domainId.localeCompare(b.domainId);
        });

        return result;
    }, [allEnriched, filters, deferredQuery, viewPrefs.sortKey, viewPrefs.sortDir]);

    const favorites = useMemo(
        () => filtered.filter((d) => d.isFavorite),
        [filtered],
    );
    const others = useMemo(
        () => filtered.filter((d) => !d.isFavorite),
        [filtered],
    );

    // ============ Grouping ============
    const groups = useMemo(() => {
        if (viewPrefs.grouping === "flat") {
            if (others.length === 0) return [];
            return [
                {
                    key: "all",
                    label: "Все домены",
                    nodes: others,
                },
            ];
        }
        const map = new Map<string, EnrichedDomain[]>();
        for (const d of others) {
            const key =
                viewPrefs.grouping === "namespace"
                    ? getNamespace(d.domainId)
                    : d.folderPath.join("/") || "(корень)";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(d);
        }
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, nodes]) => ({ key, label: key, nodes }));
    }, [others, viewPrefs.grouping]);

    // ============ Flat list for keyboard nav ============
    const favCollapsed = useGraphStore((s) =>
        s.collapsedSections.has("domain-list-favorites"),
    );
    const toggleFavCollapsed = useGraphStore((s) => s.toggleCollapsedSection);

    const flatRows = useMemo(() => {
        const out: EnrichedDomain[] = [];
        if (!favCollapsed) for (const d of favorites) out.push(d);
        for (const g of groups) for (const d of g.nodes) out.push(d);
        return out;
    }, [favorites, favCollapsed, groups]);

    // ============ Handlers ============
    const onSelect = useCallback((d: EnrichedDomain) => {
        const st = useGraphStore.getState();
        st.setSelectedNodeId(d.node.id);
        st.setSelectedEdgeId(null);
        st.setPanelNodeId(d.node.id);
        st.setPanelTab("details");
        st.setPanelOpen(true);
        st.pushNav(d.domainId);
    }, []);

    const resetFilters = useCallback(() => {
        setFilters({ ...EMPTY_DOMAIN_FILTERS, query: "" });
        setStoreQuery("");
    }, [setStoreQuery]);

    const clearBulk = useCallback(() => setSelectedForBulk(new Set()), []);

    const toggleBulk = useCallback((nodeId: string) => {
        setSelectedForBulk((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedForBulk(new Set(flatRows.map((d) => d.node.id)));
    }, [flatRows]);

    const bulkFav = useCallback(() => {
        const st = useGraphStore.getState();
        for (const d of filtered) {
            if (!selectedForBulk.has(d.node.id)) continue;
            if (!st.bookmarks.has(d.node.id)) st.toggleBookmark(d.node.id);
        }
        clearBulk();
    }, [filtered, selectedForBulk, clearBulk]);

    const bulkCopyIds = useCallback(async () => {
        const ids = filtered
            .filter((d) => selectedForBulk.has(d.node.id))
            .map((d) => d.domainId);
        try {
            await navigator.clipboard.writeText(ids.join("\n"));
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${ids.length}`);
        } catch {
            useGraphStore.getState().showSnackbar("Не удалось скопировать");
        }
    }, [filtered, selectedForBulk]);

    const bulkExportCsv = useCallback(() => {
        const selected = filtered.filter((d) => selectedForBulk.has(d.node.id));
        const header = ["domainId", "name", "version", "author", "entities", "status"];
        const lines = [header.join(",")];
        for (const d of selected) {
            lines.push(
                [
                    d.domainId,
                    d.name,
                    d.version,
                    d.author,
                    String(d.entitiesCount),
                    d.statusNormalized,
                ]
                    .map(escapeCsv)
                    .join(","),
            );
        }
        downloadFile(
            "\uFEFF" + lines.join("\n"),
            `domains-selected-${stamp()}.csv`,
            "text/csv;charset=utf-8",
        );
        clearBulk();
    }, [filtered, selectedForBulk, clearBulk]);

    const exportCsv = useCallback(() => {
        const header = [
            "domainId", "name", "version", "author", "tags", "entities",
            "health", "status", "pii", "piiCritical", "lint", "lintErrors",
            "views", "attrs", "updatedAt", "favorite",
        ];
        const lines = [header.join(",")];
        for (const d of filtered) {
            lines.push(
                [
                    d.domainId,
                    d.name,
                    d.version,
                    d.author,
                    d.tags.join("; "),
                    String(d.entitiesCount),
                    d.health != null ? String(d.health) : "",
                    d.statusNormalized,
                    String(d.pii),
                    String(d.piiCritical),
                    String(d.lint),
                    String(d.lintErrors),
                    String(d.views),
                    String(d.attrs),
                    d.updatedAt || "",
                    d.isFavorite ? "true" : "",
                ]
                    .map(escapeCsv)
                    .join(","),
            );
        }
        downloadFile(
            "\uFEFF" + lines.join("\n"),
            `domains-${stamp()}.csv`,
            "text/csv;charset=utf-8",
        );
    }, [filtered]);

    const exportJson = useCallback(() => {
        const data = {
            generatedAt: new Date().toISOString(),
            filters: {
                query: filters.query,
                authors: Array.from(filters.authors),
                tags: Array.from(filters.tags),
                statuses: Array.from(filters.statuses),
                healthLevels: Array.from(filters.healthLevels),
                onlyPii: filters.onlyPii,
                onlyLintErrors: filters.onlyLintErrors,
                onlyDrafts: filters.onlyDrafts,
                onlyInvalid: filters.onlyInvalid,
                onlyFavorites: filters.onlyFavorites,
            },
            total: filtered.length,
            domains: filtered.map((d) => ({
                domainId: d.domainId,
                name: d.name,
                version: d.version,
                author: d.author,
                description: d.description,
                tags: d.tags,
                status: d.statusNormalized,
                hasDraft: d.hasDraft,
                entitiesCount: d.entitiesCount,
                health: d.health,
                healthLevel: d.healthLevel,
                pii: d.pii,
                piiCritical: d.piiCritical,
                lint: d.lint,
                lintErrors: d.lintErrors,
                views: d.views,
                attrs: d.attrs,
                isInvalid: d.isInvalid,
                isFavorite: d.isFavorite,
                updatedAt: d.updatedAt,
                filePath: d.filePath,
            })),
        };
        downloadFile(
            JSON.stringify(data, null, 2),
            `domains-${stamp()}.json`,
            "application/json",
        );
    }, [filtered, filters]);

    // ============ Keyboard ============
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
            return;
        if (e.key === "j" || e.key === "ArrowDown") {
            e.preventDefault();
            setFocusedIdx((i) => Math.min(i + 1, flatRows.length - 1));
        } else if (e.key === "k" || e.key === "ArrowUp") {
            e.preventDefault();
            setFocusedIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && focusedIdx >= 0) {
            const row = flatRows[focusedIdx];
            if (row) onSelect(row);
        } else if (e.key === " " && focusedIdx >= 0) {
            e.preventDefault();
            const row = flatRows[focusedIdx];
            if (row) {
                useGraphStore.getState().toggleBookmark(row.node.id);
            }
        }
    };

    useEffect(() => {
        if (focusedIdx < 0 || !bodyRef.current) return;
        const row = flatRows[focusedIdx];
        if (!row) return;
        const el = bodyRef.current.querySelector(
            `[data-node-id="${CSS.escape(row.node.id)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [focusedIdx, flatRows]);

    useEffect(() => {
        setFocusedIdx(-1);
    }, [deferredQuery, viewPrefs.grouping, viewPrefs.sortKey, viewPrefs.sortDir]);

    // ============ Stats ============
    const stats = useMemo(() => {
        const total = allEnriched.length;
        const pii = allEnriched.filter((d) => d.piiCritical > 0).length;
        const lint = allEnriched.filter((d) => d.lintErrors > 0).length;
        const drafts = allEnriched.filter((d) => d.hasDraft).length;
        const invalid = allEnriched.filter((d) => d.isInvalid).length;
        return { total, pii, lint, drafts, invalid };
    }, [allEnriched]);

    const activeFilterCount = countActiveFilters(filters);
    const hasFilters = hasActiveFilters(filters);

    return (
        <div
            className={
                "domain-list" +
                (viewPrefs.density === "compact" ? " domain-list--compact" : "")
            }
            onKeyDown={onKeyDown}
            tabIndex={0}
        >
            {/* ── Header: search + toolbar ── */}
            <div className="domain-list__header">
                <div className="domain-list__search">
                    <MIcon name="search" size="sm" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Поиск по id, имени, описанию, тегам, автору…"
                        value={filters.query}
                        onChange={(e) =>
                            setFilters((f) => ({ ...f, query: e.target.value }))
                        }
                        spellCheck={false}
                    />
                    {filters.query && (
                        <button
                            className="domain-list__search-clear"
                            onClick={() =>
                                setFilters((f) => ({ ...f, query: "" }))
                            }
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <button
                    className={
                        "domain-list__toolbar-btn domain-list__toolbar-btn--filters" +
                        (filtersPanelOpen ? " active" : "")
                    }
                    onClick={() => setFiltersPanelOpen(!filtersPanelOpen)}
                    title="Фильтры"
                >
                    <MIcon name="tune" size="sm" />
                    {activeFilterCount > 0 && (
                        <span className="domain-list__toolbar-badge">
                            {activeFilterCount}
                        </span>
                    )}
                </button>

                <Popover
                    width={260}
                    align="right"
                    trigger={(open) => (
                        <button
                            className={
                                "domain-list__toolbar-btn" + (open ? " active" : "")
                            }
                            title="Сортировка и группировка"
                        >
                            <MIcon name="sort" size="sm" />
                        </button>
                    )}
                >
                    <div className="menu" style={{ padding: 6 }}>
                        <div className="menu__label">Сортировка</div>
                        {(Object.keys(SORT_LABELS) as DomainSortKey[]).map((k) => (
                            <button
                                key={k}
                                className={
                                    "menu__item" +
                                    (viewPrefs.sortKey === k
                                        ? " menu__item--active"
                                        : "")
                                }
                                onClick={() =>
                                    setViewPrefs((p) => ({ ...p, sortKey: k }))
                                }
                            >
                                <span className="menu__icon">
                                    {viewPrefs.sortKey === k ? "●" : "○"}
                                </span>
                                <span className="menu__text">{SORT_LABELS[k]}</span>
                            </button>
                        ))}
                        <button
                            className="menu__item"
                            onClick={() =>
                                setViewPrefs((p) => ({
                                    ...p,
                                    sortDir: p.sortDir === "asc" ? "desc" : "asc",
                                }))
                            }
                        >
                            <span className="menu__icon">
                                <MIcon
                                    name={
                                        viewPrefs.sortDir === "asc"
                                            ? "arrow_upward"
                                            : "arrow_downward"
                                    }
                                    size="sm"
                                />
                            </span>
                            <span className="menu__text">
                                {viewPrefs.sortDir === "asc"
                                    ? "По возрастанию"
                                    : "По убыванию"}
                            </span>
                        </button>
                        <div className="menu__divider" />
                        <div className="menu__label">Группировка</div>
                        {(Object.keys(GROUPING_LABELS) as DomainGrouping[]).map(
                            (g) => (
                                <button
                                    key={g}
                                    className={
                                        "menu__item" +
                                        (viewPrefs.grouping === g
                                            ? " menu__item--active"
                                            : "")
                                    }
                                    onClick={() =>
                                        setViewPrefs((p) => ({ ...p, grouping: g }))
                                    }
                                >
                                    <span className="menu__icon">
                                        {viewPrefs.grouping === g ? "●" : "○"}
                                    </span>
                                    <span className="menu__text">
                                        {GROUPING_LABELS[g]}
                                    </span>
                                </button>
                            ),
                        )}
                        <div className="menu__divider" />
                        <div className="menu__label">Плотность</div>
                        <button
                            className="menu__item"
                            onClick={() =>
                                setViewPrefs((p) => ({
                                    ...p,
                                    density:
                                        p.density === "comfortable"
                                            ? "compact"
                                            : "comfortable",
                                }))
                            }
                        >
                            <span className="menu__icon">
                                <MIcon
                                    name={
                                        viewPrefs.density === "compact"
                                            ? "view_agenda"
                                            : "view_stream"
                                    }
                                    size="sm"
                                />
                            </span>
                            <span className="menu__text">
                                {viewPrefs.density === "compact"
                                    ? "Плотный вид"
                                    : "Комфортный вид"}
                            </span>
                        </button>
                    </div>
                </Popover>

                <div className="domain-list__view-toggle">
                    <button
                        className={
                            "domain-list__view-btn" +
                            (viewPrefs.viewMode === "cards" ? " active" : "")
                        }
                        onClick={() =>
                            setViewPrefs((p) => ({ ...p, viewMode: "cards" }))
                        }
                        title="Карточки"
                    >
                        <MIcon name="view_agenda" size="sm" />
                    </button>
                    <button
                        className={
                            "domain-list__view-btn" +
                            (viewPrefs.viewMode === "table" ? " active" : "")
                        }
                        onClick={() =>
                            setViewPrefs((p) => ({ ...p, viewMode: "table" }))
                        }
                        title="Таблица"
                    >
                        <MIcon name="table_rows" size="sm" />
                    </button>
                </div>

                <Popover
                    width={220}
                    align="right"
                    trigger={(open) => (
                        <button
                            className={
                                "domain-list__toolbar-btn" + (open ? " active" : "")
                            }
                            title="Экспорт"
                        >
                            <MIcon name="download" size="sm" />
                        </button>
                    )}
                >
                    {(close) => (
                        <div className="menu" style={{ padding: 6 }}>
                            <button
                                className="menu__item"
                                onClick={() => {
                                    exportCsv();
                                    close();
                                }}
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
                                    exportJson();
                                    close();
                                }}
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

                <div className="domain-list__stats">
                    {filtered.length === allEnriched.length
                        ? `${filtered.length} ${plural(filtered.length, "домен", "доменов")}`
                        : `${filtered.length} / ${allEnriched.length}`}
                </div>
            </div>

            {/* ── Filters panel ── */}
            {filtersPanelOpen && (
                <DomainFiltersPanel
                    domains={allEnriched}
                    filters={filters}
                    onChange={setFilters}
                    onReset={resetFilters}
                />
            )}

            {/* ── Active filters chips ── */}
            {hasFilters && (
                <div className="domain-list__chips">
                    {filters.query && (
                        <FilterChipItem
                            icon="search"
                            label={filters.query}
                            onRemove={() =>
                                setFilters((f) => ({ ...f, query: "" }))
                            }
                        />
                    )}
                    {Array.from(filters.authors).map((a) => (
                        <FilterChipItem
                            key={a}
                            icon="person"
                            label={`автор: ${a}`}
                            onRemove={() =>
                                setFilters((f) => ({
                                    ...f,
                                    authors: new Set(
                                        Array.from(f.authors).filter((x) => x !== a),
                                    ),
                                }))
                            }
                        />
                    ))}
                    {Array.from(filters.tags).map((t) => (
                        <FilterChipItem
                            key={t}
                            icon="label"
                            label={`#${t}`}
                            onRemove={() =>
                                setFilters((f) => ({
                                    ...f,
                                    tags: new Set(
                                        Array.from(f.tags).filter((x) => x !== t),
                                    ),
                                }))
                            }
                        />
                    ))}
                    {Array.from(filters.statuses).map((s) => (
                        <FilterChipItem
                            key={s}
                            icon={s === "enabled" ? "play_circle" : "pause_circle"}
                            label={s === "enabled" ? "включён" : "выключен"}
                            onRemove={() =>
                                setFilters((f) => ({
                                    ...f,
                                    statuses: new Set(
                                        Array.from(f.statuses).filter((x) => x !== s),
                                    ),
                                }))
                            }
                        />
                    ))}
                    {Array.from(filters.healthLevels).map((h) => (
                        <FilterChipItem
                            key={h}
                            icon="favorite"
                            label={`health: ${h}`}
                            onRemove={() =>
                                setFilters((f) => ({
                                    ...f,
                                    healthLevels: new Set(
                                        Array.from(f.healthLevels).filter((x) => x !== h),
                                    ),
                                }))
                            }
                        />
                    ))}
                    {filters.onlyPii && (
                        <FilterChipItem
                            icon="shield_lock"
                            label="PII critical"
                            onRemove={() => setFilters((f) => ({ ...f, onlyPii: false }))}
                        />
                    )}
                    {filters.onlyLintErrors && (
                        <FilterChipItem
                            icon="error"
                            label="Lint errors"
                            onRemove={() => setFilters((f) => ({ ...f, onlyLintErrors: false }))}
                        />
                    )}
                    {filters.onlyDrafts && (
                        <FilterChipItem
                            icon="edit_note"
                            label="Черновики"
                            onRemove={() => setFilters((f) => ({ ...f, onlyDrafts: false }))}
                        />
                    )}
                    {filters.onlyInvalid && (
                        <FilterChipItem
                            icon="cancel"
                            label="Невалидные"
                            onRemove={() => setFilters((f) => ({ ...f, onlyInvalid: false }))}
                        />
                    )}
                    {filters.onlyFavorites && (
                        <FilterChipItem
                            icon="star"
                            label="Избранные"
                            onRemove={() => setFilters((f) => ({ ...f, onlyFavorites: false }))}
                        />
                    )}
                    <button
                        className="domain-list__chip-reset"
                        onClick={resetFilters}
                    >
                        <MIcon name="filter_alt_off" size="sm" />
                        Сбросить всё
                    </button>
                </div>
            )}

            {/* ── Stats bar ── */}
            {stats.total > 0 && (
                <div className="domain-list__stats-bar">
                    <button
                        className={"domain-list__stat domain-list__stat--neutral" +
                            (filters.onlyFavorites ? "" : "")}
                        onClick={() => setFilters((f) => ({ ...f, onlyFavorites: false }))}
                        disabled
                    >
                        <strong>{stats.total}</strong> доменов
                    </button>
                    {stats.invalid > 0 && (
                        <button
                            className={"domain-list__stat domain-list__stat--err" +
                                (filters.onlyInvalid ? " active" : "")}
                            onClick={() =>
                                setFilters((f) => ({ ...f, onlyInvalid: !f.onlyInvalid }))
                            }
                        >
                            <MIcon name="cancel" size="sm" />
                            {stats.invalid} невалидных
                        </button>
                    )}
                    {stats.lint > 0 && (
                        <button
                            className={"domain-list__stat domain-list__stat--err" +
                                (filters.onlyLintErrors ? " active" : "")}
                            onClick={() =>
                                setFilters((f) => ({
                                    ...f,
                                    onlyLintErrors: !f.onlyLintErrors,
                                }))
                            }
                        >
                            <MIcon name="error" size="sm" />
                            {stats.lint} с lint
                        </button>
                    )}
                    {stats.pii > 0 && (
                        <button
                            className={"domain-list__stat domain-list__stat--warn" +
                                (filters.onlyPii ? " active" : "")}
                            onClick={() =>
                                setFilters((f) => ({ ...f, onlyPii: !f.onlyPii }))
                            }
                        >
                            <MIcon name="shield_lock" size="sm" />
                            {stats.pii} PII critical
                        </button>
                    )}
                    {stats.drafts > 0 && (
                        <button
                            className={"domain-list__stat domain-list__stat--warn" +
                                (filters.onlyDrafts ? " active" : "")}
                            onClick={() =>
                                setFilters((f) => ({ ...f, onlyDrafts: !f.onlyDrafts }))
                            }
                        >
                            <MIcon name="edit_note" size="sm" />
                            {stats.drafts} с черновиком
                        </button>
                    )}
                </div>
            )}

            {/* ── Body ── */}
            <div className="domain-list__body" ref={bodyRef}>
                {filtered.length === 0 ? (
                    <div className="domain-list__empty">
                        <MIcon name="search_off" size="lg" />
                        <div>
                            {hasFilters
                                ? "Ничего не найдено по текущим фильтрам"
                                : "Нет доменов"}
                        </div>
                        {hasFilters && (
                            <button className="btn" onClick={resetFilters}>
                                Сбросить фильтры
                            </button>
                        )}
                    </div>
                ) : viewPrefs.viewMode === "table" ? (
                    <div className="domain-table-wrap">
                        <table className="domain-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 28 }}>
                                        <input
                                            type="checkbox"
                                            checked={
                                                selectedForBulk.size > 0 &&
                                                selectedForBulk.size === filtered.length
                                            }
                                            onChange={(e) => {
                                                if (e.target.checked) selectAll();
                                                else clearBulk();
                                            }}
                                            aria-label="Выбрать всё"
                                        />
                                    </th>
                                    <th style={{ width: 30 }}></th>
                                    <th>Домен</th>
                                    <th className="domain-table__num-head">v</th>
                                    <th className="domain-table__num-head">Ent</th>
                                    <th className="domain-table__num-head">Attr</th>
                                    <th className="domain-table__num-head">Views</th>
                                    <th className="domain-table__num-head">Health</th>
                                    <th>Флаги</th>
                                    <th>Теги</th>
                                    <th>Автор</th>
                                    <th>Обновлён</th>
                                    <th style={{ width: 30 }}></th>
                                    <th style={{ width: 60 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {flatRows.map((d, i) => (
                                    <DomainTableRow
                                        key={d.node.id}
                                        domain={d}
                                        isActive={
                                            panelNodeId === d.node.id
                                        }
                                        isFocused={i === focusedIdx}
                                        isChecked={selectedForBulk.has(d.node.id)}
                                        onSelect={() => onSelect(d)}
                                        onToggleCheck={() => toggleBulk(d.node.id)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <>
                        {favorites.length > 0 && (
                            <div className="domain-list__section domain-list__section--fav">
                                <button
                                    type="button"
                                    className="domain-list__section-title domain-list__section-title--clickable"
                                    onClick={() =>
                                        toggleFavCollapsed("domain-list-favorites", favCollapsed)
                                    }
                                    title={favCollapsed ? "Развернуть" : "Свернуть"}
                                >
                                    <MIcon
                                        name={favCollapsed ? "chevron_right" : "expand_more"}
                                        size="sm"
                                    />
                                    <MIcon name="star" size="sm" fill />
                                    <span>Избранное ({favorites.length})</span>
                                </button>
                                {!favCollapsed &&
                                    favorites.map((d) => (
                                        <DomainListRow
                                            key={d.node.id}
                                            domain={d}
                                            isActive={
                                                panelNodeId === d.node.id
                                            }
                                            isFocused={
                                                focusedIdx >= 0 &&
                                                flatRows[focusedIdx]?.node.id === d.node.id
                                            }
                                            compact={viewPrefs.density === "compact"}
                                            onSelect={() => onSelect(d)}
                                        />
                                    ))}
                            </div>
                        )}

                        {groups.map((g) => (
                            <div key={g.key} className="domain-list__section">
                                {viewPrefs.grouping !== "flat" && (
                                    <div className="domain-list__section-title">
                                        <code className="domain-list__section-key">
                                            {g.label}
                                        </code>
                                        <span className="domain-list__section-count">
                                            {g.nodes.length}
                                        </span>
                                    </div>
                                )}
                                {g.nodes.map((d) => (
                                    <DomainListRow
                                        key={d.node.id}
                                        domain={d}
                                        isActive={
                                            panelNodeId === d.node.id
                                        }
                                        isFocused={
                                            focusedIdx >= 0 &&
                                            flatRows[focusedIdx]?.node.id === d.node.id
                                        }
                                        compact={viewPrefs.density === "compact"}
                                        onSelect={() => onSelect(d)}
                                    />
                                ))}
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* ── Bulk actions ── */}
            {selectedForBulk.size > 0 && (
                <div className="domain-bulk-bar">
                    <span className="domain-bulk-bar__count">
                        Выбрано: <strong>{selectedForBulk.size}</strong>
                    </span>
                    <button className="btn btn--small" onClick={bulkFav}>
                        <MIcon name="star" size="sm" />
                        В избранное
                    </button>
                    <button className="btn btn--small" onClick={bulkExportCsv}>
                        <MIcon name="download" size="sm" />
                        CSV
                    </button>
                    <button className="btn btn--small" onClick={bulkCopyIds}>
                        <MIcon name="content_copy" size="sm" />
                        ID
                    </button>
                    <button
                        className="btn btn--small"
                        onClick={clearBulk}
                        title="Сбросить выбор"
                    >
                        <MIcon name="close" size="sm" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ============ FilterChipItem ============

function FilterChipItem({
    icon,
    label,
    onRemove,
}: {
    icon: string;
    label: string;
    onRemove: () => void;
}) {
    return (
        <div className="domain-list__chip">
            <MIcon name={icon} size="sm" />
            <span>{label}</span>
            <button onClick={onRemove} title="Снять">
                ✕
            </button>
        </div>
    );
}