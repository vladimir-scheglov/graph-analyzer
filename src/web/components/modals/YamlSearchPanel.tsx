import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { MIcon } from "../common/MIcon";
import type { LineMap } from "../../lib/yaml/line-map";
import {
    searchYaml,
    SearchOptions,
    SearchMatch,
    SearchResult,
    SearchSectionGroup,
} from "../../lib/yaml/yaml-search";

const DEBOUNCE_MS = 250;
const MAX_MATCHES = 500;

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

export const YamlSearchPanel = forwardRef<YamlSearchPanelHandle, YamlSearchPanelProps>(
    function YamlSearchPanel(props, ref) {
        const {
            content, lineMap, query, options,
            onQueryChange, onOptionsChange,
            onResultChange, onActiveMatchChange,
            onEscape, onJump,
        } = props;

        const inputRef = useRef<HTMLTextAreaElement>(null);
        const [result, setResult] = useState<SearchResult | null>(null);
        const [activeMatch, setActiveMatch] = useState<SearchMatch | null>(null);
        const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

        // Если activeMatch «испарился» из результата — очищаем
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

        // Авто-раскрытие всех групп при новом результате
        useEffect(() => {
            if (!result) {
                setExpanded(new Set());
                return;
            }
            setExpanded(new Set(result.groups.map(g => g.sectionKey)));
        }, [result]);

        const flatMatches = useMemo(() => {
            if (!result) return [];
            const out: SearchMatch[] = [];
            for (const g of result.groups) for (const m of g.matches) out.push(m);
            return out;
        }, [result]);

        const selectMatch = useCallback(
            (m: SearchMatch) => {
                setActiveMatch(m);
                onActiveMatchChange(m);
                onJump(m.line);
                // Возвращаем фокус в поле — иначе следующий Ctrl+Enter
                // попадёт на кнопку списка и не сработает.
                inputRef.current?.focus();
            },
            [onActiveMatchChange, onJump],
        );

        const stepMatch = useCallback(
            (delta: 1 | -1) => {
                if (flatMatches.length === 0) return;
                let idx = -1;
                if (activeMatch) {
                    idx = flatMatches.findIndex(
                        m =>
                            m.line === activeMatch.line &&
                            m.column === activeMatch.column &&
                            m.length === activeMatch.length,
                    );
                }
                if (idx < 0) idx = delta > 0 ? -1 : 0;
                const next = (idx + delta + flatMatches.length) % flatMatches.length;
                selectMatch(flatMatches[next]);
            },
            [flatMatches, activeMatch, selectMatch],
        );

        const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Ctrl/Cmd+Enter — следующий матч (как в VSCode)
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                stepMatch(e.shiftKey ? -1 : 1);
                return;
            }

            // Enter без модификатора — новая строка (естественно для textarea)
            // Ctrl/Cmd+G — «найти следующее» тоже работает
            if (e.key === "Enter") {
                // не preventDefault — textarea добавит \n
                // но нужно вручную вызвать onQueryChange, чтобы state обновился
                // (React textarea onChange сработает сам, Enter внутри textarea не меняет значение по умолчанию)
                return;
            }

            if (e.key === "Escape") {
                e.preventDefault();
                if (query) onQueryChange("");
                else onEscape();
                return;
            }

            // Навигация стрелками оставляем — но только если нет модификаторов
            if (e.key === "ArrowDown" && flatMatches.length > 0) {
                // если в textarea много строк, стрелка должна двигать курсор, а не матчи.
                // Поэтому навигацию оставляем только когда query — однострочный:
                if (!query.includes("\n")) {
                    e.preventDefault();
                    stepMatch(1);
                }
            } else if (e.key === "ArrowUp" && flatMatches.length > 0) {
                if (!query.includes("\n")) {
                    e.preventDefault();
                    stepMatch(-1);
                }
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

        useEffect(() => {
            const el = inputRef.current;
            if (!el) return;
            // сброс — чтобы scrollHeight уменьшился при удалении строк
            el.style.height = "auto";
            // ограничиваем сверху ~6 строками (13px * 1.4 * 6 ≈ 110px + padding)
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
        }, [query]);

        return (
            <div className="yaml-search-panel">
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

                {result?.error && (
                    <div className="yaml-search-error">
                        <MIcon name="warning" size="sm" />
                        <span>{result.error}</span>
                    </div>
                )}

                {!result?.error && result?.truncated && (
                    <div className="yaml-search-limit-banner">
                        Показаны первые {MAX_MATCHES} из {result.totalMatches}. Уточните запрос.
                    </div>
                )}

                {!result?.error && result && result.groups.length > 0 && (
                    <div className="yaml-search-groups">
                        {result.groups.map(g => (
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

                {!query && (
                    <div className="yaml-search-hint">
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
    },
);

interface SearchGroupProps {
    group: SearchSectionGroup;
    activeMatch: SearchMatch | null;
    expanded: boolean;
    onToggle: () => void;
    onSelect: (m: SearchMatch) => void;
}

function SearchGroup({ group, activeMatch, expanded, onToggle, onSelect }: SearchGroupProps) {
    return (
        <div className={"yaml-search-group" + (expanded ? " open" : "")}>
            <button type="button" className="yaml-search-group-head" onClick={onToggle}>
                <span className="yaml-search-group-chevron">{expanded ? "▾" : "▸"}</span>
                <span className="yaml-search-group-title">{group.sectionLabel}</span>
                <span className="yaml-search-group-count">{group.matches.length}</span>
            </button>
            {expanded && (
                <div className="yaml-search-group-body">
                    {group.matches.map((m, i) => {
                        const isActive =
                            activeMatch !== null &&
                            activeMatch.line === m.line &&
                            activeMatch.column === m.column &&
                            activeMatch.length === m.length;
                        return (
                            <button
                                key={`${m.line}:${m.column}:${i}`}
                                type="button"
                                className={"yaml-search-item" + (isActive ? " active" : "")}
                                onClick={() => onSelect(m)}
                                title={`${m.line}:${m.column}`}
                            >
                                <span className="yaml-search-item-line">:{m.line}</span>
                                <span className="yaml-search-item-context">
                                    {m.truncatedBefore && <span className="yaml-search-item-ellipsis">…</span>}
                                    <span className="yaml-search-item-plain">{m.before}</span>
                                    <span className="yaml-search-item-match" title={
                                        `${m.line}:${m.column}` +
                                        (m.matchLineCount > 1
                                            ? ` — ${m.matchLineCount} стр.`
                                            : "")
                                    }>
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