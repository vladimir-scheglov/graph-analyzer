import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useYamlFulltextSearch } from "../../hooks/useYamlFulltextSearch";
import { MIcon } from "../common/MIcon";
import { openFileInEditor } from "../../lib/open-file";
import { useModelIndex } from "../../hooks/useModelIndex";
import { DomainCombobox } from "../common/DomainCombobox";
import { alertDialog } from "../../lib/dialogs";
import type { YamlSearchHit } from "../../../server/routes/yaml-search";

// ============ Constants ============

const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;
const HISTORY_KEY = "dg-yaml-fulltext-history";
const HISTORY_MAX = 12;

type FieldFilter =
    | "any"
    | "id"
    | "name"
    | "description"
    | "label"
    | "condition"
    | "type"
    | "comment";

const FIELD_LABELS: Array<{ id: FieldFilter; label: string; icon: string }> = [
    { id: "any", label: "Везде", icon: "search" },
    { id: "id", label: "id", icon: "fingerprint" },
    { id: "name", label: "name", icon: "label" },
    { id: "description", label: "description", icon: "article" },
    { id: "label", label: "label", icon: "tag" },
    { id: "condition", label: "condition", icon: "rule" },
    { id: "type", label: "type / dataType", icon: "data_object" },
    { id: "comment", label: "Комментарии", icon: "comment" },
];

type GroupMode = "none" | "file" | "domain";

// ============ Helpers ============

function escapeCsv(v: any): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(content: string, filename: string, mime: string) {
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

function basename(filePath: string): string {
    return filePath.split(/[\\/]/).pop() || filePath;
}

/**
 * Определяет YAML-поле, к которому относится матч.
 * Best-effort: ищет `word:` перед позицией match в пределах одной строки.
 * Для block-скаляров (description: |) не работает — но и не мешает.
 */
function detectField(hit: YamlSearchHit): string | null {
    if (hit.inComment) return "comment";
    const col = Math.max(1, hit.column || 1);
    const before = hit.lineText.slice(0, col - 1);
    const m = before.match(/(?:^|[\s-])([a-zA-Z_][\w]*)\s*:\s*$/);
    return m ? m[1].toLowerCase() : null;
}

function hitMatchesField(hit: YamlSearchHit, field: FieldFilter): boolean {
    if (field === "any") return true;
    if (field === "comment") return hit.inComment;
    if (hit.inComment) return false;

    const detected = detectField(hit);
    if (!detected) return false;

    if (field === "condition") {
        return detected === "condition" || detected === "constraint";
    }
    if (field === "type") {
        return detected === "type" || detected === "datatype";
    }
    if (field === "description") {
        return detected === "description";
    }
    return detected === field;
}

interface GroupedResult {
    key: string;
    label: string;
    sublabel?: string | null;
    domainId?: string | null;
    filePath?: string | null;
    hits: YamlSearchHit[];
}

function loadHistory(): string[] {
    try {
        const raw = sessionStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function saveHistory(items: string[]) {
    try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
    } catch { /* ignore */ }
}

// ============ Main ============

export function YamlFulltextSearchModal() {
    const open = useGraphStore((s) => s.yamlFulltextSearchOpen);
    const setOpen = useGraphStore((s) => s.setYamlFulltextSearchOpen);

    const [query, setQuery] = useState("");
    const [regex, setRegex] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [includeComments, setIncludeComments] = useState(true);
    const [domainFilter, setDomainFilter] = useState("");
    const [fieldFilter, setFieldFilter] = useState<FieldFilter>("any");
    const [searchInResults, setSearchInResults] = useState("");
    const [groupMode, setGroupMode] = useState<GroupMode>("file");
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [activeIdx, setActiveIdx] = useState(-1);
    const [history, setHistory] = useState<string[]>(loadHistory);
    const [pendingSearch, setPendingSearch] = useState(false);

    const deferredSearchInResults = useDeferredValue(searchInResults);

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const { hits, loading, error, total, truncated, elapsedMs, search } =
        useYamlFulltextSearch();

    const { index } = useModelIndex();

    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        index.domains.forEach((d) => {
            if (!map.has(d.id)) map.set(d.id, 0);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // ── Open / focus ──
    useEffect(() => {
        if (!open) {
            setQuery("");
            setSearchInResults("");
            setActiveIdx(-1);
            setCollapsedGroups(new Set());
            return;
        }
        const t = setTimeout(() => inputRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        setHistory(loadHistory());
    }, [open]);

    // ── Close on Escape ──
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !query) {
                e.preventDefault();
                setOpen(false);
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, setOpen, query]);

    // ── Effective query: wrap wholeWord into regex ──
    const effectiveQuery = useMemo(() => {
        const q = query.trim();
        if (!q) return "";
        if (regex || !wholeWord) return q;
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return `\\b${escaped}\\b`;
    }, [query, regex, wholeWord]);
    const effectiveRegex = regex || wholeWord;

    // ── Search with debounce ──
    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < MIN_QUERY) {
            setPendingSearch(false);
            return;
        }
        setPendingSearch(true);
        const t = setTimeout(() => {
            void search(effectiveQuery, {
                regex: effectiveRegex,
                caseSensitive,
                includeComments,
                domain: domainFilter,
            });
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [
        effectiveQuery,
        effectiveRegex,
        caseSensitive,
        includeComments,
        domainFilter,
        open,
        search,
        query,
    ]);

    // ── Track loading completion ──
    useEffect(() => {
        if (!loading) {
            const id = setTimeout(() => setPendingSearch(false), 50);
            return () => clearTimeout(id);
        }
        return () => {};
    }, [loading, effectiveQuery]);

    const isSearching = pendingSearch || loading;

    // ── Record query in history ──
    const recordQuery = useCallback(
        (q: string) => {
            const t = q.trim();
            if (t.length < MIN_QUERY) return;
            setHistory((prev) => {
                const next = [t, ...prev.filter((x) => x !== t)].slice(0, HISTORY_MAX);
                saveHistory(next);
                return next;
            });
        },
        [],
    );

    // ── Filter: field + search-in-results ──
    const filteredHits = useMemo(() => {
        let result = hits;
        if (fieldFilter !== "any") {
            result = result.filter((h) => hitMatchesField(h, fieldFilter));
        }
        const q = deferredSearchInResults.trim().toLowerCase();
        if (q) {
            result = result.filter(
                (h) =>
                    h.lineText.toLowerCase().includes(q) ||
                    h.filePath.toLowerCase().includes(q),
            );
        }
        return result;
    }, [hits, fieldFilter, deferredSearchInResults]);

    // ── Grouping ──
    const grouped = useMemo<GroupedResult[]>(() => {
        if (filteredHits.length === 0) return [];

        if (groupMode === "none") {
            const sorted = [...filteredHits].sort(
                (a, b) =>
                    a.filePath.localeCompare(b.filePath) || a.line - b.line,
            );
            return [
                {
                    key: "__all__",
                    label: `Все совпадения (${sorted.length})`,
                    domainId: null,
                    filePath: null,
                    hits: sorted,
                },
            ];
        }

        const map = new Map<string, YamlSearchHit[]>();
        for (const h of filteredHits) {
            const key = groupMode === "file" ? h.filePath : h.domainId || "(без домена)";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(h);
        }

        return Array.from(map.entries())
            .map(([key, groupHits]) => {
                const sorted = [...groupHits].sort(
                    (a, b) =>
                        a.filePath.localeCompare(b.filePath) || a.line - b.line,
                );
                if (groupMode === "file") {
                    return {
                        key,
                        label: basename(key),
                        sublabel: sorted[0]?.domainId,
                        domainId: sorted[0]?.domainId || null,
                        filePath: key,
                        hits: sorted,
                    };
                }
                return {
                    key,
                    label: key,
                    sublabel: `${new Set(sorted.map((h) => h.filePath)).size} файл(ов)`,
                    domainId: key === "(без домена)" ? null : key,
                    filePath: null,
                    hits: sorted,
                };
            })
            .sort((a, b) => b.hits.length - a.hits.length);
    }, [filteredHits, groupMode]);

    // ── Default collapse large groups ──
    useEffect(() => {
        if (hits.length === 0) {
            setCollapsedGroups(new Set());
            return;
        }
        const tooBig = new Set(
            grouped.filter((g) => g.hits.length > 30).map((g) => g.key),
        );
        setCollapsedGroups(tooBig);
        setActiveIdx(-1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hits]);

    // ── Flat list for keyboard nav ──
    const navHits = useMemo<Array<{ hit: YamlSearchHit; groupKey: string }>>(() => {
        const out: Array<{ hit: YamlSearchHit; groupKey: string }> = [];
        for (const group of grouped) {
            if (collapsedGroups.has(group.key)) continue;
            for (const hit of group.hits) {
                out.push({ hit, groupKey: group.key });
            }
        }
        return out;
    }, [grouped, collapsedGroups]);

    // ── Clamp activeIdx ──
    useEffect(() => {
        if (activeIdx >= navHits.length) {
            setActiveIdx(navHits.length - 1);
        }
    }, [navHits.length, activeIdx]);

    // ── Auto-expand group of active hit ──
    useEffect(() => {
        if (activeIdx < 0 || activeIdx >= navHits.length) return;
        const active = navHits[activeIdx];
        if (collapsedGroups.has(active.groupKey)) {
            setCollapsedGroups((prev) => {
                const next = new Set(prev);
                next.delete(active.groupKey);
                return next;
            });
        }
    }, [activeIdx, navHits, collapsedGroups]);

    // ── Auto-scroll active hit ──
    useEffect(() => {
        if (activeIdx < 0 || !listRef.current) return;
        const active = navHits[activeIdx];
        if (!active) return;
        const id = `hit-${active.hit.filePath}-${active.hit.line}-${active.hit.column}`;
        const el = listRef.current.querySelector(
            `[data-hit-id="${CSS.escape(id)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx, navHits]);

    // ── Actions ──
    const openHit = useCallback(
        (hit: YamlSearchHit) => {
            recordQuery(query);
            const st = useGraphStore.getState();
            st.setYamlViewerPendingGoto({
                kind: "line",
                line: hit.line,
                column: hit.column,
            });
            st.setYamlViewerFilePath(hit.filePath);
            st.setYamlViewerFqid(null);
            st.setYamlViewerDomainId(hit.domainId);
            st.setYamlViewerOpen(true);
            setOpen(false);
        },
        [query, recordQuery, setOpen],
    );

    const openInBackground = useCallback(
        (hit: YamlSearchHit) => {
            recordQuery(query);
            const st = useGraphStore.getState();
            st.addEditorTab(hit.filePath);
            st.showSnackbar(
                `Добавлено в фоновые табы: ${basename(hit.filePath)}:${hit.line}`,
            );
        },
        [query, recordQuery],
    );

    const copyHitLocation = useCallback(async (hit: YamlSearchHit) => {
        try {
            await navigator.clipboard.writeText(
                `${hit.filePath}:${hit.line}:${hit.column}`,
            );
            useGraphStore.getState().showSnackbar("Путь скопирован");
        } catch {
            await alertDialog("Не удалось скопировать");
        }
    }, []);

    const copyHitText = useCallback(async (hit: YamlSearchHit) => {
        try {
            const text = hit.lineText.slice(
                hit.column - 1,
                hit.column - 1 + hit.length,
            );
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(`Скопировано: «${text}»`);
        } catch {
            await alertDialog("Не удалось скопировать");
        }
    }, []);

    const applyHistory = useCallback((q: string) => {
        setQuery(q);
        inputRef.current?.focus();
    }, []);

    const clearHistory = useCallback(() => {
        saveHistory([]);
        setHistory([]);
    }, []);

    // ── Keyboard ──
    const onKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (navHits.length === 0) return;
                setActiveIdx((i) => Math.min(i + 1, navHits.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (navHits.length === 0) return;
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (navHits.length === 0) {
                    recordQuery(query);
                    return;
                }
                const idx = activeIdx >= 0 ? activeIdx : 0;
                const hit = navHits[idx]?.hit;
                if (!hit) return;
                if (e.shiftKey) {
                    openInBackground(hit);
                } else {
                    openHit(hit);
                }
            } else if (e.key === "Escape") {
                if (query) {
                    e.preventDefault();
                    setQuery("");
                } else {
                    e.preventDefault();
                    setOpen(false);
                }
            }
        },
        [
            navHits,
            activeIdx,
            query,
            recordQuery,
            openHit,
            openInBackground,
            setOpen,
        ],
    );

    // ── Groups: expand/collapse ──
    const toggleGroup = useCallback((key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        setCollapsedGroups(new Set());
    }, []);

    const collapseAll = useCallback(() => {
        setCollapsedGroups(new Set(grouped.map((g) => g.key)));
    }, [grouped]);

    // ── Exports ──
    const exportJSON = () => {
        const data = {
            generatedAt: new Date().toISOString(),
            query,
            options: {
                regex,
                wholeWord,
                caseSensitive,
                includeComments,
                domain: domainFilter || null,
                field: fieldFilter,
            },
            stats: {
                total,
                visible: filteredHits.length,
                files: new Set(filteredHits.map((h) => h.filePath)).size,
                domains: new Set(filteredHits.map((h) => h.domainId)).size,
                elapsedMs,
                truncated,
            },
            hits: filteredHits.map((h) => ({
                filePath: h.filePath,
                domainId: h.domainId,
                line: h.line,
                column: h.column,
                length: h.length,
                lineText: h.lineText,
                field: detectField(h),
                inComment: h.inComment,
            })),
        };
        downloadFile(
            JSON.stringify(data, null, 2),
            `yaml-search-${stamp()}.json`,
            "application/json",
        );
    };

    const exportCSV = () => {
        const header = [
            "filePath",
            "domainId",
            "line",
            "column",
            "length",
            "field",
            "inComment",
            "lineText",
        ];
        const lines = [header.join(",")];
        for (const h of filteredHits) {
            lines.push(
                [
                    h.filePath,
                    h.domainId,
                    h.line,
                    h.column,
                    h.length,
                    detectField(h) ?? "",
                    h.inComment ? "true" : "false",
                    h.lineText.trim(),
                ]
                    .map(escapeCsv)
                    .join(","),
            );
        }
        downloadFile(
            "\uFEFF" + lines.join("\n"),
            `yaml-search-${stamp()}.csv`,
            "text/csv;charset=utf-8",
        );
    };

    const exportMD = () => {
        const lines: string[] = [];
        lines.push(`# Поиск по YAML: \`${query}\``);
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");
        lines.push("## Параметры");
        lines.push("");
        lines.push("| Параметр | Значение |");
        lines.push("| --- | --- |");
        lines.push(`| Запрос | \`${query}\` |`);
        lines.push(`| Regex | ${regex ? "да" : "нет"} |`);
        lines.push(`| Whole word | ${wholeWord ? "да" : "нет"} |`);
        lines.push(`| Case sensitive | ${caseSensitive ? "да" : "нет"} |`);
        lines.push(`| Комментарии | ${includeComments ? "включены" : "выключены"} |`);
        lines.push(`| Домен | ${domainFilter || "все"} |`);
        lines.push(`| Поле | ${fieldFilter} |`);
        lines.push("");
        lines.push("## Сводка");
        lines.push("");
        lines.push("| Метрика | Значение |");
        lines.push("| --- | ---: |");
        lines.push(`| Всего совпадений | ${total} |`);
        lines.push(`| Видимых (после фильтров) | ${filteredHits.length} |`);
        lines.push(
            `| Уникальных файлов | ${new Set(filteredHits.map((h) => h.filePath)).size} |`,
        );
        lines.push(
            `| Уникальных доменов | ${new Set(filteredHits.map((h) => h.domainId)).size} |`,
        );
        lines.push(`| Время поиска | ${elapsedMs} мс |`);
        lines.push("");

        const byFile = new Map<string, YamlSearchHit[]>();
        filteredHits.forEach((h) => {
            if (!byFile.has(h.filePath)) byFile.set(h.filePath, []);
            byFile.get(h.filePath)!.push(h);
        });

        for (const [filePath, fileHits] of byFile) {
            lines.push(`### \`${basename(filePath)}\` (${fileHits.length})`);
            lines.push("");
            lines.push(`\`${filePath}\``);
            lines.push("");
            for (const h of fileHits.slice(0, 200)) {
                const field = detectField(h);
                const prefix = field ? `**${field}:** ` : "";
                lines.push(`- \`${h.line}:${h.column}\` ${prefix}\`${h.lineText.trim()}\``);
            }
            if (fileHits.length > 200) {
                lines.push(`- …и ещё ${fileHits.length - 200}`);
            }
            lines.push("");
        }

        downloadFile(
            lines.join("\n"),
            `yaml-search-${stamp()}.md`,
            "text/markdown;charset=utf-8",
        );
    };

    // ── Stats ──
    const stats = useMemo(() => {
        const files = new Set(filteredHits.map((h) => h.filePath)).size;
        const domains = new Set(filteredHits.map((h) => h.domainId)).size;
        return { files, domains };
    }, [filteredHits]);

    if (!open) return null;

    const hasQuery = query.trim().length >= MIN_QUERY;
    const showEmpty = hasQuery && !isSearching && !error && filteredHits.length === 0;
    const showTooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY;
    const showHistory = !query && history.length > 0;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 500 }}
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal yaml-fulltext-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="search" size="sm" />
                        <span className="icon-label">Полнотекстовый поиск по YAML</span>
                        {hits.length > 0 && (
                            <span className="help-modal__badge">{total}</span>
                        )}
                        {fieldFilter !== "any" && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "var(--accent-soft)",
                                    color: "var(--accent-hover)",
                                }}
                                title={`Фильтр по полю: ${fieldFilter}`}
                            >
                                {fieldFilter}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        {filteredHits.length > 0 && (
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

                <div className="yaml-fulltext-search">
                    {/* ── Input row ── */}
                    <div className="yaml-fulltext-search__input">
                        <MIcon
                            name={isSearching ? "hourglass_top" : "search"}
                            size="sm"
                            style={{
                                color: isSearching
                                    ? "var(--accent-hover)"
                                    : undefined,
                            }}
                        />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Поиск по всем схемам (description, RQL, id, комментарии…)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKeyDown}
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {isSearching && (
                            <span className="yaml-fulltext-search__spinner" />
                        )}
                        {query && (
                            <button
                                className="yaml-fulltext-search__clear"
                                onClick={() => setQuery("")}
                                title="Очистить (Esc)"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* ── History ── */}
                    {showHistory && (
                        <div className="yaml-fulltext-history">
                            <span className="yaml-fulltext-history__label">
                                Недавние:
                            </span>
                            {history.map((h) => (
                                <button
                                    key={h}
                                    className="yaml-fulltext-history__item"
                                    onClick={() => applyHistory(h)}
                                    title={`Запустить: ${h}`}
                                >
                                    <MIcon name="history" size="sm" />
                                    <span>{h}</span>
                                </button>
                            ))}
                            <button
                                className="yaml-fulltext-history__clear"
                                onClick={clearHistory}
                                title="Очистить историю"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* ── Toggles ── */}
                    <div className="yaml-fulltext-search__toggles">
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (regex ? " active" : "")}
                            onClick={() => setRegex(!regex)}
                            title="Регулярное выражение"
                        >
                            .*
                        </button>
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (caseSensitive ? " active" : "")}
                            onClick={() => setCaseSensitive(!caseSensitive)}
                            title="Учитывать регистр"
                        >
                            Aa
                        </button>
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (wholeWord ? " active" : "")}
                            onClick={() => setWholeWord(!wholeWord)}
                            disabled={regex}
                            title="Только целые слова (в regex используйте \b в самом выражении)"
                        >
                            \b
                        </button>
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (includeComments ? " active" : "")}
                            onClick={() => setIncludeComments(!includeComments)}
                            title="Искать в комментариях"
                        >
                            #
                        </button>
                        <div className="yaml-fulltext-search__domain">
                            <DomainCombobox
                                value={domainFilter}
                                onChange={setDomainFilter}
                                domains={allDomains}
                                placeholder="Все домены"
                                allowEmpty
                                emptyLabel="Все домены"
                            />
                        </div>
                        {hits.length > 0 && (
                            <button
                                className="btn"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(
                                            filteredHits.map((h) => h.lineText.trim()).join("\n"),
                                        );
                                        useGraphStore
                                            .getState()
                                            .showSnackbar(`Скопировано: ${filteredHits.length}`);
                                    } catch { /* ignore */ }
                                }}
                                title="Копировать все видимые строки"
                            >
                                <MIcon name="content_copy" size="sm" />
                                <span>Строки ({filteredHits.length})</span>
                            </button>
                        )}
                    </div>

                    {/* ── Field chips ── */}
                    <div className="yaml-fulltext-fields">
                        {FIELD_LABELS.map((f) => {
                            const active = fieldFilter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={
                                        "yaml-fulltext-field-chip" +
                                        (active ? " active" : "") +
                                        (f.id === "comment" && !includeComments
                                            ? " disabled"
                                            : "")
                                    }
                                    onClick={() => {
                                        setFieldFilter(active ? "any" : f.id);
                                        if (f.id === "comment") setIncludeComments(true);
                                    }}
                                    title={
                                        f.id === "any"
                                            ? "Искать во всех полях"
                                            : `Только в поле «${f.id}»`
                                    }
                                >
                                    <MIcon name={f.icon} size="sm" />
                                    <span>{f.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Stats bar ── */}
                    {hasQuery && !showEmpty && (
                        <div className="yaml-fulltext-stats">
                            {isSearching && hits.length === 0 && (
                                <span className="yaml-fulltext-stats__item">
                                    <span className="yaml-fulltext-search__spinner yaml-fulltext-search__spinner--inline" />
                                    Поиск…
                                </span>
                            )}
                            {hits.length > 0 && (
                                <>
                                    <span className="yaml-fulltext-stats__item">
                                        <strong>{filteredHits.length}</strong>
                                        {fieldFilter !== "any" ||
                                            deferredSearchInResults.trim()
                                            ? ` / ${total}`
                                            : ""}{" "}
                                        совпадений
                                    </span>
                                    <span className="yaml-fulltext-stats__item">
                                        <MIcon name="description" size="sm" />
                                        {stats.files} файл(ов)
                                    </span>
                                    <span className="yaml-fulltext-stats__item">
                                        <MIcon name="folder" size="sm" />
                                        {stats.domains} домен(ов)
                                    </span>
                                    <span className="yaml-fulltext-stats__item">
                                        <MIcon name="schedule" size="sm" />
                                        {elapsedMs} мс
                                    </span>
                                    {truncated && (
                                        <span
                                            className="yaml-fulltext-stats__item yaml-fulltext-stats__item--warn"
                                            title="Backend вернул только первые N хитов. Уточните запрос."
                                        >
                                            ⚠ показаны первые {hits.length}
                                        </span>
                                    )}
                                </>
                            )}
                            {error && (
                                <span className="yaml-fulltext-stats__item yaml-fulltext-stats__item--err">
                                    <MIcon name="error" size="sm" />
                                    {error}
                                </span>
                            )}
                        </div>
                    )}

                    {/* ── Toolbar ── */}
                    {hits.length > 0 && (
                        <div className="yaml-fulltext-toolbar">
                            <div className="yaml-fulltext-toolbar__search">
                                <MIcon name="filter_alt" size="sm" />
                                <input
                                    type="text"
                                    placeholder="Уточнить в найденном…"
                                    value={searchInResults}
                                    onChange={(e) => setSearchInResults(e.target.value)}
                                    spellCheck={false}
                                />
                                {searchInResults && (
                                    <button
                                        onClick={() => setSearchInResults("")}
                                        className="yaml-fulltext-toolbar__clear"
                                        title="Очистить"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <label className="yaml-fulltext-toolbar__select">
                                <span>Группировка:</span>
                                <select
                                    value={groupMode}
                                    onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                                >
                                    <option value="none">Плоский список</option>
                                    <option value="file">По файлу</option>
                                    <option value="domain">По домену</option>
                                </select>
                            </label>
                            <div className="yaml-fulltext-toolbar__actions">
                                <button
                                    className="btn btn--icon btn--small"
                                    onClick={expandAll}
                                    title="Развернуть все группы"
                                    disabled={collapsedGroups.size === 0}
                                >
                                    <MIcon name="unfold_more" size="sm" />
                                </button>
                                <button
                                    className="btn btn--icon btn--small"
                                    onClick={collapseAll}
                                    title="Свернуть все группы"
                                    disabled={collapsedGroups.size === grouped.length}
                                >
                                    <MIcon name="unfold_less" size="sm" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Content ── */}
                    <div className="yaml-fulltext-search__results" ref={listRef}>
                        {showTooShort && (
                            <div className="yaml-fulltext-empty">
                                <MIcon name="keyboard" size="lg" />
                                <div className="yaml-fulltext-empty__title">
                                    Введите минимум {MIN_QUERY} символа
                                </div>
                                <div className="yaml-fulltext-empty__hint">
                                    Поиск запускается автоматически через {DEBOUNCE_MS} мс после
                                    последнего нажатия.
                                </div>
                            </div>
                        )}

                        {showEmpty && (
                            <div className="yaml-fulltext-empty">
                                <MIcon name="search_off" size="lg" />
                                <div className="yaml-fulltext-empty__title">
                                    Ничего не найдено по запросу «{query}»
                                </div>
                                <div className="yaml-fulltext-empty__tips">
                                    <div className="yaml-fulltext-empty__tips-title">
                                        Попробуйте:
                                    </div>
                                    <ul>
                                        <li>
                                            Отключить <strong>whole word</strong> — вдруг ищете
                                            часть слова
                                        </li>
                                        <li>
                                            Включить <strong>Aa</strong> или выключить — регистр
                                        </li>
                                        {!includeComments && (
                                            <li>
                                                Включить <strong>#</strong> — вдруг это в
                                                комментариях
                                            </li>
                                        )}
                                        <li>
                                            Снять фильтр поля — сейчас ищется только в{" "}
                                            <code>{fieldFilter}</code>
                                        </li>
                                        <li>
                                            Снять фильтр домена — сейчас ищется только в{" "}
                                            <code>{domainFilter}</code>
                                        </li>
                                        <li>
                                            Попробовать <strong>regex</strong> для сложных
                                            запросов
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {!showEmpty &&
                            grouped.map((group) => {
                                const isCollapsed = collapsedGroups.has(group.key);
                                const showGroupHeader = groupMode !== "none";
                                return (
                                    <div
                                        key={group.key}
                                        className={
                                            "yaml-fulltext-group" +
                                            (isCollapsed ? " yaml-fulltext-group--collapsed" : "")
                                        }
                                    >
                                        {showGroupHeader && (
                                            <button
                                                className="yaml-fulltext-group__head"
                                                onClick={() => toggleGroup(group.key)}
                                                title={
                                                    isCollapsed
                                                        ? "Развернуть группу"
                                                        : "Свернуть группу"
                                                }
                                            >
                                                <span className="yaml-fulltext-group__chevron">
                                                    {isCollapsed ? "▸" : "▾"}
                                                </span>
                                                <MIcon
                                                    name={
                                                        groupMode === "domain"
                                                            ? "folder"
                                                            : "description"
                                                    }
                                                    size="sm"
                                                />
                                                <div className="yaml-fulltext-group__info">
                                                    <code className="yaml-fulltext-group__domain">
                                                        {group.label}
                                                    </code>
                                                    {group.sublabel && (
                                                        <span className="yaml-fulltext-group__sublabel">
                                                            {group.sublabel}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="yaml-fulltext-group__count">
                                                    {group.hits.length}
                                                </span>
                                            </button>
                                        )}
                                        {!isCollapsed && (
                                            <div className="yaml-fulltext-group__body">
                                                {group.hits.map((h, i) => {
                                                    const globalIdx = navHits.findIndex(
                                                        (nh) =>
                                                            nh.hit.filePath === h.filePath &&
                                                            nh.hit.line === h.line &&
                                                            nh.hit.column === h.column,
                                                    );
                                                    return (
                                                        <HitRow
                                                            key={`${h.filePath}:${h.line}:${h.column}:${i}`}
                                                            hit={h}
                                                            isActive={globalIdx === activeIdx}
                                                            onOpen={() => openHit(h)}
                                                            onHover={() =>
                                                                setActiveIdx(globalIdx)
                                                            }
                                                            onCopyLocation={() =>
                                                                copyHitLocation(h)
                                                            }
                                                            onCopyText={() => copyHitText(h)}
                                                            onOpenInBackground={() =>
                                                                openInBackground(h)
                                                            }
                                                        />
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="yaml-fulltext-footer">
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> навигация
                    </span>
                    <span>
                        <kbd>Enter</kbd> открыть
                    </span>
                    <span>
                        <kbd>Shift</kbd>+<kbd>Enter</kbd> в фон
                    </span>
                    <span>
                        <kbd>Esc</kbd> очистить / закрыть
                    </span>
                    <span className="yaml-fulltext-footer__active">
                        {activeIdx >= 0 && navHits[activeIdx] ? (
                            <>
                                <MIcon name="my_location" size="sm" />
                                <code>
                                    {basename(navHits[activeIdx].hit.filePath)}:
                                    {navHits[activeIdx].hit.line}
                                </code>
                            </>
                        ) : (
                            <span style={{ opacity: 0.5 }}>—</span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ============ Hit row ============

interface HitRowProps {
    hit: YamlSearchHit;
    isActive: boolean;
    onOpen: () => void;
    onHover: () => void;
    onCopyLocation: () => void;
    onCopyText: () => void;
    onOpenInBackground: () => void;
}

function HitRow({
    hit,
    isActive,
    onOpen,
    onHover,
    onCopyLocation,
    onCopyText,
    onOpenInBackground,
}: HitRowProps) {
    const field = detectField(hit);
    const matchText = hit.lineText.slice(
        hit.column - 1,
        hit.column - 1 + hit.length,
    );

    return (
        <div
            className={
                "yaml-fulltext-hit" + (isActive ? " yaml-fulltext-hit--active" : "")
            }
            onMouseEnter={onHover}
            onClick={onOpen}
            data-hit-id={`hit-${hit.filePath}-${hit.line}-${hit.column}`}
            title={`${hit.filePath}:${hit.line}:${hit.column}`}
        >
            <span className="yaml-fulltext-hit__line">:{hit.line}</span>
            {field && (
                <span
                    className={
                        "yaml-fulltext-hit__field" +
                        (hit.inComment ? " yaml-fulltext-hit__field--comment" : "")
                    }
                >
                    {field}:
                </span>
            )}
            <span className="yaml-fulltext-hit__context">
                <span className="yaml-fulltext-hit__plain">{hit.contextBefore}</span>
                <span
                    className={
                        "yaml-fulltext-hit__match" +
                        (hit.inComment ? " in-comment" : "")
                    }
                >
                    {matchText}
                </span>
                <span className="yaml-fulltext-hit__plain">{hit.contextAfter}</span>
            </span>
            {hit.inComment && (
                <span className="yaml-fulltext-hit__comment-badge">#</span>
            )}
            <div className="yaml-fulltext-hit__actions">
                <button
                    className="yaml-fulltext-hit__action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopyText();
                    }}
                    title="Копировать найденный текст"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
                <button
                    className="yaml-fulltext-hit__action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopyLocation();
                    }}
                    title="Копировать путь:строка:колонка"
                >
                    <MIcon name="link" size="sm" />
                </button>
                <button
                    className="yaml-fulltext-hit__action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenInBackground();
                    }}
                    title="Добавить в фоновые табы редактора"
                >
                    <MIcon name="add" size="sm" />
                </button>
            </div>
        </div>
    );
}