import React, { useMemo } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import {
    simulateEntityDeletion,
    generateDeletionSimulationMarkdown,
} from "../../lib/model/deletion-simulation";

const SEVERITY_LABEL: Record<string, { label: string; icon: string }> = {
    safe: { label: "Безопасно", icon: "check_circle" },
    risky: { label: "Требует чистки", icon: "warning" },
    breaking: { label: "Сломает схему", icon: "dangerous" },
};

export function DeletionSimulationModal() {
    const open = useGraphStore((s) => s.deletionSimulationOpen);
    const fqid = useGraphStore((s) => s.deletionSimulationFqid);
    const nodes = useGraphStore((s) => s.nodes);
    const { index, loading, error } = useModelIndex();

    const sim = useMemo(() => {
        if (!index || !fqid) return null;
        try {
            return simulateEntityDeletion(fqid, index);
        } catch {
            return null;
        }
    }, [index, fqid]);

    const close = () => {
        const st = useGraphStore.getState();
        st.setDeletionSimulationOpen(false);
        st.setDeletionSimulationFqid(null);
    };

    const openEntityInCatalog = (targetFqid: string) => {
        const st = useGraphStore.getState();
        st.setDeletionSimulationOpen(false);
        st.setEntityCatalogInitialFqid(targetFqid);
        st.setEntityCatalogOpen(true);
    };

    const openInYaml = (domainId: string) => {
        // Открыть файл домена в YAML-редакторе
        const node = nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() === domainId.toLowerCase(),
        );
        const st = useGraphStore.getState();
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден");
            return;
        }
        st.setDeletionSimulationOpen(false);
        st.setYamlViewerFilePath(node.data.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(domainId);
        st.setYamlViewerOpen(true);
    };

    const copyPlan = async () => {
        if (!sim) return;
        const text = sim.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar("План скопирован");
        } catch {
            /* ignore */
        }
    };

    const exportMarkdown = () => {
        if (!sim) return;
        const md = generateDeletionSimulationMarkdown(sim);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safe = sim.entity.entityId.replace(/[^a-z0-9.-]/gi, "_");
        a.download = `delete-simulation-${safe}-${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[:.]/g, "-")}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 550 }}
            onMouseDown={close}
        >
            <div
                className="help-modal deletion-sim-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="delete_forever" size="sm" />
                        <span className="icon-label">Что если удалить</span>
                        {sim && (
                            <span className="help-modal__badge">
                                {sim.entity.entityId}
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={close}>
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

                {!loading && !error && !sim && (
                    <div className="help-modal__body">
                        <div className="deletion-sim-empty">
                            Сущность не найдена в индексе
                        </div>
                    </div>
                )}

                {sim && (
                    <div className="help-modal__body help-modal__body--flush">
                        {/* ============ Шапка severity ============ */}
                        <div
                            className={
                                "deletion-sim-header deletion-sim-header--" +
                                sim.summary.severity
                            }
                        >
                            <div className="deletion-sim-header__icon">
                                <MIcon
                                    name={SEVERITY_LABEL[sim.summary.severity].icon}
                                    size="xl"
                                />
                            </div>
                            <div className="deletion-sim-header__text">
                                <div className="deletion-sim-header__title">
                                    {SEVERITY_LABEL[sim.summary.severity].label}
                                </div>
                                <div className="deletion-sim-header__desc">
                                    {sim.summary.severity === "safe" &&
                                        "Сущность не используется — удаление ничего не сломает."}
                                    {sim.summary.severity === "risky" &&
                                        `Схема не сломается, но ${sim.summary.warningCount} блок(ов) станут «висячими» — их надо почистить.`}
                                    {sim.summary.severity === "breaking" &&
                                        `${sim.summary.breakingCount} критичных зависимост(ей) — удаление сломает схему или данные.`}
                                </div>
                            </div>
                            <div className="deletion-sim-header__stats">
                                <div className="deletion-sim-stat">
                                    <span className="deletion-sim-stat__value deletion-sim-stat__value--err">
                                        {sim.summary.breakingCount}
                                    </span>
                                    <span className="deletion-sim-stat__label">breaking</span>
                                </div>
                                <div className="deletion-sim-stat">
                                    <span className="deletion-sim-stat__value deletion-sim-stat__value--warn">
                                        {sim.summary.warningCount}
                                    </span>
                                    <span className="deletion-sim-stat__label">warnings</span>
                                </div>
                                <div className="deletion-sim-stat">
                                    <span className="deletion-sim-stat__value">
                                        {sim.summary.affectedDomains.length}
                                    </span>
                                    <span className="deletion-sim-stat__label">доменов</span>
                                </div>
                            </div>
                        </div>

                        {/* ============ Мета ============ */}
                        <div className="deletion-sim-meta">
                            <code>{sim.entity.fqid}</code>
                            {sim.entity.name && sim.entity.name !== sim.entity.entityId && (
                                <span className="deletion-sim-meta__name">
                                    {sim.entity.name}
                                </span>
                            )}
                            <span className="deletion-sim-meta__badge">
                                v? · {sim.entity.attributes.length} атрибутов
                            </span>
                        </div>

                        {/* ============ Breaking-секции ============ */}
                        {sim.references.length > 0 && (
                            <DeletionSimSection
                                level="breaking"
                                icon="link"
                                title="Reference на эту сущность"
                                count={sim.references.length}
                                hint="Атрибуты в других сущностях, которые ссылаются на неё через Reference / Array<Reference>"
                            >
                                {sim.references.map((r, i) => (
                                    <div key={i} className="deletion-sim-item">
                                        <button
                                            className="deletion-sim-item__link"
                                            onClick={() =>
                                                openEntityInCatalog(r.fromEntity.fqid)
                                            }
                                            title="Открыть ссылающуюся сущность в каталоге"
                                        >
                                            <MIcon name="data_object" size="sm" />
                                            <strong>{r.fromEntity.entityId}</strong>
                                            <span className="deletion-sim-item__domain">
                                                {r.fromEntity.domainId}
                                            </span>
                                        </button>
                                        <span className="deletion-sim-item__arrow">→</span>
                                        <code className="deletion-sim-item__attr">
                                            {r.attributeId}
                                        </code>
                                        <span className="deletion-sim-item__type">
                                            {r.dataType}
                                        </span>
                                        <button
                                            className="deletion-sim-item__action"
                                            onClick={() => openInYaml(r.fromEntity.domainId)}
                                            title="Открыть YAML домена"
                                        >
                                            <MIcon name="description" size="sm" />
                                        </button>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.inheritance.length > 0 && (
                            <DeletionSimSection
                                level="breaking"
                                icon="account_tree"
                                title="Наследники"
                                count={sim.inheritance.length}
                                hint="Сущности, которые наследуют целевую. Удаление родителя сломает наследование."
                            >
                                {sim.inheritance.map((i) => (
                                    <div key={i.child.fqid} className="deletion-sim-item">
                                        <button
                                            className="deletion-sim-item__link"
                                            onClick={() => openEntityInCatalog(i.child.fqid)}
                                        >
                                            <MIcon name="account_tree" size="sm" />
                                            <strong>{i.child.entityId}</strong>
                                            <span className="deletion-sim-item__domain">
                                                {i.child.domainId}
                                            </span>
                                        </button>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.linkages.length > 0 && (
                            <DeletionSimSection
                                level="breaking"
                                icon="link"
                                title="Связи"
                                count={sim.linkages.length}
                                hint="Linkages, в которых участвует сущность как side1 или side2."
                            >
                                {sim.linkages.map((l) => (
                                    <div
                                        key={`${l.linkage.domainId}#${l.linkage.id}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="link" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {l.linkage.id}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {l.linkage.domainId}
                                        </span>
                                        <span className="deletion-sim-item__type">
                                            {l.linkage.side1Fqid.split("/").pop()} →{" "}
                                            {l.linkage.side2Fqid.split("/").pop()}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {/* ============ Warnings ============ */}
                        {sim.views.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="visibility"
                                title="Views"
                                count={sim.views.length}
                                hint="Привязаны к сущности как source.entity или entity. После удаления станут «висячими»."
                            >
                                {sim.views.map((v) => (
                                    <div
                                        key={`${v.domainId}#${v.viewId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="view_quilt" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {v.viewId}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {v.domainId}
                                        </span>
                                        <span className="deletion-sim-item__type">
                                            {v.viewType}
                                            {v.reason ? ` · ${v.reason}` : ""}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.dataRules.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="rule"
                                title="Правила данных"
                                count={sim.dataRules.length}
                                hint="dataRules, у которых entity = эта сущность (или linkage-правила на её связи)."
                            >
                                {sim.dataRules.map((r) => (
                                    <div
                                        key={`${r.domainId}#${r.ruleId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="rule" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {r.ruleId}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {r.domainId}
                                        </span>
                                        <span className="deletion-sim-item__type">
                                            {r.effect}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.actions.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="bolt"
                                title="Действия"
                                count={sim.actions.length}
                                hint="Действия с entity = эта сущность. Их надо удалить или перенаправить."
                            >
                                {sim.actions.map((a) => (
                                    <div
                                        key={`${a.domainId}#${a.actionId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="bolt" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {a.actionId}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {a.domainId}
                                        </span>
                                        <span className="deletion-sim-item__type">
                                            {a.actionType}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.mixins.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="merge"
                                title="Примеси"
                                count={sim.mixins.length}
                                hint="Миксины, где эта сущность — target или from."
                            >
                                {sim.mixins.map((m) => (
                                    <div
                                        key={`${m.domainId}#${m.mixinId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="merge" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {m.mixinId}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {m.domainId}
                                        </span>
                                        <span className="deletion-sim-item__type">
                                            {m.mixinType} · role: {m.reason}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.trees.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="account_tree"
                                title="Деревья"
                                count={sim.trees.length}
                                hint="trees[], в иерархии которых участвует сущность."
                            >
                                {sim.trees.map((t) => (
                                    <div
                                        key={`${t.domainId}#${t.treeId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="account_tree" size="sm" />
                                        <code className="deletion-sim-item__attr">
                                            {t.treeId}
                                        </code>
                                        <span className="deletion-sim-item__domain">
                                            {t.domainId}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {sim.transitiveLinkages.length > 0 && (
                            <DeletionSimSection
                                level="warning"
                                icon="conversion_path"
                                title="Транзитивные связи"
                                count={sim.transitiveLinkages.length}
                                hint="transitiveLinkages[], где эта сущность — корень."
                            >
                                {sim.transitiveLinkages.map((t) => (
                                    <div
                                        key={`${t.domainId}#${t.tlId}`}
                                        className="deletion-sim-item"
                                    >
                                        <MIcon name="conversion_path" size="sm" />
                                        <code className="deletion-sim-item__attr">{t.tlId}</code>
                                        <span className="deletion-sim-item__domain">
                                            {t.domainId}
                                        </span>
                                    </div>
                                ))}
                            </DeletionSimSection>
                        )}

                        {/* ============ План миграции ============ */}
                        <div className="deletion-sim-steps">
                            <div className="deletion-sim-steps__title">
                                <MIcon name="checklist" size="sm" />
                                План миграции
                            </div>
                            <ol>
                                {sim.steps.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ol>
                        </div>
                    </div>
                )}

                <div className="deletion-sim-footer">
                    <div className="deletion-sim-footer__info">
                        {sim && sim.summary.externalDomainCount > 0 && (
                            <span className="deletion-sim-footer__warning">
                                <MIcon name="public" size="sm" />
                                Затронуты внешние домены: {sim.summary.externalDomainCount}
                            </span>
                        )}
                    </div>
                    <div className="deletion-sim-footer__actions">
                        <button className="btn" onClick={close}>
                            Отмена
                        </button>
                        <button
                            className="btn"
                            onClick={copyPlan}
                            disabled={!sim}
                            title="Скопировать план миграции в буфер"
                        >
                            <MIcon name="content_copy" size="sm" />
                            Копировать план
                        </button>
                        <button
                            className="btn"
                            onClick={exportMarkdown}
                            disabled={!sim}
                            title="Скачать отчёт в Markdown"
                        >
                            <MIcon name="description" size="sm" />
                            Экспорт MD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============ Sub-component ============

function DeletionSimSection({
    level,
    icon,
    title,
    count,
    hint,
    children,
}: {
    level: "breaking" | "warning";
    icon: string;
    title: string;
    count: number;
    hint: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={
                "deletion-sim-section deletion-sim-section--" + level
            }
        >
            <div className="deletion-sim-section__head">
                <MIcon name={icon} size="sm" />
                <span className="deletion-sim-section__title">{title}</span>
                <span className="deletion-sim-section__count">{count}</span>
            </div>
            <div className="deletion-sim-section__hint">{hint}</div>
            <div className="deletion-sim-section__body">{children}</div>
        </div>
    );
}