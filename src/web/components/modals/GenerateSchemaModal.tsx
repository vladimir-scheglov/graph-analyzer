import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
    getSkipReasonHint,
    humanizeSkipReason,
    skipReasonIcon,
} from "./GenerateSchemaSkipReasons";
import type { GeneratedBlock, TreeChain } from "../../../core/analyzer/schema-generator/types";
import { TreeChainBuilder } from "./TreeChainBuilder";
import { EntityRecord, ModelIndex } from "../../../shared/model-types";
import { Combobox, ComboboxOption, EntityCombobox } from "../common";
import { openFileInEditor } from "../../lib/open-file";
import {
    isDomainScopeProfile,
    DOMAIN_SCOPE_PROFILES,
} from "../../../core/analyzer/schema-generator/scope";
import yaml from "js-yaml";  // уже используется в YamlViewerModal, безопасно
import { findPayloadByBlockId } from "../../../core/analyzer/schema-generator/block-resolver";
import { useYamlContent } from "../../hooks/useYamlContent";

type Tab = "options" | "blocks" | "yaml" | "diff" | "skipped" | "issues";

const PROFILE_ORDER = PROFILE_INFO.map((p) => p.id);

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, info: 2 };

const ENTITY_PROFILES = PROFILE_INFO.filter((p) => p.scope === "entity");
const DOMAIN_PROFILES = PROFILE_INFO.filter((p) => p.scope === "domain");

// Внутри GenerateSchemaModal.tsx, перед компонентом:

interface SkipQuickFix {
    icon: string;
    label: string;
    onClick: () => void;
}

function getSkipQuickFix(
    reason: string,
    handlers: {
        setProfile: (p: string) => void;
        setOptions: (fn: (o: any) => any) => void;
        setTab: (t: Tab) => void;
        openInYaml: () => void;
    },
): SkipQuickFix | null {
    switch (reason) {
        case "no-menu-root":
            return {
                icon: "add_circle",
                label: "Создать root_group",
                onClick: () =>
                    handlers.setOptions((o: any) => ({
                        ...o,
                        scaffoldCreateMenuRoot: true,
                        menuIncludeItems: true,
                    })),
            };
        case "no-entity-view":
        case "widget-view-wrong-type":
        case "widget-view-wrong-entity":
        case "no-list-view":
        case "column-view-wrong-type":
        case "column-view-wrong-entity":
            return {
                icon: "auto_awesome",
                label: "Профиль CRUD",
                onClick: () => handlers.setProfile("crud"),
            };
        case "id-conflict":
            return {
                icon: "open_in_new",
                label: "В YAML",
                onClick: handlers.openInYaml,
            };
        case "no-tab-views":
            return {
                icon: "tab",
                label: "К настройкам",
                onClick: () => handlers.setTab("options"),
            };
        case "no-tree-chain":
        case "no-chain":
        case "no-linkages-side1":
            return {
                icon: "account_tree",
                label: "К настройкам",
                onClick: () => handlers.setTab("options"),
            };
        case "nothing-to-generate":
        case "no-suitable-attributes":
            return {
                icon: "tune",
                label: "К опциям",
                onClick: () => handlers.setTab("options"),
            };
    }
    return null;
}

function iconForBlock(b: GeneratedBlock): string {
    const kind = b.blockId.split(":")[0];
    if (kind === "transitiveLinkage") return "conversion_path";
    if (kind === "column") return "view_column";
    if (kind === "tree") return "account_tree";
    if (kind === "action") return "bolt";
    if (kind === "menuItem") return "menu";
    if (kind === "media") return "image";
    if (kind === "dataRule") return "rule";
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
        if (t === "tabs_list") return "tab";
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
    const [forceReplaceIds, setForceReplaceIds] = useState<Set<string>>(new Set());

    const allEntities = useMemo(() => {
        if (!index || !domainId) return [] as Array<{ id: string; name: string }>;
        return index.entities
            .filter((e) => e.domainId === domainId)
            .map((e) => ({ id: e.entityId, name: e.name || e.entityId }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [index, domainId]);

    const [options, setOptions] = useState({
        includeBulk: true,
        includePage: undefined as boolean | undefined,
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
        tabsListIds: [] as string[],
        tabsViewId: undefined as string | undefined,
        tabsLabel: undefined as string | undefined,
        tabsDefaultTab: undefined as string | undefined,
        tabsIncludeMenu: false,
        includeSorting: true,
        includeSearching: true,
        transitiveChain: undefined as TreeChain | undefined,
        transitiveTreeId: undefined as string | undefined,
        transitiveIncludeWidget: true,
        transitiveIncludeListColumn: true,
        transitiveLabel: undefined as string | undefined,
        transitiveWidgetViewId: undefined as string | undefined,
        transitiveColumnViewId: undefined as string | undefined,
        defaultsBool: true,
        defaultsEnum: true,
        defaultsWorkflow: true,
        defaultsBoolValue: false,
        menuIncludeItems: true,
        enumSuffixes: ["Type", "Kind", "Status", "Category", "Severity", "State", "Mode", "Level"],
        enumDefaultValues: ["unknown", "other"],
        enumEnableWorkflow: false,
        uiStatusColorPalette: ["#94a3b8", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"],
        exchangeEnable: true,
        exchangeForExportStrategy: "label" as const,
        exchangeNoCmsSync: false,
        counterColorDefaultRed: "100%",
        counterColorDefaultYellow: "50%",
        linkedGroupsIncludeSingles: false,
        scaffoldCreateMenuRoot: false,
        scaffoldCreateMedias: false,
    });

    const yamlViewerOpen = useGraphStore((s) => s.yamlViewerOpen);
    const yamlViewerLocked = useGraphStore((s) => s.yamlViewerLocked);
    const yamlViewerFilePath = useGraphStore((s) => s.yamlViewerFilePath);

    const targetFile = useMemo(() => {
        const nodes = useGraphStore.getState().nodes;
        return nodes.find((n) => n.data.domainId === domainId)?.data.filePath ?? null;
    }, [domainId]);

    const prefilledFor = useRef<string | null>(null);

    const filePath = useMemo(() => {
        const nodes = useGraphStore.getState().nodes;
        return nodes.find((n) => n.data.domainId === domainId)?.data.filePath ?? null;
    }, [domainId, open]);

    // Lazy: грузим только когда открыта вкладка diff ИЛИ уже открыт результат
    const shouldLoadYaml = open && (tab === "diff" || tab === "blocks");

    const { content: yamlText } = useYamlContent(
        shouldLoadYaml ? filePath : null,
        0,
        false,
    );

    const currentRawData = useMemo(() => {
        if (!yamlText) return null;
        try {
            return yaml.load(yamlText);
        } catch {
            return null;
        }
    }, [yamlText]);

    useLayoutEffect(() => {
        if (!open) return;
        setOptions((o) => ({
            ...o,
            treeChain: undefined,
            treeUseExistingId: undefined,
            // tabs-list привязан к domain, не к entity, но при смене
            // сущности лучше начать с чистого листа
            tabsListIds: [],
            tabsViewId: undefined,
            tabsLabel: undefined,
            tabsDefaultTab: undefined,
            tabsIncludeMenu: false,
            transitiveChain: undefined,
            transitiveWidgetViewId: undefined,
            transitiveColumnViewId: undefined,
        }));
    }, [entityId]);

    const editorLocked = !!(
        yamlViewerOpen &&
        yamlViewerLocked &&
        yamlViewerFilePath &&
        targetFile &&
        yamlViewerFilePath === targetFile
    );

    useEffect(() => {
        if (!open) {
            prefilledFor.current = null;
            return;
        }
        prefilledFor.current = null;
        const st = useGraphStore.getState();
        const prefillProfile = st.generateSchemaPrefillProfile;
        st.setGenerateSchemaPrefillProfile(null);

        const fallbackProfile = entityId ? "crud" : "domain-extras";
        const initialProfile = prefillProfile || fallbackProfile;

        setProfile(initialProfile);
        setTab("options");
        setSelected(new Set());
        setShowHelp(false);
        setCollapsed(new Set(["issues-rule"]));
        setForceReplaceIds(new Set());
        setOptions({
            includeBulk: true,
            includePage: undefined as boolean | undefined,
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
            tabsListIds: [],
            tabsViewId: undefined,
            tabsLabel: undefined,
            tabsDefaultTab: undefined,
            tabsIncludeMenu: false,
            includeSorting: true,
            includeSearching: true,
            transitiveChain: undefined,
            transitiveTreeId: undefined,
            transitiveIncludeWidget: true,
            transitiveIncludeListColumn: true,
            transitiveLabel: undefined,
            transitiveWidgetViewId: undefined,
            transitiveColumnViewId: undefined,
            defaultsBool: true,
            defaultsEnum: true,
            defaultsWorkflow: true,
            defaultsBoolValue: false,
            menuIncludeItems: true,
            enumSuffixes: ["Type", "Kind", "Status", "Category", "Severity", "State", "Mode", "Level"],
            enumDefaultValues: ["unknown", "other"],
            enumEnableWorkflow: false,
            uiStatusColorPalette: ["#94a3b8", "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"],
            exchangeEnable: true,
            exchangeForExportStrategy: "label" as const,
            exchangeNoCmsSync: false,
            counterColorDefaultRed: "100%",
            counterColorDefaultYellow: "50%",
            linkedGroupsIncludeSingles: false,
            scaffoldCreateMenuRoot: false,
            scaffoldCreateMedias: false,
        });
    }, [open, domainId, entityId]);

    const toggleForceReplace = useCallback((blockId: string) => {
        setForceReplaceIds((prev) => {
            const next = new Set(prev);
            if (next.has(blockId)) {
                next.delete(blockId);
                // убираем блок из selected
                setSelected((s) => {
                    const ns = new Set(s);
                    ns.delete(blockId);
                    return ns;
                });
            } else {
                next.add(blockId);
                // принудительно выбираем
                setSelected((s) => {
                    const ns = new Set(s);
                    ns.add(blockId);
                    return ns;
                });
            }
            return next;
        });
    }, []);

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
    const isDomainScope = isDomainScopeProfile(profile as any);

    useEffect(() => {
        if (!open || isDomainScope) return;
        if (!index || !domainId || !entityId) return;
        const key = `${domainId}/${entityId}`;
        if (prefilledFor.current === key) return;
        prefilledFor.current = key;

        const chain = extractLinearTreeChain(index, domainId, entityId);
        if (chain && chain.length > 0) {
            setOptions((o) => ({ ...o, treeChain: chain }));
        }
    }, [open, index, domainId, entityId, isDomainScope]);

    const profileAllowsIncludeOptions =
        profile === "crud" || profile === "crud-with-page";

    const profileForcesPage = profile === "crud-with-page";

    const profileAllowsBehaviorOptions = profile !== "technical";

    const menuRoots = useMemo(() => {
        if (!index || !domainId) return [] as Array<{ id: string; route: string; type: string }>;
        return (
            index.schemasByDomain[domainId]?.sections.menus.items
                ?.filter((m) => m.type === "root_group" || m.type === "root_menu")
                .map((m) => ({ id: m.id, route: m.route, type: m.type })) ?? []
        );
    }, [index, domainId]);

    const listViews = useMemo(() => {
        if (!index || !domainId) return [] as Array<{ id: string; label: string }>;
        return (index.schemasByDomain[domainId]?.sections?.views?.items || [])
            .filter((v: any) => v.type === "list")
            .map((v: any) => ({
                id: String(v.id),
                label: String(v.label || v.id),
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [index, domainId]);

    // Опции для ID дерева: существующие transitiveLinkages домена.
    const existingTransitiveTrees = useMemo<ComboboxOption[]>(() => {
        if (!index || !domainId) return [];
        return index.transitiveLinkages
            .filter((t) => t.domainId === domainId)
            .map((t) => ({
                value: t.id,
                label: t.description || t.id,
                hint: t.entity.split("/").pop() || "",
            }))
            .sort((a, b) => a.value.localeCompare(b.value));
    }, [index, domainId]);

    const entityViewCandidates = useMemo<ComboboxOption[]>(() => {
        if (!index || !domainId || !entityId) return [];
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        return (index.schemasByDomain[domainId]?.sections?.views?.items || [])
            .filter((v: any) => {
                if (v.type !== "entity") return false;
                if (!v.entity) return false;
                const e = String(v.entity);
                const norm = e.includes("/") ? e.toLowerCase() : `${domainId}/${e}`.toLowerCase();
                return norm === fqid;
            })
            .map((v: any) => ({
                value: String(v.id),
                label: String(v.label || v.id),
                hint: v.id === `view${entityId}` ? "по умолчанию" : undefined,
            }))
            .sort((a, b) => a.value.localeCompare(b.value));
    }, [index, domainId, entityId]);

    const columnViewCandidates = useMemo<ComboboxOption[]>(() => {
        if (!index || !domainId || !entityId) return [];
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        return (index.schemasByDomain[domainId]?.sections?.views?.items || [])
            .filter((v: any) => {
                if (v.type !== "list" && v.type !== "tree") return false;
                if (!v.sourceEntity) return false;
                const e = String(v.sourceEntity);
                const norm = e.includes("/") ? e.toLowerCase() : `${domainId}/${e}`.toLowerCase();
                return norm === fqid;
            })
            .map((v: any) => ({
                value: String(v.id),
                label: String(v.label || v.id),
                hint: v.type,
            }))
            .sort((a, b) => a.value.localeCompare(b.value));
    }, [index, domainId, entityId]);

    // Опции для label: подсказки из последней сущности chain.
    const transitiveLabelOptions = useMemo<ComboboxOption[]>(() => {
        const chain = options.transitiveChain;
        if (!index || !chain || chain.length === 0) return [];
        const lastFqid =
            chain[chain.length - 1].childEntityId.toLowerCase();
        const entity = index.entitiesByFqid[lastFqid];
        if (!entity) return [];

        const seen = new Set<string>();
        const out: ComboboxOption[] = [];
        const push = (value: string | null | undefined, label: string) => {
            if (!value || seen.has(value)) return;
            seen.add(value);
            out.push({ value, label });
        };

        // entityId без домена — самая частая конвенция для label
        push(entity.entityId, "entityId");
        // name — если задан и отличается
        if (entity.name && entity.name !== entity.entityId) {
            push(entity.name, "name");
        }
        // label — если задан (например, "{type}: {value}")
        if (entity.label) {
            push(entity.label, "label (шаблон)");
        }
        return out;
    }, [index, options.transitiveChain]);

    useEffect(() => {
        if (!open) return;
        if (menuRoots.length === 0) {
            if (options.menuRootId) {
                setOptions((o) => ({ ...o, menuRootId: undefined }));
            }
            return;
        }
        const exists = menuRoots.some((r) => r.id === options.menuRootId);
        if (!exists) {
            setOptions((o) => ({ ...o, menuRootId: menuRoots[0].id }));
        }
    }, [open, menuRoots, options.menuRootId]);

    const hasTreeCandidates = useMemo(() => {
        if (isDomainScope) return false;
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
    }, [index, domainId, entityId, isDomainScope]);

    useEffect(() => {
        if (isDomainScope) return;
        if (profile === "tree-view" && !hasTreeCandidates) {
            setProfile("crud");
        }
    }, [profile, hasTreeCandidates, isDomainScope]);

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

    const treeViewNeedsTarget =
        profile === "tree-view" &&
        !hasTreeCandidates &&
        options.treeChain === undefined &&
        !options.treeUseExistingId;

    const crudWithPageNoMenu =
        profile === "crud-with-page" && menuRoots.length === 0;

    const canApply =
        (isDomainScope || !!entityId) &&
        !gen.loading &&
        !!gen.result &&
        profile !== "technical" &&
        selected.size > 0 &&
        errorCount === 0 &&
        !editorLocked &&
        !crudWithPageNoMenu &&
        (profile !== "tabs-list" || (options.tabsListIds && options.tabsListIds.length > 0)) &&
        (profile !== "sorting-searching" || options.includeSorting !== false || options.includeSearching !== false) &&
        (profile !== "transitive-chain" || (options.transitiveChain && options.transitiveChain.length > 0)) &&
        (profile !== "defaults" || options.defaultsBool !== false || options.defaultsEnum !== false || options.defaultsWorkflow !== false) &&
        !treeViewNeedsTarget;

    const hasAmbiguousView =
        profile === "transitive-chain" &&
        (gen.result?.skipped || []).some(
            (s: any) =>
                s.reason === "widget-view-ambiguous" ||
                s.reason === "column-view-ambiguous",
        );

    const finalCanApply = canApply && !hasAmbiguousView;

    const apply = useCallback(async () => {
        if (!gen.result || !domainId) return;
        if (!isDomainScope && !entityId) return;
        if (profile === "technical") {
            useGraphStore.getState().setGenerateSchemaOpen(false);
            return;
        }

        const status = gen.result.manifestStatus ?? {};
        const replaceModified = options.replaceModified === true;

        // Зависимые без зависимостей — фильтруем (не блокируем остальные)
        const blocksToApply = (gen.result.blocks as GeneratedBlock[]).filter((b) => {
            const st = status[b.blockId];
            if (st === "unchanged") return false;
            if (st === "orphaned") return selected.has(b.blockId);
            if (st === "modified" && !replaceModified && !forceReplaceIds.has(b.blockId)) return false;
            if (dependentsMissing.has(b.blockId)) return false;
            return selected.has(b.blockId);
        });

        const restoreOrphanedIds = (gen.result.blocks as GeneratedBlock[])
            .filter((b) => status[b.blockId] === "orphaned" && selected.has(b.blockId))
            .map((b) => b.blockId);

        const orphanedIds = Object.entries(status)
            .filter(([id, st]) => st === "orphaned" && !restoreOrphanedIds.includes(id))
            .map(([id]) => id);

        if (blocksToApply.length === 0 && orphanedIds.length === 0) {
            useGraphStore.getState().showSnackbar(
                "Нечего применять — все выбранные блоки без зависимостей",
            );
            return;
        }

        const st = useGraphStore.getState();

        // ── ПРОВЕРКА ФАЙЛА ДО закрытия модалки ──
        const node = st.nodes.find((n) => n.data.domainId === domainId);
        if (!node?.data.filePath) {
            st.showSnackbar("Файл схемы не найден — модалка остаётся открытой");
            return;
        }

        // ── dirty-check через openFileInEditor ──
        const ok = await openFileInEditor(node.data.filePath, null, domainId);
        if (!ok) return;   // пользователь отменил — state не тронут

        // ── pending generation + manifest (после open, чтобы YamlViewer увидел) ──
        st.setYamlViewerPendingGeneration({
            blocks: blocksToApply,
            yamlByBlock: gen.result.yamlByBlock,
            manifestStatus: status,
            replaceModified,
            restoreOrphanedIds: restoreOrphanedIds.length > 0 ? restoreOrphanedIds : undefined,
            forceReplaceIds: forceReplaceIds.size > 0 ? Array.from(forceReplaceIds) : undefined,
        });
        st.setYamlViewerPendingManifest({
            domainId,
            profile,
            entities: [{
                entityId: isDomainScope ? "(domain)" : entityId!,
                blocks: blocksToApply.map((b) => ({
                    blockId: b.blockId,
                    hash: hashPayload(b.payload),
                    title: b.title,
                    parentViewId: b.parentViewId,
                })),
                orphanedIds: orphanedIds.length > 0 ? orphanedIds : undefined,
            }],
        });

        st.setGenerateSchemaOpen(false);
    }, [
        gen.result,
        selected,
        domainId,
        entityId,
        profile,
        options.replaceModified,
        dependentsMissing,
        isDomainScope,
        forceReplaceIds,
    ]);

    if (!open || !domainId) return null;

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
            { key: "diff", label: "Diff", count: selected.size },
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
                {!isDomainScope ? (
                    <div className="generate-schema-entity-bar">
                        <MIcon name="data_object" size="sm" />
                        <span className="generate-schema-entity-bar__label">Сущность</span>
                        <EntityCombobox
                            value={entityId}
                            onChange={(id) =>
                                useGraphStore.getState().setGenerateSchemaEntityId(id)
                            }
                            entities={allEntities}
                            disabled={allEntities.length === 0}
                        />
                        <span className="generate-schema-entity-bar__domain">{domainId}</span>
                        {profileInfo && (
                            <span className="generate-schema-profile-badge">
                                {profileInfo.label}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="generate-schema-entity-bar generate-schema-entity-bar--domain">
                        <MIcon name="folder" size="sm" />
                        <span className="generate-schema-entity-bar__label">Домен</span>
                        <span className="generate-schema-entity-bar__domain">{domainId}</span>
                        {profileInfo && (
                            <span className="generate-schema-profile-badge">
                                {profileInfo.label}
                            </span>
                        )}
                        <span
                            style={{
                                marginLeft: "auto",
                                fontSize: 11,
                                color: "var(--text-500)",
                                fontStyle: "italic",
                            }}
                        >
                            Профиль работает на весь домен — сущность не выбирается
                        </span>
                    </div>
                )}
                {gen.result?.skipped?.some((s) => s.reason === "ambiguous-view") && (
                    <div className="generate-schema-id-conflict">
                        <div className="generate-schema-id-conflict__head">
                            <MIcon name="warning" size="sm" />
                            <strong>Несколько view для сущности</strong>
                        </div>
                        <div className="generate-schema-id-conflict__body">
                            Для сущности <code>{entityId}</code> в домене несколько
                            view нужного типа (entity-view или list-view). Генератор
                            не угадывает, какой использовать.
                            <ul>
                                <li>Оставьте <strong>один</strong> entity-view и{" "}
                                    <strong>один</strong> list-view для этой сущности.</li>
                                <li>
                                    Или переименуйте их в стандартные:{" "}
                                    <code>view{entityId}</code>,{" "}
                                    <code>lists_{entityId?.toLowerCase()}</code>.
                                </li>
                            </ul>
                            <details style={{ marginTop: 8 }}>
                                <summary
                                    style={{
                                        cursor: "pointer",
                                        fontSize: 11,
                                        color: "var(--text-500)",
                                    }}
                                >
                                    Какие именно view конфликтуют
                                </summary>
                                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                                    {(gen.result?.skipped || [])
                                        .filter((s) => s.reason === "ambiguous-view")
                                        .map((s, i) => (
                                            <li key={i}>
                                                <code>{s.id}</code>
                                                {s.hint && (
                                                    <span style={{ color: "var(--text-500)", marginLeft: 6 }}>
                                                        — {s.hint}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                </ul>
                            </details>
                        </div>
                    </div>
                )}

                {crudWithPageNoMenu && (
                    <div className="generate-schema-id-conflict">
                        <div className="generate-schema-id-conflict__head">
                            <MIcon name="warning" size="sm" />
                            <strong>Нет корневого меню</strong>
                        </div>
                        <div className="generate-schema-id-conflict__body">
                            Профиль <strong>«CRUD + полная карточка»</strong> генерирует
                            <code>pages_infoX</code>, который требует <code>menuItem</code> —
                            а значит, <code>root_group</code> в <code>menus[]</code>.
                            <br />
                            <ul>
                                <li>Создайте root_group в секции <code>menus</code> вручную, или</li>
                                <li>В пакетной генерации включите «Создать корневое меню (root_group)», или</li>
                                <li>Смените профиль на обычный <strong>CRUD</strong>.</li>
                            </ul>
                        </div>
                    </div>
                )}

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
                            <HelpSection title="Существующие view">
                                <HelpText>
                                    Генератор умеет находить существующие view, даже если они
                                    названы нестандартно (не{" "}
                                    <code>view&#123;Entity&#125;</code> или{" "}
                                    <code>lists_&#123;entity&#125;</code>). Дубликаты не создаются.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Ровно один</strong> entity-view / list-view для
                                        сущности (под любым id) → генератор <strong>использует
                                            его</strong>: виджеты, группы, вложенные карточки и пункт
                                        меню добавляются в существующий view.
                                    </li>
                                    <li>
                                        <strong>Несколько</strong> view нужного типа →
                                        генерация этих блоков пропускается с причиной{" "}
                                        <code>ambiguous-view</code>. Оставьте один view или
                                        переименуйте его в стандартный id.
                                    </li>
                                    <li>
                                        <strong>Ни одного</strong> → создаётся стандартный{" "}
                                        <code>view&#123;Entity&#125;</code> или{" "}
                                        <code>lists_&#123;entity&#125;</code>.
                                    </li>
                                    <li>
                                        <strong>skipExisting</strong> применяется только к{" "}
                                        <em>содержимому</em> view (widgets, groups, actions), а не
                                        к самому root-view. Root-view либо создаётся (если его
                                        нет), либо используется (если он есть один), либо
                                        генерация блокируется (если их несколько).
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
                            <HelpSection title="Почему блоки пропускаются">
                                <HelpText>
                                    На вкладке «Пропущено» каждая запись объясняет причину и
                                    показывает подсказку. Самые частые:
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>already-exists</strong> — блок с таким id уже есть
                                        в YAML. Либо он актуален (совпадает с моделью), либо это
                                        ваша правка (если она защищена опцией «Не трогать
                                        изменённые вручную»).
                                    </li>
                                    <li>
                                        <strong>ambiguous-view</strong> — несколько entity-view
                                        или list-view для одной сущности. Оставьте один.
                                    </li>
                                    <li>
                                        <strong>no-menu-root</strong> — нет{" "}
                                        <code>root_group</code> в <code>menus[]</code>. Включите
                                        «Создать корневое меню» (профили CRUD / domain-extras) или
                                        создайте root вручную.
                                    </li>
                                    <li>
                                        <strong>no-list-view / no-entity-view</strong> — сгенерируйте
                                        list/entity-view (профиль CRUD или Справочник) — эти блоки
                                        добавятся при повторной генерации.
                                    </li>
                                    <li>
                                        <strong>no-suitable-attributes / nothing-to-generate</strong>{" "}
                                        — эвристики не нашли ничего подходящего. Проверьте опции
                                        профиля.
                                    </li>
                                    <li>
                                        <strong>dictionary</strong> — сущность помечена как{" "}
                                        <code>ui: &#123; list: false, modals: false &#125;</code>.
                                        Для неё UI не генерируется (но actions/widgets, если они
                                        нужны, генерируются отдельно).
                                    </li>
                                </HelpList>
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
                                        <optgroup label="Для сущности">
                                            {ENTITY_PROFILES.map((id) => {
                                                const info = id;
                                                const disabled =
                                                    id.id === "tree-view" && !hasTreeCandidates;
                                                return (
                                                    <option
                                                        key={id.id}
                                                        value={id.id}
                                                        disabled={disabled}
                                                    >
                                                        {info.label}
                                                        {disabled ? " (нет связей side-1)" : ""}
                                                    </option>
                                                );
                                            })}
                                        </optgroup>
                                        <optgroup label="Для всего домена">
                                            {DOMAIN_PROFILES.map((info) => (
                                                <option key={info.id} value={info.id}>
                                                    {info.label}
                                                </option>
                                            ))}
                                        </optgroup>
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
                            <div className={"generate-schema-settings-grid" + (!profileAllowsIncludeOptions || !profileAllowsBehaviorOptions ? "generate-schema-settings-grid--single" : "")}>
                                {profileAllowsIncludeOptions && (
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
                                                (menuRoots.length === 0 ? " generate-schema-option--disabled" : "")
                                            }
                                            title={
                                                options.includePage === undefined
                                                    ? "Автоматически: включается, если у сущности ui.page: true"
                                                    : menuRoots.length === 0
                                                        ? "Создайте root_group в menus[] — pages_infoX нужен menuItem"
                                                        : "Полноэкранная карточка (pages_infoX + action open_page)"
                                            }
                                        >
                                            <input
                                                type="checkbox"
                                                checked={options.includePage === true}
                                                disabled={menuRoots.length === 0}
                                                onChange={(e) =>
                                                    setOptions({ ...options, includePage: e.target.checked })
                                                }
                                            />
                                            <span>
                                                Полноэкранная карточка
                                                {options.includePage === undefined && (
                                                    <span
                                                        className="generate-schema-option__hint"
                                                        style={{
                                                            marginLeft: 6,
                                                            fontSize: 10,
                                                            color: "var(--text-500)",
                                                            textTransform: "uppercase",
                                                            letterSpacing: 0.3,
                                                        }}
                                                    >
                                                        авто
                                                    </span>
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
                                )}

                                {profileAllowsBehaviorOptions && (
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
                                            className={
                                                "generate-schema-option" +
                                                (profile === "ui-status-colors" ? " generate-schema-option--disabled" : "")
                                            }
                                            title={
                                                profile === "ui-status-colors"
                                                    ? "Для профиля ui-status-colors перезапись обязательна — view[] дополняется"
                                                    : "Перезаписывать блоки, отредактированные вручную"
                                            }
                                        >
                                            <input
                                                type="checkbox"
                                                checked={options.replaceModified === true}
                                                disabled={profile === "ui-status-colors"}
                                                onChange={(e) =>
                                                    setOptions({ ...options, replaceModified: e.target.checked })
                                                }
                                            />
                                            <span>Перезаписывать изменённые вручную</span>
                                        </label>
                                    </div>
                                )}
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

                                    {entityId && <TreeChainBuilder
                                        index={index}
                                        domainId={domainId}
                                        rootEntityId={entityId}
                                        value={options.treeChain}
                                        useExistingId={options.treeUseExistingId}
                                        onChangeChain={(v) =>
                                            setOptions({ ...options, treeChain: v })
                                        }
                                        onChangeUseExisting={(id) =>
                                            setOptions({ ...options, treeUseExistingId: id, treeChain: undefined })
                                        }
                                        existingTrees={
                                            (index?.trees || [])
                                                .filter((t) => t.domainId === domainId)
                                                .map((t) => ({ id: t.id, name: t.name || t.id, hierarchy: t.hierarchy }))
                                        }
                                    />}
                                </div>
                            )}

                            {profile === "tabs-list" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="tab" size="sm" />
                                        Параметры tabs-list
                                    </div>

                                    {!entityId && (
                                        <div className="generate-schema-tabs-hint">
                                            <MIcon name="info" size="sm" />
                                            <span>
                                                Выберите сущность выше — она нужна как anchor для route
                                                и label пункта меню.
                                            </span>
                                        </div>
                                    )}

                                    <div className="generate-schema-tree-grid">
                                        <label className="generate-schema-field">
                                            <span>ID view:</span>
                                            <input
                                                type="text"
                                                placeholder={
                                                    entityId ? `tabs_${entityId.toLowerCase()}` : "tabs_my"
                                                }
                                                value={options.tabsViewId || ""}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        tabsViewId: e.target.value.trim() || undefined,
                                                    })
                                                }
                                            />
                                        </label>

                                        <label className="generate-schema-field">
                                            <span>Заголовок:</span>
                                            <input
                                                type="text"
                                                placeholder={
                                                    entityId ? `${entityId} (вкладки)` : "Вкладки"
                                                }
                                                value={options.tabsLabel || ""}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        tabsLabel: e.target.value || undefined,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Вкладки — это существующие list-view домена. Если нужного нет —
                                            сначала сгенерируйте его для нужной сущности (профиль CRUD).
                                        </span>
                                    </div>

                                    <div className="generate-schema-block-group__title">
                                        Вкладки ({listViews.length} list-view в домене)
                                    </div>

                                    {listViews.length === 0 ? (
                                        <div className="generate-schema-empty">
                                            В домене нет ни одного list-view. Сгенерируйте CRUD для нужных
                                            сущностей — потом вернитесь сюда.
                                        </div>
                                    ) : (
                                        <div className="generate-schema-tabs-list">
                                            {listViews.map((v) => {
                                                const selected = (options.tabsListIds || []).includes(v.id);
                                                return (
                                                    <label
                                                        key={v.id}
                                                        className={
                                                            "generate-schema-tab-option" +
                                                            (selected ? " generate-schema-tab-option--selected" : "")
                                                        }
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={(e) => {
                                                                const current = options.tabsListIds || [];
                                                                setOptions({
                                                                    ...options,
                                                                    tabsListIds: e.target.checked
                                                                        ? [...current, v.id]
                                                                        : current.filter(
                                                                            (id) => id !== v.id,
                                                                        ),
                                                                });
                                                            }}
                                                        />
                                                        <code className="generate-schema-tab-option__id">
                                                            {v.id}
                                                        </code>
                                                        {v.label && v.label !== v.id && (
                                                            <span className="generate-schema-tab-option__label">
                                                                {v.label}
                                                            </span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="generate-schema-tree-grid">
                                        <label className="generate-schema-field">
                                            <span>Вкладка по умолчанию:</span>
                                            <select
                                                value={options.tabsDefaultTab || ""}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        tabsDefaultTab: e.target.value || undefined,
                                                    })
                                                }
                                                disabled={(options.tabsListIds || []).length === 0}
                                            >
                                                <option value="">— первая выбранная —</option>
                                                {(options.tabsListIds || []).map((id) => (
                                                    <option key={id} value={id}>
                                                        {id}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <label
                                        className={
                                            "generate-schema-option" +
                                            (menuRoots.length === 0
                                                ? " generate-schema-option--disabled"
                                                : "")
                                        }
                                        title={
                                            menuRoots.length === 0
                                                ? "Создайте root_group в menus[] — иначе menu item некуда вставлять"
                                                : "Добавит пункт меню в первый (или выбранный) root_group"
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!!options.tabsIncludeMenu}
                                            disabled={menuRoots.length === 0}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    tabsIncludeMenu: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Добавить пункт меню
                                            {menuRoots.length === 0 && (
                                                <MIcon
                                                    name="warning"
                                                    size="sm"
                                                    className="generate-schema-option__warn"
                                                />
                                            )}
                                        </span>
                                    </label>
                                </div>
                            )}

                            {profile === "sorting-searching" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="sort" size="sm" />
                                        Параметры sorting / searching
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Существующие <code>sorting[]</code> и <code>searching[]</code>{" "}
                                            не перезаписываются. Генерируются только недостающие.
                                        </span>
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.includeSorting !== false}
                                            onChange={(e) =>
                                                setOptions({ ...options, includeSorting: e.target.checked })
                                            }
                                        />
                                        <span>
                                            Сгенерировать <code>sorting[]</code> (правило по первому
                                            скалярному атрибуту)
                                        </span>
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.includeSearching !== false}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    includeSearching: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Сгенерировать <code>searching[]</code> (все подходящие
                                            атрибуты)
                                        </span>
                                    </label>
                                </div>
                            )}

                            {profile === "transitive-chain" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="conversion_path" size="sm" />
                                        Цепочка транзитивной связи
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Постройте цепочку от <code>{entityId}</code> к целевой сущности.
                                            Генерируется <code>transitiveLinkages[]</code> +{" "}
                                            <code>join</code>-виджет и колонка (если entity-view / list-view
                                            уже есть).
                                        </span>
                                    </div>

                                    {entityId && (
                                        <TreeChainBuilder
                                            index={index}
                                            domainId={domainId}
                                            rootEntityId={entityId}
                                            value={options.transitiveChain}
                                            useExistingId={undefined}
                                            hideExistingOption
                                            onChangeChain={(v) =>
                                                setOptions({ ...options, transitiveChain: v })
                                            }
                                            onChangeUseExisting={() => { }}
                                            existingTrees={[]}
                                        />
                                    )}

                                    <div className="generate-schema-tree-grid">
                                        <label
                                            className="generate-schema-field"
                                            style={{ flexDirection: "column", alignItems: "stretch" }}
                                        >
                                            <span>ID дерева:</span>
                                            <Combobox
                                                value={options.transitiveTreeId || null}
                                                onChange={(v) =>
                                                    setOptions({
                                                        ...options,
                                                        transitiveTreeId: v.trim() || undefined,
                                                    })
                                                }
                                                options={existingTransitiveTrees}
                                                placeholder={
                                                    entityId
                                                        ? `${entityId}TransitiveTree`
                                                        : "MyTransitiveTree"
                                                }
                                                allowCreate
                                                createLabel={(v) => `Создать новое дерево: ${v}`}
                                                emptyHint="В домене нет транзитивных связей — введите новый ID"
                                                icon="conversion_path"
                                            />
                                        </label>
                                        <label
                                            className="generate-schema-field"
                                            style={{ flexDirection: "column", alignItems: "stretch" }}
                                        >
                                            <span>Label (виджет/колонка):</span>
                                            <Combobox
                                                value={options.transitiveLabel || null}
                                                onChange={(v) =>
                                                    setOptions({
                                                        ...options,
                                                        transitiveLabel: v || undefined,
                                                    })
                                                }
                                                options={transitiveLabelOptions}
                                                placeholder="по имени конечной сущности"
                                                allowCreate
                                                createLabel={(v) => `Использовать: ${v}`}
                                                emptyHint={
                                                    options.transitiveChain && options.transitiveChain.length > 0
                                                        ? "У конечной сущности нет name/label — введите произвольный текст"
                                                        : "Сначала постройте цепочку"
                                                }
                                                icon="label"
                                                disabled={!options.transitiveChain || options.transitiveChain.length === 0}
                                            />
                                        </label>
                                    </div>

                                    <div className="generate-schema-block-group__title" style={{ marginTop: 4 }}>
                                        <MIcon name="widgets" size="sm" />
                                        Куда добавить
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.transitiveIncludeWidget}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    transitiveIncludeWidget: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Добавить <code>join</code>-виджет в entity-view
                                        </span>
                                    </label>

                                    {options.transitiveIncludeWidget && (
                                        <label className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                            <span>Entity-view для виджета:</span>
                                            <Combobox
                                                value={options.transitiveWidgetViewId || null}
                                                onChange={(v) =>
                                                    setOptions({
                                                        ...options,
                                                        transitiveWidgetViewId: v || undefined,
                                                    })
                                                }
                                                options={entityViewCandidates}
                                                placeholder={
                                                    entityViewCandidates.length === 0
                                                        ? "Нет entity-view для этой сущности"
                                                        : `Авто (view${entityId || ""})`
                                                }
                                                allowCreate={false}
                                                emptyHint="Сгенерируйте entity-view (CRUD или Справочник) — виджет добавится при повторной генерации"
                                                icon="visibility"
                                                disabled={entityViewCandidates.length === 0}
                                            />
                                            {entityViewCandidates.length > 1 && !options.transitiveWidgetViewId && (
                                                <span className="generate-schema-field__warn">
                                                    <MIcon name="warning" size="sm" />
                                                    Несколько entity-view — выберите одну
                                                </span>
                                            )}
                                        </label>
                                    )}

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.transitiveIncludeListColumn}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    transitiveIncludeListColumn: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Добавить <code>join</code>-колонку в list-view
                                        </span>
                                    </label>

                                    {options.transitiveIncludeListColumn && (
                                        <label className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                            <span>List-view для колонки:</span>
                                            <Combobox
                                                value={options.transitiveColumnViewId || null}
                                                onChange={(v) =>
                                                    setOptions({
                                                        ...options,
                                                        transitiveColumnViewId: v || undefined,
                                                    })
                                                }
                                                options={columnViewCandidates}
                                                placeholder={
                                                    columnViewCandidates.length === 0
                                                        ? "Нет list-view для этой сущности"
                                                        : `Авто (lists_${(entityId || "").toLowerCase()})`
                                                }
                                                allowCreate={false}
                                                emptyHint="Сгенерируйте list-view (CRUD) — колонка добавится при повторной генерации"
                                                icon="table_rows"
                                                disabled={columnViewCandidates.length === 0}
                                            />
                                            {columnViewCandidates.length > 1 && !options.transitiveColumnViewId && (
                                                <span className="generate-schema-field__warn">
                                                    <MIcon name="warning" size="sm" />
                                                    Несколько list/tree-view — выберите одну
                                                </span>
                                            )}
                                        </label>
                                    )}
                                </div>
                            )}

                            {profile === "defaults" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="rule" size="sm" />
                                        Параметры defaults
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Генерируется одно правило <code>dataRules.default</code> на
                                            сущность. Атрибуты, для которых уже задан дефолт, не
                                            перезаписываются.
                                        </span>
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.defaultsBool !== false}
                                            onChange={(e) =>
                                                setOptions({ ...options, defaultsBool: e.target.checked })
                                            }
                                        />
                                        <span>
                                            <code>Bool</code>-атрибуты
                                        </span>
                                    </label>

                                    {options.defaultsBool !== false && (
                                        <div className="generate-schema-field">
                                            <span>Default для Bool:</span>
                                            <select
                                                value={options.defaultsBoolValue ? "true" : "false"}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        defaultsBoolValue: e.target.value === "true",
                                                    })
                                                }
                                            >
                                                <option value="false">false</option>
                                                <option value="true">true</option>
                                            </select>
                                        </div>
                                    )}

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.defaultsEnum !== false}
                                            onChange={(e) =>
                                                setOptions({ ...options, defaultsEnum: e.target.checked })
                                            }
                                        />
                                        <span>
                                            <code>Enum</code>-атрибуты (первое не-hidden значение)
                                        </span>
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.defaultsWorkflow !== false}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    defaultsWorkflow: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            <code>Workflow</code>-атрибуты (initial-статус)
                                        </span>
                                    </label>
                                </div>
                            )}

                            {profile === "domain-extras" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="menu" size="sm" />
                                        Меню и иконки домена
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Генерирует <code>root_group</code> в <code>menus[]</code>,
                                            пункты меню для сущностей с <code>ui.list !== false</code>{" "}
                                            и палитру из 10 базовых иконок. Существующие не перезаписываются.
                                        </span>
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.scaffoldCreateMenuRoot}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    scaffoldCreateMenuRoot: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Создать корневое меню (root_group)</span>
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.menuIncludeItems}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    menuIncludeItems: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Добавить пункты меню по сущностям домена</span>
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.scaffoldCreateMedias}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    scaffoldCreateMedias: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>Добавить палитру иконок (10 шт.)</span>
                                    </label>
                                </div>
                            )}

                            {profile === "enum-workflow-builder" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="data_object" size="sm" />
                                        Enum / Workflow Builder
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Для <code>String</code>-атрибутов с суффиксом из списка ниже
                                            создаются скелеты <code>Enum</code>. Атрибут{" "}
                                            <strong>не переключается</strong> на новый тип — сделайте это
                                            вручную после ревью.
                                        </span>
                                    </div>

                                    <label className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                        <span>Суффиксы (через запятую):</span>
                                        <input
                                            type="text"
                                            value={(options.enumSuffixes || []).join(", ")}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    enumSuffixes: e.target.value
                                                        .split(/[,;]/)
                                                        .map((s) => s.trim())
                                                        .filter(Boolean),
                                                })
                                            }
                                            placeholder="Type, Kind, Status, Category, Severity"
                                        />
                                    </label>

                                    <label className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                        <span>Значения по умолчанию (через запятую):</span>
                                        <input
                                            type="text"
                                            value={(options.enumDefaultValues || []).join(", ")}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    enumDefaultValues: e.target.value
                                                        .split(/[,;]/)
                                                        .map((s) => s.trim())
                                                        .filter(Boolean),
                                                })
                                            }
                                            placeholder="unknown, other"
                                        />
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.enumEnableWorkflow}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    enumEnableWorkflow: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Для суффикса <code>Status</code> генерировать <code>Workflow</code>{" "}
                                            вместо Enum
                                        </span>
                                    </label>
                                </div>
                            )}

                            {profile === "ui-status-colors" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="palette" size="sm" />
                                        Цвета статусов
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Заполняет <code>view[]</code> для <code>Enum</code>/<code>Workflow</code>{" "}
                                            без оформления. Эвристика по семантике: <code>active/progress</code> → синий,{" "}
                                            <code>done/closed</code> → зелёный, <code>critical/error</code> → красный.
                                            <br />
                                            <strong>Внимание:</strong> профиль принудительно перезаписывает{" "}
                                            <code>view[]</code> даже там, где он уже задан.
                                        </span>
                                    </div>

                                    <div className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                        <span>Палитра (fallback, когда эвристика не сработала):</span>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                                            {(options.uiStatusColorPalette || []).map((color, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "4px 8px",
                                                        background: "var(--bg-750)",
                                                        border: "1px solid var(--border)",
                                                        borderRadius: 6,
                                                        fontSize: 11,
                                                        fontFamily: "JetBrains Mono, monospace",
                                                    }}
                                                >
                                                    <input
                                                        type="color"
                                                        value={color}
                                                        onChange={(e) => {
                                                            const next = e.target.value;
                                                            setProfile(next);
                                                            if (next === "ui-status-colors") {
                                                                setOptions((o) => ({ ...o, replaceModified: true }));
                                                            }
                                                        }}
                                                        style={{
                                                            width: 22,
                                                            height: 22,
                                                            border: "none",
                                                            background: "transparent",
                                                            cursor: "pointer",
                                                            padding: 0,
                                                        }}
                                                    />
                                                    <span>{color}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const next = [...(options.uiStatusColorPalette || [])];
                                                            next.splice(idx, 1);
                                                            setOptions({ ...options, uiStatusColorPalette: next });
                                                        }}
                                                        style={{
                                                            background: "transparent",
                                                            border: "none",
                                                            color: "var(--text-500)",
                                                            cursor: "pointer",
                                                            padding: 0,
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                className="btn"
                                                style={{ padding: "4px 10px", fontSize: 11 }}
                                                onClick={() => {
                                                    const next = [...(options.uiStatusColorPalette || []), "#94a3b8"];
                                                    setOptions({ ...options, uiStatusColorPalette: next });
                                                }}
                                            >
                                                + Добавить
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {profile === "exchange-settings" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="swap_horiz" size="sm" />
                                        Настройки обмена данными
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Создаёт объект <code>exchangeSettings</code> со всеми сущностями домена.
                                            <strong> Перезаписывает секцию целиком</strong>, если она уже есть.
                                        </span>
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={options.exchangeEnable !== false}
                                            onChange={(e) =>
                                                setOptions({ ...options, exchangeEnable: e.target.checked })
                                            }
                                        />
                                        <span>
                                            <code>enable: true</code> (включить обмен)
                                        </span>
                                    </label>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.exchangeNoCmsSync}
                                            onChange={(e) =>
                                                setOptions({ ...options, exchangeNoCmsSync: e.target.checked })
                                            }
                                        />
                                        <span>
                                            Отключить <code>sdk.cms.sync</code> (<code>noCmsSync: true</code>)
                                        </span>
                                    </label>

                                    <div className="generate-schema-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
                                        <span>Стратегия forExport:</span>
                                        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                                            {[
                                                { value: "label", label: "label (системный)" },
                                                { value: "firstString", label: "первый String-атрибут" },
                                                { value: "id", label: "id (системный UUID)" },
                                            ].map((opt) => (
                                                <label
                                                    key={opt.value}
                                                    className="generate-schema-option"
                                                    style={{ padding: "4px 8px" }}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="exchangeForExportStrategy"
                                                        checked={options.exchangeForExportStrategy === opt.value}
                                                        onChange={() =>
                                                            setOptions({
                                                                ...options,
                                                                exchangeForExportStrategy: opt.value as any,
                                                            })
                                                        }
                                                    />
                                                    <span>{opt.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {profile === "counter-color" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="timelapse" size="sm" />
                                        Цветовые схемы счётчиков
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Для каждого <code>dataType: Counter</code>-атрибута создаётся{" "}
                                            <code>counterColorPatterns[]</code>. Пороги в формате{" "}
                                            <code>1w2d3h4m</code> или <code>60%</code>.{" "}
                                            <strong>Yellow должен быть ≤ Red</strong>.
                                        </span>
                                    </div>

                                    <div className="generate-schema-tree-grid">
                                        <label className="generate-schema-field">
                                            <span>Red (жёлтый → красный):</span>
                                            <input
                                                type="text"
                                                value={options.counterColorDefaultRed || "100%"}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        counterColorDefaultRed: e.target.value,
                                                    })
                                                }
                                                placeholder="100% или 1w"
                                            />
                                        </label>
                                        <label className="generate-schema-field">
                                            <span>Yellow (зелёный → жёлтый):</span>
                                            <input
                                                type="text"
                                                value={options.counterColorDefaultYellow || "50%"}
                                                onChange={(e) =>
                                                    setOptions({
                                                        ...options,
                                                        counterColorDefaultYellow: e.target.value,
                                                    })
                                                }
                                                placeholder="50% или 2d"
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {profile === "linked-groups" && (
                                <div className="generate-schema-block-group">
                                    <div className="generate-schema-block-group__title">
                                        <MIcon name="widgets" size="sm" />
                                        Linked Objects Groups
                                    </div>

                                    <div className="generate-schema-tabs-hint">
                                        <MIcon name="info" size="sm" />
                                        <span>
                                            Для каждой связи сущности с <code>side=2</code> создаётся виджет{" "}
                                            <code>linked_objects_groups</code> в существующем entity-view.{" "}
                                            Требует, чтобы <code>view$&#123;Entity&#125;</code> уже был в YAML.
                                        </span>
                                    </div>

                                    <label className="generate-schema-option">
                                        <input
                                            type="checkbox"
                                            checked={!!options.linkedGroupsIncludeSingles}
                                            onChange={(e) =>
                                                setOptions({
                                                    ...options,
                                                    linkedGroupsIncludeSingles: e.target.checked,
                                                })
                                            }
                                        />
                                        <span>
                                            Включать <code>side=1</code> связи (один объект, не группа)
                                        </span>
                                    </label>
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

                    {tab !== "options" && !isDomainScope && !entityId && (
                        <div className="generate-schema-empty">
                            <MIcon name="info" size="lg" />
                            <div>Выберите сущность для генерации</div>
                        </div>
                    )}

                    {/* ============ TAB: BLOCKS ============ */}
                    {tab === "blocks" && (entityId || isDomainScope) && (
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
                                                            {st === "modified" && (
                                                                <button
                                                                    type="button"
                                                                    className={
                                                                        "generate-schema-force-replace-btn" +
                                                                        (forceReplaceIds.has(b.blockId) ? " active" : "")
                                                                    }
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        toggleForceReplace(b.blockId);
                                                                    }}
                                                                    title={
                                                                        forceReplaceIds.has(b.blockId)
                                                                            ? "Блок будет перезаписан (ручные правки потеряются)"
                                                                            : "Перезаписать этот блок сгенерированным (ручные правки потеряются)"
                                                                    }
                                                                >
                                                                    <MIcon name="undo" size="sm" />
                                                                </button>
                                                            )}
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
                    {tab === "yaml" && (entityId || isDomainScope) && (
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
                    {tab === "skipped" && entityId && (
                        <div className="generate-schema-skipped-list">
                            {skipped.length === 0 && (
                                <div className="generate-schema-empty">Всё, что нужно, будет сгенерировано</div>
                            )}
                            {skipped.map((s) => {
                                const hint = getSkipReasonHint(s.reason, s.hint);
                                const displayId = s.id === "?" || s.id === "(не задана)" || !s.id ? "—" : s.id;
                                const quickFix = getSkipQuickFix(s.reason, {
                                    setProfile,
                                    setOptions: (fn) => setOptions(fn as any),
                                    setTab,
                                    openInYaml: () => {
                                        const st = useGraphStore.getState();
                                        const node = st.nodes.find((n) => n.data.domainId === domainId);
                                        if (node?.data.filePath) {
                                            st.setGenerateSchemaOpen(false);
                                            st.setYamlViewerFilePath(node.data.filePath);
                                            st.setYamlViewerFqid(null);
                                            st.setYamlViewerDomainId(domainId);
                                            st.setYamlViewerOpen(true);
                                        }
                                    },
                                });

                                return (
                                    <div
                                        key={`${s.section}:${s.id}:${s.reason}`}
                                        className={
                                            "generate-schema-skipped-row" +
                                            (hint ? " generate-schema-skipped-row--with-hint" : "")
                                        }
                                    >
                                        <div className="generate-schema-skipped-row__main">
                                            <MIcon name={skipReasonIcon(s.reason)} size="sm" />
                                            <code className="generate-schema-skipped-row__id">{displayId}</code>
                                            <span className="generate-schema-skipped-row__reason">
                                                {humanizeSkipReason(s.reason)}
                                            </span>
                                            <span className="generate-schema-skipped-row__section">{s.section}</span>
                                            {quickFix && (
                                                <button
                                                    type="button"
                                                    className="generate-schema-skipped-row__quickfix"
                                                    onClick={quickFix.onClick}
                                                    title={quickFix.label}
                                                >
                                                    <MIcon name={quickFix.icon} size="sm" />
                                                    <span>{quickFix.label}</span>
                                                </button>
                                            )}
                                        </div>
                                        {hint && (
                                            <div className="generate-schema-skipped-row__hint">
                                                <MIcon name="lightbulb" size="sm" />
                                                <span>{hint}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ============ TAB: ISSUES ============ */}
                    {tab === "issues" && entityId && (
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

                    {tab === "diff" && gen.result && (
                        <div className="generate-schema-diff">
                            {selected.size === 0 ? (
                                <div className="generate-schema-empty">
                                    Ничего не выбрано — отметьте блоки на вкладке «Блоки»
                                </div>
                            ) : (
                                Array.from(selected).map((blockId) => {
                                    const block = gen.result.blockIndex?.[blockId];
                                    if (!block) return null;

                                    const st = gen.result.manifestStatus?.[blockId];
                                    const currentPayload = currentRawData
                                        ? findPayloadByBlockId(currentRawData, blockId, block.parentViewId)
                                        : null;
                                    const currentYaml = currentPayload ? dumpYaml(currentPayload) : null;
                                    const newYaml = gen.result.yamlByBlock[blockId] ?? "";

                                    return (
                                        <div key={blockId} className="generate-schema-diff-block">
                                            <div className="generate-schema-diff-header">
                                                <MIcon name={iconForBlock(block)} size="sm" />
                                                <code className="generate-schema-diff-id">{blockId}</code>
                                                <span className="generate-schema-diff-title">{block.title}</span>
                                                {statusBadge(st)}
                                            </div>
                                            <div className="generate-schema-diff-body">
                                                <div className="generate-schema-diff-col">
                                                    <div className="generate-schema-diff-col-label">
                                                        <MIcon name="history" size="sm" />
                                                        Сейчас в YAML
                                                    </div>
                                                    <pre className="generate-schema-diff-pre">
                                                        {currentYaml ?? "// — нет в YAML —"}
                                                    </pre>
                                                </div>
                                                <div className="generate-schema-diff-col">
                                                    <div className="generate-schema-diff-col-label">
                                                        <MIcon name="auto_awesome" size="sm" />
                                                        После применения
                                                    </div>
                                                    <pre className="generate-schema-diff-pre">{newYaml}</pre>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* ============ FOOTER ============ */}
                <div className="generate-schema-footer">
                    <div className="generate-schema-preflight">
                        {editorLocked && (
                            <span className="generate-schema-badge generate-schema-badge--warn">
                                🔒 файл заблокирован в редакторе
                            </span>
                        )}
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
                            disabled={!finalCanApply}
                            title={
                                crudWithPageNoMenu
                                    ? "Профиль «CRUD + полная карточка» требует root_group в menus[] — создайте корневое меню или смените профиль"
                                    : !entityId ? "Сначала выберите сущность"
                                        : treeViewNeedsTarget ? "У сущности нет side-1 связей — постройте цепочку вручную или смените профиль"
                                            : editorLocked ? "Файл схемы заблокирован в редакторе"
                                                : profile === "technical" ? "Профиль «Техническая» не генерирует блоки"
                                                    : dependentsMissing.size > 0
                                                        ? `${dependentsMissing.size} блоков без зависимостей не будут применены (выбрано ${selected.size}, применится ${selected.size - dependentsMissing.size})`
                                                        : errorCount > 0 ? "Исправьте новые ошибки или снимите проблемные блоки"
                                                            : selected.size === 0 ? "Не выбрано ни одного блока"
                                                                : undefined
                            }
                        >
                            Применить ({selected.size - dependentsMissing.size})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Достаёт линейную tree-chain из существующего trees[].
 * null — если дерева нет, оно multi-branch, или пустое.
 */
export function extractLinearTreeChain(
    index: ModelIndex,
    domainId: string,
    entityId: string,
): TreeChain | null {
    const fqid = `${domainId}/${entityId}`.toLowerCase();

    const tree = index.trees.find(
        (t) =>
            t.domainId === domainId &&
            t.hierarchy.entity.toLowerCase() === fqid,
    );
    if (!tree) return null;
    if (!isLinearHierarchy(tree.hierarchy)) return null;

    const chain: TreeChain = [];
    let current: any = tree.hierarchy;
    while (Array.isArray(current.children) && current.children.length > 0) {
        const child = current.children[0];

        // linkage в индексе — FQID (lowercase). TreeChainBuilder
        // работает с локальными ID, поэтому вырезаем суффикс.
        const linkageFqid = String(child.linkage);
        const slash = linkageFqid.indexOf("/");
        const linkageId = slash > 0 ? linkageFqid.slice(slash + 1) : linkageFqid;

        // entity тоже FQID lowercase — нормализуем обратно в case-correct,
        // чтобы UI-селект (он матчит по строке) и YAML совпадали.
        const entityFqid = String(child.entity);
        const entityRec = index.entitiesByFqid[entityFqid.toLowerCase()];
        const caseEntityFqid = entityRec
            ? `${entityRec.domainId}/${entityRec.entityId}`
            : entityFqid;

        chain.push({
            linkageId,
            side: child.side === 2 ? 2 : 1,
            childEntityId: caseEntityFqid,
        });
        current = child;
    }

    return chain.length > 0 ? chain : null;
}

function isLinearHierarchy(node: { children?: any[] }): boolean {
    const kids = node.children || [];
    if (kids.length > 1) return false;
    if (kids.length === 0) return true;
    return isLinearHierarchy(kids[0]);
}

function dumpYaml(payload: unknown): string {
    try {
        return yaml.dump(payload, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
        }).trimEnd();
    } catch {
        return "/* ошибка сериализации */";
    }
}