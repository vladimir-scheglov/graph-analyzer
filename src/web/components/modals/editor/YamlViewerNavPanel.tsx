import React, { useMemo, useState } from "react";
import { MIcon } from "../../common/MIcon";
import { useGraphStore } from "../../../state/useGraphStore";
import type { LineMap, NavNode, SectionBlock } from "../../../lib/yaml/line-map";
import type { FocusTarget } from "../../../lib/yaml/entity-focus";
import type { UnusedAnalysis } from "../../../lib/yaml/unused-analysis";

// ============ Section categories ============

export interface SectionCategory {
    id: string;
    label: string;
    icon: string;
    keys: string[];
}

export const SECTION_CATEGORIES: SectionCategory[] = [
    {
        id: "structure",
        label: "Структура",
        icon: "account_tree",
        keys: ["entities", "linkages", "dataTypes", "sequences"],
    },
    {
        id: "behavior",
        label: "Поведение",
        icon: "bolt",
        keys: ["actions", "dataRules", "uiRules", "uiPresets", "mixins"],
    },
    {
        id: "presentation",
        label: "Интерфейс",
        icon: "view_quilt",
        keys: ["views", "menus", "medias", "widgets"],
    },
    {
        id: "data",
        label: "Данные",
        icon: "storage",
        keys: [
            "trees",
            "transitiveLinkages",
            "counterColorPattern",
            "counterColorPatterns",
            "exchangeSettings",
            "scenarios",
        ],
    },
    {
        id: "access",
        label: "Доступ",
        icon: "lock",
        keys: ["permissions", "accessRules", "localizations"],
    },
];

export function getCategoryForSection(key: string): SectionCategory | null {
    for (const cat of SECTION_CATEGORIES) {
        if (cat.keys.includes(key)) return cat;
    }
    return null;
}

// ============ Issue stats ============

export interface SectionIssueStats {
    error: number;
    warning: number;
    info: number;
    total: number;
}

const EMPTY_STATS: SectionIssueStats = { error: 0, warning: 0, info: 0, total: 0 };

export function severityOf(issues: any[] | undefined): SectionIssueStats {
    const stats: SectionIssueStats = { error: 0, warning: 0, info: 0, total: 0 };
    if (!issues) return stats;
    for (const i of issues) {
        if (i.severity === "error") stats.error++;
        else if (i.severity === "warning") stats.warning++;
        else stats.info++;
        stats.total++;
    }
    return stats;
}

function severityMeta(stats: SectionIssueStats): {
    icon: string;
    cls: "err" | "warn" | "info";
    title: string;
} | null {
    if (stats.total === 0) return null;
    const parts: string[] = [];
    if (stats.error > 0) parts.push(`🔴 ${stats.error} error`);
    if (stats.warning > 0) parts.push(`🟠 ${stats.warning} warning`);
    if (stats.info > 0) parts.push(`🔵 ${stats.info} info`);
    const title = parts.join(" · ");
    if (stats.error > 0) return { icon: "error", cls: "err", title };
    if (stats.warning > 0) return { icon: "warning", cls: "warn", title };
    return { icon: "info", cls: "info", title };
}

// ============ Nav query parsing ============

export interface ParsedNavQuery {
    text: string;
    sectionFilter: string | null;
    typeFilter: string | null;
    hasIssues: boolean | null;
    unused: boolean | null;
    raw: string;
}

export function parseNavQuery(raw: string): ParsedNavQuery {
    const trimmed = raw.trim();
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    let text = "";
    let sectionFilter: string | null = null;
    let typeFilter: string | null = null;
    let hasIssues: boolean | null = null;
    let unused: boolean | null = null;

    for (const t of tokens) {
        const lower = t.toLowerCase();
        if (t.startsWith("#") && t.length > 1) {
            sectionFilter = t.slice(1).toLowerCase();
        } else if (lower.startsWith("type:") && t.length > 5) {
            typeFilter = t.slice(5).toLowerCase();
        } else if (lower === "issues") {
            hasIssues = true;
        } else if (lower === "no-issues") {
            hasIssues = false;
        } else if (lower === "unused") {
            unused = true;
        } else if (lower === "used") {
            unused = false;
        } else {
            text = text ? text + " " + t : t;
        }
    }

    return {
        text: text.toLowerCase(),
        sectionFilter,
        typeFilter,
        hasIssues,
        unused,
        raw: trimmed,
    };
}

export function isEmptyParsedQuery(p: ParsedNavQuery): boolean {
    return (
        p.text === "" &&
        p.sectionFilter === null &&
        p.typeFilter === null &&
        p.hasIssues === null &&
        p.unused === null
    );
}

// ============ Unused check ============

function checkUnused(
    unusedAnalysis: UnusedAnalysis | null,
    sectionKey: string,
    node: NavNode,
    depth: number,
    parentKey: string,
): { isUnused: boolean; hint: string | null } {
    if (!unusedAnalysis) return { isUnused: false, hint: null };

    if (sectionKey === "entities") {
        if (depth === 0) {
            if (unusedAnalysis.entities.has(node.id.toLowerCase())) {
                return {
                    isUnused: true,
                    hint:
                        "Сущность не используется: нет inherits, Reference, linkages, " +
                        "views, actions, dataRules, mixins, trees, transitiveLinkages",
                };
            }
        } else if (depth === 1) {
            const entityId = parentKey.split("#")[1];
            if (entityId) {
                const attrKey = `${entityId.toLowerCase()}:${node.id.toLowerCase()}`;
                if (unusedAnalysis.attributes.has(attrKey)) {
                    return {
                        isUnused: true,
                        hint:
                            "Атрибут не используется ни в views, ни в правилах, " +
                            "ни в фильтрах, ни в search/sorting",
                    };
                }
            }
        }
        return { isUnused: false, hint: null };
    }

    if (depth === 0) {
        if (sectionKey === "actions" && unusedAnalysis.actions.has(node.id)) {
            return { isUnused: true, hint: "Действие не используется" };
        }
        if (sectionKey === "dataTypes" && unusedAnalysis.dataTypes.has(node.id)) {
            return { isUnused: true, hint: "Тип данных не используется ни одним атрибутом" };
        }
        if (sectionKey === "sequences" && unusedAnalysis.sequences.has(node.id)) {
            return { isUnused: true, hint: "Последовательность не используется" };
        }
        if (sectionKey === "medias" && unusedAnalysis.medias.has(node.id)) {
            return { isUnused: true, hint: "Иконка не используется ни в одном виджете/меню" };
        }
        if (sectionKey === "trees" && unusedAnalysis.trees.has(node.id)) {
            return { isUnused: true, hint: "Дерево не используется ни в одном tree-view" };
        }
        if (
            (sectionKey === "counterColorPattern" ||
                sectionKey === "counterColorPatterns") &&
            unusedAnalysis.counterColorPatterns.has(node.id)
        ) {
            return { isUnused: true, hint: "Цветовая схема счётчика не используется" };
        }
        if (sectionKey === "uiPresets" && unusedAnalysis.uiPresets.has(node.id)) {
            return { isUnused: true, hint: "UI Preset не используется ни в одном uiRule" };
        }
        if (sectionKey === "permissions" && unusedAnalysis.permissions.has(node.id)) {
            return { isUnused: true, hint: "Разрешение не используется ни в одном accessRule" };
        }
        if (
            sectionKey === "transitiveLinkages" &&
            unusedAnalysis.transitiveLinkages.has(node.id)
        ) {
            return { isUnused: true, hint: "Транзитивная связь не используется" };
        }
    }

    if (sectionKey === "views" && depth >= 1) {
        if (unusedAnalysis.nestedViews.some((nv) => nv.id === node.id)) {
            return {
                isUnused: true,
                hint: "Вложенное представление не используется (нет action.modal/panel/pageView)",
            };
        }
    }

    return { isUnused: false, hint: null };
}

// ============ FilteredNavList ============

export interface FilteredRow {
    key: string;
    label: string;
    line: number;
    depth: number;
    sectionKey: string;
    sectionLabel: string;
    node: NavNode;
    issues: SectionIssueStats;
    isUnused: boolean;
    unusedHint: string | null;
    meta?: string;
    /** Есть ли вложенные узлы (children у node). */
    hasChildren: boolean;
    /** Раскрыт ли узел в дереве. */
    expanded: boolean;
}

const FilteredNavListImpl = function FilteredNavList({
    rows,
    activeKey,
    onJump,
    onHover,
    focusTarget,
    onFocus,
    onContextMenu,
    onOpenIssues,
}: {
    rows: FilteredRow[];
    activeKey: string | null;
    onJump: (line: number) => void;
    onHover: (idx: number) => void;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
    onContextMenu: (node: NavNode, sectionKey: string, x: number, y: number) => void;
    onOpenIssues: () => void;
}) {
    if (rows.length === 0) {
        return <div className="yaml-viewer-nav__empty">Ничего не найдено</div>;
    }

    const grouped = useMemo(() => {
        const m = new Map<string, { label: string; rows: FilteredRow[] }>();
        for (const r of rows) {
            if (!m.has(r.sectionKey)) {
                m.set(r.sectionKey, { label: r.sectionLabel, rows: [] });
            }
            m.get(r.sectionKey)!.rows.push(r);
        }
        return Array.from(m.entries());
    }, [rows]);

    let flatIdx = 0;

    return (
        <div className="yaml-nav-filtered">
            {grouped.map(([sectionKey, group]) => (
                <div key={sectionKey} className="yaml-nav-filtered-group">
                    <div className="yaml-nav-filtered-group__title">
                        <span>{group.label}</span>
                        <span className="yaml-nav-filtered-group__count">
                            {group.rows.length}
                        </span>
                    </div>
                    {group.rows.map((r) => {
                        const idx = flatIdx++;
                        const canFocus =
                            r.depth === 0 &&
                            (r.sectionKey === "entities" || r.sectionKey === "linkages");
                        const isFocusActive = !!(
                            canFocus &&
                            focusTarget &&
                            ((focusTarget.kind === "entity" &&
                                r.sectionKey === "entities" &&
                                focusTarget.id === r.node.id) ||
                                (focusTarget.kind === "linkage" &&
                                    r.sectionKey === "linkages" &&
                                    focusTarget.id === r.node.id))
                        );
                        const sev = severityMeta(r.issues);
                        const showWorkflow =
                            r.sectionKey === "dataTypes" &&
                            r.depth === 0 &&
                            r.node.meta === "Workflow";
                        const isActive = activeKey === r.key;    

                        return (
                            <div
                                key={r.key}
                                className={
                                    "yaml-nav-filtered-row" +
                                    (isActive ? " yaml-nav-filtered-row--active" : "") +
                                    (r.isUnused ? " yaml-nav-filtered-row--unused" : "")
                                }
                                title={r.unusedHint || undefined}
                                onMouseEnter={() => onHover(idx)}
                            >
                                <button
                                    type="button"
                                    className="yaml-nav-filtered-item__main"
                                    onClick={() => onJump(r.line)}
                                    title={`Перейти к строке ${r.line}`}
                                >
                                    <code className="yaml-nav-filtered-item__id">{r.label}</code>
                                    {r.meta && (
                                        <span className="yaml-nav-filtered-item__meta">
                                            {r.meta}
                                        </span>
                                    )}
                                    {sev && (
                                        <span
                                            className={"yaml-nav-issue yaml-nav-issue--" + sev.cls}
                                            title={sev.title}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenIssues();
                                            }}
                                        >
                                            <MIcon name={sev.icon} size="sm" />
                                            {r.issues.total}
                                        </span>
                                    )}
                                    {r.isUnused && (
                                        <span className="yaml-nav-unused-badge" title="Unused">
                                            ∅
                                        </span>
                                    )}
                                    <span className="yaml-nav-filtered-item__line">
                                        :{r.line}
                                    </span>
                                </button>

                                {canFocus && (
                                    <button
                                        type="button"
                                        className={
                                            "yaml-nav-filtered-item__focus" +
                                            (isFocusActive
                                                ? " yaml-nav-filtered-item__focus--active"
                                                : "")
                                        }
                                        onClick={() => onFocus(r.node, r.sectionKey)}
                                        title={isFocusActive ? "Снять фокус" : "Фокус на этом элементе"}
                                        aria-label={isFocusActive ? "Снять фокус" : "Фокус"}
                                        aria-pressed={isFocusActive}
                                    >
                                        <MIcon name="my_location" size="sm" />
                                    </button>
                                )}

                                {showWorkflow && (
                                    <button
                                        type="button"
                                        className="yaml-nav-filtered-item__workflow-graph"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const domainId =
                                                useGraphStore.getState().yamlViewerDomainId;
                                            if (!domainId) return;
                                            useGraphStore.getState().setWorkflowGraphTarget({
                                                domainId,
                                                dataTypeId: r.node.id,
                                            });
                                        }}
                                        title="Граф переходов"
                                        aria-label="Граф переходов"
                                    >
                                        <MIcon name="conversion_path" size="sm" />
                                    </button>
                                )}

                                {canFocus && (
                                    <button
                                        type="button"
                                        className="yaml-nav-filtered-item__more"
                                        onClick={(e) => {
                                            const rect = (
                                                e.currentTarget as HTMLElement
                                            ).getBoundingClientRect();
                                            onContextMenu(r.node, r.sectionKey, rect.left, rect.bottom);
                                        }}
                                        title="Действия"
                                        aria-label="Дополнительные действия"
                                    >
                                        <MIcon name="more_horiz" size="sm" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

export const FilteredNavList = React.memo(FilteredNavListImpl);

// ============ NavItem ============

interface NavItemProps {
    node: NavNode;
    parentKey: string;
    depth: number;
    expandedNodes: Set<string>;
    onToggleNode: (key: string) => void;
    onJump: (line: number) => void;
    activeKey: string | null;
    sectionKey: string;
    issueStats: SectionIssueStats;
    entityIssuesMap: Map<string, any[]>;
    attrIssuesMap: Map<string, any[]>;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
    onContextMenu: (node: NavNode, sectionKey: string, x: number, y: number) => void;
    unusedAnalysis: UnusedAnalysis | null;
    cursorEntityId: string | null;
    cursorAttributeId: string | null;
}

const NavItemImpl = function NavItem(props: NavItemProps) {
    const {
        node,
        parentKey,
        depth,
        expandedNodes,
        onToggleNode,
        onJump,
        activeKey,
        sectionKey,
        issueStats,
        focusTarget,
        onFocus,
        onContextMenu,
        unusedAnalysis,
        cursorEntityId,
        cursorAttributeId,
    } = props;

    const key = parentKey + "#" + node.id;
    const hasChildren = !!node.children && node.children.length > 0;
    const expanded = expandedNodes.has(key);

    const { isUnused, hint } = checkUnused(
        unusedAnalysis,
        sectionKey,
        node,
        depth,
        parentKey,
    );

    const isActive = activeKey === key;

    const isCursorHere = useMemo(() => {
        if (sectionKey === "entities") {
            if (depth === 0 && cursorEntityId === node.id) return true;
            if (depth === 1 && cursorAttributeId === node.id) return true;
        }
        return false;
    }, [sectionKey, depth, cursorEntityId, cursorAttributeId, node.id]);

    const sev = severityMeta(issueStats);
    const childrenCount = node.children?.length || 0;

    return (
        <div className={"yaml-nav-item yaml-nav-item--d" + Math.min(depth, 4)}>
            <div
                className={
                    "yaml-nav-item__row" +
                    (isActive ? " yaml-nav-item__row--active" : "") +
                    (isCursorHere ? " yaml-nav-item__row--cursor" : "")
                }
                onContextMenu={(e) => {
                    if (depth !== 0) return;
                    if (sectionKey !== "entities" && sectionKey !== "linkages") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(node, sectionKey, e.clientX, e.clientY);
                }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        className={
                            "yaml-nav-item__chevron-btn" +
                            (expanded ? " yaml-nav-item__chevron-btn--expanded" : "")
                        }
                        onClick={() => onToggleNode(key)}
                        title={expanded ? "Свернуть" : "Развернуть"}
                    />
                ) : (
                    <span className="yaml-nav-item__chevron-btn yaml-nav-item__chevron-btn--empty" />
                )}
                <button
                    type="button"
                    className={
                        "yaml-nav-item__head" +
                        (isUnused ? " yaml-nav-item__head--unused" : "")
                    }
                    onClick={() => {
                        onJump(node.line);
                    }}
                    title={isUnused ? hint || undefined : undefined}
                >
                    <code className="yaml-nav-item__id">{node.id}</code>
                    {node.meta && <span className="yaml-nav-item__meta">{node.meta}</span>}
                    {hasChildren && (
                        <span
                            className="yaml-nav-item__children-badge"
                            title={`${childrenCount} вложенных`}
                        >
                            {childrenCount}
                        </span>
                    )}
                    {sev && (
                        <span
                            className={"yaml-nav-item__issues yaml-nav-item__issues--" + sev.cls}
                            title={sev.title}
                        >
                            <MIcon name={sev.icon} size="sm" />
                        </span>
                    )}
                </button>
                {sectionKey === "linkages" && depth === 0 && (
                    <button
                        type="button"
                        className={
                            "yaml-nav-item__focus" +
                            (focusTarget &&
                                focusTarget.kind === "linkage" &&
                                focusTarget.id === node.id
                                ? " yaml-nav-item__focus--active"
                                : "")
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            onFocus(node, sectionKey);
                        }}
                        title={
                            focusTarget && focusTarget.id === node.id
                                ? "Снять фокус"
                                : "Фокус на этом элементе"
                        }
                    >
                        <MIcon name="my_location" size="sm" />
                    </button>
                )}
                {sectionKey === "entities" && depth === 0 && (
                    <button
                        type="button"
                        className="yaml-nav-item__more"
                        onClick={(e) => {
                            e.stopPropagation();
                            const rect = (
                                e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            onContextMenu(node, sectionKey, rect.left, rect.bottom);
                        }}
                        title="Действия"
                    >
                        <MIcon name="more_horiz" size="sm" />
                    </button>
                )}
                {sectionKey === "dataTypes" && depth === 0 && node.meta === "Workflow" && (
                    <button
                        type="button"
                        className="yaml-nav-item__focus yaml-nav-item__workflow-graph"
                        onClick={(e) => {
                            e.stopPropagation();
                            const domainId = useGraphStore.getState().yamlViewerDomainId;
                            if (!domainId) return;
                            useGraphStore.getState().setWorkflowGraphTarget({
                                domainId,
                                dataTypeId: node.id,
                            });
                        }}
                        title="Граф переходов"
                    >
                        <MIcon name="conversion_path" size="sm" />
                    </button>
                )}
            </div>

            {hasChildren && expanded && (
                <div className="yaml-nav-item__children">
                    {node.children!.map((child) => {
                        const childStats =
                            sectionKey === "entities"
                                ? severityOf(props.attrIssuesMap.get(child.id.toLowerCase()))
                                : EMPTY_STATS;
                        return (
                            <NavItem
                                key={child.id}
                                node={child}
                                parentKey={key}
                                depth={depth + 1}
                                expandedNodes={expandedNodes}
                                onToggleNode={onToggleNode}
                                onJump={onJump}
                                activeKey={activeKey}
                                sectionKey={sectionKey}
                                issueStats={childStats}
                                entityIssuesMap={props.entityIssuesMap}
                                attrIssuesMap={props.attrIssuesMap}
                                focusTarget={focusTarget}
                                onFocus={onFocus}
                                onContextMenu={onContextMenu}
                                unusedAnalysis={unusedAnalysis}
                                cursorEntityId={cursorEntityId}
                                cursorAttributeId={cursorAttributeId}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * Кастомный comparator: пропускаем re-render, если изменились только
 * cursor/active-пропсы, и при этом данный узел не стал/перестал быть
 * активным или под курсором.
 *
 * Это критично: cursorEntityId/cursorAttributeId/activeKey меняются
 * на каждый keystroke, и без этого memo 500 NavItem'ов перерисовывались
 * бы 8 раз в секунду.
 */
export const NavItem = React.memo(NavItemImpl, (prev, next) => {
    // 1. Если изменились НЕ-cursor/non-active props — всегда re-render
    if (
        prev.node !== next.node ||
        prev.parentKey !== next.parentKey ||
        prev.depth !== next.depth ||
        prev.sectionKey !== next.sectionKey ||
        prev.expandedNodes !== next.expandedNodes ||
        prev.focusTarget !== next.focusTarget ||
        prev.issueStats !== next.issueStats ||
        prev.unusedAnalysis !== next.unusedAnalysis ||
        prev.entityIssuesMap !== next.entityIssuesMap ||
        prev.attrIssuesMap !== next.attrIssuesMap ||
        prev.onToggleNode !== next.onToggleNode ||
        prev.onJump !== next.onJump ||
        prev.onFocus !== next.onFocus ||
        prev.onContextMenu !== next.onContextMenu
    ) {
        return false; // props differ → re-render
    }

    // 2. Изменились только cursor/active — проверяем свою релевантность
    const myKey = prev.parentKey + "#" + prev.node.id;

    const prevActive = prev.activeKey === myKey;
    const nextActive = next.activeKey === myKey;
    if (prevActive !== nextActive) return false;

    const prevCursorHere =
        prev.sectionKey === "entities" &&
        ((prev.depth === 0 && prev.cursorEntityId === prev.node.id) ||
            (prev.depth === 1 && prev.cursorAttributeId === prev.node.id));
    const nextCursorHere =
        next.sectionKey === "entities" &&
        ((next.depth === 0 && next.cursorEntityId === next.node.id) ||
            (next.depth === 1 && next.cursorAttributeId === next.node.id));
    if (prevCursorHere !== nextCursorHere) return false;

    // 3. Всё остальное совпадает → skip re-render
    return true;
});

// ============ SectionNavPanel ============

export interface SectionNavPanelProps {
    section: SectionBlock;
    expandedNodes: Set<string>;
    onToggleNode: (key: string) => void;
    onJump: (line: number) => void;
    issues: any[];
    onSetActive: (idx: number) => void;
    activeKey: string | null;
    sectionKey: string;
    entityIssuesMap: Map<string, any[]>;
    attrIssuesMap: Map<string, any[]>;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
    onContextMenu: (node: NavNode, sectionKey: string, x: number, y: number) => void;
    unusedAnalysis: UnusedAnalysis | null;
    cursorEntityId: string | null;
    cursorAttributeId: string | null;
    onOpenIssues: () => void;
}

const SectionNavPanelImpl = function SectionNavPanel(props: SectionNavPanelProps) {
    const {
        section,
        sectionKey,
        expandedNodes,
        onToggleNode,
        onJump,
        activeKey,
        onSetActive,
        entityIssuesMap,
        attrIssuesMap,
        focusTarget,
        onFocus,
        onContextMenu,
        unusedAnalysis,
        cursorEntityId,
        cursorAttributeId,
        onOpenIssues,
    } = props;

    const [open, setOpen] = useState(true);
    const detailsRef = React.useRef<HTMLDetailsElement>(null);

    React.useEffect(() => {
        if (detailsRef.current && detailsRef.current.dataset.initialized !== "1") {
            detailsRef.current.open = true;
            detailsRef.current.dataset.initialized = "1";
        }
    }, []);

    const sectionStats = useMemo<SectionIssueStats>(() => {
        const stats: SectionIssueStats = { error: 0, warning: 0, info: 0, total: 0 };
        for (const node of section.nodes) {
            const list =
                sectionKey === "entities"
                    ? entityIssuesMap.get(node.id.toLowerCase())
                    : undefined;
            const st = severityOf(list);
            stats.error += st.error;
            stats.warning += st.warning;
            stats.info += st.info;
            stats.total += st.total;
        }
        return stats;
    }, [section.nodes, sectionKey, entityIssuesMap]);

    const unusedCount = useMemo(() => {
        if (!unusedAnalysis) return 0;
        let count = 0;
        if (sectionKey === "entities") {
            for (const node of section.nodes) {
                if (unusedAnalysis.entities.has(node.id.toLowerCase())) count++;
            }
        } else if (sectionKey === "actions") {
            for (const node of section.nodes) {
                if (unusedAnalysis.actions.has(node.id)) count++;
            }
        } else if (sectionKey === "dataTypes") {
            for (const node of section.nodes) {
                if (unusedAnalysis.dataTypes.has(node.id)) count++;
            }
        } else if (sectionKey === "medias") {
            for (const node of section.nodes) {
                if (unusedAnalysis.medias.has(node.id)) count++;
            }
        } else if (sectionKey === "trees") {
            for (const node of section.nodes) {
                if (unusedAnalysis.trees.has(node.id)) count++;
            }
        } else if (
            sectionKey === "counterColorPattern" ||
            sectionKey === "counterColorPatterns"
        ) {
            for (const node of section.nodes) {
                if (unusedAnalysis.counterColorPatterns.has(node.id)) count++;
            }
        }
        return count;
    }, [unusedAnalysis, section, sectionKey]);

    const sev = severityMeta(sectionStats);

    return (
        <details
            ref={detailsRef}
            className="yaml-nav-section"
            data-section-key={section.key}
            open={open}
            onToggle={(e) => {
                const next = (e.currentTarget as HTMLDetailsElement).open;
                if (next !== open) setOpen(next);
            }}
        >
            <summary className="yaml-nav-section__head">
                <span className="yaml-nav-section__chevron" aria-hidden="true" />
                <span
                    className="yaml-nav-section__label"
                    title={`${section.count} элементов · ${section.linesCount} строк`}
                >
                    {section.label}
                    <span className="yaml-nav-section__lines">~{section.linesCount}</span>
                </span>
                {section.count > 0 && (
                    <span className="yaml-nav-section__count">{section.count}</span>
                )}
                {sev && (
                    <span
                        className={"yaml-nav-section__issues yaml-nav-section__issues--" + sev.cls}
                        title={sev.title}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenIssues();
                        }}
                    >
                        <MIcon name={sev.icon} size="sm" />
                        {sectionStats.total}
                    </span>
                )}
                {unusedCount > 0 && (
                    <span
                        className="yaml-nav-section__unused"
                        title={`${unusedCount} неиспользуемых в этой секции`}
                    >
                        ∅{unusedCount}
                    </span>
                )}
                <button
                    type="button"
                    className="yaml-nav-section__jump"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onJump(section.line);
                    }}
                    title="Перейти к разделу"
                >
                    →
                </button>
            </summary>

            {section.nodes.length > 0 && (
                <div className="yaml-nav-section__items">
                    {section.nodes.map((node) => {
                        const issuesList =
                            sectionKey === "entities"
                                ? entityIssuesMap.get(node.id.toLowerCase())
                                : undefined;
                        return (
                            <NavItem
                                key={node.id}
                                node={node}
                                parentKey={section.key}
                                depth={0}
                                expandedNodes={expandedNodes}
                                onToggleNode={onToggleNode}
                                onJump={onJump}
                                activeKey={activeKey}
                                sectionKey={sectionKey}
                                issueStats={severityOf(issuesList)}
                                entityIssuesMap={entityIssuesMap}
                                attrIssuesMap={attrIssuesMap}
                                focusTarget={focusTarget}
                                onFocus={onFocus}
                                onContextMenu={onContextMenu}
                                unusedAnalysis={unusedAnalysis}
                                cursorEntityId={cursorEntityId}
                                cursorAttributeId={cursorAttributeId}
                            />
                        );
                    })}
                </div>
            )}
        </details>
    );
}

export const SectionNavPanel = React.memo(SectionNavPanelImpl, (prev, next) => {
    return (
        prev.section === next.section &&
        prev.sectionKey === next.sectionKey &&
        prev.expandedNodes === next.expandedNodes &&
        prev.activeKey === next.activeKey &&
        prev.cursorEntityId === next.cursorEntityId &&
        prev.cursorAttributeId === next.cursorAttributeId &&
        prev.focusTarget === next.focusTarget &&
        prev.issues === next.issues &&
        prev.entityIssuesMap === next.entityIssuesMap &&
        prev.attrIssuesMap === next.attrIssuesMap &&
        prev.unusedAnalysis === next.unusedAnalysis &&
        prev.onToggleNode === next.onToggleNode &&
        prev.onJump === next.onJump &&
        prev.onSetActive === next.onSetActive &&
        prev.onFocus === next.onFocus &&
        prev.onContextMenu === next.onContextMenu &&
        prev.onOpenIssues === next.onOpenIssues
    );
});