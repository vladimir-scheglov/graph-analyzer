import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { MIcon } from "../../common/MIcon";
import type { LineMap } from "../../../lib/yaml/line-map";
import {
    searchYaml,
    SearchOptions,
    SearchMatch,
    SearchResult,
    SearchSectionGroup,
} from "../../../lib/yaml/yaml-search";
import { useGraphStore } from "../../../state/useGraphStore";

const DEBOUNCE_MS = 250;
const MAX_MATCHES = 500;
const HISTORY_KEY = "dg-yaml-search-history";
const HISTORY_MAX = 8;

export interface YamlSearchPanelHandle {
    focusInput(): void;
}

export interface YamlSearchPanelProps {
    content: string;
    lineMap: LineMap | null;
    query: string;
    options: SearchOptions;
    onQueryChange: (q: string) => void;
    onOptionsChange: (o: SearchOptions) => void;
    onResultChange: (r: SearchResult | null) => void;
    onActiveMatchChange: (m: SearchMatch | null) => void;
    onEscape: () => void;
    onJump: (line: number) => void;
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

function saveQuery(q: string): void {
    const t = q.trim();
    if (!t) return;
    try {
        const list = loadHistory().filter((x) => x !== t);
        list.unshift(t);
        sessionStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(list.slice(0, HISTORY_MAX)),
        );
    } catch {
        /* ignore */
    }
}

export const YamlSearchPanel = forwardRef<
    YamlSearchPanelHandle,
    YamlSearchPanelProps
>(function YamlSearchPanel(props, ref) {
    const {
        content,
        lineMap,
        query,
        options,
        onQueryChange,
        onOptionsChange,
        onResultChange,
        onActiveMatchChange,
        onEscape,
        onJump,
    } = props;

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [result, setResult] = useState<SearchResult | null>(null);
    const [activeMatch, setActiveMatch] = useState<SearchMatch | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [sectionFilter, setSectionFilter] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>(loadHistory);

    useImperativeHandle(ref, () => ({
        focusInput: () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        },
    }), []);

    // Debounced search
    useEffect(() => {
        if (!query) {
            setResult(null);
            onResultChange(null);
            setActiveMatch(null);
            onActiveMatchChange(null);
            return;
        }
        const t = setTimeout(() => {
            const r = searchYaml(content, query, options, lineMap, MAX_MATCHES);
            setResult(r);
            onResultChange(r);
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        content, query, lineMap,
        options.useRegex, options.caseSensitive,
        options.wholeWord, options.includeComments,
    ]);

    // Если activeMatch «испарился» — очищаем
    useEffect(() => {
        if (!activeMatch || !result) return;
        const still = result.groups.some(g =>
            g.matches.some(
                m =>
                    m.line === activeMatch.line &&
                    m.column === activeMatch.column &&
                    m.length === activeMatch.length,
            ),
        );
        if (!still) {
            setActiveMatch(null);
            onActiveMatchChange(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    // Умное авто-раскрытие групп
    useEffect(() => {
        if (!result) {
            setExpanded(new Set());
            return;
        }
        if (
            result.groups.length <= 15 &&
            result.totalMatches <= 300
        ) {
            setExpanded(new Set(result.groups.map(g => g.sectionKey)));
        } else {
            setExpanded(
                new Set(result.groups.slice(0, 3).map(g => g.sectionKey)),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    // Сброс sectionFilter, если секция исчезла
    useEffect(() => {
        if (!sectionFilter || !result) return;
        const exists = result.groups.some(g => g.sectionKey === sectionFilter);
        if (!exists) setSectionFilter(null);
    }, [result, sectionFilter]);

    // Видимые группы (с учётом фильтра)
    const visibleGroups = useMemo(() => {
        if (!result) return [];
        if (!sectionFilter) return result.groups;
        return result.groups.filter(g => g.sectionKey === sectionFilter);
    }, [result, sectionFilter]);

    // Плоский список матчей — для навигации ▲▼
    const flatMatches = useMemo(() => {
        const out: SearchMatch[] = [];
        for (const g of visibleGroups) for (const m of g.matches) out.push(m);
        return out;
    }, [visibleGroups]);

    const activeIdx = useMemo(() => {
        if (!activeMatch) return -1;
        return flatMatches.findIndex(
            m =>
                m.line === activeMatch.line &&
                m.column === activeMatch.column &&
                m.length === activeMatch.length,
        );
    }, [flatMatches, activeMatch]);

    const selectMatch = useCallback(
        (m: SearchMatch) => {
            setActiveMatch(m);
            onActiveMatchChange(m);
            onJump(m.line);
            inputRef.current?.focus();
        },
        [onActiveMatchChange, onJump],
    );

    const stepMatch = useCallback(
        (delta: 1 | -1) => {
            if (flatMatches.length === 0) return;
            let idx = activeIdx;
            if (idx < 0) idx = delta > 0 ? -1 : 0;
            const next = (idx + delta + flatMatches.length) % flatMatches.length;
            selectMatch(flatMatches[next]);
        },
        [flatMatches, activeIdx, selectMatch],
    );

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            stepMatch(e.shiftKey ? -1 : 1);
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            if (query) onQueryChange("");
            else onEscape();
            return;
        }
        if (e.key === "ArrowDown" && flatMatches.length > 0 && !query.includes("\n")) {
            e.preventDefault();
            stepMatch(1);
        } else if (e.key === "ArrowUp" && flatMatches.length > 0 && !query.includes("\n")) {
            e.preventDefault();
            stepMatch(-1);
        }
    };

    const toggleSection = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const expandAll = () => {
        if (!result) return;
        setExpanded(new Set(result.groups.map(g => g.sectionKey)));
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    const copyAllMatches = async () => {
        if (flatMatches.length === 0) return;
        const text = flatMatches
            .map(m => `${m.line}:${m.column}\t${m.match}`)
            .join("\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(
                `Скопировано: ${flatMatches.length} совпадений`,
            );
        } catch {
            useGraphStore.getState().showSnackbar("Не удалось скопировать");
        }
    };

    const applyHistory = (q: string) => {
        onQueryChange(q);
        setHistory(loadHistory());
        inputRef.current?.focus();
    };

    const clearHistory = () => {
        try {
            sessionStorage.removeItem(HISTORY_KEY);
        } catch {
            /* ignore */
        }
        setHistory([]);
    };

    // Автовысота textarea
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }, [query]);

    // Секции с матчами — для чипов фильтра
    const sectionChips = useMemo(() => {
        if (!result) return [];
        return result.groups.map(g => ({
            key: g.sectionKey,
            label: g.sectionLabel,
            count: g.matches.length,
            total: g.totalInSection ?? g.matches.length,
        }));
    }, [result]);

    const activePosition =
        activeIdx >= 0
            ? `${activeIdx + 1} / ${flatMatches.length}`
            : flatMatches.length > 0
                ? `— / ${flatMatches.length}`
                : "0";

    return (
        <div className="yaml-search-panel">
            {/* ── Строка ввода ── */}
            <div className="yaml-search-input-wrap">
                <MIcon name="search" size="sm" />
                <textarea
                    ref={inputRef}
                    rows={1}
                    className={
                        "yaml-search-input" +
                        (query.includes("\n") ? " yaml-search-input--multiline" : "")
                    }
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Поиск по файлу (Ctrl+Enter — далее)"
                    spellCheck={false}
                    autoComplete="off"
                />
                {query && (
                    <button
                        type="button"
                        className="yaml-search-clear"
                        onClick={() => {
                            onQueryChange("");
                            inputRef.current?.focus();
                        }}
                        title="Очистить (Esc)"
                    >✕</button>
                )}
            </div>

            {/* ── Toggles ── */}
            <div className="yaml-search-toggles">
                <button
                    type="button"
                    className={"yaml-search-toggle" + (options.caseSensitive ? " active" : "")}
                    onClick={() => onOptionsChange({ ...options, caseSensitive: !options.caseSensitive })}
                    title="Учитывать регистр"
                >Aa</button>
                <button
                    type="button"
                    className={"yaml-search-toggle" + (options.useRegex ? " active" : "")}
                    onClick={() => onOptionsChange({ ...options, useRegex: !options.useRegex })}
                    title="Регулярное выражение"
                >.*</button>
                <button
                    type="button"
                    className={"yaml-search-toggle" + (options.wholeWord ? " active" : "")}
                    onClick={() => onOptionsChange({ ...options, wholeWord: !options.wholeWord })}
                    disabled={options.useRegex}
                    title="Только целые слова (в regex используйте \\b в самом выражении)"
                >\b</button>
                <button
                    type="button"
                    className={"yaml-search-toggle" + (options.includeComments ? " active" : "")}
                    onClick={() => onOptionsChange({ ...options, includeComments: !options.includeComments })}
                    title="Искать в комментариях"
                >#</button>
            </div>

            {/* ── Ошибка regex ── */}
            {result?.error && (
                <div className="yaml-search-error">
                    <MIcon name="warning" size="sm" />
                    <span>{result.error}</span>
                </div>
            )}

            {/* ── Шапка с навигацией и статистикой ── */}
            {!result?.error && result && result.totalMatches > 0 && (
                <div className="yaml-search-navbar">
                    <button
                        type="button"
                        className="yaml-search-nav-btn"
                        onClick={() => stepMatch(-1)}
                        disabled={flatMatches.length === 0}
                        title="Предыдущее (Ctrl+Shift+Enter)"
                    >
                        <MIcon name="expand_less" size="sm" />
                    </button>
                    <span className="yaml-search-nav-counter">
                        {activePosition}
                    </span>
                    <button
                        type="button"
                        className="yaml-search-nav-btn"
                        onClick={() => stepMatch(1)}
                        disabled={flatMatches.length === 0}
                        title="Следующее (Ctrl+Enter)"
                    >
                        <MIcon name="expand_more" size="sm" />
                    </button>

                    <span className="yaml-search-navbar__stat">
                        {result.truncated
                            ? `${result.totalMatches}+`
                            : result.totalMatches}
                        {" · "}
                        {result.groups.length}{" "}
                        {result.groups.length === 1 ? "секция" : "секций"}
                        {result.elapsedMs > 0 && (
                            <>
                                {" · "}
                                <span style={{ opacity: 0.6 }}>
                                    {result.elapsedMs} мс
                                </span>
                            </>
                        )}
                    </span>

                    <div className="yaml-search-navbar__actions">
                        <button
                            type="button"
                            className="yaml-search-nav-btn"
                            onClick={expandAll}
                            title="Развернуть всё"
                        >
                            <MIcon name="unfold_more" size="sm" />
                        </button>
                        <button
                            type="button"
                            className="yaml-search-nav-btn"
                            onClick={collapseAll}
                            title="Свернуть всё"
                        >
                            <MIcon name="unfold_less" size="sm" />
                        </button>
                        <button
                            type="button"
                            className="yaml-search-nav-btn"
                            onClick={copyAllMatches}
                            title="Копировать все результаты"
                        >
                            <MIcon name="content_copy" size="sm" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Чипы секций ── */}
            {!result?.error && result && sectionChips.length > 1 && (
                <div className="yaml-search-sections">
                    <button
                        type="button"
                        className={
                            "yaml-search-section-chip" +
                            (sectionFilter === null ? " active" : "")
                        }
                        onClick={() => setSectionFilter(null)}
                    >
                        Все
                        <span className="yaml-search-section-chip__count">
                            {result.totalMatches}
                        </span>
                    </button>
                    {sectionChips.map(c => (
                        <button
                            key={c.key}
                            type="button"
                            className={
                                "yaml-search-section-chip" +
                                (sectionFilter === c.key ? " active" : "")
                            }
                            onClick={() =>
                                setSectionFilter(
                                    sectionFilter === c.key ? null : c.key,
                                )
                            }
                            title={
                                c.total > c.count
                                    ? `${c.label}: ${c.count} показано из ${c.total}`
                                    : `${c.label}: ${c.count}`
                            }
                        >
                            {c.label}
                            <span className="yaml-search-section-chip__count">
                                {c.count}
                                {c.total > c.count && (
                                    <span style={{ opacity: 0.5 }}>
                                        /{c.total}
                                    </span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Ограничение ── */}
            {!result?.error && result?.truncated && (
                <div className="yaml-search-limit-banner">
                    Показаны первые {MAX_MATCHES} из {result.totalMatches}. Уточните запрос.
                </div>
            )}

            {/* ── Список групп ── */}
            {!result?.error && result && visibleGroups.length > 0 && (
                <div className="yaml-search-groups">
                    {visibleGroups.map(g => (
                        <SearchGroup
                            key={g.sectionKey}
                            group={g}
                            activeMatch={activeMatch}
                            expanded={expanded.has(g.sectionKey)}
                            onToggle={() => toggleSection(g.sectionKey)}
                            onSelect={selectMatch}
                        />
                    ))}
                </div>
            )}

            {!result?.error && result && result.groups.length === 0 && query && (
                <div className="yaml-search-empty">Ничего не найдено</div>
            )}

            {/* ── Пустое состояние: история + подсказки ── */}
            {!query && (
                <div className="yaml-search-hint">
                    {history.length > 0 && (
                        <>
                            <div className="yaml-search-history">
                                <span className="yaml-search-history__label">
                                    Недавние:
                                </span>
                                {history.map(h => (
                                    <button
                                        key={h}
                                        type="button"
                                        className="yaml-search-history__item"
                                        onClick={() => applyHistory(h)}
                                        title={`Запустить: ${h}`}
                                    >
                                        <MIcon name="history" size="sm" />
                                        <span>{h}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className="yaml-search-history__clear"
                                    onClick={clearHistory}
                                    title="Очистить историю"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="yaml-search-hint-divider" />
                        </>
                    )}
                    <div className="yaml-search-hint-row">
                        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> — следующий/предыдущий
                    </div>
                    <div className="yaml-search-hint-row">
                        <kbd>↑</kbd> / <kbd>↓</kbd> — то же
                    </div>
                    <div className="yaml-search-hint-row">
                        <kbd>Esc</kbd> — очистить или вернуть «Навигацию»
                    </div>
                    <div className="yaml-search-hint-row">
                        <kbd>Ctrl</kbd>+<kbd>F</kbd> — стандартный поиск Monaco
                    </div>
                </div>
            )}
        </div>
    );
});

// ============ SearchGroup ============

interface SearchGroupProps {
    group: SearchSectionGroup;
    activeMatch: SearchMatch | null;
    expanded: boolean;
    onToggle: () => void;
    onSelect: (m: SearchMatch) => void;
}

function SearchGroup({ group, activeMatch, expanded, onToggle, onSelect }: SearchGroupProps) {
    const totalInSection = group.totalInSection ?? group.matches.length;
    const showTotal = totalInSection > group.matches.length;

    return (
        <div className={"yaml-search-group" + (expanded ? " open" : "")}>
            <button type="button" className="yaml-search-group-head" onClick={onToggle}>
                <span className="yaml-search-group-chevron">{expanded ? "▾" : "▸"}</span>
                <span className="yaml-search-group-title">{group.sectionLabel}</span>
                <span className="yaml-search-group-count">
                    {group.matches.length}
                    {showTotal && (
                        <span style={{ opacity: 0.5 }}>/{totalInSection}</span>
                    )}
                </span>
            </button>
            {expanded && (
                <div className="yaml-search-group-body">
                    {group.matches.map((m, i) => {
                        const isActive =
                            activeMatch !== null &&
                            activeMatch.line === m.line &&
                            activeMatch.column === m.column &&
                            activeMatch.length === m.length;
                        const isMultiline = m.matchLineCount > 1;
                        return (
                            <button
                                key={`${m.line}:${m.column}:${i}`}
                                type="button"
                                className={"yaml-search-item" + (isActive ? " active" : "")}
                                onClick={() => onSelect(m)}
                                title={`${m.line}:${m.column}${isMultiline ? ` · ${m.matchLineCount} стр.` : ""}`}
                            >
                                <span className="yaml-search-item-line">
                                    :{m.line}
                                    {isMultiline && (
                                        <span
                                            className="yaml-search-item-multiline"
                                            title={`${m.matchLineCount} строк`}
                                        >
                                            ⏎{m.matchLineCount}
                                        </span>
                                    )}
                                </span>
                                <span className="yaml-search-item-context">
                                    {m.truncatedBefore && <span className="yaml-search-item-ellipsis">…</span>}
                                    <span className="yaml-search-item-plain">{m.before}</span>
                                    <span
                                        className={
                                            "yaml-search-item-match" +
                                            (m.inComment ? " in-comment" : "")
                                        }
                                        title={
                                            `${m.line}:${m.column}` +
                                            (m.matchLineCount > 1
                                                ? ` — ${m.matchLineCount} стр.`
                                                : "")
                                        }
                                    >
                                        {m.matchLineCount > 1 && m.match.length > 40
                                            ? m.match.slice(0, 40) + "…"
                                            : m.match}
                                    </span>
                                    <span className="yaml-search-item-plain">{m.after}</span>
                                    {m.truncatedAfter && <span className="yaml-search-item-ellipsis">…</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}