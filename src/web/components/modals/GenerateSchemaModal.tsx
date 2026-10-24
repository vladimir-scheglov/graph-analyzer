import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useGenerateSchema } from "../../hooks/useGenerateSchema";
import { MIcon } from "../common/MIcon";
import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";

type Tab = "blocks" | "yaml";

const SECTION_LABELS: Record<string, { label: string; icon: string }> = {
    actions: { label: "Действия", icon: "bolt" },
    views: { label: "Представления", icon: "view_quilt" },
    menus: { label: "Меню", icon: "menu" },
    medias: { label: "Иконки", icon: "image" },
};

const PROFILE_LABELS: Record<string, string> = {
    crud: "CRUD (создание + редактирование + удаление)",
    "crud-with-page": "CRUD с полноэкранной карточкой",
    dictionary: "Справочник (только entity-view)",
};

function iconForBlock(b: GeneratedBlock): string {
    if (b.section === "actions") return "bolt";
    if (b.section === "views") return b.payload?.type === "list" ? "table_rows" : "view_quilt";
    if (b.section === "menus") return "menu";
    if (b.section === "medias") return "image";
    return "circle";
}

export function GenerateSchemaModal() {
    const store = useGraphStore();
    const open = useGraphStore((s) => s.generateSchemaOpen);
    const domainId = useGraphStore((s) => s.generateSchemaDomainId);
    const entityId = useGraphStore((s) => s.generateSchemaEntityId);

    const [profile, setProfile] = useState("crud");
    const [tab, setTab] = useState<Tab>("blocks");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [options, setOptions] = useState({
        includeBulk: true,
        includePage: false,
        includeLinkageWidgets: true,
        skipExisting: true,
        excludeReadonlyFromCreate: false,
        menuRootId: undefined as string | undefined,
    });

    // сброс при открытии
    useEffect(() => {
        if (!open) return;
        setProfile("crud");
        setTab("blocks");
        setSelected(new Set());
        setOptions({
            includeBulk: true,
            includePage: false,
            includeLinkageWidgets: true,
            skipExisting: true,
            excludeReadonlyFromCreate: false,
            menuRootId: undefined,
        });
    }, [open, domainId, entityId]);

    const gen = useGenerateSchema({ domainId, entityId, profile, options, enabled: open });

    // авто-выбор всех блоков при получении результата
    useEffect(() => {
        if (!gen.result) return;
        const next = new Set<string>();
        for (const b of gen.result.blocks as GeneratedBlock[]) next.add(b.blockId);
        setSelected(next);
    }, [gen.result]);

    const grouped = useMemo(() => {
        if (!gen.result) return [] as Array<[string, GeneratedBlock[]]>;
        const map = new Map<string, GeneratedBlock[]>();
        for (const b of gen.result.blocks as GeneratedBlock[]) {
            if (!map.has(b.section)) map.set(b.section, []);
            map.get(b.section)!.push(b);
        }
        return Array.from(map.entries());
    }, [gen.result]);

    const toggleBlock = useCallback(
        (blockId: string) => {
            if (!gen.result) return;
            setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(blockId)) {
                    const toRemove = new Set<string>([blockId]);
                    const queue: string[] = [blockId];
                    while (queue.length > 0) {
                        const cur = queue.pop()!;
                        const block = gen.result.blockIndex?.[cur];
                        if (!block) continue;
                        for (const dep of block.dependents || []) {
                            if (!toRemove.has(dep)) {
                                toRemove.add(dep);
                                queue.push(dep);
                            }
                        }
                    }
                    for (const id of toRemove) next.delete(id);
                } else {
                    next.add(blockId);
                }
                return next;
            });
        },
        [gen.result],
    );

    const dependentsMissing = useMemo(() => {
        if (!gen.result) return new Set<string>();
        const missing = new Set<string>();
        for (const blockId of selected) {
            const block = gen.result.blockIndex?.[blockId];
            if (!block) continue;
            for (const dep of block.dependsOn || []) {
                if (gen.result.blockIndex?.[dep] && !selected.has(dep)) missing.add(blockId);
            }
        }
        return missing;
    }, [selected, gen.result]);

    const pullDependencies = useCallback(() => {
        if (!gen.result) return;
        setSelected((prev) => {
            const next = new Set(prev);
            let changed = true;
            while (changed) {
                changed = false;
                for (const blockId of Array.from(next)) {
                    const block = gen.result.blockIndex?.[blockId];
                    if (!block) continue;
                    for (const dep of block.dependsOn || []) {
                        if (gen.result.blockIndex?.[dep] && !next.has(dep)) {
                            next.add(dep);
                            changed = true;
                        }
                    }
                }
            }
            return next;
        });
    }, [gen.result]);

    const errors = gen.result?.preflight?.newIssues?.filter((i: any) => i.severity === "error") ?? [];
    const warnings = gen.result?.preflight?.newIssues?.filter((i: any) => i.severity === "warning") ?? [];

    const canApply =
        !gen.loading &&
        !!gen.result &&
        selected.size > 0 &&
        dependentsMissing.size === 0 &&
        errors.length === 0;

    const apply = useCallback(() => {
        if (!gen.result || !domainId) return;
        const blocks = (gen.result.blocks as GeneratedBlock[]).filter((b) => selected.has(b.blockId));
        if (blocks.length === 0) return;

        useGraphStore.getState().setYamlViewerPendingGeneration({
            blocks,
            yamlByBlock: gen.result.yamlByBlock,
        });
        useGraphStore.getState().setGenerateSchemaOpen(false);

        const node = store.nodes.find((n) => n.data.domainId === domainId);
        if (!node?.data.filePath) {
            store.showSnackbar("Файл схемы не найден — не могу применить");
            return;
        }
        if (store.yamlViewerOpen && store.yamlViewerFilePath === node.data.filePath) {
            // уже открыт — применится через useEffect в YamlViewer
            return;
        }
        store.setYamlViewerFilePath(node.data.filePath);
        store.setYamlViewerFqid(null);
        store.setYamlViewerDomainId(domainId);
        store.setYamlViewerOpen(true);
    }, [gen.result, selected, domainId, store]);

    if (!open || !domainId || !entityId) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 450 }}
            onMouseDown={() => useGraphStore.getState().setGenerateSchemaOpen(false)}
        >
            <div
                className="help-modal generate-schema-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="auto_fix_high" size="sm" />
                        <span className="icon-label">Генерация схемы</span>
                        <span className="help-modal__badge">{entityId}</span>
                        <span className="help-modal__badge">{domainId}</span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => useGraphStore.getState().setGenerateSchemaOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="generate-schema-body">
                    <div className="generate-schema-options">
                        <label className="generate-schema-field">
                            <span>Профиль:</span>
                            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
                                {Object.entries(PROFILE_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                ))}
                            </select>
                        </label>

                        <div className="generate-schema-checkboxes">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={options.includeBulk}
                                    onChange={(e) => setOptions({ ...options, includeBulk: e.target.checked })}
                                />
                                Массовое удаление
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={options.includePage}
                                    onChange={(e) => setOptions({ ...options, includePage: e.target.checked })}
                                />
                                Полноэкранная карточка
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={options.includeLinkageWidgets}
                                    onChange={(e) =>
                                        setOptions({ ...options, includeLinkageWidgets: e.target.checked })
                                    }
                                />
                                Связи (linkage-виджеты)
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={options.skipExisting}
                                    onChange={(e) => setOptions({ ...options, skipExisting: e.target.checked })}
                                />
                                Пропускать существующее (append-only)
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={options.excludeReadonlyFromCreate}
                                    onChange={(e) =>
                                        setOptions({ ...options, excludeReadonlyFromCreate: e.target.checked })
                                    }
                                />
                                Исключать readonly из формы создания
                            </label>
                        </div>

                        {gen.result?.skipped && gen.result.skipped.length > 0 && (
                            <div className="generate-schema-skipped">
                                <MIcon name="info" size="sm" />
                                <span>Пропущено (уже есть): {gen.result.skipped.length}</span>
                            </div>
                        )}
                    </div>

                    <div className="generate-schema-tabs">
                        <button
                            className={"generate-schema-tab" + (tab === "blocks" ? " active" : "")}
                            onClick={() => setTab("blocks")}
                        >
                            <MIcon name="list" size="sm" /> Блоки ({gen.result?.blocks?.length ?? 0})
                        </button>
                        <button
                            className={"generate-schema-tab" + (tab === "yaml" ? " active" : "")}
                            onClick={() => setTab("yaml")}
                        >
                            <MIcon name="code" size="sm" /> YAML-diff ({selected.size})
                        </button>
                    </div>

                    {tab === "blocks" && (
                        <div className="generate-schema-blocks">
                            {gen.loading && <div className="generate-schema-loading">Генерация…</div>}
                            {gen.error && <div className="generate-schema-error">Ошибка: {gen.error}</div>}
                            {!gen.loading && !gen.error && gen.result && grouped.length === 0 && (
                                <div className="generate-schema-empty">Нечего генерировать — всё уже есть</div>
                            )}
                            {!gen.loading &&
                                !gen.error &&
                                grouped.map(([sectionKey, sectionBlocks]) => (
                                    <div key={sectionKey} className="generate-schema-section">
                                        <div className="generate-schema-section-head">
                                            <MIcon name={SECTION_LABELS[sectionKey]?.icon || "folder"} size="sm" />
                                            <span>{SECTION_LABELS[sectionKey]?.label || sectionKey}</span>
                                            <span className="generate-schema-section-count">{sectionBlocks.length}</span>
                                        </div>
                                        {sectionBlocks.map((b) => {
                                            const isSelected = selected.has(b.blockId);
                                            const hasMissingDep = dependentsMissing.has(b.blockId);
                                            return (
                                                <label
                                                    key={b.blockId}
                                                    className={
                                                        "generate-schema-block" +
                                                        (hasMissingDep ? " generate-schema-block--warn" : "")
                                                    }
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleBlock(b.blockId)}
                                                    />
                                                    <MIcon name={iconForBlock(b)} size="sm" />
                                                    <span className="generate-schema-block-title">{b.title}</span>
                                                    <code className="generate-schema-block-id">{b.blockId}</code>
                                                    {hasMissingDep && (
                                                        <span className="generate-schema-block-warn" title="Снята зависимость">
                                                            <MIcon name="warning" size="sm" />
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                ))}
                        </div>
                    )}

                    {tab === "yaml" && (
                        <div className="generate-schema-yaml">
                            {gen.result && selected.size === 0 && (
                                <div className="generate-schema-empty">Ничего не выбрано</div>
                            )}
                            {gen.result &&
                                (gen.result.blocks as GeneratedBlock[])
                                    .filter((b) => selected.has(b.blockId))
                                    .map((b) => (
                                        <div key={b.blockId} className="generate-schema-yaml-block">
                                            <div className="generate-schema-yaml-title"># {b.title}</div>
                                            <pre>{gen.result!.yamlByBlock[b.blockId] || ""}</pre>
                                        </div>
                                    ))}
                        </div>
                    )}
                </div>

                <div className="generate-schema-footer">
                    <div className="generate-schema-preflight">
                        {errors.length > 0 && (
                            <span className="generate-schema-badge generate-schema-badge--error">
                                ⚠ {errors.length} новых ошибок
                            </span>
                        )}
                        {warnings.length > 0 && (
                            <span className="generate-schema-badge generate-schema-badge--warn">
                                ⚠ {warnings.length} предупреждений
                            </span>
                        )}
                        {errors.length === 0 && warnings.length === 0 && gen.result && (
                            <span className="generate-schema-badge generate-schema-badge--ok">
                                ✓ 0 новых lint-проблем
                            </span>
                        )}
                    </div>
                    <div className="generate-schema-actions">
                        <button className="btn" onClick={() => useGraphStore.getState().setGenerateSchemaOpen(false)}>
                            Отмена
                        </button>
                        <button className="btn" onClick={pullDependencies} disabled={!gen.result}>
                            Дотянуть зависимости
                        </button>
                        <button className="btn btn--primary" onClick={apply} disabled={!canApply}>
                            Применить (append)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}