import React, { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useNavigation } from "../../hooks/useNavigation";
import { MIcon } from "../common/MIcon";
import { openFileInEditor } from "../../lib/open-file";
import type { DomainSchemaSummary, SectionKey } from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import {
    generateDomainMarkdown,
    downloadDomainMarkdown,
} from "../../lib/markdown/domain-markdown";
import {
    SectionItems
} from "./DomainSchemaSectionItems";
import {
    matchesQuery,
    searchableStringsForEntity,
    searchableStringsForDataType,
    searchableStringsForGeneric,
} from "./DomainSchemaHelpers";
import { SECTION_LABELS } from "../../lib/consts";

export function DomainSchemaModal() {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();

    const open = store.domainSchemaOpen;
    const domainId = store.domainSchemaDomainId;

    const [expanded, setExpanded] = useState<Set<SectionKey>>(
        new Set(["entities", "linkages"]),
    );
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [onlyProblematic, setOnlyProblematic] = useState(false);

    const prefillQuery = useGraphStore((s) => s.domainSchemaPrefillQuery);
    const prefillOnlyProblematic = useGraphStore((s) =>
        s.domainSchemaPrefillOnlyProblematic,
    );
    const setPrefillQuery = useGraphStore((s) => s.setDomainSchemaPrefillQuery);
    const setPrefillOnlyProblematic = useGraphStore(
        (s) => s.setDomainSchemaPrefillOnlyProblematic,
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

    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
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
        const totalAttrs = schema.sections.entities.items.reduce(
            (s, x) => s + (x.attributesCount || 0),
            0,
        );
        return {
            entities: schema.sections.entities.count,
            attributes: totalAttrs,
            linkages: schema.sections.linkages.count,
            views: schema.sections.views.count,
            dataRules: schema.sections.dataRules.count,
            scenarios: schema.sections.scenarios.count,
            issues: domainIssues.length,
        };
    }, [schema, domainIssues]);

    const toggle = (key: SectionKey) => {
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

    const openEntity = (entityId: string) => {
        if (!domainId) return;
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        store.setDomainSchemaOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    const filteredSections = useMemo(() => {
        if (!schema) return null;
        if (!query.trim() && !onlyProblematic) return null;

        const result = {} as Partial<Record<SectionKey, any[]>>;

        (Object.keys(schema.sections) as SectionKey[]).forEach((key) => {
            if (onlyProblematic && key !== "entities") {
                result[key] = [];
                return;
            }

            const items = schema.sections[key].items;
            const filtered = items.filter((item) => {
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

                if (onlyProblematic && key === "entities") {
                    const fqid = `${domainId}/${item.id}`.toLowerCase();
                    const issues = issuesByEntity.get(fqid) || [];
                    if (issues.length === 0) return false;
                }

                return true;
            });

            result[key] = filtered;
        });

        return result;
    }, [schema, query, onlyProblematic, index, domainId, issuesByEntity]);

    // При включении «Только проблемные» — раскрываем все секции с результатами
    useEffect(() => {
        if (!onlyProblematic) return;
        setExpanded((prev) => {
            const next = new Set(prev);
            next.add("entities");
            return next;
        });
    }, [onlyProblematic]);

    if (!open) return null;

    const showFiltered = filteredSections !== null;
    const hasFilter = query.trim().length > 0 || onlyProblematic;

    const noResults =
        showFiltered &&
        filteredSections &&
        Object.values(filteredSections).every((arr) => !arr || arr.length === 0);

    return (
        <div
            className="help-overlay help-overlay--fullscreen help-overlay--above-yaml"
            onMouseDown={() => store.setDomainSchemaOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span className="icon-label">Схема домена</span>
                        {schema && (
                            <span className="help-modal__badge">{schema.metadata.id}</span>
                        )}
                    </div>
                    {domainId && (
                        <button
                            className={
                                "help-modal__icon-btn" +
                                (store.bookmarks.has(`domain_${domainId}`) ? " active" : "")
                            }
                            onClick={() => {
                                store.toggleBookmark(`domain_${domainId}`);
                            }}
                            title={
                                store.bookmarks.has(`domain_${domainId}`)
                                    ? "Убрать из избранного"
                                    : "В избранное"
                            }
                            style={{marginLeft: "auto"}}
                        >
                            <MIcon
                                name={
                                    store.bookmarks.has(`domain_${domainId}`)
                                        ? "star"
                                        : "star_border"
                                }
                                fill={store.bookmarks.has(`domain_${domainId}`)}
                            />
                        </button>
                    )}
                    <button
                        className="help-modal__close"
                        onClick={() => store.setDomainSchemaOpen(false)}
                    >
                        ✕
                    </button>
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

                {schema && counters && (
                    <div className="domain-schema-body">
                        <div className="domain-schema-header">
                            <div className="domain-schema-header__title">
                                {schema.metadata.name}
                                {schema.metadata.version && (
                                    <span className="domain-schema-header__version">
                                        v{schema.metadata.version}
                                    </span>
                                )}
                            </div>
                            {schema.metadata.description && (
                                <div className="domain-schema-header__desc">
                                    {schema.metadata.description}
                                </div>
                            )}
                            <div className="domain-schema-header__meta">
                                {schema.metadata.author && (
                                    <span>
                                        <MIcon name="person" size="sm" />
                                        {schema.metadata.author}
                                    </span>
                                )}
                                {schema.metadata.status && (
                                    <span>
                                        <MIcon name="flag" size="sm" />
                                        {schema.metadata.status}
                                    </span>
                                )}
                                {schema.metadata.date && (
                                    <span>
                                        <MIcon name="calendar_today" size="sm" />
                                        {schema.metadata.date}
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

                            <div className="domain-schema-counters">
                                <span className="domain-schema-counter">
                                    <strong>{counters.entities}</strong> сущностей
                                </span>
                                <span className="domain-schema-counter">
                                    <strong>{counters.attributes}</strong> атрибутов
                                </span>
                                <span className="domain-schema-counter">
                                    <strong>{counters.linkages}</strong> связей
                                </span>
                                <span className="domain-schema-counter">
                                    <strong>{counters.views}</strong> views
                                </span>
                                <span className="domain-schema-counter">
                                    <strong>{counters.dataRules}</strong> правил
                                </span>
                                <span className="domain-schema-counter">
                                    <strong>{counters.scenarios}</strong> сценариев
                                </span>
                                {counters.issues > 0 && (
                                    <button
                                        className="domain-schema-counter domain-schema-counter--issues"
                                        onClick={() => store.setLintOpen(true)}
                                        title="Открыть линтер схем"
                                    >
                                        <MIcon name="warning" size="sm" />
                                        <strong>{counters.issues}</strong> проблем
                                    </button>
                                )}
                            </div>

                            <div className="domain-schema-header__actions">
                                <button
                                    className="btn"
                                    onClick={() => goto(schema.domainId)}
                                >
                                    <MIcon name="my_location" size="sm" /> К домену на графе
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        const node = store.nodes.find(
                                            (n) => n.data.domainId === schema.domainId,
                                        );
                                        if (node?.data.filePath) {
                                            openFileInEditor(node.data.filePath, null, node.data.domainId);
                                            store.setDomainSchemaOpen(false);
                                        }
                                    }}
                                >
                                    <MIcon name="description" size="sm" /> Открыть файл
                                </button>
                                <button
                                    className="btn btn--primary"
                                    onClick={() => {
                                        const md = generateDomainMarkdown(schema, index!);
                                        downloadDomainMarkdown(schema.domainId, md);
                                    }}
                                >
                                    <MIcon name="description" size="sm" /> Экспорт в Markdown
                                </button>
                            </div>

                            <div className="domain-schema-search">
                                <div className="domain-schema-search__input-wrap">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        type="text"
                                        className="domain-schema-search__input"
                                        placeholder="Поиск по id, name, значениям Enum, атрибутам..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {query && (
                                        <button
                                            className="domain-schema-search__clear"
                                            onClick={() => setQuery("")}
                                            title="Очистить"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <label className="domain-schema-search__toggle">
                                    <input
                                        type="checkbox"
                                        checked={onlyProblematic}
                                        onChange={(e) => setOnlyProblematic(e.target.checked)}
                                    />
                                    <span>Только проблемные</span>
                                </label>
                            </div>
                        </div>

                        {noResults && (
                            <div className="domain-schema-no-results">
                                {onlyProblematic && !query.trim()
                                    ? "В этом домене нет проблемных элементов"
                                    : "Ничего не найдено по текущему фильтру"}
                            </div>
                        )}

                        <div className="domain-schema-sections">
                            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => {
                                const section = schema.sections[key];
                                const meta = SECTION_LABELS[key];
                                const filteredItems = showFiltered
                                    ? filteredSections![key] || []
                                    : section.items;
                                const displayCount = showFiltered
                                    ? filteredItems.length
                                    : section.count;
                                const isOpen = hasFilter
                                    ? displayCount > 0
                                    : expanded.has(key);

                                const sectionIssues =
                                    key === "entities"
                                        ? domainIssues.filter((i) => i.entityFqid).length
                                        : 0;

                                return (
                                    <div
                                        key={key}
                                        className={
                                            "domain-schema-section" + (isOpen ? " open" : "")
                                        }
                                    >
                                        <button
                                            className="domain-schema-section__head"
                                            onClick={() => toggle(key)}
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
                                                {showFiltered &&
                                                    displayCount !== section.count && (
                                                        <span className="domain-schema-section__count-total">
                                                            /{section.count}
                                                        </span>
                                                    )}
                                            </span>
                                            {sectionIssues > 0 && key === "entities" && (
                                                <span className="domain-schema-section__issues">
                                                    <MIcon name="warning" size="sm" />
                                                    {sectionIssues}
                                                </span>
                                            )}
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
                                                    onOpenEntity={openEntity}
                                                    onlyProblematic={onlyProblematic}
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
                )}
            </div>
        </div>
    );
}