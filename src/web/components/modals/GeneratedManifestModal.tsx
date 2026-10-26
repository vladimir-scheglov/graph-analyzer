// src/web/components/modals/GeneratedManifestModal.tsx
import React, { useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useGeneratedManifest } from "../../hooks/useGeneratedManifest";
import { MIcon } from "../common/MIcon";
import type {
    ManifestBlockView,
    ManifestEntityView,
} from "../../../shared/manifest-types";
import { hashPayload } from "../../../core/analyzer/schema-generator/util-hash";

const STATUS_LABELS: Record<
    ManifestBlockView["status"],
    { label: string; className: string }
> = {
    actual: { label: "актуален", className: "generated-status--ok" },
    modified: { label: "изменён вручную", className: "generated-status--warn" },
    orphaned: { label: "удалён из YAML", className: "generated-status--err" },
};

export function GeneratedManifestModal() {
    const store = useGraphStore();
    const open = store.sidecarOpen;
    const domainId = store.sidecarDomainId;
    const { data, loading, error, reload } = useGeneratedManifest(domainId, open);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<"all" | "problematic">("all");
    const [clearing, setClearing] = useState(false);

    const toggleEntity = (entityId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(entityId)) next.delete(entityId);
            else next.add(entityId);
            return next;
        });
    };

    const filteredEntities = useMemo(() => {
        if (!data) return [];
        if (filter === "all") return data.entities;
        return data.entities.filter(
            (e) => e.stats.modified + e.stats.orphaned > 0,
        );
    }, [data, filter]);

    const handleClear = async () => {
        if (!domainId) return;
        if (
            !confirm(
                "Удалить все записи манифеста для этого домена?\n\n" +
                "YAML НЕ трогается — удаляется только история «что было сгенерировано».\n" +
                "Следующая генерация начнётся с чистого листа.",
            )
        )
            return;

        setClearing(true);
        try {
            const r = await fetch(
                `/api/generated-manifest?domainId=${encodeURIComponent(domainId)}`,
                { method: "DELETE" },
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            reload();
        } catch (e: any) {
            alert("Ошибка: " + e.message);
        } finally {
            setClearing(false);
        }
    };

    const openBlockInYaml = (blockId: string, parentViewId?: string) => {
        const st = useGraphStore.getState();
        const node = st.nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() ===
                (domainId || "").toLowerCase(),
        );
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден");
            return;
        }
        st.setYamlViewerPendingBlock({ blockId, parentViewId });
        st.setYamlViewerFilePath(node.data.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(domainId);
        st.setYamlViewerOpen(true);
        st.setSidecarOpen(false);
    };

    const restoreOrphaned = async (
        entity: ManifestEntityView,
        blockId: string,
    ) => {
        if (!domainId) return;
        const st = useGraphStore.getState();
        try {
            const r = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    domainId,
                    entityId: entity.entityId,
                    profile: entity.profile,
                    options: { restoreOrphanedIds: [blockId] },
                }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err?.error || `HTTP ${r.status}`);
            }
            const result = await r.json();
            const block = (result.blocks as any[]).find(
                (b) => b.blockId === blockId,
            );
            if (!block) {
                st.showSnackbar("Блок не найден в результате генерации");
                return;
            }

            const node = st.nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() ===
                    domainId.toLowerCase(),
            );
            if (!node?.data.filePath) {
                st.showSnackbar("Файл схемы не найден");
                return;
            }

            st.setYamlViewerPendingGeneration({
                blocks: [block],
                yamlByBlock: { [blockId]: result.yamlByBlock[blockId] },
                manifestStatus: { [blockId]: "orphaned" },
                restoreOrphanedIds: [blockId],
            });
            st.setYamlViewerPendingManifest({
                domainId,
                profile: entity.profile,
                entities: [
                    {
                        entityId: entity.entityId,
                        blocks: [
                            {
                                blockId,
                                hash: hashPayload(block.payload),
                                title: block.title,
                                parentViewId: block.parentViewId,
                            },
                        ],
                    },
                ],
            });
            st.setYamlViewerFilePath(node.data.filePath);
            st.setYamlViewerFqid(null);
            st.setYamlViewerDomainId(domainId);
            st.setYamlViewerOpen(true);
            st.setSidecarOpen(false);
        } catch (e: any) {
            st.showSnackbar("Ошибка восстановления: " + e.message);
        }
    };

    if (!open || !domainId) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setSidecarOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="database" size="sm" />
                        <span className="icon-label">Сгенерированные блоки</span>
                        <span className="help-modal__badge">{domainId}</span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setSidecarOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка манифеста…</div>
                    </div>
                )}

                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {!loading && !error && data && data.stats.blocks === 0 && (
                    <div className="help-modal__body">
                        <div className="generated-empty">
                            <div className="generated-empty__icon">
                                <MIcon name="inventory_2" size="xl" />
                            </div>
                            <div className="generated-empty__title">
                                Ничего не сгенерировано
                            </div>
                            <div className="generated-empty__hint">
                                Используйте «Сгенерировать для домена» или «Сгенерировать»
                                на конкретной сущности. После сохранения YAML записи появятся здесь.
                            </div>
                        </div>
                    </div>
                )}

                {!loading && !error && data && data.stats.blocks > 0 && (
                    <div className="help-modal__body help-modal__body--flush">
                        <div className="generated-summary">
                            <div className="generated-stat">
                                <span className="generated-stat__value">
                                    {data.stats.entities}
                                </span>
                                <span className="generated-stat__label">сущностей</span>
                            </div>
                            <div className="generated-stat">
                                <span className="generated-stat__value">
                                    {data.stats.blocks}
                                </span>
                                <span className="generated-stat__label">блоков</span>
                            </div>
                            <div className="generated-stat generated-stat--ok">
                                <span className="generated-stat__value">
                                    {data.stats.actual}
                                </span>
                                <span className="generated-stat__label">актуальных</span>
                            </div>
                            <div className="generated-stat generated-stat--warn">
                                <span className="generated-stat__value">
                                    {data.stats.modified}
                                </span>
                                <span className="generated-stat__label">изменено вручную</span>
                            </div>
                            <div className="generated-stat generated-stat--err">
                                <span className="generated-stat__value">
                                    {data.stats.orphaned}
                                </span>
                                <span className="generated-stat__label">удалено из YAML</span>
                            </div>
                        </div>

                        <div className="generated-filters">
                            <button
                                className={
                                    "generated-filter" +
                                    (filter === "all" ? " generated-filter--active" : "")
                                }
                                onClick={() => setFilter("all")}
                            >
                                Все ({data.entities.length})
                            </button>
                            <button
                                className={
                                    "generated-filter" +
                                    (filter === "problematic"
                                        ? " generated-filter--active"
                                        : "")
                                }
                                onClick={() => setFilter("problematic")}
                            >
                                С проблемами (
                                {
                                    data.entities.filter(
                                        (e) => e.stats.modified + e.stats.orphaned > 0,
                                    ).length
                                }
                                )
                            </button>
                        </div>

                        <div className="generated-list">
                            {filteredEntities.length === 0 && (
                                <div className="generated-empty">
                                    <div className="generated-empty__title">
                                        Нет записей по фильтру
                                    </div>
                                </div>
                            )}
                            {filteredEntities.map((e) => (
                                <GeneratedEntityRow
                                    key={e.entityId}
                                    entity={e}
                                    expanded={expanded.has(e.entityId)}
                                    onToggle={() => toggleEntity(e.entityId)}
                                    onOpenBlock={openBlockInYaml}
                                    onRestore={restoreOrphaned}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="validation-footer">
                    <div className="validation-stats">
                        {data && data.stats.blocks > 0 && (
                            <>
                                <span className="validation-stat">
                                    📦 {data.stats.blocks} блоков
                                </span>
                                {data.stats.modified > 0 && (
                                    <span className="validation-stat validation-stat--warn">
                                        ✎ {data.stats.modified} изменено
                                    </span>
                                )}
                                {data.stats.orphaned > 0 && (
                                    <span className="validation-stat validation-stat--err">
                                        ⊘ {data.stats.orphaned} удалено
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    <div className="validation-footer__actions">
                        {data && data.stats.blocks > 0 && (
                            <button
                                className="btn btn--danger"
                                onClick={handleClear}
                                disabled={clearing}
                            >
                                {clearing ? "Очистка…" : "Очистить манифест"}
                            </button>
                        )}
                        <button
                            className="btn"
                            onClick={() => store.setSidecarOpen(false)}
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GeneratedEntityRow({
    entity,
    expanded,
    onToggle,
    onOpenBlock,
    onRestore,
}: {
    entity: ManifestEntityView;
    expanded: boolean;
    onToggle: () => void;
    onOpenBlock: (blockId: string, parentViewId?: string) => void;
    onRestore: (entity: ManifestEntityView, blockId: string) => void;
}) {
    return (
        <div className="generated-entity">
            <button className="generated-entity__head" onClick={onToggle}>
                <MIcon
                    name={expanded ? "expand_more" : "chevron_right"}
                    size="sm"
                />
                <code className="generated-entity__id">{entity.entityId}</code>
                <span className="generated-entity__profile">{entity.profile}</span>
                <span className="generated-entity__counts">
                    {entity.stats.total} блоков
                </span>
                <span className="generated-entity__badges">
                    {entity.stats.actual > 0 && (
                        <span className="generated-badge generated-badge--ok">
                            ✓ {entity.stats.actual}
                        </span>
                    )}
                    {entity.stats.modified > 0 && (
                        <span className="generated-badge generated-badge--warn">
                            ✎ {entity.stats.modified}
                        </span>
                    )}
                    {entity.stats.orphaned > 0 && (
                        <span className="generated-badge generated-badge--err">
                            ⊘ {entity.stats.orphaned}
                        </span>
                    )}
                </span>
            </button>
            {expanded && (
                <div className="generated-entity__body">
                    {entity.blocks.map((b) => {
                        const st = STATUS_LABELS[b.status];
                        return (
                            <div
                                key={b.blockId}
                                className={"generated-block generated-block--" + b.status}
                            >
                                <code className="generated-block__id">
                                    {b.blockId}
                                </code>
                                <span className="generated-block__title">
                                    {b.title}
                                </span>
                                <span className={"generated-status " + st.className}>
                                    {st.label}
                                </span>
                                <span className="generated-block__actions">
                                    {b.status !== "orphaned" && (
                                        <button
                                            className="generated-block__action"
                                            onClick={() =>
                                                onOpenBlock(b.blockId, b.parentViewId)
                                            }
                                            title="Открыть в YAML-редакторе на строке блока"
                                        >
                                            <MIcon name="open_in_new" size="sm" />
                                        </button>
                                    )}
                                    {b.status === "orphaned" && (
                                        <button
                                            className="generated-block__action generated-block__action--restore"
                                            onClick={() => onRestore(entity, b.blockId)}
                                            title="Восстановить блок в YAML"
                                        >
                                            <MIcon name="undo" size="sm" />
                                        </button>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}