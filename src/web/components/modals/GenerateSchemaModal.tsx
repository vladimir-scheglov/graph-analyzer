// src/web/components/modals/GenerateSchemaModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useGenerateSchema } from "../../hooks/useGenerateSchema";
import { MIcon } from "../common/MIcon";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { hashPayload } from "../../../core/analyzer/schema-generator/util-hash";
import { TreeLinkageSelector } from "./TreeLinkageSelector";
import { groupYamlBySection } from "./GenerateSchemaYaml";
import { PROFILE_INFO, getProfileInfo } from "./GenerateSchemaProfiles";
import {
    humanizeSkipReason,
    skipReasonIcon,
} from "./GenerateSchemaSkipReasons";
import type { GeneratedBlock, TreeChain } from "../../../core/analyzer/schema-generator/types";
import { TreeChainBuilder } from "./TreeChainBuilder";
import { EntityRecord } from "../../../shared/model-types";

type Tab = "options" | "blocks" | "yaml" | "skipped" | "issues";

const PROFILE_ORDER = PROFILE_INFO.map((p) => p.id);

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

function iconForBlock(b: GeneratedBlock): string {
    const kind = b.blockId.split(":")[0];
    if (kind === "tree") return "account_tree";
    if (kind === "action") return "bolt";
    if (kind === "menuItem") return "menu";
    if (kind === "media") return "image";
    if (kind === "widget") {
        const t = b.payload?.type;
        if (t === "attribute") return "edit_note";
        if (t === "action") return "smart_button";
        if (t === "linkage") return "link";
        if (t === "linkage_list") return "list_alt";
        return "widgets";
    }
    if (kind === "group") {
        const t = b.payload?.type;
        if (t === "form") return "description";
        if (t === "block") return "view_module";
        if (t === "tab") return "tab";
        return "view_module";
    }
    if (kind === "view") {
        const t = b.payload?.type;
        if (t === "list") return "table_rows";
        if (t === "tree") return "account_tree";
        if (t === "panel") return "view_sidebar";
        if (t === "modal") return "open_in_new";
        if (t === "page") return "fullscreen";
        return "view_quilt";
    }
    return "circle";
}

function statusBadge(status: string | undefined) {
    if (!status || status === "new") return null;
    if (status === "unchanged") {
        return (
            <span
                className="generate-schema-block-badge generate-schema-block-badge--unchanged"
                title="Уже есть в YAML и совпадает с моделью — аппенда не будет"
            >
                ✓ есть
            </span>
        );
    }
    if (status === "outdated") {
        return (
            <span
                className="generate-schema-block-badge generate-schema-block-badge--outdated"
                title="Сгенерировано ранее — модель изменилась. Блок будет заменён при apply. Снимите галку, чтобы оставить как есть."
            >
                ⚠ модель изменилась
            </span>
        );
    }
    if (status === "modified") {
        return (
            <span
                className="generate-schema-block-badge generate-schema-block-badge--modified"
                title="Изменён вручную после генерации. Включение перезапишет правки (нужна опция «Перезаписывать изменённые вручную»)."
            >
                ✎ правка вручную
            </span>
        );
    }
    if (status === "orphaned") {
        return (
            <span
                className="generate-schema-block-badge generate-schema-block-badge--orphaned"
                title="Был сгенерирован, но удалён из YAML. Поставьте галку, чтобы восстановить."
            >
                ⊘ удалён из YAML
            </span>
        );
    }
    return null;
}

export function GenerateSchemaModal() {
    const store = useGraphStore();
    const { index } = useModelIndex();
    const open = useGraphStore((s) => s.generateSchemaOpen);
    const domainId = useGraphStore((s) => s.generateSchemaDomainId);
    const entityId = useGraphStore((s) => s.generateSchemaEntityId);

    const [profile, setProfile] = useState("crud");
    const [tab, setTab] = useState<Tab>("options");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showHelp, setShowHelp] = useState(false);
    const [collapsed, setCollapsed] = useState<Set<string>>(
        new Set(["issues-rule"]),
    );

    const [options, setOptions] = useState({
        includeBulk: true,
        includePage: false,
        includeLinkageWidgets: true,
        skipExisting: true,
        excludeReadonlyFromCreate: false,
        skipManuallyModified: true,
        replaceModified: false,
        treeType: "ordinary" as "ordinary" | "orderable" | "multiparent",
        treeVariant: "merged" as "merged" | "splitted",
        treeChunkSize: 20,
        treeOrdering: false,
        menuRootId: undefined as string | undefined,
        treeChain: undefined as TreeChain | undefined,
        treeUseExistingId: undefined as string | undefined,
    });

    useEffect(() => {
        if (!open) return;
        setProfile("crud");
        setTab("options");
        setSelected(new Set());
        setShowHelp(false);
        setCollapsed(new Set(["issues-rule"]));
        setOptions({
            includeBulk: true,
            includePage: false,
            includeLinkageWidgets: true,
            skipExisting: true,
            excludeReadonlyFromCreate: false,
            skipManuallyModified: true,
            replaceModified: false,
            treeType: "ordinary",
            treeVariant: "merged",
            treeChunkSize: 20,
            treeOrdering: false,
            treeChain: undefined,
            treeUseExistingId: undefined,
            menuRootId: undefined,
        });
    }, [open, domainId, entityId]);

    const gen = useGenerateSchema({
        domainId,
        entityId,
        profile,
        options,
        enabled: open,
    });

    useEffect(() => {
        if (!gen.result) return;
        const next = new Set<string>();
        const status = gen.result.manifestStatus ?? {};
        for (const b of gen.result.blocks as GeneratedBlock[]) {
            const st = status[b.blockId];
            if (st === "unchanged") continue;
            if (st === "orphaned") continue;
            if (
                st === "modified" &&
                options.skipManuallyModified !== false
            ) {
                continue;
            }
            next.add(b.blockId);
        }
        setSelected(next);
    }, [gen.result, options.skipManuallyModified]);

    const profileInfo = useMemo(() => getProfileInfo(profile), [profile]);

    const menuRoots = useMemo(() => {
        if (!index || !domainId) return [] as Array<{ id: string; route: string; type: string }>;
        return (
            index.schemasByDomain[domainId]?.sections.menus.items
                ?.filter((m) => m.type === "root_group" || m.type === "root_menu")
                .map((m) => ({ id: m.id, route: m.route, type: m.type })) ?? []
        );
    }, [index, domainId]);

    useEffect(() => {
        if (!open) return;
        if (!menuRoots.length) return;
        if (options.menuRootId) return;
        setOptions((o) => ({ ...o, menuRootId: menuRoots[0].id }));
    }, [open, menuRoots, options.menuRootId]);

    const hasTreeCandidates = useMemo(() => {
        if (!index || !domainId || !entityId) return false;
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        const ancestors = new Set<string>();
        let cur: EntityRecord | undefined = index.entitiesByFqid[fqid];
        let guard = 0;
        while (cur && guard < 20) {
            ancestors.add(cur.fqid.toLowerCase());
            cur = cur.inherits ? index.entitiesByFqid[cur.inherits] : undefined;
            guard++;
        }
        return index.entityLinkages.some(
            (l) =>
                ancestors.has(l.side1Fqid.toLowerCase()) ||
                ancestors.has(l.side2Fqid.toLowerCase()),
        );
    }, [index, domainId, entityId]);

    useEffect(() => {
        if (profile === "tree-view" && !hasTreeCandidates) {
            setProfile("crud");
        }
    }, [profile, hasTreeCandidates]);

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
                        const block = gen.result!.blockIndex?.[cur];
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
                    const st = gen.result!.manifestStatus?.[blockId];
                    if (st === "modified") {
                        setOptions((o) => ({ ...o, replaceModified: true }));
                    }
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
                if (gen.result.blockIndex?.[dep] && !selected.has(dep)) {
                    missing.add(blockId);
                }
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
                    const block = gen.result!.blockIndex?.[blockId];
                    if (!block) continue;
                    for (const dep of block.dependsOn || []) {
                        if (gen.result!.blockIndex?.[dep] && !next.has(dep)) {
                            next.add(dep);
                            changed = true;
                        }
                    }
                }
            }
            return next;
        });
    }, [gen.result]);

    const toggleSection = (key: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // --- grouped blocks ---
    const groupedBlocks = useMemo(() => {
        if (!gen.result) return [] as Array<[string, GeneratedBlock[]]>;
        const map = new Map<string, GeneratedBlock[]>();
        for (const b of gen.result.blocks as GeneratedBlock[]) {
            if (!map.has(b.section)) map.set(b.section, []);
            map.get(b.section)!.push(b);
        }
        return Array.from(map.entries());
    }, [gen.result]);

    const sectionLabels: Record<string, { label: string; icon: string }> = {
        actions: { label: "Действия", icon: "bolt" },
        views: { label: "Представления", icon: "view_quilt" },
        trees: { label: "Деревья", icon: "account_tree" },
        menus: { label: "Меню", icon: "menu" },
        medias: { label: "Иконки", icon: "image" },
        dataRules: { label: "Правила данных", icon: "rule" },
        dataTypes: { label: "Типы данных", icon: "data_object" },
        linkages: { label: "Связи", icon: "link" },
        entities: { label: "Сущности", icon: "category" },
        sequences: { label: "Последовательности", icon: "linear_scale" },
    };

    // --- yaml grouped ---
    const yamlSections = useMemo(() => {
        if (!gen.result) return [];
        return groupYamlBySection(
            gen.result.blocks as GeneratedBlock[],
            selected,
            gen.result.yamlByBlock,
        );
    }, [gen.result, selected]);

    // --- issues ---
    const allIssues = (gen.result?.preflight?.newIssues ?? []) as Array<{
        ruleId: string;
        rule: string;
        severity: string;
        message: string;
    }>;
    const errorCount = allIssues.filter((i) => i.severity === "error").length;
    const warningCount = allIssues.filter((i) => i.severity === "warning").length;
    const infoCount = allIssues.filter((i) => i.severity === "info").length;

    const issuesByRule = useMemo(() => {
        const map = new Map<string, typeof allIssues>();
        for (const issue of allIssues) {
            if (!map.has(issue.ruleId)) map.set(issue.ruleId, []);
            map.get(issue.ruleId)!.push(issue);
        }
        return Array.from(map.entries()).sort((a, b) => {
            const sa = SEVERITY_ORDER[a[1][0].severity] ?? 99;
            const sb = SEVERITY_ORDER[b[1][0].severity] ?? 99;
            if (sa !== sb) return sa - sb;
            return b[1].length - a[1].length;
        });
    }, [allIssues]);

    // --- skipped ---
    const skipped = gen.result?.skipped ?? [];

    const canApply =
        !gen.loading &&
        !!gen.result &&
        profile !== "technical" &&
        selected.size > 0 &&
        dependentsMissing.size === 0 &&
        errorCount === 0;

    const apply = useCallback(() => {
        if (!gen.result || !domainId || !entityId) return;
        if (profile === "technical") {
            useGraphStore.getState().setGenerateSchemaOpen(false);
            return;
        }

        const status = gen.result.manifestStatus ?? {};
        const replaceModified = options.replaceModified === true;

        const blocksToApply = (gen.result.blocks as GeneratedBlock[]).filter((b) => {
            const st = status[b.blockId];
            if (st === "unchanged") return false;
            if (st === "orphaned") return selected.has(b.blockId);
            if (st === "modified" && !replaceModified) return false;
            return selected.has(b.blockId);
        });

        const restoreOrphanedIds = (gen.result.blocks as GeneratedBlock[])
            .filter(
                (b) => status[b.blockId] === "orphaned" && selected.has(b.blockId),
            )
            .map((b) => b.blockId);

        const orphanedIds = Object.entries(status)
            .filter(
                ([id, st]) =>
                    st === "orphaned" && !restoreOrphanedIds.includes(id),
            )
            .map(([id]) => id);

        if (blocksToApply.length === 0 && orphanedIds.length === 0) return;

        const st = useGraphStore.getState();
        st.setYamlViewerPendingGeneration({
            blocks: blocksToApply,
            yamlByBlock: gen.result.yamlByBlock,
            manifestStatus: status,
            replaceModified,
            restoreOrphanedIds:
                restoreOrphanedIds.length > 0 ? restoreOrphanedIds : undefined,
        });
        st.setYamlViewerPendingManifest({
            domainId,
            profile,
            entities: [
                {
                    entityId,
                    blocks: blocksToApply.map((b) => ({
                        blockId: b.blockId,
                        hash: hashPayload(b.payload),
                        title: b.title,
                        parentViewId: b.parentViewId,
                    })),
                    orphanedIds: orphanedIds.length > 0 ? orphanedIds : undefined,
                },
            ],
        });
        st.setGenerateSchemaOpen(false);

        const node = st.nodes.find((n) => n.data.domainId === domainId);
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден");
            return;
        }
        if (st.yamlViewerOpen && st.yamlViewerFilePath === node.data.filePath) {
            return;
        }
        st.setYamlViewerFilePath(node.data.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(domainId);
        st.setYamlViewerOpen(true);
    }, [gen.result, selected, domainId, entityId, profile, options.replaceModified]);

    if (!open || !domainId || !entityId) return null;

    const tabs: Array<{
        key: Tab;
        label: string;
        count?: number;
        severity?: "error" | "warning";
    }> = [
            { key: "options", label: "Опции" },
            {
                key: "blocks",
                label: "Блоки",
                count: gen.result?.blocks?.length,
            },
            {
                key: "yaml",
                label: "YAML",
                count: selected.size,
            },
            ...(skipped.length > 0
                ? [{ key: "skipped" as Tab, label: "Пропущено", count: skipped.length }]
                : []),
            ...(allIssues.length > 0
                ? [{
                    key: "issues" as Tab,
                    label: "Проблемы",
                    count: allIssues.length,
                    severity: (errorCount > 0 ? "error" : "warning") as
                        | "error"
                        | "warning",
                }]
                : []),
        ];

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
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="auto_fix_high" size="sm" />
                        <span className="icon-label">Генерация схемы</span>
                        <span className="help-modal__badge">{entityId}</span>
                        <span className="help-modal__badge">{domainId}</span>
                        {profileInfo && (
                            <span className="generate-schema-profile-badge">
                                {profileInfo.label}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как это работает?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setGenerateSchemaOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* ============ TABS ============ */}
                <div className="generate-schema-tabs">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            className={
                                "generate-schema-tab" +
                                (tab === t.key ? " active" : "") +
                                (t.severity === "error"
                                    ? " generate-schema-tab--error"
                                    : t.severity === "warning"
                                        ? " generate-schema-tab--warning"
                                        : "")
                            }
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}
                            {t.count != null && t.count > 0 && (
                                <span className="generate-schema-tab__count">
                                    {t.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ============ CONTENT ============ */}
                <div className="generate-schema-content">
                    {showHelp && (
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что делает генератор">
                                <HelpText>
                                    Создаёт типовые блоки схемы домена для одной
                                    сущности: действия, представления, меню, иконки.
                                    Работает как <strong>append</strong>: существующие
                                    блоки не перезаписываются, если не выбрана
                                    опция «Перезаписывать изменённые вручную».
                                </HelpText>
                            </HelpSection>
                            <HelpSection title="Профили">
                                <HelpList>
                                    <li>
                                        <strong>CRUD</strong> — полный жизненный
                                        цикл сущности.
                                    </li>
                                    <li>
                                        <strong>CRUD + полная карточка</strong> —
                                        плюс pages_infoX (требует menus[]).
                                    </li>
                                    <li>
                                        <strong>Справочник</strong> — только
                                        entity-view с editors, без actions/menu/list.
                                    </li>
                                    <li>
                                        <strong>Без модалок</strong> — readonly:
                                        list + панель, без форм.
                                    </li>
                                    <li>
                                        <strong>Дерево</strong> — иерархический
                                        просмотр по side-1 связям.
                                    </li>
                                    <li>
                                        <strong>Техническая</strong> — ничего не
                                        генерирует, помечает сущность как
                                        «без UI».
                                    </li>
                                </HelpList>
                            </HelpSection>
                            <HelpSection title="Статусы блоков">
                                <HelpList>
                                    <li>
                                        <strong>Без статуса</strong> — новый блок,
                                        будет добавлен.
                                    </li>
                                    <li>
                                        <strong>✓ есть</strong> — уже в YAML и
                                        совпадает с моделью. Не аппендится.
                                    </li>
                                    <li>
                                        <strong>⚠ модель изменилась</strong> —
                                        сгенерировано ранее, но модель
                                        поменялась. Будет <strong>заменён</strong>.
                                    </li>
                                    <li>
                                        <strong>✎ правка вручную</strong> — YAML
                                        правили после генерации. Не перезаписывается,
                                        если не включить «Перезаписывать изменённые
                                        вручную».
                                    </li>
                                    <li>
                                        <strong>⊘ удалён из YAML</strong> — был
                                        сгенерирован, но удалён. Включите галку,
                                        чтобы восстановить.
                                    </li>
                                </HelpList>
                            </HelpSection>
                            <HelpSection title="Зависимости и кнопка «Включить зависимости»">
                                <HelpText>
                                    Некоторые блоки ссылаются на другие (кнопка
                                    требует действие, модалка — форму). При
                                    снятии блока-зависимости приложение не
                                    применится. Кнопка <strong>«Включить
                                        зависимости»</strong> автоматически ставит
                                    галки на всё, от чего зависят выбранные.
                                </HelpText>
                            </HelpSection>
                            <HelpSection title="Preflight">
                                <HelpText>
                                    Перед применением генератор прогоняет линтер на
                                    модели + сгенерированных блоках. Видите 0
                                    новых проблем — можно применять. Есть errors —
                                    кнопка Apply блокируется. Warnings — можно
                                    применять, но стоит посмотреть.
                                </HelpText>
                            </HelpSection>
                        </ModalHelp>
                    )}

                    {/* ============ TAB: OPTIONS ============ */}
                    {tab === "options" && (
                        <div className="generate-schema-options">
                            {/* Профиль */}
                            <div className="generate-schema-block-group">
                                <div className="generate-schema-block-group__title">
                                    <MIcon name="tune" size="sm" />
                                    Профиль
                                </div>
                                <div className="generate-schema-profile-picker">
                                    <select
                                        value={profile}
                                        onChange={(e) => setProfile(e.target.value)}
                                    >
                                        {PROFILE_ORDER.map((id) => {
                                            const info = getProfileInfo(id)!;
                                            const disabled =
                                                id === "tree-view" &&
                                                !hasTreeCandidates;
                                            return (
                                                <option
                                                    key={id}
                                                    value={id}
                                                    disabled={disabled}
                                                >
                                                    {info.label}
                                                    {disabled
                                                        ? " (нет связей side-1)"
                                                        : ""}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                {profileInfo && (
                                    <div className="generate-schema-profile-card">
                                        <div className="generate-schema-profile-card__short">
                                            {profileInfo.short}
                                        </div>
                                        <ul className="generate-schema-profile-card__list">
                                            {profileInfo.details.map((d, i) => (
                                                <li key={i}>
                                                    <MIcon name={d.icon} size="sm" />
                                                    <span>{d.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="generate-schema-profile-card__when">
                                            <strong>Когда выбирать:</strong>{" "}
                                            {profileInfo.when}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Настройки — 2 колонки */}
                            <div className="generate-schema-settings-grid">
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="checklist" size="sm" />
                                        Что включить
                                    </div>

                                    <label
                                        className="generate-schema-option"
                                        title="Массовое удаление — action + кнопка + пункт в контекстном меню list-view"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={options.includeBulk}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    includeBulk: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Массовое удаление</span>
                                    </label>

                                    <label
                                        className={
                                            "generate-schema-option" +
                                            (menuRoots.length === 0
                                                ? " generate-schema-option--disabled"
                                                : "")
                                        }
                                        title={
                                            menuRoots.length === 0
                                                ? "Создайте root_group в menus[] — иначе pages_infoX.menuItem некуда ссылаться"
                                                : "Полноэкранная карточка (pages_infoX + action open_page). Требует root_group в menus[]"
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                options.includePage &&
                                                menuRoots.length > 0
                                            }
                                            disabled={menuRoots.length === 0}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    includePage: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Полноэкранная карточка
                                            {menuRoots.length === 0 && (
                                                <MIcon
                                                    name="warning"
                                                    size="sm"
                                                    className="generate-schema-option__warn"
                                                />
                                            )}
                                        </span>
                                    </label>

                                    <label
                                        className="generate-schema-option"
                                        title="Linkage-виджеты для связей сущности. Для n_n и side-1 1_n — linkage_list с выделенной вкладкой; для side-2 1_n и 1_1 — компактный linkage внутри blocks_infoX"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={options.includeLinkageWidgets}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    includeLinkageWidgets:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Связи (linkage-виджеты)</span>
                                    </label>

                                    <label
                                        className="generate-schema-option"
                                        title="Включать readonly-атрибуты в форму создания. По умолчанию — да (как в типовых схемах). Снимите, если readonly-поля должны заполняться только системой"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                options.excludeReadonlyFromCreate
                                            }
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    excludeReadonlyFromCreate:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Исключать readonly из формы создания</span>
                                    </label>
                                </div>

                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="history" size="sm" />
                                        Поведение
                                    </div>

                                    <label
                                        className="generate-schema-option"
                                        title="Не генерировать блоки, которые уже есть в YAML. Рекомендуется держать включённым — иначе получите дубликаты"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={options.skipExisting}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    skipExisting: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Пропускать существующие</span>
                                    </label>

                                    <label
                                        className="generate-schema-option"
                                        title="Блоки, изменённые вручную после генерации, не включаются по умолчанию. Если галка включена — такие блоки тоже auto-check при открытии"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                options.skipManuallyModified !==
                                                false
                                            }
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    skipManuallyModified:
                                                        e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Не трогать изменённые вручную
                                        </span>
                                    </label>

                                    <label
                                        className="generate-schema-option"
                                        title="Перезаписывать блоки, отредактированные вручную после генерации. Preflight будет пересчитан. Осторожно: ручные правки потеряются"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                options.replaceModified === true
                                            }
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    replaceModified: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Перезаписывать изменённые вручную</span>
                                    </label>
                                </div>
                            </div>

                            {/* Tree-specific */}
                            {profile === "tree-view" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="account_tree" size="sm" />
                                        Параметры дерева
                                    </div>

                                    <div className="generate-schema-tree-grid">
                                        <label
                                            className="generate-schema-field"
                                            title="ordinary — обычное дерево. orderable — с перетаскиванием узлов. multiparent — узел может быть в нескольких родителях (только для n_n)"
                                        >
                                            <span>Тип дерева:</span>
                                            <select
                                                value={options.treeType}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        treeType: e.target
                                                            .value as typeof options.treeType,
                                                    })
                                                }
                                            >
                                                <option value="ordinary">Обычное</option>
                                                <option value="orderable">С сортировкой</option>
                                                <option value="multiparent">
                                                    Мульти-родитель (n_n)
                                                </option>
                                            </select>
                                        </label>

                                        <label
                                            className="generate-schema-field"
                                            title="merged — дерево + таблица в одном окне. splitted — два окна: слева дерево, справа список объектов. Splitted требует отдельного list-view"
                                        >
                                            <span>Вариант:</span>
                                            <select
                                                value={options.treeVariant}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        treeVariant: e.target
                                                            .value as typeof options.treeVariant,
                                                    })
                                                }
                                            >
                                                <option value="merged">Одним окном</option>
                                                <option value="splitted">Два окна</option>
                                            </select>
                                        </label>

                                        <label
                                            className="generate-schema-field"
                                            title="Сколько дочерних узлов показывать при раскрытии. Пагинация в дереве"
                                        >
                                            <span>Пагинация узлов:</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={100}
                                                value={options.treeChunkSize}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        treeChunkSize: Math.max(
                                                            1,
                                                            Math.min(
                                                                100,
                                                                parseInt(
                                                                    e.target.value,
                                                                    10,
                                                                ) || 20,
                                                            ),
                                                        ),
                                                    })
                                                }
                                                style={{ width: 80 }}
                                            />
                                        </label>

                                        {options.treeType === "orderable" && (
                                            <label
                                                className="generate-schema-option"
                                                title="Разрешить пользователю перетаскивать узлы в дереве"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={options.treeOrdering}
                                                    onChange={(e) =>
                                                        setOptions({
                                                            ...options,
                                                            treeOrdering:
                                                                e.target.checked,
                                                        })
                                                    }
                                                />
                                                <span>Разрешить перетаскивание</span>
                                            </label>
                                        )}
                                    </div>

                                    <TreeChainBuilder
                                        index={index}
                                        domainId={domainId}
                                        rootEntityId={entityId}
                                        value={options.treeChain}
                                        useExistingId={options.treeUseExistingId}
                                        onChangeChain={(v) =>
                                            setOptions({ ...options, treeChain: v, treeUseExistingId: undefined })
                                        }
                                        onChangeUseExisting={(id) =>
                                            setOptions({ ...options, treeUseExistingId: id, treeChain: undefined })
                                        }
                                        existingTrees={
                                            (index?.trees || [])
                                                .filter((t) => t.domainId === domainId)
                                                .map((t) => ({ id: t.id, name: t.name || t.id, hierarchy: t.hierarchy }))
                                        }
                                    />
                                </div>
                            )}

                            {/* Technical disclaimer */}
                            {profile === "technical" && (
                                <div className="generate-schema-technical">
                                    <div className="generate-schema-technical__icon">
                                        <MIcon name="settings_suggest" size="xl" />
                                    </div>
                                    <div className="generate-schema-technical__title">
                                        Техническая сущность
                                    </div>
                                    <div className="generate-schema-technical__text">
                                        Для неё UI не генерируется: она используется
                                        только как <strong>Reference-target</strong>,
                                        справочник кодов или вспомогательная
                                        сущность, наполняемая автоматизацией.
                                    </div>
                                    <div className="generate-schema-technical__hint">
                                        Нужен минимальный entity-view (карточка по
                                        клику на тег в Reference)? Выберите профиль{" "}
                                        <strong>«Справочник»</strong>.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ TAB: BLOCKS ============ */}
                    {tab === "blocks" && (
                        <div className="generate-schema-blocks">
                            {gen.loading && (
                                <div className="generate-schema-loading">
                                    Генерация…
                                </div>
                            )}
                            {gen.error && (
                                <div className="generate-schema-error">
                                    Ошибка: {gen.error}
                                </div>
                            )}
                            {!gen.loading &&
                                !gen.error &&
                                gen.result &&
                                groupedBlocks.length === 0 && (
                                    <div className="generate-schema-empty">
                                        Нечего генерировать — всё уже есть
                                    </div>
                                )}

                            {!gen.loading &&
                                !gen.error &&
                                groupedBlocks.map(([sectionKey, blocks]) => {
                                    const meta = sectionLabels[sectionKey] || {
                                        label: sectionKey,
                                        icon: "folder",
                                    };
                                    const key = `sect-${sectionKey}`;
                                    const isCollapsed = collapsed.has(key);
                                    const selectedCount = blocks.filter((b) =>
                                        selected.has(b.blockId),
                                    ).length;

                                    return (
                                        <div
                                            key={key}
                                            className={
                                                "generate-schema-section" +
                                                (isCollapsed
                                                    ? " generate-schema-section--collapsed"
                                                    : "")
                                            }
                                        >
                                            <button
                                                className="generate-schema-section-head"
                                                onClick={() =>
                                                    toggleSection(key)
                                                }
                                            >
                                                <MIcon
                                                    name={
                                                        isCollapsed
                                                            ? "chevron_right"
                                                            : "expand_more"
                                                    }
                                                    size="sm"
                                                />
                                                <MIcon
                                                    name={meta.icon}
                                                    size="sm"
                                                />
                                                <span>{meta.label}</span>
                                                <span className="generate-schema-section-count">
                                                    {selectedCount} / {blocks.length}
                                                </span>
                                            </button>
                                            {!isCollapsed &&
                                                blocks.map((b) => {
                                                    const isSelected =
                                                        selected.has(b.blockId);
                                                    const hasMissingDep =
                                                        dependentsMissing.has(
                                                            b.blockId,
                                                        );
                                                    const st =
                                                        gen.result?.manifestStatus?.[
                                                        b.blockId
                                                        ];
                                                    return (
                                                        <label
                                                            key={b.blockId}
                                                            className={
                                                                "generate-schema-block" +
                                                                (hasMissingDep
                                                                    ? " generate-schema-block--warn"
                                                                    : "") +
                                                                (st
                                                                    ? ` generate-schema-block--${st}`
                                                                    : "")
                                                            }
                                                            title={b.title}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    isSelected
                                                                }
                                                                onChange={() =>
                                                                    toggleBlock(
                                                                        b.blockId,
                                                                    )
                                                                }
                                                            />
                                                            <MIcon
                                                                name={iconForBlock(
                                                                    b,
                                                                )}
                                                                size="sm"
                                                            />
                                                            <span className="generate-schema-block-title">
                                                                {b.title}
                                                            </span>
                                                            <code className="generate-schema-block-id">
                                                                {b.blockId}
                                                            </code>
                                                            {statusBadge(st)}
                                                            {hasMissingDep && (
                                                                <span
                                                                    className="generate-schema-block-warn"
                                                                    title="Снята зависимость"
                                                                >
                                                                    <MIcon
                                                                        name="warning"
                                                                        size="sm"
                                                                    />
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {/* ============ TAB: YAML ============ */}
                    {tab === "yaml" && (
                        <div className="generate-schema-yaml">
                            {gen.result && selected.size === 0 && (
                                <div className="generate-schema-empty">
                                    Ничего не выбрано. Отметьте блоки на вкладке
                                    «Блоки».
                                </div>
                            )}
                            {yamlSections.map((section) => {
                                const key = `yaml-${section.key}`;
                                const isCollapsed = collapsed.has(key);
                                return (
                                    <div
                                        key={key}
                                        className={
                                            "generate-schema-section" +
                                            (isCollapsed
                                                ? " generate-schema-section--collapsed"
                                                : "")
                                        }
                                    >
                                        <button
                                            className="generate-schema-section-head"
                                            onClick={() => toggleSection(key)}
                                        >
                                            <MIcon
                                                name={
                                                    isCollapsed
                                                        ? "chevron_right"
                                                        : "expand_more"
                                                }
                                                size="sm"
                                            />
                                            <span>{section.label}</span>
                                            <span className="generate-schema-section-count">
                                                {section.blocks.length}
                                            </span>
                                        </button>
                                        {!isCollapsed &&
                                            section.blocks.map(
                                                ({ block, yaml }) => (
                                                    <div
                                                        key={block.blockId}
                                                        className="generate-schema-yaml-block"
                                                    >
                                                        <div className="generate-schema-yaml-title">
                                                            # {block.title}
                                                        </div>
                                                        <pre>{yaml}</pre>
                                                    </div>
                                                ),
                                            )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ============ TAB: SKIPPED ============ */}
                    {tab === "skipped" && (
                        <div className="generate-schema-skipped-list">
                            {skipped.length === 0 && (
                                <div className="generate-schema-empty">
                                    Всё, что нужно, будет сгенерировано
                                </div>
                            )}
                            {skipped.map((s) => (
                                <div
                                    key={`${s.section}:${s.id}:${s.reason}`}
                                    className="generate-schema-skipped-row"
                                >
                                    <MIcon
                                        name={skipReasonIcon(s.reason)}
                                        size="sm"
                                    />
                                    <code className="generate-schema-skipped-row__id">
                                        {s.id}
                                    </code>
                                    <span className="generate-schema-skipped-row__reason">
                                        {humanizeSkipReason(s.reason)}
                                    </span>
                                    <span className="generate-schema-skipped-row__section">
                                        {s.section}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ============ TAB: ISSUES ============ */}
                    {tab === "issues" && (
                        <div className="generate-schema-issues">
                            {allIssues.length === 0 && (
                                <div className="generate-schema-empty">
                                    <MIcon
                                        name="check_circle"
                                        size="lg"
                                        className="generate-schema-empty__ok"
                                    />
                                    <div>0 новых проблем</div>
                                </div>
                            )}
                            {issuesByRule.map(([ruleId, items]) => {
                                const key = `rule-${ruleId}`;
                                const isCollapsed = collapsed.has(key);
                                const sev = items[0].severity;
                                return (
                                    <div
                                        key={key}
                                        className={
                                            "generate-schema-issue-group generate-schema-issue-group--" +
                                            sev
                                        }
                                    >
                                        <button
                                            className="generate-schema-issue-group__head"
                                            onClick={() => toggleSection(key)}
                                        >
                                            <MIcon
                                                name={
                                                    isCollapsed
                                                        ? "chevron_right"
                                                        : "expand_more"
                                                }
                                                size="sm"
                                            />
                                            <span
                                                className={
                                                    "generate-schema-issue-dot generate-schema-issue-dot--" +
                                                    sev
                                                }
                                            />
                                            <span className="generate-schema-issue-group__title">
                                                {items[0].rule}
                                            </span>
                                            <span className="generate-schema-issue-group__count">
                                                {items.length}
                                            </span>
                                        </button>
                                        {!isCollapsed &&
                                            items.map((issue, idx) => (
                                                <div
                                                    key={idx}
                                                    className="generate-schema-issue-row"
                                                >
                                                    <span className="generate-schema-issue-row__msg">
                                                        {issue.message}
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ============ FOOTER ============ */}
                <div className="generate-schema-footer">
                    <div className="generate-schema-preflight">
                        {errorCount > 0 && (
                            <button
                                className="generate-schema-badge generate-schema-badge--error generate-schema-badge--clickable"
                                onClick={() => setTab("issues")}
                                title="Открыть список ошибок"
                            >
                                ⚠ {errorCount} новых ошибок
                            </button>
                        )}
                        {errorCount === 0 && warningCount > 0 && (
                            <button
                                className="generate-schema-badge generate-schema-badge--warn generate-schema-badge--clickable"
                                onClick={() => setTab("issues")}
                                title="Открыть список предупреждений"
                            >
                                ⚠ {warningCount} предупреждений
                            </button>
                        )}
                        {errorCount === 0 && warningCount === 0 && infoCount > 0 && (
                            <button
                                className="generate-schema-badge generate-schema-badge--info generate-schema-badge--clickable"
                                onClick={() => setTab("issues")}
                                title="Открыть список рекомендаций"
                            >
                                {infoCount} рекомендаций
                            </button>
                        )}
                        {errorCount === 0 &&
                            warningCount === 0 &&
                            infoCount === 0 &&
                            gen.result && (
                                <span className="generate-schema-badge generate-schema-badge--ok">
                                    ✓ 0 новых lint-проблем
                                </span>
                            )}
                        {options.replaceModified && (
                            <span
                                className="generate-schema-badge generate-schema-badge--info"
                                title="Preflight учитывает перезапись изменённых вручную блоков"
                            >
                                ⟳ replace-modified
                            </span>
                        )}
                    </div>
                    <div className="generate-schema-actions">
                        <button
                            className="btn"
                            onClick={() =>
                                useGraphStore
                                    .getState()
                                    .setGenerateSchemaOpen(false)
                            }
                        >
                            Отмена
                        </button>
                        <button
                            className="btn"
                            onClick={pullDependencies}
                            disabled={!gen.result || selected.size === 0}
                            title="Включить все блоки, от которых зависят выбранные (например, кнопка требует действие). Полезно, если сняли зависимость вручную"
                        >
                            <MIcon name="link" size="sm" />
                            Включить зависимости
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={apply}
                            disabled={!canApply}
                            title={
                                profile === "technical"
                                    ? "Профиль «Техническая» не генерирует блоки"
                                    : dependentsMissing.size > 0
                                        ? "Сняты зависимые блоки — включите их или снимите зависимый"
                                        : errorCount > 0
                                            ? "Исправьте новые ошибки или снимите проблемные блоки"
                                            : selected.size === 0
                                                ? "Не выбрано ни одного блока"
                                                : undefined
                            }
                        >
                            Применить ({selected.size})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
