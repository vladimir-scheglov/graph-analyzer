import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import { DomainCombobox } from "../common/DomainCombobox";
import { openFileInEditor } from "../../lib/open-file";
import { alertDialog } from "../../lib/dialogs";
import {
    GlossaryEntry,
    GlossaryEntryAttribute,
    GlossaryEntryDataType,
    GlossaryEntryEntity,
} from "../../lib/model/glossary";
import type {
    AttributeRecord,
    DataTypeRecord,
    EntityRecord,
    ModelIndex,
} from "../../../shared/model-types";
import type { PiiHit } from "../../../shared/pii-types";
import type { LintIssue } from "../../../shared/lint-types";

// ============ Types ============

type GlossaryTab = "entity" | "attribute" | "dataType";
type SortBy = "alpha" | "domain" | "usage";
type GroupBy = "letter" | "domain" | "flat";
type KindFilter = "all" | "Enum" | "Workflow" | "Table";

const MIN_QUERY_HIGHLIGHT = 1;

// ============ Helpers ============

function firstLetter(s: string): string {
    const ch = (s || "").trim().charAt(0).toUpperCase();
    return /[A-ZА-ЯЁ]/.test(ch) ? ch : "#";
}

function entryKey(e: GlossaryEntry): string {
    if (e.kind === "entity") return `entity:${e.fqid}`;
    if (e.kind === "attribute") return `attr:${e.key}`;
    return `dt:${e.key}`;
}

function downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function stamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

function escapeCsv(v: any): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function matchesQuery(haystack: Array<string | undefined | null>, q: string): boolean {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return haystack.some(
        (s) => s != null && s.toLowerCase().indexOf(query) !== -1,
    );
}

// ============ Highlighted text ============

function HL({ text, query }: { text: string | null | undefined; query: string }) {
    if (!text) return null;
    const q = query.trim();
    if (!q) return <>{text}</>;
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let idx = lower.indexOf(qLower, pos);
    let k = 0;
    while (idx !== -1) {
        if (idx > pos) parts.push(text.slice(pos, idx));
        parts.push(
            <mark key={k++} className="search-hl">
                {text.slice(idx, idx + q.length)}
            </mark>,
        );
        pos = idx + q.length;
        idx = lower.indexOf(qLower, pos);
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return <>{parts}</>;
}

// ============ Flat entry ============

interface FlatRow {
    entry: GlossaryEntry;
    key: string;
    alpha: string;
    domain: string;
    usage: number;
    searchHay: Array<string | undefined | null>;
    hasPii: boolean;
    hasIssues: boolean;
    isOrphan: boolean;
    kind: string | null;
}

function buildEntityRow(e: GlossaryEntryEntity, index: ModelIndex): FlatRow {
    const entity = e.entity;
    const pii = index.pii.hits.some(
        (h) => h.entityFqid.toLowerCase() === entity.fqid.toLowerCase(),
    );
    const issues = index.lint.lintReport.issues.some(
        (i) => i.entityFqid?.toLowerCase() === entity.fqid.toLowerCase(),
    );
    const children = (index.entityChildrenByFqid[entity.fqid] || []).length;
    const mixins = (index.mixinsByEntityFqid[entity.fqid] || []).length;
    return {
        entry: e,
        key: entryKey(e),
        alpha: firstLetter(e.name),
        domain: entity.domainId,
        usage: children + mixins + entity.linkedViaLinkages.length,
        searchHay: [entity.entityId, entity.name, entity.description],
        hasPii: pii,
        hasIssues: issues,
        isOrphan: index.stats.orphanEntities.includes(entity.fqid),
        kind: entity.kind || null,
    };
}

function buildAttributeRow(
    e: GlossaryEntryAttribute,
    index: ModelIndex,
): FlatRow {
    const a = e.attribute;
    const entity = e.entity;
    const piiKey = `${entity.fqid}#${a.id}`;
    const pii = index.pii.hits.some((h) => h.key === piiKey);
    const issues = index.lint.lintReport.issues.some(
        (i) =>
            i.entityFqid?.toLowerCase() === entity.fqid.toLowerCase() &&
            i.attributeId === a.id,
    );
    return {
        entry: e,
        key: entryKey(e),
        alpha: firstLetter(e.name),
        domain: entity.domainId,
        usage: a.usedInViews + a.usedInRules,
        searchHay: [
            a.id,
            a.name,
            a.description,
            a.dataType,
            a.referenceEntity,
            entity.entityId,
            entity.name,
        ],
        hasPii: pii,
        hasIssues: issues,
        isOrphan: false,
        kind: a.dataType,
    };
}

function buildDataTypeRow(
    e: GlossaryEntryDataType,
    index: ModelIndex,
): FlatRow {
    const dt = e.dataType;
    const refsCount = index.entities.reduce((sum, ent) => {
        return (
            sum +
            ent.attributes.filter(
                (a) =>
                    a.dataType === dt.id &&
                    ent.domainId === dt.domainId,
            ).length
        );
    }, 0);
    return {
        entry: e,
        key: entryKey(e),
        alpha: firstLetter(e.name),
        domain: dt.domainId,
        usage: refsCount,
        searchHay: [dt.id, dt.name, dt.description, dt.kind],
        hasPii: false,
        hasIssues: false,
        isOrphan: false,
        kind: dt.kind,
    };
}

// ============ Main ============

export function GlossaryModal() {
    const open = useGraphStore((s) => s.glossaryOpen);
    const setOpen = useGraphStore((s) => s.setGlossaryOpen);
    const nodes = useGraphStore((s) => s.nodes);
    const { index, loading, error } = useModelIndex();

    const [tab, setTab] = useState<GlossaryTab>("entity");
    const [query, setQuery] = useState("");
    const [domainFilter, setDomainFilter] = useState("");
    const [sortBy, setSortBy] = useState<SortBy>("alpha");
    const [groupBy, setGroupBy] = useState<GroupBy>("letter");
    const [onlyPii, setOnlyPii] = useState(false);
    const [onlyIssues, setOnlyIssues] = useState(false);
    const [onlyOrphans, setOnlyOrphans] = useState(false);
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // ── Domains list for filter ──
    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // ── Build all rows per tab ──
    const allRows = useMemo<Record<GlossaryTab, FlatRow[]>>(() => {
        const empty = { entity: [], attribute: [], dataType: [] } as Record<GlossaryTab, FlatRow[]>;
        if (!index) return empty;

        const entity: FlatRow[] = index.entities.map((e) =>
            buildEntityRow(
                {
                    kind: "entity",
                    fqid: e.fqid,
                    name: e.name || e.entityId,
                    letter: firstLetter(e.name || e.entityId),
                    entity: e,
                },
                index,
            ),
        );

        const attribute: FlatRow[] = [];
        for (const e of index.entities) {
            for (const a of e.attributes) {
                attribute.push(
                    buildAttributeRow(
                        {
                            kind: "attribute",
                            key: `${e.fqid}#${a.id}`,
                            name: a.name || a.id,
                            letter: firstLetter(a.name || a.id),
                            attribute: a,
                            entity: e,
                        },
                        index,
                    ),
                );
            }
        }

        const dataType: FlatRow[] = index.dataTypes.map((d) =>
            buildDataTypeRow(
                {
                    kind: "dataType",
                    key: `${d.domainId}#${d.id}`,
                    name: d.name || d.id,
                    letter: firstLetter(d.name || d.id),
                    dataType: d,
                },
                index,
            ),
        );

        return { entity, attribute, dataType };
    }, [index]);

    // ── Tab counts (unfiltered) ──
    const tabCounts = useMemo(
        () => ({
            entity: allRows.entity.length,
            attribute: allRows.attribute.length,
            dataType: allRows.dataType.length,
        }),
        [allRows],
    );

    // ── Filter + sort ──
    const filtered = useMemo<FlatRow[]>(() => {
        let rows = allRows[tab];

        if (domainFilter) {
            const d = domainFilter.toLowerCase();
            rows = rows.filter((r) => r.domain.toLowerCase() === d);
        }
        if (tab === "entity") {
            if (onlyPii) rows = rows.filter((r) => r.hasPii);
            if (onlyIssues) rows = rows.filter((r) => r.hasIssues);
            if (onlyOrphans) rows = rows.filter((r) => r.isOrphan);
        }
        if (tab === "attribute") {
            if (onlyPii) rows = rows.filter((r) => r.hasPii);
            if (onlyIssues) rows = rows.filter((r) => r.hasIssues);
        }
        if (tab === "dataType" && kindFilter !== "all") {
            rows = rows.filter((r) => r.kind === kindFilter);
        }
        if (query.trim()) {
            rows = rows.filter((r) => matchesQuery(r.searchHay, query));
        }

        const sorted = [...rows];
        if (sortBy === "alpha") {
            sorted.sort(
                (a, b) =>
                    a.alpha.localeCompare(b.alpha, "ru") ||
                    a.entry.name.localeCompare(b.entry.name, "ru", {
                        sensitivity: "base",
                    }),
            );
        } else if (sortBy === "domain") {
            sorted.sort(
                (a, b) =>
                    a.domain.localeCompare(b.domain) ||
                    a.entry.name.localeCompare(b.entry.name, "ru", {
                        sensitivity: "base",
                    }),
            );
        } else if (sortBy === "usage") {
            sorted.sort(
                (a, b) =>
                    b.usage - a.usage ||
                    a.entry.name.localeCompare(b.entry.name, "ru", {
                        sensitivity: "base",
                    }),
            );
        }
        return sorted;
    }, [
        allRows,
        tab,
        domainFilter,
        onlyPii,
        onlyIssues,
        onlyOrphans,
        kindFilter,
        query,
        sortBy,
    ]);

    // ── Grouping ──
    interface Group {
        key: string;
        label: string | null;
        sublabel?: string;
        rows: FlatRow[];
    }

    const grouped = useMemo<Group[]>(() => {
        if (filtered.length === 0) return [];
        if (groupBy === "flat") {
            return [{ key: "all", label: null, rows: filtered }];
        }
        if (groupBy === "domain") {
            const m = new Map<string, FlatRow[]>();
            for (const r of filtered) {
                if (!m.has(r.domain)) m.set(r.domain, []);
                m.get(r.domain)!.push(r);
            }
            return Array.from(m.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .map(([domain, rows]) => ({
                    key: domain,
                    label: domain,
                    sublabel: `${rows.length}`,
                    rows,
                }));
        }
        // letter
        const m = new Map<string, FlatRow[]>();
        for (const r of filtered) {
            if (!m.has(r.alpha)) m.set(r.alpha, []);
            m.get(r.alpha)!.push(r);
        }
        const sorted = Array.from(m.entries()).sort(([a], [b]) => {
            if (a === "#") return 1;
            if (b === "#") return -1;
            return a.localeCompare(b, "ru");
        });
        return sorted.map(([letter, rows]) => ({
            key: letter,
            label: letter,
            rows,
        }));
    }, [filtered, groupBy]);

    // ── Flat list for keyboard nav ──
    const navRows = useMemo<FlatRow[]>(() => {
        const out: FlatRow[] = [];
        grouped.forEach((g) => {
            if (collapsedGroups.has(g.key)) return;
            g.rows.forEach((r) => out.push(r));
        });
        return out;
    }, [grouped, collapsedGroups]);

    // ── Selected row ──
    const selectedRow = useMemo(
        () => filtered.find((r) => r.key === selectedKey) || null,
        [filtered, selectedKey],
    );

    // ── Reset on open ──
    useEffect(() => {
        if (!open) {
            setQuery("");
            setDomainFilter("");
            setSortBy("alpha");
            setGroupBy("letter");
            setOnlyPii(false);
            setOnlyIssues(false);
            setOnlyOrphans(false);
            setKindFilter("all");
            setSelectedKey(null);
            setActiveIdx(-1);
            setCollapsedGroups(new Set());
            return;
        }
        const t = setTimeout(() => searchInputRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [open]);

    // ── Reset on tab change ──
    useEffect(() => {
        setSelectedKey(null);
        setActiveIdx(-1);
        setCollapsedGroups(new Set());
    }, [tab]);

    // ── Clamp active idx ──
    useEffect(() => {
        if (activeIdx >= navRows.length) {
            setActiveIdx(navRows.length - 1);
        }
    }, [navRows.length, activeIdx]);

    // ── Deselect if filtered out ──
    useEffect(() => {
        if (selectedKey && !filtered.some((r) => r.key === selectedKey)) {
            setSelectedKey(null);
        }
    }, [filtered, selectedKey]);

    // ── Auto-scroll to active ──
    useEffect(() => {
        if (activeIdx < 0 || !listRef.current) return;
        const row = navRows[activeIdx];
        if (!row) return;
        const el = listRef.current.querySelector(
            `[data-row-key="${CSS.escape(row.key)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx, navRows]);

    // ── Actions ──
    const openEntity = useCallback((fqid: string) => {
        const st = useGraphStore.getState();
        st.setGlossaryOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    }, []);

    const openDomainSchema = useCallback((domainId: string) => {
        const st = useGraphStore.getState();
        st.setGlossaryOpen(false);
        st.setDomainSchemaDomainId(domainId);
        st.setDomainSchemaOpen(true);
    }, []);

    const openDataTypeInSchema = useCallback(
        (domainId: string, dataTypeId: string) => {
            const st = useGraphStore.getState();
            st.setGlossaryOpen(false);
            st.setDomainSchemaDomainId(domainId);
            st.setDomainSchemaPrefillQuery(dataTypeId);
            st.setDomainSchemaPrefillExpandItem(`dataType:${dataTypeId}`);
            st.setDomainSchemaOpen(true);
        },
        [],
    );

    const openYamlForDomain = useCallback(
        async (domainId: string, fqid: string | null) => {
            const node = nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() ===
                    domainId.toLowerCase(),
            );
            if (!node?.data.filePath) {
                useGraphStore.getState().showSnackbar("Файл схемы не найден");
                return;
            }
            const st = useGraphStore.getState();
            st.setGlossaryOpen(false);
            const ok = await openFileInEditor(node.data.filePath, fqid, domainId);
            if (!ok) useGraphStore.getState().setGlossaryOpen(true);
        },
        [nodes],
    );

    const copyText = useCallback(async (text: string, label = "Скопировано") => {
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(label);
        } catch {
            await alertDialog("Не удалось скопировать");
        }
    }, []);

    const handleRowOpen = useCallback(
        (row: FlatRow) => {
            const e = row.entry;
            if (e.kind === "entity") {
                openEntity(e.fqid);
            } else if (e.kind === "attribute") {
                openEntity(e.entity.fqid);
            } else if (e.kind === "dataType") {
                openDataTypeInSchema(e.dataType.domainId, e.dataType.id);
            }
        },
        [openEntity, openDataTypeInSchema],
    );

    // ── Scroll to letter ──
    const scrollToLetter = useCallback((letter: string) => {
        const el = listRef.current?.querySelector(
            `[data-group-key="${CSS.escape(letter)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const toggleGroup = useCallback((key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const resetFilters = useCallback(() => {
        setQuery("");
        setDomainFilter("");
        setOnlyPii(false);
        setOnlyIssues(false);
        setOnlyOrphans(false);
        setKindFilter("all");
    }, []);

    const hasFilters =
        !!query.trim() ||
        !!domainFilter ||
        onlyPii ||
        onlyIssues ||
        onlyOrphans ||
        kindFilter !== "all";

    // ── Keyboard ──
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const inField =
                t &&
                (t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.tagName === "SELECT" ||
                    t.isContentEditable);

            if (e.key === "/" && !inField) {
                e.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
                return;
            }
            if (e.key === "Escape") {
                if (selectedKey) {
                    setSelectedKey(null);
                    return;
                }
                if (query) {
                    setQuery("");
                    return;
                }
                e.preventDefault();
                setOpen(false);
                return;
            }
            if (inField) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (navRows.length === 0) return;
                setActiveIdx((i) => Math.min(i + 1, navRows.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (navRows.length === 0) return;
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && activeIdx >= 0) {
                e.preventDefault();
                const row = navRows[activeIdx];
                if (!row) return;
                if (e.shiftKey) {
                    handleRowOpen(row);
                } else {
                    setSelectedKey(row.key);
                }
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, navRows, activeIdx, selectedKey, query, handleRowOpen, setOpen]);

    // ── Exports ──
    const exportCSV = () => {
        const header = [
            "kind",
            "id",
            "name",
            "domain",
            "dataType/kind",
            "usage",
            "pii",
            "issues",
            "description",
        ];
        const lines = [header.join(",")];
        for (const r of filtered) {
            const e = r.entry;
            let id = "";
            let name = "";
            let description = "";
            let dataKind = "";
            if (e.kind === "entity") {
                id = e.entity.entityId;
                name = e.entity.name;
                description = e.entity.description;
                dataKind = e.entity.kind || "regular";
            } else if (e.kind === "attribute") {
                id = `${e.entity.entityId}.${e.attribute.id}`;
                name = e.attribute.name;
                description = e.attribute.description;
                dataKind = e.attribute.dataType;
            } else {
                id = e.dataType.id;
                name = e.dataType.name;
                description = e.dataType.description;
                dataKind = e.dataType.kind;
            }
            lines.push(
                [
                    e.kind,
                    id,
                    name,
                    r.domain,
                    dataKind,
                    String(r.usage),
                    r.hasPii ? "true" : "",
                    r.hasIssues ? "true" : "",
                    description,
                ]
                    .map(escapeCsv)
                    .join(","),
            );
        }
        downloadFile(
            "\uFEFF" + lines.join("\n"),
            `glossary-${tab}-${stamp()}.csv`,
            "text/csv;charset=utf-8",
        );
    };

    const exportJSON = () => {
        const data = {
            generatedAt: new Date().toISOString(),
            tab,
            filters: {
                query,
                domain: domainFilter || null,
                onlyPii,
                onlyIssues,
                onlyOrphans,
                kind: kindFilter,
            },
            stats: {
                total: tabCounts[tab],
                filtered: filtered.length,
            },
            entries: filtered.map((r) => {
                const e = r.entry;
                const base = {
                    key: r.key,
                    kind: e.kind,
                    name: e.name,
                    domain: r.domain,
                    usage: r.usage,
                    pii: r.hasPii,
                    issues: r.hasIssues,
                };
                if (e.kind === "entity") {
                    return {
                        ...base,
                        entityId: e.entity.entityId,
                        fqid: e.entity.fqid,
                        description: e.entity.description,
                        attributesCount: e.entity.attributes.length,
                        inherits: e.entity.inherits,
                        tags: e.entity.domainTags,
                        kind: e.entity.kind || "regular",
                    };
                }
                if (e.kind === "attribute") {
                    return {
                        ...base,
                        attributeId: e.attribute.id,
                        dataType: e.attribute.dataType,
                        referenceEntity: e.attribute.referenceEntity || null,
                        constraints: e.attribute.constraints,
                        readonly: !!e.attribute.readonly,
                        description: e.attribute.description,
                        entityId: e.entity.entityId,
                        entityFqid: e.entity.fqid,
                    };
                }
                return {
                    ...base,
                    dataTypeId: e.dataType.id,
                    dataKind: e.dataType.kind,
                    description: e.dataType.description,
                    valuesCount: e.dataType.values?.length,
                    statusesCount: e.dataType.statuses?.length,
                };
            }),
        };
        downloadFile(
            JSON.stringify(data, null, 2),
            `glossary-${tab}-${stamp()}.json`,
            "application/json",
        );
    };

    const exportMD = () => {
        const lines: string[] = [];
        lines.push(`# Глоссарий: ${tab}`);
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");
        lines.push(`Найдено: **${filtered.length}** из ${tabCounts[tab]}`);
        if (hasFilters) {
            const fp: string[] = [];
            if (query) fp.push(`поиск: «${query}»`);
            if (domainFilter) fp.push(`домен: ${domainFilter}`);
            if (onlyPii) fp.push("только PII");
            if (onlyIssues) fp.push("только с issues");
            if (onlyOrphans) fp.push("только сироты");
            if (kindFilter !== "all") fp.push(`kind: ${kindFilter}`);
            lines.push(`**Фильтры:** ${fp.join(" · ")}`);
        }
        lines.push("");

        for (const group of grouped) {
            if (group.label) {
                lines.push(`## ${group.label}`);
                lines.push("");
            }
            for (const r of group.rows) {
                const e = r.entry;
                if (e.kind === "entity") {
                    lines.push(`- **${e.name}** \`${e.entity.fqid}\``);
                    if (e.entity.description) {
                        lines.push(`  ${e.entity.description}`);
                    }
                } else if (e.kind === "attribute") {
                    lines.push(
                        `- **${e.name}** \`${e.entity.entityId}.${e.attribute.id}\` · ${e.attribute.dataType}`,
                    );
                } else {
                    lines.push(
                        `- **${e.name}** \`${e.dataType.id}\` · ${e.dataType.kind}`,
                    );
                }
            }
            lines.push("");
        }
        downloadFile(
            lines.join("\n"),
            `glossary-${tab}-${stamp()}.md`,
            "text/markdown;charset=utf-8",
        );
    };

    const lettersInView = useMemo(() => {
        if (groupBy !== "letter") return [];
        return grouped.map((g) => g.key).filter((k) => k !== "all");
    }, [grouped, groupBy]);

    // ── Render guards ──
    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal glossary-modal glossary-modal--v2"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span className="icon-label">Глоссарий</span>
                        {index && (
                            <span className="help-modal__badge">
                                {filtered.length} / {tabCounts[tab]}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        {filtered.length > 0 && (
                            <>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportJSON}
                                    title="Экспорт JSON"
                                >
                                    <MIcon name="data_object" />
                                </button>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportCSV}
                                    title="Экспорт CSV"
                                >
                                    <MIcon name="table_view" />
                                </button>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportMD}
                                    title="Экспорт Markdown"
                                >
                                    <MIcon name="description" />
                                </button>
                            </>
                        )}
                        <button
                            className="help-modal__close"
                            onClick={() => setOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && !index && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса…</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && (
                    <>
                        {/* ── Tabs ── */}
                        <div className="glossary-tabs-bar">
                            {(
                                [
                                    { id: "entity", label: "Сущности", icon: "data_object" },
                                    { id: "attribute", label: "Атрибуты", icon: "edit_note" },
                                    { id: "dataType", label: "Типы данных", icon: "category" },
                                ] as const
                            ).map((t) => (
                                <button
                                    key={t.id}
                                    className={
                                        "glossary-tab-btn" +
                                        (tab === t.id ? " active" : "")
                                    }
                                    onClick={() => setTab(t.id)}
                                >
                                    <MIcon name={t.icon} size="sm" />
                                    <span>{t.label}</span>
                                    <span className="glossary-tab-btn__count">
                                        {tabCounts[t.id]}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* ── Body: sidebar + list + detail ── */}
                        <div className="glossary-body">
                            {/* Sidebar (only when letter index visible) */}
                            {groupBy === "letter" && lettersInView.length > 0 && (
                                <div className="glossary-sidebar glossary-sidebar--narrow">
                                    <div className="glossary-index">
                                        <div className="glossary-index__title">
                                            Указатель
                                        </div>
                                        <div className="glossary-index__letters">
                                            {lettersInView.map((L) => (
                                                <button
                                                    key={L}
                                                    className="glossary-letter"
                                                    onClick={() => scrollToLetter(L)}
                                                >
                                                    {L}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Main content */}
                            <div className="glossary-content">
                                {/* Search + Domain + Sort + Group */}
                                <div className="glossary-toolbar">
                                    <div className="glossary-search-wrap">
                                        <MIcon name="search" size="sm" />
                                        <input
                                            ref={searchInputRef}
                                            className="entity-search-input"
                                            type="text"
                                            placeholder={
                                                tab === "entity"
                                                    ? "Поиск: id, name, description… (/ для фокуса)"
                                                    : tab === "attribute"
                                                        ? "Поиск: атрибут, тип, entity…"
                                                        : "Поиск: id, name, description…"
                                            }
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                        />
                                        {query && (
                                            <button
                                                className="entity-search-clear"
                                                onClick={() => setQuery("")}
                                                title="Очистить"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    <div className="glossary-toolbar__selects">
                                        <DomainCombobox
                                            value={domainFilter}
                                            onChange={setDomainFilter}
                                            domains={allDomains}
                                            placeholder="Все домены"
                                            allowEmpty
                                            emptyLabel="Все домены"
                                        />
                                        <label className="glossary-toolbar__label">
                                            <span>Сортировка:</span>
                                            <select
                                                value={sortBy}
                                                onChange={(e) =>
                                                    setSortBy(e.target.value as SortBy)
                                                }
                                            >
                                                <option value="alpha">По алфавиту</option>
                                                <option value="domain">По домену</option>
                                                <option value="usage">По использованию</option>
                                            </select>
                                        </label>
                                        <label className="glossary-toolbar__label">
                                            <span>Группировка:</span>
                                            <select
                                                value={groupBy}
                                                onChange={(e) =>
                                                    setGroupBy(e.target.value as GroupBy)
                                                }
                                            >
                                                <option value="letter">По букве</option>
                                                <option value="domain">По домену</option>
                                                <option value="flat">Плоский</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>

                                {/* Filter chips */}
                                <div className="glossary-filters">
                                    {tab === "entity" && (
                                        <>
                                            <FilterChip
                                                active={onlyPii}
                                                icon="shield_lock"
                                                label="Только PII"
                                                onClick={() => setOnlyPii(!onlyPii)}
                                            />
                                            <FilterChip
                                                active={onlyIssues}
                                                icon="bug_report"
                                                label="Только с issues"
                                                onClick={() => setOnlyIssues(!onlyIssues)}
                                            />
                                            <FilterChip
                                                active={onlyOrphans}
                                                icon="link_off"
                                                label="Только сироты"
                                                onClick={() => setOnlyOrphans(!onlyOrphans)}
                                            />
                                        </>
                                    )}
                                    {tab === "attribute" && (
                                        <>
                                            <FilterChip
                                                active={onlyPii}
                                                icon="shield_lock"
                                                label="Только PII"
                                                onClick={() => setOnlyPii(!onlyPii)}
                                            />
                                            <FilterChip
                                                active={onlyIssues}
                                                icon="bug_report"
                                                label="Только с issues"
                                                onClick={() => setOnlyIssues(!onlyIssues)}
                                            />
                                        </>
                                    )}
                                    {tab === "dataType" && (
                                        <>
                                            {(
                                                ["all", "Enum", "Workflow", "Table"] as const
                                            ).map((k) => (
                                                <FilterChip
                                                    key={k}
                                                    active={kindFilter === k}
                                                    icon={
                                                        k === "all"
                                                            ? "apps"
                                                            : k === "Enum"
                                                                ? "list"
                                                                : k === "Workflow"
                                                                    ? "conversion_path"
                                                                    : "table_view"
                                                    }
                                                    label={k === "all" ? "Все" : k}
                                                    onClick={() => setKindFilter(k)}
                                                />
                                            ))}
                                        </>
                                    )}
                                    {hasFilters && (
                                        <button
                                            className="glossary-filters__reset"
                                            onClick={resetFilters}
                                            title="Сбросить все фильтры"
                                        >
                                            <MIcon name="filter_alt_off" size="sm" />
                                            Сбросить
                                        </button>
                                    )}
                                    <span className="glossary-filters__count">
                                        {filtered.length} / {tabCounts[tab]}
                                    </span>
                                </div>

                                {/* List */}
                                <div className="glossary-list" ref={listRef}>
                                    {filtered.length === 0 ? (
                                        <div className="glossary-empty">
                                            <MIcon name="search_off" size="xl" />
                                            <div className="glossary-empty__title">
                                                {hasFilters
                                                    ? "Ничего не найдено по текущим фильтрам"
                                                    : "Пусто"}
                                            </div>
                                            {hasFilters && (
                                                <button
                                                    className="btn"
                                                    onClick={resetFilters}
                                                >
                                                    Сбросить фильтры
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        grouped.map((group) => {
                                            const isCollapsed =
                                                collapsedGroups.has(group.key);
                                            return (
                                                <div
                                                    key={group.key}
                                                    data-group-key={group.key}
                                                    className="glossary-section"
                                                >
                                                    {group.label && (
                                                        <button
                                                            className="glossary-section__letter glossary-section__letter--clickable"
                                                            onClick={() =>
                                                                toggleGroup(group.key)
                                                            }
                                                            title={
                                                                isCollapsed
                                                                    ? "Развернуть группу"
                                                                    : "Свернуть группу"
                                                            }
                                                        >
                                                            {isCollapsed
                                                                ? "▸"
                                                                : "▾"}{" "}
                                                            {group.label}
                                                            {group.sublabel && (
                                                                <span className="glossary-section__sub">
                                                                    {group.sublabel}
                                                                </span>
                                                            )}
                                                            <span className="glossary-section__count">
                                                                {group.rows.length}
                                                            </span>
                                                        </button>
                                                    )}
                                                    {!isCollapsed &&
                                                        group.rows.map((r) => {
                                                            const idx = navRows.indexOf(r);
                                                            return (
                                                                <EntryRow
                                                                    key={r.key}
                                                                    row={r}
                                                                    query={query}
                                                                    isSelected={
                                                                        selectedKey === r.key
                                                                    }
                                                                    isActive={idx === activeIdx}
                                                                    onSelect={() =>
                                                                        setSelectedKey(r.key)
                                                                    }
                                                                    onOpen={() => handleRowOpen(r)}
                                                                    onHover={() => setActiveIdx(idx)}
                                                                />
                                                            );
                                                        })}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Detail panel */}
                            {selectedRow && (
                                <div className="glossary-detail-panel">
                                    <DetailPanel
                                        row={selectedRow}
                                        index={index}
                                        onClose={() => setSelectedKey(null)}
                                        onOpenEntity={openEntity}
                                        onOpenDomainSchema={openDomainSchema}
                                        onOpenDataTypeInSchema={openDataTypeInSchema}
                                        onOpenYaml={openYamlForDomain}
                                        onCopy={copyText}
                                    />
                                </div>
                            )}
                        </div>

                        {/* ── Footer ── */}
                        <div className="glossary-footer">
                            <span>
                                <kbd>↑</kbd>
                                <kbd>↓</kbd> выбор
                            </span>
                            <span>
                                <kbd>Enter</kbd> детали
                            </span>
                            <span>
                                <kbd>Shift</kbd>+<kbd>Enter</kbd> открыть
                            </span>
                            <span>
                                <kbd>Esc</kbd> закрыть
                            </span>
                            <span>
                                <kbd>/</kbd> поиск
                            </span>
                            <span className="glossary-footer__right">
                                {activeIdx >= 0 && navRows[activeIdx] ? (
                                    <code className="glossary-footer__active">
                                        {navRows[activeIdx].entry.name}
                                    </code>
                                ) : (
                                    <span style={{ opacity: 0.5 }}>—</span>
                                )}
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ============ FilterChip ============

function FilterChip({
    active,
    icon,
    label,
    onClick,
}: {
    active: boolean;
    icon: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={
                "glossary-filter-chip" + (active ? " glossary-filter-chip--active" : "")
            }
            onClick={onClick}
        >
            <MIcon name={icon} size="sm" />
            <span>{label}</span>
        </button>
    );
}

// ============ EntryRow ============

interface EntryRowProps {
    row: FlatRow;
    query: string;
    isSelected: boolean;
    isActive: boolean;
    onSelect: () => void;
    onOpen: () => void;
    onHover: () => void;
}

function EntryRow({
    row,
    query,
    isSelected,
    isActive,
    onSelect,
    onOpen,
    onHover,
}: EntryRowProps) {
    const e = row.entry;

    const cls = [
        "glossary-entry",
        isSelected && "glossary-entry--selected",
        isActive && "glossary-entry--active",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            data-row-key={row.key}
            className={cls}
            onClick={onSelect}
            onDoubleClick={onOpen}
            onMouseEnter={onHover}
        >
            {e.kind === "entity" && (
                <>
                    <div className="glossary-entry__head">
                        <span className="glossary-entry__name">
                            <HL text={e.name || e.entity.entityId} query={query} />
                        </span>
                        <span className="glossary-entry__id">{e.entity.entityId}</span>
                        {row.hasPii && (
                            <span
                                className="glossary-entry__badge glossary-entry__badge--pii"
                                title="PII-атрибуты"
                            >
                                <MIcon name="shield_lock" size="sm" />
                            </span>
                        )}
                        {row.hasIssues && (
                            <span
                                className="glossary-entry__badge glossary-entry__badge--issues"
                                title="Lint-проблемы"
                            >
                                <MIcon name="bug_report" size="sm" />
                            </span>
                        )}
                        {row.isOrphan && (
                            <span
                                className="glossary-entry__badge glossary-entry__badge--orphan"
                                title="Сирота"
                            >
                                <MIcon name="link_off" size="sm" />
                            </span>
                        )}
                    </div>
                    <div className="glossary-entry__meta">
                        <span className="glossary-entry__domain">
                            {e.entity.domainId}
                        </span>
                        <span className="glossary-entry__tags">
                            {e.entity.attributes.length} атр.
                        </span>
                        {e.entity.inherits && (
                            <span className="glossary-entry__inherits">
                                ↳ {e.entity.inherits.split("/")[1]}
                            </span>
                        )}
                        {row.usage > 0 && (
                            <span className="glossary-entry__usage">
                                ← {row.usage}
                            </span>
                        )}
                    </div>
                    {e.entity.description && (
                        <div className="glossary-entry__desc">
                            <HL text={e.entity.description} query={query} />
                        </div>
                    )}
                </>
            )}

            {e.kind === "attribute" && (
                <>
                    <div className="glossary-entry__head">
                        <span className="glossary-entry__name">
                            <HL text={e.name || e.attribute.id} query={query} />
                        </span>
                        <code className="glossary-entry__attr-id">
                            {e.attribute.id}
                        </code>
                        <span className="glossary-entry__type">
                            {e.attribute.dataType}
                        </span>
                        {row.hasPii && (
                            <span className="glossary-entry__badge glossary-entry__badge--pii">
                                <MIcon name="shield_lock" size="sm" />
                            </span>
                        )}
                        {row.hasIssues && (
                            <span className="glossary-entry__badge glossary-entry__badge--issues">
                                <MIcon name="bug_report" size="sm" />
                            </span>
                        )}
                    </div>
                    <div className="glossary-entry__meta">
                        <span className="glossary-entry__context">
                            в <strong>{e.entity.entityId}</strong>
                        </span>
                        <span className="glossary-entry__domain">
                            {e.entity.domainId}
                        </span>
                        {e.attribute.referenceEntity && (
                            <span className="glossary-entry__ref">
                                → {e.attribute.referenceEntity.split("/")[1]}
                            </span>
                        )}
                        {row.usage > 0 && (
                            <span className="glossary-entry__usage">
                                исп. {row.usage}×
                            </span>
                        )}
                    </div>
                    {e.attribute.description && (
                        <div className="glossary-entry__desc">
                            <HL text={e.attribute.description} query={query} />
                        </div>
                    )}
                </>
            )}

            {e.kind === "dataType" && (
                <>
                    <div className="glossary-entry__head">
                        <span className="glossary-entry__name">
                            <HL text={e.name || e.dataType.id} query={query} />
                        </span>
                        <code className="glossary-entry__attr-id">
                            {e.dataType.id}
                        </code>
                        <span
                            className={
                                "glossary-entry__type glossary-entry__type--" +
                                e.dataType.kind.toLowerCase()
                            }
                        >
                            {e.dataType.kind}
                        </span>
                    </div>
                    <div className="glossary-entry__meta">
                        <span className="glossary-entry__domain">
                            {e.dataType.domainId}
                        </span>
                        {e.dataType.valuesCount != null && (
                            <span className="glossary-entry__tags">
                                {e.dataType.valuesCount} значений
                            </span>
                        )}
                        {e.dataType.statusesCount != null && (
                            <span className="glossary-entry__tags">
                                {e.dataType.statusesCount} статусов
                            </span>
                        )}
                        {e.dataType.attributesCount != null && (
                            <span className="glossary-entry__tags">
                                {e.dataType.attributesCount} колонок
                            </span>
                        )}
                        {row.usage > 0 && (
                            <span className="glossary-entry__usage">
                                исп. {row.usage}×
                            </span>
                        )}
                    </div>
                    {e.dataType.description && (
                        <div className="glossary-entry__desc">
                            <HL text={e.dataType.description} query={query} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ============ DetailPanel ============

interface DetailPanelProps {
    row: FlatRow;
    index: ModelIndex;
    onClose: () => void;
    onOpenEntity: (fqid: string) => void;
    onOpenDomainSchema: (domainId: string) => void;
    onOpenDataTypeInSchema: (domainId: string, dtId: string) => void;
    onOpenYaml: (domainId: string, fqid: string | null) => void;
    onCopy: (text: string, label?: string) => void;
}

function DetailPanel({
    row,
    index,
    onClose,
    onOpenEntity,
    onOpenDomainSchema,
    onOpenDataTypeInSchema,
    onOpenYaml,
    onCopy,
}: DetailPanelProps) {
    const e = row.entry;

    return (
        <>
            <div className="glossary-detail__head">
                <span className="glossary-detail__kind">
                    {e.kind === "entity"
                        ? "Сущность"
                        : e.kind === "attribute"
                            ? "Атрибут"
                            : "Тип данных"}
                </span>
                <button
                    className="glossary-detail__close"
                    onClick={onClose}
                    title="Закрыть (Esc)"
                >
                    ✕
                </button>
            </div>

            {e.kind === "entity" && (
                <EntityDetail
                    entity={e.entity}
                    index={index}
                    onOpenEntity={onOpenEntity}
                    onOpenDomainSchema={onOpenDomainSchema}
                    onOpenYaml={onOpenYaml}
                    onCopy={onCopy}
                />
            )}
            {e.kind === "attribute" && (
                <AttributeDetail
                    entity={e.entity}
                    attribute={e.attribute}
                    index={index}
                    onOpenEntity={onOpenEntity}
                    onOpenDomainSchema={onOpenDomainSchema}
                    onOpenYaml={onOpenYaml}
                    onCopy={onCopy}
                />
            )}
            {e.kind === "dataType" && (
                <DataTypeDetail
                    dataType={e.dataType}
                    index={index}
                    onOpenDomainSchema={onOpenDomainSchema}
                    onOpenDataTypeInSchema={onOpenDataTypeInSchema}
                    onCopy={onCopy}
                />
            )}
        </>
    );
}

// ============ EntityDetail ============

function EntityDetail({
    entity,
    index,
    onOpenEntity,
    onOpenDomainSchema,
    onOpenYaml,
    onCopy,
}: {
    entity: EntityRecord;
    index: ModelIndex;
    onOpenEntity: (fqid: string) => void;
    onOpenDomainSchema: (domainId: string) => void;
    onOpenYaml: (domainId: string, fqid: string | null) => void;
    onCopy: (text: string, label?: string) => void;
}) {
    const children = index.entityChildrenByFqid[entity.fqid] || [];
    const parent = entity.inherits
        ? index.entitiesByFqid[entity.inherits] || null
        : null;
    const pii = index.pii.hits.filter(
        (h) => h.entityFqid.toLowerCase() === entity.fqid.toLowerCase(),
    );
    const issues = index.lint.lintReport.issues.filter(
        (i) => i.entityFqid?.toLowerCase() === entity.fqid.toLowerCase(),
    );
    const mixins = index.mixinsByEntityFqid[entity.fqid] || [];

    return (
        <div className="glossary-detail__body">
            <div className="glossary-detail__title">
                {entity.entityId}
            </div>
            {entity.name && entity.name !== entity.entityId && (
                <div className="glossary-detail__subtitle">{entity.name}</div>
            )}

            <div className="glossary-detail__metrics">
                <Metric label="Атрибутов" value={entity.attributes.length} />
                <Metric label="Наследников" value={children.length} />
                <Metric label="PII" value={pii.length} tone={pii.length > 0 ? "warn" : "neutral"} />
                <Metric
                    label="Issues"
                    value={issues.length}
                    tone={issues.length > 0 ? "err" : "neutral"}
                />
            </div>

            {entity.description && (
                <div className="glossary-detail__desc">{entity.description}</div>
            )}

            <Row label="Домен">
                <button
                    className="glossary-detail__link"
                    onClick={() => onOpenDomainSchema(entity.domainId)}
                >
                    <MIcon name="folder" size="sm" />
                    {entity.domainId}
                </button>
            </Row>

            {parent && (
                <Row label="Наследует">
                    <button
                        className="glossary-detail__link"
                        onClick={() => onOpenEntity(parent.fqid)}
                    >
                        <MIcon name="arrow_upward" size="sm" />
                        {parent.entityId}
                    </button>
                </Row>
            )}

            {mixins.length > 0 && (
                <Row label="Миксины">
                    <div className="glossary-detail__chips">
                        {mixins.slice(0, 5).map((m) => (
                            <code
                                key={`${m.domainId}#${m.id}`}
                                className="glossary-detail__chip"
                            >
                                {m.id}
                            </code>
                        ))}
                        {mixins.length > 5 && (
                            <span className="glossary-detail__more">
                                +{mixins.length - 5}
                            </span>
                        )}
                    </div>
                </Row>
            )}

            {entity.domainTags.length > 0 && (
                <Row label="Теги">
                    <div className="glossary-detail__chips">
                        {entity.domainTags.map((t) => (
                            <span key={t} className="glossary-detail__tag">
                                {t}
                            </span>
                        ))}
                    </div>
                </Row>
            )}

            {entity.attributes.length > 0 && (
                <div className="glossary-detail__section">
                    <div className="glossary-detail__section-title">
                        Атрибуты ({entity.attributes.length})
                    </div>
                    <div className="glossary-detail__attr-list">
                        {entity.attributes.slice(0, 12).map((a) => (
                            <div key={a.id} className="glossary-detail__attr">
                                <code className="glossary-detail__attr-id">
                                    {a.id}
                                </code>
                                <span className="glossary-detail__attr-type">
                                    {a.dataType}
                                </span>
                                {a.constraints.includes("required") && (
                                    <span className="glossary-detail__attr-badge">
                                        *
                                    </span>
                                )}
                                {a.readonly && (
                                    <span className="glossary-detail__attr-badge">
                                        🔒
                                    </span>
                                )}
                            </div>
                        ))}
                        {entity.attributes.length > 12 && (
                            <div className="glossary-detail__more">
                                …и ещё {entity.attributes.length - 12}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="glossary-detail__actions">
                <button
                    className="btn btn--primary btn--small"
                    onClick={() => onOpenEntity(entity.fqid)}
                >
                    <MIcon name="menu_book" size="sm" />
                    В каталог
                </button>
                <button
                    className="btn btn--small"
                    onClick={() => onOpenYaml(entity.domainId, entity.fqid)}
                >
                    <MIcon name="description" size="sm" />
                    YAML
                </button>
                <button
                    className="btn btn--icon btn--small"
                    onClick={() => onCopy(entity.fqid, "FQID скопирован")}
                    title="Копировать FQID"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>
        </div>
    );
}

// ============ AttributeDetail ============

function AttributeDetail({
    entity,
    attribute,
    index,
    onOpenEntity,
    onOpenDomainSchema,
    onOpenYaml,
    onCopy,
}: {
    entity: EntityRecord;
    attribute: AttributeRecord;
    index: ModelIndex;
    onOpenEntity: (fqid: string) => void;
    onOpenDomainSchema: (domainId: string) => void;
    onOpenYaml: (domainId: string, fqid: string | null) => void;
    onCopy: (text: string, label?: string) => void;
}) {
    const piiHit = index.pii.hits.find(
        (h) => h.key === `${entity.fqid}#${attribute.id}`,
    );
    const issues = index.lint.lintReport.issues.filter(
        (i) =>
            i.entityFqid?.toLowerCase() === entity.fqid.toLowerCase() &&
            i.attributeId === attribute.id,
    );

    return (
        <div className="glossary-detail__body">
            <div className="glossary-detail__title">{attribute.id}</div>
            {attribute.name && attribute.name !== attribute.id && (
                <div className="glossary-detail__subtitle">
                    {attribute.name}
                </div>
            )}

            <div className="glossary-detail__metrics">
                <Metric label="Views" value={attribute.usedInViews} />
                <Metric label="Rules" value={attribute.usedInRules} />
                <Metric
                    label="PII"
                    value={piiHit ? 1 : 0}
                    tone={piiHit ? "warn" : "neutral"}
                />
                <Metric
                    label="Issues"
                    value={issues.length}
                    tone={issues.length > 0 ? "err" : "neutral"}
                />
            </div>

            {attribute.description && (
                <div className="glossary-detail__desc">
                    {attribute.description}
                </div>
            )}

            <Row label="Сущность">
                <button
                    className="glossary-detail__link"
                    onClick={() => onOpenEntity(entity.fqid)}
                >
                    <MIcon name="data_object" size="sm" />
                    {entity.entityId}
                </button>
            </Row>

            <Row label="Домен">
                <button
                    className="glossary-detail__link"
                    onClick={() => onOpenDomainSchema(entity.domainId)}
                >
                    <MIcon name="folder" size="sm" />
                    {entity.domainId}
                </button>
            </Row>

            <Row label="Тип">
                <code className="glossary-detail__chip">{attribute.dataType}</code>
            </Row>

            {attribute.referenceEntity && (
                <Row label="Ссылается">
                    <button
                        className="glossary-detail__link"
                        onClick={() => onOpenEntity(attribute.referenceEntity!)}
                    >
                        <MIcon name="link" size="sm" />
                        {attribute.referenceEntity.split("/")[1]}
                    </button>
                </Row>
            )}

            {attribute.constraints.length > 0 && (
                <Row label="Ограничения">
                    <div className="glossary-detail__chips">
                        {attribute.constraints.map((c) => (
                            <span
                                key={c}
                                className="glossary-detail__chip glossary-detail__chip--constraint"
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                </Row>
            )}

            {attribute.readonly && (
                <Row label="Readonly">
                    <span className="glossary-detail__badge glossary-detail__badge--warn">
                        🔒 только для чтения
                    </span>
                </Row>
            )}

            {piiHit && (
                <Row label="PII">
                    <span
                        className={
                            "glossary-detail__badge " +
                            (piiHit.severity === "critical"
                                ? "glossary-detail__badge--err"
                                : "glossary-detail__badge--warn")
                        }
                    >
                        <MIcon name="shield_lock" size="sm" />
                        {piiHit.category} · {piiHit.severity}
                    </span>
                </Row>
            )}

            {issues.length > 0 && (
                <div className="glossary-detail__section">
                    <div className="glossary-detail__section-title">
                        Lint issues ({issues.length})
                    </div>
                    <div className="glossary-detail__issues">
                        {issues.slice(0, 5).map((i, idx) => (
                            <div
                                key={idx}
                                className={
                                    "glossary-detail__issue glossary-detail__issue--" +
                                    i.severity
                                }
                            >
                                <code>{i.ruleId}</code>
                                <span>{i.message}</span>
                            </div>
                        ))}
                        {issues.length > 5 && (
                            <div className="glossary-detail__more">
                                …и ещё {issues.length - 5}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="glossary-detail__actions">
                <button
                    className="btn btn--primary btn--small"
                    onClick={() => onOpenEntity(entity.fqid)}
                >
                    <MIcon name="data_object" size="sm" />
                    К сущности
                </button>
                <button
                    className="btn btn--small"
                    onClick={() => onOpenYaml(entity.domainId, entity.fqid)}
                >
                    <MIcon name="description" size="sm" />
                    YAML
                </button>
                <button
                    className="btn btn--icon btn--small"
                    onClick={() =>
                        onCopy(`${entity.fqid}#${attribute.id}`, "FQID скопирован")
                    }
                    title="Копировать FQID атрибута"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>
        </div>
    );
}

// ============ DataTypeDetail ============

function DataTypeDetail({
    dataType,
    index,
    onOpenDomainSchema,
    onOpenDataTypeInSchema,
    onCopy,
}: {
    dataType: DataTypeRecord;
    index: ModelIndex;
    onOpenDomainSchema: (domainId: string) => void;
    onOpenDataTypeInSchema: (domainId: string, dtId: string) => void;
    onCopy: (text: string, label?: string) => void;
}) {
    const usages = index.entities.reduce((sum, e) => {
        return (
            sum +
            e.attributes.filter(
                (a) => a.dataType === dataType.id && e.domainId === dataType.domainId,
            ).length
        );
    }, 0);

    return (
        <div className="glossary-detail__body">
            <div className="glossary-detail__title">{dataType.id}</div>
            {dataType.name && dataType.name !== dataType.id && (
                <div className="glossary-detail__subtitle">{dataType.name}</div>
            )}

            <div className="glossary-detail__metrics">
                <Metric label="Использований" value={usages} />
                {dataType.valuesCount != null && (
                    <Metric label="Значений" value={dataType.valuesCount} />
                )}
                {dataType.statusesCount != null && (
                    <Metric label="Статусов" value={dataType.statusesCount} />
                )}
                {dataType.attributesCount != null && (
                    <Metric label="Колонок" value={dataType.attributesCount} />
                )}
            </div>

            {dataType.description && (
                <div className="glossary-detail__desc">{dataType.description}</div>
            )}

            <Row label="Тип">
                <span
                    className={
                        "glossary-detail__chip glossary-detail__chip--kind-" +
                        dataType.kind.toLowerCase()
                    }
                >
                    {dataType.kind}
                </span>
            </Row>

            <Row label="Домен">
                <button
                    className="glossary-detail__link"
                    onClick={() => onOpenDomainSchema(dataType.domainId)}
                >
                    <MIcon name="folder" size="sm" />
                    {dataType.domainId}
                </button>
            </Row>

            {dataType.values && dataType.values.length > 0 && (
                <div className="glossary-detail__section">
                    <div className="glossary-detail__section-title">
                        Значения ({dataType.values.length})
                    </div>
                    <div className="glossary-detail__chips">
                        {dataType.values.map((v) => (
                            <code key={v} className="glossary-detail__chip">
                                {v}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {dataType.statuses && dataType.statuses.length > 0 && (
                <div className="glossary-detail__section">
                    <div className="glossary-detail__section-title">
                        Статусы ({dataType.statuses.length})
                    </div>
                    <div className="glossary-detail__chips">
                        {dataType.statuses.map((s) => (
                            <code
                                key={s}
                                className={
                                    "glossary-detail__chip glossary-detail__chip--workflow" +
                                    (dataType.initial === s ? " glossary-detail__chip--initial" : "")
                                }
                            >
                                {s}
                                {dataType.initial === s && " ●"}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {dataType.columns && dataType.columns.length > 0 && (
                <div className="glossary-detail__section">
                    <div className="glossary-detail__section-title">
                        Колонки ({dataType.columns.length})
                    </div>
                    <div className="glossary-detail__chips">
                        {dataType.columns.map((c) => (
                            <code key={c} className="glossary-detail__chip">
                                {c}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            <div className="glossary-detail__actions">
                <button
                    className="btn btn--primary btn--small"
                    onClick={() =>
                        onOpenDataTypeInSchema(dataType.domainId, dataType.id)
                    }
                >
                    <MIcon name="menu_book" size="sm" />
                    В схеме
                </button>
                <button
                    className="btn btn--icon btn--small"
                    onClick={() =>
                        onCopy(`${dataType.domainId}#${dataType.id}`, "ID скопирован")
                    }
                    title="Копировать ID типа"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>
        </div>
    );
}

// ============ Metric ============

function Metric({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: number;
    tone?: "neutral" | "warn" | "err";
}) {
    return (
        <div className={"glossary-detail__metric glossary-detail__metric--" + tone}>
            <div className="glossary-detail__metric-value">{value}</div>
            <div className="glossary-detail__metric-label">{label}</div>
        </div>
    );
}

// ============ Row ============

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="glossary-detail__row">
            <span className="glossary-detail__row-label">{label}</span>
            <div className="glossary-detail__row-value">{children}</div>
        </div>
    );
}