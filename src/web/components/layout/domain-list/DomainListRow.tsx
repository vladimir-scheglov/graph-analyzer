import React, { useEffect, useState } from "react";
import { useGraphStore } from "../../../state/useGraphStore";
import { MIcon } from "../../common/MIcon";
import { openFileInEditor } from "../../../lib/open-file";
import { plural, relativeTimeShort } from "../../../lib/format";
import type { EnrichedDomain } from "./types";
import { annotationsStore } from "../../../lib/storage/annotations";

export interface DomainListRowProps {
    domain: EnrichedDomain;
    isActive: boolean;
    isFocused: boolean;
    compact: boolean;
    onSelect: () => void;
}

export const DomainListRow = React.memo(function DomainListRow({
    domain,
    isActive,
    isFocused,
    compact,
    onSelect,
}: DomainListRowProps) {
    const d = domain;
    const isProblematic = d.node.data.nodeType !== "domain";
    const isDisabled = d.statusNormalized === "disabled";
    const staleCount = useGraphStore((s) => s.freshnessMap.get(d.domainId));

    // Badge «📌 N»: загружаем один раз на mount домена. Обновление — при
    // следующем mount (переключение фильтра, перезагрузка страницы).
    // Подписки на событие «annotations-changed» в annotationsStore нет —
    // если добавишь, обнови и здесь.
    const [annCount, setAnnCount] = useState(0);
    useEffect(() => {
        let cancelled = false;

        const load = () => {
            annotationsStore
                .list()
                .then((list) => {
                    if (cancelled) return;
                    const cnt = list.filter(
                        (a) => a.domainId === d.domainId && !a.resolvedAt,
                    ).length;
                    setAnnCount(cnt);
                })
                .catch(() => { });
        };

        load();
        const unsub = annotationsStore.subscribe(load);

        return () => {
            cancelled = true;
            unsub();
        };
    }, [d.domainId]);

    const openSchema = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isProblematic) return;
        const st = useGraphStore.getState();
        st.setDomainSchemaDomainId(d.domainId);
        st.setDomainSchemaOpen(true);
    };
    const openFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!d.filePath) return;
        openFileInEditor(d.filePath, null, d.domainId);
    };
    const openGraph = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isProblematic) return;
        const st = useGraphStore.getState();
        st.setViewMode("graph");
        setTimeout(() => {
            const nav = useGraphStore.getState();
            if (!nav.rfInstance) return;
            const target = nav.nodes.find((n: any) => n.id === d.node.id);
            if (!target) return;
            nav.pushNav(d.domainId);
            nav.setSelectedNodeId(d.node.id);
            nav.setFocusNode(d.node.id);
            try {
                nav.rfInstance.setCenter(
                    target.position.x + 150,
                    target.position.y + 44,
                    { zoom: 1.2, duration: 500 },
                );
            } catch { /* ignore */ }
        }, 350);
    };
    const toggleFav = (e: React.MouseEvent) => {
        e.stopPropagation();
        useGraphStore.getState().toggleBookmark(d.node.id);
    };

    const openEntityInCatalog = (e: React.MouseEvent, fqid: string) => {
        e.stopPropagation();
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const cls = [
        "domain-list-row",
        isActive ? "domain-list-row--active" : "",
        isFocused ? "domain-list-row--focused" : "",
        isProblematic ? "domain-list-row--problematic" : "",
        d.isFavorite ? "domain-list-row--fav" : "",
        isDisabled ? "domain-list-row--disabled" : "",
        compact ? "domain-list-row--compact" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            className={cls}
            onClick={() => !isProblematic && onSelect()}
            title={d.description || undefined}
            data-node-id={d.node.id}
        >
            <div className="domain-list-row__star">
                {d.isFavorite && <MIcon name="star" size="sm" fill />}
            </div>
            <div className="domain-list-row__main">
                <div className="domain-list-row__name-row">
                    <span className="domain-list-row__name">
                        {d.name || d.domainId}
                    </span>
                    {isProblematic && (
                        <span
                            className={
                                "domain-list-row__kind-badge domain-list-row__kind-badge--" +
                                d.node.data.nodeType
                            }
                        >
                            {d.node.data.nodeType === "missing" ? "missing" : "broken"}
                        </span>
                    )}
                    {d.hasDraft && (
                        <button
                            type="button"
                            className="domain-list-row__badge domain-list-row__badge--draft"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (d.filePath) {
                                    openFileInEditor(d.filePath, null, d.domainId);
                                }
                            }}
                            title="Есть черновик — открыть редактор"
                        >
                            <MIcon name="edit_note" size="sm" />
                        </button>
                    )}
                    {d.status && (
                        <span
                            className={
                                "domain-list-row__kind-badge domain-list-row__kind-badge--" +
                                d.statusNormalized
                            }
                            title={
                                isDisabled ? "Домен выключен" : "Домен включён"
                            }
                        >
                            {isDisabled ? "OFF" : "ON"}
                        </span>
                    )}
                    {annCount > 0 && (
                        <span
                            className="domain-list-row__badge domain-list-row__badge--annotation"
                            title={`${annCount} открытых TODO-заметок`}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                            }}
                        >
                            📌 {annCount}
                        </span>
                    )}
                    {staleCount && (
                        <span className="badge badge--warn" title={`${staleCount} ссылок устарели`}>
                            ↻ {staleCount}
                        </span>
                    )}
                </div>
                <div className="domain-list-row__id-row">
                    <code className="domain-list-row__id">{d.domainId}</code>
                    {d.updatedAt && (
                        <span
                            className="domain-list-row__updated"
                            title={new Date(d.updatedAt).toLocaleString("ru-RU")}
                        >
                            <MIcon name="schedule" size="sm" />
                            {relativeTimeShort(d.updatedAt)}
                        </span>
                    )}
                </div>
                {!compact && d.description && (
                    <div className="domain-list-row__description" title={d.description}>
                        {d.description}
                    </div>
                )}
                {d.entityMatches && d.entityMatches.length > 0 && (
                    <div className="domain-list-row__entity-matches">
                        <MIcon name="data_object" size="sm" />
                        {d.entityMatches.slice(0, 4).map((e) => (
                            <button
                                key={e.fqid}
                                type="button"
                                className="domain-list-row__entity-chip"
                                onClick={(ev) => openEntityInCatalog(ev, e.fqid)}
                                title={`Открыть «${e.entityId}»`}
                            >
                                {e.entityId}
                            </button>
                        ))}
                        {d.entityMatches.length > 4 && (
                            <span
                                className="domain-list-row__entity-chip domain-list-row__entity-chip--more"
                                title={d.entityMatches.slice(4).map((e) => e.entityId).join(", ")}
                            >
                                +{d.entityMatches.length - 4}
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="domain-list-row__meta">
                {d.health != null && (
                    <span
                        className={
                            "domain-list-row__health domain-list-row__health--" +
                            d.healthLevel
                        }
                        title={`Health ${d.health}/100`}
                    >
                        {d.health}
                    </span>
                )}
                {d.isInvalid && (
                    <span
                        className="domain-list-row__flag domain-list-row__flag--err"
                        title="Невалидный"
                    >
                        <MIcon name="cancel" size="sm" />
                    </span>
                )}
                {d.lintErrors > 0 && (
                    <span
                        className="domain-list-row__flag domain-list-row__flag--err"
                        title={`${d.lintErrors} lint errors`}
                    >
                        <MIcon name="error" size="sm" />
                        {d.lintErrors}
                    </span>
                )}
                {d.piiCritical > 0 && (
                    <span
                        className="domain-list-row__flag domain-list-row__flag--warn"
                        title={`${d.piiCritical} PII critical`}
                    >
                        <MIcon name="shield_lock" size="sm" />
                        {d.piiCritical}
                    </span>
                )}
                {d.author && (
                    <div className="domain-list-row__author" title={`Автор: ${d.author}`}>
                        <MIcon name="person" size="sm" />
                        <span>{d.author}</span>
                    </div>
                )}
                {!compact && d.tags.length > 0 && (
                    <div className="domain-list-row__tags">
                        {d.tags.slice(0, 2).map((t) => (
                            <span key={t} className="domain-list-row__tag">
                                {t}
                            </span>
                        ))}
                        {d.tags.length > 2 && (
                            <span
                                className="domain-list-row__tag"
                                title={d.tags.slice(2).join(", ")}
                            >
                                +{d.tags.length - 2}
                            </span>
                        )}
                    </div>
                )}
                {d.entitiesCount != null && !isProblematic && (
                    <div className="domain-list-row__entities">
                        {d.entitiesCount}
                        {!compact && " " + plural(d.entitiesCount, "сущность", "сущностей")}
                    </div>
                )}
            </div>
            {d.version && !compact && (
                <div className="domain-list-row__version">v{d.version}</div>
            )}
            <div className="domain-list-row__actions">
                {!isProblematic && (
                    <>
                        <button onClick={openSchema} title="Схема домена">
                            <MIcon name="menu_book" size="sm" />
                        </button>
                        {d.filePath && (
                            <button onClick={openFile} title="Открыть файл">
                                <MIcon name="description" size="sm" />
                            </button>
                        )}
                        <button onClick={openGraph} title="Показать на графе">
                            <MIcon name="my_location" size="sm" />
                        </button>
                        <button
                            onClick={toggleFav}
                            title={d.isFavorite ? "Убрать из избранного" : "В избранное"}
                            className={
                                "domain-list-row__fav-btn" + (d.isFavorite ? " active" : "")
                            }
                        >
                            <MIcon
                                name={d.isFavorite ? "star" : "star_border"}
                                size="sm"
                                fill={d.isFavorite}
                            />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                useGraphStore.getState().setDeleteDomainTarget({
                                    domainId: d.domainId,
                                });
                            }}
                            title="Удалить домен"
                            className="domain-list-row__delete-btn"
                        >
                            <MIcon name="delete" size="sm" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
});