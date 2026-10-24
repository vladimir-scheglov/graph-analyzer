import React from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { MIcon } from "../common/MIcon";
import { openFileInEditor } from "../../lib/open-file";
import { plural, relativeTimeShort } from "../../lib/format";
import type { EntityRecord } from "../../../shared/model-types";

export interface DomainListRowProps {
    node: any;
    isSelected: boolean;
    isFavorite: boolean;
    isFocused: boolean;
    entityMatches?: EntityRecord[];
    onSelect: (nodeId: string, domainId: string) => void;
}

export function DomainListRow({
    node,
    isSelected,
    isFavorite,
    isFocused,
    entityMatches,
    onSelect,
}: DomainListRowProps) {
    const d = node.data;
    const isProblematic = d.nodeType !== "domain";

    const handleSchema = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isProblematic) return;
        const st = useGraphStore.getState();
        st.setDomainSchemaDomainId(d.domainId);
        st.setDomainSchemaOpen(true);
    };

    const handleFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!d.filePath) return;
        openFileInEditor(d.filePath, null, d.domainId);
    };

    const handleGraph = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isProblematic) return;
        const st = useGraphStore.getState();
        st.setViewMode("graph");
        setTimeout(() => {
            const nav = useGraphStore.getState();
            if (!nav.rfInstance) return;
            const target = nav.nodes.find((n: any) => n.id === node.id);
            if (!target) return;
            nav.pushNav(d.domainId);
            nav.setSelectedNodeId(node.id);
            nav.setFocusNode(node.id);
            try {
                nav.rfInstance.setCenter(
                    target.position.x + 150,
                    target.position.y + 44,
                    { zoom: 1.2, duration: 500 },
                );
            } catch { }
        }, 350);
    };

    const handleToggleFav = (e: React.MouseEvent) => {
        e.stopPropagation();
        useGraphStore.getState().toggleBookmark(node.id);
    };

    const className = [
        "domain-list-row",
        isSelected ? "domain-list-row--selected" : "",
        isFocused ? "domain-list-row--focused" : "",
        isProblematic ? "domain-list-row--problematic" : "",
        isFavorite ? "domain-list-row--fav" : "",
    ]
        .filter(Boolean)
        .join(" ");

    const openEntityInCatalog = (e: React.MouseEvent, fqid: string) => {
        e.stopPropagation();
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };    

    return (
        <div
            className={className}
            onClick={() => !isProblematic && onSelect(node.id, d.domainId)}
            title={d.description || undefined}
            data-node-id={node.id}
        >
            <div className="domain-list-row__star">
                {isFavorite && <MIcon name="star" size="sm" fill />}
            </div>
            <div className="domain-list-row__main">
                <div className="domain-list-row__name">
                    {d.name || d.domainId}
                    {isProblematic && (
                        <span
                            className={
                                "domain-list-row__badge domain-list-row__badge--" + d.nodeType
                            }
                        >
                            {d.nodeType === "missing" ? "missing" : "broken"}
                        </span>
                    )}
                </div>
                <div className="domain-list-row__id-row">
                    <span className="domain-list-row__id">{d.domainId}</span>
                    {d.updatedAt && (
                        <span
                            className="domain-list-row__updated"
                            title={
                                d.updatedAt
                                    ? new Date(d.updatedAt).toLocaleString("ru-RU")
                                    : ""
                            }
                        >
                            <MIcon name="schedule" size="sm" />
                            {relativeTimeShort(d.updatedAt)}
                        </span>
                    )}
                </div>
                {d.description && (
                    <div
                        className="domain-list-row__description"
                        title={d.description}
                    >
                        {d.description}
                    </div>
                )}
                {entityMatches && entityMatches.length > 0 && (
                    <div className="domain-list-row__entity-matches">
                        <MIcon name="data_object" size="sm" />
                        {entityMatches.slice(0, 5).map((e) => (
                            <button
                                key={e.fqid}
                                type="button"
                                className="domain-list-row__entity-chip"
                                onClick={(ev) => openEntityInCatalog(ev, e.fqid)}
                                title={`Открыть «${e.entityId}» в каталоге сущностей`}
                            >
                                {e.entityId}
                            </button>
                        ))}
                        {entityMatches.length > 5 && (
                            <span
                                className="domain-list-row__entity-chip domain-list-row__entity-chip--more"
                                title={entityMatches
                                    .slice(5)
                                    .map((e) => e.entityId)
                                    .join(", ")}
                            >
                                +{entityMatches.length - 5}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="domain-list-row__meta">
                {d.author && (
                    <div
                        className="domain-list-row__author"
                        title={`Автор: ${d.author}`}
                    >
                        <MIcon name="person" size="sm" />
                        <span>{d.author}</span>
                    </div>
                )}
                {d.tags && d.tags.length > 0 && (
                    <div className="domain-list-row__tags">
                        {d.tags.slice(0, 2).map((t: string) => (
                            <span key={t} className="domain-list-row__tag">
                                {t}
                            </span>
                        ))}
                        {d.tags.length > 2 && (
                            <span className="domain-list-row__tag">
                                +{d.tags.length - 2}
                            </span>
                        )}
                    </div>
                )}
                {d.entitiesCount != null && !isProblematic && (
                    <div className="domain-list-row__entities">
                        {d.entitiesCount}{" "}
                        {plural(d.entitiesCount, "сущность", "сущностей")}
                    </div>
                )}
            </div>
            <div className="domain-list-row__version">
                {d.version ? `v${d.version}` : ""}
            </div>
            <div className="domain-list-row__actions">
                {!isProblematic && (
                    <>
                        <button onClick={handleSchema} title="Схема домена">
                            <MIcon name="menu_book" size="sm" />
                        </button>
                        {d.filePath && (
                            <button onClick={handleFile} title="Открыть файл">
                                <MIcon name="description" size="sm" />
                            </button>
                        )}
                        <button onClick={handleGraph} title="Показать на графе">
                            <MIcon name="my_location" size="sm" />
                        </button>

                        <button
                            onClick={handleToggleFav}
                            title={isFavorite ? "Убрать из избранного" : "В избранное"}
                            className={"domain-list-row__fav-btn" + (isFavorite ? " active" : "")}
                        >
                            <MIcon
                                name={isFavorite ? "star" : "star_border"}
                                size="sm"
                                fill={isFavorite}
                            />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}