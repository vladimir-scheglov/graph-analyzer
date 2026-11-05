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
    searchAttributes,
    hasActiveFilters,
    EMPTY_ATTRIBUTE_FILTERS,
    AttributeFilterState,
    AttributeHit,
    AttributeSortBy,
    AttributeGroupMode,
    FacetItem,
} from "../../lib/model/attribute-search";
import type { EntityRecord } from "../../../shared/model-types";
import { openFileInEditor } from "../../lib/open-file";
import { alertDialog } from "../../lib/dialogs";

// ============ Persistence ============

const PREFS_KEY = "dg-attribute-finder-prefs";
const COLLAPSED_KEY = "dg-attribute-finder-collapsed";

interface Prefs {
    searchInDescription: boolean;
    sortBy: AttributeSortBy;
    groupBy: AttributeGroupMode;
}

const DEFAULT_PREFS: Prefs = {
    searchInDescription: true,
    sortBy: "relevance",
    groupBy: "flat",
};

const DEFAULT_COLLAPSED = ["domains", "referenceTargets"];

function loadPrefs(): Prefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return DEFAULT_PREFS;
        return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_PREFS;
    }
}

function loadCollapsed(): Set<string> {
    try {
        const raw = localStorage.getItem(COLLAPSED_KEY);
        if (raw === null) return new Set(DEFAULT_COLLAPSED);
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set(DEFAULT_COLLAPSED);
    }
}

// ============ Filter group components (same as in EntityCatalog) ============

function ChipsRow({
    items,
    scrollable,
    onToggle,
    emptyText,
}: {
    items: FacetItem[];
    scrollable?: boolean;
    onToggle: (value: string) => void;
    emptyText?: string;
}) {
    if (items.length === 0) {
        return <div className="attribute-finder-empty-facet">{emptyText || "—"}</div>;
    }
    return (
        <div
            className={
                "entity-catalog-chips" +
                (scrollable ? " entity-catalog-chips--scrollable" : "")
            }
        >
            {items.map((it) => (
                <button
                    key={it.value}
                    type="button"
                    className={"entity-catalog-chip" + (it.active ? " active" : "")}
                    onClick={() => onToggle(it.value)}
                >
                    <span className="entity-catalog-chip__label">{it.value}</span>
                    <span className="entity-catalog-chip__count">{it.count}</span>
                </button>
            ))}
        </div>
    );
}

function FilterGroup({
    id,
    icon,
    title,
    activeCount,
    collapsed,
    onToggle,
    children,
}: {
    id: string;
    icon: string;
    title: string;
    activeCount: number;
    collapsed: boolean;
    onToggle: (id: string) => void;
    children: React.ReactNode;
}) {
    return (
        <div className="entity-catalog-group entity-catalog-group--collapsible">
            <button
                type="button"
                className="entity-catalog-group__header"
                onClick={() => onToggle(id)}
                aria-expanded={!collapsed}
            >
                <span className="material-symbols-outlined mi-sm entity-catalog-group__chevron">
                    chevron_right
                </span>
                <span className="material-symbols-outlined mi-sm">{icon}</span>
                <span className="entity-catalog-group__title-text">{title}</span>
                {activeCount > 0 && (
                    <span className="entity-catalog-group__active-badge">{activeCount}</span>
                )}
            </button>
            {!collapsed && <div className="entity-catalog-group__body">{children}</div>}
        </div>
    );
}

// ============ Main component ============

export function AttributeFinderModal() {
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();
    const open = useGraphStore((s) => s.attributeFinderOpen);
    const setOpen = useGraphStore((s) => s.setAttributeFinderOpen);

    const prefs = useMemo(loadPrefs, []);
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const [searchInDescription, setSearchInDescription] = useState(prefs.searchInDescription);
    const [sortBy, setSortBy] = useState<AttributeSortBy>(prefs.sortBy);
    const [groupBy, setGroupBy] = useState<AttributeGroupMode>(prefs.groupBy);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsed);
    const [limit, setLimit] = useState(300);
    const [activeIdx, setActiveIdx] = useState(0);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const [filters, setFilters] = useState<AttributeFilterState>(EMPTY_ATTRIBUTE_FILTERS);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset on open
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActiveIdx(0);
        setExpandedKeys(new Set());
        setLimit(300);
        setTimeout(() => searchInputRef.current?.focus(), 50);
    }, [open]);

    // Persist prefs
    useEffect(() => {
        try {
            localStorage.setItem(
                PREFS_KEY,
                JSON.stringify({ searchInDescription, sortBy, groupBy }),
            );
        } catch { /* ignore */ }
    }, [searchInDescription, sortBy, groupBy]);

    useEffect(() => {
        try {
            localStorage.setItem(
                COLLAPSED_KEY,
                JSON.stringify(Array.from(collapsedGroups)),
            );
        } catch { /* ignore */ }
    }, [collapsedGroups]);

    // Reset limit when filters change
    useEffect(() => {
        setLimit(300);
        setActiveIdx(0);
    }, [
        filters.dataTypes, filters.constraints, filters.domains,
        filters.referenceTargets, filters.onlyRequired, filters.onlyReadonly,
        filters.onlyUnused, filters.onlyPii, filters.onlyCrossDomain,
        deferredQuery, searchInDescription, sortBy,
    ]);

    // Compose filter state (merge with local deferred query)
    const effectiveFilters: AttributeFilterState = useMemo(
        () => ({ ...filters, query: deferredQuery, searchInDescription }),
        [filters, deferredQuery, searchInDescription],
    );

    const result = useMemo(() => {
        if (!index) return null;
        return searchAttributes(index, effectiveFilters, { limit, sortBy });
    }, [index, effectiveFilters, limit, sortBy]);

    // ---- Handlers ----

    const toggleGroup = useCallback((id: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleInSet = useCallback(
        (key: keyof AttributeFilterState, value: string) => {
            setFilters((prev) => {
                const cur = prev[key] as Set<string>;
                const next = new Set(cur);
                const norm = value.toLowerCase();
                if (next.has(norm)) next.delete(norm);
                else next.add(norm);
                return { ...prev, [key]: next };
            });
        },
        [],
    );

    const setFlag = useCallback(
        (
            key:
                | "onlyRequired"
                | "onlyReadonly"
                | "onlyUnused"
                | "onlyPii"
                | "onlyCrossDomain",
        ) => {
            setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
        },
        [],
    );

    const resetAll = useCallback(() => {
        setFilters(EMPTY_ATTRIBUTE_FILTERS);
        setQuery("");
    }, []);

    const openEntity = useCallback(
        (e: EntityRecord) => {
            const st = useGraphStore.getState();
            st.setAttributeFinderOpen(false);
            st.setEntityCatalogInitialFqid(e.fqid);
            st.setEntityCatalogOpen(true);
        },
        [],
    );

    const openYaml = useCallback((h: AttributeHit) => {
        const st = useGraphStore.getState();
        const node = st.nodes.find(
            (n) => (n.data.domainId || "").toLowerCase() === h.entity.domainId.toLowerCase(),
        );
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден");
            return;
        }
        st.setAttributeFinderOpen(false);
        openFileInEditor(node.data.filePath, h.entity.fqid, h.entity.domainId);
    }, []);

    const copyFqid = useCallback(async (h: AttributeHit) => {
        try {
            await navigator.clipboard.writeText(h.key);
            useGraphStore.getState().showSnackbar(`Скопировано: ${h.key}`);
        } catch { /* ignore */ }
    }, []);

    const copyAllVisible = useCallback(async () => {
        if (!result) return;
        const text = result.hits.map((h) => h.key).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(`Скопировано: ${result.hits.length}`);
        } catch { /* ignore */ }
    }, [result]);

    const toggleExpanded = useCallback((key: string) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // ---- Keyboard ----

    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            const hits = result?.hits || [];
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                const hit = hits[activeIdx];
                if (hit) {
                    e.preventDefault();
                    if (e.shiftKey) openYaml(hit);
                    else openEntity(hit.entity);
                }
            } else if (e.key === "Escape") {
                if (query) {
                    e.preventDefault();
                    setQuery("");
                } else {
                    setOpen(false);
                }
            }
        },
        [result, activeIdx, query, openEntity, openYaml, setOpen],
    );

    // Scroll active row into view
    useEffect(() => {
        const el = listRef.current?.querySelector(
            ".attribute-hit--active",
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx]);

    // ---- Export ----

    const exportCsv = useCallback(() => {
        if (!result) return;
        const header = [
            "key", "id", "name", "dataType", "entity", "domain",
            "constraints", "usedInViews", "usedInRules", "readonly", "pii",
        ];
        const lines = [header.join(",")];
        for (const h of result.hits) {
            const a = h.attribute;
            const row = [
                h.key, a.id, a.name || "", a.dataType,
                h.entity.entityId, h.entity.domainId,
                a.constraints.join("; "),
                String(a.usedInViews), String(a.usedInRules),
                a.readonly ? "true" : "",
                h.piiSeverity || "",
            ];
            lines.push(
                row.map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(","),
            );
        }
        const blob = new Blob(["\uFEFF" + lines.join("\n")], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attributes-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [result]);

    const exportMd = useCallback(() => {
        if (!result) return;
        const lines: string[] = [];
        lines.push("# Отчёт по атрибутам");
        lines.push("");
        lines.push(
            `_${new Date().toLocaleString("ru-RU")} · найдено ${result.total}_`,
        );
        lines.push("");
        lines.push("| Атрибут | Тип | Сущность | Домен | Constraints | Исп. |");
        lines.push("| --- | --- | --- | --- | --- | --- |");
        for (const h of result.hits) {
            const a = h.attribute;
            lines.push(
                `| \`${a.id}\` | ${a.dataType} | ${h.entity.entityId} | ${h.entity.domainId} | ${a.constraints.join(", ")} | ${a.usedInViews}v/${a.usedInRules}r |`,
            );
        }
        const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attributes-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }, [result]);

    // ---- Group ----

    const grouped = useMemo(() => {
        if (!result || groupBy === "flat" || result.hits.length === 0) return null;
        const m = new Map<string, AttributeHit[]>();
        for (const h of result.hits) {
            const key =
                groupBy === "dataType"
                    ? h.attribute.dataType
                    : groupBy === "domain"
                        ? h.entity.domainId
                        : (h.attribute.name || h.attribute.id).toLowerCase();
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(h);
        }
        return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
    }, [result, groupBy]);

    // ---- Render ----

    if (!open) return null;

    const noQuery = !deferredQuery.trim();
    const hasFilters = hasActiveFilters(effectiveFilters);
    const showSummary = noQuery && !hasFilters && result && result.byName.length > 0;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal attribute-finder-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="search" size="sm" />
                        <span className="icon-label">Поиск атрибутов</span>
                        {result && (
                            <span className="help-modal__badge">
                                {result.total}
                                {result.truncated && ` (${result.hits.length} показано)`}
                            </span>
                        )}
                        {result && result.facets.flags.pii > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "rgba(239,68,68,0.15)",
                                    color: "#ef4444",
                                }}
                                title="Атрибутов с PII"
                            >
                                <MIcon name="shield_lock" size="sm" /> {result.facets.flags.pii}
                            </span>
                        )}
                        {result && result.facets.flags.unused > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "rgba(245,158,11,0.15)",
                                    color: "#f59e0b",
                                }}
                                title="Не используются ни в views, ни в dataRules"
                            >
                                <MIcon name="visibility_off" size="sm" /> {result.facets.flags.unused}
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>
                        ✕
                    </button>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса…</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && result && (
                    <div className="entity-hierarchy-body">
                        {/* === LEFT: filters === */}
                        <div className="attribute-filters">
                            <div className="entity-search-input-wrap">
                                <span className="entity-search-icon">🔍</span>
                                <input
                                    ref={searchInputRef}
                                    className="entity-search-input"
                                    type="text"
                                    placeholder="id, name, описание…"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleSearchKeyDown}
                                    autoFocus
                                />
                                {query && (
                                    <button
                                        className="entity-search-clear"
                                        onClick={() => setQuery("")}
                                        title="Очистить (Esc)"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="attribute-finder-prefs">
                                <label className="attribute-finder-toggle">
                                    <input
                                        type="checkbox"
                                        checked={searchInDescription}
                                        onChange={() => setSearchInDescription((v) => !v)}
                                    />
                                    <span>Искать в описании</span>
                                </label>
                            </div>

                            <div className="entity-catalog-filter-body">
                                {hasFilters && (
                                    <button
                                        className="btn btn--small attribute-finder-reset"
                                        onClick={resetAll}
                                    >
                                        <MIcon name="filter_alt_off" size="sm" />
                                        Сбросить всё ({countActiveFilters(filters)})
                                    </button>
                                )}

                                <FilterGroup
                                    id="dataTypes"
                                    icon="data_object"
                                    title="Тип данных"
                                    activeCount={filters.dataTypes.size}
                                    collapsed={collapsedGroups.has("dataTypes")}
                                    onToggle={toggleGroup}
                                >
                                    <ChipsRow
                                        items={result.facets.dataTypes}
                                        scrollable
                                        onToggle={(v) => toggleInSet("dataTypes", v)}
                                        emptyText="Нет совпадений"
                                    />
                                </FilterGroup>

                                <FilterGroup
                                    id="constraints"
                                    icon="rule"
                                    title="Ограничения"
                                    activeCount={filters.constraints.size}
                                    collapsed={collapsedGroups.has("constraints")}
                                    onToggle={toggleGroup}
                                >
                                    <ChipsRow
                                        items={result.facets.constraints}
                                        scrollable
                                        onToggle={(v) => toggleInSet("constraints", v)}
                                        emptyText="Нет совпадений"
                                    />
                                </FilterGroup>

                                <FilterGroup
                                    id="domains"
                                    icon="folder"
                                    title="Домен"
                                    activeCount={filters.domains.size}
                                    collapsed={collapsedGroups.has("domains")}
                                    onToggle={toggleGroup}
                                >
                                    <ChipsRow
                                        items={result.facets.domains}
                                        scrollable
                                        onToggle={(v) => toggleInSet("domains", v)}
                                        emptyText="Нет совпадений"
                                    />
                                </FilterGroup>

                                {result.facets.referenceTargets.length > 0 && (
                                    <FilterGroup
                                        id="referenceTargets"
                                        icon="link"
                                        title="Ссылается на"
                                        activeCount={filters.referenceTargets.size}
                                        collapsed={collapsedGroups.has("referenceTargets")}
                                        onToggle={toggleGroup}
                                    >
                                        <ChipsRow
                                            items={result.facets.referenceTargets}
                                            scrollable
                                            onToggle={(v) => toggleInSet("referenceTargets", v)}
                                        />
                                    </FilterGroup>
                                )}

                                <FilterGroup
                                    id="flags"
                                    icon="tune"
                                    title="Флаги"
                                    activeCount={countActiveFlags(filters)}
                                    collapsed={collapsedGroups.has("flags")}
                                    onToggle={toggleGroup}
                                >
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyRequired}
                                            onChange={() => setFlag("onlyRequired")}
                                        />
                                        <span>
                                            Только required{" "}
                                            <span className="attribute-finder-flag-count">
                                                {result.facets.flags.required}
                                            </span>
                                        </span>
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyReadonly}
                                            onChange={() => setFlag("onlyReadonly")}
                                        />
                                        <span>
                                            Только readonly{" "}
                                            <span className="attribute-finder-flag-count">
                                                {result.facets.flags.readonly}
                                            </span>
                                        </span>
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyUnused}
                                            onChange={() => setFlag("onlyUnused")}
                                        />
                                        <span>
                                            Не используется{" "}
                                            <span className="attribute-finder-flag-count attribute-finder-flag-count--warn">
                                                {result.facets.flags.unused}
                                            </span>
                                        </span>
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyPii}
                                            onChange={() => setFlag("onlyPii")}
                                        />
                                        <span>
                                            Только PII{" "}
                                            <span className="attribute-finder-flag-count attribute-finder-flag-count--err">
                                                {result.facets.flags.pii}
                                            </span>
                                        </span>
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyCrossDomain}
                                            onChange={() => setFlag("onlyCrossDomain")}
                                        />
                                        <span>
                                            Cross-domain{" "}
                                            <span className="attribute-finder-flag-count">
                                                {result.facets.flags.crossDomain}
                                            </span>
                                        </span>
                                    </label>
                                </FilterGroup>
                            </div>
                        </div>

                        {/* === RIGHT: results === */}
                        <div className="attribute-panel">
                            <div className="attribute-finder-toolbar">
                                <label className="attribute-finder-select">
                                    <span>Сортировка:</span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as AttributeSortBy)}
                                    >
                                        <option value="relevance">По релевантности</option>
                                        <option value="id">По id</option>
                                        <option value="dataType">По типу</option>
                                        <option value="domain">По домену</option>
                                        <option value="usages">По использованию</option>
                                    </select>
                                </label>

                                <label className="attribute-finder-select">
                                    <span>Группировка:</span>
                                    <select
                                        value={groupBy}
                                        onChange={(e) => setGroupBy(e.target.value as AttributeGroupMode)}
                                    >
                                        <option value="flat">Плоский список</option>
                                        <option value="dataType">По типу</option>
                                        <option value="domain">По домену</option>
                                        <option value="baseName">По имени</option>
                                    </select>
                                </label>

                                <div className="attribute-finder-actions">
                                    <button
                                        className="btn btn--icon btn--small"
                                        onClick={copyAllVisible}
                                        disabled={result.hits.length === 0}
                                        title="Копировать FQID всех видимых"
                                    >
                                        <MIcon name="content_copy" size="sm" />
                                    </button>
                                    <button
                                        className="btn btn--icon btn--small"
                                        onClick={exportCsv}
                                        disabled={result.hits.length === 0}
                                        title="Экспорт в CSV"
                                    >
                                        <MIcon name="table_view" size="sm" />
                                    </button>
                                    <button
                                        className="btn btn--icon btn--small"
                                        onClick={exportMd}
                                        disabled={result.hits.length === 0}
                                        title="Экспорт в Markdown"
                                    >
                                        <MIcon name="description" size="sm" />
                                    </button>
                                </div>
                            </div>

                            <div className="attribute-hits" ref={listRef}>
                                {showSummary && (
                                    <div className="attribute-summary">
                                        <div className="attribute-finder-hint">
                                            Введите запрос или выберите фильтр слева. Ниже — сводка по базовым именам.
                                        </div>
                                        {result.byName.slice(0, 100).map(({ name, count, domains, sample }) => (
                                            <button
                                                key={name}
                                                className="attribute-summary-item"
                                                onClick={() => setQuery(name)}
                                            >
                                                <span className="attribute-summary-item__name">{name}</span>
                                                <span className="attribute-summary-item__count">{count}</span>
                                                <span className="attribute-summary-item__domains">
                                                    {domains.slice(0, 3).map((d) => (
                                                        <code key={d}>{d}</code>
                                                    ))}
                                                    {domains.length > 3 && <span>+{domains.length - 3}</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {!showSummary && result.hits.length === 0 && (
                                    <div className="attribute-finder-empty">
                                        <MIcon name="search_off" size="xl" />
                                        <div className="attribute-finder-empty__title">Ничего не найдено</div>
                                        <div className="attribute-finder-empty__hint">
                                            {hasFilters
                                                ? "Попробуйте убрать часть фильтров — возможно, они взаимоисключающие."
                                                : "Проверьте запрос — возможно, стоит искать по описанию или в другом домене."}
                                        </div>
                                        {hasFilters && (
                                            <button className="btn" onClick={resetAll} style={{ marginTop: 12 }}>
                                                Сбросить фильтры
                                            </button>
                                        )}
                                    </div>
                                )}

                                {!showSummary && grouped && (
                                    <div className="attribute-finder-groups">
                                        {grouped.map(([groupName, hits]) => (
                                            <div key={groupName} className="attribute-finder-group">
                                                <div className="attribute-finder-group__title">
                                                    <span>{groupName}</span>
                                                    <span className="attribute-finder-group__count">{hits.length}</span>
                                                </div>
                                                {hits.map((h, i) => {
                                                    const globalIdx = result.hits.indexOf(h);
                                                    return (
                                                        <AttributeHitRow
                                                            key={h.key}
                                                            hit={h}
                                                            active={globalIdx === activeIdx}
                                                            expanded={expandedKeys.has(h.key)}
                                                            onToggle={() => toggleExpanded(h.key)}
                                                            onOpenEntity={() => openEntity(h.entity)}
                                                            onOpenYaml={() => openYaml(h)}
                                                            onCopy={() => copyFqid(h)}
                                                            onNavigate={() => setActiveIdx(globalIdx)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!showSummary && !grouped && result.hits.map((h, i) => (
                                    <AttributeHitRow
                                        key={h.key}
                                        hit={h}
                                        active={i === activeIdx}
                                        expanded={expandedKeys.has(h.key)}
                                        onToggle={() => toggleExpanded(h.key)}
                                        onOpenEntity={() => openEntity(h.entity)}
                                        onOpenYaml={() => openYaml(h)}
                                        onCopy={() => copyFqid(h)}
                                        onNavigate={() => setActiveIdx(i)}
                                    />
                                ))}

                                {result.truncated && (
                                    <div className="attribute-finder-more">
                                        <button className="btn" onClick={() => setLimit((l) => l + 300)}>
                                            Показать ещё 300 (осталось {result.total - result.hits.length})
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Row ============

const AttributeHitRow = React.memo(function AttributeHitRow({
    hit,
    active,
    expanded,
    onToggle,
    onOpenEntity,
    onOpenYaml,
    onCopy,
    onNavigate,
}: {
    hit: AttributeHit;
    active: boolean;
    expanded: boolean;
    onToggle: () => void;
    onOpenEntity: () => void;
    onOpenYaml: () => void;
    onCopy: () => void;
    onNavigate: () => void;
}) {
    const a = hit.attribute;
    const e = hit.entity;
    const isUnused = a.usedInViews === 0 && a.usedInRules === 0;
    const isRequired = a.constraints.includes("required");

    const cls = [
        "attribute-hit",
        expanded && "attribute-hit--expanded",
        active && "attribute-hit--active",
        isUnused && "attribute-hit--unused",
    ].filter(Boolean).join(" ");

    return (
        <div className={cls} onMouseEnter={onNavigate}>
            {/* Заголовок — клик раскрывает детали */}
            <div className="attribute-hit__head" onClick={onToggle}>
                <code className="attribute-hit__id">{a.id}</code>
                {a.name && a.name !== a.id && (
                    <span className="attribute-hit__name">{a.name}</span>
                )}
                <span className="attribute-hit__type">{a.dataType}</span>
                {hit.isNested && (
                    <span className="attribute-hit__badge attribute-hit__badge--nested" title="Вложенный (Table)">
                        nested
                    </span>
                )}
                {isRequired && (
                    <span className="attribute-hit__badge attribute-hit__badge--required" title="required">
                        required
                    </span>
                )}
                {a.readonly && (
                    <span className="attribute-hit__badge attribute-hit__badge--readonly" title="readonly">
                        readonly
                    </span>
                )}
                {hit.isPii && (
                    <span
                        className={
                            "attribute-hit__badge attribute-hit__badge--pii" +
                            (hit.piiSeverity === "critical" ? " attribute-hit__badge--pii-critical" : "")
                        }
                        title={`PII: ${hit.piiSeverity}`}
                    >
                        <MIcon name="shield_lock" size="sm" /> {hit.piiSeverity}
                    </span>
                )}
                {isUnused && (
                    <span
                        className="attribute-hit__badge attribute-hit__badge--unused"
                        title="Не используется ни в views, ни в dataRules"
                    >
                        <MIcon name="visibility_off" size="sm" /> unused
                    </span>
                )}
                {hit.crossDomainUsages > 0 && (
                    <span
                        className="attribute-hit__badge attribute-hit__badge--cross"
                        title={`В других доменах: ${hit.crossDomainUsages} атрибутов с этим именем`}
                    >
                        <MIcon name="public" size="sm" /> ×{hit.crossDomainUsages}
                    </span>
                )}
                <span className="attribute-hit__toggle-hint">
                    {expanded ? "свернуть ▴" : "детали ▾"}
                </span>
            </div>

            {/* Мета-строка */}
            <div className="attribute-hit__meta">
                <button
                    type="button"
                    className="attribute-hit__entity"
                    onClick={(ev) => { ev.stopPropagation(); onOpenEntity(); }}
                    title={`Открыть ${e.fqid} в каталоге`}
                >
                    <MIcon name="hub" size="sm" />
                    <span>{e.entityId}</span>
                    <span className="attribute-hit__domain">{e.domainId}</span>
                </button>
                <span className="attribute-hit__usage" title={`views: ${a.usedInViews}, rules: ${a.usedInRules}`}>
                    <MIcon name="visibility" size="sm" /> {a.usedInViews}
                    <MIcon name="rule" size="sm" /> {a.usedInRules}
                </span>
            </div>

            {/* Расширенная часть */}
            {expanded && (
                <div className="attribute-hit__details">
                    {a.description ? (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Описание</span>
                            <span className="attribute-hit__detail-value">{a.description}</span>
                        </div>
                    ) : (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Описание</span>
                            <span className="attribute-hit__detail-value attribute-hit__detail-value--muted">
                                нет
                            </span>
                        </div>
                    )}

                    <div className="attribute-hit__detail-row">
                        <span className="attribute-hit__detail-label">Тип</span>
                        <span className="attribute-hit__detail-value">
                            <code>{a.dataType}</code>
                            {a.dataTypeKind === "custom" && <span className="attribute-hit__tag">custom</span>}
                            {a.itemDataType && (
                                <>
                                    {" "}элемент: <code>{a.itemDataType}</code>
                                </>
                            )}
                        </span>
                    </div>

                    {hit.referenceTarget && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Ссылается на</span>
                            <code className="attribute-hit__detail-value">{hit.referenceTarget}</code>
                        </div>
                    )}

                    {a.constraintDetails && a.constraintDetails.length > 0 && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Constraints</span>
                            <span className="attribute-hit__detail-value">
                                {a.constraintDetails.map((c, i) => (
                                    <code key={i} className="attribute-hit__constraint">
                                        {c.kind}
                                        {c.min !== undefined && ` min=${c.min}`}
                                        {c.max !== undefined && ` max=${c.max}`}
                                        {c.regexp && ` /${c.regexp}/`}
                                    </code>
                                ))}
                            </span>
                        </div>
                    )}

                    <div className="attribute-hit__detail-row">
                        <span className="attribute-hit__detail-label">FQID</span>
                        <code className="attribute-hit__detail-value">{hit.key}</code>
                    </div>

                    <div className="attribute-hit__detail-actions">
                        <button className="btn btn--primary btn--small" onClick={onOpenEntity}>
                            <MIcon name="menu_book" size="sm" /> Открыть сущность
                        </button>
                        <button className="btn btn--small" onClick={onOpenYaml} title="Открыть YAML на этой сущности (Shift+Enter)">
                            <MIcon name="description" size="sm" /> YAML
                        </button>
                        <button className="btn btn--small" onClick={onCopy}>
                            <MIcon name="content_copy" size="sm" /> FQID
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

// ============ helpers ============

function countActiveFilters(f: AttributeFilterState): number {
    let n = 0;
    if (f.query.trim()) n++;
    n += f.dataTypes.size;
    n += f.constraints.size;
    n += f.domains.size;
    n += f.referenceTargets.size;
    if (f.onlyRequired) n++;
    if (f.onlyReadonly) n++;
    if (f.onlyUnused) n++;
    if (f.onlyPii) n++;
    if (f.onlyCrossDomain) n++;
    return n;
}

function countActiveFlags(f: AttributeFilterState): number {
    let n = 0;
    if (f.onlyRequired) n++;
    if (f.onlyReadonly) n++;
    if (f.onlyUnused) n++;
    if (f.onlyPii) n++;
    if (f.onlyCrossDomain) n++;
    return n;
}