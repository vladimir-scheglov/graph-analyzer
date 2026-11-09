import React from "react";
import { useNavigation } from "../../hooks/useNavigation";
import { useGraphStore } from "../../state/useGraphStore";
import { MIcon } from "../common/MIcon";
import { PinButton } from "../annotations/PinButton";

export interface EdgeTabProps {
    edge: any;
    allNodes: any[];
}

const KIND_META: Record<string, { label: string; icon: string; color: string }> = {
    linkage: { label: "Linkage", icon: "link", color: "#10b981" },
    fqid: { label: "FQID-ссылка", icon: "call_made", color: "#4b7c6c" },
    aggregated: {
        label: "Агрегированное",
        icon: "hub",
        color: "var(--text-500)",
    },
};

export function EdgeTab({ edge, allNodes }: EdgeTabProps) {
    const { goto } = useNavigation();
    const setEntityCatalogInitialFqid = useGraphStore(
        (s) => s.setEntityCatalogInitialFqid,
    );
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const setDomainSchemaDomainId = useGraphStore(
        (s) => s.setDomainSchemaDomainId,
    );
    const setDomainSchemaOpen = useGraphStore((s) => s.setDomainSchemaOpen);
    const setDomainSchemaPrefillQuery = useGraphStore((s) => s.setDomainSchemaPrefillQuery);

    if (!edge) {
        return (
            <div className="details">
                <div className="details__empty">
                    <MIcon name="touch_app" size="xl" />
                    <div>Выберите связь на графе</div>
                </div>
            </div>
        );
    }

    const data = edge.data || {};
    const link = data.linkData || {};
    const refs = data.fqidRefs || [];
    const kind: string = data.kind || "fqid";
    const kindMeta = KIND_META[kind] || KIND_META.fqid;

    const fullLabel = data.fullLabel || edge.label || edge.id;
    const srcNode = allNodes.find((n) => n.id === edge.source);
    const tgtNode = allNodes.find((n) => n.id === edge.target);

    const isBidirectional = data.isBidirectional === true;
    const refCount = data.refCount;

    const side1Text = link.nameFrom?.side1 || link.sourceEntity || null;
    const side2Text = link.nameFrom?.side2 || link.targetEntity || null;
    const side1Domain = data.side1Domain;
    const side2Domain = data.side2Domain;

    const openLinkageInSchema = () => {
        if (!link.domainId) return;
        setDomainSchemaDomainId(link.domainId);
        setDomainSchemaPrefillQuery?.(link.originalId);
        setDomainSchemaOpen(true);
    };

    return (
        <div className="edge-tab">
            {/* ── Kind badge ── */}
            <div className="edge-tab__kind-strip">
                <span
                    className="edge-tab__kind-badge"
                    style={{
                        background: kindMeta.color + "22",
                        color: kindMeta.color,
                        borderColor: kindMeta.color + "55",
                    }}
                >
                    <MIcon name={kindMeta.icon} size="sm" />
                    {kindMeta.label}
                </span>
                {isBidirectional && (
                    <span className="edge-tab__badge">⇄ двунаправленная</span>
                )}
                {refCount != null && refCount > 1 && (
                    <span className="edge-tab__badge">{refCount} refs</span>
                )}
                {link.type && (
                    <span className="edge-tab__badge">{link.type}</span>
                )}
                {link.undirected && (
                    <span className="edge-tab__badge">ненаправленная</span>
                )}
            </div>

            <PinButton
                target={`edge:${edge.id}`}
                domainId={link.domainId}
                kind="edge"
                label={fullLabel}
            />

            {/* ── Title ── */}
            <div className="edge-tab__title">{fullLabel}</div>
            {link.originalId && (
                <div className="edge-tab__subtitle">
                    <code>{link.originalId}</code>
                </div>
            )}

            {/* ── Actions ── */}
            <div className="edge-tab__actions">
                {link.domainId && kind === "linkage" && (
                    <button
                        className="btn btn--primary btn--small"
                        onClick={openLinkageInSchema}
                        title="Открыть linkage в схеме домена"
                    >
                        <MIcon name="menu_book" size="sm" />
                        Схема
                    </button>
                )}
                {srcNode && (
                    <button
                        className="btn btn--small"
                        onClick={() => goto(srcNode.data.domainId)}
                    >
                        <MIcon name="arrow_back" size="sm" />
                        К источнику
                    </button>
                )}
                {tgtNode && (
                    <button
                        className="btn btn--small"
                        onClick={() => goto(tgtNode.data.domainId)}
                    >
                        <MIcon name="arrow_forward" size="sm" />
                        К цели
                    </button>
                )}
                <button
                    className="btn btn--icon btn--small"
                    onClick={() => {
                        const text = link.originalId || edge.id;
                        navigator.clipboard
                            .writeText(text)
                            .then(() =>
                                useGraphStore
                                    .getState()
                                    .showSnackbar("ID скопирован"),
                            )
                            .catch(() => { });
                    }}
                    title="Копировать ID"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>

            {/* ── Sides ── */}
            <div className="edge-tab__sides">
                <SideCard
                    label="Сторона 1"
                    node={srcNode}
                    entityText={side1Text}
                    domainText={side1Domain}
                    onGotoDomain={() =>
                        srcNode && goto(srcNode.data.domainId)
                    }
                    onOpenEntity={(fqid) => {
                        setEntityCatalogInitialFqid(fqid);
                        setEntityCatalogOpen(true);
                    }}
                />
                <div className="edge-tab__sides-arrow">
                    <MIcon
                        name={link.undirected ? "swap_horiz" : "arrow_forward"}
                        size="sm"
                    />
                </div>
                <SideCard
                    label="Сторона 2"
                    node={tgtNode}
                    entityText={side2Text}
                    domainText={side2Domain}
                    onGotoDomain={() =>
                        tgtNode && goto(tgtNode.data.domainId)
                    }
                    onOpenEntity={(fqid) => {
                        setEntityCatalogInitialFqid(fqid);
                        setEntityCatalogOpen(true);
                    }}
                />
            </div>

            {/* ── Linkage meta ── */}
            {kind === "linkage" && (link.type || link.nameFrom || link.undirected) && (
                <div className="edge-tab__section">
                    <div className="edge-tab__section-title">Метаданные связи</div>
                    <div className="edge-tab__rows">
                        {link.type && (
                            <div className="edge-tab__row">
                                <span className="edge-tab__row-label">Тип</span>
                                <code>{link.type}</code>
                            </div>
                        )}
                        {link.domainId && (
                            <div className="edge-tab__row">
                                <span className="edge-tab__row-label">Домен</span>
                                <button
                                    className="edge-tab__link"
                                    onClick={() => {
                                        setDomainSchemaDomainId(link.domainId);
                                        setDomainSchemaOpen(true);
                                    }}
                                >
                                    {link.domainId}
                                </button>
                            </div>
                        )}
                        {link.nameFrom?.side1 && (
                            <div className="edge-tab__row">
                                <span className="edge-tab__row-label">
                                    Сторона 1 →
                                </span>
                                <span>{link.nameFrom.side1}</span>
                            </div>
                        )}
                        {link.nameFrom?.side2 && (
                            <div className="edge-tab__row">
                                <span className="edge-tab__row-label">
                                    Сторона 2 →
                                </span>
                                <span>{link.nameFrom.side2}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── FQID refs ── */}
            {refs.length > 0 && (
                <div className="edge-tab__section">
                    <div className="edge-tab__section-title">
                        FQID-ссылки ({refs.length})
                    </div>
                    <div className="edge-tab__refs">
                        {refs.slice(0, 50).map((r: any, i: number) => (
                            <div
                                key={i}
                                className="edge-tab__ref"
                                onClick={() =>
                                    r.targetDomainId && goto(r.targetDomainId)
                                }
                                title={`Перейти к ${r.targetDomainId}`}
                            >
                                <div className="edge-tab__ref-main">
                                    <MIcon name="link" size="sm" />
                                    <code>{r.fullFQID}</code>
                                </div>
                                <div className="edge-tab__ref-path">
                                    {r.propertyPath}
                                </div>
                            </div>
                        ))}
                        {refs.length > 50 && (
                            <div className="edge-tab__ref-more">
                                …и ещё {refs.length - 50}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Edge id ── */}
            <div className="edge-tab__footer">
                <span className="edge-tab__footer-label">ID</span>
                <code className="edge-tab__footer-id">{edge.id}</code>
            </div>
        </div>
    );
}

// ============ SideCard ============

function SideCard({
    label,
    node,
    entityText,
    domainText,
    onGotoDomain,
    onOpenEntity,
}: {
    label: string;
    node: any;
    entityText: string | null;
    domainText: string | null;
    onGotoDomain: () => void;
    onOpenEntity: (fqid: string) => void;
}) {
    const domainId = node?.data?.domainId || domainText;
    return (
        <div className="edge-tab__side">
            <div className="edge-tab__side-label">{label}</div>
            {domainId ? (
                <button
                    className="edge-tab__side-domain"
                    onClick={onGotoDomain}
                    title="Перейти к домену"
                >
                    <MIcon name="folder" size="sm" />
                    {domainId}
                </button>
            ) : (
                <div className="edge-tab__side-domain edge-tab__side-domain--muted">
                    —
                </div>
            )}
            {entityText && (
                <div className="edge-tab__side-entity" title={entityText}>
                    {entityText}
                </div>
            )}
        </div>
    );
}