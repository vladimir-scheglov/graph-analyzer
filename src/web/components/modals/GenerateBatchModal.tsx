import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useGenerateSchemaBatch } from "../../hooks/useGenerateSchemaBatch";
import { MIcon } from "../common/MIcon";
import { hashPayload } from "../../../core/analyzer/schema-generator/util-hash";
import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";

const PROFILE_LABELS: Record<string, string> = {
    crud: "CRUD",
    "crud-with-page": "CRUD + полная карточка",
    dictionary: "Справочник",
    "no-modals": "Без модалок (readonly)",
    "tree-view": "Дерево (tree-view)",
    technical: "Техническая (без UI)",
};

export function GenerateBatchModal() {
    const store = useGraphStore();
    const { index } = useModelIndex();
    const open = store.generateBatchOpen;
    const domainId = store.generateBatchDomainId;

    const [profile, setProfile] = useState("crud");
    const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
    const [options, setOptions] = useState({
        includeBulk: true,
        includePage: false,
        includeLinkageWidgets: true,
        skipExisting: true,
        excludeReadonlyFromCreate: false,
        replaceModified: false,
        treeType: "ordinary" as const,
        treeVariant: "merged" as const,
        treeChunkSize: 20,
        treeOrdering: false,
    });
    const [initialised, setInitialised] = useState(false);


    const allEntities = useMemo(() => {
        if (!index || !domainId) return [] as Array<{ id: string; name: string }>;
        return index.entities
            .filter((e) => e.domainId === domainId)
            .map((e) => ({ id: e.entityId, name: e.name || e.entityId }));
    }, [index, domainId]);

    useEffect(() => {
        if (!open || !domainId) return;
        // ждём, пока index загрузится — иначе allEntities пуст
        if (!index || allEntities.length === 0) return;
        if (initialised) return;   // уже инициализировали в этой сессии

        setProfile("crud");
        setSelectedEntities(new Set(allEntities.map((e) => e.id)));
        setInitialised(true);
    }, [open, domainId, index, allEntities.length, initialised]);

    // сброс при закрытии
    useEffect(() => {
        if (open) return;
        setInitialised(false);
        setSelectedEntities(new Set());
    }, [open]);

    const gen = useGenerateSchemaBatch({
        domainId,
        profile,
        options,
        entityIds: initialised
            ? Array.from(selectedEntities)
            : undefined,
        // enabled только после initialised — fetch не идёт до init
        enabled: open && initialised && selectedEntities.size > 0,
    });

    const toggleEntity = useCallback((id: string) => {
        setSelectedEntities((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelectedEntities((prev) =>
            prev.size === allEntities.length
                ? new Set()
                : new Set(allEntities.map((e) => e.id)),
        );
    }, [allEntities]);

    const apply = useCallback(() => {
        if (!gen.result || !domainId) return;
        const combined = gen.result.combined;
        if (!combined || combined.blocks.length === 0) return;

        const status = combined.manifestStatus ?? {};
        const replaceModified = options.replaceModified === true;

        const blocksToApply = (combined.blocks as GeneratedBlock[]).filter((b) => {
            const st = status[b.blockId];
            if (st === "unchanged" || st === "orphaned") return false;
            if (st === "modified" && !replaceModified) return false;
            return true;
        });

        if (blocksToApply.length === 0) return;

        // Группируем по entityId для pendingManifest
        const perEntity = new Map<string, Array<{ blockId: string; hash: string; title: string; parentViewId?: string }>>();
        for (const b of blocksToApply) {
            // по blockId определяем entityId? Проще — использовать gen.result.results
            // и для каждой сущности брать её blocks. Здесь объединённый массив
            // уже содержит только нужные блоки; сопоставление — через title или payload.entity.
            // Для точности используем маппинг blockId → entityId из результатов.
            const owner = gen.result.results.find(
                (r: any) =>
                    r.result &&
                    r.result.blockIndex &&
                    r.result.blockIndex[b.blockId],
            );
            if (!owner) continue;
            if (!perEntity.has(owner.entityId)) perEntity.set(owner.entityId, []);
            perEntity.get(owner.entityId)!.push({
                blockId: b.blockId,
                hash: hashPayload(b.payload),
                title: b.title,
                parentViewId: b.parentViewId,
            });
        }

        const orphanedByEntity = new Map<string, string[]>();
        for (const [blockId, st] of Object.entries(status)) {
            if (st !== "orphaned") continue;
            if (blocksToApply.some((b) => b.blockId === blockId)) continue;
            const owner = gen.result.results.find(
                (r: any) =>
                    r.result &&
                    r.result.blockIndex &&
                    r.result.blockIndex[blockId],
            );
            if (!owner) continue;
            if (!orphanedByEntity.has(owner.entityId))
                orphanedByEntity.set(owner.entityId, []);
            orphanedByEntity.get(owner.entityId)!.push(blockId);
        }

        const st = useGraphStore.getState();
        st.setYamlViewerPendingGeneration({
            blocks: blocksToApply,
            yamlByBlock: combined.yamlByBlock,
            manifestStatus: status,
            replaceModified,
        });
        st.setYamlViewerPendingManifest({
            domainId,
            profile,
            entities: Array.from(perEntity.entries()).map(([entityId, blocks]) => ({
                entityId,
                blocks,
                orphanedIds: orphanedByEntity.get(entityId),
            })),
        });

        st.setGenerateBatchOpen(false);

        // открыть редактор
        const node = st.nodes.find((n) => n.data.domainId === domainId);
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден");
            return;
        }
        st.setYamlViewerFilePath(node.data.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(domainId);
        st.setYamlViewerOpen(true);
    }, [gen.result, domainId, profile, options.replaceModified, store]);

    if (!open || !domainId) return null;

    const stats = gen.result?.stats;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 450 }}
            onMouseDown={() => store.setGenerateBatchOpen(false)}
        >
            <div
                className="help-modal generate-batch-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="auto_awesome" size="sm" />
                        <span className="icon-label">Пакетная генерация</span>
                        <span className="help-modal__badge">{domainId}</span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setGenerateBatchOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="generate-batch-body">
                    <div className="generate-batch-toolbar">
                        <label className="generate-schema-field">
                            <span>Профиль:</span>
                            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                                {Object.entries(PROFILE_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                ))}
                            </select>
                        </label>
                        <button className="btn" onClick={toggleAll}>
                            {selectedEntities.size === allEntities.length ? "Снять все" : "Выбрать все"}
                        </button>
                        <span className="generate-batch-counter">
                            {selectedEntities.size} / {allEntities.length} сущностей
                        </span>
                    </div>

                    {profile === "tree-view" && (
                        <div className="generate-batch-hint">
                            <MIcon name="info" size="sm" />
                            <span>
                                Для каждой сущности используются все side-1 связи типа 1_n / n_n.
                                Точечный выбор связей — в персональной генерации (Действия → Сгенерировать).
                            </span>
                        </div>
                    )}

                    <div className="generate-batch-layout">
                        <div className="generate-batch-entities">
                            {allEntities.map((e) => (
                                <label key={e.id} className="generate-batch-entity">
                                    <input
                                        type="checkbox"
                                        checked={selectedEntities.has(e.id)}
                                        onChange={() => toggleEntity(e.id)}
                                    />
                                    <span className="generate-batch-entity__id">{e.id}</span>
                                    {e.name !== e.id && (
                                        <span className="generate-batch-entity__name">{e.name}</span>
                                    )}
                                </label>
                            ))}
                        </div>

                        <div className="generate-batch-result">
                            {gen.loading && (
                                <div className="generate-batch-progress">
                                    <div className="generate-batch-progress__head">
                                        <span className="generate-batch-progress__label">
                                            Генерация…
                                        </span>
                                        <span className="generate-batch-progress__counter">
                                            {gen.progress?.current ?? 0} / {gen.progress?.total ?? 0}
                                        </span>
                                        <button
                                            className="btn generate-batch-progress__cancel"
                                            onClick={gen.cancel}
                                        >
                                            Отмена
                                        </button>
                                    </div>
                                    <div className="generate-batch-progress__bar">
                                        <div
                                            className="generate-batch-progress__fill"
                                            style={{
                                                width: `${gen.progress && gen.progress.total > 0
                                                    ? Math.round(
                                                        (gen.progress.current / gen.progress.total) * 100,
                                                    )
                                                    : 0
                                                    }%`,
                                            }}
                                        />
                                    </div>
                                    {gen.progress?.entityId && (
                                        <div className="generate-batch-progress__entity">
                                            {gen.progress.phase === "entity-start" && (
                                                <>
                                                    <MIcon name="hourglass_top" size="sm" />
                                                    <span>{gen.progress.entityId}</span>
                                                </>
                                            )}
                                            {gen.progress.phase === "entity-done" && (
                                                <>
                                                    <MIcon name="check_circle" size="sm" />
                                                    <span>{gen.progress.entityId}</span>
                                                    <span className="generate-batch-progress__meta">
                                                        +{gen.progress.blocksCount ?? 0} блоков
                                                    </span>
                                                </>
                                            )}
                                            {gen.progress.phase === "entity-error" && (
                                                <>
                                                    <MIcon name="error" size="sm" />
                                                    <span>{gen.progress.entityId}</span>
                                                    <span className="generate-batch-progress__meta generate-batch-progress__meta--err">
                                                        {gen.progress.error}
                                                    </span>
                                                </>
                                            )}
                                            {gen.progress.phase === "preflight" && (
                                                <>
                                                    <MIcon name="science" size="sm" />
                                                    <span>Preflight…</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {gen.error && (
                                <div className="generate-schema-error">Ошибка: {gen.error}</div>
                            )}
                            {gen.result && (
                                <div className="generate-batch-summary">
                                    <div className="generate-batch-summary__stats">
                                        <span className="generate-batch-stat">
                                            Всего: <strong>{stats.total}</strong>
                                        </span>
                                        <span className="generate-batch-stat generate-batch-stat--ok">
                                            С блоков: <strong>{stats.generated}</strong>
                                        </span>
                                        <span className="generate-batch-stat generate-batch-stat--warn">
                                            Пусто: <strong>{stats.skipped}</strong>
                                        </span>
                                        {stats.failed > 0 && (
                                            <span className="generate-batch-stat generate-batch-stat--err">
                                                Ошибок: <strong>{stats.failed}</strong>
                                            </span>
                                        )}
                                    </div>
                                    <div className="generate-batch-summary__preflight">
                                        {gen.result.combined.preflight.newIssues.length > 0 && (
                                            <span className="generate-schema-badge generate-schema-badge--error">
                                                ⚠ {gen.result.combined.preflight.newIssues.length} новых error
                                            </span>
                                        )}
                                        {gen.result.combined.preflight.newIssues.length === 0 && (
                                            <span className="generate-schema-badge generate-schema-badge--ok">
                                                ✓ 0 новых lint-проблем
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {gen.result && (
                                <div className="generate-batch-rows">
                                    {gen.result.results.map((r: any) => {
                                        if (r.error) {
                                            return (
                                                <div key={r.entityId} className="generate-batch-row generate-batch-row--err">
                                                    <span className="generate-batch-row__id">{r.entityId}</span>
                                                    <span className="generate-batch-row__msg">{r.error}</span>
                                                </div>
                                            );
                                        }
                                        if (!r.result) return null;
                                        const n = r.result.blocks.length;
                                        return (
                                            <div
                                                key={r.entityId}
                                                className={
                                                    "generate-batch-row" +
                                                    (n === 0 ? " generate-batch-row--skip" : "")
                                                }
                                            >
                                                <span className="generate-batch-row__id">{r.entityId}</span>
                                                <span className="generate-batch-row__msg">
                                                    {n === 0
                                                        ? r.result.skipped.length > 0
                                                            ? r.result.skipped[0].reason
                                                            : "нечего генерировать"
                                                        : `+${n} блоков`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="generate-schema-footer">
                    <div className="generate-schema-preflight">
                        {options.replaceModified && (
                            <span className="generate-schema-badge generate-schema-badge--warn">
                                ⟳ preflight с replace-modified
                            </span>
                        )}
                    </div>
                    <div className="generate-schema-actions">
                        <button
                            className="btn"
                            onClick={() => store.setGenerateBatchOpen(false)}
                        >
                            Отмена
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={apply}
                            disabled={
                                !gen.result ||
                                !gen.result.combined ||
                                gen.result.combined.blocks.length === 0 ||
                                selectedEntities.size === 0 ||
                                gen.result.combined.preflight.newIssues.some(
                                    (i: any) => i.severity === "error",
                                )
                            }
                        >
                            Применить ({gen.result?.combined.blocks.length ?? 0} блоков)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}