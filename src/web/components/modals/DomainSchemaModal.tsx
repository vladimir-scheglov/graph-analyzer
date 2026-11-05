// src/web/components/modals/DomainSchemaModal.tsx
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useNavigation } from "../../hooks/useNavigation";
import { MIcon } from "../common/MIcon";
import { Popover } from "../common/Popover";
import { openFileInEditor } from "../../lib/open-file";
import type {
    DomainSchemaEntityItem,
    DomainSchemaSummary,
    SectionKey,
} from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import {
    generateDomainMarkdown,
    downloadDomainMarkdown,
} from "../../lib/markdown/domain-markdown";
import {
    exportDomainSchemaCSV,
    exportDomainSchemaJSON,
} from "../../lib/domains/schema-export";
import { SectionItems } from "./DomainSchemaSectionItems";
import {
    matchesQuery,
    searchableStringsForEntity,
    searchableStringsForDataType,
    searchableStringsForGeneric,
    computeDomainHeaderMetrics,
    buildItemIssuesMap,
    groupIssuesBySection,
    getSectionExtraInfo,
} from "./DomainSchemaHelpers";
import { SECTION_LABELS } from "../../lib/consts";
import { PROFILE_INFO } from "./GenerateSchemaProfiles";

const DOMAIN_PROFILES = PROFILE_INFO.filter((p) => p.scope === "domain");

const SECTION_ORDER: SectionKey[] = Object.keys(
    SECTION_LABELS,
) as SectionKey[];

type SortBy = "default" | "name" | "issues" | "count";
type ProblemFilter = "all" | "only";

const TOC_WIDTH_KEY = "dg-domain-schema-toc-width";

// ============ Модалка ============

export function DomainSchemaModal() {
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();

    const open = useGraphStore((s) => s.domainSchemaOpen);
    const domainId = useGraphStore((s) => s.domainSchemaDomainId);
    const nodes = useGraphStore((s) => s.nodes);

    const [expanded, setExpanded] = useState<Set<SectionKey>>(
        new Set(["entities", "linkages"]),
    );
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [sectionFilter, setSectionFilter] = useState<Set<SectionKey>>(
        new Set(),
    );
    const [onlyProblematic, setOnlyProblematic] = useState(false);
    const [sortBy, setSortBy] = useState<SortBy>("default");
    const [enrichMenuOpen, setEnrichMenuOpen] = useState(false);
    const [tocCollapsed, setTocCollapsed] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);

    // Prefill из других модалок
    const prefillQuery = useGraphStore((s) => s.domainSchemaPrefillQuery);
    const prefillOnlyProblematic = useGraphStore(
        (s) => s.domainSchemaPrefillOnlyProblematic,
    );
    const setPrefillQuery = useGraphStore((s) => s.setDomainSchemaPrefillQuery);
    const setPrefillOnlyProblematic = useGraphStore(
        (s) => s.setDomainSchemaPrefillOnlyProblematic,
    );
    const prefillExpandItem = useGraphStore(
        (s) => s.domainSchemaPrefillExpandItem,
    );
    const setPrefillExpandItem = useGraphStore(
        (s) => s.setDomainSchemaPrefillExpandItem,
    );

    useEffect(() => {
        if (!open) return;
        if (prefillQuery !== null) {
            setQuery(prefillQuery);
            setPrefillQuery(null);
        }
        if (prefillOnlyProblematic) {
            setOnlyProblematic(true);
            setPrefillOnlyProblematic(false);
        }
    }, [
        open,
        prefillQuery,
        prefillOnlyProblematic,
        setPrefillQuery,
        setPrefillOnlyProblematic,
    ]);

    useEffect(() => {
        if (!open) return;
        if (!prefillExpandItem) return;
        setExpandedItems((prev) => {
            const next = new Set(prev);
            next.add(prefillExpandItem);
            return next;
        });
        setPrefillExpandItem(null);
        const t = setTimeout(() => {
            const el = document.getElementById(`ds-item-${prefillExpandItem}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);
        return () => clearTimeout(t);
    }, [open, prefillExpandItem, setPrefillExpandItem]);

    // ============ Derived ============

    const schema: DomainSchemaSummary | null = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const currentNode = useMemo(() => {
        if (!schema) return null;
        return (
            nodes.find((n) => n.data.domainId === schema.domainId) || null
        );
    }, [schema, nodes]);

    const headerMetrics = useMemo(() => {
        if (!index || !domainId) return null;
        return computeDomainHeaderMetrics(domainId, index);
    }, [index, domainId]);

    const issuesBySection = useMemo(() => {
        if (!index || !domainId) return new Map<SectionKey, LintIssue[]>();
        return groupIssuesBySection(domainId, index);
    }, [index, domainId]);

    const issuesByEntity = useMemo(() => {
        const m = new Map<string, LintIssue[]>();
        if (!index || !domainId) return m;
        index.lint.lintReport.issues.forEach((issue) => {
            if (issue.domainId !== domainId) return;
            if (!issue.entityFqid) return;
            if (!m.has(issue.entityFqid)) m.set(issue.entityFqid, []);
            m.get(issue.entityFqid)!.push(issue);
        });
        return m;
    }, [index, domainId]);

    const issuesByAttribute = useMemo(() => {
        const m = new Map<string, LintIssue[]>();
        if (!index || !domainId) return m;
        index.lint.lintReport.issues.forEach((issue) => {
            if (issue.domainId !== domainId) return;
            if (!issue.entityFqid || !issue.attributeId) return;
            const key = `${issue.entityFqid}#${issue.attributeId}`;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(issue);
        });
        return m;
    }, [index, domainId]);

    const domainIssues = useMemo(() => {
        if (!index || !domainId) return [];
        return index.lint.lintReport.issues.filter((i) => i.domainId === domainId);
    }, [index, domainId]);

    const counters = useMemo(() => {
        if (!schema) return null;
        return {
            entities: schema.sections.entities.count,
            attributes: headerMetrics?.attributeCount ?? 0,
            linkages: schema.sections.linkages.count,
            views: schema.sections.views.count,
            dataRules: schema.sections.dataRules.count,
            scenarios: schema.sections.scenarios.count,
            issues: domainIssues.length,
        };
    }, [schema, domainIssues, headerMetrics]);

    const sectionItemIssues = useMemo(() => {
        const m = new Map<SectionKey, Map<string, LintIssue[]>>();
        if (!index || !domainId) return m;
        for (const key of SECTION_ORDER) {
            m.set(key, buildItemIssuesMap(key, domainId, index));
        }
        return m;
    }, [index, domainId]);

    // ============ Filtered sections ============

    const filteredSections = useMemo(() => {
        if (!schema) return null;
        if (!query.trim() && !onlyProblematic && sectionFilter.size === 0)
            return null;

        const result = {} as Partial<Record<SectionKey, any[]>>;

        SECTION_ORDER.forEach((key) => {
            const section = schema.sections[key];
            const items = section?.items ?? [];

            // Фильтр по секциям
            if (sectionFilter.size > 0 && !sectionFilter.has(key)) {
                result[key] = [];
                return;
            }

            const itemIssues = sectionItemIssues.get(key);

            const filtered = items.filter((item: any) => {
                // onlyProblematic
                if (onlyProblematic) {
                    const itemId = String(item?.id ?? "").toLowerCase();
                    const issues =
                        key === "entities"
                            ? issuesByEntity.get(
                                `${domainId}/${item.id}`.toLowerCase(),
                            ) || []
                            : itemIssues?.get(item.id) || [];

                    if (issues.length === 0) return false;
                }

                // query
                if (query.trim()) {
                    let hay: string[] = [];
                    if (key === "entities") {
                        hay = searchableStringsForEntity(item, index, domainId!);
                    } else if (key === "dataTypes") {
                        hay = searchableStringsForDataType(item, index, domainId!);
                    } else {
                        hay = searchableStringsForGeneric(item);
                    }
                    if (!matchesQuery(hay, query)) return false;
                }

                return true;
            });

            // sort
            if (sortBy === "name") {
                filtered.sort((a: any, b: any) =>
                    String(a.name || a.id || "").localeCompare(
                        String(b.name || b.id || ""),
                    ),
                );
            } else if (sortBy === "issues") {
                const getIssues = (item: any) => {
                    const eid = `${domainId}/${item.id}`.toLowerCase();
                    const attrIssues =
                        key === "entities" ? issuesByEntity.get(eid) || [] : [];
                    const secIssues = itemIssues?.get(item.id) || [];
                    return attrIssues.length + secIssues.length;
                };
                filtered.sort((a: any, b: any) => getIssues(b) - getIssues(a));
            } else if (sortBy === "count") {
                const getCount = (item: any) => {
                    if (item.attributesCount != null) return item.attributesCount;
                    if (item.valuesCount != null) return item.valuesCount;
                    if (item.statusesCount != null) return item.statusesCount;
                    if (item.viewsCount != null) return item.viewsCount;
                    if (item.actionsCount != null) return item.actionsCount;
                    return 0;
                };
                filtered.sort((a: any, b: any) => getCount(b) - getCount(a));
            }

            result[key] = filtered;
        });

        return result;
    }, [
        schema,
        query,
        onlyProblematic,
        sectionFilter,
        sortBy,
        index,
        domainId,
        issuesByEntity,
        sectionItemIssues,
    ]);

    const hasFilter =
        query.trim().length > 0 || onlyProblematic || sectionFilter.size > 0;

    const totalFiltered = useMemo(() => {
        if (!filteredSections) return 0;
        let sum = 0;
        Object.values(filteredSections).forEach((arr) => {
            sum += arr?.length || 0;
        });
        return sum;
    }, [filteredSections]);

    // ============ Handlers ============

    const toggleSection = (key: SectionKey) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key);
            else s.add(key);
            return s;
        });
    };

    const toggleItem = (key: string) => {
        setExpandedItems((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key);
            else s.add(key);
            return s;
        });
    };

    const expandAll = useCallback(() => {
        setExpanded(new Set(SECTION_ORDER));
    }, []);

    const collapseAll = useCallback(() => {
        setExpanded(new Set());
    }, []);

    const resetFilters = useCallback(() => {
        setQuery("");
        setSectionFilter(new Set());
        setOnlyProblematic(false);
    }, []);

    const toggleSectionFilter = (key: SectionKey) => {
        setSectionFilter((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key);
            else s.add(key);
            return s;
        });
    };

    const scrollToSection = (key: SectionKey) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            s.add(key);
            return s;
        });
        const el = document.getElementById(`ds-section-${key}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const openEntity = (entityId: string) => {
        if (!domainId) return;
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        const st = useGraphStore.getState();
        st.setDomainSchemaOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const openYamlForDomain = async () => {
        const node = nodes.find((n) => n.data.domainId === domainId);
        if (!node?.data.filePath) {
            useGraphStore.getState().showSnackbar("Файл схемы не найден");
            return;
        }
        const st = useGraphStore.getState();
        // Скрываем ДО открытия: иначе help-overlay--above-yaml перекроет редактор
        st.setDomainSchemaOpen(false);
        const ok = await openFileInEditor(node.data.filePath, null, domainId);
        if (!ok) {
            // Пользователь отменил переключение (dirty-файл) — возвращаем модалку
            useGraphStore.getState().setDomainSchemaOpen(true);
        }
    };

    const handleDraftClick = async () => {
        if (!currentNode?.data.filePath) {
            useGraphStore.getState().showSnackbar("Файл схемы не найден");
            return;
        }
        const st = useGraphStore.getState();
        st.setDomainSchemaOpen(false);
        const ok = await openFileInEditor(
            currentNode.data.filePath,
            null,
            currentNode.data.domainId,
        );
        if (!ok) {
            useGraphStore.getState().setDomainSchemaOpen(true);
        }
    };

    // ============ Keyboard ============

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
                return;
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        useGraphStore.getState().setTooltip(null);
        (window as any).__tooltipHovered = false;
    }, [open]);

    // ============ Draft / Status ============

    const [statusToggling, setStatusToggling] = useState(false);

    const handleToggleStatus = async () => {
        if (!schema || statusToggling) return;
        setStatusToggling(true);
        try {
            const res = await fetch("/api/toggle-domain-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domainId: schema.domainId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                useGraphStore
                    .getState()
                    .showSnackbar(
                        "Ошибка смены статуса: " + (data.error || `HTTP ${res.status}`),
                    );
                return;
            }

            const st = useGraphStore.getState();
            const newStatus: string | null =
                typeof data.status === "string" ? data.status : null;

            // 1. Оптимистичный апдейт — кнопка переключится мгновенно.
            if (newStatus) {
                st.setNodes((prev) =>
                    prev.map((n) =>
                        n.data.domainId === schema.domainId
                            ? { ...n, data: { ...n.data, status: newStatus } }
                            : n,
                    ),
                );
            }

            // 3. Забираем свежий __graphData. С патчем 1 (серверным) это
            //    уже содержит новый status. Но на случай, если сервер без патча —
            //    refreshGraphFromServer вернёт старый, и оптимистичный апдейт
            //    из п.1 затрётся. Поэтому оборачиваем в retry — ждём, пока
            //    rebuild на сервере отработает, и обновляемся снова.
            await st.refreshGraphFromServer(true).catch((e: any) => {
                console.warn("[toggle-status] refresh failed:", e);
            });

            // 4. Повторный оптимистичный апдейт — защита от race-condition,
            //    когда __graphData ещё не отработал на сервере.
            if (newStatus) {
                useGraphStore.getState().setNodes((prev) =>
                    prev.map((n) =>
                        n.data.domainId === schema.domainId
                            ? { ...n, data: { ...n.data, status: newStatus } }
                            : n,
                    ),
                );
            }

            // 5. Финальный refresh через ~200мс — догоняем rebuild, если он
            //    был отложен (без патча 1). Не критично, если патч 1 применён —
            //    просто лишний GET.
            setTimeout(() => {
                const cur = useGraphStore.getState();
                const fresh = cur.nodes.find(
                    (n) => n.data.domainId === schema.domainId,
                );
                if (fresh && newStatus && fresh.data.status !== newStatus) {
                    // всё ещё старое — ещё один refresh
                    cur.refreshGraphFromServer(true).catch(() => { });
                }
            }, 250);

            st.showSnackbar(
                `Статус домена ${schema.domainId}: ${newStatus || data.status || "?"}`,
            );
        } catch (err: any) {
            useGraphStore
                .getState()
                .showSnackbar("Ошибка: " + (err.message || String(err)));
        } finally {
            setStatusToggling(false);
        }
    };

    // ============ Render guards ============

    if (!open) return null;

    const showFiltered = filteredSections !== null;

    const noResults = showFiltered && totalFiltered === 0;

    // ============ Render ============

    return (
        <div
            className="help-overlay help-overlay--fullscreen help-overlay--above-yaml"
            onMouseDown={() => useGraphStore.getState().setDomainSchemaOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal domain-schema-modal-v2"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER (sticky) ============ */}
                <DomainSchemaHeader
                    schema={schema}
                    currentNode={currentNode}
                    metrics={headerMetrics}
                    isRefreshing={loading && !!schema}
                    statusToggling={statusToggling}
                    onToggleStatus={handleToggleStatus}
                    onDraftClick={handleDraftClick}
                    onOpenYaml={openYamlForDomain}
                    onOpenSchema={null}
                    onClose={() => useGraphStore.getState().setDomainSchemaOpen(false)}
                />

                {loading && !schema && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {!loading && !error && !schema && (
                    <div className="help-modal__body">
                        <div
                            style={{
                                padding: 40,
                                textAlign: "center",
                                color: "var(--text-500)",
                            }}
                        >
                            Схема для этого домена не найдена в индексе
                        </div>
                    </div>
                )}

                {schema && counters && headerMetrics && (
                    <div className="domain-schema-body domain-schema-body--v2">
                        {/* ============ TOC ============ */}
                        {!tocCollapsed && (
                            <div className="domain-schema-toc">
                                <div className="domain-schema-toc__head">
                                    <span>Секции</span>
                                    <button
                                        className="domain-schema-toc__collapse"
                                        onClick={() => setTocCollapsed(true)}
                                        title="Свернуть оглавление"
                                    >
                                        <MIcon name="chevron_left" size="sm" />
                                    </button>
                                </div>
                                <div className="domain-schema-toc__list">
                                    {SECTION_ORDER.map((key) => {
                                        const section = schema.sections[key];
                                        const meta = SECTION_LABELS[key];
                                        if (!section || section.count === 0) return null;
                                        const issueCount =
                                            issuesBySection.get(key)?.length || 0;
                                        const isActive = sectionFilter.has(key);
                                        return (
                                            <button
                                                key={key}
                                                className={
                                                    "domain-schema-toc__item" +
                                                    (isActive ? " domain-schema-toc__item--active" : "")
                                                }
                                                onClick={() => {
                                                    toggleSectionFilter(key);
                                                    scrollToSection(key);
                                                }}
                                                title={`Перейти к разделу «${meta.label}»`}
                                            >
                                                <MIcon name={meta.icon} size="sm" />
                                                <span className="domain-schema-toc__label">
                                                    {meta.label}
                                                </span>
                                                <span className="domain-schema-toc__count">
                                                    {section.count}
                                                </span>
                                                {issueCount > 0 && (
                                                    <span className="domain-schema-toc__issues">
                                                        <MIcon name="warning" size="sm" />
                                                        {issueCount}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {tocCollapsed && (
                            <button
                                className="domain-schema-toc-expand"
                                onClick={() => setTocCollapsed(false)}
                                title="Показать оглавление"
                            >
                                <MIcon name="chevron_right" size="sm" />
                                <span>Секции</span>
                            </button>
                        )}

                        {/* ============ MAIN ============ */}
                        <div className="domain-schema-main">
                            {/* ============ TOOLBAR ============ */}
                            <div className="domain-schema-toolbar-v2">
                                <div className="domain-schema-search-v2">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Поиск по id, name, значениям Enum, атрибутам... (Ctrl+F)"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {query && (
                                        <button
                                            className="domain-schema-search-v2__clear"
                                            onClick={() => setQuery("")}
                                            title="Очистить"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="domain-schema-toolbar-v2__row">
                                    <label className="domain-schema-search__toggle">
                                        <input
                                            type="checkbox"
                                            checked={onlyProblematic}
                                            onChange={(e) =>
                                                setOnlyProblematic(e.target.checked)
                                            }
                                        />
                                        <span>Только проблемные</span>
                                    </label>

                                    <label className="domain-schema-toolbar-v2__field">
                                        <span>Сортировка:</span>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => setSortBy(e.target.value as SortBy)}
                                        >
                                            <option value="default">По умолчанию</option>
                                            <option value="name">По имени</option>
                                            <option value="issues">Сначала проблемные</option>
                                            <option value="count">По размеру</option>
                                        </select>
                                    </label>

                                    <div className="domain-schema-toolbar-v2__btn-group">
                                        <button
                                            className="btn btn--small"
                                            onClick={expandAll}
                                            title="Развернуть все секции"
                                        >
                                            <MIcon name="unfold_more" size="sm" />
                                            Развернуть
                                        </button>
                                        <button
                                            className="btn btn--small"
                                            onClick={collapseAll}
                                            title="Свернуть все секции"
                                        >
                                            <MIcon name="unfold_less" size="sm" />
                                            Свернуть
                                        </button>
                                    </div>

                                    {hasFilter && (
                                        <button
                                            className="btn btn--small"
                                            onClick={resetFilters}
                                            title="Сбросить фильтры"
                                        >
                                            <MIcon name="filter_alt_off" size="sm" />
                                            Сбросить
                                        </button>
                                    )}

                                    {sectionFilter.size > 0 && (
                                        <span className="domain-schema-toolbar-v2__section-hint">
                                            Секций: {sectionFilter.size}
                                        </span>
                                    )}

                                    {showFiltered && (
                                        <span className="domain-schema-toolbar-v2__count">
                                            Найдено: <strong>{totalFiltered}</strong>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* ============ ACTIONS ============ */}
                            <DomainSchemaActions
                                schema={schema}
                                index={index!}
                                nodes={nodes}
                                enrichMenuOpen={enrichMenuOpen}
                                setEnrichMenuOpen={setEnrichMenuOpen}
                                onOpenYaml={openYamlForDomain}
                                onCloseModal={() =>
                                    useGraphStore.getState().setDomainSchemaOpen(false)
                                }
                            />

                            {/* ============ NO RESULTS ============ */}
                            {noResults && (
                                <div className="domain-schema-no-results">
                                    {onlyProblematic && !query.trim() && sectionFilter.size === 0
                                        ? "В этом домене нет проблемных элементов"
                                        : "Ничего не найдено по текущему фильтру"}
                                </div>
                            )}

                            {/* ============ SECTIONS ============ */}
                            <div className="domain-schema-sections">
                                {SECTION_ORDER.map((key) => {
                                    const section = schema.sections[key];
                                    const meta = SECTION_LABELS[key];
                                    if (!section) return null;

                                    const filteredItems = showFiltered
                                        ? filteredSections![key] || []
                                        : section.items;
                                    const displayCount = showFiltered
                                        ? filteredItems.length
                                        : section.count;

                                    // при активном фильтре скрываем пустые секции
                                    if (hasFilter && displayCount === 0) return null;

                                    // при отсутствии фильтра — не рендерим пустые, но их видно в TOC
                                    if (!hasFilter && section.count === 0) return null;

                                    const isOpen = hasFilter
                                        ? displayCount > 0
                                        : expanded.has(key);

                                    const sectionIssuesList = issuesBySection.get(key) || [];
                                    const sectionIssuesCount = sectionIssuesList.length;
                                    const extra = getSectionExtraInfo(
                                        key,
                                        domainId!,
                                        index!,
                                    );

                                    return (
                                        <div
                                            key={key}
                                            id={`ds-section-${key}`}
                                            className={
                                                "domain-schema-section" + (isOpen ? " open" : "")
                                            }
                                        >
                                            <button
                                                className="domain-schema-section__head"
                                                onClick={() => toggleSection(key)}
                                                disabled={hasFilter && displayCount === 0}
                                            >
                                                <MIcon
                                                    name={isOpen ? "expand_more" : "chevron_right"}
                                                    size="sm"
                                                />
                                                <MIcon name={meta.icon} size="sm" />
                                                <span className="domain-schema-section__title">
                                                    {meta.label}
                                                </span>
                                                <span
                                                    className={
                                                        "domain-schema-section__count" +
                                                        (displayCount === 0 ? " zero" : "")
                                                    }
                                                >
                                                    {displayCount}
                                                    {showFiltered && displayCount !== section.count && (
                                                        <span className="domain-schema-section__count-total">
                                                            /{section.count}
                                                        </span>
                                                    )}
                                                </span>
                                                {extra && (
                                                    <span className="domain-schema-section__extra">
                                                        {extra}
                                                    </span>
                                                )}
                                                {sectionIssuesCount > 0 && (
                                                    <button
                                                        type="button"
                                                        className="domain-schema-section__issues"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            useGraphStore.getState().setLintOpen(true);
                                                        }}
                                                        title={`${sectionIssuesCount} проблем в этой секции — открыть линтер`}
                                                    >
                                                        <MIcon name="warning" size="sm" />
                                                        {sectionIssuesCount}
                                                    </button>
                                                )}
                                                <span className="domain-schema-section__filter-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={sectionFilter.has(key)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={() => toggleSectionFilter(key)}
                                                        title="Фильтровать по этой секции"
                                                    />
                                                </span>
                                            </button>

                                            {isOpen && filteredItems.length > 0 && (
                                                <div className="domain-schema-section__body">
                                                    <SectionItems
                                                        sectionKey={key}
                                                        items={filteredItems}
                                                        index={index!}
                                                        domainId={domainId!}
                                                        expandedItems={expandedItems}
                                                        onToggleItem={toggleItem}
                                                        issuesByEntity={issuesByEntity}
                                                        issuesByAttribute={issuesByAttribute}
                                                        itemIssues={sectionItemIssues.get(key) || new Map()}
                                                        onOpenEntity={openEntity}
                                                        onlyProblematic={onlyProblematic}
                                                        filePath={currentNode?.data.filePath || null}
                                                    />
                                                </div>
                                            )}

                                            {isOpen && filteredItems.length === 0 && (
                                                <div className="domain-schema-section__body domain-schema-section__body--empty">
                                                    {hasFilter
                                                        ? "Ничего не найдено по фильтру"
                                                        : "Пусто"}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ============ FLAGS ============ */}
                            {(schema.flags.hasExchangeSettings ||
                                schema.flags.hasCounterColorPattern) && (
                                    <div className="domain-schema-flags">
                                        {schema.flags.hasExchangeSettings && (
                                            <span className="domain-schema-flag">
                                                <MIcon name="swap_horiz" size="sm" /> Настроен обмен
                                                данными
                                            </span>
                                        )}
                                        {schema.flags.hasCounterColorPattern && (
                                            <span className="domain-schema-flag">
                                                <MIcon name="palette" size="sm" /> Есть цветовые схемы
                                                счётчиков
                                            </span>
                                        )}
                                    </div>
                                )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ DomainSchemaHeader ============

function DomainSchemaHeader({
    schema,
    currentNode,
    metrics,
    isRefreshing,
    statusToggling,
    onToggleStatus,
    onDraftClick,
    onOpenYaml,
    onClose,
}: {
    schema: DomainSchemaSummary | null;
    currentNode: any;
    metrics: ReturnType<typeof computeDomainHeaderMetrics> | null;
    isRefreshing: boolean;
    statusToggling: boolean;
    onToggleStatus: () => void;
    onDraftClick: () => void;
    onOpenYaml: () => void;
    onOpenSchema: null;
    onClose: () => void;
}) {
    const bookmarks = useGraphStore((s) => s.bookmarks);

    return (
        <div className="help-modal__header domain-schema-header-v2">
            <div className="domain-schema-header-v2__title-row">
                <div className="help-modal__title">
                    <MIcon name="menu_book" size="sm" />
                    <span className="icon-label">Схема домена</span>
                    {schema && (
                        <span className="help-modal__badge">{schema.metadata.id}</span>
                    )}
                    {schema?.metadata.version && (
                        <span className="help-modal__badge">
                            v{schema.metadata.version}
                        </span>
                    )}
                    {isRefreshing && (
                        <span
                            className="help-modal__badge help-modal__badge--loading"
                            title="Обновляем индекс…"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                            <MIcon name="hourglass_top" size="sm" />
                            <span>обновление…</span>
                        </span>
                    )}
                    {currentNode?.data.hasDraft && (
                        <button
                            type="button"
                            className="domain-schema-badge domain-schema-badge--draft"
                            onClick={onDraftClick}
                            title="Есть неопубликованные изменения. Клик — открыть редактор"
                        >
                            <MIcon name="edit_note" size="sm" />
                            <span>Черновик</span>
                        </button>
                    )}
                    {currentNode?.data.status && (
                        <>
                            <span style={{ width: '8px' }}></span>
                            <button
                                type="button"
                                className={
                                    "domain-schema-badge " +
                                    (currentNode.data.status === "DISABLED"
                                        ? "domain-schema-badge--disabled"
                                        : "domain-schema-badge--enabled")
                                }
                                onClick={onToggleStatus}
                                disabled={statusToggling}
                                title={
                                    currentNode.data.status === "DISABLED"
                                        ? "Клик — включить"
                                        : "Клик — выключить"
                                }
                            >
                                <MIcon
                                    name={
                                        currentNode.data.status === "DISABLED"
                                            ? "pause_circle"
                                            : "play_circle"
                                    }
                                    size="sm"
                                />
                                <span>{currentNode.data.status === "DISABLED" ? "ВЫКЛЮЧЕНО" : "ВКЛЮЧЕНО"}</span>
                            </button>
                        </>
                    )}
                </div>

                <div className="elp-modal__actions domain-schema-header-v2__actions">
                    {schema && (
                        <button
                            className={
                                "help-modal__icon-btn" +
                                (bookmarks.has(`domain_${schema.domainId}`) ? " active" : "")
                            }
                            onClick={() => {
                                useGraphStore
                                    .getState()
                                    .toggleBookmark(`domain_${schema.domainId}`);
                            }}
                            title={
                                bookmarks.has(`domain_${schema.domainId}`)
                                    ? "Убрать из избранного"
                                    : "В избранное"
                            }
                        >
                            <MIcon
                                name={
                                    bookmarks.has(`domain_${schema.domainId}`)
                                        ? "star"
                                        : "star_border"
                                }
                                fill={bookmarks.has(`domain_${schema.domainId}`)}
                            />
                        </button>
                    )}
                    <button
                        className="help-modal__icon-btn"
                        onClick={onOpenYaml}
                        title="Открыть файл в редакторе"
                    >
                        <MIcon name="description" />
                    </button>
                    <button className="help-modal__close" onClick={onClose}>
                        ✕
                    </button>
                </div>
            </div>

            {schema?.metadata.description && (
                <div className="domain-schema-header-v2__desc">
                    {schema.metadata.description}
                </div>
            )}

            {/* Метрики */}
            {metrics && (
                <div className="domain-schema-header-v2__metrics">
                    <span className="domain-schema-metric domain-schema-metric--info">
                        <strong>{metrics.entityCount}</strong> сущностей
                    </span>
                    <span className="domain-schema-metric domain-schema-metric--info">
                        <strong>{metrics.attributeCount}</strong> атрибутов
                    </span>
                    <span className="domain-schema-metric domain-schema-metric--info">
                        <strong>{metrics.linkageCount}</strong> связей
                    </span>
                    <span className="domain-schema-metric domain-schema-metric--info">
                        <strong>{metrics.viewCount}</strong> views
                    </span>

                    {metrics.sonar && (
                        <button
                            type="button"
                            className={
                                "domain-schema-metric domain-schema-metric--sonar " +
                                "domain-schema-metric--" +
                                metrics.sonar.grade.toLowerCase()
                            }
                            onClick={() => {
                                const st = useGraphStore.getState();
                                st.setDomainSchemaOpen(false);
                                st.setLintOpen(true);
                            }}
                            title={`Sonar-оценка: ${metrics.sonar.score}/100 — открыть линтер`}
                        >
                            <MIcon name="science" size="sm" />
                            <strong>{metrics.sonar.score}</strong>
                            <span style={{ fontSize: 10 }}>
                                {metrics.sonar.grade}
                            </span>
                        </button>
                    )}

                    {metrics.issues.total > 0 && (
                        <button
                            type="button"
                            className={
                                "domain-schema-metric domain-schema-metric--" +
                                (metrics.issues.error > 0 ? "error" : "warning")
                            }
                            onClick={() => {
                                const st = useGraphStore.getState();
                                st.setDomainSchemaOpen(false);
                                st.setLintOpen(true);
                            }}
                            title={`${metrics.issues.total} проблем — открыть линтер`}
                        >
                            <MIcon name="warning" size="sm" />
                            <strong>{metrics.issues.total}</strong>
                            <span style={{ fontSize: 10 }}>
                                {metrics.issues.error > 0 && `${metrics.issues.error}e `}
                                {metrics.issues.warning > 0 && `${metrics.issues.warning}w`}
                            </span>
                        </button>
                    )}

                    {metrics.pii.total > 0 && (
                        <button
                            type="button"
                            className={
                                "domain-schema-metric domain-schema-metric--" +
                                (metrics.pii.critical > 0 ? "error" : "warning")
                            }
                            onClick={() => {
                                const st = useGraphStore.getState();
                                st.setDomainSchemaOpen(false);
                                st.setPiiInitialDomain(schema!.domainId);
                                st.setPiiInitialSeverity(null);
                                st.setPiiOpen(true);
                            }}
                            title={`PII: ${metrics.pii.total} (critical: ${metrics.pii.critical}) — открыть PII-атрибуты`}
                        >
                            <MIcon name="shield_lock" size="sm" />
                            <strong>{metrics.pii.total}</strong>
                            {metrics.pii.critical > 0 && (
                                <span style={{ fontSize: 10 }}>
                                    {metrics.pii.critical}c
                                </span>
                            )}
                        </button>
                    )}

                    {metrics.orphans.entities > 0 && (
                        <span
                            className="domain-schema-metric domain-schema-metric--warning"
                            title={`Сущности-сироты: ${metrics.orphans.entities}`}
                        >
                            <MIcon name="link_off" size="sm" />
                            <strong>{metrics.orphans.entities}</strong>
                        </span>
                    )}
                </div>
            )}

            {/* Автор, теги */}
            {schema && (schema.metadata.author || schema.metadata.tags.length > 0) && (
                <div className="domain-schema-header-v2__meta">
                    {schema.metadata.author && (
                        <span>
                            <MIcon name="person" size="sm" />
                            {schema.metadata.author}
                        </span>
                    )}
                    {schema.metadata.tags.length > 0 && (
                        <span className="domain-schema-header__tags">
                            {schema.metadata.tags.map((t) => (
                                <span key={t} className="tag">
                                    {t}
                                </span>
                            ))}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// ============ DomainSchemaActions ============

function DomainSchemaActions({
    schema,
    index,
    nodes,
    enrichMenuOpen,
    setEnrichMenuOpen,
    onOpenYaml,
    onCloseModal,
}: {
    schema: DomainSchemaSummary;
    index: any;
    nodes: any[];
    enrichMenuOpen: boolean;
    setEnrichMenuOpen: (v: boolean) => void;
    onOpenYaml: () => void;
    onCloseModal: () => void;
}) {
    const { goto } = useNavigation();

    return (
        <div className="domain-schema-actions-v2">
            <button
                className="btn btn--small"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setGenerateBatchDomainId(schema.domainId);
                    st.setGenerateBatchOpen(true);
                    st.setDomainSchemaOpen(false);
                }}
                title="Сгенерировать типовые блоки для нескольких сущностей разом"
            >
                <MIcon name="auto_awesome" size="sm" />
                Генерация
            </button>

            <div style={{ position: "relative" }}>
                <button
                    className="btn btn--small"
                    onClick={() => setEnrichMenuOpen(!enrichMenuOpen)}
                    title="Обогатить домен: меню, Enum, цвета, обмен, счётчики"
                >
                    <MIcon name="auto_fix_high" size="sm" />
                    Обогатить
                    <MIcon name="expand_more" size="sm" />
                </button>
                {enrichMenuOpen && (
                    <>
                        <div
                            onClick={() => setEnrichMenuOpen(false)}
                            style={{ position: "fixed", inset: 0, zIndex: 10 }}
                        />
                        <div
                            className="menu"
                            style={{
                                position: "absolute",
                                top: "calc(100% + 4px)",
                                left: 0,
                                zIndex: 11,
                                minWidth: 260,
                                background: "var(--bg-800)",
                                border: "1px solid var(--border-hover)",
                                borderRadius: 8,
                                boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                                padding: 4,
                            }}
                        >
                            {DOMAIN_PROFILES.map((p) => (
                                <button
                                    key={p.id}
                                    className="menu__item"
                                    onClick={() => {
                                        const st = useGraphStore.getState();
                                        st.setGenerateSchemaDomainId(schema.domainId);
                                        st.setGenerateSchemaEntityId(null);
                                        st.setGenerateSchemaOpen(true);
                                        st.setDomainSchemaOpen(false);
                                        setEnrichMenuOpen(false);
                                        st.setGenerateSchemaPrefillProfile?.(p.id);
                                    }}
                                    title={p.when}
                                >
                                    <span className="menu__icon">
                                        <MIcon name="auto_awesome" size="sm" />
                                    </span>
                                    <span className="menu__text">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <button
                className="btn btn--small"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setViewGraphPrefillDomain(schema.domainId);
                    st.setViewGraphOpen(true);
                    st.setDomainSchemaOpen(false);
                }}
                title="Граф зависимостей views этого домена"
            >
                <MIcon name="schema" size="sm" />
                Граф views
            </button>

            <button
                className="btn btn--small"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setDomainSchemaOpen(false);

                    if (st.viewMode !== "graph") {
                        st.setViewMode("graph");
                    }

                    // Ждём готовности ReactFlow-инстанса: без него goto()
                    // выделит узел и откроет панель, но не центрирует граф.
                    const tryGoto = (attempt: number) => {
                        if (attempt > 20) {
                            // ~1 секунда прошла — граф так и не смонтировался.
                            // Делаем goto без центрирования (лучше, чем ничего).
                            goto(schema.domainId);
                            return;
                        }
                        const cur = useGraphStore.getState();
                        if (cur.rfInstance) {
                            goto(schema.domainId);
                            return;
                        }
                        setTimeout(() => tryGoto(attempt + 1), 50);
                    };
                    tryGoto(0);
                }}
                title="К домену на графе"
            >
                <MIcon name="my_location" size="sm" />
                К графу
            </button>

            <button className="btn btn--small" onClick={onOpenYaml}>
                <MIcon name="description" size="sm" />
                YAML
            </button>

            <Popover
                width={240}
                align="left"
                trigger={(isPopOpen) => (
                    <button
                        className={"btn btn--small" + (isPopOpen ? " btn--active" : "")}
                    >
                        <MIcon name="download" size="sm" />
                        Экспорт
                    </button>
                )}
            >
                {(close) => (
                    <div className="menu">
                        <button
                            className="menu__item"
                            onClick={() => {
                                const md = generateDomainMarkdown(schema, index);
                                downloadDomainMarkdown(schema.domainId, md);
                                close();
                            }}
                        >
                            <span className="menu__icon">
                                <MIcon name="description" size="sm" />
                            </span>
                            <span className="menu__text">Markdown (.md)</span>
                        </button>
                        <button
                            className="menu__item"
                            onClick={() => {
                                exportDomainSchemaJSON(schema, index);
                                close();
                            }}
                        >
                            <span className="menu__icon">
                                <MIcon name="data_object" size="sm" />
                            </span>
                            <span className="menu__text">JSON (.json)</span>
                        </button>
                        <button
                            className="menu__item"
                            onClick={() => {
                                exportDomainSchemaCSV(schema, "all");
                                close();
                            }}
                        >
                            <span className="menu__icon">
                                <MIcon name="table_view" size="sm" />
                            </span>
                            <span className="menu__text">CSV (.csv)</span>
                        </button>
                    </div>
                )}
            </Popover>

            <button
                className="btn btn--small"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setSidecarDomainId(schema.domainId);
                    st.setSidecarOpen(true);
                    st.setDomainSchemaOpen(false);
                }}
                title="Посмотреть, что было сгенерировано для этого домена"
            >
                <MIcon name="database" size="sm" />
                Манифест
            </button>

            <button
                className="btn btn--small"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setCheatsheetInitialSection("field-reference");
                    st.setCheatsheetOpen(true);
                    st.setDomainSchemaOpen(false);
                }}
                title="Справочник всех полей YAML"
            >
                <MIcon name="menu_book" size="sm" />
                Шпаргалка
            </button>

            <div style={{ flex: 1 }} />

            <button
                className="btn btn--small btn--danger"
                onClick={() => {
                    const st = useGraphStore.getState();
                    st.setDeleteDomainTarget({ domainId: schema.domainId });
                    st.setDomainSchemaOpen(false);
                }}
                title="Удалить домен"
            >
                <MIcon name="delete" size="sm" />
                Удалить
            </button>
        </div>
    );
}