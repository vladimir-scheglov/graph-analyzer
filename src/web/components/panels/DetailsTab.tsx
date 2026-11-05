import React, { useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useNavigation } from "../../hooks/useNavigation";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import { CollapsibleSection } from "./CollapsibleSection";
import { formatDate, sourceIcon, sourceLabel, sourceColor } from "../../lib/format";
import { readRemoteInfo } from "../../state/initial";
import { DomainMixinsPanel } from "./DomainMixinsPanel";
import { openFileInEditor } from "../../lib/open-file";
import { DomainSonarPanel } from "./DomainSonarPanel";
import type { RFNode, RFEdge, FQIDRef } from "../../lib/types";

export interface DetailsTabProps {
    node: RFNode | null;
    allNodes: RFNode[];
    allEdges: RFEdge[];
    ruleViolations: any[];
}

// ============ Health helper ============

function healthClass(score: number): "good" | "mid" | "bad" {
    if (score >= 80) return "good";
    if (score >= 50) return "mid";
    return "bad";
}

// ============ Metric tile ============

function MetricTile({
    icon,
    label,
    value,
    onClick,
}: {
    icon: string;
    label: string;
    value: number;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            className={
                "details-metric" + (onClick ? " details-metric--clickable" : "")
            }
            onClick={onClick}
            disabled={!onClick}
        >
            <MIcon name={icon} size="sm" />
            <div className="details-metric__value">{value}</div>
            <div className="details-metric__label">{label}</div>
        </button>
    );
}

// ============ Ref group ============

function KindGroupTitle({
    kind,
    count,
}: {
    kind: string;
    count: number;
}) {
    const meta =
        kind === "linkage"
            ? { icon: "link", label: "Linkage", color: "#10b981" }
            : kind === "fqid"
                ? { icon: "call_made", label: "FQID", color: "#4b7c6c" }
                : { icon: "arrow_forward", label: kind, color: "var(--text-500)" };
    return (
        <div className="details-ref-group__head">
            <MIcon name={meta.icon} size="sm" style={{ color: meta.color }} />
            <span className="details-ref-group__title" style={{ color: meta.color }}>
                {meta.label}
            </span>
            <span className="details-ref-group__count">{count}</span>
        </div>
    );
}

// ============ Main ============

export function DetailsTab({
    node,
    allNodes,
    allEdges,
    ruleViolations,
}: DetailsTabProps) {
    const { goto } = useNavigation();
    const { index } = useModelIndex();
    const setDomainSchemaDomainId = useGraphStore((s) => s.setDomainSchemaDomainId);
    const setDomainSchemaOpen = useGraphStore((s) => s.setDomainSchemaOpen);
    const setEntityCatalogInitialFqid = useGraphStore(
        (s) => s.setEntityCatalogInitialFqid,
    );
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const setLintOpen = useGraphStore((s) => s.setLintOpen);
    const setPiiOpen = useGraphStore((s) => s.setPiiOpen);
    const setHealthDashboardOpen = useGraphStore(
        (s) => s.setHealthDashboardOpen,
    );
    const setDeletionSimulationFqid = useGraphStore(
        (s) => s.setDeletionSimulationFqid,
    );
    const setDeletionSimulationOpen = useGraphStore(
        (s) => s.setDeletionSimulationOpen,
    );

    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const [fqidQuery, setFqidQuery] = useState("");

    if (!node) {
        return (
            <div className="details">
                <div className="details__empty">
                    <MIcon name="touch_app" size="xl" />
                    <div>Выберите узел на графе или в списке</div>
                </div>
            </div>
        );
    }

    const d = node.data;
    const isDomain = d.nodeType === "domain";
    const domainId = d.domainId;
    const domainLower = domainId.toLowerCase();

    // ============ Data ============
    const incoming = useMemo(
        () => allEdges.filter((e) => e.target === node.id),
        [allEdges, node.id],
    );
    const outgoing = useMemo(
        () => allEdges.filter((e) => e.source === node.id),
        [allEdges, node.id],
    );
    const refs: FQIDRef[] = d.fqidRefs || [];

    // ============ Domain metrics from model index ============
    const metrics = useMemo(() => {
        if (!index || !isDomain) return null;
        const domainEntities = index.entities.filter(
            (e) => e.domainId === domainId,
        );
        const attributeCount = domainEntities.reduce((s, e) => {
            let c = e.attributes.length;
            for (const a of e.attributes) {
                if (a.nestedAttributes) c += a.nestedAttributes.length;
            }
            return s + c;
        }, 0);
        const linkageCount = index.entityLinkages.filter(
            (l) => l.domainId === domainId,
        ).length;
        const schema = index.schemasByDomain[domainId];
        return {
            entities: domainEntities.length,
            attributes: attributeCount,
            linkages: linkageCount,
            views: schema?.sections.views.count ?? 0,
            actions: schema?.sections.actions.count ?? 0,
            dataTypes: index.dataTypes.filter(
                (dt) => dt.domainId === domainId,
            ).length,
        };
    }, [index, domainId, isDomain]);

    // ============ Health ============
    const health = d.health as number | null | undefined;
    const healthBreakdown = (d.healthBreakdown || []) as Array<{
        reason: string;
        delta: number;
    }>;
    const hc = health != null ? healthClass(health) : null;

    // ============ Validation / lint ============
    const validationResults = useGraphStore((s) => s.validationResults);
    const validation =
        validationResults && isDomain
            ? validationResults.get(domainId)
            : null;
    const validationDiagnostics = validation?.diagnostics ?? [];

    const domainLintIssues = useMemo(() => {
        if (!index || !isDomain) return [];
        return index.lint.lintReport.issues.filter(
            (i) => i.domainId === domainId,
        );
    }, [index, domainId, isDomain]);

    const domainPii = useMemo(() => {
        if (!index || !isDomain) return [];
        return index.pii.hits.filter((h) =>
            h.entityFqid.toLowerCase().startsWith(domainLower + "/"),
        );
    }, [index, domainLower, isDomain]);

    // ============ Refs / edges ============
    const filteredRefs = useMemo(() => {
        const q = fqidQuery.trim().toLowerCase();
        if (!q) return refs;
        return refs.filter(
            (r) =>
                r.fullFQID.toLowerCase().includes(q) ||
                (r.targetDomainId || "").toLowerCase().includes(q) ||
                r.propertyPath.toLowerCase().includes(q),
        );
    }, [refs, fqidQuery]);

    const incomingByKind = useMemo(() => {
        const m = new Map<string, RFEdge[]>();
        for (const e of incoming) {
            const k = e.data?.kind || "fqid";
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(e);
        }
        return Array.from(m.entries()).sort(
            (a, b) => b[1].length - a[1].length,
        );
    }, [incoming]);

    const outgoingByKind = useMemo(() => {
        const m = new Map<string, RFEdge[]>();
        for (const e of outgoing) {
            const k = e.data?.kind || "fqid";
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(e);
        }
        return Array.from(m.entries()).sort(
            (a, b) => b[1].length - a[1].length,
        );
    }, [outgoing]);

    // ============ Problem count for a highlight card ============
    const totalProblems =
        domainLintIssues.length +
        validationDiagnostics.length +
        ruleViolations.length;
    const problemSeverity: "error" | "warning" | "info" | null =
        domainLintIssues.some((i) => i.severity === "error") ||
            validationDiagnostics.some((x) => x.severity === "ERROR")
            ? "error"
            : totalProblems > 0
                ? "warning"
                : null;

    // ============ Actions ============
    const openSchema = () => {
        setDomainSchemaDomainId(domainId);
        setDomainSchemaOpen(true);
    };
    const openFile = () => {
        if (d.filePath) {
            openFileInEditor(d.filePath, null, domainId);
        }
    };
    const openCatalog = () => {
        setEntityCatalogInitialFqid(null);
        setEntityCatalogOpen(true);
    };
    const openDeletionSim = () => {
        setDeletionSimulationFqid(null);
        setDeletionSimulationOpen(true);
    };

    return (
        <div className="details details--v2">
            {/* ── Metrics ── */}
            {metrics && (
                <div className="details-metrics-grid">
                    <MetricTile
                        icon="data_object"
                        label="сущ."
                        value={metrics.entities}
                        onClick={openCatalog}
                    />
                    <MetricTile
                        icon="edit_note"
                        label="атр."
                        value={metrics.attributes}
                        onClick={openSchema}
                    />
                    <MetricTile
                        icon="link"
                        label="связи"
                        value={metrics.linkages}
                        onClick={openSchema}
                    />
                    <MetricTile
                        icon="view_quilt"
                        label="views"
                        value={metrics.views}
                        onClick={openSchema}
                    />
                    <MetricTile
                        icon="bolt"
                        label="actions"
                        value={metrics.actions}
                        onClick={openSchema}
                    />
                    <MetricTile
                        icon="category"
                        label="типы"
                        value={metrics.dataTypes}
                        onClick={openSchema}
                    />
                </div>
            )}

            {/* ── Quick actions ── */}
            {isDomain && (
                <div className="details-actions-strip">
                    <button
                        className="btn btn--primary btn--small"
                        onClick={openSchema}
                        title="Открыть схему домена"
                    >
                        <MIcon name="menu_book" size="sm" />
                        Схема
                    </button>
                    {d.filePath && (
                        <button
                            className="btn btn--small"
                            onClick={openFile}
                            title="Открыть YAML"
                        >
                            <MIcon name="description" size="sm" />
                            YAML
                        </button>
                    )}
                    <button
                        className="btn btn--small"
                        onClick={openCatalog}
                        title="Каталог сущностей"
                    >
                        <MIcon name="category" size="sm" />
                        Каталог
                    </button>
                    <button
                        className="btn btn--small"
                        onClick={() => setHealthDashboardOpen(true)}
                        title="Health Dashboard"
                    >
                        <MIcon name="dashboard" size="sm" />
                    </button>
                </div>
            )}

            {/* ── Status badges ── */}
            <div className="details-status-row">
                <span className={"details__badge details__badge--" + d.nodeType}>
                    {d.nodeType}
                </span>
                {d.version && (
                    <span className="details__badge">v{d.version}</span>
                )}
                {d.hasDraft === true && (
                    <span className="details__badge details__badge--draft">
                        <MIcon name="edit_note" size="sm" />
                        черновик
                    </span>
                )}
                {d.status && (
                    <span
                        className={
                            "details__badge details__badge--" +
                            (d.status === "DISABLED" ? "disabled" : "enabled")
                        }
                    >
                        {d.status === "DISABLED" ? "выключен" : "включён"}
                    </span>
                )}
                {hc && health != null && (
                    <span
                        className={
                            "details__badge details__badge--health-" + hc
                        }
                        title={healthBreakdown
                            .map((b) => `${b.reason}: ${b.delta}`)
                            .join("\n")}
                    >
                        <MIcon name="favorite" size="sm" />
                        Health {health}
                    </span>
                )}
            </div>

            {/* ── Problems card ── */}
            {isDomain && totalProblems > 0 && (
                <div
                    className={
                        "details-problems-card details-problems-card--" +
                        (problemSeverity || "warning")
                    }
                >
                    <div className="details-problems-card__head">
                        <MIcon
                            name={
                                problemSeverity === "error" ? "error" : "warning"
                            }
                            size="sm"
                        />
                        <span className="details-problems-card__title">
                            Проблемы: {totalProblems}
                        </span>
                    </div>
                    <div className="details-problems-card__stats">
                        {domainLintIssues.length > 0 && (
                            <button
                                className="details-problems-card__stat"
                                onClick={() => setLintOpen(true)}
                            >
                                <MIcon name="rule" size="sm" />
                                <span>Линтер: {domainLintIssues.length}</span>
                            </button>
                        )}
                        {validationDiagnostics.length > 0 && (
                            <button
                                className="details-problems-card__stat"
                                onClick={() => useGraphStore.getState().setValidationOpen(true)}
                            >
                                <MIcon name="cloud_upload" size="sm" />
                                <span>Сервер: {validationDiagnostics.length}</span>
                            </button>
                        )}
                        {ruleViolations.length > 0 && (
                            <button
                                className="details-problems-card__stat"
                                onClick={() => useGraphStore.getState().setRulesOpen(true)}
                            >
                                <MIcon name="block" size="sm" />
                                <span>Правила: {ruleViolations.length}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── PII card ── */}
            {isDomain && domainPii.length > 0 && (
                <button
                    className="details-pii-card"
                    onClick={() => {
                        setPiiOpen(true);
                    }}
                >
                    <MIcon name="shield_lock" size="sm" />
                    <span className="details-pii-card__label">
                        PII-атрибутов в домене
                    </span>
                    <span className="details-pii-card__value">
                        {domainPii.length}
                    </span>
                    {domainPii.some((h) => h.severity === "critical") && (
                        <span className="details-pii-card__badge">
                            {domainPii.filter((h) => h.severity === "critical").length}{" "}
                            critical
                        </span>
                    )}
                </button>
            )}

            {/* ── Health breakdown ── */}
            {hc && healthBreakdown.length > 0 && (
                <div className="details-health-card">
                    <div className="details-health-card__head">
                        <span
                            className={
                                "details-health-card__score details-health-card__score--" +
                                hc
                            }
                        >
                            {health}
                        </span>
                        <span className="details-health-card__label">
                            Health score
                        </span>
                    </div>
                    <div className="details-health-card__bar">
                        <div
                            className={
                                "details-health-card__fill details-health-card__fill--" +
                                hc
                            }
                            style={{ width: (health ?? 0) + "%" }}
                        />
                    </div>
                    <div className="details-health-card__rows">
                        {healthBreakdown.map((b, i) => (
                            <div key={i} className="details-health-card__row">
                                <span className="details-health-card__reason">
                                    {b.reason}
                                </span>
                                <span
                                    className={
                                        "details-health-card__delta " +
                                        (b.delta < 0
                                            ? "details-health-card__delta--neg"
                                            : "details-health-card__delta--pos")
                                    }
                                >
                                    {b.delta > 0 ? "+" + b.delta : b.delta}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Overview ── */}
            {d.description && (
                <div className="details__field">
                    <div className="details__field-label">Описание</div>
                    <div className="details__field-value">{d.description}</div>
                </div>
            )}

            {d.tags && d.tags.length > 0 && (
                <div className="details__field">
                    <div className="details__field-label">Теги</div>
                    <div className="details__tags">
                        {d.tags.map((t: string, i: number) => (
                            <span key={i} className="tag">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Timeline ── */}
            {(d.updatedAt || d.createdAt) && (
                <div className="details-timeline">
                    {d.updatedAt && (
                        <div className="details-timeline__row">
                            <MIcon
                                name={sourceIcon(d.updatedAtSource)}
                                size="sm"
                                title={sourceLabel(d.updatedAtSource)}
                            />
                            <span className="details-timeline__label">
                                Обновлён
                            </span>
                            <span className="details-timeline__value">
                                {formatDate(d.updatedAt)}
                            </span>
                            <span
                                className="details-timeline__source"
                                style={{ color: sourceColor(d.updatedAtSource) }}
                            >
                                {d.updatedAtSource === "graphql"
                                    ? "server"
                                    : d.updatedAtSource === "fs"
                                        ? "local"
                                        : "—"}
                            </span>
                        </div>
                    )}
                    {d.createdAt && (
                        <div className="details-timeline__row">
                            <MIcon
                                name={sourceIcon(d.createdAtSource)}
                                size="sm"
                            />
                            <span className="details-timeline__label">
                                Создан
                            </span>
                            <span className="details-timeline__value">
                                {formatDate(d.createdAt)}
                            </span>
                            <span
                                className="details-timeline__source"
                                style={{ color: sourceColor(d.createdAtSource) }}
                            >
                                {d.createdAtSource === "graphql"
                                    ? "server"
                                    : d.createdAtSource === "fs"
                                        ? "local"
                                        : "—"}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── FQID refs ── */}
            {refs.length > 0 && (
                <CollapsibleSection
                    id="fqid-out"
                    title="Исходящие FQID"
                    icon="call_made"
                    count={refs.length}
                    right={
                        refs.length > 5 && (
                            <input
                                type="text"
                                className="details__field-inline-input"
                                placeholder="Поиск…"
                                value={fqidQuery}
                                onChange={(e) => setFqidQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        )
                    }
                >
                    {filteredRefs.length === 0 ? (
                        <div className="details__field-value details__field-value--muted">
                            Ничего не найдено
                        </div>
                    ) : (
                        <div className="details__refs">
                            {filteredRefs.slice(0, 100).map((r, i) => {
                                const targetExists = allNodes.some(
                                    (n) =>
                                        (n.data.domainId || "").toLowerCase() ===
                                        (r.targetDomainId || "").toLowerCase(),
                                );
                                return (
                                    <div
                                        key={i}
                                        className={
                                            "details__ref" +
                                            (targetExists
                                                ? ""
                                                : " details__ref--missing")
                                        }
                                        onClick={() =>
                                            targetExists && goto(r.targetDomainId)
                                        }
                                        title={
                                            !targetExists
                                                ? "Целевой домен не найден в кэше"
                                                : `Перейти к ${r.targetDomainId}`
                                        }
                                    >
                                        <div className="details__ref-main">
                                            <MIcon
                                                name={
                                                    targetExists
                                                        ? "arrow_outward"
                                                        : "link_off"
                                                }
                                                size="sm"
                                            />
                                            <span>{r.fullFQID}</span>
                                        </div>
                                        <div className="details__ref-path">
                                            {r.propertyPath}
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredRefs.length > 100 && (
                                <div className="details__ref-more">
                                    …и ещё {filteredRefs.length - 100}
                                </div>
                            )}
                        </div>
                    )}
                </CollapsibleSection>
            )}

            {/* ── Incoming edges ── */}
            <CollapsibleSection
                id="incoming"
                title="Входящие связи"
                icon="call_received"
                count={incoming.length}
            >
                {incoming.length === 0 ? (
                    <div className="details__field-value details__field-value--muted">
                        Нет входящих связей
                    </div>
                ) : (
                    <div className="details-ref-groups">
                        {incomingByKind.map(([kind, edges]) => (
                            <div key={kind} className="details-ref-group">
                                <KindGroupTitle kind={kind} count={edges.length} />
                                {edges.slice(0, 30).map((e, i) => {
                                    const src = allNodes.find(
                                        (n) => n.id === e.source,
                                    );
                                    return (
                                        <div
                                            key={i}
                                            className="details-ref-group__item"
                                            onClick={() =>
                                                src && goto(src.data.domainId)
                                            }
                                        >
                                            <span className="details-ref-group__dot" />
                                            <span className="details-ref-group__label">
                                                {src
                                                    ? src.data.domainId
                                                    : e.source}
                                            </span>
                                            {e.data?.fullLabel && (
                                                <span
                                                    className="details-ref-group__sublabel"
                                                    title={e.data.fullLabel}
                                                >
                                                    {e.data.fullLabel}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                                {edges.length > 30 && (
                                    <div className="details__ref-more">
                                        …и ещё {edges.length - 30}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>

            {/* ── Outgoing edges ── */}
            <CollapsibleSection
                id="outgoing"
                title="Исходящие связи"
                icon="call_made"
                count={outgoing.length}
            >
                {outgoing.length === 0 ? (
                    <div className="details__field-value details__field-value--muted">
                        Нет исходящих связей
                    </div>
                ) : (
                    <div className="details-ref-groups">
                        {outgoingByKind.map(([kind, edges]) => (
                            <div key={kind} className="details-ref-group">
                                <KindGroupTitle kind={kind} count={edges.length} />
                                {edges.slice(0, 30).map((e, i) => {
                                    const tgt = allNodes.find(
                                        (n) => n.id === e.target,
                                    );
                                    return (
                                        <div
                                            key={i}
                                            className="details-ref-group__item"
                                            onClick={() =>
                                                tgt && goto(tgt.data.domainId)
                                            }
                                        >
                                            <span className="details-ref-group__dot" />
                                            <span className="details-ref-group__label">
                                                {tgt
                                                    ? tgt.data.domainId
                                                    : e.target}
                                            </span>
                                            {e.data?.fullLabel && (
                                                <span
                                                    className="details-ref-group__sublabel"
                                                    title={e.data.fullLabel}
                                                >
                                                    {e.data.fullLabel}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                                {edges.length > 30 && (
                                    <div className="details__ref-more">
                                        …и ещё {edges.length - 30}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>

            {/* ── Mixins ── */}
            {isDomain && (
                <CollapsibleSection id="mixins" title="Миксины" icon="merge">
                    <DomainMixinsPanel domainId={domainId} />
                </CollapsibleSection>
            )}

            {/* ── Sonar ── */}
            {isDomain && (
                <CollapsibleSection
                    id="sonar"
                    title="Sonar-оценка"
                    icon="science"
                >
                    <DomainSonarPanel domainId={domainId} />
                </CollapsibleSection>
            )}

            {/* ── Validation diagnostics ── */}
            {isDomain && validationDiagnostics.length > 0 && (
                <CollapsibleSection
                    id="validation"
                    title="Серверная валидация"
                    icon="cloud_upload"
                    count={validationDiagnostics.length}
                    badgeVariant="danger"
                >
                    <div className="details-validation">
                        {validationDiagnostics.slice(0, 20).map((x: any, i: number) => (
                            <div
                                key={i}
                                className={
                                    "details-validation__row details-validation__row--" +
                                    (x.severity === "ERROR"
                                        ? "error"
                                        : x.severity === "WARNING"
                                            ? "warning"
                                            : "info")
                                }
                            >
                                <span className="details-validation__severity">
                                    {x.severity}
                                </span>
                                <span className="details-validation__message">
                                    {x.message}
                                </span>
                            </div>
                        ))}
                        {validationDiagnostics.length > 20 && (
                            <div className="details__ref-more">
                                …и ещё {validationDiagnostics.length - 20}
                            </div>
                        )}
                    </div>
                </CollapsibleSection>
            )}

            {/* ── Rule violations ── */}
            <CollapsibleSection
                id="violations"
                title="Нарушения правил"
                icon="block"
                count={ruleViolations.length}
                badgeVariant="danger"
            >
                {ruleViolations.length === 0 ? (
                    <div className="details__field-value details__field-value--muted">
                        Нет нарушений
                    </div>
                ) : (
                    <div className="details__refs">
                        {ruleViolations.slice(0, 10).map((v: any, i: number) => (
                            <div
                                key={i}
                                className="rank-item"
                                style={{ cursor: "pointer" }}
                                onClick={() => goto(v.fromId)}
                            >
                                <span className="rank-item__num">
                                    <MIcon
                                        name={
                                            v.severity === "forbid"
                                                ? "block"
                                                : "warning"
                                        }
                                        size="sm"
                                    />
                                </span>
                                <span className="rank-item__label">
                                    {v.fromId} → {v.toId}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CollapsibleSection>

            {/* ── File info ── */}
            {!remoteInfo?.server && d.filePath && (
                <div className="details__field">
                    <div className="details__field-label">Файл</div>
                    <div className="details-file">
                        <code className="details-file__path">{d.filePath}</code>
                        <button
                            className="details__copy"
                            onClick={openFile}
                            title="Открыть в редакторе"
                        >
                            <MIcon name="open_in_new" size="sm" />
                        </button>
                    </div>
                    {d.fileSize != null && (
                        <div className="details-file__size">
                            {(d.fileSize / 1024).toFixed(1)} KB
                        </div>
                    )}
                </div>
            )}

            {remoteInfo?.server && d.folderPath && d.folderPath.length > 0 && (
                <div className="details__field">
                    <div className="details__field-label">Каталог</div>
                    <div className="details__field-value">
                        {d.folderPath.join(" / ")}
                    </div>
                </div>
            )}

            {/* ── Destructive actions ── */}
            {isDomain && (
                <div className="details-danger-zone">
                    <button
                        className="btn btn--danger btn--small"
                        onClick={() => {
                            useGraphStore
                                .getState()
                                .setDeleteDomainTarget({ domainId });
                        }}
                        title="Удалить домен"
                    >
                        <MIcon name="delete_forever" size="sm" />
                        Удалить домен
                    </button>
                </div>
            )}
        </div>
    );
}