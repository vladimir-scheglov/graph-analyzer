import React, { useEffect, useMemo, useRef, useState } from "react";
import { MIcon } from "../../common/MIcon";
import { HighlightedText } from "../../common/HighlightedText";
import type { LineMap, NavNode } from "../../../lib/yaml/line-map";
import type { ModelIndex } from "../../../../shared/model-types";
import { useGraphStore } from "../../../state/useGraphStore";
import { createPortal } from "react-dom";
import { Hint } from "../../common/Hint";
import { pluralFew } from "../../../lib/format";

export type JumpKind =
    | "file-start"
    | "file-end"
    | "section-start"
    | "section-end"
    | "element"
    | "line"
    | "search-hit"
    | "help";

export type JumpSeverity = "error" | "warning" | "info";

export interface JumpItem {
    key: string;
    kind: JumpKind;
    rawId?: string;
    label: string;
    sublabel?: string;
    breadcrumbs?: string[];
    line: number;
    column?: number;
    icon?: string;
    sectionKey?: string;
    score: number;
    severity?: JumpSeverity;
    /** Для help-айтемов — пример синтаксиса, который подставляется в input. */
    helpExample?: string;
}

interface SuggestionGroup {
    label: string;
    items: JumpItem[];
}

type QuickJumpFilter =
    | "all"
    | "section"
    | "element"
    | "problem"
    | "hit"
    | "line"
    | "favorite";

const FILTER_LABELS: Record<QuickJumpFilter, string> = {
    all: "Все",
    section: "Секции",
    element: "Элементы",
    problem: "Проблемы",
    hit: "Совпадения",
    line: "Строки",
    favorite: "Избранные",
};

function classifyJumpItem(
    item: JumpItem,
    favorites: Set<string>,
): Set<QuickJumpFilter> {
    const out = new Set<QuickJumpFilter>();
    out.add("all");
    if (item.kind === "section-start" || item.kind === "section-end")
        out.add("section");
    if (item.kind === "element") {
        out.add("element");
        const fk = favKey(item);
        if (fk && favorites.has(fk)) out.add("favorite");
    }
    if (item.kind === "search-hit") {
        if (item.severity) out.add("problem");
        else out.add("hit");
    }
    if (item.kind === "line") out.add("line");
    return out;
}

export interface YamlQuickJumpProps {
    lineMap: LineMap;
    content: string;
    index?: ModelIndex | null;
    domainId?: string | null;
    cursorLine?: number;
    /** Lint-issues текущего файла — для режима `!`. */
    domainIssues?: any[];
    initialQuery?: string | null;
    onSelect: (line: number, column?: number) => void;
    onClose: () => void;
}

const MAX_RESULTS = 30;
const MAX_NODES_CACHED = 8000;
const RECENT_KEY = "dg-quickjump-recent";
const RECENT_MAX = 10;
const HOVER_DELAY = 280;
const FAVORITES_KEY = "dg-quickjump-favorites";
const FAVORITES_MAX = 30;

const SECTION_ICONS: Record<string, string> = {
    entities: "category",
    linkages: "link",
    dataTypes: "data_object",
    sequences: "linear_scale",
    counterColorPattern: "timelapse",
    counterColorPatterns: "timelapse",
    trees: "account_tree",
    transitiveLinkages: "conversion_path",
    mixins: "merge",
    dataRules: "rule",
    exchangeSettings: "swap_horiz",
    actions: "bolt",
    medias: "image",
    views: "visibility",
    menus: "menu",
    permissions: "key",
    accessRules: "lock",
    localizations: "translate",
    uiRules: "rule_folder",
    uiPresets: "palette",
};

const HELP_ITEMS: JumpItem[] = [
    {
        key: "help:plain",
        kind: "help",
        label: "audit",
        sublabel: "поиск по id, name, описанию, секциям и элементам",
        line: 1,
        icon: "help",
        score: 1000,
        helpExample: "audit",
    },
    {
        key: "help:section",
        kind: "help",
        label: "#entities audit",
        sublabel: "фильтр по секции (entities / views / actions / ...)",
        line: 1,
        icon: "help",
        score: 900,
        helpExample: "#entities ",
    },
    {
        key: "help:line",
        kind: "help",
        label: ":42",
        sublabel: "перейти к строке",
        line: 1,
        icon: "help",
        score: 800,
        helpExample: ":42",
    },
    {
        key: "help:line-col",
        kind: "help",
        label: ":42:5",
        sublabel: "перейти к строке и колонке",
        line: 1,
        icon: "help",
        score: 780,
        helpExample: ":42:5",
    },
    {
        key: "help:search",
        kind: "help",
        label: ">id:",
        sublabel: "поиск по содержимому файла (как Ctrl+F, но с прыжком)",
        line: 1,
        icon: "help",
        score: 700,
        helpExample: ">id:",
    },
    {
        key: "help:attr",
        kind: "help",
        label: "@auditScore",
        sublabel: "поиск атрибута по всему домену (кросс-сущностный)",
        line: 1,
        icon: "help",
        score: 600,
        helpExample: "@",
    },
    {
        key: "help:neighbors",
        kind: "help",
        label: "~",
        sublabel: "соседние элементы: 5 до и 5 после курсора",
        line: 1,
        icon: "help",
        score: 550,
        helpExample: "~",
    },
    {
        key: "help:neighbors-filter",
        kind: "help",
        label: "~audit",
        sublabel: "соседние элементы, отфильтрованные по «audit»",
        line: 1,
        icon: "help",
        score: 545,
        helpExample: "~audit",
    },
    {
        key: "help:copy-path",
        kind: "help",
        label: "Ctrl+Click на элементе",
        sublabel: "копировать его путь (entities/Audit) в буфер",
        line: 1,
        icon: "content_copy",
        score: 500,
        helpExample: "",
    },
    {
        key: "help:copy-all",
        kind: "help",
        label: "📋 Все",
        sublabel: "кнопка в шапке — копировать все видимые результаты",
        line: 1,
        icon: "content_copy",
        score: 490,
        helpExample: "",
    },
    {
        key: "help:fav",
        kind: "help",
        label: "★",
        sublabel: "звёздочка справа у элемента — добавить в избранные",
        line: 1,
        icon: "help",
        score: 450,
        helpExample: "",
    },
    {
        key: "help:issues",
        kind: "help",
        label: "!audit",
        sublabel: "перейти к проблеме линтера (по правилу/сообщению/сущности)",
        line: 1,
        icon: "help",
        score: 500,
        helpExample: "!",
    },
    {
        key: "help:fqid",
        kind: "help",
        label: "domain.tld/Audit",
        sublabel: "перейти к сущности по FQID",
        line: 1,
        icon: "help",
        score: 400,
        helpExample: "",
    },
    {
        key: "help:regex",
        kind: "help",
        label: ">/lists_\\w+/i",
        sublabel: "regex-поиск по содержимому файла",
        line: 1,
        icon: "code",
        score: 650,
        helpExample: ">/lists_\\w+/i",
    },
];

const QUERIES_KEY = "dg-quickjump-queries";
const QUERIES_MAX = 5;

interface IndexedItem {
    key: string;
    kind: "section-start" | "section-end" | "element";
    rawId: string;
    label: string;
    sublabel: string;
    breadcrumbs: string[];
    line: number;
    sectionKey: string;
    icon: string;
    depth: number;
}

interface RecentEntry {
    sectionKey: string;
    rawId: string;
    label: string;
    line: number;
    usedAt: number;
}

/* ───────────────────────── build index ───────────────────────── */

function loadFavorites(): Set<string> {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
    } catch {
        return new Set();
    }
}

function saveFavorites(set: Set<string>): void {
    try {
        localStorage.setItem(
            FAVORITES_KEY,
            JSON.stringify(Array.from(set).slice(0, FAVORITES_MAX)),
        );
    } catch { }
}

function favKey(item: JumpItem): string | null {
    if (!item.sectionKey || !item.rawId) return null;
    return `${item.sectionKey}:${item.rawId}`;
}

function buildIndex(
    lineMap: LineMap,
    index?: ModelIndex | null,
    domainId?: string | null,
): IndexedItem[] {
    const items: IndexedItem[] = [];
    const cur = (domainId || "").toLowerCase();
    let count = 0;

    for (const section of lineMap.sections) {
        const icon = SECTION_ICONS[section.key] || "folder";
        const endLine = Math.max(
            section.line,
            section.line + section.linesCount - 1,
        );

        items.push({
            key: `section-start:${section.key}`,
            kind: "section-start",
            rawId: section.key,
            label: section.label,
            sublabel: `${section.key} · начало · строки ${section.line}–${endLine}`,
            breadcrumbs: [],
            line: section.line,
            sectionKey: section.key,
            icon: "play_arrow",
            depth: 0,
        });
        items.push({
            key: `section-end:${section.key}`,
            kind: "section-end",
            rawId: section.key,
            label: section.label,
            sublabel: `${section.key} · конец · строка ${endLine}`,
            breadcrumbs: [],
            line: endLine,
            sectionKey: section.key,
            icon: "last_page",
            depth: 0,
        });

        const walk = (nodes: NavNode[], crumbs: string[], depth: number): void => {
            for (const node of nodes) {
                if (count >= MAX_NODES_CACHED) return;
                count++;

                let sublabel = node.meta || node.type || "";
                if (index && cur && section.key === "entities") {
                    const fqid = `${cur}/${node.id}`.toLowerCase();
                    const entity = index.entitiesByFqid[fqid];
                    if (entity) {
                        const parts: string[] = [];
                        if (entity.name && entity.name !== node.id) parts.push(entity.name);
                        if (entity.description) parts.push(entity.description);
                        parts.push(`${entity.attributes.length} атр.`);
                        sublabel = parts.join(" · ");
                    }
                }

                items.push({
                    key: `element:${section.key}:${node.id}:${node.line}`,
                    kind: "element",
                    rawId: node.id,
                    label: node.label || node.id,
                    sublabel,
                    breadcrumbs: [...crumbs, section.label],
                    line: node.line,
                    sectionKey: section.key,
                    icon,
                    depth,
                });

                if (node.children?.length) {
                    walk(
                        node.children,
                        [...crumbs, `${section.label} › ${node.id}`],
                        depth + 1,
                    );
                }
            }
        };
        walk(section.nodes, [], 1);
    }

    return items;
}

/* ───────────────────────── scoring ───────────────────────── */

function scoreTerm(item: IndexedItem, term: string): number {
    const q = term.toLowerCase().trim();
    if (!q) return 0;

    const raw = item.rawId.toLowerCase();
    const label = item.label.toLowerCase();
    const sub = item.sublabel.toLowerCase();
    const key = item.sectionKey.toLowerCase();

    let s = 0;
    if (raw === q) s = 2000;
    else if (label === q) s = 1500;
    else if (sub === q) s = 1200;
    else if (key === q) s = 1000;
    else if (raw.startsWith(q)) s = 700;
    else if (label.startsWith(q)) s = 500;
    else if (sub.startsWith(q)) s = 400;
    else if (key.startsWith(q)) s = 350;
    else if (raw.includes(q)) s = 300;
    else if (label.includes(q)) s = 250;
    else if (sub.includes(q)) s = 200;
    else if (key.includes(q)) s = 150;
    else if (q.length >= 2) {
        let pos = 0;
        for (let i = 0; i < label.length && pos < q.length; i++) {
            if (label[i] === q[pos]) pos++;
        }
        if (pos === q.length) s = 80;
    }
    if (s === 0) return 0;
    return Math.max(1, s - item.depth * 5);
}

function scoreItem(item: IndexedItem, query: string): number {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return 0;
    const scores = terms.map((t) => scoreTerm(item, t));
    if (scores.some((s) => s === 0)) return 0;
    return Math.min(...scores);
}

function parseSectionFilter(query: string): {
    sectionQuery: string | null;
    restQuery: string;
} {
    if (!query.startsWith("#")) return { sectionQuery: null, restQuery: query };
    const spaceIdx = query.indexOf(" ");
    if (spaceIdx < 0)
        return { sectionQuery: query.slice(1), restQuery: "" };
    return {
        sectionQuery: query.slice(1, spaceIdx),
        restQuery: query.slice(spaceIdx + 1),
    };
}

function loadRecent(): RecentEntry[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveRecent(list: RecentEntry[]): void {
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    } catch { }
}

function loadQueries(): string[] {
    try {
        const raw = sessionStorage.getItem(QUERIES_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function saveQuery(q: string): void {
    const t = q.trim();
    if (!t) return;
    try {
        const list = loadQueries().filter((x) => x !== t);
        list.unshift(t);
        sessionStorage.setItem(QUERIES_KEY, JSON.stringify(list.slice(0, QUERIES_MAX)));
    } catch { }
}

interface ParsedSearch {
    type: "substring" | "regex";
    term: string;
    flags: string;
}

/**
 * `>term`         → substring
 * `>/pattern/fl`  → regex
 * `>/pattern`     → regex без флагов
 * `>` (пустой)    → null
 */
function parseSearchQuery(raw: string): ParsedSearch | null {
    if (!raw.startsWith(">")) return null;
    const rest = raw.slice(1);
    if (!rest) return null;
    if (rest.startsWith("/")) {
        const lastSlash = rest.lastIndexOf("/");
        if (lastSlash <= 0) {
            return { type: "regex", term: rest.slice(1), flags: "" };
        }
        return {
            type: "regex",
            term: rest.slice(1, lastSlash),
            flags: rest.slice(lastSlash + 1),
        };
    }
    return { type: "substring", term: rest, flags: "" };
}

/* ─────────────── helpers: offset → line/col ─────────────── */

function buildLineStarts(content: string): number[] {
    const starts = [0];
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") starts.push(i + 1);
    }
    return starts;
}

function offsetToPos(
    starts: number[],
    offset: number,
): { line: number; col: number } {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
}

/* ─────────────── resolve lint issue → line ─────────────── */

function resolveIssueLine(issue: any, lineMap: LineMap): number | null {
    // 1. Клиентские (прямая строка)
    if (typeof issue.line === "number" && issue.line > 0) return issue.line;

    // 2. propertyPath: `entities[Audit].attributes[score]` → entity Audit
    if (typeof issue.propertyPath === "string") {
        const m = issue.propertyPath.match(/^([a-zA-Z]+)\[([^\]]+)\]/);
        if (m) {
            const [, sec, id] = m;
            const section = lineMap.sections.find((s) => s.key === sec);
            const node = section?.nodes.find((n) => n.id === id);
            if (node) return node.line;
        }
    }

    // 3. entityFqid + attributeId
    if (typeof issue.entityFqid === "string") {
        const entityId = issue.entityFqid.split("/")[1];
        if (!entityId) return null;
        const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
        const entityNode = entitiesSection?.nodes.find((n) => n.id === entityId);
        if (!entityNode) return null;
        if (typeof issue.attributeId === "string" && issue.attributeId) {
            const attrNode = (entityNode.children || []).find(
                (c) => c.id === issue.attributeId && c.type === "attribute",
            );
            if (attrNode) return attrNode.line;
        }
        return entityNode.line;
    }

    return null;
}

/* ─────────────── preview term (для подсветки в preview) ─────────────── */

function previewTerm(query: string): string {
    const q = query.trim();
    if (!q) return "";
    if (q.startsWith(">") || q.startsWith("@") || q.startsWith("!")) {
        return q.slice(1).trim().split(/\s+/)[0] || "";
    }
    if (q.startsWith("#")) {
        const [, rest] = q.split(/\s+/, 2);
        return (rest || "").split(/\s+/)[0] || "";
    }
    // line-mode / help — не подсвечиваем
    if (/^:?\d/.test(q) || q === "?") return "";
    return q.split(/\s+/)[0] || "";
}

/* ─────────────── hover preview ─────────────── */

interface HoverPreviewState {
    item: JumpItem;
    rect: DOMRect;
}

function highlightInText(text: string, term: string): React.ReactNode {
    if (!term) return text;
    const lower = text.toLowerCase();
    const q = term.toLowerCase();
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let idx = lower.indexOf(q, pos);
    let k = 0;
    while (idx !== -1) {
        if (idx > pos) parts.push(text.slice(pos, idx));
        parts.push(
            <mark key={k++} className="search-hl">
                {text.slice(idx, idx + q.length)}
            </mark>,
        );
        pos = idx + q.length;
        idx = lower.indexOf(q, pos);
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return <>{parts}</>;
}

function MiniMapPreview({
    state,
    lineMap,
    cursorLine,
}: {
    state: HoverPreviewState;
    lineMap: LineMap;
    cursorLine?: number;
}) {
    const { item, rect } = state;
    const sections = lineMap.sections;

    const targetLine = item.line;
    const mapHeight = 320;
    const previewWidth = 280;
    const margin = 12;

    let left = rect.right + margin;
    if (left + previewWidth > window.innerWidth - margin) {
        left = rect.left - previewWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.top;
    if (top + mapHeight + 56 > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - mapHeight - 56 - margin);
    }

    return createPortal(
        <div
            className="yaml-quickjump-preview yaml-quickjump-preview--minimap"
            style={{
                left,
                top,
                width: previewWidth,
                position: "fixed", // ← Фиксируем на экране
                zIndex: 4000
            }}
        >
            <div className="yaml-quickjump-preview__head">
                <MIcon name="map" size="sm" />
                <span className="yaml-quickjump-preview__title">
                    {item.kind === "file-start" ? "Начало файла" : "Конец файла"}
                </span>
                <span className="yaml-quickjump-preview__line">:{item.line}</span>
            </div>
            <div
                className="yaml-quickjump-minimap"
                style={{ height: mapHeight }}
            >
                {sections.map((s) => {
                    const isTarget =
                        targetLine >= s.line && targetLine < s.line + s.linesCount;
                    const isCursor =
                        cursorLine != null &&
                        cursorLine >= s.line &&
                        cursorLine < s.line + s.linesCount;
                    return (
                        <div
                            key={s.key}
                            className={
                                "yaml-quickjump-minimap__block" +
                                (isTarget ? " yaml-quickjump-minimap__block--target" : "") +
                                (isCursor ? " yaml-quickjump-minimap__block--cursor" : "")
                            }
                            style={{
                                flexGrow: s.linesCount, // ← Пропорциональная высота вместо top/height
                            }}
                            title={`${s.label} · ${s.count} элем. · строки ${s.line}–${s.line + s.linesCount - 1}`}
                        >
                            <span className="yaml-quickjump-minimap__label">{s.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>,
        document.body
    );
}

function JumpPreview({
    state,
    lines,
    term,
    lineMap,
    cursorLine,
}: {
    state: HoverPreviewState;
    lines: string[];
    term: string;
    lineMap: LineMap;
    cursorLine?: number;
}) {
    if (state.item.kind === "file-start" || state.item.kind === "file-end") {
        return (
            <MiniMapPreview state={state} lineMap={lineMap} cursorLine={cursorLine} />
        );
    }

    const { item, rect } = state;
    const totalLines = lines.length;
    const line = Math.max(1, Math.min(item.line, totalLines));

    const before = Math.min(3, line - 1);
    const after = Math.min(5, totalLines - line);
    const startLine = line - before;
    const endLine = line + after;
    const fragment = lines.slice(startLine - 1, endLine);

    const previewWidth = 540;
    const margin = 12;
    const estimatedHeight = 56 + (endLine - startLine + 1) * 18 + 16;

    let left = rect.right + margin;
    if (left + previewWidth > window.innerWidth - margin) {
        left = rect.left - previewWidth - margin;
    }
    if (left < margin) left = margin;

    let top = rect.top;
    if (top + estimatedHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
    }

    return createPortal(
        <div
            className="yaml-quickjump-preview"
            style={{ left, top, width: previewWidth, position: "fixed", zIndex: 4000 }}
        >
            <div className="yaml-quickjump-preview__head">
                <MIcon name="description" size="sm" />
                <span className="yaml-quickjump-preview__title">{item.label}</span>
                <span className="yaml-quickjump-preview__line">
                    :{item.line}
                    {item.column && item.column > 1 ? `:${item.column}` : ""}
                </span>
            </div>
            <div className="yaml-quickjump-preview__body">
                {fragment.map((text, i) => {
                    const lineNo = startLine + i;
                    const isTarget = lineNo === item.line;
                    return (
                        <div
                            key={lineNo}
                            className={
                                "yaml-quickjump-preview__row" +
                                (isTarget ? " yaml-quickjump-preview__row--target" : "")
                            }
                        >
                            <span className="yaml-quickjump-preview__line-no">
                                {lineNo}
                            </span>
                            <pre className="yaml-quickjump-preview__code">
                                {isTarget && term
                                    ? highlightInText(text, term)
                                    : text}
                            </pre>
                        </div>
                    );
                })}
            </div>
        </div>,
        document.body
    );
}

/* ───────────────────────── main component ───────────────────────── */

export function YamlQuickJump({
    lineMap,
    content,
    index,
    domainId,
    cursorLine,
    domainIssues,
    initialQuery,
    onSelect,
    onClose,
}: YamlQuickJumpProps) {
    const [query, setQuery] = useState(initialQuery || "");
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const hoverTimerRef = useRef<number | null>(null);
    const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(
        null,
    );

    const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
    const [shareCopied, setShareCopied] = useState(false);

    const [helpOpen, setHelpOpen] = useState(false);

    // ── Фильтры и коллапс групп ──
    const [filterMode, setFilterMode] = useState<QuickJumpFilter>("all");
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        new Set(),
    );

    // при закрытии попапа — сбрасываем
    useEffect(() => {
        if (!open) setHelpOpen(false);
    }, [open]);

    const isFavorite = (item: JumpItem): boolean => {
        const key = favKey(item);
        return key != null && favorites.has(key);
    };

    const copyPath = (item: JumpItem): string => {
        if (!item.sectionKey || !item.rawId) return "";
        return `${item.sectionKey}/${item.rawId}`;
    };

    const copyItemPath = async (item: JumpItem) => {
        const path = copyPath(item);
        if (!path) return;
        try {
            await navigator.clipboard.writeText(path);
            useGraphStore.getState().showSnackbar(`Скопировано: ${path}`);
        } catch {
            /* ignore */
        }
    };

    const copyAllResults = async () => {
        const flat = flatSuggestions;
        if (flat.length === 0) return;
        const text = flat
            .map((item) => {
                const path = copyPath(item);
                const extras = [path, `строка ${item.line}`].filter(Boolean).join(" · ");
                return `- ${item.label}${extras ? ` (${extras})` : ""}`;
            })
            .join("\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(`Скопировано: ${flat.length} результатов`);
        } catch {
            /* ignore */
        }
    };

    const toggleFavorite = (item: JumpItem) => {
        const key = favKey(item);
        if (!key) return;
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            saveFavorites(next);
            return next;
        });
    };

    // история прыжков в текущей сессии
    const [history, setHistory] = useState<
        Array<{ line: number; column?: number }>
    >([]);
    const [historyIdx, setHistoryIdx] = useState(-1);

    const lines = useMemo(() => content.split("\n"), [content]);
    const totalLines = lines.length;
    const lineStarts = useMemo(() => buildLineStarts(content), [content]);

    const indexItems = useMemo(
        () => buildIndex(lineMap, index, domainId),
        [lineMap, index, domainId],
    );

    useEffect(() => {
        if (initialQuery !== null && initialQuery !== undefined) {
            setQuery(initialQuery);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQuery]);

    // ── режимы ──
    const trimmed = query.trim();
    const isHelpMode = trimmed === "?";
    const isIssuesMode = query.startsWith("!");
    const isAttrMode = query.startsWith("@");
    const isSearchMode = query.startsWith(">");
    const { sectionQuery, restQuery } = parseSectionFilter(query);
    const lineMatch = trimmed.match(/^:?(\d+)(?::(\d+))?$/);
    const isLineMode = !!lineMatch;
    const lineNumberValue = isLineMode
        ? Math.min(parseInt(lineMatch![1], 10) || 1, totalLines)
        : null;
    const lineColumnValue =
        isLineMode && lineMatch![2] ? Math.max(1, parseInt(lineMatch![2], 10)) : 1;

    const fqidEntity = useMemo(() => {
        if (!index || sectionQuery !== null || isSearchMode) return null;
        if (isHelpMode || isIssuesMode || isAttrMode) return null;
        const q = trimmed;
        if (!q.includes("/") || !q.includes(".")) return null;
        return index.entitiesByFqid[q.toLowerCase()] || null;
    }, [trimmed, index, sectionQuery, isSearchMode, isHelpMode, isIssuesMode, isAttrMode]);

    /* ───────────────────────── suggestions ───────────────────────── */

    const groupedSuggestions: SuggestionGroup[] = useMemo(() => {
        // ═══════ ~ — соседние элементы ═══════
        // ═══════ ~ — соседи (опционально с фильтром) ═══════
        if (query.startsWith("~")) {
            const m = query.match(/^~(\d+)?\s*(.*)$/);
            const limit = m && m[1] ? Math.max(1, parseInt(m[1], 10)) : 5;
            const term = ((m && m[2]) || "").trim().toLowerCase();
            const cur = cursorLine || 1;
            const allNodes = indexItems
                .filter((i) => i.kind === "element")
                .sort((a, b) => a.line - b.line);

            const before: JumpItem[] = [];
            const after: JumpItem[] = [];

            for (const n of allNodes) {
                if (term) {
                    const hay = `${n.rawId} ${n.label} ${n.sublabel}`.toLowerCase();
                    if (!hay.includes(term)) continue;
                }
                if (n.line < cur) {
                    before.push({ ...n, score: 100 });
                    if (before.length > limit) before.shift();
                } else if (n.line > cur) {
                    after.push({ ...n, score: 100 });
                    if (after.length >= limit) break;
                }
            }

            const result: SuggestionGroup[] = [];
            if (before.length > 0) {
                result.push({
                    label: `Выше курсора (${before.length})`,
                    items: before.slice().reverse(),
                });
            }
            if (after.length > 0) {
                result.push({
                    label: `Ниже курсора (${after.length})`,
                    items: after,
                });
            }
            if (result.length === 0) {
                result.push({
                    label: "Соседние",
                    items: [
                        {
                            key: "neighbors-empty",
                            kind: "help",
                            label: term
                                ? `Элементов с «${term}» рядом нет`
                                : "В файле нет других элементов",
                            line: 1,
                            icon: "info",
                            score: 100,
                        },
                    ],
                });
            }
            return result;
        }

        // ═══════ Help ═══════
        if (isHelpMode) {
            return [{ label: "Синтаксис", items: HELP_ITEMS }];
        }

        // ═══════ Line mode (:42 / :42:5) ═══════
        if (isLineMode && lineNumberValue != null) {
            const main: JumpItem = {
                key: `line:${lineNumberValue}`,
                kind: "line",
                label:
                    lineColumnValue > 1
                        ? `Строка ${lineNumberValue}, колонка ${lineColumnValue}`
                        : `Строка ${lineNumberValue}`,
                sublabel: (lines[lineNumberValue - 1] || "").trim().slice(0, 140),
                line: lineNumberValue,
                column: lineColumnValue,
                score: 1000,
            };
            const near: JumpItem[] = [];
            for (let d = -2; d <= 2; d++) {
                if (d === 0) continue;
                const ln = lineNumberValue + d;
                if (ln < 1 || ln > totalLines) continue;
                near.push({
                    key: `line:${ln}`,
                    kind: "line",
                    label: `Строка ${ln}`,
                    sublabel: (lines[ln - 1] || "").trim().slice(0, 140),
                    line: ln,
                    column: 1,
                    score: 500 - Math.abs(d) * 10,
                });
            }
            return [
                { label: "Перейти к строке", items: [main] },
                ...(near.length > 0 ? [{ label: "Рядом", items: near }] : []),
            ];
        }

        // ═══════ ! — проблемы линтера ═══════
        if (isIssuesMode) {
            const term = query.slice(1).trim().toLowerCase();
            const items: JumpItem[] = [];
            for (const issue of domainIssues || []) {
                const line = resolveIssueLine(issue, lineMap);
                if (line == null) continue;
                const hay = `${issue.rule || ""} ${issue.message || ""} ${issue.entityFqid || ""} ${issue.attributeId || ""} ${issue.severity || ""} ${issue.category || ""} ${issue.propertyPath || ""}`.toLowerCase();
                if (term) {
                    if (hay.includes(term)) {
                        // exact substring
                    } else {
                        // subsequence fallback: !erorr → error
                        let pos = 0;
                        for (let i = 0; i < hay.length && pos < term.length; i++) {
                            if (hay[i] === term[pos]) pos++;
                        }
                        if (pos !== term.length) continue;
                    }
                }
                const severity: JumpSeverity =
                    issue.severity === "error"
                        ? "error"
                        : issue.severity === "warning"
                            ? "warning"
                            : "info";
                items.push({
                    key: `issue:${line}:${issue.ruleId || ""}:${(issue.message || "").slice(0, 60)}`,
                    kind: "search-hit",
                    label: issue.rule || "Проблема",
                    sublabel: issue.message || "",
                    line,
                    column:
                        typeof issue.column === "number" && issue.column > 0
                            ? issue.column
                            : 1,
                    icon:
                        severity === "error"
                            ? "error"
                            : severity === "warning"
                                ? "warning"
                                : "info",
                    severity,
                    score:
                        severity === "error" ? 300 : severity === "warning" ? 200 : 100,
                });
                if (items.length >= MAX_RESULTS) break;
            }
            items.sort((a, b) => a.line - b.line);
            if (items.length === 0) {
                return [
                    {
                        label: "Проблемы",
                        items: [
                            {
                                key: "issues-empty",
                                kind: "help",
                                label: term
                                    ? `Проблем с «${term}» не найдено`
                                    : "В файле нет проблем",
                                sublabel: "Проверьте, что линтер включён и файл сохранён",
                                line: 1,
                                icon: "check_circle",
                                score: 100,
                            },
                        ],
                    },
                ];
            }
            return [
                {
                    label: `Проблемы (${items.length})${term ? ` · «${term}»` : ""}`,
                    items,
                },
            ];
        }

        // ═══════ @ — кросс-сущностный поиск атрибута ═══════
        if (isAttrMode) {
            const raw = query.slice(1).trim();
            let attrQuery = raw.toLowerCase();
            let typeFilter: string | null = null;

            const colonIdx = raw.indexOf(":");
            if (colonIdx >= 0) {
                attrQuery = raw.slice(0, colonIdx).toLowerCase();
                typeFilter = raw.slice(colonIdx + 1).toLowerCase() || null;
            }

            if (!index || !domainId) return [];

            if (!attrQuery && !typeFilter) {
                return [
                    {
                        label: "Поиск атрибутов",
                        items: [
                            {
                                key: "attr-hint-1",
                                kind: "help",
                                label: "@score",
                                sublabel: "атрибуты с id/name, содержащим «score»",
                                line: 1,
                                icon: "help",
                                score: 100,
                                helpExample: "@score",
                            },
                            {
                                key: "attr-hint-2",
                                kind: "help",
                                label: "@:Reference",
                                sublabel: "все атрибуты типа Reference",
                                line: 1,
                                icon: "help",
                                score: 90,
                                helpExample: "@:Reference",
                            },
                            {
                                key: "attr-hint-3",
                                kind: "help",
                                label: "@score:Integer",
                                sublabel: "атрибуты «score» с типом Integer",
                                line: 1,
                                icon: "help",
                                score: 80,
                                helpExample: "@score:Integer",
                            },
                            {
                                key: "attr-hint-4",
                                kind: "help",
                                label: "@:custom",
                                sublabel:
                                    "все атрибуты с кастомным типом (Enum / Workflow / Table)",
                                line: 1,
                                icon: "help",
                                score: 70,
                                helpExample: "@:custom",
                            },
                        ],
                    },
                ];
            }

            const cur = domainId.toLowerCase();
            const entitiesSection = lineMap.sections.find(
                (s) => s.key === "entities",
            );
            if (!entitiesSection) return [];

            const items: JumpItem[] = [];
            const seen = new Set<string>();

            for (const entity of index.entities) {
                if (entity.domainId.toLowerCase() !== cur) continue;
                const entityNode = entitiesSection.nodes.find(
                    (n) => n.id === entity.entityId,
                );
                if (!entityNode) continue;

                const entityId = entity.entityId;
                const attrEntityFqid = entity.fqid;

                const pushAttr = (
                    attrId: string,
                    attrName: string,
                    dataType: string,
                    dataTypeKind: "base" | "custom" | "unknown",
                    description: string,
                ) => {
                    const idHay = `${attrId} ${attrName || ""}`.toLowerCase();
                    if (attrQuery && !idHay.includes(attrQuery)) return;
                    if (typeFilter) {
                        const dtLower = (dataType || "").toLowerCase();
                        if (typeFilter === "custom") {
                            if (dataTypeKind !== "custom") return;
                        } else if (!dtLower.includes(typeFilter)) {
                            return;
                        }
                    }
                    const dedupKey = `${attrEntityFqid}#${attrId}`;
                    if (seen.has(dedupKey)) return;
                    seen.add(dedupKey);

                    const attrNode = (entityNode.children || []).find(
                        (c) => c.id === attrId && c.type === "attribute",
                    );
                    const line = attrNode ? attrNode.line : entityNode.line;

                    items.push({
                        key: `attr:${dedupKey}`,
                        kind: "element",
                        rawId: attrId,
                        label: `${entityId}.${attrId}`,
                        sublabel: [dataType, attrName, description]
                            .filter(Boolean)
                            .join(" · "),
                        line,
                        sectionKey: "entities",
                        icon: "data_object",
                        score: 1000,
                    });
                };

                for (const attr of entity.attributes) {
                    pushAttr(
                        attr.id,
                        attr.name || "",
                        attr.dataType || "",
                        attr.dataTypeKind || "unknown",
                        attr.description || "",
                    );
                    if (items.length >= MAX_RESULTS) break;
                    for (const na of attr.nestedAttributes || []) {
                        pushAttr(
                            na.id,
                            na.name || "",
                            na.dataType || "",
                            na.dataTypeKind || "unknown",
                            na.description || "",
                        );
                        if (items.length >= MAX_RESULTS) break;
                    }
                }
                if (items.length >= MAX_RESULTS) break;
            }

            if (items.length === 0) {
                const queryLabel = typeFilter
                    ? attrQuery
                        ? `${attrQuery}:${typeFilter}`
                        : `:${typeFilter}`
                    : attrQuery;
                return [
                    {
                        label: "Атрибуты",
                        items: [
                            {
                                key: "attr-empty",
                                kind: "help",
                                label: `Атрибуты «${queryLabel}» не найдены`,
                                line: 1,
                                icon: "search_off",
                                score: 100,
                            },
                        ],
                    },
                ];
            }
            const typeSuffix = typeFilter ? `:${typeFilter}` : "";
            const attrSuffix = attrQuery || "";
            return [
                {
                    label: `Атрибуты ${attrSuffix}${typeSuffix} (${items.length})`,
                    items,
                },
            ];
        }

        // ═══════ > — substring / regex ═══════
        if (isSearchMode) {
            const parsed = parseSearchQuery(query);

            if (!parsed || !parsed.term) {
                return [
                    {
                        label: "Поиск по содержимому",
                        items: [
                            {
                                key: "search-hint",
                                kind: "help",
                                label: "Введите текст после >",
                                sublabel: "например: >id: audit  ·  >/l[i]sts_/i",
                                line: 1,
                                icon: "search",
                                score: 100,
                            },
                        ],
                    },
                ];
            }

            // ── Regex ──
            if (parsed.type === "regex") {
                let re: RegExp;
                try {
                    re = new RegExp(parsed.term, "g" + parsed.flags);
                } catch (e: any) {
                    return [
                        {
                            label: "Поиск по regex",
                            items: [
                                {
                                    key: "regex-error",
                                    kind: "help",
                                    label: "Невалидный regex",
                                    sublabel: String(e?.message || e),
                                    line: 1,
                                    icon: "error",
                                    score: 100,
                                },
                            ],
                        },
                    ];
                }
                const hits: JumpItem[] = [];
                let m: RegExpExecArray | null;
                while ((m = re.exec(content)) !== null) {
                    if (m[0].length === 0) {
                        re.lastIndex++;
                        continue;
                    }
                    if (hits.length >= MAX_RESULTS) break;
                    const pos = offsetToPos(lineStarts, m.index);
                    const lineText = lines[pos.line - 1] || "";
                    const before = lineText.slice(0, Math.max(0, pos.col - 1));
                    const after = lineText.slice(pos.col - 1 + m[0].length);
                    const truncatedBefore = before.length > 30;
                    const truncatedAfter = after.length > 50;
                    hits.push({
                        key: `re:${m.index}`,
                        kind: "search-hit",
                        label: truncatedBefore ? "…" + before.slice(-30) : before,
                        sublabel:
                            m[0] + (truncatedAfter ? after.slice(0, 50) + "…" : after),
                        line: pos.line,
                        column: pos.col,
                        icon: "code",
                        score: 1000 - hits.length,
                    });
                }
                if (hits.length === 0) {
                    return [
                        {
                            label: "Поиск по regex",
                            items: [
                                {
                                    key: "regex-empty",
                                    kind: "help",
                                    label: `«${parsed.term}» не найдено`,
                                    line: 1,
                                    icon: "search_off",
                                    score: 100,
                                },
                            ],
                        },
                    ];
                }
                return [
                    {
                        label: `Regex /${parsed.term}/${parsed.flags} (${hits.length})`,
                        items: hits,
                    },
                ];
            }

            // ── Substring ──
            const term = parsed.term;
            const haystack = content.toLowerCase();
            const needle = term.toLowerCase();
            const hits: JumpItem[] = [];
            let from = 0;
            while (hits.length < MAX_RESULTS) {
                const idx = haystack.indexOf(needle, from);
                if (idx < 0) break;
                const pos = offsetToPos(lineStarts, idx);
                const lineText = lines[pos.line - 1] || "";
                const before = lineText.slice(0, Math.max(0, pos.col - 1));
                const after = lineText.slice(pos.col - 1 + term.length);
                const truncatedBefore = before.length > 30;
                const truncatedAfter = after.length > 50;
                hits.push({
                    key: `hit:${idx}`,
                    kind: "search-hit",
                    label: truncatedBefore ? "…" + before.slice(-30) : before,
                    sublabel: term + (truncatedAfter ? after.slice(0, 50) + "…" : after),
                    line: pos.line,
                    column: pos.col,
                    icon: "search",
                    score: 1000 - hits.length,
                });
                from = idx + Math.max(1, term.length);
            }
            if (hits.length === 0) {
                return [
                    {
                        label: "Поиск по содержимому",
                        items: [
                            {
                                key: "search-empty",
                                kind: "help",
                                label: `«${term}» не найдено`,
                                line: 1,
                                icon: "search_off",
                                score: 100,
                            },
                        ],
                    },
                ];
            }
            return [{ label: `Вхождения «${term}» (${hits.length})`, items: hits }];
        }

        // ═══════ FQID ═══════
        if (fqidEntity) {
            const entitiesSection = lineMap.sections.find(
                (s) => s.key === "entities",
            );
            const node = entitiesSection?.nodes.find(
                (n) => n.id === fqidEntity.entityId,
            );
            if (node) {
                return [
                    {
                        label: "FQID",
                        items: [
                            {
                                key: `fqid:${fqidEntity.fqid}`,
                                kind: "element",
                                rawId: fqidEntity.entityId,
                                label: fqidEntity.entityId,
                                sublabel: `${fqidEntity.name} · ${fqidEntity.domainId} · ${fqidEntity.attributes.length} атр.`,
                                line: node.line,
                                sectionKey: "entities",
                                icon: "category",
                                score: 2000,
                            },
                        ],
                    },
                ];
            }
        }

        // ═══════ #section rest ═══════
        if (sectionQuery !== null) {
            const sq = sectionQuery.toLowerCase();
            const matching = lineMap.sections.filter(
                (s) =>
                    sq === "" ||
                    s.key.toLowerCase().startsWith(sq) ||
                    s.label.toLowerCase().startsWith(sq),
            );

            if (matching.length === 0) return [];

            if (matching.length === 1 && sq !== "") {
                const section = matching[0];
                const sectionItems = indexItems.filter(
                    (i) => i.sectionKey === section.key && i.kind === "element",
                );

                if (!restQuery.trim()) {
                    return [
                        {
                            label: `${section.label} — ${sectionItems.length} элементов`,
                            items: sectionItems
                                .slice(0, MAX_RESULTS)
                                .map((i) => ({ ...i, score: 100 })),
                        },
                    ];
                }

                const scored: Array<{ item: IndexedItem; score: number }> = [];
                for (const item of sectionItems) {
                    const s = scoreItem(item, restQuery);
                    if (s === 0) continue;
                    scored.push({ item, score: s });
                }
                scored.sort((a, b) =>
                    b.score !== a.score ? b.score - a.score : a.item.line - b.item.line,
                );
                return [
                    {
                        label: `${section.label} → «${restQuery}»`,
                        items: scored
                            .slice(0, MAX_RESULTS)
                            .map((x) => ({ ...x.item, score: x.score })),
                    },
                ];
            }

            return [
                {
                    label: "Секции",
                    items: matching.slice(0, MAX_RESULTS).map((s) => ({
                        key: `section-pick:${s.key}`,
                        kind: "section-start" as const,
                        rawId: s.key,
                        label: `#${s.key}`,
                        sublabel: `${s.label} · строки ${s.line}–${s.line + s.linesCount - 1}`,
                        breadcrumbs: [],
                        line: s.line,
                        sectionKey: s.key,
                        icon: SECTION_ICONS[s.key] || "folder",
                        score: 100,
                    })),
                },
            ];
        }

        const q = trimmed.toLowerCase();

        // ═══════ Empty ═══════
        if (!q) {
            const groups: SuggestionGroup[] = [];

            // ── Избранные ──
            const favoriteItems: JumpItem[] = [];
            for (const fk of favorites) {
                const sep = fk.indexOf(":");
                if (sep < 0) continue;
                const sectionKey = fk.slice(0, sep);
                const rawId = fk.slice(sep + 1);
                const found = indexItems.find(
                    (i) => i.sectionKey === sectionKey && i.rawId === rawId,
                );
                if (!found) continue;
                favoriteItems.push({
                    ...found,
                    key: `fav:${found.key}`,
                    sublabel: `избранное · ${found.sublabel}`,
                    icon: "star",
                    score: 950 - favoriteItems.length,
                });
                if (favoriteItems.length >= 5) break;
            }
            if (favoriteItems.length > 0) {
                groups.push({ label: "Избранные", items: favoriteItems });
            }

            const recentQueries = loadQueries();
            if (recentQueries.length > 0) {
                groups.push({
                    label: "Запросы",
                    items: recentQueries.map((rq, i) => ({
                        key: `query:${i}`,
                        kind: "help" as const,
                        label: rq,
                        sublabel: "подставить в поиск",
                        line: 1,
                        icon: "history",
                        score: 850 - i,
                        helpExample: rq,
                    })),
                });
            }

            const recent = loadRecent();
            const recentItems: JumpItem[] = [];
            for (const r of recent) {
                const found = indexItems.find(
                    (i) => i.sectionKey === r.sectionKey && i.rawId === r.rawId,
                );
                if (!found) continue;
                recentItems.push({
                    ...found,
                    key: `recent:${found.key}`,
                    sublabel: `недавно · ${found.sublabel}`,
                    icon: "history",
                    score: 900 - recentItems.length,
                });
                if (recentItems.length >= 5) break;
            }
            if (recentItems.length > 0) {
                groups.push({ label: "Недавние", items: recentItems });
            }

            groups.push({
                label: "Файл",
                items: [
                    {
                        key: "file-start",
                        kind: "file-start",
                        label: "Начало файла",
                        sublabel: "строка 1",
                        line: 1,
                        score: 500,
                    },
                    {
                        key: "file-end",
                        kind: "file-end",
                        label: "Конец файла",
                        sublabel: `строка ${totalLines}`,
                        line: totalLines,
                        score: 490,
                    },
                ],
            });

            const sectionItems = indexItems
                .filter((i) => i.kind === "section-start")
                .map((i) => ({ ...i, score: 100 }));
            if (sectionItems.length > 0) {
                groups.push({ label: "Секции", items: sectionItems });
            }

            return groups;
        }

        // ═══════ file start/end по вводу ═══════
        const fileActions: JumpItem[] = [];
        if ("начало файла".startsWith(q) || "start".startsWith(q)) {
            fileActions.push({
                key: "file-start",
                kind: "file-start",
                label: "Начало файла",
                sublabel: "строка 1",
                line: 1,
                score: 450,
            });
        }
        if ("конец файла".startsWith(q) || "end".startsWith(q)) {
            fileActions.push({
                key: "file-end",
                kind: "file-end",
                label: "Конец файла",
                sublabel: `строка ${totalLines}`,
                line: totalLines,
                score: 450,
            });
        }

        // ═══════ Ранжированный поиск ═══════
        const scored: Array<{ item: IndexedItem; score: number }> = [];
        for (const item of indexItems) {
            const s = scoreItem(item, q);
            if (s === 0) continue;
            scored.push({ item, score: s });
        }
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.item.depth !== b.item.depth) return a.item.depth - b.item.depth;
            return a.item.line - b.item.line;
        });

        const result: SuggestionGroup[] = [];
        if (fileActions.length > 0) {
            result.push({ label: "Файл", items: fileActions });
        }

        const matched = scored
            .slice(0, MAX_RESULTS)
            .map((x) => ({ ...x.item, score: x.score }));

        const sections = matched.filter((i) => i.kind !== "element");
        const elements = matched.filter((i) => i.kind === "element");

        if (sections.length > 0) {
            result.push({ label: "Секции", items: sections });
        }

        // ── Элементы: группируем по секции, если их 2+ ──
        const bySection = new Map<string, JumpItem[]>();
        for (const el of elements) {
            if (!el.sectionKey) continue;
            if (!bySection.has(el.sectionKey)) bySection.set(el.sectionKey, []);
            bySection.get(el.sectionKey)!.push(el);
        }

        if (bySection.size <= 1) {
            if (elements.length > 0) {
                result.push({ label: "Элементы", items: elements });
            }
        } else {
            const sectionOrder = lineMap.sections.map((s) => s.key);
            for (const sectionKey of sectionOrder) {
                const items = bySection.get(sectionKey);
                if (!items || items.length === 0) continue;
                const sectionLabel =
                    lineMap.sections.find((s) => s.key === sectionKey)?.label || sectionKey;
                result.push({ label: `${sectionLabel} (${items.length})`, items });
            }
        }

        return result;
    }, [
        indexItems,
        query,
        isLineMode,
        isSearchMode,
        isIssuesMode,
        isAttrMode,
        isHelpMode,
        lineNumberValue,
        lineColumnValue,
        lines,
        totalLines,
        sectionQuery,
        restQuery,
        fqidEntity,
        lineMap,
        content,
        lineStarts,
        domainIssues,
        index,
        domainId,
        trimmed,
        favorites,
    ]);

    const flatSuggestionsRaw: JumpItem[] = useMemo(
        () => groupedSuggestions.flatMap((g) => g.items),
        [groupedSuggestions],
    );

    // ── Категории для фильтра ──
    const availableFilters = useMemo(() => {
        const counts: Record<QuickJumpFilter, number> = {
            all: flatSuggestionsRaw.length,
            section: 0,
            element: 0,
            problem: 0,
            hit: 0,
            line: 0,
            favorite: 0,
        };
        for (const item of flatSuggestionsRaw) {
            const classes = classifyJumpItem(item, favorites);
            classes.forEach((c) => {
                if (c !== "all") counts[c]++;
            });
        }
        return counts;
    }, [flatSuggestionsRaw, favorites]);

    const showFilterChips = useMemo(() => {
        if (availableFilters.all < 5) return false;
        const nonAllCategories = (
            ["section", "element", "problem", "hit", "line", "favorite"] as const
        ).filter((c) => availableFilters[c] > 0);
        return nonAllCategories.length >= 2;
    }, [availableFilters]);

    // ── Применяем фильтр к группам ──
    const filteredGroups = useMemo(() => {
        if (filterMode === "all") return groupedSuggestions;
        return groupedSuggestions
            .map((g) => ({
                ...g,
                items: g.items.filter((item) =>
                    classifyJumpItem(item, favorites).has(filterMode),
                ),
            }))
            .filter((g) => g.items.length > 0);
    }, [groupedSuggestions, filterMode, favorites]);

    // ── Видимые suggestions (без свёрнутых групп) ──
    const visibleSuggestions = useMemo(() => {
        const out: JumpItem[] = [];
        for (const g of filteredGroups) {
            if (collapsedGroups.has(g.label)) continue;
            for (const item of g.items) out.push(item);
        }
        return out;
    }, [filteredGroups, collapsedGroups]);

    // Обратная совместимость: ниже используется flatSuggestions
    const flatSuggestions = visibleSuggestions;

    useEffect(() => {
        setActiveIdx(0);
        setHoverPreview(null);
        setFilterMode("all");
        setCollapsedGroups(new Set());
    }, [query]);

    useEffect(() => {
        const t = setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 20);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const el = listRef.current?.querySelector(
            ".yaml-quickjump-item--active",
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx]);

    // При изменении кол-ва видимых — clamp activeIdx
    useEffect(() => {
        setActiveIdx((i) => {
            const max = visibleSuggestions.length - 1;
            if (max < 0) return 0;
            return Math.max(0, Math.min(i, max));
        });
    }, [visibleSuggestions.length]);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current != null) {
                window.clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (query) {
                    setQuery("");
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [onClose, query]);

    /* ───────────────────────── actions ───────────────────────── */

    const rememberRecent = (item: JumpItem) => {
        if (!item.sectionKey || !item.rawId) return;
        const list = loadRecent().filter(
            (r) => !(r.sectionKey === item.sectionKey && r.rawId === item.rawId),
        );
        list.unshift({
            sectionKey: item.sectionKey,
            rawId: item.rawId,
            label: item.label,
            line: item.line,
            usedAt: Date.now(),
        });
        saveRecent(list);
    };

    const pushHistory = (line: number, column?: number) => {
        setHistory((prev) => {
            const next = prev.slice(0, historyIdx + 1);
            next.push({ line, column });
            return next;
        });
        setHistoryIdx((i) => i + 1);
    };

    const commit = (item: JumpItem) => {
        rememberRecent(item);
        saveQuery(query);
        pushHistory(item.line, item.column);
        onSelect(item.line, item.column);
        onClose();
    };

    const handleItemClick = (item: JumpItem) => {
        // help — подставить пример в input, не закрывать
        if (item.kind === "help" && item.helpExample !== undefined) {
            setQuery(item.helpExample);
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 0);
            return;
        }
        // section-pick — расширить в `#section `
        if (item.kind === "section-start" && item.key.startsWith("section-pick:")) {
            setQuery(`#${item.sectionKey} `);
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 0);
            return;
        }
        commit(item);
    };

    const goHistory = (dir: -1 | 1) => {
        const next = historyIdx + dir;
        if (next < 0 || next >= history.length) return;
        setHistoryIdx(next);
        const entry = history[next];
        onSelect(entry.line, entry.column);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "F1" || (e.key === "?" && e.shiftKey)) {
            e.preventDefault();
            setHelpOpen((v) => !v);
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            goHistory(-1);
            return;
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            goHistory(1);
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, flatSuggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Home") {
            e.preventDefault();
            setActiveIdx(0);
        } else if (e.key === "End") {
            e.preventDefault();
            setActiveIdx(Math.max(0, flatSuggestions.length - 1));
        } else if (e.key === "PageDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 10, flatSuggestions.length - 1));
        } else if (e.key === "PageUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 10, 0));
        } else if (e.key === "Enter") {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const item = flatSuggestions[0];
                if (item) handleItemClick(item);
                return;
            }
            e.preventDefault();
            const item = flatSuggestions[activeIdx];
            if (item) handleItemClick(item);
        } else if (e.key === "Tab" && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }

        if (
            e.altKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            (e.key === "ArrowUp" || e.key === "ArrowDown")
        ) {
            e.preventDefault();
            e.stopPropagation();
            const sections = lineMap.sections;
            if (sections.length === 0) return;
            const cur = cursorLine || 1;
            let idx = -1;
            for (let i = 0; i < sections.length; i++) {
                if (sections[i].line <= cur) idx = i;
                else break;
            }
            const dir = e.key === "ArrowDown" ? 1 : -1;
            let next = idx + dir;
            if (idx === -1) next = dir > 0 ? 0 : sections.length - 1;
            next = Math.max(0, Math.min(sections.length - 1, next));
            const target = sections[next];
            if (target) onSelect(target.line);
            return;
        }
    };

    /* ───────────────────────── hover preview ───────────────────────── */

    const scheduleHover = (item: JumpItem, target: HTMLElement) => {
        if (hoverTimerRef.current != null) {
            window.clearTimeout(hoverTimerRef.current);
        }
        if (item.kind === "line" || item.kind === "help") {
            setHoverPreview(null);
            return;
        }
        hoverTimerRef.current = window.setTimeout(() => {
            setHoverPreview({ item, rect: target.getBoundingClientRect() });
        }, HOVER_DELAY);
    };

    const clearHover = () => {
        if (hoverTimerRef.current != null) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setHoverPreview(null);
    };

    /* ───────────────────────── render ───────────────────────── */

    const iconFor = (item: JumpItem): string => {
        if (item.kind === "file-start") return "vertical_align_top";
        if (item.kind === "file-end") return "vertical_align_bottom";
        if (item.kind === "line") return "tag";
        if (item.kind === "search-hit") return item.icon || "search";
        if (item.kind === "help") return item.icon || "help";
        return item.icon || "arrow_right";
    };

    const isSectionPick = (item: JumpItem) =>
        item.key.startsWith("section-pick:");

    const previewSearchTerm = previewTerm(query);
    // Для HighlightedText используем очищенный query,
    // чтобы не подсвечивать `!` / `#` / `@` / `>` в результатах.
    const highlightQuery = previewSearchTerm || query.trim();

    let itemOffset = 0;

    return (
        <>
            <div className="yaml-quickjump-backdrop" onMouseDown={onClose} />
            <div
                className="yaml-quickjump"
                onKeyDown={onKeyDown}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="yaml-quickjump__input-wrap">
                    <MIcon
                        name={
                            isLineMode
                                ? "tag"
                                : isSearchMode
                                    ? "search"
                                    : isIssuesMode
                                        ? "bug_report"
                                        : isAttrMode
                                            ? "data_object"
                                            : isHelpMode
                                                ? "help"
                                                : sectionQuery !== null
                                                    ? "filter_alt"
                                                    : "my_location"
                        }
                        size="sm"
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        className="yaml-quickjump__input"
                        placeholder="ID, #секция, :N[:M], >текст, >/regex/, @атрибут, !проблема, ~соседи, ?"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                    />
                    {query && (
                        <button
                            type="button"
                            className="yaml-quickjump__clear"
                            onClick={() => {
                                setQuery("");
                                inputRef.current?.focus();
                            }}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                    <button
                        type="button"
                        className={"yaml-quickjump__share" + (shareCopied ? " active" : "")}
                        onClick={async () => {
                            const url = new URL(window.location.href);
                            if (query) url.hash = `q=${encodeURIComponent(query)}`;
                            else url.hash = "";
                            try {
                                await navigator.clipboard.writeText(url.toString());
                                setShareCopied(true);
                                setTimeout(() => setShareCopied(false), 1500);
                            } catch { }
                        }}
                        title="Копировать ссылку на текущий запрос"
                    >
                        <MIcon name={shareCopied ? "check" : "link"} size="sm" />
                    </button>
                    <kbd className="yaml-quickjump__kbd">Esc</kbd>
                    <button
                        type="button"
                        className={"yaml-quickjump__help" + (helpOpen ? " active" : "")}
                        onClick={() => setHelpOpen((v) => !v)}
                        title="Документация (F2 ?)"
                        aria-label="Открыть документацию по быстрым переходам"
                    >
                        <MIcon name="help" size="sm" />
                    </button>
                </div>

                {/* ── Фильтры-чипы ── */}
                {!helpOpen && showFilterChips && (
                    <div className="yaml-quickjump__filters">
                        {(
                            ["all", "section", "element", "problem", "hit", "line", "favorite"] as const
                        ).map((f) => {
                            if (f !== "all" && availableFilters[f] === 0) return null;
                            const active = filterMode === f;
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    className={
                                        "yaml-quickjump-filter" +
                                        (active ? " yaml-quickjump-filter--active" : "")
                                    }
                                    onClick={() => {
                                        setFilterMode(f);
                                        setActiveIdx(0);
                                    }}
                                >
                                    {FILTER_LABELS[f]}
                                    <span className="yaml-quickjump-filter__count">
                                        {availableFilters[f]}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {helpOpen ? (
                    <QuickJumpHelp onClose={() => setHelpOpen(false)} />
                ) : filteredGroups.length === 0 ? (
                    <div className="yaml-quickjump__empty">
                        <div>
                            {query
                                ? "Ничего не найдено"
                                : "Начните вводить запрос"}
                        </div>
                        {filterMode !== "all" && (
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => setFilterMode("all")}
                                style={{ marginTop: 8 }}
                            >
                                Сбросить фильтр
                            </button>
                        )}
                        {sectionQuery !== null && sectionQuery !== "" && (
                            <div className="yaml-quickjump__empty-hint">
                                Секция «{sectionQuery}» не найдена. Попробуйте:{" "}
                                {lineMap.sections
                                    .slice(0, 5)
                                    .map((s) => `#${s.key}`)
                                    .join(", ")}
                            </div>
                        )}
                        {isHelpMode && (
                            <div className="yaml-quickjump__empty-hint">
                                Введите <kbd>?</kbd> для справки по синтаксису
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        className="yaml-quickjump__list"
                        ref={listRef}
                        onMouseLeave={clearHover}
                    >
                        {filteredGroups.map((group) => {
                            const isCollapsed = collapsedGroups.has(group.label);
                            const startOffset = itemOffset;
                            if (!isCollapsed) itemOffset += group.items.length;
                            return (
                                <div key={group.label} className="yaml-quickjump__group">
                                    <button
                                        type="button"
                                        className="yaml-quickjump__group-title yaml-quickjump__group-title--clickable"
                                        onClick={() => {
                                            setCollapsedGroups((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(group.label))
                                                    next.delete(group.label);
                                                else next.add(group.label);
                                                return next;
                                            });
                                        }}
                                        title={isCollapsed ? "Развернуть" : "Свернуть"}
                                    >
                                        <span className="yaml-quickjump__group-chevron">
                                            {isCollapsed ? "▸" : "▾"}
                                        </span>
                                        <span>{group.label}</span>
                                        <span className="yaml-quickjump__group-count">
                                            {group.items.length}
                                        </span>
                                    </button>
                                    {!isCollapsed &&
                                        group.items.map((item, i) => {
                                            const idx = startOffset + i;
                                            const severityClass = item.severity
                                                ? ` yaml-quickjump-item--severity-${item.severity}`
                                                : "";
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    className={
                                                        "yaml-quickjump-item" +
                                                        (idx === activeIdx
                                                            ? " yaml-quickjump-item--active"
                                                            : "") +
                                                        (isSectionPick(item)
                                                            ? " yaml-quickjump-item--section-pick"
                                                            : "") +
                                                        (item.icon === "history"
                                                            ? " yaml-quickjump-item--recent"
                                                            : "") +
                                                        (item.kind === "help"
                                                            ? " yaml-quickjump-item--help"
                                                            : "") +
                                                        severityClass
                                                    }
                                                    onMouseEnter={(e) => {
                                                        setActiveIdx(idx);
                                                        scheduleHover(item, e.currentTarget);
                                                    }}
                                                    onClick={(e) => {
                                                        if (e.ctrlKey || e.metaKey) {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            void copyItemPath(item);
                                                            return;
                                                        }
                                                        handleItemClick(item);
                                                    }}
                                                >
                                                    <MIcon
                                                        name={iconFor(item)}
                                                        size="sm"
                                                        className="yaml-quickjump-item__icon"
                                                    />
                                                    <div className="yaml-quickjump-item__main">
                                                        <div className="yaml-quickjump-item__label">
                                                            <HighlightedText text={item.label} query={highlightQuery} />
                                                        </div>
                                                        {item.sublabel && (
                                                            <div className="yaml-quickjump-item__sublabel">
                                                                <HighlightedText
                                                                    text={item.sublabel}
                                                                    query={highlightQuery}
                                                                />
                                                            </div>
                                                        )}
                                                        {item.breadcrumbs && item.breadcrumbs.length > 0 && (
                                                            <div className="yaml-quickjump-item__breadcrumbs">
                                                                {item.breadcrumbs.join(" › ")}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {cursorLine === item.line &&
                                                        item.kind !== "help" && (
                                                            <span
                                                                className="yaml-quickjump-item__you"
                                                                title="Курсор здесь"
                                                            >
                                                                <MIcon name="my_location" size="sm" />
                                                            </span>
                                                        )}
                                                    {item.kind === "element" && favKey(item) && (
                                                        <button
                                                            type="button"
                                                            className={
                                                                "yaml-quickjump-item__fav" +
                                                                (isFavorite(item) ? " yaml-quickjump-item__fav--active" : "")
                                                            }
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                toggleFavorite(item);
                                                            }}
                                                            title={isFavorite(item) ? "Убрать из избранного" : "В избранное"}
                                                        >
                                                            <MIcon
                                                                name={isFavorite(item) ? "star" : "star_border"}
                                                                size="sm"
                                                                fill={isFavorite(item)}
                                                            />
                                                        </button>
                                                    )}
                                                    {isSectionPick(item) ? (
                                                        <span className="yaml-quickjump-item__action-hint">
                                                            <kbd>→</kbd> фильтр
                                                        </span>
                                                    ) : item.kind === "help" ? (
                                                        <span className="yaml-quickjump-item__action-hint">
                                                            <kbd>→</kbd> пример
                                                        </span>
                                                    ) : (
                                                        <div className="yaml-quickjump-item__line">
                                                            :{item.line}
                                                            {item.column && item.column > 1 && `:${item.column}`}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                </div>
                            );
                        })}

                        {/* Индикатор перебора */}
                        {flatSuggestionsRaw.length >= MAX_RESULTS && (
                            <div className="yaml-quickjump__truncated">
                                Показаны первые {MAX_RESULTS}. Уточните запрос или
                                примените фильтр.
                            </div>
                        )}
                    </div>
                )}

                <div className="yaml-quickjump__footer">
                    <span className="yaml-quickjump__footer-count">
                        <strong>{visibleSuggestions.length}</strong>
                        {visibleSuggestions.length !== flatSuggestionsRaw.length && (
                            <span style={{ opacity: 0.6 }}>
                                {" "}из {flatSuggestionsRaw.length}
                            </span>
                        )}{" "}
                        {pluralFew(visibleSuggestions.length, "результат", "результата", "результатов")}
                    </span>
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd>
                        <kbd>Home</kbd>
                        <kbd>End</kbd> навигация
                    </span>
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> навигация
                    </span>
                    <span>
                        <kbd>Enter</kbd> перейти
                    </span>
                    <span>
                        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> top-1
                    </span>
                    <span>
                        <kbd>Alt</kbd>
                        <kbd>←</kbd>
                        <kbd>→</kbd> история
                    </span>
                    <span>
                        <kbd>Esc</kbd> закрыть
                    </span>
                    <span>
                        <kbd>Ctrl</kbd>+клик — путь
                    </span>
                    <span className="yaml-quickjump__hint">
                        {["#", ":", ">", "@", "!", "~", "?"].map((c) => (
                            <Hint key={c} char={c} />
                        ))}
                    </span>
                </div>
            </div>

            {hoverPreview && (
                <JumpPreview
                    state={hoverPreview}
                    lines={lines}
                    term={previewSearchTerm}
                    lineMap={lineMap}
                    cursorLine={cursorLine}
                />
            )}
        </>
    );
}

function QuickJumpHelp({ onClose }: { onClose: () => void }) {
    return (
        <div className="yaml-quickjump-docs">
            <div className="yaml-quickjump-docs__head">
                <MIcon name="menu_book" size="sm" />
                <span className="yaml-quickjump-docs__title">
                    Документация: быстрый переход
                </span>
                <button
                    className="yaml-quickjump-docs__close"
                    onClick={onClose}
                    title="Закрыть (Esc)"
                >
                    ✕
                </button>
            </div>

            <div className="yaml-quickjump-docs__body">
                <p className="yaml-quickjump-docs__lead">
                    Окно быстрого перехода ищет по всему YAML-файлу: id элементов,
                    секции, содержимое, атрибуты, проблемы линтера и соседей
                    курсора. Открывается клавишей <kbd>Shift</kbd>+<kbd>Tab</kbd>{" "}
                    или <kbd>F2</kbd> (с подставленным словом под курсором).
                </p>

                <h3>1. Поиск</h3>
                <table className="yaml-quickjump-docs__table">
                    <thead>
                        <tr><th>Что</th><th>Как</th><th>Что делает</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>По id, name, описанию, FQID</td>
                            <td><code>audit</code></td>
                            <td>Ранжированный поиск по всем секциям. FQID
                                (<code>it.assets.rvision.ru/AssetGroups</code>)
                                находит сущность даже если она вложена в другой файл индекса.</td>
                        </tr>
                        <tr>
                            <td>По секции</td>
                            <td><code>#entities</code>, <code>#entities audit</code></td>
                            <td>Ограничивает поиск указанной секцией. С пустым
                                запросом — список секций.</td>
                        </tr>
                        <tr>
                            <td>Строка / колонка</td>
                            <td><code>:42</code>, <code>:42:5</code></td>
                            <td>Прыжок к позиции. Показывает ±2 соседние строки.</td>
                        </tr>
                        <tr>
                            <td>Поиск по содержимому</td>
                            <td><code>&gt;id:</code></td>
                            <td>Подстрочный поиск по тексту файла.</td>
                        </tr>
                        <tr>
                            <td>Regex-поиск</td>
                            <td><code>&gt;/lists_\w+/i</code></td>
                            <td>Regex по файлу. Флаги — как в JS (<code>i</code>, <code>m</code>, <code>g</code>).</td>
                        </tr>
                        <tr>
                            <td>Поиск атрибута</td>
                            <td><code>@score</code></td>
                            <td>Кросс-сущностный поиск атрибутов (включая вложенные
                                колонки Table). Прыжок к строке атрибута.</td>
                        </tr>
                        <tr>
                            <td>Атрибуты по типу</td>
                            <td><code>@:Reference</code>, <code>@score:Integer</code></td>
                            <td>
                                <code>@:type</code> — все атрибуты с dataType <code>type</code>.
                                <code>@:custom</code> — все кастомные (Enum / Workflow / Table).
                                <code>@attr:type</code> — оба условия.
                            </td>
                        </tr>
                        <tr>
                            <td>Проблемы линтера</td>
                            <td><code>!</code>, <code>!error</code>, <code>!auditScore</code></td>
                            <td>Переход к проблеме. Совместим с severity
                                (<code>error</code>/<code>warning</code>), именем
                                правила, id сущности, id атрибута.</td>
                        </tr>
                        <tr>
                            <td>Соседи курсора</td>
                            <td>
                                <code>~</code>, <code>~3</code>, <code>~audit</code>,{" "}
                                <code>~3 audit</code>
                            </td>
                            <td>
                                5 элементов выше/ниже курсора по умолчанию;{" "}
                                <code>~N</code> — по N с каждой стороны. С фильтром —
                                только совпадающие.
                            </td>
                        </tr>
                        <tr>
                            <td>Встроенная справка</td>
                            <td><code>?</code></td>
                            <td>Показывает список команд прямо в результатах.</td>
                        </tr>
                    </tbody>
                </table>

                <h3>2. Клавиатура</h3>
                <table className="yaml-quickjump-docs__table">
                    <tbody>
                        <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Навигация по результатам</td></tr>
                        <tr><td><kbd>Enter</kbd></td><td>Перейти к выбранному. Для help-примера — подставить в поле</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>Enter</kbd></td><td>Перейти к топ-1</td></tr>
                        <tr><td><kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>История прыжков в пределах сессии</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>К предыдущей/следующей секции</td></tr>
                        <tr><td><kbd>Esc</kbd></td><td>Очистить запрос → закрыть окно</td></tr>
                        <tr><td><kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>Открыть/закрыть окно</td></tr>
                        <tr><td><kbd>F2</kbd></td><td>Открыть с подставленным словом под курсором</td></tr>
                        <tr><td><kbd>F1</kbd></td><td>Эта справка</td></tr>
                        <tr><td><kbd>Ctrl</kbd>+<kbd>Click</kbd></td><td>Копировать путь элемента (<code>section/id</code>)</td></tr>
                    </tbody>
                </table>

                <h3>3. Дополнительно</h3>
                <ul>
                    <li><strong>★ Избранные</strong> — звёздочка справа у элемента. Показываются вверху списка при пустом запросе.</li>
                    <li><strong>Недавние</strong> — история реальных прыжков за сессию (до 5 последних).</li>
                    <li><strong>Запросы</strong> — история запросов за сессию (до 5 последних).</li>
                    <li><strong>Превью</strong> — при наведении на элемент появляется мини-контекст с ±2 строками.</li>
                    <li><strong>📋 «Все»</strong> — копирует все видимые результаты в буфер как список.</li>
                    <li><strong>🔗 «Поделиться»</strong> — ссылка с query в hash (<code>#q=</code>). Открытие такой ссылки = попап с этим запросом.</li>
                    <li><strong>Секции</strong>, в которых ищет поиск: entities, linkages, dataTypes, sequences, counterColorPattern(s), trees, transitiveLinkages, mixins, dataRules, actions, medias, views, menus, permissions, accessRules, localizations, uiRules, uiPresets.</li>
                </ul>

                <h3>4. Подсказки</h3>
                <p>
                    У каждого результата показывается иконка типа, sublabel с
                    метаданными (name, type, описание, количество атрибутов),
                    breadcrumbs (секция → контейнер) и номер строки. Если этот
                    элемент на строке курсора — рядом с ним иконка{" "}
                    <MIcon name="my_location" size="sm" />.
                </p>
            </div>
        </div>
    );
}