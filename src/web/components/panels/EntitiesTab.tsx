import React, { useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import type { EntityIndex, EntityRecord } from "../../lib/types";
import type { EntityRecord as FullEntity } from "../../../shared/model-types";

export interface EntitiesTabProps {
    node: any;
    entities: EntityRecord[];
    entityIndex: EntityIndex | null;
    onOpenEntityHierarchy: (key: string) => void;
}

type KindFilter = "all" | "regular" | "abstract" | "static";
type SortBy = "name" | "attrs" | "children" | "issues";

interface EnrichedEntity {
    domainId: string;
    entityId: string;
    fqid: string;
    name: string;
    inherits: string | null;
    attributesCount: number;
    childrenCount: number;
    mixinsCount: number;
    isAbstract: boolean;
    isStatic: boolean;
    hasPii: boolean;
    hasIssues: boolean;
    kindLabel: string;
}

export function EntitiesTab({
    node,
    entities,
    entityIndex,
    onOpenEntityHierarchy,
}: EntitiesTabProps) {
    const { index } = useModelIndex();
    const entityFavorites = useGraphStore((s) => s.entityFavorites);

    const [query, setQuery] = useState("");
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [sortBy, setSortBy] = useState<SortBy>("attrs");

    const domainId = node?.data?.domainId || "";
    const domainLower = domainId.toLowerCase();

    // ── Enriched entity list ──
    const allEnriched = useMemo<EnrichedEntity[]>(() => {
        if (!node || !domainId) return [];
        const domainEntities = entities.filter(
            (e) => (e.domainId || "").toLowerCase() === domainLower,
        );
        if (domainEntities.length === 0) return [];

        const modelIndex = index;
        return domainEntities.map((e) => {
            const fqid = `${e.domainId}/${e.entityId}`.toLowerCase();
            const full = modelIndex?.entitiesByFqid[fqid] as
                | FullEntity
                | undefined;
            const children = (entityIndex?.children.get(fqid) || []).length;
            const mixins = modelIndex?.mixinsByEntityFqid[fqid] || [];
            const attrsCount = full ? full.attributes.length : 0;

            const piiHits = modelIndex
                ? modelIndex.pii.hits.filter(
                    (h) => h.entityFqid.toLowerCase() === fqid,
                )
                : [];
            const issues = modelIndex
                ? modelIndex.lint.lintReport.issues.filter(
                    (i) => i.entityFqid?.toLowerCase() === fqid,
                )
                : [];

            const kind = full?.kind || "regular";
            return {
                domainId: e.domainId,
                entityId: e.entityId,
                fqid,
                name: e.name,
                inherits: e.inherits,
                attributesCount: attrsCount,
                childrenCount: children,
                mixinsCount: mixins.length,
                isAbstract: kind === "abstract",
                isStatic: kind === "static",
                hasPii: piiHits.length > 0,
                hasIssues: issues.length > 0,
                kindLabel: kind,
            };
        });
    }, [node, domainId, domainLower, entities, index, entityIndex]);

    // ── Filter + sort ──
    const filtered = useMemo(() => {
        let list = allEnriched;
        if (kindFilter !== "all") {
            list = list.filter((e) => e.kindLabel === kindFilter);
        }
        const q = query.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (e) =>
                    e.entityId.toLowerCase().includes(q) ||
                    e.name.toLowerCase().includes(q),
            );
        }
        const sorted = [...list];
        switch (sortBy) {
            case "name":
                sorted.sort(
                    (a, b) =>
                        a.entityId.localeCompare(b.entityId) ||
                        a.domainId.localeCompare(b.domainId),
                );
                break;
            case "attrs":
                sorted.sort(
                    (a, b) =>
                        b.attributesCount - a.attributesCount ||
                        a.entityId.localeCompare(b.entityId),
                );
                break;
            case "children":
                sorted.sort(
                    (a, b) =>
                        b.childrenCount - a.childrenCount ||
                        a.entityId.localeCompare(b.entityId),
                );
                break;
            case "issues":
                sorted.sort((a, b) => {
                    const ai = (a.hasIssues ? 1 : 0) + (a.hasPii ? 1 : 0);
                    const bi = (b.hasIssues ? 1 : 0) + (b.hasPii ? 1 : 0);
                    return bi - ai || a.entityId.localeCompare(b.entityId);
                });
                break;
        }
        return sorted;
    }, [allEnriched, kindFilter, query, sortBy]);

    // ── Actions ──
    const openInCatalog = useCallback((fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    }, []);

    const openInYaml = useCallback(
        (entityId: string) => {
            const st = useGraphStore.getState();
            const fileNode = st.nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() === domainLower,
            );
            if (fileNode?.data.filePath) {
                import("../../lib/open-file").then(({ openFileInEditor }) => {
                    openFileInEditor(fileNode.data.filePath!, entityId, domainId);
                });
            } else {
                st.showSnackbar("Файл схемы не найден");
            }
        },
        [domainId, domainLower],
    );

    const toggleFavorite = useCallback((fqid: string) => {
        useGraphStore.getState().toggleEntityFavorite(fqid);
    }, []);

    // ── Empty ──
    if (!node || !domainId) {
        return (
            <div className="details">
                <div className="details__empty">
                    <MIcon name="data_object" size="xl" />
                    <div>Выберите домен</div>
                </div>
            </div>
        );
    }

    if (allEnriched.length === 0) {
        return (
            <div className="details">
                <div className="details__empty">
                    <MIcon name="data_object" size="xl" />
                    <div>В домене нет сущностей</div>
                </div>
            </div>
        );
    }

    const totalCount = allEnriched.length;
    const filteredCount = filtered.length;

    const kindCounts = {
        regular: allEnriched.filter((e) => e.kindLabel === "regular").length,
        abstract: allEnriched.filter((e) => e.kindLabel === "abstract").length,
        static: allEnriched.filter((e) => e.kindLabel === "static").length,
    };

    return (
        <div className="entities-tab">
            {/* ── Toolbar ── */}
            <div className="entities-tab__toolbar">
                <div className="entities-tab__search">
                    <MIcon name="search" size="sm" />
                    <input
                        type="text"
                        placeholder="Поиск по id или имени…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            className="entities-tab__search-clear"
                            onClick={() => setQuery("")}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <div className="entities-tab__selects">
                    <select
                        className="entities-tab__select"
                        value={kindFilter}
                        onChange={(e) =>
                            setKindFilter(e.target.value as KindFilter)
                        }
                        title="Тип сущности"
                    >
                        <option value="all">Все ({totalCount})</option>
                        <option value="regular">
                            Обычные ({kindCounts.regular})
                        </option>
                        <option value="abstract">
                            Абстрактные ({kindCounts.abstract})
                        </option>
                        <option value="static">
                            Статические ({kindCounts.static})
                        </option>
                    </select>
                    <select
                        className="entities-tab__select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        title="Сортировка"
                    >
                        <option value="attrs">По атрибутам</option>
                        <option value="children">По наследникам</option>
                        <option value="name">По имени</option>
                        <option value="issues">По проблемам</option>
                    </select>
                </div>
            </div>

            {/* ── Count ── */}
            <div className="entities-tab__count">
                Показано {filteredCount} из {totalCount}
            </div>

            {/* ── List ── */}
            <div className="entities-tab__list">
                {filtered.length === 0 ? (
                    <div className="details__empty">
                        <MIcon name="search_off" size="lg" />
                        <div>Ничего не найдено</div>
                        <button
                            className="btn btn--small"
                            onClick={() => {
                                setQuery("");
                                setKindFilter("all");
                            }}
                        >
                            Сбросить фильтры
                        </button>
                    </div>
                ) : (
                    filtered.map((e) => {
                        const isFav = entityFavorites.has(e.fqid);
                        return (
                            <div
                                key={e.fqid}
                                className={
                                    "entity-row" +
                                    (e.isAbstract
                                        ? " entity-row--abstract"
                                        : "") +
                                    (e.isStatic ? " entity-row--static" : "")
                                }
                                onClick={() => openInCatalog(e.fqid)}
                                title={e.fqid}
                            >
                                <div className="entity-row__main">
                                    <div className="entity-row__id-row">
                                        <span className="entity-row__id">
                                            {e.entityId}
                                        </span>
                                        {e.isAbstract && (
                                            <span className="entity-row__kind-badge entity-row__kind-badge--abstract">
                                                abstract
                                            </span>
                                        )}
                                        {e.isStatic && (
                                            <span className="entity-row__kind-badge entity-row__kind-badge--static">
                                                static
                                            </span>
                                        )}
                                        {e.hasPii && (
                                            <span
                                                className="entity-row__badge entity-row__badge--pii"
                                                title="PII-атрибуты"
                                            >
                                                <MIcon name="shield_lock" size="sm" />
                                            </span>
                                        )}
                                        {e.hasIssues && (
                                            <span
                                                className="entity-row__badge entity-row__badge--issues"
                                                title="Lint issues"
                                            >
                                                <MIcon name="bug_report" size="sm" />
                                            </span>
                                        )}
                                    </div>
                                    {e.name && e.name !== e.entityId && (
                                        <div className="entity-row__name">
                                            {e.name}
                                        </div>
                                    )}
                                    <div className="entity-row__meta">
                                        {e.inherits && (
                                            <span
                                                className="entity-row__inherits"
                                                title={`inherits ${e.inherits}`}
                                            >
                                                <MIcon
                                                    name="arrow_upward"
                                                    size="sm"
                                                />
                                                {e.inherits.split("/")[1]}
                                            </span>
                                        )}
                                        {e.childrenCount > 0 && (
                                            <span
                                                className="entity-row__children"
                                                title="Наследники"
                                            >
                                                <MIcon
                                                    name="account_tree"
                                                    size="sm"
                                                />
                                                {e.childrenCount}
                                            </span>
                                        )}
                                        {e.mixinsCount > 0 && (
                                            <span
                                                className="entity-row__mixins"
                                                title="Миксины"
                                            >
                                                <MIcon name="merge" size="sm" />
                                                {e.mixinsCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="entity-row__attrs">
                                    <div className="entity-row__attrs-value">
                                        {e.attributesCount}
                                    </div>
                                    <div className="entity-row__attrs-label">
                                        атр.
                                    </div>
                                </div>
                                <div className="entity-row__actions">
                                    <button
                                        className={
                                            "entity-row__action" +
                                            (isFav ? " active" : "")
                                        }
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            toggleFavorite(e.fqid);
                                        }}
                                        title={
                                            isFav
                                                ? "Убрать из избранного"
                                                : "В избранное"
                                        }
                                    >
                                        <MIcon
                                            name={isFav ? "star" : "star_border"}
                                            size="sm"
                                            fill={isFav}
                                        />
                                    </button>
                                    <button
                                        className="entity-row__action"
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            openInYaml(e.entityId);
                                        }}
                                        title="Открыть в YAML"
                                    >
                                        <MIcon name="description" size="sm" />
                                    </button>
                                    <button
                                        className="entity-row__action"
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            onOpenEntityHierarchy(e.fqid);
                                        }}
                                        title="Иерархия"
                                    >
                                        <MIcon name="account_tree" size="sm" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}