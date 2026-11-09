import React, { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useNavigation } from "../../hooks/useNavigation";
import { readRemoteInfo } from "../../state/initial";
import { MIcon } from "../common/MIcon";

// ============ Types ============

type RefSeverity = "breaking" | "warning";
type RefKind = "inherits" | "reference" | "linkage" | "mixin";

interface RefItem {
    severity: RefSeverity;
    kind: RefKind;
    /** FQID домена-источника. */
    fromDomainId: string;
    /** FQID сущности-источника (может быть null для mixin). */
    fromEntityFqid?: string;
    /** Что именно ссылается (для описания). */
    description: string;
}

interface RefGroup {
    fromDomainId: string;
    breaking: RefItem[];
    warning: RefItem[];
    totalCount: number;
}

interface DeleteStage {
    label: string;
    status: "pending" | "active" | "done";
}

// ============ Helpers ============

const KIND_ICON: Record<RefKind, string> = {
    inherits: "account_tree",
    reference: "link",
    linkage: "call_made",
    mixin: "merge",
};

const KIND_LABEL: Record<RefKind, string> = {
    inherits: "наследование",
    reference: "reference",
    linkage: "связь",
    mixin: "примесь",
};

function downloadMarkdown(domainId: string, refs: RefItem[], metrics: any): void {
    const now = new Date().toLocaleString("ru-RU");
    const breaking = refs.filter((r) => r.severity === "breaking");
    const warning = refs.filter((r) => r.severity === "warning");

    const lines: string[] = [];
    lines.push(`# Удаление домена ${domainId}`);
    lines.push("");
    lines.push(`_${now}_`);
    lines.push("");

    lines.push("## Что удаляется");
    lines.push("");
    lines.push("| Объект | Количество |");
    lines.push("| --- | ---: |");
    lines.push(`| Сущности | ${metrics.entities} |`);
    lines.push(`| Атрибуты | ${metrics.attributes} |`);
    lines.push(`| Связи | ${metrics.linkages} |`);
    lines.push(`| Views | ${metrics.views} |`);
    lines.push(`| Действия | ${metrics.actions} |`);
    lines.push(`| Типы данных | ${metrics.dataTypes} |`);
    lines.push("");

    if (breaking.length > 0) {
        lines.push(`## 🛑 Критичные ссылки (${breaking.length})`);
        lines.push("");
        lines.push("Удаление сломает схему или данные.");
        lines.push("");
        const byDomain = new Map<string, RefItem[]>();
        for (const r of breaking) {
            if (!byDomain.has(r.fromDomainId)) byDomain.set(r.fromDomainId, []);
            byDomain.get(r.fromDomainId)!.push(r);
        }
        byDomain.forEach((items, fromDom) => {
            lines.push(`### Из домена \`${fromDom}\` (${items.length})`);
            for (const r of items) {
                lines.push(`- **${KIND_LABEL[r.kind]}** — ${r.description}`);
            }
            lines.push("");
        });
    }

    if (warning.length > 0) {
        lines.push(`## ⚠️ Некритичные ссылки (${warning.length})`);
        lines.push("");
        lines.push("Схема не сломается, но связи и примеси станут «висячими».");
        lines.push("");
        for (const r of warning) {
            lines.push(`- **${KIND_LABEL[r.kind]}** из \`${r.fromDomainId}\` — ${r.description}`);
        }
        lines.push("");
    }

    if (refs.length === 0) {
        lines.push("## ✅ Ссылок нет");
        lines.push("");
        lines.push("Домен изолирован — удаление не затронет другие домены.");
        lines.push("");
    }

    const blob = new Blob([lines.join("\n")], {
        type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `delete-domain-${domainId.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============ Component ============

export function DeleteDomainModal() {
    const target = useGraphStore((s) => s.deleteDomainTarget);
    const setTarget = useGraphStore((s) => s.setDeleteDomainTarget);
    const { index } = useModelIndex();
    const { goto } = useNavigation();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const isRemote = !!remoteInfo?.server && remoteInfo.mode !== "hybrid";

    const [expertiseId, setExpertiseId] = useState<string | null>(null);
    const [expertiseReady, setExpertiseReady] = useState(false);
    const [confirmInput, setConfirmInput] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [stage, setStage] = useState<DeleteStage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
        () => new Set(),
    );

    const open = !!target;

    // ============ Load expertiseId (remote) ============
    useEffect(() => {
        if (!open || !target) return;
        setExpertiseId(null);
        setExpertiseReady(false);
        setConfirmInput("");
        setError(null);
        setStage(null);
        setExpandedGroups(new Set());
        if (!isRemote) {
            setExpertiseReady(true);
            return;
        }
        fetch("/api/domain-index")
            .then((r) => r.json())
            .then((d) => {
                const entry = (d.domains || []).find(
                    (x: any) => x.sourceId === target.domainId,
                );
                setExpertiseId(entry?.id || null);
                setExpertiseReady(true);
            })
            .catch(() => setExpertiseReady(true));
    }, [open, target, isRemote]);

    // ============ Сбор ссылок ============
    const refs = useMemo<RefItem[]>(() => {
        if (!index || !target) return [];
        const t = target.domainId.toLowerCase();
        const matches = (fqid: string | null | undefined) =>
            !!fqid && fqid.toLowerCase().startsWith(t + "/");

        const out: RefItem[] = [];

        // ─── Inheritance ───
        for (const e of index.entities) {
            if (e.domainId.toLowerCase() === t) continue;
            if (matches(e.inherits)) {
                out.push({
                    severity: "breaking",
                    kind: "inherits",
                    fromDomainId: e.domainId,
                    fromEntityFqid: e.fqid,
                    description: `${e.entityId} наследует ${e.inherits!.split("/")[1]}`,
                });
            }
        }

        // ─── Reference ───
        for (const e of index.entities) {
            if (e.domainId.toLowerCase() === t) continue;
            for (const a of e.attributes) {
                const ref = a.referenceEntity || a.itemReferenceEntity;
                if (!matches(ref)) continue;
                out.push({
                    severity: "breaking",
                    kind: "reference",
                    fromDomainId: e.domainId,
                    fromEntityFqid: e.fqid,
                    description: `${e.entityId}.${a.id} → ${ref!.split("/")[1]}`,
                });
            }
        }

        // ─── Linkage ───
        for (const l of index.entityLinkages) {
            if (l.domainId.toLowerCase() === t) continue;
            if (matches(l.side1Fqid) || matches(l.side2Fqid)) {
                out.push({
                    severity: "warning",
                    kind: "linkage",
                    fromDomainId: l.domainId,
                    description: `${l.id} (${l.side1Fqid.split("/")[1]} ↔ ${l.side2Fqid.split("/")[1]})`,
                });
            }
        }

        // ─── Mixins ───
        for (const m of index.mixins) {
            if (m.domainId.toLowerCase() === t) continue;
            if (matches(m.targetEntityFqid)) {
                out.push({
                    severity: "warning",
                    kind: "mixin",
                    fromDomainId: m.domainId,
                    description: `${m.id} (target: ${m.targetEntityFqid.split("/")[1]})`,
                });
            }
            if (matches(m.sourceEntityFqid)) {
                out.push({
                    severity: "warning",
                    kind: "mixin",
                    fromDomainId: m.domainId,
                    description: `${m.id} (from: ${m.sourceEntityFqid!.split("/")[1]})`,
                });
            }
        }

        return out;
    }, [index, target]);

    // ============ Группировка по from-domain ============
    const groups = useMemo<RefGroup[]>(() => {
        const map = new Map<string, RefGroup>();
        for (const r of refs) {
            const key = r.fromDomainId.toLowerCase();
            if (!map.has(key)) {
                map.set(key, {
                    fromDomainId: r.fromDomainId,
                    breaking: [],
                    warning: [],
                    totalCount: 0,
                });
            }
            const g = map.get(key)!;
            if (r.severity === "breaking") g.breaking.push(r);
            else g.warning.push(r);
            g.totalCount++;
        }
        return Array.from(map.values()).sort((a, b) => {
            if (a.breaking.length !== b.breaking.length)
                return b.breaking.length - a.breaking.length;
            return b.totalCount - a.totalCount;
        });
    }, [refs]);

    // ============ Метрики домена ============
    const metrics = useMemo(() => {
        if (!index || !target) {
            return { entities: 0, attributes: 0, linkages: 0, views: 0, actions: 0, dataTypes: 0 };
        }
        const t = target.domainId;
        const ents = index.entities.filter((e) => e.domainId === t);
        const attrs = ents.reduce((s, e) => {
            let c = e.attributes.length;
            e.attributes.forEach((a) => {
                if (a.nestedAttributes) c += a.nestedAttributes.length;
            });
            return s + c;
        }, 0);
        const linkages = index.entityLinkages.filter((l) => l.domainId === t).length;
        const views = index.schemasByDomain[t]?.sections.views.count ?? 0;
        const actions = index.schemasByDomain[t]?.sections.actions.count ?? 0;
        const dataTypes = index.dataTypes.filter((d) => d.domainId === t).length;
        return { entities: ents.length, attributes: attrs, linkages, views, actions, dataTypes };
    }, [index, target]);

    // ============ Сводка ============
    const summary = useMemo(() => {
        const breakingCount = refs.filter((r) => r.severity === "breaking").length;
        const warningCount = refs.filter((r) => r.severity === "warning").length;
        const domainsCount = groups.length;
        return { breakingCount, warningCount, domainsCount, total: refs.length };
    }, [refs, groups]);

    // ============ Handlers ============
    const canDelete =
        confirmInput === target?.domainId &&
        !deleting &&
        (!isRemote || (expertiseReady && !!expertiseId));

    const toggleGroup = (fromDomainId: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(fromDomainId)) next.delete(fromDomainId);
            else next.add(fromDomainId);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedGroups(new Set(groups.map((g) => g.fromDomainId)));
    };

    const collapseAll = () => {
        setExpandedGroups(new Set());
    };

    const copyRefs = async () => {
        if (!target) return;
        const text = refs
            .map(
                (r) =>
                    `[${r.severity === "breaking" ? "🛑" : "⚠️"}] ${r.fromDomainId} — ${KIND_LABEL[r.kind]}: ${r.description}`,
            )
            .join("\n");
        try {
            await navigator.clipboard.writeText(
                `Удаление ${target.domainId}: ${refs.length} ссылок\n\n` + text,
            );
            useGraphStore.getState().showSnackbar(`Скопировано: ${refs.length} ссылок`);
        } catch {
            /* ignore */
        }
    };

    const exportReport = () => {
        if (!target) return;
        downloadMarkdown(target.domainId, refs, metrics);
    };

    const openDomainSchema = (domainId: string) => {
        const st = useGraphStore.getState();
        st.setDeleteDomainTarget(null);
        st.setDomainSchemaDomainId(domainId);
        st.setDomainSchemaOpen(true);
    };

    const openEntityInCatalog = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setDeleteDomainTarget(null);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const doDelete = async () => {
        if (!canDelete || !target) return;
        setDeleting(true);
        setError(null);
        setStage({ label: "Отправка запроса на удаление…", status: "active" });
        try {
            const res = await fetch("/api/delete-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    domainId: target.domainId,
                    expertiseId: isRemote ? expertiseId : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || `HTTP ${res.status}`);
                setStage(null);
                return;
            }
            setStage({ label: "Обновление индекса…", status: "active" });
            const st = useGraphStore.getState();
            st.bumpModelVersion();
            await st.refreshGraphFromServer(index);
            st.setDeleteDomainTarget(null);
        } catch (e: any) {
            setError(e.message || String(e));
            setStage(null);
        } finally {
            setDeleting(false);
        }
    };

    if (!open || !target) return null;

    const severityClass =
        summary.breakingCount > 0
            ? "err"
            : summary.warningCount > 0
                ? "warn"
                : "ok";

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => !deleting && setTarget(null)}
        >
            <div
                className="help-modal delete-domain-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon
                            name="delete_forever"
                            size="sm"
                            style={{ color: "var(--danger)" }}
                        />
                        <span className="icon-label">Удалить домен</span>
                        <span className="help-modal__badge">{target.domainId}</span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => setTarget(null)}
                        disabled={deleting}
                    >
                        ✕
                    </button>
                </div>

                <div className="help-modal__body help-modal__body--flush">
                    {/* ============ DELETING STAGE ============ */}
                    {deleting && stage && (
                        <div className="delete-domain-progress">
                            <MIcon name="hourglass_top" size="sm" />
                            <span>{stage.label}</span>
                        </div>
                    )}

                    {!deleting && (
                        <>
                            {/* ============ IMPACT BANNER ============ */}
                            <div className={`delete-domain-banner delete-domain-banner--${severityClass}`}>
                                <MIcon
                                    name={
                                        severityClass === "err"
                                            ? "dangerous"
                                            : severityClass === "warn"
                                                ? "warning"
                                                : "check_circle"
                                    }
                                    size="sm"
                                />
                                <div className="delete-domain-banner__text">
                                    {severityClass === "err" && (
                                        <>
                                            <strong>{summary.breakingCount}</strong>{" "}
                                            {summary.breakingCount === 1 ? "критичная ссылка" : "критичных ссылок"} —
                                            схема или данные <strong>сломаются</strong>. Сначала устраните их.
                                        </>
                                    )}
                                    {severityClass === "warn" && (
                                        <>
                                            Схема не сломается, но останется{" "}
                                            <strong>{summary.warningCount}</strong>{" "}
                                            {summary.warningCount === 1 ? "висячая ссылка" : "висячих ссылок"} —
                                            нужно будет почистить.
                                        </>
                                    )}
                                    {severityClass === "ok" && (
                                        <>Никто не ссылается на этот домен. Удаление безопасно.</>
                                    )}
                                </div>
                            </div>

                            {/* ============ METRICS ============ */}
                            <div className="delete-domain-metrics">
                                <div className="delete-domain-metrics__title">
                                    <MIcon name="inventory_2" size="sm" />
                                    Что будет удалено
                                </div>
                                <div className="delete-domain-metrics__grid">
                                    <MetricCard
                                        icon="data_object"
                                        label="Сущностей"
                                        value={metrics.entities}
                                        tone={metrics.entities > 0 ? "danger" : "muted"}
                                    />
                                    <MetricCard
                                        icon="edit_note"
                                        label="Атрибутов"
                                        value={metrics.attributes}
                                        tone={metrics.attributes > 0 ? "danger" : "muted"}
                                    />
                                    <MetricCard
                                        icon="link"
                                        label="Связей"
                                        value={metrics.linkages}
                                        tone={metrics.linkages > 0 ? "danger" : "muted"}
                                    />
                                    <MetricCard
                                        icon="view_quilt"
                                        label="Views"
                                        value={metrics.views}
                                        tone={metrics.views > 0 ? "danger" : "muted"}
                                    />
                                    <MetricCard
                                        icon="bolt"
                                        label="Действий"
                                        value={metrics.actions}
                                        tone={metrics.actions > 0 ? "danger" : "muted"}
                                    />
                                    <MetricCard
                                        icon="category"
                                        label="Типов данных"
                                        value={metrics.dataTypes}
                                        tone={metrics.dataTypes > 0 ? "danger" : "muted"}
                                    />
                                </div>
                            </div>

                            {/* ============ REFS ============ */}
                            {refs.length > 0 && (
                                <div className="delete-domain-refs-block">
                                    <div className="delete-domain-refs-header">
                                        <div className="delete-domain-refs-title">
                                            <MIcon name="call_received" size="sm" />
                                            Ссылки из других доменов ({summary.total})
                                            {summary.domainsCount > 0 && (
                                                <span className="delete-domain-refs-domains">
                                                    из {summary.domainsCount}{" "}
                                                    {summary.domainsCount === 1 ? "домена" : "доменов"}
                                                </span>
                                            )}
                                        </div>
                                        <div className="delete-domain-refs-actions">
                                            <button
                                                type="button"
                                                className="delete-domain-refs-btn"
                                                onClick={expandAll}
                                                disabled={expandedGroups.size === groups.length}
                                                title="Развернуть все"
                                            >
                                                <MIcon name="unfold_more" size="sm" />
                                            </button>
                                            <button
                                                type="button"
                                                className="delete-domain-refs-btn"
                                                onClick={collapseAll}
                                                disabled={expandedGroups.size === 0}
                                                title="Свернуть все"
                                            >
                                                <MIcon name="unfold_less" size="sm" />
                                            </button>
                                            <button
                                                type="button"
                                                className="delete-domain-refs-btn"
                                                onClick={copyRefs}
                                                title="Копировать список"
                                            >
                                                <MIcon name="content_copy" size="sm" />
                                            </button>
                                            <button
                                                type="button"
                                                className="delete-domain-refs-btn"
                                                onClick={exportReport}
                                                title="Экспорт отчёта в Markdown"
                                            >
                                                <MIcon name="description" size="sm" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="delete-domain-refs-list">
                                        {groups.map((g) => {
                                            const isExpanded = expandedGroups.has(g.fromDomainId);
                                            const hasBreaking = g.breaking.length > 0;
                                            return (
                                                <div
                                                    key={g.fromDomainId}
                                                    className={
                                                        "delete-domain-group" +
                                                        (hasBreaking ? " delete-domain-group--err" : " delete-domain-group--warn")
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        className="delete-domain-group__head"
                                                        onClick={() => toggleGroup(g.fromDomainId)}
                                                    >
                                                        <MIcon
                                                            name={isExpanded ? "expand_more" : "chevron_right"}
                                                            size="sm"
                                                        />
                                                        <MIcon name="folder" size="sm" />
                                                        <code className="delete-domain-group__id">
                                                            {g.fromDomainId}
                                                        </code>
                                                        <div className="delete-domain-group__badges">
                                                            {g.breaking.length > 0 && (
                                                                <span className="delete-domain-badge delete-domain-badge--err">
                                                                    🛑 {g.breaking.length}
                                                                </span>
                                                            )}
                                                            {g.warning.length > 0 && (
                                                                <span className="delete-domain-badge delete-domain-badge--warn">
                                                                    ⚠️ {g.warning.length}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="delete-domain-group__open"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openDomainSchema(g.fromDomainId);
                                                            }}
                                                            title="Открыть схему домена-источника"
                                                        >
                                                            <MIcon name="open_in_new" size="sm" />
                                                        </button>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="delete-domain-group__body">
                                                            {g.breaking.length > 0 && (
                                                                <div className="delete-domain-group__section">
                                                                    <div className="delete-domain-group__section-title delete-domain-group__section-title--err">
                                                                        🛑 Критичные ({g.breaking.length})
                                                                    </div>
                                                                    {g.breaking.map((r, i) => (
                                                                        <RefRow
                                                                            key={`b-${i}`}
                                                                            refItem={r}
                                                                            onOpenEntity={openEntityInCatalog}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {g.warning.length > 0 && (
                                                                <div className="delete-domain-group__section">
                                                                    <div className="delete-domain-group__section-title delete-domain-group__section-title--warn">
                                                                        ⚠️ Некритичные ({g.warning.length})
                                                                    </div>
                                                                    {g.warning.map((r, i) => (
                                                                        <RefRow
                                                                            key={`w-${i}`}
                                                                            refItem={r}
                                                                            onOpenEntity={openEntityInCatalog}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ============ EXPERTISE WARNING ============ */}
                            {isRemote && expertiseReady && !expertiseId && (
                                <div className="create-domain-error-banner">
                                    <MIcon name="error" size="sm" />
                                    <span>
                                        expertise-id не найден в _index.json — удалить на сервере нельзя.
                                        Попробуйте <code>--refresh</code>, затем повторите.
                                    </span>
                                </div>
                            )}

                            {error && (
                                <div className="create-domain-error-banner">
                                    <MIcon name="error" size="sm" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* ============ CONFIRM INPUT ============ */}
                            <div className="delete-domain-confirm-block">
                                <div className="delete-domain-confirm-title">
                                    <MIcon name="verified_user" size="sm" />
                                    Для подтверждения введите ID домена
                                </div>
                                <div className="delete-domain-confirm-hint">
                                    Скопируйте <code>{target.domainId}</code> или введите вручную.
                                    Это защита от случайного удаления.
                                </div>
                                <input
                                    type="text"
                                    className="create-domain-input delete-domain-confirm-input"
                                    value={confirmInput}
                                    onChange={(e) => setConfirmInput(e.target.value)}
                                    placeholder={target.domainId}
                                    spellCheck={false}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && canDelete) doDelete();
                                    }}
                                />
                                {confirmInput.length > 0 && confirmInput !== target.domainId && (
                                    <div className="delete-domain-confirm-mismatch">
                                        <MIcon name="warning" size="sm" />
                                        Не совпадает с <code>{target.domainId}</code>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ============ FOOTER ============ */}
                <div className="delete-domain-footer">
                    <div className="delete-domain-footer__left">
                        {refs.length > 0 && !deleting && (
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={exportReport}
                                title="Скачать отчёт для согласования"
                            >
                                <MIcon name="description" size="sm" />
                                Отчёт MD
                            </button>
                        )}
                    </div>
                    <div className="delete-domain-footer__right">
                        <button
                            className="btn"
                            onClick={() => setTarget(null)}
                            disabled={deleting}
                        >
                            Отмена
                        </button>
                        <button
                            className={`btn btn--danger ${confirmInput === target.domainId && !deleting
                                    ? "btn--danger-armed"
                                    : ""
                                }`}
                            onClick={doDelete}
                            disabled={!canDelete}
                            title={
                                confirmInput !== target.domainId
                                    ? "Введите ID домена для подтверждения"
                                    : isRemote && !expertiseId
                                        ? "expertise-id не найден"
                                        : "Удалить безвозвратно"
                            }
                        >
                            {deleting ? "Удаление…" : "Удалить домен"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============ Sub-components ============

function MetricCard({
    icon,
    label,
    value,
    tone,
}: {
    icon: string;
    label: string;
    value: number;
    tone: "danger" | "muted";
}) {
    return (
        <div className={`delete-domain-metric delete-domain-metric--${tone}`}>
            <MIcon name={icon} size="sm" />
            <div className="delete-domain-metric__value">{value}</div>
            <div className="delete-domain-metric__label">{label}</div>
        </div>
    );
}

function RefRow({
    refItem,
    onOpenEntity,
}: {
    refItem: RefItem;
    onOpenEntity: (fqid: string) => void;
}) {
    const canOpenEntity = !!refItem.fromEntityFqid;
    return (
        <div className="delete-domain-ref-row">
            <MIcon
                name={KIND_ICON[refItem.kind]}
                size="sm"
                className="delete-domain-ref-row__icon"
            />
            <span className="delete-domain-ref-row__kind">
                {KIND_LABEL[refItem.kind]}
            </span>
            {canOpenEntity ? (
                <button
                    type="button"
                    className="delete-domain-ref-row__link"
                    onClick={() => onOpenEntity(refItem.fromEntityFqid!)}
                    title="Открыть сущность-источник в каталоге"
                >
                    {refItem.description}
                </button>
            ) : (
                <span className="delete-domain-ref-row__text">{refItem.description}</span>
            )}
        </div>
    );
}